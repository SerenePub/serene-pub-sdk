<script lang="ts">
	/**
	 * The controls sandbox: every value type this build ships, with the
	 * control that edits it, live.
	 *
	 * Two jobs, and the second is the one that earns the page.
	 *
	 * 1. **A reference an author can touch.** `serene-pub docs` prints the
	 *    option tables; this shows what the option actually *is* on the
	 *    screen, on the theme the reader picked, with the declaration that
	 *    produced it printed beside it.
	 *
	 * 2. **The four-way registry, made visible.** 24 §8 requires every value
	 *    type to have a factory, a validator, a control and a scaffold
	 *    printer, and a conformance canary asserts it. A canary tells you it
	 *    broke; this tells you *what* broke, and shows the safe degradation
	 *    (an unknown kind renders read-only with its id) rather than
	 *    describing it.
	 */
	import { shippedValueKinds, valueValidators, validateValue, valueKind } from '@serene-pub/sdk'
	import { CONTROL_REGISTRY } from '@serene-pub/controls/registry'
	import { controlFor } from '@serene-pub/controls'
	import { SAMPLES, UNKNOWN_SAMPLE, type Sample } from '$lib/samples.js'
	import { manifest } from 'virtual:serene-pub/surfaces'

	/** Live value per row, seeded from the sample. */
	let values = $state<Record<string, unknown>>(
		Object.fromEntries([...SAMPLES, UNKNOWN_SAMPLE].map((s, i) => [`${s.kind}#${i}`, s.value])),
	)

	const rowKey = (s: Sample, i: number) => `${s.kind}#${i}`

	/**
	 * Coverage per shipped kind. The scaffold printer is the CLI's leg and is
	 * Node-only, so it is named here rather than probed — claiming to have
	 * checked something this page cannot reach would be worse than saying
	 * where it is checked.
	 */
	const coverage = $derived(
		shippedValueKinds.map((kind) => ({
			kind,
			validator: !!valueValidators[kind],
			control: !!CONTROL_REGISTRY[kind],
			hostIntegrated: !!CONTROL_REGISTRY[kind]?.hostIntegrated,
			component: CONTROL_REGISTRY[kind]?.component ?? '—',
		})),
	)
	const holes = $derived(coverage.filter((c) => !c.validator || !c.control))

	/** Which kinds this package's own declared surfaces actually reach. */
	const usedKinds = $derived.by(() => {
		const out = new Set<string>()
		for (const t of manifest.targets)
			for (const decl of Object.values(t.settings ?? {})) {
				// Cheap structural read: the sandbox is a reference, not a
				// validator, and a malformed field must not blank the page.
				const type = (decl as { type?: string })?.type
				if (type) out.add(type)
			}
		return [...out].sort()
	})
</script>

<div class="harness-scroll flex-1 overflow-y-auto p-6">
	<header class="mb-4">
		<h1 class="text-2xl">Controls sandbox</h1>
		<p class="text-surface-600-400 max-w-3xl text-sm">
			Every value type this build ships, and the control that edits it. Switch the theme
			in the sidebar to see them the way an instance will render them — these are the
			same components Serene Pub mounts, styled by the same Skeleton layer.
		</p>
	</header>

	<section class="mb-6">
		<h2 class="mb-2 text-sm font-semibold tracking-wide uppercase">
			The four-way registry
		</h2>
		{#if holes.length}
			<div class="preset-tonal-error mb-2 rounded p-3 text-sm">
				{holes.length} kind{holes.length === 1 ? '' : 's'} incomplete:
				{holes.map((h) => h.kind).join(', ')}
			</div>
		{:else}
			<p class="text-surface-600-400 mb-2 text-sm">
				All {coverage.length} shipped kinds have a factory, a validator and a control.
				The fourth leg — the scaffold printer — lives in the CLI and is asserted by the
				conformance canary in <code>sdk-tests/values.test.ts</code>.
			</p>
		{/if}
		<table class="w-full text-left text-xs">
			<thead class="border-surface-200-800 border-b">
				<tr>
					<th class="py-1">Value type</th>
					<th>Validator</th>
					<th>Control</th>
					<th>Component</th>
				</tr>
			</thead>
			<tbody>
				{#each coverage as c (c.kind)}
					<tr class="border-surface-200-800 border-b">
						<td class="harness-mono py-1">{c.kind}</td>
						<td>{c.validator ? '✓' : '✗'}</td>
						<td>{c.control ? (c.hostIntegrated ? 'host' : '✓') : '✗'}</td>
						<td class="harness-mono">{c.component}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if usedKinds.length}
			<p class="text-surface-600-400 mt-2 text-xs">
				Your declared surfaces use these field types: {usedKinds.join(', ')}.
			</p>
		{/if}
	</section>

	<section class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr))">
		{#each [...SAMPLES, UNKNOWN_SAMPLE] as s, i (rowKey(s, i))}
			{@const key = rowKey(s, i)}
			{@const Control = controlFor(s.kind)}
			{@const errors = values[key] == null ? [] : validateValue(s.decl, values[key])}
			<article class="bg-surface-50-950 border-surface-200-800 rounded-lg border p-4">
				<h3 class="harness-mono mb-1 text-sm">{s.kind}</h3>
				<p class="text-surface-600-400 harness-mono mb-3 text-xs">{s.source}</p>

				{#if Control}
					<Control
						decl={s.decl}
						value={values[key]}
						id="sandbox-{i}"
						oncommit={(next: unknown) => (values[key] = next)}
					/>
				{:else}
					<p class="preset-tonal-surface rounded p-2 text-xs">
						Host-integrated: the choices live in the instance's database, so the
						package ships no control and the host renders a data-connected picker.
					</p>
				{/if}

				<div class="text-surface-600-400 mt-3 text-xs">
					<div class="harness-mono break-all">
						value: {JSON.stringify(values[key])}
					</div>
					{#if errors.length}
						<ul class="preset-tonal-error mt-1 rounded p-2">
							{#each errors as e}
								<li>{e}</li>
							{/each}
						</ul>
					{:else}
						<div class="mt-1">validates ✓</div>
					{/if}
				</div>
			</article>
		{/each}
	</section>
</div>
