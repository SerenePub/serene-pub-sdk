/**
 * The component harness, on `keys` (R80) and the events a box is told (R81):
 * a component's plain `<input keys="Escape Enter" onkey>` hears Escape and
 * Enter as the page raises them — kept from the field — and no other key,
 * its number field still a number field; a widget event about scoped data
 * reaches a plugin's box only with the scope granted, core's always.
 */
import { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { mountComponent, test } from './harnessGuard.js'

const dirs: string[] = []
async function pkg(): Promise<string> {
	// Beside the repo, not the OS temp dir: the harness caches under the package.
	const base = resolve(import.meta.dirname, '..', 'node_modules', '.cache')
	await mkdir(base, { recursive: true })
	const dir = await mkdtemp(join(base, 'sp-harness-keys-'))
	dirs.push(dir)
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'harness-keys-fixture', type: 'module' }))
	await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
	return dir
}
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

/** A Svelte component and its entry, written into a fresh fixture package. */
async function svelteFixture(source: string): Promise<string> {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(join(dir, 'src/C.svelte'), source)
	await writeFile(
		join(dir, 'src/c.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport C from './C.svelte'\nexport default svelteComponent(C)\n`,
	)
	return dir
}

test('a plain input with keys hears Escape and Enter as key, kept from the field — and no other key', async () => {
	const dir = await svelteFixture(`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	let n = $state(3)
	let heard = $state<string[]>([])
	const onkey = (e: CustomEvent<{ key: string; shift: boolean; ctrl: boolean; meta: boolean }>) => {
		heard = [...heard, \`\${e.detail.key}:\${e.detail.ctrl ? 'ctrl' : ''}:\${n}\`]
		if (e.detail.key === 'Enter') ctx.invoke('commit', { payload: { value: n } })
	}
</script>
<input class="n" type="number" min="0" max="9" keys="Escape Enter" bind:value={n} {onkey} />
<p class="heard">{heard.join(' ')}</p>
`)
	const view = await mountComponent({ root: dir, entry: 'src/c.ts', owner: 'acme.stats' })
	try {
		const field = view.query<HTMLInputElement>('.n')!
		assert.equal(field.getAttribute('keys'), 'Escape Enter')
		assert.equal(field.getAttribute('type'), 'number')
		assert.deepEqual(view.refused, [])
		// Typed first: the value crosses as it always did, a number again in the component.
		await view.input('.n', '7')
		assert.equal(await view.pressKey('.n', 'Enter', { ctrl: true }), true)
		assert.equal(await view.pressKey('.n', 'Escape'), true)
		assert.equal(view.query('.heard')?.textContent, 'Enter:ctrl:7 Escape::7')
		assert.deepEqual(view.invoked, [{ key: 'commit', payload: { value: 7 } }])
		// The field's own keys stay the field's, and reach no handler.
		for (const key of ['ArrowUp', '5', 'Tab'])
			assert.equal(await view.pressKey('.n', key), false, key)
		assert.equal(await view.pressKey('.n', 'Enter', { shift: true }), false)
		assert.equal(view.query('.heard')?.textContent, 'Enter:ctrl:7 Escape::7')
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

test('a keys token the grammar refuses never lands, and the field hears nothing', async () => {
	const dir = await svelteFixture(`<script lang="ts">
	let heard = $state(0)
</script>
<input class="n" keys="Ctrl+Enter" onkey={() => heard++} />
<p class="heard">{heard}</p>
`)
	const view = await mountComponent({ root: dir, entry: 'src/c.ts' })
	try {
		assert.equal(view.query('.n')?.hasAttribute('keys'), false)
		assert.match(view.refused.join(' '), /input keys 'Ctrl\+Enter'/)
		assert.equal(await view.pressKey('.n', 'Enter', { ctrl: true }), false)
		assert.equal(view.query('.heard')?.textContent, '0')
	} finally {
		await view.unmount()
	}
})

test("a person's Enter on a keyed input opens the box's invoke gate, as on the page; a raised key alone never does", async () => {
	// A stat field whose Enter edits a message — a core verb a plugin's box may
	// invoke only with a person acting in it (`personGateVerdict`).
	const dir = await svelteFixture(`<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	const onkey = () => ctx.invoke('edit', { messageId: 1, payload: { content: 'x' } })
</script>
<input class="n" type="number" keys="Enter" {onkey} />
`)
	const view = await mountComponent({ root: dir, entry: 'src/c.ts', owner: 'acme.stats' })
	try {
		// The element's own event, no person behind it: refused.
		await view.dispatch('.n', 'key', { key: 'Enter', shift: false, ctrl: false, meta: false })
		assert.equal(view.invoked.length, 0)
		assert.equal(view.refusedInvokes.length, 1)
		assert.match(view.refusedInvokes[0]!.reason, /core#edit.*needs a person behind it/)
		// A person's Enter: the page vouches a trusted press on a keyed input.
		assert.equal(await view.pressKey('.n', 'Enter'), true)
		assert.equal(view.invoked.length, 1)
		assert.equal(view.invoked[0]!.key, 'edit')
		assert.equal(view.refusedInvokes.length, 1)
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

const listener = `<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	let heard = $state<string[]>([])
	$effect(() => ctx.onEvent((e) => (heard = [...heard, String((e as { kind?: unknown }).kind)])))
</script>
<p class="heard">{heard.join(' ')}</p>
`

test("lore:ranked reaches a plugin's box only with the 'lore' grant; core's box always; other events every box", async () => {
	for (const [owner, grants, expected] of [
		['acme.lore', undefined, 'layout:changed'],
		['acme.lore', ['characters'], 'layout:changed'],
		['acme.lore', ['lore'], 'lore:ranked layout:changed'],
		['core', undefined, 'lore:ranked layout:changed'],
		['core', ['session:state'], 'lore:ranked layout:changed'],
	] as const) {
		const dir = await svelteFixture(listener)
		const view = await mountComponent({
			root: dir,
			entry: 'src/c.ts',
			owner,
			...(grants ? { grants: [...grants] } : {}),
		})
		try {
			await view.event({ kind: 'lore:ranked' })
			await view.event({ kind: 'layout:changed', layout: {} })
			assert.equal(view.query('.heard')?.textContent, expected, `${owner} ${JSON.stringify(grants)}`)
		} finally {
			await view.unmount()
		}
	}
})
