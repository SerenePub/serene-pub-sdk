/**
 * 🚧 Conversions — how a ruleset takes in what another ruleset's owners hold.
 *
 * A conversion is an **id map**: a repertoire or compendium piece of the
 * other ruleset that is a known one of this ruleset (`weapons/longsword` →
 * `things/longsword`). What no row maps arrives as prose — its name,
 * description, prose and traits — and is reviewed, never applied as numbers
 * on its own; that carry needs no declaration.
 *
 * A conversion is declared by the ruleset it converts **to**.
 *
 * (2026-10-17: the three tiers were stripped to the map. `tier2: 'benchmark'`
 * had no runtime and `tier3: 'prose'` was always true; the prose carry is
 * the host's, not a declaration.)
 * @experimental
 */

import { finding, RULESET_ID_PATTERN } from './repertoires.js'

/** 🚧 One mapping: the other ruleset's reference, and this ruleset's. @experimental */
export interface ConversionIdMap {
	from: string
	to: string
}

/** @experimental */
export interface ConversionDecl {
	/** The ruleset converted from. */
	from: string
	/** The ruleset converted to — the one declaring it. */
	to: string
	/** The references that map one to one; empty when nothing does. */
	idMap: readonly ConversionIdMap[]
}

/**
 * 🚧 Why a conversion is refused, each finding opened by its reason's name:
 * `bad-ruleset-id` · `converts-to-itself` · `conversion-not-ours` (with
 * `ctx`, a conversion whose `to` is not the declaring ruleset) ·
 * `bad-id-map` · `duplicate-id-map`.
 * @internal
 */
export function conversionFindings(decl: ConversionDecl, ctx?: { ruleset: string }, at = 'conversion'): string[] {
	const out: string[] = []
	for (const k of ['from', 'to'] as const)
		if (typeof decl?.[k] !== 'string' || !RULESET_ID_PATTERN.test(decl[k]))
			out.push(finding('bad-ruleset-id', `${at}.${k} is '${String(decl?.[k])}', not a ruleset id ('owner:ruleset/name@N').`))
	if (decl?.from && decl.from === decl.to)
		out.push(finding('converts-to-itself', `${at} converts ${decl.from} to itself. A ruleset's own owners need no conversion.`))
	if (ctx && decl?.to !== ctx.ruleset)
		out.push(finding('conversion-not-ours', `${at} converts to ${String(decl?.to)}, and ${ctx.ruleset} declares it. A conversion is declared by the ruleset it converts to.`))
	if (!Array.isArray(decl?.idMap)) out.push(finding('bad-id-map', `${at}.idMap is a list of { from, to } — empty when nothing maps.`))
	const seen = new Set<string>()
	;(Array.isArray(decl?.idMap) ? decl.idMap : []).forEach((m, i) => {
		if (!m || typeof m.from !== 'string' || !m.from || typeof m.to !== 'string' || !m.to)
			out.push(finding('bad-id-map', `${at}.idMap[${i}] is { from, to } — two non-empty references.`))
		else if (seen.has(m.from))
			out.push(finding('duplicate-id-map', `${at}.idMap maps '${m.from}' twice. One reference converts one way.`))
		else seen.add(m.from)
	})
	const extra = decl && typeof decl === 'object' ? Object.keys(decl).filter((k) => !['from', 'to', 'idMap'].includes(k)) : []
	if (extra.length)
		out.push(finding('bad-id-map', `${at} says ${extra.map((k) => `'${k}'`).join(', ')}. A conversion is { from, to, idMap } — what no row maps is carried as prose without being declared.`))
	return out
}
