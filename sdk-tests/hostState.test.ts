/**
 * 🚧 Host state (RF fix 8, owner ruling 2026-10-23): what the host keeps of a
 * session beside the rules' attributes — the place and the time, ⏳ what
 * someone carries, and a genre tool's own state — never an attribute. A genre declares none of it: the
 * world's place follows a genre whose scenes are placed by it, core's
 * catalogue declares its genres' tools, and ⏳ a stored package manifest's
 * old genre slots become that genre's tool state until it moves them to
 * annex fields.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	HOST_PLACE_KEY,
	HOST_PLACE_SLOT_ID,
	HOST_STATE_ROLES,
	_registerPackageGenre,
	_withdrawGenre,
	declareHostState,
	genre,
	hostStateFindings,
	hostStateFor,
	hostStateRoleOf,
	isHostStateSlot,
	type GenreDecl,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

describe('host state', () => {
	test('the roles and the place, said once', () => {
		assert.deepEqual([...HOST_STATE_ROLES], ['place', 'time', 'carried', 'tool'])
		assert.equal(HOST_PLACE_SLOT_ID, 'core:slot/location@1')
		assert.equal(HOST_PLACE_KEY, 'location')
		assert.equal(isHostStateSlot(HOST_PLACE_SLOT_ID), true)
	})

	test("the world's place follows a genre whose scenes are placed by it — derived, never declared", () => {
		const placed = genre('acme.host:genre/placed', { name: 'Placed', family: 'story', shape: { scenes: { place: { stateKey: 'location' } } } as never, events: {} })
		const loose = genre('acme.host:genre/loose', { name: 'Loose', family: 'story', events: {} })
		assert.deepEqual(hostStateFor(placed).map((d) => [d.slot, d.role, d.owners]), [[HOST_PLACE_SLOT_ID, 'place', ['world']]])
		assert.deepEqual(hostStateFor(loose), [])
		assert.equal(hostStateRoleOf(HOST_PLACE_SLOT_ID, placed), 'place')
		assert.equal(hostStateRoleOf(HOST_PLACE_SLOT_ID, loose), undefined)
		// A scene placed anywhere else is refused: the place is the host's.
		assert.throws(
			() => genre('acme.host:genre/elsewhere', { name: 'Elsewhere', family: 'story', shape: { scenes: { place: { stateKey: 'room' } } } as never, events: {} }),
			/not a place the host keeps — the place is 'location'/,
		)
	})

	test("core's catalogue keeps its genres' tools: the Lair's whisper and direction, the crawl's; ⏳ what Story and the Lair hand out", () => {
		assert.deepEqual(hostStateFor(cat.lairGenre).map((d) => [d.slot, d.role]), [
			['core:slot/location@1', 'place'],
			['core:slot/inventory@1', 'carried'],
			['core:slot/direction@1', 'tool'],
			['core:slot/whisper@1', 'tool'],
		])
		assert.deepEqual(hostStateFor(cat.storyGenre).map((d) => [d.slot, d.role]), [
			['core:slot/location@1', 'place'],
			['core:slot/inventory@1', 'carried'],
		])
		assert.ok(!hostStateFor(cat.dungeonCrawlerGenre).some((d) => d.slot === 'core:slot/inventory@1'), 'the crawl carries the rules’ pieces, never the list')
		assert.deepEqual(hostStateFor('core:genre/chat'), [])
		const crawl = hostStateFor(cat.dungeonCrawlerGenre)
		assert.equal(crawl.find((d) => d.slot === 'core:slot/crawl-time@1')?.role, 'time')
		assert.ok(!crawl.some((d) => d.slot === 'core:slot/hp@1'), 'health is the rules’, never the host’s')
	})

	test('a declaration is checked, and declared once however often', () => {
		assert.deepEqual(hostStateFindings({ slot: 'x', role: 'tool', genres: ['g'] }), [])
		assert.equal(hostStateFindings({ slot: '', role: 'tool', genres: [] }).length, 2)
		assert.match(hostStateFindings({ slot: 'x', role: 'attribute', genres: ['g'] })[0]!, /role is one of place, time, carried, tool/)
		const once = { slot: 'acme.host:slot/lamp@1', role: 'tool' as const, genres: ['acme.host:genre/lamps'] }
		declareHostState([once])
		declareHostState([once])
		assert.equal(hostStateFor('acme.host:genre/lamps').length, 1)
		assert.throws(() => declareHostState([{ slot: 'x', role: 'nope', genres: ['g'] } as never]), /role is one of/)
	})

	test("⏳ a stored manifest's genre slots become its tool state, withdrawn with the genre", () => {
		const id = 'acme.old:genre/quiz'
		_registerPackageGenre('acme.old', {
			id,
			name: 'Quiz',
			family: 'game',
			events: {},
			slots: [{ id: 'acme.old:slot/score@1' }],
			sheets: [{ slots: [{ id: 'acme.old:slot/turns@1', appliesTo: ['world'] }] }],
			customAttributes: 'allow',
		} as unknown as GenreDecl)
		assert.deepEqual(hostStateFor(id).map((d) => [d.slot, d.role, d.owners ?? null]), [
			['acme.old:slot/turns@1', 'tool', ['world']],
			['acme.old:slot/score@1', 'tool', null],
		])
		_withdrawGenre(id)
		assert.deepEqual(hostStateFor(id), [])
	})
})
