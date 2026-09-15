/**
 * Sample core contracts — what /contracts would generate.
 *
 * Every entry is a descriptor plus a pinned constructor. Note that the LLM, TTS and
 * image-gen providers are structurally identical: `params` is declared per type, so
 * nothing anywhere switches on modality (17 §1).
 */

import { S, tf, IoKinds } from '@serene-pub/sdk'
import { jinja2, handlebars, liquid } from '@serene-pub/sdk'
import {
	describeInput,
	describeQueryType,
	describeTaskType,
	describeProvider,
	describeConsumerTarget,
	pin,
} from '@serene-pub/sdk'
import { PROMPT_BLOCKS_DECL } from '@serene-pub/sdk'
import type { FieldDecl, SlotDecl } from '@serene-pub/sdk'

/**
 * How a provider node wants its request sent.
 *
 * Two values, because only two are deliverable. `auto` defers to the
 * CONNECTION, which already holds an answer and holds a different default per
 * service; `off` forces the single-request branch every adapter has. There is
 * no `on`: a connection whose adapter has no streaming branch could not honour
 * one, and a control that silently means nothing on half the rows is the
 * defect this vocabulary avoids.
 *
 * A factory rather than a shared constant so the four declarations are four
 * objects — a descriptor is snapshotted into registry rows, and an alias
 * shared across pins is one edit away from being four.
 */
const streamingParam = (): FieldDecl => ({
	type: 'enum',
	of: ['auto', 'off'],
	default: 'auto',
	description:
		'auto streams when a reader is listening; off sends one request and waits, which is cheaper for background stages.',
})

// ── Inputs ──────────────────────────────────────────────────────────────────

/**
 * What a turn is *about*: this chat, and whose turn it is.
 *
 * `sessionScope` bundles both and is what the queries take, but neither was
 * readable on its own — so a node that needs only the speaker had to accept the
 * whole scope and reach into it, and `currentCharacterId` ended up travelling
 * on `HostScope` instead of through the graph because there was no port to
 * carry it. Hidden state in a run that otherwise records everything.
 *
 * The two scalars are ports now. `sessionScope` stays: a query wanting both should
 * take one thing, not reassemble it.
 */
export const userMessage = pin(
	describeInput({
		id: 'core:input/user-message@1',
		// Display only, both keys: stripped from the content hash, refreshed on
		// existing rows by the boot sync — so copyediting this is never a bump.
		i18n: {
			name: { en: 'Chat' },
			description: {
				en: 'The standard roleplay chat — bring characters and personas in any mix, attach a lorebook if you like, and type to talk.',
			},
		},
		/**
		 * The standard chat's shape (19 §1) — today's behaviour, *stated*.
		 * This block is what makes the input type a **chat mode** (the F29
		 * floor: always present, special in availability and nothing else).
		 * Both participant systems are optional and unbounded above, lorebooks
		 * attach when wanted, the composer is a text box, and the seed line
		 * carries the speaking character's name. Duties and triggers are not
		 * here on purpose: the shape is owner-only, and the narrate button is
		 * the narrate spec's contribution, not this type's knowledge (19 §3).
		 */
		sessionShape: {
			characters: { min: 0 },
			personas: { min: 0 },
			lorebook: 'optional',
			composer: 'text',
			voice: 'character',
			// Stated rather than assumed (20): a new chat seeds the cast's
			// greetings on `main`. It is the default for any input node, so a
			// custom mode reuses it for free; core declares it so the reusable
			// case reads at a glance.
			greeting: { enabled: true, channel: 'main' },
		},
		slots: {
			/**
			 * The input hook (18 §4a): user chains over the triggering text,
			 * phase `after` on what this node publishes — which is what
			 * lorebook scanning and the prompt's seed see. The stored user
			 * message was written before the turn began and stays untouched
			 * by construction; the slot description says so because that is
			 * the question the control raises.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1'],
				port: 'text',
				phase: 'after',
				description:
					'Scripts over the message that triggered this turn — expand shorthand, resolve dice notation — as retrieval and the prompt will see it. The stored message is not changed.',
			},
		},
		ports: {
			out: {
				main: S.json,
				text: S.text,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/** Null on a narrator turn — nobody in particular is speaking. */
				characterId: S.rowIds,
				/**
				 * Values for the mode's declared `fields` (19 §1), filtered to
				 * the declared schema keys — the supply side of the round
				 * trip: declaration → chat settings → chat row → this port →
				 * every downstream node.
				 */
				fields: S.json,
				/**
				 * Text an in-progress reply has already produced, when this turn
				 * is a **continue** (ruling 2026-09-08, D-2).
				 *
				 * Empty on every other turn, which is nearly all of them. It is
				 * here rather than on a `continue`-only input type because a
				 * continue is the standard chat's own verb — it answers the same
				 * event, in the same session, from the same cast — and a second
				 * input type would restate this one's `sessionShape`, which is
				 * the thing `side-character-turn@1`'s note says a shape-bearing
				 * mode must never have copied.
				 *
				 * ⚠ It is not the triggering text and it is not a message. `text`
				 * stays what it would be on an ordinary turn, the row carrying
				 * this is excluded from every message read while it generates,
				 * and only `core:task/process-messages@1` consumes it — as the
				 * body of the seed line the model continues from.
				 */
				continuationPrefill: S.text,
			},
		},
	}),
)

/**
 * A message that already exists — the trigger carries its id.
 *
 * `messageId` is `row-ids@1` rather than `json` because it *is* a row id, and typing it
 * as one is what makes `updateMessage` wireable at all: the id an update is allowed to
 * take is the id of a row that already exists, which is exactly what an event about an
 * existing message carries (13 §10b).
 */
export const messageCreated = pin(
	describeInput({
		id: 'core:input/message-created@1',
		ports: { out: { main: S.json, messageId: S.rowIds } },
	}),
)

/**
 * A session was just created — the create pipeline's trigger (24 §5, §12).
 *
 * The genre's one required pipeline answers this event and seeds the
 * session's initial data: greetings per the genre's shape, initial channels,
 * initial state. The payload is the create request itself — the genre, the
 * chosen preset, the participants and initial field values — because what a
 * create pipeline does is *finish* what the request began.
 *
 * Not `user-message`: reusing the turn input here welded creation to the
 * chat turn's shape and was wrong (24 §12). A create run has no triggering
 * text and no speaker; it has a request.
 */
export const sessionCreated = pin(
	describeInput({
		id: 'core:input/session-created@1',
		i18n: {
			name: { en: 'Session created' },
			description: {
				en: 'Fires once, when a session of this genre is created — the pipeline that answers it seeds greetings, channels and initial state.',
			},
		},
		ports: {
			out: {
				main: S.json,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * The create request: genre id, preset id, participant ids,
				 * lorebook, initial field values — everything the person chose
				 * before the session existed.
				 */
				request: S.json,
				/** Values for the genre's declared fields, filtered to the schema. */
				fields: S.json,
			},
		},
	}),
)

/**
 * Who is about to speak, when the trigger picked somebody who is **not** in
 * the cast — the side-character narration turn (ruling 2026-09-07).
 *
 * ## participant ≠ character
 *
 * A side character is a **participant without a turn slot**. The trigger's
 * first step accepts either an existing character (`characterId`) or a name
 * somebody typed (`speakerName` alone), and both are full participants *for
 * that turn* — the prompt is written from their perspective and the seed line
 * carries their name. Neither joins the session cast, and nothing here writes
 * a `session_characters` row: this input publishes a fact about one turn, and
 * a fact is not a membership.
 *
 * Its own type rather than a flag on `user-message@1`, for the reason that type
 * already gives about the narrator: the type is the unit that declares a
 * configurable surface, and `user-message` is the standard chat's **mode** —
 * it carries the genre's `sessionShape`, which is exactly what a side-character
 * turn must not restate. This one declares no shape, so it is an action input
 * and never a session mode.
 *
 * ## The new-name hook (the fact, and only the fact)
 *
 * `speaker` carries `known` — whether the chosen name matches anything in the
 * session's lorebook — and the scripts hook below declares it as an **extra**,
 * so a script attached there reads it through the one dispatch core scripts and
 * extension hooks already share. Core states the fact and offers the hook; what
 * a script *does* about an unknown name (suggest adding them, stay quiet, add a
 * note to the prompt) is the script's business, not this declaration's. There is
 * deliberately no second path: nothing here notifies, writes, or prompts.
 */
export const sideCharacterTurn = pin(
	describeInput({
		id: 'core:input/side-character-turn@1',
		// Display only, both keys: stripped from the content hash, refreshed on
		// existing rows by the boot sync — so copyediting this is never a bump.
		i18n: {
			name: { en: 'Side character' },
			description: {
				en: 'A turn spoken by somebody who is not in the cast — pick a character, or type a name. They speak once; they do not join the rotation.',
			},
		},
		slots: {
			/**
			 * The input hook (18 §4a), on the same terms as `user-message@1`:
			 * user chains over the triggering text, phase `after` on what this
			 * node publishes, which is what retrieval and the prompt see.
			 *
			 * ⚠ `extras` is what makes this the **new-name hook**. The three
			 * names below are read-only context supplied by the host at the
			 * hook (18 §6a) and are part of the fixed choice set the script
			 * editor offers — so "this name is new" is a declared read rather
			 * than a name typed on faith. `speakerIsKnown` is `false` exactly
			 * when a free-form name matched nothing in the session's lorebook.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1'],
				port: 'text',
				phase: 'after',
				extras: ['speakerName', 'speakerCharacterId', 'speakerIsKnown', 'castNames'],
				description:
					'Scripts over the instructions this turn was triggered with, as retrieval and the prompt will see them. The speaker rides along read-only — including whether the lorebook already knows them, so a script can offer to add somebody new.',
			},
		},
		ports: {
			out: {
				main: S.json,
				text: S.text,
				sessionScope: S.sessionScope,
				sessionId: S.rowIds,
				/**
				 * The chosen character, or null for a free-form name.
				 *
				 * ⚠ It is **not** a turn slot. It reaches character lore's
				 * visibility rule (an entry bound to this character becomes
				 * readable for this turn) and the prompt's perspective, and
				 * nothing else — round-robin selection reads the session's
				 * cast and its messages, neither of which this touches.
				 */
				characterId: S.rowIds,
				/**
				 * The speaker as a whole fact: `{ name, characterId, known }`.
				 *
				 * A port rather than only an extra, because it is what the
				 * context builder is wired to and what the receipt records —
				 * "why did this turn sound like Vell" is answerable from the
				 * run afterwards rather than from the trigger that started it.
				 */
				speaker: S.json,
				/** Values for the genre's declared fields, filtered to the schema. */
				fields: S.json,
			},
		},
	}),
)

// ── Queries ─────────────────────────────────────────────────────────────────

export const sessionHistory = pin(
	describeQueryType({
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
			 * could is worse than the absence of the feature — the same
			 * judgement `variableLayouts.ts` records about a layout for
			 * `characterLore`.
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
					 */
					limit: {
						type: 'integer',
						default: 100,
						description: 'How many recent messages are considered for the context.',
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
					 * ⚠ `weight: 0.4` and `minInclude: 6` were here and are
					 * gone. Both were answers to "how does chat history fare
					 * against everything else", which is a question about the
					 * *ranking*, and a node that fetches rows cannot see
					 * everything else to answer it: the weight sat beside
					 * `rank`'s `share`, free to disagree with it, and the
					 * floor was the only one of five sources that had one.
					 * They are `share.messages` and `minEntries.messages` on
					 * `core:task/rank-hybrid@1` now, beside their peers.
					 */
					priority: {
						type: 'enum',
						of: ['low', 'normal', 'high', 'always'],
						default: 'normal',
						description:
							"How strongly history resists being trimmed — 'always' is never dropped.",
					},
				},
			},
		},
		ports: {
			in: { scope: S.sessionScope, budget: S.budget },
			out: { main: S.candidates, messages: S.candidates },
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
	i18n: { en: 'Relevance balance' },
	members: [
		{
			key: 'overlap',
			i18n: { en: 'Raw overlap' },
			description: {
				en: 'Every repeat of a word counts again, so a longer entry has more chances to score.',
			},
		},
		{
			key: 'balanced',
			i18n: { en: 'Length-aware' },
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
	i18n: { en: 'Match near-misses' },
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
	i18n: { en: 'Title counts extra' },
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
	i18n: { en: 'Messages that count as "now"' },
	description:
		'How much of the recent conversation counts as the current moment when judging relevance — which characters are present, and which words the scene is actually using. Separate from how far back a keyword may fire from.',
} as const

const ADMIT_THRESHOLD = {
	type: 'number' as const,
	default: 0,
	min: 0,
	max: 1,
	quick: true,
	i18n: { en: 'Find without keywords' },
	description: {
		en: 'How readily an entry is brought in on relevance alone when none of its keywords matched — the names the conversation is using, and the distinctive words it shares with the entry. 0 keeps keywords the only way in; try 0.3 to turn it on.',
	},
} as const

export const lorebookTriggers = pin(
	describeQueryType({
		id: 'core:query/lorebook-triggers@1',
		i18n: { name: { en: 'Lorebook triggers' } },
		timeoutMs: 2000,
		slots: {
			/**
			 * ⚠ No `template` slot, and there was one — a *source* template for
			 * "how one triggered entry is written into the context".
			 *
			 * Nothing read it and nothing seeded a row for it, so it rendered as
			 * an empty picker. The node that exists to do this job is
			 * `core:task/render-entries@1`, which keeps its own template slot
			 * and is where the feature should land when something binds it; two
			 * declarations of one idea, one of them inert, is how they drift.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
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
						i18n: { en: 'Messages scanned for keywords' },
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
						i18n: { en: 'Follow keyword chains this deep' },
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
			in: { text: S.text, scope: S.sessionScope },
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

/**
 * World lore and character lore, as two queries rather than one.
 *
 * `lorebook-triggers@1` returns both through a single port, so they share a
 * weight, a floor and a share of the window. They are not alike: character lore
 * is bound to whoever is speaking and world lore is not, and an install that
 * wants a lot of one and little of the other has no way to say so.
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

const loreSlots = (what: string) => ({
	params: {
		kind: 'parameters' as const,
		facet: 'weights' as const,
		schema: {
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
				i18n: { en: `Messages scanned for ${what} triggers` },
				description: `How many recent messages are scanned for ${what} triggers in the conversation. An entry is not reached through its links to other entries.`,
			},
			/**
			 * Beside `scanDepth` because the pair is only legible together:
			 * one is how far back a key may fire from, the other is how much
			 * conversation counts as the present moment. See
			 * `GUARANTEED_MESSAGES`.
			 */
			guaranteedMessages: GUARANTEED_MESSAGES,
			maxRecursionDepth: {
				type: 'integer' as const,
				default: 0,
				i18n: { en: 'Follow keyword chains this deep' },
				description:
					'A ceiling on how far entries may trigger further entries via keywords found in their text, however deep an individual entry asks to go. It never follows links between entries.',
			},
			/**
			 * On all three lanes rather than on one, because the question it
			 * answers is per-source: world lore without keys is the case this
			 * exists for, character lore is already narrowed to whoever is
			 * speaking, and dated history is the source most likely to want a
			 * stricter setting than the other two. One shared declaration, one
			 * row per lane — which is what `share`, `maxEntries` and the rest
			 * of the retrieval surface already do.
			 */
			admitThreshold: ADMIT_THRESHOLD,
			/**
			 * On all three lanes for `admitThreshold`'s reason, and with a
			 * per-source answer of its own in each case: world lore is where
			 * entry lengths differ most, character lore is already narrowed to
			 * whoever is speaking, and dated history has no title at all — so
			 * `titleWeight` is a control history renders and cannot move,
			 * which is the honest state rather than a fourth declaration.
			 */
			lexicalScoring: LEXICAL_SCORING,
			trigramFolding: TRIGRAM_FOLDING,
			titleWeight: TITLE_WEIGHT,
		},
	},
})

export const worldLore = pin(
	describeQueryType({
		id: 'core:query/world-lore@1',
		i18n: { name: { en: 'World lore' } },
		timeoutMs: 2000,
		/**
		 * A chat with no world lore is an ordinary chat, so nothing downstream
		 * needs this to have produced anything — which is also what makes it
		 * safe to switch off entirely. The template guards the block and the
		 * ranker simply has one fewer source.
		 */
		optional: true,
		slots: loreSlots('world lore'),
		ports: {
			in: { text: S.text, scope: S.sessionScope },
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

export const characterLore = pin(
	describeQueryType({
		id: 'core:query/character-lore@1',
		i18n: { name: { en: 'Character lore' } },
		timeoutMs: 2000,
		/** As `worldLore`: absent is a normal state, so off is a safe state. */
		optional: true,
		slots: loreSlots('character lore'),
		ports: {
			in: { text: S.text, scope: S.sessionScope },
			out: { main: S.candidates, hits: S.candidates },
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
 */
export const historyEntries = pin(
	describeQueryType({
		id: 'core:query/history-entries@1',
		i18n: { name: { en: 'History entries' } },
		timeoutMs: 2000,
		/** As the lore queries: a chat with no history is an ordinary chat. */
		optional: true,
		slots: loreSlots('history'),
		ports: {
			in: { text: S.text, scope: S.sessionScope },
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

/** Probability rolls come from the run seed, so they replay (13 §7i). */
export const lorebookProbabilistic = pin(
	describeQueryType({
		id: 'core:query/lorebook-probabilistic@1',
		timeoutMs: 2000,
		declaresRandomness: true,
		ports: {
			in: { text: S.text },
			out: { main: S.candidates, hits: S.candidates },
		},
	}),
)

export const vectorSearch = pin(
	describeQueryType({
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
					 * ⚠ **0 is off, and is the shipped default** — the
					 * convention `maxRecursionDepth`, `admitThreshold` and
					 * `entity-search`'s own caps use, for their reason: this
					 * changes what reaches the model, so it is turned on rather
					 * than arrived at on upgrade.
					 *
					 * A **cap on what this mechanism contributes**, not a cap on what
					 * it looks at — `topK` is that, one field down. The two are
					 * different questions and only this one decides whether the
					 * mechanism is running at all.
					 */
					maxEntries: {
						type: 'integer',
						default: 0,
						min: 0,
						quick: true,
						i18n: { en: 'Entries found by meaning' },
						description:
							'How many lorebook entries this may bring in for being about what the conversation is about, rather than for matching a keyword. Needs an embedding model; 0 turns the whole arm off, try 5. A pipeline that ranks this arm separately reads its per-query lists instead, which this does not cut.',
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
					 * `maxEntries` is what decides whether the mechanism runs at
					 * all.
					 */
					topK: {
						type: 'integer',
						default: 40,
						min: 1,
						i18n: { en: 'Closest matches per query' },
						description:
							'How many of the closest matches each retrieval query returns. A wider pool for the ranker to score, not a cap on what this arm contributes.',
					},
					/**
					 * How sharply a weak resemblance is discounted — and
					 * emphatically **not** a floor.
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
						i18n: { en: 'Discount weak matches' },
						description:
							'How sharply a loose resemblance counts for less than a close one. 1 takes the similarity as it comes; higher pushes vague matches down without ever removing them, so they can still be found by a keyword or a name.',
					},
				},
			},
		},
		ports: {
			in: {
				/** Several query vectors, one ranked list each. */
				vectors: S.vector,
				scope: S.sessionScope,
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
 *     reads only a bounded recent window and the semantic mechanism is not wired into
 *     the shipped pipeline, so retrieving an *older message* by what it was
 *     about has not been possible until now.
 *  3. **It needs no embedding model.** Names are matched, not encoded, so this
 *     is available on every install rather than only on the ones with a model
 *     loaded.
 *
 * It reads annotations written in the background, so it is cheap per turn: the
 * work of finding names in a lorebook happens when the lorebook is written, not
 * when a turn is taken.
 */
export const entitySearch = pin(
	describeQueryType({
		id: 'core:query/entity-search@1',
		i18n: { name: { en: 'Entity search' } },
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
					 * ⚠ **0 is off, and is the shipped default** — the
					 * convention `maxRecursionDepth` and `admitThreshold` use,
					 * and for the same reason: this changes what reaches the
					 * model, so it is turned on rather than arrived at on
					 * upgrade.
					 */
					maxEntries: {
						type: 'integer',
						default: 0,
						min: 0,
						quick: true,
						i18n: { en: 'Entries found by name' },
						description:
							'How many lorebook entries this may bring in because the conversation is naming the same people, places and things they do. 0 turns it off; try 5.',
					},
					/**
					 * Separate from `maxEntries`, because the two answer
					 * different questions and only one of them has somewhere to
					 * go today.
					 */
					maxMessages: {
						type: 'integer',
						default: 0,
						min: 0,
						i18n: { en: 'Earlier messages found by name' },
						description:
							'How many earlier messages this may return for naming what the scene is naming. The shipped pipelines do not place retrieved messages into the prompt yet — the conversation reaches the prompt as the verbatim recent window — so this returns them for a pipeline that wires them somewhere, and is off by default.',
					},
					scanDepth: {
						type: 'integer',
						default: 10,
						i18n: { en: 'Messages read for names' },
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
						i18n: { en: 'Strength' },
						description:
							'How much weight a shared name carries against the other ways an entry can be found. 0 leaves the arm finding things and ranking them last.',
					},
				},
			},
		},
		ports: {
			/**
			 * ⚠ **No `text` in-port, and the four lore queries have one.**
			 *
			 * Theirs is filled by nothing and read by nothing — `loreFor`
			 * derives its window from `scope` — and `wiring.test.ts` carries
			 * four standing excuses saying so. Those are legacy; this is a new
			 * declaration, and shipping a fifth port with the same excuse
			 * written for it would be adding the defect on purpose. The window
			 * comes from `scope`, which is where it actually comes from.
			 */
			in: { scope: S.sessionScope },
			out: {
				main: S.candidates,
				hits: S.candidates,
				/**
				 * Earlier messages, as candidates in the `messages` band.
				 *
				 * A port of its own rather than part of `main`, because the two
				 * are budgeted separately and a pipeline that wants lore found
				 * by name almost certainly does not want half its context
				 * window spent on retrieved transcript by accident.
				 */
				messages: S.candidates,
			},
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
 */
export const mentionSpans = pin(
	describeQueryType({
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
					 * ⚠ **0 is off, and is the shipped default** — the
					 * `maxRecursionDepth` / `admitThreshold` convention.
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
						default: 0,
						min: 0,
						quick: true,
						i18n: { en: 'Descriptions to follow up' },
						description:
							'How many descriptive references in the recent messages — "the captain", "the order" — are matched against what your entries are called, for entries no keyword reached. Needs an embedding model; 0 turns the whole arm off, try 4.',
					},
					scanDepth: {
						type: 'integer',
						default: 10,
						i18n: { en: 'Messages read for descriptions' },
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
 */
export const entityLink = pin(
	describeQueryType({
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
						i18n: { en: 'Most entries linked' },
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

export const personaCard = pin(
	describeQueryType({
		id: 'core:query/persona-card@1',
		timeoutMs: 1000,
		ports: {
			in: { characterId: S.json },
			out: { main: S.candidates, card: S.candidates },
		},
	}),
)

export const messageText = pin(
	describeQueryType({
		id: 'core:query/message-text@1',
		timeoutMs: 1000,
		ports: {
			in: { messageId: S.json },
			out: { main: S.text, plain: S.text },
		},
	}),
)

/** Illegal by construction elsewhere; used to prove the purity probe. */
export const network = pin(
	describeQueryType({
		id: 'test:query/network@1',
		timeoutMs: 1000,
		ports: { out: { main: S.json } },
	}),
)

// ── Tasks ───────────────────────────────────────────────────────────────────

export const contextBudget = pin(
	describeTaskType({
		id: 'core:task/context-budget@1',
		timeoutMs: 500,
		slots: {
			/**
			 * Where the window comes from.
			 *
			 * The context window belongs to the sampling config, never to a knob
			 * on a node (17 §1a) — and the executor resolves a `sampling` slot to
			 * the config's switched-on *values*, so this stays a pure Task reading
			 * data it was handed rather than a Query looking one up.
			 *
			 * ⚠ Point this at the same config the generating step uses. A budget
			 * computed against one window and a prompt sent against another is
			 * wrong in the direction that truncates, silently.
			 */
			sampling: { kind: 'sampling', quick: true },
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * ⚠ There is no `reserveForReply` here, and there was: an
					 * integer defaulting to 512, sitting beside the sampling
					 * config's own `responseTokens` that also defaults to 512. The same mistake as the ranker's `budget: 4096` —
					 * re-entering a number the system already knows, free to
					 * drift from the model actually being called and warning
					 * nobody when it did. Context in, response out: the reserve
					 * *is* the response allowance, so it is read, not typed.
					 */
					safetyMargin: {
						type: 'number',
						default: 0.05,
						description:
							'Fraction of the window kept free as a buffer against token-count drift.',
					},
				},
			},
		},
		ports: { out: { main: S.budget, available: S.budget } },
	}),
)

/**
 * Fuse two mechanisms that answered the same question into one ordering.
 *
 * Reciprocal-rank fusion, and it is only fusion when the inputs *overlap* —
 * the keyword mechanism and the vector mechanism ranking the same pool, so an entry both
 * found outranks one either found alone. Handed several **disjoint** lists it
 * degrades into concatenation with a fabricated score: every item is unique, so
 * its fused score collapses to its position in its own list, and the
 * `presetScore` stamped on the way out then overrides every signal weight
 * downstream. That is what `core:task/concat-candidates@1` is for, and the
 * binding says so on the receipt when it sees it.
 *
 * ⚠ This declared `strategy` (auto/vector/keyword/hybrid) and `dedup`, and the
 * binding read neither. `strategy` was the 0.5 engine choice, which pipelines
 * replaced with wiring — the mechanisms a run uses are the nodes it has — and `dedup`
 * described what rank fusion does unconditionally, since fusion is keyed by
 * `source:id`. Two controls that rendered, validated and stored a value nothing
 * would ever read; removed rather than wired, because there is no behaviour
 * behind either one to turn on.
 */
export const mergeCandidates = pin(
	describeTaskType({
		id: 'core:task/merge-candidates@1',
		timeoutMs: 500,
		ports: {
			in: { sources: S.candidates },
			out: {
				main: S.candidates,
				candidates: S.candidates,
				/** What fused with what — and a complaint when nothing did. */
				diagnostics: S.json,
			},
		},
	}),
)

/**
 * Put several candidate lists end to end, in the order they were wired.
 *
 * The counterpart to `core:task/merge-candidates@1`, and the distinction is not
 * cosmetic: **concatenation is not fusion**. Lore lanes are disjoint by
 * construction — a world-lore entry is never also a history entry — so there is
 * no agreement between them to measure and nothing to fuse. Passing them
 * through the merge stamped a reciprocal-rank `presetScore` on every candidate,
 * which `select` prefers over the weighted signal sum, so each entry was ranked
 * by its position in its own list and every signal weight was inert.
 *
 * This node deliberately stamps **no score at all**. Ranking is the ranker's
 * job: `core:task/rank-hybrid@1` scores each candidate from its signals against
 * its source's weights, and budgets across sources with the share bands — which
 * is what the bands are for. Order within a source is preserved so a producer's
 * own ordering survives to the tie-break.
 *
 * Repeats are dropped, first occurrence winning, keyed `source:id` the way
 * every other candidate set in the ranker is: the same entry arriving from two
 * lanes should occupy one slot, and the earlier lane is the one the author
 * wired first.
 */
export const concatCandidates = pin(
	describeTaskType({
		id: 'core:task/concat-candidates@1',
		i18n: { name: { en: 'Combine candidates' } },
		timeoutMs: 500,
		ports: {
			in: { sources: S.candidates },
			out: {
				main: S.candidates,
				candidates: S.candidates,
				/** How many arrived per list, and how many repeats were dropped. */
				diagnostics: S.json,
			},
		},
	}),
)

const rankPorts = {
	in: { candidates: S.candidates, budget: S.budget },
	out: {
		main: S.candidates,
		candidates: S.candidates,
		/**
		 * The per-candidate trail: score, included, reason, and the signal
		 * breakdown behind it.
		 *
		 * A declared out-port rather than an implementation detail, because it is
		 * what Assemble allocates from — and because a ranker swapped in by a
		 * plugin has to produce it too, or the budget panel goes blank the moment
		 * anyone changes rankers (16 §5c).
		 */
		decisions: S.json,
	},
}

/**
 * Shared by every ranker: the ceiling it is ranking against.
 *
 * The default matters more than it looks. Until the executor applied declared
 * defaults, a spec that did not override this got `undefined` — a budget of
 * zero, every block excluded, and a prompt rendered with its lore silently
 * missing and no error anywhere.
 */
/**
 * The five things a context is built from.
 *
 * Declared once and shared by every control that renders per source, so a
 * plugin adding a sixth gets a labelled, coloured band everywhere without
 * touching a screen. `weights.ts` calls this `RetrievalBand`, and the two must
 * agree — the binding maps straight onto it.
 */
const SOURCES = [
	{
		key: 'messages',
		i18n: { en: 'Conversation' },
		description: { en: 'The chat itself — what was actually said.' },
		tone: 0,
	},
	{
		key: 'worldLore',
		i18n: { en: 'World lore' },
		description: { en: 'Lorebook entries about the world.' },
		tone: 1,
	},
	{
		key: 'characterLore',
		i18n: { en: 'Character lore' },
		description: { en: 'Lorebook entries bound to a character.' },
		tone: 2,
	},
	{
		key: 'history',
		i18n: { en: 'History entries' },
		description: { en: 'Dated entries recording earlier events.' },
		tone: 3,
	},
	{
		key: 'relationships',
		i18n: { en: 'Relationships' },
		description: { en: 'The narrative graph. Off by default.' },
		tone: 4,
	},
] as const

/**
 * What the ranker is configured with.
 *
 * ⚠ This replaced a single `budget: integer` defaulting to 4096, and the change
 * is the point rather than a tidy-up. An absolute token count was wrong twice:
 * it re-entered a number the sampling config already carries, free to disagree
 * with the model actually being called; and it answered a question nobody asks.
 * Nobody wants to say "trim to 4096". They want to say "lore matters more than
 * old history in this chat, and never drop the last few messages".
 *
 * The available tokens now arrive on the `budget` in-port from
 * `core:task/context-budget@1`, which derives them from the window. What is
 * left here is the part that is genuinely a preference: how the context is
 * fought over once its size is known.
 *
 * `share` is normalised, so there is no invalid state — the total is always
 * 100%, dragging one band takes from the others and nowhere else, and zero is
 * a band's off switch. `DEFAULT_GROUPS` in `ranking/weights.ts` already
 * reproduces today's split exactly (0.5 to messages is `MESSAGE_FILL_FRACTION`),
 * so wiring this up is behaviour-preserving by construction.
 */
const rankSlots = {
	params: {
		kind: 'parameters' as const,
		facet: 'weights' as const,
		schema: {
			share: {
				type: 'share' as const,
				members: SOURCES,
				default: {
					messages: 0.5,
					worldLore: 0.1667,
					characterLore: 0.1667,
					history: 0.1666,
					relationships: 0,
				},
				i18n: { en: 'Context split' },
				description: {
					en: 'How the context is divided between sources. Set a band to zero to leave it out.',
				},
			},
			maxEntries: {
				type: 'perMember' as const,
				members: SOURCES,
				default: {
					messages: 50,
					worldLore: 20,
					characterLore: 15,
					history: 10,
					relationships: 0,
				},
				i18n: { en: 'Most entries per source' },
				description: {
					en: 'A ceiling on how many entries one source may contribute, whatever its share.',
				},
			},
			/**
			 * ⚠ Replaced `minMessageTokens: 512`, and the unit is the point.
			 *
			 * "Guaranteed conversation" asked for a token count, which is not
			 * a quantity anybody has an opinion about — 512 tokens is some
			 * number of messages that changes with how long the last few were,
			 * so the same setting produced a different amount of readable chat
			 * every turn. What a user means is *keep the last six messages*.
			 *
			 * Floors lose to the window. `select` fills them in score order and
			 * stops at the budget, because floors summing past the context is
			 * the one way this could build a prompt too big to send.
			 *
			 * ## ⚠ Conversation only, from R6 (retrieval plan §7)
			 *
			 * It used to be a floor **per source**, over the same five bands as
			 * `share` and `maxEntries`. R6 removes every floor except this one:
			 * *"per-source floors are removed everywhere except recent
			 * conversation, which keeps its guaranteed share. Lore competes on
			 * score alone."*
			 *
			 * Two reasons, and the second is the one that could not be worked
			 * around later. A floor is a promise to spend budget on a source
			 * **whether or not it scored**, so a lore floor is a standing
			 * instruction to include lore the ranker did not want — the exact
			 * thing score-led allocation exists to stop. And a floor is a
			 * *second way in*: R1's clairvoyance filter excludes an entry
			 * because the speaker does not know it, and a floor sitting
			 * underneath the ranker could quietly re-admit it. `select` already
			 * takes `ineligible` candidates out ahead of the floors and there
			 * is a test pinning that, but the durable answer is for the floor
			 * not to exist for lore at all.
			 *
			 * The conversation keeps its floor because it is not competing for
			 * relevance in the first place: the last few turns are what makes a
			 * reply a reply, and a window too small to hold them is a broken
			 * prompt rather than a differently-ranked one.
			 */
			minEntries: {
				type: 'perMember' as const,
				members: SOURCES.filter((s) => s.key === 'messages'),
				default: { messages: 6 },
				i18n: { en: 'Always keep at least' },
				description: {
					en: 'Recent messages kept whatever the split says, so a lore-heavy chat stays readable. Dropped when there is no room. Lore has no floor — it competes on score.',
				},
			},
		},
	},
}

/**
 * The signal weights, transposed for declaration.
 *
 * `weights.ts` holds these as `Record<RetrievalBand, SignalWeights>` — one
 * complete set per source, because scoring reads them that way. The slot
 * system's unit is the *field*, rendered as one per-source control row, so the
 * declaration is the transpose: one `perMember` field per signal, over the same
 * five sources every other ranking control uses. The binding transposes back.
 *
 * ⚠ **The set is not free-standing** — `runtime/signalWiring.test.ts` holds it
 * identical to `keyof SignalWeights` and to what the wired mechanisms actually
 * write, in both directions. Adding a field here without a producer fails, and
 * so does producing a signal without declaring it.
 *
 * Every default reproduces `DEFAULT_SIGNAL_WEIGHTS` exactly — which is what
 * makes declaring them behaviour-preserving. A zero is "does not apply today",
 * not "cannot apply": the scorer has no per-source branches, so turning
 * `nameMatch` on for messages is moving a slider, not asking for a feature.
 *
 * On `rank-hybrid` alone, like its `scripts` hook and for the same reason
 * (S3): `rank-by-recency` ranks without signals, and widening a sibling's
 * declared surface is a hash change on a type nobody meant to touch.
 */
const SIGNAL_WEIGHT_FIELDS = {
	signalKeyword: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.35,
			characterLore: 0.35,
			history: 0.35,
			relationships: 0,
		},
		i18n: { en: 'Keyword match' },
		description: {
			en: "How much an entry's own trigger keywords appearing in recent messages counts toward its score.",
		},
	},
	signalNameMatch: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.25,
			characterLore: 0.25,
			history: 0,
			relationships: 0,
		},
		i18n: { en: 'Name mentioned' },
		description: {
			en: "How much a cast member's name appearing in the entry counts when that character is in the scene.",
		},
	},
	/**
	 * Two questions under one name, split by source — bug 16, and it stays split.
	 *
	 * World lore and history ask *how much of what the scene is naming does this
	 * entry name too*; character lore asks *did this entry's own character speak
	 * in the guaranteed window*. A character-lore entry names its own character
	 * by construction, so the first question scores every present character's
	 * private lore alike and distinguishes nothing.
	 *
	 * ⚠ **The world-lore half is graded now, and this weight moved with it**
	 * (design §13.10, retrieval plan phase 3). It used to be a binary substring
	 * test — does the entry's title or keys contain a cast name, `Al` firing on
	 * `Alchemy` — worth exactly `{0, 0.2}`. It is now the rarity-weighted,
	 * word-boundary, two-sided overlap the admission gate already used: what the
	 * conversation named, intersected with what this entry names, weighted so
	 * that a thing every entry mentions counts for nothing.
	 *
	 * That measure **saturates**: about 0.63 for one rare shared entity and 0.86
	 * for two, so at the old 0.2 its live range would have been ~[0.13, 0.17] —
	 * *narrower* than the crude signal it replaces. Grading without re-weighting
	 * makes a signal more correct and less influential at the same time, so the
	 * weight is sized for the measure that is actually running: 0.35, the same
	 * anchor `entity-search`'s own strength uses, which keeps one strongly
	 * shared name worth a little less than an entry whose every key fired.
	 *
	 * Character lore keeps **0.2**. Its measurement did not change, so its
	 * weight must not either.
	 */
	signalEntityCooccurrence: {
		type: 'perMember' as const,
		members: SOURCES,
		default: { messages: 0, worldLore: 0.35, characterLore: 0.2, history: 0, relationships: 0 },
		i18n: { en: 'Shared entities' },
		description: {
			en: 'How much an entry naming the same people and places as the recent conversation counts. For character lore it asks something else: whether that character has been speaking.',
		},
	},
	/**
	 * How much *being about the same thing* counts, as an embedding measures it.
	 *
	 * The fourth mechanism and the only one that needs a model. It arrives on
	 * candidates the semantic mechanism found — `core:query/vector-search@1`, wired
	 * into the reply pipeline as a sibling of the lore lanes — and it is a
	 * **score component**, not a rival ordering: an entry both the keyword scan
	 * and the semantic mechanism found keeps its keyword signals and gains this one,
	 * so agreement between two independent mechanisms compounds by addition and
	 * there is no fusion step to reconcile two incomparable scales.
	 *
	 * ⚠ **Not zero, and that is deliberate.** The `admitThreshold` convention
	 * says a control that changes what reaches the model ships off — and it does
	 * here, one level up: the mechanism's own cap (`vector-search.maxEntries`) is 0, so
	 * nothing carries this signal until somebody raises it. Making *both* the cap
	 * and the weight zero would mean raising the cap changed nothing, which is
	 * the trap a two-switch feature always sets. One switch, and it is the one
	 * named after what it does.
	 *
	 * Sized below a keyword hit on purpose. A cosine above the mechanism's own
	 * threshold is real evidence and weaker evidence than an authored key
	 * firing: keys still guarantee, meaning still only adds.
	 */
	signalSemantic: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.3,
			characterLore: 0.3,
			history: 0.3,
			relationships: 0,
		},
		i18n: { en: 'Similar meaning' },
		description: {
			en: 'How much it counts that an entry is about what the conversation is about, even with no shared words. Needs an embedding model and the semantic arm switched on.',
		},
	},
	/**
	 * How much *being called that* counts, as an embedding measures it.
	 *
	 * The fifth mechanism, and the one that catches the reference nothing else
	 * can. It arrives on candidates `core:query/entity-link@1` matched a
	 * **description** in the conversation to one of an entry's **names** —
	 * *"the captain"* → Captain Vell, *"the order"* → The Ashguard Riders.
	 * Neither reference shares a character with its target, so keywords,
	 * trigrams and the gazetteer all miss them.
	 *
	 * ⚠ **Sized to sit strictly below `signalNameMatch`, and that is a rule.**
	 * Invented proper nouns are where embeddings are least reliable — "Vell"
	 * has no learned meaning, so its vector comes from subword fragments and
	 * Vell, Vall and Vela cluster — so exact and trigram matching own invented
	 * names, entity vectors own descriptive references, and a vector link must
	 * never outrank an entry whose title literally occurred. A similarity
	 * cannot exceed 1, so 0.2 against `signalNameMatch`'s 0.25 keeps that true
	 * at every value the mechanism can produce.
	 *
	 * Not zero, for `signalSemantic`'s reason one field up: the mechanism's switch is
	 * `mention-spans.maxMentions` and it is 0, so nothing carries this signal
	 * until somebody raises it. One switch, not two.
	 */
	signalEntityVector: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.2,
			characterLore: 0.2,
			history: 0.2,
			relationships: 0,
		},
		i18n: { en: 'Called by a description' },
		description: {
			en: 'How much it counts that the conversation described something — "the captain", "the order" — that matches what an entry is called. Needs an embedding model and the description arm switched on. Deliberately weaker than an entry whose name was actually said.',
		},
	},
	signalTfidf: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0.1,
			worldLore: 0.1,
			characterLore: 0.1,
			history: 0.1,
			relationships: 0,
		},
		i18n: { en: 'Distinctive words' },
		description: {
			en: 'How much rare, distinctive vocabulary shared with the conversation counts — common words prove little.',
		},
	},
	signalLastRefRecency: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.1,
			characterLore: 0.1,
			history: 0.1,
			relationships: 0,
		},
		i18n: { en: 'Recently referenced' },
		description: {
			en: 'How much an entry the conversation touched a moment ago outranks one it has not mentioned in a while.',
		},
	},
	/**
	 * ⚠ **`signalRecency` and `signalSceneAffinity` were declared here and are
	 * gone (migration 0099).** Neither had a producer — anywhere, ever. No
	 * mechanism wrote `signals.recency` and none wrote `signals.sceneAffinity`,
	 * so both weights multiplied a permanent zero: two controls that rendered,
	 * validated, saved, resolved through the whole scope chain, and could not
	 * move a single prompt at any value on any install.
	 *
	 * They are removed rather than wired because each needs a *design decision*
	 * this change is not entitled to make, and both are the kind that is
	 * cheaper to get right later than to guess at now:
	 *
	 *   · **Recency** carried `history: 0.2`, on a band that really is
	 *     populated, so building a producer for it would reorder every install's
	 *     history entries — and the number it would rank on is genuinely
	 *     ambiguous. A dated entry has an *in-world* date and an *authored*
	 *     order, they disagree constantly (a flashback is old and new at once),
	 *     and picking one silently is a worse answer than picking neither.
	 *   · **Scene affinity** has no fact to read. `scenes` and
	 *     `lorebook_bindings.scene_id` exist in the schema, but nothing in
	 *     retrieval knows which scene a session is *in*, so the producer is a
	 *     feature and not a wiring job.
	 *
	 * Both are welcome back the day something produces them — as a new field
	 * beside its producer, which is the order that keeps this from happening a
	 * third time. `runtime/signalWiring.test.ts` is what enforces that: a signal
	 * declared here and producible by nothing fails, and so does the reverse.
	 *
	 * `signalDensity` survives the same audit for the opposite reason — it now
	 * has one. `densitySignal` had existed in `ranking/signals.ts` with no
	 * caller for as long as this weight had existed with no producer; the scan
	 * writes it on every candidate now, exactly as it writes `proximity`.
	 */
	signalDensity: {
		type: 'perMember' as const,
		members: SOURCES,
		/**
		 * ⚠ **Unmoved, and the lore bands' 0 is what makes wiring it safe.**
		 *
		 * `signalProximity`'s case exactly: the number falls out of the key walk
		 * that was already happening, so the only thing this weight decides is
		 * whether it counts — and turning it on reorders lore in an upgraded
		 * install that never asked. Every lore band therefore stays at 0 and the
		 * scan simply starts *reporting* the number, where a reader can see its
		 * value before deciding to weight it.
		 *
		 * `messages: 0.1` is left exactly as it was rather than tidied to 0.
		 * That band is not populated on the shipped path (the entity
		 * mechanism's `messages` out-port is deliberately unwired) and nothing
		 * writes `density` on a message candidate even when it is, so the number
		 * is inert either way — and moving a default that cannot change an
		 * outcome is a re-tune with no reason attached.
		 */
		default: { messages: 0.1, worldLore: 0, characterLore: 0, history: 0, relationships: 0 },
		i18n: { en: 'Length against the pool' },
		description: {
			en: 'How much a longer-than-average entry outranks a short one. Length is a proxy for how much an entry has to say; raise it when your book mixes one-line stubs with real articles.',
		},
	},
	/**
	 * How tightly an entry's matched keys clustered in the window.
	 *
	 * Two keys matching adjacent is stronger evidence than the same two
	 * matching twenty words apart: "the Ashguard rode" is about the Ashguard
	 * riding, and the same two words either side of a paragraph break are two
	 * unrelated sentences. `signalKeyword` cannot tell those apart — it counts
	 * *how many* of an entry's keys matched and never *where* — so this is the
	 * distinction that signal is missing rather than a second reading of it.
	 *
	 * ⚠ **0 everywhere, which is the one default it can have.** The number is
	 * computed on every scan (it falls out of the key walk that was already
	 * happening), so the only thing this weight decides is whether it counts —
	 * and turning it on reorders lore in an upgraded install that never asked.
	 * Same convention as `admitThreshold` and `scoreLedAllocation`.
	 */
	signalProximity: {
		type: 'perMember' as const,
		members: SOURCES,
		default: { messages: 0, worldLore: 0, characterLore: 0, history: 0, relationships: 0 },
		i18n: { en: 'Keywords close together' },
		description: {
			en: "How much it counts that an entry's keywords appeared near each other rather than scattered across the window.",
		},
	},
	signalPriorityBonus: {
		type: 'perMember' as const,
		members: SOURCES,
		default: {
			messages: 0,
			worldLore: 0.15,
			characterLore: 0.15,
			history: 0,
			relationships: 0,
		},
		i18n: { en: 'Author priority' },
		description: {
			en: "Score added per step of an entry's own priority setting — the author's thumb on the scale.",
		},
	},
} as const

/**
 * How much each way of *finding* an entry counts (retrieval plan §1, phase 3).
 *
 * The signal weights above are the right data at the wrong altitude.
 * Nobody thinks in "tf-idf", and a reader who wants less guessing and more
 * literal matching has to know which of them to move and in which
 * direction. These three sit over them and group them by the **mechanism** that
 * produced the evidence:
 *
 * | Bar | Scales | Asks |
 * |---|---|---|
 * | Keyword | `signalKeyword`, `signalTfidf`, `signalProximity` | "these words appeared" |
 * | Semantic | `signalSemantic` | "this is about that" |
 * | Name | `signalNameMatch`, `signalEntityCooccurrence`, `signalEntityVector` | "this is called that" |
 *
 * The three that are left — last-referred, density and the author's priority
 * bonus — are **structural**, not mechanisms. They answer
 * *"does this matter now"* rather than *"did we find it"*, and scaling them by a
 * retrieval mechanism would be a category error: an entry does not stop being
 * long, or stop having come up a moment ago, because a reader turned keyword
 * matching down.
 *
 * ⚠ **This is not the source split, and the two are on screen together.** The
 * `share` bar above divides the *budget* between world lore, character lore and
 * conversation — turning one up takes tokens from the others. These decide how
 * much each retrieval *method* contributes to one entry's score — turning one up
 * takes nothing from anything, and every bar may be 1 at once. Different axes,
 * different questions, which is why they are different control types rather than
 * one type with a flag (`FieldType.strengths` in the SDK carries that argument).
 *
 * **1 is neutral, not maximum**, and all three ship at 1: multiplying by one is
 * arithmetically what already happens, so an upgraded install scores exactly what
 * it scored before. 0 switches a whole mechanism off, which is the readable way
 * to say "keys only" or "stop guessing" — and is a thing to want.
 *
 * On `rank-hybrid` alone, like the signal matrix and `scoreLedAllocation` and for
 * the same reason (S3): `rank-by-recency` does not score with signals, and
 * widening a sibling's declared surface is a hash change on a type nobody meant
 * to touch.
 */
const MECHANISM_WEIGHTS = {
	type: 'strengths' as const,
	min: 0,
	max: 1,
	quick: true,
	members: [
		{
			key: 'keyword',
			i18n: { en: 'Keywords' },
			description: {
				en: "The author's own trigger words, how distinctive the shared vocabulary is, and how closely the matches clustered.",
			},
			tone: 1,
		},
		{
			key: 'semantic',
			i18n: { en: 'Meaning' },
			description: {
				en: 'Similarity of meaning, with no shared words required. Needs an embedding model and the semantic arm switched on.',
			},
			tone: 3,
		},
		{
			key: 'name',
			i18n: { en: 'Names' },
			description: {
				en: 'An entry called by its own name, and entries naming the same people and places as the scene.',
			},
			tone: 2,
		},
	],
	default: { keyword: 1, semantic: 1, name: 1 },
	i18n: { en: 'How entries are found' },
	description: {
		en: 'How much each way of finding an entry counts toward its score. Turning one up takes nothing from the others — this is not the context split.',
	},
} as const

/**
 * Which allocation precedence the selection runs under (design §7).
 *
 * Off is what ships, and off is the shipped engine exactly: the shares split
 * the window into fixed bands and each source fills its own. A turn that needs
 * no history still reserves history's band, and one relevant world-lore entry
 * larger than a sixth of the window cannot be kept however it scored — which is
 * the thing design §7 calls backwards.
 *
 * On, the precedence inverts to *score allocates, floors guarantee, shares
 * cap*: the floors are met first exactly as before, then one pool is spent
 * strictly best-first across every source with each band a ceiling on what one
 * source may take out of it, and the sweep still hands out whatever no source
 * could use. Everything a user can read a promise about is unchanged either
 * way — pins come first and do not consume the entry cap, a band set to zero
 * leaves that source out, floors are met before any share is worked out, and
 * ties break on score then authored position.
 *
 * **A declared parameter rather than a call option, and that is the whole
 * reason this exists.** `SelectOptions.scoreLedAllocation` has been built and
 * tested since the inversion was written, and `core:task/rank-hybrid@1` is the
 * only runtime `select()` call there is — so with nowhere for a user to say
 * so, every shipped run took the share-first branch and the option was
 * reachable only from a unit test. This is the somewhere.
 *
 * **False is the shipped default**, the `maxRecursionDepth` / `admitThreshold`
 * convention and for their reason: it changes what reaches the model, so it is
 * a thing somebody turns on rather than a thing that happens to them on
 * upgrade. An upgraded install selects exactly what it selected before, which
 * is what leaves the parity corpus measuring the shipped path.
 *
 * On `rank-hybrid` alone, like the signal matrix and the `scripts` hook and for
 * the same reason (S3): `rank-by-recency` does not run this selection, and
 * widening a sibling's declared surface is a hash change on a type nobody meant
 * to touch.
 */
const SCORE_LED_ALLOCATION = {
	type: 'boolean' as const,
	default: false,
	i18n: { en: 'Let the best entries lead' },
	description: {
		en: 'Spend the whole context on whatever scored highest, wherever it came from, and treat each band as a ceiling rather than a reserved slice. Off divides the context into bands first and fills each one separately, which is how it has always worked.',
	},
} as const

export const rankHybrid = pin(
	describeTaskType({
		id: 'core:task/rank-hybrid@1',
		timeoutMs: 500,
		slots: {
			...rankSlots,
			params: {
				...rankSlots.params,
				schema: {
					...rankSlots.params.schema,
					// Ahead of the nine, because it is the altitude a reader
					// starts at: the grouped mechanisms first, the individual
					// signals under them for anyone who wants that far in.
					mechanismWeights: MECHANISM_WEIGHTS,
					...SIGNAL_WEIGHT_FIELDS,
					scoreLedAllocation: SCORE_LED_ALLOCATION,
				},
			},
			/**
			 * The post-retrieval hook (18 §4a): user chains over the candidate
			 * pool before ranking sees it. Spread onto this type alone rather
			 * than into `rankSlots` — widening a sibling's accepted set is a
			 * hash change on a type nobody meant to touch (S3).
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:candidates/filter@1', 'core:script:candidates/rescore@1'],
				port: 'candidates',
				phase: 'before',
				description:
					'Scripts that drop or rescore retrieved entries before the ranker orders them. Dropping excludes with a reason; rescoring changes the order.',
			},
		},
		ports: {
			in: rankPorts.in,
			out: {
				...rankPorts.out,
				/**
				 * What each band was allotted, what it spent, and how many
				 * entries it got there (D-H).
				 *
				 * ⚠ **Published by the binding since it was written, declared
				 * by nobody.** `select()` returns this beside the decisions and
				 * the binding has always returned it on this key — but an
				 * undeclared out-port is invisible: nothing downstream could
				 * learn it existed, `validate.ts` skipped the edge, and
				 * `core:task/assemble@2` ran its allocation on empty defaults
				 * while the numbers sat one node upstream.
				 *
				 * Spread onto this type alone rather than into `rankPorts` —
				 * the same reason the `scripts` hook above is, one construct up
				 * (S3). `rank-by-recency` and the `rank-recall` example compute
				 * no per-band usage; giving them a port they cannot fill would
				 * move two hashes to declare a promise neither keeps.
				 *
				 * `json` rather than a shape of its own. It is
				 * `Record<band, {allocated, used, entries}>` and the band
				 * vocabulary is the ranker's `SOURCES` list, which a plugin may
				 * extend — a shape id pinned here would freeze the very list
				 * that is meant to grow.
				 */
				groups: S.json,
			},
		},
	}),
)
export const rankByRecency = pin(
	describeTaskType({
		id: 'core:task/rank-by-recency@1',
		timeoutMs: 500,
		slots: rankSlots,
		ports: rankPorts,
	}),
)
/**
 * The two retrieval query windows, as text.
 *
 * A Task because *how a message is written when it is a query* is a decision —
 * speaker attribution in brackets, emphasis stripped — and a different
 * embedding model might want a different shape. It is also where the two
 * windows are cut, which is the parameter a user with long posts will reach for
 * first.
 */
export const queryWindows = pin(
	describeTaskType({
		id: 'core:task/query-windows@1',
		i18n: { name: { en: 'Retrieval queries' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					currentWindow: {
						type: 'integer',
						default: 2,
						description:
							"How many of the latest messages form the 'current' retrieval query.",
					},
					recentWindow: {
						type: 'integer',
						default: 3,
						description:
							"How many messages before those form the wider 'recent' retrieval query.",
					},
				},
			},
		},
		ports: {
			in: { messages: S.messages, cast: S.sessionCast },
			out: { main: S.json, current: S.json, recent: S.json },
		},
	}),
)

/**
 * The semantic mechanism's ranking, as a Task.
 *
 * Nine stages the legacy engine runs inline: fuse the per-query lists, normalise
 * to the top, boost recency and author priority, cut on an adaptive threshold,
 * diversify with MMR, and cap each source. Every constant behind them is a
 * parameter here — one of them carries a `TODO: make configurable` in the
 * original.
 *
 * A Task rather than part of the vector Query because **it is policy**: which of
 * these stages run, and how hard, is exactly what an installation should be able
 * to replace. The Query retrieves and computes similarity; this decides.
 *
 * `similarity` is a port because MMR needs to compare candidates to each other
 * and a Task cannot ask the host for anything (F11). It is a matrix of cosines,
 * not the embeddings — derived, bounded, and not reversible into the vectors.
 */
export const rankSemantic = pin(
	describeTaskType({
		id: 'core:task/rank-semantic@1',
		i18n: { name: { en: 'Rank semantic results' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					currentWindow: {
						type: 'integer',
						default: 2,
						description:
							"How many of the latest messages form the 'current' retrieval query.",
					},
					recentWindow: {
						type: 'integer',
						default: 3,
						description:
							"How many messages before those form the wider 'recent' retrieval query.",
					},
					rrfK: {
						type: 'integer',
						default: 60,
						description:
							'Rank-fusion constant — higher values flatten the difference between ranks.',
					},
					recencyBoost: {
						type: 'number',
						default: 0.15,
						description: 'Extra score given to recent entries.',
					},
					recencyDecay: {
						type: 'number',
						default: 0.01,
						description: 'How quickly the recency boost fades per message of age.',
					},
					thresholdMin: {
						type: 'number',
						default: 0.3,
						description: 'Minimum similarity a match needs to be considered at all.',
					},
					relativeThreshold: {
						type: 'number',
						default: 0.7,
						description: 'Drop matches scoring below this fraction of the best match.',
					},
					mmrLambda: {
						type: 'number',
						default: 0.7,
						description:
							'Balance between relevance and variety — 1 is pure relevance, 0 maximum variety.',
					},
					/**
					 * ⚠ Not the five `SOURCES` the budget split uses. These are
					 * the semantic mechanism's own record kinds — what a stored vector
					 * *is* — and `historyEntry` vs `history` is a real
					 * difference, not a spelling. Mapping one vocabulary onto
					 * the other here would quietly rename keys the ranker
					 * matches literally (`weights.ts DEFAULT_SEMANTIC`).
					 */
					sourceBudget: {
						type: 'perMember',
						members: [
							{
								key: 'message',
								i18n: { en: 'Messages' },
								description: { en: 'Chat messages found by meaning.' },
								tone: 0,
							},
							{
								key: 'worldLore',
								i18n: { en: 'World lore' },
								description: { en: 'Lorebook entries about the world.' },
								tone: 1,
							},
							{
								key: 'characterLore',
								i18n: { en: 'Character lore' },
								description: { en: 'Lorebook entries bound to a character.' },
								tone: 2,
							},
							{
								key: 'historyEntry',
								i18n: { en: 'History entries' },
								description: { en: 'Dated entries recording earlier events.' },
								tone: 3,
							},
							{
								key: 'narrativeRelationship',
								i18n: { en: 'Relationships' },
								description: { en: 'The narrative graph. Off by default.' },
								tone: 4,
							},
						],
						default: {
							message: 12,
							worldLore: 8,
							characterLore: 6,
							historyEntry: 6,
							narrativeRelationship: 5,
						},
						i18n: { en: 'Most matches per kind' },
						description: {
							en: 'A ceiling on how many semantic matches of each kind survive fusion, before the budget ranker sees them.',
						},
					},
					defaultSourceBudget: {
						type: 'integer',
						default: 20,
						description:
							'The ceiling for any match kind not named above — what a plugin-added source gets until it declares its own.',
					},
				},
			},
		},
		ports: {
			in: {
				/**
				 * One entry per query window, each carrying its own per-message
				 * ranked lists and its own similarity matrix. The whole stack
				 * runs per window; the results are concatenated, not fused.
				 */
				windows: S.json,
				messages: S.messages,
			},
			out: {
				main: S.candidates,
				candidates: S.candidates,
				diagnostics: S.json,
			},
		},
	}),
)

/**
 * A plugin's ranker — same kind, same shape, so the swap list offers it (16 §5c).
 *
 * Named `rankRecall`, not `rankSemantic`: binding names derive from the id's
 * name segment and ignore the namespace, so this and `core:task/rank-semantic@1`
 * would both want to be `rankSemantic` and generation would emit one export
 * twice. `checkUnique` now catches that; the id changed here because a plugin
 * naming its ranker after its own product is the better name anyway.
 */
export const rankRecall = pin(
	describeTaskType({
		id: 'chariot.recall:rank-recall@1',
		timeoutMs: 500,
		public: true,
		ports: rankPorts,
	}),
)

export const renderEntries = pin(
	describeTaskType({
		id: 'core:task/render-entries@1',
		timeoutMs: 500,
		slots: {
			// A *source* template: it renders one entry, so its scope is the
			// item's shape — which lives inside the port's payload, not on the
			// port (16 §4 correction). The declaration moved here from
			// `lorebook-triggers`, which declared the same scope on a slot
			// nothing read; this is the node whose whole job is the rendering.
			template: {
				kind: 'template',
				engine: jinja2.id,
				facet: 'templates',
				variables: {
					entry: {
						type: 'object',
						fields: {
							title: { type: 'string', description: { en: "The entry's name." } },
							content: { type: 'string', description: { en: 'The text itself.' } },
							keys: {
								type: 'list',
								of: { type: 'string' },
								optional: true,
								description: { en: 'The keywords that triggered it.' },
							},
						},
					},
				},
				description:
					'How a retrieved entry is written into the context. Leave empty to use the built-in wording.',
			},
		},
		ports: {
			in: { entries: S.candidates },
			out: { main: S.renderedBlocks },
		},
	}),
)

export const assemble = pin(
	describeTaskType({
		id: 'core:task/assemble@2',
		timeoutMs: 1000,
		slots: {
			// An *assembly* template: its scope really is the input ports, so this half of
			// 16 §4's claim holds.
			template: {
				kind: 'template',
				// Handlebars FIRST, then Liquid: the first entry is what a new
				// template here is written in, and every shipped row holds
				// Handlebars — so the order is what keeps the parity corpus
				// byte-identical. Both are accepted because a story string is a
				// layout, not a dialect: the same arrangement is expressible in
				// either, and a slot naming one makes the other unselectable
				// everywhere. Jinja is absent because core renders neither
				// parity nor helpers for it (12 §2a).
				engines: [handlebars.id, liquid.id],
				facet: 'templates',
				variables: {
					blocks: 'any',
					budget: ['total', 'remaining'],
					prompts: ['system', 'postHistory'],
				},
				description:
					'The story string: the overall layout of the finished prompt — where the character cards, lore, history and instructions sit. Leave empty to use the built-in layout.',
			},
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: {
					system: { type: 'text' },
					postHistory: { type: 'text' },
				},
			},
			/**
			 * How the values Assemble itself produces are laid out.
			 *
			 * These three exist here rather than upstream because they come out
			 * the other side of the budget: what a layout receives is what
			 * actually fit, which no earlier node knows.
			 *
			 * `characterLore` is deliberately absent. It is a top-level value on
			 * the assembly context that no template renders — qualifying entries
			 * are folded into their bound character inside `characters`, under
			 * an `"extra lore"` key. A layout for it would be a setting that
			 * changes nothing.
			 */
			variables: {
				kind: 'variables',
				facet: 'variables',
				description:
					'How the retrieved lore and history are laid out — JSON, prose, or whatever you write. Duplicate one to change it.',
				renders: {
					worldLore: 'core:var/world-lore@1',
					history: 'core:var/history@1',
					currentDate: 'core:var/current-date@1',
				},
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ No `budget` here either. It was an integer defaulting to
					 * 4096 — the same re-entered number the ranker carried, with
					 * the same defect: an absolute count on a node cannot know
					 * which model the prompt is about to be sent to, so it was
					 * free to disagree with the window and warn nobody. The
					 * total now arrives on the `budget` in-port from
					 * `core:task/context-budget@1`, which derives it from the
					 * sampling config the reply is generated against.
					 */
					/**
					 * Where the post-history reminder goes, and whether it goes
					 * at all.
					 *
					 * Numbers, so they are parameters rather than prompt text —
					 * a `prompts` slot carries authored strings and typing a
					 * count as one would be the wrong shape wearing a
					 * convenient home. The trigger is a **suppression**: below
					 * it a short chat gets no reminder, because a reinforcement
					 * note two messages after the system prompt is noise.
					 */
					postHistoryDepth: {
						type: 'integer',
						default: 0,
						description:
							'Place the post-history reminder this many messages before the end. 0 puts it last.',
					},
					postHistoryTokenTrigger: {
						type: 'integer',
						default: 0,
						description:
							'Only add the reminder once the chat is at least this many tokens long. 0 always adds it.',
					},
					truncation: {
						type: 'enum',
						of: ['oldest-first', 'lowest-weight'],
						default: 'oldest-first',
						description: 'What gets dropped first when the context is over budget.',
					},
					/**
					 * Which sections the prompt is built from, and in what order —
					 * SillyTavern's *prompt list*, as a param on the node that
					 * assembles the prompt (ruling 2026-09-10).
					 *
					 * A param and not a session setting, and not a table: it is the
					 * same kind of fact as "which prompt does this step use", so it
					 * belongs in the configuration a preset selects and it is an
					 * administrator's. A preset carries it to every session started
					 * from it for free, because a preset's configuration is already
					 * what a run resolves against.
					 *
					 * ⚠ **The declared default means "leave the template alone".** It
					 * is the shipped template's own order, so a configuration nobody
					 * has touched stores nothing and renders the bytes it always did —
					 * and a template somebody WROTE, whose sections sit in an order
					 * they chose, is not silently reordered into this one. See
					 * `isShippedPromptBlocks`.
					 */
					blocks: PROMPT_BLOCKS_DECL,
				},
			},
			/**
			 * Which connection this prompt is being written FOR.
			 *
			 * Not compute, and this node calls nothing: the only thing read out
			 * of it is `metadata.promptFormat` — whether the finished prompt is
			 * one instruct-wrapped string or a role-tagged array, and which
			 * wrapper. A wire format is a property of the endpoint, and until
			 * this slot existed there was no way for the node that renders the
			 * prompt to learn it. `renderers.ts` fell back to Vicuna on every
			 * run, so a ChatML or Llama-2 connection was sent Vicuna markers and
			 * nothing anywhere said so.
			 *
			 * ## Wire it to the SENDING node, always
			 *
			 * `slot.connectionOf('generate')`, exactly as `contextBudget` shares
			 * the sampling reference, and for the same reason stated there: a
			 * prompt wrapped for one endpoint and sent to another is wrong
			 * silently. Sharing the reference makes the two impossible to point
			 * apart rather than documenting that they must agree and hoping.
			 *
			 * ## No `requires`
			 *
			 * The sibling connection slots declare one because they are about to
			 * CALL the connection and an unmet capability should refuse at bind.
			 * This one reads a label. Declaring a capability it never exercises
			 * would let an untested connection grey itself out of a picker for a
			 * node that was never going to send it anything.
			 */
			connection: {
				kind: 'connection',
				shape: S.textGen,
				description:
					'Which connection this prompt is formatted for. Point it at the step that sends the reply — a prompt wrapped for one endpoint and sent to another is wrong in a way nothing reports.',
			},
		},
		ports: {
			in: {
				candidates: S.candidates,
				budget: S.budget,
				templateContext: S.templateContext,
				/**
				 * The ranker's per-candidate trail — score, verdict, reason.
				 *
				 * ⚠ **Supplied since the node was written, declared only now.**
				 * All three shipped specs wire `decisions: $.rank.decisions`,
				 * and the binding halts without them ("wire a ranker between
				 * retrieval and assembly"), so this is not a new input — it is
				 * the load-bearing one. What was missing was the declaration,
				 * and the cost of that is exact: `validate.ts` skips its shape
				 * check when either side is undeclared (`if (!outShape ||
				 * !inShape) continue`), so a plugin ranker publishing the wrong
				 * shape on this edge got no finding, and a plugin ASSEMBLER had
				 * nothing to read to learn the port existed.
				 *
				 * `json`, matching `rankPorts.out.decisions` — a decision is a
				 * candidate with its arithmetic attached, and the panel reads
				 * the same objects the allocator does.
				 */
				decisions: S.json,
				/**
				 * The finished chat lines, from `core:task/process-messages@1`.
				 *
				 * Wired by all three specs (`messages: $.lines.messages`) and
				 * undeclared for the same stretch as `decisions`. Two readers
				 * depend on it and neither is optional: the transcript the
				 * template renders, and the depth the post-history reminder is
				 * placed at — which is computed against *these* lines because
				 * the context builder ships a placeholder index, the final
				 * array not existing when it runs.
				 */
				messages: S.messages,
				/**
				 * Per band: allocated, used, entries — the arithmetic the
				 * ranker did while deciding (D-H).
				 *
				 * ⚠ **The one genuinely new edge in this set.** The two
				 * above were supplied and undeclared; this was PUBLISHED by
				 * `core:task/rank-hybrid@1` and wired by nobody, so `allocate`
				 * fell to its own `{}` and the per-band numbers the ranker had
				 * already computed were dropped on the floor between two
				 * adjacent nodes.
				 *
				 * What it does NOT touch is the prompt: `allocate` puts this
				 * straight onto `AllocatedContext.groups` and reads it nowhere
				 * else, so `blocks`, `totalTokens` and `budget` — everything
				 * the render sees — are byte-identical with it wired or not.
				 * What changes is the receipt: `dispatch.ts` publishes
				 * `payload.groups` as the run's `sources`, which is the budget
				 * panel's whole data set and has been empty on every run.
				 *
				 * Undeclared on purpose for the other rankers. A ranker that
				 * computes no per-band usage leaves this unwired and
				 * `allocate` takes the branch it has always taken.
				 */
				groups: S.json,
			},
			out: { main: S.assembled, context: S.assembled },
		},
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
 */
export const sessionCast = pin(
	describeQueryType({
		id: 'core:query/session-cast@1',
		i18n: { name: { en: 'Session cast' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.sessionCast, cast: S.sessionCast },
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
				 *
				 * `drizzle/0111` deletes the stored `12` that `reconcileConfigs`
				 * back-filled from the old declaration; without it, wiring the
				 * slot would cap every upgraded install at 12 as a side effect.
				 */
				min: 0,
				quick: true,
				i18n: { en: 'Most relationships' },
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

/** How the speaking character regards everyone else. */
export const relationshipsPerspectives = pin(
	describeQueryType({
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
 */
export const relationshipsKnown = pin(
	describeQueryType({
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
 */
export const relationshipSearch = pin(
	describeQueryType({
		id: 'core:query/relationship-search@1',
		i18n: {
			name: { en: 'Relationships: ranked' },
			description: {
				en: 'The narrative graph as ranked candidates that compete for the context window, ordered by who is in the scene, who is speaking, and what changed most recently.',
			},
		},
		optional: true,
		timeoutMs: RELATIONSHIP_TIMEOUT,
		slots: relationshipSlots('graph relationships'),
		ports: {
			/**
			 * ⚠ **No `text` in-port**, for `core:query/entity-search@1`'s
			 * reason: the four lore queries declare one that nothing fills and
			 * nothing reads, and shipping a fifth with the same standing excuse
			 * written for it would be adding the defect on purpose. A
			 * relationship is reached by walking edges from the speaker's node,
			 * so the scope is the whole of the question.
			 */
			in: { scope: S.sessionScope },
			out: {
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
 * The ports both context builders expose. Identical because the two nodes do
 * the same job — the difference between them is entirely what can be
 * *configured*, which is what a node type is for.
 */
const contextPorts = {
	in: {
		cast: S.sessionCast,
		/**
		 * Whose voice the reply is, when a next-speaker node decided (19 §5).
		 * Optional: unwired, the speaker still rides the cast bundle (the
		 * scope's value), which is how every spec worked before the node
		 * existed — and how the narrator's context, which has no speaker,
		 * still works. Wired, it wins, so the receipt's speaker and the
		 * prompt's speaker cannot disagree.
		 */
		currentCharacterId: S.rowIds,
	},
	out: {
		main: S.templateContext,
		templateContext: S.templateContext,
		/**
		 * The name on the trailing assistant line.
		 *
		 * Its own port rather than a field inside the context, because
		 * nothing renders `{{seedName}}` — it is not a template variable.
		 * It is what the message processor writes on the line the model
		 * continues from, and in narrator mode it is the one name that
		 * must *not* be the joined cast list: seeding "Alice and Cara:"
		 * teaches the model to write joint dialogue instead of narrating.
		 */
		seedName: S.text,
	},
} as const

const PROMPTS_DESCRIPTION =
	'The written instructions this pipeline sends the model — pick a prompt, or duplicate one and make it yours.'

/**
 * How each value this node produces is *presented*.
 *
 * Every one of these was a `JSON.stringify` in TypeScript, indentation and all
 * — so "render my characters as prose" was a code change rather than a setting.
 * Each key here points at a swappable template row, selected the way a prompt
 * is, and keyed by the variable it renders rather than by this spec: a prose
 * rendering written here is selectable from any pipeline that renders the same
 * variable.
 *
 * The shipped rows reproduce the old TypeScript byte for byte. The JSON shape is
 * not a default anyone drifted into — it was A/B tested before 0.1.0 and
 * measurably improved how reliably models hold a character — so prose is opt-in
 * and stays that way.
 */
const VARIABLES_DESCRIPTION =
	'How each part of the prompt is laid out — JSON, prose, or whatever you write. Duplicate one to change it.'

/** Rendered by every context builder, whoever is speaking. */
const sharedRenders = {
	instructions: 'core:var/instructions@1',
	characters: 'core:var/characters@1',
	personas: 'core:var/personas@1',
	scenario: 'core:var/scenario@1',
	postHistoryInstructions: 'core:var/post-history-instructions@1',
	characterNames: 'core:var/character-names@1',
	personaNames: 'core:var/persona-names@1',
} as const

/**
 * The reply pipeline's context builder.
 *
 * ## Why the narrator has its own type
 *
 * Through 0.6.0 both pipelines pinned this one, and the panel is generated from
 * the registry row — so each advertised the other's controls. Reply prompts all
 * carried an empty `narratorName` box, and the narrator offered layout pickers
 * for `exampleDialogue` (which comes from the speaking character it does not
 * have) and the two relationship variables (which its spec deliberately never supplies).
 * Three controls wired to nothing, in both directions.
 *
 * A type is the unit that declares a configurable surface — it is how a plugin
 * declares one, and `RegistryEntry.slots` carries the declaration precisely so
 * core can render a form without executing the plugin that owns it (12 §2, F6).
 * Narrowing per-spec instead would have meant the row said one thing and the
 * running pipeline another, which is the defect widening that column fixed.
 *
 * The two share `contextPorts` and `sharedRenders` rather than restating them,
 * so the halves that must not drift cannot.
 */
export const buildTemplateContext = pin(
	describeTaskType({
		id: 'core:task/build-template-context@1',
		i18n: { name: { en: 'Build template context' } },
		timeoutMs: 2000,
		/**
		 * The example-dialogue pick. Declaring it is what gets `ctx.random` — the
		 * run-seeded RNG — instead of `Math.random()`, so the same run replayed
		 * chooses the same example and a different turn still gets variety.
		 */
		declaresRandomness: true,
		/**
		 * The authored text. It arrives as config rather than on a port because it
		 * *is* config — the same prompt config the assembly template renders from,
		 * layered instance → user → chat like every other slot.
		 */
		slots: {
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: PROMPTS_DESCRIPTION,
				fields: {
					systemPrompt: { type: 'text' },
					postHistoryInstructions: { type: 'text' },
				},
			},
			variables: {
				kind: 'variables',
				facet: 'variables',
				description: VARIABLES_DESCRIPTION,
				renders: {
					...sharedRenders,
					/** From the speaking character's card. */
					exampleDialogue: 'core:var/example-dialogue@1',
					/**
					 * The narrative graph, as two variables rather than one.
					 *
					 * They were `speakerRelationships` — a single block holding
					 * both what the speaker thinks of everyone and what everyone
					 * thinks of the speaker. Opposite claims under one heading,
					 * which a model reads as one list, and one layout, one
					 * priority and one on/off switch for both.
					 */
					relationshipsPerspectives: 'core:var/relationships-perspectives@1',
					relationshipsKnown: 'core:var/relationships-known@1',
				},
			},
			/**
			 * The pre-assemble context hook (18 §4a): user chains over the
			 * finished template context — conditional style guides, seeded
			 * event tables — after this node resolves it and before anything
			 * renders it.
			 *
			 * `messages/inject` lives here too — **not** on the message
			 * processor — because of the ruling of 2026-08-23: injections are
			 * template-context *data* (`context.injections`, resolved to
			 * `injectionsByIndex` beside `postHistory.targetIndex`), rendered
			 * by the template's own message loop. Splicing them into the list
			 * behind the template's back would be the §20 defect again, one
			 * layer down: a position the template cannot express, an author
			 * cannot see, and a corpus cannot check.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
			},
		},
		ports: {
			in: {
				...contextPorts.in,
				/**
				 * The narrative graph, as the two claims it really is — how the
				 * speaker regards everyone, and how everyone regards the
				 * speaker (D-I).
				 *
				 * ⚠ **Supplied by `respond` since the split, declared here
				 * only now.** The spec wires both off
				 * `core:query/relationships-perspectives@1` and
				 * `core:query/relationships-known@1`, the two `renders` above
				 * name the variables they feed, and the builder reads both by
				 * these exact names — so every part of the round trip was
				 * written down except the ports themselves.
				 *
				 * `json`, matching what those queries publish and for the
				 * reason stated at them: the structure travels so a variable
				 * layout can render it, rather than a blob nothing can
				 * restyle.
				 *
				 * ⚠ Declared on THIS type alone rather than in `contextPorts`,
				 * which the narrator builder shares. Its own docblock says the
				 * narrate spec never supplies these because graph context
				 * needs a speaker's perspective and a narrator has none — so
				 * widening the shared map would give it two ports it must
				 * leave empty forever, and move its hash to say so (S3).
				 */
				relationshipsPerspectives: S.json,
				relationshipsKnown: S.json,
				/**
				 * Who is speaking, when the speaker is not in the cast.
				 *
				 * ⚠ **Neither is wired by any spec, and both are supplied on
				 * every side-character turn.** `core:task/build-side-character-
				 * context@1` is not a separate implementation — the host's
				 * binding for it unwraps its `speaker` in-port and calls THIS
				 * type's handler with the name and the card spread onto the
				 * input, because `resolveContextInput` owns the card rules and
				 * a side character's card and a cast member's must compile
				 * through one function.
				 *
				 * So the supplier is the host rather than a document, and that
				 * is exactly why declaring them matters: it is the only record
				 * that this type's input surface is wider than its edges. An
				 * undeclared key reaching a handler is indistinguishable from a
				 * typo until someone reads both files at once.
				 *
				 * `speakerName` is `text` — it is the name on the seed line and
				 * what `{{char}}` renders. `speakerCharacter` is `json`: the
				 * card, or `null` for a free-form name, which is a normal turn
				 * rather than a degraded one.
				 */
				speakerName: S.text,
				speakerCharacter: S.json,
				/**
				 * The session's resolved stats and states, as
				 * `core:query/session-state@1` publishes them:
				 * `{ world, cast, possessions }`, already resolved down the
				 * session → lorebook → card → default chain.
				 *
				 * A template reads `state.world.weather` and
				 * `state.cast.verity.hp` — the **resolved** value and nothing
				 * below it. Which layer a number came from is a question for
				 * the Cast member page, not for a prompt.
				 *
				 * ⚠ Declared on THIS type alone rather than in `contextPorts`,
				 * following `relationshipsPerspectives` above and for the same
				 * reason: widening the shared map moves the narrator's hash to
				 * declare a port no shipped spec fills. Unwired — which is
				 * every shipped spec today — the key is absent and the context
				 * has no `state`, which is what a chat session should have.
				 */
				state: S.json,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * The narrator pipeline's context builder.
 *
 * Same implementation, same ports, different surface — see
 * `buildTemplateContext` for why that makes it a different type.
 *
 * What it drops: `exampleDialogue`, which `characterExampleDialogue` reads off
 * the speaking character and so is always empty here, and both relationship
 * variables, which the narrate spec never supplies because graph context needs
 * a speaker's perspective and a narrator has none.
 *
 * What it adds: `narratorName`. Load-bearing rather than cosmetic — it is the
 * name on the seed line the model continues from, and `{{narratorName}}` in the
 * narrator's own prompt text.
 *
 * No `declaresRandomness`: the only random choice this node ever made was which
 * example dialogue to use, and it has none to choose from.
 */
export const buildNarratorContext = pin(
	describeTaskType({
		id: 'core:task/build-narrator-context@1',
		i18n: { name: { en: 'Build narrator context' } },
		timeoutMs: 2000,
		slots: {
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: PROMPTS_DESCRIPTION,
				fields: {
					systemPrompt: { type: 'text' },
					postHistoryInstructions: { type: 'text' },
					narratorName: { type: 'text' },
				},
			},
			variables: {
				kind: 'variables',
				facet: 'variables',
				description: VARIABLES_DESCRIPTION,
				renders: { ...sharedRenders },
			},
			/** The same hook as `build-template-context` — see it for the terms. */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
			},
		},
		ports: contextPorts,
	}),
)

/**
 * The side-character pipeline's context builder (ruling 2026-09-07).
 *
 * Same implementation and the same ports as the other two, plus one in-port —
 * `speaker` — and that port is the whole reason it is a third type rather than
 * a flag.
 *
 * ## Why the name is a port and not a prompt field
 *
 * `build-narrator-context@1` takes `narratorName` in its **prompts** slot,
 * which is correct there: the narrator's name is a setting, chosen once, the
 * same on every turn. A side character's name is *data from the trigger* — it
 * differs per turn and a person may type it in the modal — so putting it in a
 * prompts slot would mean editing a prompt config to speak as somebody else,
 * and every turn would render with whichever name was stored last.
 *
 * ## What it drops, and what it keeps
 *
 * Drops `exampleDialogue`, for the narrator's reason: it is read off the
 * speaking *cast member*, and a side character is not one. Drops both
 * relationship variables, because graph context is built from a cast member's
 * node and this speaker has none. Keeps every shared render, so the cards, the
 * scenario and the two name lists are laid out exactly as they are elsewhere.
 *
 * ⚠ It declares **no** `narratorName` prompt field. A side-character prompt
 * that wrote `{{narratorName}}` would render the narrator's configured name
 * into a turn the narrator is not speaking — the same "control wired to
 * nothing, in both directions" the two context builders were split to end.
 * `{{char}}` is the speaker here, exactly as it is in a reply.
 *
 * ⚠ And it does **not** inherit `contextPorts.in.currentCharacterId`, which the
 * other two carry. Not an oversight: character-lore visibility is decided by
 * the host read, which keys on the run's SCOPE, so a speaker id arriving here
 * could change whose voice the prompt is written in without changing whose lore
 * it was given — a prompt in one person's voice over another's private
 * knowledge. The port would be a control that half-works, which is the exact
 * class this whole split exists to remove. `speaker` carries the name and the
 * card; the id stays where the host can act on it.
 */
export const buildSideCharacterContext = pin(
	describeTaskType({
		id: 'core:task/build-side-character-context@1',
		i18n: { name: { en: 'Build side character context' } },
		timeoutMs: 2000,
		slots: {
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: PROMPTS_DESCRIPTION,
				fields: {
					systemPrompt: { type: 'text' },
					postHistoryInstructions: { type: 'text' },
				},
			},
			variables: {
				kind: 'variables',
				facet: 'variables',
				description: VARIABLES_DESCRIPTION,
				renders: { ...sharedRenders },
			},
			/** The same hook as the other two builders — see them for the terms. */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
			},
		},
		ports: {
			in: {
				cast: contextPorts.in.cast,
				/**
				 * `{ name, characterId, known, character }`, from the trigger's
				 * first step. `name` is what the seed line carries and what
				 * `{{char}}` renders; `character` is the card, absent for a
				 * free-form name, which is a normal turn rather than a degraded
				 * one — the builder falls back to the name it was given,
				 * because a typed name is all there is.
				 */
				speaker: S.json,
				/**
				 * Where this turn is happening, as the world state says it.
				 *
				 * Declared late, and for a defect rather than for symmetry: a
				 * voice built with no place in front of it answered from
				 * whatever the transcript suggested and moved the scene to a
				 * harbour the plan had never mentioned. Unwired on every
				 * pipeline that had this node before it, so those keep the
				 * context they already had.
				 */
				state: S.json,
				/**
				 * The planner's document, for the one fact the state cannot
				 * supply on a first turn: where the scene is, before anything
				 * has written a location down.
				 */
				plan: S.json,
			},
			out: contextPorts.out,
		},
	}),
)

/* ── The adventure genre's agent contexts ───────────────────────────────────
 *
 * Three more surfaces onto the ONE context builder, declared for the reason
 * `buildNarratorContext` states beside `buildTemplateContext`: a different
 * prompt surface is a different type. The reason is mechanical rather than
 * tidy-minded. A prompt lives in a pool keyed by (node type, slot), and
 * `defaultPromptFor` resolves **one row per pool per spec** — two nodes of the
 * same type in one pipeline must land on the same shipped prompt. A multi-agent
 * turn whose planner, narrator and state-keeper were all
 * `build-template-context@1` would therefore ship all three agents the same
 * instructions, and the person who noticed would have to fix it three times in
 * a panel rather than once in a package.
 *
 * They take `state` because that is the whole premise of the genre they serve:
 * every agent reads the bars, the world strip and the inventory as facts before
 * it writes anything. `core:task/build-template-context@1` declares the same
 * port and stays the type a spec uses when it wants the standard surface.
 */
const agentContextSlots = (
	promptFields: Record<string, { type: 'text' }>,
): Record<string, SlotDecl> => ({
	prompts: {
		kind: 'prompts',
		quick: true,
		facet: 'prompts',
		description: PROMPTS_DESCRIPTION,
		fields: promptFields,
	},
	variables: {
		kind: 'variables',
		facet: 'variables',
		description: VARIABLES_DESCRIPTION,
		renders: { ...sharedRenders },
	},
	/** The same pre-assemble hook the other three builders carry. */
	scripts: {
		kind: 'scripts',
		accepts: ['core:script:context/transform@1', 'core:script:messages/inject@1'],
		port: 'main',
		phase: 'after',
		description:
			'Scripts over what the prompt template renders — edit the instructions, roll an occasional event, or inject a reminder at a depth in the conversation.',
	},
})

/**
 * The planner's context: the cast, the state, and nothing about a speaker.
 *
 * A planner decides who speaks; it is not itself anybody, so
 * `currentCharacterId` is deliberately absent rather than declared and left
 * empty. What it publishes is what every other builder publishes, so the
 * planner's prompt is assembled by the same node as everyone else's.
 */
export const buildPlannerContext = pin(
	describeTaskType({
		id: 'core:task/build-planner-context@1',
		i18n: { name: { en: 'Build planner context' } },
		timeoutMs: 2000,
		slots: agentContextSlots({
			systemPrompt: { type: 'text' },
			postHistoryInstructions: { type: 'text' },
		}),
		ports: {
			in: {
				cast: contextPorts.in.cast,
				state: S.json,
				/**
				 * The session's own genre fields, by key — `tone`,
				 * `difficulty` and whatever else the genre declared.
				 *
				 * On the template context under their own names, so an
				 * authored prompt writes `{{tone}}` the way it writes
				 * `{{char}}`. That is the whole round trip the genre's `fields`
				 * declaration promises: declared on the genre, edited in
				 * session settings, stored on the row, published by the input
				 * node, and read here by the agent whose wording depends on
				 * them. Without this port the last step was missing and a
				 * prompt naming `{{tone}}` rendered a blank.
				 */
				fields: S.json,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * The narrator's context for a planned turn — the one builder that takes a
 * **plan**.
 *
 * `plan` is the only genuinely new thing in this file's three types: the
 * structured object the planning step produced, put on the template context
 * under `plan` so the narrator's story string can render its beats and its
 * world hints. It is a port rather than a nested literal on `state` because the
 * two are different facts and a template author should be able to tell which is
 * which — `state.world.weather` is what the world IS, `plan.worldHints` is what
 * this turn was asked to make of it.
 *
 * `narratorName` rides the prompts slot, as it does on `build-narrator-context@1`
 * and for the same reason: it is the name on the seed line the model continues
 * from, which is a setting somebody stored rather than data a trigger carried.
 */
export const buildSceneContext = pin(
	describeTaskType({
		id: 'core:task/build-scene-context@1',
		i18n: { name: { en: 'Build scene context' } },
		timeoutMs: 2000,
		slots: agentContextSlots({
			systemPrompt: { type: 'text' },
			postHistoryInstructions: { type: 'text' },
			narratorName: { type: 'text' },
		}),
		ports: {
			in: {
				cast: contextPorts.in.cast,
				state: S.json,
				/** What the planning step decided this turn is about. */
				plan: S.json,
				/**
				 * The session's own genre fields, by key — `tone`,
				 * `difficulty` and whatever else the genre declared.
				 *
				 * On the template context under their own names, so an
				 * authored prompt writes `{{tone}}` the way it writes
				 * `{{char}}`. That is the whole round trip the genre's `fields`
				 * declaration promises: declared on the genre, edited in
				 * session settings, stored on the row, published by the input
				 * node, and read here by the agent whose wording depends on
				 * them. Without this port the last step was missing and a
				 * prompt naming `{{tone}}` rendered a blank.
				 */
				fields: S.json,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * The state-keeper's context: the state as it stands, so the keeper can report
 * only what the scene changed about it.
 *
 * Its own type rather than the planner's because the two read the same facts
 * for opposite purposes — one is deciding what should happen, the other is
 * writing down what did — and a shared pool would ship them one set of
 * instructions.
 */
export const buildKeeperContext = pin(
	describeTaskType({
		id: 'core:task/build-keeper-context@1',
		i18n: { name: { en: 'Build state keeper context' } },
		timeoutMs: 2000,
		slots: agentContextSlots({
			systemPrompt: { type: 'text' },
			postHistoryInstructions: { type: 'text' },
		}),
		ports: {
			in: {
				cast: contextPorts.in.cast,
				state: S.json,
				/**
				 * The reply this keeper is reading, as text — put on the
				 * template context under `reply`, because the thing a keeper
				 * reports on is the scene that was just written and the
				 * transcript does not contain it yet.
				 */
				reply: S.text,
				/**
				 * ⚠ **An ORDERING edge, and nothing else reads it.**
				 *
				 * A state change is anchored to the newest message in the
				 * session, which is how a swipe takes its changes back with it.
				 * So the keeper has to run AFTER the reply is written, not
				 * merely beside it — and in a graph whose order is its edges,
				 * the only way to say "after that write" is to take the write's
				 * result on a port. It is the write result rather than the text
				 * for exactly that reason: the text exists before the write and
				 * would order nothing.
				 *
				 * ⚠ Typed `json`, NOT `write-result@1`, and the difference is
				 * the standing rule rather than a convenience.
				 * `core:shape/write-result@1` is deliberately accepted nowhere:
				 * under async review a write is a proposal a reviewer may still
				 * reject, so a port declaring that shape is a port promising to
				 * handle both arms of it. This node handles neither — it never
				 * looks inside — and declaring the shape would claim otherwise.
				 * `json` is the honest type for a value taken as opaque, and
				 * write results are assignable to it like everything else.
				 */
				afterWrite: S.json,
				/**
				 * The session's own genre fields, by key — `tone`,
				 * `difficulty` and whatever else the genre declared.
				 *
				 * On the template context under their own names, so an
				 * authored prompt writes `{{tone}}` the way it writes
				 * `{{char}}`. That is the whole round trip the genre's `fields`
				 * declaration promises: declared on the genre, edited in
				 * session settings, stored on the row, published by the input
				 * node, and read here by the agent whose wording depends on
				 * them. Without this port the last step was missing and a
				 * prompt naming `{{tone}}` rendered a blank.
				 */
				fields: S.json,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * Chat rows into the objects a template renders.
 *
 * A Task rather than part of the history Query, because naming a message —
 * which participant said it, under what name at the time — is a *decision*, and
 * decisions are the things a plugin should be able to replace. The Query returns
 * rows; this says who spoke.
 */
export const processMessages = pin(
	describeTaskType({
		id: 'core:task/process-messages@1',
		i18n: { name: { en: 'Process messages' } },
		timeoutMs: 1000,
		slots: {
			/**
			 * The message-rewrite hook (18 §4a), on the *processed* list —
			 * names resolved, per-message interpolation done. `transform` only:
			 * `messages/inject` deliberately does **not** live here. Injection
			 * is a statement about *position in the rendered conversation*, and
			 * position belongs to the template (§20, ruling of 2026-08-23) —
			 * inject chains attach on the context builders, land as
			 * `context.injections`, and the template's own loop renders them.
			 * Splicing rows into this list would be a position the template
			 * cannot express and an author cannot see.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:messages/transform@1'],
				port: 'main',
				phase: 'after',
				description:
					'Scripts over the message list the model will see — rewrite or drop lines. Reminders at a depth attach on the context step instead.',
			},
		},
		ports: {
			in: {
				messages: S.messages,
				cast: S.sessionCast,
				templateContext: S.templateContext,
				seedName: S.text,
				/**
				 * Text the model is being asked to CONTINUE — the seed line's
				 * body rather than a message of its own (ruling 2026-09-08,
				 * D-2).
				 *
				 * ⚠ **Absent on an ordinary turn, and that is the normal case.**
				 * There is no `optional` marker for a port: a port nothing wires
				 * resolves to `undefined`, the seed line renders empty, and the
				 * model starts the reply. Every spec but a continue leaves it
				 * unwired on purpose.
				 *
				 * It is a port rather than a second synthetic message because a
				 * partial reply is not a turn: appending it as one produces two
				 * consecutive assistant entries on a chat endpoint and a
				 * wrongly-closed block on a completion one. The seed is the one
				 * place in the prompt whose block is deliberately left open
				 * (`includeClose: false` for id -2), which is exactly what a
				 * continuation needs.
				 *
				 * ⚠ It is **not** a stored message, and nothing downstream may
				 * treat it as one. The row holding it is `isGenerating` and is
				 * excluded from every message read, so lore scans, semantic and
				 * entity queries and history windows do not see it. It counts
				 * against the token budget, because it is in the prompt.
				 */
				continuationPrefill: S.text,
			},
			out: { main: S.messages, messages: S.messages },
		},
	}),
)

/**
 * The conversation as PROSE, for a step that reads it rather than takes a turn.
 *
 * Two differences from `process-messages@1`, and both are properties of the
 * transcript rather than of the request, which is why they live here and not on
 * the Provider: by the time a prompt is rendered for a completion wire the
 * conversation is one string with an open block at the end of it, and nothing
 * downstream can take either of them back out.
 *
 *   · **No seed.** `process-messages@1` ends its list with an empty assistant
 *     line carrying the next speaker's name, because that line is what tells a
 *     model whose turn it is. A planner and a state keeper are not taking a
 *     turn, and a prompt that ends `Verity:` asks for Verity's next paragraph
 *     however plainly the instructions asked for JSON.
 *   · **No JSON blocks.** A reply that carried a document at the end of it
 *     teaches the next turn's planner its own schema and the keeper somebody
 *     else's. The cut happens on the way into the prompt and never on the
 *     stored row — see `prompt/jsonBlocks.ts`.
 *
 * Everything else is the same naming and the same interpolation, from the same
 * implementation: who spoke, under what name at the time, reaching through
 * participants who have since left.
 */
export const proseTranscript = pin(
	describeTaskType({
		id: 'core:task/prose-transcript@1',
		i18n: { name: { en: 'Transcript as prose' } },
		timeoutMs: 1000,
		ports: {
			in: {
				messages: S.messages,
				cast: S.sessionCast,
				templateContext: S.templateContext,
			},
			out: { main: S.messages, messages: S.messages },
		},
	}),
)

/**
 * The next-speaker strategies (19 §5, U-C4) — turn-taking as a swappable node.
 *
 * `getNextCharacterTurn` used to run *before* the run existed, which made
 * "why did Bram speak" the one decision per turn no receipt could explain —
 * the same invisibility class §27l closed for stop strings. Each strategy is
 * its **own task type** publishing `speaker-selection@1` on `main`: the swap
 * list is a SELECT over such rows, so an extension's strategy appears beside
 * core's by being registered, exactly as a chat mode does. (The family lives
 * in the *name* — `turn-round-robin`, not `core:turn/...` — because `kind`
 * is a closed five-member set (01 §3) and a sixth kind would ripple the
 * grammar for a spelling.)
 *
 * Every strategy honors an explicit pick first: `characterId` in means the
 * trigger already decided (the "Trigger Character" picker, a swipe regen),
 * and the node's only job is to record that. The strategies differ in what
 * they do when the trigger did *not* decide:
 *
 * - **round-robin** — the 0.5 rotation, verbatim: the same due-character
 *   computation the socket ran, now inside the run where the receipt can see
 *   it.
 * - **random** — a seeded pick among active characters (`declaresRandomness`,
 *   so a replayed run picks the same speaker).
 * - **manual** — never decides: explicit picks or nobody. What the respond
 *   spec pins today, because the socket still pre-picks every turn (U-C5
 *   retires that; parity holds byte for byte until it does).
 * - **none** — no speaker system at all: the pin for modes with
 *   `characters: {max: 0}`, where the node is a recorded passthrough.
 *
 * Producing no speaker is an outcome, not a failure — a null `characterId`
 * is exactly what the legacy path handed on (narrator-adjacent turns), so
 * none of these halt.
 */
const turnStrategy = <Id extends string>(id: Id, label: string, extras: object = {}) =>
	describeTaskType({
		id,
		i18n: { name: { en: label } },
		timeoutMs: 1000,
		...extras,
		ports: {
			in: {
				cast: S.sessionCast,
				messages: S.messages,
				/** The explicit pick, when the trigger made one. Always wins. */
				characterId: S.rowIds,
			},
			out: {
				main: S.speakerSelection,
				/** The bare id, for wiring into context and generation. */
				characterId: S.rowIds,
				/** What decided — the receipt line §5 exists for. */
				strategy: S.text,
			},
		},
	})

export const turnRoundRobin = pin(turnStrategy('core:task/turn-round-robin@1', 'Round robin'))
export const turnRandom = pin(
	turnStrategy('core:task/turn-random@1', 'Random', {
		declaresRandomness: true,
	}),
)
export const turnManual = pin(turnStrategy('core:task/turn-manual@1', 'Manual'))
export const turnNone = pin(turnStrategy('core:task/turn-none@1', 'No speaker'))

/** Turns provider output back into candidate blocks — the map/reduce join. */
export const toCandidates = pin(
	describeTaskType({
		id: 'core:task/to-candidates@1',
		timeoutMs: 500,
		ports: {
			in: { items: S.text },
			out: { main: S.candidates, candidates: S.candidates },
		},
	}),
)

/** An author defaulting review ON for their own consumer — and unable to forbid it (F14). */
export const attachImage = pin(
	describeConsumerTarget({
		id: 'core:consumer/attach-image@1',
		effects: 'write',
		timeoutMs: 5000,
		reviewDefault: 'on',
		causesEvent: 'core:event/message-updated@1',
		ports: { in: { image: S.image }, out: { main: S.writeResult } },
	}),
)

/**
 * Tool calling's two pure halves (20 §9). A *tool* is any same-shaped
 * provider — a sandboxed plugin hook canonically — and these tasks only
 * decide how the model learns about it and how its answer is read back.
 * Between them sits the ordinary generate step; around them sits the loop
 * block, whose iterations are the receipted agentic turn.
 */
export const advertiseTools = pin(
	describeTaskType({
		id: 'core:task/advertise-tools@1',
		i18n: { name: { en: 'Advertise tools' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					style: {
						type: 'enum',
						of: ['native', 'prompt'],
						default: 'prompt',
						description:
							"How the model learns its tools: 'native' hands the declarations to the API's own tool-calling; 'prompt' writes them into the context for models without one.",
					},
				},
			},
		},
		ports: {
			// [{ name, description, parameters }] — parameters as JSON Schema.
			in: { tools: S.json },
			out: { main: S.json, native: S.json, prompt: S.text },
		},
	}),
)

export const parseToolCall = pin(
	describeTaskType({
		id: 'core:task/parse-tool-call@1',
		i18n: { name: { en: 'Parse tool call' } },
		timeoutMs: 500,
		ports: {
			in: { text: S.text, tools: S.json },
			// `call` is { tool, args } | null — null is the loop's exit
			// predicate, not an error: a reply with no call is the model being
			// done. `text` is the reply with the call block stripped, so what
			// renders is prose and what dispatches is data.
			out: { main: S.json, call: S.json, text: S.text },
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
 */
export const availableTools = pin(
	describeQueryType({
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

/**
 * Run the tool the model asked for, and hand the answer back as text it can
 * read on the next pass (20 §9).
 *
 * ## Why this is a Provider and not a Task
 *
 * The two halves either side of it are pure and this one cannot be: a tool
 * reads the session, or reaches an extension's sandboxed hook, which may in
 * turn reach the network under its own grants. That is `effects: 'external'`
 * exactly — and it is the kind that is handed `ctx.call`, so the tool's own
 * dispatch stays behind the host seam where every other outward call lives.
 * A Task with database access would be a second, unaudited read path.
 *
 * ## What it refuses, and what it never throws
 *
 * `tools` is the advertisement the model was actually given, so a name that
 * was never offered is refused **by name** rather than resolved: a model
 * inventing a tool must not be able to reach one that exists but was withheld
 * from this step.
 *
 * A tool that fails is a **result, not an exception**. `main` is
 * `{ tool, error }` and `text` renders it, because the model asking for a
 * missing file needs to read "no such file" and try something else — a throw
 * would end the run at the one moment the agent could have recovered. The
 * type's `timeoutMs` is the time-box per call: one node invocation is one
 * tool, so the executor's own timeout already is the tool's.
 *
 * `call` may be null — that is the ordinary last iteration, where the model
 * answered in prose and the loop is about to stop. Nothing runs and `text` is
 * empty.
 */
export const runTool = pin(
	describeProvider({
		id: 'core:provider/run-tool@1',
		i18n: { name: { en: 'Run tool' } },
		effects: 'external',
		timeoutMs: 30000,
		ports: {
			// `call` is parse-tool-call's `{ tool, args } | null`; `tools` is
			// advertise-tools' input, so refusal reads the same list the model
			// saw; `text` is the prose parse-tool-call stripped the call out of.
			in: { call: S.json, tools: S.json, text: S.text },
			/**
			 * Three ports because an iteration produces up to three different
			 * things and one port carrying two of them is a port a downstream
			 * node has to interrogate.
			 *
			 *  - `main` — `{ tool, result }` or `{ tool, error }`, or null when
			 *    nothing was called. One shape, two arms, so nothing downstream
			 *    decides what happened by looking for a missing key.
			 *  - `text` — that rendered as the tool-result block **the next
			 *    prompt carries**. Empty when nothing ran.
			 *  - `answer` — what this iteration contributes to the
			 *    **conversation**: the model's prose, and only on the iteration
			 *    that called no tool, which is the one where the model stopped
			 *    working and answered. Empty otherwise, so joining every
			 *    iteration's `answer` yields the turn's reply and nothing else.
			 */
			out: { main: S.json, text: S.text, answer: S.text },
		},
	}),
)

/**
 * A repeated block's outputs, as one string.
 *
 * The missing half of `map` and `loop`. Both publish a **list** — `values`, one
 * entry per iteration — and everything that writes (a message, a lore entry)
 * takes a scalar, so every spec that repeats anything has needed this and
 * every spec has had to end at the block. Reducing in a Consumer instead would
 * put the join inside the write, where no receipt can show it and no author
 * can change it.
 *
 * `path` is what makes it usable on a block: an iteration's value is that
 * chain's last node's **ports object**, so the interesting text is at
 * `.text` or `.answer` rather than at the top. Empty entries are skipped
 * rather than joined, which is what makes "every iteration's answer, and only
 * the iteration that had one" a wiring rather than a filter node.
 */
export const joinText = pin(
	describeTaskType({
		id: 'core:task/join-text@1',
		i18n: { name: { en: 'Join text' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					path: {
						type: 'string',
						default: 'text',
						description:
							'Which key to read off each entry. Empty reads the entry itself, for a list of plain strings.',
					},
					separator: {
						type: 'string',
						default: '\n\n',
						description: 'What goes between the entries that had something to say.',
					},
				},
			},
		},
		ports: { in: { items: S.json }, out: { main: S.text, text: S.text } },
	}),
)

/**
 * A model's JSON answer, read back as data.
 *
 * ## Why a Task and not a shape on the Provider
 *
 * `core:provider/generate-text@1` is published and frozen, and it publishes
 * prose. A pipeline that wants structure out of a model therefore needs one
 * more step, and that step is the honest place for every way the reading can
 * fail: a fenced block, a preamble the model could not resist, a reply cut off
 * by the token limit. Put inside the Provider it would be a second job hidden
 * in the node that calls the model; here it is a node on the receipt, with its
 * own timing and its own halt.
 *
 * ## `path` is what makes the result WIREABLE
 *
 * A data reference is `{node, port}` — there is no sub-path — so a downstream
 * `map` cannot iterate `plan.speakers` off a port carrying the whole document.
 * `path` is the answer: the parsed document is always on `json`, and `value`
 * and `items` carry whatever `path` selects, so one node serves both the step
 * that reads the whole plan and the block that iterates one list inside it.
 * `items` is `value` as a list — an absent or single value becomes an empty or
 * one-element list, so a map wired to it never has to defend itself.
 *
 * ## It halts rather than inventing an empty answer
 *
 * A reply this node cannot read is a model that did not do what it was asked,
 * and an empty object published as though it were an answer would travel
 * downstream as "nothing changed" — indistinguishable from a turn where
 * genuinely nothing did. `optional: true` on the node is how a spec says it can
 * live without the structure; the executor then records `recoveredAsEmpty` and
 * a reader can see which one happened.
 */
export const parseJson = pin(
	describeTaskType({
		id: 'core:task/parse-json@1',
		i18n: { name: { en: 'Read JSON' } },
		timeoutMs: 1000,
		/**
		 * A reply nobody can read subtracts the structure and nothing else.
		 *
		 * The binding answers `err` with the reason, the executor absorbs it as
		 * `recoveredAsEmpty`, and every downstream port reads absent: a `map`
		 * over the missing list runs zero times, a template renders no block. So
		 * a model that ignored the schema costs a turn its plan, not its reply —
		 * which is the same "an unavailable mechanism subtracts a signal, it
		 * never disables a path" rule retrieval already works by.
		 */
		optional: true,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					path: {
						type: 'string',
						quick: true,
						description:
							'Which value inside the answer to publish on `value` and `items`, as a dotted path. Empty publishes the whole answer.',
					},
				},
			},
		},
		ports: {
			in: { text: S.textStream },
			out: {
				main: S.json,
				/** The whole parsed document, whatever `path` says. */
				json: S.json,
				/** The value at `path` — the document itself when `path` is empty. */
				value: S.json,
				/** That same value as a list, for a `map` to iterate. */
				items: S.json,
			},
		},
	}),
)

export const chunkText = pin(
	describeTaskType({
		id: 'core:task/chunk-text@1',
		timeoutMs: 1000,
		ports: { in: { text: S.text }, out: { main: S.json, items: S.json } },
	}),
)

export const roll = pin(
	describeTaskType({
		id: 'chariot.dice-tray:roll@1',
		i18n: { name: { en: 'Roll dice' } },
		timeoutMs: 200,
		declaresRandomness: true,
		public: true,
		ports: {
			in: { notation: S.text },
			out: { main: S.json, total: S.json },
		},
	}),
)

export const gate = pin(
	describeTaskType({
		id: 'test:task/gate@1',
		timeoutMs: 500,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

export const slow = pin(
	describeTaskType({
		id: 'test:task/slow@1',
		timeoutMs: 30,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

export const passthrough = pin(
	describeTaskType({
		id: 'test:task/passthrough@1',
		timeoutMs: 500,
		toggleable: true,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

export const badToggleable = pin(
	describeTaskType({
		id: 'test:task/bad-toggleable@1',
		timeoutMs: 500,
		toggleable: true,
		ports: { in: { main: S.text }, out: { main: S.image } },
	}),
)

// ── Providers — identical structure across three modalities (17 §2) ─────────

export const embedText = pin(
	describeProvider({
		id: 'core:provider/embed-text@1',
		shape: S.embeddings,
		effects: 'external',
		timeoutMs: 5000,
		/**
		 * ⚠ **Producing nothing is a legitimate outcome, and this is what makes
		 * that structural rather than careful.**
		 *
		 * Embeddings are optional in this product by design: most installs have
		 * no model loaded, and the retrieval plan's second governing rule is an
		 * absolute — *an unavailable mechanism subtracts a signal; it never
		 * reroutes, disables a path, or excludes a candidate.* The host answers
		 * "no embedding model is loaded and validated" by **throwing**, which is
		 * the right answer to give a caller and the wrong thing to let end a
		 * turn.
		 *
		 * `optional` is what turns that error into an empty `ok` in the executor
		 * — recorded, with `recoveredAsEmpty` and the reason on the receipt, so
		 * it is tolerated rather than hidden. The binding's `enabled` parameter
		 * decides how *loudly*: `auto` treats an unavailable model as an absence
		 * and returns no vectors without calling it a failure, `on` lets the
		 * failure be recorded as one. Neither can cost somebody a reply, and
		 * that is the point of putting the guarantee here instead of in a
		 * `try`.
		 *
		 * It also earns the node a "Use this source" switch, which is the
		 * zero-cost way to turn the semantic mechanism off entirely on an install that
		 * has a model and does not want it spent on retrieval.
		 */
		optional: true,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.embeddings,
				// The two production rows carrying `modality: 'embeddings'` fell
				// through every modality switch in the app; `text->embedding` is
				// the home they never had.
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.embedding] })],
			},
			params: {
				kind: 'parameters',
				schema: {
					enabled: {
						type: 'enum',
						of: ['auto', 'on', 'off'],
						default: 'auto',
					},
				},
			},
		},
		ports: {
			in: {
				text: S.text,
				/** Batched: one call, one vector each, in order. */
				texts: S.json,
			},
			out: { main: S.vector, vector: S.vector, vectors: S.json },
		},
	}),
)

/**
 * An MCP tool call (14 §2) — the generic Provider for a tool on any MCP
 * connection. The snapshot path (14 §3) projects each advertised tool as its
 * own registry row under the connection's namespace, typed off the tool's
 * declared input schema; this generic type is the escape hatch beneath them —
 * pin it, choose the connection, name the tool in params.
 *
 * `effects: 'external'` unconditionally: MCP annotations (`readOnlyHint` and
 * friends) are advisory by specification and are never trusted for gating
 * (14 §4). The admin's per-tool classification lives on the snapshot rows;
 * this generic type gates always, because through it any tool is reachable.
 *
 * The result carries the request and response verbatim in its output — which
 * is the receipt, which is the pitch (14 §5): no other MCP client can answer
 * "what did this tool actually do, and did I approve it" from a row.
 */
export const mcpTool = pin(
	describeProvider({
		id: 'core:provider/mcp-tool@1',
		i18n: {
			name: { en: 'MCP tool' },
			description: {
				en: 'Call one tool on a Model Context Protocol server, recorded verbatim and gated like every effectful step.',
			},
		},
		shape: S.mcp,
		effects: 'external',
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.mcp,
				/**
				 * ⚠ No `requires`, and that is deliberate rather than an omission.
				 *
				 * The capability space describes io TRANSFORMS — what a model can
				 * be handed and what it gives back. An MCP server is not one: it
				 * serves tools, it does not turn text into anything. The nearest
				 * id, `text->text`, would be false, and claiming it would make
				 * every chat connection in the install look offerable here.
				 *
				 * So this slot keeps filtering by `shape` alone, which is the
				 * right axis for it. `requires` is for slots whose answer is "what
				 * must this connection be able to DO".
				 */
				description: 'Which MCP server this step calls.',
			},
			params: {
				kind: 'parameters',
				schema: {
					tool: {
						type: 'string',
						quick: true,
						i18n: { en: 'Tool' },
						description: {
							en: 'The advertised tool name on the connected server.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** Arguments for the tool, merged over any declared in params. */
				args: S.json,
			},
			out: {
				main: S.json,
				text: S.text,
				/** The content blocks exactly as the server returned them. */
				content: S.json,
			},
		},
	}),
)

/**
 * An MCP resource read (14 §2) — a Provider, deliberately not a Query. A
 * Query may not reach the network (16 §1), and everything crossing the
 * process boundary must be recorded verbatim so replay never re-infers
 * (F16); a resource is external state that can change between runs, and
 * modelling it as a Query would quietly break both rules.
 */
export const mcpResource = pin(
	describeProvider({
		id: 'core:provider/mcp-resource@1',
		i18n: {
			name: { en: 'MCP resource' },
			description: {
				en: 'Read one resource from a Model Context Protocol server, recorded verbatim.',
			},
		},
		shape: S.mcp,
		effects: 'external',
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.mcp,
				// No `requires` — see the sibling MCP node above: a tool server is
				// not an io transform, so `shape` is the right filter here.
				description: 'Which MCP server this step reads from.',
			},
			params: {
				kind: 'parameters',
				schema: {
					uri: {
						type: 'string',
						quick: true,
						i18n: { en: 'Resource URI' },
						description: {
							en: 'The advertised resource URI on the connected server.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** Overrides the declared URI when wired. */
				uri: S.text,
			},
			out: {
				main: S.json,
				text: S.text,
				content: S.json,
			},
		},
	}),
)

export const generateText = pin(
	describeProvider({
		id: 'core:provider/generate-text@1',
		i18n: { name: { en: 'Generate reply' } },
		shape: S.textGen,
		effects: 'external',
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				/**
				 * What the connection must be able to do, as opposed to what it
				 * is called. `shape` above still types the SLOT; this types the
				 * connection, and it is what the picker filters on and what the
				 * bind check refuses by — naming "Chat" rather than an id.
				 *
				 * Only `requires`, deliberately — still, now that the binding DOES
				 * consume `attachments`. It is the Anthropic adapter that sends
				 * them today (as base64 content blocks on the last user turn); a
				 * connection whose adapter has no such code REFUSES a request
				 * carrying files rather than sending it without them, so the
				 * `attachments` port is honest without a slot-level requirement.
				 *
				 * An `optional` vision requirement would meanwhile put a "no
				 * vision" caveat on every text connection in the app, on every
				 * run — and the port is empty on nearly all of them.
				 */
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				description: 'Which model server this step sends its request to.',
			},
			sampling: {
				kind: 'sampling',
				quick: true,
				shape: S.textGen,
				description:
					'The sampling settings — temperature and friends — used for this request.',
			},
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: 'The written instructions sent with every request from this step.',
				fields: {
					system: { type: 'text' },
					postHistory: { type: 'text' },
				},
			},
			/**
			 * ⚠ No `template` slot, and there was one — "how the assembled
			 * context is wrapped for this model before sending".
			 *
			 * Nothing read it and nothing seeded a row, so it rendered as an
			 * empty picker beside the settings that do work. Wrapping for the
			 * wire is the `wire` slot's job and the connection adapter's; a
			 * second, inert way to express it invited the two to disagree.
			 */
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		/**
		 * Vision and interleaved output, declared.
		 *
		 * `accepts` is what makes a multimodal model reachable at all: before
		 * this the only image ports in the whole graph pointed *outward*
		 * (render, attach), so an image could be produced and stored but never
		 * sent. `emits` says a reply may contain generated media — which is
		 * what a single call now routinely returns, interleaved with the prose
		 * rather than beside it.
		 *
		 * Declaring both here does not oblige a connection to do either; the
		 * adapter reports what its model actually supports and the two are
		 * resolved at bind time.
		 */
		media: {
			accepts: ['image', 'document'],
			emits: ['image'],
		},
		ports: {
			in: {
				context: S.assembled,
				/**
				 * Whose reply is being generated — the stop-string exclusion
				 * (§27l): the speaking character's own name must not stop
				 * their own reply. The host already preferred a payload value
				 * over the run scope's; this port is what lets a spec supply
				 * one, so the exclusion follows the next-speaker node's output
				 * (19 §5) instead of the pre-run guess.
				 */
				currentCharacterId: S.rowIds,
				/**
				 * Media travelling with the request — the page a user
				 * attached, the frame a vision step is asked about. A list
				 * because interleaving is ordered and a single ref could not
				 * express "these three, in this order".
				 *
				 * Optional, and never quietly ignored: the host forwards these
				 * references to the dispatch, which resolves each one to bytes
				 * (checking it belongs to this run's session or user) and hands
				 * them to the adapter in this order. A request whose connection
				 * has vision switched off, or whose adapter has no code that
				 * sends files, is REFUSED rather than sent without them —
				 * dropping a file is indistinguishable from a model ignoring it.
				 */
				attachments: S.mediaList,
			},
			/**
			 * `parts` is the honest shape of a completion: an ordered list of
			 * text, reasoning, generated media and tool calls. `main` and
			 * `text` stay exactly as they were — `part-stream` is assignable
			 * to `text-stream`, so every spec wired to them keeps working and
			 * degrades by concatenating the prose.
			 */
			out: { main: S.partStream, text: S.textStream, parts: S.partStream },
		},
	}),
)

/**
 * Generate, with the tools on the wire (20 §9) — the native door.
 *
 * ## Why this is a second type rather than two ports on `generate-text`
 *
 * `core:provider/generate-text@1` is published and frozen: a spec that pinned
 * it must keep meaning what it meant. Adding ports would move its content hash
 * and every install would need a re-projection to keep booting — for a
 * capability most connections do not have. A new pin costs a row and conflicts
 * with nothing.
 *
 * It is otherwise the same node: same shape, same slots, same `context` in and
 * the same `main`/`text`/`parts` out. A spec swaps one for the other and
 * nothing else changes.
 *
 * ## The two doors, and why only one of them parses
 *
 * `advertise-tools` publishes both: `prompt` for models that never heard of
 * tools, `native` for APIs that take a declaration list. Wire `native` here and
 * the adapter puts the tools in the field its service calls them — and reads
 * the answer back out of the structured field, so `toolCall` arrives as data.
 * **There is nothing for `parse-tool-call` to do on this door**: the loop's
 * predicate is this node's own `toolCall`, and `run-tool` takes it directly.
 * Parsing prose the API already parsed would be a second reading of one answer.
 *
 * A connection whose adapter cannot send tools REFUSES a request carrying them
 * rather than sending it without: a model that was never offered a tool and a
 * model that declined one produce the same empty `toolCall`, and dropping the
 * declarations silently is indistinguishable from a model choosing not to call.
 */
export const generateWithTools = pin(
	describeProvider({
		id: 'core:provider/generate-with-tools@1',
		i18n: { name: { en: 'Generate with tools' } },
		shape: S.textGen,
		effects: 'external',
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required, so this node is bindable to every
				 * text connection and the author decides what to do without one
				 * — which is the ruling on `optional` (`ctx.can`): the type
				 * system makes absence impossible to forget about, and the
				 * fallback is the author's to write. A spec that wants the
				 * emulated door instead wires `advertise-tools`' `prompt`.
				 */
				optional: ['tools'],
				description: 'Which model server this step sends its request to.',
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { system: { type: 'text' }, postHistory: { type: 'text' } },
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		media: { accepts: ['image', 'document'], emits: ['image'] },
		ports: {
			in: {
				context: S.assembled,
				/** `advertise-tools`' `native` port — the declarations, verbatim. */
				tools: S.json,
				currentCharacterId: S.rowIds,
				attachments: S.mediaList,
			},
			out: {
				main: S.partStream,
				text: S.textStream,
				parts: S.partStream,
				/**
				 * `{ tool, args }` when the model called one, null when it
				 * answered — the same shape `parse-tool-call` publishes, so
				 * `run-tool` and the loop's predicate take either door without
				 * knowing which was used.
				 */
				toolCall: S.json,
			},
		},
	}),
)

/**
 * Generate, with the ANSWER's shape on the wire — the structured door.
 *
 * ## Why a third generate type rather than a schema port on the other two
 *
 * The same reason `generate-with-tools` is a second one: `generate-text@1` is
 * published and frozen, and a port added to it moves the content hash every
 * spec in every install pins. But the stronger reason here is that this node
 * does not make the same REQUEST. `generate-text` sends a turn — a speaker, a
 * trailing assistant line the model continues — and this sends an instruction.
 * A parameter cannot express that difference honestly: a node whose prompt is
 * sometimes a turn and sometimes a question is two nodes with a flag between
 * them, and the flag is the thing a reader has to find before the receipt makes
 * sense.
 *
 * So: no `currentCharacterId` and no `attachments`, and neither is an omission.
 * The first is the speaker whose reply is being written, and nobody's reply is
 * being written. The second is files travelling with a turn.
 *
 * ⚠ **The trailing assistant line is the TRANSCRIPT's business, not this
 * node's.** A prompt arrives here already rendered, and on a completion wire the
 * seed is an open block inside one string that nothing can take back out. So the
 * guarantee is made where the line is never written:
 * `core:task/prose-transcript@1`, which is what a spec wires into the assemble
 * step feeding this node.
 *
 * ## It parses, and that is not the Provider doing two jobs
 *
 * `parse-json@1`'s own header says why the reading is a separate Task *there*:
 * `generate-text` publishes prose, so the reading is a second step over
 * somebody else's output, and every way it can fail deserves its own node on
 * the receipt. Here the structure IS the output — a request that named a schema
 * and came back with a document has nothing left to interpret — so publishing
 * prose and asking the next node to recover the document from it would be
 * undoing the work this node exists to do.
 *
 * The failures still show. `json` is null and `parseError` carries the sentence
 * when the answer could not be read, and `structured` says which door the
 * request actually went out through, so "the model ignored the schema" and
 * "this connection takes no schema, so there was none" are told apart by
 * reading rather than by guessing.
 *
 * `parse-json@1` stays declared and unchanged: it is content-addressed, other
 * specs pin it, and a reply from `generate-text` still needs it.
 */
export const generateJson = pin(
	describeProvider({
		id: 'core:provider/generate-json@1',
		i18n: { name: { en: 'Generate JSON' } },
		shape: S.textGen,
		effects: 'external',
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		/**
		 * An answer nobody can read costs the structure and nothing else.
		 *
		 * The same guarantee `parse-json@1` makes, kept here because this node
		 * replaced it in the chain: a planner whose document came back malformed
		 * should leave a turn with no plan, narrated anyway, rather than a turn
		 * that failed. The executor records `recoveredAsEmpty` and every
		 * downstream port reads absent, so a `map` over the missing list runs
		 * zero times.
		 */
		optional: true,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				/**
				 * Asked rather than required, which is the `ctx.can` ruling: the
				 * node binds to every text connection and the binding decides
				 * what to do without them. The ladder is `json_schema` (the
				 * shape on the wire, natively or compiled to a grammar), then
				 * `json_object` (JSON, shape unsaid), then a sentence in the
				 * prompt — and the last rung works everywhere, so an absence
				 * costs fidelity rather than the step.
				 */
				optional: ['json_schema', 'json_object'],
				description: 'Which model server this step sends its request to.',
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: 'The written instructions sent with every request from this step.',
				fields: { system: { type: 'text' }, postHistory: { type: 'text' } },
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * Which value inside the answer reaches `value` and `items`.
					 *
					 * A data reference is `{node, port}` with no sub-path, so a
					 * downstream `map` cannot iterate `plan.speakers` off a port
					 * carrying the whole document — the same reason `parse-json`
					 * carries this parameter, and the same spelling.
					 *
					 * Several dotted paths separated by commas are read in order
					 * and their lists joined. That is what makes an answer split
					 * into arms wireable at all: a keeper reports
					 * `{values, possessions}` because a schema can only be strict
					 * about a list whose items are all one shape, and the node
					 * that resolves them takes one list.
					 */
					path: {
						type: 'string',
						quick: true,
						description:
							'Which value inside the answer to publish on `value` and `items`, as a dotted path. Several paths, separated by commas, are joined in order. Empty publishes the whole answer.',
					},
					stopSequences: {
						type: 'string[]',
						description:
							'Sequences that end the reply the moment the model writes one. One per line.',
					},
					streaming: streamingParam(),
				},
			},
		},
		ports: {
			in: {
				context: S.assembled,
				/**
				 * The shape the answer must take, as a JSON Schema document.
				 *
				 * Optional, and the node is useful without it: an unschema'd
				 * request still asks for JSON rather than prose. Supplied, it
				 * reaches whichever field the connection's service calls it —
				 * Ollama's `format`, OpenAI's `json_schema`, a GBNF grammar on
				 * the llama.cpp family — and a connection that takes none
				 * ignores it, which is the degradation rule the adapters
				 * already follow for `responseFormat`.
				 */
				schema: S.json,
			},
			out: {
				/** The parsed document, which is what this node is for. */
				main: S.json,
				json: S.json,
				/** The value at `path` — the document itself when `path` is empty. */
				value: S.json,
				/** That same value as a list, for a `map` to iterate. */
				items: S.json,
				/** What the model actually wrote, for a reader diagnosing the above. */
				text: S.textStream,
			},
		},
	}),
)

export const speak = pin(
	describeProvider({
		id: 'core:provider/speak@1',
		i18n: { name: { en: 'Speak' } },
		shape: S.tts,
		effects: 'external',
		timeoutMs: 60000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.tts,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.audio] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.tts },
			template: {
				kind: 'template',
				engine: jinja2.id,
				facet: 'templates',
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: { skipCodeBlocks: { type: 'boolean', default: true } },
			},
		},
		ports: { in: { text: S.text }, out: { main: S.audio, audio: S.audio } },
	}),
)

/**
 * Render an image.
 *
 * The structural twin of `generate-text` and `speak`, which is the whole point:
 * one node KIND (`provider`), one type per modality, and the type's `shape`
 * naming which one. That shape is what makes an image node offerable only an
 * image connection and an image sampling config — and, just as importantly, what
 * gives whatever is wired downstream a settled answer about what comes out of it.
 * A single "generate anything" provider whose ports changed with its connection
 * would be a node no spec could plan around.
 *
 * ## Nothing here belongs to one backend
 *
 * An A1111-compatible server takes width and height directly and names its
 * schedulers its own way; ComfyUI takes a whole graph; a hosted API ignores seed
 * and steps entirely. None
 * of that appears in this declaration, because a slot only one backend honours is
 * a control that does nothing on the other three. What a backend alone offers
 * lives on its CONNECTION, declared by its adapter as a profile schema; what a
 * person means lives here and in the sampling config, and the adapter translates
 * — reporting whatever it could not carry across rather than dropping it quietly.
 *
 * ## Ports
 *
 * `media` carries references, never bytes (media.ts): the run stores the image
 * and passes its uuid on, so a consumer that attaches it and a consumer that
 * posts it both work from the same stored row rather than from a base64 string
 * travelling through the graph. `image` is the first of them, for the common
 * single-image wiring, and `caption` is the prompt that produced it — which is
 * what a message posting the image usually wants as its text.
 *
 * `init` is declared now rather than added later: img2img changes nothing else
 * about this contract, and retrofitting a port onto a published type costs a
 * version bump for every spec pinning it.
 */
export const generateImage = pin(
	describeProvider({
		id: 'core:provider/generate-image@1',
		i18n: { name: { en: 'Generate image' } },
		shape: S.imageGen,
		effects: 'external',
		// Idle rather than wall: a render is minutes on modest hardware, and a
		// backend still reporting progress is working, not hung.
		timeoutMs: 600000,
		timeoutKind: 'idle',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.imageGen,
				/**
				 * The declaration that makes a KoboldCPP connection offerable
				 * here at all: its TYPE says text, and what it can do says
				 * otherwise.
				 */
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.image] })],
				description: 'Which image server this step sends its request to.',
			},
			sampling: {
				kind: 'sampling',
				quick: true,
				shape: S.imageGen,
				description: 'Steps, CFG, size, seed — the settings every image backend shares.',
			},
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				description: 'How the incoming text becomes what the image model is asked for.',
				fields: {
					positive: { type: 'text' },
					negative: { type: 'text' },
				},
			},
			/**
			 * No `facet`, unlike the text nodes' `weights`: the one parameter
			 * here decides how the request is SENT, and the weights facet is
			 * where a person looks for what the model is asked for.
			 *
			 * On an image backend `off` is the difference between one request
			 * and a render polled for progress and previews, which is the
			 * whole of what a background stage saves by turning it off.
			 */
			params: {
				kind: 'parameters',
				schema: { streaming: streamingParam() },
			},
		},
		media: { emits: ['image', 'video'] },
		ports: {
			in: {
				prompt: S.text,
				negative: S.text,
				/** An input image, for backends that report `img2img`. */
				init: S.media,
			},
			out: {
				main: S.mediaList,
				media: S.mediaList,
				image: S.image,
				caption: S.text,
			},
		},
	}),
)

/**
 * A plugin's own image provider, kept as the worked example of one: same shape,
 * same slots, a `params` schema of its own. Nothing in core dispatches it.
 */
export const renderImage = pin(
	describeProvider({
		id: 'chariot.comfy:render-image@1',
		shape: S.imageGen,
		effects: 'external',
		public: true,
		timeoutMs: 300000,
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.imageGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.image] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.imageGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: {
					positive: { type: 'text' },
					negative: { type: 'text' },
				},
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: { steps: { type: 'integer', default: 25 } },
			},
		},
		ports: {
			in: { context: S.assembled },
			out: { main: S.image, image: S.image },
		},
	}),
)

/** Consumes a stream and may finish before it ends (01 §11). */
export const firstJson = pin(
	describeTaskType({
		id: 'core:task/first-json@1',
		timeoutMs: 5000,
		earlyExit: true,
		ports: { in: { main: S.textStream }, out: { main: S.json } },
	}),
)

/** Same in-port, but no earlyExit declared — used to prove stream-abandoned. */
export const sloppyStream = pin(
	describeTaskType({
		id: 'test:task/sloppy-stream@1',
		timeoutMs: 5000,
		ports: { in: { main: S.textStream }, out: { main: S.json } },
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
 */
export const sessionGreetings = pin(
	describeQueryType({
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
 * The create pipeline's write (24 §12, T8): seed the collected greetings as
 * the session's first messages — one assistant message per entry, the full
 * list as its swipe history, redirected to the genre's declared greeting
 * channel when that is not `main`.
 */
export const seedGreetings = pin(
	describeConsumerTarget({
		id: 'core:consumer/seed-greetings@1',
		effects: 'write',
		timeoutMs: 5000,
		causesEvent: 'core:event/message-created@1',
		ports: {
			in: { greetings: S.json },
			out: { main: S.writeResult, messageIds: S.writeResult },
		},
	}),
)

export const createMessage = pin(
	describeConsumerTarget({
		id: 'core:consumer/create-message@1',
		effects: 'write',
		timeoutMs: 5000,
		causesEvent: 'core:event/message-created@1',
		slots: {
			/**
			 * The write hook (18 §4a): one chain rewrites the final output, the
			 * other decides where a streamed reply stops. Stop is a verdict —
			 * min-reduction across every attached script, and the connection's
			 * own guards join the same union at dispatch (18 §4b), which is why
			 * order never needs ruling. `speakerName` and `castNames` are
			 * extras: readable, never writable, by construction (18 §6a).
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1', 'core:script:text/stop@1'],
				port: 'text',
				phase: 'before',
				extras: ['speakerName', 'castNames'],
				description:
					'Scripts over the reply as it is saved — clean up the text, or stop a streaming reply early.',
			},
		},
		ports: {
			in: {
				text: S.text,
				/**
				 * Media to post WITH the message, as references.
				 *
				 * `attach-image` exists and cannot do this: it needs a messageId
				 * from outside the run, because `write-result@1` is not assignable
				 * to `row-ids@1` — so a message created by one node could never be
				 * attached to by a second. That rule is right (under async review
				 * the created row may never exist), which left no way at all to
				 * post a generated image as a NEW message.
				 *
				 * The answer is the same one streaming got: one node with a settled
				 * output, not two nodes and a hope. The write that creates the
				 * message is the write that attaches its images.
				 */
				media: S.mediaList,
			},
			out: { main: S.writeResult, messageId: S.writeResult },
		},
	}),
)

/**
 * Update an existing message — a regenerate, a swipe, an edit.
 *
 * `target` takes `row-ids@1`, which means **a message created earlier in the same run
 * cannot be updated by a second node**, because `write-result@1` is not assignable to it.
 * That is the ruling, not an oversight: under async review the created row may never
 * exist, so a create → update pair in one spec is a dangling write waiting for a rejection.
 *
 * The case people reach for this with — write a placeholder, fill it as tokens arrive — is
 * streaming, and streaming is one node with a settled output (01 §11), not two nodes and a
 * hope. The case this *is* for is the one where the id comes from outside the run: the user
 * clicked a message, so the id is on the Input.
 */
export const updateMessage = pin(
	describeConsumerTarget({
		id: 'core:consumer/update-message@1',
		effects: 'write',
		timeoutMs: 5000,
		causesEvent: 'core:event/message-updated@1',
		slots: {
			/** The same write hook as `create-message` — see it for the terms. */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1', 'core:script:text/stop@1'],
				port: 'text',
				phase: 'before',
				extras: ['speakerName', 'castNames'],
				description:
					'Scripts over the reply as it is saved — clean up the text, or stop a streaming reply early.',
			},
		},
		ports: {
			in: { target: S.rowIds, text: S.text },
			out: { main: S.writeResult, messageId: S.writeResult },
		},
	}),
)

export const attachAudio = pin(
	describeConsumerTarget({
		id: 'core:consumer/attach-audio@1',
		effects: 'write',
		timeoutMs: 5000,
		causesEvent: 'core:event/message-updated@1',
		ports: { in: { audio: S.audio }, out: { main: S.writeResult } },
	}),
)

export const savePluginData = pin(
	describeConsumerTarget({
		id: 'core:consumer/save-plugin-data@1',
		effects: 'write',
		timeoutMs: 5000,
		ports: { in: { value: S.json }, out: { main: S.writeResult } },
	}),
)

export const emitSocket = pin(
	describeConsumerTarget({
		id: 'core:consumer/emit-socket@1',
		effects: 'emit',
		timeoutMs: 1000,
		ports: { in: { from: S.json }, out: { main: S.json } },
	}),
)

// ── Summarization ───────────────────────────────────────────────────────────
//
// Two phases, and the split is the whole design (see `utils/summarizer`):
// messages are cut into token-sized batches and each is drafted **on its own**,
// then the ordered drafts are merged into one narrative. Drafting a batch in
// isolation is what keeps a long chat summarizable at all — the model never
// sees more than one batch — and it is why the batch step is a `map` rather
// than a loop: the batches do not depend on each other, so nothing forces them
// to be sequential except the connection's own queue.
//
// Each step is its own Provider because each has its own prompt, connection and
// sampling config in the tables this replaces. That was already true; it was
// just spelled as `batch_system_prompt` / `synth_connection_id` columns rather
// than as nodes.

export const summarizeRequest = pin(
	describeInput({
		id: 'core:input/summarize-request@1',
		ports: {
			out: {
				main: S.summarizeRequest,
				scope: S.sessionScope,
				request: S.summarizeRequest,
			},
		},
	}),
)

/** The messages a summary is drawn from, already scoped and ordered. */
export const summarizeSource = pin(
	describeQueryType({
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
 * Cut the messages into batches a model can hold.
 *
 * A Task, not a Query: the cut is a *decision* — how many tokens per batch, and
 * therefore how much context each draft is written against — and it is the
 * first parameter a user with long posts reaches for.
 */
export const batchMessages = pin(
	describeTaskType({
		id: 'core:task/batch-messages@1',
		i18n: { name: { en: 'Batch messages' } },
		timeoutMs: 2000,
		slots: {
			/**
			 * The window the cut is clamped to — the same slot, by reference,
			 * that the drafting step generates against.
			 *
			 * The context window belongs to the sampling config, never to a knob
			 * on a node (17 §1a), and the executor resolves a `sampling` slot to
			 * the config's switched-on *values* — so this stays a pure Task
			 * reading data it was handed rather than a Query looking one up. Same
			 * shape and same reason as `core:task/context-budget@1`.
			 *
			 * ⚠ Wire it as a REFERENCE to the drafting Provider's slot
			 * (`slot.samplingOf(...)`), not as a picker of its own. A batch cut
			 * against one window and drafted against another is wrong in the
			 * direction that overflows, silently — and unlike the assembled
			 * context there is no truncation on this path to catch it, because
			 * the batch prompt is injected whole.
			 */
			sampling: { kind: 'sampling', quick: true },
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * The chat half of a batch prompt, and only that half — the
					 * template around it and the room the draft is written back
					 * into are a reserve the binding adds on top, which is why
					 * this can be raised right up to the window minus that
					 * reserve and no further.
					 *
					 * ⚠ Bigger is not better. Long-context models degrade in the
					 * middle, so this is a QUALITY point rather than a fraction
					 * of whatever window happens to be available: nothing scales
					 * it up to fill a large one, and the window is only ever a
					 * ceiling on what an admin asks for.
					 *
					 * 2560 is 0.5's effective batch (`4096 - 1500`) at a round
					 * 2.5 Ki, so arriving here re-tunes nobody.
					 */
					batchTokens: {
						type: 'integer',
						default: 2560,
						i18n: { en: 'How much chat each batch holds' },
						description: {
							en: 'Tokens of chat one summary draft is written from. Capped by the drafting step\u2019s Context Tokens, less room for the prompt and the draft itself.',
						},
					},
					minBatchMessages: {
						type: 'integer',
						default: 1,
						description: 'Never cut a batch smaller than this many messages.',
					},
				},
			},
		},
		ports: {
			in: { messages: S.messages },
			out: { main: S.drafts, batches: S.drafts },
		},
	}),
)

/** Phase 1 — one batch, drafted without sight of any other. */
export const summarizeBatch = pin(
	describeProvider({
		id: 'core:provider/summarize-batch@1',
		i18n: { name: { en: 'Draft a batch' } },
		shape: S.textGen,
		effects: 'external',
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		/**
		 * The first interior point (18 §4e), and core dogfooding it (07 §0b):
		 * every intermediate draft passes the user's chain before synthesis
		 * reads it — slop killed in the material summaries are built *from*,
		 * not only in final replies. Invoked by the binding via
		 * `ctx.scripts.applyText('each-draft', …)`; recorded per application
		 * as `appliedBy: 'binding'`.
		 */
		scriptPoints: [
			{
				key: 'each-draft',
				i18n: { en: 'Each draft' },
				description: {
					en: 'Runs over every intermediate draft this step produces, before synthesis reads them.',
				},
			},
		],
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { batch: { type: 'text' } },
			},
		},
		ports: {
			// `request` carries what a person asked for — the topic line, most
			// visibly — so the drafting prompt can honour it. The whole request
			// object travels rather than a plucked field, because what the
			// request holds is the socket's contract with its modal, not this
			// node's to enumerate.
			in: {
				batch: S.messages,
				request: S.summarizeRequest,
				/**
				 * Which kind of entry this pipeline writes — the word every
				 * summarize prompt template branches on (D-I).
				 *
				 * ## A port, not a parameter, and the call site is what decides
				 *
				 * `summarizeSpec` writes it as a **literal into the node's
				 * config**, in the same map as `batch` and `request` and
				 * alongside them: `C.summarizeBatch.v1({ batch, request,
				 * loreType, … })`. `resolveInput` passes a non-ref config value
				 * through untouched, so the binding reads `input.loreType`
				 * exactly the way it reads a port — same position, same access,
				 * same absence-is-`undefined`. Declaring it as anything else
				 * would describe a mechanism that is not the one running.
				 *
				 * A `params` field is the alternative, and it is the wrong one
				 * twice over. It would move the read to `input.params.loreType`
				 * — a different value from a different layer — and it would put
				 * the control in the panel, stored per configuration and
				 * layered instance → user → session like every other parameter.
				 * `SummarizeShape` in the catalog already rules on that: this is
				 * "the thing that distinguishes the four namespaces from one
				 * another", and a user who changed it "would turn their scene
				 * summarizer into a world summarizer without renaming
				 * anything".
				 *
				 * ⚠ An in-port no edge feeds is not a contradiction here. A
				 * port is a named input the node reads; where the value comes
				 * from — an upstream node, or an author writing it down — is the
				 * document's business. What the declaration buys is that the
				 * name is now checkable: the app's binding types derive their
				 * legal reads from `ports.in`, so `input.loreTypes` stops
				 * compiling, and the panel and the plugin validator can both see
				 * that this node takes one.
				 *
				 * `text` rather than an enum shape: a shape ids a payload, and
				 * the four legal words are the prompt templates' vocabulary,
				 * which a plugin summarizer is free to extend.
				 */
				loreType: S.text,
			},
			out: { main: S.textStream, draft: S.textStream },
		},
	}),
)

/** Phase 2 — the ordered drafts merged into one past-tense narrative. */
export const summarizeSynth = pin(
	describeProvider({
		id: 'core:provider/summarize-synth@1',
		i18n: { name: { en: 'Synthesize the drafts' } },
		shape: S.textGen,
		effects: 'external',
		timeoutMs: 120000,
		timeoutKind: 'idle',
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { synth: { type: 'text' } },
			},
		},
		ports: {
			// Same `request` pass-through as the batch step: the topic reaches
			// synthesis too, or a focused summary drifts back to a general one
			// the moment the drafts are merged.
			in: {
				drafts: S.drafts,
				request: S.summarizeRequest,
				/** Authored on the node, exactly as on the batch step — see it. */
				loreType: S.text,
			},
			out: { main: S.textStream, content: S.textStream },
		},
	}),
)

/** What the entry gets called. Its own step because it has its own prompt. */
export const nameEntry = pin(
	describeProvider({
		id: 'core:provider/name-entry@1',
		i18n: { name: { en: 'Name the entry' } },
		shape: S.textGen,
		effects: 'external',
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { name: { type: 'text' } },
			},
		},
		ports: {
			in: {
				content: S.text,
				/** Authored on the node, exactly as on the two steps above — see them. */
				loreType: S.text,
			},
			out: { main: S.textStream, name: S.textStream },
		},
	}),
)

/**
 * Who was in the scene — scene summaries only.
 *
 * Present on one summarize pipeline and not the other three, which is exactly
 * why they are four specs rather than one spec with a flag. A flag would put the
 * difference in a condition somebody has to find; four specs put it in the shape.
 */
export const extractCast = pin(
	describeProvider({
		id: 'core:provider/extract-cast@1',
		i18n: { name: { en: 'Extract the cast' } },
		shape: S.textGen,
		effects: 'external',
		timeoutMs: 60000,
		usage: 'response.usage',
		slots: {
			connection: {
				kind: 'connection',
				quick: true,
				shape: S.textGen,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
			},
			sampling: { kind: 'sampling', quick: true, shape: S.textGen },
			prompts: {
				kind: 'prompts',
				quick: true,
				facet: 'prompts',
				fields: { characterExtraction: { type: 'text' } },
			},
			/**
			 * The two halves of a replaceable core function, on the scripts
			 * rung. Scripts here *shape* the extraction — what the model reads,
			 * what the pipeline keeps. Replacing the extractor itself is the
			 * other rung: a same-shaped provider offered by the swap list,
			 * because extraction calls a model and scripts are pure compute.
			 */
			scripts: {
				kind: 'scripts',
				accepts: ['core:script:text/transform@1'],
				port: 'content',
				phase: 'before',
				description:
					'Scripts over the scene text before the extractor reads it — strip out-of-character chatter, normalise a nickname, redact.',
			},
			castScripts: {
				kind: 'scripts',
				accepts: ['core:script:cast/transform@1'],
				port: 'cast',
				phase: 'after',
				description:
					'Scripts over the extracted cast — rename someone, merge aliases, drop a junk detection, add someone the model missed.',
			},
		},
		ports: {
			// `request` carries the known cast list ([id: N] entries) so the
			// extraction prompt can reference real ids — without it the model
			// invents castIds and the resolve step silently drops every one.
			in: {
				content: S.text,
				messages: S.messages,
				request: S.summarizeRequest,
			},
			out: { main: S.json, cast: S.json },
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
 * can edit it before `core:consumer/create-lore-entry@1` stores anything, and a
 * reviewer who has to hunt for the reason will approve without reading.
 *
 * ⚠ It never proposes **secondary** keys. Those carry a user's `selectiveLogic`
 * conditions — *"fire on dragon, but not when statue is present"* — which is an
 * author saying *not here*, and nothing that guesses is entitled to say it.
 */
export const entryKeys = pin(
	describeQueryType({
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
						i18n: { en: 'Most keywords suggested' },
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
						i18n: { en: 'Ordinary words allowed' },
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

/** Write the finished entry. Gate-eligible, so it publishes a write result. */
export const createLoreEntry = pin(
	describeConsumerTarget({
		id: 'core:consumer/create-lore-entry@1',
		i18n: { name: { en: 'Save the lore entry' } },
		effects: 'write',
		timeoutMs: 10000,
		causesEvent: 'core:event/lore-entry-created@1',
		ports: {
			in: { name: S.text, content: S.text },
			out: { main: S.writeResult, entryId: S.writeResult },
		},
	}),
)

// ── Graph build ─────────────────────────────────────────────────────────────
//
// Five LLM steps, each already independently configurable in
// `graph_build_configs` as a `<step>_system_prompt` / `<step>_connection_id` /
// `<step>_sampling_config_id` triple. Five Providers is the same statement with
// the enumeration removed.

export const graphScenes = pin(
	describeQueryType({
		id: 'core:query/graph-scenes@1',
		i18n: { name: { en: 'Scenes to build from' } },
		timeoutMs: 5000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.graphScenes, scenes: S.graphScenes },
		},
	}),
)

const graphStep = (id: string, label: string, field: string, extra: { timeoutMs?: number } = {}) =>
	pin(
		describeProvider({
			id,
			i18n: { name: { en: label } },
			shape: S.textGen,
			effects: 'external',
			timeoutMs: extra.timeoutMs ?? 120000,
			timeoutKind: 'idle',
			usage: 'response.usage',
			slots: {
				connection: {
					kind: 'connection',
					quick: true,
					shape: S.textGen,
					requires: [tf({ in: [IoKinds.text], out: [IoKinds.text] })],
				},
				sampling: { kind: 'sampling', quick: true, shape: S.textGen },
				prompts: {
					kind: 'prompts',
					quick: true,
					facet: 'prompts',
					fields: { [field]: { type: 'text' } },
				},
			},
			ports: {
				in: { scenes: S.graphScenes },
				out: { main: S.json, result: S.json },
			},
		}),
	)

/** Which existing node a mentioned name refers to, or whether it is new. */
export const graphNodeResolution = graphStep(
	'core:provider/graph-node-resolution@1',
	'Resolve nodes',
	'nodeResolution',
)

/** Drop what is not worth graphing before the expensive steps run. */
export const graphPreFilter = graphStep(
	'core:provider/graph-pre-filter@1',
	'Pre-filter',
	'preFilter',
)

/** Whose account of the scene this is. */
export const graphPerspective = graphStep(
	'core:provider/graph-perspective@1',
	'Perspective',
	'perspective',
)

/** The two-sentence introduction written for a newly discovered character. */
export const graphNodeDescription = graphStep(
	'core:provider/graph-node-description@1',
	'Describe new nodes',
	'nodeDescription',
)

/** Did any present character reach a new lifecycle state this scene? */
export const graphStateDetection = graphStep(
	'core:provider/graph-state-detection@1',
	'Detect state changes',
	'stateDetection',
)

/**
 * The proposal, held for review.
 *
 * `effects: 'write'` and therefore gate-eligible, which is the mechanism behind
 * the rule that a graph build **stops at the review screen** and never applies
 * itself. Under `async` review the proposal is exactly that — a proposal — and
 * `write-result@1` is the shape that refuses to be mistaken for row ids.
 */
export const graphProposal = pin(
	describeConsumerTarget({
		id: 'core:consumer/graph-proposal@1',
		i18n: { name: { en: 'Propose graph changes' } },
		effects: 'write',
		timeoutMs: 10000,
		causesEvent: 'core:event/graph-proposal-created@1',
		ports: {
			in: { proposal: S.json },
			out: { main: S.writeResult, proposalId: S.writeResult },
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
 * The session's stats, states and possessions, resolved.
 *
 * `{ world, cast, possessions }` — the same object `stateFor(sessionId)`
 * returns and the shape `state` on `core:task/build-template-context@1` takes.
 * Every value is already resolved down session → lorebook → card →
 * declaration default, with absence meaning **inherit** rather than zero, and
 * derived slots computed rather than read.
 *
 * A Query, and a plain one: what it is is a read. There is no as-of parameter
 * — this is the `current` view, and the temporal registry that would give the
 * other one is not built (see docs/stats-and-states.md).
 */
export const sessionState = pin(
	describeQueryType({
		id: 'core:query/session-state@1',
		i18n: { name: { en: 'Session state' } },
		timeoutMs: 2000,
		ports: {
			in: { scope: S.sessionScope },
			out: { main: S.json, state: S.json },
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
 * `changes` is a list of two arms, discriminated by which key is present:
 * `{ owner, slotId, value }` sets an attribute, `{ owner, entryId, delta }`
 * moves possession of a lorebook entry. One port rather than two because one
 * turn's changes are one ordered list, and splitting them would let a spec
 * apply half of them.
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
 *
 * ## A name it cannot resolve is a RESULT, not a halt
 *
 * A keeper that named five changes and got one character's name wrong should
 * land four proposals and a sentence about the fifth. `refused` carries those
 * sentences so the receipt can show them; `changes` carries what resolved.
 * Halting the turn over one bad name would lose the other four, which is the
 * same argument `set-state`'s own per-change refusal makes.
 */
export const resolveStateChanges = pin(
	describeQueryType({
		id: 'core:query/resolve-state-changes@1',
		i18n: { name: { en: 'Resolve state changes' } },
		timeoutMs: 5000,
		ports: {
			in: {
				/**
				 * `[{ owner, slot, value } | { owner, entryId, delta }]` as a
				 * model writes them: `owner` is a name from the conversation or
				 * `world`, `slot` is a stat's local name (`hp`) or its full id.
				 */
				changes: S.json,
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
			},
			out: {
				main: S.json,
				/** Ready for `core:task/set-state@1`'s `changes` port. */
				changes: S.json,
				/** One sentence per change that named something not here. */
				refused: S.json,
			},
		},
	}),
)

export const setState = pin(
	describeTaskType({
		id: 'core:task/set-state@1',
		i18n: { name: { en: 'Set state' } },
		timeoutMs: 5000,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					mode: {
						type: 'enum',
						of: ['propose', 'apply'],
						default: 'propose',
						quick: true,
						description:
							"'propose' holds the changes for the player to accept or reject; 'apply' writes them immediately, stamped with this run. Use 'apply' only where the pipeline itself decided the number.",
					},
				},
			},
		},
		ports: {
			// [{ owner: { kind, id }, slotId, value } | { owner, entryId, delta }]
			// `scope` is what says which session, and therefore which message a
			// change is anchored to — a change with no anchor is one a swipe
			// could not take back.
			in: { changes: S.json, scope: S.sessionScope },
			/**
			 * What happened, as two lists: `applied` for rows written,
			 * `proposed` for rows held. Both are always present and one of
			 * them is always empty, so nothing downstream decides which mode
			 * ran by looking for a missing key.
			 */
			out: { main: S.json, applied: S.json, proposed: S.json },
		},
	}),
)
