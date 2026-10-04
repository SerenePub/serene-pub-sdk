<script lang="ts">
	/**
	 * One surface on the stage, with its inputs beside it.
	 *
	 * Two panes of input, and the split is the design:
	 *
	 *   **Settings** — *generated* from what a component declares. A
	 *   component declares a `SettingsSchema`; core renders forms from
	 *   schemas; so the editor is derived, never written. Values reach it as
	 *   `ctx.settings`, the pipe an instance uses, which is what makes editing
	 *   here evidence about there. A frame surface (page, session-view) is
	 *   handed no declared values, so it has fixtures only.
	 *
	 *   **Fixtures** — the session and messages the host posts. Free-form JSON
	 *   because there is no declaration to derive them from: they are the
	 *   host's data, not the surface's.
	 *
	 * The fixture editor pushes on every valid parse rather than behind an
	 * Apply button: the loop being optimised is "does it survive this shape of
	 * message", and a button is one more thing between the question and the
	 * answer.
	 */
	import { page } from '$app/state'
	import { manifest, frames, fixtureOverride } from 'virtual:serene-pub/surfaces'
	import FrameStage from '$lib/FrameStage.svelte'
	import ComponentStage from '$lib/ComponentStage.svelte'
	import Problems from '$lib/Problems.svelte'
	import SurfaceSettings from '$lib/SurfaceSettings.svelte'
	import { DEFAULT_FIXTURES, normalizeFixtures, type Fixtures } from '$lib/fixtures.js'
	import { defaultsOf } from '$lib/defaults.js'
	import { onMount } from 'svelte'

	// The `--fixtures` file is the modder's, so it is normalised on the way in
	// too — a hand-written file that omits `messages` should not be a broken
	// harness on startup.
	const base = normalizeFixtures(fixtureOverride ?? DEFAULT_FIXTURES, DEFAULT_FIXTURES).fixtures

	const target = $derived(manifest.targets.find((t) => t.id === page.params.id))

	let draft = $state(JSON.stringify(base, null, 2))
	let fixtures = $state<Fixtures>(base)
	let parseError = $state<string | null>(null)
	let reloadKey = $state(0)
	let picked = $state<'declared' | 'fixtures'>('declared')
	// A frame has no declared values, so its only pane is the fixtures.
	const tab = $derived(target?.kind === 'frame' ? 'fixtures' : picked)

	/**
	 * Declared values, per target id, seeded from each schema's defaults.
	 *
	 * Seeded for *every* target up front rather than lazily for the current
	 * one: SvelteKit reuses this component across `/t/[id]`, so the map
	 * outlives navigation and what you typed on one surface is still there
	 * when you come back — the same reason `ctx.state` survives a remount
	 * (10 §5). Eager also means the form never renders against an
	 * uninitialised key, which is the difference between a defaulted field
	 * and a crash.
	 */
	let declared = $state<Record<string, Record<string, unknown>>>(
		Object.fromEntries(
			manifest.targets
				.filter((t) => t.settings)
				.map((t) => [t.id, defaultsOf(t.settings!)]),
		),
	)
	const declaredValues = $derived(target ? (declared[target.id] ?? {}) : {})

	let substituted = $state<string[]>([])
	$effect(() => {
		try {
			// Parsed *and* shaped: valid JSON is not the same promise as "has
			// the fields the pushers read", and the difference used to be an
			// uncaught TypeError that took the stage with it.
			const next = normalizeFixtures(JSON.parse(draft), DEFAULT_FIXTURES)
			fixtures = next.fixtures
			substituted = next.substituted
			parseError = null
		} catch (e) {
			parseError = (e as Error).message
		}
	})

	// A frame document edit reloads that frame and nothing else — the harness
	// asks Vite for the signal rather than polling, and a component edit never
	// reaches here because Svelte HMR has already handled it (dev.ts: a
	// component is always hot).
	onMount(() => {
		if (!import.meta.hot) return
		const onFrameChange = () => reloadKey++
		import.meta.hot.on('serene-pub:frame-changed', onFrameChange)
		return () => import.meta.hot?.off('serene-pub:frame-changed', onFrameChange)
	})
</script>

{#if !target}
	<div class="p-8">
		<Problems problems={[`No surface with id '${page.params.id}' is announced.`]} />
		<a href="/">Back to the list</a>
	</div>
{:else}
	<div class="flex min-h-0 flex-1">
		<div class="flex min-w-0 flex-1 flex-col">
			<header class="flex items-baseline gap-3 px-5 pt-4 pb-2">
				<h1 class="text-lg">{target.label}</h1>
				<span class="text-surface-600-400 text-xs">declared in {target.source}</span>
				{#if target.kind === 'frame'}
					<button class="btn btn-sm preset-tonal ml-auto" onclick={() => reloadKey++}>
						Reload frame
					</button>
				{/if}
			</header>
			<div class="px-5"><Problems problems={manifest.problems} /></div>
			{#if target.kind === 'frame'}
				{#if frames[target.id]}
					<!-- Keyed on the target: the stage owns per-surface state (the
					     channel log, the scoped and suspended toggles, the mounted
					     component) and SvelteKit reuses this page across /t/[id],
					     so without the key one surface inherits the last one's. -->
					{#key target.id}
						<FrameStage {target} src={frames[target.id]} {fixtures} {reloadKey} />
					{/key}
				{:else}
					<div class="px-5">
						<Problems
							problems={[`'${target.entry}' was not found under the package root.`]}
						/>
					</div>
				{/if}
			{:else}
				{#key target.id}
					<ComponentStage {target} {fixtures} settings={declaredValues} />
				{/key}
			{/if}
		</div>

		<aside
			class="bg-surface-50-950 border-surface-200-800 flex w-96 min-h-0 flex-none flex-col border-l p-4"
		>
			<div class="mb-3 flex gap-1">
				{#if target.kind !== 'frame'}
					<button
						class="btn btn-sm {tab === 'declared' ? 'preset-filled-primary-500' : 'preset-tonal'}"
						onclick={() => (picked = 'declared')}
					>
						Settings
					</button>
				{/if}
				<button
					class="btn btn-sm {tab === 'fixtures' ? 'preset-filled-primary-500' : 'preset-tonal'}"
					onclick={() => (picked = 'fixtures')}
				>
					Fixtures
				</button>
			</div>

			{#if tab === 'declared'}
				<div class="harness-scroll min-h-0 flex-1 overflow-y-auto">
					{#if !target.settings}
						<p class="text-surface-600-400 text-xs">
							This component declares no settings, so there is nothing to generate. Add a
							<code>settings</code> schema to its widget and the editor appears
							here — core renders forms from schemas, so you never write one.
						</p>
						<pre
							class="bg-surface-100-900 mt-2 overflow-x-auto rounded p-2 text-xs">{`widgets: [widget({
  id: 'tray',
  title: 'Dice tray',
  component: 'tray',
  settings: {
    sides:  { type: 'integer', label: 'Sides', default: 20, min: 2 },
    label:  { type: 'string',  label: 'Caption' },
    shaded: { type: 'boolean', label: 'Shade the tray', default: true },
  },
})]`}</pre>
					{:else}
						<SurfaceSettings
							schema={target.settings}
							bind:values={declared[target.id]}
							delivery="ctx.settings"
						/>
					{/if}
				</div>
			{:else}
				<p class="text-surface-600-400 mb-2 text-xs">
					What the host posts. A surface can only render what core chose to send it, so
					this is the whole world it has.{#if target.settings}
						<strong> settings</strong> comes from the declaration, not from here.{/if}
				</p>
				{#if parseError}
					<div class="preset-tonal-error mb-2 rounded p-2 text-xs">{parseError}</div>
				{:else if substituted.length}
					<div class="preset-tonal-warning mb-2 rounded p-2 text-xs">
						Using the defaults for <strong>{substituted.join(', ')}</strong> — the value
						here is not the shape the host posts.
					</div>
				{/if}
				<textarea
					class="textarea harness-mono min-h-0 flex-1 resize-none text-xs"
					bind:value={draft}
					spellcheck="false"
				></textarea>
			{/if}
		</aside>
	</div>
{/if}
