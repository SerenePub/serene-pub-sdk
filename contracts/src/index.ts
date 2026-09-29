/**
 * Sample core contracts — what /contracts would generate.
 *
 * Every entry is a descriptor plus a pinned constructor. Note that the LLM, TTS and
 * image-gen providers are structurally identical: `params` is declared per type, so
 * nothing anywhere switches on modality (17 §1).
 */

import { S, tf, IoKinds, BAND_PRIORITIES } from '@serene-pub/sdk'
import { jinja2, handlebars, liquid } from '@serene-pub/sdk'
import {
	describeInletDefinition,
	describeQueryDefinition,
	describeTaskDefinition,
	describeOracleDefinition,
	describeOutletDefinition,
	pin,
} from '@serene-pub/sdk'
import { PROMPT_BLOCKS_DECL } from '@serene-pub/sdk'
import {
	varWorldLore,
	varCharacterLore,
	varHistory,
	varDocsExcerpts,
	varRecalledLines,
} from '@serene-pub/sdk'
import type { FieldDecl, SlotDecl, VarField } from '@serene-pub/sdk'

/**
 * How a provider node wants its request sent.
 *
 * Two values, because only two are deliverable. `auto` defers to the
 * CONNECTION, which already holds an answer and holds a different default per
 * service; `off` forces the single-request branch every adapter has. There is
 * no `on`: a connection whose adapter has no streaming branch could not honour
 * one, and a control that silently means nothing on half the rows is the
 * defect this vocabulary avoids.
 *
 * A factory rather than a shared constant so the four declarations are four
 * objects — a descriptor is snapshotted into registry rows, and an alias
 * shared across pins is one edit away from being four.
 */
const streamingParam = (): FieldDecl => ({
	type: 'enum',
	of: ['auto', 'off'],
	members: [
		{
			key: 'auto',
			label: { en: 'Automatic' },
			description: { en: "Keeps the connection's own Stream setting." },
		},
		{
			key: 'off',
			label: { en: 'Off' },
			description: { en: 'Sends one request and waits — cheaper for background steps.' },
		},
	],
	default: 'auto',
	description:
		"Automatic keeps the connection's own Stream setting; Off sends one request and waits, which is cheaper for background steps.",
})

/**
 * `BAND_PRIORITIES` as a person reads them. A factory for the reason
 * `streamingParam` is: each declaration gets its own objects.
 */
const bandPriorityMembers = () => [
	{
		key: 'low',
		label: { en: 'Low' },
		description: { en: 'Its entries go behind the others when leftover room is handed out.' },
	},
	{
		key: 'normal',
		label: { en: 'Normal' },
		description: { en: 'No ordering: leftover room follows relevance alone.' },
	},
	{
		key: 'high',
		label: { en: 'High' },
		description: { en: 'Its entries go ahead of the others when leftover room is handed out.' },
	},
	{
		key: 'always',
		label: { en: 'Always' },
		description: { en: 'Every entry the window can hold is kept, ahead of the scored fill.' },
	},
]

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

// ── Queries ─────────────────────────────────────────────────────────────────

/** @public */
export const sessionHistory = pin(
	describeQueryDefinition({
		id: 'core:query/session-history@1',
		i18n: { name: { en: 'Session history' } },
		timeoutMs: 2000,
		slots: {
			/**
			 * ⚠ No `template` slot, and there was one.
			 *
			 * It declared "how each chat message is written into the context",
			 * and three things were true of it: no binding ever read it, no row
			 * was ever seeded for its pool, and so the panel rendered a picker
			 * with **nothing in it** on every pipeline that used this node. A
			 * control that cannot be given a value and would not be used if it
			 * could is worse than the absence of the feature — the same
			 * judgement `variableLayouts.ts` records about a layout for
			 * `characterLore`.
			 *
			 * If per-message wording becomes configurable, it belongs on
			 * `core:task/process-messages@1`, which is what actually formats a
			 * line. This node fetches rows.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ The default is **100 because 100 is what every install
					 * has been getting**, not because 100 was chosen.
					 *
					 * It read 40 here and nothing read it: the binding took
					 * `input.limit`, a key nothing supplies, and fell through to
					 * a literal 100 on every run. Wiring the control while
					 * leaving the declared number at 40 would have moved the
					 * transcript window from 100 to 40 on every install at
					 * defaults — a retrieval change smuggled in behind a typing
					 * fix. So the declaration is corrected to the effective
					 * value first; changing the number is a separate decision,
					 * made against the measure corpus.
					 *
					 * Exactly the ruling `topK` got (2026-09-07), for exactly
					 * the same defect.
					 */
					limit: {
						type: 'integer',
						default: 100,
						description: 'How many recent messages are considered for the context.',
					},
					/**
					 * The channel this history reads (20 §7). A session's
					 * lanes are the mode's declaration; a pipeline chooses
					 * which one builds its context — the map narrator reads
					 * `map`, the chat pipeline reads `main`, and a custom
					 * spec may do otherwise on purpose.
					 */
					channel: {
						type: 'string',
						default: 'main',
						description:
							"Which of the session's channels this history reads. The chat log is 'main'.",
					},
					/**
					 * **Only the unplayed talk** (lair re-plan R13, 2026-09-28):
					 * the rows of a side channel written since the story's
					 * newest generated line — the newest visible `main` row
					 * whose role is not `user`. Of those it keeps a person's own
					 * lines and the replies a run fired ON this channel wrote
					 * there (its inlet's `channel` is this one); a row a create
					 * run wrote (a greeting) or a story turn wrote (the Lair's
					 * beats row) is left out, read off the run artifacts, never
					 * a row's metadata. `limit` still caps it, newest kept.
					 *
					 * Refused with `channel: 'main'`: the story's own rows are
					 * the bound, never the talk.
					 */
					unplayedOnly: {
						type: 'boolean',
						default: false,
						label: { en: 'Only since the last story line' },
						description: {
							en: "Read only what was said on this channel since the story's newest generated line: people's lines and the replies to them. Cannot be used with the 'main' channel.",
						},
					},
					/**
					 * **Side channels as talk** (lair re-plan R10's fold-in of
					 * the R9 follow-up, 2026-09-28): on every channel but
					 * `main`, keep only the talk — a person's own lines and the
					 * replies a run fired ON that channel wrote there — by the
					 * rule `unplayedOnly` uses, without its bound. A row a
					 * create run wrote (a greeting) or a story turn wrote (the
					 * Lair's Sanctum beats row) is left out, read off the run
					 * artifacts, never a row's metadata. `main` rows are kept
					 * whole. The window is the newest `limit` rows before the
					 * filter, so it may hand on fewer.
					 *
					 * The Lair's room check reads every channel with it
					 * (`exitProse`): a beats list naming a room is the
					 * Castellan's plan, not a description of the room.
					 */
					talkOnly: {
						type: 'boolean',
						default: false,
						label: { en: 'Side channels: talk only' },
						description: {
							en: "On every channel but 'main', read only what was said there: people's lines and the replies to them — never a greeting or a turn's notes.",
						},
					},
					/**
					 * The transcript's intent, on the node that produces the
					 * transcript (R-7 P5, built 2026-09-16 — see
					 * `bandIntentFields`). `weight: 0.4` and `minInclude: 6`
					 * were here once, moved to the ranker's per-source map as
					 * `share.messages` and `minEntries.messages`, and are back
					 * where 16 §5a always said they belonged, at the numbers
					 * the map held: half the window is `MESSAGE_FILL_FRACTION`,
					 * and six is the minimum the map carried for the one band
					 * R6 allows one.
					 *
					 * ⚠ This node ranks **no candidates** in any shipped spec
					 * — `main` carries the transcript rows for
					 * `process-messages`, and `assemble` builds the transcript
					 * from those, never from ranked candidates. Its intent
					 * still reaches the ranker, on the `band` out-port a spec
					 * concatenates in with the lore, and its `share` is what
					 * halves the pool the lore sources divide: the
					 * conversation's slice is reserved and whatever it does
					 * not spend is swept to the others, exactly as the map's
					 * `messages: 0.5` did. `maxEntries` and `minEntries` bind
					 * only when a spec does rank message candidates (an
					 * `entity-search` `messages` port, a compression region);
					 * they are declared at the map's values so that spec
					 * inherits what every install has stored, not so a person
					 * moving them today sees a prompt change — they will not.
					 */
					share: {
						type: 'number',
						min: 0,
						default: 0.5,
						quick: true,
						label: { en: 'Share — conversation' },
						description: {
							en: 'How much of the context window the conversation may take, relative to every other source. What it does not spend is handed to the lore. Set to zero to give the whole window to the other sources.',
						},
					},
					maxEntries: {
						type: 'integer',
						min: 0,
						default: 50,
						label: { en: 'Most entries — conversation' },
						description: {
							en: 'A ceiling on how many retrieved messages may reach the prompt as ranked entries, whatever the share. The transcript itself is sized by the window, not by this.',
						},
					},
					minEntries: {
						type: 'integer',
						min: 0,
						default: 6,
						label: { en: 'Always keep at least' },
						description: {
							en: 'Recent messages kept as ranked entries whatever the shares say, so a lore-heavy chat stays readable. Dropped when there is no room. Lore has no minimum — it competes on score (R6).',
						},
					},
					/**
					 * Read, at last (R-7 P5; it was declared and read by nothing
					 * from the day it was written, allow-listed in the
					 * declared-reads guard until this landed). `normal` is no
					 * ordering at all; see `BAND_PRIORITIES` in the SDK for
					 * what the other three do to the ranker's sweep.
					 */
					priority: {
						type: 'enum',
						of: BAND_PRIORITIES,
						members: bandPriorityMembers(),
						default: 'normal',
						label: { en: 'Priority — conversation' },
						description: {
							en: "How strongly the conversation resists being trimmed once the shares are spent — 'always' keeps every message the window can hold.",
						},
					},
				},
			},
		},
		ports: {
			/**
			 * ⚠ No `budget` in-port, and there was one (culled 2026-09-16,
			 * R-12). It was declared and read by nothing: the window this
			 * node fetches is `params.limit`, a count of messages, and a
			 * token budget arriving here had no reader and no spec wiring it.
			 * Fitting history to a budget is `core:task/rank-hybrid@1`'s job,
			 * on ITS `budget` port.
			 */
			in: {
				scope: S.sessionScope,
				/**
				 * **One row, by id** (lair re-plan R11, 2026-09-28): wired —
				 * `$.input.messageId`, the message a press on a message's ⋮
				 * was made on — the read is exactly that row, whatever its
				 * channel, as a one-row transcript; `limit`, `channel`,
				 * `unplayedOnly` and `talkOnly` do not apply. The row must be
				 * this session's, and a hidden or still-generating row reads
				 * as nothing, the same as in any window. Unwired, the window
				 * reads as it always did. For an action that acts on the row
				 * it was pressed on (the Lair's *File as a room*): the inlet
				 * carries the id, never the text, so the row is read here.
				 */
				messageId: S.rowIds,
			},
			out: {
				/**
				 * Transcript rows, on both — `messages@1` (was
				 * `context-candidates@1` until 2026-09-17, U5d review W9: the
				 * value had always been rows, for `process-messages` and
				 * `prose-transcript`, and the intent rides `band` alone).
				 * Neither is a candidates list (R-a, the same day): a spec that
				 * wires either into a merge, a concat or `assemble`'s
				 * `candidates` gets a `validate()` warning naming `band` — the
				 * host drops rows handed as candidates rather than ranking them.
				 */
				main: S.messages,
				messages: S.messages,
				/**
				 * The conversation's **band intent**, alone — a candidates
				 * list holding one element and no items (`BandIntent`), for a
				 * spec to concatenate in with the lore so the ranker reserves
				 * the transcript's slice. Its own port because `main` and
				 * `messages` carry transcript rows for `process-messages`, and
				 * an intent element ahead of them would be read as a message.
				 * Opens with a band-intent element (and holds nothing else)
				 * — readers call `splitCandidates()`.
				 */
				band: S.candidates,
			},
		},
	}),
)

/**
 * How much non-key evidence brings an entry in when no keyword matched.
 *
 * The scan admits a candidate on `pinned || keyword > 0 || nameMatch > 0`, and
 * every other signal is computed *before* that line — so tf-idf and entity
 * co-occurrence could only ever reorder what an author's keys had already let
 * through. An entry with no matching key could not reach the prompt however
 * relevant it was, which is the whole reason a lorebook has to be hand-indexed:
 * "the Riders", "them" and "the order" are all the Ashguard, and only the
 * author writing each of them down makes the entry fire.
 *
 * This opens that line to evidence:
 *
 *     admit ⟸ pinned ∨ keyword > 0 ∨ nameMatch > 0 ∨ evidence ≥ admitThreshold
 *
 * **Keys keep guaranteeing.** Evidence only ever *adds* — an authored key fires
 * exactly as it did, and `constant` still bypasses retrieval entirely rather
 * than becoming a large number. Nothing here needs an embedding model: the
 * evidence is proper-noun overlap and rarity-weighted vocabulary overlap, both
 * computed from the rows and the conversation already in hand.
 *
 * **0 is off, and is the shipped default** — the same convention
 * `maxRecursionDepth` uses, and for the same reason: this changes what reaches
 * the model, so it is a thing somebody turns on rather than a thing that
 * happens to them on upgrade. Reading 0 as "admit everything, since every
 * evidence score clears zero" would be the one value that cannot be a default.
 *
 * The two kinds of evidence combine so that **either admits on its own** — a
 * sum would divide one budget between them and leave whichever got the smaller
 * share unable to bring anything in by itself, which is not what "tf-idf can
 * admit" means. So the scale is calibrated on each separately: ~0.3 is *one
 * thing the conversation is naming that not every entry names*, or *about a
 * third of what an entry is about being under discussion*. 1 admits almost
 * nothing.
 */
/**
 * How the entry side of the vocabulary overlap is read.
 *
 * The signal asks *is the conversation talking about this entry's subject right
 * now*, and it answers by weighting each of the entry's terms by how often the
 * recent window says it and how rare the term is. `overlap` adds that weight
 * once **per occurrence in the entry** — so a word written three times counts
 * three times, and an entry with more words has more of them to count. Lorebook
 * entries vary wildly in length, which is precisely the case that reading
 * handles worst: twelve near-identical entries end up ordered by how many times
 * each happened to repeat itself.
 *
 * `balanced` is BM25 over the same inputs. The query half does not move at all;
 * what changes is that the entry's own term count saturates (the fifth
 * occurrence of a word is worth about a tenth of the first) and is divided by
 * the entry's length relative to the rest of the lorebook. A long entry stops
 * winning for being long and a repeated word stops counting linearly.
 *
 * `overlap` is the shipped default, on the `admitThreshold` convention: this
 * changes the order lore reaches the model in, so it is turned on rather than
 * arrived at on upgrade.
 *
 * `members` rather than `of` because the stored values are not readable: a
 * picker offering "bm25" is offering the name of a paper rather than a choice.
 * (The convention was `RETRIEVAL_MODE`'s before that declaration was culled;
 * `TRIGRAM_FOLDING` and the entry-side strategy picker keep it.)
 */
const LEXICAL_SCORING = {
	type: 'enum' as const,
	default: 'overlap',
	label: { en: 'Relevance balance' },
	members: [
		{
			key: 'overlap',
			label: { en: 'Raw overlap' },
			description: {
				en: 'Every repeat of a word counts again, so a longer entry has more chances to score.',
			},
		},
		{
			key: 'balanced',
			label: { en: 'Length-aware' },
			description: {
				en: 'A repeated word stops adding as much, and an entry is judged against how long lorebook entries usually are. Better when entries differ a lot in length.',
			},
		},
	],
	description: {
		en: "How an entry's own wording is weighed when deciding how relevant it is to what is being said.",
	},
} as const

/**
 * How much a fuzzy, character-trigram hit on a keyword is worth, 0 being off.
 *
 * Word matching is not merely imprecise for unsegmented scripts — Japanese,
 * Chinese and Thai have no spaces for "whole word" to mean anything against —
 * so trigrams are not a refinement there, they are the only thing that works.
 * Everywhere else they absorb inflection and typos: `riders` fires a key
 * written `rider`, `Ashgaurd` fires `Ashguard`.
 *
 * A strength rather than a switch, because a fuzzy hit is genuinely weaker
 * evidence than an exact one and the useful question is *how much weaker*. An
 * exact match still counts 1 whatever this is, so raising it can only ever add
 * matches — never move or remove one.
 *
 * ⚠ **0 is off and is the shipped default.** A regex key is exempt at any
 * value: a pattern is not text, and folding `\b(ash|em)ber\b` into trigrams
 * would match on the punctuation of the pattern rather than on anything it
 * describes.
 */
const TRIGRAM_FOLDING = {
	type: 'number' as const,
	default: 0,
	min: 0,
	max: 1,
	label: { en: 'Match near-misses' },
	description: {
		en: 'How much a keyword that is nearly present counts — a different ending, a typo, or a language that does not put spaces between words. 0 requires an exact match; try 0.5 to turn it on.',
	},
} as const

/**
 * How much a term in an entry's title counts against the same term among its
 * keywords.
 *
 * ⚠ **1 is neutral, not off.** The title and the keywords are read as one bag
 * of words today, so 1 is what already happens rather than a feature switched
 * off. Above 1, an entry *about* the thing being discussed outranks one that
 * merely lists it as a keyword.
 *
 * The other half is the **keywords**, not the entry's content. What is scored
 * is the author's index; widening it to the body would change the order of
 * every keyed book there is, which is a different change from this one.
 */
const TITLE_WEIGHT = {
	type: 'number' as const,
	default: 1,
	min: 0,
	max: 5,
	label: { en: 'Title counts extra' },
	description: {
		en: "How much more a word in an entry's title counts than the same word among its keywords. 1 treats them alike.",
	},
} as const

/**
 * How much recent conversation the *presence* questions are asked over.
 *
 * ⚠ **Engine-read and load-bearing since long before it was declared.**
 * `keywordQuery` has always taken this number off `RetrievalParams`, where it
 * sat as a hardcoded 10 that nothing could reach: it sets the window
 * `speakerCooccurrenceSignal` asks "did this character's own lore-bound
 * character actually speak" over, and it sets the term-frequency window tf-idf
 * scores an entry against. Two of the ranker's live signals, tuned by a
 * constant, with no control anywhere. That is the same defect as a declared
 * control nothing reads, pointed the other way.
 *
 * ⚠ **Not `scanDepth`, and the split is the point.** `scanDepth` is how far
 * back a *keyword* may fire from; this is how much conversation counts as
 * *now*. A session of long posts wants a deep scan and a short guarantee, and a
 * terse one wants the reverse. `RetrievalParams` says the split is
 * "behaviour-preserving while both default to 10", and this is the half that
 * makes the sentence testable rather than aspirational — so it defaults to 10,
 * exactly as it has silently run.
 */
const GUARANTEED_MESSAGES = {
	type: 'integer' as const,
	default: 10,
	min: 1,
	label: { en: 'Messages that count as "now"' },
	description:
		'How much of the recent conversation counts as the current moment when judging relevance — which characters are present, and which words the scene is actually using. Separate from how far back a keyword may fire from.',
} as const

const ADMIT_THRESHOLD = {
	type: 'number' as const,
	default: 0,
	min: 0,
	max: 1,
	quick: true,
	label: { en: 'Find without keywords' },
	description: {
		en: 'How readily an entry is brought in on relevance alone when none of its keywords matched — the names the conversation is using, and the distinctive words it shares with the entry. 0 keeps keywords the only way in; try 0.3 to turn it on.',
	},
} as const

/**
 * Where a source's intent lives: **on the source** (16 §5a; R-7 P5, ruled
 * 2026-09-15, built 2026-09-16 — plans/30 U3b).
 *
 * `share`, `maxEntries`, `minEntries` and `priority` used to be five-band maps
 * on `core:task/rank-hybrid@1`. That was the design 16 §5a rejected and said
 * why: a per-source map on the ranker has to be kept in step by hand with
 * whichever sources exist, goes silently stale when one is added, and a
 * plugin's retrieval definition cannot take part at all without somebody
 * editing the ranker. So each of the five retrieval definitions declares its
 * own — the four fields below, labelled with the band they speak for — and
 * publishes them as one **band intent** element at the head of its
 * candidates (`BandIntent` in the SDK); `lorebook-triggers@1`, which produces
 * three bands through one port, declares three (`bandIntentFieldsOf`) and
 * publishes three. The ranker reads the intents off the list it is handed
 * and keeps only what is cross-source.
 *
 * **Every default here is the number the ranker's map held**, so an install
 * that tuned nothing selects exactly what it selected before: `messages` 0.5
 * (which is `MESSAGE_FILL_FRACTION`), the three lore bands 0.1667 / 0.1667 /
 * 0.1666, relationships 0; ceilings 50 / 20 / 15 / 10 and none; a minimum of 6
 * on the conversation alone (R6). Migration 0135 moves every stored value to
 * the node that owns it now.
 *
 * ⚠ **`minEntries` is declared on `session-history` alone.** R6 (retrieval
 * plan §7): *per-source minimums are removed everywhere except recent
 * conversation*. A minimum is a promise to spend budget on a source whether or
 * not it scored, and the one way an entry the ranker turned down could come
 * back in; declaring one on a lore lane would reopen exactly that door, so
 * the field is not declared there rather than declared at zero.
 *
 * `share` is a plain relative number, not the `share` control type: that
 * type divides ONE value over its members, and there is no one value any
 * more — each source states its own and the ranker normalises across
 * whatever arrived (its `shareNormalisation`). Zero is still the off switch.
 */
const bandIntentFields = (
	band: { label: string; noun: string },
	defaults: { share: number; maxEntries?: number },
) => ({
	share: {
		type: 'number' as const,
		min: 0,
		default: defaults.share,
		quick: true,
		label: { en: `Share — ${band.label}` },
		description: {
			en: `How much of the context window ${band.noun} may take, relative to every other source. The ranker normalises the shares it is handed; set this to zero to leave ${band.noun} out.`,
		},
	},
	maxEntries: {
		type: 'integer' as const,
		min: 0,
		...(defaults.maxEntries === undefined ? {} : { default: defaults.maxEntries }),
		label: { en: `Most entries — ${band.label}` },
		description: {
			en: `A ceiling on how many entries ${band.noun} may contribute, whatever its share.`,
		},
	},
	priority: {
		type: 'enum' as const,
		of: BAND_PRIORITIES,
		members: bandPriorityMembers(),
		default: 'normal' as const,
		label: { en: `Priority — ${band.label}` },
		description: {
			en: `How strongly ${band.noun} resists being trimmed once the shares are spent — 'high' and 'low' sort its entries ahead of or behind the others when leftover room is handed out; 'always' keeps every entry the window can hold.`,
		},
	},
})

/**
 * The three lore bands, as ONE table: the label each band's controls wear and
 * the numbers it ships at. Read by the three lanes (`worldLore`,
 * `characterLore`, `historyEntries` — one band each) AND by
 * `lorebook-triggers@1` (all three, namespaced — `bandIntentFieldsOf`), so
 * the two shapes cannot ship a band at two numbers: a person moving from the
 * narrator's one-node scan to `respond`'s three lanes finds the same defaults
 * under the same labels, and migration 0135's `shipped` table has one set to
 * agree with.
 *
 * 0.1666 on history, not 0.1667: the three lore shares summed to exactly 0.5
 * on the ranker's map and still do — the migrated value is the declared one,
 * so nobody's split moves by a ten-thousandth on upgrade.
 */
const LORE_BANDS = {
	worldLore: {
		band: { label: 'world lore', noun: 'world lore' },
		defaults: { share: 0.1667, maxEntries: 20 },
	},
	characterLore: {
		band: { label: 'character lore', noun: 'character lore' },
		defaults: { share: 0.1667, maxEntries: 15 },
	},
	history: {
		band: { label: 'history', noun: 'history entries' },
		defaults: { share: 0.1666, maxEntries: 10 },
	},
} as const

/**
 * One band's intent, **namespaced by band** — `worldLoreShare`,
 * `worldLoreMaxEntries`, `worldLorePriority` — for a definition that produces
 * more than one band through one port and so has to declare more than one
 * intent in ONE `params` slot (`lorebook-triggers@1`).
 *
 * Flat camel-case keys rather than a nested `object` field per band, and the
 * reason is the storage contract: a config value is addressed by
 * `(node, slot, path)` with `path` a single field name, the panel renders one
 * control per top-level field, and migration 0135 moves the ranker's old
 * `share.worldLore` member to exactly one row at `<band><Field>` — a nested
 * shape would have needed a second addressing scheme on three definitions
 * for the benefit of none. The label is the band's own ("Share — world
 * lore"), so a person sees the same words on this node as on the lane.
 */
const bandIntentFieldsOf = <B extends keyof typeof LORE_BANDS>(band: B) => {
	const f = bandIntentFields(LORE_BANDS[band].band, LORE_BANDS[band].defaults)
	return {
		[`${band}Share`]: f.share,
		[`${band}MaxEntries`]: f.maxEntries,
		[`${band}Priority`]: f.priority,
	} as { [K in `${B}Share`]: typeof f.share } & { [K in `${B}MaxEntries`]: typeof f.maxEntries } & {
		[K in `${B}Priority`]: typeof f.priority
	}
}

/** @public */
export const lorebookTriggers = pin(
	describeQueryDefinition({
		id: 'core:query/lorebook-triggers@1',
		i18n: { name: { en: 'Lorebook triggers' } },
		timeoutMs: 2000,
		/**
		 * All three lore lanes through one port, so all three bands — each a
		 * top-level template name with its variable (typed templates P2).
		 * Policy, not contract: the candidates are the same either side of it.
		 */
		bands: { worldLore: varWorldLore, characterLore: varCharacterLore, history: varHistory },
		slots: {
			/**
			 * ⚠ No `template` slot, and there was one — a *source* template for
			 * "how one triggered entry is written into the context".
			 *
			 * Nothing read it and nothing seeded a row for it, so it rendered as
			 * an empty picker. A source template belongs on the node whose job
			 * is the rendering — a `render-entries` task, when one is bound
			 * (culled unbound, plans/29 R-2); two declarations of one idea, one
			 * of them inert, is how they drift.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * The three bands' intents, first, as on the lanes (R-7
					 * P5; U3b review W1, 2026-09-16). This node produces world
					 * lore, character lore AND history through one port, so it
					 * declares all three — namespaced, `worldLoreShare` … —
					 * and publishes three band intents at the head of its
					 * candidates. Same defaults and labels as the three lanes,
					 * from `LORE_BANDS`, so the narrator's split is the reply's
					 * split until somebody moves one. Before this the node
					 * declared no intent at all and the ranker fell back to its
					 * own table for every lore band — the same numbers, but a
					 * tuned share on `narrate`'s ranker had nowhere to move to
					 * (0135 culled it) and nothing on this node could be tuned.
					 */
					...bandIntentFieldsOf('worldLore'),
					...bandIntentFieldsOf('characterLore'),
					...bandIntentFieldsOf('history'),
					/**
					 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value the
					 * scan actually ran on while this declaration said 3 and
					 * nothing read it.
					 *
					 * Round-sized on purpose. A group session with five
					 * characters takes five messages to come back round, so a
					 * depth of 3 cannot see the turn it belongs to: the window
					 * has already slid past where the round began. Scan depth
					 * has to be at least a round, and a round grows with the
					 * cast.
					 */
					scanDepth: {
						type: 'integer',
						default: 10,
						label: { en: 'Messages scanned for keywords' },
						description: 'How many recent messages are scanned for lorebook keywords.',
					},
					/**
					 * On this type as well as on `loreSlots`, for the reason its
					 * three siblings below give: the narrator runs its lore
					 * through this type, and this number reaches the same
					 * `keywordQuery` from the same `retrievalParamsFrom` seam —
					 * so a control that exists on the reply pipeline and not on
					 * the narrator is a difference no user could discover a
					 * reason for.
					 */
					guaranteedMessages: GUARANTEED_MESSAGES,
					/**
					 * The ceiling, spelled the way its three siblings spell it.
					 *
					 * ⚠ This was `recursionDepth`, and the one letter of
					 * difference is why it looked wired and was not:
					 * `retrievalParamsFrom` reads `maxRecursionDepth`, so the
					 * number this node stored was handed to nothing and the
					 * narrator ran on `DEFAULT_RETRIEVAL` whatever anybody
					 * typed. `narrate@1.10.0`'s own note says "Scan Depth and
					 * Max Recursion Depth rendered, validated and saved here
					 * without ever being read" — half of that was fixed by
					 * wiring the slot, and this is the other half, because the
					 * control it names was never called that here.
					 *
					 * Renamed rather than read under both spellings: two names
					 * for one ceiling is how the four lore types drift apart
					 * again, and `loreSlots` below has the older claim on the
					 * name. Migration 0195 carries the stored values across so
					 * a number somebody typed keeps its meaning — it simply
					 * starts working, which is the 0186 rule.
					 *
					 * Same default and same words as `loreSlots`': the narrator
					 * runs its lore through this type, and a ceiling that
					 * exists on the reply pipeline and not on the narrator is a
					 * difference no user could discover a reason for.
					 */
					maxRecursionDepth: {
						type: 'integer',
						default: 0,
						label: { en: 'Follow keyword chains this deep' },
						description:
							'A ceiling on how far entries may trigger further entries via keywords found in their text, however deep an individual entry asks to go. It never follows links between entries.',
					},
					/**
					 * ⚠ `caseSensitive`, `useRegex`, `weight` and `minInclude`
					 * were here, and are gone rather than wired. All four
					 * rendered, validated, stored a row and resolved through
					 * every scope layer while `retrievalParamsFrom` read none
					 * of them — plan bug 15, and the last of the dead-control
					 * clusters bug 12 found the first of.
					 *
					 * They divide cleanly in two, and neither half is a control
					 * this node should own:
					 *
					 *   · `caseSensitive` and `useRegex` describe how an *entry*
					 *     matches. `loreSlots` below already states the rule —
					 *     the entry is what somebody is looking at when they
					 *     want to change that — and the entry is where they
					 *     live: `signals.ts` reads `entry.caseSensitive` and
					 *     folds `entry.useRegex` into `entry.matchMode`, both
					 *     columns with their own editor control. A node-level
					 *     copy could only ever be a second answer to a question
					 *     the row already answers.
					 *   · `weight` and `minInclude` are the ranker's, and this
					 *     is the same pair `core:query/session-history@1` lost
					 *     for the same reason: they ask how one source fares
					 *     against everything else, and a node that fetches rows
					 *     cannot see everything else to answer it. They are
					 *     `share` / `signal*` and `minEntries` on
					 *     `core:task/rank-hybrid@1` now, beside their peers,
					 *     where a share is normalised against the others rather
					 *     than free to disagree with them.
					 *
					 * Deleting an address culls it: `reconcileConfigs` removes
					 * the stored value and writes a notice carrying what it
					 * was, which the admin workspace renders. That is the
					 * whole reason a cull is allowed to be the answer here —
					 * before the notices surface had a reader, "delete it" and
					 * "lose it silently" were the same act.
					 */
					admitThreshold: ADMIT_THRESHOLD,
					/**
					 * The three lexical-quality controls, on this type as well
					 * as on `loreSlots` and for `admitThreshold`'s reason: the
					 * narrator runs its lore through this type, and a control
					 * that exists on the reply pipeline and not on the narrator
					 * is a difference no user could discover a reason for.
					 */
					lexicalScoring: LEXICAL_SCORING,
					trigramFolding: TRIGRAM_FOLDING,
					titleWeight: TITLE_WEIGHT,
				},
			},
		},
		ports: {
			/**
			 * ⚠ No `text` in-port, and this and the three lore lanes had one
			 * (culled 2026-09-16, R-12). It was filled by no spec and read by
			 * no handler — the scan derives its window from `scope`, which is
			 * where it actually comes from — and each of the four carried a
			 * standing excuse in `wiring.test.ts` saying so.
			 */
			in: {
				scope: S.sessionScope,
				/**
				 * **Whose private lore this read is for** — a participant
				 * reference (`character:<id>`), additive, 2026-09-17 (W1).
				 *
				 * Character-lore visibility is decided at the host read against
				 * ONE subject, and until this port existed that subject was the
				 * run's scope — so every voice of a multi-agent turn was handed
				 * every character's private lore, because one gather ran once for
				 * all of them. Wired inside a repeating clause
				 * (`speaker: $.voices.item.context.speaker`) it names the speaker
				 * THIS iteration is writing as, and the host applies the same
				 * binding-visibility gate for that character instead of the
				 * scope's.
				 *
				 * Unwired, absent, or a reference naming nobody the host can
				 * resolve to a character row, the scope decides exactly as it
				 * always did — including `null`, which is the omniscient
				 * narrator's read. A reference is never *widened* here: the port
				 * chooses whose secrets are readable, never whether the gate runs.
				 */
				speaker: S.participantRef,
			},
			// Both open with band-intent elements — three, one per lore band
			// — ahead of the items; readers call `splitCandidates()`.
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

/**
 * World lore and character lore, as two queries rather than one.
 *
 * `lorebook-triggers@1` returns both through a single port, and for a long
 * time they shared a weight, a minimum and a share of the window there. They
 * are not alike: character lore is bound to whoever is speaking and world
 * lore is not, and an install that wants a lot of one and little of the
 * other had no way to say so. (Since U3b's review it can on either shape:
 * that node declares one intent per band it produces, namespaced —
 * `bandIntentFieldsOf` — from the same `LORE_BANDS` table these read.)
 *
 * The retrieval itself is unchanged — candidates already carry
 * `source: 'worldLore' | 'characterLore'`, so each of these is the same scan
 * with one filter, not a second implementation to keep in step.
 *
 * `scanDepth` stays: how far back the conversation is read is a property of the
 * conversation, not of any entry. `useRegex`, `caseSensitive` and
 * `recursionDepth` do not — they describe how an *entry* matches, and the entry
 * is what somebody is looking at when they want to change that. What the node
 * keeps is `maxRecursionDepth`, a ceiling over whatever entries ask for.
 *
 * `lorebook-triggers@1` kept its own copies of all three for as long as nothing
 * read any of them; they are gone from it now, and its ceiling is spelled
 * `maxRecursionDepth` like this one. The two declarations stay separate — they
 * overlap in field names and nothing else — but they no longer disagree about
 * which controls a lore node owns.
 */
/**
 * ⚠ **`retrievalMode` was declared here and is gone (migration 0203).**
 *
 * It named which mechanism might surface an entry that had not decided for itself —
 * `rag`, `keyword` or `both` — and it was declared twice, on `loreSlots` and on
 * `vector-search`, so that the two mechanisms could not disagree about the same entry.
 *
 * It went because the question stopped having an answer. The mechanisms
 * **contribute additively to one score** rather than routing exclusively, so
 * `rag` and `both` had already collapsed into the same behaviour, and the third
 * value was a way to switch a mechanism off in bulk that nobody should have to
 * reach for: every mechanism this app has runs by default, and one it cannot run
 * subtracts a signal and reports that it did. The receipt says so in words —
 * *"Vector search: no embedding model is loaded and validated"*, *"Entity links:
 * nothing was embedded"* — which is what a person can act on, where a picker
 * defaulted to a mode was a control that mostly described the install rather
 * than a preference.
 *
 * ⚠ **The per-entry `retrievalStrategy` column went too, one migration later.**
 * This comment used to say it was untouched and stayed, on the argument that it
 * held choices real authors had made. It held none: there was no editor control
 * for it in any released build, no importer set it and no seed set it, so every
 * row was NULL and resolved to `rag`. Migration **0204** dropped it, and the
 * last exclusive routing in the retrieval path went with it — a `keyword` entry
 * had stayed out of the vector mechanism with a model loaded and a cosine of 1, which
 * is this same shape one scope down.
 *
 * Do not reintroduce either of them under another name. A mechanism that can be
 * routed away from is a mechanism that can take a candidate with it, and that is
 * the one thing the governing rule forbids.
 *
 * If per-entry mechanism preference is wanted, it is a **weight**, not a gate:
 * the mechanism-weight axis (keyword / semantic / name) already exists at
 * pipeline scope, and the same concept at entry scope subtracts a signal's
 * contribution while leaving the candidate in the pool — where every other
 * mechanism can still find it and the receipt can still explain it.
 */

/**
 * The seven lore knobs, declared once and worn by all three lore lanes —
 * every one of them **`shared`** (R-7 P2, ruled 2026-09-15; the marker
 * 2026-09-16, see `FieldDecl.shared`): a spec wires the three lanes' `params`
 * to ONE node — core's `respond` puts them on `gather.worldLore.read` and the
 * other two lanes read that slot through `slot.params({ node })` — so a person
 * tuning them tunes them once, for world lore, character lore and history
 * together. The wording below says so: it is the owner's label a panel shows,
 * and an owner labelled "world lore" while governing three sources was the
 * lie the U3 review found.
 *
 * The lane's own intent (`bandIntentFields` above) sits beside them in the
 * same slot, UNMARKED: through the same reference a lane's share is the
 * lane's, resolved at its own address, and rendered on its own step.
 */
const loreScanFields = () => ({
	/**
	 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value every scan
	 * has actually run on. This said 3 for as long as the three lore
	 * lanes shipped without a wired `params` slot, so the number was
	 * never handed to anything and the two could not be seen to
	 * disagree.
	 *
	 * Round-sized on purpose. A group session with five characters
	 * takes five messages to come back round, so a depth of 3 cannot
	 * see the turn it belongs to: the window has already slid past
	 * where the round began. Scan depth has to be at least a round,
	 * and a round grows with the cast.
	 */
	scanDepth: {
		type: 'integer' as const,
		default: 10,
		quick: true,
		shared: true,
		label: { en: 'Messages scanned for lore triggers' },
		description:
			'How many recent messages are scanned for lore triggers in the conversation. One setting for the three lore lanes — it applies to world lore, character lore and history. An entry is not reached through its links to other entries.',
	},
	/**
	 * Beside `scanDepth` because the pair is only legible together:
	 * one is how far back a key may fire from, the other is how much
	 * conversation counts as the present moment. See
	 * `GUARANTEED_MESSAGES`.
	 */
	guaranteedMessages: { ...GUARANTEED_MESSAGES, shared: true },
	maxRecursionDepth: {
		type: 'integer' as const,
		default: 0,
		shared: true,
		label: { en: 'Follow keyword chains this deep' },
		description:
			'A ceiling on how far entries may trigger further entries via keywords found in their text, however deep an individual entry asks to go. It never follows links between entries.',
	},
	/**
	 * Declared on all three lanes, held by one: since R-7 P2 a spec
	 * names ONE owner for the seven knobs and the other lanes read the
	 * owner's slot, so this is one row governing world lore, character
	 * lore and history alike — not one row per lane. World lore
	 * without keys is the case it exists for; the other two sources
	 * take the same answer. A per-source answer is a weight, and
	 * weights live on the source (`bandIntentFields`), not here.
	 */
	admitThreshold: { ...ADMIT_THRESHOLD, shared: true },
	/**
	 * One row for the three lanes, like `admitThreshold`: the owner's
	 * value reaches world lore, where entry lengths differ most,
	 * character lore, already narrowed to whoever is speaking, and
	 * dated history — which has no title at all, so the value reaches
	 * it and moves nothing. That is the honest state rather than a
	 * fourth declaration.
	 */
	lexicalScoring: { ...LEXICAL_SCORING, shared: true },
	trigramFolding: { ...TRIGRAM_FOLDING, shared: true },
	titleWeight: { ...TITLE_WEIGHT, shared: true },
})

const loreSlots = (band: { label: string; noun: string }, defaults: { share: number; maxEntries: number }) => ({
	params: {
		kind: 'parameters' as const,
		facet: 'weights' as const,
		schema: {
			// The lane's own intent first: `share` is the knob a person
			// reaches for, and on a lane that reads the scan knobs through
			// the owner it is all the panel shows.
			...bandIntentFields(band, defaults),
			...loreScanFields(),
		},
	},
})

/** @experimental */
export const worldLore = pin(
	describeQueryDefinition({
		id: 'core:query/world-lore@1',
		/** The band this lane publishes — a top-level template name (typed templates P2). */
		bands: { worldLore: varWorldLore },
		i18n: { name: { en: 'World lore' } },
		timeoutMs: 2000,
		/**
		 * A chat with no world lore is an ordinary chat, so nothing downstream
		 * needs this to have produced anything — which is also what makes it
		 * safe to switch off entirely. The template guards the block and the
		 * ranker simply has one fewer source.
		 */
		optional: true,
		slots: loreSlots(LORE_BANDS.worldLore.band, LORE_BANDS.worldLore.defaults),
		ports: {
			// No `text` in-port — see `lorebookTriggers`: the scan reads its
			// window through `scope` (culled 2026-09-16, R-12).
			in: { scope: S.sessionScope },
			// Both open with a band-intent element — this lane's own — ahead
			// of the items; readers call `splitCandidates()`.
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

/** @experimental */
export const characterLore = pin(
	describeQueryDefinition({
		id: 'core:query/character-lore@1',
		/** The band this lane publishes — a top-level template name (typed templates P2). */
		bands: { characterLore: varCharacterLore },
		i18n: { name: { en: 'Character lore' } },
		timeoutMs: 2000,
		/** As `worldLore`: absent is a normal state, so off is a safe state. */
		optional: true,
		slots: loreSlots(LORE_BANDS.characterLore.band, LORE_BANDS.characterLore.defaults),
		ports: {
			// No `text` in-port — see `lorebookTriggers`: the scan reads its
			// window through `scope` (culled 2026-09-16, R-12).
			in: {
				scope: S.sessionScope,
				/**
				 * **Whose private lore this read is for** — a participant
				 * reference (`character:<id>`), additive, 2026-09-17 (W1).
				 *
				 * Character-lore visibility is decided at the host read against
				 * ONE subject, and until this port existed that subject was the
				 * run's scope — so every voice of a multi-agent turn was handed
				 * every character's private lore, because one gather ran once for
				 * all of them. Wired inside a repeating clause
				 * (`speaker: $.voices.item.context.speaker`) it names the speaker
				 * THIS iteration is writing as, and the host applies the same
				 * binding-visibility gate for that character instead of the
				 * scope's.
				 *
				 * Unwired, absent, or a reference naming nobody the host can
				 * resolve to a character row, the scope decides exactly as it
				 * always did — including `null`, which is the omniscient
				 * narrator's read. A reference is never *widened* here: the port
				 * chooses whose secrets are readable, never whether the gate runs.
				 */
				speaker: S.participantRef,
			},
			// Both open with a band-intent element — this lane's own — ahead
			// of the items; readers call `splitCandidates()`.
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

/**
 * Dated summaries of earlier events.
 *
 * ⚠ **This lane did not exist between spec 1.8.0 and 1.10.0, and history was
 * silently absent from every prompt in that window.**
 *
 * `lorebook-triggers@1` returned all three sources through one port. Splitting
 * world and character lore into two nodes replaced it with two lanes that each
 * filter the shared scan to their own `source` — and nothing filtered for
 * `history`, so those candidates were built, scored, and then dropped on the
 * floor. Nothing failed: the ranker kept a `history` band, `assemble` kept
 * asking for history blocks, and both got nothing.
 *
 * The parity corpus stayed green throughout because its harness renders through
 * `lorebook-triggers@1` rather than the shipped document — the exact divergence
 * a comment in that file warns about. The corpus mirrors the three lanes now.
 *
 * Same retrieval as its two siblings: one scan, one filter.
 * @experimental
 */
export const historyEntries = pin(
	describeQueryDefinition({
		id: 'core:query/history-entries@1',
		/** The band this lane publishes — a top-level template name (typed templates P2). */
		bands: { history: varHistory },
		i18n: { name: { en: 'History entries' } },
		timeoutMs: 2000,
		/** As the lore queries: a chat with no history is an ordinary chat. */
		optional: true,
		// 0.1666, not 0.1667 — see `LORE_BANDS`.
		slots: loreSlots(LORE_BANDS.history.band, LORE_BANDS.history.defaults),
		ports: {
			// No `text` in-port — see `lorebookTriggers`: the scan reads its
			// window through `scope` (culled 2026-09-16, R-12).
			in: { scope: S.sessionScope },
			// Both open with a band-intent element — this lane's own — ahead
			// of the items; readers call `splitCandidates()`.
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

/** @experimental */
export const vectorSearch = pin(
	describeQueryDefinition({
		id: 'core:query/vector-search@1',
		i18n: { name: { en: 'Semantic search' } },
		timeoutMs: 3000,
		/**
		 * A session whose install has no embedding model is an ordinary
		 * session, so producing nothing is a normal outcome and the mechanism can be
		 * switched off entirely — exactly as the lore queries and the entity
		 * mechanism are.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ **0 is off, and is the shipped default** — the
					 * convention `maxRecursionDepth`, `admitThreshold` and
					 * `entity-search`'s own caps use, for their reason: this
					 * changes what reaches the model, so it is turned on rather
					 * than arrived at on upgrade.
					 *
					 * A **cap on what this mechanism contributes**, not a cap on what
					 * it looks at — `topK` is that, one field down. The two are
					 * different questions and only this one decides whether the
					 * mechanism is running at all.
					 */
					maxEntries: {
						type: 'integer',
						default: 0,
						min: 0,
						quick: true,
						label: { en: 'Entries found by meaning' },
						description:
							'How many lorebook entries this may bring in for being about what the conversation is about, rather than for matching a keyword. Needs an embedding model; 0 turns the whole arm off, try 5. A pipeline that ranks this arm separately reads its per-query lists instead, which this does not cut.',
					},
					/**
					 * ⚠ **40, and it was 12.** The number never reached the
					 * host: the binding read `input?.topK` — an *in-port* name
					 * this node does not declare — and fell through to a
					 * literal `?? 40` on every run since the mechanism was
					 * written. So 40 is the value every install has actually
					 * been searching at, and 12 is a number that was rendered,
					 * validated, saved and resolved through the whole scope
					 * chain without ever being handed to anything.
					 *
					 * Defaulted to the effective behaviour rather than to the
					 * declared one on purpose. Wiring a control is not a licence
					 * to re-tune every install that never touched it: the fix is
					 * that the number now *means* something, and it means what
					 * it has been doing.
					 *
					 * A cap on what each query *looks at*, which is a different
					 * question from `maxEntries` one field up — that one caps
					 * what the mechanism *contributes*. Raising this widens the
					 * pool the ranker's other signals get to score; raising
					 * `maxEntries` is what decides whether the mechanism runs at
					 * all.
					 */
					topK: {
						type: 'integer',
						default: 40,
						min: 1,
						label: { en: 'Closest matches per query' },
						description:
							'How many of the closest matches each retrieval query returns. A wider pool for the ranker to score, not a cap on what this arm contributes.',
					},
					/**
					 * How sharply a weak resemblance is discounted — and
					 * emphatically **not** a minimum.
					 *
					 * ⚠ **This replaced `minScore: 0.35`, and the replacement is
					 * a ruling rather than a rename.** A minimum similarity
					 * removes a row from the pool outright, and a row that is not
					 * in the pool can no longer be found by keyword, by name or
					 * by proximity either — one mechanism's opinion silently
					 * disabling four others. The governing rule is that a weak or
					 * unavailable mechanism *subtracts a signal* and never
					 * removes a candidate, so the cutoff could not stay whatever
					 * number it was set to. (It was never read either; nothing
					 * anywhere consumed `minScore`.)
					 *
					 * What replaces it shapes the **contribution** instead:
					 *
					 *     semantic = cos ** similarityFalloff
					 *
					 * 1 is the raw cosine and is the off position. Above 1 the
					 * curve is convex, fixed at both ends (0→0, 1→1), so a
					 * near-miss loses most of its contribution while a strong
					 * match keeps nearly all of its own — and the row stays in
					 * the pool at every value, which is the whole point.
					 *
					 * ⚠ **Chosen as a shape because a threshold is not
					 * portable.** Cosine distributions are not comparable across
					 * embedding models: one model puts unrelated text at 0.1 and
					 * another at 0.6, so `0.35` means "almost everything" on the
					 * first and "almost nothing" on the second, and an install
					 * that swaps models silently changes what its lorebook
					 * retrieves. An exponent has no cliff to move. It is
					 * strictly monotonic, so it can never reorder this
					 * mechanism's own hits or turn one off — it only decides how
					 * much the semantic signal is allowed to outweigh a keyword
					 * that actually fired.
					 */
					similarityFalloff: {
						type: 'number',
						default: 1,
						min: 1,
						max: 8,
						label: { en: 'Discount weak matches' },
						description:
							'How sharply a loose resemblance counts for less than a close one. 1 takes the similarity as it comes; higher pushes vague matches down without ever removing them, so they can still be found by a keyword or a name.',
					},
				},
			},
		},
		ports: {
			in: {
				/**
				 * Several query vectors, one ranked list each — a list, so
				 * `json@1` (was `vector@1` until 2026-09-17, U5d review W9):
				 * what `embed-text@1`'s `vectors` publishes and what the
				 * host's search reads.
				 */
				vectors: S.json,
				scope: S.sessionScope,
			},
			out: {
				main: S.candidates,
				hits: S.candidates,
				/** One ranked list per query vector, in the order they were given. */
				lists: S.json,
				/**
				 * `cos(i, j)` over `hits`, by index. What MMR needs, without any
				 * embedding leaving the host.
				 */
				similarity: S.json,
			},
		},
	}),
)

/**
 * The third mechanism — retrieval by the names a scene is using.
 *
 * The keyword mechanism matches an author's written keys against a window; the vector
 * mechanism matches an embedding. This one matches **entities**: the characters,
 * places and things the recent conversation named, against the same entities
 * found in every lorebook entry and every earlier message. A peer of the other
 * two rather than a signal inside one, because it queries a different index and
 * ranks on a different question.
 *
 * Three things follow, and they are why it exists:
 *
 *  1. **It is how a book with no keywords works.** An entry nobody indexed is
 *     reached because the scene is naming the same people it names. The
 *     `admitThreshold` control on the lore nodes does this *inside* the keyword
 *     scan; this does it as a source of candidates in its own right.
 *  2. **It searches the transcript**, which nothing else does. The keyword scan
 *     reads only a bounded recent window and the semantic mechanism is not wired into
 *     the shipped pipeline, so retrieving an *older message* by what it was
 *     about has not been possible until now.
 *  3. **It needs no embedding model.** Names are matched, not encoded, so this
 *     is available on every install rather than only on the ones with a model
 *     loaded.
 *
 * It reads annotations written in the background, so it is cheap per turn: the
 * work of finding names in a lorebook happens when the lorebook is written, not
 * when a turn is taken.
 * @experimental
 */
export const entitySearch = pin(
	describeQueryDefinition({
		id: 'core:query/entity-search@1',
		i18n: { name: { en: 'Entity search' } },
		/**
		 * Recalled lines are their own declared band (owner ruling
		 * 2026-09-27, option b): a template places them as
		 * `{{{recalledLines}}}`, per genre, and nothing places them
		 * automatically. Carried on `messages` alone (`bandPorts`), so a spec
		 * wiring only `main` — every shipped one — does not offer a name that
		 * can never fill.
		 */
		bands: { recalledLines: varRecalledLines },
		bandPorts: { recalledLines: ['messages'] },
		timeoutMs: 2000,
		/**
		 * Off by default, so a session with nothing to find is a normal session
		 * and the mechanism can be switched off entirely without anything downstream
		 * noticing — exactly as the two lore queries are.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ **0 is off, and is the shipped default** — the
					 * convention `maxRecursionDepth` and `admitThreshold` use,
					 * and for the same reason: this changes what reaches the
					 * model, so it is turned on rather than arrived at on
					 * upgrade.
					 */
					maxEntries: {
						type: 'integer',
						default: 0,
						min: 0,
						quick: true,
						label: { en: 'Entries found by name' },
						description:
							'How many lorebook entries this may bring in because the conversation is naming the same people, places and things they do. 0 turns it off; try 5.',
					},
					/**
					 * Separate from `maxEntries`, because the two answer
					 * different questions and only one of them has somewhere to
					 * go today.
					 */
					maxMessages: {
						type: 'integer',
						default: 0,
						min: 0,
						label: { en: 'Earlier messages found by name' },
						description:
							"How many earlier messages this may return, as recalled lines, for naming what the scene is naming. They reach the prompt only where a pipeline ranks them and its context template places {{{recalledLines}}} — the shipped pipelines do neither yet — so this is off by default.",
					},
					/**
					 * The recalled lines' **share** — a band-namespaced field
					 * (§7), because this definition publishes lore on `main`
					 * and its own band on `messages`. Published as the band's
					 * intent at the head of `messages` whenever `maxMessages`
					 * turns the half on; the cap is `maxMessages`, which
					 * already says it. The default is one lore lane's.
					 */
					recalledLinesShare: {
						type: 'number',
						min: 0,
						default: 0.1667,
						label: { en: 'Share — recalled lines' },
						description: {
							en: 'How much of the context window recalled lines may take, relative to every other source. The ranker normalises the shares it is handed; set this to zero to leave recalled lines out.',
						},
					},
					scanDepth: {
						type: 'integer',
						default: 10,
						label: { en: 'Messages read for names' },
						description:
							'How many recent messages are read to decide what the scene is currently about.',
					},
					/**
					 * The mechanism's strength, and it is declared rather than
					 * constant because the graded overlap *compresses* what it
					 * measures: one strongly-shared name saturates around 0.63
					 * and two around 0.86, so a weight sized for a 0/1 signal
					 * would leave the improvement invisible.
					 *
					 * The default is deliberately the keyword weight: one thing
					 * the conversation is naming that not every entry names is
					 * worth about as much as one of an entry's own keys firing,
					 * and the saturation then keeps it strictly below a full
					 * keyword match — so authored keys still win, and this only
					 * ever adds.
					 */
					entityWeight: {
						type: 'number',
						default: 0.35,
						min: 0,
						max: 1,
						label: { en: 'Strength' },
						description:
							'How much weight a shared name carries against the other ways an entry can be found. 0 leaves the arm finding things and ranking them last.',
					},
				},
			},
		},
		ports: {
			/**
			 * ⚠ **No `text` in-port.** The four lore queries declared one that
			 * nothing filled and nothing read — `loreFor` derives its window
			 * from `scope` — and this declaration refused to ship a fifth with
			 * the same standing excuse written for it. Theirs are culled now
			 * (2026-09-16, R-12); the window comes from `scope`, which is where
			 * it actually comes from.
			 */
			in: { scope: S.sessionScope },
			out: {
				main: S.candidates,
				hits: S.candidates,
				/**
				 * Earlier messages, as candidates in the declared
				 * **`recalledLines`** band, headed by that band's intent
				 * (2026-09-27; they sat in the transcript's `messages` band
				 * before, budgeted and rendered nowhere).
				 *
				 * A port of its own rather than part of `main`, because the two
				 * are budgeted separately and a pipeline that wants lore found
				 * by name almost certainly does not want its context window
				 * spent on retrieved transcript by accident.
				 */
				messages: S.candidates,
			},
		},
	}),
)

/**
 * Documentation search — the guide genre's one retrieval mechanism (plans/29
 * R-18; built 2026-09-16 as U5g).
 *
 * The app compiles its docs — its own guides and the SDK's — into a section
 * index at build time (title, anchor, body text per heading). This reads the
 * person's most recent messages, ranks every section against them, and
 * publishes the relevant ones as candidates in its own declared band,
 * **`docsExcerpts`** (2026-09-27; it borrowed `worldLore` before) — so the
 * ranker budgets them and a template places them as `{{{docsExcerpts}}}`,
 * framed as the app's manual rather than as a story's lore, with an `{{else}}`
 * for the turn nothing matched. Each excerpt starts with its page's path.
 *
 * A question the docs do not cover publishes the band's intent and nothing
 * else — on purpose: an empty band is what lets the prompt say "nothing in the
 * docs matched" instead of handing a model loosely related text to extrapolate
 * from.
 *
 * `optional`, and it degrades to nothing: an install whose docs were never
 * compiled (a fresh checkout, `npm test`) publishes an empty band with its
 * intent, and the turn loses excerpts rather than failing.
 * @internal
 */
export const docsSearch = pin(
	describeQueryDefinition({
		id: 'core:query/docs-search@1',
		i18n: {
			name: { en: 'Docs search' },
			description: {
				en: "Finds the documentation sections that answer the person's latest question, so the guide can ground its answer in them — and finds none when the docs do not cover it.",
			},
		},
		/** Its own band, a top-level template name (typed templates P2). */
		bands: { docsExcerpts: varDocsExcerpts },
		timeoutMs: 2000,
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					...bandIntentFields(
						{ label: 'documentation', noun: 'documentation excerpts' },
						{ share: 0.25, maxEntries: 6 },
					),
					scanDepth: {
						type: 'integer',
						min: 1,
						default: 4,
						quick: true,
						label: { en: 'Messages searched' },
						description: {
							en: "How many of the most recent messages are read for the person's questions. Only their own messages are searched, never the guide's replies, and the newest counts most.",
						},
					},
				},
			},
		},
		ports: {
			// The scope, like the lore lanes: the newest rows are read through
			// the host's one message seam (hidden and generating rows excluded
			// there), so this can sit beside `history` in a parallel gather
			// rather than after it.
			in: { scope: S.sessionScope },
			out: { main: S.candidates, candidates: S.candidates },
		},
	}),
)

/**
 * The mention detector — the query half of the entity-vector space.
 *
 * What the current scene refers to by **describing** it rather than by naming
 * it: *"the captain"*, *"the order"*, *"that bridge"*. Nothing in the lexical
 * stack can see these — no key matches them, no trigram folds them onto a
 * title, and the gazetteer has nothing to look up — and they are, as the plan
 * puts it, the references people actually write.
 *
 * A Query and not a Task, because the answer depends on the world's own
 * vocabulary: a description that turns out to be an authored lower-case name
 * (*"the ashguard"*) is dropped here, since the exact matcher owns it.
 * @experimental
 */
export const mentionSpans = pin(
	describeQueryDefinition({
		id: 'core:query/mention-spans@1',
		i18n: { name: { en: 'Descriptive mentions' } },
		timeoutMs: 1000,
		/**
		 * Producing nothing is the ordinary outcome — most windows describe
		 * nothing — and an install that has not switched the mechanism on must not
		 * be able to lose a turn to it.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ **0 is off, and is the shipped default** — the
					 * `maxRecursionDepth` / `admitThreshold` convention.
					 *
					 * **This is the entity-vector mechanism's one switch**, and it is
					 * on the first node of the chain on purpose: switched off,
					 * this returns before reading anything, `embed-text` is
					 * handed no texts and makes no model call, and `entity-link`
					 * returns before its own read. The mechanism costs literally
					 * nothing until somebody asks for it — not a message read,
					 * not an embedding.
					 *
					 * `entity-link.maxLinks` is therefore a ceiling rather than
					 * a second switch and ships non-zero: a feature whose two
					 * controls both default to off is one where turning the
					 * first one up appears to do nothing.
					 */
					maxMentions: {
						type: 'integer',
						default: 0,
						min: 0,
						quick: true,
						label: { en: 'Descriptions to follow up' },
						description:
							'How many descriptive references in the recent messages — "the captain", "the order" — are matched against what your entries are called, for entries no keyword reached. Needs an embedding model; 0 turns the whole arm off, try 4.',
					},
					scanDepth: {
						type: 'integer',
						default: 10,
						label: { en: 'Messages read for descriptions' },
						description:
							'How many recent messages are read for descriptions. A description points at what is being discussed now, so this is deliberately short.',
					},
				},
			},
		},
		ports: {
			/** The window comes from `scope`, like the entity mechanism's. */
			in: { scope: S.sessionScope },
			out: {
				main: S.json,
				/** The mentions with their offsets, for a receipt to point at. */
				mentions: S.json,
				/** The same strings in the same order, for the embed Provider. */
				texts: S.json,
			},
		},
	}),
)

/**
 * The entity-vector mechanism — mention → name linking.
 *
 * A second named vector space holding **one vector per name** rather than one
 * per entry: an entry's title, the aliases its body declares, and for a
 * character-anchored entry the bound character's names. Queried with the
 * descriptions `core:query/mention-spans@1` found, so *"the captain"* reaches
 * Captain Vell and *"the order"* reaches The Ashguard Riders.
 *
 * ## A separate space, not a second use of the content vectors
 *
 * Different text at different lengths means different similarity
 * distributions, so a cutoff tuned for two-word names is wrong for
 * two-hundred-word passages. The two want different weights, because *"is
 * called that"* and *"is about that"* are different evidence. And they
 * invalidate independently — renaming re-embeds the names and not the content;
 * rewriting the body re-embeds the content and not the names. Comparing a short
 * string to a short string is also what embeddings are most reliable at, where
 * a two-word mention against a whole-entry vector is a granularity mismatch.
 *
 * ## ⚠ It may only reorder. It may never admit.
 *
 * The pool is the `candidates` in-port, and this returns that same list with a
 * signal attached to whatever linked. There is no id it can emit that some
 * other mechanism did not already produce, and that is a wiring guarantee
 * rather than a promise in a comment.
 *
 * It matters because invented proper nouns are where embeddings are least
 * reliable: "Vell" has no learned meaning, so its vector is assembled from
 * subword fragments and Vell, Vall and Vela cluster. A confident wrong link is
 * worse than a miss — it would inject wrong lore at high confidence into a
 * fixed budget, displacing right lore. Constrained to reordering, the same
 * wrong link costs a position and a line in the receipt naming it.
 *
 * So: exact and trigram matching own invented names; entity vectors own
 * descriptive references.
 *
 * ## No threshold, anywhere
 *
 * Links rank, they do not gate. What bounds this is a **count**, over links
 * ordered by match quality — never a similarity cutoff, because *"is 0.62 a
 * match"* has no answer that survives changing the encoder, and a number that
 * needs per-corpus calibration is a number nobody can set.
 * @experimental
 */
export const entityLink = pin(
	describeQueryDefinition({
		id: 'core:query/entity-link@1',
		i18n: { name: { en: 'Entries called by a description' } },
		/**
		 * `embed-text`'s budget rather than `vector-search`'s, because this node
		 * can *embed*: it brings a bounded slice of the name index up to date
		 * before it reads. Being cut short costs the remainder of that pass and
		 * nothing else — each entry is written before the next is embedded, so
		 * progress survives and the mechanism links whatever is already indexed.
		 */
		timeoutMs: 5000,
		/**
		 * Empty from this node means *the ranker sees the candidate list
		 * unchanged*, never *the ranker sees nothing*: it is wired as the first
		 * source of a concatenation whose second source is the unenriched list.
		 * So every way it can produce nothing — off, no model, an error the
		 * executor recovered as empty — lands on exactly what the ranker would
		 * have seen without it.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * A **ceiling, not the mechanism's switch** — see
					 * `mention-spans.maxMentions`, which is. Non-zero so that
					 * turning the mechanism on with one control does something.
					 */
					maxLinks: {
						type: 'integer',
						default: 5,
						min: 0,
						label: { en: 'Most entries linked' },
						description:
							'A ceiling on how many entries one turn may have matched to a description. The best matches are kept; this never brings in an entry nothing else found, it only changes where one comes in the order.',
					},
				},
			},
		},
		ports: {
			in: {
				scope: S.sessionScope,
				/**
				 * ⚠ **The pool, and the reason this mechanism cannot admit.** It
				 * scores what arrives here and returns it; an entry no other
				 * mechanism produced is not in this list and therefore cannot
				 * be in the output.
				 */
				candidates: S.candidates,
				/** The descriptions, from `core:query/mention-spans@1`. */
				mentions: S.json,
				/** Their embeddings, in the same order. Index alignment is the contract. */
				vectors: S.json,
			},
			out: {
				main: S.candidates,
				candidates: S.candidates,
				/** Each link as text — *matched "the captain" → Captain Vell*. */
				links: S.json,
			},
		},
	}),
)

/** Illegal by construction elsewhere; used to prove the purity probe. @internal */
export const network = pin(
	describeQueryDefinition({
		id: 'test:query/network@1',
		timeoutMs: 1000,
		ports: { out: { main: S.json } },
	}),
)

// ── Tasks ───────────────────────────────────────────────────────────────────

/** @public */
export const contextBudget = pin(
	describeTaskDefinition({
		id: 'core:task/context-budget@1',
		timeoutMs: 500,
		slots: {
			/**
			 * Where the window comes from.
			 *
			 * The context window belongs to the sampling config, never to a knob
			 * on a node (17 §1a) — and the executor resolves a `sampling` slot to
			 * the config's switched-on *values*, so this stays a pure Task reading
			 * data it was handed rather than a Query looking one up.
			 *
			 * ⚠ Point this at the same config the generating step uses. A budget
			 * computed against one window and a prompt sent against another is
			 * wrong in the direction that truncates, silently.
			 */
			sampling: { kind: 'sampling', quick: true },
			/**
			 * The connection the reply is sent on — for the model's own
			 * context window (0114), which caps the sampling config's when
			 * the model states one.
			 *
			 * Shared with the generating step in every shipped spec
			 * (`slot.connectionOf('generate')`), on the same terms as
			 * `sampling` above: the budget has to be sized to the window the
			 * request is actually sent against, and the ONE computation of
			 * that window (R-8) reads both halves off the same resolved pair.
			 */
			connection: { kind: 'connection' },
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * ⚠ There is no `reserveForReply` here, and there was: an
					 * integer defaulting to 512, sitting beside the sampling
					 * config's own `responseTokens` that also defaults to 512. The same mistake as the ranker's `budget: 4096` —
					 * re-entering a number the system already knows, free to
					 * drift from the model actually being called and warning
					 * nobody when it did. Context in, response out: the reserve
					 * *is* the response allowance, so it is read, not typed.
					 */
					safetyMargin: {
						type: 'number',
						default: 0.05,
						description:
							'Fraction of the window kept free as a buffer against token-count drift.',
					},
				},
			},
		},
		ports: { out: { main: S.budget, available: S.budget } },
	}),
)

/**
 * Fuse two mechanisms that answered the same question into one ordering.
 *
 * Reciprocal-rank fusion, and it is only fusion when the inputs *overlap* —
 * the keyword mechanism and the vector mechanism ranking the same pool, so an entry both
 * found outranks one either found alone. Handed several **disjoint** lists it
 * degrades into concatenation with a fabricated score: every item is unique, so
 * its fused score collapses to its position in its own list, and the
 * `presetScore` stamped on the way out then overrides every signal weight
 * downstream. That is what `core:task/concat-candidates@1` is for, and the
 * binding says so on the receipt when it sees it.
 *
 * ⚠ This declared `strategy` (auto/vector/keyword/hybrid) and `dedup`, and the
 * binding read neither. `strategy` was the 0.5 engine choice, which pipelines
 * replaced with wiring — the mechanisms a run uses are the nodes it has — and `dedup`
 * described what rank fusion does unconditionally, since fusion is keyed by
 * `source:id`. Two controls that rendered, validated and stored a value nothing
 * would ever read; removed rather than wired, because there is no behaviour
 * behind either one to turn on.
 * @public
 */
export const mergeCandidates = pin(
	describeTaskDefinition({
		id: 'core:task/merge-candidates@1',
		timeoutMs: 500,
		ports: {
			in: { sources: S.candidates },
			out: {
				// Both open with the band-intent elements the sources carried
				// (lifted out before the fusion, put back after — a fused rank
				// is never stamped on one); readers call `splitCandidates()`.
				main: S.candidates,
				candidates: S.candidates,
				/** What fused with what — and a complaint when nothing did. */
				diagnostics: S.json,
			},
		},
	}),
)

/**
 * Put several candidate lists end to end, in the order they were wired.
 *
 * The counterpart to `core:task/merge-candidates@1`, and the distinction is not
 * cosmetic: **concatenation is not fusion**. Lore lanes are disjoint by
 * construction — a world-lore entry is never also a history entry — so there is
 * no agreement between them to measure and nothing to fuse. Passing them
 * through the merge stamped a reciprocal-rank `presetScore` on every candidate,
 * which `select` prefers over the weighted signal sum, so each entry was ranked
 * by its position in its own list and every signal weight was inert.
 *
 * This node deliberately stamps **no score at all**. Ranking is the ranker's
 * job: `core:task/rank-hybrid@1` scores each candidate from its signals against
 * its source's weights, and budgets across sources with the share bands — which
 * is what the bands are for. Order within a source is preserved so a producer's
 * own ordering survives to the tie-break.
 *
 * Repeats are dropped, first occurrence winning, keyed `source:id` the way
 * every other candidate set in the ranker is: the same entry arriving from two
 * lanes should occupy one slot, and the earlier lane is the one the author
 * wired first.
 * @public
 */
export const concatCandidates = pin(
	describeTaskDefinition({
		id: 'core:task/concat-candidates@1',
		i18n: { name: { en: 'Combine candidates' } },
		timeoutMs: 500,
		ports: {
			in: { sources: S.candidates },
			out: {
				// Both open with band-intent elements — the first per band
				// across every source, hoisted ahead of the items; readers
				// call `splitCandidates()`.
				main: S.candidates,
				candidates: S.candidates,
				/** How many arrived per list, and how many repeats were dropped. */
				diagnostics: S.json,
			},
		},
	}),
)

const rankPorts = {
	in: { candidates: S.candidates, budget: S.budget },
	out: {
		main: S.candidates,
		candidates: S.candidates,
		/**
		 * The per-candidate trail: score, included, reason, and the signal
		 * breakdown behind it.
		 *
		 * A declared out-port rather than an implementation detail, because it is
		 * what Assemble allocates from — and because a ranker swapped in by a
		 * plugin has to produce it too, or the budget panel goes blank the moment
		 * anyone changes rankers (16 §5c).
		 *
		 * Shape `S.decisions` (R64): a node publishing it is recorded in the
		 * ranking store automatically — a plugin's ranker included.
		 */
		decisions: S.decisions,
	},
}

/**
 * The five core bands a context is built from — the members of the ranker's
 * **signal** matrix, which is cross-source and stays here.
 *
 * ⚠ No longer the members of `share` / `maxEntries` / `minEntries`: those are
 * per-source and live on the sources (R-7 P5, `bandIntentFields`), so a plugin
 * adding a sixth band declares its own intent on its own definition and never
 * touches this list. Its candidates score by `presetScore` or by the ranker's
 * lore signal set — a per-band signal row for a plugin band is a follow-up,
 * not something this list can grant. `weights.ts` calls this `RetrievalBand`,
 * and the two must agree — the binding maps straight onto it.
 */
const SOURCES = [
	{
		key: 'messages',
		label: { en: 'Conversation' },
		description: { en: 'The chat itself — what was actually said.' },
		tone: 0,
	},
	{
		key: 'worldLore',
		label: { en: 'World lore' },
		description: { en: 'Lorebook entries about the world.' },
		tone: 1,
	},
	{
		key: 'characterLore',
		label: { en: 'Character lore' },
		description: { en: 'Lorebook entries bound to a character.' },
		tone: 2,
	},
	{
		key: 'history',
		label: { en: 'History entries' },
		description: { en: 'Dated entries recording earlier events.' },
		tone: 3,
	},
	{
		key: 'relationships',
		label: { en: 'Relationships' },
		description: { en: 'The narrative graph. Off by default.' },
		tone: 4,
	},
] as const

/**
 * How the shares the sources declared are turned into token budgets — the one
 * thing about shares that is genuinely the ranker's (16 §5a: Assemble "keeps
 * only what is genuinely global: total budget, truncation policy, and how
 * weights normalize").
 *
 * `relative` is what ships and is arithmetically what has always run: every
 * band with a share above zero gets `pool × share / Σ shares`, so only the
 * ratios matter and a source added or removed re-divides the whole window.
 * `fixed` reads each share as the fraction of the window it says — a source
 * declaring 0.25 gets a quarter whether one other source exists or six — and
 * scales them all down together only when they add up to more than one. In
 * both, whatever a band cannot spend is swept to the others in score order.
 *
 * ⚠ **The per-source maps this file used to declare here are gone** (R-7 P5,
 * 2026-09-16). `share`, `maxEntries` and `minEntries` — five-band maps keyed
 * `{messages, worldLore, characterLore, history, relationships}` — were the
 * per-source table 16 §5a rejected, kept on the ranker rather than on
 * Assemble. Each source declares its own now (`bandIntentFields`) and the
 * ranker reads them off the candidates it is handed (`BandIntent` in the SDK);
 * migration 0135 moved every stored value to the node that owns it. What is
 * left on this node is cross-source only: this, the mechanism and signal
 * weights, and the allocation precedence.
 */
const SHARE_NORMALISATION = {
	type: 'enum' as const,
	of: ['relative', 'fixed'] as const,
	members: [
		{
			key: 'relative',
			label: { en: 'Relative' },
			description: {
				en: "Each source's share is a ratio against the others, so together they always fill the whole window.",
			},
		},
		{
			key: 'fixed',
			label: { en: 'Fixed' },
			description: {
				en: 'Each share is the fraction of the window it states, scaled down only when they add up to more than the whole.',
			},
		},
	],
	default: 'relative' as const,
	label: { en: 'How shares divide the window' },
	description: {
		en: "Whether each source's share is a ratio against the others or the fraction of the window it states.",
	},
} as const

/**
 * The signal weights, transposed for declaration.
 *
 * `weights.ts` holds these as `Record<RetrievalBand, SignalWeights>` — one
 * complete set per source, because scoring reads them that way. The slot
 * system's unit is the *field*, rendered as one per-source control row, so the
 * declaration is the transpose: one `perMember` field per signal, over the same
 * five sources every other ranking control uses. The binding transposes back.
 *
 * ⚠ **The set is not free-standing** — `runtime/signalWiring.test.ts` holds it
 * identical to `keyof SignalWeights` and to what the wired mechanisms actually
 * write, in both directions. Adding a field here without a producer fails, and
 * so does producing a signal without declaring it.
 *
 * Every default reproduces `DEFAULT_SIGNAL_WEIGHTS` exactly — which is what
 * makes declaring them behaviour-preserving. A zero is "does not apply today",
 * not "cannot apply": the scorer has no per-source branches, so turning
 * `nameMatch` on for messages is moving a slider, not asking for a feature.
 *
 * On `rank-hybrid` alone, like its `scripts` hook and for the same reason
 * (S3): the `rank-recall` example ranks without signals, and widening a
 * sibling's declared surface is a hash change on a type nobody meant to touch.
 */
const SIGNAL_WEIGHT_FIELDS = {
	signalKeyword: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.35,
			characterLore: 0.35,
			history: 0.35,
			relationships: 0,
		},
		label: { en: 'Keyword match' },
		description: {
			en: "How much an entry's own trigger keywords appearing in recent messages counts toward its score.",
		},
	},
	signalNameMatch: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.25,
			characterLore: 0.25,
			history: 0,
			relationships: 0,
		},
		label: { en: 'Name mentioned' },
		description: {
			en: "How much a cast member's name appearing in the entry counts when that character is in the scene.",
		},
	},
	/**
	 * Two questions under one name, split by source — bug 16, and it stays split.
	 *
	 * World lore and history ask *how much of what the scene is naming does this
	 * entry name too*; character lore asks *did this entry's own character speak
	 * in the guaranteed window*. A character-lore entry names its own character
	 * by construction, so the first question scores every present character's
	 * private lore alike and distinguishes nothing.
	 *
	 * ⚠ **The world-lore half is graded now, and this weight moved with it**
	 * (design §13.10, retrieval plan phase 3). It used to be a binary substring
	 * test — does the entry's title or keys contain a cast name, `Al` firing on
	 * `Alchemy` — worth exactly `{0, 0.2}`. It is now the rarity-weighted,
	 * word-boundary, two-sided overlap the admission gate already used: what the
	 * conversation named, intersected with what this entry names, weighted so
	 * that a thing every entry mentions counts for nothing.
	 *
	 * That measure **saturates**: about 0.63 for one rare shared entity and 0.86
	 * for two, so at the old 0.2 its live range would have been ~[0.13, 0.17] —
	 * *narrower* than the crude signal it replaces. Grading without re-weighting
	 * makes a signal more correct and less influential at the same time, so the
	 * weight is sized for the measure that is actually running: 0.35, the same
	 * anchor `entity-search`'s own strength uses, which keeps one strongly
	 * shared name worth a little less than an entry whose every key fired.
	 *
	 * Character lore keeps **0.2**. Its measurement did not change, so its
	 * weight must not either.
	 */
	signalEntityCooccurrence: {
		type: 'perMember' as const,
		members: SOURCES,
		default: { messages: 0, worldLore: 0.35, characterLore: 0.2, history: 0, relationships: 0 },
		label: { en: 'Shared entities' },
		description: {
			en: 'How much an entry naming the same people and places as the recent conversation counts. For character lore it asks something else: whether that character has been speaking.',
		},
	},
	/**
	 * How much *being about the same thing* counts, as an embedding measures it.
	 *
	 * The fourth mechanism and the only one that needs a model. It arrives on
	 * candidates the semantic mechanism found — `core:query/vector-search@1`, wired
	 * into the reply pipeline as a sibling of the lore lanes — and it is a
	 * **score component**, not a rival ordering: an entry both the keyword scan
	 * and the semantic mechanism found keeps its keyword signals and gains this one,
	 * so agreement between two independent mechanisms compounds by addition and
	 * there is no fusion step to reconcile two incomparable scales.
	 *
	 * ⚠ **Not zero, and that is deliberate.** The `admitThreshold` convention
	 * says a control that changes what reaches the model ships off — and it does
	 * here, one level up: the mechanism's own cap (`vector-search.maxEntries`) is 0, so
	 * nothing carries this signal until somebody raises it. Making *both* the cap
	 * and the weight zero would mean raising the cap changed nothing, which is
	 * the trap a two-switch feature always sets. One switch, and it is the one
	 * named after what it does.
	 *
	 * Sized below a keyword hit on purpose. A cosine above the mechanism's own
	 * threshold is real evidence and weaker evidence than an authored key
	 * firing: keys still guarantee, meaning still only adds.
	 */
	signalSemantic: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.3,
			characterLore: 0.3,
			history: 0.3,
			relationships: 0,
		},
		label: { en: 'Similar meaning' },
		description: {
			en: 'How much it counts that an entry is about what the conversation is about, even with no shared words. Needs an embedding model and the semantic arm switched on.',
		},
	},
	/**
	 * How much *being called that* counts, as an embedding measures it.
	 *
	 * The fifth mechanism, and the one that catches the reference nothing else
	 * can. It arrives on candidates `core:query/entity-link@1` matched a
	 * **description** in the conversation to one of an entry's **names** —
	 * *"the captain"* → Captain Vell, *"the order"* → The Ashguard Riders.
	 * Neither reference shares a character with its target, so keywords,
	 * trigrams and the gazetteer all miss them.
	 *
	 * ⚠ **Sized to sit strictly below `signalNameMatch`, and that is a rule.**
	 * Invented proper nouns are where embeddings are least reliable — "Vell"
	 * has no learned meaning, so its vector comes from subword fragments and
	 * Vell, Vall and Vela cluster — so exact and trigram matching own invented
	 * names, entity vectors own descriptive references, and a vector link must
	 * never outrank an entry whose title literally occurred. A similarity
	 * cannot exceed 1, so 0.2 against `signalNameMatch`'s 0.25 keeps that true
	 * at every value the mechanism can produce.
	 *
	 * Not zero, for `signalSemantic`'s reason one field up: the mechanism's switch is
	 * `mention-spans.maxMentions` and it is 0, so nothing carries this signal
	 * until somebody raises it. One switch, not two.
	 */
	signalEntityVector: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.2,
			characterLore: 0.2,
			history: 0.2,
			relationships: 0,
		},
		label: { en: 'Called by a description' },
		description: {
			en: 'How much it counts that the conversation described something — "the captain", "the order" — that matches what an entry is called. Needs an embedding model and the description arm switched on. Deliberately weaker than an entry whose name was actually said.',
		},
	},
	signalTfidf: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0.1,
			worldLore: 0.1,
			characterLore: 0.1,
			history: 0.1,
			relationships: 0,
		},
		label: { en: 'Distinctive words' },
		description: {
			en: 'How much rare, distinctive vocabulary shared with the conversation counts — common words prove little.',
		},
	},
	signalLastRefRecency: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.1,
			characterLore: 0.1,
			history: 0.1,
			relationships: 0,
		},
		label: { en: 'Recently referenced' },
		description: {
			en: 'How much an entry the conversation touched a moment ago outranks one it has not mentioned in a while.',
		},
	},
	/**
	 * ⚠ **`signalRecency` and `signalSceneAffinity` were declared here and are
	 * gone (migration 0099).** Neither had a producer — anywhere, ever. No
	 * mechanism wrote `signals.recency` and none wrote `signals.sceneAffinity`,
	 * so both weights multiplied a permanent zero: two controls that rendered,
	 * validated, saved, resolved through the whole scope chain, and could not
	 * move a single prompt at any value on any install.
	 *
	 * They are removed rather than wired because each needs a *design decision*
	 * this change is not entitled to make, and both are the kind that is
	 * cheaper to get right later than to guess at now:
	 *
	 *   · **Recency** carried `history: 0.2`, on a band that really is
	 *     populated, so building a producer for it would reorder every install's
	 *     history entries — and the number it would rank on is genuinely
	 *     ambiguous. A dated entry has an *in-world* date and an *authored*
	 *     order, they disagree constantly (a flashback is old and new at once),
	 *     and picking one silently is a worse answer than picking neither.
	 *   · **Scene affinity** has no fact to read. `scenes` and
	 *     `lorebook_bindings.scene_id` exist in the schema, but nothing in
	 *     retrieval knows which scene a session is *in*, so the producer is a
	 *     feature and not a wiring job.
	 *
	 * Both are welcome back the day something produces them — as a new field
	 * beside its producer, which is the order that keeps this from happening a
	 * third time. `runtime/signalWiring.test.ts` is what enforces that: a signal
	 * declared here and producible by nothing fails, and so does the reverse.
	 *
	 * `signalDensity` survives the same audit for the opposite reason — it now
	 * has one. `densitySignal` had existed in `ranking/signals.ts` with no
	 * caller for as long as this weight had existed with no producer; the scan
	 * writes it on every candidate now, exactly as it writes `proximity`.
	 */
	signalDensity: {
		type: 'perMember' as const,
		members: SOURCES,
		/**
		 * ⚠ **Unmoved, and the lore bands' 0 is what makes wiring it safe.**
		 *
		 * `signalProximity`'s case exactly: the number falls out of the key walk
		 * that was already happening, so the only thing this weight decides is
		 * whether it counts — and turning it on reorders lore in an upgraded
		 * install that never asked. Every lore band therefore stays at 0 and the
		 * scan simply starts *reporting* the number, where a reader can see its
		 * value before deciding to weight it.
		 *
		 * `messages: 0.1` is left exactly as it was rather than tidied to 0.
		 * That band is not populated on the shipped path (the entity
		 * mechanism's `messages` out-port is deliberately unwired) and nothing
		 * writes `density` on a message candidate even when it is, so the number
		 * is inert either way — and moving a default that cannot change an
		 * outcome is a re-tune with no reason attached.
		 */
		default: { messages: 0.1, worldLore: 0, characterLore: 0, history: 0, relationships: 0 },
		label: { en: 'Length against the pool' },
		description: {
			en: 'How much a longer-than-average entry outranks a short one. Length is a proxy for how much an entry has to say; raise it when your book mixes one-line stubs with real articles.',
		},
	},
	/**
	 * How tightly an entry's matched keys clustered in the window.
	 *
	 * Two keys matching adjacent is stronger evidence than the same two
	 * matching twenty words apart: "the Ashguard rode" is about the Ashguard
	 * riding, and the same two words either side of a paragraph break are two
	 * unrelated sentences. `signalKeyword` cannot tell those apart — it counts
	 * *how many* of an entry's keys matched and never *where* — so this is the
	 * distinction that signal is missing rather than a second reading of it.
	 *
	 * ⚠ **0 everywhere, which is the one default it can have.** The number is
	 * computed on every scan (it falls out of the key walk that was already
	 * happening), so the only thing this weight decides is whether it counts —
	 * and turning it on reorders lore in an upgraded install that never asked.
	 * Same convention as `admitThreshold` and `scoreLedAllocation`.
	 */
	signalProximity: {
		type: 'perMember' as const,
		members: SOURCES,
		default: { messages: 0, worldLore: 0, characterLore: 0, history: 0, relationships: 0 },
		label: { en: 'Keywords close together' },
		description: {
			en: "How much it counts that an entry's keywords appeared near each other rather than scattered across the window.",
		},
	},
	signalPriorityBonus: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.15,
			characterLore: 0.15,
			history: 0,
			relationships: 0,
		},
		label: { en: 'Author priority' },
		description: {
			en: "Score added per step of an entry's own priority setting — the author's thumb on the scale.",
		},
	},
} as const

/**
 * How much each way of *finding* an entry counts (retrieval plan §1, phase 3).
 *
 * The signal weights above are the right data at the wrong altitude.
 * Nobody thinks in "tf-idf", and a reader who wants less guessing and more
 * literal matching has to know which of them to move and in which
 * direction. These three sit over them and group them by the **mechanism** that
 * produced the evidence:
 *
 * | Bar | Scales | Asks |
 * |---|---|---|
 * | Keyword | `signalKeyword`, `signalTfidf`, `signalProximity` | "these words appeared" |
 * | Semantic | `signalSemantic` | "this is about that" |
 * | Name | `signalNameMatch`, `signalEntityCooccurrence`, `signalEntityVector` | "this is called that" |
 *
 * The three that are left — last-referred, density and the author's priority
 * bonus — are **structural**, not mechanisms. They answer
 * *"does this matter now"* rather than *"did we find it"*, and scaling them by a
 * retrieval mechanism would be a category error: an entry does not stop being
 * long, or stop having come up a moment ago, because a reader turned keyword
 * matching down.
 *
 * ⚠ **This is not the source split, and the two are on screen together.** The
 * `share` bar above divides the *budget* between world lore, character lore and
 * conversation — turning one up takes tokens from the others. These decide how
 * much each retrieval *method* contributes to one entry's score — turning one up
 * takes nothing from anything, and every bar may be 1 at once. Different axes,
 * different questions, which is why they are different control types rather than
 * one type with a flag (`FieldType.strengths` in the SDK carries that argument).
 *
 * **1 is neutral, not maximum**, and all three ship at 1: multiplying by one is
 * arithmetically what already happens, so an upgraded install scores exactly what
 * it scored before. 0 switches a whole mechanism off, which is the readable way
 * to say "keys only" or "stop guessing" — and is a thing to want.
 *
 * On `rank-hybrid` alone, like the signal matrix and `scoreLedAllocation` and for
 * the same reason (S3): the `rank-recall` example does not score with signals,
 * and widening a sibling's declared surface is a hash change on a type nobody
 * meant to touch.
 */
const MECHANISM_WEIGHTS = {
	type: 'strengths' as const,
	min: 0,
	max: 1,
	quick: true,
	members: [
		{
			key: 'keyword',
			label: { en: 'Keywords' },
			description: {
				en: "The author's own trigger words, how distinctive the shared vocabulary is, and how closely the matches clustered.",
			},
			tone: 1,
		},
		{
			key: 'semantic',
			label: { en: 'Meaning' },
			description: {
				en: 'Similarity of meaning, with no shared words required. Needs an embedding model and the semantic arm switched on.',
			},
			tone: 3,
		},
		{
			key: 'name',
			label: { en: 'Names' },
			description: {
				en: 'An entry called by its own name, and entries naming the same people and places as the scene.',
			},
			tone: 2,
		},
	],
	default: { keyword: 1, semantic: 1, name: 1 },
	label: { en: 'How entries are found' },
	description: {
		en: 'How much each way of finding an entry counts toward its score. Turning one up takes nothing from the others — this is not the context split.',
	},
} as const

/**
 * Which allocation precedence the selection runs under (design §7).
 *
 * Off is what ships, and off is the shipped engine exactly: the shares split
 * the window into fixed bands and each source fills its own. A turn that needs
 * no history still reserves history's band, and one relevant world-lore entry
 * larger than a sixth of the window cannot be kept however it scored — which is
 * the thing design §7 calls backwards.
 *
 * On, the precedence inverts to *score allocates, minimums guarantee, shares
 * cap*: the minimums are met first exactly as before, then one pool is spent
 * strictly best-first across every source with each band a ceiling on what one
 * source may take out of it, and the sweep still hands out whatever no source
 * could use. Everything a user can read a promise about is unchanged either
 * way — pins come first and do not consume the entry cap, a band set to zero
 * leaves that source out, minimums are met before any share is worked out, and
 * ties break on score then authored position.
 *
 * **A declared parameter rather than a call option, and that is the whole
 * reason this exists.** `SelectOptions.scoreLedAllocation` has been built and
 * tested since the inversion was written, and `core:task/rank-hybrid@1` is the
 * only runtime `select()` call there is — so with nowhere for a user to say
 * so, every shipped run took the share-first branch and the option was
 * reachable only from a unit test. This is the somewhere.
 *
 * **False is the shipped default**, the `maxRecursionDepth` / `admitThreshold`
 * convention and for their reason: it changes what reaches the model, so it is
 * a thing somebody turns on rather than a thing that happens to them on
 * upgrade. An upgraded install selects exactly what it selected before, which
 * is what leaves the parity corpus measuring the shipped path.
 *
 * On `rank-hybrid` alone, like the signal matrix and the `scripts` hook and for
 * the same reason (S3): the `rank-recall` example does not run this selection,
 * and widening a sibling's declared surface is a hash change on a type nobody
 * meant to touch.
 */
const SCORE_LED_ALLOCATION = {
	type: 'boolean' as const,
	default: false,
	label: { en: 'Let the best entries lead' },
	description: {
		en: 'Spend the whole context on whatever scored highest, wherever it came from, and treat each band as a ceiling rather than a reserved slice. Off divides the context into bands first and fills each one separately, which is how it has always worked.',
	},
} as const

/** @experimental */
export const rankHybrid = pin(
	describeTaskDefinition({
		id: 'core:task/rank-hybrid@1',
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					// Cross-source only (R-7 P5). Ahead of the nine, because it
					// is the altitude a reader starts at: the grouped mechanisms
					// first, the individual signals under them for anyone who
					// wants that far in, then how the sources' shares divide
					// the window and in what precedence it is filled.
					mechanismWeights: MECHANISM_WEIGHTS,
					...SIGNAL_WEIGHT_FIELDS,
					shareNormalisation: SHARE_NORMALISATION,
					scoreLedAllocation: SCORE_LED_ALLOCATION,
				},
			},
			/**
			 * The post-retrieval hook (18 §4a): user chains over the candidate
			 * pool before ranking sees it. Spread onto this type alone rather
			 * than into `rankSlots` — widening a sibling's accepted set is a
			 * hash change on a type nobody meant to touch (S3).
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:candidates/filter@1', 'core:script:candidates/rescore@1'],
				port: 'candidates',
				phase: 'before',
				description:
					'Scripts that drop or rescore retrieved entries before the ranker orders them. Dropping excludes with a reason; rescoring changes the order.',
			},
		},
		ports: {
			in: rankPorts.in,
			out: {
				...rankPorts.out,
				/**
				 * What each band was allotted, what it spent, and how many
				 * entries it got there (D-H).
				 *
				 * ⚠ **Published by the binding since it was written, declared
				 * by nobody.** `select()` returns this beside the decisions and
				 * the binding has always returned it on this key — but an
				 * undeclared out-port is invisible: nothing downstream could
				 * learn it existed, `validate.ts` skipped the edge, and
				 * `core:task/assemble@2` ran its allocation on empty defaults
				 * while the numbers sat one node upstream.
				 *
				 * Spread onto this type alone rather than into `rankPorts` —
				 * the same reason the `scripts` hook above is, one construct up
				 * (S3). The `rank-recall` example computes no per-band usage;
				 * giving it a port it cannot fill would move a hash to declare
				 * a promise it does not keep.
				 *
				 * `json` rather than a shape of its own. It is
				 * `Record<band, {allocated, used, entries}>` and the band
				 * vocabulary is the ranker's `SOURCES` list, which a plugin may
				 * extend — a shape id pinned here would freeze the very list
				 * that is meant to grow.
				 */
				groups: S.json,
			},
		},
	}),
)
/**
 * The two retrieval query windows, as text.
 *
 * A Task because *how a message is written when it is a query* is a decision —
 * speaker attribution in brackets, emphasis stripped — and a different
 * embedding model might want a different shape. It is also where the two
 * windows are cut, which is the parameter a user with long posts will reach for
 * first.
 * @experimental
 */
export const queryWindows = pin(
	describeTaskDefinition({
		id: 'core:task/query-windows@1',
		i18n: { name: { en: 'Retrieval queries' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					currentWindow: {
						type: 'integer',
						default: 2,
						description:
							"How many of the latest messages form the 'current' retrieval query.",
					},
					recentWindow: {
						type: 'integer',
						default: 3,
						description:
							"How many messages before those form the wider 'recent' retrieval query.",
					},
				},
			},
		},
		ports: {
			in: { messages: S.messages, cast: S.sessionCast },
			out: { main: S.json, current: S.json, recent: S.json },
		},
	}),
)

/**
 * The semantic mechanism's ranking, as a Task.
 *
 * Nine stages the legacy engine runs inline: fuse the per-query lists, normalise
 * to the top, boost recency and author priority, cut on an adaptive threshold,
 * diversify with MMR, and cap each source. Every constant behind them is a
 * parameter here — one of them carries a `TODO: make configurable` in the
 * original.
 *
 * A Task rather than part of the vector Query because **it is policy**: which of
 * these stages run, and how hard, is exactly what an installation should be able
 * to replace. The Query retrieves and computes similarity; this decides.
 *
 * `similarity` is a port because MMR needs to compare candidates to each other
 * and a Task cannot ask the host for anything (F11). It is a matrix of cosines,
 * not the embeddings — derived, bounded, and not reversible into the vectors.
 * @experimental
 */
export const rankSemantic = pin(
	describeTaskDefinition({
		id: 'core:task/rank-semantic@1',
		i18n: { name: { en: 'Rank semantic results' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ No `currentWindow` / `recentWindow` here, and there
					 * were (culled 2026-09-16, R-12). They size the two query
					 * windows — how many messages form the 'current' and the
					 * 'recent' question — which `core:task/query-windows@1`
					 * cuts and declares as its own params. Declared here too,
					 * they were rendered twice and read once: the ranker
					 * receives windows already cut and consults neither.
					 */
					rrfK: {
						type: 'integer',
						default: 60,
						description:
							'Rank-fusion constant — higher values flatten the difference between ranks.',
					},
					recencyBoost: {
						type: 'number',
						default: 0.15,
						description: 'Extra score given to recent entries.',
					},
					recencyDecay: {
						type: 'number',
						default: 0.01,
						description: 'How quickly the recency boost fades per message of age.',
					},
					thresholdMin: {
						type: 'number',
						default: 0.3,
						description: 'Minimum similarity a match needs to be considered at all.',
					},
					relativeThreshold: {
						type: 'number',
						default: 0.7,
						description: 'Drop matches scoring below this fraction of the best match.',
					},
					mmrLambda: {
						type: 'number',
						default: 0.7,
						description:
							'Balance between relevance and variety — 1 is pure relevance, 0 maximum variety.',
					},
					/**
					 * ⚠ Not the five `SOURCES` the budget split uses. These are
					 * the semantic mechanism's own record kinds — what a stored vector
					 * *is* — and `historyEntry` vs `history` is a real
					 * difference, not a spelling. Mapping one vocabulary onto
					 * the other here would quietly rename keys the ranker
					 * matches literally (`weights.ts DEFAULT_SEMANTIC`).
					 */
					sourceBudget: {
						type: 'perMember',
						members: [
							{
								key: 'message',
								label: { en: 'Messages' },
								description: { en: 'Chat messages found by meaning.' },
								tone: 0,
							},
							{
								key: 'worldLore',
								label: { en: 'World lore' },
								description: { en: 'Lorebook entries about the world.' },
								tone: 1,
							},
							{
								key: 'characterLore',
								label: { en: 'Character lore' },
								description: { en: 'Lorebook entries bound to a character.' },
								tone: 2,
							},
							{
								key: 'historyEntry',
								label: { en: 'History entries' },
								description: { en: 'Dated entries recording earlier events.' },
								tone: 3,
							},
							{
								key: 'narrativeRelationship',
								label: { en: 'Relationships' },
								description: { en: 'The narrative graph. Off by default.' },
								tone: 4,
							},
						],
						default: {
							message: 12,
							worldLore: 8,
							characterLore: 6,
							historyEntry: 6,
							narrativeRelationship: 5,
						},
						label: { en: 'Most matches per kind' },
						description: {
							en: 'A ceiling on how many semantic matches of each kind survive fusion, before the budget ranker sees them.',
						},
					},
					defaultSourceBudget: {
						type: 'integer',
						default: 20,
						description:
							'The ceiling for any match kind not named above — what a plugin-added source gets until it declares its own.',
					},
				},
			},
		},
		ports: {
			in: {
				/**
				 * One entry per query window, each carrying its own per-message
				 * ranked lists and its own similarity matrix. The whole stack
				 * runs per window; the results are concatenated, not fused.
				 */
				windows: S.json,
				messages: S.messages,
			},
			out: {
				main: S.candidates,
				candidates: S.candidates,
				diagnostics: S.json,
			},
		},
	}),
)

/**
 * A plugin's ranker — same kind, same shape, so the swap list offers it (16 §5c).
 *
 * Named `rankRecall`, not `rankSemantic`: binding names derive from the id's
 * name segment and ignore the namespace, so this and `core:task/rank-semantic@1`
 * would both want to be `rankSemantic` and generation would emit one export
 * twice. `checkUnique` now catches that; the id changed here because a plugin
 * naming its ranker after its own product is the better name anyway.
 * @internal
 */
export const rankRecall = pin(
	describeTaskDefinition({
		id: 'chariot.recall:rank-recall@1',
		timeoutMs: 500,
		ports: rankPorts,
	}),
)

/**
 * What Assemble's `render()` puts on a context template itself — see the
 * template slot below. Laid-out values are strings; `characterLore` is the
 * raw list of included allocations (`rendersBands.raw`).
 */
const ASSEMBLE_TEMPLATE_SCOPE = {
	worldLore: { type: 'string', optional: true, description: 'World lore that fit the budget, laid out.' },
	history: { type: 'string', optional: true, description: 'History entries that fit the budget, laid out.' },
	currentDate: { type: 'string', optional: true, description: 'The story’s current date, laid out.' },
	characterLore: {
		type: 'list',
		optional: true,
		description: 'Character lore that fit the budget — the raw list; each is also folded into its character.',
		of: {
			type: 'object',
			fields: {
				source: { type: 'string' },
				id: { type: 'string' },
				name: { type: 'string', optional: true },
				content: { type: 'string' },
				tokens: { type: 'number' },
				meta: { type: 'record', optional: true },
				included: { type: 'boolean' },
				why: { type: 'list', of: { type: 'string' } },
			},
		},
	},
	sessionMessages: {
		type: 'list',
		description: 'The transcript, oldest first, ending with the seed line.',
		of: {
			type: 'object',
			fields: {
				id: { type: 'number' },
				role: { type: 'string' },
				name: { type: 'string' },
				message: { type: 'string', optional: true },
			},
		},
	},
	injectionsByIndex: {
		type: 'record',
		description: 'Script injections, keyed by the message index they render at.',
		of: {
			type: 'list',
			of: { type: 'object', fields: { role: { type: 'string' }, content: { type: 'string' } } },
		},
	},
	budget: {
		type: 'object',
		description: 'The token budget this prompt was allocated against.',
		fields: { total: { type: 'number' }, used: { type: 'number' }, remaining: { type: 'number' } },
	},
	postHistory: {
		type: 'object',
		optional: true,
		description: 'The post-history block, placed: render it when the loop reaches targetIndex.',
		fields: {
			targetIndex: { type: 'number' },
			instructions: { type: 'string', optional: true },
			charInstructions: { type: 'string', optional: true },
			exampleDialogue: { type: 'string', optional: true },
			hasContent: { type: 'boolean' },
		},
	},
} as const satisfies Record<string, VarField>

/** @public */
export const assemble = pin(
	describeTaskDefinition({
		id: 'core:task/assemble@2',
		timeoutMs: 1000,
		slots: {
			// An *assembly* template: its scope really is the input ports, so this half of
			// 16 §4's claim holds.
			template: {
				kind: 'template',
				// Handlebars FIRST, then Liquid: the first entry is what a new
				// template here is written in, and every shipped row holds
				// Handlebars — so the order is what keeps the parity corpus
				// byte-identical. Both are accepted because a story string is a
				// layout, not a dialect: the same arrangement is expressible in
				// either, and a slot naming one makes the other unselectable
				// everywhere. Jinja is absent because core renders neither
				// parity nor helpers for it (12 §2a).
				acceptedEngines: [handlebars.id, liquid.id],
				facet: 'templates',
				/**
				 * Assemble's own names — what `render()` writes onto the context
				 * AFTER spreading the prompts and the builder's context, so these
				 * are the last word (typed templates P3, edited in place — owner
				 * ruling Q4).
				 *
				 * Corrected 2026-09-27: this declared `blocks`, `budget` as two
				 * bare names and `prompts` — `blocks` is a param that reorders the
				 * template and never reaches it, and `prompts` is never a name:
				 * the prompts slot's fields are spread at the top level. The
				 * builder's keys and the prompts fields join these in
				 * `templateScopeAt`; declared bands join them too.
				 */
				variables: ASSEMBLE_TEMPLATE_SCOPE,
				description:
					'The story string: the overall layout of the finished prompt — where the character cards, lore, history and instructions sit. Leave empty to use the built-in layout.',
			},
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: {
					system: { type: 'text' },
					postHistory: { type: 'text' },
				},
			},
			/**
			 * How the values Assemble itself produces are laid out.
			 *
			 * These three exist here rather than upstream because they come out
			 * the other side of the budget: what a layout receives is what
			 * actually fit, which no earlier node knows.
			 *
			 * `characterLore` is deliberately absent, and named `raw` below. It
			 * is a top-level value on the assembly context that no template
			 * renders — qualifying entries are folded into their bound character
			 * inside `characters`, under an `"extra lore"` key. A layout for it
			 * would be a setting that changes nothing.
			 */
			variables: {
				kind: 'variables',
				facet: 'variables',
				description:
					'How the retrieved lore and history are laid out — JSON, prose, or whatever you write. Duplicate one to change it.',
				renders: {
					worldLore: 'core:var/world-lore@1',
					history: 'core:var/history@1',
					currentDate: 'core:var/current-date@1',
				},
				/**
				 * Open (typed templates P2, edited in place — owner ruling Q4):
				 * every band declared upstream of `candidates` is rendered too,
				 * under its key and through its variable's layout — a plugin's
				 * source adds its band here by declaring it. `characterLore`
				 * reaches a template as the raw list, as it always has.
				 */
				rendersBands: { from: 'candidates', raw: ['characterLore'] },
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ No `budget` here either. It was an integer defaulting to
					 * 4096 — the same re-entered number the ranker carried, with
					 * the same defect: an absolute count on a node cannot know
					 * which model the prompt is about to be sent to, so it was
					 * free to disagree with the window and warn nobody. The
					 * total now arrives on the `budget` in-port from
					 * `core:task/context-budget@1`, which derives it from the
					 * sampling config the reply is generated against.
					 */
					/**
					 * Where the post-history reminder goes, and whether it goes
					 * at all.
					 *
					 * Numbers, so they are parameters rather than prompt text —
					 * a `prompts` slot carries authored strings and typing a
					 * count as one would be the wrong shape wearing a
					 * convenient home. The trigger is a **suppression**: below
					 * it a short chat gets no reminder, because a reinforcement
					 * note two messages after the system prompt is noise.
					 */
					postHistoryDepth: {
						type: 'integer',
						default: 0,
						description:
							'Place the post-history reminder this many messages before the end. 0 puts it last.',
					},
					postHistoryTokenTrigger: {
						type: 'integer',
						default: 0,
						description:
							'Only add the reminder once the chat is at least this many tokens long. 0 always adds it.',
					},
					/**
					 * ⚠ No `truncation` here, and there was one — an enum of
					 * `oldest-first | lowest-weight`, "what gets dropped first
					 * when the context is over budget" — declared, rendered,
					 * and read by nothing (culled 2026-09-16, R-12). Assemble
					 * drops nothing: what fits is decided upstream by the
					 * ranker's `select`, per band, against `share`,
					 * `maxEntries`, `minEntries` and `scoreLedAllocation` on
					 * `core:task/rank-hybrid@1`, and this node renders the
					 * decisions it is handed. A second drop rule here would be
					 * a second owner of one decision. NOMENCLATURE §25 records
					 * the cull.
					 */
					/**
					 * Which sections the prompt is built from, and in what order —
					 * SillyTavern's *prompt list*, as a param on the node that
					 * assembles the prompt (ruling 2026-09-10).
					 *
					 * A param and not a session setting, and not a table: it is the
					 * same kind of fact as "which prompt does this step use", so it
					 * belongs in the configuration a preset selects and it is an
					 * administrator's. A preset carries it to every session started
					 * from it for free, because a preset's configuration is already
					 * what a run resolves against.
					 *
					 * ⚠ **The declared default means "leave the template alone".** It
					 * is the shipped template's own order, so a configuration nobody
					 * has touched stores nothing and renders the bytes it always did —
					 * and a template somebody WROTE, whose sections sit in an order
					 * they chose, is not silently reordered into this one. See
					 * `isShippedPromptBlocks`.
					 */
					blocks: PROMPT_BLOCKS_DECL,
				},
			},
			/**
			 * Which connection this prompt is being written FOR.
			 *
			 * Not compute, and this node calls nothing: the only thing read out
			 * of it is `metadata.promptFormat` — whether the finished prompt is
			 * one instruct-wrapped string or a role-tagged array, and which
			 * wrapper. A wire format is a property of the endpoint, and until
			 * this slot existed there was no way for the node that renders the
			 * prompt to learn it. `renderers.ts` fell back to Vicuna on every
			 * run, so a ChatML or Llama-2 connection was sent Vicuna markers and
			 * nothing anywhere said so.
			 *
			 * ## Wire it to the SENDING node, always
			 *
			 * `slot.connectionOf('generate')`, exactly as `contextBudget` shares
			 * the sampling reference, and for the same reason stated there: a
			 * prompt wrapped for one endpoint and sent to another is wrong
			 * silently. Sharing the reference makes the two impossible to point
			 * apart rather than documenting that they must agree and hoping.
			 *
			 * ## No `requires`
			 *
			 * The sibling connection slots declare one because they are about to
			 * CALL the connection and an unmet capability should refuse at bind.
			 * This one reads a label. Declaring a capability it never exercises
			 * would let an untested connection grey itself out of a picker for a
			 * node that was never going to send it anything.
			 */
			connection: {
				kind: 'connection',
				shape: S.textGen,
				description:
					'Which connection this prompt is formatted for. Point it at the step that sends the reply — a prompt wrapped for one endpoint and sent to another is wrong in a way nothing reports.',
			},
		},
		ports: {
			in: {
				candidates: S.candidates,
				budget: S.budget,
				templateContext: S.templateContext,
				/**
				 * The ranker's per-candidate trail — score, verdict, reason.
				 *
				 * ⚠ **Supplied since the node was written, declared only now.**
				 * All three shipped specs wire `decisions: $.rank.decisions`,
				 * and the binding halts without them ("wire a ranker between
				 * retrieval and assembly"), so this is not a new input — it is
				 * the load-bearing one. What was missing was the declaration,
				 * and the cost of that is exact: `validate.ts` skips its shape
				 * check when either side is undeclared (`if (!outShape ||
				 * !inShape) continue`), so a plugin ranker publishing the wrong
				 * shape on this edge got no finding, and a plugin ASSEMBLER had
				 * nothing to read to learn the port existed.
				 *
				 * `S.decisions`, matching `rankPorts.out.decisions` (R64) — a
				 * decision is a candidate with its arithmetic attached, and the
				 * panel reads the same objects the allocator does. Typed, so a
				 * plugin ranker wired here publishes the shape the ranking store
				 * records.
				 */
				decisions: S.decisions,
				/**
				 * The finished chat lines, from `core:task/process-messages@1`.
				 *
				 * Wired by all three specs (`messages: $.lines.messages`) and
				 * undeclared for the same stretch as `decisions`. Two readers
				 * depend on it and neither is optional: the transcript the
				 * template renders, and the depth the post-history reminder is
				 * placed at — which is computed against *these* lines because
				 * the context builder ships a placeholder index, the final
				 * array not existing when it runs.
				 */
				messages: S.messages,
				/**
				 * Per band: allocated, used, entries — the arithmetic the
				 * ranker did while deciding (D-H).
				 *
				 * ⚠ **The one genuinely new edge in this set.** The two
				 * above were supplied and undeclared; this was PUBLISHED by
				 * `core:task/rank-hybrid@1` and wired by nobody, so `allocate`
				 * fell to its own `{}` and the per-band numbers the ranker had
				 * already computed were dropped on the floor between two
				 * adjacent nodes.
				 *
				 * What it does NOT touch is the prompt: `allocate` puts this
				 * straight onto `AllocatedContext.groups` and reads it nowhere
				 * else, so `blocks`, `totalTokens` and `budget` — everything
				 * the render sees — are byte-identical with it wired or not.
				 * What changes is the receipt: `dispatch.ts` publishes
				 * `payload.groups` as the run's `sources`, which is the budget
				 * panel's whole data set and has been empty on every run.
				 *
				 * Undeclared on purpose for the other rankers. A ranker that
				 * computes no per-band usage leaves this unwired and
				 * `allocate` takes the branch it has always taken.
				 */
				groups: S.json,
				/**
				 * The annex a template may read, as `annex.<owner>.<key>`
				 * (typed templates P6, edited in place — owner ruling Q4).
				 *
				 * Fed ONLY by `core:query/session-annex@1` with `view:
				 * 'template'`: every DECLARED key of every owner in scope —
				 * core, the enabled plugins — for the session's genre, keyed by
				 * owner. A key no declaration covers never arrives, and a
				 * declaration refuses secrets at write time (R61), so what
				 * reaches a template is what an owner said may be kept there
				 * (owner ruling Q1: "nothing dangerous should ever be stored
				 * there"). Law T2 refuses anything else wired here, and a
				 * template-view read wired anywhere else.
				 *
				 * Optional: unwired, `annex` is not in the template's scope at
				 * all, so a template naming it is refused rather than rendering
				 * nothing.
				 */
				annex: S.json,
			},
			out: { main: S.assembled, context: S.assembled },
		},
	}),
)

/**
 * Builds the object a context template renders against.
 *
 * A Task, not a Query, even though it reads the cast: what it *is* is the
 * resolution — which characters appear, which get named, which scenario wins —
 * and that is a decision anyone should be able to replace. The read reaches the
 * host like any other (F11 keeps the services out of the Task itself).
 *
 * Separate from Assemble on purpose. Assemble allocates a budget and renders;
 * this decides what there is to render. A plugin that wants different character
 * cards should not have to reimplement token allocation to get them.
 * @public
 */
export const sessionCast = pin(
	describeQueryDefinition({
		id: 'core:query/session-cast@1',
		i18n: { name: { en: 'Session cast' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: {
				main: S.sessionCast,
				cast: S.sessionCast,
				/**
				 * The seated envoys on their own (PLAN-turn-order §4.4,
				 * additive 2026-09-21): `{ slug, key, origin, name, speaks,
				 * default, position, removedAt }` per seat, live and departed,
				 * in seat order — the rows `main` already carries under
				 * `envoys`, offered as a port so a pool or a strategy can be
				 * wired to them without taking the whole cast. There is no
				 * separate envoy query node, and none should be made.
				 */
				envoys: S.json,
			},
		},
	}),
)

/**
 * The session's settings document, re-read (PLAN-turn-order §4.12, R13).
 *
 * Every core inlet that takes a session already publishes the document on
 * its `session` port, resolved once by the host at run start. This node is
 * the second way in: placed **after a write that may have moved a value** —
 * a turn-order write, an annex write — so the rest of the graph reads what
 * is stored now rather than what the run began with. Same document, same
 * resolver (`resolveSessionSettings`), no other table read.
 * @experimental
 */
export const sessionSettings = pin(
	describeQueryDefinition({
		id: 'core:query/session-settings@1',
		i18n: { name: { en: 'Session settings' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.sessionSettings },
		},
	}),
)

/**
 * The narrative graph's relationships, as two nodes.
 *
 * ⚠ Replaced `core:query/graph-context@1`, which emitted all of it through one
 * port as one variable. Two things were wrong with that. The prompt showed a
 * single "Your relationships:" block containing both what the speaker thinks
 * of everyone and what everyone thinks of the speaker, which are opposite
 * claims that a model reads as one list; and being one variable, they shared a
 * layout, a priority and an on/off switch, so "include how others see me but
 * not my own view" could not be said.
 *
 * Two nodes rather than two out-ports on one, following the split of
 * `lorebook-triggers` into world and character lore: each can then be switched
 * off, weighted and laid out on its own, which is the entire reason for
 * separating them. They run in the same `async` block, so the second traversal
 * costs concurrency rather than wall-clock.
 *
 * ⚠ Neither carries a retrieval control of any kind, and that was already true
 * when the lore lanes still declared `retrievalMode`. A graph relationship is
 * reached by walking edges from the speaker's node — there is no keyword mechanism and
 * no vector mechanism to choose between, so a picker here would have been a control
 * that reads well and does nothing, which is what `session-history@1`'s dead
 * `template` slot already cost this codebase once.
 */
const relationshipSlots = (what: string) => ({
	params: {
		kind: 'parameters' as const,
		facet: 'weights' as const,
		schema: {
			maxEntries: {
				type: 'integer' as const,
				/**
				 * ⚠ **No `default:`, and its absence is the declaration.**
				 *
				 * Neither spec ever named this slot, so `resolveInput` never
				 * resolved it and `bindings.ts` called `capRelationships` with
				 * `undefined` on every run this node type has ever made — which
				 * that function reads as *no ceiling at all* and returns the
				 * section whole. `respond` wires `params: slot.params()` now, so
				 * whatever is declared here becomes live; under ruling D-8 the
				 * declared default must therefore BE the value every run has
				 * actually used, and that value is "uncapped".
				 *
				 * Uncapped is not expressible as a number here. `0` is already
				 * taken and means the opposite — `capRelationships` returns
				 * `null` for it, so the section is dropped entirely, which is the
				 * `admitThreshold` / `maxEntries` off-switch convention this
				 * package uses everywhere. A negative sentinel IS what
				 * `capRelationships` reads as "no cap" (`cap < 0` returns the
				 * section), but `min: 0` forbids one and no other parameter in
				 * this package uses a negative sentinel; inventing the convention
				 * here would be a design decision riding in on a wiring fix. And
				 * a large finite number is not the value either — it is a
				 * different value that is *usually* indistinguishable, which is
				 * the kind of nearly-right that D-8 exists to refuse.
				 *
				 * So: no default. `resolveSlot`'s params branch copies a schema
				 * default only `if (v?.default !== undefined)`, and
				 * `reconcileConfigs` back-fills a row only when a declaration
				 * carries one — so an untouched install resolves `undefined` and
				 * stays uncapped, exactly as before. The control renders as an
				 * empty box, which `NumberControl` and the panel already treat as
				 * "unset" (an emptied box commits `undefined` and clears the
				 * row), so the empty state round-trips rather than being a hole.
				 *
				 * `drizzle/0111` deletes the stored `12` that `reconcileConfigs`
				 * back-filled from the old declaration; without it, wiring the
				 * slot would cap every upgraded install at 12 as a side effect.
				 */
				min: 0,
				quick: true,
				label: { en: 'Most relationships' },
				description: {
					en: `A ceiling on how many ${what} reach the prompt, closest first. Leave it empty for no ceiling; 0 leaves the section out altogether.`,
				},
			},
		},
	},
})

/**
 * ⚠ Both are `optional`, and the reason is not that the graph is unimportant.
 *
 * A slow or failing relationship read must never cost somebody their reply: the
 * executor turns an `err` from an optional node into an empty result, records
 * the failure on the receipt as `recoveredAsEmpty`, and the template's `{{#if}}`
 * renders nothing — which is exactly what a chat with no narrative graph gets
 * anyway. It is also what makes them safe to switch off outright.
 */
const RELATIONSHIP_TIMEOUT = 5000

/** How the speaking character regards everyone else. @experimental */
export const relationshipsPerspectives = pin(
	describeQueryDefinition({
		id: 'core:query/relationships-perspectives@1',
		i18n: {
			name: { en: 'Relationships: their perspective' },
			description: {
				en: 'How the speaking character regards the others, read from the narrative graph. Produces nothing when the chat has no lorebook or the speaker has no node in it.',
			},
		},
		optional: true,
		timeoutMs: RELATIONSHIP_TIMEOUT,
		slots: relationshipSlots('of their own views'),
		ports: {
			in: { scope: S.sessionScope },
			/**
			 * `json`, not `text`. The summary used to be stringified inside
			 * `buildGraphContext` and handed on as a finished blob, which made
			 * it the one context value a layout could do nothing with — you
			 * cannot render relationships as prose, drop a section, or even
			 * change the indent if the shape was flattened upstream. The node
			 * emits the structure and the variable layout renders it.
			 */
			out: { main: S.json, relationshipsPerspectives: S.json },
		},
	}),
)

/**
 * How everyone else regards the speaking character, and who is known to all.
 *
 * `legendaryFigures` rides here rather than on the other node, and the choice
 * is arguable enough to write down: it is neither the speaker's view nor a view
 * of the speaker, it is what is *publicly known* — which is the same kind of
 * claim as "how others regard you" and the opposite kind from "what you think
 * of them". Splitting it into a third node would put a mostly-empty block in
 * every prompt on every install that has never marked a node legendary.
 * @experimental
 */
export const relationshipsKnown = pin(
	describeQueryDefinition({
		id: 'core:query/relationships-known@1',
		i18n: {
			name: { en: 'Relationships: how others see them' },
			description: {
				en: 'How the others regard the speaking character, plus any figures known to everyone. Read from the narrative graph.',
			},
		},
		optional: true,
		timeoutMs: RELATIONSHIP_TIMEOUT,
		slots: relationshipSlots('views of them'),
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.json, relationshipsKnown: S.json },
		},
	}),
)

/**
 * The narrative graph as a retrieval **mechanism** (ruling 2026-09-10, Q1).
 *
 * ⚠ The ruling calls this an *arm*, and the id deliberately does not. Two
 * reasons, and the second is the stronger: NOMENCLATURE §22 retires *arm* in
 * favour of **mechanism**, and every sibling in this package is named for what
 * it retrieves rather than for the machinery — `entity-search`,
 * `vector-search`, `world-lore`. The word survives in the *descriptions* on
 * those siblings, which is prose a user reads (§23.6); an id is a frozen
 * contract, which is the one place a retired word should not land.
 *
 * The two nodes above are a *dump*: they hand the whole graph section to the
 * template, in whatever order the database returned the rows, and the only
 * control over it is a ceiling. Every other source the prompt is built from is
 * shared, ranked and allocated — which is what makes "world lore matters more
 * than history in this chat" sayable, and what makes "why is this entry here"
 * answerable. Relationships were the one source none of that reached.
 *
 * This is the same three sections read as **candidates**, one per relationship,
 * in the `relationships` band the ranker and the budget have carried since they
 * were written. What it buys is the whole retrieval surface at once: the band's
 * share divides the window, `select` decides what fits, and every relationship
 * arrives on the receipt with a reason.
 *
 * ## Ranked here, not by a second ranker
 *
 * `core:task/rank-hybrid@1` takes this like any other candidate source — the
 * band exists, the share exists, the entry cap exists — so there is no new rank
 * node and no new signal weight. What this node contributes is the **order**,
 * as a `presetScore` the ranker uses directly: scene presence first, then
 * whether the speaker is party to the tie, then how recently it changed. The
 * arithmetic is deterministic and the receipt states each term, which is the
 * standard `presetScore` carries — `core:query/entity-search@1` ranks its own
 * hits the same way for the same reason.
 *
 * ⚠ **It does not duplicate the two nodes above.** All three reach
 * `core:task/build-template-context@1`, on the same two in-ports and never
 * twice: this band is what those sections are built from on a run that
 * allocated any of it, and the two nodes' own dump is what they are built from
 * on a run that did not — which is every run until somebody raises the
 * relationships share. See docs/embeddings-and-rag.md.
 *
 * `relationshipSlots` rather than a declaration of its own, so the ceiling here
 * means exactly what it means on the two nodes above: on/off plus a ceiling,
 * with an absent value uncapped and 0 leaving it out altogether.
 * @experimental
 */
export const relationshipSearch = pin(
	describeQueryDefinition({
		id: 'core:query/relationship-search@1',
		i18n: {
			name: { en: 'Relationships: ranked' },
			description: {
				en: 'The narrative graph as ranked candidates that compete for the context window, ordered by who is in the scene, who is speaking, and what changed most recently.',
			},
		},
		optional: true,
		timeoutMs: RELATIONSHIP_TIMEOUT,
		slots: {
			params: {
				...relationshipSlots('graph relationships').params,
				schema: {
					/**
					 * The band's intent (R-7 P5), on the one relationship read
					 * that ranks. `share` is 0, which is what the ranker's map
					 * held: the band ships inert and the share is its switch —
					 * every candidate leaves as `excluded_group_disabled` with
					 * that reason until somebody raises it, and the two dump
					 * nodes render the graph whole meanwhile.
					 *
					 * `maxEntries` is `relationshipSlots`' own — the ceiling
					 * this node already applies before it publishes — and it is
					 * the band's ceiling too: one number, the query's, rather
					 * than a second on the ranker free to disagree. Absent
					 * means uncapped, as it always has here, where the map's
					 * `relationships: 0` was a cap of nothing sitting behind a
					 * share of nothing — raising the share alone used to
					 * exclude every relationship as over its ceiling. It does
					 * not now. Migration 0135 culls a stored 0 for that reason
					 * and moves anything else.
					 */
					...bandIntentFields({ label: 'relationships', noun: 'the narrative graph' }, { share: 0 }),
					// Declared second so the query's own wording and `min: 0`
					// win over the generic ceiling above.
					...relationshipSlots('graph relationships').params.schema,
				},
			},
		},
		ports: {
			/**
			 * ⚠ **No `text` in-port**, for `core:query/entity-search@1`'s
			 * reason: the four lore queries declared one that nothing filled
			 * and nothing read (culled 2026-09-16), and shipping a fifth with
			 * the same standing excuse written for it would have been adding
			 * the defect on purpose. A relationship is reached by walking edges
			 * from the speaker's node, so the scope is the whole of the
			 * question.
			 */
			in: { scope: S.sessionScope },
			out: {
				// Both open with a band-intent element — the graph's own,
				// published whether or not a tie was found — ahead of the
				// items; readers call `splitCandidates()`.
				main: S.candidates,
				hits: S.candidates,
				/**
				 * How many ties were walked, how many the scene was present
				 * for, and what the ceiling did — the mechanism-level half of
				 * the trail, which no per-candidate row can carry.
				 *
				 * Declared rather than merely published, unlike the lore lanes'
				 * own diagnostics: an undeclared out-port is invisible to
				 * `validate.ts` and unreadable by a plugin, which is the finding
				 * `core:task/rank-hybrid@1`'s `groups` cost a release.
				 */
				diagnostics: S.json,
			},
		},
	}),
)

/**
 * The ports both context builders expose. Identical because the two nodes do
 * the same job — the difference between them is entirely what can be
 * *configured*, which is what a node type is for.
 */
const contextPorts = {
	in: {
		cast: S.sessionCast,
		/**
		 * Whose voice the reply is, when a next-speaker node decided (19 §5).
		 * Optional: unwired, the speaker still rides the cast bundle (the
		 * scope's value), which is how every spec worked before the node
		 * existed — and how the narrator's context, which has no speaker,
		 * still works. Wired, it wins, so the receipt's speaker and the
		 * prompt's speaker cannot disagree.
		 */
		currentCharacterId: S.rowIds,
	},
	out: {
		main: S.templateContext,
		templateContext: S.templateContext,
		/**
		 * The name on the trailing assistant line.
		 *
		 * Its own port rather than a field inside the context, because
		 * nothing renders `{{seedName}}` — it is not a template variable.
		 * It is what the message processor writes on the line the model
		 * continues from, and in narrator mode it is the one name that
		 * must *not* be the joined cast list: seeding "Alice and Cara:"
		 * teaches the model to write joint dialogue instead of narrating.
		 */
		seedName: S.text,
	},
} as const

const PROMPTS_DESCRIPTION =
	'The written instructions this pipeline sends the model — pick a prompt, or duplicate one and make it yours.'

/**
 * How each value this node produces is *presented*.
 *
 * Every one of these was a `JSON.stringify` in TypeScript, indentation and all
 * — so "render my characters as prose" was a code change rather than a setting.
 * Each key here points at a swappable template row, selected the way a prompt
 * is, and keyed by the variable it renders rather than by this spec: a prose
 * rendering written here is selectable from any pipeline that renders the same
 * variable.
 *
 * The shipped rows reproduce the old TypeScript byte for byte. The JSON shape is
 * not a default anyone drifted into — it was A/B tested before 0.1.0 and
 * measurably improved how reliably models hold a character — so prose is opt-in
 * and stays that way.
 */
const VARIABLES_DESCRIPTION =
	'How each part of the prompt is laid out — JSON, prose, or whatever you write. Duplicate one to change it.'

/**
 * What a context builder's `templateContext` carries, in the template type
 * language (typed templates P3, 2026-09-27) — so a template editor offers
 * `{{{characters}}}` with a type, and `templateScopeAt` puts these keys in
 * the scope of whatever template renders the builder's output.
 *
 * Written from what the builder RETURNS (the app's `buildTemplateContext`),
 * not from the legacy `TemplateContext` type, which also lists names only
 * Assemble supplies (`worldLore`, `history`, `currentDate`). The app holds
 * the two together at compile time: the builder's returned object
 * `satisfies VarValue<typeof TEMPLATE_CONTEXT_SCHEMA>`, so a key added on
 * one side and not the other fails `tsc`.
 *
 * Every rendered value is a **string** — each is laid out through its
 * variable's selected layout before it leaves the builder (a user's
 * `{{{characters}}}` would otherwise render `[object Object]`). `state` is
 * the one structure: `templateScopeAt` re-types it from the session genre's
 * attribute slots. `sessionMessages` and `postHistory` are placeholders
 * Assemble supersedes with its own.
 *
 * **Policy** (`portSchemas`): it describes the payload; no hash moves.
 * @experimental
 */
export const TEMPLATE_CONTEXT_SCHEMA = {
	type: 'object',
	fields: {
		instructions: { type: 'string', description: 'The system prompt, resolved and laid out.' },
		characters: { type: 'string', description: 'The cast’s character cards, laid out (JSON by default), trimmed to the session’s character detail.' },
		personas: { type: 'string', description: 'The personas, laid out (JSON by default).' },
		scenario: { type: 'string', description: 'The scenario, resolved and laid out.' },
		characterNames: { type: 'string', description: '“A, B, and C” — every enabled character’s name (none at speaker-only detail).' },
		personaNames: { type: 'string', description: '“A, B, and C” — every persona’s name.' },
		exampleDialogue: { type: 'string', description: 'The speaker’s example dialogue.' },
		postHistoryInstructions: { type: 'string', description: 'The post-history instructions, resolved.' },
		relationshipsPerspectives: { type: 'string', description: 'How the speaker regards everyone.' },
		relationshipsKnown: { type: 'string', description: 'How everyone regards the speaker.' },
		char: { type: 'string', description: 'The speaking character’s name.' },
		character: { type: 'string', description: 'The speaking character’s name.' },
		user: { type: 'string', description: 'The persona’s name.' },
		persona: { type: 'string', description: 'The persona’s name.' },
		postHistory: {
			type: 'object',
			description: 'The post-history block, before Assemble decides where it goes.',
			fields: {
				targetIndex: { type: 'number' },
				instructions: { type: 'string', optional: true },
				charInstructions: { type: 'string', optional: true },
				exampleDialogue: { type: 'string', optional: true },
				hasContent: { type: 'boolean' },
				gatedBy: { type: 'string', optional: true },
			},
		},
		sessionMessages: { type: 'list', description: 'Empty here; Assemble supplies the transcript.' },
		state: {
			type: 'object',
			optional: true,
			description:
				'The session’s stats and states — state.world.<slot>, state.cast.<member>.<slot>, state.locations.<place>.<slot>.',
			fields: { world: { type: 'record' }, cast: { type: 'record' }, locations: { type: 'record', optional: true } },
		},
	},
} as const satisfies VarField

/** Rendered by every context builder, whoever is speaking. */
const sharedRenders = {
	instructions: 'core:var/instructions@1',
	characters: 'core:var/characters@1',
	personas: 'core:var/personas@1',
	scenario: 'core:var/scenario@1',
	postHistoryInstructions: 'core:var/post-history-instructions@1',
	characterNames: 'core:var/character-names@1',
	personaNames: 'core:var/persona-names@1',
} as const

/**
 * The reply pipeline's context builder.
 *
 * ## Why the narrator has its own type
 *
 * Through 0.6.0 both pipelines pinned this one, and the panel is generated from
 * the registry row — so each advertised the other's controls. Reply prompts all
 * carried an empty `narratorName` box, and the narrator offered layout pickers
 * for `exampleDialogue` (which comes from the speaking character it does not
 * have) and the two relationship variables (which its spec deliberately never supplies).
 * Three controls wired to nothing, in both directions.
 *
 * A type is the unit that declares a configurable surface — it is how a plugin
 * declares one, and `RegistryEntry.slots` carries the declaration precisely so
 * core can render a form without executing the plugin that owns it (12 §2, F6).
 * Narrowing per-spec instead would have meant the row said one thing and the
 * running pipeline another, which is the defect widening that column fixed.
 *
 * The two share `contextPorts` and `sharedRenders` rather than restating them,
 * so the halves that must not drift cannot.
 * @public
 */
export const buildTemplateContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-template-context@1',
		i18n: { name: { en: 'Build template context' } },
		timeoutMs: 2000,
		/** What `templateContext` carries — typed templates P3; policy, so no pin moves. */
		portSchemas: { out: { main: TEMPLATE_CONTEXT_SCHEMA, templateContext: TEMPLATE_CONTEXT_SCHEMA } },
		/**
		 * The example-dialogue pick. Declaring it is what gets `ctx.random` — the
		 * run-seeded RNG — instead of `Math.random()`, so the same run replayed
		 * chooses the same example and a different turn still gets variety.
		 */
		declaresRandomness: true,
		/**
		 * The authored text. It arrives as config rather than on a port because it
		 * *is* config — the same prompt config the assembly template renders from,
		 * layered instance → user → chat like every other slot.
		 */
		slots: {
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: PROMPTS_DESCRIPTION,
				fields: {
					systemPrompt: { type: 'text' },
					postHistoryInstructions: { type: 'text' },
				},
			},
			variables: {
				kind: 'variables',
				facet: 'variables',
				description: VARIABLES_DESCRIPTION,
				renders: {
					...sharedRenders,
					/** From the speaking character's card. */
					exampleDialogue: 'core:var/example-dialogue@1',
					/**
					 * The narrative graph, as two variables rather than one.
					 *
					 * They were `speakerRelationships` — a single block holding
					 * both what the speaker thinks of everyone and what everyone
					 * thinks of the speaker. Opposite claims under one heading,
					 * which a model reads as one list, and one layout, one
					 * priority and one on/off switch for both.
					 */
					relationshipsPerspectives: 'core:var/relationships-perspectives@1',
					relationshipsKnown: 'core:var/relationships-known@1',
				},
			},
			/**
			 * The pre-assemble context hook (18 §4a): user chains over the
			 * finished template context — conditional style guides, seeded
			 * event tables — after this node resolves it and before anything
			 * renders it.
			 *
			 * `messages/inject` lives here too — **not** on the message
			 * processor — because of the ruling of 2026-08-23: injections are
			 * template-context *data* (`context.injections`, resolved to
			 * `injectionsByIndex` beside `postHistory.targetIndex`), rendered
			 * by the template's own message loop. Splicing them into the list
			 * behind the template's back would be the §20 defect again, one
			 * layer down: a position the template cannot express, an author
			 * cannot see, and a corpus cannot check.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
			},
		},
		ports: {
			in: {
				...contextPorts.in,
				/**
				 * The narrative graph, as the two claims it really is — how the
				 * speaker regards everyone, and how everyone regards the
				 * speaker (D-I).
				 *
				 * ⚠ **Supplied by `respond` since the split, declared here
				 * only now.** The spec wires both off
				 * `core:query/relationships-perspectives@1` and
				 * `core:query/relationships-known@1`, the two `renders` above
				 * name the variables they feed, and the builder reads both by
				 * these exact names — so every part of the round trip was
				 * written down except the ports themselves.
				 *
				 * `json`, matching what those queries publish and for the
				 * reason stated at them: the structure travels so a variable
				 * layout can render it, rather than a blob nothing can
				 * restyle.
				 *
				 * ⚠ Declared on THIS type alone rather than in `contextPorts`,
				 * which the narrator builder shares. Its own docblock says the
				 * narrate spec never supplies these because graph context
				 * needs a speaker's perspective and a narrator has none — so
				 * widening the shared map would give it two ports it must
				 * leave empty forever, and move its hash to say so (S3).
				 */
				relationshipsPerspectives: S.json,
				relationshipsKnown: S.json,
				/**
				 * Who is speaking, when the speaker is not in the cast.
				 *
				 * ⚠ **Neither is wired by any spec, and both are supplied on
				 * every side-character turn.** `core:task/build-side-character-
				 * context@1` is not a separate implementation — the host's
				 * binding for it unwraps its `sideCharacter` in-port and calls THIS
				 * type's handler with the name and the card spread onto the
				 * input, because `resolveContextInput` owns the card rules and
				 * a side character's card and a cast member's must compile
				 * through one function.
				 *
				 * So the supplier is the host rather than a document, and that
				 * is exactly why declaring them matters: it is the only record
				 * that this type's input surface is wider than its edges. An
				 * undeclared key reaching a handler is indistinguishable from a
				 * typo until someone reads both files at once.
				 *
				 * `speakerName` is `text` — it is the name on the seed line and
				 * what `{{char}}` renders. `speakerCharacter` is `json`: the
				 * card, or `null` for a free-form name, which is a normal turn
				 * rather than a degraded one.
				 */
				speakerName: S.text,
				speakerCharacter: S.json,
				/**
				 * Who is speaking, as a participant reference (R-18 (3); U5g,
				 * 2026-09-16) — the turn strategy's `speaker`. Read for one
				 * thing: an **envoy** (`envoy:<slug>`) has no character row, so
				 * its card — name and description, off the genre's declaration
				 * the cast read carries — is compiled here where a cast
				 * member's would be, through the same `speakerName` /
				 * `speakerCharacter` seam a side character uses. A `character:`
				 * reference changes nothing: `currentCharacterId` already says
				 * it. Optional; unwired on the specs that seat no envoy.
				 */
				speaker: S.participantRef,
				/**
				 * The session's resolved stats and states, as
				 * `core:query/session-state@1` publishes them:
				 * `{ world, cast, locations, slots, who, version }`, already
				 * resolved down the session → lorebook → card → default chain
				 * (a location's: this run's → the entry's → default; 🚧 phase 4).
				 *
				 * A template reads `state.world.weather` and
				 * `state.cast.verity.hp` — the **resolved** value and nothing
				 * below it. Which layer a number came from is a question for
				 * the Cast member page, not for a prompt.
				 *
				 * ⚠ Declared on THIS type alone rather than in `contextPorts`,
				 * following `relationshipsPerspectives` above and for the same
				 * reason: widening the shared map moves the narrator's hash to
				 * declare a port no shipped spec fills. Unwired — which is
				 * every shipped spec today — the key is absent and the context
				 * has no `state`, which is what a chat session should have.
				 */
				state: S.json,
				/**
				 * What the person typed with the press, for an action that
				 * reads its composer text as **direction** (lair pass B17,
				 * 2026-09-27): the Lair's Trigger trap and Reveal. Rendered as
				 * `{{turnDirection}}` — the same name, and the same meaning,
				 * `build-scene-context@1` gives the Lair's reply (B11). Absent
				 * when blank, so a prompt writes `{{#if turnDirection}}…{{/if}}`
				 * and a press with nothing typed leaves it to the prompt.
				 * Declared on THIS type alone, like `state` above. Unwired on
				 * every spec whose composer text is a line somebody said.
				 */
				turnDirection: S.text,
				/**
				 * The places the lorebook holds, for an envoy that talks about
				 * the world from outside it (lair re-plan R6, 2026-09-28): the
				 * Lair's Castellan in the Sanctum. A
				 * `core:query/lorebook-entries@1` listing, rendered exactly as
				 * the planner's and the scene's port of this name is —
				 * `{{knownLocations}}` (their names) and `{{locationEntry}}`
				 * (the room the world's `location` names). Declared on THIS
				 * type alone, like `state`; unwired on every other spec.
				 */
				locationEntries: S.json,
				/**
				 * The story's newest rows, for a speaker who talks ABOUT the
				 * story from another channel (lair re-plan R6): the Castellan
				 * in the Sanctum reads `main`'s last few rows. Transcript rows
				 * (a `session-history@1` read), rendered as prose — one
				 * `Name: line` per row, named as the transcript names them, no
				 * JSON blocks — into `{{recentStory}}`, so they are background
				 * in the instructions and never turns the model continues.
				 * Absent when unwired or empty.
				 */
				recentStory: S.messages,
				/**
				 * The session's genre fields, by their own names (lair re-plan
				 * R13, 2026-09-28): `{{sanctumSteers}}` for the Castellan in
				 * the Sanctum, whose instructions say whether its talk shapes
				 * the next turn. The planner's and the scene's `fields`, on the
				 * same terms. Declared on THIS type alone, like `state`;
				 * unwired on every other spec.
				 */
				fields: S.json,
				/**
				 * The speaker's own running notes (lair re-plan R13, owner
				 * 2026-09-28): the Castellan's **scratchpad**, the Lair's annex
				 * field `castellan-scratchpad`, read for it alone
				 * (`session-annex@1`'s AI view, with its own reference as the
				 * speaker). Rendered as `{{scratchpad}}`; absent when unwired
				 * or blank. Declared on THIS type alone, like `state`.
				 */
				scratchpad: S.text,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * The narrator pipeline's context builder.
 *
 * Same implementation, same ports, different surface — see
 * `buildTemplateContext` for why that makes it a different type.
 *
 * What it drops: `exampleDialogue`, which `characterExampleDialogue` reads off
 * the speaking character and so is always empty here, and both relationship
 * variables, which the narrate spec never supplies because graph context needs
 * a speaker's perspective and a narrator has none.
 *
 * What it adds: `narratorName`. Load-bearing rather than cosmetic — it is the
 * name on the seed line the model continues from, and `{{narratorName}}` in the
 * narrator's own prompt text.
 *
 * No `declaresRandomness`: the only random choice this node ever made was which
 * example dialogue to use, and it has none to choose from.
 * @public
 */
export const buildNarratorContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-narrator-context@1',
		i18n: { name: { en: 'Build narrator context' } },
		timeoutMs: 2000,
		/** The same builder, the same payload (`TEMPLATE_CONTEXT_SCHEMA`). Policy. */
		portSchemas: { out: { main: TEMPLATE_CONTEXT_SCHEMA, templateContext: TEMPLATE_CONTEXT_SCHEMA } },
		slots: {
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: PROMPTS_DESCRIPTION,
				fields: {
					systemPrompt: { type: 'text' },
					postHistoryInstructions: { type: 'text' },
					narratorName: { type: 'text' },
				},
			},
			variables: {
				kind: 'variables',
				facet: 'variables',
				description: VARIABLES_DESCRIPTION,
				renders: { ...sharedRenders },
			},
			/** The same hook as `build-template-context` — see it for the terms. */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
			},
		},
		ports: contextPorts,
	}),
)

/**
 * The side-character pipeline's context builder (ruling 2026-09-07).
 *
 * Same implementation and the same ports as the other two, plus one in-port —
 * `sideCharacter` — and that port is the whole reason it is a third type rather
 * than a flag.
 *
 * ## Why the name is a port and not a prompt field
 *
 * `build-narrator-context@1` takes `narratorName` in its **prompts** slot,
 * which is correct there: the narrator's name is a setting, chosen once, the
 * same on every turn. A side character's name is *data from the trigger* — it
 * differs per turn and a person may type it in the modal — so putting it in a
 * prompts slot would mean editing a prompt config to speak as somebody else,
 * and every turn would render with whichever name was stored last.
 *
 * ## What it drops, and what it keeps
 *
 * Drops `exampleDialogue`, for the narrator's reason: it is read off the
 * speaking *cast member*, and a side character is not one. Drops both
 * relationship variables, because graph context is built from a cast member's
 * node and this speaker has none. Keeps every shared render, so the cards, the
 * scenario and the two name lists are laid out exactly as they are elsewhere.
 *
 * ⚠ It declares **no** `narratorName` prompt field. A side-character prompt
 * that wrote `{{narratorName}}` would render the narrator's configured name
 * into a turn the narrator is not speaking — the same "control wired to
 * nothing, in both directions" the two context builders were split to end.
 * `{{char}}` is the speaker here, exactly as it is in a reply.
 *
 * ⚠ And it does **not** inherit `contextPorts.in.currentCharacterId`, which the
 * other two carry. Not an oversight: character-lore visibility is decided by
 * the host read, which keys on the run's SCOPE, so a speaker id arriving here
 * could change whose voice the prompt is written in without changing whose lore
 * it was given — a prompt in one person's voice over another's private
 * knowledge. The port would be a control that half-works, which is the exact
 * class this whole split exists to remove. `sideCharacter` carries the name and
 * the card; the id stays where the host can act on it.
 *
 * ⚠ **The OUT-port `speaker` is the other half of that sentence** (added
 * 2026-09-17, W1). The half-working control was a speaker id that changed the
 * prompt's voice and not the lore; the repair is not an in-port but a lane
 * inside the same clause reading the answer this node already computed —
 * `core:query/character-lore@1` takes `speaker`, so the voice and its private
 * knowledge move together or not at all.
 * @experimental
 */
export const buildSideCharacterContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-side-character-context@1',
		i18n: { name: { en: 'Build side character context' } },
		timeoutMs: 2000,
		slots: {
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: PROMPTS_DESCRIPTION,
				fields: {
					systemPrompt: { type: 'text' },
					postHistoryInstructions: { type: 'text' },
				},
			},
			variables: {
				kind: 'variables',
				facet: 'variables',
				description: VARIABLES_DESCRIPTION,
				renders: { ...sharedRenders },
			},
			/** The same hook as the other two builders — see them for the terms. */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
			},
		},
		ports: {
			in: {
				cast: contextPorts.in.cast,
				/**
				 * `{ name, characterId, known, character }`, from the trigger's
				 * first step. `name` is what the seed line carries and what
				 * `{{char}}` renders; `character` is the card, absent for a
				 * free-form name, which is a normal turn rather than a degraded
				 * one — the builder falls back to the name it was given,
				 * because a typed name is all there is.
				 *
				 * Was `speaker` until 2026-09-16 — see the inlet's port of
				 * this name for why the fact moved off that word.
				 */
				sideCharacter: S.json,
				/**
				 * Where this turn is happening, as the world state says it.
				 *
				 * Declared late, and for a defect rather than for symmetry: a
				 * voice built with no place in front of it answered from
				 * whatever the transcript suggested and moved the scene to a
				 * harbour the plan had never mentioned. Unwired on every
				 * pipeline that had this node before it, so those keep the
				 * context they already had.
				 */
				state: S.json,
				/**
				 * The planner's document, for the one fact the state cannot
				 * supply on a first turn: where the scene is, before anything
				 * has written a location down.
				 */
				plan: S.json,
				/**
				 * The rooms, listed (`core:query/lorebook-entries@1`), as the
				 * planner and the scene get them (lair pass R8, 2026-09-28):
				 * `{{knownLocations}}` and the one the party stand in as
				 * `{{locationEntry}}`, so a voice can name the room it is in
				 * now that nobody narrates it first. Unwired, neither renders.
				 */
				locationEntries: S.json,
				/**
				 * A place described only in prose, as `{{locationPassage}}`
				 * (lair pass R9, 2026-09-28): the paragraph
				 * `core:task/undescribed-name@1` found describing the room the
				 * party are about to walk into (its `passage`), when no entry
				 * describes it — that room's text for this turn. Blank or
				 * unwired, it does not render.
				 */
				locationPassage: S.text,
			},
			out: {
				...contextPorts.out,
				/**
				 * Who this voice is, as a **participant reference** —
				 * `character:<id>` for a name the cast holds, null for a
				 * free-form one. Additive, 2026-09-17 (W1).
				 *
				 * The resolution already happened: this node derives the
				 * speaking character from the `sideCharacter` fact so the card,
				 * `{{char}}` and the seed line agree. Publishing it is what lets
				 * a lore lane INSIDE the same `each` be handed the same answer
				 * — `speaker: $.voices.item.context.speaker` on
				 * `core:query/character-lore@1` — rather than a second
				 * name-to-row match somewhere downstream, which is how the
				 * prompt's speaker and the lore's speaker come to disagree.
				 *
				 * ⚠ It is published, never taken: there is still no
				 * `currentCharacterId` IN-port here, for the reason the header
				 * gives. What changed is that the id the node computed is now
				 * readable, not that a spec may set it.
				 */
				speaker: S.participantRef,
			},
		},
	}),
)

/* ── The adventure genre's agent contexts ───────────────────────────────────
 *
 * Three more surfaces onto the ONE context builder, declared for the reason
 * `buildNarratorContext` states beside `buildTemplateContext`: a different
 * prompt surface is a different type. The reason is mechanical rather than
 * tidy-minded. A prompt lives in a pool keyed by (node type, slot), and
 * `defaultPromptFor` resolves **one row per pool per spec** — two nodes of the
 * same type in one pipeline must land on the same shipped prompt. A multi-agent
 * turn whose planner, narrator and state-keeper were all
 * `build-template-context@1` would therefore ship all three agents the same
 * instructions, and the person who noticed would have to fix it three times in
 * a panel rather than once in a package.
 *
 * They take `state` because that is the whole premise of the genre they serve:
 * every agent reads the bars, the world strip and the inventory as facts before
 * it writes anything. `core:task/build-template-context@1` declares the same
 * port and stays the type a spec uses when it wants the standard surface.
 */
/**
 * ⚠ Returns the literal slot keys, not `Record<string, SlotDecl>` — as
 * `loreSlots` and `relationshipSlots` do. The erased form made
 * `SlotNamesOf<typeof buildPlannerContext>` `never`, so a handler bound to the
 * three surfaces could type-check reading NO slot and declare NO slot read,
 * which is the "declares least, checked least" hole `nodeInput.ts` warns about.
 * Found when the surfaces gained `reads` declarations (R-12, 2026-09-16).
 */
const agentContextSlots = (promptFields: Record<string, { type: 'text' }>) =>
	({
		prompts: {
			kind: 'prompts',
			quick: true,
			facet: 'prompts',
			description: PROMPTS_DESCRIPTION,
			fields: promptFields,
		},
		variables: {
			kind: 'variables',
			facet: 'variables',
			description: VARIABLES_DESCRIPTION,
			renders: { ...sharedRenders },
		},
		/** The same pre-assemble hook the other three builders carry. */
		scripts: {
			kind: 'scripts',
			accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
			port: 'main',
			phase: 'after',
			description:
				'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
		},
	}) satisfies Record<string, SlotDecl>

/**
 * The planner's context: the cast, the state, and nothing about a speaker.
 *
 * A planner decides who speaks; it is not itself anybody, so
 * `currentCharacterId` is deliberately absent rather than declared and left
 * empty. What it publishes is what every other builder publishes, so the
 * planner's prompt is assembled by the same node as everyone else's.
 * @experimental
 */
export const buildPlannerContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-planner-context@1',
		i18n: { name: { en: 'Build planner context' } },
		timeoutMs: 2000,
		slots: agentContextSlots({
			systemPrompt: { type: 'text' },
			postHistoryInstructions: { type: 'text' },
		}),
		ports: {
			in: {
				cast: contextPorts.in.cast,
				state: S.json,
				/**
				 * The session's own genre fields, by key — `tone`,
				 * `difficulty` and whatever else the genre declared.
				 *
				 * On the template context under their own names, so an
				 * authored prompt writes `{{tone}}` the way it writes
				 * `{{char}}`. That is the whole round trip the genre's `fields`
				 * declaration promises: declared on the genre, edited in
				 * session settings, stored on the row, published by the input
				 * node, and read here by the agent whose wording depends on
				 * them. Without this port the last step was missing and a
				 * prompt naming `{{tone}}` rendered a blank.
				 */
				fields: S.json,
				/**
				 * What the person just sent, when the genre reads it as
				 * **direction** rather than as a line somebody said (lair pass
				 * B11, 2026-09-27) — the Lair's composer. On the template
				 * context and in the prompt as `{{turnDirection}}`; empty or
				 * absent on a turn nobody directed (a Continue), so a prompt
				 * writes `{{#if turnDirection}}…{{/if}}`. A genre whose composer
				 * text is a participant's line leaves it unwired: that line is
				 * already in the transcript. *Turn* direction, never bare
				 * `direction`: that word is the Lair's standing-note state slot
				 * (`core:slot/direction@1`), a different fact (R1, renamed
				 * 2026-09-27).
				 */
				turnDirection: S.text,
				/**
				 * The places the lorebook holds — a
				 * `core:query/lorebook-entries@1` listing of location entries
				 * (lair pass B13, 2026-09-27). On the template context as
				 * `{{knownLocations}}` (their names, one line) and
				 * `{{locationEntry}}` (the entry whose name is the world's
				 * `location` slot — where the party are, its exits included),
				 * whatever the retrieval ranking admitted: a planner that is
				 * never shown the room it stands in cannot tell an open door
				 * from an unbuilt one. Both are absent when nothing is listed.
				 */
				locationEntries: S.json,
				/**
				 * **Side talk** (lair re-plan R13, 2026-09-28): what was said on
				 * another channel since the story's last line — the Lair's
				 * Sanctum talk, read by `session-history@1` with
				 * `unplayedOnly`. Transcript rows, rendered as prose into
				 * `{{sideTalk}}` (one `Name: line` per row, as `recentStory`
				 * is), so a prompt gives it its own labelled block and it never
				 * reads as story turns. Absent when unwired or empty: the Lair
				 * wires it only while the session's _Sanctum talk steers the
				 * story_ is on.
				 */
				sideTalk: S.messages,
				/**
				 * The planner's own running notes (lair re-plan R13, owner
				 * 2026-09-28): the Castellan's **scratchpad**, rendered as
				 * `{{scratchpad}}`. Absent when unwired or blank; the Lair
				 * wires it beside `sideTalk`.
				 */
				scratchpad: S.text,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * The narrator's context for a planned turn — the one builder that takes a
 * **plan**.
 *
 * `plan` is the only genuinely new thing in this file's three types: the
 * structured object the planning step produced, put on the template context
 * under `plan` so the narrator's story string can render its beats and its
 * world hints. It is a port rather than a nested literal on `state` because the
 * two are different facts and a template author should be able to tell which is
 * which — `state.world.weather` is what the world IS, `plan.worldHints` is what
 * this turn was asked to make of it.
 *
 * `narratorName` rides the prompts slot, as it does on `build-narrator-context@1`
 * and for the same reason: it is the name on the seed line the model continues
 * from, which is a setting somebody stored rather than data a trigger carried.
 * @experimental
 */
export const buildSceneContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-scene-context@1',
		i18n: { name: { en: 'Build scene context' } },
		timeoutMs: 2000,
		slots: agentContextSlots({
			systemPrompt: { type: 'text' },
			postHistoryInstructions: { type: 'text' },
			narratorName: { type: 'text' },
		}),
		ports: {
			in: {
				cast: contextPorts.in.cast,
				state: S.json,
				/** What the planning step decided this turn is about. */
				plan: S.json,
				/**
				 * The session's own genre fields, by key — `tone`,
				 * `difficulty` and whatever else the genre declared.
				 *
				 * On the template context under their own names, so an
				 * authored prompt writes `{{tone}}` the way it writes
				 * `{{char}}`. That is the whole round trip the genre's `fields`
				 * declaration promises: declared on the genre, edited in
				 * session settings, stored on the row, published by the input
				 * node, and read here by the agent whose wording depends on
				 * them. Without this port the last step was missing and a
				 * prompt naming `{{tone}}` rendered a blank.
				 */
				fields: S.json,
				/**
				 * What the person just sent, when the genre reads it as
				 * **direction** rather than as a line somebody said (lair pass
				 * B11, 2026-09-27) — the Lair's composer. On the template
				 * context and in the prompt as `{{turnDirection}}`; empty or
				 * absent on a turn nobody directed (a Continue), so a prompt
				 * writes `{{#if turnDirection}}…{{/if}}`. A genre whose composer
				 * text is a participant's line leaves it unwired: that line is
				 * already in the transcript. *Turn* direction, never bare
				 * `direction`: that word is the Lair's standing-note state slot
				 * (`core:slot/direction@1`), a different fact (R1, renamed
				 * 2026-09-27).
				 */
				turnDirection: S.text,
				/**
				 * The places the lorebook holds — a
				 * `core:query/lorebook-entries@1` listing of location entries
				 * (lair pass B13, 2026-09-27). On the template context as
				 * `{{knownLocations}}` (their names, one line) and
				 * `{{locationEntry}}` (the entry whose name is the world's
				 * `location` slot — where the party are, its exits included),
				 * whatever the retrieval ranking admitted: a planner that is
				 * never shown the room it stands in cannot tell an open door
				 * from an unbuilt one. Both are absent when nothing is listed.
				 */
				locationEntries: S.json,
				/**
				 * **Side talk** (lair re-plan R13, 2026-09-28), on the
				 * planner's terms: the Lair's Sanctum talk since the story's
				 * last line, rendered as prose into `{{sideTalk}}` — for the
				 * Castellan's narration, wired while the session's _Sanctum
				 * talk steers the story_ is on, or when Narrate was pressed in
				 * the Sanctum. Absent when unwired or empty.
				 */
				sideTalk: S.messages,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * The state-keeper's context: the state as it stands, so the keeper can report
 * only what the scene changed about it.
 *
 * Its own type rather than the planner's because the two read the same facts
 * for opposite purposes — one is deciding what should happen, the other is
 * writing down what did — and a shared pool would ship them one set of
 * instructions.
 * @experimental
 */
export const buildKeeperContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-keeper-context@1',
		i18n: { name: { en: 'Build state keeper context' } },
		timeoutMs: 2000,
		slots: agentContextSlots({
			systemPrompt: { type: 'text' },
			postHistoryInstructions: { type: 'text' },
		}),
		ports: {
			in: {
				cast: contextPorts.in.cast,
				state: S.json,
				/**
				 * The reply this keeper is reading, as text — put on the
				 * template context under `reply`, because the thing a keeper
				 * reports on is the scene that was just written and the
				 * transcript does not contain it yet.
				 */
				reply: S.text,
				/**
				 * ⚠ **An ORDERING edge, and nothing else reads it.**
				 *
				 * A state change is anchored to the newest message in the
				 * session, which is how a swipe takes its changes back with it.
				 * So the keeper has to run AFTER the reply is written, not
				 * merely beside it — and in a graph whose order is its edges,
				 * the only way to say "after that write" is to take the write's
				 * result on a port. It is the write result rather than the text
				 * for exactly that reason: the text exists before the write and
				 * would order nothing.
				 *
				 * ⚠ Typed `json`, NOT `write-result@1`, and the difference is
				 * the standing rule rather than a convenience.
				 * `core:shape/write-result@1` is deliberately accepted nowhere:
				 * under async review a write is a proposal a reviewer may still
				 * reject, so a port declaring that shape is a port promising to
				 * handle both arms of it. This node handles neither — it never
				 * looks inside — and declaring the shape would claim otherwise.
				 * `json` is the honest type for a value taken as opaque, and
				 * write results are assignable to it like everything else.
				 */
				afterWrite: S.json,
				/**
				 * The session's own genre fields, by key — `tone`,
				 * `difficulty` and whatever else the genre declared.
				 *
				 * On the template context under their own names, so an
				 * authored prompt writes `{{tone}}` the way it writes
				 * `{{char}}`. That is the whole round trip the genre's `fields`
				 * declaration promises: declared on the genre, edited in
				 * session settings, stored on the row, published by the input
				 * node, and read here by the agent whose wording depends on
				 * them. Without this port the last step was missing and a
				 * prompt naming `{{tone}}` rendered a blank.
				 */
				fields: S.json,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * Chat rows into the objects a template renders.
 *
 * A Task rather than part of the history Query, because naming a message —
 * which participant said it, under what name at the time — is a *decision*, and
 * decisions are the things a plugin should be able to replace. The Query returns
 * rows; this says who spoke.
 * @public
 */
export const processMessages = pin(
	describeTaskDefinition({
		id: 'core:task/process-messages@1',
		i18n: { name: { en: 'Process messages' } },
		timeoutMs: 1000,
		slots: {
			/**
			 * The message-rewrite hook (18 §4a), on the *processed* list —
			 * names resolved, per-message interpolation done. `transform` only:
			 * `messages/inject` deliberately does **not** live here. Injection
			 * is a statement about *position in the rendered conversation*, and
			 * position belongs to the template (§20, ruling of 2026-08-23) —
			 * inject chains attach on the context builders, land as
			 * `context.injections`, and the template's own loop renders them.
			 * Splicing rows into this list would be a position the template
			 * cannot express and an author cannot see.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:messages/transform@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over the message list the model will see — rewrite or drop lines. Reminders at a depth attach on the context step instead.',
			},
		},
		ports: {
			in: {
				messages: S.messages,
				cast: S.sessionCast,
				templateContext: S.templateContext,
				seedName: S.text,
				/**
				 * Text the model is being asked to CONTINUE — the seed line's
				 * body rather than a message of its own (ruling 2026-09-08,
				 * D-2).
				 *
				 * ⚠ **Absent on an ordinary turn, and that is the normal case.**
				 * There is no `optional` marker for a port: a port nothing wires
				 * resolves to `undefined`, the seed line renders empty, and the
				 * model starts the reply. Every spec but an extend leaves it
				 * unwired on purpose.
				 *
				 * It is a port rather than a second synthetic message because a
				 * partial reply is not a turn: appending it as one produces two
				 * consecutive assistant entries on a chat endpoint and a
				 * wrongly-closed block on a completion one. The seed is the one
				 * place in the prompt whose block is deliberately left open
				 * (`includeClose: false` for id -2), which is exactly what a
				 * continuation needs.
				 *
				 * ⚠ It is **not** a stored message, and nothing downstream may
				 * treat it as one. The row holding it is `isGenerating` and is
				 * excluded from every message read, so lore scans, semantic and
				 * entity queries and history windows do not see it. It counts
				 * against the token budget, because it is in the prompt.
				 */
				continuationPrefill: S.text,
			},
			out: { main: S.messages, messages: S.messages },
		},
	}),
)

/**
 * The conversation as PROSE, for a step that reads it rather than takes a turn.
 *
 * Two differences from `process-messages@1`, and both are properties of the
 * transcript rather than of the request, which is why they live here and not on
 * the Provider: by the time a prompt is rendered for a completion wire the
 * conversation is one string with an open block at the end of it, and nothing
 * downstream can take either of them back out.
 *
 *   · **No seed.** `process-messages@1` ends its list with an empty assistant
 *     line carrying the next speaker's name, because that line is what tells a
 *     model whose turn it is. A planner and a state keeper are not taking a
 *     turn, and a prompt that ends `Verity:` asks for Verity's next paragraph
 *     however plainly the instructions asked for JSON.
 *   · **No JSON blocks.** A reply that carried a document at the end of it
 *     teaches the next turn's planner its own schema and the keeper somebody
 *     else's. The cut happens on the way into the prompt and never on the
 *     stored row — see `prompt/jsonBlocks.ts`.
 *
 * Everything else is the same naming and the same interpolation, from the same
 * implementation: who spoke, under what name at the time, reaching through
 * participants who have since left.
 * @public
 */
export const proseTranscript = pin(
	describeTaskDefinition({
		id: 'core:task/prose-transcript@1',
		i18n: { name: { en: 'Transcript as prose' } },
		timeoutMs: 1000,
		ports: {
			in: {
				messages: S.messages,
				cast: S.sessionCast,
				templateContext: S.templateContext,
			},
			out: { main: S.messages, messages: S.messages },
		},
	}),
)

/**
 * The turn-order pool, orderer and strategies (PLAN-turn-order §4.4, R3/R8;
 * re-ported in place 2026-09-22, pre-release).
 *
 * Turn order is **state**, not a decision made inside the reply run
 * (§3). One spec per genre — `core:spec/<genre>-turn-order` — answers a session event by
 * reading the cast and the history, pooling who *may* be seated, ordering
 * them, turning them into entries, and writing the result to
 * `sessions.metadata.turnOrder`. The reply run then fires an entry; it
 * decides nothing.
 *
 * Three node families, composable in that order:
 *
 * - **the pool** (`turn-pool`) decides who may be seated at all, from the
 *   settings document's cast. Its params are the genre's and the session's
 *   to set; its floors are not (a removed row is never a candidate, and an
 *   `on-action` envoy speaks only through its action).
 * - **an orderer** (`turn-mentioned`) rewrites the candidate list's order
 *   and hands on the same shape, so any number of them compose.
 * - **a strategy** turns candidates into *entries*: who speaks, where, and
 *   what to fire. It is the last node before the write.
 *
 * ⚠ **No `speaker` in-port, and no halt** (§4.4, §6). An explicit pick never
 * enters a strategy — a person's pick is fired directly (`fireTurnEntry`,
 * §4.6) and the next recompute sees the row it produced — and a strategy
 * that seats nobody publishes an **empty order**, which is an answer. The
 * halt (`nobody is due`) and the `characterId` port went with the decider
 * they belonged to.
 */
const turnStrategy = <Id extends string>(id: Id, label: string, extras: object = {}) =>
	describeTaskDefinition({
		id,
		i18n: { name: { en: label } },
		timeoutMs: 1000,
		...extras,
		ports: {
			in: {
				/** Who may be seated — the pool's output, through any orderers. */
				candidates: S.turnCandidates,
				/** The session's visible history, ascending. */
				messages: S.messages,
			},
			out: {
				/**
				 * The prepared turns, in order. `main` and `order` carry the
				 * same value: `main` is what the shape-based swap list keys
				 * on (a strategy is a node publishing `turn-entries@1`), and
				 * `order` is what `set-turn-order` is wired from, named for
				 * what it is.
				 */
				main: S.turnEntries,
				order: S.turnEntries,
			},
		},
	})

/**
 * Round robin: the candidates that have not spoken since the last user row,
 * in candidate order. A character spoke when a non-hidden, non-narrator row
 * after the last user row carries its id; an envoy when `metadata.speaker`
 * carries its reference; a persona when a user row carries its `personaId`
 * — which is how a session knows it is the person's turn (R15).
 * @experimental
 */
export const turnRoundRobin = pin(turnStrategy('core:task/turn-round-robin@1', 'Round robin'))
/**
 * A seeded uniform pick over the not-yet-spoken candidates — one entry.
 * `declaresRandomness`, so a replayed run re-rolls identically; an
 * unrelated recompute may roll differently, which is documented rather than
 * prevented (§4.4).
 * @experimental
 */
export const turnRandom = pin(
	turnStrategy('core:task/turn-random@1', 'Random', {
		declaresRandomness: true,
	}),
)
/**
 * Round robin over the candidates whose `ownerUserId` is the last sender's,
 * so one person's cast completes a turn before another's; plain round robin
 * when that set is empty. The rule narrows, it never starves.
 * @experimental
 */
export const turnUserSplit = pin(
	turnStrategy('core:task/turn-user-split@1', 'Round robin by user'),
)
/**
 * Round robin, with the `select` point free to rewrite it: the host hands
 * `{ order, candidates, lastSpeaker, sinceUser }` to a
 * `core:script:turn/select@1` chain and keeps the entries it returns whose
 * `ref` is a candidate — a script cannot seat somebody the pool did not
 * admit, and a refusal is a receipt note. Entries the chain changed carry
 * `via: 'script'`.
 * @experimental
 */
export const turnScripted = pin(
	turnStrategy('core:task/turn-scripted@1', 'Scripted', {
		scriptPoints: [
			{
				key: 'select',
				accepts: ['core:script:turn/select@1'],
				label: { en: 'Order the turns' },
				description: {
					en: 'Scripts that rewrite the prepared order, in order — each is handed the order so far and hands one back.',
				},
			},
		],
	}),
)
/** Always an empty order: nothing is prepared, and every turn is a press. @experimental */
export const turnManual = pin(turnStrategy('core:task/turn-manual@1', 'Manual'))
/**
 * One entry in the pipeline's own voice (`{ ref: null, via: 'voice' }`) when
 * the last row is a user row, else empty. How a planner genre — Adventure,
 * the Lair, Whodunit — gets exactly one reply per send with no cast in the
 * pool at all.
 * @experimental
 */
export const turnNarrator = pin(
	turnStrategy('core:task/turn-narrator@1', 'Narrator replies'),
)

/**
 * **The model decides who speaks** (PLAN-turn-order R41, M4): the oracle on
 * the turn-order spec's optional model path (`decide.model.advise`). Same
 * ports as a strategy — candidates and the visible history in, prepared turn
 * entries out on `main` and `order` — so the junction's result port reads
 * the same whichever path fired. Its answer is held to the candidates: a
 * ref the pool did not admit is dropped with a note, and an answer that
 * names nobody (or no answer at all) falls back to round robin, noted —
 * never a halt, so a model hiccup never leaves a session without an order.
 *
 * A plugin's own model strategy is a swap for this node: an oracle with
 * these ports and these three slots (the fit check holds it to them).
 * @experimental
 */
export const turnAdvise = pin(
	describeOracleDefinition({
		id: 'core:oracle/turn-advise@1',
		i18n: {
			name: { en: 'Model decides who speaks' },
			description: {
				en: 'Asks the model who should speak next, from the cast that may be seated and the recent conversation. Falls back to round robin when the answer names nobody.',
			},
		},
		shape: S.textGen,
		effects: 'external',
		review: { fields: [] },
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required (the `ctx.can` ruling, as
				 * generate-json): the answer's schema goes out through the
				 * strongest door the connection has — json_schema (natively or
				 * as a grammar), then json_object — and the prompt's own
				 * words are the rung that works everywhere.
				 */
				optional: ['json_schema', 'json_object'],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { turnAdvice: { type: 'text' } },
			},
		},
		ports: {
			in: { candidates: S.turnCandidates, messages: S.messages },
			out: { main: S.turnEntries, order: S.turnEntries },
		},
	}),
)

/**
 * The pool (§4.4): who *may* be seated this recompute, from the settings
 * document's cast and the history.
 *
 * Its four params are the whole of a genre's or a session's say over
 * eligibility. Two floors are not params, because a param that could
 * override them would be a way to seat somebody who has left: a row with
 * `removedAt` is never a candidate, and an envoy declared `speaks:
 * 'on-action'` is never a candidate — it speaks through its action's
 * outputs alone.
 *
 * Output order is characters by `position`, then personas by `position`,
 * then envoys by `position`. An orderer may rewrite it; a strategy reads it
 * as given.
 * @experimental
 */
export const turnPool = pin(
	describeTaskDefinition({
		id: 'core:task/turn-pool@1',
		i18n: { name: { en: 'Turn pool' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					characters: {
						type: 'enum',
						of: ['active', 'all', 'none'],
						members: [
							{
								key: 'active',
								label: { en: 'Active' },
								description: { en: 'The characters switched on in the cast.' },
							},
							{
								key: 'all',
								label: { en: 'All' },
								description: { en: 'Ones switched off in the cast too.' },
							},
							{ key: 'none', label: { en: 'None' } },
						],
						default: 'active',
						label: { en: 'Characters' },
						description: {
							en: "Which of the session's characters may take a turn. 'All' admits ones switched off in the cast; a removed character never is.",
						},
					},
					personas: {
						type: 'enum',
						of: ['none', 'all', 'others'],
						members: [
							{ key: 'none', label: { en: 'None' } },
							{
								key: 'all',
								label: { en: 'All' },
								description: { en: 'Everyone in the session.' },
							},
							{
								key: 'others',
								label: { en: 'Others' },
								description: { en: 'Everyone but whoever just wrote.' },
							},
						],
						default: 'all',
						label: { en: 'Personas' },
						description: {
							en: "Whether the people in the session appear in the order. A person's entry is shown as their turn and never generated — that is how a session says it is your turn. 'Others' leaves out whoever just wrote.",
						},
					},
					envoys: {
						type: 'enum',
						of: ['in-turn', 'none', 'only', 'except'],
						members: [
							{
								key: 'in-turn',
								label: { en: 'Those that take turns' },
								description: {
									en: 'Envoys declared to speak in turn; one that speaks only on an action never does.',
								},
							},
							{ key: 'none', label: { en: 'None' } },
							{
								key: 'only',
								label: { en: 'Only' },
								description: { en: 'Only the envoys in the list below.' },
							},
							{
								key: 'except',
								label: { en: 'Except' },
								description: { en: 'Every envoy but those in the list below.' },
							},
						],
						default: 'in-turn',
						label: { en: 'Envoys' },
						description: {
							en: "Which of the genre's envoys may take a turn. 'Only' and 'Except' read the list below.",
						},
					},
					envoySlugs: {
						type: 'string',
						list: true,
						default: [],
						label: { en: 'Envoy list' },
						description: {
							en: "The envoys 'Only' admits, or 'Except' leaves out. Ignored otherwise.",
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** The settings document's cast, envoys included (§4.12). */
				cast: S.sessionCast,
				/** The session's visible history, ascending. */
				messages: S.messages,
			},
			out: { main: S.turnCandidates },
		},
	}),
)

/**
 * The first orderer (R8): mentioned candidates sort to the front.
 *
 * A composable node rather than a seventh strategy, because "who was named"
 * and "whose turn it is" are two questions — a session can have the
 * mentioned rule under round robin, under user-split or under a plugin's
 * strategy by placing this before any of them.
 *
 * Case-insensitive whole-word match of each candidate's `name` and
 * `nickname` against the most recent `lookback` **user** rows; mentioned
 * candidates move to the front ordered by first mention, and the rest keep
 * the order they arrived in. The receipt records `mentioned`. (A
 * gazetteer-backed match is a later improvement; this is names.)
 * @experimental
 */
export const turnMentioned = pin(
	describeTaskDefinition({
		id: 'core:task/turn-mentioned@1',
		i18n: { name: { en: 'Mentioned first' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					lookback: {
						type: 'integer',
						default: 1,
						min: 1,
						label: { en: 'Messages scanned' },
						description: {
							en: 'How many of your most recent messages are read for names.',
						},
					},
				},
			},
		},
		ports: {
			in: { candidates: S.turnCandidates, messages: S.messages },
			out: { main: S.turnCandidates },
		},
	}),
)

/**
 * An author defaulting review ON for their own consumer — and unable to forbid it (F14).
 *
 * Bound 2026-09-17 (plans/29 R-2): the host's commit for it existed and no
 * binding reached it. `target` is the row the part lands on — the same port
 * `update-message` takes, fed from an earlier write in the document (the reply's
 * placeholder, R-17) or from the inlet's `messageId`. An update whose target is
 * an earlier write is the same row, so placing this after `create-message` is
 * one live row, not two (F7). The host reads the id off `target`, or off the
 * media reference's own `messageId` where a caller outside the graph set one.
 * @experimental
 */
export const attachImage = pin(
	describeOutletDefinition({
		id: 'core:outlet/attach-image@1',
		effects: 'write',
		/** The image is a reference to an asset this run rendered; nothing to retype (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 5000,
		reviewDefault: 'on',
		causesEvent: 'core:event/message-updated@1',
		ports: { in: { target: S.rowIds, image: S.image }, out: { main: S.writeResult } },
	}),
)

/**
 * Tool calling's two pure halves (20 §9). A *tool* is any same-shaped
 * provider — a sandboxed plugin hook canonically — and these tasks only
 * decide how the model learns about it and how its answer is read back.
 * Between them sits the ordinary generate step; around them sits the loop
 * block, whose iterations are the receipted agentic turn.
 * @experimental
 */
export const advertiseTools = pin(
	describeTaskDefinition({
		id: 'core:task/advertise-tools@1',
		i18n: { name: { en: 'Advertise tools' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					style: {
						type: 'enum',
						of: ['native', 'prompt'],
						members: [
							{
								key: 'native',
								label: { en: 'Native tool calling' },
								description: { en: "Hands the declarations to the API's own tool-calling." },
							},
							{
								key: 'prompt',
								label: { en: 'In the prompt' },
								description: { en: 'Writes them into the context, for models without tool-calling.' },
							},
						],
						default: 'prompt',
						description:
							"How the model learns its tools: natively through the API's own tool-calling, or written into the prompt for models without one.",
					},
				},
			},
		},
		ports: {
			// [{ name, description, parameters }] — parameters as JSON Schema.
			in: { tools: S.json },
			out: { main: S.json, native: S.json, prompt: S.text },
		},
	}),
)

/** @experimental */
export const parseToolCall = pin(
	describeTaskDefinition({
		id: 'core:task/parse-tool-call@1',
		i18n: { name: { en: 'Parse tool call' } },
		timeoutMs: 500,
		ports: {
			in: { text: S.text, tools: S.json },
			// `call` is { tool, args } | null — null is the loop's exit
			// predicate, not an error: a reply with no call is the model being
			// done. `text` is the reply with the call block stripped, so what
			// renders is prose and what dispatches is data.
			out: { main: S.json, call: S.json, text: S.text },
		},
	}),
)

/**
 * Which tools this session can call, and how each one is described to a model.
 *
 * A Query rather than a literal on `advertise-tools`, because the answer is
 * not a property of the spec: the core tools are fixed, but an install's
 * extensions are not, and a spec that listed its tools by hand would advertise
 * a tool an uninstalled plugin no longer provides — and refuse, by name, the
 * one that was installed yesterday.
 *
 * Each entry is `{ name, description, parameters }` with `parameters` as JSON
 * Schema, which is the shape `advertise-tools` takes and the shape every
 * native tool API wants. Nothing here executes anything; `run-tool` does that,
 * and refuses any name this list did not carry.
 * @experimental
 */
export const availableTools = pin(
	describeQueryDefinition({
		id: 'core:query/available-tools@1',
		i18n: { name: { en: 'Available tools' } },
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					include: {
						type: 'string[]',
						description:
							'Offer only these tools, by name, in this order. Empty offers every tool the session has.',
					},
					plugins: {
						type: 'boolean',
						default: true,
						description:
							"Offer tools contributed by the session's enabled extensions, as well as the built-in ones.",
					},
				},
			},
		},
		ports: { in: { scope: S.sessionScope }, out: { main: S.json, tools: S.json } },
	}),
)

/**
 * Run the tool the model asked for, and hand the answer back as text it can
 * read on the next pass (20 §9).
 *
 * ## Why this is a Provider and not a Task
 *
 * The two halves either side of it are pure and this one cannot be: a tool
 * reads the session, or reaches an extension's sandboxed hook, which may in
 * turn reach the network under its own grants. That is `effects: 'external'`
 * exactly — and it is the kind that is handed `ctx.call`, so the tool's own
 * dispatch stays behind the host seam where every other outward call lives.
 * A Task with database access would be a second, unaudited read path.
 *
 * ## What it refuses, and what it never throws
 *
 * `tools` is the advertisement the model was actually given, so a name that
 * was never offered is refused **by name** rather than resolved: a model
 * inventing a tool must not be able to reach one that exists but was withheld
 * from this step.
 *
 * A tool that fails is a **result, not an exception**. `main` is
 * `{ tool, error }` and `text` renders it, because the model asking for a
 * missing file needs to read "no such file" and try something else — a throw
 * would end the run at the one moment the agent could have recovered. The
 * type's `timeoutMs` is the time-box per call: one node invocation is one
 * tool, so the executor's own timeout already is the tool's.
 *
 * `call` may be null — that is the ordinary last iteration, where the model
 * answered in prose and the loop is about to stop. Nothing runs and `text` is
 * empty.
 * @experimental
 */
export const runTool = pin(
	describeOracleDefinition({
		id: 'core:oracle/run-tool@1',
		i18n: { name: { en: 'Run tool' } },
		effects: 'external',
		/** The call was the model's and the tool list the install's: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 30000,
		ports: {
			// `call` is parse-tool-call's `{ tool, args } | null`; `tools` is
			// advertise-tools' input, so refusal reads the same list the model
			// saw; `text` is the prose parse-tool-call stripped the call out of.
			in: { call: S.json, tools: S.json, text: S.text },
			/**
			 * Three ports because an iteration produces up to three different
			 * things and one port carrying two of them is a port a downstream
			 * node has to interrogate.
			 *
			 *  - `main` — `{ tool, result }` or `{ tool, error }`, or null when
			 *    nothing was called. One shape, two arms, so nothing downstream
			 *    decides what happened by looking for a missing key.
			 *  - `text` — that rendered as the tool-result block **the next
			 *    prompt carries**. Empty when nothing ran.
			 *  - `answer` — what this iteration contributes to the
			 *    **conversation**: the model's prose, and only on the iteration
			 *    that called no tool, which is the one where the model stopped
			 *    working and answered. Empty otherwise, so joining every
			 *    iteration's `answer` yields the turn's reply and nothing else.
			 */
			out: { main: S.json, text: S.text, answer: S.text },
		},
	}),
)

/**
 * A repeated block's outputs, as one string.
 *
 * The missing half of `map` and `loop`. Both publish a **list** — `values`, one
 * entry per iteration — and everything that writes (a message, a lore entry)
 * takes a scalar, so every spec that repeats anything has needed this and
 * every spec has had to end at the block. Reducing in a Consumer instead would
 * put the join inside the write, where no receipt can show it and no author
 * can change it.
 *
 * `path` is what makes it usable on a block: an iteration's value is that
 * chain's last node's **ports object**, so the interesting text is at
 * `.text` or `.answer` rather than at the top. Empty entries are skipped
 * rather than joined, which is what makes "every iteration's answer, and only
 * the iteration that had one" a wiring rather than a filter node.
 * @experimental
 */
export const joinText = pin(
	describeTaskDefinition({
		id: 'core:task/join-text@1',
		i18n: { name: { en: 'Join text' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					path: {
						type: 'string',
						default: 'text',
						description:
							'Which key to read off each entry. Empty reads the entry itself, for a list of plain strings.',
					},
					separator: {
						type: 'string',
						default: '\n\n',
						description: 'What goes between the entries that had something to say.',
					},
				},
			},
		},
		ports: { in: { items: S.json }, out: { main: S.text, text: S.text } },
	}),
)

/**
 * A document's lists, as one **folded section** a reply carries collapsed
 * (lair pass B5, decision D5, 2026-09-27).
 *
 * The producer the message outlets' `sections` in-port was built for: a
 * planner's document is structure, and the person reading the reply wants its
 * beats and speakers as a short list under a "Plan" heading — never the JSON,
 * and never in the body. `path` names the keys read, comma-separated and in
 * order; each list entry becomes one line, and an object entry reads as its
 * own text values joined with ` — ` (`sectionItemsOf` in the SDK is the one
 * reading). A document with nothing to list publishes an empty list, which a
 * write takes as "no sections".
 *
 * `kind` and `label` are parameters, not ports: they are what the section IS,
 * chosen by whoever wires it, and a model never names them.
 * @experimental
 */
export const listSection = pin(
	describeTaskDefinition({
		id: 'core:task/list-section@1',
		i18n: { name: { en: 'List section' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					path: {
						type: 'string',
						default: '',
						description:
							'Which keys of the document to list, comma-separated and in order. Empty lists the document itself.',
					},
					kind: {
						type: 'string',
						default: 'notes',
						description: "The section's kind: a lowercase slug such as 'plan'.",
					},
					label: {
						type: 'string',
						default: 'Notes',
						description: "The heading the section's button shows.",
					},
				},
			},
		},
		ports: {
			in: { json: S.json },
			out: {
				main: S.foldedSections,
				sections: S.foldedSections,
				/**
				 * The same lines as a markdown list, one `- ` item per line
				 * (lair pass R8, 2026-09-28) — for a message whose BODY is the
				 * list: the Lair's beats row in the Sanctum. Empty when
				 * nothing was listed.
				 */
				text: S.text,
			},
		},
	}),
)

/**
 * A list, split into its **first** item and the **rest**, in order (lair pass
 * R8, 2026-09-28).
 *
 * A data reference is `{node, port}` with no sub-path, and `parse-json@1`'s
 * `path` selects a key or an index but never a tail — so a spec that treats
 * the first of a list differently from the others (the Lair's lead delver,
 * whose line streams into the run's live row, before the rest of the party
 * speak in an `each`) had no way to name "all but the first". Pure: no read,
 * no model, 1 ms.
 *
 * `first` is absent on an empty list, so a junction on it skips the step
 * that needs one; `rest` is always a list — empty on a list of one or none —
 * so an `each` wired to it never has to defend itself. Anything that is not
 * a list is a list of one.
 * @experimental
 */
export const splitFirst = pin(
	describeTaskDefinition({
		id: 'core:task/split-first@1',
		i18n: { name: { en: 'Split first' } },
		timeoutMs: 500,
		ports: {
			in: { items: S.json },
			out: { main: S.json, first: S.json, rest: S.json },
		},
	}),
)

/**
 * A model's JSON answer, read back as data.
 *
 * ## Why a Task and not a shape on the Provider
 *
 * `core:oracle/generate-text@1` is published and frozen, and it publishes
 * prose. A pipeline that wants structure out of a model therefore needs one
 * more step, and that step is the honest place for every way the reading can
 * fail: a fenced block, a preamble the model could not resist, a reply cut off
 * by the token limit. Put inside the Provider it would be a second job hidden
 * in the node that calls the model; here it is a node on the receipt, with its
 * own timing and its own halt.
 *
 * ## `path` is what makes the result WIREABLE
 *
 * A data reference is `{node, port}` — there is no sub-path — so a downstream
 * `map` cannot iterate `plan.speakers` off a port carrying the whole document.
 * `path` is the answer: the parsed document is always on `json`, and `value`
 * and `items` carry whatever `path` selects, so one node serves both the step
 * that reads the whole plan and the block that iterates one list inside it.
 * `items` is `value` as a list — an absent or single value becomes an empty or
 * one-element list, so a map wired to it never has to defend itself.
 *
 * ## It halts rather than inventing an empty answer
 *
 * A reply this node cannot read is a model that did not do what it was asked,
 * and an empty object published as though it were an answer would travel
 * downstream as "nothing changed" — indistinguishable from a turn where
 * genuinely nothing did. `optional: true` on the node is how a spec says it can
 * live without the structure; the executor then records `recoveredAsEmpty` and
 * a reader can see which one happened.
 * @experimental
 */
export const parseJson = pin(
	describeTaskDefinition({
		id: 'core:task/parse-json@1',
		i18n: { name: { en: 'Read JSON' } },
		timeoutMs: 1000,
		/**
		 * A reply nobody can read subtracts the structure and nothing else.
		 *
		 * The binding answers `err` with the reason, the executor absorbs it as
		 * `recoveredAsEmpty`, and every downstream port reads absent: a `map`
		 * over the missing list runs zero times, a template renders no block. So
		 * a model that ignored the schema costs a turn its plan, not its reply —
		 * which is the same "an unavailable mechanism subtracts a signal, it
		 * never disables a path" rule retrieval already works by.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					path: {
						type: 'string',
						quick: true,
						description:
							'Which value inside the answer to publish on `value` and `items`, as a dotted path. Empty publishes the whole answer.',
					},
				},
			},
		},
		ports: {
			in: { text: S.textStream },
			out: {
				main: S.json,
				/** The whole parsed document, whatever `path` says. */
				json: S.json,
				/** The value at `path` — the document itself when `path` is empty. */
				value: S.json,
				/** That same value as a list, for a `map` to iterate. */
				items: S.json,
			},
		},
	}),
)

/** @internal */
export const roll = pin(
	describeTaskDefinition({
		id: 'chariot.dice-tray:roll@1',
		i18n: { name: { en: 'Roll dice' } },
		timeoutMs: 200,
		declaresRandomness: true,
		ports: {
			in: { notation: S.text },
			out: { main: S.json, total: S.json },
		},
	}),
)

/** @internal */
export const gate = pin(
	describeTaskDefinition({
		id: 'test:task/gate@1',
		timeoutMs: 500,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

/** @internal */
export const slow = pin(
	describeTaskDefinition({
		id: 'test:task/slow@1',
		timeoutMs: 30,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

/** @internal */
export const passthrough = pin(
	describeTaskDefinition({
		id: 'test:task/passthrough@1',
		timeoutMs: 500,
		toggleable: true,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

/** @internal */
export const badToggleable = pin(
	describeTaskDefinition({
		id: 'test:task/bad-toggleable@1',
		timeoutMs: 500,
		toggleable: true,
		ports: { in: { main: S.text }, out: { main: S.image } },
	}),
)

// ── Providers — identical structure across three modalities (17 §2) ─────────

/** @experimental */
export const embedText = pin(
	describeOracleDefinition({
		id: 'core:oracle/embed-text@1',
		shape: S.embeddings,
		effects: 'external',
		/** Nothing to edit: an embedding of a text somebody else wrote (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 5000,
		/**
		 * ⚠ **Producing nothing is a legitimate outcome, and this is what makes
		 * that structural rather than careful.**
		 *
		 * Embeddings are optional in this product by design: most installs have
		 * no model loaded, and the retrieval plan's second governing rule is an
		 * absolute — *an unavailable mechanism subtracts a signal; it never
		 * reroutes, disables a path, or excludes a candidate.* The host answers
		 * "no embedding model is loaded and validated" by **throwing**, which is
		 * the right answer to give a caller and the wrong thing to let end a
		 * turn.
		 *
		 * `optional` is what turns that error into an empty `ok` in the executor
		 * — recorded, with `recoveredAsEmpty` and the reason on the receipt, so
		 * it is tolerated rather than hidden. The binding's `enabled` parameter
		 * decides how *loudly*: `auto` treats an unavailable model as an absence
		 * and returns no vectors without calling it a failure, `on` lets the
		 * failure be recorded as one. Neither can cost somebody a reply, and
		 * that is the point of putting the guarantee here instead of in a
		 * `try`.
		 *
		 * It also earns the node a "Use this source" switch, which is the
		 * zero-cost way to turn the semantic mechanism off entirely on an install that
		 * has a model and does not want it spent on retrieval.
		 */
		optional: true,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.embeddings,
				// The two production rows carrying `modality: 'embeddings'` fell
				// through every modality switch in the app; `text->embedding` is
				// the home they never had.
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.embedding] })],
			},
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * `shared`: one switch for every embed step of a spec (R-7
					 * P2). `respond` puts it on the semantic mechanism's embed
					 * and the entity-vector mechanism's embed reads it through
					 * `slot.params({ node })` — an install with no embedding
					 * model switches both off in one place, which is the only
					 * reading of "embedding: off" a person means.
					 */
					enabled: {
						type: 'enum',
						of: ['auto', 'on', 'off'],
						members: [
							{
								key: 'auto',
								label: { en: 'Automatic' },
								description: {
									en: 'Embeds when a model is loaded; without one, retrieval goes on without vectors.',
								},
							},
							{
								key: 'on',
								label: { en: 'On' },
								description: {
									en: 'Always embeds; a missing model is recorded as a failure, and the reply still goes out.',
								},
							},
							{
								key: 'off',
								label: { en: 'Off' },
								description: { en: 'Never embeds: semantic matching is switched off.' },
							},
						],
						default: 'auto',
						shared: true,
					},
				},
			},
		},
		ports: {
			in: {
				text: S.text,
				/** Batched: one call, one vector each, in order. */
				texts: S.json,
			},
			out: { main: S.vector, vector: S.vector, vectors: S.json },
		},
	}),
)

/**
 * An MCP tool call (14 §2) — the generic Provider for a tool on any MCP
 * connection. The snapshot path (14 §3) projects each advertised tool as its
 * own registry row under the connection's namespace, typed off the tool's
 * declared input schema; this generic type is the escape hatch beneath them —
 * pin it, choose the connection, name the tool in params.
 *
 * `effects: 'external'` unconditionally: MCP annotations (`readOnlyHint` and
 * friends) are advisory by specification and are never trusted for gating
 * (14 §4). The admin's per-tool classification lives on the snapshot rows;
 * this generic type gates always, because through it any tool is reachable.
 *
 * The result carries the request and response verbatim in its output — which
 * is the receipt, which is the pitch (14 §5): no other MCP client can answer
 * "what did this tool actually do, and did I approve it" from a row.
 * @experimental
 */
export const mcpTool = pin(
	describeOracleDefinition({
		id: 'core:oracle/mcp-tool@1',
		i18n: {
			name: { en: 'MCP tool' },
			description: {
				en: 'Call one tool on a Model Context Protocol server, recorded verbatim and gated like every effectful step.',
			},
		},
		shape: S.mcp,
		effects: 'external',
		/** Declared, not bound — plans/28 owns the handler (plans/29 R-2). */
		provisional: true,
		/** The arguments are the model's invocation: approve or refuse it, never rewrite it (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.mcp,
				/**
				 * ⚠ No `requires`, and that is deliberate rather than an omission.
				 *
				 * The capability space describes io TRANSFORMS — what a model can
				 * be handed and what it gives back. An MCP server is not one: it
				 * serves tools, it does not turn text into anything. The nearest
				 * id, `text->text`, would be false, and claiming it would make
				 * every chat connection in the install look offerable here.
				 *
				 * So this slot keeps filtering by `shape` alone, which is the
				 * right axis for it. `requires` is for slots whose answer is "what
				 * must this connection be able to DO".
				 */
				description: 'Which MCP server this step calls.',
			},
			params: {
				kind: 'parameters',
				schema: {
					tool: {
						type: 'string',
						quick: true,
						label: { en: 'Tool' },
						description: {
							en: 'The advertised tool name on the connected server.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** Arguments for the tool, merged over any declared in params. */
				args: S.json,
			},
			out: {
				main: S.json,
				text: S.text,
				/** The content blocks exactly as the server returned them. */
				content: S.json,
			},
		},
	}),
)

/**
 * An MCP resource read (14 §2) — a Provider, deliberately not a Query. A
 * Query may not reach the network (16 §1), and everything crossing the
 * process boundary must be recorded verbatim so replay never re-infers
 * (F16); a resource is external state that can change between runs, and
 * modelling it as a Query would quietly break both rules.
 * @experimental
 */
export const mcpResource = pin(
	describeOracleDefinition({
		id: 'core:oracle/mcp-resource@1',
		i18n: {
			name: { en: 'MCP resource' },
			description: {
				en: 'Read one resource from a Model Context Protocol server, recorded verbatim.',
			},
		},
		shape: S.mcp,
		effects: 'external',
		/** Declared, not bound — plans/28 owns the handler (plans/29 R-2). */
		provisional: true,
		/** The uri is the invocation: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.mcp,
				// No `requires` — see the sibling MCP node above: a tool server is
				// not an io transform, so `shape` is the right filter here.
				description: 'Which MCP server this step reads from.',
			},
			params: {
				kind: 'parameters',
				schema: {
					uri: {
						type: 'string',
						quick: true,
						label: { en: 'Resource URI' },
						description: {
							en: 'The advertised resource URI on the connected server.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** Overrides the declared URI when wired. */
				uri: S.text,
			},
			out: {
				main: S.json,
				text: S.text,
				content: S.json,
			},
		},
	}),
)

/** @public */
export const generateText = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-text@1',
		i18n: { name: { en: 'Generate reply' } },
		shape: S.textGen,
		effects: 'external',
		/** The payload is the compiled prompt; a prompt rewritten at the gate is one the receipt cannot explain — approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				/**
				 * What the connection must be able to do, as opposed to what it
				 * is called. `shape` above still types the SLOT; this types the
				 * connection, and it is what the picker filters on and what the
				 * bind check refuses by — naming "Chat" rather than an id.
				 *
				 * Only `requires`, deliberately — still, now that the binding DOES
				 * consume `attachments`. It is the Anthropic adapter that sends
				 * them today (as base64 content blocks on the last user turn); a
				 * connection whose adapter has no such code REFUSES a request
				 * carrying files rather than sending it without them, so the
				 * `attachments` port is honest without a slot-level requirement.
				 *
				 * An `optional` vision requirement would meanwhile put a "no
				 * vision" caveat on every text connection in the app, on every
				 * run — and the port is empty on nearly all of them.
				 */
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				description: 'Which model server this step sends its request to.',
			},
			sampling: {
				kind: 'sampling',
				quick: true,
				shape: S.textGen,
				description:
					'The sampling settings — temperature and friends — used for this request.',
			},
			/**
			 * ⚠ No `prompts` slot, and there was one — `system` and
			 * `postHistory`, "the written instructions sent with every request
			 * from this step" (culled 2026-09-16, R-12). No handler read it:
			 * the instructions reach the model INSIDE the assembled context,
			 * through `core:task/assemble@2`'s own `prompts` slot, and this
			 * node sends what it is handed on `context`. Every shipped spec
			 * wired it as `slot.prompts({ node: 'context' })` for one reason
			 * only — so the panel would not render a second copy of the
			 * context builder's text — which is a declaration existing to hide
			 * itself. The same slot on `generate-with-tools@1` and
			 * `generate-json@1` went with it.
			 */
			/**
			 * ⚠ No `template` slot, and there was one — "how the assembled
			 * context is wrapped for this model before sending".
			 *
			 * Nothing read it and nothing seeded a row, so it rendered as an
			 * empty picker beside the settings that do work. Wrapping for the
			 * wire is the `wire` slot's job and the connection adapter's; a
			 * second, inert way to express it invited the two to disagree.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		/**
		 * Vision and interleaved output, declared.
		 *
		 * `accepts` is what makes a multimodal model reachable at all: before
		 * this the only image ports in the whole graph pointed *outward*
		 * (render, attach), so an image could be produced and stored but never
		 * sent. `emits` says a reply may contain generated media — which is
		 * what a single call now routinely returns, interleaved with the prose
		 * rather than beside it.
		 *
		 * Declaring both here does not oblige a connection to do either; the
		 * adapter reports what its model actually supports and the two are
		 * resolved at bind time.
		 */
		media: {
			accepts: ['image', 'document'],
			emits: ['image'],
		},
		ports: {
			in: {
				context: S.assembled,
				/**
				 * Whose reply is being generated — the stop-string exclusion
				 * (§27l): the speaking character's own name must not stop
				 * their own reply. The host already preferred a payload value
				 * over the run scope's; this port is what lets a spec supply
				 * one, so the exclusion follows the next-speaker node's output
				 * (19 §5) instead of the pre-run guess.
				 */
				currentCharacterId: S.rowIds,
				/**
				 * Media travelling with the request — the page a user
				 * attached, the frame a vision step is asked about. A list
				 * because interleaving is ordered and a single ref could not
				 * express "these three, in this order".
				 *
				 * Optional, and never quietly ignored: the host forwards these
				 * references to the dispatch, which resolves each one to bytes
				 * (checking it belongs to this run's session or user) and hands
				 * them to the adapter in this order. A request whose connection
				 * has vision switched off, or whose adapter has no code that
				 * sends files, is REFUSED rather than sent without them —
				 * dropping a file is indistinguishable from a model ignoring it.
				 */
				attachments: S.mediaList,
			},
			/**
			 * `parts` is the honest shape of a completion: an ordered list of
			 * text, reasoning, generated media and tool calls. `main` and
			 * `text` stay exactly as they were — `part-stream` is assignable
			 * to `text-stream`, so every spec wired to them keeps working and
			 * degrades by concatenating the prose.
			 *
			 * `thinking` is the reasoning trace the dispatch separated from
			 * the text before the text reached the port — published by the
			 * binding since it first stripped one, declared now that a
			 * downstream write (`update-message`) takes it. Empty when the
			 * model produced none.
			 */
			out: {
				main: S.partStream,
				text: S.textStream,
				parts: S.partStream,
				thinking: S.text,
			},
		},
	}),
)

/**
 * Generate, with the tools on the wire (20 §9) — the native door.
 *
 * ## Why this is a second type rather than two ports on `generate-text`
 *
 * `core:oracle/generate-text@1` is published and frozen: a spec that pinned
 * it must keep meaning what it meant. Adding ports would move its content hash
 * and every install would need a re-projection to keep booting — for a
 * capability most connections do not have. A new pin costs a row and conflicts
 * with nothing.
 *
 * It is otherwise the same node: same shape, same slots, same `context` in and
 * the same `main`/`text`/`parts` out. A spec swaps one for the other and
 * nothing else changes.
 *
 * ## The two doors, and why only one of them parses
 *
 * `advertise-tools` publishes both: `prompt` for models that never heard of
 * tools, `native` for APIs that take a declaration list. Wire `native` here and
 * the adapter puts the tools in the field its service calls them — and reads
 * the answer back out of the structured field, so `toolCall` arrives as data.
 * **There is nothing for `parse-tool-call` to do on this door**: the loop's
 * predicate is this node's own `toolCall`, and `run-tool` takes it directly.
 * Parsing prose the API already parsed would be a second reading of one answer.
 *
 * A connection whose adapter cannot send tools REFUSES a request carrying them
 * rather than sending it without: a model that was never offered a tool and a
 * model that declined one produce the same empty `toolCall`, and dropping the
 * declarations silently is indistinguishable from a model choosing not to call.
 * @experimental
 */
export const generateWithTools = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-with-tools@1',
		i18n: { name: { en: 'Generate with tools' } },
		shape: S.textGen,
		effects: 'external',
		/** The compiled prompt and the tool list: approve or refuse, as `generate-text` (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required, so this node is bindable to every
				 * text connection and the author decides what to do without one
				 * — which is the ruling on `optional` (`ctx.can`): the type
				 * system makes absence impossible to forget about, and the
				 * fallback is the author's to write. A spec that wants the
				 * emulated door instead wires `advertise-tools`' `prompt`.
				 */
				optional: ['tools'],
				description: 'Which model server this step sends its request to.',
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			// No `prompts` slot — see `generateText` (culled 2026-09-16, R-12).
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		media: { accepts: ['image', 'document'], emits: ['image'] },
		ports: {
			in: {
				context: S.assembled,
				/** `advertise-tools`' `native` port — the declarations, verbatim. */
				tools: S.json,
				currentCharacterId: S.rowIds,
				attachments: S.mediaList,
			},
			out: {
				main: S.partStream,
				text: S.textStream,
				parts: S.partStream,
				/**
				 * `{ tool, args }` when the model called one, null when it
				 * answered — the same shape `parse-tool-call` publishes, so
				 * `run-tool` and the loop's predicate take either door without
				 * knowing which was used.
				 */
				toolCall: S.json,
			},
		},
	}),
)

/**
 * Generate, with the ANSWER's shape on the wire — the structured door.
 *
 * ## Why a third generate type rather than a schema port on the other two
 *
 * The same reason `generate-with-tools` is a second one: `generate-text@1` is
 * published and frozen, and a port added to it moves the content hash every
 * spec in every install pins. But the stronger reason here is that this node
 * does not make the same REQUEST. `generate-text` sends a turn — a speaker, a
 * trailing assistant line the model continues — and this sends an instruction.
 * A parameter cannot express that difference honestly: a node whose prompt is
 * sometimes a turn and sometimes a question is two nodes with a flag between
 * them, and the flag is the thing a reader has to find before the receipt makes
 * sense.
 *
 * So: no `currentCharacterId` and no `attachments`, and neither is an omission.
 * The first is the speaker whose reply is being written, and nobody's reply is
 * being written. The second is files travelling with a turn.
 *
 * ⚠ **The trailing assistant line is the TRANSCRIPT's business, not this
 * node's.** A prompt arrives here already rendered, and on a completion wire the
 * seed is an open block inside one string that nothing can take back out. So the
 * guarantee is made where the line is never written:
 * `core:task/prose-transcript@1`, which is what a spec wires into the assemble
 * step feeding this node.
 *
 * ## It parses, and that is not the Provider doing two jobs
 *
 * `parse-json@1`'s own header says why the reading is a separate Task *there*:
 * `generate-text` publishes prose, so the reading is a second step over
 * somebody else's output, and every way it can fail deserves its own node on
 * the receipt. Here the structure IS the output — a request that named a schema
 * and came back with a document has nothing left to interpret — so publishing
 * prose and asking the next node to recover the document from it would be
 * undoing the work this node exists to do.
 *
 * The failures still show. `json` is null and `parseError` carries the sentence
 * when the answer could not be read, and `structured` says which door the
 * request actually went out through, so "the model ignored the schema" and
 * "this connection takes no schema, so there was none" are told apart by
 * reading rather than by guessing.
 *
 * `parse-json@1` stays declared and unchanged: it is content-addressed, other
 * specs pin it, and a reply from `generate-text` still needs it.
 * @public
 */
export const generateJson = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-json@1',
		i18n: { name: { en: 'Generate JSON' } },
		shape: S.textGen,
		effects: 'external',
		/** The compiled prompt and the schema: approve or refuse, as `generate-text` (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		/**
		 * An answer nobody can read costs the structure and nothing else.
		 *
		 * The same guarantee `parse-json@1` makes, kept here because this node
		 * replaced it in the chain: a planner whose document came back malformed
		 * should leave a turn with no plan, narrated anyway, rather than a turn
		 * that failed. The executor records `recoveredAsEmpty` and every
		 * downstream port reads absent, so a `map` over the missing list runs
		 * zero times.
		 */
		optional: true,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required, which is the `ctx.can` ruling: the
				 * node binds to every text connection and the binding decides
				 * what to do without them. The ladder is `json_schema` (the
				 * shape on the wire, natively or compiled to a grammar), then
				 * `json_object` (JSON, shape unsaid), then a sentence in the
				 * prompt — and the last rung works everywhere, so an absence
				 * costs fidelity rather than the step.
				 */
				optional: ['json_schema', 'json_object'],
				description: 'Which model server this step sends its request to.',
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			// No `prompts` slot — see `generateText` (culled 2026-09-16, R-12).
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * Which value inside the answer reaches `value` and `items`.
					 *
					 * A data reference is `{node, port}` with no sub-path, so a
					 * downstream `map` cannot iterate `plan.speakers` off a port
					 * carrying the whole document — the same reason `parse-json`
					 * carries this parameter, and the same spelling.
					 *
					 * Several dotted paths separated by commas are read in order
					 * and their lists joined. That is what makes an answer split
					 * into arms wireable at all: a keeper reports
					 * `{values, inventory}` (its item arm, named for the stat
					 * it resolves onto) because a schema can only be strict
					 * about a list whose items are all one shape, and the node
					 * that resolves them takes one list.
					 */
					path: {
						type: 'string',
						quick: true,
						description:
							'Which value inside the answer to publish on `value` and `items`, as a dotted path. Several paths, separated by commas, are joined in order. Empty publishes the whole answer.',
					},
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		ports: {
			in: {
				context: S.assembled,
				/**
				 * The shape the answer must take, as a JSON Schema document.
				 *
				 * Optional, and the node is useful without it: an unschema'd
				 * request still asks for JSON rather than prose. Supplied, it
				 * reaches whichever field the connection's service calls it —
				 * Ollama's `format`, OpenAI's `json_schema`, a GBNF grammar on
				 * the llama.cpp family — and a connection that takes none
				 * ignores it, which is the degradation rule the adapters
				 * already follow for `responseFormat`.
				 */
				schema: S.json,
			},
			out: {
				/** The parsed document, which is what this node is for. */
				main: S.json,
				json: S.json,
				/** The value at `path` — the document itself when `path` is empty. */
				value: S.json,
				/** That same value as a list, for a `map` to iterate. */
				items: S.json,
				/** What the model actually wrote, for a reader diagnosing the above. */
				text: S.textStream,
			},
		},
	}),
)

/** @experimental */
export const speak = pin(
	describeOracleDefinition({
		id: 'core:oracle/speak@1',
		i18n: { name: { en: 'Speak' } },
		shape: S.tts,
		effects: 'external',
		/** Declared, not bound — plans/14 owns the handler (plans/29 R-2). */
		provisional: true,
		/** The words to be spoken may be corrected before the call (R-15 review fields). */
		review: { fields: ['text'] },
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.tts,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.audio] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.tts },
			template: {
				kind: 'template',
				engine: jinja2.id,
				facet: 'templates',
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: { skipCodeBlocks: { type: 'boolean', default: true } },
			},
		},
		ports: { in: { text: S.text }, out: { main: S.audio, audio: S.audio } },
	}),
)

/**
 * Render an image.
 *
 * The structural twin of `generate-text` and `speak`, which is the whole point:
 * one node KIND (`provider`), one type per modality, and the type's `shape`
 * naming which one. That shape is what makes an image node offerable only an
 * image connection and an image sampling config — and, just as importantly, what
 * gives whatever is wired downstream a settled answer about what comes out of it.
 * A single "generate anything" provider whose ports changed with its connection
 * would be a node no spec could plan around.
 *
 * ## Nothing here belongs to one backend
 *
 * An A1111-compatible server takes width and height directly and names its
 * schedulers its own way; ComfyUI takes a whole graph; a hosted API ignores seed
 * and steps entirely. None
 * of that appears in this declaration, because a slot only one backend honours is
 * a control that does nothing on the other three. What a backend alone offers
 * lives on its CONNECTION, declared by its adapter as a profile schema; what a
 * person means lives here and in the sampling config, and the adapter translates
 * — reporting whatever it could not carry across rather than dropping it quietly.
 *
 * ## Ports
 *
 * `media` carries references, never bytes (media.ts): the run stores the image
 * and passes its uuid on, so a consumer that attaches it and a consumer that
 * posts it both work from the same stored row rather than from a base64 string
 * travelling through the graph. `image` is the first of them, for the common
 * single-image wiring, and `caption` is the prompt that produced it — which is
 * what a message posting the image usually wants as its text.
 *
 * `init` is declared now rather than added later: img2img changes nothing else
 * about this contract, and retrofitting a port onto a published type costs a
 * version bump for every spec pinning it.
 * @experimental
 */
export const generateImage = pin(
	describeOracleDefinition({
		id: 'core:oracle/generate-image@1',
		i18n: { name: { en: 'Generate image' } },
		shape: S.imageGen,
		effects: 'external',
		/** The prompt and the negative may be edited; `init` names an asset and may not (R-15 review fields). */
		review: { fields: ['prompt', 'negative'] },
		// Idle rather than wall: a render is minutes on modest hardware, and a
		// backend still reporting progress is working, not hung.
		timeoutMs: 600000,
		timeoutKind: 'idle',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.imageGen,
				/**
				 * The declaration that makes a KoboldCPP connection offerable
				 * here at all: its TYPE says text, and what it can do says
				 * otherwise.
				 */
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.image] })],
				description: 'Which image server this step sends its request to.',
			},
			sampling: {
				kind: 'sampling',
				quick: true,
				shape: S.imageGen,
				description: 'Steps, CFG, size, seed — the settings every image backend shares.',
			},
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: 'How the incoming text becomes what the image model is asked for.',
				fields: {
					positive: { type: 'text' },
					negative: { type: 'text' },
				},
			},
			/**
			 * No `facet`, unlike the text nodes' `weights`: the one parameter
			 * here decides how the request is SENT, and the weights facet is
			 * where a person looks for what the model is asked for.
			 *
			 * On an image backend `off` is the difference between one request
			 * and a render polled for progress and previews, which is the
			 * whole of what a background step saves by turning it off.
			 */
			params: {
				kind: 'parameters',
				schema: { streaming: streamingParam() },
			},
		},
		media: { emits: ['image', 'video'] },
		ports: {
			in: {
				prompt: S.text,
				negative: S.text,
				/** An input image, for backends that report `img2img`. */
				init: S.media,
			},
			out: {
				main: S.mediaList,
				media: S.mediaList,
				image: S.image,
				caption: S.text,
			},
		},
	}),
)

/**
 * A plugin's own image provider, kept as the worked example of one: same shape,
 * same slots, a `params` schema of its own. Nothing in core dispatches it.
 * @internal
 */
export const renderImage = pin(
	describeOracleDefinition({
		id: 'chariot.comfy:render-image@1',
		shape: S.imageGen,
		effects: 'external',
		/** A sample plugin oracle: its payload is a compiled prompt — approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 300000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.imageGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.image] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.imageGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: {
					positive: { type: 'text' },
					negative: { type: 'text' },
				},
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: { steps: { type: 'integer', default: 25 } },
			},
		},
		ports: {
			in: { context: S.assembled },
			out: { main: S.image, image: S.image },
		},
	}),
)

/**
 * A stream consumer with no `earlyExit` declared — the fixture that proves
 * stream-abandoned. Its `earlyExit: true` twin lives with the SDK's own suite
 * (`sdk-tests/fixtures.ts`), where the early-exit proofs are.
 * @internal
 */
export const sloppyStream = pin(
	describeTaskDefinition({
		id: 'test:task/sloppy-stream@1',
		timeoutMs: 5000,
		ports: { in: { main: S.textStream }, out: { main: S.json } },
	}),
)

// ── Consumers ───────────────────────────────────────────────────────────────

/**
 * Create a message.
 *
 * Split from the old `commitMessage`, which decided new-vs-update from whether an id
 * happened to be present (13 §10b). That was an implicit branch, and F25 exists because
 * implicit branches are unreadable: two specs that did different things looked identical,
 * and the receipt could not tell you which had happened. Two ids, two names, no inference.
 *
 * Gate-eligible, so it publishes the discriminated write result rather than raw ids
 * (13 §7j-b). Under async review this is a proposal a reviewer may still reject.
 */
/**
 * The create pipeline's read (24 §12, T8): what the session's cast wants to
 * say first — one entry per character in position order, each carrying the
 * full greeting history (the first text seeds the message, the rest become
 * swipes), interpolated against the session's first persona.
 *
 * A Query, because deciding what a greeting *is* — group-only lists, the
 * interpolation, the fallback line — is exactly the kind of decision a
 * custom genre should be able to replace without reimplementing the write.
 * @experimental
 */
export const sessionGreetings = pin(
	describeQueryDefinition({
		id: 'core:query/session-greetings@1',
		i18n: { name: { en: 'Session greetings' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.json, greetings: S.json },
		},
	}),
)

/**
 * The create pipeline's write (24 §12, T8): seed the collected greetings as
 * the session's first messages — one assistant message per entry, the full
 * list as its swipe history, redirected to the genre's declared greeting
 * channel when that is not `main`.
 * @experimental
 */
export const seedGreetings = pin(
	describeOutletDefinition({
		id: 'core:outlet/seed-greetings@1',
		effects: 'write',
		/** The greetings are the cards' own text and the channel the genre's: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 5000,
		causesEvent: 'core:event/message-created@1',
		ports: {
			in: {
				greetings: S.json,
				/**
				 * The channel the greetings land on (20 §7) — the genre's
				 * declared greeting channel, written by the create specs as a
				 * literal (`createChat.ts`, `adventure.ts`). Absent is `main`.
				 * Declared 2026-09-16 (U2 residual): the host read it off the
				 * payload while no declaration supplied it.
				 */
				channel: S.text,
			},
			out: { main: S.writeResult, messageIds: S.writeResult },
		},
	}),
)

/**
 * A seated envoy's **declared greeting**, interpolated (lair re-plan R6,
 * 2026-09-28) — the line an envoy opens a new session with
 * (`EnvoyDecl.greeting`): the Lair's Castellan introduces the game.
 *
 * The create pipeline's read, beside `session-greetings@1`, which stays the
 * CARDS' greetings. A Query for the same reason that one is: what a greeting
 * says is a decision a custom genre may replace without reimplementing the
 * write.
 *
 * **Absent** — `text` empty — when the envoy is not seated in the session
 * or declares no greeting, so a spec writes behind a junction on `text` and
 * a session whose envoy was never seated gets no line under its name.
 * Interpolated with the envoy as `{{char}}`, the session's `{{playerLabel}}`
 * and the party as `{{characterNames}}` (empty at creation for a genre that
 * seats nobody yet, so the copy writes `{{#if characterNames}}`).
 *
 * No model call: a create run is a person waiting (`lair-create`).
 * @experimental
 */
export const envoyGreeting = pin(
	describeQueryDefinition({
		id: 'core:query/envoy-greeting@1',
		i18n: {
			name: { en: 'Envoy greeting' },
			description: {
				en: "The opening line a seated envoy declares, filled in for this session. Empty when the envoy is not seated or declares none.",
			},
		},
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/** The envoy, by its genre-local key (`castellan`). */
					envoy: {
						type: 'text',
						label: { en: 'Envoy' },
						description: "Which of the genre's envoys greets, by its key.",
					},
				},
			},
		},
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.text, text: S.text },
		},
	}),
)

/**
 * Write a message — complete, or as the run's **placeholder** (R-17).
 *
 * A pipeline that wants a message creates it itself. The reply specs put this
 * node straight after the inlet with `generating: true`: the row it inserts is
 * empty and generating, it is the run's live row (`liveRow` — an oracle's
 * stream lands in it, and Stop finalises it), and the spec's last node is an
 * `update-message` that fills it. That create → update pair on one row inside
 * one run is the run's **one live row** (F7). Without `generating` (or a
 * claimed `row`) the message is complete, and an ordinary write — a pipeline
 * may write as many as it likes, just never a second on the live row's
 * channel. `message-created` fires on the create, which is now genuinely the
 * moment the row exists.
 *
 * `reviewDefault: 'off'` — review of a reply, when an admin enables it, lands
 * on the *update* of the primary row and never on this create by default
 * (R-21 (3)): a placeholder is a write, and an admin who gates this node gets
 * a run that shows nothing until approved, which is honest and rarely wanted.
 * Turning it on is still the admin's to do.
 * @public
 */
export const createMessage = pin(
	describeOutletDefinition({
		id: 'core:outlet/create-message@1',
		effects: 'write',
		/** The text may be reviewed; who speaks, which row and which channel are the run's identity (R-15 review fields). */
		review: { fields: ['text'] },
		reviewDefault: 'off',
		liveRow: true,
		timeoutMs: 5000,
		causesEvent: 'core:event/message-created@1',
		slots: {
			/**
			 * The write hook (18 §4a): one chain rewrites the final output, the
			 * other decides where a streamed reply stops. Stop is a verdict —
			 * min-reduction across every attached script, and the connection's
			 * own guards join the same union at dispatch (18 §4b), which is why
			 * order never needs ruling. `speakerName` and `castNames` are
			 * extras: readable, never writable, by construction (18 §6a).
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1', 'core:script:text/stop@1'],
				port: 'text',
				phase: 'before',
				extras: ['speakerName', 'castNames'],
				description:
					'Scripts over the reply as it is saved — clean up the text, or stop a streaming reply early.',
			},
		},
		ports: {
			in: {
				text: S.text,
				/**
				 * Media to post WITH the message, as references.
				 *
				 * Posting an image as a NEW message is one write, not a create
				 * followed by an `attach-image`: the answer is the same one
				 * streaming got — one node with a settled output, not two nodes
				 * and a hope. The write that creates the message is the write
				 * that attaches its images.
				 */
				media: S.mediaList,
				/**
				 * Who is speaking, as a cast row — the inlet's `characterId`.
				 * Null or absent means nobody in particular: narration, or a
				 * message no character voices.
				 */
				characterId: S.rowIds,
				/**
				 * The participant voicing this message when they are **not** a
				 * cast row — the side-character fact `{ name, characterId, known }`
				 * off `side-character-turn@1`'s `sideCharacter` port. Stored
				 * beside the message under `metadata.sideCharacter` (was
				 * `metadata.speaker` until U5g, 2026-09-16 — that key is the
				 * participant reference now, on the row as on the inlet, R1),
				 * where the run and the receipt read it from; it never writes a
				 * cast row and never enters the rotation.
				 *
				 * Was `speaker` until 2026-09-16 — the inlet's port of that
				 * name is a participant reference now (R-18 (3)).
				 */
				sideCharacter: S.json,
				/**
				 * Who is speaking, as a **participant reference** (R-18 (3);
				 * U5g, 2026-09-16) — `character:<id>` or `envoy:<slug>`, the
				 * inlet's `speaker`. Stored beside the message as
				 * `metadata.speaker`; it is the only identity an envoy's turn
				 * carries, since an envoy has no row for `characterId` to name.
				 * Optional: a spec that wires only `characterId` writes the row
				 * it always wrote.
				 */
				speaker: S.participantRef,
				/**
				 * Create the row as a **placeholder**: empty, generating, and the
				 * run's live row — filled by a later `update-message`, or
				 * finalised by core if the run stops first.
				 *
				 * A port, not a parameter, and the call site is what decides:
				 * the reply specs write `generating: true` as a literal into the
				 * node's config, in the same map as `text`, and `resolveInput`
				 * passes it through untouched — so the binding reads it exactly
				 * the way it reads a port (see `summarize-batch`'s `loreType`
				 * for the same reasoning at length). A `params` field would put
				 * a structural fact of the document in the panel as a knob.
				 */
				generating: S.json,
				/**
				 * The message is **narration** — not a character's turn. Shown
				 * under the narrator's name, never counted by the rotation. A
				 * literal, on the same terms as `generating`. The name is the
				 * session's narrator name, or the `speaker`'s where one was
				 * named; the host resolves it at the write, which is where the
				 * row is.
				 */
				narration: S.json,
				/**
				 * Instructions this message was asked for — a narrator's focus
				 * note. Stored beside the message and shown with it; never its
				 * text. Wired from the inlet's `text` on the narrate specs, which
				 * is what a narrator turn's triggering text is.
				 */
				instructions: S.text,
				/**
				 * The channel the row lands on (20 §7). Absent is `main`, so a
				 * pipeline that has never heard of channels writes where it
				 * always did; a channel the session's genre never declared is
				 * refused at the write. Declared 2026-09-16 (U2 residual) for
				 * the same reason `seed-greetings` declares its own.
				 */
				channel: S.text,
				/**
				 * An existing message row to take as the placeholder instead of
				 * inserting one — the inlet's `messageId` on a regenerate, swipe
				 * or extend. The row is reset to generating and becomes the
				 * run's live row; its text and swipe history stay as the verb
				 * left them. Absent on a fresh turn, which inserts.
				 */
				row: S.rowIds,
				/**
				 * Message **blocks** to post with the row (20 §6; R-15
				 * *Forms*; U5d, 2026-09-17): a list of `MessageBlock` — text,
				 * tables, meters, and the two interactive kinds, `choices` and
				 * `form`, which are **forms** when they carry an `addressee`.
				 * The host validates the tree (`checkMessageBlocks`), refuses
				 * a block naming a function this spec declares no action for
				 * or one whose action is `world` (the effects line), stamps
				 * each form with the writing spec's action identity and an
				 * id, stores them as a `core:blocks` part, and — for a form
				 * whose addressee the run's pinned portrayals say the AI
				 * portrays — records `core:event/form-addressed@1` for the
				 * genre's answer pipeline once this run's receipt is saved.
				 * Absent on nearly every message.
				 */
				blocks: S.json,
				/**
				 * **Folded sections** to show collapsed beside the text — a
				 * narrator's Plan, a step's notes (`FoldedSectionV1[]`: each
				 * `{ kind, label, content }` or `{ kind, label, items }`; at
				 * most `MAX_FOLDED_SECTIONS`). Stored with the row as
				 * `core:section` parts above the body; never the text, and
				 * never read into the prompt transcript. A malformed section
				 * is refused by position. Absent on nearly every message.
				 */
				sections: S.foldedSections,
			},
			out: { main: S.writeResult, messageId: S.writeResult },
		},
	}),
)

/**
 * Update an existing message — finish a placeholder, or edit a settled row.
 *
 * `target` takes `row-ids@1`, and a `write-result@1` from earlier in the same
 * run is assignable to it (09-B B4): the reply specs wire `$.placeholder.messageId`
 * here, which is the create → update pair that makes the pipeline own its row.
 * The other case is unchanged — the id comes from outside the run because the
 * user clicked a message, so it is on the inlet.
 *
 * Which of the two this is, the row decides: a target still **generating** — a
 * placeholder this run created — is finished (the text lands, the generating
 * state ends, the reasoning trace and the swipe slot are written); a settled
 * target is edited and marked so. That is the row's own state, not a flag a
 * spec could get wrong.
 *
 * Where review lands on a reply (R-21 (3)): when an admin turns review on
 * for a reply's message writes, it is THIS node that parks — the placeholder
 * ships `reviewDefault: 'off'` and declares no default here either, so nothing
 * gates by default and a reviewer who asks for one sees the content, not an
 * empty row. The executor's own rule (`resolvePosition`) is "the setting, else
 * the author's default, else off", and this node leaves the default unset.
 * @experimental
 */
export const updateMessage = pin(
	describeOutletDefinition({
		id: 'core:outlet/update-message@1',
		effects: 'write',
		/** The text may be reviewed; the row may not, nor the reasoning trace (R-15 review fields). */
		review: { fields: ['text'] },
		timeoutMs: 5000,
		causesEvent: 'core:event/message-updated@1',
		slots: {
			/** The same write hook as `create-message` — see it for the terms. */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1', 'core:script:text/stop@1'],
				port: 'text',
				phase: 'before',
				extras: ['speakerName', 'castNames'],
				description:
					'Scripts over the reply as it is saved — clean up the text, or stop a streaming reply early.',
			},
		},
		ports: {
			in: {
				target: S.rowIds,
				text: S.text,
				/**
				 * The reasoning trace the oracle separated from its text, when
				 * the model produced one. Stored beside the message as the
				 * thinking pane reads it; absent means none. Shown folded,
				 * and never re-sent to the model: the prompt transcript reads
				 * a row's text alone (decision D5, 2026-09-27).
				 */
				thinking: S.text,
				/**
				 * Blocks to append to the row — the same list, the same
				 * checks and the same stamping as `create-message`'s
				 * `blocks`; appended as a `core:blocks` part after the text
				 * lands, so a reply can end with a question put to the cast.
				 */
				blocks: S.json,
				/**
				 * **Folded sections** for the reply — the same list and the
				 * same checks as `create-message`'s `sections`. Finishing a
				 * reply, they are the shown alternative's sections, whole: a
				 * regenerate replaces what the slot held, and a finish with
				 * none clears it, while every other alternative keeps its own.
				 * Editing a settled row, they replace the shown alternative's
				 * only when given. Like `thinking`, never re-sent to the model.
				 */
				sections: S.foldedSections,
			},
			out: { main: S.writeResult, messageId: S.writeResult },
		},
	}),
)

// ── The built-in writes (R-15, ruled 2026-09-15, built 2026-09-16) ──────────
//
// *Anything that alters message state is a built-in*: core implements the
// write and it always emits an event carrying what changed and what was lost.
// Each of the five below is the write half of one message verb, run as its
// own one-node spec (`core:spec/builtin-*`) so it is receipted, gate-eligible
// (`reviewDefault: 'off'` — an admin may turn review on for a delete) and
// recorded in the session's changes for the next reply's inlet. The venue's
// handler makes the permission checks — that is the `item` audience rule,
// evaluated where the person is — and hands the request to the spec; the
// host's commit re-runs the same rule against the run's actor before it
// writes (U5b review C1), so a payload re-aimed between the two — at a review
// gate, by a spec that is not the built-in's own — is refused where the write
// happens. Each declares `review.fields`: what a reviewer may edit, and the
// row's identity is never among them.
//
// **Stop, branch and edit are floors**; delete, hide and swipe are built-ins a
// genre may switch off (`SessionShape.messageVerbs`). Stop has no outlet: it is
// the run-level guarantee (R-17) and emits `message-stopped` from the
// finalisation. Regenerate, extend and a swipe's fresh alternative are
// `update-message` with a `verb` — content the genre's pipeline produced,
// written by the outlet the reply already ends in.

/**
 * Delete a message. Publishes `lost` — the content, role, speaker, channel
 * and metadata the row held — beside the write result, so a listener (a
 * plugin cleaning its rows, the next reply's inlet) knows what went.
 * @experimental
 */
export const deleteMessage = pin(
	describeOutletDefinition({
		id: 'core:outlet/delete-message@1',
		effects: 'write',
		reviewDefault: 'off',
		// Nothing to edit at the gate: approve the delete or refuse it. The
		// row it is about was judged by the handler (the item rule) before
		// the run began, and a reviewer retyping `target` would re-aim the
		// write at a row nobody judged (U5b review C1).
		review: { fields: [] },
		timeoutMs: 5000,
		causesEvent: 'core:event/message-deleted@1',
		ports: {
			in: { target: S.rowIds },
			out: { main: S.writeResult, messageId: S.writeResult, lost: S.json },
		},
	}),
)

/**
 * Write the session's turn order (PLAN-turn-order §4.2, §4.4; R5) — the ONE
 * write path for `sessions.metadata.turnOrder`, and the only outlet that
 * writes `metadata` at all.
 *
 * Before writing it drops what cannot be fired, each with a receipt note:
 * an entry whose `ref` is not among `candidates` (a script or a plugin
 * strategy cannot seat somebody the pool did not admit), and an entry on a
 * channel the session does not have. Then `writeTurnOrder`, which refuses
 * an order answering an older event than the one already stored and says
 * `stale` on the receipt rather than failing.
 *
 * `causesEvent` is how `turn-order-changed` reaches the auto-advance
 * listener and the `sessions:turnOrder` push; the `cause` wired in here is
 * the one that rides along, so the listener can tell a person's send from a
 * migration's backfill.
 * @experimental
 */
export const setTurnOrder = pin(
	describeOutletDefinition({
		id: 'core:outlet/set-turn-order@1',
		i18n: { name: { en: 'Set turn order' } },
		effects: 'write',
		reviewDefault: 'off',
		// Nothing a reviewer could usefully retype: the order is computed
		// from the rows, and a hand-edited entry would name a participant
		// nobody pooled. Approve the recompute or refuse it.
		review: { fields: [] },
		timeoutMs: 2000,
		causesEvent: 'core:event/turn-order-changed@1',
		ports: {
			in: {
				order: S.turnEntries,
				candidates: S.turnCandidates,
				/** The instant the answered event happened — the staleness key. */
				basedOnAt: S.json,
				/** The event id this order answers. */
				event: S.text,
				/** The inlet's cause, carried into `turn-order-changed`. */
				cause: S.json,
			},
			out: {
				main: S.writeResult,
				/** The document as written, or the stored one when this was stale. */
				turnOrder: S.turnOrder,
			},
		},
	}),
)

/**
 * The session's **annex** (PLAN-turn-order §4.3, R6): read one owner's
 * document out of `sessions.annex`.
 *
 * The annex is the pipeline layer's free field, namespaced by owner key — a
 * genre id, a plugin id, or a user-authored spec's slug. `metadata` is
 * core's own and read-only from here; this is where a spec keeps what it
 * needs to remember without core ever reinterpreting it.
 *
 * The owner defaults to the running spec's own namespace, which is the
 * whole safety of it: a spec reads its own document by default and has to
 * say `sharedAnnex` out loud to read anybody else's.
 * @experimental
 */
export const sessionAnnex = pin(
	describeQueryDefinition({
		id: 'core:query/session-annex@1',
		i18n: { name: { en: 'Session annex' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					owner: {
						type: 'string',
						default: '',
						label: { en: 'Owner' },
						description: {
							en: "Whose document to read. Blank means this pipeline's own.",
						},
					},
					sharedAnnex: {
						type: 'boolean',
						default: false,
						label: { en: 'Read another owner' },
						description: {
							en: "Allow reading a document this pipeline does not own. Off refuses, with a note on the receipt.",
						},
					},
				},
			},
		},
		ports: {
			in: {
				scope: S.sessionScope,
				/**
				 * `'ai'` for the prompt-safe view (R57): only the values the
				 * model's context may carry — those whose audience holds `ai`,
				 * `participant`, or the `speaker` below. Absent is everything,
				 * as a pipeline reads it. A literal.
				 *
				 * `'template'` (typed templates P6) reads what a template may
				 * reference: every DECLARED key of every owner in scope — core
				 * and the enabled plugins, for the session's genre — as
				 * `{ <owner>: { <key>: value } }`. `owner` and `sharedAnnex`
				 * do not apply; a key no declaration covers is left out. Law
				 * T2 lets it feed only a template node's `annex` in-port.
				 */
				view: S.text,
				/** Whose prompt, for `view: 'ai'` — a `character:` or `envoy:` reference. */
				speaker: S.participantRef,
			},
			out: { main: S.json },
		},
	}),
)

/**
 * Write one owner's document into the session's annex (§4.3).
 *
 * Merged into what is there by default — a spec that keeps one key does not
 * have to carry the rest — and written under
 * `pg_advisory_xact_lock(hashtext('annex'), sessionId)` through `jsonb_set`,
 * so two specs writing two owners' documents at once cannot lose each
 * other's. Causes `core:event/annex-changed@1` (R30, the modder pass,
 * reversing §4.3's "no causesEvent"): a package's state is the annex, and a
 * genre that wants its turn order to answer that state binds the event in
 * the open, where the event map draws it — not through a back door.
 * @experimental
 */
export const setSessionAnnex = pin(
	describeOutletDefinition({
		id: 'core:outlet/set-session-annex@1',
		i18n: { name: { en: 'Set session annex' } },
		effects: 'write',
		/**
		 * "My state changed" as an event any genre may listen for. The host
		 * emits it only when the merged value differs from the stored one. A
		 * package that wants its own named happening declares an event and
		 * records it with `record-event`.
		 */
		causesEvent: 'core:event/annex-changed@1',
		/**
		 * Who may see a value is the owner's **annex declaration**'s to say —
		 * each key's `annexField({ see })` — and the audience stored with a
		 * value is the declaration's. The step may write only keys its owner
		 * declares.
		 */
		reviewDefault: 'off',
		review: { fields: ['value'] },
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					owner: {
						type: 'string',
						default: '',
						label: { en: 'Owner' },
						description: {
							en: "Whose document to write. Blank means this pipeline's own.",
						},
					},
					merge: {
						type: 'boolean',
						default: true,
						label: { en: 'Merge' },
						description: {
							en: 'Keep the keys already there and write over the ones given. Off replaces the whole document.',
						},
					},
					sharedAnnex: {
						type: 'boolean',
						default: false,
						label: { en: 'Write another owner' },
						description: {
							en: "Allow writing a document this pipeline does not own. Off refuses, with a note on the receipt.",
						},
					},
				},
			},
		},
		ports: {
			in: { value: S.json },
			out: { main: S.writeResult, annex: S.json },
		},
	}),
)

/**
 * Set one **annex field** (2026-09-26): the write behind every
 * `annexField()` a package declares — core's one pipeline for them all,
 * `core:spec/set-annex-field`.
 *
 * `payload` is `{ field, value }`: `field` the field's action identity
 * (`<owner>:annex#<key>`), which the host's door put there after judging the
 * press — who pressed, the plugin switch, the shape. The host reads the
 * declaration again here rather than trusting the payload: an undeclared
 * key, a value its shape refuses, a secret, or a declared audience that is
 * not one is refused, and the run halts on it. What is written goes through
 * the same annex write as `set-session-annex` — the lock, one audience per
 * key, `annex-changed`, every viewer's view re-sent — into
 * `annex[<owner>][<key>]`, under the audience the declaration names.
 * @experimental
 */
export const setAnnexField = pin(
	describeOutletDefinition({
		id: 'core:outlet/set-annex-field@1',
		i18n: { name: { en: 'Set annex field' } },
		effects: 'write',
		causesEvent: 'core:event/annex-changed@1',
		reviewDefault: 'off',
		/** The payload was judged at the door and is judged again here — approve or refuse, never rewrite (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 2000,
		ports: {
			in: { payload: S.json },
			out: { main: S.writeResult, annex: S.json },
		},
	}),
)

/**
 * Record an event your package declared: something happened, and
 * pipelines bound to it — plugin listeners, and widgets when the event is
 * delivered to the session — hear it.
 *
 * `event` is the declaration value (`defineSessionEvent(…)`), written into
 * the document as its id; it is never wired, so what a pipeline records is
 * known before it runs. `payload` must carry the event's declared shape. The
 * write is the `session_changes` row, and the event it causes is the one it
 * names — so a recorded event is, like every event, the consequence of a
 * write. It is never the live row; a run may record several.
 *
 * Who may record it is the declaring package's to say
 * (`defineExtension({ events: [{ event, genre, recordedBy }] })`): the host
 * refuses a recording from a pipeline outside that scope.
 * @experimental
 */
export const recordEvent = pin(
	describeOutletDefinition({
		id: 'core:outlet/record-event@1',
		i18n: { name: { en: 'Record event' } },
		effects: 'write',
		causesEventFrom: 'event',
		reviewDefault: 'off',
		review: { fields: ['payload'] },
		timeoutMs: 2000,
		ports: {
			in: {
				/** The declared event's id — a literal, never wired. */
				event: S.text,
				payload: S.json,
			},
			out: { main: S.writeResult },
		},
	}),
)

/**
 * Hide a message from the prompt, or show it again — a **ghost**. The row
 * stays; `hidden` says which way it went.
 * @experimental
 */
export const hideMessage = pin(
	describeOutletDefinition({
		id: 'core:outlet/hide-message@1',
		effects: 'write',
		reviewDefault: 'off',
		/** The direction may be reviewed; the row may not (see `delete-message`). */
		review: { fields: ['hidden'] },
		timeoutMs: 5000,
		causesEvent: 'core:event/message-hidden@1',
		ports: {
			in: { target: S.rowIds, hidden: S.json },
			out: { main: S.writeResult, messageId: S.writeResult, hidden: S.json },
		},
	}),
)

/**
 * A person's rewrite of a **settled** row: the text replaces, the selected
 * alternative follows it, the embedding is cleared for re-indexing, and the
 * row is marked edited. Publishes `previous` — the content it replaced.
 *
 * Distinct from `update-message@1`, which finishes a *generating* row with
 * what a pipeline produced. A floor: every genre has it.
 * @experimental
 */
export const editMessage = pin(
	describeOutletDefinition({
		id: 'core:outlet/edit-message@1',
		effects: 'write',
		reviewDefault: 'off',
		/** The text may be reviewed; the row may not (see `delete-message`). */
		review: { fields: ['text'] },
		timeoutMs: 5000,
		causesEvent: 'core:event/message-edited@1',
		ports: {
			in: { target: S.rowIds, text: S.text },
			out: { main: S.writeResult, messageId: S.writeResult, previous: S.json },
		},
	}),
)

/**
 * Move between a message's alternatives, or record a new one. `index`
 * selects an alternative the row already holds; `text` records a new one and
 * selects it — the reply road then fills an empty one it opened this way.
 * Publishes `swipeIndex`, the alternative now showing, and `previous` — the
 * content and index that were.
 * @experimental
 */
export const swipeMessage = pin(
	describeOutletDefinition({
		id: 'core:outlet/swipe-message@1',
		effects: 'write',
		reviewDefault: 'off',
		/**
		 * A recorded alternative's text may be reviewed; neither the row nor
		 * the `index` — which alternative a navigation selects is as much the
		 * request's identity as the row is (see `delete-message`).
		 */
		review: { fields: ['text'] },
		timeoutMs: 5000,
		causesEvent: 'core:event/message-swiped@1',
		ports: {
			in: { target: S.rowIds, index: S.json, text: S.text },
			out: {
				main: S.writeResult,
				messageId: S.writeResult,
				swipeIndex: S.json,
				previous: S.json,
			},
		},
	}),
)

/**
 * Branch a session at a message: a new session with the same cast, guests
 * and tags and a copy of the history up to and including `fromMessage`, each
 * copy keeping its channel. Publishes the new `sessionId`. A floor.
 * @experimental
 */
export const branchSession = pin(
	describeOutletDefinition({
		id: 'core:outlet/branch-session@1',
		effects: 'write',
		reviewDefault: 'off',
		/** The title may be reviewed; the fork point may not (see `delete-message`). */
		review: { fields: ['title'] },
		timeoutMs: 30000,
		causesEvent: 'core:event/session-branched@1',
		ports: {
			in: { fromMessage: S.rowIds, title: S.text },
			out: { main: S.writeResult, sessionId: S.writeResult },
		},
	}),
)

// ── Sprites (DESIGN-sprites §5, 2026-09-24) ─────────────────────────────────
//
// A **sprite** is one labelled image a card can show — an emotion, an outfit,
// a pose. After a reply is saved, a short tail chooses which one the line
// shows: `sprites-for` reads what the speaker can show and embeds the line and
// the sprite labels on the local embedding lane (no model call is added to a
// turn), a **sprite picker** chooses, and `show-sprite` records it on the
// line. The picker is a rebindable node, exactly like a turn strategy: every
// picker publishes `sprite-pick@1` on `main`.

/**
 * What a line's speaker can show: the sprite set in force for the line and
 * its sprite labels, the speaker's last shown sprite (for stickiness), and the
 * line's own text.
 *
 * The set is decided in this order (§2.3): the session's override
 * (`state.cast.<key>.spriteSet`), then the cast member's `spriteSet`
 * amendment, then the card's default set — `decidedBy` names which, so the
 * receipt answers "why this outfit".
 *
 * `has` is false when there is nothing to choose between — a line with no
 * character speaker, or a card with no sprites — which is what the tail's
 * junction reads to stop quietly.
 * @experimental
 */
export const spritesFor = pin(
	describeQueryDefinition({
		id: 'core:query/sprites-for@1',
		i18n: { name: { en: 'Sprites for the line' } },
		timeoutMs: 2000,
		ports: {
			in: {
				scope: S.sessionScope,
				/** The saved line — the reply's `save` result. */
				message: S.rowIds,
			},
			out: {
				main: S.spriteChoices,
				choices: S.spriteChoices,
				/** The set's sprite labels, sorted. */
				labels: S.json,
				/** The line's text. */
				text: S.text,
				/**
				 * The line's vector, from the LOCAL embedding lane — null when
				 * no embedding model is loaded. Embedded here, as
				 * `entity-link` embeds names, rather than by `embed-text`
				 * nodes: those would add a connection control to every reply
				 * spec that nothing reads, and no model call is added to a turn.
				 */
				lineVector: S.vector,
				/** One vector per sprite label, in `labels` order; cached per model. */
				labelVectors: S.json,
				/** Whether there is anything to choose between. */
				has: S.json,
			},
		},
	}),
)

/**
 * The picker family (§5.3) shares one input shape, so a rebind never changes
 * the graph: the choices, and the line's and labels' vectors (null without an
 * embedding model). Every picker publishes `sprite-pick@1` on `main`. Core
 * ships one — the closest sprite below — and a plugin may ship another as a
 * pure task with the same ports.
 */

/**
 * **The default picker**: the sprite label whose vector is closest to the
 * line's, with a small penalty on labels shown in the speaker's recent lines
 * and a **stickiness margin** — the last shown sprite is kept unless the best
 * beats it by `margin`. The margin is what stops a face flickering on every
 * line. Picks nothing when no vectors arrived (no embedding model): an absent
 * mechanism subtracts a signal, it never guesses.
 * @experimental
 */
export const pickSpriteSimilarity = pin(
	describeTaskDefinition({
		id: 'core:task/pick-sprite-similarity@1',
		i18n: { name: { en: 'Closest sprite' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Sprites off for this session (or instance) without a
					 * rebind: the picker picks nothing, and faces stay as they
					 * are.
					 */
					enabled: {
						type: 'boolean',
						label: 'Choose sprites',
						description:
							"Choose a sprite for each character's line. Off leaves faces as they are.",
						default: true,
					},
					margin: {
						type: 'number',
						label: 'Stickiness',
						description:
							'How much closer a new sprite must be before the face changes. Higher keeps faces steadier.',
						min: 0,
						max: 0.5,
						default: 0.04,
					},
					floor: {
						type: 'number',
						label: 'Minimum similarity',
						description:
							'A line less similar than this to every sprite keeps the last one, or shows neutral.',
						min: 0,
						max: 1,
						default: 0.1,
					},
				},
			},
		},
		// The picker family's one input shape — see `spritePicker` below.
		ports: {
			in: {
				choices: S.spriteChoices,
				lineVector: S.vector,
				labelVectors: S.json,
			},
			out: {
				main: S.spritePick,
				pick: S.spritePick,
			},
		},
	}),
)


/**
 * Record a line's **shown sprite**. Writes it on the line's ACTIVE swipe
 * (`metadata.swipes.spriteHistory[currentIdx]`, mirrored to
 * `metadata.sprite`), so each swipe keeps its own face.
 *
 * Who chose it is the host's to say, never a port's: a run of
 * `core:spec/show-sprite` (a person's pick from the message menu) records
 * `person`, and any other run `picker`. A picker never overwrites a person's
 * pick. A null `pick` clears the line's sprite.
 * @experimental
 */
export const showSprite = pin(
	describeOutletDefinition({
		id: 'core:outlet/show-sprite@1',
		effects: 'write',
		reviewDefault: 'off',
		review: { fields: [] },
		timeoutMs: 5000,
		causesEvent: 'core:event/sprite-shown@1',
		ports: {
			in: {
				target: S.rowIds,
				/** A `sprite-pick@1` — a picker's, or a person's; null clears. */
				pick: S.spritePick,
			},
			out: {
				main: S.writeResult,
				messageId: S.writeResult,
				/** What the line now shows, or null. */
				sprite: S.json,
				/** True when nothing was written — a picker meeting a person's pick. */
				kept: S.json,
			},
		},
	}),
)

// ── The story clock (DESIGN-story-time P3, 2026-09-28) ──────────────────────

/**
 * Move a session's **story clock** — the session's own story now — by `by` of
 * `unit`, through its lorebook's calendar (`advanceStoryTime`): carried by a
 * declared calendar, and by the smallest-part rule in a free-form book.
 * What "advance a minute per reply" places.
 *
 * Moves the session's clock only, never the book's or its line's present. A
 * session with no clock of its own starts from its line's present. Refused
 * with a sentence — the run halts — when the session has no lorebook, when
 * there is no present to start from, and when the result does not land in
 * the book's calendar; never clamped, never a silent no-op.
 *
 * `by` and `unit` in-ports, when wired, win over the parameters. To advance
 * once per reply, place it in a spec bound to the reply's event, which runs
 * after the reply is saved. (No ordering-only in-port: an unread port is a
 * declared control no run consults — `declaredReads`.)
 * @experimental
 */
export const advanceStoryClock = pin(
	describeOutletDefinition({
		id: 'core:outlet/advance-story-clock@1',
		i18n: { name: { en: 'Advance story clock' } },
		effects: 'write',
		reviewDefault: 'off',
		review: { fields: [] },
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					by: {
						type: 'integer',
						default: 1,
						label: { en: 'By' },
						description: { en: 'How many units to move the clock. Negative goes back.' },
					},
					unit: {
						type: 'enum',
						of: ['minutes', 'hours', 'days', 'months', 'years'],
						members: [
							{ key: 'minutes', label: { en: 'Minutes' } },
							{ key: 'hours', label: { en: 'Hours' } },
							{ key: 'days', label: { en: 'Days' } },
							{ key: 'months', label: { en: 'Months' } },
							{ key: 'years', label: { en: 'Years' } },
						],
						default: 'hours',
						label: { en: 'Unit' },
						description: {
							en: "What to count. In a free-form book only the part named moves: days never roll into a month.",
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** A whole number; wins over the `by` parameter when wired. */
				by: S.json,
				/** One of the units; wins over the `unit` parameter when wired. */
				unit: S.text,
			},
			out: {
				main: S.writeResult,
				/** The session's story clock as it now stands: `{ year, month?, day?, hour?, minute? }`. */
				clock: S.json,
				/** It spelled through the book's calendar. */
				label: S.text,
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

/**
 * The form as a prompt and as a schema. Takes the block and the context the
 * builder compiled for the addressee, and publishes the context with the
 * question and the options laid in (`formQuestion`, `formOptions` — what the
 * assembly template renders under the transcript), the JSON Schema the
 * oracle answers against (`formAnswerSchema`: an enum of the option keys, or
 * the field schema), and the question as text. Pure; no model, no rows.
 * @experimental
 */
export const formContext = pin(
	describeTaskDefinition({
		id: 'core:task/form-context@1',
		i18n: { name: { en: 'Form as prompt and schema' } },
		timeoutMs: 1000,
		ports: {
			in: { form: S.json, templateContext: S.templateContext },
			out: {
				main: S.templateContext,
				templateContext: S.templateContext,
				schema: S.json,
				question: S.text,
			},
		},
	}),
)

/**
 * An oracle's question, as blocks. Takes the document a `generate-json@1`
 * produced — `{ question, options: [{ key, label }], addressee? }` — and the
 * function the options fire, and publishes a block list holding one
 * `choices` block: the question on it, its options carrying the keys,
 * addressed to whom the document names. The document's `addressee` is a
 * **name** the model read off the transcript or a participant reference; a
 * name is resolved against `cast` into `character:<id>` (or `envoy:<slug>`),
 * and the `addressee` in-port, when wired, wins over both. A name nobody in
 * the cast bears leaves the block unaddressed — buttons, not a form. The
 * host stamps the action identity and the block id at the write; this task
 * only shapes. `text` is the question as prose, for the row's own content,
 * so a transcript that reads content alone still carries what was asked. A
 * document with no options publishes an empty list and an empty text.
 * @experimental
 */
export const makeChoices = pin(
	describeTaskDefinition({
		id: 'core:task/make-choices@1',
		i18n: { name: { en: 'Question as choices' } },
		timeoutMs: 1000,
		ports: {
			in: {
				/** The oracle's document: `{ question, options, addressee? }`. */
				json: S.json,
				/** The function every option fires — the block's `fn`. */
				fn: S.text,
				/**
				 * The identity of the declaration the options fire, when it is
				 * another spec's (`core:spec/adventure-answer#answer`). Absent,
				 * the host stamps this spec's own declaration for `fn` at the
				 * write.
				 */
				action: S.text,
				/** Who the question is put to. Wired, it wins over the document's. */
				addressee: S.participantRef,
				/** The cast, to resolve a name the document used into a reference. */
				cast: S.sessionCast,
				/**
				 * What the question is about, by name — stamped on the block
				 * as its `referent` and handed back by `read-answer@1` to the
				 * run the press fires (lair pass B12, 2026-09-27: the room the
				 * party knocked at). Blank or absent writes none.
				 */
				referent: S.text,
			},
			out: {
				main: S.json,
				blocks: S.json,
				/** The question as prose — the row's content. */
				text: S.text,
				/** Who the block was addressed to, resolved; null when nobody. */
				addressee: S.participantRef,
			},
		},
	}),
)

/**
 * A form's answer, port by port — for the action a form fires. Takes the
 * inlet's `payload` (what the press sent) and `form` (the block facts the
 * host read off the row) and publishes the parts a spec wires: the chosen
 * option's key and label, the addressee and their character row, the
 * question, and the answered values. Pure.
 * @experimental
 */
export const readAnswer = pin(
	describeTaskDefinition({
		id: 'core:task/read-answer@1',
		i18n: { name: { en: 'Read the answer' } },
		timeoutMs: 1000,
		ports: {
			in: { payload: S.json, form: S.json },
			out: {
				main: S.json,
				/** The chosen option's key (`choices`), else null. */
				choice: S.text,
				/** The chosen option's label, else null. */
				label: S.text,
				/** Who answered, as a participant reference — the form's addressee. */
				addressee: S.participantRef,
				/** The addressee's character row, null for an envoy or a person. */
				characterId: S.rowIds,
				question: S.text,
				/**
				 * What the question was about, by name — the block's
				 * `referent`, as the asking run stamped it (lair pass B12);
				 * empty when it named nothing, never null, so a write wired
				 * to it still offers the field at its review gate (a review
				 * form shows only the fields a payload carries).
				 */
				referent: S.text,
				/** The whole answer: `{ choice }` or the entered values. */
				values: S.json,
			},
		},
	}),
)

/**
 * Commit an oracle's answer to a form **exactly as a click would**.
 *
 * The host checks the answer against the form's schema, then fires the
 * block's action through the same server path a press takes
 * (`fireAction`): the run owner is the acting user, the actor portrays the
 * addressee, the block's addressee is the audience, and the action's spec
 * runs as a child of this run. It records `form-answered` in the session's
 * changes with the answer and `answeredBy: 'oracle'`, so the next reply's
 * inlet sees it. Refused outside a document on `core:inlet/form-addressed@1`
 * (`validate()` and the host), refused when the addressee is not the AI's,
 * and refused for a `world` action (the effects line — belt to the
 * validator's braces). `reviewDefault: 'off'`; an admin may gate it, and the
 * reviewer edits the `answer` alone.
 * @experimental
 */
export const answerForm = pin(
	describeOutletDefinition({
		id: 'core:outlet/answer-form@1',
		i18n: { name: { en: 'Answer the form' } },
		effects: 'write',
		reviewDefault: 'off',
		/** The answer may be corrected at the gate; which form, and who answers, may not (R-15 review fields). */
		review: { fields: ['answer'] },
		/**
		 * A write's timeout, not a run's (was 600000 until 2026-09-17, U5d
		 * review W2): the commit checks the answer, asks the cycle caps and
		 * **collects** the fire — the action's run is dispatched by the host
		 * after this run's receipt is saved, outside any node timeout, as
		 * this run's child. A grandchild parked at review parks nothing here.
		 *
		 * Thirty seconds rather than a write's usual five (U5d review S-a,
		 * the same day): the commit does database work of its own — the
		 * block off the row, the session, the routing, a cap refusal's
		 * receipt — and under PGlite contention (a full test run, a busy
		 * install) five seconds turned a legible **halt** into a timeout
		 * `err` with no sentence. The ceiling is still a write's order of
		 * magnitude, never a model call's: nothing here waits on an oracle.
		 */
		timeoutMs: 30000,
		causesEvent: 'core:event/form-answered@1',
		ports: {
			in: {
				/** The block, as the inlet published it. */
				form: S.json,
				/** The oracle's document — checked against `formAnswerSchema(form)`. */
				answer: S.json,
				messageId: S.rowIds,
				blockId: S.text,
				addressee: S.participantRef,
			},
			out: {
				main: S.writeResult,
				messageId: S.writeResult,
				/** The answer as committed: `{ choice }` or the values. */
				answer: S.json,
				/** The identity of the action the answer fires — `<spec slug>#<key>`. */
				firedAction: S.text,
				/** The child run's id, chosen at the commit so this receipt can name it. */
				firedRunId: S.text,
			},
		},
	}),
)

/** The audio twin of `attach-image` — same `target`, same commit, bound the same day. @experimental */
export const attachAudio = pin(
	describeOutletDefinition({
		id: 'core:outlet/attach-audio@1',
		effects: 'write',
		/** A reference to rendered audio; nothing to retype (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 5000,
		causesEvent: 'core:event/message-updated@1',
		ports: { in: { target: S.rowIds, audio: S.audio }, out: { main: S.writeResult } },
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

/** The messages a summary is drawn from, already scoped and ordered. @internal */
export const summarizeSource = pin(
	describeQueryDefinition({
		id: 'core:query/summarize-source@1',
		i18n: { name: { en: 'Messages to summarize' } },
		timeoutMs: 5000,
		ports: {
			in: { scope: S.sessionScope, request: S.summarizeRequest },
			out: { main: S.messages, messages: S.messages },
		},
	}),
)

/**
 * Cut the messages into batches a model can hold.
 *
 * A Task, not a Query: the cut is a *decision* — how many tokens per batch, and
 * therefore how much context each draft is written against — and it is the
 * first parameter a user with long posts reaches for.
 * @internal
 */
export const batchMessages = pin(
	describeTaskDefinition({
		id: 'core:task/batch-messages@1',
		i18n: { name: { en: 'Batch messages' } },
		timeoutMs: 2000,
		slots: {
			/**
			 * The window the cut is clamped to — the same slot, by reference,
			 * that the drafting step generates against.
			 *
			 * The context window belongs to the sampling config, never to a knob
			 * on a node (17 §1a), and the executor resolves a `sampling` slot to
			 * the config's switched-on *values* — so this stays a pure Task
			 * reading data it was handed rather than a Query looking one up. Same
			 * shape and same reason as `core:task/context-budget@1`.
			 *
			 * ⚠ Wire it as a REFERENCE to the drafting oracle's sampling slot
			 * (`slot.samplingOf(...)`), not as a picker of its own. A batch cut
			 * against one window and drafted against another is wrong in the
			 * direction that overflows, silently — and unlike the assembled
			 * context there is no truncation on this path to catch it, because
			 * the batch prompt is injected whole.
			 */
			sampling: { kind: 'sampling', quick: true },
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * The chat half of a batch prompt, and only that half — the
					 * template around it and the room the draft is written back
					 * into are a reserve the binding adds on top, which is why
					 * this can be raised right up to the window minus that
					 * reserve and no further.
					 *
					 * ⚠ Bigger is not better. Long-context models degrade in the
					 * middle, so this is a QUALITY point rather than a fraction
					 * of whatever window happens to be available: nothing scales
					 * it up to fill a large one, and the window is only ever a
					 * ceiling on what an admin asks for.
					 *
					 * 2560 is 0.5's effective batch (`4096 - 1500`) at a round
					 * 2.5 Ki, so arriving here re-tunes nobody.
					 */
					batchTokens: {
						type: 'integer',
						default: 2560,
						label: { en: 'How much chat each batch holds' },
						description: {
							en: 'Tokens of chat one summary draft is written from. Capped by the drafting step\u2019s Context Tokens, less room for the prompt and the draft itself.',
						},
					},
					minBatchMessages: {
						type: 'integer',
						default: 1,
						description: 'Never cut a batch smaller than this many messages.',
					},
				},
			},
		},
		ports: {
			in: { messages: S.messages },
			out: { main: S.drafts, batches: S.drafts },
		},
	}),
)

/** Phase 1 — one batch, drafted without sight of any other. @internal */
export const summarizeBatch = pin(
	describeOracleDefinition({
		id: 'core:oracle/summarize-batch@1',
		i18n: { name: { en: 'Draft a batch' } },
		shape: S.textGen,
		effects: 'external',
		/** A drafting call over a batch: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		/**
		 * The first interior point (18 §4e), and core dogfooding it (07 §0b):
		 * every intermediate draft passes the user's chain before synthesis
		 * reads it — slop killed in the material summaries are built *from*,
		 * not only in final replies. Invoked by the binding via
		 * `ctx.scripts.applyText('each-draft', …)`; recorded per application
		 * as `appliedBy: 'binding'`. Declares what it accepts (R-11): a draft
		 * is text, so text transforms — said here rather than assumed by the
		 * broker, which is the difference between a point a plugin can shape
		 * and a literal in the executor.
		 */
		scriptPoints: [
			{
				key: 'each-draft',
				accepts: ['core:script:text/transform@1'],
				label: { en: 'Each draft' },
				description: {
					en: 'Runs over every intermediate draft this step produces, before synthesis reads them.',
				},
			},
		],
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { batch: { type: 'text' } },
			},
		},
		ports: {
			// `request` carries what a person asked for — the topic line, most
			// visibly — so the drafting prompt can honour it. The whole request
			// object travels rather than a plucked field, because what the
			// request holds is the socket's contract with its modal, not this
			// node's to enumerate.
			in: {
				batch: S.messages,
				request: S.summarizeRequest,
				/**
				 * Which kind of entry this pipeline writes — the word every
				 * summarize prompt template branches on (D-I).
				 *
				 * ## A port, not a parameter, and the call site is what decides
				 *
				 * `summarizeSpec` writes it as a **literal into the node's
				 * config**, in the same map as `batch` and `request` and
				 * alongside them: `C.summarizeBatch.v1({ batch, request,
				 * loreType, … })`. `resolveInput` passes a non-ref config value
				 * through untouched, so the binding reads `input.loreType`
				 * exactly the way it reads a port — same position, same access,
				 * same absence-is-`undefined`. Declaring it as anything else
				 * would describe a mechanism that is not the one running.
				 *
				 * A `params` field is the alternative, and it is the wrong one
				 * twice over. It would move the read to `input.params.loreType`
				 * — a different value from a different layer — and it would put
				 * the control in the panel, stored per configuration and
				 * layered instance → user → session like every other parameter.
				 * `SummarizeShape` in the catalog already rules on that: this is
				 * "the thing that distinguishes the four namespaces from one
				 * another", and a user who changed it "would turn their scene
				 * summarizer into a world summarizer without renaming
				 * anything".
				 *
				 * ⚠ An in-port no edge feeds is not a contradiction here. A
				 * port is a named input the node reads; where the value comes
				 * from — an upstream node, or an author writing it down — is the
				 * document's business. What the declaration buys is that the
				 * name is now checkable: the app's binding types derive their
				 * legal reads from `ports.in`, so `input.loreTypes` stops
				 * compiling, and the panel and the plugin validator can both see
				 * that this node takes one.
				 *
				 * `text` rather than an enum shape: a shape ids a payload, and
				 * the four legal words are the prompt templates' vocabulary,
				 * which a plugin summarizer is free to extend.
				 */
				loreType: S.text,
			},
			out: { main: S.textStream, draft: S.textStream },
		},
	}),
)

/** Phase 2 — the ordered drafts merged into one past-tense narrative. @internal */
export const summarizeSynth = pin(
	describeOracleDefinition({
		id: 'core:oracle/summarize-synth@1',
		i18n: { name: { en: 'Synthesize the drafts' } },
		shape: S.textGen,
		effects: 'external',
		/** The merge call: approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { synth: { type: 'text' } },
			},
		},
		ports: {
			// Same `request` pass-through as the batch step: the topic reaches
			// synthesis too, or a focused summary drifts back to a general one
			// the moment the drafts are merged.
			in: {
				drafts: S.drafts,
				request: S.summarizeRequest,
				/** Authored on the node, exactly as on the batch step — see it. */
				loreType: S.text,
			},
			out: { main: S.textStream, content: S.textStream },
		},
	}),
)

/** What the entry gets called. Its own step because it has its own prompt. @internal */
export const nameEntry = pin(
	describeOracleDefinition({
		id: 'core:oracle/name-entry@1',
		i18n: { name: { en: 'Name the entry' } },
		shape: S.textGen,
		effects: 'external',
		/** Approve or refuse; the name it produces is reviewed at the entry's write (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { name: { type: 'text' } },
			},
		},
		ports: {
			in: {
				content: S.text,
				/** Authored on the node, exactly as on the two steps above — see them. */
				loreType: S.text,
			},
			out: { main: S.textStream, name: S.textStream },
		},
	}),
)

/**
 * Who was in the scene — scene summaries only.
 *
 * Present on one summarize pipeline and not the other three, which is exactly
 * why they are four specs rather than one spec with a flag. A flag would put the
 * difference in a condition somebody has to find; four specs put it in the shape.
 * @internal
 */
export const extractCast = pin(
	describeOracleDefinition({
		id: 'core:oracle/extract-cast@1',
		i18n: { name: { en: 'Extract the cast' } },
		shape: S.textGen,
		effects: 'external',
		/** Approve or refuse (R-15 review fields). */
		review: { fields: [] },
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { characterExtraction: { type: 'text' } },
			},
			/**
			 * The two halves of a replaceable core function, on the scripts
			 * rung. Scripts here *shape* the extraction — what the model reads,
			 * what the pipeline keeps. Replacing the extractor itself is the
			 * other rung: a same-shaped provider offered by the swap list,
			 * because extraction calls a model and scripts are pure compute.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1'],
				port: 'content',
				phase: 'before',
				description:
					'Scripts over the scene text before the extractor reads it — strip out-of-character chatter, normalise a nickname, redact.',
			},
			castScripts: {
				kind: 'scripts',
				accepts: ['core:script:cast/transform@1'],
				port: 'cast',
				phase: 'after',
				description:
					'Scripts over the extracted cast — rename someone, merge aliases, drop a junk detection, add someone the model missed.',
			},
		},
		ports: {
			// `request` carries the known cast list ([id: N] entries) so the
			// extraction prompt can reference real ids — without it the model
			// invents castIds and the resolve step silently drops every one.
			//
			// ⚠ No `messages` in-port, and there was one (culled 2026-09-16,
			// R-12). `summarize` wired the transcript into it and the handler
			// never read it: the extractor works from `content` — the synthesised
			// summary — which is what the prompt builder takes. A port a spec
			// fills and nothing reads costs the run a copy of the transcript
			// and tells a reader the extractor sees it.
			in: {
				content: S.text,
				request: S.summarizeRequest,
			},
			out: { main: S.json, cast: S.json },
		},
	}),
)

/**
 * The keywords an entry is proposed to be found by — **without a model**.
 *
 * ## The defect it exists for
 *
 * The summarizer writes a history entry with `keys: []`. Keyword matching is the
 * only retrieval mechanism on by shipped default, and a history row carries no
 * title for `nameMatch` to read either, so a summary a user made *so the model
 * would remember* cannot be found by anything. Measured on the core corpus:
 * with no keys, **0 of 12** history entries are reachable by any conversation
 * about them.
 *
 * ## ⚠ Why it is not a Provider, and why that is the whole point
 *
 * Every sibling in this section calls a model — `name-entry@1` writes the title,
 * `extract-cast@1` reads the cast. This one is `core:query`, computes from the
 * lorebook it already has, and **cannot invent a keyword**: every key it emits
 * is a substring of the text it was given. A proposal that cannot hallucinate
 * needs no review for hallucination, only for judgement, which is a far cheaper
 * review — and it costs no tokens, no connection and no wait.
 *
 * ## ⚠ The failure mode it is built against
 *
 * **Character names are the worst possible keys for a scene.** They are also
 * what any extractor finds first, and if every scene's entry is keyed on who was
 * in it then every one of them fires whenever that person is mentioned. That
 * replaces *"history entries never fire"* with *"all history entries fire
 * together"*, which is worse — one entry crowding out the rest, across a whole
 * lane, in a fixed budget where a wrong entry displaces a right one.
 *
 * Measured, on ten messages that name two cast members and nothing else:
 * **0 of 12** history entries fire, and **11 of 12** with the guards against it
 * removed. Everything the node does is downstream of that number.
 *
 * ⚠ There are two guards, not one, and the measurement needed both removed. A
 * name in every scene also fails the *statistical* test — it already matches
 * most of the book — so on a lorebook with entries to count over, either one
 * holds the line. On a lorebook with two entries in it, only the structural
 * rule can, and that is the lorebook a user has when they start making
 * summaries.
 *
 * ## What a consumer gets
 *
 * `keys` carries each proposal with its evidence — where in the text it occurs,
 * the sentence around it, how distinctive it is in this lorebook, and how many
 * other entries it already matches — and `rejected` carries every candidate
 * turned away with the rule that turned it away. Both exist because this node
 * **proposes and never writes**: what it emits is meant to reach a person who
 * can edit it before `core:outlet/create-lore-entry@1` stores anything, and a
 * reviewer who has to hunt for the reason will approve without reading.
 *
 * ⚠ It never proposes **secondary** keys. Those carry a user's `selectiveLogic`
 * conditions — *"fire on dragon, but not when statue is present"* — which is an
 * author saying *not here*, and nothing that guesses is entitled to say it.
 * @internal
 */
export const entryKeys = pin(
	describeQueryDefinition({
		id: 'core:query/entry-keys@1',
		i18n: {
			name: { en: 'Suggest keywords' },
			description: {
				en: 'Proposes the keywords an entry should be found by, taken from its own text. Runs on your machine, calls no model, and can only ever suggest words the text actually contains.',
			},
		},
		/**
		 * Pure computation over rows already in the database — one pass over the
		 * lorebook per candidate word. It reads no network and loads no model, so
		 * the only way it can take long is a very large book.
		 */
		timeoutMs: 5000,
		/**
		 * Producing nothing is an ordinary and correct outcome — a passage with
		 * nothing distinctive in it gets no keys rather than the five least
		 * common words it happens to contain — and a suggestion must never be
		 * able to cost somebody their summary. Both are the same `optional`.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ **A ceiling on firing opportunities, not a display
					 * preference.** Any single key matching admits the entry, so
					 * this is how wide the entry's door is — and the keyword
					 * signal is `matched / keys.length`, so a longer list also
					 * makes the entry *rank* worse for the same single hit.
					 *
					 * Five: a scene is about a place, a thing and an event or
					 * two. Measured at eight, with the ordinary-word cap opened
					 * with it, **six of twelve** history entries fire on
					 * narrative prose naming nothing from any scene — against
					 * one at five — and the shared-name probe stops being clean.
					 * **0 is off**, in the `admitThreshold` convention.
					 *
					 * It is a ceiling and never a target — fewer is the normal
					 * result and none is a valid one.
					 */
					maxKeys: {
						type: 'integer',
						default: 5,
						min: 0,
						max: 20,
						quick: true,
						label: { en: 'Most keywords suggested' },
						description:
							'A ceiling on how many keywords are proposed for one entry. Each one is another way the entry can be pulled into a prompt, so a short list is usually a better one. 0 suggests none.',
					},
					/**
					 * ⚠ **The one calibration a user can actually reason about**,
					 * and the reason the others are not here. How rare a word has
					 * to be, how short it may be, how much of a name to keep —
					 * those are measurements, not preferences, and a settings
					 * panel cannot perform them.
					 *
					 * This one is a preference, because it trades two things a
					 * user can feel: an ordinary word like "watch" or "left" is
					 * how an entry gets found when it names nothing proper, and
					 * it is also how an entry starts firing on any scene at all.
					 * Two ordinary words of five; 0 restricts suggestions to
					 * names and places, which measured cleanest and left two of
					 * twelve summaries with no keys at all.
					 */
					maxOrdinaryWords: {
						type: 'integer',
						default: 2,
						min: 0,
						max: 20,
						label: { en: 'Ordinary words allowed' },
						description:
							'How many of the suggestions may be everyday words rather than names of people, places or things. Names are far less likely to pull the entry into an unrelated scene; 0 suggests names only.',
					},
				},
			},
		},
		ports: {
			in: {
				/** The lorebook and the cast — what distinctiveness is measured against. */
				scope: S.sessionScope,
				/**
				 * The passage keys are proposed for.
				 *
				 * `content`, matching `name-entry@1`, so both proposal steps take
				 * the drafted summary off the same out-port under the same name.
				 */
				content: S.text,
			},
			out: {
				main: S.json,
				/** The proposals, each with the evidence for it. */
				keys: S.json,
				/** Every candidate turned away, and the rule that turned it away. */
				rejected: S.json,
			},
		},
	}),
)

/**
 * Write the finished entry. Gate-eligible, so it publishes a write result.
 *
 * ## Which kind of entry — the pipeline's decision, at last (L3, 2026-09-17)
 *
 * The host's commit case has said since the four summarize namespaces were
 * written that *which kind of entry comes from the pipeline that ran*. It did
 * not: it wrote world lore whatever ran, because nothing on this declaration
 * could say otherwise. `entryType` is that sentence made true — a declared
 * entry type id (`core:entry/world-lore`, `core:entry/history`,
 * `core:entry/location`), bare, the way `core:query/lorebook-entries@1` spells
 * them; the version is the row's own column.
 *
 * A **param** and not an in-port, because the kind of thing a pipeline writes
 * is a fact about the pipeline rather than about the turn — a summarizer
 * writes history every time it runs, a room-builder writes locations every
 * time — and a param is what a preset can set per session without the spec
 * being rewired. An unknown id is refused at the commit with a sentence
 * naming the declared types, never coerced to world lore: a typo that silently
 * files rooms as world lore is the defect this replaces.
 *
 * Default world lore, the agnostic shape, so every spec written before this
 * keeps doing exactly what it did.
 *
 * ## `links`, or a second write
 *
 * Linking a new entry takes one of two shapes, and both exist on purpose.
 * (A pipeline may write many times — F7 limits only the live row — so
 * `core:outlet/link-lore-entries@1` may also follow this outlet in the same
 * run, each its own transaction.)
 *
 *  - `links` — the links land in the **same transaction** as the row, keyed
 *    from the entry just written. A genre that builds a room with its exits
 *    does it in one run and one commit, and a link naming an entry that does
 *    not exist fails the row with it rather than writing half a room. This is
 *    the shape a builder wants.
 *  - `core:outlet/link-lore-entries@1` takes its `to` by **name**, so a later
 *    run can link what an earlier one created without holding an id. This is
 *    the shape a second turn wants.
 *
 * Each entry of `links` is a name or an entry id, or
 * `{ to, linkType?, label? }` for one that wants its own kind. Absent on
 * nearly every write, and an empty list is the same as none.
 * @internal
 */
export const createLoreEntry = pin(
	describeOutletDefinition({
		id: 'core:outlet/create-lore-entry@1',
		i18n: { name: { en: 'Save the lore entry' } },
		effects: 'write',
		/**
		 * Both the name and the content may be edited before the entry lands
		 * (R-15 review fields). `links` is deliberately not among them: the
		 * gate's form edits values a reader can retype, and a list of
		 * references is not one — a reviewer who disagrees with a room's exits
		 * refuses the write.
		 */
		review: { fields: ['name', 'content'] },
		timeoutMs: 10000,
		causesEvent: 'core:event/lore-entry-created@1',
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					entryType: {
						type: 'string',
						default: 'core:entry/world-lore',
						quick: true,
						label: { en: 'Kind of entry' },
						description:
							'Which kind of lorebook entry this pipeline writes — world lore, history, a location. Leave it as world lore for anything that is simply about the world.',
					},
				},
			},
		},
		ports: {
			in: {
				name: S.text,
				content: S.text,
				/**
				 * Links to write from this entry in the same commit — see the
				 * note above on F7. Names, entry ids, or
				 * `{ to, linkType?, label? }`.
				 */
				links: S.json,
			},
			out: { main: S.writeResult, entryId: S.writeResult },
		},
	}),
)

/**
 * Link two lore entries (L2, 2026-09-17).
 *
 * ## The gap it closes
 *
 * `create-lore-entry@1` takes a name and a body and nothing else, so a genre
 * whose world has *shape* — a room with exits, a street that runs past a shop
 * — had one place to put that shape: the prose. Lair shipped writing an
 * `Exits:` line into the content and parsing it back out, which is a link with
 * no foreign key, no cascade and no second reader. The rows have existed all
 * along (an entry-ended `narrative_relationships` row, the same edge the
 * lorebook's own graph draws); no pipeline could write one.
 *
 * ## Both ends, and the one scope
 *
 * `from` is an entry id — or, straight off `create-lore-entry@1`, its
 * `entryId` write result, which is assignable to `row-ids@1` (09-B B4). `to`
 * is an id **or a name**, resolved within the session's own lorebook, case
 * and surrounding space ignored. A name is the half that makes the law below
 * survivable, and it is also the half that can be wrong in two ways, so both
 * are refused with a sentence: a name nothing answers to, and a name **two**
 * entries answer to — the second never picks one, because picking would link
 * the wrong room silently and a duplicate name is the author's to resolve.
 *
 * One lorebook, both ends. An edge whose ends live in two books belongs to
 * neither and the row carries one `lorebook_id`, so a cross-book link is
 * refused rather than repaired — the same rule the socket handlers hold, held
 * again here because a pipeline does not come through them.
 *
 * ## After a create
 *
 * It may follow `core:outlet/create-lore-entry@1` in the same run (F7 limits
 * only the live row), linking by name what that write created — which is why
 * `to` takes one; a later run can do the same. Each write is its own
 * transaction, so a failed link leaves the entry behind. When the entry and
 * its links are one thought, `create-lore-entry`'s own `links` in-port writes
 * the edges in the row's transaction instead — the shape a room-builder wants.
 *
 * ## The kind of link
 *
 * `linkType` is free text in the row and stays free text: the app's list is a
 * vocabulary of *suggestions*, and the one kind anything reads semantically is
 * the travel set (`connects to`, `leads to`, `runs past`, `near`), which is
 * what turns a pair of entries into a place you can walk between. The default
 * is `leads to` — the exit, the reason this exists.
 * @internal
 */
export const linkLoreEntries = pin(
	describeOutletDefinition({
		id: 'core:outlet/link-lore-entries@1',
		i18n: {
			name: { en: 'Link the lore entries' },
			description: {
				en: 'Draws a link between two entries of this session’s lorebook — a room’s exit, who keeps what, what stands near what.',
			},
		},
		effects: 'write',
		/**
		 * The link itself is what a reviewer judges, so both the kind and the
		 * caption may be retyped (R-15 review fields). The two ends may not:
		 * they are the run's own identity, and a reviewer re-aiming them would
		 * link a pair nobody judged — the rule `delete-message@1` states.
		 */
		review: { fields: ['linkType', 'label'] },
		timeoutMs: 10000,
		causesEvent: 'core:event/lore-link-created@1',
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					linkType: {
						type: 'string',
						default: 'leads to',
						quick: true,
						label: { en: 'Kind of link' },
						description:
							'What the link says — “leads to”, “connects to”, “near”, “keeper of”. The travel kinds are what make two entries a place you can walk between.',
					},
				},
			},
		},
		ports: {
			in: {
				/** The entry the link starts at — an id, or a write result. */
				from: S.rowIds,
				/**
				 * The entry it ends at: an id, or a **name** resolved within
				 * this session's lorebook. `json` because it is either — and
				 * every shape is assignable into `json`, so an id port, a
				 * write result and a text name all wire here.
				 */
				to: S.json,
				/** What to call this link where it is drawn. Optional. */
				label: S.text,
			},
			out: { main: S.writeResult, linkId: S.writeResult },
		},
	}),
)

// ── Graph build ─────────────────────────────────────────────────────────────
//
// Five LLM steps, each already independently configurable in
// `graph_build_configs` as a `<step>_system_prompt` / `<step>_connection_id` /
// `<step>_sampling_config_id` triple. Five Providers is the same statement with
// the enumeration removed.

/** @internal */
export const graphScenes = pin(
	describeQueryDefinition({
		id: 'core:query/graph-scenes@1',
		i18n: { name: { en: 'Scenes to build from' } },
		timeoutMs: 5000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.graphScenes, scenes: S.graphScenes },
		},
	}),
)

const graphStep = (id: string, label: string, field: string, extra: { timeoutMs?: number } = {}) =>
	pin(
		describeOracleDefinition({
			id,
			i18n: { name: { en: label } },
			shape: S.textGen,
			effects: 'external',
			/** Each graph step sends a compiled prompt: approve or refuse (R-15 review fields). */
			review: { fields: [] },
			timeoutMs: extra.timeoutMs ?? 120000,
			timeoutKind: 'idle',
			usage: 'response.usage',
			slots: {
				connection: {
					kind: 'connection',
					quick: true,
					shape: S.textGen,
					requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				},
				sampling: { kind: 'sampling', quick: true, shape: S.textGen },
				prompts: {
					kind: 'prompts',
					quick: true,
					facet: 'prompts',
					fields: { [field]: { type: 'text' } },
				},
			},
			ports: {
				in: { scenes: S.graphScenes },
				out: { main: S.json, result: S.json },
			},
		}),
	)

/** Which existing node a mentioned name refers to, or whether it is new. @internal */
export const graphNodeResolution = graphStep(
	'core:oracle/graph-node-resolution@1',
	'Resolve nodes',
	'nodeResolution',
)

/** Drop what is not worth graphing before the expensive steps run. @internal */
export const graphPreFilter = graphStep(
	'core:oracle/graph-pre-filter@1',
	'Pre-filter',
	'preFilter',
)

/** Whose account of the scene this is. @internal */
export const graphPerspective = graphStep(
	'core:oracle/graph-perspective@1',
	'Perspective',
	'perspective',
)

/** The two-sentence introduction written for a newly discovered character. @internal */
export const graphNodeDescription = graphStep(
	'core:oracle/graph-node-description@1',
	'Describe new nodes',
	'nodeDescription',
)

/** Did any present character reach a new lifecycle state this scene? @internal */
export const graphStateDetection = graphStep(
	'core:oracle/graph-state-detection@1',
	'Detect state changes',
	'stateDetection',
)

/**
 * The proposal, held for review.
 *
 * `effects: 'write'` and therefore gate-eligible, which is the mechanism behind
 * the rule that a graph build **stops at the review screen** and never applies
 * itself. Under `async` review the proposal is exactly that — a proposal — and
 * `write-result@1` is the shape that refuses to be mistaken for row ids.
 * @internal
 */
export const graphProposal = pin(
	describeOutletDefinition({
		id: 'core:outlet/graph-proposal@1',
		i18n: { name: { en: 'Propose graph changes' } },
		effects: 'write',
		/** The proposal is what the review screen exists to edit (R-15 review fields). */
		review: { fields: ['proposal'] },
		timeoutMs: 10000,
		causesEvent: 'core:event/graph-proposal-created@1',
		ports: {
			in: { proposal: S.json },
			out: { main: S.writeResult, proposalId: S.writeResult },
		},
	}),
)

// ── Stats and states ────────────────────────────────────────────────────────
//
// A stat is declared once (`defineAttributeSlot`, SDK attributes.ts), attached where it
// is true by default, and valued where play happens. These two nodes are the
// pipeline's whole share of that: one reads the resolved state, one writes it.
// Everything about *what* a slot is lives in the SDK registry, so neither node
// carries a vocabulary that could drift from the one the app validates against.

/**
 * The session's stats and states, resolved — an inventory is one, the
 * `inventory` list stat (phase 3b retired possessions as edges).
 *
 * `{ world, cast, slots, who, version }` — the same object `stateFor(sessionId)`
 * returns and the shape `state` on `core:task/build-template-context@1` takes.
 * Every value is already resolved down session → lorebook → card →
 * declaration default, with absence meaning **inherit** rather than zero, and
 * derived slots computed rather than read.
 *
 * A Query, and a plain one: what it is is a read. There is no as-of parameter
 * — this is the `current` view, and the temporal registry that would give the
 * other one is not built (see docs/stats-and-states.md).
 *
 * `version` is the session's **state version** (plans/29 R-15 *Staleness and
 * order*; 30 §U5f): a counter every applied change moves, in turn order,
 * under a lock. A run that reads state here and later asks to change it
 * hands the version back as `base` on `resolve-state-changes@1` /
 * `set-state@1`, so a change proposed against a state that has since moved
 * is rebased or superseded rather than applied blind. The same number rides
 * the resolved document as `state.version`, where an enabled-when can name it.
 * @experimental
 */
export const sessionState = pin(
	describeQueryDefinition({
		id: 'core:query/session-state@1',
		i18n: { name: { en: 'Session state' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.json, state: S.json, version: S.json },
		},
	}),
)

/**
 * 🚧 How many of an item are held, and how many are left (attributes phase 3a,
 * 2026-09-26).
 *
 * An item is a `core:entry/item@1` lore entry whose **supply** is unique,
 * limited to N, or unlimited; a holder's **held count** rides the list item
 * that references it (`{ entryId, count }`) in any list slot the session
 * tracks — usually `inventory`. This answers, per entry asked about:
 * `{ entryId, name, supply, limit, held, remaining, holders }` —
 * `held` = Σ count across the session's owners (the world and every cast
 * member), `remaining` = limit − held, never below zero, and `null` for an
 * unlimited supply.
 *
 * ⚠ **It answers; it never enforces.** The owner ruled that supply is enforced
 * by genre pipelines: a pipeline that hands out the last key reads this first
 * and decides what a zero means (refuse, swap, narrate a shortage). The host
 * writes whatever the gate accepts.
 *
 * `entryIds` optional: with none it answers for every item entry in the
 * session's lorebook. An entry outside that lorebook is not answered for — the
 * scoping refusal, as for every Query.
 * @experimental
 */
export const itemSupply = pin(
	describeQueryDefinition({
		id: 'core:query/item-supply@1',
		i18n: { name: { en: 'Item supply' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope, entryIds: S.json },
			out: { main: S.json, supply: S.json },
		},
	}),
)

/**
 * 🚧 The stats a **lorebook** holds — for its world, each cast member and each
 * place — as durable values (owner-confirmed 2026-09-27: "Pipelines should be
 * allowed to query stats from the lorebook as well").
 *
 * ## The book's layer, and no session needed
 *
 * What write-back recorded onto the book's timeline, plus what an author set
 * on the lorebook, a cast member or a place: the row in force per owner and
 * slot, the same one a new session played in the book would inherit. Nothing
 * falls through to a card or a declaration default — a slot the book never
 * valued is an absent key, not the default — and no session is read, so a
 * pipeline with no session in play (a run the scope grants the book to) can
 * read it.
 *
 * `{ lorebookId, branchId, slots, world, cast, locations }`, keyed like
 * `session-state@1`'s document: `world.hp`; `cast.byId[castMemberId]` and
 * `cast[slug]` over one set of objects, each carrying `id` (the **cast
 * member's** id — `lorebook_bindings.id`, never the card's), `key` and `name`;
 * `locations` the same by location entry id. `branchId` is the line read
 * (null is main).
 *
 * ## Only what the book tracks
 *
 * A lorebook has no genre, so its vocabulary is phase 1's **world
 * attributes**: the sheets on the lorebook, its cast members and its places,
 * plus every declared, pickable slot the book holds a durable value for. It
 * fails closed: an undeclared slot, or one a mechanism keeps, is never read.
 *
 * ## Where on the book
 *
 * By default: the scope session's own line and moment when the book is that
 * session's; otherwise the book's **most recently used** line (the line of
 * the session played most recently) at the **head** of its timeline. On a
 * branch, main's dated values count only up to the fork date. The document
 * says where it read: `branchId`, `moment` (null = head), `forkedAt` (null =
 * no cut).
 *
 * 🚧 A custom reading, all optional: `branch` — `'main'`, `'mostRecent'`,
 * `'session'` or a branch id of this book; `at` — `'head'` or a story date
 * `{ year, month?, day? }`, keeping only values dated on or before it;
 * `forkCut: false` — let all of main through on a branch. A branch of
 * another book is refused like the book.
 *
 * ## Scope
 *
 * The scope session's own lorebook by default. `lorebookId` may name that
 * book, or one the run's scope grants; any other is **refused** with a
 * sentence, never read as empty — and so is an owner filter naming a cast
 * member or place of another book.
 * @experimental
 */
export const lorebookState = pin(
	describeQueryDefinition({
		id: 'core:query/lorebook-state@1',
		i18n: {
			name: { en: 'Lorebook state' },
			description: {
				en: 'Reads the stats a lorebook holds for its world, its cast members and its places — what earlier sessions recorded and what the author set. No session is needed.',
			},
		},
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which stats to read, by full id (`core:slot/hp@1`) or
					 * local name (`hp`). Empty or absent reads every stat the
					 * book tracks; a name it does not track reads nothing.
					 */
					slotIds: {
						type: 'list',
						item: { type: 'text' },
						label: { en: 'Only these stats' },
						description:
							'Which stats to read, by name. Leave it empty for every stat the lorebook tracks.',
					},
				},
			},
		},
		ports: {
			in: {
				/** Which session's lorebook, when `lorebookId` does not say. Optional. */
				scope: S.sessionScope,
				/** A lorebook id: the scope session's own, or one the run's scope grants. Optional. */
				lorebookId: S.json,
				/**
				 * One owner: `"world"`, `{ kind: 'cast_member', id }` or
				 * `{ kind: 'location', id }` (the session kinds `session`,
				 * `session_cast`, `session_location` are translated). Optional.
				 */
				owner: S.json,
				/** 🚧 `'main'`, `'mostRecent'`, `'session'` or a branch id of this book. Optional. */
				branch: S.json,
				/** 🚧 `'head'` or a story date `{ year, month?, day? }`. Optional. */
				at: S.json,
				/** 🚧 `false` lets all of main through on a branch. Optional. */
				forkCut: S.json,
			},
			out: { main: S.json, state: S.json },
		},
	}),
)

/**
 * 🚧 The **stat trail**: one stat's values over time, for one owner — the
 * world, a cast member or a place (owner-confirmed 2026-09-27: "stats over
 * time / over cast progression"). Its document is on `trail` (and `main`).
 *
 * ## Two clocks
 *
 * - `messages` — the scope session's own changes, in message order. A swiped
 *   or regenerated reply's changes are gone (the swipe retracts them), and a
 *   branched session holds its own copies, so neither leaks in.
 * - `timeline` — what the lorebook recorded across every session, ordered by
 *   the date of the history entry each hangs from (the one story-date
 *   comparator). An undated value — an author's, or one recorded before any
 *   capture — sorts first.
 * - `both` (default) — the timeline, then the session's messages: the session
 *   is played at the book's present. A timeline value this session itself
 *   recorded is dropped here, since it is already one of its points.
 *
 * Each point: `{ value, layer: 'session' | 'timeline', anchor, provenance }` —
 * `anchor` is `{ messageId }` or `{ historyEntryId, date }`; `provenance` is
 * `{ updatedBy, sessionId, messageId, sceneId, note, createdAt }` (who wrote
 * it: `user`, `run:<id>`, or `session:<id>` for write-back). The document is
 * `{ lorebookId, sessionId, branchId, owner, slotId, mode, tracked, points }`;
 * `tracked: false` with no points when neither the book nor the session tracks
 * the slot (fails closed).
 *
 * ## Limits
 *
 * `last` keeps the newest N points after every other cut. `since` is
 * `{ messageId?, date? }`: `messageId` keeps session points AFTER that
 * message (and drops the timeline in `both`, which precedes it); `date` keeps
 * timeline points dated ON or after it (a date is a period).
 *
 * ## Where on the book
 *
 * The timeline stands where `lorebook-state@1` does, with the same optional
 * `branch`, `at` and `forkCut` ports: on a branch, main's values after the
 * fork date are not points; at a date, nothing dated after it is. The
 * session's own messages are its own and are not cut. The document adds
 * `moment` and `forkedAt`.
 *
 * Scoped like `lorebook-state@1`: the scope session's lorebook, or one the
 * run's scope grants; any other, or an owner of another book, is refused.
 * @experimental
 */
export const statTrail = pin(
	describeQueryDefinition({
		id: 'core:query/stat-trail@1',
		i18n: {
			name: { en: 'Stat trail' },
			description: {
				en: 'Lists one stat’s values over time for the world, a cast member or a place — by message in this session, across sessions by story date, or both.',
			},
		},
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/** The stat, by full id or local name. */
					slotId: {
						type: 'text',
						quick: true,
						label: { en: 'Stat' },
						description: 'Which stat to follow, by name — for example hp.',
					},
					mode: {
						type: 'enum',
						of: ['both', 'messages', 'timeline'],
						members: [
							{
								key: 'both',
								label: { en: 'Both' },
								description: { en: 'Across sessions, then this session.' },
							},
							{
								key: 'messages',
								label: { en: 'This session' },
								description: { en: 'This session, message by message.' },
							},
							{
								key: 'timeline',
								label: { en: 'Across sessions' },
								description: {
									en: 'What the lorebook recorded across sessions, by story date.',
								},
							},
						],
						default: 'both',
						quick: true,
						label: { en: 'Which trail' },
						description:
							'This session message by message, what the lorebook recorded across sessions by story date, or both.',
					},
					last: {
						type: 'integer',
						default: 50,
						min: 1,
						max: 1000,
						label: { en: 'Most changes listed' },
						description: 'Keep only the most recent changes, up to this many.',
					},
				},
			},
		},
		ports: {
			in: {
				scope: S.sessionScope,
				/** A lorebook id: the scope session's own, or one the run's scope grants. Optional. */
				lorebookId: S.json,
				/** `"world"` (default), `{ kind: 'cast_member', id }` or `{ kind: 'location', id }`. */
				owner: S.json,
				/** `{ messageId?, date?: { year, month?, day? } }`. Optional. */
				since: S.json,
				/** 🚧 `'main'`, `'mostRecent'`, `'session'` or a branch id of this book. Optional. */
				branch: S.json,
				/** 🚧 `'head'` or a story date `{ year, month?, day? }`. Optional. */
				at: S.json,
				/** 🚧 `false` lets all of main through on a branch. Optional. */
				forkCut: S.json,
			},
			out: { main: S.json, trail: S.json, points: S.json },
		},
	}),
)

/**
 * Change state — or ask to.
 *
 * ## Why `propose` is the default
 *
 * The three writers do not have equal authority (`DESIGN-stats-and-states.md`).
 * A person editing a bar is authoritative; a genre's own script rolling damage
 * is authoritative because the genre author wrote the arithmetic; a **model**
 * is neither, and a model that could set a number silently is a model that can
 * rewrite the fiction between two messages with no receipt a player can
 * refuse. Defaulting to `propose` means a spec that wires a model's output
 * straight into this node produces a pending line with Accept / Reject, and a
 * genre that wants the other behaviour says so in one parameter.
 *
 * ## Why it is a Task
 *
 * It writes, which a Task is not otherwise supposed to do, and the alternative
 * is worse: F7 allows a spec **one** write-class Consumer and that one is the
 * message. A damage roll that also saves a reply would be unspecifiable. What
 * makes it defensible rather than a hole is that these rows are not the run's
 * primary artifact — every one of them is anchored to a message and retracted
 * with it, so a rejected turn takes its state changes with it.
 *
 * `changes` is one ordered list of `{ owner, slotId, value }` — or, for a
 * list slot, `{ owner, slotId, op: 'add' | 'remove', items }`. An item
 * changing hands is exactly that on the owner's `inventory` stat (phase 3b
 * retired the `{ owner, entryId, delta }` possession edge; the model-facing
 * item line survives on `resolve-state-changes@1`, which turns it into this). One
 * port because one turn's changes are one ordered list, and splitting them
 * would let a spec apply half of them.
 */
/**
 * Changes a model NAMED, turned into changes `set-state` can write.
 *
 * ## A Query, because resolving a name is a READ
 *
 * "Verity" becomes a cast row by looking her up in this session's cast, which
 * is a read of the host and therefore a Query's job — a Task is handed no
 * services (F11). That also buys the scoping refusal for free: the cast it
 * matches against is the cast of the session on the `scope` port and no other.
 *
 * ## Why this is a node and not a leniency inside `set-state`
 *
 * `core:task/set-state@1` takes an owner as `{ kind, id }` — a row, resolved,
 * unambiguous. A model has no row ids: it has the names the transcript gave it
 * ("Verity", "the world") and the local name of a stat ("hp"). Something has to
 * resolve one into the other, and the two candidates were this node or a
 * widened `set-state`.
 *
 * It is this node, because the two callers are genuinely different. A genre's
 * own script that rolled damage knows which cast row it hit and must not have
 * its exact owner re-guessed by a fuzzy name match; a model's proposal has
 * nothing else to offer. Widening `set-state` would make every writer pay for
 * the model's ambiguity, and would move a resolution failure inside the node
 * that writes — where it can only be a refusal, never a line on the receipt.
 *
 * The same resolution the three state tools do (`set_state`, `give_item`,
 * `take_item`), reached from a structured block instead of from a tool call.
 * An item line (`{ owner, entryId, delta }`) resolves to an `add` / `remove`
 * with a held count on the owner's `inventory` stat, refused as a sentence
 * when the session does not track inventory (phase 3b).
 *
 * ## A name it cannot resolve is a RESULT, not a halt
 *
 * A keeper that named five changes and got one character's name wrong should
 * land four proposals and a sentence about the fifth. `refused` carries those
 * sentences so the receipt can show them; `changes` carries what resolved.
 * Halting the turn over one bad name would lose the other four, which is the
 * same argument `set-state`'s own per-change refusal makes.
 * @experimental
 */
export const resolveStateChanges = pin(
	describeQueryDefinition({
		id: 'core:query/resolve-state-changes@1',
		i18n: { name: { en: 'Resolve state changes' } },
		timeoutMs: 5000,
		ports: {
			in: {
				/**
				 * `[{ owner, slot, value } | { owner, entryId, delta }]` as a
				 * model writes them: `owner` is a name from the conversation or
				 * `world`, `slot` is a stat's local name (`hp`) or its full id,
				 * and an item line moves `delta` of a lore entry into (+) or
				 * out of (−) the owner's inventory.
				 */
				changes: S.json,
				/**
				 * Who a change that names no `owner` is for, as participant
				 * references (lair re-plan R10, 2026-09-28): each such change
				 * is made once per reference, the same slot and value on each —
				 * the Lair's Whisper writes its one line on every recipient the
				 * press collected (`core:inlet/user-message@1.recipients`). A
				 * `character:<id>` resolves to that seated cast member; any
				 * other reference, or a character this session does not seat,
				 * is a sentence on `refused`. A change that names its own
				 * `owner` keeps it. Optional: unwired, an owner-less change is
				 * the world's, as before.
				 */
				owners: S.participantRefs,
				/** Which session's cast the names are resolved against. */
				scope: S.sessionScope,
				/**
				 * The planner's document, whose `worldHints` are a second,
				 * smaller set of named changes: where this turn happens, the
				 * time of day and the weather.
				 *
				 * Its own port rather than more entries on `changes`, because
				 * a reference is `{node, port}` with no sub-path — a spec
				 * cannot join one node's list to another node's object on one
				 * port, and the two are written by different agents answering
				 * different questions. A hint that repeats what the world
				 * already says proposes nothing, which is what makes "repeat
				 * the state when this turn changes none of it" safe to ask of
				 * the planner.
				 */
				plan: S.json,
				/**
				 * The **state version** this turn read (U5f): the session-state
				 * query's `version`. Passed through onto every resolved change
				 * as `base`, so `set-state` can tell a delta against the state
				 * the model saw from one against a state that has since moved.
				 * Optional: a spec that wires none proposes against whatever
				 * is current at the write.
				 */
				base: S.json,
				/**
				 * 🚧 `core:query/item-supply@1`'s answer (phase 3b). Optional,
				 * and the only way supply is ever checked: core never enforces
				 * it (owner ruling 2026-09-25), so a genre that wants a unique
				 * item to stay unique wires this, and an item line granting
				 * more than is left lands on `refused` as a sentence. A take
				 * frees what that owner held before the turn's gives are
				 * counted.
				 */
				supply: S.json,
			},
			out: {
				main: S.json,
				/** Ready for `core:task/set-state@1`'s `changes` port — each carrying `base` when one was wired. */
				changes: S.json,
				/** One sentence per change that named something not here. */
				refused: S.json,
			},
		},
	}),
)

/** @experimental */
export const setState = pin(
	describeTaskDefinition({
		id: 'core:task/set-state@1',
		i18n: { name: { en: 'Set state' } },
		timeoutMs: 5000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					mode: {
						type: 'enum',
						of: ['propose', 'apply'],
						members: [
							{
								key: 'propose',
								label: { en: 'Propose' },
								description: { en: 'Holds the changes for the player to accept or reject.' },
							},
							{
								key: 'apply',
								label: { en: 'Apply' },
								description: {
									en: 'Writes them immediately, stamped with this run. Only where the pipeline itself decided the number.',
								},
							},
						],
						default: 'propose',
						quick: true,
						description:
							"Whether the changes wait for the player or are written at once. Use Apply only where the pipeline itself decided the number.",
					},
				},
			},
		},
		ports: {
			// [{ owner: { kind, id }, slotId, value, base? } | { owner, entryId, delta, base? }]
			// `scope` is what says which session, and therefore which message a
			// change is anchored to — a change with no anchor is one a swipe
			// could not take back.
			in: {
				changes: S.json,
				scope: S.sessionScope,
				/**
				 * The **state version** the changes are deltas against (plans/29
				 * R-15 *Staleness and order*; U5f) — the session-state query's
				 * `version`, for every change that does not carry its own
				 * `base`. In `apply` mode a base behind the current version is
				 * **rebased**: a change whose slot is untouched since the base
				 * still holds and is applied; one whose slot moved is put on
				 * `refused` with the versions named, and the next turn's
				 * `resolve-state-changes` re-resolves it — a run never re-enters
				 * an earlier node. In `propose` mode the base is stamped on the
				 * proposal for the accept to judge the same way. Optional: with
				 * none, the write is against whatever is current.
				 */
				base: S.json,
				/**
				 * **The row the WORLD's changes are filed at** (lair pass R8,
				 * 2026-09-28): a message this run wrote earlier, as that
				 * write's result. Optional, and only for world-owned changes
				 * (the session and its places); a cast member's change still
				 * files at that member's own latest line (the turn lock).
				 * Declared, never inferred: the Lair wires its Sanctum beats
				 * row, so the turn's world changes show in the Sanctum beside
				 * the plan that made them rather than on whichever delver
				 * spoke last. A write-result only — a run may name its OWN
				 * row, which is open to it for the rest of its turn; any
				 * other value is refused.
				 */
				worldRow: S.writeResult,
			},
			/**
			 * What happened, as three lists: `applied` for rows written,
			 * `proposed` for rows held, `refused` for the sentences — a value
			 * the slot does not accept, or a slot that moved since `base`.
			 * The first two are always present and one of them is always
			 * empty, so nothing downstream decides which mode ran by looking
			 * for a missing key.
			 */
			out: { main: S.json, applied: S.json, proposed: S.json, refused: S.json },
		},
	}),
)

// ── core:query/lorebook-entries@1 ───────────────────────────────── begin ────
// Appended as a delimited block rather than placed beside the four lore
// definitions above (≈ line 930–1345), because another session is editing this
// file. It belongs after `historyEntries`; move it there once that lands.

/**
 * The session's attached lorebook, **listed** — every entry, or the one with a
 * given name.
 *
 * ## Not a retrieval, and that is the whole point
 *
 * The four entries-shaped definitions above — `lorebook-triggers@1`,
 * `world-lore@1`, `character-lore@1`, `history-entries@1` — are one keyword
 * scan over the conversation, and an entry reaches a prompt through them only
 * by matching a key, by clearing `admitThreshold` on other evidence, or by
 * declaring itself `constant`. That is right for a reply and it is no use at
 * all to a genre that needs to see the book: on a **create** run there is no
 * conversation to scan, so the window is empty and only always-on entries are
 * admitted — and a genre asking *is there a room called the Cellar?*, *pick one
 * of these as the secret*, or *who are the suspects?* had no door at all
 * (plans/genres §10 G13/G14, §11 L4).
 *
 * This is that door, and it is deliberately dull: **no mechanism runs, nothing
 * is scored, nothing is ranked.** `main` and `entries` carry one bare list of
 * rows — a **listing**, never `core:shape/context-candidates@1` — so there is
 * no order of merit in it for a reader to mistake for one. A spec that wants
 * the book ranked concatenates it into the ranker like any other source; this
 * node will not do it for them.
 *
 * ## The rows are retrieval's rows
 *
 * Same fields, from the same host read and the same `toLoreEntry` projection
 * the four definitions above publish on each candidate's `payload` — `id`,
 * `source`, `name`, `content`, `keys`, `constant`, `enabled`, `position`,
 * `priority`, the matcher set, `bindingCharacterId`, `hasEmbedding`,
 * `fingerprint`, and history's `year` / `month` / `day`. That is the contract
 * worth having: a task written against a retrieved entry reads a listed one
 * without a second shape to learn, and there is no second projection to keep in
 * step (R5 — the vocabularies are reconciled at the host's read, not merged).
 *
 * ## What it will not hand over
 *
 * · **Another session's lorebook.** `scope` decides which session, and a
 *   `sessionId` that disagrees with the run's is refused with a sentence
 *   (`assertScoped`), never filtered down to an empty list.
 * · **Disabled or archived entries.** `enabled: false` is a switch the author
 *   left off and `archived` is the column whose stated meaning is *don't
 *   retrieve it and don't show it to me*; a listing that offered either would
 *   make a switched-off room exist and a shelved suspect answer for a crime.
 *   Both are filtered at the read. (The scan above still *sees* disabled rows,
 *   on purpose — it reports them on `skipped` so a person can be told why their
 *   lore did not come in. Nothing here changes that.)
 * · **Character lore that is private from the current speaker.** The read
 *   applies the same binding-visibility policy the four definitions above run
 *   under, so this is not a way around it. In the case this node exists for —
 *   a create run, an oracle, anything narrator-shaped — `currentCharacterId` is
 *   null, the policy is omniscient, and the whole book comes back.
 *
 * ## No `optional`
 *
 * Absent, so a failure is the run's failure. A genre that picked its secret
 * from this list cannot be handed an empty one and carry on: `optional: true`
 * turns an error into an empty `ok`, and an empty book and a book that failed
 * to load are the same value to every reader downstream. It is also not a node
 * a person should be able to switch off — a Twenty Questions pipeline without
 * it has nothing to play with.
 * @experimental
 */
export const lorebookEntries = pin(
	describeQueryDefinition({
		id: 'core:query/lorebook-entries@1',
		i18n: {
			name: { en: 'Lorebook entries' },
			description: {
				en: 'Lists the entries of the session’s lorebook — all of them, or the one with a given name. Retrieval is not involved: nothing is matched against the conversation, nothing is scored and nothing is ranked.',
			},
		},
		/**
		 * The lore definitions' number. One indexed read of one book plus the
		 * bindings it hydrates, which is the same work their shared scan pays
		 * for before it scans anything.
		 */
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which entry types to list — `core:entry/world-lore`,
					 * `core:entry/character-lore`, `core:entry/history`, or a
					 * plugin's own. Bare ids, no `@version`: the version is a
					 * separate column and a type's rows are its rows across
					 * versions.
					 *
					 * A `list` of `text` rather than an `enum` of the three
					 * core ids, because the set is open — an install with a
					 * plugin entry type has more of them, and an enum frozen
					 * into this definition's content hash could not grow
					 * without a re-projection. An id no type declares matches
					 * nothing, which is the honest answer to a typo.
					 *
					 * Empty or absent lists every entry type.
					 *
					 * Named `entryTypes` rather than `types` (R3): *type* alone
					 * is the word four other vocabularies use — a node type, a
					 * session type, a part type — and a parameter may not take
					 * the bare noun.
					 */
					entryTypes: {
						type: 'list',
						item: { type: 'text' },
						label: { en: 'Entry types listed' },
						description:
							'Which kinds of entry to list, by type id — world lore, character lore, history, or a type an extension declares. Leave it empty for all of them.',
					},
					/**
					 * The *does it exist* case: one exact name, matched
					 * case-insensitively with surrounding whitespace trimmed
					 * on both sides.
					 *
					 * Exact and never a substring or a pattern. A genre asking
					 * "is there a room called the Cellar?" needs *yes* or *no*,
					 * and a match that also returned "Cellar Door" and "The
					 * Wine Cellars" would answer a question nobody asked — the
					 * search-shaped reading of this node is the keyword scan
					 * above, which already exists and is better at it.
					 *
					 * History entries have no name at all (the type declares no
					 * title role), so naming one lists nothing.
					 *
					 * Absent lists every entry of the chosen types.
					 */
					name: {
						type: 'text',
						quick: true,
						label: { en: 'Only the entry named' },
						description:
							'List only the entry with exactly this name, ignoring capitalisation and surrounding spaces. Leave it empty to list them all.',
					},
					/**
					 * A ceiling on rows read, not a page: there is no offset
					 * and no cursor, so raising it is the only way to see more.
					 *
					 * 500 is a large lorebook and 2000 is a ceiling on the
					 * ceiling — this list is usually on its way into a prompt,
					 * and a book that would not fit in a context window is not
					 * made to fit by asking for all of it. The cap is enforced
					 * at the read as well as declared here; a node's parameter
					 * is a control, never a promise the host takes on trust.
					 */
					limit: {
						type: 'integer',
						default: 500,
						min: 1,
						max: 2000,
						label: { en: 'Most entries listed' },
						description:
							'A ceiling on how many entries are listed. There is no second page — raising this is the only way to see more.',
					},
				},
			},
		},
		ports: {
			/**
			 * Which session's lorebook, and — through `currentCharacterId` —
			 * who is speaking, which is what the binding-visibility policy
			 * reads. No `text` in-port: there is nothing here to match text
			 * against.
			 */
			in: { scope: S.sessionScope },
			/**
			 * One bare list of rows on both ports, `main` for a spec that
			 * wires the node's output and `entries` for one that names what it
			 * is reading. Same value, same order — world lore, then character
			 * lore, then history, each by row id.
			 *
			 * ⚠ `S.json` and deliberately **not** `S.candidates`. A candidate
			 * is something a mechanism proposed, carrying signals a ranker
			 * reads; these rows were proposed by nothing and carry no signals,
			 * and publishing them as candidates would let a spec wire a
			 * whole lorebook into `select` as if a scan had found it.
			 */
			out: { main: S.json, entries: S.json },
		},
	}),
)

// ── core:query/lorebook-entries@1 ───────────────────────────────── end ──────

/**
 * A room name, unless something already describes it (lair pass R7,
 * 2026-09-28; replaced `core:task/unlisted-name@1`).
 *
 * The Lair's planner names the room the party are about to walk into when it
 * thinks nobody has built it, and the turn stops to ask the dungeon's master
 * to describe it (owner ruling 2, 2026-09-28: *ask, unless it is already
 * described in prose or the lorebook*). This is the deterministic check after
 * the planner's judgement. Lookups, in order; the first hit wins:
 *
 * 1. **Entry.** An entry whose `name`, or any of whose `keys` (a list, or a
 *    comma-separated string, split on commas), is the same name. Entries on
 *    `locationEntries` are checked before `entries`. Any entry type counts.
 *    → `describedBy` `entry`, `entryId`.
 * 2. **Prose.** Among the newest `window` rows of `messages` on the
 *    `channels` named, the newest row whose author is **a person, an envoy or
 *    a speakerless reply** — never a character: a delver's line naming a door
 *    is not a description — with a paragraph (split on blank lines) that
 *    names the name and holds at least `minWords` words besides it.
 *    → `describedBy` `prose`, `passage` (that paragraph).
 * 3. Otherwise `undescribed` is the name, trimmed.
 *
 * "The same name" and "names the name" are the SDK's name rule
 * (`normalizeName`, `sameName`, `passageNaming` in `names.ts`): NFKC, case,
 * a possessive `'s`, apostrophes and punctuation, and one leading article —
 * then whole equality, never a substring ("the vault" is not "the sunken
 * vault").
 *
 * Pure: the rows come in on ports (a `core:query/lorebook-entries@1` listing,
 * a `core:query/session-history@1` read), so a genre decides what is read
 * and the task decides only what counts. `channels` filters the rows by their
 * own `channel` (a bare slug is every lane of it), so a core task never
 * hard-codes a genre's slug: a spec that wants a side channel's prose to count
 * reads it and names it here.
 * @experimental
 */
export const undescribedName = pin(
	describeTaskDefinition({
		id: 'core:task/undescribed-name@1',
		i18n: { name: { en: 'Undescribed name' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					/**
					 * Whose prose counts, by channel slug. `main` by default;
					 * the Lair adds its side channel so a room its master
					 * described there counts too.
					 */
					channels: {
						type: 'string',
						list: true,
						default: ['main'],
						label: { en: 'Channels read' },
						description: {
							en: 'Which channels’ messages can describe a room. A slug covers every lane of that channel.',
						},
					},
					/** How far back prose counts, in rows across those channels. */
					window: {
						type: 'integer',
						default: 40,
						min: 1,
						max: 500,
						label: { en: 'Messages read' },
						description: {
							en: 'How many of the newest messages on those channels are searched for a description.',
						},
					},
					/**
					 * How long a paragraph must be to be a description rather
					 * than a mention: words besides the name itself.
					 */
					minWords: {
						type: 'integer',
						default: 12,
						min: 0,
						max: 500,
						label: { en: 'Words to describe' },
						description: {
							en: 'How many words, besides the name, a paragraph needs before it counts as describing the room rather than mentioning it.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/**
				 * The name to look for — JSON rather than text because it is
				 * usually read off a model's document (`parse-json@1`'s
				 * `value`); anything but a string is no name, and nothing is
				 * undescribed.
				 */
				name: S.json,
				/** Location entries (rows with `id`, `name`, `keys`), checked first. */
				locationEntries: S.json,
				/** The rest of the book, any entry type, checked second. */
				entries: S.json,
				/** Recent rows, ascending, each carrying its `channel`. */
				messages: S.messages,
			},
			out: {
				main: S.text,
				/** `name`, trimmed, when nothing describes it; else empty. */
				undescribed: S.text,
				/** `entry`, `prose`, or empty when nothing describes it. */
				describedBy: S.text,
				/** The describing entry's id, or null. */
				entryId: S.json,
				/** The describing paragraph, or empty. */
				passage: S.text,
			},
		},
	}),
)

// ── D-4a: pure pick and cast options ──────────────────────────── start ──────

/**
 * The item this session picks — a pure function of a key and a list.
 *
 * ## The gap it closes
 *
 * Nothing in the bound catalogue evaluated a pure function over run data. The
 * closest was `core:task/turn-random@1`, which draws on `ctx.random` — seeded
 * per RUN, so it answers differently every turn — and that is right for whose
 * turn it is and useless for a fact that has to stay the same all game. So a
 * genre wanting its hidden fact **chosen** (which suspect did it, which lore
 * entry the answer is) had two options and neither was honest: ask a model,
 * which can change its mind between two answers, or write it into the one
 * per-session store a spec can reach — the attribute-slot ledger, which the
 * player's own state panel renders. Whodunit shipped adjudicating from an
 * authored case file for exactly this reason, with its rendezvous rule
 * published, tested and called by nobody.
 *
 * Derived instead: the create run and every later turn hand the same
 * `scopeKey` and the same list to this node and reach the same item, with
 * nothing written down anywhere and nothing on screen.
 *
 * ## Rendezvous hashing, and why not `list[hash % length]`
 *
 * Each candidate is scored on its own — `hash(key + '#' + itemKey)` — and the
 * highest wins (`rendezvousPick`, SDK `pick.ts`, the one implementation the
 * app's binding and a plugin's own picker share). A modulo into the list
 * moves *every* session's answer when the list length changes; rendezvous
 * moves it exactly when the newcomer's own score wins, so seating a fifth
 * suspect mid-case displaces the culprit in about a fifth of sessions and
 * leaves the rest alone. The hash carries murmur3's `fmix32` finalizer
 * because the comparison is over whole hashes and plain FNV-1a leaves the
 * high bits systematic for ids differing in their last digit — measured at
 * 49% of sessions for the first of three, instead of 33%.
 *
 * ## `scopeKey` is the session's address, never the run's seed
 *
 * A spec wires `$.input.sessionScope` (or a literal) — something durable. The
 * run's seed is a different string every turn and a pick keyed on it would
 * move between two questions. It is `scopeKey` and not `key` (R3, named
 * 2026-09-17, before anything shipped): *key* alone is the option key on a
 * choice, the identity a candidate is scored under, and a settings field's
 * name, and this port is none of them — it is the scope the pick is made
 * within.
 *
 * ## No `optional`
 *
 * Absent, so an empty list is the run's failure. A genre that derived its
 * secret from this node cannot be handed "nobody" and carry on, and
 * `optional: true` would turn that into an `ok` with every downstream port
 * reading absent — indistinguishable from a turn where the pick genuinely
 * chose nothing.
 * @experimental
 */
export const pickByHash = pin(
	describeTaskDefinition({
		id: 'core:task/pick-by-hash@1',
		i18n: {
			name: { en: 'Pick by hash' },
			description: {
				en: 'Picks one entry of a list for this session, the same one every time, without writing anything down. Adding an entry almost never moves the pick.',
			},
		},
		/** Pure arithmetic over a list that is already in memory. */
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which field on each entry identifies it.
					 *
					 * The identity is what the hash is taken over, so it
					 * decides the answer: two runs that disagree about it
					 * disagree about the pick. Absent, an entry that IS a
					 * string is its own identity and anything else is
					 * identified by `id` — the two shapes a core list
					 * actually arrives in (`cast-choices` publishes `key`,
					 * a lore listing publishes rows with `id`).
					 *
					 * ⚠ It must be **stable**: a name the author may edit
					 * moves the pick the day they edit it. A row id does not.
					 */
					by: {
						type: 'string',
						quick: true,
						label: { en: 'Identified by' },
						description:
							'Which field on each entry identifies it — a row id, or the option key. Leave it empty for plain strings, or for rows with an `id`.',
					},
				},
			},
		},
		ports: {
			in: {
				/** The list to pick from. */
				items: S.json,
				/**
				 * The stable key this session picks under.
				 *
				 * Either the session's **scope** — `$.input.sessionScope`,
				 * which the binding spells `session:<id>` — or a literal
				 * string for a pick that is not per-session.
				 *
				 * ⚠ `S.json` rather than `S.text`, and not for want of a
				 * type. `session-scope@1` is not assignable to `text@1`, and
				 * there is no text-shaped port anywhere that carries a
				 * session's identity — so a `text` port here could be wired
				 * to a literal and to nothing else, which would give every
				 * session of a genre the same answer. `json` is the
				 * permissive sink, so the scope wires, a literal wires, and
				 * anything a spec wires that the binding cannot read as a key
				 * halts with a sentence naming what to wire instead.
				 */
				scopeKey: S.json,
			},
			out: {
				/** The chosen entry, whole and exactly as it arrived. */
				main: S.json,
				/**
				 * Where it sat in the list **as handed in**, not among the
				 * identifiable entries. `pickIndex` rather than `index`
				 * (R3): a bare *index* is a database index, a message's
				 * position and a list offset all at once.
				 */
				pickIndex: S.json,
				/**
				 * The identity it won under — the string the hash was taken
				 * over. This is the side a later junction compares an answer
				 * against with `equalsPath`, which is why it is published at
				 * all: the chosen item is a document, and a predicate
				 * compares keys.
				 */
				chosenKey: S.text,
			},
		},
	}),
)

/**
 * The room, as options a question can be put with.
 *
 * `core:task/make-choices@1` needs `{ key, label }` options and nothing in
 * core turned a cast into that list, so both Whodunit pickers spend a model
 * call whose entire job is to read the cast back out as JSON — a request, a
 * schema and a wait, for a fact the run already held. Worse than slow: a
 * model enumerating the room can misspell a suspect, invent one, or leave one
 * out, and the options it writes are what the player may press.
 *
 * Pure. The cast read is the fact; this shapes it.
 *
 * ## The key is a participant reference
 *
 * `character:<id>`, the reference vocabulary (R-18 (3)) — not a name, which
 * two cast members can share and an author can edit, and not a bare id, which
 * says nothing about what it identifies. It survives the round trip: the key
 * lands on the pressed option, `core:task/read-answer@1` publishes it as
 * `choice`, and a junction can compare that against a
 * `core:task/pick-by-hash@1` `chosenKey` derived over these same options.
 *
 * ## Who is in the list
 *
 * Live seats only — a departed or inactive cast member is not somebody a
 * question may be put about — and **never an envoy**: `exclude` offers no way
 * to turn one off, and a narrator among the suspects with no way to remove it
 * is worse than a narrator a spec has to add for itself.
 *
 * ## It publishes the whole document, not only the list (ruled (b), 2026-09-17)
 *
 * `make-choices@1` reads `{ question, options, addressee? }` off ONE `json`
 * port, so a spec handed only `options` still has nowhere to put the question
 * — and the obvious repair, a second in-port on `make-choices`, would move
 * the hash of a node that is published and wired into shipped specs. So the
 * shaping happens on this side: `question` comes in, `json` goes out in
 * exactly the shape that port reads, and the two nodes wire straight to each
 * other with no model call in between. `options` stays beside it for a spec
 * that wants the bare list (a pick over the same options, a `each` over the
 * room), which is the same value the document carries.
 *
 * No `addressee`: the document's is a **name** `make-choices` resolves
 * against the cast, and this node has no more idea who the question is for
 * than the cast document does. A spec that knows wires `make-choices`'s own
 * `addressee` port, which wins over the document's anyway.
 * @experimental
 */
export const castChoices = pin(
	describeTaskDefinition({
		id: 'core:task/cast-choices@1',
		i18n: {
			name: { en: 'The cast as choices' },
			description: {
				en: 'Turns the session’s cast into the option list a question is asked with — one option per live character, keyed by who they are.',
			},
		},
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which half of the room to leave out.
					 *
					 * A persona is a character the player voices (0132), so
					 * both halves are cast members and which one a question
					 * is about depends entirely on the question: *who do you
					 * accuse* is asked about the suspects and must not offer
					 * the detective, while *who do you play* is the other way
					 * round.
					 */
					exclude: {
						type: 'enum',
						of: ['none', 'personas', 'characters'],
						members: [
							{ key: 'none', label: { en: 'Nobody' } },
							{
								key: 'personas',
								label: { en: 'Personas' },
								description: { en: 'The characters the players voice.' },
							},
							{
								key: 'characters',
								label: { en: 'Characters' },
								description: { en: 'The rest of the cast.' },
							},
						],
						default: 'none',
						quick: true,
						label: { en: 'Left out' },
						description:
							'Leave out the characters the players voice (personas), the rest of the cast (characters), or nobody.',
					},
				},
			},
		},
		ports: {
			in: {
				cast: S.sessionCast,
				/**
				 * The question the options answer — the prose that sits
				 * above them on the block, and the row's own content.
				 *
				 * Unwired it is the empty string, and `make-choices@1`
				 * publishes no block for a document with no question — the
				 * same silence it answers an empty option list with, rather
				 * than a block asking nothing.
				 */
				question: S.text,
			},
			out: {
				/** `{ key, label }[]`, in seating order: characters, then personas. */
				main: S.json,
				options: S.json,
				/**
				 * `{ question, options }` — the document
				 * `core:task/make-choices@1` reads off its own `json` port,
				 * in exactly that shape, so the two wire straight to each
				 * other and no oracle stands between a cast read and the
				 * question it is asked with.
				 */
				json: S.json,
			},
		},
	}),
)

// ── D-4a: pure pick and cast options ────────────────────────────── end ──────

// ── Contracts batch 2: the two-document pair ──────────────────── start ──────

/**
 * Two values, side by side in one document, under names a path can read.
 *
 * ## The gap it closes
 *
 * A junction branches on **one** port, and `equalsPath` compares two paths of
 * **one** document (D-4a). So the grammar can ask *is the accused the culprit?*
 * only once something has put the accused and the culprit in the same
 * document, and nothing in core did: no task merged two json ports, and the
 * obvious repair — a second in-port on the junction — is not a repair, it is a
 * different clause. Whodunit shipped with its verdict's `accused` node wired to
 * nothing for exactly this reason.
 *
 * Pure, and deliberately the dullest node in the catalogue. It computes
 * nothing, decides nothing and reads nothing: it is the shape change that lets
 * a predicate see both sides.
 *
 * ## ⚠ An absent side is **omitted**, never null
 *
 * This is the whole of the node's behaviour worth stating. `predicateHolds`
 * answers `false` when either side of an `equalsPath` is `undefined` — two
 * absences are not a match — and that rule is what makes a junction over this
 * document **safe on a turn where nothing was decided**: a run in which the
 * accuse never happened has no `accused`, so
 * `{ path: 'accused', equalsPath: 'culprit' }` fires nothing, and the spec
 * falls through to its default branch.
 *
 * Writing `null` for an unwired side would destroy that. `null` is a *value*:
 * `readPath` returns it, it is not `undefined`, and `null === null` — so a
 * document with both sides missing would compare **equal** and the verdict
 * branch would fire on a turn where nobody accused anybody. The omission is
 * therefore load-bearing and pinned by a test, not an implementation detail of
 * the handler.
 *
 * The same rule covers the side that is wired but produced nothing: a port
 * resolving absent is absent here too. What arrives is written; what does not
 * is not mentioned.
 *
 * ## The names are the spec's
 *
 * `firstKey` and `secondKey` decide what the document's keys are called, so
 * the same node reads as `{ accused, culprit }` in one spec and
 * `{ guess, secret }` in another and the predicate paths are the spec's own
 * words. Defaults `first` and `second`, which are honest and nobody would
 * write a predicate against on purpose.
 *
 * Two keys that are the same string are refused rather than collapsed: one key
 * holding whichever side was written last is a document that compares equal to
 * itself, which is the one answer this node must never produce by accident.
 * @experimental
 */
export const pair = pin(
	describeTaskDefinition({
		id: 'core:task/pair@1',
		i18n: {
			name: { en: 'Pair' },
			description: {
				en: 'Puts two values side by side in one document, under names you choose, so a branch can compare them. Whichever side is missing is left out.',
			},
		},
		/** Two reads and an object literal. */
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					firstKey: {
						type: 'string',
						default: 'first',
						quick: true,
						label: { en: 'Name for the first value' },
						description:
							'What the first value is called in the document — the word a branch reads it by.',
					},
					secondKey: {
						type: 'string',
						default: 'second',
						quick: true,
						label: { en: 'Name for the second value' },
						description:
							'What the second value is called in the document. It must differ from the first.',
					},
				},
			},
		},
		ports: {
			in: {
				/** Whatever the spec wants compared. Absent is a legal input. */
				first: S.json,
				second: S.json,
			},
			out: {
				/**
				 * `{ [firstKey]: first, [secondKey]: second }`, with an absent
				 * side **omitted** — see the note above; it is the property a
				 * junction over this document depends on.
				 */
				main: S.json,
			},
		},
	}),
)

// ── Contracts batch 2: the two-document pair ────────────────────── end ──────
