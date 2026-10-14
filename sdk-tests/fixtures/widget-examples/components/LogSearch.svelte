<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	import type { MessageV1 } from '@serene-pub/sdk'

	// Declared `channels: ['main']` and `reads: ['messages']`: the channel's
	// lines arrive as `ctx.channels.main`, newest last.
	let { ctx }: { ctx: ComponentContext } = $props()

	let query = $state('')
	/** Pages fetched with "Load older", oldest first, before the live lines. */
	let older = $state<MessageV1[]>([])
	let cursor = $state<string | undefined>(undefined)
	let exhausted = $state(false)
	let loading = $state(false)

	// The query saved last time comes back once, as `ctx.state`, soon after
	// mount — so restore it when it lands, and only that once.
	let restored = false
	$effect(() => {
		const saved = ctx.state as { query?: unknown } | undefined
		if (restored || !saved) return
		restored = true
		if (typeof saved.query === 'string') query = saved.query
	})

	// An older page may overlap the live lines; each id is shown once.
	const lines = $derived.by(() => {
		const live = ctx.channels.main ?? []
		const ids = new Set(live.map((m) => m.id))
		return [...older.filter((m) => !ids.has(m.id)), ...live]
	})
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase()
		return q ? lines.filter((m) => m.content.toLowerCase().includes(q)) : lines
	})

	function onQuery(e: Event) {
		query = (e.target as HTMLInputElement).value
		ctx.saveState({ query })
	}

	async function loadOlder() {
		loading = true
		try {
			const page = await ctx.request('messages', { channel: 'main', cursor, limit: 50 })
			older = [...page.rows, ...older]
			cursor = page.nextCursor
			exhausted = !page.nextCursor
		} catch (e) {
			ctx.error(e instanceof Error ? e.message : String(e))
		} finally {
			loading = false
		}
	}
</script>

<div class="space-y-2 p-3">
	<input class="input w-full" type="search" placeholder={ctx.t('Search the log')} value={query} oninput={onQuery} />
	<p data-widget-part="acme.widget-examples:log-search.count" class="text-xs text-surface-600-400">{shown.length} / {lines.length}</p>
	<ol class="space-y-1 text-sm">
		{#each shown as m (m.id)}
			<li data-widget-part="acme.widget-examples:log-search.line"><span class="font-semibold">{m.speakerLabel ?? m.role}:</span> {m.content}</li>
		{/each}
	</ol>
	{#if !exhausted}
		<button type="button" class="btn btn-sm preset-tonal" disabled={loading} onclick={loadOlder}>
			{loading ? ctx.t('Loading…') : ctx.t('Load older')}
		</button>
	{/if}
</div>
