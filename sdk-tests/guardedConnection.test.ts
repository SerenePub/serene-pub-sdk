/**
 * The guarded connection (C7): the one judge of a remote's records, which the
 * page's receiver and the component harness both run. Driven with Remote
 * DOM's own record shapes and constants into a real receiver on a happy-dom
 * box — so the protocol numbers the SDK holds are pinned to the ones
 * `@remote-dom/core` exports.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import {
	MUTATION_TYPE_INSERT_CHILD,
	MUTATION_TYPE_REMOVE_CHILD,
	MUTATION_TYPE_UPDATE_PROPERTY,
	MUTATION_TYPE_UPDATE_TEXT,
	ROOT_ID,
	UPDATE_PROPERTY_TYPE_ATTRIBUTE,
	UPDATE_PROPERTY_TYPE_EVENT_LISTENER,
	UPDATE_PROPERTY_TYPE_PROPERTY,
} from '@remote-dom/core'
import { DOMRemoteReceiver } from '@remote-dom/core/receivers'
import {
	FN,
	guardedConnection,
	receiverElementPolicy,
	receiverNodeOf,
	type GuardedConnectionOptions,
	type ReceiverRefusal,
} from '@serene-pub/sdk'

// Remote DOM's receiver builds nodes with the global document.
const win = new Window()
const lent = ['document', 'Element', 'Node', 'DocumentFragment', 'HTMLElement'] as const
const g = globalThis as Record<string, unknown>
before(() => {
	for (const name of lent) g[name] = (win as unknown as Record<string, unknown>)[name]
})
after(() => {
	for (const name of lent) delete g[name]
	win.close()
})

let seq = 0
const el = (element: string, attributes: Record<string, string> = {}, children: unknown[] = [], extra: object = {}) => ({
	id: `n${++seq}`,
	type: 1,
	element,
	attributes,
	children,
	...extra,
})
const text = (data: string) => ({ id: `n${++seq}`, type: 3, data })

function setup(options: Partial<GuardedConnectionOptions> = {}) {
	const box = win.document.createElement('div') as unknown as Element
	win.document.body.appendChild(box as never)
	const refusals: ReceiverRefusal[] = []
	const fns: string[] = []
	const receiver = new DOMRemoteReceiver({ root: box, elements: receiverElementPolicy() })
	const connection = guardedConnection(receiver.connection, receiverNodeOf(receiver), {
		owner: 'demo',
		fnFor: (handle, event) => {
			fns.push(`${event}:${handle[FN]}`)
			return () => {}
		},
		refuse: (r) => refusals.push(r),
		...options,
	})
	const mutate = (...records: unknown[][]) => connection.mutate(records as never)
	const insert = (parent: string, node: unknown, index = 0) => mutate([MUTATION_TYPE_INSERT_CHILD, parent, node, index])
	const remove = (parent: string, index: number) => mutate([MUTATION_TYPE_REMOVE_CHILD, parent, index])
	return { box, refusals, fns, connection, mutate, insert, remove }
}

test("records built with Remote DOM's own constants are judged and applied", () => {
	const { box, refusals, fns, mutate, insert } = setup()
	const label = text('Save')
	const button = el('button', { class: 'b', onclick: 'x()' }, [label], {
		eventListeners: { click: { [FN]: 1 }, mouseover: { [FN]: 2 } },
	})
	insert(ROOT_ID, el('div', {}, [button, el('script', {}, [text('alert(1)')])]))
	mutate(
		[MUTATION_TYPE_UPDATE_TEXT, label.id, 'Saved'],
		[MUTATION_TYPE_UPDATE_PROPERTY, button.id, 'class', 'c', UPDATE_PROPERTY_TYPE_ATTRIBUTE],
		[MUTATION_TYPE_UPDATE_PROPERTY, button.id, 'click', { [FN]: 3 }, UPDATE_PROPERTY_TYPE_EVENT_LISTENER],
		[MUTATION_TYPE_UPDATE_PROPERTY, button.id, 'innerHTML', '<img>', UPDATE_PROPERTY_TYPE_PROPERTY],
	)
	const b = box.querySelector('button')!
	assert.equal(b.textContent, 'Saved')
	assert.equal(b.getAttribute('class'), 'c')
	assert.equal(b.getAttribute('onclick'), null)
	assert.equal(box.querySelector('script') === null, true)
	assert.deepEqual(fns, ['click:1', 'click:3'])
	assert.deepEqual(
		refusals.map((r) => r.dropped),
		['attribute', 'subtree', 'property'],
	)
	assert.match(refusals[1].finding, /<script> is not in the host-element vocabulary/)
	assert.equal(refusals[2].finding, "<button> set property 'innerHTML'")
})

test('ids are the remote’s own without a prefix, and prefixed with one', () => {
	const bare = setup()
	bare.insert(ROOT_ID, el('div', {}, [el('label', { for: 'f' }), el('input', { id: 'f' }), el('a', { href: '#top' })]))
	assert.equal(bare.box.querySelector('label')!.getAttribute('for'), 'f')
	assert.equal(bare.box.querySelector('input')!.id, 'f')
	assert.equal(bare.box.querySelector('a')!.getAttribute('href'), '#top')
	assert.equal(bare.box.querySelector('a')!.getAttribute('rel'), 'noopener noreferrer')
	const prefixed = setup({ idPrefix: 'p1-' })
	prefixed.insert(ROOT_ID, el('div', {}, [el('label', { for: 'f' }), el('input', { id: 'f', name: 'g' }), el('a', { href: '#top' })]))
	assert.equal(prefixed.box.querySelector('label')!.getAttribute('for'), 'p1-f')
	assert.equal(prefixed.box.querySelector('input')!.getAttribute('name'), 'p1-g')
	assert.equal(prefixed.box.querySelector('a')!.getAttribute('href'), '#p1-top')
})

test('a host may name its own element and attribute rules', () => {
	const { box, refusals, insert } = setup({
		rules: {
			element: (tag) => (tag === 'p' ? 'no paragraphs here' : undefined),
			attribute: (_tag, name, value) => (name === 'title' ? { refused: 'no titles' } : { value: String(value) }),
		},
	})
	insert(ROOT_ID, el('div', { title: 't', class: 'k' }, [el('p', {}, [text('x')])]))
	assert.equal(box.querySelector('p') === null, true)
	assert.equal(box.querySelector('div')!.getAttribute('class'), 'k')
	assert.equal(box.querySelector('div')!.getAttribute('title'), null)
	assert.deepEqual(
		refusals.map((r) => r.finding),
		['no titles', 'no paragraphs here'],
	)
})

test('what the remote writes into a refused subtree is dropped, and the rest still answers', () => {
	const { box, insert, mutate } = setup()
	const inner = text('0')
	const g = el('g', {}, [inner])
	const kept = text('ok')
	insert(ROOT_ID, el('div', {}, [el('svg', {}, [g]), el('span', {}, [kept])]))
	assert.doesNotThrow(() =>
		mutate(
			[MUTATION_TYPE_UPDATE_TEXT, inner.id, '1'],
			[MUTATION_TYPE_INSERT_CHILD, g.id, el('path', {}, [text('new')]), 1],
			[MUTATION_TYPE_REMOVE_CHILD, g.id, 0],
			[MUTATION_TYPE_UPDATE_PROPERTY, g.id, 'class', 'x', UPDATE_PROPERTY_TYPE_ATTRIBUTE],
			[MUTATION_TYPE_UPDATE_TEXT, kept.id, 'still ok'],
		),
	)
	assert.equal(box.textContent, 'still ok')
	assert.equal(box.querySelector('svg, g, path, .x') === null, true)
})

test("the refused subtree is tracked as the remote holds it: churn inside it stays bounded", () => {
	const { box, connection, insert, remove } = setup()
	const g = el('g')
	const svg = el('svg', {}, [g])
	const div = el('div', {}, [svg, el('p', { class: 'after' })])
	insert(ROOT_ID, div)
	// The svg and its g.
	assert.equal(connection.refusedIdsHeld, 2)
	for (let i = 0; i < 200; i++) {
		insert(g.id, el('path', {}, [text(String(i))]), 0)
		assert.equal(connection.refusedIdsHeld, 4)
		remove(g.id, 0)
		assert.equal(connection.refusedIdsHeld, 2, `after churn ${i}`)
	}
	// A removal takes the child at ITS index, and everything under it.
	const one = el('i', {}, [text('a')])
	const two = el('b', {}, [text('b'), el('em', {}, [text('c')])])
	insert(svg.id, one, 1)
	insert(svg.id, two, 1)
	assert.equal(connection.refusedIdsHeld, 2 + 2 + 4)
	remove(svg.id, 2) // `one`: the svg's children are g, two, one
	assert.equal(connection.refusedIdsHeld, 2 + 4)
	remove(svg.id, 1) // `two`, and its em and texts
	assert.equal(connection.refusedIdsHeld, 2)
	// The stand-in itself leaves — the remote's child 0 — and nothing of it is
	// held; its sibling stays.
	insert(g.id, el('path'), 0)
	assert.equal(connection.refusedIdsHeld, 3)
	remove(div.id, 0)
	assert.equal(connection.refusedIdsHeld, 0)
	assert.ok(box.querySelector('.after'))
	assert.equal(box.querySelector('div')!.childNodes.length, 1)
})

test('an insert re-addressing an attached id is refused, and the connection stops', () => {
	const { box, connection, insert, mutate } = setup()
	const field = el('input', { type: 'text' })
	const other = el('div', { class: 'a' })
	insert(ROOT_ID, el('div', {}, [field, other]))
	assert.throws(() => insert(ROOT_ID, { ...el('button'), id: field.id }, 1), /already in the box as <input>/)
	mutate([MUTATION_TYPE_UPDATE_PROPERTY, other.id, 'class', 'b', UPDATE_PROPERTY_TYPE_ATTRIBUTE])
	assert.ok(box.querySelector('.a'), 'a stopped box takes nothing more')
	assert.equal(box.querySelector('button') === null, true)
	assert.throws(() => connection.call(field.id, 'focus'), /no host methods/)
})

test('a record kind that is not one of the four numbers is refused, and the connection stops', () => {
	// The receiver picks its handler by plain key: `'3'` would reach
	// updateProperty, `'0'` insertChild, past every rule the guard applies.
	const { box, insert, mutate } = setup()
	const input = el('input', { type: 'text' })
	insert(ROOT_ID, el('div', {}, [input]))
	assert.throws(() => mutate(['3', input.id, 'type', 'password', UPDATE_PROPERTY_TYPE_ATTRIBUTE]), /record kind "3"/)
	assert.equal(box.querySelector('input')!.getAttribute('type'), 'text')
	// Stopped: even a well-formed record is not applied after a refusal.
	mutate([MUTATION_TYPE_UPDATE_PROPERTY, input.id, 'placeholder', 'x', UPDATE_PROPERTY_TYPE_ATTRIBUTE])
	assert.equal(box.querySelector('input')!.getAttribute('placeholder'), null)

	const second = setup()
	assert.throws(() => second.mutate(['0', ROOT_ID, el('script', {}, [text('alert(1)')]), 0]), /record kind "0"/)
	assert.equal(second.box.querySelector('script') === null, true)
	assert.throws(() => setup().mutate([9 as never]), /record kind 9/)
})
