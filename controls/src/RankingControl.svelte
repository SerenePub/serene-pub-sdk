<script lang="ts">
	/**
	 * `ranking@1` — the value is a permutation of the declared options,
	 * edited with move up/down. Priority order, not magnitude: the honest
	 * control when strings were about to be pretend-weights.
	 */
	import { valueKind, type ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
		readonly?: boolean
		id?: string
		oncommit: (next: string[]) => void
	}

	let { decl, value, readonly = false, id, oncommit }: Props = $props()

	const schema = $derived(decl[valueKind(decl)] as Record<string, any>)
	const order = $derived.by(() => {
		const declared = (schema.options ?? []) as string[]
		const chosen = Array.isArray(value) ? (value as string[]) : []
		// The stored permutation first, then anything newly declared.
		return [
			...chosen.filter((v) => declared.includes(v)),
			...declared.filter((v) => !chosen.includes(v))
		]
	})

	function move(index: number, delta: number) {
		const next = [...order]
		const j = index + delta
		if (j < 0 || j >= next.length) return
		;[next[index], next[j]] = [next[j]!, next[index]!]
		oncommit(next)
	}
</script>

<ol {id} class="flex flex-col gap-1">
	{#each order as item, i (item)}
		<li class="flex items-center gap-2 text-xs">
			<span class="controls-rank">{i + 1}</span>
			<span class="min-w-0 flex-1 truncate">{item}</span>
			{#if !readonly}
				<button
					type="button"
					class="btn btn-sm"
					disabled={i === 0}
					aria-label="Move {item} up"
					onclick={() => move(i, -1)}>↑</button
				>
				<button
					type="button"
					class="btn btn-sm"
					disabled={i === order.length - 1}
					aria-label="Move {item} down"
					onclick={() => move(i, 1)}>↓</button
				>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.controls-rank {
		opacity: 0.6;
		font-family: monospace;
		width: 1.4em;
		text-align: right;
		flex: none;
	}
</style>
