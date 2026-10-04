/**
 * Folded sections (B4; decision D5, 2026-09-27): the port's checks, where a
 * row keeps them per alternative, and the `core:section` part each becomes.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	MAX_FOLDED_SECTIONS,
	checkFoldedSections,
	foldedSectionPart,
	foldedSectionsOf,
	sectionItemsOf,
	withFoldedSections,
	type FoldedSectionV1,
} from '@serene-pub/sdk'

const plan: FoldedSectionV1 = { kind: 'plan', label: 'Plan', items: ['Wren — draws', 'Goblin — flees'] }
const notes: FoldedSectionV1 = { kind: 'notes', label: 'Step notes', content: 'Low light.' }

test('checkFoldedSections normalizes, drops the empty and refuses the malformed by position', () => {
	assert.deepEqual(checkFoldedSections(undefined), {})
	assert.deepEqual(checkFoldedSections(null), {})
	assert.deepEqual(checkFoldedSections([{ kind: 'plan', label: ' Plan ', items: [' a ', ''] }]), {
		sections: [{ kind: 'plan', label: 'Plan', items: ['a'] }],
	})
	// Nothing to show is left out, not refused.
	assert.deepEqual(checkFoldedSections([{ kind: 'plan', label: 'Plan', items: [] }, { ...notes, content: ' ' }]), {
		sections: [],
	})
	const refusal = (v: unknown) => checkFoldedSections(v).refusal ?? ''
	assert.match(refusal('plan'), /list/)
	assert.match(refusal([notes, { kind: 'Plan', label: 'x', content: 'y' }]), /section 2 .*kind/)
	assert.match(refusal([{ kind: 'plan', label: '', content: 'y' }]), /section 1 .*label/)
	assert.match(refusal([{ kind: 'plan', label: 'P', content: 'y', items: ['z'] }]), /exactly one/)
	assert.match(refusal([{ kind: 'plan', label: 'P' }]), /exactly one/)
	assert.match(refusal([{ kind: 'plan', label: 'P', items: [1] }]), /items/)
	assert.match(refusal(Array.from({ length: MAX_FOLDED_SECTIONS + 1 }, () => notes)), /at most/)
})

test('foldedSectionsOf reads the row, then each alternative', () => {
	assert.deepEqual(foldedSectionsOf({ sections: [plan] }), [plan])
	assert.deepEqual(foldedSectionsOf(null), [])
	// Before any history is kept, the first alternative's are the row's own.
	const swiped = { sections: [plan], swipes: { currentIdx: 1, history: ['a', 'b'] } }
	assert.deepEqual(foldedSectionsOf(swiped), [])
	assert.deepEqual(foldedSectionsOf(swiped, 0), [plan])
	const kept = { sections: [plan], swipes: { currentIdx: 1, history: ['a', 'b'], sectionsHistory: [null, [notes]] } }
	assert.deepEqual(foldedSectionsOf(kept), [notes])
	assert.deepEqual(foldedSectionsOf(kept, 0), [])
})

test('withFoldedSections replaces the shown alternative whole, and leaves the others', () => {
	assert.deepEqual(withFoldedSections({ reasoning: 't' }, [plan]), { reasoning: 't', sections: [plan] })
	assert.deepEqual(withFoldedSections({ sections: [plan] }, []), {})
	const before = { sections: [plan], swipes: { currentIdx: 1, history: ['a', 'b'] } }
	const after = withFoldedSections(before, [notes])
	assert.deepEqual(after.swipes, { currentIdx: 1, history: ['a', 'b'], sectionsHistory: [[plan], [notes]] })
	assert.deepEqual(foldedSectionsOf(after, 0), [plan])
	assert.deepEqual(foldedSectionsOf(after, 1), [notes])
	// The input is not touched.
	assert.equal('sectionsHistory' in before.swipes, false)
	// Cleared on the shown slot only.
	assert.deepEqual(foldedSectionsOf(withFoldedSections(after, []), 0), [plan])
	assert.deepEqual(foldedSectionsOf(withFoldedSections(after, []), 1), [])
})

test('foldedSectionPart: a list as markdown bullets beside its items, text as itself', () => {
	assert.deepEqual(foldedSectionPart(plan), {
		type: 'core:section',
		content: '- Wren — draws\n- Goblin — flees',
		data: { title: 'Plan', kind: 'plan', items: ['Wren — draws', 'Goblin — flees'] },
	})
	assert.deepEqual(foldedSectionPart(notes), {
		type: 'core:section',
		content: 'Low light.',
		data: { title: 'Step notes', kind: 'notes' },
	})
})

test('sectionItemsOf lists a document as plain lines, never JSON (B5)', () => {
	const doc = {
		beats: ['The torch gutters.', '  '],
		speakers: [{ name: 'Wren', intent: 'draws' }, { name: 'Goblin', intent: '', extra: { deep: 1 } }],
		unknownExit: '',
	}
	assert.deepEqual(sectionItemsOf(doc, 'beats, speakers'), ['The torch gutters.', 'Wren — draws', 'Goblin'])
	assert.deepEqual(sectionItemsOf(doc, 'unknownExit'), [])
	assert.deepEqual(sectionItemsOf(['a', 2, true, null]), ['a', '2', 'true'])
	assert.deepEqual(sectionItemsOf(undefined, 'beats'), [])
	assert.deepEqual(sectionItemsOf('solo'), ['solo'])
})
