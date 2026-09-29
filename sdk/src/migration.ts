/**
 * Migration harness — converting an existing workflow into a pipeline without users
 * losing what they customised (08 §5, U25).
 *
 * The failure this exists to prevent is specific and it is not "the migration crashed."
 * A migration that runs cleanly and quietly changes what the model receives is far worse
 * than one that fails, because nobody finds out for weeks and the symptom — "the bot
 * feels different since the update" — is unfalsifiable.
 *
 * So the acceptance criterion is not "it ran." It is:
 *
 *   **for every fixture in the corpus, the legacy engine's prompt and the migrated
 *   pipeline's preview payload are byte-identical.**
 *
 * That is checkable because a preview run already produces the exact payload that would
 * be sent, from the same formatter and the same tokenizer as a real run (src/preview.ts).
 * The parity test is the preview, not a second renderer written for the occasion.
 */

import type { ScopeKind } from './config.js'
import type { Receipt } from './receipt.js'
import type { SpecDocument } from './document.js'

// ── Deterministic identity, so a migration can be re-run ────────────────────

/**
 * A migrated row's slug is derived from where it came from, not generated.
 *
 * This is what makes a migration **idempotent**: re-running after a bug fix matches the
 * existing row by slug and replaces it, instead of creating a second copy beside it
 * (12 §3b). A migration that cannot be safely re-run is a migration nobody dares fix.
 * @experimental
 */
export function migratedSlug(sourceTable: string, sourceId: string | number): string {
	const clean = String(sourceId)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return `migrated-${sourceTable.replace(/_/g, '-')}-${clean}`
}

// ── The report ──────────────────────────────────────────────────────────────

/** @experimental */
export type MigrationOutcome = 'migrated' | 'unmapped' | 'skipped'

/** @experimental */
export interface MigrationEntry {
	source: { table: string; id: string | number; label?: string }
	outcome: MigrationOutcome
	/** Where the value landed: the scope it was written at, and what it became. */
	target?: {
		slug: string
		/** A `ScopeKind` (config.ts): `session · config · defaults · author` since R-10. */
		scopeKind: ScopeKind
		nodeKey?: string
		slot?: string
	}
	/** Required whenever the outcome is not `migrated` — never a silent drop. */
	reason?: string
}

/** @experimental */
export interface MigrationReport {
	unit: string
	entries: MigrationEntry[]
	/** Fixture-level parity results; empty means nobody checked, which is not the same as passing. */
	parity: ParityResult[]
}

/** @experimental */
export function summarize(r: MigrationReport) {
	const by = (o: MigrationOutcome) => r.entries.filter((e) => e.outcome === o).length
	return {
		migrated: by('migrated'),
		unmapped: by('unmapped'),
		skipped: by('skipped'),
		parityChecked: r.parity.length,
		parityFailed: r.parity.filter((p) => !p.identical).length,
	}
}

/**
 * Everything that did not migrate cleanly must say why, and must remain visible —
 * `spec_diagnostics` in core, the same place an orphaned slot lands after a node swap
 * (12 §5). Same principle as export (12 §7a): nothing is dropped silently.
 * @experimental
 */
export function unmappedEntries(r: MigrationReport): MigrationEntry[] {
	return r.entries.filter((e) => e.outcome !== 'migrated')
}

/** @experimental */
export class MigrationError extends Error {}

/** A report with an entry that gives no reason is a bug in the migration, not in the data. @experimental */
export function assertReportComplete(r: MigrationReport): void {
	const silent = r.entries.filter((e) => e.outcome !== 'migrated' && !e.reason)
	if (silent.length) {
		throw new MigrationError(
			`${silent.length} entr${silent.length === 1 ? 'y' : 'ies'} did not migrate and gave no reason ` +
				`(${silent.map((s) => `${s.source.table}#${s.source.id}`).join(', ')}). ` +
				`Every non-migrated row states why, or the user finds out by noticing their config is gone.`,
		)
	}
}

// ── Parity ──────────────────────────────────────────────────────────────────

/** @internal */
export interface ParityResult {
	fixture: string
	identical: boolean
	/** First divergence, with context — a diff of two multi-kilobyte prompts is unreadable. */
	firstDifferenceAt?: number
	legacyExcerpt?: string
	pipelineExcerpt?: string
	tokensLegacy?: number
	tokensPipeline?: number
}

const EXCERPT = 60

/**
 * Compare what the legacy engine produced against what the migrated pipeline *would*
 * send. The second argument is a **preview receipt** — the run stopped at the pre-call
 * substrate, so this compares the real payload rather than a reimplementation of it.
 */
/**
 * The text that would actually be sent, out of whatever the context port carried.
 *
 * Three shapes reach here. A Provider with a `wire` slot puts a formed payload on
 * the port, and that may already be a string. Core's Assemble puts an **allocated
 * context** there — blocks plus the rendered string, because the budget panel needs
 * the blocks (16 §7) — so the prompt is one level in. A split-chat connection has
 * `messages` instead of `rendered`, and its comparable form is the role-tagged text.
 *
 * Unwrapping matters more than it looks: the first version compared
 * `JSON.stringify` of the whole allocation against the legacy prompt string. That
 * "diverges at character 0" on every fixture forever — a harness that can never go
 * green is indistinguishable from one whose subject is broken, and it costs a day
 * to tell them apart.
 */
function renderedText(value: unknown): string {
	if (typeof value === 'string') return value
	const v = value as Record<string, unknown> | null | undefined
	if (v && typeof v.rendered === 'string') return v.rendered
	if (v && Array.isArray(v.messages))
		return (v.messages as Array<{ role?: string; content?: string }>)
			.map((m) => `${m.role ?? ''}: ${m.content ?? ''}`)
			.join('\n')
	if (v && typeof v.prompt === 'string') return v.prompt
	return JSON.stringify(value)
}

/** @internal */
export function checkParity(
	fixture: string,
	legacyPrompt: string,
	preview: Receipt,
	count?: (v: unknown) => number,
): ParityResult {
	const p = preview.preview
	if (!p) {
		throw new MigrationError(
			`parity for '${fixture}' was given a receipt with no preview. Run the migrated pipeline ` +
				`with { preview: true } — comparing against anything else compares a reimplementation.`,
		)
	}
	const pipelinePrompt = renderedText(p.context.rendered)
	if (legacyPrompt === pipelinePrompt) {
		return {
			fixture,
			identical: true,
			tokensLegacy: count?.(legacyPrompt),
			tokensPipeline: p.context.tokens,
		}
	}
	let i = 0
	while (
		i < legacyPrompt.length &&
		i < pipelinePrompt.length &&
		legacyPrompt[i] === pipelinePrompt[i]
	)
		i++
	return {
		fixture,
		identical: false,
		firstDifferenceAt: i,
		legacyExcerpt: legacyPrompt.slice(Math.max(0, i - EXCERPT / 2), i + EXCERPT),
		pipelineExcerpt: pipelinePrompt.slice(Math.max(0, i - EXCERPT / 2), i + EXCERPT),
		tokensLegacy: count?.(legacyPrompt),
		tokensPipeline: p.context.tokens,
	}
}

/**
 * The gate on dropping an old code path (08 §5). Deliberately strict: an empty corpus
 * passes nothing, because "no failures" and "nothing was checked" look identical in a
 * summary and only one of them is safe.
 * @internal
 */
export function parityGate(
	results: ParityResult[],
	minimumCorpus = 1,
): { pass: boolean; reason?: string } {
	if (results.length < minimumCorpus) {
		return {
			pass: false,
			reason: `corpus has ${results.length} fixtures; ${minimumCorpus} required. An unchecked corpus is not a green one`,
		}
	}
	const failed = results.filter((r) => !r.identical)
	if (failed.length) {
		return {
			pass: false,
			reason: `${failed.length}/${results.length} fixtures diverge, first at ${failed[0]!.fixture}`,
		}
	}
	return { pass: true }
}

/** @internal */
export function renderParity(r: ParityResult): string {
	if (r.identical) return `✓ ${r.fixture}  identical (${r.tokensPipeline ?? '?'} tokens)`
	return [
		`✗ ${r.fixture}  diverges at character ${r.firstDifferenceAt}`,
		`    legacy:   …${r.legacyExcerpt}…`,
		`    pipeline: …${r.pipelineExcerpt}…`,
	].join('\n')
}

// ── The commitMessage split (13 §10b) ───────────────────────────────────────

/**
 * Rewrite a legacy `commit-message@1` node into `create-message@1` or
 * `update-message@1`.
 *
 * The old type decided new-vs-update at runtime from whether an id happened to be
 * present. Migrating it means recovering that decision from the document — and the
 * honest answer is that **it is recoverable in most specs and genuinely ambiguous in a
 * few**. A migration that guesses in the ambiguous case converts a spec that used to
 * update into one that creates, and the user finds out when their chat fills with
 * duplicates.
 *
 * So the rule is: an id wired in (by edge or by config) means update; nothing wired
 * means create; **anything else is reported unmapped rather than decided**. `unmapped`
 * is already the shape 08 §5b uses for "a human has to look at this."
 * @experimental
 */
export const LEGACY_COMMIT_MESSAGE = 'core:outlet/commit-message'

/** @experimental */
export interface SplitResult {
	document: SpecDocument
	report: MigrationReport
}

/** @experimental */
export function splitCommitMessage(doc: SpecDocument): SplitResult {
	const entries: MigrationEntry[] = []
	const nodes = doc.nodes.map((n) => {
		if (n.definitionId !== LEGACY_COMMIT_MESSAGE) return n

		const wiredByEdge = doc.edges.filter((e) => e.to === n.key && ID_PORTS.has(e.toPort))
		const wiredByConfig = ID_KEYS.filter(
			(k) => n.config[k] !== undefined && n.config[k] !== null,
		)
		const wired = wiredByEdge.length + wiredByConfig.length

		if (wired === 0) {
			entries.push({
				source: { table: 'spec_nodes', id: n.key },
				outcome: 'migrated',
				target: {
					slug: 'core:outlet/create-message@1',
					scopeKind: 'config',
					nodeKey: n.key,
				},
				reason: 'nothing supplies an id, so this node only ever created',
			})
			return {
				...n,
				definitionId: 'core:outlet/create-message',
				definitionVersion: 1,
			}
		}

		// An id arriving from a write in the same run used to be reported rather
		// than decided, because under async review that row might never have
		// existed. That position is gone and a create → update pair on one row
		// inside one run is one primary row (09-B B4, R-17) — so it is what it
		// looks like: an update of the row an earlier node made.
		if (wiredByEdge.length + wiredByConfig.length > 1) {
			entries.push({
				source: { table: 'spec_nodes', id: n.key },
				outcome: 'unmapped',
				reason: `two sources supply an id (${[...wiredByEdge.map((e) => e.toPort), ...wiredByConfig].join(', ')}) — which one won was a runtime detail`,
			})
			return n
		}

		entries.push({
			source: { table: 'spec_nodes', id: n.key },
			outcome: 'migrated',
			target: {
				slug: 'core:outlet/update-message@1',
				scopeKind: 'config',
				nodeKey: n.key,
			},
			reason: 'an id is wired in, so this node updated',
		})
		const port = wiredByEdge[0]?.toPort
		return {
			...n,
			definitionId: 'core:outlet/update-message',
			definitionVersion: 1,
			config: port ? n.config : renameIdKey(n.config),
		}
	})

	const edges = doc.edges.map((e) =>
		ID_PORTS.has(e.toPort) &&
		nodes.find((n) => n.key === e.to)?.definitionId === 'core:outlet/update-message'
			? { ...e, toPort: 'target' }
			: e,
	)

	return {
		document: { ...doc, nodes, edges },
		report: { unit: 'commit-message split (13 §10b)', entries, parity: [] },
	}
}

/** The port and config names the legacy type accepted an id under. */
const ID_PORTS = new Set(['messageId', 'id', 'target'])
const ID_KEYS = ['messageId', 'id'] as const

const renameIdKey = (config: Record<string, unknown>): Record<string, unknown> => {
	const out = { ...config }
	for (const k of ID_KEYS)
		if (out[k] !== undefined) {
			out.target = out[k]
			delete out[k]
		}
	return out
}
