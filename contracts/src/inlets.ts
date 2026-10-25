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
			// 🚧 Was "Chat" until 2026-10-19 — the word is the assistant genre's now (R1).
			name: { en: 'User message' },
			description: {
				en: "A person's message in a session: what they wrote, who answers it, and everything the turn reads about the session.",
			},
		},
		/**
		 * The standard chat's shape — today's behaviour, *stated*.
		 * This block is what makes the input type a **chat mode** (the
		 * floor: always present, special in availability and nothing else).
		 * Both participant systems are optional and unbounded above, lorebooks
		 * attach when wanted, the composer is a text box, and the seed line
		 * carries the speaking character's name. Duties and triggers are not
		 * here on purpose: the shape is owner-only, and the narrate button is
		 * the narrate spec's contribution, not this type's knowledge.
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
			 * The input hook: user chains over the triggering text,
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
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			sessionScope: 'session',
			sessionId: 'session',
			session: 'session',
			fields: 'session',
			speaker: 'speaker',
			characterId: 'speaker',
			presser: 'actor',
			recipients: 'cast-member',
		},
		ports: {
			out: {
				main: S.json,
				text: S.text,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * Whose turn it is, as a **participant reference**:
				 * `character:<id>` for a library character, `envoy:<slug>` for
				 * a speaker the genre brings with it. Null on a narrator turn —
				 * nobody in particular is speaking. One port answers "who is
				 * speaking" for both kinds, so nothing downstream branches on
				 * which it received; who *portrays* them this turn is the
				 * host's resolver's answer, pinned on the receipt.
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
				 * or fired the action this run answers (2026-09-17).
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
				 * reply as a block (as the Battleship plugin did).
				 *
				 * Never null on a turn or a fire: a run has an owner, and the
				 * owner is a person. Absent only where the inlet is resolved
				 * without one, which no shipped path does.
				 */
				presser: S.participantRef,
				/**
				 * The cast members a press collected
				 * (2026-09-28): `character:<id>` references, for an action
				 * declaring `collects.recipients` — picked in the collect
				 * modal, and validated by the host (seated and enabled, no
				 * duplicates, within the declared `min` and `max`) before
				 * the run starts. Absent on a turn and on every press of an
				 * action that collects none.
				 */
				recipients: S.participantRefs,
				/**
				 * 🚧 The **clock step** a press collected (2026-10-13):
				 * `{ by, unit }` — a whole number other than zero, signed
				 * (back is negative), and one of the story-time units — for
				 * an action declaring `collects.clockStep`, picked on the
				 * collect modal's stepper and checked by the host before the
				 * run starts. Absent on a turn and on every press of an
				 * action that collects none. Core's *Time passes…* hands it
				 * to `core:task/clock-step@1`.
				 */
				clockStep: S.json,
				/**
				 * Values for the mode's declared `fields`, filtered to
				 * the declared schema keys — the supply side of the round
				 * trip: declaration → chat settings → chat row → this port →
				 * every downstream node.
				 */
				fields: S.json,
				/**
				 * Text an in-progress reply has already produced, when this turn
				 * is an **extend** (ruling 2026-09-08; the verb was `continue`
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
				 * The pipeline owns its reply row: a fresh turn's row is
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
				 * (2026-09-16): a list of session changes — `[{ event:
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
				 * Was `changes` until 2026-09-16: that word is
				 * the state ledger's on `resolve-state-changes@1` and
				 * `set-state@1` — a list of value changes — and a session
				 * change is about a message, never a value (one word, one meaning).
				 */
				sessionChanges: S.json,
				/**
				 * 🚧 The **ruleset the session plays** (2026-10-17, PLAN-sheet
				 * §15 C): `{ id, rigour, settings }` — the ruleset's id
				 * (`core:ruleset/freeform@1`), the rigour in force (`prose`,
				 * `mechanics`, `scripts`) and 🚧 (2026-10-18) its `settings`,
				 * every setting at the session's value or its default (Vis
				 * Itineris's `casting: 'points'`). Always supplied, for the reason
				 * `channel` is: a junction compares against it. A genre that
				 * recommends a ruleset branches here instead of assuming it —
				 * the Dungeon Crawler's interview writes a kit as plain pieces
				 * under Freeform and as the library's rows under Vis Itineris.
				 */
				ruleset: S.json,
				/**
				 * What an action's fire sent along
				 * (2026-09-17): a form's answer — `{ choice }` for a choices
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
				 * (2026-09-17) — the stored string, lane included:
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
				 * The session's **settings document**:
				 * every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied),
				 * scenario, lorebook, tags, channels, the cast with its
				 * envoys, the session-scope rebinds and param overrides per
				 * bound spec, the turn-order state, `metadata` (read-only)
				 * and the annex. `$.input.session.fields.tone` reads in any
				 * spec, and no node re-queries a table for a setting.
				 */
				session: S.sessionSettings,
				channel: S.text,
				/**
				 * **How this turn was reached** (2026-09-28) —
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
 * A built-in write's request (2026-09-16) — what a person asked core to
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
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			sessionScope: 'session',
			sessionId: 'session',
			session: 'session',
		},
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
				 * The session's **settings document**:
				 * every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied),
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
				 * clear it — a `sprite-pick@1`, the shape a
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
 * A session was just created — the create pipeline's trigger.
 *
 * The genre's one required pipeline answers this event and seeds the
 * session's initial data: greetings per the genre's shape, initial channels,
 * initial state. The payload is the create request itself — the genre, the
 * chosen preset, the participants and initial field values — because what a
 * create pipeline does is *finish* what the request began.
 *
 * Not `user-message`: reusing the turn input here welded creation to the
 * chat turn's shape and was wrong. A create run has no triggering
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
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			sessionScope: 'session',
			sessionId: 'session',
			session: 'session',
			fields: 'session',
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
				 * The session's **settings document**:
				 * every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied),
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
 * A session event happened: the inlet every
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
 * listener reads it to decide whether to fire the head turn. A spec
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
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			sessionId: 'session',
			sessionScope: 'session',
			session: 'session',
			cast: 'session',
		},
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
				 * The session's **settings document**, resolved
				 * once per run by the host after the write that caused this
				 * event — so the cast below is the cast as it is now, and no
				 * node needs a cast read of its own.
				 */
				session: S.sessionSettings,
				/**
				 * The settings document's **cast**, on its own port:
				 * what `core:query/session-cast@1` publishes,
				 * envoys included, projected from `session` by the host.
				 *
				 * A port rather than a path, because an edge is `{ node,
				 * port }` and nothing in the graph addresses a field inside
				 * a port's value. Core's turn-order spec wires the pool's `cast` from the
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
			 * The input hook, on the same terms as `user-message@1`:
			 * user chains over the triggering text, phase `after` on what this
			 * node publishes, which is what retrieval and the prompt see.
			 *
			 * ⚠ `extras` is what makes this the **new-name hook**. The three
			 * names below are read-only context supplied by the host at the
			 * hook and are part of the fixed choice set the script
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
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			sessionScope: 'session',
			sessionId: 'session',
			session: 'session',
			fields: 'session',
			speaker: 'speaker',
			characterId: 'speaker',
		},
		ports: {
			out: {
				main: S.json,
				text: S.text,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * Who is speaking, as a **participant reference**:
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
				 * reference now (one word, one meaning), and a fact
				 * carrying a free-form name is not a reference to anybody.
				 */
				sideCharacter: S.json,
				/**
				 * The session's **settings document**:
				 * every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied),
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
				 * `changes` until 2026-09-16).
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
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			sessionScope: 'session',
			sessionId: 'session',
			session: 'session',
			fields: 'session',
			messageId: 'message',
			blockId: 'form',
			form: 'form',
			action: 'form',
			addressee: 'cast-member',
			characterId: 'cast-member',
		},
		ports: {
			out: {
				main: S.formAddressed,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * The session's **settings document**:
				 * every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied),
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

// ── A person's message (owner ruling 2026-10-15) ────────────────────────────

/**
 * 🚧 A person sent a message: the save pipeline's trigger. **A person's
 * message is always saved through the pipeline** — the host checks the door
 * (access, the genre, the persona, the length, the channel) and dispatches
 * `core:event/message-offered@1`; the bound spec writes the row. Core's
 * default, `core:spec/save-message`, is this inlet and one
 * `create-message@1` with `role: 'user'`.
 *
 * The payload is `core:shape/message-offered@1`; the ports below are it
 * taken apart. No shape and no lock here: core's default serves every genre,
 * and a genre's own save declares its own `(genre, event)`.
 * @experimental
 */
export const messageOffered = pin(
	describeInletDefinition({
		id: 'core:inlet/message-offered@1',
		i18n: {
			name: { en: 'Message sent' },
			description: {
				en: 'A person sent a message. The pipeline that answers it saves the message — or refuses it with a sentence, and the person keeps their text.',
			},
		},
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			sessionScope: 'session',
			sessionId: 'session',
			session: 'session',
			person: 'actor',
			speaker: 'speaker',
		},
		ports: {
			out: {
				main: S.messageOffered,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/** The session's **settings document**, as on every session inlet. */
				session: S.sessionSettings,
				/** The message as written. */
				text: S.text,
				/** The person sending — `user:<id>`, the run's owner. */
				person: S.participantRef,
				/**
				 * Who the message speaks as: `character:<id>` (the person's
				 * persona), `player-seat:<id>` (their card-less seat), or null —
				 * the person as themselves. Wired to `create-message@1`'s
				 * `speaker`.
				 */
				speaker: S.participantRef,
				/** The channel it was written on, canonical. */
				channel: S.text,
				/** The person's ready tray items, sent as its attachments — `create-message@1`'s `trayItems`. */
				trayItemIds: S.json,
				/** The message it answers, when the composer named one; null otherwise. */
				replyTo: S.rowIds,
				/** Why it fired (`EventCause`) — a person's send, `{ kind: 'user', userId }`. */
				cause: S.json,
			},
		},
	}),
)

// ── A deletion asked (owner ruling 2026-10-23) ──────────────────────────────

/**
 * 🚧 A person asked for a message to be deleted: a **deletion pipeline**'s
 * trigger (RF fix 5). Deletion requires a pipeline, so the genre manages it:
 * the host checks the door (the message is the session's, the person may act
 * on it) and dispatches `core:event/message-deletion-asked@1`; the pipeline
 * registered there ends in `core:outlet/delete-message@1`, handed the
 * deletion whole on its `asked` port
 * (`C.deleteMessage.v1({ asked: $.input.main })`): it deletes THE message
 * the event carried and takes back everything it changed — and the pipeline
 * may put steps of its own around it. Core ships no such pipeline: with none
 * registered, no message offers Delete.
 *
 * The payload is `core:shape/deletion-asked@1`, published whole on `main`
 * (the delete's `asked`); the ports beside it are it taken apart, for the
 * steps around the delete. No lock: registrations mount a pipeline on its
 * event.
 * @experimental
 */
export const messageDeletionAsked = pin(
	describeInletDefinition({
		id: 'core:inlet/message-deletion-asked@1',
		i18n: {
			name: { en: 'Deletion asked' },
			description: {
				en: 'A person asked for a message to be deleted. The pipeline that answers it deletes the message, and what it changed goes with it.',
			},
		},
		/** 🚧 What each port stands for — fit (PLAN-layering D3, R4). */
		entities: {
			sessionScope: 'session',
			sessionId: 'session',
			session: 'session',
			messageId: 'message',
			person: 'actor',
		},
		ports: {
			out: {
				main: S.deletionAsked,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/** The session's **settings document**, as on every session inlet. */
				session: S.sessionSettings,
				/** The message the person asked to delete (the delete itself reads it off `main`). */
				messageId: S.rowIds,
				/** Its channel, canonical. */
				channel: S.text,
				/** Who asked — `user:<id>`, the run's owner. */
				person: S.participantRef,
				/** Why it fired (`EventCause`) — a person's press, `{ kind: 'user', userId }`. */
				cause: S.json,
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
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			scope: 'session',
			session: 'session',
		},
		ports: {
			out: {
				main: S.summarizeRequest,
				scope: S.sessionScope,
				/**
				 * The session's **settings document**:
				 * every setting a person can see in session settings,
				 * resolved once per run by the host and handed in here —
				 * title, guests, genre fields (cascade applied),
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

// ── A card's own action (image generation I5, 2026-10-12) ──────────────────

/**
 * 🚧 A person pressed an action on a **card** — the Characters view, not a
 * session: *Fill empty sprites* on the
 * Sprites tab, and *Generate portrait* on the Gallery tab (`count`, widened
 * in place 2026-10-12).
 *
 * ## No session
 *
 * A card action runs with no session in scope: nothing here is a session's,
 * no live row is filled, no session event is written. The host checks the
 * person may act on the card (its owner, or an admin) before the run starts,
 * and resolves the card ONCE, here — its likeness as text and as the
 * reference image — so no node re-reads the character for a setting.
 *
 * ## The form's answers
 *
 * `fields` is the whole of what the action's form collected. The fields a
 * core action asks are also their own ports (`setName`, `labels`) because a
 * data edge addresses a port, never a field inside one; another card action
 * widens this in place with its own, every one optional.
 *
 * No lock and no shape: a card action is not a session mode, and no genre
 * owns a card.
 * @experimental
 */
export const cardAction = pin(
	describeInletDefinition({
		id: 'core:inlet/card-action@1',
		/**
		 * 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the
		 * ports whose reads need the entity: an optional port is left out.
		 */
		entities: {
			characterId: 'subject',
		},
		ports: {
			out: {
				main: S.json,
				/** The card the action was pressed on. */
				characterId: S.rowIds,
				/** The card's likeness prompt — its look as a tag line; empty when unset. */
				likeness: S.text,
				/** The card's likeness negative; empty when unset. */
				likenessNegative: S.text,
				/**
				 * The likeness image as a one-item media list (the likeness
				 * image, else the avatar); empty when the card has neither.
				 * What a picture step's `references` port takes.
				 */
				likenessImage: S.mediaList,
				/** The form's answers, whole. */
				fields: S.json,
				/** Sprite set fill: the sprite set to fill, by name. */
				setName: S.text,
				/** Sprite set fill: the sprite labels to draw. */
				labels: S.json,
				/** 🚧 Portrait: how many pictures to offer (a whole number, 1–4 on the form). */
				count: S.json,
			},
		},
	}),
)

// ── 🚧 Routines (PLAN-layering D2, R9; 2026-10-20) ─────────────────────────

/**
 * 🚧 Where a **routine** enters — a pipeline registered on a cadence
 * (`register(everyNTurns({ n: 5 }), storySweep)`), run when the cadence says
 * so. Nothing opinionated (R9): a routine's pipeline gets the session, the
 * metadata of where the routine resides, and the parameters of the moment
 * its cadence listened to — and queries everything else through the SDK.
 *
 *  · `session` / `sessionScope` / `sessionId` — the session, always: routines
 *    live in sessions (R9).
 *  · `routine` — `RoutineFiring`: the registration key, the preset, the
 *    cadence and its option values, the mode, the turn / round / scene it
 *    fired on, and room for a note (§11-5).
 *  · `cause` — `RoutineCause`: what the moment carries, whole.
 *  · `ruleset` — the ruleset the session plays, `{ id, rigour, settings }`,
 *    as the user-message inlet carries it (2026-10-20, lane 3): where the
 *    session resides, not what the moment carried — a reckoning branches on
 *    `rigour` (`scripts` routes the deltas to the ruleset handler).
 *  · `message` · `speaker` · `actor` · `castMember` · `subject` · `user` ·
 *    `slot` · `clock` · `scene` — the same moment's entities, one port each,
 *    filled when the moment carries them. Ports are flat (a reference cannot
 *    reach into `cause`), so these are what fit reads: a routine whose steps
 *    read `subject` takes only a cadence whose moment carries one (R12).
 * @experimental
 * @ruling R9, R12, §11-5
 */
export const routine = pin(
	describeInletDefinition({
		id: 'core:inlet/routine@1',
		i18n: {
			name: { en: 'Routine' },
			description: {
				en: 'A routine came due — every few turns, after a scene, on a schedule. The pipeline that runs reads the session and what the moment carried, and queries the rest.',
			},
		},
		entities: {
			session: 'session',
			sessionScope: 'session',
			sessionId: 'session',
			ruleset: 'session',
			message: 'message',
			speaker: 'speaker',
			actor: 'actor',
			castMember: 'cast-member',
			subject: 'subject',
			user: 'user',
			slot: 'slot',
			clock: 'clock',
			scene: 'scene',
		},
		ports: {
			out: {
				main: S.json,
				session: S.sessionSettings,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				routine: S.json,
				cause: S.json,
				ruleset: S.json,
				message: S.rowIds,
				speaker: S.participantRef,
				actor: S.participantRef,
				castMember: S.participantRef,
				subject: S.participantRef,
				user: S.participantRef,
				slot: S.text,
				clock: S.json,
				scene: S.rowIds,
			},
		},
	}),
)

// ── 🚧 A ruleset's action (PLAN-rulesets-functions D6; 2026-10-23) ──────────

/**
 * 🚧 Where the one generic **rules-action** pipeline enters
 * (`core:spec/rules-action`): a person invoked one of the functions the
 * session's ruleset uses — an **invokable** function, which the host offers
 * as an action registration of that pipeline, its label and form the
 * function header's (`jsonSchemaOf(fn, { part: 'invokable' })`).
 *
 *  · `function` — the function's key in the ruleset (`rest`, `draw`), as
 *    its reference names it;
 *  · `answer` — what its form collected (null when it asks nothing);
 *  · `actor` — who invokes it; `aimedAt` — at whom, when anyone;
 *  · `mode` — the action registration's mode in force: `full` applies what
 *    the function changes, `review` holds each change for the session's
 *    owner (absent: `full`);
 *  · `session` / `sessionScope` / `sessionId` / `ruleset` — the session, as
 *    the routine inlet carries it;
 *  · `main` — the payload whole (`{ session, actor, function, answer,
 *    aimedAt }`): what `ruleset-resolve`'s `actions` port takes to run the
 *    function with its answer.
 *
 * No lock and no shape: every genre's session may play a ruleset with
 * actions, and the pipeline is the same for all of them.
 * @experimental
 * @ruling PLAN-rulesets-functions D6
 */
export const rulesAction = pin(
	describeInletDefinition({
		id: 'core:inlet/rules-action@1',
		i18n: {
			name: { en: 'A ruleset action' },
			description: {
				en: "Someone used one of the rules' actions — rested, drew a card, gave a gift. The pipeline runs the rule with what they chose, then applies or proposes what it changed.",
			},
		},
		/** 🚧 What each port stands for — fit (PLAN-layering D3, R4). Only the ports whose reads need the entity. */
		entities: {
			session: 'session',
			sessionScope: 'session',
			sessionId: 'session',
			ruleset: 'session',
			actor: 'actor',
		},
		ports: {
			out: {
				main: S.json,
				session: S.sessionSettings,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/** The ruleset the session plays, `{ id, rigour, settings }`. */
				ruleset: S.json,
				/** Who invokes the function. */
				actor: S.participantRef,
				/** The function's key in the session's ruleset. */
				function: S.text,
				/** What the function's form collected; null when it asks nothing. */
				answer: S.json,
				/** Whom it is aimed at, when anyone. */
				aimedAt: S.participantRef,
				/** The action registration's mode: `full` or `review`. */
				mode: S.text,
			},
		},
	}),
)
