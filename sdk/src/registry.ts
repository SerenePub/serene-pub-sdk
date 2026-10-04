/**
 * The pipeline type registry — the ruling on 13 §10c.
 *
 * ## Where a type's shape comes from, at three different moments
 *
 * The question underneath "schema sources" is which artefact is authoritative, and the
 * honest answer is that a different one is authoritative at each moment. Writing that
 * down is the ruling; pretending there is a single source is what would go wrong.
 *
 * | moment | source of truth | why |
 * |---|---|---|
 * | authoring | the `Descriptor` in code | the author is *defining* the type; nothing else knows it yet |
 * | compiling a spec | generated `/contracts` | frozen per release, so a pin resolves the same way forever (04 §2) |
 * | installing | **the registry row** | the only one core can read without executing the plugin |
 *
 * The third row is the whole point. Core must decide whether a plugin is installable
 * before it ever runs the plugin's code — F6 means core imports documents, never
 * authoring JS — so install-time validation reads two things that are both plain data:
 * the plugin's **manifest** (types summarized, permissions compiled from usage) and its
 * **documents** (nodes pinned by `definitionId@version`, edges carrying the shapes they were
 * compiled against).
 *
 * ## What that makes checkable
 *
 * The interesting failure is not a plugin that pins a type nobody has — that one is
 * obvious and fails loudly. It is a plugin **built against a different release**, where
 * every id still resolves but a port now produces a different shape. The document
 * records the shape each edge was compiled against, so comparing it to the registry
 * catches exactly that, and catches it at install rather than mid-run.
 */

import { pluginRuleRef } from './pluginRuleRef.js'
import {
	definitionPolicy,
	scriptPointsOf,
	type DefinitionPolicy,
	type Descriptor,
	type EntryShape,
	type ScriptPointDecl,
	type SlotDecl,
} from './descriptors.js'
import type { MediaCapability } from './media.js'
import { isScriptKindId, type ScriptKindDecl } from './scripts.js'
import { settingsSlotFor } from './settingsSlot.js'
import type { SettingsSchema } from './settings.js'
import type { SpecDocument } from './document.js'

/**
 * A `pipeline_definition_registry` row (02 §3), as data.
 *
 * Two halves, and the row carries both (plans/31 V6): every **contract**
 * field of the `Descriptor` (`DESCRIPTOR_CONTRACT_KEYS`) — so a row read back
 * hashes to the `content_hash` it was written under, and a plugin can be
 * judged against rows without being executed (F6) — and the **policy** half,
 * on `policy`, `i18n` and `public`, which the hash never sees and a sync
 * refreshes in place.
 * @internal
 */
export interface RegistryEntry {
	id: string
	version: number
	kind: string
	/**
	 * Failing is tolerated (see `Descriptor.optional`). Carried into the row
	 * because it is part of the contract a pin freezes: the ports do not move
	 * when it flips, but every spec pinning the version changes behaviour on
	 * failure.
	 */
	optional?: boolean
	/**
	 * The four other contract flags and the three contract declarations that
	 * had no column until plans/31 V6 — carried for the same reason `optional`
	 * is: each is in the hash, and a hashed field the row cannot carry is a
	 * row that cannot reproduce its own pointer. `review.fields` is also what
	 * a `transport: process` outlet's gate form is read from.
	 */
	declaresRandomness?: boolean
	earlyExit?: boolean
	liveRow?: boolean
	review?: { fields: readonly string[] }
	/** Connection kind for providers (== produced shape) — `Descriptor.shape`. */
	shape?: string
	media?: MediaCapability
	/**
	 * Interior script points (18 §4e) — carried into the row for the same
	 * reason `slots` is: the panel offers one chain option per point and must
	 * render it without loading the plugin (F6). Keys and `accepts` are
	 * contract and hash; labels are display text, stripped like `i18n`
	 * everywhere else. Always the full shape — the projection copies through
	 * `scriptPointsOf`, and `register()` refuses a bare string or a point
	 * without `accepts`, so a row never carries one.
	 */
	scriptPoints?: ScriptPointDecl[]
	/**
	 * The chat-shape contract (19 §1) — present only on mode-bearing input
	 * types. Carried for the reason `slots` is: the mode picker and the chat
	 * settings render from rows (F6), never from a loaded spec. Hashed —
	 * widening a capability changes what existing sessions legally contain —
	 * with any embedded `i18n`/`description` stripped like everywhere.
	 */
	sessionShape?: unknown
	ports: { in: Record<string, string | undefined>; out: Record<string, string | undefined> }
	/**
	 * The **declarations**, not their names.
	 *
	 * This carried `string[]` until 0.6.0, and that quietly broke the promise the
	 * column exists to keep. 12 §2 says slot declarations live in the type descriptor
	 * *"so a plugin Provider's prompt fields render next to core's automatically, with
	 * no UI work"*, and the table above says the registry row is what core reads
	 * **without executing the plugin**. A name list satisfies neither: a form
	 * generator given `['prompts', 'params']` knows a form exists and nothing about
	 * what is in it, so it has to fall back to the in-process descriptor map — which
	 * exists for core types, does not exist for a `transport: 'process'` plugin type,
	 * and is the exact thing F6 forbids reaching for.
	 *
	 * Storing the declaration makes the pipeline view (05 §0a) and the lens view
	 * (05 §3) generated from rows, which is what lets a plugin's sliders appear beside
	 * core's with nothing authored twice.
	 *
	 * One of them the author did not write: `settings` (R-9), which the
	 * projection derives from `optional` / `effects` / `reviewDefault` so the
	 * panel finds the switch and the gate here like any slot. It is left out
	 * of the content hash — `authoredSlots` — for the reason that file gives.
	 */
	slots: Record<string, SlotDecl>
	/**
	 * The entry-row contract (Part 1), minus its `fields` — present only on
	 * entry types. Carried for the reason `slots` is: the ranker, the assembler
	 * and the constraint projection all read the declaration from **rows**, and
	 * the row is the only source that exists for a type this process never
	 * loaded (F6).
	 *
	 * Hashed whole. Roles decide where a row competes, how it sorts, who may
	 * see it and where it renders, so moving one changes what an untouched
	 * install does — `@N+1`, deliberately.
	 */
	entryShape?: Omit<EntryShape, 'fields'>
	/**
	 * The declared schema of the type-specific half of a row — `entryShape.fields`,
	 * living in the column that already exists for a declared schema rather
	 * than riding inside the blob above.
	 *
	 * Split out because the readers differ: the boot step that projects CHECK
	 * constraints and indexes wants a schema, generically, from a column it can
	 * name — the same shape the form renderer already reads everywhere else.
	 * Hashed for the reason the constraint projection makes unavoidable: a
	 * schema change *is* a constraint change.
	 */
	configSchema?: SettingsSchema
	/**
	 * What the type calls itself — the name a screen shows for it.
	 *
	 * Outside the content hash, like every other piece of display text: naming
	 * a node better is not a contract change. Carried in the row for the same
	 * reason `slots` is — the pipeline builder renders from rows and never
	 * loads the plugin (F6), so a name only the descriptor knows is a name no
	 * plugin's node can have.
	 */
	i18n?: unknown
	/**
	 * Script types only: how a chain of this operation treats what its links
	 * return — `transform` folds into the flowing bag, `verdict` is consumed by
	 * the hook and reduced (18 §5).
	 *
	 * Hashed, and it has to be. Flipping it moves no port and keeps every
	 * attachment compiling, while turning "each link rewrites the text" into
	 * "the earliest answer wins" — the same shape of silent behaviour change
	 * `optional` was, and the reason that one is hashed.
	 */
	semantics?: string
	effects?: string
	causesEvent?: string
	/** The in-port whose literal names the event a write causes. */
	causesEventFrom?: string
	/** Inlet only: the event payloads it reads (R33) — hashed with the contract. */
	payloads?: string[]
	public?: boolean
	/**
	 * The policy half (plans/31 V6): `provisional` (plans/29 R-2 — the row
	 * also reads it as `status: 'provisional'`), `reviewDefault`,
	 * `timeoutMs`, `timeoutKind`, `toggleable`. Never hashed; a sync writes
	 * it on insert and refreshes it in place when it moves, so flipping a
	 * flag reaches every install without a pointer move. Absent on a script
	 * kind's row, which declares none of them.
	 */
	policy?: DefinitionPolicy
	/** Null for core types; the plugin slug for plugin types (12 §3b). */
	owner?: string
	/** Which SP release seeded this row. */
	release?: string
}

const versionOf = (id: string) => Number(/@(\d+)$/.exec(id)?.[1] ?? 1)
const bare = (id: string) => id.replace(/@\d+$/, '')

const shapeId = (s: unknown): string | undefined =>
	typeof s === 'string' ? s : ((s as { id?: string } | undefined)?.id ?? undefined)

/** Project descriptors into registry rows — how core seeds and refreshes the table. @experimental */
export function snapshotRegistry(
	types: Array<Descriptor | ScriptKindDecl>,
	meta: { owner?: string; release?: string } = {},
): RegistryEntry[] {
	return types.map((t) =>
		isScriptKindId(t.id) ? scriptEntry(t as ScriptKindDecl, meta) : nodeEntry(t as Descriptor, meta),
	)
}

/**
 * A script type as a registry row.
 *
 * ⚠ Projected through the *same* function as node types, deliberately. 18 §2
 * puts scripts "under the same sync, conflict-refusal and re-projection rules
 * as node types", and the cheapest way to keep that true is for there to be one
 * projection, one hash and one sync rather than a parallel set that drifts.
 *
 * `blastRadius` rides inside `i18n` rather than earning a column, because that
 * is what it is: display text, stripped from the hash, read from the row by a
 * panel that must not load the plugin to render a badge (F6). `semantics` does
 * earn one — it is contract.
 */
function scriptEntry(d: ScriptKindDecl, meta: { owner?: string; release?: string }): RegistryEntry {
	return {
		id: bare(d.id),
		version: versionOf(d.id),
		kind: 'script',
		semantics: d.semantics,
		ports: { in: { ...d.ports.in }, out: { ...d.ports.out } },
		// No slots: a script type is a contract, not a configurable surface.
		// What is configurable about a script is the script — its source and its
		// declared variable I/O — which lives on its row, not on its type.
		slots: {},
		i18n: { ...(d.i18n ?? {}), blastRadius: d.blastRadius },
		owner: meta.owner,
		release: meta.release,
	}
}

function nodeEntry(d: Descriptor, meta: { owner?: string; release?: string }): RegistryEntry {
	// The substrate's slot, after the author's so an author's own key order
	// is what the panel walks. `register` has already refused an authored
	// `settings`, so the spread cannot be shadowing one.
	const settings = settingsSlotFor(d)
	return {
		id: bare(d.id),
		version: versionOf(d.id),
		kind: d.kind,
		ports: {
			in: Object.fromEntries(
				Object.entries(d.ports?.in ?? {}).map(([k, v]) => [k, shapeId(v)]),
			),
			out: Object.fromEntries(
				Object.entries(d.ports?.out ?? {}).map(([k, v]) => [k, shapeId(v)]),
			),
		},
		slots: { ...(d.slots ?? {}), ...(settings ? { settings } : {}) },
		/**
		 * What the type calls itself.
		 *
		 * ⚠ Not projected until 0.6, so the column existed and was always NULL
		 * — and every reader that wanted a name invented one from the id
		 * instead. The pipeline builder rendered
		 * `core:query/graph-context@1` as "Graph context" while its
		 * declaration said "Graph relationships", and nothing anywhere showed
		 * the second.
		 *
		 * Excluded from the content hash, like every other piece of display
		 * text, which is exactly why it has to be *refreshed* rather than only
		 * written on insert: a renamed type never takes the conflict path.
		 */
		i18n: d.i18n,
		/**
		 * Entry types only, and split in two on the way into the row: the
		 * facets to `entryShape`, the declared `fields` schema to
		 * `configSchema`. `undefined` on every node type, and `JSON.stringify`
		 * drops undefined keys, so no node type's hash moves by this being
		 * here.
		 */
		entryShape: d.entryShape ? entryFacets(d.entryShape) : undefined,
		configSchema: d.entryShape?.fields,
		effects: d.effects,
		causesEvent: d.causesEvent,
		causesEventFrom: d.causesEventFrom,
		payloads: d.payloads?.length ? [...d.payloads] : undefined,
		public: d.public,
		optional: d.optional,
		declaresRandomness: d.declaresRandomness,
		earlyExit: d.earlyExit,
		liveRow: d.liveRow,
		review: d.review,
		shape: d.shape,
		media: d.media,
		// The policy half, whole — what the row's `status` and the panel's
		// defaults are read from, and what the hash never sees.
		policy: definitionPolicy(d),
		// Copied on the way in, so a row is always the full shape the panel
		// renders (`register()` refused anything less).
		scriptPoints: d.scriptPoints ? scriptPointsOf(d) : undefined,
		sessionShape: d.sessionShape,
		owner: meta.owner,
		release: meta.release,
	}
}

/** The entry contract without the half that has its own column. */
function entryFacets(shape: EntryShape): Omit<EntryShape, 'fields'> {
	const { fields: _fields, ...facets } = shape
	return facets
}

/** @experimental */
export type InstallCode =
	| 'E_UNKNOWN_TYPE'
	| 'E_SHAPE_DRIFT'
	| 'E_REDECLARES_CORE'
	| 'E_PRIVATE_TYPE'
	| 'E_MISSING_BINDING'
	| 'E_IN_PROCESS_HOOK'
	| 'W_NEWER_VERSION'

/** @experimental */
export interface InstallFinding {
	severity: 'error' | 'warning'
	code: InstallCode
	message: string
	/** What the admin or author does about it. Never omitted (15 §1.3). */
	fix: string
	where?: string
}

/** @experimental */
export interface InstallInput {
	/** The plugin's own declared types, as summarized in its manifest. */
	declares: Array<{
		id: string
		binding?: string
		ports?: RegistryEntry['ports']
		runtime?: string
	}>
	/** The pipeline documents shipped beside the manifest. */
	documents: SpecDocument[]
	/** The installing instance's registry. */
	registry: RegistryEntry[]
	/** Type ids the plugin enumerates hooks for — a declared type with no binding cannot run. */
	bound?: string[]
	owner?: string
}

/**
 * Decide whether a plugin is installable, from data alone.
 *
 * Never loads the plugin. Every finding names what to do, because the reader is an admin
 * who did not write the plugin and cannot be expected to infer the fix from the symptom.
 * @internal
 */
export function checkInstall(input: InstallInput): InstallFinding[] {
	const findings: InstallFinding[] = []
	const byId = new Map(input.registry.map((r) => [`${r.id}@${r.version}`, r]))
	const latest = new Map<string, number>()
	for (const r of input.registry) latest.set(r.id, Math.max(latest.get(r.id) ?? 0, r.version))

	// 1. A plugin may not redeclare a type it does not own.
	for (const d of input.declares) {
		const existing = byId.get(d.id.includes('@') ? d.id : `${d.id}@1`)
		if (existing && existing.owner !== input.owner)
			findings.push({
				severity: 'error',
				code: 'E_REDECLARES_CORE',
				where: d.id,
				message: `${d.id} is already registered${existing.owner ? ` by '${existing.owner}'` : ' by core'}`,
				fix:
					`publish it under your own namespace instead. Ownership is what lets an update ` +
					`replace the right rows — two owners for one id means an update cannot tell which ` +
					`rows are its own (12 §3b).`,
			})
	}

	const declared = new Set(input.declares.map((d) => (d.id.includes('@') ? d.id : `${d.id}@1`)))

	for (const doc of input.documents) {
		for (const n of doc.nodes) {
			const pin = `${n.definitionId}@${n.definitionVersion}`
			const entry = byId.get(pin)

			// 2. A pin that resolves to nothing.
			if (!entry && !declared.has(pin)) {
				const known = latest.get(n.definitionId)
				findings.push({
					severity: 'error',
					code: 'E_UNKNOWN_TYPE',
					where: `${doc.id} · ${n.key}`,
					message: `pins ${pin}, which this pub does not have`,
					fix: known
						? `this pub has ${n.definitionId}@${known}. Pins are frozen on purpose, so the plugin has to be rebuilt against this release rather than silently re-pinned here.`
						: `no version of ${n.definitionId} is registered. It comes from another plugin — install that one first, or the pipeline has a dependency its manifest does not declare.`,
				})
				continue
			}

			// 3. A private type belonging to someone else.
			if (entry && entry.owner && entry.owner !== input.owner && !entry.public)
				findings.push({
					severity: 'error',
					code: 'E_PRIVATE_TYPE',
					where: `${doc.id} · ${n.key}`,
					message: `pins ${pin}, which is private to '${entry.owner}'`,
					fix:
						`ask '${entry.owner}' to make its handler public — handler(definition, fn, { visibility: 'public' }). ` +
						`A private node is one its owner may change without warning, so using it across a plugin boundary ` +
						`would break on their next release.` +
						pluginRuleRef('private-nodes'),
				})

			// 4. Informational: a newer version exists. The pin still runs — that is what
			//    pinning is for — but an author reading the install log should know.
			const newest = latest.get(n.definitionId)
			if (entry && newest && newest > n.definitionVersion)
				findings.push({
					severity: 'warning',
					code: 'W_NEWER_VERSION',
					where: `${doc.id} · ${n.key}`,
					message: `pins ${pin}; this pub also has @${newest}`,
					fix: `nothing is required — the pin resolves and runs. Upgrade deliberately if you want the newer behaviour.`,
				})
		}

		// 5. The one that matters: built against a different release. Every id resolves,
		//    but a port produces a different shape than the document was compiled against.
		for (const e of doc.edges) {
			if (!e.shape) continue
			const from = doc.nodes.find((n) => n.key === e.from)
			if (!from) continue
			const entry = byId.get(`${from.definitionId}@${from.definitionVersion}`)
			const now = entry?.ports.out[e.fromPort]
			if (entry && now && now !== e.shape)
				findings.push({
					severity: 'error',
					code: 'E_SHAPE_DRIFT',
					where: `${doc.id} · ${e.from}.${e.fromPort} → ${e.to}.${e.toPort}`,
					message: `compiled against ${e.shape}; this pub publishes ${now}`,
					fix:
						`rebuild the plugin against this release. This is the failure a version number ` +
						`alone would not have caught: the id resolved, so nothing looked wrong until the ` +
						`value reached a node that could not read it.`,
				})
		}
	}

	// 5a. A hook that wants to run inside Serene Pub's process.
	//
	// Refused from the manifest, before anything is loaded — which is the only
	// moment it *can* be refused, since by the time the code is running it is
	// already in the host's process. An in-process hook cannot be stopped: a
	// runaway loop or a blocking call takes the whole application down with it,
	// and F36's promise that every invocation is bounded stops being enforceable
	// (13 §7h).
	for (const d of input.declares)
		if (d.runtime && d.runtime !== 'process')
			findings.push({
				severity: 'error',
				code: 'E_IN_PROCESS_HOOK',
				where: d.id,
				message: `declares runtime '${d.runtime}'; extension hooks run in their own process`,
				fix:
					`rebuild with the current SDK, which no longer offers an in-process runtime. ` +
					`A hook inside the host's process cannot be timed out or killed, so one bad ` +
					`loop stops Serene Pub rather than one node.`,
			})

	// 6. A declared type nobody bound is a node the executor cannot invoke.
	if (input.bound) {
		const bound = new Set(input.bound)
		for (const d of input.declares)
			if (!bound.has(d.id))
				findings.push({
					severity: 'error',
					code: 'E_MISSING_BINDING',
					where: d.id,
					message: `declared as a type but no hook implements it`,
					fix: `add a handler() for ${d.id}, or drop the declaration. A definition with no handler is a node a user can add to a pipeline that then fails at run time.`,
				})
	}

	return findings
}

/** @internal */
export const installable = (f: InstallFinding[]): boolean => !f.some((x) => x.severity === 'error')

/** @internal */
export function renderInstall(findings: InstallFinding[]): string {
	if (!findings.length) return 'installable'
	return findings
		.map(
			(f) =>
				`${f.severity === 'error' ? '✗' : '⚠'} ${f.where ?? ''}  [${f.code}] ${f.message}\n    → ${f.fix}`,
		)
		.join('\n')
}
