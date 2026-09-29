# Widgets

A session's screen is made of **widgets**: the conversation, a portrait column, a map. Your
package can change how they look, add its own, and — for the one region that needs it — embed a
real document. Go only as far down this list as you need to.

## 1. A skin

A widget skin is CSS the app scopes to one widget. It restyles what is there — colours, spacing,
the message layout — and needs no code at all. Most changes stop here.

## 2. Clone a core widget

A clone starts from core's own source instead of an empty file. `@serene-pub/core-catalog` ships
each core component's source beside its built module, and `serene-pub clone` copies it into your
package:

```sh
serene-pub clone --list                 # what can be copied, with each one's sourceHash
serene-pub clone stats --as party-stats # components/party-stats/, paths kept
```

It writes every file under `components/<as>/` with the path it has in core (so the copy diffs
against core file for file), plus a `based-on.json` recording what it copied, one hash per file.
It refuses to overwrite a file that is already there (`--force` overwrites), writes nothing outside
the package, and never edits your entry module: it prints the `component({ …, basedOn })` and
`widget({ … })` declarations for you to paste. `basedOn` names core's slug, the catalog version
and the copied source's `sourceHash`. `--as` defaults to `my-<slug>`; it cannot be a core
component's slug, because a layout names core's widget and yours by bare id.

**A copy is a plugin's widget.** Core's widgets hold every scope and ask for things only core may
ask for; your copy holds only the scopes it declares and is refused the rest. `clone` prints what
the source reaches for that a copy will not get: the request kinds only core's widgets ask
(`send`, `draft`, `fire-turn`, …), `<sp-host-view>`, and `autofocus`. The printed widget declares
the scopes whose sections the source reads (`session:full` for the messages log), which a user
reviews at install. Mount the copy with `@serene-pub/cli/testing` and read `view.refused` to see
each refusal, and do that work through your own actions instead.

`messages` is **view-only in the app** — an admin can read it but not clone it there, because it
runs on core's trust. A package may still copy it: the host enforces the same refusals whatever
the source says, so the copy keeps the log and loses the composer and sending. `clone` warns you
and lists what goes.

When core changes, `serene-pub drift` says so:

```sh
serene-pub drift .
# ⚑ party-stats (from core's 'stats'): core moved on — you copied 7a2ef1b424f9, core is …
#     changed sessions/stats/StatsWidget.svelte   ← you edited it too: merge by hand
```

It holds each component's `basedOn.sourceHash` against core's source now and lists the files core
changed, added or removed since your copy, marking the ones you edited too. Without a
`based-on.json` it can only list where your copy and core differ now. It exits 1 when core moved
on, so a CI step can say so. Both commands take `--catalog <dir>` to read a directory of
`<slug>.source.json` files instead of the installed catalog.

## 3. A widget from scratch

A widget from scratch is a **component** — a module your package ships — and a widget that
names it.

```sh
serene-pub create component who-next --widget
```

writes `components/WhoNext.svelte` and `components/who-next.ts`, and prints the two
declarations to add. Components live beside `src`, never in it: they run in the page's worker,
with a DOM, and are built by `serene-pub build` — a different program from your plugin's Node
code, which your `tsconfig` for `src` compiles.

<!-- prelude:
import type { GenreDecl } from '@serene-pub/sdk'
declare const myGenre: GenreDecl
-->
```ts
import { component, defineExtension, widget } from '@serene-pub/sdk'

// a widget names the component by slug; `genres` scopes it (absent = every genre)
export const whoNext = widget({ id: 'who-next', title: 'Who next', component: 'who-next', genres: [myGenre] })

export default defineExtension({
	slug: 'acme.who-next',
	name: 'Who next',
	version: '1.0.0',
	components: [
		component({ slug: 'who-next', label: 'Who next', entry: 'components/who-next.ts', framework: 'svelte' }),
	],
	widgets: [whoNext],
})
```

`serene-pub build .` compiles each component into one module under `dist/plugin/components/`.

An admin can also write a component inside the app, or clone one of core's there (**Admin →
Components**) — an _authored component_, kept by that one instance and shared as a
`.component.json` share file rather than packaged. The same rules below apply to it, and the
same compiler builds it. The in-app editor does not type-check, though: for that, and for
anything you mean to ship in a plugin, the CLI stays the route.

### Which sessions offer it

Your **package** declares its widgets; a **genre** decides what its sessions leave out and how
they are laid out.

- A widget with `genres: [someGenre]` is offered in those genres' sessions only; without
  `genres`, in every session. Either way it waits in the layout editor's tray until someone
  places it.
- A genre withholds any package's widgets — core's included — by value:
  `omitWidgets: [coreWidgets.stats]` (`coreWidgets` from `@serene-pub/core-catalog`).
- A genre ships its layouts: `layouts: [layout({ slug: 'default', name: 'Board', preset })]`,
  the first its default. Units name your widgets by their `id`; the packager puts them under your
  package's namespace.
- A genre that withholds the conversation (`omitWidgets: [coreWidgets.conversation]`) must lay
  something else out in the middle — the build refuses it otherwise — and that widget is declared
  `role: 'primary'`. Battleship does exactly this: its board stands where the conversation
  would, with the latest move and line inside it, so a phone needs no second view.

### Where it runs

Not in the page. Your component runs in the page's **UI worker** — one per plugin per session
page — against a small DOM of its own, and the page **mirrors** what it builds. That has three
consequences you will meet on day one:

- **You place host elements.** Plain HTML (`div`, `p`, `button`, `input`, `a`, `img`, lists,
  tables) and the `sp-*` set — `sp-popover`, `sp-menu`, `sp-tabs`, `sp-dialog`, `sp-combobox`,
  `sp-message-body`, `sp-scroll`, `sp-frame` and the rest — which the page renders with its own
  components, so they look and behave like the app's. Anything else is dropped before it reaches
  the page, and so is any attribute the element does not take. `@serene-pub/sdk/host-elements`
  has the typings. Plain elements take the accessibility attributes too: `role`, `aria-label`,
  `aria-labelledby`, `aria-describedby`, `aria-hidden`, `aria-current` for the current item of a
  list, stepper or trail (`page`, `step`, `location`, `date`, `time`, `true` or `false`), and
  `aria-live` for a region that announces its changes (`off` or `polite`). A widget never takes
  `aria-live="assertive"`: it would interrupt whatever the screen reader is saying, and the page
  keeps that for its own alerts. Any other value is dropped with a warning.
- **You style with classes.** The app's utility classes work — the ones the app's own
  stylesheet already has. Those are generated when the app is built, from the classes its own
  code (core's components included) uses; a class nothing there uses does nothing, silently.
  A `<style>` block is dropped at build — styles are not something a component may place — and
  a skin does the rest.
- **No network.** `fetch`, sockets and storage do not exist in the worker, and an image is the
  app's media or your plugin's own file, never another host (R69). Your data arrives on `ctx`;
  anything from outside comes through your plugin's server-side actions, under the network
  permission an admin granted.

### What it is handed

```svelte
<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'

	let { ctx }: { ctx: ComponentContext } = $props()
	let count = $state(ctx.messages?.length ?? 0)
	$effect(() => ctx.subscribe(() => (count = ctx.messages?.length ?? 0)))
</script>

<p class="text-sm">{count} messages</p>
<button type="button" class="btn preset-tonal" onclick={() => ctx.invoke('advance')}>Continue</button>
```

`ctx` carries what a widget reads — the session, its messages (or your widget's channels),
its settings, the actions it may press, the viewer's annex, the theme — and `subscribe` tells you
when any of it changed. `invoke` presses an action; a state-changing one needs a person behind it
(a click the page saw, moments ago). `saveState` keeps a little view state for the next mount.

Without Svelte, `--vanilla` writes a plain module: `defineComponent((root, ctx) => …)` building
the DOM by hand, returning its cleanup.

`ctx.locale` is the viewer's language code: pass it to `i18nText` to show a locale map in the
language the rest of the page speaks.

A scope your widget declares (`session:state`, `characters`, …) delivers its section in
`ctx.scoped` only once an admin grants it — and an admin may refuse, or revoke it while the widget
is open. An absent section therefore means either "not granted" or "not posted yet", so the page
also tells you which scopes you hold: `ctx.grants` (bare scopes, `undefined` until the page has
said), re-sent whenever they change, and `ctx.granted(scope)` for one — `true`, `false`, or
`undefined` while the page has not said. Draw `false` as its own state ("not granted"), never as
loading, or a widget whose scope was refused waits forever:

```svelte
{#if ctx.granted('session:state') === false}
	<p>{ctx.t('This widget has not been granted the session\'s stats.')}</p>
{:else if !ctx.scoped.session_state}
	<p>{ctx.t('Loading…')}</p>
{:else}
	…
{/if}
```

Core's own widgets do this, so a clone of one says "not granted" rather than spinning.

### Carded or flush

A widget placed in a session sits **flush** in its cell: the page draws no card around it, and
your own style decides whether it has a surface. The page draws its card — a surface, a border
and a title bar — when the person turns on the widget's **Card** setting, and always while the
widget is opened for a moment over the session: a pop-over, a flyout, the phone's panel sheet.
Every widget has the setting; you do not declare it.

So a widget that paints its own backdrop should leave it off while the page is carding it, or
the two stack. `ctx.layout.chrome.card` says which it is, and changes arrive with a `layout`
section push:

<!-- prelude:
import type { ComponentContext } from '@serene-pub/component-client'
declare const ctx: ComponentContext
declare const root: HTMLElement
-->
```ts
import type { LayoutV1 } from '@serene-pub/sdk'

const carded = () => (ctx.layout as LayoutV1 | undefined)?.chrome.card ?? false
const paint = () => root.classList.toggle('my-widget-surface', !carded())

paint()
ctx.subscribe((section) => {
	if (section === 'layout') paint()
})
```

The page marks the box your widget is drawn in with the same fact, `data-sp-card="on"` or
`"off"`, for a skin that would rather key a rule off it than read `ctx`.

### Testing it

`@serene-pub/cli/testing` mounts a component the way a session page does — built by the same
bundler, run in a worker by the same runtime, mirrored through the same vocabulary — with a
context you hand it, and gives you the DOM the page would show:

```ts
import { test, expect } from 'vitest'
import { mountComponent } from '@serene-pub/cli/testing'

test('shows the count and continues', async () => {
	const view = await mountComponent({
		entry: 'components/who-next.ts',
		context: { messages: [{ id: 1, role: 'user', content: 'Hi' }] },
	})
	expect(view.query('p')?.textContent).toBe('1 messages')
	await view.click('button')
	expect(view.invoked).toEqual([{ key: 'advance' }])
	expect(view.refused).toEqual([]) // nothing the page would drop
	await view.unmount()
})
```

`push(section, value)` changes what the page sent; `input`, `check`, `click`, `pressKey` and
`dispatch` act as a person would, and each waits until the component has finished answering (work
it schedules for later — a timer, an awaited call — is yours to wait for; `settle()` waits again).
`pressKey('.amount', 'Enter')` is a keydown: a plain `<input keys="Escape Enter" onkey={…}>` hears
the keys its `keys` names as `key` (`{ key, shift, ctrl, meta }`), kept from the field, and every
other key stays the field's; it resolves to whether the press was kept. Such a field also raises
`blur` when it is left, and `dispatch('.amount', 'blur')` stands in for that. `event(e)` delivers a
widget event only where the page would — `lore:ranked` and `lore:marked` reach a plugin's widget
granted `lore` (`grants`), and no other. The component is told those `grants` as the page tells
it (a plugin's box given none is told it holds none), and `setGrants([...])` changes them while it
is mounted, as an admin's review does — told again, a section no longer covered withdrawn.
`refused` lists
anything the vocabulary dropped — an element, an attribute, a value — so a test holds a component
to what the page will actually show; `errors` lists what the component said went wrong, or threw
while handling an event.

The harness is held to the page's rules, not gentler than them:

- **`reads`.** Pass your declaration's `reads` (`reads: myWidget.reads`): a base section it does
  not name is never posted, as on the page — the `channels` lanes are the `messages` section, so
  they need `messages` — and neither is an event about one: `message:created` needs `messages`,
  `layout:changed` needs `layout`. Saved `state`, `theme`, `grants` and granted scoped sections
  are always posted. Left out, the widget reads every base section, as a declaration without
  `reads` does.
- **The invoke gate.** A plugin's box invokes one of core's verbs that change a message (`hide`,
  `retry`, `extend`, `delete`, `edit`, `swipe`) only while a person is acting in it: a `click`,
  `pressKey`, `input` or `check` on an element the component listens on, within the last five
  seconds and not since `blur` — or a press in an `sp-frame`'s document (`dispatch(frame,
  'invoke', …)`). Otherwise the invoke lands in `refusedInvokes` (with the page's `reason`), not
  in `invoked`. The verb is resolved against the `actions` you posted, else read from the key
  (`retry`, `core#retry`); your own actions are the server's to judge and pass. `invokeGate: false`
  records every invoke, for a test that only cares about the call. Core's box is not gated.
- **Ids.** Every box's ids are prefixed per mount (`id`, `for`, `aria-*` references, a `#fragment`,
  a control's `name`), so a component never names one of the page's elements: match elements by
  class or tag, or by `#${view.idPrefix}name`. Only core's own conversation keeps its native ids
  (`owner: 'core', coreConversation: true`).

What the page does that the harness does not: it renders `sp-*` elements with the app's own
components (here they stay as themselves, attributes and children intact), and it asks the person
before a widget's `retry`, `extend`, `advance` or a plugin's `edit` goes through.

It needs a DOM to mirror into: run the test in a DOM environment (vitest's
`environment: 'happy-dom'`), or install `happy-dom` and the harness brings its own.

## 4. An embedded document

For the one region that needs a real DOM — a charting library that measures, a rich-text editor
— place an `sp-frame`:

```svelte
<sp-frame src="ui/chart.html" title="Chart" props={JSON.stringify({ points })}></sp-frame>
```

The page gives that document an opaque-origin frame and a port; it receives `props` and raises
`action`. Everything around it stays a component. `create component --embed-document` adds one
and its document stub (`ui/<slug>.html` and its script beside it — the document's CSP takes no
inline script).
