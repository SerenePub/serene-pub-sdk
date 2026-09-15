<script lang="ts">
	/**
	 * The generated controls for one declared surface.
	 *
	 * A surface declares its props/settings as a `SettingsSchema`; core renders
	 * forms from schemas; therefore the surface gets an editor without shipping
	 * one. This panel is that editor, and the values go straight down the same
	 * pipe an instance uses — `ctx.settings` for a component, `{t:'props'}` for
	 * a frame — so what a modder edits here is what their surface receives.
	 *
	 * Schema problems are reported through the SDK's own `checkSchema` rather
	 * than a second opinion invented here. The one worth naming out loud is a
	 * `secret` on a surface: a surface runs in the browser, so a secret
	 * declared on one would be delivered to it.
	 */
	import { SchemaForm } from '@serene-pub/controls'
	import { checkSchema, configState, type SettingsSchema } from '@serene-pub/sdk'

	interface Props {
		schema: SettingsSchema
		values: Record<string, unknown>
		/** How these values reach the surface, said plainly in the panel. */
		delivery: string
	}
	let { schema, values = $bindable(), delivery }: Props = $props()

	/** A schema a modder is halfway through writing must not throw. */
	const findings = $derived.by(() => {
		try {
			return checkSchema(schema)
		} catch (e) {
			return [{ severity: 'error', message: (e as Error).message } as never]
		}
	})

	// Guarded on the same terms as `checkSchema`, and for the same reason: both
	// read a schema a modder is halfway through writing, and an exception in
	// either would blank the panel that was about to explain why.
	const state = $derived.by(() => {
		try {
			return configState(schema, values)
		} catch {
			return { state: 'ready' } as ReturnType<typeof configState>
		}
	})
	const errors = $derived(findings.filter((f: any) => f.severity === 'error'))
	const warnings = $derived(findings.filter((f: any) => f.severity !== 'error'))
	const secrets = $derived.by(() => {
		try {
			return Object.entries(schema)
				.filter(([, d]) => d?.type === 'secret')
				.map(([k]) => k)
		} catch {
			return []
		}
	})
</script>

<div class="flex flex-col gap-3">
	<p class="text-surface-600-400 text-xs">
		Generated from the surface's declaration. Values arrive as <code>{delivery}</code>.
	</p>

	{#if secrets.length}
		<div class="preset-tonal-error rounded p-2 text-xs">
			<strong>{secrets.join(', ')}</strong>
			{secrets.length === 1 ? 'is a secret' : 'are secrets'} on a surface. A surface runs
			in the browser, so the value would be delivered to it — declare secrets
			extension-side and read them from a hook.
		</div>
	{/if}

	{#each errors as f}
		<div class="preset-tonal-error rounded p-2 text-xs">{f.message}</div>
	{/each}
	{#each warnings as f}
		<div class="preset-tonal-warning rounded p-2 text-xs">{f.message}</div>
	{/each}

	{#if state.state === 'needs-configuration'}
		<div class="preset-tonal-warning rounded p-2 text-xs">{state.message}</div>
	{/if}

	<SchemaForm {schema} bind:values idPrefix="surface" />
</div>
