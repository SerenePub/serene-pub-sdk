/**
 * Core's **outlet** node definitions — writes, attaches, emits: where a run leaves
 * into the world.
 *
 * One file per node kind, with the helpers only that kind uses; `index.ts`
 * re-exports them all.
 */

import { S } from '@serene-pub/sdk'
import { describeOutletDefinition, pin } from '@serene-pub/sdk'
import type { WriteResult } from '@serene-pub/sdk'

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
				/**
				 * 🚧 The **turn plan** this row carries (Lair character turns,
				 * owner ruling 2026-09-30): `{ plan, locationPassage? }`, where
				 * `plan` is a planner's document whose `speakers` (side-character
				 * facts — `{ name, intent }` or `{ characterId }`) name who takes
				 * a **character turn** next, in order, and `locationPassage` is
				 * prose that describes the room they are heading into. The host
				 * resolves each speaker to a seated cast member and stores the
				 * whole as `metadata.turnPlan` (`{ turns, plan, locationPassage? }`,
				 * `turns` the participant references in order). A turn-order
				 * strategy reads the **standing plan** off the history and
				 * prepares one entry per turn not yet taken (`via: 'plan'`); each
				 * character turn reads it back through `core:query/turn-plan@1`.
				 * Absent, or with no `plan`, the row plans nothing — which is
				 * every row but a planner's.
				 */
				turnPlan: S.json,
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
				 * reasoning fold reads it; absent means none. Shown folded,
				 * and never re-sent to the model: the prompt transcript reads
				 * a row's text alone (decision D5, 2026-09-27).
				 */
				reasoning: S.text,
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
				 * only when given. Like `reasoning`, never re-sent to the model.
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

// ── Sprites (DESIGN-sprites §5, 2026-09-24; in-pipeline 2026-10-05) ─────────

/**
 * Record a line's **shown sprite**. Writes it on the line's ACTIVE swipe
 * (`metadata.swipes.spriteHistory[currentIdx]`, mirrored to
 * `metadata.sprite`), so each swipe keeps its own face.
 *
 * Who chose it is `source`, written by the spec as a literal: `picker` after
 * a reply, `person` in `core:spec/show-sprite` (a person's pick from the
 * message menu). A picker never overwrites a person's pick. A picker's null
 * pick writes nothing — the line keeps what it shows; a person's null clears
 * the line's sprite.
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
				/** A `sprite-pick@1` — a picker's, or a person's; null for none. */
				pick: S.spritePick,
				/**
				 * Who chose the pick: `'picker'` or `'person'`.
				 *
				 * ## A port, not a parameter, and the call site is what decides
				 *
				 * A literal in the node's config, on `create-message`'s
				 * `generating` terms: the reply specs write `source: 'picker'`
				 * and `core:spec/show-sprite` writes `source: 'person'`. A
				 * `params` field would put a structural fact of the document
				 * in the panel as a knob. It was the host's to decide from the
				 * running spec's id until 2026-10-05; the document says it now.
				 *
				 * ⚠ Stated, not trusted: a host accepts `'person'` only from
				 * core's own `core:spec/show-sprite`, run for a person whose
				 * pick it checked against the item rule, as for an edit.
				 */
				source: S.text,
			},
			out: {
				main: S.writeResult,
				messageId: S.writeResult,
				/** What the line now shows, or null. */
				sprite: S.json,
				/**
				 * True when nothing was written — a picker meeting a person's
				 * pick, a picker's null pick, or the sprite the line already
				 * shows.
				 */
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
		causesEvent: 'core:event/session-updated@1',
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
 * Each entry of `links` is a name or an entry id, or a `LoreLinkInput` —
 * `{ to, linkType?, reverseLinkType?, name?, description? }` — for one that
 * says more (places plan B2, 2026-09-29). Absent on nearly every write, and an
 * empty list is the same as none. A link the list states twice, or one the
 * session already reads, is written once: see `linkLoreEntries` on idempotence.
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
				 * note above on F7. Names, entry ids, or `LoreLinkInput`s.
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
 * ## What the link says (places plan B2, 2026-09-29)
 *
 * The row is a **relationship**, and it carries the relationship's whole
 * descriptor — the same four words the lorebook's own link form edits:
 *
 *  - `linkType` — the relationship type, read from the `from` end ("leads
 *    north to"). Free text in the row and free text here: the app's list is a
 *    vocabulary of *suggestions*, and nothing reads a relationship type
 *    semantically. The default is `leads to`.
 *  - `reverseLinkType` — the wording read from the `to` end ("leads south
 *    to"). **Empty is one way**, and one way is the default: direction is
 *    something a spec says, never a guess the host makes from the forward
 *    words. A symmetric wording repeats itself (`connects to` / `connects to`).
 *  - `name` — the relationship's own name ("the rusted iron door", "the King's
 *    Road"), empty for an unnamed way. ⚠ Something you can stand in is a place
 *    of its own, not a named link.
 *  - `description` — its description. (It was the port `label`; one column,
 *    one word, no alias.)
 *
 * ## Idempotent
 *
 * One way is one row, **as the session reads** (the app's
 * `linksOnReadingThatWay`): a link the session already reads — on its own
 * line or one it inherits, undated or dated at or before its moment — with
 * the same name (case aside) that says **everything** this one would (the same
 * words read from the same end, both ways when both are asked, or its true
 * mirror drawn from the far end) is **the standing row**. The outlet returns
 * its id and writes nothing, so a re-run, a swipe or a second turn never stacks
 * a room's ways out; `fromEntryId` is the row's own `from`. The standing row is
 * never rewritten: a pipeline's repeat does not edit a link a person may have
 * drawn or worded. And because this run did not make the row, the host neither
 * records it as the run's (an undo of the run must not delete it) nor reports a
 * write (`written: false`, so no `core:event/lore-link-created@1`).
 *
 * Refused with a sentence instead: a link that says only PART of this one (a
 * one-way door where both ways is asked — a second row would say that part
 * twice), and one that says it all but no longer stands (resolved, broken,
 * secret) — nothing the session reads states it, and a pipeline does not
 * reopen or reveal it.
 * @internal
 */
export const linkLoreEntries = pin(
	describeOutletDefinition({
		id: 'core:outlet/link-lore-entries@1',
		i18n: {
			name: { en: 'Link the lore entries' },
			description: {
				en: 'Draws a link between two entries of this session’s lorebook — a room’s way out, who keeps what, what stands near what.',
			},
		},
		effects: 'write',
		/**
		 * The link itself is what a reviewer judges, so its words both ways,
		 * its name and its description may be retyped (R-15 review fields). The
		 * two ends may not: they are the run's own identity, and a reviewer
		 * re-aiming them would link a pair nobody judged — the rule
		 * `delete-message@1` states.
		 */
		review: { fields: ['linkType', 'reverseLinkType', 'name', 'description'] },
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
							'What the link says, read from the entry it starts at — “leads north to”, “connects to”, “is inside”, “keeper of”.',
					},
					reverseLinkType: {
						type: 'string',
						default: '',
						label: { en: 'From there it…' },
						description:
							'What the link says read from the other end — “leads south to”, “holds”. Leave it empty for a way that only goes one way.',
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
				/** The relationship's own name — "the rusted iron door". Optional. */
				name: S.text,
				/** Its description. Optional. */
				description: S.text,
			},
			out: { main: S.writeResult, linkId: S.writeResult },
		},
	}),
)

/**
 * One lore link a spec asks for — an element of
 * `core:outlet/create-lore-entry@1`'s `links` (places plan B2, 2026-09-29).
 *
 * The same four words as `core:outlet/link-lore-entries@1`'s ports and
 * parameters, and as the `LoreLinkRow` a listing reads back: what you write is
 * what you read. A bare name, entry id or write result in `links` is the same
 * as `{ to }` with nothing else said.
 * @experimental
 */
export interface LoreLinkInput {
	/**
	 * The entry the link ends at: an entry id, the name of an entry in the
	 * session's lorebook (case and surrounding space ignored), or the write
	 * result of the write that made it.
	 */
	to: number | string | WriteResult
	/** The relationship type, read from the entry being saved. Absent is `leads to`. */
	linkType?: string
	/** The wording read from `to`'s end. Absent or empty is one way. */
	reverseLinkType?: string
	/** The relationship's own name — "the rusted iron door". Absent is unnamed. */
	name?: string
	/** Its description. */
	description?: string
}

/**
 * One lore link on a `core:query/lorebook-entries@1` row, listed when the
 * spec asks for `withLinks` (places plan B2, 2026-09-29).
 *
 * **Said from the listed entry**: `to` is the far end, whichever end of the
 * relationship the listed entry is. A relationship drawn from here reads by
 * its relationship type; one drawn to here reads by its reverse type, and one
 * drawn to here with no reverse type (one way, inbound) is not listed at all —
 * it is no way out of here. Only relationships between two entries, standing
 * (active, not secret) on the session's line at its moment, with both ends
 * live and the far end one the wired `speaker` may see — or, with no speaker
 * wired, one every voice may see.
 * @experimental
 */
export interface LoreLinkRow {
	/** The relationship's id. */
	id: number
	/** The far end, named as the session's reading sees it (amendments applied). */
	to: { entryId: number; name: string }
	/** The wording read from the listed entry — "leads north to". */
	linkType: string
	/** The wording read from the far end back to here. Absent is one way. */
	reverseLinkType?: string
	/** The relationship's own name. Absent is unnamed. */
	name?: string
	/** Its description. Absent is none. */
	description?: string
}

// ── Graph build ─────────────────────────────────────────────────────────────

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
