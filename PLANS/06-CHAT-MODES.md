# 06 — Chat Modes and Features

**Status:** Consolidated 2026-08-17. Depends on F7 (one primary write) — without it, "what does
this pipeline do" has no single answer and mode detection is guesswork. With it, a **lifecycle
signature** exists: entry input contract + primary consumer target.

## 1. Lifecycle signatures

- `core:input/user-message@1 → core:consumer/commit-message@1` **is** the chat turn.
- Emitted events and interior nodes don't change the signature: a summarization event or an extra
  Provider call decorates the lifecycle without becoming a new one.
- Input type and primary consumer target are columns (02 §2), so signature queries are SELECTs.

## 2. Eligibility vs. declaration

- **Structure = eligibility.** The signature determines what a spec *could* be.
- **Declaration = opt-in.** A spec that wants to appear says so:

  ```jsonc
  "mode": { "name": { "en": "Dungeon Crawl" }, "icon": "…",
            "family": "core:input/user-message@1" }
  ```

  Display strings are locale maps (04 §7).
- **Validation rejects false claims:** a declared family the structure doesn't match is a
  validation error. A spec can't lie about being a chat mode and can't accidentally become one.
- The picker is a SELECT over declared modes joined on signature columns.

## 3. Families drive UI affordances

The chat UI binds to the **input contract, not the spec**:

- `user-message` family: the composer knows how to build that document; every mode in the family
  is drivable by the same send box. Streaming rides the edge over the socket; the committed
  message arrives via normal data subscription.
- `trigger` family: no composer; an enable toggle; the character speaks when the event fires.
- Sessions store their selected spec; **mid-session switching is legal by construction** — modes
  are engines over rows, and the new mode reads the same history through its own queries.
- **Consequence banked:** dungeon crawler mode stops being an app mode and becomes a spec somebody
  ships.
- **Every registered chat type is also a configurable task** in the default view (05 §0a). The
  picker chooses which mode a session runs; the task list configures it — two views over the same
  rows. A plugin shipping a chat mode gains a settings surface for free, which is the practical
  payoff of modes being specs.
- Lifecycle-family input contracts are UI-load-bearing → among the hottest contracts in the
  system; keep smallest, freeze most carefully in the 0.6 preview.

## 4. Features

Distinguish by **who adds them**:

- **Spec-shipped features** (the author included the summarization event): toggles — an override
  path on the subscription's `enabled` flag, inside the L2 write model.
- **Third-party features:** the wrong answer is a plugin editing someone else's spec. The right
  answer is **attachment in the overrides layer** — a user attaches an extra event subscription,
  per their own settings, valid wherever the emitted payload satisfies the feature pipeline's
  declared Input. The same shape-matching that builds the Provider swap list builds the
  "available features" list (03 §6).
- Safety is the same as review toggles: an attached pipeline can't corrupt the parent — own
  budget, own write policy; worst case it wastes tokens.
- **User consent still applies.** A feature that affects the user's account is default-deny and
  must be acknowledged (11-EVENTS §4). Enabling something for yourself is consent; an admin
  enabling it for everyone is not.
- Renders as facets: mode at the top of the session, feature chips under it.
- Backfill: `graphed`-style sentinel — enabling summarization three days into a chat means
  scanning for underived work, same recovery mechanism as everything else (F23).

## 5. Scope

Mode selection and feature toggles are naturally per-**session**, and temperature-per-chat
requests follow the moment users see the facet. Resolved by the configuration model's scope chain
(12-CONFIGURATION §2): **chat → user → preset → instance → author**, per slot. A user changing a
setting for a chat they own affects only that chat; chats they don't own are untouched.
