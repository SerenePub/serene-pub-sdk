/**
 * Core's **query** node definitions — reads.
 *
 * One file per node kind, with the helpers only that kind uses; `index.ts`
 * re-exports them all.
 */

import { S, BAND_PRIORITIES } from '@serene-pub/sdk'
import { describeQueryDefinition, pin } from '@serene-pub/sdk'
import {
	varWorldLore,
	varCharacterLore,
	varHistory,
	varDocsExcerpts,
	varRecalledLines,
} from '@serene-pub/sdk'

/**
 * `BAND_PRIORITIES` as a person reads them. A factory for the reason
 * `streamingParam` is: each declaration gets its own objects.
 */
const bandPriorityMembers = () => [
	{
		key: 'low',
		label: { en: 'Low' },
		description: { en: 'Its entries go behind the others when leftover room is handed out.' },
	},
	{
		key: 'normal',
		label: { en: 'Normal' },
		description: { en: 'No ordering: leftover room follows relevance alone.' },
	},
	{
		key: 'high',
		label: { en: 'High' },
		description: { en: 'Its entries go ahead of the others when leftover room is handed out.' },
	},
	{
		key: 'always',
		label: { en: 'Always' },
		description: { en: 'Every entry the window can hold is kept, ahead of the scored fill.' },
	},
]

// ── Queries ─────────────────────────────────────────────────────────────────

/** @public */
export const sessionHistory = pin(
	describeQueryDefinition({
		id: 'core:query/session-history@1',
		i18n: { name: { en: 'Session history' } },
		timeoutMs: 2000,
		slots: {
			/**
			 * ⚠ No `template` slot, and there was one.
			 *
			 * It declared "how each chat message is written into the context",
			 * and three things were true of it: no binding ever read it, no row
			 * was ever seeded for its pool, and so the panel rendered a picker
			 * with **nothing in it** on every pipeline that used this node. A
			 * control that cannot be given a value and would not be used if it
			 * could is worse than the absence of the feature.
			 *
			 * If per-message wording becomes configurable, it belongs on
			 * `core:task/process-messages@1`, which is what actually formats a
			 * line. This node fetches rows.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ The default is **100 because 100 is what every install
					 * has been getting**, not because 100 was chosen.
					 *
					 * It read 40 here and nothing read it: the binding took
					 * `input.limit`, a key nothing supplies, and fell through to
					 * a literal 100 on every run. Wiring the control while
					 * leaving the declared number at 40 would have moved the
					 * transcript window from 100 to 40 on every install at
					 * defaults — a retrieval change smuggled in behind a typing
					 * fix. So the declaration is corrected to the effective
					 * value first; changing the number is a separate decision,
					 * made against the measure corpus.
					 *
					 * Exactly the ruling `topK` got (2026-09-07), for exactly
					 * the same defect.
					 *
					 * ⚠ **Not read when `budget` is wired** (history window,
					 * 2026-10-03): that read is sized by the context window,
					 * which belongs to the sampling config (17 §1a) — a count
					 * of rows beside it is the same number entered twice, and
					 * the count is what moved the prompt's first line on every
					 * turn once a session passed it. Every shipped reply wires
					 * the budget; the asking steps (a form's answer, Adventure's
					 * Ask, the Lair's room drafting), the turn order and any
					 * spec that does not keep reading this.
					 */
					limit: {
						type: 'integer',
						default: 100,
						description:
							'How many recent messages are read. Not used where the read is sized by the context window — every shipped reply — which reads as much as the window could hold twice over and lets the prompt decide where the conversation starts.',
					},
					/**
					 * The channel this history reads (20 §7). A session's
					 * lanes are the mode's declaration; a pipeline chooses
					 * which one builds its context — the map narrator reads
					 * `map`, the chat pipeline reads `main`, and a custom
					 * spec may do otherwise on purpose.
					 */
					channel: {
						type: 'string',
						default: 'main',
						description:
							"Which of the session's channels this history reads. The chat log is 'main'.",
					},
					/**
					 * **Only the unplayed talk** (lair re-plan R13, 2026-09-28):
					 * the rows of a side channel written since the story's
					 * newest generated line — the newest visible `main` row
					 * whose role is not `user`. Of those it keeps a person's own
					 * lines and the replies a run fired ON this channel wrote
					 * there (its inlet's `channel` is this one); a row a create
					 * run wrote (a greeting) or a story turn wrote (the Lair's
					 * beats row) is left out, read off the run artifacts, never
					 * a row's metadata. `limit` still caps it, newest kept.
					 *
					 * Refused with `channel: 'main'`: the story's own rows are
					 * the bound, never the talk.
					 */
					unplayedOnly: {
						type: 'boolean',
						default: false,
						label: { en: 'Only since the last story line' },
						description: {
							en: "Read only what was said on this channel since the story's newest generated line: people's lines and the replies to them. Cannot be used with the 'main' channel.",
						},
					},
					/**
					 * **Side channels as talk** (lair re-plan R10's fold-in of
					 * the R9 follow-up, 2026-09-28): on every channel but
					 * `main`, keep only the talk — a person's own lines and the
					 * replies a run fired ON that channel wrote there — by the
					 * rule `unplayedOnly` uses, without its bound. A row a
					 * create run wrote (a greeting) or a story turn wrote (the
					 * Lair's Sanctum beats row) is left out, read off the run
					 * artifacts, never a row's metadata. `main` rows are kept
					 * whole. The window is the newest `limit` rows before the
					 * filter, so it may hand on fewer.
					 *
					 * The Lair's room check reads every channel with it
					 * (`exitProse`): a beats list naming a room is the
					 * Castellan's plan, not a description of the room.
					 */
					talkOnly: {
						type: 'boolean',
						default: false,
						label: { en: 'Side channels: talk only' },
						description: {
							en: "On every channel but 'main', read only what was said there: people's lines and the replies to them — never a greeting or a turn's notes.",
						},
					},
					/**
					 * The transcript's intent, on the node that produces the
					 * transcript (R-7 P5, built 2026-09-16 — see
					 * `bandIntentFields`). `weight: 0.4` and `minInclude: 6`
					 * were here once, moved to the ranker's per-source map as
					 * `share.messages` and `minEntries.messages`, and are back
					 * where 16 §5a always said they belonged, at the numbers
					 * the map held: half the window is `MESSAGE_FILL_FRACTION`,
					 * and six is the minimum the map carried for the one band
					 * R6 allows one.
					 *
					 * ⚠ **No shipped spec ranks a message candidate** —
					 * `main` carries the transcript rows for
					 * `process-messages`, and `assemble` builds the transcript
					 * from those, never from ranked candidates. Two things
					 * keep it so: `entity-search`'s past lines publish on
					 * their own `recalledLines` band, and `vector-search`
					 * asks the index for lorebook entries only (the app's
					 * binding names them; plan A1). Its intent
					 * still reaches the ranker, on the `band` out-port a spec
					 * concatenates in with the lore, and its `share` is what
					 * halves the pool the lore sources divide: the
					 * conversation's slice is reserved and whatever it does
					 * not spend is swept to the others, exactly as the map's
					 * `messages: 0.5` did. `maxEntries` and `minEntries` bind
					 * only when a spec does rank message candidates (a
					 * compression region, or a plugin source publishing on
					 * this band); they are declared at the map's values so
					 * that spec inherits what every install has stored, not
					 * so a person moving them today sees a prompt change —
					 * they will not.
					 */
					share: {
						type: 'number',
						min: 0,
						default: 0.5,
						quick: true,
						label: { en: 'Share — conversation' },
						description: {
							en: 'How much of the context window the conversation may take, relative to every other source. What it does not spend is handed to the lore. Set to zero to give the whole window to the other sources.',
						},
					},
					maxEntries: {
						type: 'integer',
						min: 0,
						default: 50,
						label: { en: 'Most entries — conversation' },
						description: {
							en: 'A ceiling on how many retrieved messages may reach the prompt as ranked entries, whatever the share. The transcript itself is sized by the window, not by this.',
						},
					},
					minEntries: {
						type: 'integer',
						min: 0,
						default: 6,
						label: { en: 'Always keep at least' },
						description: {
							en: 'Recent messages kept as ranked entries whatever the shares say, so a lore-heavy chat stays readable. Dropped when there is no room. Lore has no minimum — it competes on score (R6).',
						},
					},
					/**
					 * Read, at last (R-7 P5; it was declared and read by nothing
					 * from the day it was written, allow-listed in the
					 * declared-reads guard until this landed). `normal` is no
					 * ordering at all; see `BAND_PRIORITIES` in the SDK for
					 * what the other three do to the ranker's sweep.
					 */
					priority: {
						type: 'enum',
						of: BAND_PRIORITIES,
						members: bandPriorityMembers(),
						default: 'normal',
						label: { en: 'Priority — conversation' },
						description: {
							en: "How strongly the conversation resists being trimmed once the shares are spent — 'always' keeps every message the window can hold.",
						},
					},
				},
			},
		},
		ports: {
			in: {
				scope: S.sessionScope,
				/**
				 * **The window this read is sized by** (history window,
				 * 2026-10-03) — `$.contextBudget.available`, the same value
				 * the prompt's `assemble` is handed. Wired, the read is the
				 * newest rows until a deliberately generous estimate
				 * (characters ÷ 4, nothing for names or scaffolding) reaches
				 * **twice** the budget's `total`, or every row — never more
				 * than 2000 — and `limit` is not read. Fitting those rows to
				 * the window stays `assemble`'s (its transcript fit, which
				 * cuts the oldest lines in a chunk and holds the cut across
				 * turns): reading twice what fits is what lets that held cut,
				 * not a row count, decide where the conversation starts.
				 * Unwired, the window is the newest `limit` rows, as it
				 * always was.
				 *
				 * Not read with `unplayedOnly` (the talk keeps its `limit`)
				 * or a wired `messageId` (one row). There was a `budget`
				 * in-port once (culled 2026-09-16, R-12): declared and read by
				 * nothing. This one has a reader.
				 */
				budget: S.budget,
				/**
				 * **One row, by id** (lair re-plan R11, 2026-09-28): wired —
				 * `$.input.messageId`, the message a press on a message's ⋮
				 * was made on — the read is exactly that row, whatever its
				 * channel, as a one-row transcript; `limit`, `budget`,
				 * `channel`, `unplayedOnly` and `talkOnly` do not apply. The row must be
				 * this session's, and a hidden or still-generating row reads
				 * as nothing, the same as in any window. Unwired, the window
				 * reads as it always did. For an action that acts on the row
				 * it was pressed on (the Lair's *File as a room*): the inlet
				 * carries the id, never the text, so the row is read here.
				 */
				messageId: S.rowIds,
			},
			out: {
				/**
				 * Transcript rows, on both — `messages@1` (was
				 * `context-candidates@1` until 2026-09-17, U5d review W9: the
				 * value had always been rows, for `process-messages` and
				 * `prose-transcript`, and the intent rides `band` alone).
				 * Neither is a candidates list (R-a, the same day): a spec that
				 * wires either into a merge, a concat or `assemble`'s
				 * `candidates` gets a `validate()` warning naming `band` — the
				 * host drops rows handed as candidates rather than ranking them.
				 */
				main: S.messages,
				messages: S.messages,
				/**
				 * The conversation's **band intent**, alone — a candidates
				 * list holding one element and no items (`BandIntent`), for a
				 * spec to concatenate in with the lore so the ranker reserves
				 * the transcript's slice. Its own port because `main` and
				 * `messages` carry transcript rows for `process-messages`, and
				 * an intent element ahead of them would be read as a message.
				 * Opens with a band-intent element (and holds nothing else)
				 * — readers call `splitCandidates()`.
				 */
				band: S.candidates,
			},
		},
	}),
)

/**
 * How much non-key evidence brings an entry in when no keyword matched.
 *
 * The scan admits a candidate on `pinned || keyword > 0 || nameMatch > 0`, and
 * every other signal is computed *before* that line — so tf-idf and entity
 * co-occurrence could only ever reorder what an author's keys had already let
 * through. An entry with no matching key could not reach the prompt however
 * relevant it was, which is the whole reason a lorebook has to be hand-indexed:
 * "the Riders", "them" and "the order" are all the Ashguard, and only the
 * author writing each of them down makes the entry fire.
 *
 * This opens that line to evidence:
 *
 *     admit ⟸ pinned ∨ keyword > 0 ∨ nameMatch > 0 ∨ evidence ≥ admitThreshold
 *
 * **Keys keep guaranteeing.** Evidence only ever *adds* — an authored key fires
 * exactly as it did, and `constant` still bypasses retrieval entirely rather
 * than becoming a large number. Nothing here needs an embedding model: the
 * evidence is proper-noun overlap and rarity-weighted vocabulary overlap, both
 * computed from the rows and the conversation already in hand.
 *
 * **0 is off, and is the shipped default** — the same convention
 * `maxRecursionDepth` uses, and for the same reason: this changes what reaches
 * the model, so it is a thing somebody turns on rather than a thing that
 * happens to them on upgrade. Reading 0 as "admit everything, since every
 * evidence score clears zero" would be the one value that cannot be a default.
 *
 * The two kinds of evidence combine so that **either admits on its own** — a
 * sum would divide one budget between them and leave whichever got the smaller
 * share unable to bring anything in by itself, which is not what "tf-idf can
 * admit" means. So the scale is calibrated on each separately: ~0.3 is *one
 * thing the conversation is naming that not every entry names*, or *about a
 * third of what an entry is about being under discussion*. 1 admits almost
 * nothing.
 */
/**
 * How the entry side of the vocabulary overlap is read.
 *
 * The signal asks *is the conversation talking about this entry's subject right
 * now*, and it answers by weighting each of the entry's terms by how often the
 * recent window says it and how rare the term is. `overlap` adds that weight
 * once **per occurrence in the entry** — so a word written three times counts
 * three times, and an entry with more words has more of them to count. Lorebook
 * entries vary wildly in length, which is precisely the case that reading
 * handles worst: twelve near-identical entries end up ordered by how many times
 * each happened to repeat itself.
 *
 * `balanced` is BM25 over the same inputs. The query half does not move at all;
 * what changes is that the entry's own term count saturates (the fifth
 * occurrence of a word is worth about a tenth of the first) and is divided by
 * the entry's length relative to the rest of the lorebook. A long entry stops
 * winning for being long and a repeated word stops counting linearly.
 *
 * `overlap` is the shipped default, on the `admitThreshold` convention: this
 * changes the order lore reaches the model in, so it is turned on rather than
 * arrived at on upgrade.
 *
 * `members` rather than `of` because the stored values are not readable: a
 * picker offering "bm25" is offering the name of a paper rather than a choice.
 * (The convention was `RETRIEVAL_MODE`'s before that declaration was culled;
 * `TRIGRAM_FOLDING` and the entry-side strategy picker keep it.)
 */
const LEXICAL_SCORING = {
	type: 'enum' as const,
	default: 'overlap',
	label: { en: 'Relevance balance' },
	members: [
		{
			key: 'overlap',
			label: { en: 'Raw overlap' },
			description: {
				en: 'Every repeat of a word counts again, so a longer entry has more chances to score.',
			},
		},
		{
			key: 'balanced',
			label: { en: 'Length-aware' },
			description: {
				en: 'A repeated word stops adding as much, and an entry is judged against how long lorebook entries usually are. Better when entries differ a lot in length.',
			},
		},
	],
	description: {
		en: "How an entry's own wording is weighed when deciding how relevant it is to what is being said.",
	},
} as const

/**
 * How much a fuzzy, character-trigram hit on a keyword is worth, 0 being off.
 *
 * Word matching is not merely imprecise for unsegmented scripts — Japanese,
 * Chinese and Thai have no spaces for "whole word" to mean anything against —
 * so trigrams are not a refinement there, they are the only thing that works.
 * Everywhere else they absorb inflection and typos: `riders` fires a key
 * written `rider`, `Ashgaurd` fires `Ashguard`.
 *
 * A strength rather than a switch, because a fuzzy hit is genuinely weaker
 * evidence than an exact one and the useful question is *how much weaker*. An
 * exact match still counts 1 whatever this is, so raising it can only ever add
 * matches — never move or remove one.
 *
 * ⚠ **0 is off and is the shipped default.** A regex key is exempt at any
 * value: a pattern is not text, and folding `\b(ash|em)ber\b` into trigrams
 * would match on the punctuation of the pattern rather than on anything it
 * describes.
 */
const TRIGRAM_FOLDING = {
	type: 'number' as const,
	default: 0,
	min: 0,
	max: 1,
	label: { en: 'Match near-misses' },
	description: {
		en: 'How much a keyword that is nearly present counts — a different ending, a typo, or a language that does not put spaces between words. 0 requires an exact match; try 0.5 to turn it on.',
	},
} as const

/**
 * How much a term in an entry's title counts against the same term among its
 * keywords.
 *
 * ⚠ **1 is neutral, not off.** The title and the keywords are read as one bag
 * of words today, so 1 is what already happens rather than a feature switched
 * off. Above 1, an entry *about* the thing being discussed outranks one that
 * merely lists it as a keyword.
 *
 * The other half is the **keywords**, not the entry's content. What is scored
 * is the author's index; widening it to the body would change the order of
 * every keyed book there is, which is a different change from this one.
 */
const TITLE_WEIGHT = {
	type: 'number' as const,
	default: 1,
	min: 0,
	max: 5,
	label: { en: 'Title counts extra' },
	description: {
		en: "How much more a word in an entry's title counts than the same word among its keywords. 1 treats them alike.",
	},
} as const

/**
 * How much recent conversation the *presence* questions are asked over.
 *
 * ⚠ **Engine-read and load-bearing since long before it was declared.**
 * `keywordQuery` has always taken this number off `RetrievalParams`, where it
 * sat as a hardcoded 10 that nothing could reach: it sets the window
 * `speakerCooccurrenceSignal` asks "did this character's own lore-bound
 * character actually speak" over, and it sets the term-frequency window tf-idf
 * scores an entry against. Two of the ranker's live signals, tuned by a
 * constant, with no control anywhere. That is the same defect as a declared
 * control nothing reads, pointed the other way.
 *
 * ⚠ **Not `scanDepth`, and the split is the point.** `scanDepth` is how far
 * back a *keyword* may fire from; this is how much conversation counts as
 * *now*. A session of long posts wants a deep scan and a short guarantee, and a
 * terse one wants the reverse. `RetrievalParams` says the split is
 * "behaviour-preserving while both default to 10", and this is the half that
 * makes the sentence testable rather than aspirational — so it defaults to 10,
 * exactly as it has silently run.
 */
const GUARANTEED_MESSAGES = {
	type: 'integer' as const,
	default: 10,
	min: 1,
	label: { en: 'Messages that count as "now"' },
	description:
		'How much of the recent conversation counts as the current moment when judging relevance — which characters are present, and which words the scene is actually using. Separate from how far back a keyword may fire from.',
} as const

const ADMIT_THRESHOLD = {
	type: 'number' as const,
	default: 0,
	min: 0,
	max: 1,
	quick: true,
	label: { en: 'Find without keywords' },
	description: {
		en: 'How readily an entry is brought in on relevance alone when none of its keywords matched — the names the conversation is using, and the distinctive words it shares with the entry. 0 keeps keywords the only way in; try 0.3 to turn it on.',
	},
} as const

/**
 * Where a source's intent lives: **on the source** (16 §5a; R-7 P5, ruled
 * 2026-09-15, built 2026-09-16 — plans/30 U3b).
 *
 * `share`, `maxEntries`, `minEntries` and `priority` used to be five-band maps
 * on `core:task/rank-hybrid@1`. That was the design 16 §5a rejected and said
 * why: a per-source map on the ranker has to be kept in step by hand with
 * whichever sources exist, goes silently stale when one is added, and a
 * plugin's retrieval definition cannot take part at all without somebody
 * editing the ranker. So each of the five retrieval definitions declares its
 * own — the four fields below, labelled with the band they speak for — and
 * publishes them as one **band intent** element at the head of its
 * candidates (`BandIntent` in the SDK); `lorebook-triggers@1`, which produces
 * three bands through one port, declares three (`bandIntentFieldsOf`) and
 * publishes three. The ranker reads the intents off the list it is handed
 * and keeps only what is cross-source.
 *
 * **Every default here is the number the ranker's map held**, so an install
 * that tuned nothing selects exactly what it selected before: `messages` 0.5
 * (which is `MESSAGE_FILL_FRACTION`), the three lore bands 0.1667 / 0.1667 /
 * 0.1666, relationships 0; ceilings 50 / 20 / 15 / 10 and none; a minimum of 6
 * on the conversation alone (R6). Migration 0135 moves every stored value to
 * the node that owns it now.
 *
 * ⚠ **`minEntries` is declared on `session-history` alone.** R6 (retrieval
 * plan §7): *per-source minimums are removed everywhere except recent
 * conversation*. A minimum is a promise to spend budget on a source whether or
 * not it scored, and the one way an entry the ranker turned down could come
 * back in; declaring one on a lore lane would reopen exactly that door, so
 * the field is not declared there rather than declared at zero.
 *
 * `share` is a plain relative number, not the `share` control type: that
 * type divides ONE value over its members, and there is no one value any
 * more — each source states its own and the ranker normalises across
 * whatever arrived (its `shareNormalisation`). Zero is still the off switch.
 */
const bandIntentFields = (
	band: { label: string; noun: string },
	defaults: { share: number; maxEntries?: number },
) => ({
	share: {
		type: 'number' as const,
		min: 0,
		default: defaults.share,
		quick: true,
		label: { en: `Share — ${band.label}` },
		description: {
			en: `How much of the context window ${band.noun} may take, relative to every other source. The ranker normalises the shares it is handed; set this to zero to leave ${band.noun} out.`,
		},
	},
	maxEntries: {
		type: 'integer' as const,
		min: 0,
		...(defaults.maxEntries === undefined ? {} : { default: defaults.maxEntries }),
		label: { en: `Most entries — ${band.label}` },
		description: {
			en: `A ceiling on how many entries ${band.noun} may contribute, whatever its share.`,
		},
	},
	priority: {
		type: 'enum' as const,
		of: BAND_PRIORITIES,
		members: bandPriorityMembers(),
		default: 'normal' as const,
		label: { en: `Priority — ${band.label}` },
		description: {
			en: `How strongly ${band.noun} resists being trimmed once the shares are spent — 'high' and 'low' sort its entries ahead of or behind the others when leftover room is handed out; 'always' keeps every entry the window can hold.`,
		},
	},
})

/**
 * The three lore bands, as ONE table: the label each band's controls wear and
 * the numbers it ships at. Read by the three lanes (`worldLore`,
 * `characterLore`, `historyEntries` — one band each) AND by
 * `lorebook-triggers@1` (all three, namespaced — `bandIntentFieldsOf`), so
 * the two shapes cannot ship a band at two numbers: a person moving from the
 * narrator's one-node scan to `respond`'s three lanes finds the same defaults
 * under the same labels, and migration 0135's `shipped` table has one set to
 * agree with.
 *
 * 0.1666 on history, not 0.1667: the three lore shares summed to exactly 0.5
 * on the ranker's map and still do — the migrated value is the declared one,
 * so nobody's split moves by a ten-thousandth on upgrade.
 */
const LORE_BANDS = {
	worldLore: {
		band: { label: 'world lore', noun: 'world lore' },
		defaults: { share: 0.1667, maxEntries: 20 },
	},
	characterLore: {
		band: { label: 'character lore', noun: 'character lore' },
		defaults: { share: 0.1667, maxEntries: 15 },
	},
	history: {
		band: { label: 'history', noun: 'history entries' },
		defaults: { share: 0.1666, maxEntries: 10 },
	},
} as const

/**
 * One band's intent, **namespaced by band** — `worldLoreShare`,
 * `worldLoreMaxEntries`, `worldLorePriority` — for a definition that produces
 * more than one band through one port and so has to declare more than one
 * intent in ONE `params` slot (`lorebook-triggers@1`).
 *
 * Flat camel-case keys rather than a nested `object` field per band, and the
 * reason is the storage contract: a config value is addressed by
 * `(node, slot, path)` with `path` a single field name, the panel renders one
 * control per top-level field, and migration 0135 moves the ranker's old
 * `share.worldLore` member to exactly one row at `<band><Field>` — a nested
 * shape would have needed a second addressing scheme on three definitions
 * for the benefit of none. The label is the band's own ("Share — world
 * lore"), so a person sees the same words on this node as on the lane.
 */
const bandIntentFieldsOf = <B extends keyof typeof LORE_BANDS>(band: B) => {
	const f = bandIntentFields(LORE_BANDS[band].band, LORE_BANDS[band].defaults)
	return {
		[`${band}Share`]: f.share,
		[`${band}MaxEntries`]: f.maxEntries,
		[`${band}Priority`]: f.priority,
	} as { [K in `${B}Share`]: typeof f.share } & { [K in `${B}MaxEntries`]: typeof f.maxEntries } & {
		[K in `${B}Priority`]: typeof f.priority
	}
}

/** @public */
export const lorebookTriggers = pin(
	describeQueryDefinition({
		id: 'core:query/lorebook-triggers@1',
		i18n: { name: { en: 'Lorebook triggers' } },
		timeoutMs: 2000,
		/**
		 * All three lore lanes through one port, so all three bands — each a
		 * top-level template name with its variable (typed templates P2).
		 * Policy, not contract: the candidates are the same either side of it.
		 */
		bands: { worldLore: varWorldLore, characterLore: varCharacterLore, history: varHistory },
		slots: {
			/**
			 * ⚠ No `template` slot, and there was one — a *source* template for
			 * "how one triggered entry is written into the context".
			 *
			 * Nothing read it and nothing seeded a row for it, so it rendered as
			 * an empty picker. A source template belongs on the node whose job
			 * is the rendering — a `render-entries` task, when one is bound
			 * (culled unbound, plans/29 R-2); two declarations of one idea, one
			 * of them inert, is how they drift.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * The three bands' intents, first, as on the lanes (R-7
					 * P5; U3b review W1, 2026-09-16). This node produces world
					 * lore, character lore AND history through one port, so it
					 * declares all three — namespaced, `worldLoreShare` … —
					 * and publishes three band intents at the head of its
					 * candidates. Same defaults and labels as the three lanes,
					 * from `LORE_BANDS`, so the narrator's split is the reply's
					 * split until somebody moves one. Before this the node
					 * declared no intent at all and the ranker fell back to its
					 * own table for every lore band — the same numbers, but a
					 * tuned share on `narrate`'s ranker had nowhere to move to
					 * (0135 culled it) and nothing on this node could be tuned.
					 */
					...bandIntentFieldsOf('worldLore'),
					...bandIntentFieldsOf('characterLore'),
					...bandIntentFieldsOf('history'),
					/**
					 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value the
					 * scan actually ran on while this declaration said 3 and
					 * nothing read it.
					 *
					 * Round-sized on purpose. A group session with five
					 * characters takes five messages to come back round, so a
					 * depth of 3 cannot see the turn it belongs to: the window
					 * has already slid past where the round began. Scan depth
					 * has to be at least a round, and a round grows with the
					 * cast.
					 */
					scanDepth: {
						type: 'integer',
						default: 10,
						label: { en: 'Messages scanned for keywords' },
						description: 'How many recent messages are scanned for lorebook keywords.',
					},
					/**
					 * On this type as well as on `loreSlots`, for the reason its
					 * three siblings below give: the narrator runs its lore
					 * through this type, and this number reaches the same
					 * `keywordQuery` from the same `retrievalParamsFrom` seam —
					 * so a control that exists on the reply pipeline and not on
					 * the narrator is a difference no user could discover a
					 * reason for.
					 */
					guaranteedMessages: GUARANTEED_MESSAGES,
					/**
					 * The ceiling, spelled the way its three siblings spell it.
					 *
					 * ⚠ This was `recursionDepth`, and the one letter of
					 * difference is why it looked wired and was not:
					 * `retrievalParamsFrom` reads `maxRecursionDepth`, so the
					 * number this node stored was handed to nothing and the
					 * narrator ran on `DEFAULT_RETRIEVAL` whatever anybody
					 * typed. `narrate@1.10.0`'s own note says "Scan Depth and
					 * Max Recursion Depth rendered, validated and saved here
					 * without ever being read" — half of that was fixed by
					 * wiring the slot, and this is the other half, because the
					 * control it names was never called that here.
					 *
					 * Renamed rather than read under both spellings: two names
					 * for one ceiling is how the four lore types drift apart
					 * again, and `loreSlots` below has the older claim on the
					 * name. Migration 0195 carries the stored values across so
					 * a number somebody typed keeps its meaning — it simply
					 * starts working, which is the 0186 rule.
					 *
					 * Same default and same words as `loreSlots`': the narrator
					 * runs its lore through this type, and a ceiling that
					 * exists on the reply pipeline and not on the narrator is a
					 * difference no user could discover a reason for.
					 */
					maxRecursionDepth: {
						type: 'integer',
						default: 0,
						label: { en: 'Follow keyword chains this deep' },
						description:
							'A ceiling on how far entries may trigger further entries via keywords found in their text, however deep an individual entry asks to go. It never follows links between entries.',
					},
					/**
					 * ⚠ `caseSensitive`, `useRegex`, `weight` and `minInclude`
					 * were here, and are gone rather than wired. All four
					 * rendered, validated, stored a row and resolved through
					 * every scope layer while `retrievalParamsFrom` read none
					 * of them — plan bug 15, and the last of the dead-control
					 * clusters bug 12 found the first of.
					 *
					 * They divide cleanly in two, and neither half is a control
					 * this node should own:
					 *
					 *   · `caseSensitive` and `useRegex` describe how an *entry*
					 *     matches. `loreSlots` below already states the rule —
					 *     the entry is what somebody is looking at when they
					 *     want to change that — and the entry is where they
					 *     live: `signals.ts` reads `entry.caseSensitive` and
					 *     folds `entry.useRegex` into `entry.matchMode`, both
					 *     columns with their own editor control. A node-level
					 *     copy could only ever be a second answer to a question
					 *     the row already answers.
					 *   · `weight` and `minInclude` are the ranker's, and this
					 *     is the same pair `core:query/session-history@1` lost
					 *     for the same reason: they ask how one source fares
					 *     against everything else, and a node that fetches rows
					 *     cannot see everything else to answer it. They are
					 *     `share` / `signal*` and `minEntries` on
					 *     `core:task/rank-hybrid@1` now, beside their peers,
					 *     where a share is normalised against the others rather
					 *     than free to disagree with them.
					 *
					 * Deleting an address culls it: `reconcileConfigs` removes
					 * the stored value and writes a notice carrying what it
					 * was, which the admin workspace renders. That is the
					 * whole reason a cull is allowed to be the answer here —
					 * before the notices surface had a reader, "delete it" and
					 * "lose it silently" were the same act.
					 */
					admitThreshold: ADMIT_THRESHOLD,
					/**
					 * The three lexical-quality controls, on this type as well
					 * as on `loreSlots` and for `admitThreshold`'s reason: the
					 * narrator runs its lore through this type, and a control
					 * that exists on the reply pipeline and not on the narrator
					 * is a difference no user could discover a reason for.
					 */
					lexicalScoring: LEXICAL_SCORING,
					trigramFolding: TRIGRAM_FOLDING,
					titleWeight: TITLE_WEIGHT,
				},
			},
		},
		ports: {
			/**
			 * ⚠ No `text` in-port, and this and the three lore lanes had one
			 * (culled 2026-09-16, R-12). It was filled by no spec and read by
			 * no handler — the scan derives its window from `scope`, which is
			 * where it actually comes from — and each of the four carried a
			 * standing excuse in `wiring.test.ts` saying so.
			 */
			in: {
				scope: S.sessionScope,
				/**
				 * **Whose private lore this read is for** — a participant
				 * reference (`character:<id>`), additive, 2026-09-17 (W1).
				 *
				 * Character-lore visibility is decided at the host read against
				 * ONE subject, and until this port existed that subject was the
				 * run's scope — so every voice of a multi-agent turn was handed
				 * every character's private lore, because one gather ran once for
				 * all of them. Wired inside a repeating clause
				 * (`speaker: $.voices.item.context.speaker`) it names the speaker
				 * THIS iteration is writing as, and the host applies the same
				 * binding-visibility gate for that character instead of the
				 * scope's.
				 *
				 * Unwired, `null` or empty, the scope decides exactly as it
				 * always did (a scope of nobody is the omniscient narrator's
				 * read). Any other reference that names no character row — an
				 * envoy, a role, a row that does not exist — reads no private
				 * lore at all. A reference is never *widened* here: the port
				 * chooses whose secrets are readable, never whether the gate runs.
				 */
				speaker: S.participantRef,
			},
			// Both open with band-intent elements — three, one per lore band
			// — ahead of the items; readers call `splitCandidates()`.
			out: {
				main: S.candidates,
				hits: S.candidates,
				/**
				 * The entries this scan **found and then excluded** — an
				 * entry's own selective logic said *not here* — as verdicts
				 * `{ source, id, reason }` (C2, 2026-10-02). A copy of one that
				 * another mechanism brings in (by meaning, by name) is the
				 * same entry the author ruled out, and
				 * `core:task/eligibility@1` marks it ineligible with this
				 * reason instead of letting it through by the side door.
				 */
				exclusions: S.json,
			},
		},
	}),
)

/**
 * World lore and character lore, as two queries rather than one.
 *
 * `lorebook-triggers@1` returns both through a single port, and for a long
 * time they shared a weight, a minimum and a share of the window there. They
 * are not alike: character lore is bound to whoever is speaking and world
 * lore is not, and an install that wants a lot of one and little of the
 * other had no way to say so. (Since U3b's review it can on either shape:
 * that node declares one intent per band it produces, namespaced —
 * `bandIntentFieldsOf` — from the same `LORE_BANDS` table these read.)
 *
 * The retrieval itself is unchanged — candidates already carry
 * `source: 'worldLore' | 'characterLore'`, so each of these is the same scan
 * with one filter, not a second implementation to keep in step.
 *
 * `scanDepth` stays: how far back the conversation is read is a property of the
 * conversation, not of any entry. `useRegex`, `caseSensitive` and
 * `recursionDepth` do not — they describe how an *entry* matches, and the entry
 * is what somebody is looking at when they want to change that. What the node
 * keeps is `maxRecursionDepth`, a ceiling over whatever entries ask for.
 *
 * `lorebook-triggers@1` kept its own copies of all three for as long as nothing
 * read any of them; they are gone from it now, and its ceiling is spelled
 * `maxRecursionDepth` like this one. The two declarations stay separate — they
 * overlap in field names and nothing else — but they no longer disagree about
 * which controls a lore node owns.
 */
/**
 * ⚠ **`retrievalMode` was declared here and is gone (migration 0203).**
 *
 * It named which mechanism might surface an entry that had not decided for itself —
 * `rag`, `keyword` or `both` — and it was declared twice, on `loreSlots` and on
 * `vector-search`, so that the two mechanisms could not disagree about the same entry.
 *
 * It went because the question stopped having an answer. The mechanisms
 * **contribute additively to one score** rather than routing exclusively, so
 * `rag` and `both` had already collapsed into the same behaviour, and the third
 * value was a way to switch a mechanism off in bulk that nobody should have to
 * reach for: every mechanism this app has runs by default, and one it cannot run
 * subtracts a signal and reports that it did. The receipt says so in words —
 * *"Vector search: no embedding model is loaded and validated"*, *"Entity links:
 * nothing was embedded"* — which is what a person can act on, where a picker
 * defaulted to a mode was a control that mostly described the install rather
 * than a preference.
 *
 * ⚠ **The per-entry `retrievalStrategy` column went too, one migration later.**
 * This comment used to say it was untouched and stayed, on the argument that it
 * held choices real authors had made. It held none: there was no editor control
 * for it in any released build, no importer set it and no seed set it, so every
 * row was NULL and resolved to `rag`. Migration **0204** dropped it, and the
 * last exclusive routing in the retrieval path went with it — a `keyword` entry
 * had stayed out of the vector mechanism with a model loaded and a cosine of 1, which
 * is this same shape one scope down.
 *
 * Do not reintroduce either of them under another name. A mechanism that can be
 * routed away from is a mechanism that can take a candidate with it, and that is
 * the one thing the governing rule forbids.
 *
 * If per-entry mechanism preference is wanted, it is a **weight**, not a gate:
 * the mechanism-weight axis (keyword / semantic / name) already exists at
 * pipeline scope, and the same concept at entry scope subtracts a signal's
 * contribution while leaving the candidate in the pool — where every other
 * mechanism can still find it and the receipt can still explain it.
 */

/**
 * The seven lore knobs, declared once and worn by all three lore lanes —
 * every one of them **`shared`** (R-7 P2, ruled 2026-09-15; the marker
 * 2026-09-16, see `FieldDecl.shared`): a spec wires the three lanes' `params`
 * to ONE node — core's `respond` puts them on `gather.worldLore.read` and the
 * other two lanes read that slot through `slot.params({ node })` — so a person
 * tuning them tunes them once, for world lore, character lore and history
 * together. The wording below says so: it is the owner's label a panel shows,
 * and an owner labelled "world lore" while governing three sources was the
 * lie the U3 review found.
 *
 * The lane's own intent (`bandIntentFields` above) sits beside them in the
 * same slot, UNMARKED: through the same reference a lane's share is the
 * lane's, resolved at its own address, and rendered on its own step.
 */
const loreScanFields = () => ({
	/**
	 * 10, matching `DEFAULT_RETRIEVAL.scanDepth` — the value every scan
	 * has actually run on. This said 3 for as long as the three lore
	 * lanes shipped without a wired `params` slot, so the number was
	 * never handed to anything and the two could not be seen to
	 * disagree.
	 *
	 * Round-sized on purpose. A group session with five characters
	 * takes five messages to come back round, so a depth of 3 cannot
	 * see the turn it belongs to: the window has already slid past
	 * where the round began. Scan depth has to be at least a round,
	 * and a round grows with the cast.
	 */
	scanDepth: {
		type: 'integer' as const,
		default: 10,
		quick: true,
		shared: true,
		label: { en: 'Messages scanned for lore triggers' },
		description:
			'How many recent messages are scanned for lore triggers in the conversation. One setting for the three lore lanes — it applies to world lore, character lore and history. An entry is not reached through its links to other entries.',
	},
	/**
	 * Beside `scanDepth` because the pair is only legible together:
	 * one is how far back a key may fire from, the other is how much
	 * conversation counts as the present moment. See
	 * `GUARANTEED_MESSAGES`.
	 */
	guaranteedMessages: { ...GUARANTEED_MESSAGES, shared: true },
	maxRecursionDepth: {
		type: 'integer' as const,
		default: 0,
		shared: true,
		label: { en: 'Follow keyword chains this deep' },
		description:
			'A ceiling on how far entries may trigger further entries via keywords found in their text, however deep an individual entry asks to go. It never follows links between entries.',
	},
	/**
	 * Declared on all three lanes, held by one: since R-7 P2 a spec
	 * names ONE owner for the seven knobs and the other lanes read the
	 * owner's slot, so this is one row governing world lore, character
	 * lore and history alike — not one row per lane. World lore
	 * without keys is the case it exists for; the other two sources
	 * take the same answer. A per-source answer is a weight, and
	 * weights live on the source (`bandIntentFields`), not here.
	 */
	admitThreshold: { ...ADMIT_THRESHOLD, shared: true },
	/**
	 * One row for the three lanes, like `admitThreshold`: the owner's
	 * value reaches world lore, where entry lengths differ most,
	 * character lore, already narrowed to whoever is speaking, and
	 * dated history — which has no title at all, so the value reaches
	 * it and moves nothing. That is the honest state rather than a
	 * fourth declaration.
	 */
	lexicalScoring: { ...LEXICAL_SCORING, shared: true },
	trigramFolding: { ...TRIGRAM_FOLDING, shared: true },
	titleWeight: { ...TITLE_WEIGHT, shared: true },
})

const loreSlots = (band: { label: string; noun: string }, defaults: { share: number; maxEntries: number }) => ({
	params: {
		kind: 'parameters' as const,
		facet: 'weights' as const,
		schema: {
			// The lane's own intent first: `share` is the knob a person
			// reaches for, and on a lane that reads the scan knobs through
			// the owner it is all the panel shows.
			...bandIntentFields(band, defaults),
			...loreScanFields(),
		},
	},
})

/** @experimental */
export const worldLore = pin(
	describeQueryDefinition({
		id: 'core:query/world-lore@1',
		/** The band this lane publishes — a top-level template name (typed templates P2). */
		bands: { worldLore: varWorldLore },
		i18n: { name: { en: 'World lore' } },
		timeoutMs: 2000,
		/**
		 * A chat with no world lore is an ordinary chat, so nothing downstream
		 * needs this to have produced anything — which is also what makes it
		 * safe to switch off entirely. The template guards the block and the
		 * ranker simply has one fewer source.
		 */
		optional: true,
		slots: loreSlots(LORE_BANDS.worldLore.band, LORE_BANDS.worldLore.defaults),
		ports: {
			// No `text` in-port — see `lorebookTriggers`: the scan reads its
			// window through `scope` (culled 2026-09-16, R-12).
			in: { scope: S.sessionScope },
			// Both open with a band-intent element — this lane's own — ahead
			// of the items; readers call `splitCandidates()`.
			out: {
				main: S.candidates,
				hits: S.candidates,
				/**
				 * The entries this scan **found and then excluded** — an
				 * entry's own selective logic said *not here* — as verdicts
				 * `{ source, id, reason }` (C2, 2026-10-02). A copy of one that
				 * another mechanism brings in (by meaning, by name) is the
				 * same entry the author ruled out, and
				 * `core:task/eligibility@1` marks it ineligible with this
				 * reason instead of letting it through by the side door.
				 */
				exclusions: S.json,
			},
		},
	}),
)

/** @experimental */
export const characterLore = pin(
	describeQueryDefinition({
		id: 'core:query/character-lore@1',
		/** The band this lane publishes — a top-level template name (typed templates P2). */
		bands: { characterLore: varCharacterLore },
		i18n: { name: { en: 'Character lore' } },
		timeoutMs: 2000,
		/** As `worldLore`: absent is a normal state, so off is a safe state. */
		optional: true,
		slots: loreSlots(LORE_BANDS.characterLore.band, LORE_BANDS.characterLore.defaults),
		ports: {
			// No `text` in-port — see `lorebookTriggers`: the scan reads its
			// window through `scope` (culled 2026-09-16, R-12).
			in: {
				scope: S.sessionScope,
				/**
				 * **Whose private lore this read is for** — a participant
				 * reference (`character:<id>`), additive, 2026-09-17 (W1).
				 *
				 * Character-lore visibility is decided at the host read against
				 * ONE subject, and until this port existed that subject was the
				 * run's scope — so every voice of a multi-agent turn was handed
				 * every character's private lore, because one gather ran once for
				 * all of them. Wired inside a repeating clause
				 * (`speaker: $.voices.item.context.speaker`) it names the speaker
				 * THIS iteration is writing as, and the host applies the same
				 * binding-visibility gate for that character instead of the
				 * scope's.
				 *
				 * Unwired, `null` or empty, the scope decides exactly as it
				 * always did (a scope of nobody is the omniscient narrator's
				 * read). Any other reference that names no character row — an
				 * envoy, a role, a row that does not exist — reads no private
				 * lore at all. A reference is never *widened* here: the port
				 * chooses whose secrets are readable, never whether the gate runs.
				 */
				speaker: S.participantRef,
			},
			// Both open with a band-intent element — this lane's own — ahead
			// of the items; readers call `splitCandidates()`.
			out: {
				main: S.candidates,
				hits: S.candidates,
				/**
				 * The entries this scan **found and then excluded** — an
				 * entry's own selective logic said *not here* — as verdicts
				 * `{ source, id, reason }` (C2, 2026-10-02). A copy of one that
				 * another mechanism brings in (by meaning, by name) is the
				 * same entry the author ruled out, and
				 * `core:task/eligibility@1` marks it ineligible with this
				 * reason instead of letting it through by the side door.
				 */
				exclusions: S.json,
			},
		},
	}),
)

/**
 * Dated summaries of earlier events.
 *
 * ⚠ **This lane did not exist between spec 1.8.0 and 1.10.0, and history was
 * silently absent from every prompt in that window.**
 *
 * `lorebook-triggers@1` returned all three sources through one port. Splitting
 * world and character lore into two nodes replaced it with two lanes that each
 * filter the shared scan to their own `source` — and nothing filtered for
 * `history`, so those candidates were built, scored, and then dropped on the
 * floor. Nothing failed: the ranker kept a `history` band, `assemble` kept
 * asking for history blocks, and both got nothing.
 *
 * The parity corpus stayed green throughout because its harness renders through
 * `lorebook-triggers@1` rather than the shipped document — the exact divergence
 * a comment in that file warns about. The corpus mirrors the three lanes now.
 *
 * Same retrieval as its two siblings: one scan, one filter.
 * @experimental
 */
export const historyEntries = pin(
	describeQueryDefinition({
		id: 'core:query/history-entries@1',
		/** The band this lane publishes — a top-level template name (typed templates P2). */
		bands: { history: varHistory },
		i18n: { name: { en: 'History entries' } },
		timeoutMs: 2000,
		/** As the lore queries: a chat with no history is an ordinary chat. */
		optional: true,
		// 0.1666, not 0.1667 — see `LORE_BANDS`.
		slots: loreSlots(LORE_BANDS.history.band, LORE_BANDS.history.defaults),
		ports: {
			// No `text` in-port — see `lorebookTriggers`: the scan reads its
			// window through `scope` (culled 2026-09-16, R-12).
			in: { scope: S.sessionScope },
			// Both open with a band-intent element — this lane's own — ahead
			// of the items; readers call `splitCandidates()`.
			out: {
				main: S.candidates,
				hits: S.candidates,
				/**
				 * The entries this scan **found and then excluded** — an
				 * entry's own selective logic said *not here* — as verdicts
				 * `{ source, id, reason }` (C2, 2026-10-02). A copy of one that
				 * another mechanism brings in (by meaning, by name) is the
				 * same entry the author ruled out, and
				 * `core:task/eligibility@1` marks it ineligible with this
				 * reason instead of letting it through by the side door.
				 */
				exclusions: S.json,
			},
		},
	}),
)

/**
 * **Who is in the world, and when** — the cast's presences, as the session's
 * reading sees them (E-2, R4; built 2026-10-02).
 *
 * A presence says *this member, at this point of their own life, is here from
 * this date until that one* (`cast_presences`). The host reads the scope
 * session's book and resolves the line before returning: only presences on the
 * session's line (its own, and an ancestor's that begin at or before the fork
 * cut) — another line's spans never reach a node. `until` is exclusive: gone at
 * Y6 is present at Y5 and absent at Y6.
 *
 * `main` is the rows `{ bindingId, from, until, position }` (`from` / `until`
 * a story date `{ year, month?, day? }` or null); `at` is the moment the
 * session reads at — its story clock, or null for the head ("now", where every
 * presence with an `until` has ended). A member with **no** rows is always
 * present: declaring nothing means being here, as it always has.
 *
 * What it is for: `core:task/eligibility@1`'s presence rule, which gates the
 * lore of a member who is not in the world at `at`. A custom retrieval reads it
 * the same way (plan E-11).
 * @experimental
 */
export const castPresences = pin(
	describeQueryDefinition({
		id: 'core:query/cast-presences@1',
		i18n: { name: { en: 'Cast presences' } },
		timeoutMs: 2000,
		/** A session with no book, or a book that dates nobody, reads nothing — a normal state. */
		optional: true,
		ports: {
			in: { scope: S.sessionScope },
			out: {
				/** `{ bindingId, from, until, position }[]`, on the session's line. */
				main: S.json,
				/** The story date the session reads at, or null for the head. */
				at: S.json,
			},
		},
	}),
)

/** @experimental */
export const vectorSearch = pin(
	describeQueryDefinition({
		id: 'core:query/vector-search@1',
		i18n: { name: { en: 'Semantic search' } },
		timeoutMs: 3000,
		/**
		 * A session whose install has no embedding model is an ordinary
		 * session, so producing nothing is a normal outcome and the mechanism can be
		 * switched off entirely — exactly as the lore queries and the entity
		 * mechanism are.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * A **ceiling, not the mechanism's switch** (2026-09-29) — see
					 * `query-windows.searchByMeaning`, which is. Non-zero so that
					 * turning the mechanism on with one control does something:
					 * a feature whose two controls both default to off is one
					 * where turning the first one on appears to do nothing.
					 *
					 * It *was* the switch — 0, the shipped default, was off — and
					 * that was the defect: this is the chain's last node, so the
					 * probes had already been embedded by the time 0 said
					 * nothing was wanted. Every turn with an embedding model
					 * ready paid for an embed it threw away.
					 *
					 * A **cap on what this mechanism contributes**, not a cap on what
					 * it looks at — `topK` is that, one field down. 0 still
					 * contributes nothing, and the binding returns before its
					 * reads for it, but it is not how the mechanism is turned off.
					 */
					maxEntries: {
						type: 'integer',
						default: 5,
						min: 0,
						label: { en: 'Entries found by meaning' },
						description:
							'The most lorebook entries a search by meaning may bring in on one turn. The switch is Search by meaning, on the retrieval queries step. A pipeline that ranks this arm separately reads its per-query lists instead, which this does not cut.',
					},
					/**
					 * ⚠ **40, and it was 12.** The number never reached the
					 * host: the binding read `input?.topK` — an *in-port* name
					 * this node does not declare — and fell through to a
					 * literal `?? 40` on every run since the mechanism was
					 * written. So 40 is the value every install has actually
					 * been searching at, and 12 is a number that was rendered,
					 * validated, saved and resolved through the whole scope
					 * chain without ever being handed to anything.
					 *
					 * Defaulted to the effective behaviour rather than to the
					 * declared one on purpose. Wiring a control is not a licence
					 * to re-tune every install that never touched it: the fix is
					 * that the number now *means* something, and it means what
					 * it has been doing.
					 *
					 * A cap on what each query *looks at*, which is a different
					 * question from `maxEntries` one field up — that one caps
					 * what the mechanism *contributes*. Raising this widens the
					 * pool the ranker's other signals get to score; raising
					 * `maxEntries` lets more of it through. Neither decides
					 * whether the mechanism runs at all — that is
					 * `query-windows.searchByMeaning`, Automatic by default
					 * (on whenever an embedding model is set up).
					 */
					topK: {
						type: 'integer',
						default: 40,
						min: 1,
						label: { en: 'Closest matches per query' },
						description:
							'How many of the closest matches each retrieval query returns. A wider pool for the ranker to score, not a cap on what this arm contributes.',
					},
					/**
					 * How sharply a weak resemblance is discounted — and
					 * emphatically **not** a minimum.
					 *
					 * ⚠ **This replaced `minScore: 0.35`, and the replacement is
					 * a ruling rather than a rename.** A minimum similarity
					 * removes a row from the pool outright, and a row that is not
					 * in the pool can no longer be found by keyword, by name or
					 * by proximity either — one mechanism's opinion silently
					 * disabling four others. The governing rule is that a weak or
					 * unavailable mechanism *subtracts a signal* and never
					 * removes a candidate, so the cutoff could not stay whatever
					 * number it was set to. (It was never read either; nothing
					 * anywhere consumed `minScore`.)
					 *
					 * What replaces it shapes the **contribution** instead:
					 *
					 *     semantic = cos ** similarityFalloff
					 *
					 * 1 is the raw cosine and is the off position. Above 1 the
					 * curve is convex, fixed at both ends (0→0, 1→1), so a
					 * near-miss loses most of its contribution while a strong
					 * match keeps nearly all of its own — and the row stays in
					 * the pool at every value, which is the whole point.
					 *
					 * ⚠ **Chosen as a shape because a threshold is not
					 * portable.** Cosine distributions are not comparable across
					 * embedding models: one model puts unrelated text at 0.1 and
					 * another at 0.6, so `0.35` means "almost everything" on the
					 * first and "almost nothing" on the second, and an install
					 * that swaps models silently changes what its lorebook
					 * retrieves. An exponent has no cliff to move. It is
					 * strictly monotonic, so it can never reorder this
					 * mechanism's own hits or turn one off — it only decides how
					 * much the semantic signal is allowed to outweigh a keyword
					 * that actually fired.
					 */
					similarityFalloff: {
						type: 'number',
						default: 1,
						min: 1,
						max: 8,
						label: { en: 'Discount weak matches' },
						description:
							'How sharply a loose resemblance counts for less than a close one. 1 takes the similarity as it comes; higher pushes vague matches down without ever removing them, so they can still be found by a keyword or a name.',
					},
				},
			},
		},
		ports: {
			in: {
				/**
				 * Several query vectors, one ranked list each — a list, so
				 * `json@1` (was `vector@1` until 2026-09-17, U5d review W9):
				 * what `embed-text@1`'s `vectors` publishes and what the
				 * host's search reads.
				 */
				vectors: S.json,
				scope: S.sessionScope,
				/**
				 * **Whose private lore this search may return** — a participant
				 * reference, with `core:query/character-lore@1`'s exact
				 * semantics (C3, 2026-10-02): unwired, `null` or empty, the
				 * scope decides as it always did; a `character:<id>` reads
				 * that character's own private lore and nobody else's; any
				 * other reference reads none. The leak guard for a search
				 * wired inside a repeating clause, where the run's scope is
				 * not the voice being written.
				 */
				speaker: S.participantRef,
			},
			out: {
				main: S.candidates,
				hits: S.candidates,
				/** One ranked list per query vector, in the order they were given. */
				lists: S.json,
				/**
				 * `cos(i, j)` over `hits`, by index. What MMR needs, without any
				 * embedding leaving the host.
				 */
				similarity: S.json,
			},
		},
	}),
)

/**
 * The third mechanism — retrieval by the names a scene is using.
 *
 * The keyword mechanism matches an author's written keys against a window; the vector
 * mechanism matches an embedding. This one matches **entities**: the characters,
 * places and things the recent conversation named, against the same entities
 * found in every lorebook entry and every earlier message. A peer of the other
 * two rather than a signal inside one, because it queries a different index and
 * ranks on a different question.
 *
 * Three things follow, and they are why it exists:
 *
 *  1. **It is how a book with no keywords works.** An entry nobody indexed is
 *     reached because the scene is naming the same people it names. The
 *     `admitThreshold` control on the lore nodes does this *inside* the keyword
 *     scan; this does it as a source of candidates in its own right.
 *  2. **It searches the transcript**, which nothing else does. The keyword scan
 *     reads only a bounded recent window and the semantic mechanism never
 *     searches messages (its binding asks the index for lorebook entries
 *     only), so this is the one way to retrieve an *older message* by what it
 *     was about.
 *  3. **It needs no embedding model.** Names are matched, not encoded, so this
 *     is available on every install rather than only on the ones with a model
 *     loaded.
 *
 * It reads annotations written in the background, so it is cheap per turn: the
 * work of finding names in a lorebook happens when the lorebook is written, not
 * when a turn is taken.
 * @experimental
 */
export const entitySearch = pin(
	describeQueryDefinition({
		id: 'core:query/entity-search@1',
		i18n: { name: { en: 'Entity search' } },
		/**
		 * Recalled lines are their own declared band (owner ruling
		 * 2026-09-27, option b): a template places them as
		 * `{{{recalledLines}}}`, per genre, and nothing places them
		 * automatically. Carried on `messages` alone (`bandPorts`), so a spec
		 * wiring only `main` — every shipped one — does not offer a name that
		 * can never fill.
		 */
		bands: { recalledLines: varRecalledLines },
		bandPorts: { recalledLines: ['messages'] },
		timeoutMs: 2000,
		/**
		 * Off by default, so a session with nothing to find is a normal session
		 * and the mechanism can be switched off entirely without anything downstream
		 * noticing — exactly as the two lore queries are.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * **On by default — 5** (R5, ruled 2026-09-30: all supported
					 * retrieval is on by default; built 2026-10-02). It was 0,
					 * the `maxRecursionDepth` / `admitThreshold` convention of
					 * "turned on rather than arrived at"; the ruling replaced
					 * that convention for retrieval. 0 still turns it off — a
					 * preset that wants keys only says so.
					 */
					maxEntries: {
						type: 'integer',
						default: 5,
						min: 0,
						quick: true,
						label: { en: 'Entries found by name' },
						description:
							'How many lorebook entries this may bring in because the conversation is naming the same people, places and things they do. 0 turns it off.',
					},
					/**
					 * Separate from `maxEntries`, because the two answer
					 * different questions and only one of them has somewhere to
					 * go today.
					 */
					maxMessages: {
						type: 'integer',
						default: 20,
						min: 0,
						label: { en: 'Earlier messages found by name' },
						description:
							"How many earlier messages this may return, as recalled lines, for naming what the scene is naming. They reach the prompt only where a pipeline ranks them and its context template places {{{recalledLines}}}. 0 turns this half off.",
					},
					/**
					 * The recalled lines' **share** — a band-namespaced field
					 * (§7), because this definition publishes lore on `main`
					 * and its own band on `messages`. Published as the band's
					 * intent at the head of `messages` whenever `maxMessages`
					 * turns the half on; the cap is `maxMessages`, which
					 * already says it. The default is one lore lane's.
					 */
					recalledLinesShare: {
						type: 'number',
						min: 0,
						default: 0.1667,
						label: { en: 'Share — recalled lines' },
						description: {
							en: 'How much of the context window recalled lines may take, relative to every other source. The ranker normalises the shares it is handed; set this to zero to leave recalled lines out.',
						},
					},
					scanDepth: {
						type: 'integer',
						default: 10,
						label: { en: 'Messages read for names' },
						description:
							'How many recent messages are read to decide what the scene is currently about.',
					},
					/**
					 * The mechanism's strength, and it is declared rather than
					 * constant because the graded overlap *compresses* what it
					 * measures: one strongly-shared name saturates around 0.63
					 * and two around 0.86, so a weight sized for a 0/1 signal
					 * would leave the improvement invisible.
					 *
					 * The default is deliberately the keyword weight: one thing
					 * the conversation is naming that not every entry names is
					 * worth about as much as one of an entry's own keys firing,
					 * and the saturation then keeps it strictly below a full
					 * keyword match — so authored keys still win, and this only
					 * ever adds.
					 */
					entityWeight: {
						type: 'number',
						default: 0.35,
						min: 0,
						max: 1,
						label: { en: 'Strength' },
						description:
							'How much weight a shared name carries against the other ways an entry can be found. 0 leaves the arm finding things and ranking them last.',
					},
				},
			},
		},
		ports: {
			/**
			 * ⚠ **No `text` in-port.** The four lore queries declared one that
			 * nothing filled and nothing read — `loreFor` derives its window
			 * from `scope` — and this declaration refused to ship a fifth with
			 * the same standing excuse written for it. Theirs are culled now
			 * (2026-09-16, R-12); the window comes from `scope`, which is where
			 * it actually comes from.
			 */
			in: {
				scope: S.sessionScope,
				/**
				 * **Whose private lore this search may return** — a participant
				 * reference, with `core:query/character-lore@1`'s exact
				 * semantics (C3, 2026-10-02): unwired, `null` or empty, the
				 * scope decides as it always did; a `character:<id>` reads
				 * that character's own private lore and nobody else's; any
				 * other reference reads none. The leak guard for a search
				 * wired inside a repeating clause, where the run's scope is
				 * not the voice being written.
				 */
				speaker: S.participantRef,
			},
			out: {
				main: S.candidates,
				hits: S.candidates,
				/**
				 * Earlier messages, as candidates in the declared
				 * **`recalledLines`** band, headed by that band's intent
				 * (2026-09-27; they sat in the transcript's `messages` band
				 * before, budgeted and rendered nowhere).
				 *
				 * A port of its own rather than part of `main`, because the two
				 * are budgeted separately and a pipeline that wants lore found
				 * by name almost certainly does not want its context window
				 * spent on retrieved transcript by accident.
				 */
				messages: S.candidates,
			},
		},
	}),
)

/**
 * Documentation search — the guide genre's one retrieval mechanism (plans/29
 * R-18; built 2026-09-16 as U5g).
 *
 * The app compiles its docs — its own guides and the SDK's — into a section
 * index at build time (title, anchor, body text per heading). This reads the
 * person's most recent messages, ranks every section against them, and
 * publishes the relevant ones as candidates in its own declared band,
 * **`docsExcerpts`** (2026-09-27; it borrowed `worldLore` before) — so the
 * ranker budgets them and a template places them as `{{{docsExcerpts}}}`,
 * framed as the app's manual rather than as a story's lore, with an `{{else}}`
 * for the turn nothing matched. Each excerpt starts with its page's path.
 *
 * A question the docs do not cover publishes the band's intent and nothing
 * else — on purpose: an empty band is what lets the prompt say "nothing in the
 * docs matched" instead of handing a model loosely related text to extrapolate
 * from.
 *
 * `optional`, and it degrades to nothing: an install whose docs were never
 * compiled (a fresh checkout, `npm test`) publishes an empty band with its
 * intent, and the turn loses excerpts rather than failing.
 * @internal
 */
export const docsSearch = pin(
	describeQueryDefinition({
		id: 'core:query/docs-search@1',
		i18n: {
			name: { en: 'Docs search' },
			description: {
				en: "Finds the documentation sections that answer the person's latest question, so the guide can ground its answer in them — and finds none when the docs do not cover it.",
			},
		},
		/** Its own band, a top-level template name (typed templates P2). */
		bands: { docsExcerpts: varDocsExcerpts },
		timeoutMs: 2000,
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					...bandIntentFields(
						{ label: 'documentation', noun: 'documentation excerpts' },
						{ share: 0.25, maxEntries: 6 },
					),
					scanDepth: {
						type: 'integer',
						min: 1,
						default: 4,
						quick: true,
						label: { en: 'Messages searched' },
						description: {
							en: "How many of the most recent messages are read for the person's questions. Only their own messages are searched, never the guide's replies, and the newest counts most.",
						},
					},
				},
			},
		},
		ports: {
			// The scope, like the lore lanes: the newest rows are read through
			// the host's one message seam (hidden and generating rows excluded
			// there), so this can sit beside `history` in a parallel gather
			// rather than after it.
			in: { scope: S.sessionScope },
			out: { main: S.candidates, candidates: S.candidates },
		},
	}),
)

/**
 * The mention detector — the query half of the entity-vector space.
 *
 * What the current scene refers to by **describing** it rather than by naming
 * it: *"the captain"*, *"the order"*, *"that bridge"*. Nothing in the lexical
 * stack can see these — no key matches them, no trigram folds them onto a
 * title, and the gazetteer has nothing to look up — and they are, as the plan
 * puts it, the references people actually write.
 *
 * A Query and not a Task, because the answer depends on the world's own
 * vocabulary: a description that turns out to be an authored lower-case name
 * (*"the ashguard"*) is dropped here, since the exact matcher owns it.
 * @experimental
 */
export const mentionSpans = pin(
	describeQueryDefinition({
		id: 'core:query/mention-spans@1',
		i18n: { name: { en: 'Descriptive mentions' } },
		timeoutMs: 1000,
		/**
		 * Producing nothing is the ordinary outcome — most windows describe
		 * nothing — and an install that has not switched the mechanism on must not
		 * be able to lose a turn to it.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * **On by default — 8** (R5, ruled 2026-09-30: all supported
					 * retrieval is on by default; built 2026-10-02). It was 0.
					 * Still the mechanism's one switch: 0 turns it off.
					 *
					 * **This is the entity-vector mechanism's one switch**, and it is
					 * on the first node of the chain on purpose: switched off,
					 * this returns before reading anything, `embed-text` is
					 * handed no texts and makes no model call, and `entity-link`
					 * returns before its own read. The mechanism costs literally
					 * nothing until somebody asks for it — not a message read,
					 * not an embedding.
					 *
					 * `entity-link.maxLinks` is therefore a ceiling rather than
					 * a second switch and ships non-zero: a feature whose two
					 * controls both default to off is one where turning the
					 * first one up appears to do nothing.
					 */
					maxMentions: {
						type: 'integer',
						default: 8,
						min: 0,
						quick: true,
						label: { en: 'Descriptions to follow up' },
						description:
							'How many descriptive references in the recent messages — "the captain", "the order" — are matched against what your entries are called, for entries no keyword reached. Needs an embedding model; 0 turns the whole arm off.',
					},
					scanDepth: {
						type: 'integer',
						default: 10,
						label: { en: 'Messages read for descriptions' },
						description:
							'How many recent messages are read for descriptions. A description points at what is being discussed now, so this is deliberately short.',
					},
				},
			},
		},
		ports: {
			/** The window comes from `scope`, like the entity mechanism's. */
			in: { scope: S.sessionScope },
			out: {
				main: S.json,
				/** The mentions with their offsets, for a receipt to point at. */
				mentions: S.json,
				/** The same strings in the same order, for the embed Provider. */
				texts: S.json,
			},
		},
	}),
)

/**
 * The entity-vector mechanism — mention → name linking.
 *
 * A second named vector space holding **one vector per name** rather than one
 * per entry: an entry's title, the aliases its body declares, and for a
 * character-anchored entry the bound character's names. Queried with the
 * descriptions `core:query/mention-spans@1` found, so *"the captain"* reaches
 * Captain Vell and *"the order"* reaches The Ashguard Riders.
 *
 * ## A separate space, not a second use of the content vectors
 *
 * Different text at different lengths means different similarity
 * distributions, so a cutoff tuned for two-word names is wrong for
 * two-hundred-word passages. The two want different weights, because *"is
 * called that"* and *"is about that"* are different evidence. And they
 * invalidate independently — renaming re-embeds the names and not the content;
 * rewriting the body re-embeds the content and not the names. Comparing a short
 * string to a short string is also what embeddings are most reliable at, where
 * a two-word mention against a whole-entry vector is a granularity mismatch.
 *
 * ## ⚠ It may only reorder. It may never admit.
 *
 * The pool is the `candidates` in-port, and this returns that same list with a
 * signal attached to whatever linked. There is no id it can emit that some
 * other mechanism did not already produce, and that is a wiring guarantee
 * rather than a promise in a comment.
 *
 * It matters because invented proper nouns are where embeddings are least
 * reliable: "Vell" has no learned meaning, so its vector is assembled from
 * subword fragments and Vell, Vall and Vela cluster. A confident wrong link is
 * worse than a miss — it would inject wrong lore at high confidence into a
 * fixed budget, displacing right lore. Constrained to reordering, the same
 * wrong link costs a position and a line in the receipt naming it.
 *
 * So: exact and trigram matching own invented names; entity vectors own
 * descriptive references.
 *
 * ## No threshold, anywhere
 *
 * Links rank, they do not gate. What bounds this is a **count**, over links
 * ordered by match quality — never a similarity cutoff, because *"is 0.62 a
 * match"* has no answer that survives changing the encoder, and a number that
 * needs per-corpus calibration is a number nobody can set.
 * @experimental
 */
export const entityLink = pin(
	describeQueryDefinition({
		id: 'core:query/entity-link@1',
		i18n: { name: { en: 'Entries called by a description' } },
		/**
		 * `embed-text`'s budget rather than `vector-search`'s, because this node
		 * can *embed*: it brings a bounded slice of the name index up to date
		 * before it reads. Being cut short costs the remainder of that pass and
		 * nothing else — each entry is written before the next is embedded, so
		 * progress survives and the mechanism links whatever is already indexed.
		 */
		timeoutMs: 5000,
		/**
		 * Empty from this node means *the ranker sees the candidate list
		 * unchanged*, never *the ranker sees nothing*: it is wired as the first
		 * source of a concatenation whose second source is the unenriched list.
		 * So every way it can produce nothing — off, no model, an error the
		 * executor recovered as empty — lands on exactly what the ranker would
		 * have seen without it.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * A **ceiling, not the mechanism's switch** — see
					 * `mention-spans.maxMentions`, which is. Non-zero so that
					 * turning the mechanism on with one control does something.
					 */
					maxLinks: {
						type: 'integer',
						default: 5,
						min: 0,
						label: { en: 'Most entries linked' },
						description:
							'A ceiling on how many entries one turn may have matched to a description. The best matches are kept; this never brings in an entry nothing else found, it only changes where one comes in the order.',
					},
				},
			},
		},
		ports: {
			in: {
				scope: S.sessionScope,
				/**
				 * ⚠ **The pool, and the reason this mechanism cannot admit.** It
				 * scores what arrives here and returns it; an entry no other
				 * mechanism produced is not in this list and therefore cannot
				 * be in the output.
				 */
				candidates: S.candidates,
				/** The descriptions, from `core:query/mention-spans@1`. */
				mentions: S.json,
				/** Their embeddings, in the same order. Index alignment is the contract. */
				vectors: S.json,
				/**
				 * **Whose private lore this search may return** — a participant
				 * reference, with `core:query/character-lore@1`'s exact
				 * semantics (C3, 2026-10-02): unwired, `null` or empty, the
				 * scope decides as it always did; a `character:<id>` reads
				 * that character's own private lore and nobody else's; any
				 * other reference reads none. The leak guard for a search
				 * wired inside a repeating clause, where the run's scope is
				 * not the voice being written.
				 */
				speaker: S.participantRef,
			},
			out: {
				main: S.candidates,
				candidates: S.candidates,
				/** Each link as text — *matched "the captain" → Captain Vell*. */
				links: S.json,
			},
		},
	}),
)

/** Illegal by construction elsewhere; used to prove the purity probe. @internal */
export const network = pin(
	describeQueryDefinition({
		id: 'test:query/network@1',
		timeoutMs: 1000,
		ports: { out: { main: S.json } },
	}),
)

/**
 * Builds the object a context template renders against.
 *
 * A Task, not a Query, even though it reads the cast: what it *is* is the
 * resolution — which characters appear, which get named, which scenario wins —
 * and that is a decision anyone should be able to replace. The read reaches the
 * host like any other (F11 keeps the services out of the Task itself).
 *
 * Separate from Assemble on purpose. Assemble allocates a budget and renders;
 * this decides what there is to render. A plugin that wants different character
 * cards should not have to reimplement token allocation to get them.
 * @public
 */
export const sessionCast = pin(
	describeQueryDefinition({
		id: 'core:query/session-cast@1',
		i18n: { name: { en: 'Session cast' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: {
				main: S.sessionCast,
				cast: S.sessionCast,
				/**
				 * The seated envoys on their own (PLAN-turn-order §4.4,
				 * additive 2026-09-21): `{ slug, key, origin, name, speaks,
				 * default, position, removedAt }` per seat, live and departed,
				 * in seat order — the rows `main` already carries under
				 * `envoys`, offered as a port so a pool or a strategy can be
				 * wired to them without taking the whole cast. There is no
				 * separate envoy query node, and none should be made.
				 */
				envoys: S.json,
			},
		},
	}),
)

/**
 * The session's settings document, re-read (PLAN-turn-order §4.12, R13).
 *
 * Every core inlet that takes a session already publishes the document on
 * its `session` port, resolved once by the host at run start. This node is
 * the second way in: placed **after a write that may have moved a value** —
 * a turn-order write, an annex write — so the rest of the graph reads what
 * is stored now rather than what the run began with. Same document, same
 * resolver (`resolveSessionSettings`), no other table read.
 * @experimental
 */
export const sessionSettings = pin(
	describeQueryDefinition({
		id: 'core:query/session-settings@1',
		i18n: { name: { en: 'Session settings' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.sessionSettings },
		},
	}),
)

/**
 * The narrative graph's relationships, as two nodes.
 *
 * ⚠ Replaced `core:query/graph-context@1`, which emitted all of it through one
 * port as one variable. Two things were wrong with that. The prompt showed a
 * single "Your relationships:" block containing both what the speaker thinks
 * of everyone and what everyone thinks of the speaker, which are opposite
 * claims that a model reads as one list; and being one variable, they shared a
 * layout, a priority and an on/off switch, so "include how others see me but
 * not my own view" could not be said.
 *
 * Two nodes rather than two out-ports on one, following the split of
 * `lorebook-triggers` into world and character lore: each can then be switched
 * off, weighted and laid out on its own, which is the entire reason for
 * separating them. They run in the same `async` block, so the second traversal
 * costs concurrency rather than wall-clock.
 *
 * ⚠ Neither carries a retrieval control of any kind, and that was already true
 * when the lore lanes still declared `retrievalMode`. A graph relationship is
 * reached by walking edges from the speaker's node — there is no keyword mechanism and
 * no vector mechanism to choose between, so a picker here would have been a control
 * that reads well and does nothing, which is what `session-history@1`'s dead
 * `template` slot already cost this codebase once.
 */
const relationshipSlots = (what: string) => ({
	params: {
		kind: 'parameters' as const,
		facet: 'weights' as const,
		schema: {
			maxEntries: {
				type: 'integer' as const,
				/**
				 * ⚠ **No `default:`, and its absence is the declaration.**
				 *
				 * Neither spec ever named this slot, so `resolveInput` never
				 * resolved it and `bindings.ts` called `capRelationships` with
				 * `undefined` on every run this node type has ever made — which
				 * that function reads as *no ceiling at all* and returns the
				 * section whole. `respond` wires `params: slot.params()` now, so
				 * whatever is declared here becomes live; under ruling D-8 the
				 * declared default must therefore BE the value every run has
				 * actually used, and that value is "uncapped".
				 *
				 * Uncapped is not expressible as a number here. `0` is already
				 * taken and means the opposite — `capRelationships` returns
				 * `null` for it, so the section is dropped entirely, which is the
				 * `admitThreshold` / `maxEntries` off-switch convention this
				 * package uses everywhere. A negative sentinel IS what
				 * `capRelationships` reads as "no cap" (`cap < 0` returns the
				 * section), but `min: 0` forbids one and no other parameter in
				 * this package uses a negative sentinel; inventing the convention
				 * here would be a design decision riding in on a wiring fix. And
				 * a large finite number is not the value either — it is a
				 * different value that is *usually* indistinguishable, which is
				 * the kind of nearly-right that D-8 exists to refuse.
				 *
				 * So: no default. `resolveSlot`'s params branch copies a schema
				 * default only `if (v?.default !== undefined)`, and
				 * `reconcileConfigs` back-fills a row only when a declaration
				 * carries one — so an untouched install resolves `undefined` and
				 * stays uncapped, exactly as before. The control renders as an
				 * empty box, which `NumberControl` and the panel already treat as
				 * "unset" (an emptied box commits `undefined` and clears the
				 * row), so the empty state round-trips rather than being a hole.
				 */
				min: 0,
				quick: true,
				label: { en: 'Most relationships' },
				description: {
					en: `A ceiling on how many ${what} reach the prompt, closest first. Leave it empty for no ceiling; 0 leaves the section out altogether.`,
				},
			},
		},
	},
})

/**
 * ⚠ Both are `optional`, and the reason is not that the graph is unimportant.
 *
 * A slow or failing relationship read must never cost somebody their reply: the
 * executor turns an `err` from an optional node into an empty result, records
 * the failure on the receipt as `recoveredAsEmpty`, and the template's `{{#if}}`
 * renders nothing — which is exactly what a chat with no narrative graph gets
 * anyway. It is also what makes them safe to switch off outright.
 */
const RELATIONSHIP_TIMEOUT = 5000

/** How the speaking character regards everyone else. @experimental */
export const relationshipsPerspectives = pin(
	describeQueryDefinition({
		id: 'core:query/relationships-perspectives@1',
		i18n: {
			name: { en: 'Relationships: their perspective' },
			description: {
				en: 'How the speaking character regards the others, read from the narrative graph. Produces nothing when the chat has no lorebook or the speaker has no node in it.',
			},
		},
		optional: true,
		timeoutMs: RELATIONSHIP_TIMEOUT,
		slots: relationshipSlots('of their own views'),
		ports: {
			in: { scope: S.sessionScope },
			/**
			 * `json`, not `text`. The summary used to be stringified inside
			 * `buildGraphContext` and handed on as a finished blob, which made
			 * it the one context value a layout could do nothing with — you
			 * cannot render relationships as prose, drop a section, or even
			 * change the indent if the shape was flattened upstream. The node
			 * emits the structure and the variable layout renders it.
			 */
			out: { main: S.json, relationshipsPerspectives: S.json },
		},
	}),
)

/**
 * How everyone else regards the speaking character, and who is known to all.
 *
 * `legendaryFigures` rides here rather than on the other node, and the choice
 * is arguable enough to write down: it is neither the speaker's view nor a view
 * of the speaker, it is what is *publicly known* — which is the same kind of
 * claim as "how others regard you" and the opposite kind from "what you think
 * of them". Splitting it into a third node would put a mostly-empty block in
 * every prompt on every install that has never marked a node legendary.
 * @experimental
 */
export const relationshipsKnown = pin(
	describeQueryDefinition({
		id: 'core:query/relationships-known@1',
		i18n: {
			name: { en: 'Relationships: how others see them' },
			description: {
				en: 'How the others regard the speaking character, plus any figures known to everyone. Read from the narrative graph.',
			},
		},
		optional: true,
		timeoutMs: RELATIONSHIP_TIMEOUT,
		slots: relationshipSlots('views of them'),
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.json, relationshipsKnown: S.json },
		},
	}),
)

/**
 * The narrative graph as a retrieval **mechanism** (ruling 2026-09-10, Q1).
 *
 * ⚠ The ruling calls this an *arm*, and the id deliberately does not. Two
 * reasons, and the second is the stronger: NOMENCLATURE §22 retires *arm* in
 * favour of **mechanism**, and every sibling in this package is named for what
 * it retrieves rather than for the machinery — `entity-search`,
 * `vector-search`, `world-lore`. The word survives in the *descriptions* on
 * those siblings, which is prose a user reads (§23.6); an id is a frozen
 * contract, which is the one place a retired word should not land.
 *
 * The two nodes above are a *dump*: they hand the whole graph section to the
 * template, in whatever order the database returned the rows, and the only
 * control over it is a ceiling. Every other source the prompt is built from is
 * shared, ranked and allocated — which is what makes "world lore matters more
 * than history in this chat" sayable, and what makes "why is this entry here"
 * answerable. Relationships were the one source none of that reached.
 *
 * This is the same three sections read as **candidates**, one per relationship,
 * in the `relationships` band the ranker and the budget have carried since they
 * were written. What it buys is the whole retrieval surface at once: the band's
 * share divides the window, `select` decides what fits, and every relationship
 * arrives on the receipt with a reason.
 *
 * ## Ranked here, not by a second ranker
 *
 * `core:task/rank-hybrid@1` takes this like any other candidate source — the
 * band exists, the share exists, the entry cap exists — so there is no new rank
 * node and no new signal weight. What this node contributes is the **order**,
 * as a `presetScore` the ranker uses directly: scene presence first, then
 * whether the speaker is party to the tie, then how recently it changed. The
 * arithmetic is deterministic and the receipt states each term, which is the
 * standard `presetScore` carries — `core:query/entity-search@1` ranks its own
 * hits the same way for the same reason.
 *
 * ⚠ **It does not duplicate the two nodes above.** All three reach
 * `core:task/build-template-context@1`, on the same two in-ports and never
 * twice: this band is what those sections are built from on a run that
 * allocated any of it, and the two nodes' own dump is what they are built from
 * on a run that did not — which is every run until somebody raises the
 * relationships share. See docs/embeddings-and-rag.md.
 *
 * `relationshipSlots` rather than a declaration of its own, so the ceiling here
 * means exactly what it means on the two nodes above: on/off plus a ceiling,
 * with an absent value uncapped and 0 leaving it out altogether.
 *
 * ## Nobody speaking: the cast-wide read (genre plan F6(a), 2026-09-29)
 *
 * The three sections are claims about a SPEAKER, and a scope whose
 * `currentCharacterId` is null has none — an Adventure turn is the narrator's
 * entry, and its planner and narrator are nobody's voice. Such a scope reads
 * the **cast-wide read** instead: every relationship a cast member holds, one
 * candidate each in the `castRelationships` lane, headed by its holder and
 * naming the other end. A host decides what it may carry; Serene Pub withholds
 * a member's secrets, since nobody's voice is not the holder's. Ordered
 * the same way — presence (both ends in the cast), then recency; no tie
 * touches a speaker. Which agents are handed that band is the spec's choice:
 * a voice is somebody speaking, and wires none of it.
 *
 * `loreLinks` switches the one-hop walk from the entries the turn chose (a
 * room's ways out, what an item belongs to). On by default, which is what this
 * node has always done; a genre whose places say their own ways out ("From
 * here:") turns it off, so a place link is said once, by the place.
 * @experimental
 */
export const relationshipSearch = pin(
	describeQueryDefinition({
		id: 'core:query/relationship-search@1',
		i18n: {
			name: { en: 'Relationships: ranked' },
			description: {
				en: 'The narrative graph as ranked candidates that compete for the context window, ordered by who is in the scene, who is speaking, and what changed most recently.',
			},
		},
		optional: true,
		timeoutMs: RELATIONSHIP_TIMEOUT,
		slots: {
			params: {
				...relationshipSlots('graph relationships').params,
				schema: {
					/**
					 * The band's intent (R-7 P5), on the one relationship read
					 * that ranks. `share` is 0, which is what the ranker's map
					 * held: the band ships inert and the share is its switch —
					 * every candidate leaves as `excluded_group_disabled` with
					 * that reason until somebody raises it, and the two dump
					 * nodes render the graph whole meanwhile.
					 *
					 * `maxEntries` is `relationshipSlots`' own — the ceiling
					 * this node already applies before it publishes — and it is
					 * the band's ceiling too: one number, the query's, rather
					 * than a second on the ranker free to disagree. Absent
					 * means uncapped, as it always has here, where the map's
					 * `relationships: 0` was a cap of nothing sitting behind a
					 * share of nothing — raising the share alone used to
					 * exclude every relationship as over its ceiling. It does
					 * not now. Migration 0135 culls a stored 0 for that reason
					 * and moves anything else.
					 */
					...bandIntentFields({ label: 'relationships', noun: 'the narrative graph' }, { share: 0 }),
					// Declared second so the query's own wording and `min: 0`
					// win over the generic ceiling above.
					...relationshipSlots('graph relationships').params.schema,
					/**
					 * The lore-link hop: relationships one edge from an entry
					 * this turn's keyword scan chose, with an entry at an end
					 * (NOMENCLATURE §17 *lore link*).
					 *
					 * `true` is what every run before it did, so the default
					 * moves nothing. Off, the hop is not walked at all — no
					 * link read, no second scan — and the band holds cast ties
					 * only. Adventure's preset turns it off (F6(a)): a place
					 * link belongs to the place ("From here:"), and a hop would
					 * spend the band on a door no section renders.
					 */
					loreLinks: {
						type: 'boolean',
						default: true,
						label: { en: 'Follow lore links' },
						description: {
							en: 'Also offer the links one step from the lore this turn found — a room’s ways out, what an item belongs to. Off keeps the band to relationships between characters.',
						},
					},
				},
			},
		},
		ports: {
			/**
			 * ⚠ **No `text` in-port**, for `core:query/entity-search@1`'s
			 * reason: the four lore queries declared one that nothing filled
			 * and nothing read (culled 2026-09-16), and shipping a fifth with
			 * the same standing excuse written for it would have been adding
			 * the defect on purpose. A relationship is reached by walking edges
			 * from the speaker's node, so the scope is the whole of the
			 * question.
			 */
			in: { scope: S.sessionScope },
			out: {
				// Both open with a band-intent element — the graph's own,
				// published whether or not a tie was found — ahead of the
				// items; readers call `splitCandidates()`.
				main: S.candidates,
				hits: S.candidates,
				/**
				 * How many ties were walked, how many the scene was present
				 * for, and what the ceiling did — the mechanism-level half of
				 * the trail, which no per-candidate row can carry.
				 *
				 * Declared rather than merely published, unlike the lore lanes'
				 * own diagnostics: an undeclared out-port is invisible to
				 * `validate.ts` and unreadable by a plugin, which is the finding
				 * `core:task/rank-hybrid@1`'s `groups` cost a release.
				 */
				diagnostics: S.json,
			},
		},
	}),
)

/**
 * 🚧 **A transcript's attachments** (PLAN-composer-attachments §3.5, 2026-10-02).
 *
 * Takes the history read's rows and publishes, per message id, the files its
 * active revision shows — `core:image` and `core:file` parts, in part order —
 * as `HistoryAttachmentV1` references (`core:shape/media-by-message@1`). One
 * query for the whole transcript. A text file arrives with its body (up to
 * `textFileBytes`), because a text file reaches every model as text and the
 * placement step after this one cannot read a disk.
 *
 * Reads only rows of the run's own session; a message of any other session
 * contributes nothing. A message with no files is absent from the record.
 * @experimental
 */
export const historyAttachments = pin(
	describeQueryDefinition({
		id: 'core:query/history-attachments@1',
		i18n: { name: { en: 'History attachments' } },
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					textFileBytes: {
						type: 'integer',
						min: 0,
						default: 65536,
						label: { en: 'Text file read limit (bytes)' },
						description: {
							en: 'How much of each attached text file is read for the prompt. The placement step trims it further to its own token budget and says when it did.',
						},
					},
				},
			},
		},
		ports: {
			in: { messages: S.messages },
			out: { main: S.mediaByMessage, attachments: S.mediaByMessage },
		},
	}),
)

/**
 * Which tools this session can call, and how each one is described to a model.
 *
 * A Query rather than a literal on `advertise-tools`, because the answer is
 * not a property of the spec: the core tools are fixed, but an install's
 * extensions are not, and a spec that listed its tools by hand would advertise
 * a tool an uninstalled plugin no longer provides — and refuse, by name, the
 * one that was installed yesterday.
 *
 * Each entry is `{ name, description, parameters }` with `parameters` as JSON
 * Schema, which is the shape `advertise-tools` takes and the shape every
 * native tool API wants. Nothing here executes anything; `run-tool` does that,
 * and refuses any name this list did not carry.
 * @experimental
 */
export const availableTools = pin(
	describeQueryDefinition({
		id: 'core:query/available-tools@1',
		i18n: { name: { en: 'Available tools' } },
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					include: {
						type: 'string[]',
						description:
							'Offer only these tools, by name, in this order. Empty offers every tool the session has.',
					},
					plugins: {
						type: 'boolean',
						default: true,
						description:
							"Offer tools contributed by the session's enabled extensions, as well as the built-in ones.",
					},
				},
			},
		},
		ports: { in: { scope: S.sessionScope }, out: { main: S.json, tools: S.json } },
	}),
)

// ── Consumers ───────────────────────────────────────────────────────────────

/**
 * Create a message.
 *
 * Split from the old `commitMessage`, which decided new-vs-update from whether an id
 * happened to be present (13 §10b). That was an implicit branch, and F25 exists because
 * implicit branches are unreadable: two specs that did different things looked identical,
 * and the receipt could not tell you which had happened. Two ids, two names, no inference.
 *
 * Gate-eligible, so it publishes the discriminated write result rather than raw ids
 * (13 §7j-b). Under async review this is a proposal a reviewer may still reject.
 */
/**
 * The create pipeline's read (24 §12, T8): what the session's cast wants to
 * say first — one entry per character in position order, each carrying the
 * full greeting history (the first text seeds the message, the rest become
 * swipes), interpolated against the session's first persona.
 *
 * A Query, because deciding what a greeting *is* — group-only lists, the
 * interpolation, the fallback line — is exactly the kind of decision a
 * custom genre should be able to replace without reimplementing the write.
 * @experimental
 */
export const sessionGreetings = pin(
	describeQueryDefinition({
		id: 'core:query/session-greetings@1',
		i18n: { name: { en: 'Session greetings' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.json, greetings: S.json },
		},
	}),
)

/**
 * A seated envoy's **declared greeting**, interpolated (lair re-plan R6,
 * 2026-09-28) — the line an envoy opens a new session with
 * (`EnvoyDecl.greeting`): the Lair's Castellan introduces the game.
 *
 * The create pipeline's read, beside `session-greetings@1`, which stays the
 * CARDS' greetings. A Query for the same reason that one is: what a greeting
 * says is a decision a custom genre may replace without reimplementing the
 * write.
 *
 * **Absent** — `text` empty — when the envoy is not seated in the session
 * or declares no greeting, so a spec writes behind a junction on `text` and
 * a session whose envoy was never seated gets no line under its name.
 * Interpolated with the envoy as `{{char}}`, the session's `{{playerLabel}}`
 * and the party as `{{characterNames}}` (empty at creation for a genre that
 * seats nobody yet, so the copy writes `{{#if characterNames}}`).
 *
 * No model call: a create run is a person waiting (`lair-create`).
 * @experimental
 */
export const envoyGreeting = pin(
	describeQueryDefinition({
		id: 'core:query/envoy-greeting@1',
		i18n: {
			name: { en: 'Envoy greeting' },
			description: {
				en: "The opening line a seated envoy declares, filled in for this session. Empty when the envoy is not seated or declares none.",
			},
		},
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/** The envoy, by its genre-local key (`castellan`). */
					envoy: {
						type: 'text',
						label: { en: 'Envoy' },
						description: "Which of the genre's envoys greets, by its key.",
					},
				},
			},
		},
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.text, text: S.text },
		},
	}),
)

// ── The built-in writes (R-15, ruled 2026-09-15, built 2026-09-16) ──────────

/**
 * 🚧 The **standing turn plan** a character turn plays from (Lair character
 * turns, owner ruling 2026-09-30).
 *
 * A planner's row carries the turns it planned (`create-message@1`'s
 * `turnPlan`, stored as `metadata.turnPlan`). Each named member then takes a
 * **character turn** of their own — a separate run, fired off the turn order
 * — and that run reads the plan back here: the planner's document (where the
 * scene is, what was planned) and the prose describing a room nobody filed.
 *
 * The plan that **stands** is the newest planner's row in the session's
 * history, unless a person's line on `main` is newer than it — a person
 * speaking after a plan has moved the story past it. With `messageId` (a
 * regenerate or swipe re-voicing that row) only rows older than it count, so
 * a re-voiced line reads the plan it was played from. No plan standing, every
 * port reads absent and the turn plays from the scene as it stands.
 * @experimental
 */
export const turnPlan = pin(
	describeQueryDefinition({
		id: 'core:query/turn-plan@1',
		i18n: { name: { en: 'Turn plan' } },
		timeoutMs: 2000,
		ports: {
			in: {
				scope: S.sessionScope,
				/** The row a regenerate or swipe re-voices — the inlet's `messageId`. Absent on a fresh turn. */
				messageId: S.rowIds,
			},
			out: {
				main: S.json,
				/** The planner's document, as the planner's row stored it. */
				plan: S.json,
				/** Prose describing the room the plan heads into, when the plan carried any. */
				locationPassage: S.text,
			},
		},
	}),
)

/**
 * The session's **annex** (PLAN-turn-order §4.3, R6): read one owner's
 * document out of `sessions.annex`.
 *
 * The annex is the pipeline layer's free field, namespaced by owner key — a
 * genre id, a plugin id, or a user-authored spec's slug. `metadata` is
 * core's own and read-only from here; this is where a spec keeps what it
 * needs to remember without core ever reinterpreting it.
 *
 * The owner defaults to the running spec's own namespace, which is the
 * whole safety of it: a spec reads its own document by default and has to
 * say `sharedAnnex` out loud to read anybody else's.
 * @experimental
 */
export const sessionAnnex = pin(
	describeQueryDefinition({
		id: 'core:query/session-annex@1',
		i18n: { name: { en: 'Session annex' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					owner: {
						type: 'string',
						default: '',
						label: { en: 'Owner' },
						description: {
							en: "Whose document to read. Blank means this pipeline's own.",
						},
					},
					sharedAnnex: {
						type: 'boolean',
						default: false,
						label: { en: 'Read another owner' },
						description: {
							en: "Allow reading a document this pipeline does not own. Off refuses, with a note on the receipt.",
						},
					},
				},
			},
		},
		ports: {
			in: {
				scope: S.sessionScope,
				/**
				 * `'ai'` for the prompt-safe view (R57): only the values the
				 * model's context may carry — those whose audience holds `ai`,
				 * `participant`, or the `speaker` below. Absent is everything,
				 * as a pipeline reads it. A literal.
				 *
				 * `'template'` (typed templates P6) reads what a template may
				 * reference: every DECLARED key of every owner in scope — core
				 * and the enabled plugins, for the session's genre — as
				 * `{ <owner>: { <key>: value } }`. `owner` and `sharedAnnex`
				 * do not apply; a key no declaration covers is left out. Law
				 * T2 lets it feed only a template node's `annex` in-port.
				 */
				view: S.text,
				/** Whose prompt, for `view: 'ai'` — a `character:` or `envoy:` reference. */
				speaker: S.participantRef,
			},
			out: { main: S.json },
		},
	}),
)

// ── Summarization ───────────────────────────────────────────────────────────

/** The messages a summary is drawn from, already scoped and ordered. @internal */
export const summarizeSource = pin(
	describeQueryDefinition({
		id: 'core:query/summarize-source@1',
		i18n: { name: { en: 'Messages to summarize' } },
		timeoutMs: 5000,
		ports: {
			in: { scope: S.sessionScope, request: S.summarizeRequest },
			out: { main: S.messages, messages: S.messages },
		},
	}),
)

/**
 * The keywords an entry is proposed to be found by — **without a model**.
 *
 * ## The defect it exists for
 *
 * The summarizer writes a history entry with `keys: []`. Keyword matching is the
 * only retrieval mechanism on by shipped default, and a history row carries no
 * title for `nameMatch` to read either, so a summary a user made *so the model
 * would remember* cannot be found by anything. Measured on the core corpus:
 * with no keys, **0 of 12** history entries are reachable by any conversation
 * about them.
 *
 * ## ⚠ Why it is not a Provider, and why that is the whole point
 *
 * Every sibling in this section calls a model — `name-entry@1` writes the title,
 * `extract-cast@1` reads the cast. This one is `core:query`, computes from the
 * lorebook it already has, and **cannot invent a keyword**: every key it emits
 * is a substring of the text it was given. A proposal that cannot hallucinate
 * needs no review for hallucination, only for judgement, which is a far cheaper
 * review — and it costs no tokens, no connection and no wait.
 *
 * ## ⚠ The failure mode it is built against
 *
 * **Character names are the worst possible keys for a scene.** They are also
 * what any extractor finds first, and if every scene's entry is keyed on who was
 * in it then every one of them fires whenever that person is mentioned. That
 * replaces *"history entries never fire"* with *"all history entries fire
 * together"*, which is worse — one entry crowding out the rest, across a whole
 * lane, in a fixed budget where a wrong entry displaces a right one.
 *
 * Measured, on ten messages that name two cast members and nothing else:
 * **0 of 12** history entries fire, and **11 of 12** with the guards against it
 * removed. Everything the node does is downstream of that number.
 *
 * ⚠ There are two guards, not one, and the measurement needed both removed. A
 * name in every scene also fails the *statistical* test — it already matches
 * most of the book — so on a lorebook with entries to count over, either one
 * holds the line. On a lorebook with two entries in it, only the structural
 * rule can, and that is the lorebook a user has when they start making
 * summaries.
 *
 * ## What a consumer gets
 *
 * `keys` carries each proposal with its evidence — where in the text it occurs,
 * the sentence around it, how distinctive it is in this lorebook, and how many
 * other entries it already matches — and `rejected` carries every candidate
 * turned away with the rule that turned it away. Both exist because this node
 * **proposes and never writes**: what it emits is meant to reach a person who
 * can edit it before `core:outlet/create-lore-entry@1` stores anything, and a
 * reviewer who has to hunt for the reason will approve without reading.
 *
 * ⚠ It never proposes **secondary** keys. Those carry a user's `selectiveLogic`
 * conditions — *"fire on dragon, but not when statue is present"* — which is an
 * author saying *not here*, and nothing that guesses is entitled to say it.
 * @internal
 */
export const entryKeys = pin(
	describeQueryDefinition({
		id: 'core:query/entry-keys@1',
		i18n: {
			name: { en: 'Suggest keywords' },
			description: {
				en: 'Proposes the keywords an entry should be found by, taken from its own text. Runs on your machine, calls no model, and can only ever suggest words the text actually contains.',
			},
		},
		/**
		 * Pure computation over rows already in the database — one pass over the
		 * lorebook per candidate word. It reads no network and loads no model, so
		 * the only way it can take long is a very large book.
		 */
		timeoutMs: 5000,
		/**
		 * Producing nothing is an ordinary and correct outcome — a passage with
		 * nothing distinctive in it gets no keys rather than the five least
		 * common words it happens to contain — and a suggestion must never be
		 * able to cost somebody their summary. Both are the same `optional`.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ **A ceiling on firing opportunities, not a display
					 * preference.** Any single key matching admits the entry, so
					 * this is how wide the entry's door is — and the keyword
					 * signal is `matched / keys.length`, so a longer list also
					 * makes the entry *rank* worse for the same single hit.
					 *
					 * Five: a scene is about a place, a thing and an event or
					 * two. Measured at eight, with the ordinary-word cap opened
					 * with it, **six of twelve** history entries fire on
					 * narrative prose naming nothing from any scene — against
					 * one at five — and the shared-name probe stops being clean.
					 * **0 is off**, in the `admitThreshold` convention.
					 *
					 * It is a ceiling and never a target — fewer is the normal
					 * result and none is a valid one.
					 */
					maxKeys: {
						type: 'integer',
						default: 5,
						min: 0,
						max: 20,
						quick: true,
						label: { en: 'Most keywords suggested' },
						description:
							'A ceiling on how many keywords are proposed for one entry. Each one is another way the entry can be pulled into a prompt, so a short list is usually a better one. 0 suggests none.',
					},
					/**
					 * ⚠ **The one calibration a user can actually reason about**,
					 * and the reason the others are not here. How rare a word has
					 * to be, how short it may be, how much of a name to keep —
					 * those are measurements, not preferences, and a settings
					 * panel cannot perform them.
					 *
					 * This one is a preference, because it trades two things a
					 * user can feel: an ordinary word like "watch" or "left" is
					 * how an entry gets found when it names nothing proper, and
					 * it is also how an entry starts firing on any scene at all.
					 * Two ordinary words of five; 0 restricts suggestions to
					 * names and places, which measured cleanest and left two of
					 * twelve summaries with no keys at all.
					 */
					maxOrdinaryWords: {
						type: 'integer',
						default: 2,
						min: 0,
						max: 20,
						label: { en: 'Ordinary words allowed' },
						description:
							'How many of the suggestions may be everyday words rather than names of people, places or things. Names are far less likely to pull the entry into an unrelated scene; 0 suggests names only.',
					},
				},
			},
		},
		ports: {
			in: {
				/** The lorebook and the cast — what distinctiveness is measured against. */
				scope: S.sessionScope,
				/**
				 * The passage keys are proposed for.
				 *
				 * `content`, matching `name-entry@1`, so both proposal steps take
				 * the drafted summary off the same out-port under the same name.
				 */
				content: S.text,
			},
			out: {
				main: S.json,
				/** The proposals, each with the evidence for it. */
				keys: S.json,
				/** Every candidate turned away, and the rule that turned it away. */
				rejected: S.json,
			},
		},
	}),
)

// ── Graph build ─────────────────────────────────────────────────────────────
//
// Five LLM steps, each already independently configurable in
// `graph_build_configs` as a `<step>_system_prompt` / `<step>_connection_id` /
// `<step>_sampling_config_id` triple. Five Providers is the same statement with
// the enumeration removed.

/** @internal */
export const graphScenes = pin(
	describeQueryDefinition({
		id: 'core:query/graph-scenes@1',
		i18n: { name: { en: 'Scenes to build from' } },
		timeoutMs: 5000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.graphScenes, scenes: S.graphScenes },
		},
	}),
)

// ── Stats and states ────────────────────────────────────────────────────────
//
// A stat is declared once (`defineAttributeSlot`, SDK attributes.ts), attached where it
// is true by default, and valued where play happens. These two nodes are the
// pipeline's whole share of that: one reads the resolved state, one writes it.
// Everything about *what* a slot is lives in the SDK registry, so neither node
// carries a vocabulary that could drift from the one the app validates against.

/**
 * The session's stats and states, resolved — an inventory is one, the
 * `inventory` list stat (phase 3b retired possessions as edges).
 *
 * `{ world, cast, slots, who, version }` — the same object `stateFor(sessionId)`
 * returns and the shape `state` on `core:task/build-template-context@1` takes.
 * Every value is already resolved down session → lorebook → card →
 * declaration default, with absence meaning **inherit** rather than zero, and
 * derived slots computed rather than read.
 *
 * A Query, and a plain one: what it is is a read. There is no as-of parameter
 * — this is the `current` view, and the temporal registry that would give the
 * other one is not built (see docs/stats-and-states.md).
 *
 * `version` is the session's **state version** (plans/29 R-15 *Staleness and
 * order*; 30 §U5f): a counter every applied change moves, in turn order,
 * under a lock. A run that reads state here and later asks to change it
 * hands the version back as `base` on `resolve-state-changes@1` /
 * `set-state@1`, so a change proposed against a state that has since moved
 * is rebased or superseded rather than applied blind. The same number rides
 * the resolved document as `state.version`, where an enabled-when can name it.
 * @experimental
 */
export const sessionState = pin(
	describeQueryDefinition({
		id: 'core:query/session-state@1',
		i18n: { name: { en: 'Session state' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.json, state: S.json, version: S.json },
		},
	}),
)

/**
 * 🚧 How many of an item are held, and how many are left (attributes phase 3a,
 * 2026-09-26).
 *
 * An item is a `core:entry/item@1` lore entry whose **supply** is unique,
 * limited to N, or unlimited; a holder's **held count** rides the list item
 * that references it (`{ entryId, count }`) in any list slot the session
 * tracks — usually `inventory`. This answers, per entry asked about:
 * `{ entryId, name, supply, limit, held, remaining, holders }` —
 * `held` = Σ count across the session's owners (the world and every cast
 * member), `remaining` = limit − held, never below zero, and `null` for an
 * unlimited supply.
 *
 * ⚠ **It answers; it never enforces.** The owner ruled that supply is enforced
 * by genre pipelines: a pipeline that hands out the last key reads this first
 * and decides what a zero means (refuse, swap, narrate a shortage). The host
 * writes whatever the gate accepts.
 *
 * `entryIds` optional: with none it answers for every item entry in the
 * session's lorebook. An entry outside that lorebook is not answered for — the
 * scoping refusal, as for every Query.
 * @experimental
 */
export const itemSupply = pin(
	describeQueryDefinition({
		id: 'core:query/item-supply@1',
		i18n: { name: { en: 'Item supply' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope, entryIds: S.json },
			out: { main: S.json, supply: S.json },
		},
	}),
)

/**
 * 🚧 The stats a **lorebook** holds — for its world, each cast member and each
 * place — as durable values (owner-confirmed 2026-09-27: "Pipelines should be
 * allowed to query stats from the lorebook as well").
 *
 * ## The book's layer, and no session needed
 *
 * What write-back recorded onto the book's timeline, plus what an author set
 * on the lorebook, a cast member or a place: the row in force per owner and
 * slot, the same one a new session played in the book would inherit. Nothing
 * falls through to a card or a declaration default — a slot the book never
 * valued is an absent key, not the default — and no session is read, so a
 * pipeline with no session in play (a run the scope grants the book to) can
 * read it.
 *
 * `{ lorebookId, branchId, slots, world, cast, locations }`, keyed like
 * `session-state@1`'s document: `world.hp`; `cast.byId[castMemberId]` and
 * `cast[slug]` over one set of objects, each carrying `id` (the **cast
 * member's** id — `lorebook_bindings.id`, never the card's), `key` and `name`;
 * `locations` the same by location entry id. `branchId` is the line read
 * (null is main).
 *
 * ## Only what the book tracks
 *
 * A lorebook has no genre, so its vocabulary is phase 1's **world
 * attributes**: the sheets on the lorebook, its cast members and its places,
 * plus every declared, pickable slot the book holds a durable value for. It
 * fails closed: an undeclared slot, or one a mechanism keeps, is never read.
 *
 * ## Where on the book
 *
 * By default: the scope session's own line and moment when the book is that
 * session's; otherwise the book's **most recently used** line (the line of
 * the session played most recently) at the **head** of its timeline. On a
 * branch, main's dated values count only up to the fork date. The document
 * says where it read: `branchId`, `moment` (null = head), `forkedAt` — where
 * main was cut, which on a fork of a fork is the EARLIEST fork date along the
 * parent chain, not the branch's own (null = no cut).
 *
 * 🚧 A custom reading, all optional: `branch` — `'main'`, `'mostRecent'`,
 * `'session'` or a branch id of this book; `at` — `'head'` or a story date
 * `{ year, month?, day? }`, keeping only values dated on or before it;
 * `forkCut: false` — let all of main through on a branch. A branch of
 * another book is refused like the book.
 *
 * ## Scope
 *
 * The scope session's own lorebook by default. `lorebookId` may name that
 * book, or one the run's scope grants; any other is **refused** with a
 * sentence, never read as empty — and so is an owner filter naming a cast
 * member or place of another book.
 * @experimental
 */
export const lorebookState = pin(
	describeQueryDefinition({
		id: 'core:query/lorebook-state@1',
		i18n: {
			name: { en: 'Lorebook state' },
			description: {
				en: 'Reads the stats a lorebook holds for its world, its cast members and its places — what earlier sessions recorded and what the author set. No session is needed.',
			},
		},
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which stats to read, by full id (`core:slot/hp@1`) or
					 * local name (`hp`). Empty or absent reads every stat the
					 * book tracks; a name it does not track reads nothing.
					 */
					slotIds: {
						type: 'list',
						item: { type: 'text' },
						label: { en: 'Only these stats' },
						description:
							'Which stats to read, by name. Leave it empty for every stat the lorebook tracks.',
					},
				},
			},
		},
		ports: {
			in: {
				/** Which session's lorebook, when `lorebookId` does not say. Optional. */
				scope: S.sessionScope,
				/** A lorebook id: the scope session's own, or one the run's scope grants. Optional. */
				lorebookId: S.json,
				/**
				 * One owner: `"world"`, `{ kind: 'cast_member', id }` or
				 * `{ kind: 'location', id }` (the session kinds `session`,
				 * `session_cast`, `session_location` are translated). Optional.
				 */
				owner: S.json,
				/** 🚧 `'main'`, `'mostRecent'`, `'session'` or a branch id of this book. Optional. */
				branch: S.json,
				/** 🚧 `'head'` or a story date `{ year, month?, day? }`. Optional. */
				at: S.json,
				/** 🚧 `false` lets all of main through on a branch. Optional. */
				forkCut: S.json,
			},
			out: { main: S.json, state: S.json },
		},
	}),
)

/**
 * 🚧 The **stat trail**: one stat's values over time, for one owner — the
 * world, a cast member or a place (owner-confirmed 2026-09-27: "stats over
 * time / over cast progression"). Its document is on `trail` (and `main`).
 *
 * ## Two clocks
 *
 * - `messages` — the scope session's own changes, in message order. A swiped
 *   or regenerated reply's changes are gone (the swipe retracts them), and a
 *   branched session holds its own copies, so neither leaks in.
 * - `timeline` — what the lorebook recorded across every session, ordered by
 *   the date of the history entry each hangs from (the one story-date
 *   comparator). An undated value — an author's, or one recorded before any
 *   capture — sorts first.
 * - `both` (default) — the timeline, then the session's messages: the session
 *   is played at the book's present. A timeline value this session itself
 *   recorded is dropped here, since it is already one of its points.
 *
 * Each point: `{ value, layer: 'session' | 'timeline', anchor, provenance }` —
 * `anchor` is `{ messageId }` or `{ historyEntryId, date }`; `provenance` is
 * `{ updatedBy, sessionId, messageId, sceneId, note, createdAt }` (who wrote
 * it: `user`, `run:<id>`, or `session:<id>` for write-back). The document is
 * `{ lorebookId, sessionId, branchId, owner, slotId, mode, tracked, points }`;
 * `tracked: false` with no points when neither the book nor the session tracks
 * the slot (fails closed).
 *
 * ## Limits
 *
 * `last` keeps the newest N points after every other cut. `since` is
 * `{ messageId?, date? }`: `messageId` keeps session points AFTER that
 * message (and drops the timeline in `both`, which precedes it); `date` keeps
 * timeline points dated ON or after it (a date is a period).
 *
 * ## Where on the book
 *
 * The timeline stands where `lorebook-state@1` does, with the same optional
 * `branch`, `at` and `forkCut` ports: on a branch, main's values after the
 * fork date are not points; at a date, nothing dated after it is. The
 * session's own messages are its own and are not cut. The document adds
 * `moment` and `forkedAt` (the effective cut, as in `lorebook-state@1`).
 *
 * Scoped like `lorebook-state@1`: the scope session's lorebook, or one the
 * run's scope grants; any other, or an owner of another book, is refused.
 * @experimental
 */
export const statTrail = pin(
	describeQueryDefinition({
		id: 'core:query/stat-trail@1',
		i18n: {
			name: { en: 'Stat trail' },
			description: {
				en: 'Lists one stat’s values over time for the world, a cast member or a place — by message in this session, across sessions by story date, or both.',
			},
		},
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/** The stat, by full id or local name. */
					slotId: {
						type: 'text',
						quick: true,
						label: { en: 'Stat' },
						description: 'Which stat to follow, by name — for example hp.',
					},
					mode: {
						type: 'enum',
						of: ['both', 'messages', 'timeline'],
						members: [
							{
								key: 'both',
								label: { en: 'Both' },
								description: { en: 'Across sessions, then this session.' },
							},
							{
								key: 'messages',
								label: { en: 'This session' },
								description: { en: 'This session, message by message.' },
							},
							{
								key: 'timeline',
								label: { en: 'Across sessions' },
								description: {
									en: 'What the lorebook recorded across sessions, by story date.',
								},
							},
						],
						default: 'both',
						quick: true,
						label: { en: 'Which trail' },
						description:
							'This session message by message, what the lorebook recorded across sessions by story date, or both.',
					},
					last: {
						type: 'integer',
						default: 50,
						min: 1,
						max: 1000,
						label: { en: 'Most changes listed' },
						description: 'Keep only the most recent changes, up to this many.',
					},
				},
			},
		},
		ports: {
			in: {
				scope: S.sessionScope,
				/** A lorebook id: the scope session's own, or one the run's scope grants. Optional. */
				lorebookId: S.json,
				/** `"world"` (default), `{ kind: 'cast_member', id }` or `{ kind: 'location', id }`. */
				owner: S.json,
				/** `{ messageId?, date?: { year, month?, day? } }`. Optional. */
				since: S.json,
				/** 🚧 `'main'`, `'mostRecent'`, `'session'` or a branch id of this book. Optional. */
				branch: S.json,
				/** 🚧 `'head'` or a story date `{ year, month?, day? }`. Optional. */
				at: S.json,
				/** 🚧 `false` lets all of main through on a branch. Optional. */
				forkCut: S.json,
			},
			out: { main: S.json, trail: S.json, points: S.json },
		},
	}),
)

/**
 * Change state — or ask to.
 *
 * ## Why `propose` is the default
 *
 * The three writers do not have equal authority (`DESIGN-stats-and-states.md`).
 * A person editing a bar is authoritative; a genre's own script rolling damage
 * is authoritative because the genre author wrote the arithmetic; a **model**
 * is neither, and a model that could set a number silently is a model that can
 * rewrite the fiction between two messages with no receipt a player can
 * refuse. Defaulting to `propose` means a spec that wires a model's output
 * straight into this node produces a pending line with Accept / Reject, and a
 * genre that wants the other behaviour says so in one parameter.
 *
 * ## Why it is a Task
 *
 * It writes, which a Task is not otherwise supposed to do, and the alternative
 * is worse: F7 allows a spec **one** write-class Consumer and that one is the
 * message. A damage roll that also saves a reply would be unspecifiable. What
 * makes it defensible rather than a hole is that these rows are not the run's
 * primary artifact — every one of them is anchored to a message and retracted
 * with it, so a rejected turn takes its state changes with it.
 *
 * `changes` is one ordered list of `{ owner, slotId, value }` — or, for a
 * list slot, `{ owner, slotId, op: 'add' | 'remove', items }`. An item
 * changing hands is exactly that on the owner's `inventory` stat (phase 3b
 * retired the `{ owner, entryId, delta }` possession edge; the model-facing
 * item line survives on `resolve-state-changes@1`, which turns it into this). One
 * port because one turn's changes are one ordered list, and splitting them
 * would let a spec apply half of them.
 */
/**
 * Changes a model NAMED, turned into changes `set-state` can write.
 *
 * ## A Query, because resolving a name is a READ
 *
 * "Verity" becomes a cast row by looking her up in this session's cast, which
 * is a read of the host and therefore a Query's job — a Task is handed no
 * services (F11). That also buys the scoping refusal for free: the cast it
 * matches against is the cast of the session on the `scope` port and no other.
 *
 * ## Why this is a node and not a leniency inside `set-state`
 *
 * `core:task/set-state@1` takes an owner as `{ kind, id }` — a row, resolved,
 * unambiguous. A model has no row ids: it has the names the transcript gave it
 * ("Verity", "the world") and the local name of a stat ("hp"). Something has to
 * resolve one into the other, and the two candidates were this node or a
 * widened `set-state`.
 *
 * It is this node, because the two callers are genuinely different. A genre's
 * own script that rolled damage knows which cast row it hit and must not have
 * its exact owner re-guessed by a fuzzy name match; a model's proposal has
 * nothing else to offer. Widening `set-state` would make every writer pay for
 * the model's ambiguity, and would move a resolution failure inside the node
 * that writes — where it can only be a refusal, never a line on the receipt.
 *
 * The same resolution the three state tools do (`set_state`, `give_item`,
 * `take_item`), reached from a structured block instead of from a tool call.
 * An item line (`{ owner, entryId, delta }`) resolves to an `add` / `remove`
 * with a held count on the owner's `inventory` stat, refused as a sentence
 * when the session does not track inventory (phase 3b).
 *
 * ## A name it cannot resolve is a RESULT, not a halt
 *
 * A keeper that named five changes and got one character's name wrong should
 * land four proposals and a sentence about the fifth. `refused` carries those
 * sentences so the receipt can show them; `changes` carries what resolved.
 * Halting the turn over one bad name would lose the other four, which is the
 * same argument `set-state`'s own per-change refusal makes.
 * @experimental
 */
export const resolveStateChanges = pin(
	describeQueryDefinition({
		id: 'core:query/resolve-state-changes@1',
		i18n: { name: { en: 'Resolve state changes' } },
		timeoutMs: 5000,
		ports: {
			in: {
				/**
				 * `[{ owner, slot, value } | { owner, entryId, delta }]` as a
				 * model writes them: `owner` is a name from the conversation or
				 * `world`, `slot` is a stat's local name (`hp`) or its full id,
				 * and an item line moves `delta` of a lore entry into (+) or
				 * out of (−) the owner's inventory.
				 */
				changes: S.json,
				/**
				 * Who a change that names no `owner` is for, as participant
				 * references (lair re-plan R10, 2026-09-28): each such change
				 * is made once per reference, the same slot and value on each —
				 * the Lair's Whisper writes its one line on every recipient the
				 * press collected (`core:inlet/user-message@1.recipients`). A
				 * `character:<id>` resolves to that seated cast member; any
				 * other reference, or a character this session does not seat,
				 * is a sentence on `refused`. A change that names its own
				 * `owner` keeps it. Optional: unwired, an owner-less change is
				 * the world's, as before.
				 */
				owners: S.participantRefs,
				/**
				 * 🚧 **Whose stats this keeper keeps** (stat ownership, owner
				 * ruling 2026-09-30): `'world'` — the world and its places, so
				 * a change naming a cast member is refused; or one participant
				 * reference (`character:<id>`) — that member alone, so a change
				 * to the world, a place or anybody else is refused. Either may
				 * also be a party speaker (`{ characterId }`, or `{ name }` as a
				 * plan writes it, resolved like a change's `owner`), and a list
				 * keeps every item it holds, read flat — an absent item keeps
				 * nobody more. Each refusal is a sentence on `refused`. Unwired,
				 * any owner may be named, as before. The Lair's Castellan keeper
				 * wires `'world'` and the delvers it voiced this turn; each
				 * character turn's keeper wires its own speaker.
				 */
				keeps: S.json,
				/** Which session's cast the names are resolved against. */
				scope: S.sessionScope,
				/**
				 * The planner's document, whose `worldHints` are a second,
				 * smaller set of named changes: where this turn happens, the
				 * time of day and the weather.
				 *
				 * Its own port rather than more entries on `changes`, because
				 * a reference is `{node, port}` with no sub-path — a spec
				 * cannot join one node's list to another node's object on one
				 * port, and the two are written by different agents answering
				 * different questions. A hint that repeats what the world
				 * already says proposes nothing, which is what makes "repeat
				 * the state when this turn changes none of it" safe to ask of
				 * the planner.
				 */
				plan: S.json,
				/**
				 * The **state version** this turn read (U5f): the session-state
				 * query's `version`. Passed through onto every resolved change
				 * as `base`, so `set-state` can tell a delta against the state
				 * the model saw from one against a state that has since moved.
				 * Optional: a spec that wires none proposes against whatever
				 * is current at the write.
				 */
				base: S.json,
				/**
				 * 🚧 `core:query/item-supply@1`'s answer (phase 3b). Optional,
				 * and the only way supply is ever checked: core never enforces
				 * it (owner ruling 2026-09-25), so a genre that wants a unique
				 * item to stay unique wires this, and an item line granting
				 * more than is left lands on `refused` as a sentence. A take
				 * frees what that owner held before the turn's gives are
				 * counted.
				 */
				supply: S.json,
			},
			out: {
				main: S.json,
				/** Ready for `core:task/set-state@1`'s `changes` port — each carrying `base` when one was wired. */
				changes: S.json,
				/** One sentence per change that named something not here. */
				refused: S.json,
			},
		},
	}),
)

// ── core:query/lorebook-entries@1 ───────────────────────────────── begin ────
// Appended as a delimited block rather than placed beside the four lore
// definitions above (≈ line 930–1345), because another session is editing this
// file. It belongs after `historyEntries`; move it there once that lands.

/**
 * The session's attached lorebook, **listed** — every entry, or the one with a
 * given name.
 *
 * ## Not a retrieval, and that is the whole point
 *
 * The four entries-shaped definitions above — `lorebook-triggers@1`,
 * `world-lore@1`, `character-lore@1`, `history-entries@1` — are one keyword
 * scan over the conversation, and an entry reaches a prompt through them only
 * by matching a key, by clearing `admitThreshold` on other evidence, or by
 * declaring itself `constant`. That is right for a reply and it is no use at
 * all to a genre that needs to see the book: on a **create** run there is no
 * conversation to scan, so the window is empty and only always-on entries are
 * admitted — and a genre asking *is there a room called the Cellar?*, *pick one
 * of these as the secret*, or *who are the suspects?* had no door at all
 * (plans/genres §10 G13/G14, §11 L4).
 *
 * This is that door, and it is deliberately dull: **no mechanism runs, nothing
 * is scored, nothing is ranked.** `main` and `entries` carry one bare list of
 * rows — a **listing**, never `core:shape/context-candidates@1` — so there is
 * no order of merit in it for a reader to mistake for one. A spec that wants
 * the book ranked concatenates it into the ranker like any other source; this
 * node will not do it for them.
 *
 * ## The rows are retrieval's rows
 *
 * Same fields, from the same host read and the same `toLoreEntry` projection
 * the four definitions above publish on each candidate's `payload` — `id`,
 * `source`, `name`, `content`, `keys`, `constant`, `enabled`, `position`,
 * `priority`, the matcher set, `bindingCharacterId`,
 * `fingerprint`, and history's `year` / `month` / `day`. That is the contract
 * worth having: a task written against a retrieved entry reads a listed one
 * without a second shape to learn, and there is no second projection to keep in
 * step (R5 — the vocabularies are reconciled at the host's read, not merged).
 * The one addition is asked for: `withLinks` puts each row's lore links on it
 * as `links` (`LoreLinkRow[]`), said from that row.
 *
 * ## What it will not hand over
 *
 * · **Another session's lorebook.** `scope` decides which session, and a
 *   `sessionId` that disagrees with the run's is refused with a sentence
 *   (`assertScoped`), never filtered down to an empty list.
 * · **Disabled or archived entries.** `enabled: false` is a switch the author
 *   left off and `archived` is the column whose stated meaning is *don't
 *   retrieve it and don't show it to me*; a listing that offered either would
 *   make a switched-off room exist and a shelved suspect answer for a crime.
 *   Both are filtered at the read. (The scan above still *sees* disabled rows,
 *   on purpose — it reports them on `skipped` so a person can be told why their
 *   lore did not come in. Nothing here changes that.)
 * · **Character lore that is private from the current speaker.** The read
 *   applies the same binding-visibility policy the four definitions above run
 *   under, so this is not a way around it. In the case this node exists for —
 *   a create run, an oracle, anything narrator-shaped — `currentCharacterId` is
 *   null, the policy is omniscient, and the whole book comes back.
 *
 * ## No `optional`
 *
 * Absent, so a failure is the run's failure. A genre that picked its secret
 * from this list cannot be handed an empty one and carry on: `optional: true`
 * turns an error into an empty `ok`, and an empty book and a book that failed
 * to load are the same value to every reader downstream. It is also not a node
 * a person should be able to switch off — a Twenty Questions pipeline without
 * it has nothing to play with.
 * @experimental
 */
export const lorebookEntries = pin(
	describeQueryDefinition({
		id: 'core:query/lorebook-entries@1',
		i18n: {
			name: { en: 'Lorebook entries' },
			description: {
				en: 'Lists the entries of the session’s lorebook — all of them, or the one with a given name. Retrieval is not involved: nothing is matched against the conversation, nothing is scored and nothing is ranked.',
			},
		},
		/**
		 * The lore definitions' number. One indexed read of one book plus the
		 * bindings it hydrates, which is the same work their shared scan pays
		 * for before it scans anything.
		 */
		timeoutMs: 2000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which entry types to list — `core:entry/world-lore`,
					 * `core:entry/character-lore`, `core:entry/history`, or a
					 * plugin's own. Bare ids, no `@version`: the version is a
					 * separate column and a type's rows are its rows across
					 * versions.
					 *
					 * A `list` of `text` rather than an `enum` of the three
					 * core ids, because the set is open — an install with a
					 * plugin entry type has more of them, and an enum frozen
					 * into this definition's content hash could not grow
					 * without a re-projection. An id no type declares matches
					 * nothing, which is the honest answer to a typo.
					 *
					 * Empty or absent lists every entry type.
					 *
					 * Named `entryTypes` rather than `types` (R3): *type* alone
					 * is the word four other vocabularies use — a node type, a
					 * session type, a part type — and a parameter may not take
					 * the bare noun.
					 */
					entryTypes: {
						type: 'list',
						item: { type: 'text' },
						label: { en: 'Entry types listed' },
						description:
							'Which kinds of entry to list, by type id — world lore, character lore, history, or a type an extension declares. Leave it empty for all of them.',
					},
					/**
					 * The *does it exist* case: one exact name, matched
					 * case-insensitively with surrounding whitespace trimmed
					 * on both sides.
					 *
					 * Exact and never a substring or a pattern. A genre asking
					 * "is there a room called the Cellar?" needs *yes* or *no*,
					 * and a match that also returned "Cellar Door" and "The
					 * Wine Cellars" would answer a question nobody asked — the
					 * search-shaped reading of this node is the keyword scan
					 * above, which already exists and is better at it.
					 *
					 * History entries have no name at all (the type declares no
					 * title role), so naming one lists nothing.
					 *
					 * Absent lists every entry of the chosen types.
					 */
					name: {
						type: 'text',
						quick: true,
						label: { en: 'Only the entry named' },
						description:
							'List only the entry with exactly this name, ignoring capitalisation and surrounding spaces. Leave it empty to list them all.',
					},
					/**
					 * A ceiling on rows read, not a page: there is no offset
					 * and no cursor, so raising it is the only way to see more.
					 *
					 * 500 is a large lorebook and 2000 is a ceiling on the
					 * ceiling — this list is usually on its way into a prompt,
					 * and a book that would not fit in a context window is not
					 * made to fit by asking for all of it. The cap is enforced
					 * at the read as well as declared here; a node's parameter
					 * is a control, never a promise the host takes on trust.
					 */
					limit: {
						type: 'integer',
						default: 500,
						min: 1,
						max: 2000,
						label: { en: 'Most entries listed' },
						description:
							'A ceiling on how many entries are listed. When there are more, the newest are listed. There is no second page — raising this is the only way to see more.',
					},
					/**
					 * Each row's **lore links**, on the row as `links`
					 * (`LoreLinkRow[]`) — places plan B2, 2026-09-29. Drizzle's
					 * `with: { … }` in spirit: the listing stays a listing, and a
					 * reader that wants a room's ways out says so.
					 *
					 * Each link is said **from the listed entry** — its wording
					 * from here, the far end named — and only a link that is a
					 * way out of here is listed: between two entries, standing
					 * (active, not secret) on the session's line at its moment,
					 * both ends live, and never one drawn *into* here with no
					 * wording back (one way, inbound). The far end passes the
					 * visibility gate for the WIRED `speaker`; with none wired,
					 * a far end the listing does not itself carry is named only
					 * when every voice may see it — an unwired listing may be
					 * read once and shared by every voice in a turn (the Lair's
					 * rooms). Never a way round the gate.
					 *
					 * Off by default: a row read without it carries no `links`
					 * at all, so every spec written before it reads exactly what
					 * it did.
					 */
					withLinks: {
						type: 'boolean',
						default: false,
						label: { en: 'With each entry’s links' },
						description:
							'Also list, on each entry, the links that lead from it to other entries — a room’s ways out, what it is inside — each said from that entry.',
					},
				},
			},
		},
		ports: {
			/**
			 * Which session's lorebook, and — through `currentCharacterId` —
			 * who is speaking, which is what the binding-visibility policy
			 * reads. No `text` in-port: there is nothing here to match text
			 * against.
			 */
			in: { scope: S.sessionScope },
			/**
			 * One bare list of rows on both ports, `main` for a spec that
			 * wires the node's output and `entries` for one that names what it
			 * is reading. Same value, same order — world lore, then character
			 * lore, then history, each by row id.
			 *
			 * ⚠ `S.json` and deliberately **not** `S.candidates`. A candidate
			 * is something a mechanism proposed, carrying signals a ranker
			 * reads; these rows were proposed by nothing and carry no signals,
			 * and publishing them as candidates would let a spec wire a
			 * whole lorebook into `select` as if a scan had found it.
			 */
			out: { main: S.json, entries: S.json },
		},
	}),
)

// ── core:query/lorebook-entries@1 ───────────────────────────────── end ──────
