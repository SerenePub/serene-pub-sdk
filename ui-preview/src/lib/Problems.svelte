<script lang="ts">
	/**
	 * Declarations the harness could not read. Shown, never thrown: a
	 * half-typed entry path must not empty the list of everything else that
	 * works — the same tolerance the app's manifest reader has.
	 */
	let { problems }: { problems: string[] } = $props()
</script>

{#if problems.length}
	<div class="problems">
		<h3>{problems.length} declaration {problems.length === 1 ? 'problem' : 'problems'}</h3>
		<ul>
			{#each problems as p}
				<li>{p}</li>
			{/each}
		</ul>
	</div>
{/if}

