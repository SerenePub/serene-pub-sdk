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
	resolveLibraryWrites,
	assertSessionWrites,
	LIBRARY_WRITES,
	SESSION_WRITES,
	S,
	readLibraryDraft,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	createStorySpec,
	createAssistantSpec,
	storyGenre,
	chatGenre,
	createGuideSpec,
	guideGenre,
	guideRespondSpec,
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
		assert.deepEqual(guideGenre.shape?.writes, {
			lore: false,
			scenes: false,
			library: { characters: true, lorebooks: true },
		})
		assert.deepEqual(resolveWrites(guideGenre.shape), { lore: false, scenes: false })
	})

	test('Story declares nothing, so both writes stay on', () => {
		assert.equal(storyGenre.shape?.writes, undefined)
		assert.deepEqual(resolveWrites(storyGenre.shape), { lore: true, scenes: true })
	})

	test('Chat, the assistant, writes lore (its memory, its tools) and never scenes (2026-10-19)', () => {
		assert.deepEqual(resolveWrites(chatGenre.shape), { lore: true, scenes: false })
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
	test('Story hashes as it was moved; Chat (the assistant) is pinned', () => {
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
		// Moved 2026-10-05 (spec ids genre first, ruling C4): the id is
		// `core:spec/story-create`, was `core:spec/create-chat`. Proven: the
		// document with only its id set back hashes to the old pin. (was '18b84026deb74b')
		// Moved 2026-10-19 (PLAN-genre-restructure R4): the roleplay Chat is
		// the Story genre — `core:spec/story-create`, its declaration Story's
		// (name, family, description, the fields Adventure brought, the
		// background tasks). (was '1cd1222a275dec')
		// Moved 2026-10-20 (PLAN-layering lane 3): the inlet names no genre — `{ suits: [session-created] }`, locks retired — and the author preset is the declared defaults (`.defaults()`). (was '1244f17da8e07b')
		// Moved 2026-10-21 (lane F1, R55): Story's declaration lost `applyActionChanges` — Rest follows the reckoning's mode. (was 'ae777ed4f3b4e')
		// Moved 2026-10-23 (genres GM): Story's `about` and its difficulty words corrected (lane G0, S7). (was '1b30b1e4ad7357')
		// Moved 2026-10-28 (speech build, lane D; pinned by lane V): Story declares the four speech fields (`speechReadAloud`, `speechTemplate`, `speechNarratorVoice`, `sessionLanguage`). Proven: those four removed hash back to the old pin. (was '37a22c038f516')
		assert.equal(canonicalHash(createStorySpec() as any), 'fd12c6ff3be21')
		// Adventure's create spec retired 2026-10-19 (folded into Story; its
		// last pin was '2b63bc55e3597'). 🚧 Chat, the assistant, is new: a
		// fresh id that declares `writes`, so it is no witness to the claim
		// above; pinned here so a change to it is seen.
		// Moved 2026-10-20 (PLAN-layering lane 3): the inlet names no genre — `{ suits: [session-created] }`, locks retired — and the author preset is the declared defaults (`.defaults()`). (was '63c78ba748cb9')
		assert.equal(canonicalHash(createAssistantSpec() as any), '1180def0f20ddf')
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
		// back to it; "6b6c45bf731ba" until 2026-10-05, when the id became
		// `core:spec/guide-create` (spec ids genre first, ruling C4) — proven:
		// the document with only its id set back hashes to it)
		// "1cb7b0cfc1ae44" until 2026-10-19, when the Guide declared
		// `members: 'solo'` and its `tools` field (web search, on by default).
		// Moved 2026-10-20 (PLAN-layering lane 3): the inlet names no genre — `{ suits: [session-created] }`, locks retired — and the author preset is the declared defaults (`.defaults()`). (was '16fb2ead93ba5')
		// Moved 2026-10-23 (genres GM): the Guide's `tools` field dropped and its `about` written (lane G0, S8). (was '16e203934af640')
		// Moved 2026-10-28 (speech build, lane D; pinned by lane V): Guide declares the four speech fields — its first `fields` map. Proven: that map removed hashes back to the old pin. (was 'c06cc623f9142')
		// Moved 2026-10-31 (M2c path B; re-pinned by E): the Guide genre declares `writes.library { characters, lorebooks }`. (was '135f054ab8ea7f')
		assert.equal(canonicalHash(createGuideSpec() as any), '950a043b9ff9')
	})
})

describe('library writes (M2c T)', () => {
	test('absent, unknown or unreadable resolves to all off', () => {
		const off = { characters: false, lorebooks: false, sessions: false }
		for (const junk of [undefined, null, 'x', 42, [], {}, { writes: {} }, { writes: { library: 'yes' } }])
			assert.deepEqual(resolveLibraryWrites(junk), off, String(junk))
		assert.deepEqual([...LIBRARY_WRITES], ['characters', 'lorebooks', 'sessions'])
	})

	test('only an explicit true allows a library write', () => {
		assert.deepEqual(resolveLibraryWrites({ writes: { library: { characters: true } } }), {
			characters: true,
			lorebooks: false,
			sessions: false,
		})
		assert.deepEqual(resolveLibraryWrites({ writes: { library: { lorebooks: 'true', sessions: 1 } } }), {
			characters: false,
			lorebooks: false,
			sessions: false,
		})
	})

	test('a non-boolean member, or a non-object library, is refused at the declaration', () => {
		assert.throws(
			() => assertSessionWrites({ writes: { library: { characters: 'yes' } } } as any, 'Genre x'),
			/writes\.library \{ characters: "yes" \}/,
		)
		assert.throws(() => assertSessionWrites({ writes: { library: true } } as any, 'Genre x'), /not an object/)
		assert.doesNotThrow(() => assertSessionWrites({ writes: { library: { characters: true } } }, 'Genre x'))
	})

	test('the four outlets are declared with the ids of the design', () => {
		assert.equal(C.createCharacter.id, 'core:outlet/create-character@1')
		assert.equal(C.updateCharacter.id, 'core:outlet/update-character@1')
		assert.equal(C.createLorebook.id, 'core:outlet/create-lorebook@1')
		assert.equal(C.attachLorebook.id, 'core:outlet/attach-lorebook@1')
	})

	test('Guide declares characters and lorebooks, and its reply spec compiles with the outlets', () => {
		assert.deepEqual(resolveLibraryWrites(guideGenre.shape), {
			characters: true,
			lorebooks: true,
			sessions: false,
		})
		const doc = JSON.stringify(guideRespondSpec())
		assert.match(doc, /core:outlet\/create-character"/)
		assert.match(doc, /core:outlet\/create-lorebook"/)
	})
})

describe('readLibraryDraft: the Guide reply\'s hidden draft block (M2c path B, one call per turn)', () => {
	test('reads the last block, takes every block out of the text, and reads nothing it cannot parse', () => {
		const r = readLibraryDraft('Here she is!\n\n<!--draft:character {"name": "Mira", "description": "A keeper."}-->')
		assert.equal(r.make, 'character')
		assert.deepEqual(r.draft, { name: 'Mira', description: 'A keeper.' })
		assert.equal(r.text, 'Here she is!')
		assert.equal(readLibraryDraft('<!--draft:lorebook {"name": "A"}--> then <!--draft:lorebook {"name": "B"}-->').draft?.name, 'B')
		assert.deepEqual(readLibraryDraft('Just an answer.'), { text: 'Just an answer.', make: '' })
		assert.deepEqual(readLibraryDraft('x <!--draft:character {not json}-->'), { text: 'x', make: '' })
		assert.deepEqual(readLibraryDraft('x <!--draft:spell {"a": 1}-->'), { text: 'x', make: '' })
		// cut off by the response limit before its `-->`: no draft, and never saved into the message
		assert.deepEqual(readLibraryDraft('Here she is!\n\n<!--draft:character {"name": "Mi'), { text: 'Here she is!', make: '' })
	})
})
