/**
 * The session layout contract (session layout v2 §2, §7).
 *
 * P1 is a **public contract**: a plugin declares widgets and looks against it,
 * the CLI validates a shipped layout with it and the app's stage is nothing but
 * a renderer for `resolve`'s answer. So the claims under test here are the ones
 * a consumer is entitled to rely on, and most of them are properties rather
 * than examples — a hand-picked document proves a document, and what matters is
 * that the ops are honest over *every* document.
 *
 * `fast-check` is not a dependency of this workspace and adding one to the SDK
 * for a test would be the wrong trade, so the generator below is a seeded
 * `mulberry32` and a document builder. Seeded, so a failure is reproducible
 * from the seed printed in the assertion.
 *
 * The legacy read is `layout.legacy.test.ts`, beside this.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	BREAKPOINTS,
	BREAKPOINT_ORDER,
	MIN_WIDGET_PX,
	REFERENCE_BOXES,
	TWELFTHS,
	materialiseShares,
	tidyZone,
	ZONE_IDS,
	breakpointFor,
	checkSizes,
	effectiveZones,
	extentToCss,
	layoutOps,
	trackCount,
	lookCssVar,
	resolve,
	servingVariant,
	validateLayoutDoc,
	type Breakpoint,
	type Extent,
	type LayoutDecls,
	type LayoutDoc,
	type SideZone,
	type Unit,
	type Zone,
} from '@serene-pub/sdk'
import { ADVENTURE_LAYOUT_V2, CORE_LOOKS, CORE_WIDGETS } from '@serene-pub/core-catalog'

const DECLS: LayoutDecls = { widgets: CORE_WIDGETS, looks: CORE_LOOKS }
/** No widget declarations, so rule 2 has no primary to place — pure geometry. */
const LOOKS_ONLY: LayoutDecls = { looks: CORE_LOOKS }

// ── a seeded generator, in place of fast-check ──────────────────────────────

function rng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * A document with unknown look keys, unknown unit kinds and unknown top-level
 * keys sprinkled through it — which is the shape `resolve` promises to be total
 * over, because that is what a document written by a newer build looks like.
 */
function genDoc(seed: number): LayoutDoc {
	const r = rng(seed)
	const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
	const extent = (): Extent =>
		pick<Extent>([
			'grow',
			'fit',
			{ cells: int(1, 6) },
			{ min: int(1, 3) },
			{ min: 1, max: int(2, 5) },
			// A weighted grow, so the properties below hold over mixed axes too.
			{ grow: int(1, 12) },
		])
	let n = 0

	const zone = (): Zone => {
		const rows = Array.from({ length: int(1, 3) }, extent)
		const cols = Array.from({ length: int(1, 3) }, extent)
		const taken = new Set<string>()
		const units: Unit[] = []
		for (let i = 0; i < int(0, 4); i++) {
			const rs = int(1, rows.length)
			const cs = int(1, cols.length)
			const rsp = int(1, rows.length - rs + 1)
			const csp = int(1, cols.length - cs + 1)
			const cells: string[] = []
			for (let rr = rs; rr < rs + rsp; rr++) for (let cc = cs; cc < cs + csp; cc++) cells.push(`${rr},${cc}`)
			if (cells.some((c) => taken.has(c))) continue
			for (const c of cells) taken.add(c)
			const key = `u${n++}`
			const base = {
				key,
				row: { start: rs, span: rsp },
				col: { start: cs, span: csp },
				...(r() < 0.3 ? { pinned: false } : {}),
				...(r() < 0.2 ? { priority: int(0, 99) } : {}),
				...(r() < 0.25 ? { look: { glass: true, [`undeclared${n}`]: 1 } } : {}),
			}
			const kind = pick(['widget', 'widget', 'widget', 'group', 'spacer', 'orb'])
			if (kind === 'widget')
				units.push({ ...base, kind: 'widget', widget: pick(['messages', 'stats', 'inventory', 'map']) })
			else if (kind === 'group')
				units.push({
					...base,
					kind: 'group',
					members: [
						{ widget: 'stats', key: `${key}.a` },
						{ widget: 'map', key: `${key}.b` },
					],
				})
			else if (kind === 'spacer') units.push({ ...base, kind: 'spacer' })
			// An unknown kind, carrying a key nothing in this build reads.
			else units.push({ ...base, kind: 'orb', glyph: '?' } as unknown as Unit)
		}
		return { rows, cols, units, ...(r() < 0.3 ? { look: { gap: int(0, 20), notADeclaredLook: 'x' } } : {}) }
	}

	const side = (): SideZone => ({
		...zone(),
		...(r() < 0.5 ? { pinned: false } : {}),
		...(r() < 0.4 ? { width: { cells: int(4, 10) } } : {}),
	})

	const doc: LayoutDoc = {
		version: 2,
		zones: {
			...(r() < 0.6 ? { left: side() } : {}),
			middle: zone(),
			...(r() < 0.6 ? { right: side() } : {}),
		},
		...(r() < 0.4 ? { look: { cell: int(40, 64), alsoUndeclared: 'x' } } : {}),
	}

	// A variant is a zone re-laid in one column, which is what the phone editor
	// writes and the only variant shape worth generating.
	const variants: Record<string, Record<string, Zone>> = {}
	for (const bp of BREAKPOINT_ORDER) {
		if (r() >= 0.25) continue
		const patch: Record<string, Zone> = {}
		for (const id of ZONE_IDS) {
			const z = (doc.zones as Record<string, Zone | undefined>)[id]
			if (!z || r() >= 0.7) continue
			const order = [...z.units].sort(() => r() - 0.5)
			patch[id] = {
				rows: order.length ? order.map(() => 'grow' as Extent) : ['grow'],
				cols: ['grow'],
				units: order.map((u, i) => ({ ...u, row: { start: i + 1, span: 1 }, col: { start: 1, span: 1 } })),
			}
		}
		if (Object.keys(patch).length) variants[bp] = patch
	}
	if (Object.keys(variants).length) doc.variants = variants as LayoutDoc['variants']
	// An additive key a newer build wrote. It never bumps `version`.
	;(doc as unknown as Record<string, unknown>).somethingFromTheFuture = { a: 1 }
	return doc
}

const DOCS = Array.from({ length: 120 }, (_, i) => ({ seed: i + 1, doc: genDoc(i + 1) }))

const BOXES = [
	{ width: 320, height: 640 },
	{ width: 390, height: 844 },
	{ width: 640, height: 960 },
	{ width: 900, height: 700 },
	{ width: 1024, height: 768 },
	{ width: 1440, height: 900 },
	{ width: 2560, height: 1440 },
]

const unitsOf = (doc: LayoutDoc): string[] =>
	ZONE_IDS.flatMap((id) => ((doc.zones as Record<string, Zone | undefined>)[id]?.units ?? []).map((u) => u.key))

const presentEverywhere = (doc: LayoutDoc, key: string, decls: LayoutDecls): boolean =>
	BREAKPOINT_ORDER.every((bp) => {
		const r = resolve(doc, REFERENCE_BOXES[bp], decls)
		return ZONE_IDS.some((id) => (r.zones[id]?.units ?? []).some((u) => u.key === key))
	})

// ── the document itself ─────────────────────────────────────────────────────

describe('the layout document', () => {
	test('three zones, four sizes, measured on the session box', () => {
		assert.deepEqual([...ZONE_IDS], ['left', 'middle', 'right'])
		assert.deepEqual(BREAKPOINTS, { compact: 0, cozy: 640, roomy: 1024, wide: 1440 })
		assert.equal(breakpointFor(0), 'compact')
		assert.equal(breakpointFor(639), 'compact')
		assert.equal(breakpointFor(640), 'cozy')
		assert.equal(breakpointFor(1023), 'cozy')
		assert.equal(breakpointFor(1024), 'roomy')
		assert.equal(breakpointFor(1440), 'wide')
		assert.equal(breakpointFor(Number.NaN), 'compact', 'total, for a box nobody measured')
		assert.equal(MIN_WIDGET_PX, 220)
	})

	test('a document round-trips through JSON byte for byte, and resolves identically', () => {
		for (const { seed, doc } of DOCS) {
			const text = JSON.stringify(doc)
			const back = JSON.parse(text) as LayoutDoc
			assert.equal(JSON.stringify(back), text, `seed ${seed}`)
			for (const box of BOXES)
				assert.equal(
					JSON.stringify(resolve(back, box, DECLS)),
					JSON.stringify(resolve(doc, box, DECLS)),
					`seed ${seed} at ${box.width}`,
				)
		}
	})

	test('an extent says what it means, and `cells` is emitted against `--sp-cell`', () => {
		assert.equal(extentToCss('grow'), '1fr')
		assert.equal(extentToCss('fit'), 'auto')
		assert.equal(extentToCss({ cells: 4 }), 'calc(4 * var(--sp-cell))')
		assert.equal(extentToCss({ min: 3 }), 'minmax(calc(3 * var(--sp-cell)), 1fr)')
		assert.equal(extentToCss({ max: 8 }), 'minmax(0, calc(8 * var(--sp-cell)))')
		assert.equal(extentToCss({ min: 3, max: 8 }), 'minmax(calc(3 * var(--sp-cell)), calc(8 * var(--sp-cell)))')
	})

	test('a template is counted paren-aware — one `calc()` track is one track', () => {
		assert.equal(trackCount('1fr'), 1)
		assert.equal(trackCount('calc(4 * var(--sp-cell))'), 1)
		assert.equal(trackCount('auto calc(5 * var(--sp-cell)) 1fr'), 3)
		assert.equal(trackCount('minmax(calc(3 * var(--sp-cell)), 1fr) 8fr'), 2)
		assert.equal(trackCount(''), 0)
		for (const cols of [['grow'], ['grow', { cells: 4 }], [{ min: 3, max: 8 }, 'fit', { grow: 5 }]] as Extent[][])
			assert.equal(trackCount(cols.map(extentToCss).join(' ')), cols.length)
	})
})

// ── validateLayoutDoc ───────────────────────────────────────────────────────

const doc2 = (zones: Partial<LayoutDoc['zones']> & { middle: Zone }, rest: Partial<LayoutDoc> = {}): LayoutDoc => ({
	version: 2,
	zones: zones as LayoutDoc['zones'],
	...rest,
})

const widget = (key: string, row: number, col = 1, span = 1): Unit => ({
	kind: 'widget',
	key,
	widget: key,
	row: { start: row, span: 1 },
	col: { start: col, span },
})

describe('validateLayoutDoc — the rules the type cannot express', () => {
	test('two units may not claim the same cells', () => {
		const v = validateLayoutDoc(
			doc2({
				middle: { rows: ['grow', 'grow'], cols: ['grow'], units: [widget('a', 1), widget('b', 1)] },
			}),
		)
		assert.equal(v.ok, false)
		assert.match(v.errors.join('\n'), /`a` and `b` claim the same cells/)
	})

	test('a position outside the zone’s tracks is an error that names the count', () => {
		const v = validateLayoutDoc(doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [widget('a', 3)] } }))
		assert.equal(v.ok, false)
		assert.match(v.errors.join('\n'), /spans rows 3–3, but the zone has 1 row track/)
	})

	test('an instance key is unique in the document, group members included', () => {
		const v = validateLayoutDoc(
			doc2({
				middle: { rows: ['grow'], cols: ['grow'], units: [widget('a', 1)] },
				right: { rows: ['grow'], cols: ['grow'], units: [widget('a', 1)] },
			}),
		)
		assert.equal(v.ok, false)
		assert.match(v.errors.join('\n'), /`a` is used twice/)

		const members = validateLayoutDoc(
			doc2({
				middle: {
					rows: ['grow', 'grow'],
					cols: ['grow'],
					units: [
						widget('a', 1),
						{
							kind: 'group',
							key: 'g',
							members: [
								{ widget: 'x', key: 'a' },
								{ widget: 'y', key: 'y' },
							],
							row: { start: 2, span: 1 },
							col: { start: 1, span: 1 },
						},
					],
				},
			}),
		)
		assert.equal(members.ok, false, 'a member key is an instance key like any other')
	})

	test('a variant may only name a size, and a variant zone is a whole zone', () => {
		const bad = validateLayoutDoc(
			doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [] } }, {
				variants: { tablet: {} } as unknown as LayoutDoc['variants'],
			}),
		)
		assert.equal(bad.ok, false)
		assert.match(bad.errors.join('\n'), /`tablet`, which is not a size/)

		const partial = validateLayoutDoc(
			doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [] } }, {
				variants: { cozy: { middle: { units: [] } } } as unknown as LayoutDoc['variants'],
			}),
		)
		assert.equal(partial.ok, false, 'the patch granularity is the zone, not a deep merge')
	})

	test('a variant is checked as the LAYER it describes, base zones included', () => {
		// The variant re-places `a` in the right zone while the base still has
		// it in the middle: at that size the key is there twice.
		const v = validateLayoutDoc(
			doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [widget('a', 1)] } }, {
				variants: { cozy: { right: { rows: ['grow'], cols: ['grow'], units: [widget('a', 1)] } } },
			}),
		)
		assert.equal(v.ok, false)
		assert.match(v.errors.join('\n'), /Variant `cozy`/)
	})

	test('an undeclared look key is a WARNING, pruned at reconcile, never fatal', () => {
		const v = validateLayoutDoc(
			doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [] } }, { look: { sparkle: true } }),
			DECLS,
		)
		assert.equal(v.ok, true)
		assert.match(v.warnings.join('\n'), /the look `sparkle` is not declared/)
	})

	test('a look declared for another scope is a warning, not a rejection', () => {
		const v = validateLayoutDoc(
			doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [], look: { cell: 48 } } }),
			DECLS,
		)
		assert.equal(v.ok, true)
		assert.match(v.warnings.join('\n'), /the look `cell` applies to root, not zone/)
	})

	test('an unknown widget id and an unknown kind are warnings — both draw a placeholder', () => {
		const v = validateLayoutDoc(
			doc2({
				middle: {
					rows: ['grow', 'grow'],
					cols: ['grow'],
					units: [
						widget('nobody-ships-this', 1),
						{ kind: 'orb', key: 'o', row: { start: 2, span: 1 }, col: { start: 1, span: 1 } } as unknown as Unit,
					],
				},
			}),
			DECLS,
		)
		assert.equal(v.ok, true, 'uninstalling a plugin must not strand a layout')
		assert.match(v.warnings.join('\n'), /`nobody-ships-this` is not a widget this build knows/)
		assert.match(v.warnings.join('\n'), /kind `orb`, which draws a labelled placeholder/)
	})

	test('total: junk is refused with a sentence rather than a throw', () => {
		for (const junk of [undefined, null, 7, 'nope', [], { version: 1 }, { version: 2 }])
			assert.equal(validateLayoutDoc(junk).ok, false)
	})

	test('every generated document is valid — the op properties below rest on it', () => {
		for (const { seed, doc } of DOCS) {
			const v = validateLayoutDoc(doc, DECLS)
			assert.equal(v.ok, true, `seed ${seed}: ${v.errors.join(' / ')}`)
		}
	})
})

// ── resolve ─────────────────────────────────────────────────────────────────

const AREA = /^\d+ \/ \d+ \/ \d+ \/ \d+$/

describe('resolve', () => {
	test('total over every generated document at every box, unknown keys and kinds included', () => {
		for (const { seed, doc } of DOCS)
			for (const box of BOXES) {
				const r = resolve(doc, box, DECLS)
				assert.equal(r.breakpoint, breakpointFor(box.width), `seed ${seed}`)
				assert.deepEqual(Object.keys(r.zones).sort(), ['left', 'middle', 'right'])
				for (const id of ZONE_IDS) {
					const zone = r.zones[id]
					if (!zone) continue
					assert.ok(zone.gridTemplateRows.length, `seed ${seed} ${id} rows`)
					assert.ok(zone.gridTemplateColumns.length, `seed ${seed} ${id} cols`)
					for (const u of zone.units) assert.match(u.area, AREA, `seed ${seed} ${id} ${u.key}`)
				}
			}
	})

	test('total with no declarations at all — a host may resolve before the catalogue loads', () => {
		for (const { doc } of DOCS.slice(0, 20)) for (const box of BOXES) resolve(doc, box)
	})

	test('rule 1 — the nearest CUSTOMIZED variant at or above the box serves the smaller sizes', () => {
		const right: Zone = { rows: ['grow', 'grow', 'grow'], cols: ['grow'], units: [widget('a', 1), widget('b', 2), widget('c', 3)] }
		const flipped: Zone = { rows: ['grow', 'grow', 'grow'], cols: ['grow'], units: [widget('c', 1), widget('b', 2), widget('a', 3)] }
		const doc = doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] }, right }, {
			variants: { roomy: { right: flipped } },
		})
		assert.equal(servingVariant(doc, 'compact'), 'roomy')
		assert.equal(servingVariant(doc, 'cozy'), 'roomy')
		assert.equal(servingVariant(doc, 'roomy'), 'roomy')
		assert.equal(servingVariant(doc, 'wide'), null, 'nothing below the base ever reaches upward')

		const orderAt = (bp: Breakpoint) =>
			[...(resolve(doc, REFERENCE_BOXES[bp], DECLS).zones.right?.units ?? [])]
				.sort((x, y) => Number(x.area.split(' / ')[0]) - Number(y.area.split(' / ')[0]))
				.map((u) => u.key)
		assert.deepEqual(orderAt('compact'), ['c', 'b', 'a'])
		assert.deepEqual(orderAt('cozy'), ['c', 'b', 'a'])
		assert.deepEqual(orderAt('roomy'), ['c', 'b', 'a'])
		assert.deepEqual(orderAt('wide'), ['a', 'b', 'c'], 'the desktop keeps the base')
		assert.deepEqual(effectiveZones(doc, 'wide').right, right)
	})

	test('rule 2 — the middle is never empty: the primary widget lands there', () => {
		const empty = resolve(doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [] } }), REFERENCE_BOXES.wide, DECLS)
		assert.deepEqual(empty.zones.middle?.units.map((u) => u.key), ['messages'])
		assert.equal(empty.zones.middle?.gridTemplateRows, '1fr')

		// Placed nowhere, but the middle has other units: appended, not swapped.
		const busy = resolve(
			doc2({ middle: { rows: ['fit'], cols: ['grow'], units: [widget('world-state', 1)] } }),
			REFERENCE_BOXES.wide,
			DECLS,
		)
		assert.deepEqual(busy.zones.middle?.units.map((u) => u.key), ['world-state', 'messages'])
		assert.equal(busy.zones.middle?.gridTemplateRows, 'auto 1fr')

		// Placed in a side: it is not duplicated into the middle.
		const elsewhere = resolve(
			doc2({
				middle: { rows: ['grow'], cols: ['grow'], units: [] },
				right: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] },
			}),
			REFERENCE_BOXES.wide,
			DECLS,
		)
		assert.deepEqual(elsewhere.zones.middle?.units.map((u) => u.key), [])
		assert.deepEqual(elsewhere.zones.right?.units.map((u) => u.key), ['messages'])
	})

	test('rule 3 — below roomy the sides are sheets and the middle is the page', () => {
		const doc = doc2({
			left: { rows: ['grow'], cols: ['grow'], units: [widget('lore', 1)] },
			middle: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] },
			right: { rows: ['grow'], cols: ['grow'], units: [widget('stats', 1)] },
		})
		for (const bp of ['compact', 'cozy'] as const) {
			const r = resolve(doc, REFERENCE_BOXES[bp], DECLS)
			assert.equal(r.zones.left?.state, 'sheet', bp)
			assert.equal(r.zones.right?.state, 'sheet', bp)
			assert.equal(r.zones.middle?.state, 'docked', bp)
		}
		for (const bp of ['roomy', 'wide'] as const) {
			const r = resolve(doc, REFERENCE_BOXES[bp], DECLS)
			assert.equal(r.zones.left?.state, 'docked', bp)
			assert.equal(r.zones.right?.state, 'docked', bp)
		}
	})

	test('rule 3 — a folded zone is ONE column in row-major reading order', () => {
		const doc = doc2({
			middle: {
				rows: ['grow', 'grow'],
				cols: ['grow', 'grow'],
				units: [widget('br', 2, 2), widget('tl', 1, 1), widget('bl', 2, 1), widget('tr', 1, 2)],
			},
		})
		const r = resolve(doc, REFERENCE_BOXES.compact, LOOKS_ONLY)
		assert.equal(r.zones.middle?.gridTemplateColumns, '1fr')
		assert.deepEqual(r.zones.middle?.units.map((u) => u.key), ['tl', 'tr', 'bl', 'br'])
		assert.deepEqual(
			r.zones.middle?.units.map((u) => u.area),
			['1 / 1 / 2 / 2', '2 / 1 / 3 / 2', '3 / 1 / 4 / 2', '4 / 1 / 5 / 2'],
		)
		// The desktop is untouched by the fold — it is a rendering, not an edit.
		const wide = resolve(doc, REFERENCE_BOXES.wide, LOOKS_ONLY)
		assert.equal(wide.zones.middle?.gridTemplateColumns, '1fr 1fr')
	})

	test('rule 3 — `fit` and `cells` extents survive the fold, `grow` rows share', () => {
		const doc = doc2({
			middle: {
				rows: ['fit', { cells: 5 }, 'grow'],
				cols: ['grow'],
				units: [widget('a', 1), widget('b', 2), widget('c', 3)],
			},
		})
		assert.equal(
			resolve(doc, REFERENCE_BOXES.compact, LOOKS_ONLY).zones.middle?.gridTemplateRows,
			'auto calc(5 * var(--sp-cell)) 1fr',
		)
	})

	test('rule 4 — a unit below its declared minimum applies its fold, lowest priority first', () => {
		const decls: LayoutDecls = {
			looks: CORE_LOOKS,
			widgets: [
				{ id: 'messages', title: 'Messages', component: 'm', role: 'primary', priority: 0, fold: 'shrink', cells: { minW: 14 } },
				{ id: 'map', title: 'Map', component: 'x', priority: 20, fold: 'hide', cells: { minW: 14 } },
			],
		}
		const doc = doc2({
			middle: {
				rows: ['grow'],
				cols: ['grow', 'grow'],
				units: [widget('messages', 1, 1), widget('map', 1, 2)],
			},
		})
		// Roomy, two columns: two 14-cell (616px) minimums cannot both be met.
		const r = resolve(doc, { width: 1024, height: 768 }, decls)
		const byKey = new Map((r.zones.middle?.units ?? []).map((u) => [u.key, u]))
		assert.equal(byKey.get('map')?.hidden, true, 'the lower priority yields first')
		assert.equal(byKey.get('map')?.fold, 'hide')
		assert.equal(byKey.get('messages')?.hidden, undefined, 'the primary is never folded away')

		// Wide enough for both: nothing folds.
		const roomy = resolve(doc, { width: 2560, height: 1440 }, decls)
		for (const u of roomy.zones.middle?.units ?? []) assert.equal(u.fold, undefined)
	})

	test('rule 5 — an unpinned side is a rail, and an unpinned unit in a docked side is an icon', () => {
		const rail = resolve(
			doc2({
				middle: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] },
				left: { rows: ['grow'], cols: ['grow'], units: [widget('lore', 1)], pinned: false },
			}),
			REFERENCE_BOXES.wide,
			DECLS,
		)
		assert.equal(rail.zones.left?.state, 'rail')
		assert.equal(rail.zones.left?.units[0]?.rail, true)

		const docked = resolve(
			doc2({
				middle: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] },
				right: {
					rows: ['grow', 'grow'],
					cols: ['grow'],
					units: [widget('stats', 1), { ...widget('inventory', 2), pinned: false }],
				},
			}),
			REFERENCE_BOXES.wide,
			DECLS,
		)
		assert.equal(docked.zones.right?.state, 'docked')
		const icons = (docked.zones.right?.units ?? []).filter((u) => u.rail).map((u) => u.key)
		assert.deepEqual(icons, ['inventory'])
	})

	test('a side with nothing in it is hidden, so a declared-but-empty rail costs no width', () => {
		const r = resolve(
			doc2({
				middle: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] },
				left: { rows: ['grow'], cols: ['grow'], units: [], pinned: false },
			}),
			REFERENCE_BOXES.wide,
			DECLS,
		)
		assert.equal(r.zones.left?.state, 'hidden')
	})

	test('rule 6 — structural looks become the template values, the rest become variables', () => {
		const r = resolve(
			doc2({ middle: { rows: [{ cells: 2 }], cols: ['grow'], units: [widget('messages', 1)], look: { gap: 4 } } }, {
				look: { cell: 48, glass: true },
			}),
			REFERENCE_BOXES.wide,
			DECLS,
		)
		assert.equal(r.vars['--sp-cell'], '3rem', 'the cell module follows the reader’s zoom')
		assert.equal(r.vars['--sp-gap'], '12px')
		assert.equal(r.vars['--sp-look-glass'], '1')
		assert.equal(r.vars['--sp-look-headerRow'], '1', 'a declared default is emitted at root')
		assert.equal(r.zones.middle?.vars['--sp-gap'], '4px', 'a zone emits deviations only')
		assert.equal(r.zones.middle?.vars['--sp-look-headerRow'], undefined)
		assert.equal(r.zones.middle?.gridTemplateRows, 'calc(2 * var(--sp-cell))')
	})

	test('a look’s CSS variable is its declaration’s, and a plugin key is made ident-safe', () => {
		assert.equal(lookCssVar(CORE_LOOKS.find((l) => l.key === 'cell')!), '--sp-cell')
		assert.equal(
			lookCssVar({ key: 'acme.sparkle', field: { type: 'boolean' }, appliesTo: ['unit'] }),
			'--sp-look-acme-sparkle',
		)
	})
})

// ── layoutOps ───────────────────────────────────────────────────────────────

const OPS = [
	'place',
	'remove',
	'moveToLine',
	'joinRow',
	'splitRow',
	'setSpan',
	'setTrackExtent',
	'addTrack',
	'removeTrack',
	'setPinned',
	'group',
	'ungroup',
	'reorderMembers',
	'setLook',
	'customizeVariant',
	'resetVariant',
	'reorderFolded',
	'promoteOrder',
	'tidy',
] as const

const sample = (): LayoutDoc =>
	doc2({
		middle: { rows: ['fit', 'grow'], cols: ['grow'], units: [widget('world-state', 1), widget('messages', 2)] },
		right: {
			rows: ['grow', 'grow', 'grow'],
			cols: ['grow'],
			units: [widget('scene-portraits', 1), widget('stats', 2), widget('inventory', 3)],
		},
	})

describe('layoutOps', () => {
	test('every operation §2.6 names exists', () => {
		for (const name of OPS) assert.equal(typeof (layoutOps as Record<string, unknown>)[name], 'function', name)
	})

	test('every op returns its INPUT BY REFERENCE when it changes nothing', () => {
		const doc = sample()
		const withVariant = layoutOps.customizeVariant(doc, { breakpoint: 'cozy' }).doc
		const noops: Array<[string, { doc: LayoutDoc; refused?: string }]> = [
			['place (already placed)', layoutOps.place(doc, { widget: 'stats', key: 'stats', target: 'base' }, DECLS)],
			['remove (absent)', layoutOps.remove(doc, { key: 'nothing', target: 'base' }, DECLS)],
			['moveToLine (already there)', layoutOps.moveToLine(doc, { key: 'stats', row: 2, col: 1, target: 'base' }, DECLS)],
			['joinRow (onto itself)', layoutOps.joinRow(doc, { key: 'stats', ontoKey: 'stats', target: 'base' }, DECLS)],
			['splitRow (absent)', layoutOps.splitRow(doc, { key: 'nothing', target: 'base' }, DECLS)],
			['setSpan (same span)', layoutOps.setSpan(doc, { key: 'stats', axis: 'col', span: 1, target: 'base' }, DECLS)],
			[
				'setTrackExtent (same extent)',
				layoutOps.setTrackExtent(doc, { zone: 'middle', axis: 'row', index: 2, extent: 'grow', target: 'base' }, DECLS),
			],
			['addTrack (no such zone)', layoutOps.addTrack(doc, { zone: 'left', axis: 'row', target: 'base' }, DECLS)],
			['removeTrack (the last column)', layoutOps.removeTrack(doc, { zone: 'middle', axis: 'col', index: 1, target: 'base' }, DECLS)],
			['setPinned (already pinned)', layoutOps.setPinned(doc, { key: 'stats', pinned: true, target: 'base' }, DECLS)],
			['group (one member)', layoutOps.group(doc, { keys: ['stats'], target: 'base' }, DECLS)],
			['ungroup (not a group)', layoutOps.ungroup(doc, { key: 'stats', target: 'base' }, DECLS)],
			['reorderMembers (not a group)', layoutOps.reorderMembers(doc, { key: 'stats', order: [], target: 'base' }, DECLS)],
			['setLook (same value)', layoutOps.setLook(doc, { scope: 'root', look: 'glass', value: undefined, target: 'base' }, DECLS)],
			['customizeVariant (already customized)', layoutOps.customizeVariant(withVariant, { breakpoint: 'cozy' }, DECLS)],
			['resetVariant (not customized)', layoutOps.resetVariant(doc, { breakpoint: 'wide' }, DECLS)],
			[
				'reorderFolded (the order it has)',
				layoutOps.reorderFolded(withVariant, { zone: 'right', order: ['scene-portraits', 'stats', 'inventory'], target: 'cozy' }, DECLS),
			],
			['promoteOrder (nothing to promote)', layoutOps.promoteOrder(doc, { breakpoint: 'wide' }, DECLS)],
			['tidy (already tidy)', layoutOps.tidy(doc, { zone: 'right', target: 'base' }, DECLS)],
		]
		for (const [what, result] of noops)
			assert.ok(
				result.doc === doc || result.doc === withVariant,
				`${what} must return its input by reference (refused: ${result.refused ?? 'no'})`,
			)
	})

	test('a refusal carries the input and one sentence', () => {
		const doc = sample()
		const r = layoutOps.removeTrack(doc, { zone: 'middle', axis: 'row', index: 1, target: 'base' }, DECLS)
		assert.equal(r.doc, doc)
		assert.match(r.refused ?? '', /world-state is the only thing in row 1|`world-state` is the only thing in row 1/)
	})

	test('an op never stores a document validateLayoutDoc would reject', () => {
		const doc = sample()
		// Moving a unit onto another’s cells is an overlap, so it refuses.
		const r = layoutOps.moveToLine(doc, { key: 'stats', row: 1, col: 1, zone: 'right', target: 'base' }, DECLS)
		assert.equal(r.doc, doc)
		assert.ok(r.refused)
	})

	test('§5.5 — reorderFolded on ANY size leaves the base byte-identical', () => {
		for (const { seed, doc } of DOCS) {
			const base = JSON.stringify(doc.zones)
			for (const bp of BREAKPOINT_ORDER)
				for (const id of ZONE_IDS) {
					const zone = (effectiveZones(doc, bp) as Record<string, Zone | undefined>)[id]
					if (!zone) continue
					const order = [...zone.units].map((u) => u.key).reverse()
					const r = layoutOps.reorderFolded(doc, { zone: id, order, target: bp }, DECLS)
					assert.equal(JSON.stringify(r.doc.zones), base, `seed ${seed} ${bp} ${id}`)
				}
		}
	})

	test('§5.5 — reorderFolded refuses the base outright, and points at promoteOrder', () => {
		const doc = sample()
		const r = layoutOps.reorderFolded(
			doc,
			{ zone: 'right', order: ['stats'], target: 'base' as unknown as Breakpoint },
			DECLS,
		)
		assert.equal(r.doc, doc)
		assert.match(r.refused ?? '', /promoteOrder/)
	})

	test('§5.5 — place with a SIZE target changes the base, and every size sees the widget', () => {
		const doc = layoutOps.customizeVariant(sample(), { breakpoint: 'cozy' }, DECLS).doc
		const before = unitsOf(doc)
		const r = layoutOps.place(doc, { widget: 'inventory', key: 'inventory-2', target: 'cozy' }, DECLS)
		assert.ok(!r.refused, r.refused)
		assert.deepEqual(unitsOf(r.doc), [...before, 'inventory-2'], 'membership is size-neutral')
		assert.ok(presentEverywhere(r.doc, 'inventory-2', DECLS), 'a widget added on the train is there on the desk')
	})

	test('§5.5 — remove with a SIZE target takes it off every size', () => {
		const doc = layoutOps.customizeVariant(sample(), { breakpoint: 'compact' }, DECLS).doc
		const r = layoutOps.remove(doc, { key: 'stats', target: 'compact' }, DECLS)
		assert.ok(!r.refused, r.refused)
		assert.ok(!unitsOf(r.doc).includes('stats'))
		for (const bp of BREAKPOINT_ORDER) {
			const res = resolve(r.doc, REFERENCE_BOXES[bp], DECLS)
			const keys = ZONE_IDS.flatMap((id) => (res.zones[id]?.units ?? []).map((u) => u.key))
			assert.ok(!keys.includes('stats'), bp)
		}
	})

	test('§5.5 — setPinned with a SIZE target pins on every size', () => {
		const doc = layoutOps.customizeVariant(sample(), { breakpoint: 'cozy' }, DECLS).doc
		const r = layoutOps.setPinned(doc, { key: 'stats', pinned: false, target: 'cozy' }, DECLS)
		assert.ok(!r.refused, r.refused)
		const pinnedIn = (zones: Record<string, Zone | undefined>) =>
			zones.right?.units.find((u) => u.key === 'stats')?.pinned
		assert.equal(pinnedIn(r.doc.zones as Record<string, Zone | undefined>), false, 'the base')
		for (const bp of BREAKPOINT_ORDER)
			assert.equal(
				pinnedIn(effectiveZones(r.doc, bp) as Record<string, Zone | undefined>),
				false,
				`${bp} sees the same pin`,
			)
	})

	test('setPinned never stores `true` — absent IS pinned, so a pinned doc stays byte-identical', () => {
		const doc = sample()
		const off = layoutOps.setPinned(doc, { key: 'stats', pinned: false, target: 'base' }, DECLS).doc
		const on = layoutOps.setPinned(off, { key: 'stats', pinned: true, target: 'base' }, DECLS).doc
		assert.equal(JSON.stringify(on), JSON.stringify(doc))
	})

	test('§5.5 — promoteOrder succeeds iff every affected zone has ONE column at the base', () => {
		for (const { seed, doc } of DOCS) {
			const bp = BREAKPOINT_ORDER[seed % 4]!
			const customized = layoutOps.customizeVariant(doc, { breakpoint: bp }, DECLS).doc
			if (customized === doc) continue
			const patch = customized.variants![bp]!
			const affected = ZONE_IDS.filter((id) => (patch as Record<string, Zone | undefined>)[id])
			const allSingle = affected.every(
				(id) => (((doc.zones as Record<string, Zone | undefined>)[id]?.cols?.length ?? 1) === 1),
			)
			const r = layoutOps.promoteOrder(customized, { breakpoint: bp }, DECLS)
			assert.equal(!r.refused, allSingle, `seed ${seed} ${bp}: ${r.refused ?? 'accepted'}`)
		}
	})

	test('§5.5 — a refused promotion names the size and the units side by side', () => {
		const doc = doc2({
			middle: {
				rows: ['grow'],
				cols: ['grow', 'grow'],
				units: [widget('messages', 1, 1), widget('map', 1, 2)],
			},
		})
		const customized = layoutOps.customizeVariant(doc, { breakpoint: 'cozy' }, DECLS).doc
		const r = layoutOps.promoteOrder(customized, { breakpoint: 'cozy' }, DECLS)
		assert.equal(r.doc, customized)
		assert.equal(r.refused, 'Wide has messages beside map; apply the order there from a desktop.')
	})

	test('§5.5 — a promoted order folds back to the same order at that size', () => {
		const doc = layoutOps.customizeVariant(sample(), { breakpoint: 'cozy' }, DECLS).doc
		const order = ['inventory', 'scene-portraits', 'stats']
		const reordered = layoutOps.reorderFolded(doc, { zone: 'right', order, target: 'cozy' }, DECLS).doc
		const promoted = layoutOps.promoteOrder(reordered, { breakpoint: 'cozy' }, DECLS)
		assert.ok(!promoted.refused, promoted.refused)
		const foldedAt = (bp: Breakpoint) =>
			(resolve(promoted.doc, REFERENCE_BOXES[bp], DECLS).zones.right?.units ?? []).map((u) => u.key)
		assert.deepEqual(foldedAt('cozy'), order, 'the same order, now from the base')
		assert.deepEqual(foldedAt('compact'), order, 'and every size below it')
		assert.deepEqual(
			(promoted.doc.zones.right?.units ?? []).map((u) => u.key),
			order,
			'the base carries it now',
		)
	})

	test('customizeVariant then resetVariant is the identity', () => {
		for (const { seed, doc } of DOCS.slice(0, 40))
			for (const bp of BREAKPOINT_ORDER) {
				if (doc.variants?.[bp]) continue
				const on = layoutOps.customizeVariant(doc, { breakpoint: bp }, DECLS).doc
				const off = layoutOps.resetVariant(on, { breakpoint: bp }, DECLS).doc
				assert.equal(JSON.stringify(off), JSON.stringify(doc), `seed ${seed} ${bp}`)
			}
	})

	test('a positional op with a SIZE target writes the variant and never the base', () => {
		const doc = sample()
		const base = JSON.stringify(doc.zones)
		const r = layoutOps.setTrackExtent(
			doc,
			{ zone: 'right', axis: 'row', index: 1, extent: { cells: 8 }, target: 'compact' },
			DECLS,
		)
		assert.ok(!r.refused, r.refused)
		assert.equal(JSON.stringify(r.doc.zones), base)
		assert.deepEqual(r.doc.variants?.compact?.right?.rows?.[0], { cells: 8 })
	})

	test('group and ungroup are membership, so they land on every customized size too', () => {
		const doc = layoutOps.customizeVariant(sample(), { breakpoint: 'cozy' }, DECLS).doc
		const grouped = layoutOps.group(doc, { keys: ['stats', 'inventory'], key: 'g:party', target: 'base' }, DECLS)
		assert.ok(!grouped.refused, grouped.refused)
		for (const zones of [grouped.doc.zones, grouped.doc.variants!.cozy!])
			assert.ok(
				(zones as Record<string, Zone | undefined>).right!.units.some((u) => u.key === 'g:party'),
				'both layers',
			)
		const back = layoutOps.ungroup(grouped.doc, { key: 'g:party', target: 'base' }, DECLS)
		assert.ok(!back.refused, back.refused)
		assert.ok(unitsOf(back.doc).includes('stats') && unitsOf(back.doc).includes('inventory'))
	})
})

// ── the weighted grow, and tidy ─────────────────────────────────────────────

describe('a weighted grow — `{ grow: n }`', () => {
	test('a share is n twelfths, emitted as `nfr`; a bare grow is still 1fr', () => {
		assert.equal(TWELFTHS, 12)
		assert.equal(extentToCss({ grow: 8 }), '8fr')
		assert.equal(extentToCss({ grow: 4 }), '4fr')
		assert.equal(extentToCss('grow'), '1fr')
	})

	test('a share is a whole number of twelfths, at least one', () => {
		for (const bad of [0, -3, 1.5])
			assert.match(
				validateLayoutDoc(doc2({ middle: { rows: ['grow'], cols: [{ grow: bad }], units: [] } })).errors.join('\n'),
				/a share is a whole number of twelfths, at least 1/,
				String(bad),
			)
		assert.equal(validateLayoutDoc(doc2({ middle: { rows: ['grow'], cols: [{ grow: 8 }, { grow: 4 }], units: [] } })).ok, true)
	})

	test('"Map beside Messages at 8 and 4 of 12" is a document', () => {
		const doc = doc2({
			middle: {
				rows: ['grow'],
				cols: [{ grow: 8 }, { grow: 4 }],
				units: [widget('messages', 1, 1), widget('map', 1, 2)],
			},
		})
		assert.deepEqual(validateLayoutDoc(doc, DECLS).errors, [])
		assert.equal(resolve(doc, REFERENCE_BOXES.wide, DECLS).zones.middle?.gridTemplateColumns, '8fr 4fr')
	})

	test('shares divide the remainder in proportion, not equally', () => {
		// The one place the weight has to be read rather than emitted: an 8/4
		// split puts the minimum-width check on two thirds and one third.
		const decls: LayoutDecls = {
			looks: CORE_LOOKS,
			widgets: [{ id: 'map', title: 'Map', component: 'x', fold: 'hide', cells: { minW: 8 } }],
		}
		const doc = doc2({
			middle: { rows: ['grow'], cols: [{ grow: 11 }, { grow: 1 }], units: [widget('a', 1, 1), widget('map', 1, 2)] },
		})
		const r = resolve(doc, { width: 1440, height: 900 }, decls)
		assert.equal(r.zones.middle?.units.find((u) => u.key === 'map')?.hidden, true, 'one twelfth is not 8 cells')
	})

	test('materialiseShares gives every bare grow a share summing to twelve', () => {
		assert.deepEqual(materialiseShares(['grow', 'grow']), [{ grow: 6 }, { grow: 6 }])
		assert.deepEqual(materialiseShares(['grow', 'grow', 'grow']), [{ grow: 4 }, { grow: 4 }, { grow: 4 }])
		assert.deepEqual(materialiseShares(['grow', 'grow', 'grow', 'grow', 'grow']), [
			{ grow: 3 },
			{ grow: 3 },
			{ grow: 2 },
			{ grow: 2 },
			{ grow: 2 },
		])
		assert.deepEqual(materialiseShares([{ grow: 9 }, 'grow']), [{ grow: 9 }, { grow: 3 }], 'declared shares keep their number')
		assert.deepEqual(materialiseShares([{ cells: 6 }, 'grow', 'grow']), [{ cells: 6 }, { grow: 6 }, { grow: 6 }], 'a fixed track holds no share')
	})

	test('one grow track is already the whole of the share — nothing is written', () => {
		assert.deepEqual(materialiseShares(['grow']), ['grow'])
		assert.deepEqual(materialiseShares([{ cells: 4 }, 'grow']), [{ cells: 4 }, 'grow'])
		assert.deepEqual(materialiseShares([{ cells: 4 }]), [{ cells: 4 }])
	})

	test('joinRow materialises the axis and splits the host\u2019s one track in two', () => {
		const doc = sample()
		const r = layoutOps.joinRow(doc, { key: 'world-state', ontoKey: 'messages', target: 'base' }, DECLS)
		assert.ok(!r.refused, r.refused)
		const middle = r.doc.zones.middle
		assert.deepEqual(middle.cols, [{ grow: 6 }, { grow: 6 }], 'half the host\u2019s twelve each')
		assert.deepEqual(
			middle.units.map((u) => [u.key, u.row.start, u.col.start, u.col.span]),
			[
				['messages', 1, 1, 1],
				['world-state', 1, 2, 1],
			],
			'and the row the joiner came from is gone',
		)
		assert.deepEqual(middle.rows, ['grow'])
	})

	test('joinRow refuses a fixed column rather than tidying away the space somebody asked for', () => {
		const doc = doc2({
			middle: {
				rows: ['grow', 'grow'],
				cols: [{ cells: 6 }],
				units: [widget('messages', 1), widget('map', 2)],
			},
		})
		const r = layoutOps.joinRow(doc, { key: 'map', ontoKey: 'messages', target: 'base' }, DECLS)
		assert.equal(r.doc, doc)
		assert.match(r.refused ?? '', /sits in a fixed column/)
	})

	test('setSpan materialises the axis it changes', () => {
		const doc = doc2({
			middle: {
				rows: ['grow'],
				cols: ['grow', 'grow', 'grow'],
				units: [widget('messages', 1, 1), widget('map', 1, 3)],
			},
		})
		const r = layoutOps.setSpan(doc, { key: 'messages', axis: 'col', span: 2, target: 'base' }, DECLS)
		assert.ok(!r.refused, r.refused)
		assert.deepEqual(r.doc.zones.middle.cols, [{ grow: 4 }, { grow: 4 }, { grow: 4 }])
	})
})

describe('tidy — the inverse of the gestures', () => {
	test('a row no unit covers is dropped, and everything below shifts up', () => {
		const zone: Zone = {
			rows: ['fit', { cells: 5 }, 'grow'],
			cols: ['grow'],
			units: [widget('a', 1), widget('c', 3)],
		}
		tidyZone(zone)
		assert.deepEqual(zone.rows, ['fit', 'grow'])
		assert.deepEqual(zone.units.map((u) => [u.key, u.row.start]), [
			['a', 1],
			['c', 2],
		])
	})

	test('a unit left alone in its row band reclaims the full width', () => {
		const zone: Zone = {
			rows: ['grow', 'grow'],
			cols: [{ grow: 8 }, { grow: 4 }],
			units: [widget('a', 1, 1), widget('b', 1, 2), widget('lonely', 2, 1)],
		}
		tidyZone(zone)
		assert.deepEqual(zone.units.find((u) => u.key === 'lonely')!.col, { start: 1, span: 2 })
		assert.deepEqual(zone.units.find((u) => u.key === 'a')!.col, { start: 1, span: 1 }, 'a shared row keeps its split')
	})

	test('a column split nobody is using collapses back to one track', () => {
		const zone: Zone = { rows: ['grow'], cols: [{ grow: 8 }, { grow: 4 }], units: [widget('a', 1, 1)] }
		tidyZone(zone)
		assert.deepEqual(zone.cols, ['grow'])
		assert.deepEqual(zone.units[0]!.col, { start: 1, span: 1 })
	})

	test('columns the author sized in cells are reserved space, not a leftover', () => {
		const zone: Zone = { rows: ['grow'], cols: [{ cells: 6 }, 'grow'], units: [widget('a', 1, 1, 2)] }
		tidyZone(zone)
		assert.deepEqual(zone.cols, [{ cells: 6 }, 'grow'])
	})

	test('a zone with nothing in it keeps its tracks', () => {
		const zone: Zone = { rows: ['fit', 'grow'], cols: ['grow', 'grow'], units: [] }
		tidyZone(zone)
		assert.deepEqual(zone.rows, ['fit', 'grow'])
		assert.deepEqual(zone.cols, ['grow', 'grow'])
	})

	test('remove runs it: taking the joiner away gives the host its width back', () => {
		const doc = doc2({
			middle: {
				rows: ['grow', 'grow'],
				cols: [{ grow: 8 }, { grow: 4 }],
				units: [widget('messages', 1, 1), widget('map', 1, 2), widget('world-state', 2, 1, 2)],
			},
		})
		const r = layoutOps.remove(doc, { key: 'map', target: 'base' }, DECLS)
		assert.ok(!r.refused, r.refused)
		assert.deepEqual(r.doc.zones.middle.cols, ['grow'])
		assert.deepEqual(r.doc.zones.middle.units.map((u) => [u.key, u.col.start, u.col.span]), [
			['messages', 1, 1],
			['world-state', 1, 1],
		])
	})

	test('moveToLine runs it: the row a unit left behind goes with it', () => {
		const doc = doc2({
			middle: { rows: ['grow', 'grow', 'grow'], cols: ['grow'], units: [widget('a', 1), widget('b', 2), widget('c', 3)] },
			right: { rows: ['grow'], cols: ['grow'], units: [widget('stats', 1)] },
		})
		const r = layoutOps.moveToLine(doc, { key: 'b', zone: 'right', row: 1, col: 1, target: 'base' }, DECLS)
		// `stats` is already in right row 1, so this one is refused on overlap —
		// which is itself the claim that tidy never rescues an invalid result.
		assert.equal(r.doc, doc)
		assert.ok(r.refused)

		const away = layoutOps.moveToLine(doc, { key: 'b', row: 3, col: 1, target: 'base' }, DECLS)
		assert.ok(away.refused, 'row 3 is taken too')

		const gone = layoutOps.remove(doc, { key: 'b', target: 'base' }, DECLS)
		assert.deepEqual(gone.doc.zones.middle.rows, ['grow', 'grow'])
		assert.deepEqual(gone.doc.zones.middle.units.map((u) => [u.key, u.row.start]), [
			['a', 1],
			['c', 2],
		])
	})

	test('splitting a row that holds one unit is a no-op, because tidy undoes it', () => {
		const doc = doc2({ middle: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] } })
		assert.equal(layoutOps.splitRow(doc, { key: 'messages', target: 'base' }, DECLS).doc, doc)
	})
})

// ── checkSizes ──────────────────────────────────────────────────────────────

describe('checkSizes', () => {
	test('total over every generated document, four sizes each', () => {
		for (const { seed, doc } of DOCS) {
			const f = checkSizes(doc, DECLS)
			assert.deepEqual(Object.keys(f).sort(), ['compact', 'cozy', 'roomy', 'wide'], `seed ${seed}`)
			for (const bp of BREAKPOINT_ORDER)
				for (const finding of f[bp]) {
					assert.equal(finding.breakpoint, bp)
					assert.ok(finding.message.length, `seed ${seed}`)
				}
		}
	})

	test('the fold below roomy is the contract, not a finding', () => {
		const doc = doc2({
			middle: { rows: ['grow'], cols: ['grow'], units: [widget('messages', 1)] },
			right: { rows: ['grow', 'grow'], cols: ['grow'], units: [widget('stats', 1), widget('inventory', 2)] },
		})
		const f = checkSizes(doc, DECLS)
		assert.deepEqual(f.compact, [], 'every side is a sheet down here; saying so helps nobody')
		assert.deepEqual(f.cozy, [])
	})

	test('a unit below its minimum is a finding that says what the fold will do', () => {
		const decls: LayoutDecls = {
			looks: CORE_LOOKS,
			widgets: [
				{ id: 'messages', title: 'Messages', component: 'm', role: 'primary', priority: 0, fold: 'shrink' },
				{ id: 'map', title: 'Map', component: 'x', priority: 20, fold: 'scroll', cells: { minW: 18 } },
			],
		}
		const doc = doc2({
			middle: {
				rows: ['grow'],
				cols: ['grow', 'grow'],
				units: [widget('messages', 1, 1), widget('map', 1, 2)],
			},
		})
		const f = checkSizes(doc, decls)
		assert.ok(f.wide.some((x) => x.kind === 'below-minimum' && x.key === 'map'))
		assert.match(f.wide.find((x) => x.key === 'map')!.message, /Wide: map is below its declared minimum, it will scroll\./)
	})
})

// ── the shipped Adventure document ──────────────────────────────────────────

describe('the Adventure layout document', () => {
	test('validates against core’s looks and widgets', () => {
		const v = validateLayoutDoc(ADVENTURE_LAYOUT_V2.layout, DECLS)
		assert.deepEqual(v.errors, [])
		assert.deepEqual(v.warnings, [])
		assert.equal(v.ok, true)
	})

	test('checks clean at every size — a shipped layout with a finding is a CLI error', () => {
		assert.deepEqual(checkSizes(ADVENTURE_LAYOUT_V2.layout, DECLS), {
			compact: [],
			cozy: [],
			roomy: [],
			wide: [],
		})
	})

	test('§6 — the world above the conversation, the party down the right, the lore on the left', () => {
		const { zones } = ADVENTURE_LAYOUT_V2.layout
		assert.deepEqual(zones.middle.rows, ['fit', 'grow'])
		assert.deepEqual(zones.middle.units.map((u) => u.key), ['world-state', 'messages'])
		// Two rows, not three: R79 removed the Inventory widget for now.
		assert.deepEqual(zones.right?.rows, ['grow', 'grow'])
		assert.deepEqual(zones.right?.units.map((u) => u.key), ['scene-portraits', 'stats'])
		assert.equal(zones.left?.pinned, false)
		assert.deepEqual(ADVENTURE_LAYOUT_V2.widgetSettings, {
			'scene-portraits': { source: 'scene', bars: true },
		})
	})

	test('it draws at all four sizes', () => {
		for (const bp of BREAKPOINT_ORDER) {
			const r = resolve(ADVENTURE_LAYOUT_V2.layout, REFERENCE_BOXES[bp], DECLS)
			assert.equal(r.breakpoint, bp)
			assert.equal(r.zones.middle?.units.length, 2, bp)
			assert.equal(r.zones.right?.units.length, 2, bp)
			assert.equal(r.zones.left?.state, 'hidden', 'the lore rail is declared and empty')
			assert.equal(r.vars['--sp-cell'], '2.75rem')
		}
	})
})
