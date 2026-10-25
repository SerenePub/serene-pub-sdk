/**
 * Preview runs — "show me what would be sent, and why" (debug mode in chat).
 *
 * A preview is **not a second estimator**. It is the ordinary run, stopping at the
 * pre-call substrate: input resolved, context assembled, payload formed, token count
 * taken — and then `halt` instead of `call`. That is the whole design constraint. Any
 * implementation that computes "what we would send" on a separate path drifts from what
 * actually gets sent, silently, and is most wrong exactly when someone is debugging
 * because something is off.
 *
 * Almost everything the panel shows is already in the receipt: Assemble records the
 * allocation it computed and the inputs it computed it from, and the Provider's
 * resolved input is recorded like any node's. The preview hoists those into one place so
 * a UI does not have to reassemble them from three node receipts, and adds the one thing
 * that only exists at the call site — the formed payload and its token count.
 * @ruling 16 §5a
 */

import type { Receipt } from './receipt.js'

/** @experimental */
export interface PreviewBlock {
	id?: string
	sourceKey?: string
	tokens: number
	included: boolean
	weight?: number
	priority?: string
	/**
	 * Why this block is here, or isn't. The panel is only worth opening if this is
	 * populated, and it can only be populated if each step leaves its trace on the
	 * item — the trigger Query records which key matched, the rank Task records the
	 * probability roll and the group it won or lost, Assemble records budget exhaustion.
	 */
	reason?: string
	/** The full trail, each step's line in order (src/wire.ts `why`). */
	why?: string[]
	role?: string
}

/** @experimental */
export interface PreviewReport {
	/** Where the run stopped, and why that node. */
	atNode: string
	definitionId: string
	/**
	 * 🚧 `first-provider-in-branch` (2026-10-23): the provider sits in a
	 * junction's branch — the one the route fired (`previewStops`).
	 */
	targetedBy: 'first-provider-on-spine' | 'first-provider-in-branch' | 'explicit'

	/**
	 * Metadata only — material never leaves core.
	 * @ruling F18
	 */
	connection?: { id?: string; kind?: string; contextLength?: number; tokenizer?: string }
	budget?: { maxContext?: number; reserved?: number; available?: number }

	/** The payload as it would have gone out, and the count that would have applied. */
	context: { rendered: unknown; tokens: number }
	/**
	 * How blocks became that payload. Present once a Provider declares a `wire`
	 * slot — and it is what makes the scaffolding cost visible rather than a mystery
	 * gap between "my blocks add up to 3,000" and "it said 3,180".
	 * @ruling 16 §7
	 */
	wire?: { format: string; blockTokens: number; overheadTokens: number }

	blocks: PreviewBlock[]
	totals: {
		blocks: number
		included: number
		dropped: number
		tokensIncluded: number
		tokensDropped: number
		/** Positive means the formed payload does not fit — the estimator was wrong. */
		overBudgetBy?: number
	}
	/** Whatever the node feeding the context port produced — Assemble's allocation record. */
	allocation?: unknown
}

/**
 * What a counter measures when it is handed something that is not a string.
 *
 * A wire payload is a messages array as often as it is prose, and every counter
 * in the SDK has to agree about what counting one of those means — otherwise a
 * receipt's figure and a budget's figure are measurements of two different
 * things. Shared with `src/tokenizers.ts` rather than reimplemented there.
 * @experimental
 */
export const countableText = (v: unknown): string =>
	typeof v === 'string' ? v : JSON.stringify(v ?? '')

/**
 * A stand-in tokenizer, and the floor everything else degrades to.
 *
 * The real one comes from connection metadata (`tokenizer`), is resolved and
 * loaded ONCE before the run starts (`RunOptions.tokenizer`, `loadTokenizer`)
 * and reused — counting sixty blocks should be sixty cheap calls against
 * something already resident, not sixty model loads. This is what counts when
 * no id was configured, when no loader is registered for the one that was, and
 * when a loader threw: budgeting degrades to an estimate rather than failing a
 * run over a tokenizer.
 * @internal
 */
export const roughTokens = (v: unknown): number => Math.ceil(countableText(v).length / 4)

/** A node as the preview rule reads it. @experimental */
export interface PreviewRuleNode {
	key: string
	kind: string
	clauseId?: string
	position: number
}

/** A clause as the preview rule reads it: its kind, and the clause it sits in. @experimental */
export interface PreviewRuleClause {
	id: string
	kind: string
	clauseId?: string
}

/**
 * 🚧 **The providers a preview can stop before** (2026-10-23), in document
 * order: every oracle on the spine, and every oracle in a junction's branch,
 * nested junctions included.
 *
 * A junction runs the branch its route fired, so a provider in a branch is
 * the run's own call on that path, exactly as a spine provider is: Story's
 * reply writes inside its `reply` junction (`reply.prose.generate`, beside
 * *Replies carry changes*), the Lair's lines inside `via`. A run reaches at
 * most one branch of a junction, so the first of these the run reaches is
 * the first call it would make.
 *
 * Never one inside a **gather**, an **each** or a **loop**, at any depth:
 * those fan out. In a retrieval pipeline the literally first provider is
 * `embed`, inside the gather — stopping there would preview a context that
 * had not been retrieved yet (16 §5b-i).
 *
 * Without `clauses` a clause's kind is unknown, so only the spine counts —
 * the rule as it stood before junction branches were read.
 * @experimental
 */
export function previewStops<N extends PreviewRuleNode>(
	nodes: readonly N[],
	clauses: readonly PreviewRuleClause[] = [],
): N[] {
	const byId = new Map(clauses.map((c) => [c.id, c]))
	const onRoute = (clauseId: string | undefined): boolean => {
		// Bounded by the clause count: a malformed cycle answers "not on the route".
		for (let id = clauseId, hops = 0; id !== undefined; hops++) {
			const clause = byId.get(id)
			if (!clause || clause.kind !== 'junction' || hops > clauses.length) return false
			id = clause.clauseId
		}
		return true
	}
	return nodes
		.filter((n) => n.kind === 'oracle' && onRoute(n.clauseId))
		.sort((a, b) => a.position - b.position)
}

/**
 * Choose where a preview stops: the `explicit` node, else the first of the
 * `previewStops` the run reaches. `key` is the first in document order;
 * `stops` holds every key the run halts before, with why — a junction's
 * branches are alternatives, and only the route knows which one runs.
 * @experimental
 */
export function previewTarget(
	nodes: ReadonlyArray<PreviewRuleNode>,
	explicit?: string,
	clauses: readonly PreviewRuleClause[] = [],
):
	| {
			key: string
			targetedBy: PreviewReport['targetedBy']
			stops: ReadonlyMap<string, PreviewReport['targetedBy']>
	  }
	| undefined {
	if (explicit) return { key: explicit, targetedBy: 'explicit', stops: new Map([[explicit, 'explicit']]) }
	const stops = new Map<string, PreviewReport['targetedBy']>(
		previewStops(nodes, clauses).map((n) => [
			n.key,
			n.clauseId ? 'first-provider-in-branch' : 'first-provider-on-spine',
		]),
	)
	const [first] = stops
	return first ? { key: first[0], targetedBy: first[1], stops } : undefined
}

/** @experimental */
export function renderPreview(p: PreviewReport): string {
	const out: string[] = []
	out.push(`preview · stopped before ${p.atNode} (${p.definitionId}) · ${p.targetedBy}`)
	if (p.connection) {
		out.push(
			`  connection ${p.connection.kind ?? '?'}` +
				(p.connection.contextLength ? ` · context ${p.connection.contextLength}` : '') +
				(p.connection.tokenizer ? ` · tokenizer ${p.connection.tokenizer}` : ''),
		)
	}
	if (p.budget) {
		out.push(`  budget: ${p.budget.available ?? '?'} available of ${p.budget.maxContext ?? '?'}`)
	}
	if (p.wire) {
		out.push(
			`  wire ${p.wire.format}: ${p.wire.blockTokens} block + ${p.wire.overheadTokens} scaffold`,
		)
	}
	out.push(
		`  would send ${p.context.tokens} tokens · ${p.totals.included}/${p.totals.blocks} blocks included` +
			(p.totals.overBudgetBy ? `  ⚠ OVER by ${p.totals.overBudgetBy}` : ''),
	)
	for (const b of p.blocks) {
		out.push(
			`   ${b.included ? '✓' : '✗'} ${(b.sourceKey ?? b.id ?? '?').padEnd(20)} ${String(b.tokens).padStart(6)} tok` +
				(b.reason ? `   ${b.reason}` : ''),
		)
		// The trail is the difference between a panel worth opening and a token counter.
		for (const w of b.why ?? []) out.push(`        · ${w}`)
	}
	return out.join('\n')
}

/** Convenience for a UI: the preview, if this receipt is one. @experimental */
export const previewOf = (r: Receipt): PreviewReport | undefined => r.preview
