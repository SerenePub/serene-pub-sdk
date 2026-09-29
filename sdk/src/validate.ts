/**
 * Validation — the Fixed Ledger laws that can be checked statically.
 *
 * Every finding names what to do instead (15 §1.3). A prohibition without a stated
 * alternative is a bug, and there is a test asserting exactly that.
 */

import { pluginRuleRef } from './pluginRuleRef.js'
import { JUNCTION_CLAUSE_PORTS, junctionBranchEnds, type SpecDocument } from './document.js'
import { notADeclaredEvent, packageEventById } from './events.js'
import { annexDeclarationOf, annexStepFindings } from './annexFields.js'
import { settingsSlotFor } from './settingsSlot.js'
import {
	ANSWER_FORM_OUTLET_ID,
	FORM_ADDRESSED_INLET_ID,
	getDefinition,
	isBuiltInOutlet,
	isBuiltInSpec,
	LIVE_ROW_PORTS,
	reviewFieldsFinding,
	widgetDeclsFindings,
	type SlotDecl,
} from './descriptors.js'
import { i18nFindings, i18nText, type I18n } from './i18n.js'
import { formatChannel, parseChannel } from './channels.js'
import { PREDICATE_CONDITION_KEYS } from './predicates.js'
import { provisionalVerdict, settingsTravelVerdict } from './verdicts.js'
import { settingsSchemaFindings } from './settings.js'
import { actionDocumentFindingsByLaw } from './actions.js'
import { templateLawFindings, type TemplateChecking } from './templateFit.js'
import { isSlotRef, type SlotRef } from './refs.js'
import { assignable, isStreaming, JSON_SHAPE } from './shapes.js'
import {
	capabilityLabel,
	FEATURES,
	IO_KINDS,
	isTransformId,
	parseTransform,
	transformId,
	type CapabilityId,
	type TransformId,
} from './capabilities.js'

/**
 * The port shapes a spec may assemble field by field (`templateContext: {
 * advertisement: …, results: … }`): the permissive sink, and the object a
 * context template renders against — the tool loop's prompt builds the
 * latter from two text ports, and nothing publishes it whole for that spec.
 * A field edge into any other port is held to the port's shape.
 */
const FIELD_ASSEMBLED_SHAPES: ReadonlySet<string> = new Set([
	JSON_SHAPE,
	'core:shape/template-context@1',
])

/** @experimental */
export interface Finding {
	law: string
	severity: 'error' | 'warning'
	nodeKey?: string
	message: string
	/** What to do instead — required for every error. */
	fix: string
}

/**
 * A verdict's sentence or fix as a finding's string (01 §13): findings are
 * `en`, the locale every map carries. An absent fix is the empty string —
 * every verdict this file quotes declares one.
 */
const en = (v: I18n | undefined): string => (v === undefined ? '' : (i18nText(v) ?? ''))

/**
 * What `validate()` is handed beyond the document. @experimental
 */
export interface ValidateOptions {
	/**
	 * The template checker, for law T1's name check (typed templates P5):
	 * `{ check: checkTemplateSourceReport }` from `@serene-pub/sdk/template-check`,
	 * plus the host's vocabulary. A value rather than an import because the
	 * checker carries the engines and this module is on the dependency-free
	 * barrel. Absent, T1 still refuses scope collisions, forbidden kinds and a
	 * band with no variable; it does not read template sources.
	 */
	templates?: TemplateChecking
}

/** @experimental */
export function validate(doc: SpecDocument, options: ValidateOptions = {}): Finding[] {
	const f: Finding[] = []
	const byKey = new Map(doc.nodes.map((n) => [n.key, n]))
	const desc = (k: string) => {
		const n = byKey.get(k)
		return n ? getDefinition(`${n.definitionId}@${n.definitionVersion}`) : undefined
	}

	// ── 01 §2 — exactly one inlet, positionally first ─────────────────────────
	const inlets = doc.nodes.filter((n) => n.kind === 'inlet')
	if (inlets.length !== 1) {
		f.push({
			law: '01 §2',
			severity: 'error',
			message: `a spec has exactly one inlet; found ${inlets.length}`,
			fix: 'declare a single .inlet() as the first step',
		})
	} else if (inlets[0]!.position !== 0) {
		f.push({
			law: '01 §2',
			severity: 'error',
			nodeKey: inlets[0]!.key,
			message: 'the inlet is not the first node',
			fix: 'move .inlet() to the top of the chain',
		})
	}

	// ── R-2 — a provisional definition cannot be placed ───────────────────────
	//
	// Declared, not bound (plans/29 R-2): the definition is published because a
	// plan owns it, and no handler runs it. A document placing one would
	// publish, seed configs and halt at the node with "no binding registered"
	// pointing at the wrong file — so it is refused here, where the author is,
	// with the two things they can do. The executor refuses the same node with
	// the same sentence (defence in depth: a stored document predates the flag);
	// `core:verdict/provisional` owns it, and both doors quote it (01 §13).
	for (const n of doc.nodes) {
		const heard = provisionalVerdict.judge({
			kind: 'placement',
			nodeKey: n.key,
			definitionId: n.definitionId,
			definitionVersion: n.definitionVersion,
			provisional: desc(n.key)?.provisional === true,
		})
		if (heard.ok) continue
		f.push({
			law: provisionalVerdict.law,
			severity: 'error',
			nodeKey: n.key,
			message: en(heard.sentence),
			fix: en(heard.fix),
		})
	}

	// ── F7 — one live row; other writes unlimited (R44, W1) ────────────────
	//
	// A pipeline may write as often as it likes. What a run has one of is its
	// LIVE ROW — the row a stream lands in and Stop finalises: a `liveRow`
	// outlet's write that is still being written (`generating` fed, or a
	// claimed `row` — LIVE_ROW_PORTS). The same outlet writing a complete
	// message is an ordinary write. Beside the live row, a second MESSAGE on
	// its channel is two rows racing for one place: refused here where the
	// channel is a literal (or unset = main), and by the host where it is
	// wired. A port fed by an edge or a reference counts as fed — the
	// document cannot prove it will be falsy.
	//
	// Beside, not after (amended 2026-09-27, lair pass B16): once a write has
	// FINISHED the live row — an outlet whose `target` is the live row's own
	// result — the row is settled and holds its place, so a message that runs
	// strictly after that write lands after it and races nothing. That is how
	// a turn writes its narrator's row and then a row per speaker. The host
	// applies the same rule at run time (`racesLiveRow`).
	//
	// Per EXECUTION PATH (amended 2026-09-28, lair pass R8), as the
	// streaming law already reads (W2): two live-row outlets that can never
	// run in the same execution — mutually exclusive branches of one junction
	// (`exclusiveSteps`) — are each the run's one live row on their own path.
	// That is how one spec opens its row where each branch needs it: the
	// Lair's delver after the Sanctum's beats row, its Castellan's narration,
	// its Sanctum talk. Anything not provably exclusive is still one path.
	const writes = doc.nodes.filter(
		(n) => n.kind === 'outlet' && desc(n.key)?.effects === 'write',
	)
	const fed = (n: (typeof writes)[number], port: string): boolean => {
		const v = (n.config as Record<string, unknown> | undefined)?.[port]
		if (v !== undefined && v !== null && v !== false) return true
		return doc.edges.some((e) => e.to === n.key && e.toPort.split('.')[0] === port)
	}
	const opensLive = (n: (typeof writes)[number]) =>
		Boolean(desc(n.key)?.liveRow) && LIVE_ROW_PORTS.some((p) => fed(n, p))
	const liveRows = writes.filter(opensLive)
	const pathClauses = new Map(doc.clauses.map((c) => [c.id, c]))
	const onOnePath = liveRows.filter((a) =>
		liveRows.some((b) => b !== a && !exclusiveSteps(pathClauses, a, b)),
	)
	if (onOnePath.length > 1) {
		f.push({
			law: 'F7',
			severity: 'error',
			nodeKey: onOnePath[1]!.key,
			message: `a run has at most one live row; found ${onOnePath.length} (${onOnePath.map((w) => w.key).join(', ')})`,
			fix: 'keep one row that is written into (a placeholder or a claimed row) and fill it with update-message; write anything else beside it — complete messages on other channels, the annex, lore — as many as you like. Two may each open one only from mutually exclusive branches of one junction',
		})
	}
	// The channel a message write lands on, canonical, when this document
	// fixes it: a literal, or unset (= main). A wired channel (a ref) is
	// known only at run time — the host refuses there.
	const channelOf = (n: (typeof writes)[number]): string | undefined => {
		const v = (n.config as Record<string, unknown> | undefined)?.channel
		if (v !== undefined && v !== null && typeof v !== 'string') return undefined
		return formatChannel(parseChannel(v ?? 'main'))
	}
	// Each live row against the writes that can run beside it: a write on
	// an exclusive path can never race it, whatever channel it names.
	const raced = new Set<string>()
	for (const live of liveRows) {
		const liveChannel = !fed(live, 'row') ? channelOf(live) : undefined
		if (liveChannel === undefined) continue
		const finishers = writes.filter((w) =>
			doc.edges.some(
				(e) => e.from === live.key && e.to === w.key && e.toPort.split('.')[0] === 'target',
			),
		)
		for (const w of writes) {
			if (liveRows.includes(w) || raced.has(w.key)) continue
			if (!desc(w.key)?.ports.in?.channel) continue
			if (channelOf(w) !== liveChannel) continue
			if (exclusiveSteps(pathClauses, live, w)) continue
			if (finishers.some((f) => runsStrictlyAfter(doc, w, f))) continue
			raced.add(w.key)
			f.push({
				law: 'F7',
				severity: 'error',
				nodeKey: w.key,
				message: `'${w.key}' writes a message on channel '${liveChannel}', the live row's channel ('${live.key}') — two rows racing for one place`,
				fix: `put it on the live row as blocks, or on another channel — a second message beside the reply belongs somewhere the reply is not`,
			})
		}
	}

	// ── F25 — no branching. A node may not feed two divergent spine successors ─
	const spine = doc.nodes.filter((n) => !n.clauseId).sort((a, b) => a.position - b.position)
	const spineKeys = new Set(spine.map((n) => n.key))
	const outByNode = new Map<string, Set<string>>()
	for (const e of doc.edges) {
		if (!spineKeys.has(e.from) || !spineKeys.has(e.to)) continue
		if (!outByNode.has(e.from)) outByNode.set(e.from, new Set())
		outByNode.get(e.from)!.add(e.to)
	}
	for (const [from, tos] of outByNode) {
		if (tos.size <= 1) continue
		// fan-in-to-a-common-successor is legal; genuine divergence is not.
		const positions = [...tos].map((k) => byKey.get(k)!.position).sort((a, b) => a - b)
		const between = spine.filter(
			(n) => n.position > positions[0]! && n.position < positions[positions.length - 1]!,
		)
		const diverges = between.some((n) => !reaches(doc, n.key, spine[spine.length - 1]!.key))
		if (diverges) {
			f.push({
				law: 'F25',
				severity: 'error',
				nodeKey: from,
				message: `'${from}' feeds divergent paths (${[...tos].join(', ')})`,
				fix: 'pipelines are linear: use .gather() for parallel work, .each() for per-item work, .junction() for declared branching, or halt() to stop early',
			})
		}
	}

	// ── Port shape compatibility (01 §3) ──────────────────────────────────────
	for (const e of doc.edges) {
		if (e.implicit) continue
		const up = desc(e.from)
		const down = desc(e.to)
		if (!up || !down) continue
		const outShape = up.ports.out?.[e.fromPort]
		const inShape = down.ports.in?.[e.toPort.split('.')[0]!]
		if (!outShape || !inShape) continue
		// A reference wired into a FIELD of a port (`templateContext.results`)
		// assembles the port's value from parts, and a part has no declared
		// shape to be held to — but only where the port's whole shape is one
		// a spec builds field by field (U5d review, W9 then S-c). Any other
		// port is a whole value, and a field edge into it is held to the
		// port's shape like a whole-port edge: `messages.x: $.lore.hits` is
		// the mistake 01 §3 exists to catch, not an object under construction.
		const wholePort = !e.toPort.includes('.') || !FIELD_ASSEMBLED_SHAPES.has(inShape)
		// R-a (U5d review, 2026-09-17) — a transcript is not a candidates list.
		// `messages@1` was assignable to `context-candidates@1` for one day
		// (W9), which legalised a wiring the host silently drops: a row
		// handed to `concat-candidates` is keyed `undefined:<id>`, the
		// ranker's `select` excludes it as `excluded_unknown_source`, and
		// `assemble` given rows as its candidates halts on "no ranking
		// decisions". A warning rather than 01 §3's error, so a document
		// built from the older teaching corpus still compiles — and is told.
		const transcriptAsCandidates =
			wholePort &&
			outShape === 'core:shape/messages@1' &&
			inShape === 'core:shape/context-candidates@1'
		if (transcriptAsCandidates) {
			f.push({
				law: '16 §5a',
				severity: 'warning',
				nodeKey: e.to,
				message:
					`'${e.from}.${e.fromPort}' is the transcript (core:shape/messages@1), wired into ` +
					`'${e.to}.${e.toPort}' as candidates — the rows are not ranked there, they are dropped`,
				fix:
					`wire '${e.from}.band' into the merge or concat that feeds the ranker (the ` +
					`transcript's share of the window rides the band intent), and hand the rows ` +
					`themselves to core:task/process-messages@1; assemble's 'candidates' takes the ` +
					`ranked list, not the transcript`,
			})
		} else if (wholePort && !assignable(outShape, inShape)) {
			// The write-result case gets its own message, because the generic one
			// ("insert a converter") is the wrong advice: there is nothing to convert.
			// A write publishes a discriminated result, and a port that wants
			// anything but row ids from it has to say so (13 §7j-b). Row ids
			// themselves are assignable — see `S.writeResult`.
			if (outShape === 'core:shape/write-result@1') {
				f.push({
					law: '13 §7j-b',
					severity: 'error',
					nodeKey: e.to,
					message:
						`'${e.to}' expects ${inShape} from '${e.from}.${e.fromPort}', but a gate-eligible ` +
						`write publishes core:shape/write-result@1 — a discriminated result carrying the ` +
						`row ids, not the value itself`,
					fix:
						`declare '${e.to}' with an input port of core:shape/write-result@1 or ` +
						`core:shape/row-ids@1 and read the ids off the result in its hook`,
				})
			} else {
				f.push({
					law: '01 §3',
					severity: 'error',
					nodeKey: e.to,
					message: `'${e.from}.${e.fromPort}' produces ${outShape}; '${e.to}.${e.toPort}' needs ${inShape}`,
					fix: `insert a node that converts ${outShape} to ${inShape}, or pick a type whose port accepts ${outShape}`,
				})
			}
		}
		// F22 — earlyExit only means something on a stream-capable input
		if (down.earlyExit && !isStreaming(outShape)) {
			f.push({
				law: 'F22',
				severity: 'warning',
				nodeKey: e.to,
				message: `'${e.to}' declares earlyExit but '${e.from}.${e.fromPort}' does not stream`,
				fix: 'remove earlyExit, or connect it to a stream-shaped port — on a settled value there is nothing to exit early from',
			})
		}
	}

	// ── F39 — settings never travel; only data does (12 §2 P3, 29 §5d) ───────
	//
	// `<nodeKey>.settings.*` is the substrate's address — `enabled`, `review`,
	// `mode` — read by the executor at its owner and handed to nobody. It is
	// not a port: a data edge drawn from it carries nothing at run time, and a
	// document that draws one has made a node depend on another node's switch
	// (a plugin node keyed to whether `save` is reviewed), which is exactly
	// the coupling that stops two configs from being independent. Refused as
	// the law it breaks rather than as an unknown port, because the fix is
	// different: read a value the owner publishes, or reference its slot.
	// `core:verdict/settings-travel` judges each edge and each reference; the
	// registry and the executor quote the same verdict (01 §13).
	for (const e of doc.edges) {
		if (e.implicit) continue
		const heard = settingsTravelVerdict.judge({
			kind: 'edge',
			from: e.from,
			fromPort: e.fromPort,
			to: e.to,
			toPort: e.toPort,
		})
		if (heard.ok) continue
		f.push({
			law: settingsTravelVerdict.law,
			severity: 'error',
			nodeKey: e.to,
			message: en(heard.sentence),
			fix: en(heard.fix),
		})
	}
	// The same law through the other door: a config reference naming the
	// substrate's slot. `SlotRef.slot` cannot spell it and `slot.*` never
	// produces it, so one here is a hand-written document; the executor
	// resolves it to nothing and notes why (`resolveInput`), and the document
	// is refused before it gets that far.
	for (const n of doc.nodes)
		for (const [k, v] of Object.entries(n.config)) {
			if (!isSlotRef(v)) continue
			const slotName = (v as SlotRef).slot as unknown
			// A reference naming no slot at all is a shape fault, said as one:
			// before this guard it was a TypeError out of `validate()`, and a
			// publish that crashes is worse than one refused (U7 delta review, 3).
			if (typeof slotName !== 'string' || !slotName) {
				f.push({
					law: '12 §2',
					severity: 'error',
					nodeKey: n.key,
					message:
						`'${n.key}.${k}' is a slot reference that names no slot — ` +
						`{ __ref: 'slot', slot } names one of connection, sampling, prompts, template, ` +
						`params, variables`,
					fix:
						`write the reference with slot.<name>() — slot.params(), slot.connection(), ` +
						`slot.prompts() — or give '${n.key}.${k}' a value`,
				})
				continue
			}
			const heard = settingsTravelVerdict.judge({
				kind: 'reference',
				node: n.key,
				key: k,
				slot: slotName,
				target: n.resolvedRefs?.[k] ?? (v as SlotRef).ofNode ?? n.key,
			})
			if (heard.ok) continue
			f.push({
				law: settingsTravelVerdict.law,
				severity: 'error',
				nodeKey: n.key,
				message: en(heard.sentence),
				fix: en(heard.fix),
			})
		}

	// ── R-15 — a built-in outlet only in the built-in's own spec ─────────────
	//
	// The five built-in writes perform the item rule's write: the venue's
	// handler judged who may act on which row before `runBuiltIn` started the
	// spec, and the host re-checks the actor at the commit. A document that is
	// not one of the five placing `delete-message@1` would reach that commit
	// with a payload nobody judged — an event subscriber deleting whatever it
	// was handed. Refused here at publish, and again by the host at the write
	// (defence in depth, U5b review W8). A manifest permission letting a plugin
	// spec place one is the future this leaves room for; nothing grants it yet.
	if (!isBuiltInSpec(doc.id)) {
		for (const n of doc.nodes) {
			const id = `${n.definitionId}@${n.definitionVersion}`
			if (n.kind !== 'outlet' || !isBuiltInOutlet(id)) continue
			f.push({
				law: 'R-15',
				severity: 'error',
				nodeKey: n.key,
				message:
					`'${n.key}' places ${id}, a built-in write, in '${doc.id}' — only the built-in's own ` +
					`spec (core:spec/builtin-*) may perform one, because the write's permission was judged ` +
					`by the handler that started that spec and by nothing this document can supply`,
				fix:
					`remove '${n.key}' and let the person act through the message menu, whose handler runs the ` +
					`built-in for them; a manifest permission for a plugin spec to place a built-in write is ` +
					`not granted in this release`,
			})
		}
	}

	// ── R-15 forms — `answer-form@1` commits an oracle's answer as a click:
	// it fires the block's action AS the addressee. Only a document reached
	// by `form-addressed@1` has a form to answer, so the outlet is refused
	// anywhere else (U5d); the host refuses the commit on the same test.
	for (const n of doc.nodes) {
		const id = `${n.definitionId}@${n.definitionVersion}`
		if (n.kind !== 'outlet' || id !== ANSWER_FORM_OUTLET_ID) continue
		const inlet = inlets[0]
		const inletId = inlet ? `${inlet.definitionId}@${inlet.definitionVersion}` : '(none)'
		if (inletId === FORM_ADDRESSED_INLET_ID) continue
		f.push({
			law: 'R-15',
			severity: 'error',
			nodeKey: n.key,
			message:
				`'${n.key}' places ${ANSWER_FORM_OUTLET_ID}, which answers a form as its addressee, in a ` +
				`document whose inlet is ${inletId} — only a pipeline on ${FORM_ADDRESSED_INLET_ID} ` +
				`has a form to answer`,
			fix:
				`bind the document to core:event/form-addressed@1 through ${FORM_ADDRESSED_INLET_ID}, ` +
				`or remove '${n.key}' — a form is answered by the genre's answer pipeline, never by ` +
				`a spec that was not asked`,
		})
	}

	// ── R-15 review fields — an effectful definition says what a reviewer
	// may edit. A finding at registration (`definitionFindings`), repeated
	// here on every placement as a warning so a document built on such a
	// definition says so; inference is the documented fallback.
	for (const n of doc.nodes) {
		const d = desc(n.key)
		const finding = d ? reviewFieldsFinding(d) : null
		if (!finding) continue
		f.push({
			law: 'R-15',
			severity: 'warning',
			nodeKey: n.key,
			message: `'${n.key}': ${finding}`,
			fix: `declare review: { fields: [...] } on ${d!.id} — the in-ports a reviewer may edit, [] for none`,
		})
	}

	// ── R-15 — contributed actions declare a venue core offers, a slash name in
	// the spec's own namespace, a localised label; F41 — the effects line ────
	//
	// The builder refuses these at construction; a document from any other
	// source (an import, a hand-written JSON) gets the same answer here. Two actions of one spec
	// claiming one slash name for two different functions is a collision the
	// namespace rule cannot prevent — refused as such. Each finding carries
	// the law it comes from (`ActionFinding`): the declaration's shape is
	// R-15's, a `world` action across the line — in a message venue, or
	// acted on by a participant — is F41's (U7 review, W3), so the
	// conformance kit's C20 keys on the label and never on a word. An F41
	// finding carries the fix `core:verdict/effects-line` states; a shape
	// finding gets the one alternative there is.
	for (const { law, message, fix } of actionDocumentFindingsByLaw(doc)) {
		f.push({
			law,
			severity: 'error',
			message,
			fix: fix ?? 'declare the action as `contributes.actions[]` describes — see the SDK\'s actions.ts',
		})
	}

	// ── R-20 — every author-facing string the document carries is display text
	// (a string or a locale map with `en`, never blank; U5i, ruled 2026-09-17):
	// each author preset's label and description; the genre a create pipeline
	// carries — its name and description, its shape's fields schema and panel
	// titles, each envoy's name and description. An action's label is R-15's
	// above, through `actionDocumentFindingsByLaw`. The builder, `genre()` and
	// `announce.build()` refuse these at authoring; a document from any other
	// source gets the same sentence here, and the host's publish runs this.
	for (const message of documentDisplayTextFindings(doc))
		f.push({
			law: 'R-20',
			severity: 'error',
			message,
			fix:
				"write display text a person reads — a plain string ('Lore-heavy') or a locale map " +
				"with 'en' ({ en: 'Lore-heavy', fr: '…' }); a bare string reads as en",
		})

	// Writes inside a clause are allowed since W1 (R44): a gather's writes
	// land as its chains complete, a junction's only on the branch that
	// fires, and a repeating clause's once per pass, bounded by its `max`.
	// The one refusal left is the live row in a repeat, below.

	// ── Repetition bounds (01 §4, §4a) ────────────────────────────────────────
	const clauseById = new Map(doc.clauses.map((b) => [b.id, b]))
	const repeats = (clauseId?: string): string | undefined => {
		let cur = clauseId
		while (cur) {
			const b = clauseById.get(cur)
			if (!b) return undefined
			if (b.kind === 'each' || b.kind === 'loop') return b.id
			cur = b.clauseId
		}
		return undefined
	}
	const within = (inner: string | undefined, outer: string): boolean => {
		let cur = inner
		while (cur) {
			if (cur === outer) return true
			cur = clauseById.get(cur)?.clauseId
		}
		return false
	}

	/**
	 * What a branch may state, counted off ONE list (D-4a, 2026-09-17).
	 *
	 * This read the three words out of a literal, so the night `equalsPath`
	 * joined the grammar it was legal in an action's enabled-when and refused
	 * here as "states no conditions" — the same predicate meaning two things at
	 * two doors, which is the one thing a shared shape exists to prevent.
	 * `default` is the junction's own fourth: only a branch can fire because
	 * nothing else did.
	 */
	const BRANCH_CONDITIONS = [...PREDICATE_CONDITION_KEYS, 'default']

	for (const b of doc.clauses) {
		if (b.kind !== 'junction') continue
		const branches =
			(b as { branches?: Record<string, Record<string, unknown>> }).branches ?? {}
		const on = (b as { on?: { __ref?: string } }).on
		if (!on || on.__ref !== 'data') {
			f.push({
				law: '20 §10',
				severity: 'error',
				message: `junction '${b.id}' has no value to branch on`,
				fix: 'reference a port with on:, e.g. on: $ => $.parse.call — the decision is data a task computed',
			})
		}
		if (!b.chains.length) {
			f.push({
				law: '20 §10',
				severity: 'error',
				message: `junction '${b.id}' declares no branches`,
				fix: 'declare at least one when() branch',
			})
		}
		let defaults = 0
		for (const chain of b.chains) {
			const p = branches[chain]
			if (!p) {
				f.push({
					law: '20 §10',
					severity: 'error',
					message: `junction '${b.id}' branch '${chain}' has no predicate`,
					fix: 'declare it with when(name, predicate) or otherwise(name)',
				})
				continue
			}
			const stated = BRANCH_CONDITIONS.filter((k) => p[k] !== undefined)
			if (p.default) defaults++
			if (stated.length !== 1) {
				f.push({
					law: '20 §10',
					severity: 'error',
					message: `junction '${b.id}' branch '${chain}' states ${stated.length || 'no'} conditions`,
					fix: `exactly one of ${BRANCH_CONDITIONS.join(' / ')} per branch — a richer decision belongs in a Task the junction reads`,
				})
			}
		}
		if (defaults > 1) {
			f.push({
				law: '20 §10',
				severity: 'error',
				message: `junction '${b.id}' declares ${defaults} default branches`,
				fix: "at most one otherwise() — 'fires when nothing else did' cannot be true of two branches",
			})
		}
	}

	for (const b of doc.clauses) {
		if (b.kind !== 'each' && b.kind !== 'loop') continue
		if (!b.max || b.max <= 0) {
			f.push({
				law: b.kind === 'each' ? '01 §4' : '01 §4a',
				severity: 'error',
				message: `${b.kind} '${b.id}' has no declared maximum`,
				fix:
					b.kind === 'each'
						? 'declare max — an unbounded each is the most likely source of a surprise bill in the system'
						: 'declare max — for a loop it is also the only thing between a bad predicate and a run that never ends',
			})
		}
		if (b.kind !== 'loop') continue
		const ref = b.repeatWhile as { __ref?: string; node?: string } | undefined
		if (!ref || ref.__ref !== 'data') {
			f.push({
				law: '01 §4a',
				severity: 'error',
				message: `loop '${b.id}' has no repeatWhile predicate`,
				fix: 'reference a port on a node inside the loop body, e.g. repeatWhile: $ => $.tools.item.generate.hasToolCalls',
			})
			continue
		}
		// A predicate that cannot change is a loop that always runs to max.
		const source = doc.nodes.find((n) => n.key === ref.node)
		if (!source || !within(source.clauseId, b.id)) {
			f.push({
				law: '01 §4a',
				severity: 'error',
				message: `loop '${b.id}' repeats on '${ref.node}', which is not inside the loop body`,
				fix: `reference a node declared inside '${b.id}' — a predicate computed outside the body never changes, so the loop would always run to its max of ${b.max}`,
			})
		}
	}

	// ── A junction's result ports (M4, PLAN-turn-order §4.14) ──────────────────
	// A ref to a junction port beyond its clause ports reads the fired
	// branch's own port, so every branch must end in a node publishing it,
	// with one shape — or a branch that fires hands the consumer nothing.
	for (const e of doc.edges) {
		if (e.implicit) continue
		const clause = doc.clauses.find((c) => c.id === e.from)
		if (!clause || clause.kind !== 'junction' || JUNCTION_CLAUSE_PORTS.has(e.fromPort)) continue
		const ends = junctionBranchEnds(doc.nodes, clause, doc.clauses)
		const shapes = new Set<string>()
		// A junction with no `otherwise` can fire nothing, and then its result
		// port is empty — a consumer handed `undefined` in silence (R26).
		if (!Object.values(clause.branches ?? {}).some((b) => b?.default))
			f.push({
				law: '20 §10',
				severity: 'error',
				nodeKey: e.to,
				message: `'${e.from}.${e.fromPort}' reads junction '${e.from}''s result, but it has no otherwise branch, so it can fire nothing and hand on nothing`,
				fix: `add .otherwise(...) to '${e.from}', or read $.${e.from}.values`,
			})
		for (const { chain, node } of ends) {
			const shape = node
				? getDefinition(`${node.definitionId}@${node.definitionVersion}`)?.ports.out?.[e.fromPort]
				: undefined
			if (!shape) {
				f.push({
					law: '20 §10',
					severity: 'error',
					nodeKey: e.to,
					message:
						`'${e.from}.${e.fromPort}' is not published by every branch of junction '${e.from}' — ` +
						`'${chain}' ends in ${node ? `'${node.key}', which has no '${e.fromPort}'` : 'no node'}`,
					fix: `end every branch in a node publishing '${e.fromPort}', or read $.${e.from}.values`,
				})
			} else shapes.add(shape)
		}
		if (shapes.size > 1)
			f.push({
				law: '20 §10',
				severity: 'error',
				nodeKey: e.to,
				message: `the branches of junction '${e.from}' publish '${e.fromPort}' as different shapes (${[...shapes].join(', ')})`,
				fix: 'end every branch in nodes whose port shapes agree',
			})
		else if (shapes.size === 1) {
			const outShape = [...shapes][0]!
			const inShape = desc(e.to)?.ports.in?.[e.toPort.split('.')[0]!]
			if (inShape && !e.toPort.includes('.') && !assignable(outShape, inShape))
				f.push({
					law: '01 §3',
					severity: 'error',
					nodeKey: e.to,
					message: `'${e.from}.${e.fromPort}' produces ${outShape}; '${e.to}.${e.toPort}' needs ${inShape}`,
					fix: `insert a node that converts ${outShape} to ${inShape}, or pick a type whose port accepts ${outShape}`,
				})
		}
	}

	// ── Referencing into a repeating clause from outside (01 §4a) ─────────────
	for (const e of doc.edges) {
		if (e.implicit) continue
		const from = byKey.get(e.from)
		const to = byKey.get(e.to)
		if (!from || !to) continue
		const repeating = repeats(from.clauseId)
		if (!repeating || within(to.clauseId, repeating)) continue
		f.push({
			law: '01 §4a',
			severity: 'error',
			nodeKey: e.to,
			message: `'${e.to}' references '${e.from}', which is inside ${clauseById.get(repeating)!.kind} '${repeating}' and runs more than once`,
			fix: `reference the clause's own output instead — $.${repeating}.values for the results in order, or $.${repeating} for the full branch record. "Whichever iteration happened to run last" is not a value anyone means`,
		})
	}

	// ── A live row inside a repeating clause would be N live rows (01 §4, W1) ─
	for (const n of doc.nodes) {
		if (n.kind !== 'outlet' || desc(n.key)?.effects !== 'write' || !opensLive(n)) continue
		const repeating = repeats(n.clauseId)
		if (!repeating) continue
		f.push({
			law: '01 §4',
			severity: 'error',
			nodeKey: n.key,
			message: `live-row outlet '${n.key}' is inside ${clauseById.get(repeating)!.kind} '${repeating}' — one reply row per pass is N live rows`,
			fix: 'open the reply row on the spine, before or after the repeat; writes that are not the live row may stay inside it',
		})
	}

	// ── F8 — nodes cannot emit events ─────────────────────────────────────────
	for (const n of doc.nodes) {
		if ('emits' in n.config) {
			f.push({
				law: 'F8',
				severity: 'error',
				nodeKey: n.key,
				message: `'${n.key}' declares emits`,
				fix:
					'no node emits: a write causes the event its outlet declares, and a package records its own declared event with record-event. A pipeline answers an event through its inlet lock' +
					pluginRuleRef('events'),
			})
		}
	}

	// ── F8 / E1 — recording a declared event ──────────────────────────────────
	// A write may cause an event its literal names (`causesEventFrom`). The
	// event is a package's declaration, named as a literal so what a pipeline
	// records is known before it runs, and the payload carries its shape.
	// Scope — which pipelines may record it — is the package entry's to say,
	// and is checked by the package pass and the host.
	for (const n of doc.nodes) {
		const d = desc(n.key)
		const port = d?.causesEventFrom
		if (!port) continue
		const literal = n.config[port]
		const wired =
			doc.edges.some((e) => e.to === n.key && e.toPort.split('.')[0] === port) ||
			(!!literal && typeof literal === 'object')
		const refuse = (message: string, fix: string) =>
			f.push({ law: 'F8', severity: 'error', nodeKey: n.key, message, fix })
		if (wired) {
			refuse(
				`'${n.key}' wires the event it records`,
				'name the event as a literal — pass the declaration value — so what a pipeline records is known before it runs',
			)
			continue
		}
		if (typeof literal !== 'string' || !literal) {
			refuse(`'${n.key}' names no event to record`, 'pass the event you declared with defineSessionEvent()')
			continue
		}
		if (literal.startsWith('core:')) {
			refuse(
				`'${n.key}' records '${literal}', a core event`,
				"core events are caused by core's own writes — declare your own event with defineSessionEvent()",
			)
			continue
		}
		const event = packageEventById(literal)
		if (!event) {
			refuse(`'${n.key}' records '${literal}', which is not declared`, notADeclaredEvent(literal))
			continue
		}
		// The payload: present always; for any shape but json, wired whole
		// from a port of that shape — an assembled or literal value has no
		// shape the declaration could be held to.
		const into = doc.edges.filter((e) => e.to === n.key && e.toPort.split('.')[0] === 'payload')
		const whole = into.filter((e) => e.toPort === 'payload')
		const literalPayload = n.config.payload !== undefined
		if (!into.length && !literalPayload) {
			refuse(`'${n.key}' records '${literal}' with no payload`, `wire a value of shape '${event.payload}' into payload`)
			continue
		}
		if (event.payload === JSON_SHAPE) continue
		if (whole.length !== 1 || into.length !== 1) {
			refuse(
				`'${n.key}' records '${literal}' with an assembled or literal payload; the event carries '${event.payload}'`,
				`wire one port of shape '${event.payload}' into payload, whole`,
			)
			continue
		}
		const outShape = desc(whole[0]!.from)?.ports.out?.[whole[0]!.fromPort]
		if (outShape && !assignable(outShape, event.payload))
			refuse(
				`'${n.key}' records '${literal}' with a '${outShape}' payload; the event carries '${event.payload}'`,
				`wire a value of shape '${event.payload}' into payload — the event's declaration says what a listener receives`,
			)
	}

	// ── R57 — an annex write names only its owner's declared keys ────────────
	// One annex declaration per owner is the single source of truth (owner
	// ruling 2026-09-26): a `set-session-annex` step writes only the keys its
	// owner declares with `annexField()`, and the audience stored is the
	// declaration's. Judged here where the keys are literal and the owner's
	// declaration is known in this process (core's; an installed package's on
	// the host); a wired `value`, or an owner not known here, is the package
	// pass's and the host's write to judge.
	for (const hit of annexStepFindings(doc, annexDeclarationOf))
		for (const refusal of hit.refusals)
			f.push({
				law: 'R57',
				severity: 'error',
				nodeKey: hit.nodeKey,
				message: `'${hit.nodeKey}' writes the annex of '${hit.owner}': ${refusal}`,
				fix: `write only keys '${hit.owner}' declares — add the key to its annexFields with its shape and who may see it`,
			})

	// ── R60 — the whole annex feeding a prompt is warned ──────────────────────
	// The annex as a pipeline reads it carries every value, a secret included;
	// a prompt should read the AI's view (`view: 'ai'`). Followed forward from
	// its sources — `session-annex` without `view: 'ai'`, the settings
	// document (`session-settings`, or an inlet's `session` port, whole or its
	// `annex`) — through every node it reaches, to
	// any node that builds a prompt (an `assembled-context` out-port). A
	// warning, not a refusal: a pipeline may mean it.
	{
		const PROMPT = 'core:shape/assembled-context@1'
		const buildsPrompt = (key: string) =>
			Object.values(desc(key)?.ports.out ?? {}).some((shape) => shape === PROMPT)
		const sources: string[] = []
		for (const n of doc.nodes) {
			// A `view` wired rather than written is decided at run time; only a
			// literal that is not `'ai'` is known to be the whole annex.
			const viewWired = doc.edges.some((e) => e.to === n.key && e.toPort.split('.')[0] === 'view')
			// `'template'` (typed templates P6) is not the whole annex either:
			// declared keys only, and law T2 holds it to a template's port.
			if (
				n.definitionId === 'core:query/session-annex' &&
				n.config.view !== 'ai' &&
				n.config.view !== 'template' &&
				!viewWired
			)
				sources.push(n.key)
			// The settings document carries the whole annex too.
			if (n.definitionId === 'core:query/session-settings') sources.push(n.key)
		}
		const tainted = new Map<string, string>()
		for (const key of sources) tainted.set(key, key)
		const queue = [...sources]
		for (const e of doc.edges) {
			const from = doc.nodes.find((n) => n.key === e.from)
			const path = e.fromPort.split('.')
			// An inlet's settings document, whole or its `annex`.
			const carries = path[0] === 'session' && (path.length === 1 || path[1] === 'annex')
			if (from?.kind === 'inlet' && carries && !tainted.has(e.to)) {
				tainted.set(e.to, e.from)
				queue.push(e.to)
			}
		}
		const warned = new Set<string>()
		while (queue.length) {
			const key = queue.shift()!
			const origin = tainted.get(key)!
			if (buildsPrompt(key) && !warned.has(origin)) {
				warned.add(origin)
				f.push({
					law: 'R60',
					severity: 'warning',
					nodeKey: origin,
					message: `'${origin}' carries the whole session annex into a prompt ('${key}') — every value, secrets included`,
					fix: "read the annex with view: 'ai' (and the speaker) so the prompt carries only what the model may see",
				})
			}
			for (const e of doc.edges)
				if (e.from === key && !tainted.has(e.to)) {
					tainted.set(e.to, origin)
					queue.push(e.to)
				}
		}
	}

	// ── R-7 P2 — one owner per setting per spec ───────────────────────────────
	//
	// Keyed on `FieldDecl.shared` (refined 2026-09-16, plans/30 U3b; was keyed
	// on a same-named field under the same label, 2026-09-15). A definition
	// says which of its `params` fields are the SAME setting wherever two of
	// it run side by side — the lore lanes' scan depth, the embed pair's
	// switch — by marking them `shared: true`; the executor resolves a marked
	// field at the owner a `slot.params({ node })` names and an unmarked one at
	// the node itself, and the panel renders them the same way. So the defect
	// P2 names — the panel showing "Scan depth" three times, a person tuning
	// one not tuning the others — is exactly two nodes that each OWN a params
	// slot (neither references the other) and both declare a `shared` field
	// under one name. A field left unmarked is the node's own by declaration:
	// four `assemble` steps in one run each declaring `postHistoryDepth`, the
	// three relationship reads each declaring `maxEntries`, are several
	// settings that happen to share a spelling, and take no part. Nor does a
	// node whose `params` is a reference — it is not an owner.
	//
	// ⚠ Shipped specs must trip this NOWHERE (the app pins that in
	// `paramsSlotWiring.test.ts`), and there is no `distinct` escape any more:
	// the declaration is where two same-named fields are told apart, and a
	// `shared` field that is genuinely two settings on two nodes is a
	// declaration error, not a spec annotation.
	const sharedOwners: Array<{ key: string; fields: Set<string> }> = []
	for (const n of doc.nodes) {
		const d = desc(n.key)
		const paramsSlot = Object.entries((d?.slots ?? {}) as Record<string, SlotDecl>).find(
			([name, decl]) => name === 'params' && decl.kind === 'parameters',
		)
		if (!paramsSlot) continue
		const wired = n.config['params']
		if (!isSlotRef(wired)) continue
		const ref = wired as SlotRef
		const target = n.resolvedRefs?.['params'] ?? ref.ofNode
		const schema = (paramsSlot[1].schema ?? {}) as Record<string, { shared?: boolean }>
		const shared = new Set(
			Object.entries(schema)
				.filter(([, decl]) => decl?.shared === true)
				.map(([name]) => name),
		)
		if (target && target !== n.key) {
			// A reference whose own declaration shares nothing resolves every
			// field at the node's own address — the reference reads as sharing
			// and does not. Said at publish rather than discovered when the
			// owner's tuned value fails to arrive.
			if (!shared.size)
				f.push({
					law: '12 §2 P2',
					severity: 'warning',
					nodeKey: n.key,
					message: `'${n.key}' references '${target}' for params, but its definition marks no field shared — every field resolves at '${n.key}' and the reference changes nothing`,
					fix: `mark the fields the two nodes hold in common with shared: true on the definition, or wire params: slot.params()`,
				})
			continue // a reference, not an owner
		}
		if (shared.size) sharedOwners.push({ key: n.key, fields: shared })
	}
	for (let i = 0; i < sharedOwners.length; i++) {
		for (let j = i + 1; j < sharedOwners.length; j++) {
			const a = sharedOwners[i]!
			const b = sharedOwners[j]!
			const both = [...a.fields].filter((name) => b.fields.has(name))
			if (!both.length) continue
			f.push({
				law: '12 §2 P2',
				severity: 'warning',
				nodeKey: b.key,
				message:
					`'${a.key}' and '${b.key}' both own a params slot declaring the shared ${both
						.map((name) => `'${name}'`)
						.join(', ')} — two addresses for one setting`,
				fix: `make one the owner and give the other params: slot.params({ node: '${a.key}' })`,
			})
		}
	}

	// ── F36 — every hook invocation is bounded ────────────────────────────────
	for (const n of doc.nodes) {
		if (n.kind === 'inlet') continue
		const d = desc(n.key)
		if (d && d.timeoutMs === undefined) {
			f.push({
				law: 'F36',
				severity: 'warning',
				nodeKey: n.key,
				message: `type '${n.definitionId}@${n.definitionVersion}' declares no timeout`,
				fix: 'declare timeoutMs on the descriptor; the instance ceiling applies regardless, but an explicit default is what stops a stuck hook running to the ceiling',
			})
		}
	}

	// ── Author presets (12 §3a) ───────────────────────────────────────────────
	for (const p of doc.presets ?? []) {
		for (const v of p.values) {
			const node = byKey.get(v.nodeKey)
			if (!node) {
				f.push({
					law: '12 §3a',
					severity: 'error',
					message: `preset '${p.slug}' sets '${v.slot}' on unknown node '${v.nodeKey}'`,
					fix: `name a node this spec declares (${[...byKey.keys()].join(', ')}), or remove the entry — a preset row that matches no node is silently dead config`,
				})
				continue
			}
			const d = desc(v.nodeKey)
			// Slots are declared by the type, so a preset writing an undeclared slot is
			// the same class of mistake as a typo'd node key: it resolves to nothing and
			// the user sees the preset "not working" with no error anywhere. The
			// substrate's `settings` counts as declared where the substrate declares
			// it (R-9): on an optional or gated node, and nowhere else.
			const declared =
				!!d?.slots?.[v.slot] || (v.slot === 'settings' && d && !!settingsSlotFor(d))
			if (d && !declared && v.slot !== 'connection') {
				f.push({
					law: '12 §3a',
					severity: 'error',
					nodeKey: v.nodeKey,
					message: `preset '${p.slug}' sets slot '${v.slot}' on '${v.nodeKey}', which declares ${Object.keys(d.slots ?? {}).join(', ') || 'no slots'}`,
					fix: `set a slot the type declares, or add '${v.slot}' to the descriptor if the node should accept it`,
				})
			}
			if (v.slot === 'connection') {
				f.push({
					law: '12 §4',
					severity: 'error',
					nodeKey: v.nodeKey,
					message: `preset '${p.slug}' sets a connection`,
					fix: 'an author preset may not pin compute or credentials — the admin cascade works because connection has no writable scope below instance. Ship the behaviour (prompts, params, template) and let the admin choose the connection',
				})
			}
			// A template value carries its own engine, so a bare string is ambiguous the
			// moment more than one engine is registered (src/engines.ts).
			if (
				v.slot === 'template' &&
				(typeof v.value !== 'object' || !(v.value as any)?.engine)
			) {
				f.push({
					law: '12 §3a',
					severity: 'error',
					nodeKey: v.nodeKey,
					message: `preset '${p.slug}' sets a template on '${v.nodeKey}' with no engine`,
					fix: 'wrap it: jinja(source), text(source), or yourEngine(source) — the engine travels on the value so a slot can say what it is written in',
				})
			}
		}
	}

	// ── Toggleable requires shape transparency ────────────────────────────────
	for (const n of doc.nodes) {
		const d = desc(n.key)
		if (!d?.toggleable) continue
		const outs = Object.values(d.ports.out ?? {})
		const ins = Object.values(d.ports.in ?? {})
		const transparent = outs.some((o) => ins.some((i) => assignable(o, i) || assignable(i, o)))
		if (!transparent) {
			f.push({
				law: '01 §14',
				severity: 'error',
				nodeKey: n.key,
				message: `'${n.key}' declares toggleable but its output is not assignable to its input`,
				fix: 'only shape-transparent nodes may be switched off; otherwise turning it off breaks everything downstream',
			})
		}
	}

	// ── capability declarations ───────────────────────────────────────────────
	//
	// Checked HERE and not by `satisfies`, because at publish time there is no
	// connection to satisfy — the document may be imported onto an instance whose
	// connections nobody has created yet. What is checkable statically is whether
	// the declaration itself is coherent, and every one of these is a mistake that
	// would otherwise surface as a slot that silently never matches anything.
	for (const n of doc.nodes) {
		const d = getDefinition(`${n.definitionId}@${n.definitionVersion}`)
		for (const [slotName, decl] of Object.entries(d?.slots ?? {})) {
			// The substrate's slot, authored (R-9). `register` refuses this at
			// declaration; the mirror here catches a descriptor that reached
			// the registry by another door — a row adopted from an install, a
			// declaration patched after registration — before a document is
			// published against it.
			if (slotName === 'settings' || decl.kind === 'settings') {
				f.push({
					law: 'R-9',
					severity: 'error',
					nodeKey: n.key,
					message: `'${n.key}' is bound to ${d!.id}, which authors slot '${slotName}'${decl.kind === 'settings' ? " with kind 'settings'" : ''}`,
					fix: `'settings' is the substrate's slot — \`enabled\` on an optional node, \`review\` on a gated one — declared by the projection, never by an author; name the slot for what it holds ('parameters' for tunables)`,
				})
				continue
			}
			const requires = decl.requires ?? []
			const optional = decl.optional ?? []
			if (!requires.length && !optional.length) continue

			if (decl.kind !== 'connection') {
				f.push({
					law: 'capabilities',
					severity: 'error',
					nodeKey: n.key,
					message: `'${n.key}.${slotName}' declares capabilities but is a ${decl.kind} slot`,
					fix: 'capabilities describe a connection; declare them on the connection slot that resolves it',
				})
				continue
			}

			for (const id of [...requires, ...optional]) {
				if (isKnownCapability(id)) continue

				// A transform built from known kinds but written in the wrong
				// ORDER is a different mistake from a typo, and telling them
				// apart is the difference between a one-word fix and a hunt.
				// `image+audio->video` and `audio+image->video` name one
				// capability, but only the canonical spelling is what
				// `transformId()` ever produces — so the other matches nothing,
				// forever, and the node's requirement is unsatisfiable by any
				// connection however capable.
				const canonical = isTransformId(id) ? canonicalise(id) : undefined
				f.push({
					law: 'capabilities',
					severity: 'error',
					nodeKey: n.key,
					message: canonical
						? `'${n.key}.${slotName}' spells the capability '${id}' non-canonically`
						: `'${n.key}.${slotName}' names an unknown capability '${id}'`,
					fix: canonical
						? `write it as '${canonical}' — kinds are ordered by IO_KINDS (text, image, audio, video, document, embedding), and only that spelling is ever matched`
						: `use a declared transform (e.g. 'text->image') or feature (${FEATURES.join(', ')})`,
				})
			}

			// Both at once is not a stricter requirement, it is a contradiction:
			// `requires` guarantees presence, `optional` obliges the binding to
			// handle absence. One of the two branches would be unreachable.
			const both = requires.filter((r) => optional.includes(r))
			for (const id of both) {
				f.push({
					law: 'capabilities',
					severity: 'error',
					nodeKey: n.key,
					message: `'${n.key}.${slotName}' lists ${capabilityLabel(id)} as both required and optional`,
					fix: 'pick one — required means the run fails without it; optional means the binding handles its absence',
				})
			}
		}
	}

	// ── T1 — a template fits where it is rendered (typed templates P5) ─────────
	// Collisions and forbidden kinds in a template node's scope, a band with
	// no variable, and — given the checker — every template source the
	// document carries against the typed scope of the slot it fills.
	f.push(...templateLawFindings(doc, options.templates))

	// ── streaming step + step status (lair pass B3/B18, D6/D5, 2026-09-27) ──
	f.push(...streamingStepFindings(doc))

	return f
}

/**
 * The streaming step and the step status, as declared on `expose` (lair
 * pass B3/B18; owner D6 and D5, 2026-09-27).
 *
 * Which oracle streams into the reply is **declared**, never inferred: the
 * inference it replaced skipped every oracle inside a clause and streamed the
 * Lair's planner JSON into the row. What a declaration can still get wrong is
 * refused here, each with the fix:
 *
 *  · **a JSON step never streams** — a step whose `main` out-port is not a
 *    streaming shape (`generate-json`, whose `main` is `core:shape/json@1`)
 *    would write its document into the row a person is reading;
 *  · **one per execution path** — a run has one live row, and two streams
 *    interleave or concatenate into it. Two steps that can never run in the
 *    same execution may each stream (W2, 2026-09-27): they sit in different
 *    branches of one junction whose predicates are mutually exclusive — one
 *    is the `otherwise`, or both are `equals` on the same path with different
 *    literals. The runtime streams whichever one runs. Anything weaker (a
 *    `truthy`, an `equalsPath`, two different paths) could fire both, so it
 *    is refused, and so is a step on the spine beside one in a branch;
 *  · **never in an each or a loop** — the step would stream once per pass
 *    into the same row;
 *  · **an oracle** — only an oracle has a model's tokens to stream.
 *
 * A step status is display text (R-20).
 * @internal
 */
export function streamingStepFindings(doc: SpecDocument): Finding[] {
	const f: Finding[] = []
	const LAW = 'streaming step'
	const clauseById = new Map(doc.clauses.map((c) => [c.id, c]))
	const repeatingClause = (clauseId: string | undefined): string | undefined => {
		const seen = new Set<string>()
		for (let id = clauseId; id && !seen.has(id); ) {
			seen.add(id)
			const c = clauseById.get(id)
			if (!c) return undefined
			if (c.kind === 'each' || c.kind === 'loop') return c.id
			id = c.clauseId
		}
		return undefined
	}

	const streaming = doc.nodes.filter((n) => n.expose?.stream === true)
	for (const n of streaming) {
		if (n.kind !== 'oracle') {
			f.push({
				law: LAW,
				severity: 'error',
				nodeKey: n.key,
				message: `'${n.key}' is declared the streaming step, but it is a ${n.kind} — only an oracle has a model's tokens to stream`,
				fix: 'move `expose: { stream: true }` to the oracle that writes the reply\'s prose',
			})
			continue
		}
		const def = getDefinition(`${n.definitionId}@${n.definitionVersion}`)
		const out = def?.ports.out ?? {}
		// Judged on `main`, what the step IS: `generate-json` also publishes
		// the raw `text` it parsed as a text stream, for diagnosis, and that
		// port does not make its answer prose.
		const streams = out.main !== undefined && isStreaming(out.main)
		if (def && !streams) {
			const json = out.main === JSON_SHAPE
			f.push({
				law: LAW,
				severity: 'error',
				nodeKey: n.key,
				message: json
					? `'${n.key}' (${n.definitionId}) is declared the streaming step, but it answers in JSON — a JSON step never streams into a row (D6)`
					: `'${n.key}' (${n.definitionId}) is declared the streaming step, but its main out-port does not stream`,
				fix:
					'declare `expose: { stream: true }` on the step that writes the prose (a `core:oracle/generate-text` oracle), ' +
					'or on none — a spec that streams nothing shows its step status until the write lands',
			})
		}
		const repeat = repeatingClause(n.clauseId)
		if (repeat)
			f.push({
				law: LAW,
				severity: 'error',
				nodeKey: n.key,
				message: `'${n.key}' is declared the streaming step inside '${repeat}', which repeats — every pass would stream into the same row`,
				fix: 'stream a step outside the each or loop, or none; the repeated step\'s text reaches the row at the write',
			})
	}
	// Pairwise: every two streaming steps must be provably exclusive. A set
	// whose every pair is exclusive can never run two in one execution.
	const reported = new Set<string>()
	for (let i = 0; i < streaming.length; i++)
		for (let j = i + 1; j < streaming.length; j++) {
			const a = streaming[i]!
			const b = streaming[j]!
			if (reported.has(b.key) || exclusiveSteps(clauseById, a, b)) continue
			reported.add(b.key)
			f.push({
				law: LAW,
				severity: 'error',
				nodeKey: b.key,
				message: `'${a.key}' and '${b.key}' are both declared the streaming step on the same execution path — a run has one live row, and at most one streaming step may run in any one execution`,
				fix:
					'keep `expose: { stream: true }` on the step whose text is the reply, and give the others a `status` instead — ' +
					'two may each stream only from mutually exclusive branches of one junction (an `otherwise`, or `equals` on the same path with different values)',
			})
		}

	for (const n of doc.nodes) {
		const status = n.expose?.status
		if (status === undefined) continue
		for (const message of i18nFindings(status, `'${n.key}' expose.status`))
			f.push({
				law: 'R-20',
				severity: 'error',
				nodeKey: n.key,
				message,
				fix: "write the step status a person reads while it runs — a string ('Planning the turn') or a locale map with 'en'",
			})
	}
	return f
}

type ClauseLike = SpecDocument['clauses'][number] & { branches?: Record<string, JunctionPredicateLike> }
type JunctionPredicateLike = { path?: string; equals?: unknown; equalsPath?: string; truthy?: boolean; default?: boolean }

/**
 * Whether `a` always runs after `b` has finished (F7's "after, not beside").
 *
 * A level — the spine, or one chain of one clause — runs its items one at a
 * time in position order; only a clause's chains may run side by side. So
 * `a` follows `b` exactly when, at the innermost level both sit in, the item
 * holding `a` is positioned after the item holding `b`. Two branches of one
 * clause meet at that clause's own position, and are never ordered.
 */
function runsStrictlyAfter(
	doc: SpecDocument,
	a: { clauseId?: string; clauseChain?: string; position: number },
	b: { clauseId?: string; clauseChain?: string; position: number },
): boolean {
	const clauseById = new Map(doc.clauses.map((c) => [c.id, c]))
	// Every level a node sits in, innermost first, with the position of the
	// item there that holds it.
	const levels = (n: { clauseId?: string; clauseChain?: string; position: number }) => {
		const out: Array<{ level: string; position: number }> = []
		let at: { clauseId?: string; clauseChain?: string; position: number } | undefined = n
		const seen = new Set<string>()
		while (at) {
			out.push({ level: `${at.clauseId ?? ''}\u0000${at.clauseChain ?? ''}`, position: at.position })
			if (!at.clauseId || seen.has(at.clauseId)) break
			seen.add(at.clauseId)
			at = clauseById.get(at.clauseId)
		}
		return out
	}
	const bAt = new Map(levels(b).map((l) => [l.level, l.position]))
	for (const l of levels(a)) {
		const other = bAt.get(l.level)
		if (other !== undefined) return l.position > other
	}
	return false
}

/**
 * Whether two nodes can never run in the same execution (W2): they diverge
 * in two branches of one junction whose predicates cannot both fire.
 * Conservative — anything not provably exclusive is the same path.
 */
function exclusiveSteps(
	clauseById: ReadonlyMap<string, SpecDocument['clauses'][number]>,
	a: { clauseId?: string; clauseChain?: string },
	b: { clauseId?: string; clauseChain?: string },
): boolean {
	// Each node's ancestry, innermost first, as (clause, chain) pairs.
	const ancestry = (n: { clauseId?: string; clauseChain?: string }) => {
		const out: Array<{ clause: string; chain: string | undefined }> = []
		const seen = new Set<string>()
		for (let id = n.clauseId, chain = n.clauseChain; id && !seen.has(id); ) {
			seen.add(id)
			out.push({ clause: id, chain })
			const c = clauseById.get(id)
			if (!c) break
			id = c.clauseId
			chain = c.clauseChain
		}
		return out
	}
	const bChains = new Map(ancestry(b).map((x) => [x.clause, x.chain]))
	// The innermost clause both sit in is where they diverge, if they do.
	for (const { clause, chain } of ancestry(a)) {
		if (!bChains.has(clause)) continue
		const other = bChains.get(clause)
		if (chain === other) return false
		const c = clauseById.get(clause) as ClauseLike | undefined
		if (!c || c.kind !== 'junction' || chain === undefined || other === undefined) return false
		const p = c.branches?.[chain]
		const q = c.branches?.[other]
		return !!p && !!q && exclusivePredicates(p, q)
	}
	return false
}

/** Two junction predicates that can never both fire. */
function exclusivePredicates(p: JunctionPredicateLike, q: JunctionPredicateLike): boolean {
	// `otherwise` fires exactly when nothing else did.
	if (p.default === true || q.default === true) return p.default !== q.default
	const onlyEquals = (x: JunctionPredicateLike) =>
		'equals' in x && x.equalsPath === undefined && x.truthy === undefined
	if (!onlyEquals(p) || !onlyEquals(q)) return false
	if ((p.path ?? '') !== (q.path ?? '')) return false
	return JSON.stringify(p.equals) !== JSON.stringify(q.equals)
}

/**
 * A capability id core or a plugin has actually declared.
 *
 * Transforms are checked structurally rather than against `TRANSFORMS`, because
 * that table names the ones core ships and a plugin may legitimately introduce
 * another — `image+audio->video` is not core's business but it is well-formed.
 * A feature, by contrast, is a closed set: it names a mechanism something has to
 * implement, so an unrecognised one is always a typo.
 *
 * ⚠ "Structurally" used to mean `!!lhs && !!rhs`, which passed `'text->tex'`,
 * `'txet->text'` and `'->'` — every typo this check exists to catch, since the
 * ones it did catch were already impossible to write. The real structure is
 * that both sides are non-empty lists of KNOWN kinds in CANONICAL order, which
 * is exactly "the id round-trips through `parseTransform` and back". That
 * rejects an unknown kind, a misspelled one, an empty side and `image+text->text`
 * (whose canonical spelling is `text+image->text`, so two ids would name one
 * capability and only one of them would ever match) — while still admitting
 * `image+audio->video`, because the plugin escape hatch above is the point.
 *
 * There is no registry of plugin-declared transforms to consult here: `validate`
 * reads a spec document, not an instance, so a set-membership test would have to
 * be `TRANSFORMS` alone and would close the door this docblock holds open. With
 * `tf()` emitting canonical spellings by construction, this is the runtime
 * backstop for hand-written strings rather than a check anything trips over.
 */
function isKnownCapability(id: CapabilityId): boolean {
	if (isTransformId(id)) return canonicalise(id) === id
	return (FEATURES as readonly string[]).includes(id)
}

/**
 * The canonical spelling of a transform id, or `undefined` if it is not one.
 *
 * `undefined` covers an empty side and any kind this build does not know —
 * neither of which has a canonical form to suggest, because there is nothing to
 * reorder. A mis-ORDERED id, by contrast, round-trips to a different string,
 * and that string is the fix.
 */
function canonicalise(id: TransformId): TransformId | undefined {
	const t = parseTransform(id)
	if (!t.in.length || !t.out.length) return undefined
	const known = (k: string) => (IO_KINDS as readonly string[]).includes(k)
	if (!t.in.every(known) || !t.out.every(known)) return undefined
	return transformId(t)
}

function reaches(doc: SpecDocument, from: string, to: string, seen = new Set<string>()): boolean {
	if (from === to) return true
	if (seen.has(from)) return false
	seen.add(from)
	return doc.edges.filter((e) => e.from === from).some((e) => reaches(doc, e.to, to, seen))
}

/** @experimental */
export function assertValid(doc: SpecDocument, options?: ValidateOptions): void {
	const errs = validate(doc, options).filter((x) => x.severity === 'error')
	if (errs.length) {
		throw new Error(
			'spec validation failed:\n' +
				errs.map((e) => `  [${e.law}] ${e.message}\n    → ${e.fix}`).join('\n'),
		)
	}
}

/**
 * The R-20 findings over one stored document: presets, and the genre
 * declaration a create pipeline carries. Read as `unknown` throughout — a
 * document may have come from anywhere — so a wrong shape is a sentence,
 * never a throw.
 * @experimental
 */
export function documentDisplayTextFindings(doc: SpecDocument): string[] {
	const out: string[] = []
	const presets = (doc as { presets?: unknown }).presets
	if (Array.isArray(presets))
		presets.forEach((p, i) => {
			const preset = p as { slug?: unknown; label?: unknown; description?: unknown } | null
			const at = `presets[${typeof preset?.slug === 'string' ? preset.slug : i}]`
			out.push(...i18nFindings(preset?.label, `${at}.label`, { required: true }))
			out.push(...i18nFindings(preset?.description, `${at}.description`))
		})
	const genre = (doc.genre as Record<string, unknown> | undefined) ?? undefined
	if (genre && typeof genre === 'object') {
		out.push(...i18nFindings(genre.name, 'genre.name', { required: true }))
		out.push(...i18nFindings(genre.description, 'genre.description'))
		const shape = genre.shape as { fields?: unknown; panels?: unknown } | undefined
		if (shape && typeof shape === 'object') {
			out.push(...settingsSchemaFindings(shape.fields, 'genre.shape.fields'))
			out.push(...widgetDeclsFindings(shape.panels, 'genre.shape.panels'))
		}
		if (Array.isArray(genre.envoys))
			genre.envoys.forEach((e, i) => {
				const envoy = e as { key?: unknown; name?: unknown; description?: unknown } | null
				const at = `genre.envoys[${typeof envoy?.key === 'string' ? envoy.key : i}]`
				out.push(...i18nFindings(envoy?.name, `${at}.name`, { required: true }))
				out.push(...i18nFindings(envoy?.description, `${at}.description`))
			})
	}
	return out
}
