/**
 * The component harness (§3.5, C3b): a component mounts in a worker with a
 * canned context, and the test reads what the page would show — through
 * the vocabulary, with events and invokes crossing as they do in a session.
 */
import { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { assertRefusedMount, mountComponent, test } from './harnessGuard.js'
import { writeComponentScaffold } from '../cli/src/scaffoldComponent.js'

const dirs: string[] = []
async function pkg(): Promise<string> {
	// Beside the repo, not the OS temp dir: the harness caches under the package.
	const base = resolve(import.meta.dirname, '..', 'node_modules', '.cache')
	await mkdir(base, { recursive: true })
	const dir = await mkdtemp(join(base, 'sp-harness-'))
	dirs.push(dir)
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'harness-fixture', type: 'module' }))
	await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
	return dir
}
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

test('a scaffolded Svelte component renders its canned context, and hears a change', async () => {
	const dir = await pkg()
	await writeComponentScaffold(dir, { slug: 'who-next' })
	const view = await mountComponent({
		root: dir,
		entry: 'components/who-next.ts',
		context: { messages: [{ id: 1 }, { id: 2 }] },
	})
	try {
		assert.equal(view.query('p')?.textContent, '2 messages')
		await view.push('messages', [{ id: 1 }, { id: 2 }, { id: 3 }])
		assert.equal(view.query('p')?.textContent, '3 messages')
		assert.deepEqual(view.refused, [])
	} finally {
		await view.unmount()
	}
})

test('a click, a bound input and a checkbox cross as they do in a session', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Form.svelte'),
		`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	let draft = $state('')
	let ticked = $state(false)
</script>
<input class="draft" bind:value={draft} />
<p class="echo">{draft}</p>
<label><input class="tick" type="checkbox" bind:checked={ticked} /> {ticked}</label>
<button type="button" onclick={() => { ctx.invoke('send', { payload: { text: draft } }); draft = '' }}>Send</button>
`,
	)
	await writeFile(
		join(dir, 'src/form.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport Form from './Form.svelte'\nexport default svelteComponent(Form)\n`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/form.ts' })
	try {
		await view.input('.draft', 'hello')
		assert.equal(view.query('.echo')?.textContent, 'hello')
		await view.click('button')
		assert.deepEqual(view.invoked, [{ key: 'send', payload: { text: 'hello' } }])
		// Emptied after send: the page's field shows it, not the stale text.
		assert.equal(view.query<HTMLInputElement>('.draft')?.value, '')
		await view.check('.tick')
		assert.match(view.query('label')?.textContent ?? '', /true/)
	} finally {
		await view.unmount()
	}
})

test('what the vocabulary refuses never lands, and is said', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/bad.ts'),
		`import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root) => {
	const s = document.createElement('script'); s.textContent = 'alert(1)'; root.append(s)
	const a = document.createElement('a'); a.setAttribute('href', 'javascript:alert(1)'); a.setAttribute('onclick', 'x()'); a.textContent = 'x'; root.append(a)
	const badge = document.createElement('sp-badge'); badge.setAttribute('tone', 'primary'); badge.textContent = 'ok'; root.append(badge)
})
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/bad.ts' })
	try {
		assert.equal(view.query('script') === null, true)
		const a = view.query('a')!
		assert.equal(a.getAttribute('href'), null)
		assert.equal(a.getAttribute('onclick'), null)
		assert.equal(a.getAttribute('rel'), 'noopener noreferrer')
		assert.equal(view.query('sp-badge')?.getAttribute('tone'), 'primary')
		assert.ok(view.refused.some((r) => r.includes('<script>')))
		assert.ok(view.refused.some((r) => r.includes('onclick')))
	} finally {
		await view.unmount()
	}
})

test('an sp element event carries its declared detail; the locale arrives on ctx', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/tabs.ts'),
		`import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root, ctx) => {
	const tabs = document.createElement('sp-tabs')
	const out = document.createElement('p')
	tabs.addEventListener('change', (e) => { out.textContent = (e as CustomEvent).detail.value + '/' + ctx.locale })
	root.append(tabs, out)
})
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/tabs.ts', context: { locale: 'fr' } })
	try {
		await view.dispatch('sp-tabs', 'change', { value: 'b' })
		assert.equal(view.query('p')?.textContent, 'b/fr')
	} finally {
		await view.unmount()
	}
})

test('a component that throws on mount fails the mount, with its message', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(join(dir, 'src/boom.ts'), `export default () => { throw new Error('boom') }\n`)
	await assertRefusedMount(mountComponent({ root: dir, entry: 'src/boom.ts' }), /boom/)
})

test('a handler that throws is said, and the component lives on', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Throws.svelte'),
		`<script lang="ts">
	let n = $state(0)
</script>
<button class="bad" type="button" onclick={() => { throw new Error('kaboom') }}>bad</button>
<button class="good" type="button" onclick={() => n++}>{n}</button>
`,
	)
	await writeFile(
		join(dir, 'src/throws.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport T from './Throws.svelte'\nexport default svelteComponent(T)\n`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/throws.ts' })
	try {
		await view.click('.bad')
		assert.ok(view.errors.some((e) => /kaboom/.test(e.message)))
		await view.click('.good')
		assert.equal(view.query('.good')?.textContent, '1')
	} finally {
		await view.unmount()
	}
})

test('a click on a checkbox reports the change it causes, not the click', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Tick.svelte'),
		`<script lang="ts">
	let on = $state(false)
</script>
<input class="tick" type="checkbox" bind:checked={on} /><span class="out">{on}</span>
`,
	)
	await writeFile(
		join(dir, 'src/tick.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport T from './Tick.svelte'\nexport default svelteComponent(T)\n`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/tick.ts' })
	try {
		await view.click('.tick')
		assert.equal(view.query('.out')?.textContent, 'true')
	} finally {
		await view.unmount()
	}
})

test('a tick the component refuses stays unticked on the page', async () => {
	// Both boxes start unticked, so what the worker last SENT for `checked`
	// is absent: an untick written after the person's tick is still news to
	// the page, whether `bind:checked` writes it or the element's own property.
	const dir = await svelteFixture(
		'Refuse',
		`<script lang="ts">
	let on = $state(false)
	let box: HTMLInputElement | undefined = $state()
</script>
<input class="refused" type="checkbox" bind:checked={on} onchange={() => { on = false }} />
<span class="out">{on}</span>
<input class="kept" type="checkbox" bind:this={box} />
<button type="button" class="untick" onclick={() => { if (box) box.checked = false }}>untick</button>
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/Refuse.ts' })
	try {
		await view.check('.refused')
		assert.equal(view.query('.out')?.textContent, 'false')
		assert.equal(view.query<HTMLInputElement>('.refused')?.checked, false, 'the refused tick is undone on the page')
		await view.check('.kept')
		await view.click('.untick')
		assert.equal(view.query<HTMLInputElement>('.kept')?.checked, false, '`box.checked = false` reaches the page')
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

test('two mounts at once share the lent DOM, and the first to leave does not take it', async () => {
	const dir = await pkg()
	await writeComponentScaffold(dir, { slug: 'pair' })
	const [a, b] = await Promise.all([
		mountComponent({ root: dir, entry: 'components/pair.ts', context: { messages: [] } }),
		mountComponent({ root: dir, entry: 'components/pair.ts', context: { messages: [{ id: 1 }] } }),
	])
	await a.unmount()
	try {
		await b.push('messages', [{ id: 1 }, { id: 2 }])
		assert.equal(b.query('p')?.textContent, '2 messages')
	} finally {
		await b.unmount()
	}
})

test("a class written through `className` on an sp element reaches the page (Svelte's way)", async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/cls.ts'),
		`export default (root) => { const f = document.createElement('sp-frame'); f.className = 'grow block'; f.setAttribute('src', 'ui/x.html'); root.append(f) }\n`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/cls.ts' })
	try {
		assert.equal(view.query('sp-frame')?.getAttribute('class'), 'grow block')
	} finally {
		await view.unmount()
	}
})

test("a Svelte `class={…}` expression reaches the page on a plain element too", async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Dyn.svelte'),
		`<script lang="ts">let on = $state(true); const k = () => on ? 'is-on' : 'is-off'</script>\n<button type="button" class={\`btn \${k()}\`} onclick={() => (on = !on)}>x</button>\n`,
	)
	await writeFile(
		join(dir, 'src/dyn.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport D from './Dyn.svelte'\nexport default svelteComponent(D)\n`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/dyn.ts' })
	try {
		assert.equal(view.query('button')?.getAttribute('class'), 'btn is-on')
		await view.click('button')
		assert.equal(view.query('button')?.getAttribute('class'), 'btn is-off')
	} finally {
		await view.unmount()
	}
})

test('a boolean Svelte writes as a property (`disabled`) reaches the page as its attribute', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Dis.svelte'),
		`<script lang="ts">let text = $state('')</script>\n<input class="f" bind:value={text} /><button type="button" class="send" disabled={!text.trim()}>Send</button>\n`,
	)
	await writeFile(
		join(dir, 'src/dis.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport D from './Dis.svelte'\nexport default svelteComponent(D)\n`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/dis.ts' })
	try {
		assert.equal(view.query('.send')?.hasAttribute('disabled'), true)
		await view.input('.f', 'hello')
		assert.equal(view.query('.send')?.hasAttribute('disabled'), false)
	} finally {
		await view.unmount()
	}
})

/** A Svelte component and its entry, written into a fresh fixture package. */
async function svelteFixture(name: string, source: string): Promise<string> {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(join(dir, `src/${name}.svelte`), source)
	await writeFile(
		join(dir, `src/${name}.ts`),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport C from './${name}.svelte'\nexport default svelteComponent(C)\n`,
	)
	return dir
}

test('a menu closed and an action invoked in one handler: the page sees the menu go first', async () => {
	const dir = await svelteFixture(
		'Menu',
		`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	let open = $state(true)
</script>
<sp-popover open={open}>
	{#if open}<div class="menu"><button type="button" class="branch" onclick={() => { open = false; ctx.invoke('branch', { messageId: 7 }) }}>Branch from here</button></div>{/if}
</sp-popover>
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/Menu.ts' })
	try {
		// What the page shows at the moment each invoke arrives.
		const log: Array<{ key: string; menu: boolean; open: boolean }> = []
		const record = view.invoked.push.bind(view.invoked)
		view.invoked.push = (...records) => {
			for (const r of records)
				log.push({ key: r.key, menu: !!view.query('.menu'), open: !!view.query('sp-popover')?.hasAttribute('open') })
			return record(...records)
		}
		assert.equal(view.query('sp-popover')?.getAttribute('open'), '')
		await view.click('.branch')
		assert.deepEqual(log, [{ key: 'branch', menu: false, open: false }])
		assert.deepEqual([...view.invoked], [{ key: 'branch', messageId: 7 }])
	} finally {
		await view.unmount()
	}
})

test('hidden / inert on an sp element cross present-or-absent, and a string prop as its attribute', async () => {
	const dir = await svelteFixture(
		'Flags',
		`<script lang="ts">
	let show = $state(true)
	let tone = $state('primary')
	let pct = $state(40)
</script>
<sp-badge class="a" hidden={!show} tone={tone}>A</sp-badge>
<sp-badge class="b" hidden={show}>B</sp-badge>
<sp-scroll class="s" inert={!show}></sp-scroll>
<sp-progress class="p" value={pct}></sp-progress>
<button type="button" class="t" onclick={() => { show = !show; tone = 'warning'; pct = 60 }}>t</button>
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/Flags.ts' })
	try {
		assert.equal(view.query('.a')?.getAttribute('hidden'), null)
		assert.equal(view.query('.b')?.getAttribute('hidden'), '')
		assert.equal(view.query('.s')?.getAttribute('inert'), null)
		assert.equal(view.query('.a')?.getAttribute('tone'), 'primary')
		assert.equal(view.query('.p')?.getAttribute('value'), '40')
		await view.click('.t')
		assert.equal(view.query('.a')?.getAttribute('hidden'), '')
		assert.equal(view.query('.b')?.getAttribute('hidden'), null)
		assert.equal(view.query('.s')?.getAttribute('inert'), '')
		assert.equal(view.query('.a')?.getAttribute('tone'), 'warning')
		assert.equal(view.query('.p')?.getAttribute('value'), '60')
		assert.deepEqual(view.refused, [])
	} finally {
		await view.unmount()
	}
})

test('a spread that loses its value or checked resets the control, and nothing throws', async () => {
	const dir = await svelteFixture(
		'Spread',
		`<script lang="ts">
	let attrs = $state<Record<string, unknown>>({ value: 'a' })
	let box = $state<Record<string, unknown>>({ checked: true })
</script>
<input class="f" {...attrs} />
<input class="c" type="checkbox" {...box} />
<button type="button" class="clear" onclick={() => { attrs = {}; box = {} }}>clear</button>
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/Spread.ts' })
	try {
		assert.equal(view.query<HTMLInputElement>('.f')?.value, 'a')
		assert.equal(view.query<HTMLInputElement>('.c')?.checked, true)
		await view.click('.clear')
		assert.deepEqual(view.errors, [])
		assert.equal(view.query<HTMLInputElement>('.f')?.value, '')
		assert.equal(view.query<HTMLInputElement>('.c')?.checked, false)
	} finally {
		await view.unmount()
	}
})

test('a default re-assigned while the person types never overwrites what they typed', async () => {
	// Svelte re-assigns `defaultValue` in the template's one effect, so every
	// keystroke writes it again; on the page the attribute is the live value.
	const dir = await svelteFixture(
		'Typed',
		`<script lang="ts">
	let text = $state('')
	let dv = $state('a')
</script>
<input class="f" bind:value={text} defaultValue={dv} />
<p class="echo">{text}</p>
<button type="button" class="dv" onclick={() => { dv = 'z' }}>dv</button>
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/Typed.ts' })
	try {
		await view.input('.f', 'hello')
		assert.equal(view.query('.echo')?.textContent, 'hello')
		assert.equal(view.query<HTMLInputElement>('.f')?.value, 'hello')
		await view.click('.dv')
		assert.equal(view.query<HTMLInputElement>('.f')?.value, 'hello')
		assert.equal(view.query('.echo')?.textContent, 'hello')
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

test("a click on a button's label or icon reaches the button's handler, once", async () => {
	const dir = await svelteFixture(
		'Label',
		`<script lang="ts">
	let n = $state(0)
</script>
<button type="button" class="b" onclick={() => n++}><span class="label">Send</span><sp-icon name="send"></sp-icon></button>
<p class="n">{n}</p>
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/Label.ts' })
	try {
		await view.click('.label')
		assert.equal(view.query('.n')?.textContent, '1')
		await view.click('.b sp-icon')
		assert.equal(view.query('.n')?.textContent, '2')
		await view.click('.b')
		assert.equal(view.query('.n')?.textContent, '3')
	} finally {
		await view.unmount()
	}
})

test('a click on an icon inside a link reaches its handler once, and the copy never activates the link', async () => {
	const dir = await svelteFixture(
		'Link',
		`<script lang="ts">
	let n = $state(0)
</script>
<a class="docs" href="https://example.com/docs" target="_blank" onclick={() => n++}><sp-icon name="book-open"></sp-icon>Docs</a>
<p class="n">{n}</p>
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/Link.ts' })
	const win = view.root.ownerDocument.defaultView as unknown as { open: (...a: unknown[]) => unknown; MouseEvent: typeof MouseEvent }
	const open = win.open
	try {
		// The person's click opens the link once, on its way up; a MouseEvent
		// copy dispatched at the link would open it a second time.
		const opened: unknown[] = []
		win.open = (...a: unknown[]) => (opened.push(a), null)
		const reached: boolean[] = []
		const a = view.query('a.docs')!
		a.addEventListener('click', (e) => e.target === a && reached.push(e instanceof win.MouseEvent))
		await view.click('a.docs sp-icon')
		assert.equal(view.query('.n')?.textContent, '1')
		assert.deepEqual(reached, [false])
		assert.deepEqual(opened, [['https://example.com/docs', '_blank', 'noreferrer,noopener']])
	} finally {
		win.open = open
		await view.unmount()
	}
})

test('what a component writes into a subtree the page refused is dropped with it; the component runs on', async () => {
	// The page never lands an <svg>, so the text, the child and the attribute
	// the component later writes inside it reach no node: dropped, as on the
	// page — never a fatal error for a receiver that has no such node.
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/drawn.ts'),
		`import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root) => {
	const svg = document.createElement('svg')
	const title = document.createElement('title')
	const label = document.createTextNode('0')
	title.append(label)
	svg.append(title)
	const count = document.createElement('p')
	count.textContent = '0'
	const bump = document.createElement('button')
	bump.textContent = 'bump'
	let n = 0
	let extra: Element | undefined
	bump.addEventListener('click', () => {
		n++
		label.data = String(n)
		if (extra) {
			extra.remove()
			extra = undefined
		} else {
			extra = document.createElement('g')
			svg.append(extra)
		}
		svg.setAttribute('class', 'n' + n)
		count.textContent = String(n)
	})
	root.append(svg, count, bump)
})
`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/drawn.ts' })
	try {
		assert.equal(view.query('svg') === null, true)
		assert.ok(view.refused.some((r) => r.includes('<svg>')), view.refused.join('; '))
		for (let i = 1; i <= 3; i++) {
			await view.click('button')
			assert.equal(view.query('p')?.textContent, String(i), `the component still answers, click ${i}`)
		}
		assert.equal(view.query('svg, title, g, .n3') === null, true)
		assert.deepEqual(
			view.errors.filter((e) => e.fatal),
			[],
		)
	} finally {
		await view.unmount()
	}
})

// ─── requests (R21 lane 0: the harness answers `ctx.request`) ───────────────

/** A component that asks the page three things and prints what came back. */
async function askerPkg(): Promise<string> {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Asker.svelte'),
		`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	let out = $state('')
	async function ask(kind: string, params: Record<string, unknown>) {
		try {
			const r = await ctx.request(kind as never, params as never)
			out = 'ok ' + JSON.stringify(r ?? null)
		} catch (e) {
			out = 'no ' + (e as Error).message
			ctx.error((e as Error).message)
		}
	}
</script>
<button class="entries" type="button" onclick={() => ask('session-entries', { limit: 5 })}>entries</button>
<button class="write" type="button" onclick={() => ask('set-attribute-value', { owner: { kind: 'session', id: 1 }, slotId: 'core:slot/weather@1', value: 'rain' })}>write</button>
<button class="page" type="button" onclick={() => ask('messages', { channel: 'main', limit: 2 })}>page</button>
<p class="out">{out}</p>
`,
	)
	await writeFile(
		join(dir, 'src/asker.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport Asker from './Asker.svelte'\nexport default svelteComponent(Asker)\n`,
	)
	return dir
}

test("the test answers a component's requests as the page would, and every ask is logged", async () => {
	const dir = await askerPkg()
	const asked: string[] = []
	const view = await mountComponent({
		root: dir,
		entry: 'src/asker.ts',
		grants: ['lore'],
		requests: (kind) => {
			asked.push(kind)
			if (kind === 'session-entries')
				return Promise.resolve({ lorebookId: 4, ownerOnly: false, rows: [], total: 0, offset: 0 })
			if (kind === 'messages') return { rows: [{ id: 7 }], nextCursor: 'c1' }
			return undefined
		},
	})
	try {
		await view.click('.entries')
		assert.equal(view.query('.out')?.textContent, 'ok {"lorebookId":4,"ownerOnly":false,"rows":[],"total":0,"offset":0}')
		// `messages` is answered as the page answers it: a page, rows and cursor.
		await view.click('.page')
		assert.equal(view.query('.out')?.textContent, 'ok {"rows":[{"id":7}],"nextCursor":"c1"}')
		// A core-only kind from a plugin's box is declined by the table — never asked of the test.
		await view.click('.write')
		assert.equal(view.query('.out')?.textContent, "no only core's own widgets ask 'set-attribute-value'")
		assert.deepEqual(asked, ['session-entries', 'messages'])
		assert.deepEqual(view.requested, [
			{ kind: 'session-entries', params: { limit: 5 } },
			{ kind: 'messages', params: { channel: 'main', limit: 2 } },
			{
				kind: 'set-attribute-value',
				params: { owner: { kind: 'session', id: 1 }, slotId: 'core:slot/weather@1', value: 'rain' },
			},
		])
	} finally {
		await view.unmount()
	}
})

test("a request that reads a scope needs the grant; core's box holds every scope and may write", async () => {
	const dir = await askerPkg()
	const plugin = await mountComponent({ root: dir, entry: 'src/asker.ts', requests: () => ({ rows: [] }) })
	try {
		await plugin.click('.entries')
		assert.match(plugin.query('.out')?.textContent ?? '', /^no 'session-entries' reads what the 'lore' scope covers/)
	} finally {
		await plugin.unmount()
	}
	const core = await mountComponent({
		root: dir,
		entry: 'src/asker.ts',
		owner: 'core',
		requests: (kind) => {
			if (kind === 'set-attribute-value') return undefined
			throw new Error('the session reads into no book')
		},
	})
	try {
		await core.click('.write')
		assert.equal(core.query('.out')?.textContent, 'ok null')
		// A handler that throws declines, with its words.
		await core.click('.entries')
		assert.equal(core.query('.out')?.textContent, 'no the session reads into no book')
	} finally {
		await core.unmount()
	}
})

test('an answer that rejects declines with its words, as a throw does', async () => {
	const dir = await askerPkg()
	const view = await mountComponent({
		root: dir,
		entry: 'src/asker.ts',
		owner: 'core',
		requests: () => Promise.reject(new Error('the book is archived')),
	})
	try {
		await view.click('.entries')
		assert.equal(view.query('.out')?.textContent, 'no the book is archived')
		// Answered, so nothing is left to decline at unmount.
		assert.deepEqual(view.errors, [{ message: 'the book is archived', fatal: false }])
	} finally {
		await view.unmount()
	}
	assert.deepEqual(view.errors, [{ message: 'the book is archived', fatal: false }])
})

test('what nobody answered is declined at unmount, while the component can still hear it', async () => {
	const dir = await askerPkg()
	// No answer for anything but `messages`, which is declined — silently, as the page declines a page.
	const view = await mountComponent({
		root: dir,
		entry: 'src/asker.ts',
		owner: 'core',
		requests: (kind) => {
			if (kind === 'messages') throw new Error('no older messages')
			return new Promise(() => {})
		},
	})
	await view.click('.page')
	await view.click('.write')
	// Both still waiting: nothing came back to print.
	assert.equal(view.query('.out')?.textContent, '')
	assert.deepEqual(
		view.requested.map((r) => r.kind),
		['messages', 'set-attribute-value'],
	)
	await view.unmount()
	assert.deepEqual(view.errors, [
		{ message: 'the page was unmounted before it answered', fatal: false },
		{ message: 'the page was unmounted before it answered', fatal: false },
	])
})

test("the harness's unmount decline carries the code `unmounted`, not only its sentence", async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Coder.svelte'),
		`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	function ask() {
		ctx.request('set-attribute-value' as never, { owner: { kind: 'session', id: 1 }, slotId: 'core:slot/weather@1', value: 'rain' } as never)
			.catch((e) => ctx.error(String((e as { code?: unknown }).code) + ' ' + (e as Error).name))
	}
</script>
<button class="write" type="button" onclick={ask}>write</button>
`,
	)
	await writeFile(
		join(dir, 'src/coder.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport Coder from './Coder.svelte'\nexport default svelteComponent(Coder)\n`,
	)
	const view = await mountComponent({ root: dir, entry: 'src/coder.ts', owner: 'core', requests: () => new Promise(() => {}) })
	await view.click('.write')
	await view.unmount()
	assert.deepEqual(view.errors, [{ message: 'unmounted RequestDeclined', fatal: false }])
})

// ─── scoped sections (K9: the page never posts one past its grant) ──────────

/** A component that prints the names of the scoped sections it holds. */
async function holderPkg(): Promise<string> {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Holder.svelte'),
		`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	const names = () => Object.keys(ctx.scoped ?? {}).sort().join(',')
	let held = $state(names())
	$effect(() => ctx.subscribe(() => (held = names())))
</script>
<p class="held">{held}</p>
`,
	)
	await writeFile(
		join(dir, 'src/holder.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport Holder from './Holder.svelte'\nexport default svelteComponent(Holder)\n`,
	)
	return dir
}

const everySection = {
	session_state: { sessionId: 1, loaded: true, error: null, resolved: { world: {}, cast: {} }, slots: [], owners: [] },
	characters: { members: [], sceneImages: { left: null, right: null } },
} as never

test("a plugin's box is posted only the scoped sections its grants cover; core's box every one", async () => {
	const dir = await holderPkg()
	const plugin = await mountComponent({
		root: dir,
		entry: 'src/holder.ts',
		grants: ['session:state'],
		context: { scoped: everySection },
	})
	try {
		assert.equal(plugin.query('.held')?.textContent, 'session_state')
		// A later push is held to the same grant.
		await plugin.push('scoped', everySection)
		assert.equal(plugin.query('.held')?.textContent, 'session_state')
	} finally {
		await plugin.unmount()
	}
	const ungranted = await mountComponent({ root: dir, entry: 'src/holder.ts', context: { scoped: everySection } })
	try {
		assert.equal(ungranted.query('.held')?.textContent, '')
	} finally {
		await ungranted.unmount()
	}
	const core = await mountComponent({ root: dir, entry: 'src/holder.ts', owner: 'core', context: { scoped: everySection } })
	try {
		assert.equal(core.query('.held')?.textContent, 'characters,session_state')
	} finally {
		await core.unmount()
	}
})

test("core's box given grants is posted only the scoped sections they cover, as the page posts core's widget its declared scopes", async () => {
	const dir = await holderPkg()
	const core = await mountComponent({
		root: dir,
		entry: 'src/holder.ts',
		owner: 'core',
		grants: ['session:state'],
		context: { scoped: everySection },
	})
	try {
		assert.equal(core.query('.held')?.textContent, 'session_state')
		// A later push is held to the same grant.
		await core.push('scoped', everySection)
		assert.equal(core.query('.held')?.textContent, 'session_state')
	} finally {
		await core.unmount()
	}
	// Declaring none, it is posted none.
	const bare = await mountComponent({ root: dir, entry: 'src/holder.ts', owner: 'core', grants: [], context: { scoped: everySection } })
	try {
		assert.equal(bare.query('.held')?.textContent, '')
	} finally {
		await bare.unmount()
	}
})

async function grantsPkg(): Promise<string> {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/Grants.svelte'),
		`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	const say = (v: boolean | undefined) => (v === undefined ? 'unknown' : v ? 'yes' : 'no')
	const read = () => [say(ctx.granted('session:state')), Object.keys(ctx.scoped ?? {}).sort().join(',')].join('|')
	let shown = $state(read())
	$effect(() => ctx.subscribe(() => (shown = read())))
</script>
<p class="granted">{shown}</p>
`,
	)
	await writeFile(
		join(dir, 'src/grants.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport Grants from './Grants.svelte'\nexport default svelteComponent(Grants)\n`,
	)
	return dir
}

test('a component is told which of its scopes were granted: not granted is said, never left as loading', async () => {
	const dir = await grantsPkg()
	// A plugin's box granted nothing: told so, not left waiting.
	const bare = await mountComponent({ root: dir, entry: 'src/grants.ts', context: { scoped: everySection } })
	try {
		assert.equal(bare.query('.granted')?.textContent, 'no|')
	} finally {
		await bare.unmount()
	}
	// Granted: told so, and the section arrives.
	const granted = await mountComponent({ root: dir, entry: 'src/grants.ts', grants: ['session:state'], context: { scoped: everySection } })
	try {
		assert.equal(granted.query('.granted')?.textContent, 'yes|session_state')
		// Revoked at runtime, as an admin's review does: told, and the section withdrawn.
		await granted.setGrants([])
		assert.equal(granted.query('.granted')?.textContent, 'no|')
		// Granted again: told; the section arrives on the next push.
		await granted.setGrants(['session:state'])
		assert.equal(granted.query('.granted')?.textContent, 'yes|')
		await granted.push('scoped', everySection)
		assert.equal(granted.query('.granted')?.textContent, 'yes|session_state')
	} finally {
		await granted.unmount()
	}
	// Core's box with no grants holds every scope.
	const core = await mountComponent({ root: dir, entry: 'src/grants.ts', owner: 'core', context: { scoped: everySection } })
	try {
		assert.equal(core.query('.granted')?.textContent, 'yes|characters,session_state')
	} finally {
		await core.unmount()
	}
})

test("rows arrive as the page posts them: the host's bookkeeping stripped (MESSAGE_HOST_FIELDS)", async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/keys.ts'),
		`import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root, ctx) => {
	const base = document.createElement('p')
	base.setAttribute('class', 'base')
	const paged = document.createElement('p')
	paged.setAttribute('class', 'paged')
	const btn = document.createElement('button')
	btn.setAttribute('class', 'page')
	btn.setAttribute('type', 'button')
	btn.textContent = 'page'
	btn.addEventListener('click', async () => {
		const r = (await ctx.request('messages' as never, {} as never)) as { rows: object[] }
		paged.textContent = r.rows.map((row) => Object.keys(row).sort().join(',')).join('|')
	})
	root.append(base, paged, btn)
	const draw = () => (base.textContent = (ctx.messages ?? []).map((row) => Object.keys(row).sort().join(',')).join('|'))
	draw()
	return ctx.subscribe(draw)
})
`,
	)
	const stored = {
		id: 1,
		role: 'user',
		content: 'hi',
		userId: 2,
		queueItemId: 'q',
		debugMeta: { prompt: 'secret' },
		embedding: [0.1],
		embeddingModel: 'm',
		vectorizedAt: 'now',
		version: 3,
	}
	const view = await mountComponent({
		root: dir,
		entry: 'src/keys.ts',
		context: { messages: [stored] as never },
		requests: (kind) => (kind === 'messages' ? { rows: [stored] } : undefined),
	})
	try {
		assert.equal(view.query('.base')?.textContent, 'content,id,role')
		await view.click('.page')
		assert.equal(view.query('.paged')?.textContent, 'content,id,role')
	} finally {
		await view.unmount()
	}
})
