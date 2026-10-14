/**
 * **Loadouts** — the third model layer.
 *
 * A loadout says what an ENGINE is and how it is driven: the pair
 * `(connection, model)`, a sampling config by reference, and — when the pair's
 * drawing sheet takes a template payload — a workflow. It never says what a
 * step MEANS (prompts, parameters, template, settings stay on the node).
 *
 * A package ships a loadout as a **declaration** — never a pair (plugins never
 * see connections: the pair is the one blank a person fills). At boot the instance turns it into a row
 * with an empty pair: **unfilled**. A node names one on its oracle's `loadout`
 * slot, and the host resolves per value:
 *
 *   node's explicit slot → its loadout (following merges to the root) →
 *   if that loadout is unfilled, the transform's default loadout.
 *
 * ```ts
 * .preset('default', { label: 'Default', default: true }, (p) =>
 *   p.loadout('summarize', slot.loadout('core:loadout/extraction@1')))
 * ```
 * @experimental
 * @ruling DESIGN-image-generation §13 (2026-10-12)
 */

import type { TransformId } from './capabilities.js'

/**
 * The grammar, one kind segment over from a template id:
 * `core:loadout/extraction@1` · `acme.rp:loadout/extract@1`.
 * A person's own loadout reads `pub:loadout/<slug>` and carries no major.
 * @experimental
 */
export const LOADOUT_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:loadout\/[a-z0-9]+(?:-[a-z0-9]+)*(?:@\d+)?$/

/**
 * A loadout id as a type. Shipped ids carry `@N`; a pub loadout does not.
 * @experimental
 */
export type LoadoutId = `${string}:loadout/${string}`

/** `fast` · `cheap` · `best` — a soft preference, never a gate. @experimental */
export type LoadoutTier = 'fast' | 'cheap' | 'best'

/** @experimental */
export const LOADOUT_TIERS: readonly LoadoutTier[] = ['fast', 'cheap', 'best']

/**
 * The value a `loadout-ref` control holds and a `loadout` slot resolves to.
 * @experimental
 */
export interface LoadoutRef {
	id: LoadoutId
}

/**
 * A shipped loadout. **Never a pair** — the pair is the one field a person
 * fills. `sampling` names a seeded sampling preset by seed key (the row's id
 * differs per install); `workflow` names a starter workflow the same way.
 * @experimental
 */
export interface LoadoutDecl {
	/** `<owner>:loadout/<kebab-name>@<major>`. */
	id: string
	/** The title a person sees (*Extraction*). */
	name: string
	/** Free prose: what is recommended and why. */
	description: string
	/** The transform this loadout does — which default an unfilled one falls back to. */
	transform: TransformId
	/** A seeded sampling preset, by seed key (`sampling-extraction`). */
	sampling?: string
	tier?: LoadoutTier
	/** A starter workflow, by seed key — only meaningful on a `text->image` loadout. */
	workflow?: string
}

/**
 * What a step would run best on — the soft twin of `requires`. Grades and
 * suggestions read it; nothing refuses on it. Everything else (schema door,
 * native tools, vision, references) is DERIVED from wiring, so it is not here.
 * @experimental
 * @ruling DESIGN-image-generation §12 suggestion 1
 */
export interface Prefers {
	/** A seeded sampling preset, by seed key. */
	sampling?: string
	tier?: LoadoutTier
}

/** Type guard: a well-formed loadout id. @experimental */
export function isLoadoutId(value: unknown): value is LoadoutId {
	return typeof value === 'string' && LOADOUT_ID.test(value)
}

/** Split a loadout id, or `null` when it is not one. @experimental */
export function parseLoadoutId(
	value: unknown,
): { owner: string; name: string; major: number | null } | null {
	if (!isLoadoutId(value)) return null
	const [owner, rest] = value.split(':') as [string, string]
	const [name, major] = rest.slice('loadout/'.length).split('@') as [string, string | undefined]
	return { owner, name, major: major === undefined ? null : Number(major) }
}

/** Is this a `loadout-ref` value? @experimental */
export function isLoadoutRef(value: unknown): value is LoadoutRef {
	return (
		typeof value === 'object' &&
		value !== null &&
		isLoadoutId((value as { id?: unknown }).id)
	)
}

/**
 * Why a shipped loadout declaration would be refused, one sentence each.
 * `owner` is the declaring package (`core` for core's own set).
 * @experimental
 */
export function loadoutDeclProblems(d: LoadoutDecl, owner: string): string[] {
	const problems: string[] = []
	const parts = parseLoadoutId(d.id)
	if (!parts || parts.major === null) {
		problems.push(
			`loadout id '${d.id}' is not a loadout id — it must read ` +
				`'${owner}:loadout/<kebab-name>@<major>' (e.g. '${owner}:loadout/extract@1').`,
		)
	} else if (parts.owner !== owner) {
		problems.push(
			parts.owner === 'core' || parts.owner === 'pub'
				? `loadout '${d.id}' claims the '${parts.owner}' namespace, which is reserved. ` +
						`Name it '${owner}:loadout/${parts.name}@${parts.major}'.`
				: `loadout '${d.id}' sits under namespace '${parts.owner}', not '${owner}'.`,
		)
	}
	if (typeof d.name !== 'string' || !d.name.trim())
		problems.push(`loadout '${d.id}' has no name — the name is the title a person picks it by.`)
	if (typeof d.description !== 'string')
		problems.push(`loadout '${d.id}' has no description — say what is recommended and why.`)
	if (typeof d.transform !== 'string' || !d.transform.includes('->'))
		problems.push(
			`loadout '${d.id}' names no transform — an unfilled loadout falls back to its transform's default.`,
		)
	if (d.tier !== undefined && !LOADOUT_TIERS.includes(d.tier))
		problems.push(`loadout '${d.id}' tier '${String(d.tier)}' is not one of ${LOADOUT_TIERS.join(', ')}.`)
	if ('connection' in (d as object) || 'model' in (d as object))
		problems.push(
			`loadout '${d.id}' carries a pair — a shipped loadout never does; the pair is the field a person fills.`,
		)
	return problems
}
