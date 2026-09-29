<script lang="ts">
	/**
	 * `select@1` — labels from the declaration when it carries them, and the
	 * selected option's description said below, because a stored value like
	 * `rag` is not a word anybody chose to read.
	 */
	import { i18nText, valueKind, type I18n, type ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
		readonly?: boolean
		id?: string
		oncommit: (next: string) => void
	}

	let { decl, value, readonly = false, id, oncommit }: Props = $props()

	const schema = $derived(decl[valueKind(decl)] as Record<string, any>)
	// Display text through the SDK's one resolver (R-20); blank for a value publish never let in.
	const en = (v: unknown): string => i18nText(v as I18n | undefined) ?? ""
	// An option nobody labelled reads as its value in sentence case
	// (`oldest-first` → "Oldest first"), never as the raw stored token.
	const humanize = (v: string): string =>
		v
			.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
			.replace(/[-_]+/g, " ")
			.trim()
			.toLowerCase()
			.replace(/^./, (c) => c.toUpperCase())
	const options = $derived(
		((schema.options ?? []) as unknown[]).map((o) =>
			typeof o === "string"
				? { value: o, label: humanize(o), description: "" }
				: {
						value: (o as any).value,
						label: en((o as any).label) || humanize(String((o as any).value)),
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
