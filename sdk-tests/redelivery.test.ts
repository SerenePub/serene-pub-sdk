/**
 * The page's click re-delivery rule (C7), shared by the page and the
 * component harness: a click that starts on a node that does not take it (a
 * button's label, an icon's own drawing) goes, unbubbling and
 * non-activating, to the nearest element of the territory that does.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { REDELIVERED_EVENTS, redeliveredCopy, redeliveryTarget } from '@serene-pub/sdk'

function page(html: string) {
	const win = new Window()
	const document = win.document as unknown as Document
	document.body.innerHTML = `<div id="outside"><button id="page-button"><div data-sp-owner id="box">${html}</div></button><span id="stray">x</span></div>`
	const $ = (id: string) => document.getElementById(id)!
	return { win, document, $, box: $('box') }
}

test('only click is re-delivered', () => {
	assert.deepEqual([...REDELIVERED_EVENTS], ['click'])
	const { $, box } = page('<sp-tabs id="tabs"><span id="inner">a</span></sp-tabs>')
	// sp-tabs takes `change`, but a descendant's change never becomes its own.
	assert.equal(redeliveryTarget($('inner'), 'change', box), null)
})

test("a click on a button's label goes to the button; on the button itself, nowhere", () => {
	const { $, box } = page('<button id="b"><span id="label">Send</span></button>')
	assert.equal(redeliveryTarget($('label'), 'click', box), $('b'))
	// A text node starts at its parent.
	assert.equal(redeliveryTarget($('label').firstChild!, 'click', box), $('b'))
	// Its own listener hears it.
	assert.equal(redeliveryTarget($('b'), 'click', box), null)
})

test('the nearest element that takes it wins, and nothing at or above the territory', () => {
	const { $, box } = page('<a id="a" href="#x"><button id="b"><span id="s">x</span></button></a><p id="p"><em id="em">y</em></p>')
	assert.equal(redeliveryTarget($('s'), 'click', box), $('b'))
	// Nothing below the box takes it; the page's own button above the box is not the remote's.
	assert.equal(redeliveryTarget($('em'), 'click', box), null)
	// A text node straight inside the territory: nothing below it encloses it.
	box.appendChild(box.ownerDocument.createTextNode('loose'))
	assert.equal(redeliveryTarget(box.lastChild!, 'click', box), null)
})

test('nowhere when the click starts at the territory or outside it', () => {
	const { $, box } = page('<button id="b">x</button>')
	assert.equal(redeliveryTarget(box, 'click', box), null)
	assert.equal(redeliveryTarget($('stray'), 'click', box), null)
	assert.equal(redeliveryTarget($('page-button'), 'click', box), null)
})

test("inside a host element's own markup, the host element is where it starts", () => {
	const { $, box, document } = page(
		'<button id="b"><sp-icon id="icon"><svg id="svg"><path id="path"></path></svg></sp-icon></button>' +
			'<button id="outer"><sp-menu id="menu"><span id="drawn"><button id="host-drawn">' +
			'<sp-icon id="nested"><i id="deep"></i></sp-icon></button></span></sp-menu></button>',
	)
	const owns = (el: Element) =>
		Object.assign(el, { ownsMarkup: (t: Node | null) => !!t && t !== el && el.contains(t) })
	owns($('icon'))
	assert.equal(redeliveryTarget($('path'), 'click', box), $('b'))
	// The OUTERMOST host element owning the origin is the start: the button the
	// menu drew for itself is the host's, so the click goes past it.
	owns($('menu'))
	owns($('nested'))
	assert.equal(redeliveryTarget($('deep'), 'click', box), $('outer'))
	// A start that takes the click itself hears it: nothing is re-delivered.
	const btn = document.createElement('button')
	btn.innerHTML = '<b id="bold">x</b>'
	box.appendChild(btn)
	owns(btn)
	assert.equal(redeliveryTarget($('bold'), 'click', box), null)
})

test('the copy is an unbubbling CustomEvent from the event’s own window, never a MouseEvent', () => {
	const { $, win } = page('<a id="a" href="https://example.com"><span id="s">x</span></a>')
	const opened: unknown[] = []
	;(win as unknown as { open: (...a: unknown[]) => null }).open = (...a) => (opened.push(a), null)
	const click = new win.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }) as unknown as Event
	let copy: Event | undefined
	$('s').addEventListener('click', (e) => (copy = redeliveredCopy(e as unknown as Event)))
	$('s').dispatchEvent(click)
	// The person's own click activates the link once, on its way up.
	assert.equal(opened.length, 1)
	assert.ok(copy)
	assert.equal(copy!.type, 'click')
	assert.equal(copy!.bubbles, false)
	assert.equal(copy!.cancelable, true)
	assert.ok(copy instanceof (win.CustomEvent as unknown as typeof CustomEvent))
	assert.ok(!(copy instanceof (win.MouseEvent as unknown as typeof MouseEvent)))
	// Dispatched at the link, the copy opens nothing more: a CustomEvent has no activation.
	$('a').dispatchEvent(copy as never)
	assert.equal(opened.length, 1)
})
