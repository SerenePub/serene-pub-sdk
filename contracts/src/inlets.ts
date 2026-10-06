/**
 * Core's **inlet** node definitions — where a run enters.
 *
 * One file per node kind, with the helpers only that kind uses; `index.ts`
 * re-exports them all.
 */

import { S } from '@serene-pub/sdk'
import { describeInletDefinition, pin } from '@serene-pub/sdk'

// ── Inputs ──────────────────────────────────────────────────────────────────

/**
 * What a turn is *about*: this chat, and whose turn it is.
 *
 * `sessionScope` bundles both and is what the queries take, but neither was
 * readable on its own — so a node that needs only the speaker had to accept the
 * whole scope and reach into it, and `currentCharacterId` ended up travelling
 * on `HostScope` instead of through the graph because there was no port to
 * carry it. Hidden state in a run that otherwise records everything.
 *
 * The two scalars are ports now. `sessionScope` stays: a query wanting both should
 * take one thing, not reassemble it.
 * @public
 */
export const userMessage = pin(
	describeInletDefinition({
		id: 'core:inlet/user-message@1',
		// Display only, both keys: stripped from the content hash, refreshed on
		// existing rows by the boot sync — so copyediting this is never a bump.
		i18n: {
			name: { en: 'Chat' },
			description: {
				en: 'The standard roleplay chat — bring characters and personas in any mix, attach a lorebook if you like, and type to talk.',
			},
		},
		/**
		 * The standard chat's shape (19 §1) — today's behaviour, *stated*.
		 * This block is what makes the input type a **chat mode** (the F29
		 * floor: always present, special in availability and nothing else).
		 * Both participant systems are optional and unbounded above, lorebooks
		 * attach when wanted, the composer is a text box, and the seed line
		 * carries the speaking character's name. Duties and triggers are not
		 * here on purpose: the shape is owner-only, and the narrate button is
		 * the narrate spec's contribution, not this type's knowledge (19 §3).
		 */
		sessionShape: {
			characters: { min: 0 },
			personas: { min: 0 },
			lorebook: 'optional',
			composer: 'text',
			voice: 'character',
			// Stated rather than assumed (20): a new chat seeds the cast's
			// greetings on `main`. It is the default for any input node, so a
			// custom mode reuses it for free; core declares it so the reusable
			// case reads at a glance.
			greeting: { enabled: true, channel: 'main' },
		},
		slots: {
			/**
			 * The input hook (18 §4a): user chains over the triggering text,
			 * phase `after` on what this node publishes — which is what
			 * lorebook scanning and the prompt's seed see. The stored user
			 * message was written before the turn began and stays untouched
			 * by construction; the slot description says so because that is
			 * the question the control raises.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1'],
				port: 'text',
				phase: 'after',
				description:
					'Scripts over the message that triggered this turn — expand shorthand, resolve dice notation — as retrieval and the prompt will see it. The stored message is not changed.',
			},
		},
		ports: {
			out: {
				main: S.json,
				text: S.text,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * Whose turn it is, as a **participant reference** (R-18 (3)):
				 * `character:<id>` for a library character, `envoy:<slug>` for
				 * a speaker the genre brings with it. Null on a narrator turn —
				 * nobody in particular is speaking. One port answers "who is
				 * speaking" for both kinds, so nothing downstream branches on
				 * which it received; who *portrays* them this turn is the
				 * host's resolver's answer, pinned on the receipt (R-21 (4)).
				 */
				speaker: S.participantRef,
				/**
				 * @deprecated The same speaker as a bare character id (one
				 * release, from 2026-09-16). Null on a narrator turn, and null
				 * for an envoy — which is why it cannot stay the port: a
				 * reader keyed on it sees a genre's speaker as nobody. Read
				 * `speaker`; the turn strategies publish both meanwhile.
				 */
				characterId: S.rowIds,
				/**
				 * Who **pressed** — the reference of whoever sent the message
				 * or fired the action this run answers (G9, 2026-09-17).
				 *
				 * `user:<id>` for a person with no presence in the session,
				 * `character:<id>` when they hold a persona here — their
				 * persona is a character (0132), so a line written as them is
				 * written as that character — and, when an answer pipeline
				 * pressed on a participant's behalf, that participant's own
				 * reference, so the AI-portrayed presser is named rather than
				 * the machinery that spoke for them.
				 *
				 * ⚠ **Not `speaker`.** `speaker` is whose turn it is — who the
				 * reply comes out as — and on nearly every turn the two differ:
				 * a person types and a character answers. This is the other
				 * end of that sentence, and the port a spec wires into
				 * `core:outlet/create-message@1`'s `speaker` when it wants to
				 * write a line AS the person who pressed: the host already had
				 * the path (`speaker: 'user:<id>'` writes a user-role row) and
				 * no inlet carried the reference to put in it, so a plugin that
				 * wanted the player's own line had to ride it on the model's
				 * reply as a block (Battleship, plan §12).
				 *
				 * Never null on a turn or a fire: a run has an owner, and the
				 * owner is a person. Absent only where the inlet is resolved
				 * without one, which no shipped path does.
				 */
				presser: S.participantRef,
				/**
				 * The cast members a press collected (lair pass R3,
				 * 2026-09-28): `character:<id>` references, for an action
				 * declaring `collects.recipients` — picked in the collect
				 * modal, and validated by the host (seated and enabled, no
				 * duplicates, within the declared `min` and `max`) before
				 * the run starts. Absent on a turn and on every press of an
				 * action that collects none.
				 */
				recipients: S.participantRefs,
				/**
				 * Values for the mode's declared `fields` (19 §1), filtered to
				 * the declared schema keys — the supply side of the round
				 * trip: declaration → chat settings → chat row → this port →
				 * every downstream node.
				 */
				fields: S.json,
				/**
				 * Text an in-progress reply has already produced, when this turn
				 * is an **extend** (ruling 2026-09-08, D-2; the verb was `continue`
				 * until 2026-09-28).
				 *
				 * Empty on every other turn, which is nearly all of them. It is
				 * here rather than on an `extend`-only input type because an
				 * extend is the standard chat's own verb — it answers the same
				 * event, in the same session, from the same cast — and a second
				 * input type would restate this one's `sessionShape`, which is
				 * the thing `side-character-turn@1`'s note says a shape-bearing
				 * mode must never have copied.
				 *
				 * ⚠ It is not the triggering text and it is not a message. `text`
				 * stays what it would be on an ordinary turn, the row carrying
				 * this is excluded from every message read while it generates,
				 * and only `core:task/process-messages@1` consumes it — as the
				 * body of the seed line the model continues from.
				 */
				continuationPrefill: S.text,
				/**
				 * The reply row this turn re-drives, when it is a regenerate, a
				 * swipe or an extend of a message that already exists. Null on
				 * a fresh turn, which is nearly all of them.
				 *
				 * The pipeline owns its reply row (R-17): a fresh turn's row is
				 * created by the spec's own placeholder outlet, and a verb that
				 * re-drives an existing message hands that message to the same
				 * outlet through this port — so the outlet claims it as the
				 * run's live row instead of inserting a second one. It is data,
				 * recorded on the receipt, and never a scope read: "which row
				 * did this turn write" is answerable from the run afterwards.
				 */
				messageId: S.rowIds,
				/**
				 * What the built-ins did to this session since the last reply
				 * (R-15, 2026-09-16): a list of session changes — `[{ event:
				 * 'core:event/message-deleted@1', messageId, at, lost }, …]`,
				 * oldest first, capped at the newest fifty — so a pipeline
				 * knows the history it is about to read has moved: a line
				 * deleted with its content, a rewrite with the previous text,
				 * an alternative swiped in, a reply stopped short. Read once:
				 * the run that receives them consumes them — marked read
				 * after the run, and only when it produced a reply, so a run
				 * that fails leaves them for the next — and a preview sees
				 * them without consuming. Empty when nothing changed, which
				 * is nearly every turn. Past fifty, the newest fifty arrive
				 * and a last entry `{ event:
				 * 'core:event/session-changes-truncated@1', dropped }` says
				 * how many older ones did not.
				 *
				 * Was `changes` until 2026-09-16 (U5b review S4): that word is
				 * the state ledger's on `resolve-state-changes@1` and
				 * `set-state@1` — a list of value changes — and a session
				 * change is about a message, never a value (R1).
				 */
				sessionChanges: S.json,
				/**
				 * What an action's fire sent along (R-15 *Forms*; U5d,
				 * 2026-09-17): a form's answer — `{ choice }` for a choices
				 * block, the entered values for a form block — or a widget's
				 * `invoke(key, args)` arguments. Absent on a turn and on a
				 * bare press. A press on an **addressed** block arrives with
				 * `form` beside it (`core:task/read-answer@1` takes both and
				 * publishes the answer port by port). The host always
				 * supplied this under `payload`; declared 2026-09-17 so a
				 * spec can wire it.
				 */
				payload: S.json,
				/**
				 * The form a press answered, when it answered one — the block
				 * itself as stored, its id, the message and the addressee,
				 * read off the row by the host (never off the client):
				 * `{ blockId, messageId, kind, question, addressee, characterId,
				 * choice?, label? }`. Absent on every other fire.
				 */
				form: S.json,
				/**
				 * Which channel the message that triggered this turn is on
				 * (R-C, 2026-09-17) — the stored string, lane included:
				 * `main`, `manuscript`, `phone:3`.
				 *
				 * `main` when the trigger named none, which is every session
				 * whose genre declares no channel of its own. It is never a
				 * selector: `*` spans every channel for a *read* and is not
				 * somewhere a message can be, so it never appears here.
				 *
				 * ⚠ The run had no way to ask this before, and that is what
				 * kept a channel's declared `voice` half-wired: `voice: 'none'`
				 * could be read off the newest row, but `voice: 'narrator'`
				 * needs the channel the turn was triggered on even when that
				 * channel has no rows yet. It is a port rather than a scope
				 * read for the other half of the same reason — a genre that
				 * answers the manuscript differently from the conversation
				 * branches on it at a junction, and a junction can only read
				 * what a port carries.
				 */
				/**
				 * The session's **settings document** (PLAN-turn-order §4.12,
				 * R13): every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied, §4.13),
				 * scenario, lorebook, tags, channels, the cast with its
				 * envoys, the session-scope rebinds and param overrides per
				 * bound spec, the turn-order state, `metadata` (read-only)
				 * and the annex. `$.input.session.fields.tone` reads in any
				 * spec, and no node re-queries a table for a setting.
				 */
				session: S.sessionSettings,
				channel: S.text,
				/**
				 * **How this turn was reached** (lair pass R8, 2026-09-28) —
				 * the fired turn entry's `via`: `strategy`, `script` or
				 * `voice` for a prepared turn, `pick` for one a person chose,
				 * and **`narrate`** when the press was the `core#narrate` turn
				 * control (the genre's own voice asked to narrate what happens
				 * next). A verb re-driving a row carries the `via` of the run
				 * that created it, so a regenerated narration narrates again.
				 * Empty when nothing says (an action's fire). A genre routes
				 * on it at a junction — the Lair narrates on `narrate` ahead
				 * of every other branch.
				 */
				via: S.text,
			},
		},
	}),
)

/**
 * A built-in write's request (R-15, 2026-09-16) — what a person asked core to
 * do to a message or a session: delete, hide, edit, swipe, branch.
 *
 * Core implements every state-altering write and runs each as its own
 * one-node spec (`core:spec/builtin-delete` …) through the executor, so the
 * write is receipted, gate-eligible and always emits what changed. This is
 * that spec's inlet: the person's request, as the venue's handler shaped it
 * after the permission checks it alone can make. No lock — a built-in serves
 * every genre — and no shape: a request is not a session mode.
 * @internal
 */
export const builtInRequest = pin(
	describeInletDefinition({
		id: 'core:inlet/built-in-request@1',
		ports: {
			out: {
				main: S.json,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/** The message the write is about. Absent on a branch. */
				target: S.rowIds,
				/** An edit's new text; a swipe's alternative to record. */
				text: S.text,
				/** A hide's direction: hidden, or shown again. */
				hidden: S.json,
				/** A swipe's alternative to select, by index. */
				index: S.json,
				/** A branch's fork point — the last message the copy keeps. */
				fromMessage: S.rowIds,
				/**
				 * The session's **settings document** (PLAN-turn-order §4.12,
				 * R13): every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied, §4.13),
				 * scenario, lorebook, tags, channels, the cast with its
				 * envoys, the session-scope rebinds and param overrides per
				 * bound spec, the turn-order state, `metadata` (read-only)
				 * and the annex. `$.input.session.fields.tone` reads in any
				 * spec, and no node re-queries a table for a setting.
				 */
				session: S.sessionSettings,
				/** A branch's name. */
				title: S.text,
				/**
				 * A person's sprite for the line: `{ set, label }`, or null to
				 * clear it (DESIGN-sprites §6) — a `sprite-pick@1`, the shape a
				 * picker publishes, so `core:outlet/show-sprite@1` takes one
				 * shape from both. Read by `core:spec/show-sprite`.
				 */
				sprite: S.spritePick,
			},
		},
	}),
)

// `core:inlet/message-created@1` stood here — an inlet no spec used and no
// event emitted (plans/29 §4c 4.1). Culled 2026-09-16 (R-4): an existing
// message's id arrives on `core:inlet/user-message@1`'s `messageId` port.

/**
 * A session was just created — the create pipeline's trigger (24 §5, §12).
 *
 * The genre's one required pipeline answers this event and seeds the
 * session's initial data: greetings per the genre's shape, initial channels,
 * initial state. The payload is the create request itself — the genre, the
 * chosen preset, the participants and initial field values — because what a
 * create pipeline does is *finish* what the request began.
 *
 * Not `user-message`: reusing the turn input here welded creation to the
 * chat turn's shape and was wrong (24 §12). A create run has no triggering
 * text and no speaker; it has a request.
 * @public
 */
export const sessionCreated = pin(
	describeInletDefinition({
		id: 'core:inlet/session-created@1',
		i18n: {
			name: { en: 'Session created' },
			description: {
				en: 'Fires once, when a session of this genre is created — the pipeline that answers it seeds greetings, channels and initial state.',
			},
		},
		ports: {
			out: {
				main: S.json,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * The create request: genre id, preset id, participant ids,
				 * lorebook, initial field values — everything the person chose
				 * before the session existed.
				 */
				request: S.json,
				/**
				 * The session's **settings document** (PLAN-turn-order §4.12,
				 * R13): every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied, §4.13),
				 * scenario, lorebook, tags, channels, the cast with its
				 * envoys, the session-scope rebinds and param overrides per
				 * bound spec, the turn-order state, `metadata` (read-only)
				 * and the annex. `$.input.session.fields.tone` reads in any
				 * spec, and no node re-queries a table for a setting.
				 */
				session: S.sessionSettings,
				/** Values for the genre's declared fields, filtered to the schema. */
				fields: S.json,
			},
		},
	}),
)

/**
 * A session event happened (PLAN-turn-order §4.1/§4.4, R1): the inlet every
 * event-driven spec enters through, and the one core's turn-order spec
 * uses.
 *
 * Locked over **several** events at once — `.inlet(key, node, { genre,
 * events: [...] })` — because one spec answers nine of them identically:
 * a send, an edit, a delete, a hide, a member change, a cast change, a
 * settings save, a branch. A spec bound to N events has N binding rows and
 * one document.
 *
 * `cause` is why it fired (`EventCause`: user · run · edit · settings ·
 * system), and it is load-bearing beyond this node — the write this spec
 * ends in carries it into `turn-order-changed`, where the auto-advance
 * listener reads it to decide whether to fire the head turn (§4.6). A spec
 * that drops it makes every recompute look like a system event.
 * @experimental
 */
export const sessionEvent = pin(
	describeInletDefinition({
		id: 'core:inlet/session-event@1',
		i18n: {
			name: { en: 'Session event' },
			description: {
				en: 'Fires whenever something happens in a session — a message lands, the cast changes, a setting moves. The pipeline that answers it reads what happened and why.',
			},
		},
		/**
		 * The event payloads this inlet reads: a spec may lock it to several
		 * events only when every one carries one of these. A session change, a
		 * cast change (member-added/-removed included), an annex change, and
		 * the envelope every event a package declared arrives in — its own
		 * payload is the envelope's `payload`.
		 */
		payloads: [S.sessionChange, S.castChange, S.annexChange, S.recordedEvent],
		ports: {
			out: {
				/** The event id that fired — `core:event/message-completed@1`. */
				event: S.text,
				sessionId: S.rowIds,
				/** The event's own payload, as its registry entry's shape declares it. */
				payload: S.json,
				/** Why it fired (`EventCause`). Carried through to the write. */
				cause: S.json,
				/** When, as epoch milliseconds — what an order `basedOnAt` answers. */
				at: S.json,
				sessionScope: S.sessionScope,
				/**
				 * The session's **settings document** (§4.12, R13), resolved
				 * once per run by the host after the write that caused this
				 * event — so the cast below is the cast as it is now, and no
				 * node needs a cast read of its own.
				 */
				session: S.sessionSettings,
				/**
				 * The settings document's **cast**, on its own port (PLAN
				 * §8 (17)): what `core:query/session-cast@1` publishes,
				 * envoys included, projected from `session` by the host.
				 *
				 * A port rather than a path, because an edge is `{ node,
				 * port }` and nothing in the graph addresses a field inside
				 * a port's value. §4.5 wires the pool's `cast` from the
				 * document; this is that wire, with the shape the pool's
				 * in-port declares.
				 */
				cast: S.sessionCast,
			},
		},
	}),
)

/**
 * Who is about to speak, when the trigger picked somebody who is **not** in
 * the cast — the side-character narration turn (ruling 2026-09-07).
 *
 * ## participant ≠ character
 *
 * A side character is a **participant without a turn slot**. The trigger's
 * first step accepts either an existing character (`characterId`) or a name
 * somebody typed (`speakerName` alone), and both are full participants *for
 * that turn* — the prompt is written from their perspective and the seed line
 * carries their name. Neither joins the session cast, and nothing here writes
 * a `session_characters` row: this input publishes a fact about one turn, and
 * a fact is not a membership.
 *
 * Its own type rather than a flag on `user-message@1`, for the reason that type
 * already gives about the narrator: the type is the unit that declares a
 * configurable surface, and `user-message` is the standard chat's **mode** —
 * it carries the genre's `sessionShape`, which is exactly what a side-character
 * turn must not restate. This one declares no shape, so it is an action input
 * and never a session mode.
 *
 * ## The new-name hook (the fact, and only the fact)
 *
 * `sideCharacter` carries `known` — whether the chosen name matches anything in
 * the session's lorebook — and the scripts hook below declares it as an **extra**,
 * so a script attached there reads it through the one dispatch core scripts and
 * extension hooks already share. Core states the fact and offers the hook; what
 * a script *does* about an unknown name (suggest adding them, stay quiet, add a
 * note to the prompt) is the script's business, not this declaration's. There is
 * deliberately no second path: nothing here notifies, writes, or prompts.
 * @experimental
 */
export const sideCharacterTurn = pin(
	describeInletDefinition({
		id: 'core:inlet/side-character-turn@1',
		// Display only, both keys: stripped from the content hash, refreshed on
		// existing rows by the boot sync — so copyediting this is never a bump.
		i18n: {
			name: { en: 'Side character' },
			description: {
				en: 'A turn spoken by somebody who is not in the cast — pick a character, or type a name. They speak once; they do not join the rotation.',
			},
		},
		slots: {
			/**
			 * The input hook (18 §4a), on the same terms as `user-message@1`:
			 * user chains over the triggering text, phase `after` on what this
			 * node publishes, which is what retrieval and the prompt see.
			 *
			 * ⚠ `extras` is what makes this the **new-name hook**. The three
			 * names below are read-only context supplied by the host at the
			 * hook (18 §6a) and are part of the fixed choice set the script
			 * editor offers — so "this name is new" is a declared read rather
			 * than a name typed on faith. `speakerIsKnown` is `false` exactly
			 * when a free-form name matched nothing in the session's lorebook.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1'],
				port: 'text',
				phase: 'after',
				extras: ['speakerName', 'speakerCharacterId', 'speakerIsKnown', 'castNames'],
				description:
					'Scripts over the instructions this turn was triggered with, as retrieval and the prompt will see them. The speaker rides along read-only — including whether the lorebook already knows them, so a script can offer to add somebody new.',
			},
		},
		ports: {
			out: {
				main: S.json,
				text: S.text,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * Who is speaking, as a **participant reference** (R-18 (3)):
				 * `character:<id>` when the pick was a library character, null
				 * for a free-form name — a name is not a participant reference,
				 * and the fact below is where the name lives. On the same
				 * terms as `user-message@1`'s port of this name.
				 */
				speaker: S.participantRef,
				/**
				 * @deprecated The chosen character as a bare id, or null for a
				 * free-form name (one release, from 2026-09-16) — read
				 * `speaker`.
				 *
				 * ⚠ It is **not** a turn slot. It reaches character lore's
				 * visibility rule (an entry bound to this character becomes
				 * readable for this turn) and the prompt's perspective, and
				 * nothing else — round-robin selection reads the session's
				 * cast and its messages, neither of which this touches.
				 */
				characterId: S.rowIds,
				/**
				 * The side character as a whole fact: `{ name, characterId,
				 * known, character }`.
				 *
				 * A port rather than only an extra, because it is what the
				 * context builder is wired to and what the receipt records —
				 * "why did this turn sound like Vell" is answerable from the
				 * run afterwards rather than from the trigger that started it.
				 *
				 * Was `speaker` until 2026-09-16: that name is the participant
				 * reference now (R-18 (3), one word one meaning), and a fact
				 * carrying a free-form name is not a reference to anybody.
				 */
				sideCharacter: S.json,
				/**
				 * The session's **settings document** (PLAN-turn-order §4.12,
				 * R13): every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied, §4.13),
				 * scenario, lorebook, tags, channels, the cast with its
				 * envoys, the session-scope rebinds and param overrides per
				 * bound spec, the turn-order state, `metadata` (read-only)
				 * and the annex. `$.input.session.fields.tone` reads in any
				 * spec, and no node re-queries a table for a setting.
				 */
				session: S.sessionSettings,
				/** Values for the genre's declared fields, filtered to the schema. */
				fields: S.json,
				/**
				 * The row this turn re-drives, on the same terms as
				 * `user-message@1`'s port of the same name: a regenerate, swipe
				 * or extend of a side character's line routes back to the
				 * narrate-character spec, and its placeholder claims the verb's
				 * row through this instead of inserting a second one. Null on
				 * a fresh turn.
				 */
				messageId: S.rowIds,
				/**
				 * The built-ins' session changes since the last reply, on the
				 * same terms as `user-message@1`'s port of this name (was
				 * `changes` until 2026-09-16, U5b review S4).
				 */
				sessionChanges: S.json,
			},
		},
	}),
)

// ── Forms (plans/29 R-15 *Forms* · *The line*; R-21 (5); 30 §U5d, 2026-09-17) ──
//
// A **form** is an action still awaiting its answer: a `choices` or `form`
// block a message carries, addressed to a participant. A person portraying
// the addressee answers by clicking; when the host's resolver says the AI
// portrays them this turn, core records `core:event/form-addressed@1` and the
// genre's answer pipeline runs — the four definitions below are its parts:
// the inlet the event lands on, the task that turns the form into a prompt
// context and a JSON Schema, the oracle (`generate-json@1`, already declared)
// that answers against the schema, and the outlet that commits the answer
// **exactly as a click would**. `make-choices@1` is the other direction: how
// a spec turns an oracle's JSON into a question with options; `read-answer@1`
// is how the action a form fires reads the answer port by port.

/**
 * A form was addressed to a participant the AI portrays — the answer
 * pipeline's trigger. The payload is `core:shape/form-addressed@1`; the
 * ports below are it taken apart, with the block itself (`form`) and the
 * addressee's character id (`characterId`, null for an envoy) beside them so
 * the context builder can compile the addressee's card the way it compiles a
 * speaker's. No shape — an event's inlet is never a session mode — and no
 * lock here: the genre's answer spec declares its own `(genre, event)`.
 * @experimental
 */
export const formAddressed = pin(
	describeInletDefinition({
		id: 'core:inlet/form-addressed@1',
		i18n: {
			name: { en: 'Form addressed' },
			description: {
				en: 'A question or form in a message was put to a participant the AI portrays this turn — the pipeline that answers it reads the addressee\'s card and the conversation, and answers against the form\'s schema.',
			},
		},
		ports: {
			out: {
				main: S.formAddressed,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * The session's **settings document** (PLAN-turn-order §4.12,
				 * R13): every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied, §4.13),
				 * scenario, lorebook, tags, channels, the cast with its
				 * envoys, the session-scope rebinds and param overrides per
				 * bound spec, the turn-order state, `metadata` (read-only)
				 * and the annex. `$.input.session.fields.tone` reads in any
				 * spec, and no node re-queries a table for a setting.
				 */
				session: S.sessionSettings,
				/** The message carrying the block. */
				messageId: S.rowIds,
				/** The block's id within the message. */
				blockId: S.text,
				/** The block itself — a `choices` or `form` `MessageBlock`, as stored. */
				form: S.json,
				/** The identity of the action the form answers with — `<spec slug>#<key>`. */
				action: S.text,
				/** Who the form is put to, as a participant reference the resolver answered `ai` for. */
				addressee: S.participantRef,
				/** The addressee's character row, for the context builder; null for an envoy. */
				characterId: S.rowIds,
				/** Values for the genre's declared fields, as on a turn. */
				fields: S.json,
			},
		},
	}),
)

// ── Summarization ───────────────────────────────────────────────────────────
//
// Two phases, and the split is the whole design (see `utils/summarizer`):
// messages are cut into token-sized batches and each is drafted **on its own**,
// then the ordered drafts are merged into one narrative. Drafting a batch in
// isolation is what keeps a long chat summarizable at all — the model never
// sees more than one batch — and it is why the batch step is a `map` rather
// than a loop: the batches do not depend on each other, so nothing forces them
// to be sequential except the connection's own queue.
//
// Each step is its own Provider because each has its own prompt, connection and
// sampling config in the tables this replaces. That was already true; it was
// just spelled as `batch_system_prompt` / `synth_connection_id` columns rather
// than as nodes.

/** @internal */
export const summarizeRequest = pin(
	describeInletDefinition({
		id: 'core:inlet/summarize-request@1',
		ports: {
			out: {
				main: S.summarizeRequest,
				scope: S.sessionScope,
				/**
				 * The session's **settings document** (PLAN-turn-order §4.12,
				 * R13): every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied, §4.13),
				 * scenario, lorebook, tags, channels, the cast with its
				 * envoys, the session-scope rebinds and param overrides per
				 * bound spec, the turn-order state, `metadata` (read-only)
				 * and the annex. `$.input.session.fields.tone` reads in any
				 * spec, and no node re-queries a table for a setting.
				 */
				session: S.sessionSettings,
				request: S.summarizeRequest,
			},
		},
	}),
)
