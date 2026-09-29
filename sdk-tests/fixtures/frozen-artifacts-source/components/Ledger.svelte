<script lang="ts">
	// Sections (messages, settings, locale), a request (messages), a widget event, an invoke.
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	const read = () => ({
		n: ctx.messages?.length ?? 0,
		title: typeof ctx.settings?.title === 'string' ? ctx.settings.title : 'Ledger',
		locale: ctx.locale ?? '?',
	})
	let s = $state(read())
	let older = $state('not asked')
	let lastEvent = $state('none')
	$effect(() => ctx.subscribe(() => (s = read())))
	$effect(() =>
		ctx.onEvent((e) => {
			const ev = e as { kind?: unknown; messageId?: unknown }
			lastEvent = `${String(ev.kind)} #${String(ev.messageId)}`
		}),
	)
	const loadOlder = async () => {
		older = 'asking'
		try {
			const page = await ctx.request('messages', { limit: 2 })
			older = `${page.rows.length} older`
		} catch {
			older = 'declined'
		}
	}
</script>

<section class="ledger" aria-label={s.title}>
	<h3 class="title">{s.title}</h3>
	<p class="count">{s.n} messages · {s.locale}</p>
	<button type="button" class="older" onclick={loadOlder}>Load older</button>
	<p class="older-state">{older}</p>
	<p class="event">last event: {lastEvent}</p>
	<button type="button" class="note" onclick={() => ctx.invoke('note', { payload: { n: s.n } })}>Note</button>
</section>
