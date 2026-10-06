/**
 * Core's one pipeline for every **annex field** (2026-09-26): a widget's
 * `invoke(annexFieldAction(owner, key), { payload: { value } })` runs this,
 * whichever package declared the field.
 *
 * It contributes no action. The host lists one action per declared field
 * (`<owner>:annex#<key>`), judges each press at its door — who may set it,
 * the plugin switch, the shape — and only then runs this spec with
 * `{ field, value }` on the inlet's `payload`. The outlet reads the
 * declaration again and writes through the annex write every
 * `set-session-annex` goes through.
 *
 * No lock, no genre (ruled 2026-10-05), like the built-in writes: it serves
 * an annex field of any genre — the Lair's Castellan scratchpad as much as a
 * Chat plugin's — and nothing binds it; the host runs it by id.
 * @experimental
 */
import { ANNEX_FIELD_SPEC_ID, annexField, compile, declareAnnex, spec, type AnnexFieldDecl } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_CASTELLAN_KEY, lairGenre } from '../registry/genres.js'

/** @experimental */
export const SET_ANNEX_FIELD_SPEC_ID = ANNEX_FIELD_SPEC_ID
/** @internal */
export const SET_ANNEX_FIELD_VERSION = '1.0.0'

/**
 * The Lair Castellan's scratchpad, as an annex key under `core` (lair re-plan
 * R13): see `CORE_ANNEX_FIELDS`. @experimental
 */
export const CASTELLAN_SCRATCHPAD_KEY = 'castellan-scratchpad'

/** @experimental */
export const setAnnexFieldSpec = () =>
	compile(
		spec(SET_ANNEX_FIELD_SPEC_ID, {
			version: SET_ANNEX_FIELD_VERSION,
			taxonomy: { role: 'action' },
		})
			.inlet('input', C.userMessage.v1())
			.outlet('write', ($) => C.setAnnexField.v1({ payload: $.input.payload }))
			.build(),
	)

/**
 * Core's **annex declaration** (owner ruling 2026-09-26): every key core
 * keeps in its own annex document (`annex.core`), declared once with its
 * shape and who may see it — the same declaration a package makes on
 * `defineExtension({ annexFields })`. A core genre's own keys are declared
 * here too, scoped with the field's `genre` option; `GenreDecl` does not
 * carry them.
 *
 * Two fields:
 *
 * - **`retake-quietly`** (owner ruling 2026-09-28, lair pass R2): the
 *   session owner's "Don't ask again for this session" on Regenerate the last
 *   turn (`core#retake`). It is a person's preference about one session, set
 *   by the person through the ready-made action (`core:annex#retake-quietly`),
 *   so it is the annex's by the ruling — not a column, and not a genre field,
 *   because retake is core and no genre owns it (no `genre` scope for the same
 *   reason).
 * - **`castellan-scratchpad`** (owner QB answer 2026-09-28, lair re-plan
 *   R13): the Lair Castellan's running notes — rooms it has planned with the
 *   Dungeon Master, intentions, corrections. The one key a core **pipeline**
 *   writes: `lair-respond` rewrites it after each Sanctum reply (the
 *   `channel.sanctum.notes.*` step). Its audience is the Castellan alone
 *   (`see: ['envoy:castellan']`), so it is hidden from every person's view and
 *   reaches no prompt but the Castellan's own — never a delver's (earshot by
 *   the audience model: the AI view keeps it only for that speaker). The
 *   owner may set it by hand (`act: ['owner']`, the Session data panel),
 *   and the Lair's sessions alone carry it (`genre`).
 *
 * Every other core pipeline keeps its state in core's own columns
 * (`sessions.metadata.turnOrder`, written by `set-turn-order`; each member's
 * composer text in `sessions.drafts`, written by the socket door).
 * `coreCatalog.test.ts` walks every core spec for a `set-session-annex` step
 * and holds each to this list, so a core writer added without its
 * declaration fails there before it ships.
 * @experimental
 */
export const CORE_ANNEX_FIELDS: readonly AnnexFieldDecl[] = Object.freeze([
	annexField({
		key: 'retake-quietly',
		shape: { type: 'boolean', default: false },
		see: ['owner'],
		act: ['owner'],
		label: { en: "Don't ask before regenerating a turn" },
		description: {
			en: 'Regenerate the last turn without the confirmation, for this session only.',
		},
	}),
	annexField({
		key: CASTELLAN_SCRATCHPAD_KEY,
		shape: { type: 'text', default: '' },
		see: [`envoy:${LAIR_CASTELLAN_KEY}`],
		act: ['owner'],
		genre: lairGenre,
		label: { en: "Castellan's scratchpad" },
		description: {
			en: "The Castellan's running notes from the Sanctum: rooms planned, intentions, corrections. It rewrites them after each reply there, and reads them when it plans a turn while Sanctum talk steers the story. The party never read them.",
		},
	}),
])

// Registered on import, as core's events and definitions are: `validate()`
// then judges a core spec's annex writes against it.
declareAnnex('core', CORE_ANNEX_FIELDS)
