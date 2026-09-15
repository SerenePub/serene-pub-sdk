<script lang="ts">
	/**
	 * The safe degradation (24 §8): a value whose type id this build does not
	 * know renders read-only with the id shown — recognition is key lookup,
	 * so no misparse is possible, and the host refuses writes it cannot
	 * validate.
	 */
	import { valueKind, type ValueDecl } from "@serene-pub/sdk"

	interface Props {
		decl: ValueDecl
		value: unknown
	}

	let { decl, value }: Props = $props()
</script>

<div class="text-xs">
	<p class="controls-muted">
		Unknown value type <code>{valueKind(decl)}</code> — shown read-only;
		writes are refused until a build that knows it.
	</p>
	<pre class="controls-raw">{JSON.stringify(value, null, 2)}</pre>
</div>

<style>
	.controls-muted {
		opacity: 0.65;
	}
	.controls-raw {
		opacity: 0.85;
		overflow-x: auto;
		font-size: 0.85em;
	}
</style>
