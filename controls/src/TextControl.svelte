<script lang="ts">
	/**
	 * `text@1`. A single-line input unless the declaration (or the host, via
	 * `rows`) says multiline; an empty commit clears back to the inherited
	 * value rather than storing an empty string.
	 */
	import { valueKind, type ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
		readonly?: boolean
		id?: string
		placeholder?: string
		rows?: number
		oncommit: (next: string | undefined) => void
	}

	let {
		decl,
		value,
		readonly = false,
		id,
		placeholder,
		rows,
		oncommit
	}: Props = $props()

	const schema = $derived(decl[valueKind(decl)] as Record<string, any>)

	let draft = $state<string | null>(null)
	$effect(() => {
		void value
		draft = null
	})

	function commit(next: string) {
		const current = value == null ? "" : String(value)
		if (next === current) return
		oncommit(next === "" ? undefined : next)
	}
</script>

{#if schema.multiline || (rows ?? 0) > 1}
	<textarea
		{id}
		class="textarea w-full font-mono text-xs"
		disabled={readonly}
		{placeholder}
		rows={rows ?? 4}
		maxlength={schema.maxLength}
		value={draft ?? (value == null ? "" : String(value))}
		oninput={(e) => (draft = e.currentTarget.value)}
		onblur={(e) => commit(e.currentTarget.value)}
	></textarea>
{:else}
	<input
		{id}
		type="text"
		class="input w-full"
		disabled={readonly}
		{placeholder}
		maxlength={schema.maxLength}
		value={draft ?? (value == null ? "" : String(value))}
		oninput={(e) => (draft = e.currentTarget.value)}
		onchange={(e) => commit(e.currentTarget.value)}
	/>
{/if}
