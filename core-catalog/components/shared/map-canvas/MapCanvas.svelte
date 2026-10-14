<script lang="ts">
	/**
	 * Core's **map canvas** (PLAN-core-widgets §3.6, W4): squares joined by
	 * arrows, laid out by `layoutMap` (`./index.ts`, its own layered layout —
	 * see there why not elkjs). A shared control, not a widget: Places draws
	 * its map with it, and Dungeon Crawler's `crawl-map` will.
	 *
	 * - **Squares** are buttons, tinted by `data-tint`, the place where the
	 *   scene is ringed (`map-canvas.here`), the faces of who stands there on
	 *   them (`map-canvas.face`). A press, or **Tab** to one and **Enter**,
	 *   hands its id to `onPick`; the focus order is the layout's — ring by
	 *   ring, left to right, then the squares nothing joins.
	 * - **Edges** are drawn lines with an arrowhead at the far end, and at
	 *   both when they read both ways (`data-both`); a **stub** is a short
	 *   line out of one square toward somewhere not drawn.
	 * - **Pan** is the viewport's own scroll; **zoom** is the three buttons
	 *   above it (out, back to 100%, in).
	 *
	 * The markup carries no look (STYLE-GUIDE §6.16): only `map-canvas.*`
	 * parts and the positions as custom properties (`--sp-map-*`), which the
	 * skin (`widgets.css` §map-canvas) places and sizes by. The host mirrors
	 * no SVG, so lines and arrowheads are the skin's boxes.
	 */
	import {
		MAP_NODE_H,
		MAP_NODE_W,
		layoutMap,
		nextMapZoom,
		type MapCanvasEdge,
		type MapCanvasNode
	} from "./index"

	let {
		nodes,
		edges,
		selected = null,
		onPick,
		label = "Map",
		t = (source: string) => source
	}: {
		nodes: readonly MapCanvasNode[]
		edges: readonly MapCanvasEdge[]
		/** The square shown as picked; null when none is. */
		selected?: string | null
		/** A square was pressed. */
		onPick?: (nodeId: string) => void
		/** What the map is called to a screen reader. */
		label?: string
		/** The widget's translation: English source in, the viewer's words out. */
		t?: (source: string) => string
	} = $props()

	const layout = $derived(layoutMap(nodes, edges))
	let zoom = $state(1)

	/** A tint key, as the skin keys it: 0–5, or none. */
	const tintOf = (tint: number | null | undefined) =>
		typeof tint === "number" && Number.isInteger(tint) && tint >= 0 ? String(tint % 6) : undefined

	const place = (x: number, y: number) => `--sp-map-x: ${x}; --sp-map-y: ${y}`
	const line = (e: { x: number; y: number; len: number; angle: number }) =>
		`${place(e.x, e.y)}; --sp-map-len: ${e.len}; --sp-map-angle: ${e.angle}`

	/** The square, said: its name, then whether the scene is there, then its description. */
	function said(n: MapCanvasNode): string {
		const parts = [n.label]
		if (n.here) parts.push(t("here"))
		if (n.description) parts.push(n.description)
		return parts.join(", ")
	}
</script>

<div data-widget-part="map-canvas.root" role="group" aria-label={label}>
	<div data-widget-part="map-canvas.controls toolbar">
		<button
			type="button"
			data-widget-part="map-canvas.zoom"
			data-zoom="out"
			aria-label={t("Zoom out")}
			title={t("Zoom out")}
			disabled={nextMapZoom(zoom, "out") === zoom}
			onclick={() => (zoom = nextMapZoom(zoom, "out"))}
		>
			<sp-icon name="zoom-out" size="14"></sp-icon>
		</button>
		<button
			type="button"
			data-widget-part="map-canvas.zoom"
			data-zoom="reset"
			aria-label={t("Zoom to 100%")}
			title={t("Zoom to 100%")}
			onclick={() => (zoom = 1)}
		>
			{Math.round(zoom * 100)}%
		</button>
		<button
			type="button"
			data-widget-part="map-canvas.zoom"
			data-zoom="in"
			aria-label={t("Zoom in")}
			title={t("Zoom in")}
			disabled={nextMapZoom(zoom, "in") === zoom}
			onclick={() => (zoom = nextMapZoom(zoom, "in"))}
		>
			<sp-icon name="zoom-in" size="14"></sp-icon>
		</button>
	</div>
	<div data-widget-part="map-canvas.viewport">
		<div
			data-widget-part="map-canvas.surface"
			style="--sp-map-w: {layout.width}; --sp-map-h: {layout.height}; --sp-map-zoom: {zoom}; --sp-map-node-w: {MAP_NODE_W}; --sp-map-node-h: {MAP_NODE_H}"
		>
			<div data-widget-part="map-canvas.plane">
				{#each layout.edges as e (e.id)}
					{#if e.stub}
						<div
							data-widget-part="map-canvas.stub"
							data-edge-id={e.id}
							aria-hidden="true"
							style={line(e)}
						></div>
					{:else}
						<div
							data-widget-part="map-canvas.edge"
							data-edge-id={e.id}
							data-both={e.bidirectional ? "" : undefined}
							aria-hidden="true"
							style={line(e)}
						></div>
					{/if}
					{#if e.label}
						<span
							data-widget-part="map-canvas.label"
							data-edge-id={e.id}
							aria-hidden="true"
							style={place(e.labelX, e.labelY)}>{e.label}</span
						>
					{/if}
				{/each}
				{#each layout.nodes as n (n.id)}
					<button
						type="button"
						data-widget-part="map-canvas.node"
						data-node-id={n.id}
						data-tint={tintOf(n.tint)}
						data-here={n.here ? "" : undefined}
						aria-pressed={selected === n.id}
						aria-label={said(n)}
						title={n.label}
						style={place(n.x, n.y)}
						onclick={() => onPick?.(n.id)}
					>
						{#if n.here}
							<span data-widget-part="map-canvas.here" aria-hidden="true"></span>
						{/if}
						<span data-widget-part="map-canvas.label">{n.label}</span>
						{#if n.faces?.length}
							<span data-widget-part="map-canvas.faces" aria-hidden="true">
								{#each n.faces as f (f.ref)}
									<span data-widget-part="map-canvas.face" title={f.name}>
										<sp-avatar ref={f.ref} size="sm"></sp-avatar>
									</span>
								{/each}
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
