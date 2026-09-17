/**
 * Validation — the Fixed Ledger laws that can be checked statically.
 *
 * Every finding names what to do instead (15 §1.3). A prohibition without a stated
 * alternative is a bug, and there is a test asserting exactly that.
 */

import type { SpecDocument } from './document.js'
import { settingsSlotFor } from './settingsSlot.js'
import {
	ANSWER_FORM_OUTLET_ID,
	FORM_ADDRESSED_INLET_ID,
	getDefinition,
	isBuiltInOutlet,
	isBuiltInSpec,
	reviewFieldsFinding,
	type SlotDecl,
} from './descriptors.js'
import { actionDocumentFindings } from './actions.js'
import { isSlotRef, type SlotRef } from './refs.js'
import { assignable, isStreaming } from './shapes.js'
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

export interface Finding {
	law: string
	severity: 'error' | 'warning'
	nodeKey?: string
	message: string
	/** What to do instead — required for every error. */
	fix: string
}

export function validate(doc: SpecDocument): Finding[] {
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

	// ── F7 — one primary row; emits unlimited ─────────────────────────────────
	//
	// "One primary write" restated as **one primary row** (09-B B4, R-17): a
	// write that UPDATES the row an earlier write in this document created —
	// its `target` fed by an edge from a write-class outlet — is the same
	// row, not a second one. That is the reply's own shape: a placeholder
	// outlet after the inlet, filled at the end. Two independent writes are
	// still two rows, and still refused.
	const writes = doc.nodes.filter(
		(n) => n.kind === 'outlet' && desc(n.key)?.effects === 'write',
	)
	const writeKeys = new Set(writes.map((w) => w.key))
	const rows = writes.filter(
		(w) =>
			!doc.edges.some(
				(e) =>
					e.to === w.key && e.toPort.split('.')[0] === 'target' && writeKeys.has(e.from),
			),
	)
	if (rows.length > 1) {
		f.push({
			law: 'F7',
			severity: 'error',
			nodeKey: rows[1]!.key,
			message: `a pipeline has at most one primary row; found ${rows.length} (${rows.map((w) => w.key).join(', ')})`,
			fix: 'keep one write-class .outlet() per row — an update whose target is an earlier write in this document is the same row; emit-class outlets are unlimited, or trigger a second pipeline via the event a write causes',
		})
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
		if (!assignable(outShape, inShape)) {
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
	// the spec's own namespace, a localised label ─────────────────────────────
	//
	// The builder refuses these at construction; a document from any other
	// source (an import, a hand-written JSON) gets the same answer here, and the
	// `triggers` alias is read through the same fold. Two actions of one spec
	// claiming one slash name for two different functions is a collision the
	// namespace rule cannot prevent — refused as such.
	for (const finding of actionDocumentFindings(doc)) {
		f.push({
			law: 'R-15',
			severity: 'error',
			message: finding,
			fix: 'declare the action as `contributes.actions[]` describes — see the SDK\'s actions.ts',
		})
	}

	// ── Clauses: no write-class outlets inside (01 §4) ────────────────────────
	for (const n of doc.nodes) {
		if (!n.clauseId) continue
		if (n.kind === 'outlet' && desc(n.key)?.effects === 'write') {
			f.push({
				law: '01 §4',
				severity: 'error',
				nodeKey: n.key,
				message: `write-class outlet '${n.key}' is inside ${n.clauseKind} clause '${n.clauseId}'`,
				fix: 'move the write onto the spine after the clause completes — concurrent writes make ordering observable and break the equivalence law (F26)',
			})
		}
	}

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
			const stated = ['equals', 'truthy', 'default'].filter((k) => p[k] !== undefined)
			if (p.default) defaults++
			if (stated.length !== 1) {
				f.push({
					law: '20 §10',
					severity: 'error',
					message: `junction '${b.id}' branch '${chain}' states ${stated.length || 'no'} conditions`,
					fix: 'exactly one of equals / truthy / default per branch — a richer decision belongs in a Task the junction reads',
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

	// ── A write inside a repeating clause would write N times (F7, 01 §4) ─────
	for (const n of doc.nodes) {
		if (n.kind !== 'outlet' || desc(n.key)?.effects !== 'write') continue
		const repeating = repeats(n.clauseId)
		if (!repeating) continue
		f.push({
			law: 'F7',
			severity: 'error',
			nodeKey: n.key,
			message: `write-class outlet '${n.key}' is inside ${clauseById.get(repeating)!.kind} '${repeating}'`,
			fix: 'move the write onto the spine after the clause completes — one primary write per pipeline is one transaction, and a repeated write is neither',
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
				fix: 'only core emits events, from its own actions. A write causes the event its outlet declares; a pipeline answers an event through its inlet lock (24 §4)',
			})
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
	// four `assemble` stages in one run each declaring `postHistoryDepth`, the
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

	return f
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

export function assertValid(doc: SpecDocument): void {
	const errs = validate(doc).filter((x) => x.severity === 'error')
	if (errs.length) {
		throw new Error(
			'spec validation failed:\n' +
				errs.map((e) => `  [${e.law}] ${e.message}\n    → ${e.fix}`).join('\n'),
		)
	}
}
