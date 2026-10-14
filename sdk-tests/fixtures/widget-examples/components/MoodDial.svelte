<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	import { actionIdentity } from '@serene-pub/sdk/component'
	import type { SessionStateSlotV1, SlotConfig } from '@serene-pub/sdk'

	// Declared `scopes: ['session:state', 'session:state:write', 'persona']`:
	// an admin grants each apart, so draw what was granted, not what was asked.
	let { ctx }: { ctx: ComponentContext } = $props()

	const section = $derived(ctx.scope('session:state'))
	const persona = $derived(ctx.scope('persona')?.[0])
	// The viewer's persona's stats when it has any, else the world's. A cast
	// owner names no character, so the persona is matched by its label.
	const owner = $derived.by(() => {
		const owners = section?.owners ?? []
		const mine = persona && owners.find((o) => o.kind === 'session_cast' && o.label === persona.name)
		return mine ?? owners.find((o) => o.kind === 'session')
	})
	const values = $derived(
		!section || !owner ? {} : owner.kind === 'session' ? section.resolved.world : (section.resolved.cast[owner.key] ?? {}),
	)
	// A slot is this owner's exactly when its id is a key of `owner.configs`.
	const slots = $derived((section?.slots ?? []).filter((s) => owner && s.slotId in owner.configs && !s.retired))
	const canWrite = $derived(ctx.granted('session:state:write') === true)
	const step = $derived(Number(ctx.settings?.step ?? 1) || 1)
	// One action from the `widget` venue, pressed by its identity.
	const action = $derived(ctx.actions?.widget?.primary[0])
	let failed = $state<string | null>(null)

	async function nudge(slot: SessionStateSlotV1, by: number) {
		if (!owner) return
		const { min = -Infinity, max = Infinity } = (owner.configs[slot.slotId] ?? {}) as SlotConfig
		const value = Math.min(max, Math.max(min, Number(values[slot.qualifiedKey] ?? 0) + by))
		failed = null
		try {
			// Resolves once written; the new value arrives as a `session:state` push.
			await ctx.request('set-attribute-value', { owner: { kind: owner.kind, id: owner.id }, slotId: slot.slotId, value })
		} catch (e) {
			failed = e instanceof Error ? e.message : String(e)
		}
	}
</script>

<div class="space-y-2 p-3">
	{#if ctx.granted('session:state') === false}
		<p data-widget-part="acme.widget-examples:mood-dial.not-granted" class="text-sm text-surface-600-400">{ctx.t("This widget has not been granted the session's stats.")}</p>
	{:else if !section || !section.loaded}
		<p data-widget-part="acme.widget-examples:mood-dial.loading" class="text-sm text-surface-600-400">{ctx.t('Loading…')}</p>
	{:else}
		<p data-widget-part="acme.widget-examples:mood-dial.owner" class="text-sm font-semibold">{owner?.label ?? ctx.t('World')}</p>
		<ul class="space-y-1 text-sm">
			{#each slots as slot (slot.slotId)}
				<li data-widget-part="acme.widget-examples:mood-dial.slot" class="flex items-center justify-between gap-2" data-slot={slot.key}>
					<span>{slot.label}</span>
					<span data-widget-part="acme.widget-examples:mood-dial.value" class="tabular-nums">{String(values[slot.qualifiedKey] ?? '–')}</span>
					{#if slot.type === 'integer' && canWrite}
						<button type="button" data-widget-part="acme.widget-examples:mood-dial.minus" class="btn btn-sm preset-tonal" onclick={() => nudge(slot, -step)}>−{step}</button>
						<button type="button" data-widget-part="acme.widget-examples:mood-dial.plus" class="btn btn-sm preset-tonal" onclick={() => nudge(slot, step)}>+{step}</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if ctx.granted('session:state:write') === false}
			<p data-widget-part="acme.widget-examples:mood-dial.read-only" class="text-xs text-surface-600-400">{ctx.t('Read only: this widget may not change stats.')}</p>
		{/if}
		{#if failed}<p data-widget-part="acme.widget-examples:mood-dial.failed" class="text-xs text-error-500">{failed}</p>{/if}
	{/if}
	{#if action}
		<button type="button" data-widget-part="acme.widget-examples:mood-dial.action" class="btn btn-sm preset-filled" disabled={!action.canAct} onclick={() => ctx.invoke(actionIdentity(action))}>
			{action.name}
		</button>
	{/if}
</div>
