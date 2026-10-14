/**
 * 🚧 Scene settings (PROPOSAL-live-scenes §4–§5, lane D): how a session places
 * its scene boundaries and when a scene's summary runs — the genre's default
 * (`SessionShape.scenes`), refused at the declaration when it does not read,
 * and the one cascade a session's override resolves through.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	DEFAULT_SCENE_SETTINGS,
	SCENE_BOUNDARY_TRIGGERS,
	assertSceneSettings,
	boundaryTriggerFindings,
	boundaryTriggersOf,
	declaredScenePlace,
	declaredTriggerStates,
	defineAttributeSlot,
	genre,
	resolveSceneSettings,
	sceneSettingsDecl,
	sceneSettingsFindings,
	spec,
	validate,
} from '@serene-pub/sdk'
import { lairSummarizeSceneSpec } from '@serene-pub/core-catalog'

describe('the defaults (★1)', () => {
	test('Suggested, with day crossed, time action and place changed on; summaries on request', () => {
		assert.deepEqual(DEFAULT_SCENE_SETTINGS, {
			mode: 'suggested',
			triggers: {
				dayCrossed: true,
				timeAction: true,
				placeChanged: true,
				narration: false,
				length: null,
				pause: null,
			},
			summary: 'onRequest',
		})
		assert.deepEqual(resolveSceneSettings(undefined), DEFAULT_SCENE_SETTINGS)
		assert.deepEqual(resolveSceneSettings({ lorebook: 'optional' }), DEFAULT_SCENE_SETTINGS)
		assert.deepEqual([...SCENE_BOUNDARY_TRIGGERS], [
			'dayCrossed',
			'timeAction',
			'placeChanged',
			'narration',
			'length',
			'pause',
		])
	})
})

describe('the cascade', () => {
	test("the session's override over the genre's over the defaults — part by part", () => {
		const shape = {
			scenes: { mode: 'automatic', triggers: { narration: true, length: { lines: 30 } }, summary: 'onClose' },
		}
		const genreOnly = resolveSceneSettings(shape)
		assert.equal(genreOnly.mode, 'automatic')
		assert.equal(genreOnly.summary, 'onClose')
		assert.deepEqual(genreOnly.triggers, {
			dayCrossed: true,
			timeAction: true,
			placeChanged: true,
			narration: true,
			length: { lines: 30, tokens: null },
			pause: null,
		})
		const session = resolveSceneSettings(shape, { summary: 'never', triggers: { length: false, pause: { hours: 6 } } })
		assert.equal(session.mode, 'automatic', 'a session saying only summary keeps its genre’s mode')
		assert.equal(session.summary, 'never')
		assert.equal(session.triggers.length, null)
		assert.deepEqual(session.triggers.pause, { hours: 6 })
		assert.equal(session.triggers.narration, true)
	})

	test('whatever does not read falls through to the layer below, never refuses', () => {
		assert.deepEqual(
			resolveSceneSettings({ scenes: { mode: 'sometimes', triggers: 'all' } }, { summary: 42 }),
			DEFAULT_SCENE_SETTINGS,
		)
	})

	test('sceneSettingsDecl round-trips a resolved setting', () => {
		const s = resolveSceneSettings({ scenes: { mode: 'manual', triggers: { pause: { hours: 2 } } } })
		assert.deepEqual(resolveSceneSettings(undefined, sceneSettingsDecl(s)), s)
	})
})

describe('the declaration', () => {
	test('a sound one has no findings; each fault is its own sentence', () => {
		assert.deepEqual(sceneSettingsFindings(undefined), [])
		assert.deepEqual(
			sceneSettingsFindings({
				mode: 'automatic',
				triggers: { dayCrossed: false, length: { lines: 20, tokens: 4000 }, pause: false },
				summary: 'never',
			}),
			[],
		)
		const f = sceneSettingsFindings(
			{
				mode: 'often',
				summary: 'later',
				triggers: { dayCrossed: 'yes', sanctumNarration: true, length: { lines: 0 }, pause: { hours: -1 } },
				extra: 1,
			},
			'g.scenes',
		)
		assert.ok(f.some((x) => x.startsWith('g.scenes.extra: not a scene setting')))
		assert.ok(f.some((x) => x.startsWith('g.scenes.mode: one of manual, suggested, automatic')))
		assert.ok(f.some((x) => x.startsWith('g.scenes.summary: one of onClose, onRequest, never')))
		assert.ok(f.some((x) => x.startsWith('g.scenes.triggers.dayCrossed: true or false')))
		assert.ok(f.some((x) => x.includes("sanctumNarration: not a boundary trigger")))
		assert.ok(f.some((x) => x.startsWith('g.scenes.triggers.length.lines: a whole number above 0')))
		assert.ok(f.some((x) => x.startsWith('g.scenes.triggers.pause: false, or { hours }')))
		assert.match(sceneSettingsFindings({ triggers: { length: {} } })[0]!, /say lines, tokens or both/)
	})

	test('genre() refuses a shape whose scenes do not read, at the declaration', () => {
		assert.throws(
			() =>
				genre('lane-d.test:genre/bad-scenes', {
					name: 'Bad scenes',
					family: 'test',
					shape: { scenes: { mode: 'sometimes' } as never },
				}),
			/lane-d\.test:genre\/bad-scenes\.scenes\.mode: one of manual, suggested, automatic/,
		)
		const ok = genre('lane-d.test:genre/manual-scenes', {
			name: 'Manual scenes',
			family: 'test',
			shape: { scenes: { mode: 'manual', summary: 'never' } },
		})
		assert.equal(resolveSceneSettings(ok.shape).mode, 'manual')
		assert.doesNotThrow(() => assertSceneSettings(undefined, 'x'))
	})
})

describe('🚧 the place (live scenes §15 G2)', () => {
	test("a genre names the state key that is where the story is; a session cannot", () => {
		assert.deepEqual(sceneSettingsFindings({ place: { stateKey: 'location' } }), [])
		assert.deepEqual(declaredScenePlace({ scenes: { place: { stateKey: 'location' } } }), { stateKey: 'location' })
		assert.equal(declaredScenePlace({ scenes: { place: { stateKey: 'a b' } } }), null)
		assert.equal(declaredScenePlace(undefined), null)
		assert.match(sceneSettingsFindings({ place: { stateKey: '' } }).join(' '), /place\.stateKey: a state key/)
		assert.match(sceneSettingsFindings({ place: 'location' }).join(' '), /place: \{ stateKey \}/)
		assert.match(
			sceneSettingsFindings({ place: { stateKey: 'location' } }, 'Scenes', { layer: 'session' }).join(' '),
			/Scenes\.place: the place is the genre's to name/,
		)
		// The cascade never reads a place: it is not a setting.
		assert.deepEqual(resolveSceneSettings({ scenes: { place: { stateKey: 'location' } } }), DEFAULT_SCENE_SETTINGS)
	})

	test('genre() refuses a place that names no slot the genre declares', () => {
		const where = defineAttributeSlot('g2.test:slot/where@1', {
			type: 'text',
			label: { en: 'Where' },
			descriptor: 'Where the story is happening.',
			appliesTo: ['world'],
		})
		const ok = genre('g2.test:genre/placed', {
			name: 'Placed',
			family: 'test',
			slots: [where],
			shape: { scenes: { place: { stateKey: 'where' } } },
		})
		assert.deepEqual(declaredScenePlace(ok.shape), { stateKey: 'where' })
		assert.throws(
			() =>
				genre('g2.test:genre/misplaced', {
					name: 'Misplaced',
					family: 'test',
					slots: [where],
					shape: { scenes: { place: { stateKey: 'room' } } },
				}),
			/g2\.test:genre\/misplaced\.scenes\.place\.stateKey: 'room' is not a slot this genre declares \(where\)/,
		)
	})
})

describe('🚧 declared boundary triggers (★9, live scenes §15 G1)', () => {
	const floor = { key: 'newFloor', label: { en: 'the party reached a new floor' }, when: { channel: 'main', stateKey: 'floor' } }

	test('a sound declaration has no findings; each fault is its own sentence', () => {
		assert.deepEqual(boundaryTriggerFindings([floor], 'b', { channels: ['main', 'sanctum'] }), [])
		assert.deepEqual(
			boundaryTriggerFindings([{ key: 'trapSprung', label: 'a trap was sprung', when: { actionKey: 'trigger-trap', speaker: 'narrator', narration: false } }]),
			[],
		)
		const f = boundaryTriggerFindings(
			[
				{ key: 'dayCrossed', label: 'x', when: { narration: true } },
				{ key: 'Bad Key', label: '', when: {} },
				{ key: 'odd', label: 'odd', when: { channel: 'phone', mood: 'tense', speaker: 'god' } },
				{ key: 'odd', label: 'twice', when: { narration: 'yes' } },
				{ key: 'act', label: 'act', when: { actionKey: 'Not A Key', stateKey: 'two words' } },
			],
			'b',
			{ channels: ['main', 'sanctum'] },
		)
		const has = (re: RegExp) => assert.ok(f.some((x) => re.test(x)), `${re} in\n${f.join('\n')}`)
		has(/b\[dayCrossed\]\.key: 'dayCrossed' is core's own trigger/)
		has(/b\[Bad Key\]\.key: camelCase/)
		has(/b\[Bad Key\]\.label: display text/)
		has(/b\[Bad Key\]\.when: state at least one of channel, narration, speaker, actionKey, stateKey/)
		has(/b\[odd\]\.when\.channel: 'phone' is not a channel the genre declares \(main, sanctum\)/)
		has(/b\[odd\]\.when\.mood: not a predicate/)
		has(/b\[odd\]\.when\.speaker: one of person, character, narrator/)
		has(/b\[odd\]\.key: 'odd' is declared twice/)
		has(/b\[odd\]\.when\.narration: true or false/)
		has(/b\[act\]\.when\.actionKey: an action's key/)
		has(/b\[act\]\.when\.stateKey: a state key/)
		assert.match(boundaryTriggerFindings('all').join(' '), /a list of boundary triggers/)
		assert.deepEqual(boundaryTriggerFindings(undefined), [])
	})

	test('🚧 validate() re-checks a hand-written document with the builder\'s own sentences (§15 G18)', () => {
		const bad = [
			{ key: 'dayCrossed', label: 'x', when: { narration: true } },
			{ key: 'odd', label: '', when: { mood: 'tense' } },
		]
		const expected = boundaryTriggerFindings(bad, 'contributes.boundaryTriggers')
		assert.ok(expected.length >= 3, expected.join('\n'))
		// The builder refuses them where the author is …
		assert.throws(
			() => spec('test:spec/hand-triggers', { version: '1.0.0', contributes: { boundaryTriggers: bad } as any }),
			(e: Error) => expected.every((m) => e.message.includes(m)),
		)
		// … and a document that never went through it — the Lair's, its
		// triggers rewritten by hand — gets the same sentences from validate(),
		// at the document level (no node named).
		const sound = lairSummarizeSceneSpec() as any
		assert.deepEqual(validate(sound).filter((x) => x.law === 'boundary triggers'), [])
		const hand = { ...sound, contributes: { ...sound.contributes, boundaryTriggers: bad } }
		const found = validate(hand).filter((x) => x.law === 'boundary triggers')
		assert.deepEqual(found.map((x) => x.message), expected)
		for (const x of found) {
			assert.equal(x.severity, 'error')
			assert.equal(x.nodeKey, undefined)
			assert.match(x.fix, /\{ key, label, when \}/)
		}
		const notAList = { ...sound, contributes: { ...sound.contributes, boundaryTriggers: 'newFloor' } }
		assert.match(
			validate(notAList).filter((x) => x.law === 'boundary triggers').map((x) => x.message).join(' '),
			/contributes\.boundaryTriggers: a list of boundary triggers/,
		)
	})

	test('a stored document is read entry by entry: what does not read is left out', () => {
		assert.deepEqual(boundaryTriggersOf({ boundaryTriggers: [floor, { key: 'x', when: {} }, { ...floor, label: 'again' }] }), [floor])
		assert.deepEqual(boundaryTriggersOf({ actions: [] }), [])
		assert.deepEqual(boundaryTriggersOf(null), [])
	})

	test("each is on unless a session's override turns it off — under triggers[key]", () => {
		assert.deepEqual(declaredTriggerStates([floor]), { newFloor: true })
		assert.deepEqual(declaredTriggerStates([floor], { triggers: { newFloor: false } }), { newFloor: false })
		assert.deepEqual(declaredTriggerStates([floor], { triggers: { newFloor: 'no' } }), { newFloor: true })
		// The session's override may switch a declared key; nothing else may.
		assert.deepEqual(sceneSettingsFindings({ triggers: { newFloor: false } }, 'Scenes', { declaredTriggers: ['newFloor'] }), [])
		assert.match(
			sceneSettingsFindings({ triggers: { newFloor: 3 } }, 'Scenes', { declaredTriggers: ['newFloor'] }).join(' '),
			/Scenes\.triggers\.newFloor: a declared trigger is on or off/,
		)
		assert.match(
			sceneSettingsFindings({ triggers: { newFloor: false } }, 'g.scenes').join(' '),
			/not a boundary trigger .* declared on its summarize-scene spec/,
		)
		// A reader holding a stored override but not the spec keeps a switch it cannot check.
		assert.deepEqual(sceneSettingsFindings({ triggers: { newFloor: false } }, 'Scenes', { declaredTriggers: 'any' }), [])
		// And the form writes them back beside core's.
		const decl = sceneSettingsDecl(DEFAULT_SCENE_SETTINGS, { newFloor: false })
		assert.equal(decl.triggers?.newFloor, false)
		assert.deepEqual(resolveSceneSettings(undefined, decl), DEFAULT_SCENE_SETTINGS)
		assert.deepEqual(declaredTriggerStates([floor], decl), { newFloor: false })
	})
})
