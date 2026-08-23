# 15 — Quality Bar

**Status:** New 2026-08-17. Semi-normative: the design in 00–14 is sound, and this is what turns
sound into *loved*. Each item is written as something checkable rather than an aspiration, because
"make it delightful" is not a unit anyone can accept.

The assessment graded the design A/A– almost everywhere and **C+ on a plugin author's first hour**.
That gap is the whole subject. Ordered by leverage.

---

## Part 1 — Confidence on the first line written

### 1.1 Sixty seconds to a visible result — the single highest-leverage item

`pack --init` scaffolds a manifest *from existing code*, which is backwards for someone who has no
code yet. What is missing is the other direction.

**Target: `npm create serene-plugin` → answer two questions → a plugin that is built, installed,
enabled, and visibly rendering in a live chat. Under sixty seconds, no manual wiring.**

Not a template to fill in — a thing that already works, which the author then edits. Every
ecosystem that grew a healthy plugin community had this (`cargo new`, `yo code`,
`create-react-app`); every one that didn't, didn't.

The scaffold ships: one pipeline hook, one chat-message component, a passing conformance run, a
golden test, and a `.github/workflows` that runs both. The author's first experience of the
conformance kit should be a green check they didn't have to opt into.

**Acceptance:** a timed run on a clean machine, in CI, that fails if it exceeds the budget.

### 1.2 The dev loop cannot be "restart SP"

Boot-time sync currently means Vite restarts the server on save (02 §5). Fine for core work;
grinding for a plugin author, and **the most common cause of ecosystem attrition** — the author
who stops after an evening usually stopped because iteration was slow, not because the API was
hard.

Hot-unload of plugin modules is impossible (09 §7), so the honest version is a **dev-mode plugin
host with a generational registry**: on change, build the plugin, bump a generation, resolve new
work against the new generation, let in-flight work finish against the old. SP itself never
restarts.

**Acceptance:** edit a hook, save, trigger the pipeline, see the new behaviour — without SP
restarting and without losing the open chat.

### 1.3 Errors that teach, as a maintained table

Every prohibition in this design is justified, and a modder can hit three in one afternoon. The
difference between "guided" and "fenced in" is entirely whether the *why* arrives at the moment of
collision.

Every rejection carries four things: **what you did · why it isn't allowed · what to do instead ·
a link.**

| Collision | Message |
|---|---|
| `fetch()` in a Query | "Queries can't reach the network. Use a Provider so the call is recorded verbatim and `replay()` never re-infers it." |
| Branch in a builder chain | "Pipelines are linear. For parallel work use `.asyncBlock()`; for per-item work use `.map()`; to stop early return `halt()`." |
| Provider call in an event hook | "Event hooks can't call Providers — they have no receipt or budget. Trigger a pipeline instead and you get both." |
| Dynamic registration | "Registrations are read statically and never executed. Declare each one at top level with literal arguments, or it won't reach your manifest." |
| Node type swap, shape mismatch | "`chariot.foo@1` outputs `text-gen`; this port needs `embeddings`. Compatible types: …" |

**Acceptance:** every Fixed Ledger law that can be violated in authoring has a test asserting its
error text names the alternative. A prohibition without a stated alternative is a bug.

### 1.4 Make the right thing autocomplete

Everything here is typed; use it for guidance, not only rejection.

- `$ref('` completes to the actual node keys already in the chain, with their ports. Template
  literal types make this real, and it is the single most delighting thing a typed builder can do.
- Slot names, facet tags, event ids and surface points all complete from `/contracts`.
- A deprecated pin strikes through *as you type it*, not at build.

### 1.5 One command to see a receipt

`harness.run()` exists as an API. It should also be a command that prints a readable receipt —
nodes, timings, the assembled prompt, the model call, the result.

**This is the moment the whole design clicks for an author.** Not the constitution, not the
manifest: seeing their own pipeline's receipt in a terminal, and realising they can diff two of
them.

### 1.6 Documentation generated from descriptors

Every core type's reference page is generated from its descriptor — params, shapes, slots, facets,
version. Hand-written docs drift, and drifted docs are how plugin ecosystems rot from the inside.
Published core goldens alongside them, so "what correct looks like" is readable rather than
described.

---

## Part 2 — Reward on the user's side

### 2.1 Show the assembled prompt before it is sent

**The highest-value user feature the architecture makes nearly free, and the one this audience
wants most.** Because templates are declared and Assemble is a Task, SP can dry-run a pipeline to
the point of the Provider call and show exactly what will be sent — with each contribution
attributed to the node that produced it.

SillyTavern users argue about prompt construction constantly, with far worse tools. "Here is the
literal text, here is which part came from where, edit it and see the difference" is a category
difference and it needs no new mechanism.

### 2.2 "Why did it say that?" is one click from the message

The run inspector is excellent and currently something you go *to*. It should be something the
artifact points *at*: a why affordance on any message opening the run at the node that produced
it. One click from output to explanation.

Receipts stop being infrastructure the moment a normal user uses one without knowing what it is.

### 2.3 Regenerate with a change — replay's dividend

Runs are seeded and replayable, so this is nearly free and nothing else in the field can do it:

- **Regenerate with a different seed** — genuinely different, not "hope it varies."
- **Regenerate with one setting changed** — "same message, but warmer" — by replaying the receipt
  with a single override swapped.
- **Diff two responses** — `diffReceipts` already exists as a dev tool. Pointed at two runs of the
  same message it answers "what actually changed," which no competitor can offer at all.

### 2.4 Presets as social objects

Users share configs. Make a preset an exportable, importable, named thing with a card — not a file
path. Import validates against node types (12 §7), so a shared preset either fits or says why not.
This is the mechanism by which a community teaches itself, and it costs almost nothing on top of
what 12 already describes.

### 2.5 Every task explains itself in one line

Each active task in the default view carries a generated one-liner: what it does, what it touches,
roughly what it costs. Generated from consumer targets and declared schemas, so it cannot lie or
drift (11 §4 already requires this for consent — reuse it).

---

## Part 3 — Confidence at the first install

### 3.1 Say what the plugin *cannot* do

Install screens everywhere list what a plugin may do, which reads as a threat inventory. SP is the
only system in this field that can truthfully print the other half:

> **DiceTray cannot:** read your API keys · delete your chats or characters · modify any account ·
> gate access to Serene Pub · act on your data without your consent

Nothing else in the space can print that paragraph and mean it. It should be the most prominent
thing on the screen, because it converts the architecture's actual guarantees into something a
non-technical person can feel.

### 3.2 Install disabled by default, review, then enable

The disabled state already exists (09 §7). Make it the default path: install → inspect what it
declares, what it will download, its size → enable when ready. Nothing runs before a deliberate
act.

### 3.3 A first-run behaviour summary

After a plugin's first activity, one notification:

> **DiceTray, first 24 hours:** ran 12 times · wrote 12 messages · called no models · downloaded
> nothing · 0 permissions used that you hadn't granted

This turns an abstract grant into observed behaviour, and it is only possible because of receipts.
It is also the single best answer to "should I trust this" — evidence rather than assurance.

### 3.4 Provenance, not just integrity

Tag and checksum prove the artifact wasn't tampered with; they don't prove *who* built it. Signed
releases or build attestations would let SP display "built from this commit, by this workflow" —
a real trust upgrade, cheap to adopt now, and much harder to retrofit onto an existing repository
model.

**Recommendation:** reserve the manifest fields in 0.6 even if verification lands in 0.7.

### 3.5 State the trust posture plainly

This audience cares, and plain statements travel: SP phones home for nothing; plugins are
admin-installed trusted code with real runtime permission enforcement but no sandbox; here is
exactly what an admin can and cannot do to your account. The docs already have this honesty
(01 §16, 03 §7) — surface it in the product, not only in the repository.

---

## Part 4 — What "S tier" means as acceptance criteria

Add to 07 §5's gate, since none of these are subjective:

| | Target |
|---|---|
| Scaffold to visible render | **< 60s**, timed in CI |
| Edit-to-effect in dev | **no SP restart, open chat survives** |
| Prohibition errors | **100%** name an alternative |
| Assembled-prompt preview | available on every Provider node |
| "Why did it say that" | **≤ 2 clicks** from any message |
| Install screen | prints capabilities **and** the cannot-do list |
| First-run summary | delivered within 24h of first activity |
| Core reference docs | **generated**, zero hand-written type pages |

---

## The two sentences worth building around

**For authors:** *your first plugin runs in a minute, every rule that stops you tells you what to
do instead, and you can see exactly what your pipeline did in your own terminal.*

**For users:** *see the prompt before it sends, ask any message why it said that, and know exactly
what a plugin cannot do before you install it.*

Both are downstream of decisions already made in 00–14. None of this requires new architecture —
it requires treating the first hour, on both sides, as a deliverable rather than a consequence.
