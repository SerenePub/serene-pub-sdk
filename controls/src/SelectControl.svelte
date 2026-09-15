<script lang="ts">
	/**
	 * `select@1` — labels from the declaration when it carries them, and the
	 * selected option's description said below, because a stored value like
	 * `rag` is not a word anybody chose to read.
	 */
	import { valueKind, type ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
		readonly?: boolean
		id?: string
		oncommit: (next: string) => void
	}

	let { decl, value, readonly = false, id, oncommit }: Props = $props()

	const schema = $derived(decl[valueKind(decl)] as Record<string, any>)
	const en = (v: unknown): string =>
		typeof v === "string" ? v : ((v as any)?.en ?? "")
	const options = $derived(
		((schema.options ?? []) as unknown[]).map((o) =>
			typeof o === "string"
				? { value: o, label: o, description: "" }
				: {
						value: (o as any).value,
						label: en((o as any).label) || (o as any).value,
						description: en((o as any).description)
					}
		)
	)
	const selected = $derived(
		options.find((o) => o.value === String(value ?? ""))
	)
</script>

<select
	{id}
	class="select w-full"
	disabled={readonly}
	value={value == null ? "" : String(value)}
	onchange={(e) => oncommit(e.currentTarget.value)}
>
	{#each options as o (o.value)}
		<option value={o.value}>{o.label}</option>
	{/each}
</select>
{#if selected?.description}
	<p class="controls-muted mt-1 text-xs">{selected.description}</p>
{/if}

<style>
	.controls-muted {
		opacity: 0.65;
	}
</style>
