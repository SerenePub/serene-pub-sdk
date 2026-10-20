/**
 * 🚧 Bridges — how a field that is not a ruleset's own touches its mechanics.
 *
 * A genre's field, a custom field or a plugin's field resolves at `prose`
 * whatever the rigour, unless it declares a **bridge** to the active ruleset:
 * a small set of effects the ruleset's handler applies **additively** after
 * the ruleset's own. A bridge may `modify`, `adjustDegree` or add a `rider`;
 * it may never `set` a stat — "never overrides" is a property of the
 * operations, checked when the bridge is authored.
 *
 * One way: a bridge lives with the field that owns it, written by the
 * field's author, and is **registered** there (`registerBridge`) so the host
 * reads every bridge to a session's ruleset (`bridgesFor`). A ruleset that
 * wants to read a foreign field declares a `stat` selector over it instead.
 *
 * (2026-10-17: `listing: before | after` and `seam` were cut — no host
 * ordered effects by seam; every bridge effect adds.)
 *
 * ⚠ Not the *capability bridge* (QuickJS's host-function transport). Prose
 * says *ruleset bridge* where the two could meet.
 * @experimental
 */

import { getAttributeSlot } from './attributes.js'
import { refuseUnlessIdentical } from './hash.js'
import { _mechanicFindings, finding, PIECE_USE_VERBS, RulesetError, type MechanicDecl } from './repertoires.js'
import { getRuleset, rulesetContext } from './rulesets.js'

/** @experimental */
export interface BridgeDecl {
	/** The attribute slot that owns the bridge. */
	field: string
	/** The ruleset it bridges to. */
	ruleset: string
	/** Additive mechanics: `modify`, `adjustDegree`, `rider` — never `set`. */
	effects: readonly MechanicDecl[]
}

/**
 * 🚧 Why a bridge is refused, each finding opened by its reason's name:
 * `unknown-field` · `unknown-ruleset` · `no-effects` · `bridge-set` ·
 * `bridge-listing` (the cut `listing`/`seam`) · 🚧 `bridge-piece-verb` (a
 * verb that acts when a piece is used — a bridge has no piece) ·
 * `derived-target` · and every
 * mechanic reason (`unknown-selector`, `inert-pairing`, …).
 * @internal
 */
export function bridgeFindings(decl: BridgeDecl): string[] {
	const at = `bridge from '${String(decl?.field)}'`
	const out: string[] = []
	if (typeof decl?.field !== 'string' || !getAttributeSlot(decl.field))
		out.push(finding('unknown-field', `${at} names a field nothing declares. A bridge lives on a declared attribute slot; declare it first.`))
	const ruleset = typeof decl?.ruleset === 'string' ? getRuleset(decl.ruleset) : undefined
	if (!ruleset)
		out.push(finding('unknown-ruleset', `${at} bridges to '${String(decl?.ruleset)}', which no registered ruleset is. Its selectors are what the bridge is checked against — install or declare it first.`))
	// A bridge's predicates may name its own field — by its bare key and its
	// id, and their properties — which the host reads beside the ruleset's
	// values (2026-10-17). Predicates only: the field is never a target.
	const ownPaths =
		typeof decl?.field === 'string' && decl.field.includes('/') && decl.field.includes('@')
			? new Set([decl.field.slice(decl.field.indexOf('/') + 1, decl.field.lastIndexOf('@')), decl.field])
			: undefined
	const ctx = ruleset ? { ...rulesetContext(ruleset), predicatePaths: ownPaths } : undefined
	if (!Array.isArray(decl?.effects) || !decl.effects.length)
		out.push(finding('no-effects', `${at} declares no effects. A bridge with nothing to apply does nothing; drop it.`))
	;(Array.isArray(decl?.effects) ? decl.effects : []).forEach((e, i) => {
		const where = `${at} effect ${i}`
		const o = e as unknown as Record<string, unknown>
		if ('listing' in o || 'seam' in o) {
			out.push(finding('bridge-listing', `${where} says where it is listed. Every bridge effect adds after the ruleset's own — drop 'listing' and 'seam'.`))
			return
		}
		if (e.verb === 'set') {
			out.push(finding('bridge-set', `${where} sets '${String((e as { target?: unknown }).target)}'. Only the ruleset that owns a stat sets it; a bridge modifies.`))
			return
		}
		if (PIECE_USE_VERBS.has(e.verb)) {
			out.push(finding('bridge-piece-verb', `${where} is ${e.verb}, which acts when a piece is used — and a bridge has no piece. A bridge modifies, adjusts a degree or adds a rider.`))
			return
		}
		out.push(..._mechanicFindings(e, i, ctx, at))
		const target = (e as { target?: unknown }).target
		if (ruleset && typeof target === 'string' && ruleset.selectors?.[target]?.kind === 'derived')
			out.push(finding('derived-target', `${where} targets '${target}', a derived selector. Derived values are computed before bridges apply, so it would never change; target one of its inputs.`))
	})
	return out
}

/**
 * 🚧 Declare a bridge, refused here (`RulesetError`) on any finding. Pure:
 * `registerBridge` makes it readable to the host.
 * @experimental
 */
export function defineBridge(decl: BridgeDecl): BridgeDecl {
	const found = bridgeFindings(decl)
	if (found.length) throw new RulesetError(`bridge from '${String(decl?.field)}'`, found)
	return Object.freeze({ ...decl, effects: Object.freeze([...decl.effects]) })
}

/** Registered bridges, by ruleset id, then by field. */
const registry = new Map<string, Map<string, BridgeDecl>>()

/**
 * 🚧 Register a bridge where its field is declared, so the host applies it
 * in every session on its ruleset (`bridgesFor`). Checked as `defineBridge`
 * checks it. One bridge per field and ruleset: an identical re-registration
 * is a no-op, a different one throws with both hashes.
 * @experimental
 */
export function registerBridge(decl: BridgeDecl): BridgeDecl {
	const bridge = defineBridge(decl)
	let byField = registry.get(bridge.ruleset)
	if (!byField) registry.set(bridge.ruleset, (byField = new Map()))
	const existing = byField.get(bridge.field)
	if (existing) refuseUnlessIdentical(existing, bridge, `duplicate bridge from ${bridge.field} to ${bridge.ruleset}`)
	byField.set(bridge.field, bridge)
	return bridge
}

/** 🚧 Every registered bridge to a ruleset, in registration order — what the handler applies after the ruleset's own effects. @experimental */
export const bridgesFor = (rulesetId: string): readonly BridgeDecl[] => [...(registry.get(rulesetId)?.values() ?? [])]

/** @internal */
export function _clearBridges(): void {
	registry.clear()
}
