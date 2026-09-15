<script lang="ts">
	/** `boolean@1` — a checkbox that says its state in a word. */
	import type { ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
		readonly?: boolean
		id?: string
		oncommit: (next: boolean) => void
	}

	let { value, readonly = false, id, oncommit }: Props = $props()
</script>

<label class="flex items-center gap-2 text-sm">
	<input
		{id}
		type="checkbox"
		class="checkbox"
		disabled={readonly}
		checked={!!value}
		onchange={(e) => oncommit(e.currentTarget.checked)}
	/>
	<span class="controls-muted">{value ? "On" : "Off"}</span>
</label>

<style>
	.controls-muted {
		opacity: 0.65;
	}
</style>
