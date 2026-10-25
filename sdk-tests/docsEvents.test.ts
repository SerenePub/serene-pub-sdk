/**
 * 🚧 A1 — **the event catalogue is the declarations, rendered** (lane 9,
 * 2026-10-21).
 *
 * Fit (R4) refuses a registration in words — "Story reply reads the speaker;
 * scene-opened carries none" — and those words are only clear against a list
 * of what each trigger carries. `renderEventsDocs()` renders that list from
 * the same declarations the registration door reads (`coreEvents` with their
 * `carries`, `ACTION_CARRIES`, `coreCadences`), and every announcement's docs
 * carry it. What is pinned: every core event and every core cadence is on the
 * page with what it carries; a genre page shows the genre's defaults by
 * trigger family; a preset reads as changes on them; a spec page says what it
 * was made for and what it reads, never an inlet lock.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { allCadences, coreEvents, entityWord, eventCarries, eventIdOf, type EventDef } from '@serene-pub/sdk'
import { renderAnnouncementDocs, renderEventsDocs } from '@serene-pub/cli'
import { coreAnnouncement } from '@serene-pub/core-catalog'

const eventsPage = () => {
	const pages = renderEventsDocs()
	assert.equal(pages.length, 1)
	assert.equal(pages[0]!.path, 'events.md')
	return pages[0]!.markdown
}

describe('A1 · the event catalogue', () => {
	test('every core event is a row, with what its body carries', () => {
		const md = eventsPage()
		for (const e of Object.values(coreEvents as Record<string, EventDef>)) {
			const row = md.split('\n').find((l) => l.startsWith(`| \`${eventIdOf(e)}\` |`))
			assert.ok(row, `${eventIdOf(e)} has no row`)
			for (const k of eventCarries(e)) assert.ok(row!.includes(entityWord(k)), `${eventIdOf(e)}'s row leaves out ${k}`)
		}
	})

	test('the five session moments are there, and every core cadence', () => {
		const md = eventsPage()
		for (const slug of ['turn-ended', 'round-ended', 'scene-opened', 'scene-closed', 'story-clock-moved'])
			assert.match(md, new RegExp(`core:event/${slug}@1`))
		for (const c of allCadences().filter((x) => x.id.startsWith('core:')))
			assert.ok(md.includes(`| \`${c.id}\` |`), `${c.id} has no row`)
	})

	test('an announcement’s docs carry the catalogue, the genre’s defaults and presets as changes', () => {
		const pages = renderAnnouncementDocs(coreAnnouncement().document, () => undefined)
		assert.ok(pages.some((p) => p.path === 'events.md'), 'the events page rides with the announcement')
		const index = pages.find((p) => p.path === 'index.md')!.markdown
		assert.match(index, /\[Events and what they carry\]\(events\.md\)/)
		const story = pages.find((p) => p.path === 'genres/core_genre_story.md')!.markdown
		assert.match(story, /## The genre’s defaults/)
		assert.match(story, /### Routines/)
		assert.match(story, /`core:spec\/story-reckoning`/)
		assert.match(story, /\| `core:event\/message-respond@1` \| [a-z]+ \| `core:spec\/story-respond` \|/)
		assert.match(index, /\| drops \| `after-each-round→story-reckoning` \|/)
		const reply = pages.find((p) => p.path === 'pipelines/core_spec_story-respond.md')!.markdown
		assert.match(reply, /Made for `core:event\/message-respond@1`/)
		assert.doesNotMatch(reply, /usage lock/)
	})
})
