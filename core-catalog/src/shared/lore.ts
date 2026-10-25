/**
 * 🚧 **The lore builders** (pass 8 §2, pass 6): `fileLore` and `rememberNote`,
 * the two shapes core's pipelines file lore by. Each expands to the explicit
 * `C.createLoreEntry.v1(...)` outlet (house rule: helpers expand to explicit
 * specs) and writes `{ entryType }` into the pipeline's declared defaults.
 *
 * ⚠ The app's tool-loop `ToolCtx.fileLore` (runtime/tools/writeTools.ts) is the
 * same act reached from a tool call; the builder is the pipeline step.
 */

import { slot, ITEM, type EntryDescriptor } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import type { LoreMatch } from '@serene-pub/contracts'
import { chainOf, jsonPart, textPart, on, type Chain, type NodeOn, type ReadOn, type Wiring } from './calls.js'
import { bareEntryTypeId } from '../registry/entries.js'

/**
 * 🚧 One lore entry per item of a list a step produced (sweep lore/people/places, DC places/people/cairns, Remember
 * things' notes): `jsonPart(list)` → `.each(each)` → `textPart(name)` → `textPart(content)` → [`jsonPart(links)`] → outlet `write`.
 * Returns what that `.each(…)` returns, as the call sites return it from their arm. @experimental
 */
export function fileLore<B extends Chain>(
	c: B,
	w: Wiring,
	opts: {
		/** The step whose JSON output holds the list, read by its FULL path. */
		from: ReadOn<B>
		/** The list's member in that output (`places`, `notes`, `loreFull`). */
		member: string
		/** The list step's label — "The places", "The notes", "The lore entrys" (today's words, kept). */
		listLabel: string
		/** The `each` key — `entry`, `note`, `place`, `person`, `cairn`. */
		each: string
		/** What one item is called: "The <noun>'s name", "What the <noun> says". */
		noun: string
		/** The name step's label when it is not "The <noun>'s name" — Remember things says "The note's title". */
		nameLabel?: string
		/** At most this many per run (the `each` max). */
		max: number
		/** The declared entry type every item is filed as. */
		entryType: EntryDescriptor<string>
		/** The outlet's `expose.label` — "File the note", "Hold the note for review", "Write a place". */
		writeLabel: string
		/** Items carry `links` (a place's ways out), labelled "Its ways out". Default false. */
		links?: boolean
		/** A Review arm: the outlet is pushed onto this list, and " (for review)" is appended to the list, name and content labels. Absent: Full. */
		review?: NodeOn[]
		/** 🚧 The messages the list was written from — a generated write. Absent: a change in the story. */
		sources?: ReadOn<B>
		/** 🚧 Find-or-update by the item's own name within `entryType`. Default off. */
		matchByName?: boolean
	},
): any {
	const { review, sources } = opts
	const rv = (s: string) => (review ? `${s} (for review)` : s)
	return jsonPart(c, w, 'list', opts.from, opts.member, rv(opts.listLabel)).each(
		opts.each,
		{ over: ($) => $.list.main, max: opts.max },
		(m: any) => {
			w.params.push([on(m, 'write'), { entryType: bareEntryTypeId(opts.entryType) }])
			if (review) review.push(on(m, 'write'))
			const named: any = textPart(
				textPart(m, w, 'name', ($) => $[ITEM], 'name', rv(opts.nameLabel ?? `The ${opts.noun}'s name`)),
				w,
				'content',
				($) => $[ITEM],
				'content',
				rv(`What the ${opts.noun} says`),
			)
			const withLinks: any = opts.links ? jsonPart(named, w, 'links', ($) => $[ITEM], 'links', 'Its ways out') : named
			return withLinks.outlet(
				'write',
				// derive-don't-spell: a builder generic over the caller's chain reads the nodes it just added itself (`name`, `content`, `links`); no `ScopeOf` names a node added inside the builder
				($: any) =>
					C.createLoreEntry.v1({
						name: $.name.text,
						content: $.content.text,
						...(opts.links ? { links: $.links.main } : {}),
						...(sources ? { sources: (sources as any)($) } : {}),
						...(opts.matchByName ? { match: { name: $.name.text } } : {}),
						params: slot.params(),
					}),
				{ expose: { label: opts.writeLabel } },
			)
		},
	)
}

/** 🚧 One lore entry from a name and content already on the chain (the summarisers' save, the sweep's summary). @experimental */
export function rememberNote<B extends Chain>(
	c: B,
	w: Wiring,
	opts: {
		/** The outlet's node key — `save` for the summarisers. */
		key: string
		name: ReadOn<B>
		content: ReadOn<B>
		entryType: EntryDescriptor<string>
		review?: NodeOn[]
		/** 🚧 The messages it was written from — required by C39 in a pipeline that reads a span (§C-7). */
		sources?: ReadOn<B>
		/** 🚧 Find-or-update (`LoreMatch`), e.g. one running summary per session. */
		match?: LoreMatch
		expose?: { label: string }
	},
): B {
	const { key, review, sources, match } = opts
	w.params.push([on(c, key), { entryType: bareEntryTypeId(opts.entryType) }])
	if (review) review.push(on(c, key))
	return chainOf(c).outlet(
		key,
		// derive-don't-spell: a builder generic over the caller's chain reads the nodes it just added itself (`name`, `content`, `links`); no `ScopeOf` names a node added inside the builder
				($: any) =>
			C.createLoreEntry.v1({
				name: (opts.name as any)($),
				content: (opts.content as any)($),
				...(sources ? { sources: (sources as any)($) } : {}),
				...(match ? { match } : {}),
				params: slot.params(),
			}),
		opts.expose ? { expose: opts.expose } : undefined,
	) as never
}
