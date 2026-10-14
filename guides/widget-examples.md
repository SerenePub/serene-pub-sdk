# Widget examples

Three small widgets, each built and tested for real. Each is a Svelte component, a two-line entry
module, and the `widget()` declaration that names it. The sources live in the SDK repository under
`sdk-tests/fixtures/widget-examples/`, and `sdk-tests/widgetExamples.test.ts` mounts each one with
the component harness, under its own declaration. The code on this page is those files, byte for
byte. Read [Widgets](widgets.md) first for how a widget is declared and what `ctx` holds.

Every component's entry module is the same two lines, with its own name:

```ts nocheck imports a .svelte file, which the snippet checker cannot compile
import { svelteComponent } from '@serene-pub/component-client/svelte'
import MoodDial from './MoodDial.svelte'

export default svelteComponent(MoodDial)
```

Each widget is listed in the plugin's `defineExtension`, beside a `component()` for its entry, as
[Write a widget](widgets.md#write-a-widget) shows.

## Who's here

The cheapest widget there is: who has the session open, which of them is you, and who is typing.

<!-- prelude:
import { widget } from '@serene-pub/sdk'
-->
```ts
export const whoIsHere = widget({
	id: 'who-is-here',
	title: "Who's here",
	component: 'who-is-here',
	reads: ['attendance', 'viewer'],
})
```

`reads` names the two base sections it draws, `attendance` and `viewer`, and the page sends it
nothing else, so a new message never redraws it. It asks for no `scopes`, so an admin is never
asked about it. Leave `reads` out and the widget is sent every base section: name what you draw.

```svelte
<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'

	// Declared `reads: ['attendance', 'viewer']`: the page sends this widget
	// those two sections and nothing else, so it never redraws for a message.
	let { ctx }: { ctx: ComponentContext } = $props()

	const me = $derived(ctx.viewer?.userId ?? null)
	// The owner and every guest are listed; `here` is who has it open now.
	const here = $derived((ctx.attendance?.people ?? []).filter((p) => p.here))
	const typing = $derived(here.filter((p) => p.typing && p.userId !== me).map((p) => p.name))
</script>

<div class="space-y-2 p-3">
	<p class="text-sm font-semibold">{ctx.t('Here now')}</p>
	{#if !ctx.attendance}
		<p class="text-sm text-surface-600-400">{ctx.t('Loading…')}</p>
	{:else if here.length === 0}
		<p class="text-sm text-surface-600-400">{ctx.t('No one has this session open.')}</p>
	{:else}
		<ul class="text-sm">
			{#each here as person (person.userId)}
				<li data-widget-part="acme.widget-examples:who-is-here.person" class="flex items-center gap-2">
					<sp-avatar ref={`user:${person.userId}`} size="sm"></sp-avatar>
					{person.name}
					{#if person.userId === me}<span data-widget-part="acme.widget-examples:who-is-here.you" class="text-surface-600-400">({ctx.t('you')})</span>{/if}
					{#if person.role === 'owner'}<sp-icon name="crown" size="12" label={ctx.t('Owner')}></sp-icon>{/if}
				</li>
			{/each}
		</ul>
		<p data-widget-part="acme.widget-examples:who-is-here.typing" class="text-xs italic text-surface-600-400" aria-live="polite">
			{typing.length ? `${typing.join(', ')} ${ctx.t(typing.length === 1 ? 'is typing…' : 'are typing…')}` : ''}
		</p>
	{/if}
</div>
```

- `ctx.attendance.people` lists the session's owner and every guest, open or not. `here` is who
  has it open now, and `typing` is who is typing.
- `ctx.viewer.userId` is the person looking, so the widget can say "you" and skip announcing
  their own typing back to them.
- `sp-avatar` draws an account's avatar by reference (`user:<id>`). `sp-icon` with a `label` is
  read aloud; without one it is decorative.

The test pushes a new `attendance` and reads the list again, as the page would redraw it.

## Log search

A filter over one channel's lines, a **Load older** button that pages further back, and a query
that is still there the next time the widget mounts.

<!-- prelude:
import { widget } from '@serene-pub/sdk'
-->
```ts
export const logSearch = widget({
	id: 'log-search',
	title: 'Log search',
	component: 'log-search',
	channels: ['main'],
	reads: ['messages'],
})
```

`channels: ['main']` hands the component the `main` channel's lines as `ctx.channels.main`, newest
last. A channel's lines are the `messages` section, so the widget reads `messages` too: without it
nothing arrives.

```svelte
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
```

- **Paging.** `request('messages', { channel, cursor, limit })` resolves to `{ rows, nextCursor }`.
  Pass the `nextCursor` you were given to get the page before it; a page without one is the last.
  The widget keeps older pages itself and puts them in front of the live lines, showing each id
  once.
- **View state.** `saveState({ query })` keeps a little state for the next mount. It comes back
  as `ctx.state`, sent shortly after the component mounts rather than before, so the widget
  restores it in an `$effect` the first time it arrives. `ctx.state` is `unknown`: check its shape
  before you trust it.
- **Failures.** A request the page declines rejects, and the widget passes the reason to
  `ctx.error`.

## Mood dial

The session's stats for the viewer's persona (or the world's, when they write as none), with
**−1** and **+1** on each whole-number stat, and one action button.

<!-- prelude:
import { widget } from '@serene-pub/sdk'
-->
```ts
export const moodDial = widget({
	id: 'mood-dial',
	title: 'Mood dial',
	component: 'mood-dial',
	reads: ['actions', 'settings'],
	scopes: ['session:state', 'session:state:write', 'persona'],
	settings: { step: { type: 'integer', label: 'Step', default: 1 } },
})
```

It asks for three scopes, and an admin grants each one separately:

| Scope | What it gives |
| --- | --- |
| `session:state` | The stats and states, read with `ctx.scope('session:state')`. |
| `session:state:write` | A **write grant**: it may ask `set-attribute-value`. It sends no data of its own. |
| `persona` | The viewer's own persona, to find whose stats to show. |

It reads `actions` (to show a button) and `settings` (its own `step`), and nothing else.

```svelte
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
```

- **Three states, never two.** `granted('session:state') === false` means the admin refused it:
  say so, or the widget waits forever. No section yet, or one whose `loaded` is still false, is
  loading. Only then is there something to draw.
- **Whose stats.** A slot belongs to an owner when its id is a key of `owner.configs`. The
  owner's values are in `resolved.world` or `resolved.cast[owner.key]`, filed by the slot's
  `qualifiedKey`. A write names the slot by its `slotId` and the owner by `{ kind, id }`. A cast
  owner does not name its character yet, so the widget finds the persona's owner by its label.
- **Writing.** `set-attribute-value` resolves once the value is written; the new value arrives as
  the next `session:state` push, never in the reply. The buttons are shown only while
  `granted('session:state:write')` is true, and a press with no person behind it is refused. A
  refusal rejects with a sentence, which the widget shows on its own line.
- **An action.** `ctx.actions.widget` lists the actions the session offers widgets. Press one by
  its identity, `actionIdentity(action)` (`acme.dice#roll`): a bare key is ambiguous when two
  plugins declare it.

The tests draw each state, press **+1** with the write grant held, and take the grant away with
`setGrants` to see the buttons go.

## Testing your own

Each test passes the declaration's own `reads`, `channels` and scopes to `mountComponent`, so the
harness holds the component to what the page would send it:

<!-- prelude:
import { mountComponent } from '@serene-pub/cli/testing'
import type { SessionStateV1, WidgetDecl } from '@serene-pub/sdk'
declare const moodDial: WidgetDecl
declare const state: SessionStateV1
-->
```ts
const view = await mountComponent({
	entry: 'components/mood-dial.ts',
	reads: moodDial.reads,
	grants: ['session:state', 'session:state:write'],
	requests: (kind) => (kind === 'set-attribute-value' ? undefined : Promise.reject(new Error(kind))),
})
await view.push('scoped', { session_state: state })
await view.click('.plus')
await view.setGrants(['session:state'])
await view.unmount()
```

See [Testing it](widgets.md#testing-it) for the rest of the harness.
