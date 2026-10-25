/**
 * The settings document (ruled 2026-09-21).
 *
 * Every setting a person can see in session settings reaches every run as
 * **one resolved document**, defaults applied. A run's `sessionScope` was a
 * pointer (`{ sessionId, currentCharacterId }`) and every node that wanted a
 * setting queried for it; this is the document the host resolves once per
 * run (`resolveSessionSettings`, in core) and hands to the inlet as
 * `session`, so `$.input.session.fields.tone` reads in any spec and no spec
 * knows which table a setting came from.
 *
 * `fields` is the cascade's answer: for every declared key, the
 * session's stored value, else the genre's pinned value, else the field's
 * core default. A key nobody declares or pins is absent.
 *
 * Three ways in: every core inlet that takes a session publishes it on a
 * `session` port; `core:query/session-settings@1` re-reads it after a write;
 * scripts and hooks get it as a read-only extra named `session`.
 *
 * The widget envelope's `session.v1` is a projection of this document:
 * widgets receive `title`, `fields`, `turnOrder`, `channels`, `cast`,
 * `annex` — never `guests` or `pipelines`.
 * @ruling PLAN-turn-order §4.12, R13, §4.13
 */
import type { SessionCastV1 } from './participants.js'
import type { TurnOrderV1 } from './turnOrder.js'
import type { ComposerStatesV1 } from './composerStates.js'

/** @experimental */
export interface SessionSettingsV1 {
	v: 1
	sessionId: number
	title: string | null
	/** User ids. Server-side only; never in the widget projection. */
	guests: number[]
	/**
	 * 🚧 The session owner's user id — who `owner` resolves to, and the one
	 * person a genre's script may need to name as `user:<id>` (Dungeon
	 * Crawler keys each person's Planner lane by it). Server-side only, like
	 * `guests`; never in the widget projection. Absent on a document resolved
	 * before it existed.
	 */
	ownerUserId?: number
	genreId: string
	presetId: number | null
	/** Every declared genre field: default, then the session's value over it. */
	fields: Record<string, unknown>
	/**
	 * 🚧 What a person's persona-less line is called in this session:
	 * the session's own value, else the genre's `playerLabel` (in `en`), else
	 * absent — and absent whenever the genre declares none, whatever is
	 * stored. Read, never stamped on a row.
	 * @ruling R4
	 */
	playerLabel?: string
	scenario: string | null
	lorebookId: number | null
	tags: string[]
	channels: string[]
	/** What core:query/session-cast@1 publishes, envoys included. Not candidates: nothing here has been pooled. */
	cast: SessionCastV1
	/** Per bound spec slug: the rebinds and param overrides in force at session scope. */
	pipelines: Record<
		string,
		{ rebinds: Record<string, string>; params: Record<string, Record<string, unknown>> }
	>
	/**
	 * The session's turn order — the state, as `set-turn-order` wrote it.
	 * What the session chose is
	 * `pipelines[<its turn-order spec>].rebinds.strategy`; what it may choose
	 * is the node's `expose.swaps` on the registry. The document carries no
	 * turn-order special case.
	 * @ruling R28 (the modder pass)
	 */
	turnOrder: TurnOrderV1
	/**
	 * 🚧 The mode of each routine in force, by the pipeline it runs (R55,
	 * 2026-10-21): `off` · `review` · `full`; a pipeline nothing registers as
	 * a routine is absent. What an action that follows a routine reads —
	 * Story's Rest applies its changes when the reckoning is Full and holds
	 * them for review otherwise.
	 */
	routineModes?: Readonly<Record<string, 'off' | 'review' | 'full'>>
	/** Read-only from the pipeline layer: written by no outlet except `set-turn-order`. */
	metadata: Record<string, unknown>
	/** The whole annex; a spec reads its own key. */
	annex: Record<string, unknown>
	/**
	 * 🚧 The session's composer states (`sessions.composer_states`): which
	 * channel lanes' composers the genre closed, for whom, and why — written
	 * by `core:outlet/set-composer-state@1` alone; absent or empty is every
	 * composer open. Read one with `composerClosureFor`. Server-side only.
	 */
	composerStates?: ComposerStatesV1
	/** Open. */
	[k: string]: unknown
}
