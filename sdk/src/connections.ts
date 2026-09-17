/**
 * What an import has to wire before it can run — the ruling on 13 §10a.
 *
 * The question was whether connection bindings deserve their own table, so that an
 * export could state *structurally* that connections were excluded rather than relying
 * on the exporter to strip them.
 *
 * **Ruled: no table.** A second table implies a second lifecycle — its own ids, its own
 * ownership rules, its own migration — and there isn't one. A connection binding is a
 * config value at instance scope, which 12's five-layer chain already owns.
 *
 * The guarantee people wanted from the table is available without it, and stronger. A
 * table could only ever report the connections the exporting instance had *filled in*,
 * so a spec exported before anyone configured it would claim to need nothing and the
 * importer would find out at the first run. Slots are declared on the **type**, so
 * deriving the requirement from descriptors is complete by construction — independent of
 * what the exporter did, and independent of whether the exporter was even configured.
 */

import type { DocNode, SpecDocument } from './document.js'
import { getDefinition } from './descriptors.js'
import {
	capabilityLabel,
	satisfies,
	type CapabilityId,
	type CapabilitySet,
	type Verdict,
} from './capabilities.js'

export interface ConnectionRequirement {
	nodeKey: string
	slot: string
	/** Which connection kind satisfies it — the produced shape (F17). */
	kind?: string
	definitionId: string
	/** What the connection must be able to do. Unmet is a hard failure at bind. */
	requires?: readonly CapabilityId[]
	/** What it would use if available. The binding handles absence either way. */
	optional?: readonly CapabilityId[]
}

/**
 * A slot this node reads from ANOTHER node's config (16 §5b-i).
 *
 * `resolvedRefs` is what publish leaves behind for `slot.connectionOf('x')`, and
 * the executor honours it: `resolveSlot` reads the TARGET's stored value, so a
 * value written against this node would be resolved by nothing.
 *
 * Same rule the config panel already applies — a slot wired to another node's is
 * not this node's to configure, and offering a second box for one value is the
 * defect that rule exists to close. It reaches here for the first time because
 * `core:task/assemble@2` is the first core type to share a CONNECTION reference:
 * it renders the prompt for whatever the sending Provider is bound to, and has
 * nothing of its own for an importer to bind.
 */
const sharedWithAnotherNode = (n: DocNode, slot: string): boolean => {
	const target = n.resolvedRefs?.[slot]
	if (target !== undefined) return target !== n.key
	// A document that predates `resolvedRefs`, or one hand-written: the wiring is
	// still in the stored config as a slot reference carrying `ofNode`.
	const wired = n.config?.[slot] as { __ref?: string; ofNode?: string } | undefined
	return (
		!!wired &&
		typeof wired === 'object' &&
		wired.__ref === 'slot' &&
		!!wired.ofNode &&
		wired.ofNode !== n.key
	)
}

/**
 * Every connection this document needs, derived from its types.
 *
 * "Needs" means a binding an importer has to make. A slot the document already
 * points at another node's is not one of those — see `sharedWithAnotherNode`.
 */
export function requiredConnections(doc: SpecDocument): ConnectionRequirement[] {
	const out: ConnectionRequirement[] = []
	for (const n of doc.nodes) {
		const d = getDefinition(`${n.definitionId}@${n.definitionVersion}`)
		for (const [slot, decl] of Object.entries(d?.slots ?? {}))
			if (decl.kind === 'connection' && !sharedWithAnotherNode(n, slot))
				out.push({
					nodeKey: n.key,
					slot,
					kind: decl.shape,
					definitionId: n.definitionId,
					...(decl.requires ? { requires: decl.requires } : {}),
					...(decl.optional ? { optional: decl.optional } : {}),
				})
	}
	return out
}

/**
 * What is still unwired, given what the importing instance has bound so far.
 *
 * Feeds `needs-configuration` (12 §6), which is deliberately not `broken`. A spec nobody
 * has given a connection is not damaged, it is unfinished — and the difference decides
 * whether a user files a bug or opens settings.
 */
export function unwiredConnections(
	doc: SpecDocument,
	bound: ReadonlyArray<{ nodeKey: string; slot: string }>,
): ConnectionRequirement[] {
	const has = new Set(bound.map((b) => `${b.nodeKey} ${b.slot}`))
	return requiredConnections(doc).filter((r) => !has.has(`${r.nodeKey} ${r.slot}`))
}

/**
 * The line an import screen shows.
 *
 * Names the capability in the words the connection form used — "needs a
 * connection that supports Image generation" — rather than a shape id. Somebody
 * reading this is deciding which of their connections to point at it, and
 * `core:shape/image-gen@1` does not help them decide anything.
 *
 * `supports`, not `can`: every capability label is a noun phrase ("Vision",
 * "Embeddings", "Image generation"), so `can` only reads for the handful that
 * happen to start with a verb and gives "a connection that can Embeddings" for
 * the rest.
 */
export const renderRequirement = (r: ConnectionRequirement): string => {
	const caps = (r.requires ?? []).map(capabilityLabel)
	const what = caps.length
		? `a connection that supports ${caps.join(' and ')}`
		: `a ${r.kind ?? 'connection'} connection`
	return `${r.nodeKey}.${r.slot} — needs ${what} (${r.definitionId})`
}

/** One slot, checked against what the connection bound to it can actually do. */
export interface UnsatisfiedConnection extends ConnectionRequirement {
	verdict: Verdict
}

/**
 * Which bound connections cannot do what their slot asks.
 *
 * Distinct from `unwiredConnections`, and the distinction is the whole point of
 * the capability model: *unwired* means nobody chose yet, *unsatisfied* means
 * somebody chose and the choice will not work. The first is an unfinished setup;
 * the second is a setup that looks finished and fails at the first run.
 *
 * Takes the resolved capability set per slot rather than a connection id, so
 * this stays pure — the caller does the lookup it was going to do anyway.
 */
export function unsatisfiedConnections(
	doc: SpecDocument,
	boundCapabilities: ReadonlyArray<{
		nodeKey: string
		slot: string
		capabilities: CapabilitySet
	}>,
): UnsatisfiedConnection[] {
	const byAddress = new Map(
		boundCapabilities.map((b) => [`${b.nodeKey} ${b.slot}`, b.capabilities]),
	)
	const out: UnsatisfiedConnection[] = []
	for (const r of requiredConnections(doc)) {
		const have = byAddress.get(`${r.nodeKey} ${r.slot}`)
		// Nothing bound is `unwiredConnections`' business, not this one.
		if (!have) continue
		const verdict = satisfies({ requires: r.requires, optional: r.optional }, have)
		if (!verdict.ok) out.push({ ...r, verdict })
	}
	return out
}
