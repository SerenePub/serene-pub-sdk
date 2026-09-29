/**
 * Widget events about scoped data (R81): `lore:ranked` is a `WidgetEvent`
 * carrying nothing, and it is heard only by a widget that may read the lore —
 * core's, or a plugin's granted `lore` as a BARE scope. Every other kind is
 * heard as before. One table (`WIDGET_EVENT_SCOPES`), one question
 * (`widgetEventHeard`), which the page's wire and the harness both ask.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	WIDGET_EVENT_SCOPES,
	widgetEventHeard,
	type WidgetEvent,
	type WidgetEventKind,
} from '@serene-pub/sdk'

// Typed: the member exists, carries nothing, and its kind is a kind.
const ranked: WidgetEvent = { kind: 'lore:ranked' }
const kind: WidgetEventKind = 'lore:ranked'
// @ts-expect-error — it carries nothing: the rows are `session-entries`'.
const withRows: WidgetEvent = { kind: 'lore:ranked', rows: [] }
void withRows

test("lore:ranked and lore:marked need the 'lore' scope; nothing else is scoped yet", () => {
	assert.deepEqual({ ...WIDGET_EVENT_SCOPES }, { 'lore:ranked': 'lore', 'lore:marked': 'lore' })
	assert.equal(widgetEventHeard('lore:marked', { owner: 'core' }), true)
	assert.equal(widgetEventHeard('lore:marked', { owner: 'acme.lore', grants: ['lore'] }), true)
	assert.equal(widgetEventHeard('lore:marked', { owner: 'acme.lore', grants: ['characters'] }), false)
	assert.ok(Object.isFrozen(WIDGET_EVENT_SCOPES))
	assert.equal(ranked.kind, kind)
})

test("core's widget hears it; a plugin's only with 'lore' granted, as a bare scope in a list", () => {
	assert.equal(widgetEventHeard('lore:ranked', { owner: 'core' }), true)
	assert.equal(widgetEventHeard('lore:ranked', { owner: 'core', grants: [] }), true)
	assert.equal(widgetEventHeard('lore:ranked', { owner: 'acme.lore', grants: ['lore'] }), true)
	assert.equal(widgetEventHeard('lore:ranked', { owner: 'acme.lore' }), false)
	assert.equal(widgetEventHeard('lore:ranked', { owner: 'acme.lore', grants: ['characters', 'session:state'] }), false)
	// The permission key is what a person reviews, never what a widget carries.
	assert.equal(widgetEventHeard('lore:ranked', { owner: 'acme.lore', grants: ['widget:lore'] }), false)
	// A stored string is no list: its `includes` would match a substring.
	assert.equal(widgetEventHeard('lore:ranked', { owner: 'acme.lore', grants: 'lore' as never }), false)
})

test('every other kind is heard by every widget, a custom one and an unknown one included', () => {
	for (const k of ['message:created', 'layout:changed', 'event:recorded', 'generation:end', 'custom:dice', 'nope'])
		assert.equal(widgetEventHeard(k, { owner: 'acme.clock' }), true, k)
	// Nothing an object's prototype holds is a scoped kind.
	for (const k of ['constructor', 'toString', '__proto__'])
		assert.equal(widgetEventHeard(k, { owner: 'acme.clock' }), true, k)
})
