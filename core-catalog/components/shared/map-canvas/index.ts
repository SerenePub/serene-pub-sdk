/**
 * Core's **map canvas** (PLAN-core-widgets §3.6, W4, 2026-10-11) — the pure
 * half: nodes and edges in, positions out. One renderer for core's map-like
 * widgets — Places (W4) today, Dungeon Crawler's `crawl-map` (W5) when that
 * genre lands — drawn by `MapCanvas.svelte` beside this file. It is a shared
 * control, not a widget: it has no declaration and is imported by the
 * widgets that draw a map.
 *
 * ⚠ Not the lorebook's **Places lens** (the app's own graph canvas): core's
 * components run in the page's UI worker and cannot import the app's
 * Svelte. Two map canvases is a known cost; the lens may adopt this one
 * later, not the reverse.
 *
 * **The layout is its own, not elkjs.** The plan chose elkjs (Q5); it cannot
 * run here. A component's worker carries Remote DOM's DOM polyfill, whose
 * `window` is not the global scope, and elkjs' compiled core reads
 * `window.Math` (and, with no `document`, takes over the worker's
 * `onmessage`); its 1.6 MB would also ride in every clone, and an in-app
 * clone may not import it at all (`COMPONENT_IMPORTS`). So the layout is a
 * small layered one, deterministic for the same input:
 *
 * 1. Each connected group of nodes is laid out in **rings outward** from its
 *    root — the node marked `here` when the group holds it, else the one
 *    with the most edges (the first such, in input order) — by how many
 *    edges away each node is, whichever way the edges run (a map is walked
 *    both ways; an arrow says which way a way reads).
 * 2. Within a ring, nodes are ordered by where their neighbours in the ring
 *    before stand (then the ring after, then before again), ties kept in
 *    the order they were reached.
 * 3. Groups stand side by side in input order of their first node; nodes
 *    with no edge at all stand in rows beneath.
 *
 * Edges run centre to centre, cut at each square's border so an arrowhead
 * touches it; two edges between one pair are drawn apart. An edge whose far
 * end is no node, or one marked `stub`, is a **stub**: a short line out of
 * its node, toward somewhere not drawn (an unseen room's way).
 *
 * The markup draws with plain elements and custom properties only (the host
 * mirrors no SVG): a square is placed by `--sp-map-x` / `--sp-map-y`, an
 * edge by its start, length and angle (`--sp-map-len`, `--sp-map-angle`).
 *
 * 🚧 Provisional with W4; W5 may grow it (a stub's own direction, fuses).
 */

/** A square on the map. @experimental */
export interface MapCanvasNode {
	/** Unique among the nodes; what `onPick` hands back. */
	id: string
	/** The name written on the square. */
	label: string
	/** A tint key (0–5) the skin colours the square by; null or absent is untinted. */
	tint?: number | null
	/** Faces drawn on the square — who stands there — by participant reference (`character:3`). */
	faces?: readonly { ref: string; name: string }[]
	/** Where the scene is: ringed. */
	here?: boolean
	/** Read after the label by a screen reader (who is here, the category). */
	description?: string
}

/** A line between two squares, or a stub out of one. @experimental */
export interface MapCanvasEdge {
	/** Unique among the edges. */
	id: string
	from: string
	/** The far node; one that is no node's id draws a stub out of `from`. */
	to: string
	/** Reads from both ends: an arrowhead at each. */
	bidirectional?: boolean
	/** Written at the line's middle; absent or empty writes nothing. */
	label?: string | null
	/** A way to somewhere not drawn: a short line out of `from` only. */
	stub?: boolean
}

/** A square as placed: its top-left corner and size, its centre, its ring. @experimental */
export interface PlacedMapNode extends MapCanvasNode {
	x: number
	y: number
	w: number
	h: number
	/** Which ring of its group it stands in (0 is the root's); -1 for a node with no edge. */
	ring: number
}

/** A line as placed: where it starts, how long it runs and at what angle (degrees, clockwise from east). @experimental */
export interface PlacedMapEdge {
	id: string
	from: string
	to: string
	x: number
	y: number
	len: number
	angle: number
	bidirectional: boolean
	stub: boolean
	label: string | null
	/** Where its label sits: the line's middle. */
	labelX: number
	labelY: number
}

/** The whole drawing: nodes in focus order (ring by ring, left to right; then the unjoined), edges, its size. @experimental */
export interface MapLayout {
	nodes: PlacedMapNode[]
	edges: PlacedMapEdge[]
	width: number
	height: number
}

/** A square's size and the gaps between them, in the plane's pixels. @experimental */
export const MAP_NODE_W = 120
/** @experimental */
export const MAP_NODE_H = 48
/** @experimental */
export const MAP_GAP_X = 36
/** @experimental */
export const MAP_GAP_Y = 52
/** @experimental */
export const MAP_PAD = 16
/** How far a stub runs out of its square. @experimental */
export const MAP_STUB_LEN = 26
/** How far apart two lines between one pair are drawn. @experimental */
export const MAP_PARALLEL_GAP = 6

/** The zoom steps the canvas offers, smallest first; 1 is the plane's own size. @experimental */
export const MAP_ZOOMS: readonly number[] = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2])

const round = (n: number) => Math.round(n * 10) / 10

/**
 * Lay the map out: every node placed, every edge between two placed nodes
 * cut to their borders, every stub drawn out of its node. Pure and
 * deterministic: the same nodes and edges in the same order lay out the
 * same. A duplicate node id keeps its first; an edge from a node that is not
 * there, or from a node to itself, draws nothing.
 * @experimental
 */
export function layoutMap(
	nodes: readonly MapCanvasNode[],
	edges: readonly MapCanvasEdge[],
): MapLayout {
	const order = new Map<string, number>()
	const list: MapCanvasNode[] = []
	for (const n of nodes)
		if (!order.has(n.id)) {
			order.set(n.id, list.length)
			list.push(n)
		}

	const joins = edges.filter(
		(e) => !e.stub && e.from !== e.to && order.has(e.from) && order.has(e.to),
	)
	const stubs = edges.filter((e) => order.has(e.from) && (e.stub || !order.has(e.to)))

	// Neighbours, either way, each once, in input order.
	const adj = new Map<string, string[]>(list.map((n) => [n.id, []]))
	for (const e of joins) {
		const a = adj.get(e.from)!
		const b = adj.get(e.to)!
		if (!a.includes(e.to)) a.push(e.to)
		if (!b.includes(e.from)) b.push(e.from)
	}
	for (const ns of adj.values()) ns.sort((p, q) => order.get(p)! - order.get(q)!)

	// Groups, each in rings from its root.
	const seen = new Set<string>()
	const groups: string[][][] = []
	const loners: MapCanvasNode[] = []
	for (const start of list) {
		if (seen.has(start.id)) continue
		if (!adj.get(start.id)!.length) {
			seen.add(start.id)
			loners.push(start)
			continue
		}
		// The group's members, to choose its root.
		const members: string[] = []
		const stack = [start.id]
		const inGroup = new Set([start.id])
		while (stack.length) {
			const id = stack.shift()!
			members.push(id)
			for (const nb of adj.get(id)!)
				if (!inGroup.has(nb)) {
					inGroup.add(nb)
					stack.push(nb)
				}
		}
		members.sort((p, q) => order.get(p)! - order.get(q)!)
		const here = members.find((id) => list[order.get(id)!]!.here)
		const root =
			here ??
			members.reduce(
				(best, id) => (adj.get(id)!.length > adj.get(best)!.length ? id : best),
				members[0]!,
			)
		const rings: string[][] = []
		const ringOf = new Map<string, number>([[root, 0]])
		const queue = [root]
		while (queue.length) {
			const id = queue.shift()!
			const r = ringOf.get(id)!
			;(rings[r] ??= []).push(id)
			for (const nb of adj.get(id)!)
				if (!ringOf.has(nb)) {
					ringOf.set(nb, r + 1)
					queue.push(nb)
				}
		}
		for (const id of members) seen.add(id)
		groups.push(orderRings(rings, adj))
	}

	// Place each group: rings top to bottom, each centred on the widest.
	const placed = new Map<string, PlacedMapNode>()
	const focus: string[] = []
	const stepX = MAP_NODE_W + MAP_GAP_X
	const stepY = MAP_NODE_H + MAP_GAP_Y
	let left = MAP_PAD
	let bottom = MAP_PAD
	for (const rings of groups) {
		const widest = Math.max(...rings.map((r) => r.length))
		const groupW = widest * stepX - MAP_GAP_X
		rings.forEach((ring, r) => {
			const ringW = ring.length * stepX - MAP_GAP_X
			const x0 = left + (groupW - ringW) / 2
			ring.forEach((id, i) => {
				const node = list[order.get(id)!]!
				const p: PlacedMapNode = {
					...node,
					x: round(x0 + i * stepX),
					y: round(MAP_PAD + r * stepY),
					w: MAP_NODE_W,
					h: MAP_NODE_H,
					ring: r,
				}
				placed.set(id, p)
				focus.push(id)
			})
		})
		bottom = Math.max(bottom, MAP_PAD + rings.length * stepY - MAP_GAP_Y)
		left += groupW + 2 * MAP_GAP_X
	}
	let width = groups.length ? left - 2 * MAP_GAP_X + MAP_PAD : MAP_PAD * 2

	// The unjoined, in rows beneath: as many to a row as the groups are wide (at least four).
	if (loners.length) {
		const fit = Math.floor((width - 2 * MAP_PAD + MAP_GAP_X) / stepX)
		const perRow = Math.max(Math.min(loners.length, 4), fit)
		const top = groups.length ? bottom + MAP_GAP_Y : MAP_PAD
		loners.forEach((node, i) => {
			const p: PlacedMapNode = {
				...node,
				x: round(MAP_PAD + (i % perRow) * stepX),
				y: round(top + Math.floor(i / perRow) * stepY),
				w: MAP_NODE_W,
				h: MAP_NODE_H,
				ring: -1,
			}
			placed.set(node.id, p)
			focus.push(node.id)
		})
		bottom = top + Math.ceil(loners.length / perRow) * stepY - MAP_GAP_Y
		width = Math.max(width, MAP_PAD * 2 + Math.min(loners.length, perRow) * stepX - MAP_GAP_X)
	}

	// Lines: centre to centre, cut at the borders; a pair's several drawn apart.
	const pairKey = (e: MapCanvasEdge) => [e.from, e.to].sort().join('\u0000')
	const pairs = new Map<string, MapCanvasEdge[]>()
	for (const e of joins) pairs.set(pairKey(e), [...(pairs.get(pairKey(e)) ?? []), e])
	const out: PlacedMapEdge[] = []
	for (const e of joins) {
		const a = placed.get(e.from)!
		const b = placed.get(e.to)!
		const ax = a.x + a.w / 2
		const ay = a.y + a.h / 2
		const bx = b.x + b.w / 2
		const by = b.y + b.h / 2
		const dx = bx - ax
		const dy = by - ay
		const dist = Math.hypot(dx, dy)
		if (dist === 0) continue
		const ux = dx / dist
		const uy = dy / dist
		// Several lines between one pair, side by side (the pair's own order).
		const mates = pairs.get(pairKey(e))!
		const k = mates.indexOf(e)
		// One perpendicular for the pair whichever way each runs, so two lines never cross.
		const sign = e.from < e.to ? 1 : -1
		const shift = (k - (mates.length - 1) / 2) * MAP_PARALLEL_GAP * sign
		const ox = -uy * shift
		const oy = ux * shift
		const cutA = borderCut(a.w / 2, a.h / 2, ux, uy)
		const cutB = borderCut(b.w / 2, b.h / 2, ux, uy)
		const len = dist - cutA - cutB
		if (len <= 0) continue
		const x = ax + ux * cutA + ox
		const y = ay + uy * cutA + oy
		out.push({
			id: e.id,
			from: e.from,
			to: e.to,
			x: round(x),
			y: round(y),
			len: round(len),
			angle: round((Math.atan2(dy, dx) * 180) / Math.PI),
			bidirectional: !!e.bidirectional,
			stub: false,
			label: e.label?.trim() ? e.label.trim() : null,
			labelX: round(x + (ux * len) / 2),
			labelY: round(y + (uy * len) / 2),
		})
	}

	// Stubs: out of the square's lower border, fanned when there are several.
	const stubsOf = new Map<string, MapCanvasEdge[]>()
	for (const e of stubs) stubsOf.set(e.from, [...(stubsOf.get(e.from) ?? []), e])
	for (const [from, mine] of stubsOf) {
		const a = placed.get(from)!
		mine.forEach((e, k) => {
			const angle = 90 + (k - (mine.length - 1) / 2) * 30
			const ux = Math.cos((angle * Math.PI) / 180)
			const uy = Math.sin((angle * Math.PI) / 180)
			const cut = borderCut(a.w / 2, a.h / 2, ux, uy)
			const x = a.x + a.w / 2 + ux * cut
			const y = a.y + a.h / 2 + uy * cut
			out.push({
				id: e.id,
				from: e.from,
				to: e.to,
				x: round(x),
				y: round(y),
				len: MAP_STUB_LEN,
				angle: round(angle),
				bidirectional: !!e.bidirectional,
				stub: true,
				label: e.label?.trim() ? e.label.trim() : null,
				labelX: round(x + (ux * MAP_STUB_LEN) / 2),
				labelY: round(y + (uy * MAP_STUB_LEN) / 2),
			})
		})
		bottom = Math.max(bottom, a.y + a.h + MAP_STUB_LEN)
	}

	return {
		nodes: focus.map((id) => placed.get(id)!),
		edges: out,
		width: round(width),
		height: round(bottom + MAP_PAD),
	}
}

/** How far from a box's centre a ray along (ux, uy) leaves it. */
function borderCut(hw: number, hh: number, ux: number, uy: number): number {
	const tx = ux === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(ux)
	const ty = uy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(uy)
	return Math.min(tx, ty)
}

/**
 * Order each ring by where its neighbours stand in the ring before (then the
 * ring after, then before again) — fewer crossings — keeping the order nodes
 * were reached where it ties. Stable, so deterministic.
 */
function orderRings(rings: string[][], adj: ReadonlyMap<string, readonly string[]>): string[][] {
	const out = rings.map((r) => [...r])
	const sweep = (r: number, by: number) => {
		const pos = new Map(out[by]!.map((id, i) => [id, i]))
		const keyed = out[r]!.map((id, i) => {
			const near = adj
				.get(id)!
				.filter((nb) => pos.has(nb))
				.map((nb) => pos.get(nb)!)
			return { id, i, key: near.length ? near.reduce((s, v) => s + v, 0) / near.length : i }
		})
		keyed.sort((p, q) => p.key - q.key || p.i - q.i)
		out[r] = keyed.map((k) => k.id)
	}
	for (let r = 1; r < out.length; r++) sweep(r, r - 1)
	for (let r = out.length - 2; r >= 0; r--) sweep(r, r + 1)
	for (let r = 1; r < out.length; r++) sweep(r, r - 1)
	return out
}

/** The next zoom step in or out from `zoom`, or `zoom` itself at either end. @experimental */
export function nextMapZoom(zoom: number, way: 'in' | 'out'): number {
	if (way === 'in') return MAP_ZOOMS.find((z) => z > zoom + 1e-9) ?? zoom
	return [...MAP_ZOOMS].reverse().find((z) => z < zoom - 1e-9) ?? zoom
}
