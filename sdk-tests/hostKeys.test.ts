/**
 * `keys` and `key` (R80): ONE reading of the grammar for every element that
 * takes it — `sp-composer-field` and a plain `input` — and the page's rule
 * for where a plain input's press is raised, shared with the component
 * harness. A press `keys` names is the widget's (kept from the field, raised
 * as `key` with `{ key, shift, ctrl, meta }`); every other key is the field's.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import {
	hostKeyEvent,
	hostKeyEventDetail,
	hostKeysMatch,
	keyedInputTarget,
	receiverAttribute,
	type HostKeyPress,
} from '@serene-pub/sdk'

const press = (key: string, held: Partial<HostKeyPress> = {}): HostKeyPress => ({
	key,
	shiftKey: false,
	ctrlKey: false,
	metaKey: false,
	...held,
})

test('a bare key names the press whatever is held — but a bare Enter leaves Shift+Enter to the field', () => {
	assert.equal(hostKeysMatch('Escape Enter', press('Enter')), true)
	assert.equal(hostKeysMatch('Escape Enter', press('Escape')), true)
	assert.equal(hostKeysMatch('Escape Enter', press('Escape', { shiftKey: true, ctrlKey: true })), true)
	assert.equal(hostKeysMatch('Escape Enter', press('Enter', { ctrlKey: true })), true)
	assert.equal(hostKeysMatch('Escape Enter', press('Enter', { shiftKey: true })), false)
	assert.equal(hostKeysMatch('Escape Enter', press('a')), false)
	assert.equal(hostKeysMatch('Escape Enter', press('ArrowUp')), false)
	// White space of any kind separates tokens; none names nothing.
	assert.equal(hostKeysMatch('  Escape\tEnter ', press('Enter')), true)
	assert.equal(hostKeysMatch('', press('Enter')), false)
	assert.equal(hostKeysMatch(null, press('Enter')), false)
	assert.equal(hostKeysMatch(undefined, press('Enter')), false)
})

test('a modifier token names the press only while every modifier it names is held', () => {
	assert.equal(hostKeysMatch('Control+Enter', press('Enter')), false)
	assert.equal(hostKeysMatch('Control+Enter', press('Enter', { ctrlKey: true })), true)
	// Others may be held too — Shift included, even on Enter.
	assert.equal(hostKeysMatch('Control+Enter', press('Enter', { ctrlKey: true, shiftKey: true })), true)
	assert.equal(hostKeysMatch('Shift+Meta+ArrowUp', press('ArrowUp', { metaKey: true })), false)
	assert.equal(hostKeysMatch('Shift+Meta+ArrowUp', press('ArrowUp', { metaKey: true, shiftKey: true })), true)
	assert.equal(hostKeysMatch('Escape Control+Enter Meta+Enter', press('Enter', { metaKey: true })), true)
	assert.equal(hostKeysMatch('Escape Control+Enter Meta+Enter', press('Enter')), false)
	// A modifier the host does not read holds nothing — not even one an
	// object's prototype would answer to.
	for (const odd of ['Alt+Enter', 'constructor+Enter', '__proto__+Enter', 'toString+Enter'])
		assert.equal(hostKeysMatch(odd, press('Enter', { ctrlKey: true, shiftKey: true, metaKey: true })), false, odd)
})

test('a press mid-composition is named by nothing', () => {
	assert.equal(hostKeysMatch('Enter', press('Enter', { isComposing: true })), false)
})

test("the key event's detail is the press's key and modifiers", () => {
	assert.deepEqual(hostKeyEventDetail(press('Enter', { ctrlKey: true, metaKey: true })), {
		key: 'Enter',
		shift: false,
		ctrl: true,
		meta: true,
	})
})

test("a plain input's keys is judged by the grammar in every box, and written as given", () => {
	for (const owner of ['core', 'acme.widgets']) {
		assert.deepEqual(receiverAttribute('input', 'keys', 'Escape Enter', owner), { value: 'Escape Enter' })
		assert.match(
			(receiverAttribute('input', 'keys', 'Escape Ctrl+Enter', owner) as { refused: string }).refused,
			/input keys 'Ctrl\+Enter'/,
		)
	}
})

function page(html: string) {
	const win = new Window()
	const document = win.document as unknown as Document
	document.body.innerHTML = `<input id="page" keys="Enter"><div data-sp-owner id="box">${html}</div>`
	const $ = (id: string) => document.getElementById(id)!
	const keydown = (id: string, key: string, held: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) => {
		const e = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...held }) as unknown as KeyboardEvent
		$(id).dispatchEvent(e)
		return e
	}
	return { win, $, box: $('box'), keydown }
}

test('the page raises key on the plain input the press is on, inside the territory, when its keys names it', () => {
	const { $, box, keydown } = page(
		'<input id="n" type="number" keys="Escape Enter"><input id="bare"><textarea id="t" keys="Enter"></textarea><sp-combobox id="c" keys="Enter"></sp-combobox>',
	)
	assert.equal(keyedInputTarget(keydown('n', 'Enter'), box), $('n'))
	assert.equal(keyedInputTarget(keydown('n', 'Escape'), box), $('n'))
	// The field's own keys: a digit, a number field's arrow step, Shift+Enter.
	assert.equal(keyedInputTarget(keydown('n', '7'), box), null)
	assert.equal(keyedInputTarget(keydown('n', 'ArrowUp'), box), null)
	assert.equal(keyedInputTarget(keydown('n', 'Enter', { shiftKey: true }), box), null)
	// An input with no keys; elements that are not a plain input.
	assert.equal(keyedInputTarget(keydown('bare', 'Enter'), box), null)
	assert.equal(keyedInputTarget(keydown('t', 'Enter'), box), null)
	assert.equal(keyedInputTarget(keydown('c', 'Enter'), box), null)
	// The page's own input, outside the territory.
	assert.equal(keyedInputTarget(keydown('page', 'Enter'), box), null)
})

test("the key event carries the detail, does not bubble, and is made in the press's window", () => {
	const { win, keydown } = page('<input id="n" keys="Control+Enter">')
	const e = hostKeyEvent(keydown('n', 'Enter', { ctrlKey: true }))
	assert.ok(e instanceof (win.CustomEvent as unknown as typeof CustomEvent))
	assert.equal(e.type, 'key')
	assert.equal(e.bubbles, false)
	assert.deepEqual(e.detail, { key: 'Enter', shift: false, ctrl: true, meta: false })
})
