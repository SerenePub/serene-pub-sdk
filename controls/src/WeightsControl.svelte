<script lang="ts">
	/**
	 * `weights@1` — part → number. Pinned-total and normalized groups show a
	 * proportional bar above the rows (the read half of the stacked-bar
	 * control); every group edits through per-part numbers, and a pinned
	 * total redistributes the remainder across the untouched parts so an
	 * invalid state cannot be typed.
	 */
	import { valueKind, type ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
		readonly?: boolean
		id?: string
		oncommit: (next: Record<string, number>) => void
	}

	let { decl, value, readonly = false, id, oncommit }: Props = $props()

	const schema = $derived(decl[valueKind(decl)] as Record<string, any>)
	const parts = $derived(Object.keys(schema.parts ?? {}))
	const current = $derived({
		...((schema.parts ?? {}) as Record<string, number>),
		...((value ?? {}) as Record<string, number>)
	})
	const total = $derived(
		parts.reduce((a, p) => a + (Number(current[p]) || 0), 0)
	)
	const proportional = $derived(!!schema.total || !!schema.normalize)

	/** Tones cycle; a host can override via --controls-tone-N. */
	const TONES = ["#5b8def", "#4fb286", "#e0a458", "#e07a7a", "#9b7ede", "#57b8c9"]

	function commitPart(part: string, raw: string) {
		const n = Number(raw)
		if (Number.isNaN(n)) return
		const next = { ...current, [part]: n }
		if (schema.total) {
			// Redistribute the remainder across the other parts, pro rata —
			// the group stays valid by construction.
			const others = parts.filter((p) => p !== part)
			const remainder = Math.max(0, (schema.total as number) - n)
			const othersTotal = others.reduce(
				(a, p) => a + (Number(current[p]) || 0),
				0
			)
			for (const p of others)
				next[p] = othersTotal
					? ((Number(current[p]) || 0) / othersTotal) * remainder
					: remainder / others.length
			if (schema.step === 1)
				for (const p of parts) next[p] = Math.round(next[p]!)
		}
		oncommit(next)
	}
</script>

<div {id} class="flex flex-col gap-1">
	{#if proportional && total > 0}
		<div class="controls-bar" aria-hidden="true">
			{#each parts as p, i (p)}
				<div
					class="controls-seg"
					style="width:{((Number(current[p]) || 0) / total) * 100}%; background:var(--controls-tone-{i}, {TONES[
						i % TONES.length
					]})"
					title="{p}: {current[p]}"
				></div>
			{/each}
		</div>
	{/if}
	<ul class="flex flex-col gap-1">
		{#each parts as p, i (p)}
			<li class="flex items-center gap-2 text-xs">
				<span
					class="controls-dot"
					style="background:var(--controls-tone-{i}, {TONES[
						i % TONES.length
					]})"
					aria-hidden="true"
				></span>
				<span class="min-w-0 flex-1 truncate">{p}</span>
				<input
					type="number"
					class="input w-24 text-right"
					disabled={readonly}
					min={schema.min}
					max={schema.max}
					step={schema.step ?? "any"}
					value={String(current[p] ?? 0)}
					onchange={(e) => commitPart(p, e.currentTarget.value)}
					aria-label={p}
				/>
			</li>
		{/each}
	</ul>
</div>

<style>
	.controls-bar {
		display: flex;
		height: 10px;
		border-radius: 999px;
		overflow: hidden;
	}
	.controls-seg {
		min-width: 2px;
	}
	.controls-dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		flex: none;
	}
</style>
