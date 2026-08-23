# 11 — Events, Notifications and User Consent

**Status:** New, consolidated 2026-08-17. Implements Constitution §8, F8–F9, F30. Events replace
the per-Consumer declared effects of the v2 constitution.

## 1. Why one registry instead of per-spec effects

Declared effects and an events registry overlapped almost entirely — a detached effect *is*
"emit something another pipeline runs on." Keeping both would mean two answers to "what causes
what," two cycle-guard implementations, and two places to look when a pipeline fires
unexpectedly.

So: **a Consumer declares the events it emits; subscriptions live in a registry.** One queryable
table answers what triggers what, and the admin's attach-a-pipeline feature is the same mechanism
rather than a parallel one.

## 2. The registry — core-owned, closed

```
event_registry       event_id, version, payload_shape, affects_user, description_i18n
                     -- core-defined only; no owner_plugin_id, because plugins cannot define events

event_subscriptions  id, event_id, event_version, spec_id, preset_id?,
                     depth_bound?, enabled, created_by
```

**Only core emits, and only core defines** (01 §8). A node has no emit API and a plugin cannot
register an event. Everything else subscribes.

- **Versioned payloads from a closed set:** `core:event/message-created@1`, `chat-created@1`,
  `character-updated@1`, and so on — the list of SP core actions worth observing.
- **The cause of each event is declared on the core consumer target**, not per spec: `commitMessage`
  is known to cause `message-created`. So the "what causes what" graph composes subscriptions with
  a fixed mapping, and no spec declares anything.
- **Compatibility is shape matching** between the event payload and a pipeline's Input contract.
  This is the **fourth** use of the same mechanism, after the Provider swap list, feature
  attachments and renderer `match`. Present it as one mechanism in the docs.
- **Admins attach pipelines to events**, optionally with a config preset (12 §3), wherever the
  shapes are compatible.
- Extensions request to listen via an **event hook** (01 §9c); the request is a declared permission,
  granted per §5.
- **`affects_user`** is declared on the event, which is what makes consent enforceable without
  hand-classifying every subscription.

### 2b. What this rules out, and what to re-approach later

- **A plugin cannot announce its own occurrences.** "My extension's data changed, run something"
  has no path — a plugin handles it inline or not at all.
- **Cross-plugin coupling is only the tight form**: pinning another plugin's public pipeline hook
  (01 §9b). The loose, announce-and-listen form does not exist.

Both are deliberate for now. The closed set is what keeps the consent screen legible and the
causation graph small, and reopening it later is additive — a plugin-owned event namespace can be
added without changing anything that exists. **Tracked in 13-OPEN-RULINGS as a deliberate
deferral, not an omission**, so nobody rebuilds it as a "helpful extra."

## 2a. Two kinds of subscriber

An event may be consumed by a **pipeline** or by an extension's **event hook** (01 §9c). They are
not interchangeable, and the choice has consequences an author should be told about up front.

| | Pipeline subscriber | Event hook |
|---|---|---|
| Receipt, replay, lens view | **yes** | invocation record only |
| Review gate | **yes** | no |
| Budget | run budget | own declared budget |
| May call Providers | **yes** | **no** (F32) |
| Consent and permissions | identical | identical |
| Good for | anything touching user data or calling a model | maintaining the extension's own data |

**The Provider ban is what keeps the choice honest.** Without it, an author avoids the pipeline
model — which is more ceremony — and quietly opts out of receipts, budgets and the gate for work
that deserves all three. With it, the light path stays light and anything expensive or auditable
is structurally pushed back into a pipeline.

**Open:** may an event hook subscribe to *another plugin's* event, or only core's? Plugin-emitted
events are legal for pipeline subscriptions (§2). Extending that to hooks is cross-plugin coupling
and would want the same permission gate as pinning a public pipeline hook. 13-OPEN-RULINGS.

## 3. Dispatch semantics

- **Success-anchored:** emitted by core after the write lands, in memory. No `on: failure` event; no
  outbox exists.
- **Causation is indirect.** A pipeline never triggers another pipeline; it writes, core observes,
  core emits. Which means a pipeline cannot skip an event it "should" have raised, or raise one
  nothing actually caused.
- **Fire-and-forget, no ordering guarantees between subscribers.** Declaration order is dispatch
  order, never completion order.
- Child inputs are **snapshots** taken at emit time; a child never reads live parent state, so
  replaying a child never needs the parent alive.
- **Halt is normal.** Most subscribers to a hot event will halt immediately — "this chat type
  isn't applicable" — and that is success, not failure (01 §5).
- **Cycle guards, both layers.** Statically, a recursive CTE over `event_subscriptions` **composed
  with the consumer-target → event mapping** rejects cycles without a declared depth bound:
  subscription → spec → its write targets → the events those cause → subscriptions again.
  Dynamically, per-root caps on depth and descendant count. **Non-negotiable** — a pipeline that
  writes a message while subscribed to `message-created` is the obvious footgun, and it is
  statically detectable.
- Lineage in receipts: `trigger_source`, `trigger_ref`, `parent_run_id`, `root_run_id`, `depth`.

**Ruled 2026-08-18: joined effects are removed; async blocks absorb the use case** (13 §1). Awaited
work belongs on the spine inside a block, not as a child pipeline, so there is exactly one causation
mechanism rather than two. A block outputs `core:shape/branch-results@1` — an ordered list in
declaration order, one entry per branch, never a merged object (01 §1).

The capability that goes with it is *reuse of awaited work across specs*, which the **compile-time
include** now covers instead (16 §3a) — at publish, with no runtime machinery.

## 4. User consent — default-deny

**Events are never automatically enabled for a user.** Nothing that affects a user's account or
assets runs until that user has said yes.

**What a user sees and controls:**

- What permissions each installed plugin holds **regarding their account and assets**, and a
  toggle for each.
- What side effects — hooks and pipelines subscribed to enabled events — would touch their
  account, and a toggle for each.
- A plain-language **summary per pipeline of what it touches in their account**, generated from
  the spec's consumer targets and declared schemas rather than authored prose, so it cannot lie.
- Which extensions are installed and which system-level permissions the admin has enabled.

**How they decide:**

- Acknowledge and enable **one at a time**, or
- toggle **accept-all**, in which case future admin-enabled changes turn on automatically for
  them.
- **When something new is enabled system-wide, the user gets a notification to review it** (§6).

**What they cannot refuse:** permissions that **read** data they own without writing to it. This
is deliberate. It gives admins a path to audit user activity — a safety extension detecting misuse
can notify admins, who then act **manually** — while giving them no path to automate edits to
accounts without permission. The asymmetry is the whole design: read to observe, never write to
coerce.

**Users must be told that admins can read and audit their activity.** Disclosed at account
creation and standing in the permissions screen. A capability this broad is only defensible if
it's stated.

**Recommendation on accept-all:** re-confirm when a **new kind** of permission appears, not merely
a new instance of an already-accepted kind. Standing consent to "anything future" is not really
consent if the category changes underneath it.

## 4a. Admin self-consent, and hiding consent entirely

Two rules that keep the model from taxing the majority of installs, which are one person on their
own machine.

**An admin who installs a plugin, enables a permission, or attaches an event pipeline
automatically consents to it at the user level — for their own account.** They already made the
decision once; making them make it again in a different role is ceremony, not safety.

- **Only the acting admin.** Admin A's action never implies consent for admin B, or for any other
  user. Everyone else stays default-deny.
- **The consent record is still written**, as `granted`. Hiding a decision is not the same as not
  recording one: the audit trail stays intact, and revoking later is an ordinary revoke rather
  than a special case.
- Read-only permissions are unaffected — they were never refusable.

**When user accounts are disabled, the user-level opt-in UI is hidden entirely.** A single-account
instance has no second party to protect, so the consent screen would be a person granting
themselves permission.

- **The data model is unchanged.** Consents are still recorded against the sole account, so
  enabling accounts later needs no migration: existing consents belong to that user, and every new
  account starts default-deny as normal.
- The consent screen becomes a **review surface** rather than a gate — still reachable, showing
  what plugins may do and what pipelines touch, still revocable, just not something to click
  through on the way in.
- The moment a second account exists, the gate behaves exactly as §4 describes.

**Consequence for admins in multi-user instances, which must be messaged or it reads as a bug:**
an admin installs a plugin, grants permissions, and *nothing happens for other users* until each
consents.

## 5. Permissions this implies

| Layer | Granted by | Refusable by user? |
|---|---|---|
| Plugin permission, instance-wide | admin | n/a |
| Plugin permission touching a user's data — **write** | admin, then user | **yes** |
| Plugin permission touching a user's data — **read** | admin | **no** (§4) |
| Event subscription affecting a user | admin, then user | **yes** |
| Event subscription, read-only/admin-facing | admin | **no** |

Denials are `err(denied)` — routable and recorded, never silent (09 §5).

## 6. Notifications

Three audiences: **the user**, **a specific admin**, **all admins**.

- **Durable records**, distinct from the activity panel's live state (review queue, provider
  queue). Both render in the same panel; only one is persisted.
- **Link targets.** A notification points at a front-end location, which needs a stable addressing
  scheme — a route plus an entity id — versioned like any other contract.
- **Plugins opt in** to emitting notifications and to logging; both are permissions.
- **Rate limiting and dedupe are required, not nice-to-have.** A chatty or looping plugin is
  otherwise a spam vector against every admin on the instance.
- **Core-emitted sources:** review awaiting · run failed · plugin disabled by a throwing hook ·
  update available · **new permission or event requiring the user's review** (§4) · global plugin
  switch toggled · persistent Provider connection failure after retries.
