# 17 — Pipeline Examples

**Status:** New 2026-08-17, revised same day. Worked code for 04, 12 and 16. Illustrative — where
this and the normative docs disagree, they win, but a disagreement is a bug.

---

## 1. Five sibling slots

| Slot | What it holds | Lives where | Who may write (12 §4) |
|---|---|---|---|
| `connection` | which service | `connections` table, referenced | admin |
| `sampling` | **generation parameters sent to the adapter** | **`sampling_configs` table, referenced** | admin, user, chat |
| `prompts` | authored text fields | override rows | user, chat |
| `template` | Jinja2 that assembles the payload | override rows | admin; user opt-in |
| `params` | **node behaviour knobs — never sent to the service** | override rows | user, chat |

**The line between `sampling` and `params` is where the value goes.** Sampling is handed to the
connection adapter untouched: temperature, top_p, repetition penalty, mirostat, or for image-gen,
steps and cfg. Params are how the *node* behaves: retrieval `topK`, a context budget, lore weights,
chunk size, lookback. Core never interprets sampling; it forwards it.

Both `connection` and `sampling` are **references to named, reusable entities** rather than values
embedded in a node — which is what lets a user keep "my creative preset" and "my precise preset"
and swap between them across every pipeline that uses text generation.

### 1a. Sampling configs are typed by shape, and adapters take what they understand

```
sampling_configs   id, name, shape, values jsonb, owner_scope, owner_id
                   -- shape: core:shape/text-gen@1 | image-gen@1 | tts@1 …
```

A shape declares the **common** fields every adapter of that shape accepts. Adapters may declare
**extras** they additionally understand — KoboldCPP has mirostat, OpenAI-compatible endpoints do
not.

**⚠ The receipt must record which fields the adapter applied and which it ignored.** "Why does
temperature do nothing on this backend" is otherwise unanswerable, and silently-dropped samplers
are one of the most common confusions in this whole product category.

### 1b. Two ways the config layer overrides sampling

```
# swap the whole reference for one node, at chat scope
node_overrides( spec_version, 'generate', 'sampling', '$ref',        'chat', 991 ) = 'cfg_precise'

# or override one field on top of whatever config is referenced, at user scope
node_overrides( spec_version, 'generate', 'sampling', 'temperature', 'user', 42  ) = 0.7
```

Same five-layer chain as everything else (12 §2), resolved per path — so a user can nudge
temperature on one node without forking the preset, and an admin changing the pipeline's default
sampling config still reaches them for every field they haven't touched.

---

## 2. One complete chain, nothing hidden

The kind is named at every step, so the effect taxonomy reads straight off the page: what reads,
what computes, what calls out, what writes.

```ts
import { spec, $ref, slot } from '@serene-pub/sdk/spec'
import {
  chatHistory, personaCard, lorebookTriggers, vectorSearch,   // Query
  embedText, generateText,                                    // Provider
  mergeCandidates, assemble,                                  // Task
  commitMessage, emitSocket,                                  // Consumer
} from '@serene-pub/sdk/contracts'

export default spec('core:spec/chat-turn@1', {
  version: '1.0.0',
  mode:    { name: { en: 'Chat' }, family: 'core:input/user-message@1' },
})

  .on('core:event/user-message@1')               // seeds a subscription; admins manage the rest

  .input('input', UserMessageInput)              // only method available here; unavailable after

  // ── budget: reads the generate node's resolved config, emits it forward ────
  .task('budget', contextBudget.v1({
    provider: slot.downstreamProvider(),         // resolves at publish → 'generate' (16 §5b-i)
    params:   slot.params(),                     // { reserveForReply: 512, safetyMargin: 0.05 }
  }))                                            // → { maxContext, reserved, available, tokenizer }
  // equivalent, and what the rows actually store:
  //   provider: slot.providerRef('generate')
  // metadata only — context length, tokenizer id. Material is never readable (01 §10).

  // ── gather: four independent chains, started together, awaited as one ──────
  .async('gather', { mode: 'parallel' }, b => b

    .chain('history', c => c
      .query('history', chatHistory.v1({
        scope:    $ref('input', 'chatScope'),
        budget:   $ref('budget', 'available'),   // stop once minimums met and allowance spent
        template: slot.template(),               // source template: one message → text
        params:   slot.params(),                 // limit 40, includeSystem,
      })))                                       //   weight 0.40, minInclude 6, priority 'normal'

    .chain('persona', c => c
      .query('persona', personaCard.v1({
        characterId: $ref('input', 'characterId'),
      })))

    .chain('keyword', c => c
      .query('triggers', lorebookTriggers.v1({
        text:     $ref('input', 'text'),
        scope:    $ref('input', 'chatScope'),
        template: slot.template(),               // source template: one entry → text (16 §3b)
        params:   slot.params(),                 // scanDepth, caseSensitive,
      })))                                       //   weight 0.35, minInclude 3, priority 'high'

    .chain('semantic', c => c
      .provider('embed', embedText.v1({          // crossing the boundary → Provider (16 §1)
        connection: slot.connection(),           // the singleton embeddings connection
        text:       $ref('input', 'text'),
        params:     slot.params(),               // { enabled: 'auto' }
      }))                                        // → ok({ vector: null }) if unavailable
      .query('vsearch', vectorSearch.v1({        // reading SP's own vectors → Query
        vector: $ref('embed', 'vector'),         // null vector → ok({ hits: [] })
        scope:  $ref('input', 'chatScope'),
        params: slot.params(),                   // { topK: 12, minScore: 0.35 }
      })))
  )

  // ── combine, then rank: both Tasks, so both are swappable (16 §5c) ─────────
  .task('merge', mergeCandidates.v1({
    sources: [$ref('gather.semantic.vsearch', 'hits'),
              $ref('gather.keyword.triggers', 'hits'),
              $ref('gather.history.history',  'messages')],
    params:  slot.params(),                      // { strategy: 'auto', dedup: true }
  }))

  .task('rank', rankHybrid.v1({                  // swap for rankByRecency / a plugin's ranker
    candidates: $ref('merge', 'candidates'),     //   — same kind, same shape, tuning survives
    params:     slot.params(),                   // { recencyBias: 0.3, similarityFloor: 0.2 }
  }))

  // ── assemble: reads declared weights off its inputs, resolves them (16 §5a) ─
  .task('prompt', assemble.v2({
    candidates: $ref('rank', 'candidates'),      // each block carries weight/minInclude/priority
    budget:     $ref('budget', 'available'),     // the authoritative fill happens here
    persona:    $ref('gather.persona.persona', 'card'),
    template:   slot.template(),                 // assembly template: blocks → final context
    prompts:    slot.prompts(),                  // system, postHistory
    params:     slot.params(),                   // budget 4096, truncation, weightNormalization
  }))                                            //   — global only; no per-source map to keep in sync

  // ── generate: sampling goes straight to the adapter ────────────────────────
  .provider('generate', generateText.v1({
    context:    $ref('prompt', 'context'),
    connection: slot.connection(),
    sampling:   slot.sampling(),                 // → adapter, uninterpreted by core
    params:     slot.params(),                   // { stopSequences, seedMode }
  }))

  // ── emit while streaming; commit once at settle (01 §11) ───────────────────
  .consume('stream', emitSocket.v1({             // emit-class: doesn't count against F7
    handle: 'chat:reply',
    from:   $ref('generate', 'text'),            // stream-shaped edge
  }))

  .consume('save', commitMessage.v1({            // the one write-class consume
    chatId: $ref('input', 'chatId'),
    text:   $ref('generate', 'text'),
  }))                                            // core emits message-created because a message
                                                 // was created — the node declares nothing (01 §8)

  .consume('done', emitSocket.v1({
    handle:    'chat:complete',
    messageId: $ref('save', 'messageId'),        // Consumer row ids flow downstream (F7)
  }))
```

Eleven nodes. Linear spine, one async block, one write, two emits, one event. Everything a user can
tune is a slot; everything core had to decide is a declared field.

### 2a. What the method names buy beyond readability

Five laws become **compile errors instead of validator findings** (04 §4a):

- `.input()` is the only method offered at the start, and is not offered again → *exactly one
  Input, positionally first* (01 §2).
- A second write-class `.consume()` is a type error → **F7**. Emit-class ones stay unrestricted.
- `.query()` rejects a Provider constructor → putting `embedText` in a Query slot cannot compile,
  which is exactly the Provider/Query line 16 §1 draws.
- `.task()` handlers are typed with no service parameter → **F11**, purity with nothing to reach
  for.
- There is no branch method to call → **F25**.

**Keys stay the first argument and node types stay imported pinned constructors.** The method names
the *kind*; the constructor names the *type and version*. Drop either and F21 or static pin-checking
goes with it.

### 2b. Where a Task fits between fetching and rendering

The chain above lets each Query render its own items. When something has to happen to the raw data
first, a Task sits in between and the render moves onto it:

```ts
    .chain('lore', c => c
      .query('fetch', lorebookTriggers.v1({
        text:   $ref('input', 'text'),
        params: slot.params(),        // no template → returns raw entries
      }))
      .task('curate', dedupeAndRank.v1({
        entries: $ref('fetch', 'entries'),
        against: $ref('gather.history.history', 'messages'),
        params:  slot.params(),       // similarityCutoff, maxPerCategory
      }))
      .task('render', renderEntries.v1({
        entries:  $ref('curate', 'entries'),
        template: slot.template(),    // the source template now lives here
        params:   slot.params(),      // weight 0.35, minInclude 3 — declared where it is decided
      })))
```

`query (raw) → task (manipulate) → task (render)`. Use it for anything the template language
shouldn't be doing: deduping against another source, reordering by a computed score, merging near-
duplicates, rewriting entries.

**A raw-only Query cannot connect to Assemble** — Assemble's input port requires rendered blocks, so
the missing render step is a port mismatch caught at publish, not a runtime surprise (16 §3b).

**The same thing with the fragment** (16 §3a) — identical rows after publish-time expansion, and the
node keys overrides target are unchanged because the include namespaces them the same way:

```ts
  .include('gather', contextInfill.v2({
    query: $ref('input', 'text'),
    scope: $ref('input', 'chatScope'),
  }))
  .task('prompt', assemble.v2({ candidates: $ref('gather', 'candidates'), … }))
```

---

## 3. The descriptor behind one of those nodes

```ts
export const generateText = describeProvider({
  id:    'core:provider/text-gen@1',
  shape: 'core:shape/text-gen@1',              // == the connection kind AND the sampling kind
  i18n:  { name: { en: 'Generate reply' } },

  slots: {
    connection: { kind: 'connection', shape: 'core:shape/text-gen@1' },
    sampling:   { kind: 'sampling',   shape: 'core:shape/text-gen@1' },

    prompts: { kind: 'prompts', facet: 'prompts', fields: {
      system:      { type: 'text', i18n: { en: 'System prompt' } },
      postHistory: { type: 'text', i18n: { en: 'Post-history instructions' } },
    }},

    template: { kind: 'template', engine: 'jinja2', facet: 'templates' },

    params: { kind: 'parameters', facet: 'weights', schema: {
      stopSequences: { type: 'string[]', default: [] },
      seedMode:      { type: 'enum', of: ['run', 'fixed'], default: 'run' },
    }},
  },

  ports: {
    in:  { context: 'core:shape/assembled-context@1' },
    out: { text:    'core:shape/text-stream@1' },
  },

  effects: 'none',              // the review gate keys on this, not on kind (01 §7)
  usage:   'response.usage',
})
```

**Nothing here is core-only.** A ComfyUI plugin writes the same call with
`shape: 'core:shape/image-gen@1'`, a `sampling` slot whose config carries steps and cfg, and
`prompts` fields named positive and negative. Its fields land in the weights lens beside core's
with no UI work — which is the dogfood invariant as code rather than as a promise.

---

## 4. A receipt from one run

What the inspector renders, and what `replay()` reads.

```
run 9f3c…  spec core:spec/chat-turn@1 v1.0.0   seed 0x4a91…
trigger    input · user 42 · chat 991          720 ms total

 ▸ gather                         parallel                        212 ms
   ├ history.history      Query    → 40 messages                    18 ms
   ├ persona.persona      Query    → "Mira" (card v7)                4 ms
   ├ keyword.triggers     Query    → 6 hits                         31 ms
   └ semantic.embed       Provider → vector: null                    0 ms
     └ reason: no active embeddings connection
     semantic.vsearch     Query    → 0 hits                          1 ms

 ▸ merge                 Task     → 34 candidates                    6 ms
     strategy: auto → keyword  (no vector hits available)
     dropped 12 duplicates

 ▸ budget                Task     → 3,584 available                   1 ms
     provider ref → generate (resolved at publish)
     ollama-local ctx 4096 · reserved 512 for reply · tokenizer llama-bpe

 ▸ rank                  Task     → 34 ranked                        3 ms
     rankHybrid · recencyBias 0.3

 ▸ prompt                Task     → 3,918 tokens  (est 3,902, +0.4%)  11 ms
     budget 4096 · declared weights read from 3 sources
       history  w 0.40  min 6  → 1,540  (6/6 minimum met)
       lore     w 0.35  min 3  → 1,370  (3/3 minimum met)
       persona  w 0.25  min 0  → 1,008
     truncated: 8 oldest messages (oldest-first)

 ▸ generate              Provider → 214 tokens                     487 ms
     connection  ollama-local          sampling  cfg_creative
     applied     temperature 0.92 · top_p 0.95 · repeat_penalty 1.1
     ignored     mirostat_tau  (not supported by this adapter)
     request/response recorded verbatim

 ▸ stream                Consumer  emit  chat:reply                  —
 ▸ save                  Consumer  write msg 88213                   9 ms
     review: off
     core emitted message-created@1 → 1 subscriber (chariot.tts:speak-reply)
 ▸ done                  Consumer  emit  chat:complete                —
```

Three support questions answered without asking anyone anything: *why isn't RAG working*
(no embeddings connection, one line), *why was that dropped* (truncation and allocation, one node),
*why does mirostat do nothing* (the adapter ignored it, stated).

---

## 5. Same structure, different modality

```ts
export default spec('chariot.tts:speak-reply@1', { version: '1.0.0' })
  .on('core:event/message-created@1')
  .input   ('input', MessageCreatedInput)     // shape-matches the event payload
  .query   ('text',  messageText.v1({ messageId: $ref('input', 'messageId') }))
  .provider('audio', speak.v1({
    text:       $ref('text', 'plain'),
    connection: slot.connection(),            // core:shape/tts@1
    sampling:   slot.sampling(),              // core:shape/tts@1 → voice, speed, pitch
    template:   slot.template(),              // strips markdown, expands abbreviations
    params:     slot.params(),                // { skipCodeBlocks: true }
  }))
  .consume ('attach', attachAudio.v1({
    messageId: $ref('input', 'messageId'),
    audio:     $ref('audio', 'audio'),
  }))
```

Four lines, four kinds, and it is legible at a glance what each one costs you: a read, an external
call, a write.

Different shapes on the edges. Identical authoring structure, identical slots, identical override
model. **Adding a modality touches the executor, the config model, the lens view, the task view,
export, permissions and consent exactly zero times** — and if it ever does, the abstraction has
leaked and that is the thing to fix.

---

## 6. What reaches the user

```
Chat                          [Standard ▾]
  System prompt               …
  Post-history instructions   …
  Sampling                    Creative ▾        ← a sampling_config reference
    Temperature               0.92              ← overridden for this chat only
  Context budget              4096
  Lore weight                 0.35  (min 3)

Speak replies                 [on]
  Sampling                    Aria / 1.0× ▾
```

Connections are absent — users cannot write that slot. Sampling appears as a named preset with any
per-node overrides shown inline, so "which preset am I on, and what have I changed on top of it" is
answerable at a glance. **No line of this UI is modality-specific**; it is generated from declared
slot schemas.

**When a spec has more than one Provider**, sampling appears once per Provider, labelled by the
node's declared name — never flattened into a single setting that quietly applies to one of them:

```
Chat                          [Standard ▾]
  Summarize
    Sampling                  Precise ▾
  Reply
    Sampling                  Creative ▾
      Temperature             0.92
```
