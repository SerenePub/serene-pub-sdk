<script lang="ts">
	/**
	 * `integer@1` / `number@1`. Typed text rides an internal draft and
	 * commits on change, so a value the host's write chain rejects or
	 * reshapes reconciles the box to what actually resolved — the box never
	 * lies about the stored value.
	 */
	import { valueKind, type ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
		readonly?: boolean
		id?: string
		/** `undefined` = clear back to the inherited value. */
		oncommit: (next: number | undefined) => void
	}

	let { decl, value, readonly = false, id, oncommit }: Props = $props()

	const kind = $derived(valueKind(decl))
	const schema = $derived(decl[kind] as Record<string, any>)
	const isInteger = $derived(kind === "integer@1")

	let draft = $state<string | null>(null)
	// The host's resolved value reconciles the box after every write.
	$effect(() => {
		void value
		draft = null
	})

	function commit(raw: string) {
		if (raw === "") return oncommit(undefined)
		const n = isInteger ? parseInt(raw, 10) : parseFloat(raw)
		if (!Number.isNaN(n)) oncommit(n)
	}
</script>

<input
	{id}
	type="number"
	class="input w-full"
	disabled={readonly}
	min={schema.min}
	max={schema.max}
	step={schema.step ?? (isInteger ? 1 : "any")}
	value={draft ?? (value == null ? "" : String(value))}
	oninput={(e) => (draft = e.currentTarget.value)}
	onchange={(e) => commit(e.currentTarget.value)}
/>
