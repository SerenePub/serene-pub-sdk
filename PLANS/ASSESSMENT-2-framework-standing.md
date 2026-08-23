# Assessment 2 — Where the Framework Stands

**2026-08-17, after the context-infill and hook arcs.** Non-normative. The first assessment graded
SP against the field; this one asks whether the framework itself is *finished enough to build*.

---

## 1. What the design has become

Nineteen documents, 37 Fixed Ledger laws, one competitive read, one quality bar, worked code. The
shape stabilized somewhere around the hook taxonomy and hasn't moved since — the last several
rounds have been *fitting new requirements into existing mechanisms* rather than adding mechanisms.
That is the signal worth trusting.

Evidence, from this session alone:

| Requirement | Absorbed by |
|---|---|
| MCP support | connection kind + Provider types. No new concepts |
| NER retrieval | Provider + Query, exactly as the boundary rule predicted |
| Modular ranking | it's a Task, so the existing node-swap override |
| Provider-agnostic TTS / ComfyUI | `params` declared per type, not per kind |
| Budget-aware queries | config resolves before execution, so a reference isn't an edge |
| Timeouts | a new law, but no new machinery — the executor already wrapped every call |

Six substantial requirements, one new law, zero new architecture. A design that absorbs load without
growing is done in the way that matters.

## 2. Where it got *simpler* under pressure

More telling than the absorptions. Each of these removed something:

- **Branching dropped** → the spine is literally linear, the DAG check became a linearity check,
  conditionals collapsed to halt, and 05's "honest for the common case" became honest.
- **Effects → events** → one causation table instead of two mechanisms.
- **Events narrowed to core-emitted** → the consent screen stays legible, the causation graph stays
  small, and a pipeline can no longer lie about what happened.
- **Exports → public pipeline hooks** → peer composition became visible in the graph instead of
  brokered-but-invisible, and a whole permission category and its "never inside a run" ban both
  disappeared.
- **Purity gate → call-site ownership** → three hard questions (frozen purity columns,
  swap-eligibility, joined-effect contamination) stopped needing answers.
- **Map instead of a loop node** → no accumulator, therefore no State kind by the back door.
- **`params` per type** → nothing in the system switches on modality.

Seven simplifications, each arriving as a *response to a new requirement*. That is unusual and it
is the strongest single indicator here.

## 3. Honest count of what's still unresolved

| Blocking a unit | |
|---|---|
| Joined effects under event unification | 13 §1 — though 16 §3a's fragments took the reuse case away from it, which may resolve it by removal |
| Receipt retention | 13 §2 — halt-heavy subscribers make it a per-message multiplier |
| Review gate keyed on effects | 13 §7a — needed before MCP tools can be gated at all |
| Fragments / compile-time include | 13 §7f — context infill needs it or every pipeline copies seven nodes |
| Secret-typed settings | 13 §6 |
| Budget owner for UI-initiated runs | 13 §7 |

Six. All scoped, all with a recommendation on file, none architectural — each is a decision about
where a line sits, not a question about whether the structure holds.

**Two known limitations stated rather than hidden**, which is the right posture: in-process
timeouts abandon rather than kill (13 §7h), and plugin-defined events are deferred on purpose
(13 §7g).

## 4. The thing that hasn't been stress-tested

Everything above is design review. **Nothing here has been built**, and the design's central claim —
that receipts make the whole system explicable — has never survived contact with a real chat log,
a real 40-message history, or a real user asking why their bot forgot something.

The migration of core's four features onto pipelines is not just the dogfood proof. It is the first
moment any of this is falsifiable. Two specific things to watch:

- **Receipt volume in practice.** Every estimate here is theoretical. One week of real chat traffic
  answers 13 §2 better than any amount of reasoning.
- **Whether the linear spine actually holds.** Branching was dropped on the argument that chat
  pipelines are linear. Porting extraction, summarization and vectorization is the test. If one of
  them wants to branch, better to learn it in U25 than after 0.6 freezes.

## 5. Standing, honestly

| | |
|---|---|
| **Architecture** | Settled. Absorbing requirements without growing, and simplifying under pressure |
| **Documentation** | Complete and cross-referenced; the risk now is drift, not gaps |
| **Open questions** | Six, all bounded, none structural |
| **Build readiness** | The unit list is derived from the folded docs and the per-unit review question (08 §1a) is the right filter |
| **Unvalidated** | Everything. No code exists |

**The framework is ready to build against.** What it hasn't earned yet is confidence that the ideas
survive implementation — and no further design round produces that. The next genuinely informative
thing is U1 through U3 and the chat-turn port, at which point half the remaining open questions
answer themselves with data instead of argument.

## 6. One risk worth naming

The design is now good enough to keep refining indefinitely, and every round has produced real
improvement — including this one. That is exactly the condition under which a project spends
another two months in documents.

**The 0.6 scope is a program, not a release** (assessment 1 §6), the quality-bar units are the
difference between C+ and A on a developer's first hour, and the migration is the only thing that
can falsify any of it. If something should be cut to start building, it is not the quality bar and
it is not the migration — it is the breadth of what ships in one release.
