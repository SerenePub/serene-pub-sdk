/**
 * Declared writes (R-B, ruled 2026-09-17) — what a session of a genre may
 * write *beyond messages*.
 *
 * Today a genre says `lorebook: optional | required` and nothing about whether
 * sessions of it may add entries or open scenes; those writes live in whichever
 * specs a preset binds, so a user-attached pipeline or a plugin hook can start
 * rewriting a character's lorebook mid-game. `SessionShape.writes` is the
 * declaration that ends that, on exactly `messageVerbs`' terms: presence is
 * presentation, refusal is the law, and the law is enforced at the write site.
 *
 * What is pinned here:
 *
 *  1. **Absent is on.** A genre that says nothing keeps the standard chat's
 *     posture, and so does an unreadable shape — a policy that cannot be read
 *     refuses nothing.
 *  2. **Only an explicit `false` takes a write away**, per key.
 *  3. **A non-boolean is refused at the declaration**, with a sentence naming
 *     the genre, from `genre()` and from a definition's `sessionShape` alike.
 *  4. **Guide declares both off** (R-A): its lorebook is documentation.
 *  5. **The addition is additive.** A genre that declares no `writes` compiles
 *     to the document it always did, and its hash has not moved.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	genre,
	describeInletDefinition,
	getDefinition,
	spec,
	compile,
	canonicalHash,
	resolveWrites,
	SESSION_WRITES,
	S,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	adventureCreateSpec,
	adventureGenre,
	chatGenre,
	createChatSpec,
	createGuideSpec,
	guideGenre,
} from '@serene-pub/core-catalog'

describe('resolving a genre’s writes', () => {
	test('the two switchable writes are lore and scenes', () => {
		assert.deepEqual([...SESSION_WRITES], ['lore', 'scenes'])
	})

	test('absent resolves to both on — the standard chat’s posture', () => {
		assert.deepEqual(resolveWrites({}), { lore: true, scenes: true })
		assert.deepEqual(resolveWrites({ lorebook: 'optional' }), { lore: true, scenes: true })
	})

	test('an unknown or unreadable shape resolves to both on, and never throws', () => {
		for (const junk of [undefined, null, 'chat', 42, [], { writes: null }, { writes: 'no' }])
			assert.deepEqual(resolveWrites(junk), { lore: true, scenes: true }, String(junk))
	})

	test('an explicit false resolves off — per key, and only false', () => {
		assert.deepEqual(resolveWrites({ writes: { lore: false } }), {
			lore: false,
			scenes: true,
		})
		assert.deepEqual(resolveWrites({ writes: { scenes: false } }), {
			lore: true,
			scenes: false,
		})
		assert.deepEqual(resolveWrites({ writes: { lore: false, scenes: false } }), {
			lore: false,
			scenes: false,
		})
		// Stated on is on, and a key this release does not know is not a write.
		assert.deepEqual(resolveWrites({ writes: { lore: true, graphs: false } }), {
			lore: true,
			scenes: true,
		})
	})
})

describe('a non-boolean write is refused at the declaration', () => {
	test('genre() refuses it with a sentence naming the genre', () => {
		assert.throws(
			() =>
				genre('test.writes:genre/loose', {
					name: { en: 'Loose' },
					family: 'test',
					shape: { writes: { lore: 'no' } } as any,
				}),
			/test\.writes:genre\/loose declares writes \{ lore: "no" \}[\s\S]*boolean or absent/,
		)
		// Refused before the id was claimed: it can be fixed and retried.
		assert.doesNotThrow(() =>
			genre('test.writes:genre/loose', {
				name: { en: 'Loose' },
				family: 'test',
				shape: { writes: { lore: false } },
			}),
		)
	})

	test('a writes that is not an object at all is refused too', () => {
		assert.throws(
			() =>
				genre('test.writes:genre/scalar', {
					name: { en: 'Scalar' },
					family: 'test',
					shape: { writes: true } as any,
				}),
			/declares a 'writes' that is not an object/,
		)
	})

	test("a definition's sessionShape is refused on the same terms", () => {
		assert.throws(
			() =>
				describeInletDefinition({
					id: 'test.writes:inlet/loose@1',
					i18n: { name: { en: 'Loose' } },
					sessionShape: { writes: { scenes: 1 } } as any,
					ports: { out: { main: S.json } },
				}),
			/boolean or absent/,
		)
		assert.equal(getDefinition('test.writes:inlet/loose@1'), undefined)
	})

	test('absent, and every boolean combination, are accepted', () => {
		for (const [i, writes] of [
			undefined,
			{},
			{ lore: true },
			{ lore: false },
			{ scenes: false },
			{ lore: false, scenes: false },
		].entries())
			assert.doesNotThrow(
				() =>
					genre(`test.writes:genre/ok${i}`, {
						name: { en: 'Ok' },
						family: 'test',
						shape: writes ? { writes } : {},
					}),
				JSON.stringify(writes),
			)
	})
})

describe('the core genres', () => {
	test('Guide writes neither lore nor scenes (R-A) — its lorebook is documentation', () => {
		assert.deepEqual(guideGenre.shape?.writes, { lore: false, scenes: false })
		assert.deepEqual(resolveWrites(guideGenre.shape), { lore: false, scenes: false })
	})

	test('chat and adventure declare nothing, so both writes stay on', () => {
		for (const g of [chatGenre, adventureGenre]) {
			assert.equal(g.shape?.writes, undefined, g.id)
			assert.deepEqual(resolveWrites(g.shape), { lore: true, scenes: true }, g.id)
		}
	})
})

describe('the addition is additive', () => {
	const built = (shape: any) =>
		compile(
			spec('demo:spec/create-writes', {
				version: '1.0.0',
				taxonomy: { role: 'create' },
				genre: { name: { en: 'Writes' }, family: 'test', shape },
			})
				.inlet('input', C.userMessage.v1())
				.build(),
		)

	test('a genre that declares no writes carries none — the field is not materialised', () => {
		assert.equal((built({ composer: 'text' }).genre as any).shape.writes, undefined)
	})

	test('declaring writes IS a content change — the hash moves, as a republish should', () => {
		assert.notEqual(
			canonicalHash(built({ composer: 'text' })),
			canonicalHash(built({ composer: 'text', writes: { lore: false } })),
		)
	})

	/**
	 * The create specs carry their genre's declaration on the version row, so
	 * their hashes are where "nothing moved" is checkable. These three values
	 * are core's **recorded** pins, copied from the app's
	 * `pipelines/boot/specHashes.test.ts` as they stood before `writes`
	 * existed. Two must still match — chat and adventure declare no writes —
	 * and Guide's is the one that moved, because Guide's declaration changed.
	 */
	test('chat and adventure hash exactly as they did before writes existed', () => {
		// Both moved on 2026-09-21, twice: when `shape.speakerStrategies`
		// replaced `nextSpeaker` (were "1bc0b0f6dc8999" and "240458abb4e3b",
		// then "11f6c592f98eee" and "1e295d10acfa23"), and again the same day
		// (PLAN-turn-order A1) when `SessionShape.turnOrder` replaced it —
		// chat now declares the six strategies, adventure declares no key.
		// And once more at the modder pass (R28, 2026-09-23): chat's shape
		// dropped `turnOrder` — its swaps live on its turn-order spec's node
		// (was "11314fd704f715"), and at M4 when chat declared `turnMode` for
		// its model path (was "e70d8596bfe5d").
		// Moved 2026-09-27 (characterDetail genre field): Chat and Adventure
		// declare `fields.characterDetail` (CHARACTER_DETAIL_FIELD: full / brief /
		// speaker-only). Proven: a copy of core-catalog/src with just those two
		// field lines removed from genres.ts hashes back to the old pin. (was '765f3317d71e6')
		// Moved 2026-10-02 (author's note AN1): Chat declares
		// `fields.authorsNote`. (was '193fca0f5fc4ae')
		// Moved 2026-10-03 (placed text at the end): the author's note field's
		// `depth` default is 0; the app's specHashes.test.ts records it. (was '1566992a444e50')
		assert.equal(canonicalHash(createChatSpec() as any), '18b84026deb74b')
		// Adventure moved 2026-09-27 (lair pass B9): its genre's events
		// gained message-deleted and message-hidden (was "4b16999c12ab3").
		// Moved 2026-09-27 (characterDetail genre field): Chat and Adventure
		// declare `fields.characterDetail` (CHARACTER_DETAIL_FIELD: full / brief /
		// speaker-only). Proven: a copy of core-catalog/src with just those two
		// field lines removed from genres.ts hashes back to the old pin. (was '4e1033c247420')
		// Moved 2026-09-28 (enum option labels on Adventure's tone/difficulty); removing those `members` restores the old pin exactly (was 'e611ef3a97923').
		assert.equal(canonicalHash(adventureCreateSpec() as any), '17f29013f5ffc6')
	})

	test('Guide’s moved, once, because Guide now declares something', () => {
		// (was "fa7a3eb64e2a9" — the pin before `writes: { lore: false, scenes: false }`;
		// "9618c46ed4d02" while `speakerStrategies: []` was declared 2026-09-21;
		// back at "fad8888e9b78f" since A1 dropped the key the same day;
		// "1febb9fe3bd3f5" until 2026-09-26, when the mascot was marked the
		// genre's `fallback` envoy — everyone has a name; "3be276ae1ff00" until
		// 2026-09-27, when the guide grounding rewrote the mascot's prompt and
		// description — proven: those two strings restored hash back to it;
		// "1305f4e75ffa6d" until 2026-10-01, when create-guide 1.1.0 began writing
		// Serene's declared greeting — proven: guide.ts and genres.ts reverted hash
		// back to it)
		assert.equal(canonicalHash(createGuideSpec() as any), '6b6c45bf731ba')
	})
})
