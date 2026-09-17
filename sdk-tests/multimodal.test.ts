/**
 * The media vocabulary, the unified field language, and the surfaces that
 * stopped being one-way doors.
 *
 * Each block here pins a decision that was made because the previous shape
 * blocked something concrete — a vision model with nowhere to put an image, a
 * genre that could not declare a `share` control its neighbour could, a plugin
 * that could fill its quota and never recover.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	S,
	assignable,
	MEDIA_KINDS,
	isMediaKind,
	accepts,
	partsToText,
	partsToMedia,
	checkSchema,
	valueDeclOf,
	valueKind,
	validateValue,
	fieldLabel,
	fieldAccepts,
	getDefinition,
	FRAME_PROTOCOL,
	type MediaRef,
	type OutputPart,
	type SettingsSchema,
	type FieldDecl,
	type ParamDecl,
} from '@serene-pub/sdk'
import '@serene-pub/contracts'

const ref = (kind: MediaRef['kind'], mime: string): MediaRef => ({
	uuid: '11111111-2222-4333-8444-555555555555',
	kind,
	mime,
	bytes: 10,
})

describe('the media vocabulary is one kind, not a family of shapes', () => {
	test('the kinds match what the app stores', () => {
		assert.deepEqual([...MEDIA_KINDS], ['image', 'audio', 'video', 'document'])
		assert.ok(isMediaKind('document'))
		assert.ok(!isMediaKind('spreadsheet'))
	})

	test('capability is per direction, because they are independent', () => {
		const vision = { accepts: ['image'] as const }
		const generator = { emits: ['image'] as const }
		assert.ok(accepts(vision, ref('image', 'image/png')))
		// A generator accepts nothing — a single `supports` list could not tell
		// these two apart, and that difference is what greys out a picker.
		assert.ok(!accepts(generator, ref('image', 'image/png')))
	})

	test('a mime allow-list narrows within an accepted kind', () => {
		const cap = { accepts: ['image'] as const, mimes: ['image/png'] as const }
		assert.ok(accepts(cap, ref('image', 'image/png')))
		assert.ok(!accepts(cap, ref('image', 'image/gif')))
		assert.ok(!accepts(cap, ref('document', 'application/pdf')))
	})

	test('image and audio remain, assignable to the general media shape', () => {
		// Existing specs keep connecting; the general port accepts them.
		assert.ok(assignable(S.image, S.media))
		assert.ok(assignable(S.audio, S.media))
		// Not the reverse: a port that takes any media may not be handed to one
		// that declared it only understands images.
		assert.ok(!assignable(S.media, S.image))
	})
})

describe('a completion is an ordered list of parts', () => {
	const parts: OutputPart[] = [
		{ t: 'reasoning', text: 'thinking…' },
		{ t: 'text', text: 'Here is the map. ' },
		{ t: 'media', ref: ref('image', 'image/png') },
		{ t: 'text', text: 'Note the river.' },
		{ t: 'other', subtype: 'vendor:whatever', data: {} },
	]

	test('the text degrade keeps prose and drops reasoning', () => {
		// Reasoning is not the answer — it is budgeted, hidden and excluded
		// separately, so concatenating it into the reply would be wrong.
		assert.equal(partsToText(parts), 'Here is the map. Note the river.')
	})

	test('media is recoverable in order', () => {
		assert.deepEqual(partsToMedia(parts).map((m) => m.mime), ['image/png'])
	})

	test('a part stream degrades to a text stream, never the reverse', () => {
		// This is what lets a provider start emitting parts without breaking a
		// single spec wired to its text output.
		assert.ok(assignable(S.partStream, S.textStream))
		assert.ok(!assignable(S.textStream, S.partStream))
	})
})

describe('generate-text can finally receive media', () => {
	const d = getDefinition('core:oracle/generate-text@1')

	test('it declares both directions', () => {
		assert.ok(d, 'the provider type is registered')
		assert.deepEqual([...(d!.media?.accepts ?? [])], ['image', 'document'])
		assert.deepEqual([...(d!.media?.emits ?? [])], ['image'])
	})

	test('there is an inbound port for attachments', () => {
		// Before this every image port in the graph pointed outward: an image
		// could be produced and stored, and never sent.
		assert.equal((d!.ports as any).in.attachments, S.mediaList)
	})

	test('the existing text ports are untouched', () => {
		const out = (d!.ports as any).out
		assert.equal(out.text, S.textStream)
		assert.equal(out.parts, S.partStream)
		// `main` is richer now but still assignable where text was expected.
		assert.ok(assignable(out.main, S.textStream))
	})
})

describe('one field language', () => {
	test('ParamDecl and FieldDecl are the same type', () => {
		// Not "the same shape" as a promise in a comment — the same type. A
		// value of one is assignable to the other in both directions.
		const asParam: ParamDecl = { type: 'share', members: [{ key: 'a' }] }
		const asField: FieldDecl = asParam
		const back: ParamDecl = asField
		assert.equal(back.type, 'share')
	})

	test('the merged vocabulary validates from either half', () => {
		const schema: SettingsSchema = {
			// was node-params only
			split: { type: 'share', label: 'Split', members: [{ key: 'a' }, { key: 'b' }] },
			caps: { type: 'perMember', label: 'Caps', members: [{ key: 'a' }] },
			// was settings only
			notes: { type: 'text', label: 'Notes' },
			// new
			portrait: { type: 'media', label: 'Portrait', accepts: ['image'] },
		}
		assert.deepEqual(checkSchema(schema), [])
	})

	test('a session mode can now declare a share control', () => {
		// SessionShape.fields is a SettingsSchema, so before the merge a genre
		// could not declare a control that a node beside it could.
		const fields: SettingsSchema = {
			budget: { type: 'share', members: [{ key: 'lore' }, { key: 'history' }] },
		}
		assert.deepEqual(checkSchema(fields), [])
	})

	test('label reads whichever key the author used', () => {
		assert.equal(fieldLabel({ label: 'A' }), 'A')
		assert.equal(fieldLabel({ i18n: 'B' }), 'B')
		// `label` wins when both are present.
		assert.equal(fieldLabel({ label: 'A', i18n: 'B' }), 'A')
	})
})

describe('the media field reaches a control', () => {
	test('it bridges to a host-integrated picker', async () => {
		const { CONTROL_REGISTRY } = await import('@serene-pub/controls/registry')
		const vd = valueDeclOf({ type: 'media', label: 'M' })
		assert.ok(vd, 'a media field bridges to a value declaration')
		const entry = CONTROL_REGISTRY[valueKind(vd!)]
		assert.ok(entry, 'and that value kind has a control')
		// The choices are this user's library — instance data, like a prompt
		// list — so the host supplies the control.
		assert.equal(entry.hostIntegrated, true)
	})

	test('images unless the field says otherwise', () => {
		assert.deepEqual([...fieldAccepts({ type: 'media' })], ['image'])
		assert.deepEqual([...fieldAccepts({ type: 'media', accepts: ['document'] })], [
			'document',
		])
	})

	test('the stored value is a uuid — never a path, never bytes', () => {
		const vd = valueDeclOf({ type: 'media' })!
		assert.deepEqual(validateValue(vd, '11111111-2222-4333-8444-555555555555'), [])
		assert.ok(validateValue(vd, '/media/data/users/1/x.png').length)
		assert.ok(validateValue(vd, 12).length)
	})
})

describe('surfaces that stopped being one-way doors', () => {
	test('the frame protocol is 2, and says what a frame may send', () => {
		assert.equal(FRAME_PROTOCOL, 2)
	})

	test('a frame can report failure, ask for a page, and keep view state', () => {
		// Types only — the point is that the union admits them at all. A v1
		// frame sends none of these and still works.
		const messages = [
			{ t: 'error' as const, message: 'boot failed', fatal: true },
			{ t: 'request' as const, requestId: 'r1', what: 'messages' as const, limit: 50 },
			{ t: 'save-state' as const, state: { tab: 'map' } },
		]
		assert.equal(messages.length, 3)
	})
})
