/**
 * Shapes — versioned edge/payload contracts (01 §1, §3).
 *
 * A shape is the unit of compatibility. Two nodes connect if the upstream port's
 * shape is assignable to the downstream port's. Shapes are also connection kinds
 * and sampling-config kinds (F17), which is what makes the system modality-agnostic:
 * nothing anywhere switches on "is this an LLM".
 * @public
 */
export type ShapeId = string;
/** @experimental */
export interface ShapeDef {
    id: ShapeId;
    /** Shapes this one may be assigned to. A stream is assignable to its settled form. */
    assignableTo?: ShapeId[];
    /** True if a downstream node may begin consuming before the value settles (F22). */
    streaming?: boolean;
}
/** @experimental */
export declare function defineShape(def: ShapeDef): ShapeId;
/** @experimental */
export declare function getShape(id: ShapeId): ShapeDef | undefined;
/** @experimental */
export declare function isStreaming(id: ShapeId): boolean;
/** The permissive sink: anything serializable may flow into a json port. @internal */
export declare const JSON_SHAPE = "core:shape/json@1";
/** Assignability: identical, into json, or declared assignable (transitively). @internal */
export declare function assignable(from: ShapeId, to: ShapeId, seen?: Set<string>): boolean;
/** Reset — test isolation only. @internal */
export declare function _clearShapes(): void;
/** @public */
export declare const S: {
    readonly text: string;
    readonly textStream: string;
    readonly sessionScope: string;
    /**
     * Transcript rows — what `session-history@1` publishes on `main` and
     * `messages` and what `process-messages@1` / `prose-transcript@1` read
     * (declared so since 2026-09-17, U5d review W9; the port had said
     * `context-candidates@1` since the SDK was vendored while the value was
     * always rows, and `validate()` never ran over the catalog to say so).
     *
     * **Not assignable to `context-candidates@1`** (U5d review R-a, the same
     * day; W9 had declared it one way). A transcript wired into a candidates
     * port is a wiring the host silently drops: `concat-candidates` keys a
     * row that is not a candidate as `undefined:<id>`, the ranker's `select`
     * excludes it as `excluded_unknown_source`, and `assemble` handed rows
     * as candidates halts on "no ranking decisions". The transcript's place
     * in the window rides the **`band`** port — one intent element, which a
     * spec concatenates in with the lore so the ranker reserves the
     * conversation's slice — and the rows themselves go to
     * `process-messages`. `validate()` says so (a warning naming the fix)
     * rather than refusing, so a document built from the older corpus still
     * compiles. The reverse was never declared either: a ranked candidates
     * list is not a transcript, and a port that reads rows is handed rows.
     */
    readonly messages: string;
    readonly candidates: string;
    readonly renderedBlocks: string;
    readonly assembled: string;
    /**
     * What Assemble publishes after the allocation/formatting split (16 §7): ordered
     * **blocks** with role, source, token count and a `why` trail — not prose. The
     * Provider's `wire` slot turns it into whatever its connection actually wants.
     *
     * Assignable to `assembled-context@1` so existing specs keep connecting while core
     * migrates; the reverse is not assignable, because a rendered string has already
     * thrown away everything the panel and the budget need.
     */
    readonly allocated: string;
    /**
     * The object a context template renders against: characters, personas,
     * scenario, the prompt texts, the resolved names.
     *
     * Its own shape rather than `json@1` so that a plugin supplying an alternative
     * context builder has something to publish, and so a spec that wires the wrong
     * node into Assemble's context port fails at publish rather than rendering a
     * template full of blanks — which reads as a broken template, and sends the
     * user to the wrong screen.
     */
    /**
     * The chat's cast and prompt config, as rows — before any decision about who
     * is shown or named. The input to the context builder, kept distinct from the
     * built context so the two can be replaced independently.
     */
    readonly sessionCast: string;
    /**
     * The MCP connection kind (14 §1). A connection whose shape is `mcp` is a
     * Model Context Protocol server core talks to — foreign code SP speaks
     * JSON-RPC with, never code SP loads. The shape doubles as the connection
     * kind (F17), so only MCP connections are offerable on an MCP provider's
     * connection slot.
     */
    readonly mcp: string;
    readonly templateContext: string;
    readonly vector: string;
    readonly budget: string;
    readonly rowIds: string;
    /**
     * The output of an async block or a map (01 §1, 13 §1). An ordered list in
     * **declaration order**, one entry per branch — never a merged object, because
     * merging needs a field-collision policy and every such policy is wrong for
     * somebody. `async` and `map` produce the same shape, so one equivalence
     * harness covers both (F26).
     */
    readonly branchResults: string;
    /**
     * What a **gate-eligible** Consumer publishes (13 §7j-b). Discriminated, because
     * a write may in principle land as a proposal rather than a row — and a
     * proposal id in a shared id space is indistinguishable from a real row id
     * right up until the foreign key dangles.
     *
     * **Assignable to `row-ids@1`** since the 2026-09-15 rulings (09-B B4, R-17).
     * It was deliberately not, and the reason was the `async` review position:
     * a row proposed under it might never exist. That position is gone
     * (`review.ts` — on or off, nothing between): `on` parks the run until the
     * decision and a rejection halts it, so by the time any downstream node
     * runs, the ids a committed result carries ARE row ids. That is what makes
     * a create → update pair on one row inside one run legal, and it is how a
     * pipeline owns its reply: a placeholder outlet straight after the inlet,
     * and an `update-message` at the end that fills it.
     */
    readonly writeResult: string;
    /**
     * A request to summarize something into a lore entry.
     *
     * Its own shape rather than `json@1` because it is what the summarize
     * pipelines take as *input*, and 11 §2 matches an event's payload against a
     * pipeline's Input contract by shape. A request typed as bare json would make
     * every pipeline compatible with every event.
     */
    readonly summarizeRequest: string;
    /**
     * The ordered batch drafts phase 1 produces, before synthesis merges them.
     *
     * Ordered, and the order is load-bearing: the drafts are chronological
     * slices of a conversation and synthesis reads them as a sequence. A shape
     * that permitted reordering would turn a narrative into a pile of events.
     */
    readonly drafts: string;
    /** Scenes with their messages, as the graph builder walks them. */
    readonly graphScenes: string;
    /**
     * A proposed set of graph nodes and relationships, before a person approves it.
     *
     * Distinct from anything holding row ids, for the reason `write-result@1`
     * exists: a proposal is not yet a row, and a downstream node that treated it
     * as one would wire a foreign key to something a reviewer may still reject.
     */
    readonly graphProposal: string;
    /**
     * Who speaks next, and how that was decided (19 §5).
     *
     * Its own shape rather than `row-ids@1` because it is the swap-list
     * membership test: a task whose `main` publishes this shape *is* a
     * next-speaker strategy, and the dropdown is a SELECT over such rows — an
     * extension's strategy appears beside core's by existing, the same way a
     * chat mode does. The bundle carries `{speaker, characterId, strategy, via}`
     * — the speaker as a participant reference beside the bare id (R-18 (3)) —
     * and each rides its own port for wiring.
     */
    readonly speakerSelection: string;
    /**
     * A participant reference (R-15, R-18 (3)): `character:<id>`,
     * `envoy:<slug>`, `user:<id>`, or a role — see `participants.ts`.
     *
     * The inlet's `speaker` port and a turn strategy's carry this, so one
     * port answers "who is speaking" for a library character and a genre's
     * envoy alike. Not assignable to `row-ids@1` on purpose: a reference is a
     * name, and a node that wants the bare character id keeps reading
     * `characterId` until every reader speaks references.
     */
    readonly participantRef: string;
    /**
     * An ordered list of participant references, no duplicates (lair pass R3,
     * 2026-09-28): the inlet's `recipients` — the cast members a press
     * collected (`CollectedRecipients`). Its own id rather than `json@1` so a
     * port that wants people is not handed any list. Consumed by
     * `core:query/resolve-state-changes@1`'s `owners` (R10): the Whisper's
     * one change, made on each recipient.
     */
    readonly participantRefs: string;
    /**
     * One **session change** (R-15, built 2026-09-16): the payload every
     * built-in write's event carries — `{ event, sessionId, messageId, at,
     * … }` plus what was lost or replaced (`lost` on a delete, `previous` on
     * an edit or a swipe). The next reply's inlet publishes the changes since
     * the last one as a list on its `sessionChanges` port, so a pipeline knows the
     * history it sees has moved. See `SessionChangePayload` in events.ts.
     *
     * Its own id rather than `json@1`, for the reason `summarize-request@1`
     * gives: `pipeline_event_registry.payload_shape` names it, and an event
     * whose payload was bare json would match every inlet.
     */
    readonly sessionChange: string;
    /**
     * A **form addressed** to a participant the AI portrays (R-15 *Forms*;
     * 30 §U5d): the payload of `core:event/form-addressed@1` — `{ sessionId,
     * messageId, blockId, action, addressee }` (`FormAddressedPayload`,
     * events.ts) — and what `core:inlet/form-addressed@1` publishes, port by
     * port, with the block itself beside them. Its own id for the reason
     * `session-change@1` has: the registry's `payload_shape` names it.
     */
    readonly formAddressed: string;
    /**
     * A **cast change** (PLAN-turn-order §4.1): the payload of
     * `core:event/cast-changed@1` — `{ event, sessionId, at, cause, ref,
     * change, value }` (`CastChangePayload`, events.ts). A seated
     * participant was switched on or off, or its `position` or portrayal moved;
     * a seat added or removed is `member-added` / `member-removed`, not
     * this. Its own id for the reason `session-change@1` has.
     */
    readonly castChange: string;
    /**
     * **Annex changed** (PLAN-turn-order §4.14, R30): the payload of
     * `core:event/annex-changed@1` — `{ event, sessionId, at, cause, owner }`
     * (`AnnexChangePayload`, events.ts). Names whose entry moved, never the
     * value.
     */
    readonly annexChange: string;
    /** What a listener receives for an event a pipeline recorded: the envelope, the author's payload inside. */
    readonly recordedEvent: string;
    /**
     * **Turn order changed** (§4.1): the payload of
     * `core:event/turn-order-changed@1` — `{ event, sessionId, at, cause,
     * runId, turnOrder }` (`TurnOrderChangedPayload`, events.ts), the
     * document as `core:outlet/set-turn-order@1` wrote it. Core-internal:
     * the auto-advance listener and the `sessions:turnOrder` push read it;
     * a genre may not bind a spec to it.
     */
    readonly turnOrderChanged: string;
    /**
     * The session's **turn order** as state (§4.2): `TurnOrderV1` —
     * `{ v, order, candidates, basedOnAt, computedAt, runId, event,
     * strategy }`, stored at `sessions.metadata.turnOrder` and written by
     * `core:outlet/set-turn-order@1` alone. Not the entries alone and not
     * the candidates alone: the whole answer, with what it answered.
     */
    readonly turnOrder: string;
    /**
     * **Turn candidates** (§4.2): `TurnCandidateV1[]` — the participants the
     * pool admitted this run, in pool order. What `core:task/turn-pool@1`
     * publishes, an orderer rewrites, and a strategy reads. Open objects:
     * an orderer or a plugin may add keys and core passes them through.
     */
    readonly turnCandidates: string;
    /**
     * **Turn entries** (§4.2): `TurnEntryV1[]` — prepared turns, each
     * `{ ref, channel?, subject?, via }`. What a strategy publishes on
     * `main` and `order`; the shape-based swap list keys a strategy on it,
     * as it keyed one on `speaker-selection@1` before (that shape stays
     * until the strategies are re-ported).
     */
    readonly turnEntries: string;
    /**
     * **Sprite choices** (DESIGN-sprites §5.2): what a line's speaker can show
     * — `{ characterId, set, defaultSet, labels, last, decidedBy, text }`.
     * `set` is the sprite set in force for the line (a session override, the
     * cast member's amendment, or the card's default — `decidedBy` says
     * which); `labels` are that set's sprite labels with an image; `last` is
     * the speaker's previous shown sprite, for stickiness. What
     * `core:query/sprites-for@1` publishes and every sprite picker reads.
     */
    readonly spriteChoices: string;
    /**
     * **A sprite pick**: `{ set, label, score?, runnerUp?, held? } | null` — the
     * sprite a picker chose for a line, or null for none. What every sprite
     * picker publishes on `main`, so the shape-based swap list keys a picker on
     * it exactly as it keys a turn strategy on `turn-entries@1`.
     */
    readonly spritePick: string;
    /**
     * The **settings document** (§4.12): `SessionSettingsV1` — every
     * setting a person can see in session settings, resolved once per run
     * with the cascade applied (session > genre > core), and handed to the
     * inlet as `session`. A spec reads `$.input.session.fields.tone` and
     * never learns which table it came from.
     */
    readonly sessionSettings: string;
    /**
     * A reference to stored media of any kind — the general port type.
     *
     * `image@1` and `audio@1` stay, and are assignable **to** this, so every
     * spec wired to them keeps connecting while the general ports arrive. The
     * reverse is not assignable: a port that accepts any media cannot be handed
     * to one that has declared it only understands images. Same rule, and the
     * same reason, as `allocated-context` → `assembled-context`.
     */
    readonly media: string;
    /** An ordered list of media references — what a multimodal request carries
     *  as its attachments. */
    readonly mediaList: string;
    /**
     * A reply's **folded sections** (B4; D5, 2026-09-27): `FoldedSectionV1[]`
     * (widgets.ts) — each `{ kind, label, content }` or `{ kind, label, items }`,
     * shown collapsed beside the body and never read into the prompt. What the
     * message outlets' `sections` in-port takes.
     */
    readonly foldedSections: string;
    readonly audio: string;
    readonly image: string;
    readonly json: string;
    /**
     * What a ranker judged (PLAN-sdk-1.0 §3.9, R64): one `RankingDecisionV1`
     * per candidate. A node whose out-port carries this shape is RECORDED by
     * the host — core's rankers and a plugin's alike — into the ranking store.
     * Reviewed with L1 (PLAN-sdk-1.0 §4 ✓); it carries `S`'s own tag.
     */
    readonly decisions: string;
    /**
     * A model reply as an ordered list of typed parts (text, reasoning, media,
     * tool calls) rather than a string — see `OutputPart` in media.ts for why
     * that is now the honest shape of a completion.
     *
     * Assignable **to** `text-stream@1`, so a provider may start emitting parts
     * without breaking a single spec wired to its text output: the degrade
     * concatenates the prose and drops the rest. Not assignable in reverse,
     * because by then the ordering and the media are gone — the same
     * richer-to-poorer rule the allocated/assembled pair established.
     */
    readonly partStream: string;
    readonly textGen: string;
    /**
     * Vector embedding — the connection kind, and deliberately **not** a
     * sampling vocabulary (yet).
     *
     * It is absent from `SAMPLING_SCHEMAS` on purpose, and the reason is
     * structural rather than unfinished work: every parameter an embedding call
     * would take — input truncation, pooling, normalisation, output dimensions,
     * the asymmetric query/passage prefixes E5/BGE/GTE want — changes what a
     * *stored* vector means, and nothing records which setting produced the
     * vectors already in the table. A text sampler affects one reply; an
     * embedding parameter silently re-defines a whole persistent index against
     * rows that will never be recomputed. That is the same re-index story the
     * prefixes are held back for, so none of them ship until it is decided.
     *
     * What is left after removing those is either not per-invocation at all
     * (model identity, transport, residency TTL — those belong to the
     * connection) or has no consumer (nothing chunks a batch). An empty
     * vocabulary is worse than no vocabulary here: `isKnownSamplingShape` in
     * core admits any shape this record has a key for, so registering `{}`
     * would let the write path accept a config that exists, looks saved, and
     * can never send anything — the exact state that guard was written to
     * refuse.
     */
    readonly embeddings: string;
    /**
     * Named-entity recognition — the connection kind for a mention detector.
     *
     * Declared ahead of its adapter so the model side has a stable noun to
     * name; core's extractor is dictionary-based and model-free today
     * (`core:extract/entities-heuristic@1`), and takes no parameters at all
     * beyond the text and the gazetteer.
     *
     * Like `embeddings`, and for the same two reasons, it has no entry in
     * `SAMPLING_SCHEMAS`: its one real knob (how much of a passage the
     * extractor is handed) is part of the annotation freshness triple, and an
     * empty vocabulary would defeat core's do-nothing-config guard.
     */
    readonly ner: string;
    readonly tts: string;
    readonly imageGen: string;
};
//# sourceMappingURL=shapes.d.ts.map