/**
 * Core's **task** node definitions — pure transforms.
 *
 * One file per node kind, with the helpers only that kind uses; `index.ts`
 * re-exports them all.
 */

import { S, tf, IoKinds } from '@serene-pub/sdk'
import { handlebars, liquid } from '@serene-pub/sdk'
import { describeTaskDefinition, pin } from '@serene-pub/sdk'
import { PROMPT_BLOCKS_DECL } from '@serene-pub/sdk'
import type { SlotDecl, VarField } from '@serene-pub/sdk'

// ── Tasks ───────────────────────────────────────────────────────────────────

/** @public */
export const contextBudget = pin(
	describeTaskDefinition({
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
			/**
			 * The connection the reply is sent on — for the model's own
			 * context window (0114), which caps the sampling config's when
			 * the model states one.
			 *
			 * Shared with the generating step in every shipped spec
			 * (`slot.connectionOf('generate')`), on the same terms as
			 * `sampling` above: the budget has to be sized to the window the
			 * request is actually sent against, and the ONE computation of
			 * that window (R-8) reads both halves off the same resolved pair.
			 */
			connection: { kind: 'connection' },
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
 * @public
 */
export const mergeCandidates = pin(
	describeTaskDefinition({
		id: 'core:task/merge-candidates@1',
		timeoutMs: 500,
		ports: {
			in: { sources: S.candidates },
			out: {
				// Both open with the band-intent elements the sources carried
				// (lifted out before the fusion, put back after — a fused rank
				// is never stamped on one); readers call `splitCandidates()`.
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
 * @public
 */
export const concatCandidates = pin(
	describeTaskDefinition({
		id: 'core:task/concat-candidates@1',
		i18n: { name: { en: 'Combine candidates' } },
		timeoutMs: 500,
		ports: {
			in: { sources: S.candidates },
			out: {
				// Both open with band-intent elements — the first per band
				// across every source, hoisted ahead of the items; readers
				// call `splitCandidates()`.
				main: S.candidates,
				candidates: S.candidates,
				/** How many arrived per list, and how many repeats were dropped. */
				diagnostics: S.json,
			},
		},
	}),
)

/**
 * **Eligibility** — the hard gates between the mechanisms and the ranker
 * (C2; owner rulings R2 and R4, 2026-09-30; built 2026-10-02).
 *
 * Scoring and eligibility are separate on purpose: a hard rule must not compete
 * numerically with a soft one and lose. This node scores nothing. It takes the
 * concatenated pool and returns **the same array**, with `ineligible: { reason }`
 * set on each candidate a rule rules out; it never deletes one, so the ranker
 * turns each into an `excluded_ineligible` decision carrying the sentence, and
 * the receipt says why rather than "it scored badly".
 *
 * Its rules, and nothing else:
 *
 * 1. **Exclusions.** A candidate one of the wired `exclusions` lists names
 *    (`{ source, id, reason }` — the keyword lanes publish the entries an
 *    author's own selective logic ruled out). The same entry brought in again
 *    by meaning or by name is the entry the author said *not here*.
 * 2. **Secrecy.** A `relationships` candidate that is somebody's secret
 *    (`payload.secretOf`, the holder's participant reference) is ineligible for
 *    any other `speaker`. Unwired or null, the producers' own scope decided.
 * 3. **Presence** (R4). A candidate about a cast member (`payload.lorebookBindingId`)
 *    whose member has presences on the line and none holding at `at` — the
 *    member is not in the world then. A member with no presences is always
 *    present.
 *
 * Wired between the final concatenation and `rank-hybrid`. A custom source
 * passes through it like a core one: any candidate with a payload saying who it
 * is about is gated the same way.
 * @experimental
 */
export const eligibility = pin(
	describeTaskDefinition({
		id: 'core:task/eligibility@1',
		i18n: { name: { en: 'Check eligibility' } },
		timeoutMs: 500,
		ports: {
			in: {
				candidates: S.candidates,
				/**
				 * `{ source, id, reason }` verdicts — one list, or several as a
				 * nested literal (`[$.a.exclusions, $.b.exclusions]`), the
				 * construction `concat-candidates`' `sources` uses.
				 */
				exclusions: S.json,
				/** Whose turn this pool is for. Null or unwired: no secrecy rule. */
				speaker: S.participantRef,
				/** `core:query/cast-presences@1`'s rows. */
				presences: S.json,
				/** The moment they are judged at — `cast-presences`' `at`. */
				at: S.json,
			},
			out: {
				// The same array, band intents first as they came; readers call
				// `splitCandidates()`.
				main: S.candidates,
				candidates: S.candidates,
				/** How many each rule ruled out. */
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
		 *
		 * Shape `S.decisions` (R64): a node publishing it is recorded in the
		 * ranking store automatically — a plugin's ranker included.
		 */
		decisions: S.decisions,
	},
}

/**
 * The five core bands a context is built from — the members of the ranker's
 * **signal** matrix, which is cross-source and stays here.
 *
 * ⚠ No longer the members of `share` / `maxEntries` / `minEntries`: those are
 * per-source and live on the sources (R-7 P5, `bandIntentFields`), so a plugin
 * adding a sixth band declares its own intent on its own definition and never
 * touches this list. Its candidates score by `presetScore` or by the ranker's
 * lore signal set — a per-band signal row for a plugin band is a follow-up,
 * not something this list can grant. `weights.ts` calls this `RetrievalBand`,
 * and the two must agree — the binding maps straight onto it.
 */
const SOURCES = [
	{
		key: 'messages',
		label: { en: 'Conversation' },
		description: { en: 'The chat itself — what was actually said.' },
		tone: 0,
	},
	{
		key: 'worldLore',
		label: { en: 'World lore' },
		description: { en: 'Lorebook entries about the world.' },
		tone: 1,
	},
	{
		key: 'characterLore',
		label: { en: 'Character lore' },
		description: { en: 'Lorebook entries bound to a character.' },
		tone: 2,
	},
	{
		key: 'history',
		label: { en: 'History entries' },
		description: { en: 'Dated entries recording earlier events.' },
		tone: 3,
	},
	{
		key: 'relationships',
		label: { en: 'Relationships' },
		description: { en: 'The narrative graph. Off by default.' },
		tone: 4,
	},
] as const

/**
 * How the shares the sources declared are turned into token budgets — the one
 * thing about shares that is genuinely the ranker's (16 §5a: Assemble "keeps
 * only what is genuinely global: total budget, truncation policy, and how
 * weights normalize").
 *
 * `relative` is what ships and is arithmetically what has always run: every
 * band with a share above zero gets `pool × share / Σ shares`, so only the
 * ratios matter and a source added or removed re-divides the whole window.
 * `fixed` reads each share as the fraction of the window it says — a source
 * declaring 0.25 gets a quarter whether one other source exists or six — and
 * scales them all down together only when they add up to more than one. In
 * both, whatever a band cannot spend is swept to the others in score order.
 *
 * ⚠ **The per-source maps this file used to declare here are gone** (R-7 P5,
 * 2026-09-16). `share`, `maxEntries` and `minEntries` — five-band maps keyed
 * `{messages, worldLore, characterLore, history, relationships}` — were the
 * per-source table 16 §5a rejected, kept on the ranker rather than on
 * Assemble. Each source declares its own now (`bandIntentFields`) and the
 * ranker reads them off the candidates it is handed (`BandIntent` in the SDK);
 * migration 0135 moved every stored value to the node that owns it. What is
 * left on this node is cross-source only: this, the mechanism and signal
 * weights, and the allocation precedence.
 */
const SHARE_NORMALISATION = {
	type: 'enum' as const,
	of: ['relative', 'fixed'] as const,
	members: [
		{
			key: 'relative',
			label: { en: 'Relative' },
			description: {
				en: "Each source's share is a ratio against the others, so together they always fill the whole window.",
			},
		},
		{
			key: 'fixed',
			label: { en: 'Fixed' },
			description: {
				en: 'Each share is the fraction of the window it states, scaled down only when they add up to more than the whole.',
			},
		},
	],
	default: 'relative' as const,
	label: { en: 'How shares divide the window' },
	description: {
		en: "Whether each source's share is a ratio against the others or the fraction of the window it states.",
	},
} as const

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
 * (S3): the `rank-recall` example ranks without signals, and widening a
 * sibling's declared surface is a hash change on a type nobody meant to touch.
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
		label: { en: 'Keyword match' },
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
		label: { en: 'Name mentioned' },
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
		label: { en: 'Shared entities' },
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
	 * ⚠ **Not zero, and that is deliberate.** The mechanism has one switch, one
	 * level up: `query-windows.searchByMeaning`, on the first node of its chain
	 * since 2026-09-29. It ships *Automatic* — on whenever an embedding model is
	 * set up, local or a service alike, and off when there is none — so nothing
	 * carries this signal on an install with no embedding model or with the
	 * switch Off. Making the weight zero as well would mean
	 * turning the switch on changed nothing, which is the trap a two-switch
	 * feature always sets. One switch, and it is the one named after what it
	 * does.
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
		label: { en: 'Similar meaning' },
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
		label: { en: 'Called by a description' },
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
		label: { en: 'Distinctive words' },
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
		label: { en: 'Recently referenced' },
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
		label: { en: 'Length against the pool' },
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
		label: { en: 'Keywords close together' },
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
		label: { en: 'Author priority' },
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
 * the same reason (S3): the `rank-recall` example does not score with signals,
 * and widening a sibling's declared surface is a hash change on a type nobody
 * meant to touch.
 */
const MECHANISM_WEIGHTS = {
	type: 'strengths' as const,
	min: 0,
	max: 1,
	quick: true,
	members: [
		{
			key: 'keyword',
			label: { en: 'Keywords' },
			description: {
				en: "The author's own trigger words, how distinctive the shared vocabulary is, and how closely the matches clustered.",
			},
			tone: 1,
		},
		{
			key: 'semantic',
			label: { en: 'Meaning' },
			description: {
				en: 'Similarity of meaning, with no shared words required. Needs an embedding model and the semantic arm switched on.',
			},
			tone: 3,
		},
		{
			key: 'name',
			label: { en: 'Names' },
			description: {
				en: 'An entry called by its own name, and entries naming the same people and places as the scene.',
			},
			tone: 2,
		},
	],
	default: { keyword: 1, semantic: 1, name: 1 },
	label: { en: 'How entries are found' },
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
 * On, the precedence inverts to *score allocates, minimums guarantee, shares
 * cap*: the minimums are met first exactly as before, then one pool is spent
 * strictly best-first across every source with each band a ceiling on what one
 * source may take out of it, and the sweep still hands out whatever no source
 * could use. Everything a user can read a promise about is unchanged either
 * way — pins come first and do not consume the entry cap, a band set to zero
 * leaves that source out, minimums are met before any share is worked out, and
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
 * the same reason (S3): the `rank-recall` example does not run this selection,
 * and widening a sibling's declared surface is a hash change on a type nobody
 * meant to touch.
 */
const SCORE_LED_ALLOCATION = {
	type: 'boolean' as const,
	default: false,
	label: { en: 'Let the best entries lead' },
	description: {
		en: 'Spend the whole context on whatever scored highest, wherever it came from, and treat each band as a ceiling rather than a reserved slice. Off divides the context into bands first and fills each one separately, which is how it has always worked.',
	},
} as const

/** @experimental */
export const rankHybrid = pin(
	describeTaskDefinition({
		id: 'core:task/rank-hybrid@1',
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					// Cross-source only (R-7 P5). Ahead of the nine, because it
					// is the altitude a reader starts at: the grouped mechanisms
					// first, the individual signals under them for anyone who
					// wants that far in, then how the sources' shares divide
					// the window and in what precedence it is filled.
					mechanismWeights: MECHANISM_WEIGHTS,
					...SIGNAL_WEIGHT_FIELDS,
					shareNormalisation: SHARE_NORMALISATION,
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
			in: {
				...rankPorts.in,
				/**
				 * **Entries the prompt already shows in a slot of their own**
				 * (lorebooks plan, the room rule, 2026-10-02) — lorebook entry
				 * ids, one or a list (nulls skipped). A lore candidate (world
				 * lore, character lore, history) with one of these ids is
				 * ruled out before ranking, as `excluded_ineligible` with the
				 * reason, so it spends no budget and the prompt never reads it
				 * twice. Adventure and the Lair wire the room their place slot
				 * (`{{locationEntry}}`) shows — the world's `location`,
				 * resolved by `undescribed-name@1`. Unwired, nothing changes.
				 *
				 * ⚠ Not `core:task/eligibility@1`'s `exclusions`: those are
				 * verdicts (a rule that fired, with its sentence); this is a
				 * fact about the prompt, and a bare id is all it needs. On
				 * `rank-hybrid` alone, like the parameters above: the
				 * `rank-recall` example builds no prompt with slots.
				 */
				shownElsewhere: S.json,
			},
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
				 * (S3). The `rank-recall` example computes no per-band usage;
				 * giving it a port it cannot fill would move a hash to declare
				 * a promise it does not keep.
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
/**
 * The two retrieval query windows, as text.
 *
 * A Task because *how a message is written when it is a query* is a decision —
 * speaker attribution in brackets, emphasis stripped — and a different
 * embedding model might want a different shape. It is also where the two
 * windows are cut, which is the parameter a user with long posts will reach for
 * first.
 *
 * And it carries the **semantic mechanism's one switch**, `searchByMeaning`,
 * because it is the first node of the mechanism's chain (2026-09-29, genre
 * uplift C3) — `auto | on | off`, shipping `auto`, which searches whenever an
 * embedding model is set up, wherever it runs (owner, 2026-09-30).
 * @experimental
 */
export const queryWindows = pin(
	describeTaskDefinition({
		id: 'core:task/query-windows@1',
		i18n: { name: { en: 'Retrieval queries' } },
		timeoutMs: 500,
		slots: {
			/**
			 * The **embedding** connection — the one the probes would be
			 * embedded on, for *whether there is one*. Every shipped spec wires
			 * it as this step's own (`slot.connection()`), resolving to the
			 * install's active embedding connection: a pipeline never chooses
			 * its embedding connection, so there is no pick to make here.
			 *
			 * Read for one fact, and only under `searchByMeaning: 'auto'`:
			 * resolved to a connection, an embedding model is **set up** and
			 * `auto` searches; unwired, or resolved to nothing, there is none and
			 * `auto` does not. ⚠ Nothing else about the connection is read — not
			 * where it runs, not whether it bills: a local model and an embedding
			 * service search alike (owner, 2026-09-30). A host that embeds
			 * through one fixed connection must hold this slot there (Serene Pub
			 * offers no pick and drops a stored one), or this step decides about
			 * a connection the embed never uses — INTEGRATING.md, Step 3. A pure
			 * Task reading data it was handed, the `context-budget` shape: the
			 * connection is resolved before the run.
			 *
			 * Until 2026-10-05 it was wired by reference to the embed step's
			 * slot (`slot.connectionOf('semantic.arm.embed')`); `embed-text`
			 * declares no connection now (owner ruling D-c), so the slot states
			 * its own kind.
			 */
			connection: {
				kind: 'connection',
				shape: S.embeddings,
				requires: [tf({ in: [IoKinds.text], out: [IoKinds.embedding] })],
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ **The semantic mechanism's one switch**, on the *first*
					 * node of its chain on purpose — the shape
					 * `mention-spans.maxMentions` gives the entity-vector
					 * mechanism. Off, this cuts no probes: `embed-text` is handed
					 * no texts and makes no model call, and `vector-search`
					 * returns before its reads.
					 *
					 * **`auto`, the default, searches whenever an embedding model
					 * is set up** — a local model, a runtime you run yourself or a
					 * service billed per request, alike — and not when none is (an
					 * optional mechanism that is unavailable is skipped). `on`
					 * searches with whatever model is set up; `off` never
					 * searches. "Set up" is the `connection` slot above resolving
					 * to a connection.
					 *
					 * ⚠ **Where the model runs is not a question it asks.** For
					 * one day (2026-09-29) `auto` searched only with a model on
					 * this machine and skipped a service, read into a ruling about
					 * one expensive call per turn; the owner, 2026-09-30: *"I
					 * never said to skip paid services for retrieval, that's what
					 * they are there for. Don't do that."*
					 *
					 * The vocabulary is `embed-text`'s `enabled` — `auto | on |
					 * off`, labelled Automatic, On, Off — and the question is
					 * not. ⚠ That one says what to do when no model is loaded;
					 * this says whether to search at all. `auto` there calls
					 * whatever is loaded; `auto` here asks whether one is set up.
					 *
					 * It was `vector-search.maxEntries = 0`, on the chain's
					 * *last* node, until 2026-09-29. By then the probes had
					 * been embedded, so every turn with an embedding model
					 * ready paid for an embed it threw away — a provider call
					 * per turn in API mode. `maxEntries` is a ceiling now, and
					 * ships non-zero so that turning this on does something.
					 * It was then a boolean defaulting to off for one day
					 * (C3), which spent nothing and searched nothing.
					 */
					searchByMeaning: {
						type: 'enum',
						of: ['auto', 'on', 'off'],
						members: [
							{
								key: 'auto',
								label: { en: 'Automatic' },
								description: {
									en: 'Searches whenever an embedding model is set up, on this machine or a service, and skips the search when none is.',
								},
							},
							{
								key: 'on',
								label: { en: 'On' },
								description: {
									en: 'Searches on every turn with whatever embedding model is set up.',
								},
							},
							{
								key: 'off',
								label: { en: 'Off' },
								description: {
									en: 'Never searches by meaning, and makes no embedding request for it.',
								},
							},
						],
						default: 'auto',
						quick: true,
						label: { en: 'Search by meaning' },
						description:
							'Find lorebook entries that are about what the conversation is about, even with no keyword in common. Needs an embedding model, and embeds the latest messages on every turn. Automatic searches whenever one is set up.',
					},
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
 * @experimental
 */
export const rankSemantic = pin(
	describeTaskDefinition({
		id: 'core:task/rank-semantic@1',
		i18n: { name: { en: 'Rank semantic results' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					/**
					 * ⚠ No `currentWindow` / `recentWindow` here, and there
					 * were (culled 2026-09-16, R-12). They size the two query
					 * windows — how many messages form the 'current' and the
					 * 'recent' question — which `core:task/query-windows@1`
					 * cuts and declares as its own params. Declared here too,
					 * they were rendered twice and read once: the ranker
					 * receives windows already cut and consults neither.
					 */
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
								label: { en: 'Messages' },
								description: { en: 'Chat messages found by meaning.' },
								tone: 0,
							},
							{
								key: 'worldLore',
								label: { en: 'World lore' },
								description: { en: 'Lorebook entries about the world.' },
								tone: 1,
							},
							{
								key: 'characterLore',
								label: { en: 'Character lore' },
								description: { en: 'Lorebook entries bound to a character.' },
								tone: 2,
							},
							{
								key: 'historyEntry',
								label: { en: 'History entries' },
								description: { en: 'Dated entries recording earlier events.' },
								tone: 3,
							},
							{
								key: 'narrativeRelationship',
								label: { en: 'Relationships' },
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
						label: { en: 'Most matches per kind' },
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
 * @internal
 */
export const rankRecall = pin(
	describeTaskDefinition({
		id: 'chariot.recall:rank-recall@1',
		timeoutMs: 500,
		ports: rankPorts,
	}),
)

/**
 * What Assemble's `render()` puts on a context template itself — see the
 * template slot below. Laid-out values are strings.
 */
const ASSEMBLE_TEMPLATE_SCOPE = {
	worldLore: { type: 'string', optional: true, description: 'World lore that fit the budget, laid out.' },
	characterLore: {
		type: 'string',
		optional: true,
		description: 'Lore bound to a cast member that fit the budget, laid out — only what this speaker may see.',
	},
	history: { type: 'string', optional: true, description: 'History entries that fit the budget, laid out.' },
	currentDate: { type: 'string', optional: true, description: 'The story’s current date, laid out.' },
	sessionMessages: {
		type: 'list',
		description: 'The transcript, oldest first, ending with the seed line.',
		of: {
			type: 'object',
			fields: {
				id: { type: 'number' },
				role: { type: 'string' },
				name: { type: 'string' },
				message: { type: 'string', optional: true },
				/**
				 * 🚧 The line's files, placed (PLAN-composer-attachments
				 * §3.5): media markers, inlined text files and placeholders,
				 * from `core:task/place-attachments@1`. Absent on a line
				 * with no files, and on every line of a spec with no
				 * placement step.
				 */
				attachments: {
					type: 'string',
					optional: true,
					description: "The line's attachments, placed: files the model receives, text files inlined, and names for the rest.",
				},
			},
		},
	},
	injectionsByIndex: {
		type: 'record',
		description: 'Script injections, keyed by the message index they render at.',
		of: {
			type: 'list',
			of: { type: 'object', fields: { role: { type: 'string' }, content: { type: 'string' } } },
		},
	},
	budget: {
		type: 'object',
		description: 'The token budget this prompt was allocated against.',
		fields: { total: { type: 'number' }, used: { type: 'number' }, remaining: { type: 'number' } },
	},
	postHistory: {
		type: 'object',
		optional: true,
		description: 'The post-history block, placed: render it when the loop reaches targetIndex.',
		fields: {
			targetIndex: { type: 'number' },
			instructions: { type: 'string', optional: true },
			charInstructions: { type: 'string', optional: true },
			exampleDialogue: { type: 'string', optional: true },
			hasContent: { type: 'boolean' },
		},
	},
	/**
	 * 🚧 The session's **author's note**, placed (2026-10-02, AN1) — the
	 * person's own steering text for this session, at its own depth, with no
	 * token trigger. Not the post-history reminder: that one is the pipeline's
	 * and the card's "how to respond"; this is the person's "what is true now".
	 * Absent for a genre that declares no `authorsNote` field.
	 */
	authorsNote: {
		type: 'object',
		optional: true,
		description:
			'The session’s author’s note, placed: render it when the loop reaches targetIndex, before the injections and the post-history block.',
		fields: {
			targetIndex: { type: 'number' },
			text: { type: 'string', optional: true },
			role: { type: 'string' },
			hasContent: { type: 'boolean' },
		},
	},
} as const satisfies Record<string, VarField>

/** @public */
export const assemble = pin(
	describeTaskDefinition({
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
				acceptedEngines: [handlebars.id, liquid.id],
				facet: 'templates',
				/**
				 * Assemble's own names — what `render()` writes onto the context
				 * AFTER spreading the prompts and the builder's context, so these
				 * are the last word (typed templates P3, edited in place — owner
				 * ruling Q4).
				 *
				 * Corrected 2026-09-27: this declared `blocks`, `budget` as two
				 * bare names and `prompts` — `blocks` is a param that reorders the
				 * template and never reaches it, and `prompts` is never a name:
				 * the prompts slot's fields are spread at the top level. The
				 * builder's keys and the prompts fields join these in
				 * `templateScopeAt`; declared bands join them too.
				 */
				variables: ASSEMBLE_TEMPLATE_SCOPE,
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
			 * These exist here rather than upstream because they come out the
			 * other side of the budget: what a layout receives is what actually
			 * fit, which no earlier node knows. `characterLore` among them — the
			 * admitted lore of cast members, which a context template places
			 * with `{{{characterLore}}}` like any other lore.
			 */
			variables: {
				kind: 'variables',
				facet: 'variables',
				description:
					'How the retrieved lore and history are laid out — JSON, prose, or whatever you write. Duplicate one to change it.',
				renders: {
					worldLore: 'core:var/world-lore@1',
					characterLore: 'core:var/character-lore@1',
					history: 'core:var/history@1',
					currentDate: 'core:var/current-date@1',
				},
				/**
				 * Open (typed templates P2, edited in place — owner ruling Q4):
				 * every band declared upstream of `candidates` is rendered too,
				 * under its key and through its variable's layout — a plugin's
				 * source adds its band here by declaring it.
				 */
				rendersBands: { from: 'candidates' },
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
					/**
					 * ⚠ No `truncation` here, and there was one — an enum of
					 * `oldest-first | lowest-weight`, "what gets dropped first
					 * when the context is over budget" — declared, rendered,
					 * and read by nothing (culled 2026-09-16, R-12). What LORE
					 * fits is decided upstream by the ranker's `select`, per
					 * band, against `share`, `maxEntries`, `minEntries` and
					 * `scoreLedAllocation` on `core:task/rank-hybrid@1`, and
					 * this node renders the decisions it is handed. A second
					 * drop rule for lore here would be a second owner of one
					 * decision. NOMENCLATURE §25 records the cull.
					 *
					 * ⚠ The TRANSCRIPT is the exception, because nobody else
					 * owns it (B2, 2026-10-03): no shipped spec ranks a message
					 * candidate, so the conversation's rows were never fitted
					 * at all and a long session went out larger than the
					 * window. The host's binding measures what it rendered and,
					 * over the budget, leaves out the oldest lines in a chunk
					 * at a cut point it holds across turns — not a param,
					 * because there is nothing to choose: a prompt that does
					 * not fit is trimmed by the backend instead, from the
					 * front, every turn.
					 */
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
				 * `S.decisions`, matching `rankPorts.out.decisions` (R64) — a
				 * decision is a candidate with its arithmetic attached, and the
				 * panel reads the same objects the allocator does. Typed, so a
				 * plugin ranker wired here publishes the shape the ranking store
				 * records.
				 */
				decisions: S.decisions,
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
				/**
				 * The annex a template may read, as `annex.<owner>.<key>`
				 * (typed templates P6, edited in place — owner ruling Q4).
				 *
				 * Fed ONLY by `core:query/session-annex@1` with `view:
				 * 'template'`: every DECLARED key of every owner in scope —
				 * core, the enabled plugins — for the session's genre, keyed by
				 * owner. A key no declaration covers never arrives, and a
				 * declaration refuses secrets at write time (R61), so what
				 * reaches a template is what an owner said may be kept there
				 * (owner ruling Q1: "nothing dangerous should ever be stored
				 * there"). Law T2 refuses anything else wired here, and a
				 * template-view read wired anywhere else.
				 *
				 * Optional: unwired, `annex` is not in the template's scope at
				 * all, so a template naming it is refused rather than rendering
				 * nothing.
				 */
				annex: S.json,
			},
			out: { main: S.assembled, context: S.assembled },
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

/**
 * What a context builder's `templateContext` carries, in the template type
 * language (typed templates P3, 2026-09-27) — so a template editor offers
 * `{{{characters}}}` with a type, and `templateScopeAt` puts these keys in
 * the scope of whatever template renders the builder's output.
 *
 * Written from what the builder RETURNS (the app's `buildTemplateContext`),
 * not from the legacy `TemplateContext` type, which also lists names only
 * Assemble supplies (`worldLore`, `history`, `currentDate`). The app holds
 * the two together at compile time: the builder's returned object
 * `satisfies VarValue<typeof TEMPLATE_CONTEXT_SCHEMA>`, so a key added on
 * one side and not the other fails `tsc`.
 *
 * Every rendered value is a **string** — each is laid out through its
 * variable's selected layout before it leaves the builder (a user's
 * `{{{characters}}}` would otherwise render `[object Object]`). `state` is
 * the one structure: `templateScopeAt` re-types it from the session genre's
 * attribute slots. `sessionMessages` and `postHistory` are placeholders
 * Assemble supersedes with its own.
 *
 * **Policy** (`portSchemas`): it describes the payload; no hash moves.
 * @experimental
 */
export const TEMPLATE_CONTEXT_SCHEMA = {
	type: 'object',
	fields: {
		instructions: { type: 'string', description: 'The system prompt, resolved and laid out.' },
		characters: { type: 'string', description: 'The cast’s character cards, laid out (JSON by default), trimmed to the session’s character detail.' },
		personas: { type: 'string', description: 'The personas, laid out (JSON by default).' },
		scenario: { type: 'string', description: 'The scenario, resolved and laid out.' },
		characterNames: { type: 'string', description: '“A, B, and C” — every enabled character’s name (none at speaker-only detail).' },
		personaNames: { type: 'string', description: '“A, B, and C” — every persona’s name.' },
		exampleDialogue: { type: 'string', description: 'The speaker’s example dialogue.' },
		postHistoryInstructions: { type: 'string', description: 'The post-history instructions, resolved.' },
		relationshipsPerspectives: { type: 'string', description: 'How the speaker regards everyone.' },
		relationshipsKnown: { type: 'string', description: 'How everyone regards the speaker.' },
		char: { type: 'string', description: 'The speaking character’s name.' },
		character: { type: 'string', description: 'The speaking character’s name.' },
		user: { type: 'string', description: 'The persona’s name.' },
		persona: { type: 'string', description: 'The persona’s name.' },
		postHistory: {
			type: 'object',
			description: 'The post-history block, before Assemble decides where it goes.',
			fields: {
				targetIndex: { type: 'number' },
				instructions: { type: 'string', optional: true },
				charInstructions: { type: 'string', optional: true },
				exampleDialogue: { type: 'string', optional: true },
				hasContent: { type: 'boolean' },
				gatedBy: { type: 'string', optional: true },
			},
		},
		/**
		 * 🚧 The author's note before Assemble places it — present only when
		 * the session's genre declares `authorsNote` and the spec wires the
		 * genre fields into this node. `targetIndex` is a placeholder, as
		 * `postHistory`'s is.
		 */
		authorsNote: {
			type: 'object',
			optional: true,
			description: 'The session’s author’s note, before Assemble decides where it goes.',
			fields: {
				targetIndex: { type: 'number' },
				text: { type: 'string', optional: true },
				role: { type: 'string' },
				depth: { type: 'number' },
				interval: { type: 'number' },
				replyCount: { type: 'number', optional: true },
				hasContent: { type: 'boolean' },
				gatedBy: { type: 'string', optional: true },
			},
		},
		sessionMessages: { type: 'list', description: 'Empty here; Assemble supplies the transcript.' },
		state: {
			type: 'object',
			optional: true,
			description:
				'The session’s stats and states — state.world.<slot>, state.cast.<member>.<slot>, state.locations.<place>.<slot>.',
			fields: { world: { type: 'record' }, cast: { type: 'record' }, locations: { type: 'record', optional: true } },
		},
	},
} as const satisfies VarField

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
 * @public
 */
export const buildTemplateContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-template-context@1',
		i18n: { name: { en: 'Build template context' } },
		timeoutMs: 2000,
		/** What `templateContext` carries — typed templates P3; policy, so no pin moves. */
		portSchemas: { out: { main: TEMPLATE_CONTEXT_SCHEMA, templateContext: TEMPLATE_CONTEXT_SCHEMA } },
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
				 * binding for it unwraps its `sideCharacter` in-port and calls THIS
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
				 * Who is speaking, as a participant reference (R-18 (3); U5g,
				 * 2026-09-16) — the turn strategy's `speaker`. Read for one
				 * thing: an **envoy** (`envoy:<slug>`) has no character row, so
				 * its card — name and description, off the genre's declaration
				 * the cast read carries — is compiled here where a cast
				 * member's would be, through the same `speakerName` /
				 * `speakerCharacter` seam a side character uses. A `character:`
				 * reference changes nothing: `currentCharacterId` already says
				 * it. Optional; unwired on the specs that seat no envoy.
				 */
				speaker: S.participantRef,
				/**
				 * The session's resolved stats and states, as
				 * `core:query/session-state@1` publishes them:
				 * `{ world, cast, locations, slots, who, version }`, already
				 * resolved down the session → lorebook → card → default chain
				 * (a location's: this run's → the entry's → default; 🚧 phase 4).
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
				/**
				 * What the person typed with the press, for an action that
				 * reads its composer text as **direction** (lair pass B17,
				 * 2026-09-27): the Lair's Trigger trap and Reveal, and
				 * Whodunit's Search — what the detective is looking for (genre
				 * uplift C2, 2026-09-29). Rendered as
				 * `{{turnDirection}}` — the same name, and the same meaning,
				 * `build-scene-context@1` gives the Lair's reply (B11). Absent
				 * when blank, so a prompt writes `{{#if turnDirection}}…{{/if}}`
				 * and a press with nothing typed leaves it to the prompt.
				 * Declared here rather than in `contextPorts`, like `state`
				 * above; the narrator and side-character builders declare
				 * their own (C2). Unwired on every spec whose composer text is
				 * a line somebody said.
				 */
				turnDirection: S.text,
				/**
				 * The places the lorebook holds, for an envoy that talks about
				 * the world from outside it (lair re-plan R6, 2026-09-28): the
				 * Lair's Castellan in the Sanctum. A
				 * `core:query/lorebook-entries@1` listing, rendered exactly as
				 * the planner's and the scene's port of this name is —
				 * `{{knownLocations}}` (their names) and `{{locationEntry}}`
				 * (the room the world's `location` names). Declared on THIS
				 * type alone, like `state`; unwired on every other spec.
				 */
				locationEntries: S.json,
				/**
				 * The story's newest rows, for a speaker who talks ABOUT the
				 * story from another channel (lair re-plan R6): the Castellan
				 * in the Sanctum reads `main`'s last few rows. Transcript rows
				 * (a `session-history@1` read), rendered as prose — one
				 * `Name: line` per row, named as the transcript names them, no
				 * JSON blocks — into `{{recentStory}}`, so they are background
				 * in the instructions and never turns the model continues.
				 * Absent when unwired or empty.
				 */
				recentStory: S.messages,
				/**
				 * The session's genre fields, by their own names (lair re-plan
				 * R13, 2026-09-28): `{{sanctumSteers}}` for the Castellan in
				 * the Sanctum, whose instructions say whether its talk shapes
				 * the next turn. The planner's and the scene's `fields`, on the
				 * same terms. Declared on THIS type alone, like `state`;
				 * unwired on every other spec.
				 */
				fields: S.json,
				/**
				 * The speaker's own running notes (lair re-plan R13, owner
				 * 2026-09-28): the Castellan's **scratchpad**, the Lair's annex
				 * field `castellan-scratchpad`, read for it alone
				 * (`session-annex@1`'s AI view, with its own reference as the
				 * speaker). Rendered as `{{scratchpad}}`; absent when unwired
				 * or blank. Declared on THIS type alone, like `state`.
				 */
				scratchpad: S.text,
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
 * @public
 */
export const buildNarratorContext = pin(
	describeTaskDefinition({
		id: 'core:task/build-narrator-context@1',
		i18n: { name: { en: 'Build narrator context' } },
		timeoutMs: 2000,
		/** The same builder, the same payload (`TEMPLATE_CONTEXT_SCHEMA`). Policy. */
		portSchemas: { out: { main: TEMPLATE_CONTEXT_SCHEMA, templateContext: TEMPLATE_CONTEXT_SCHEMA } },
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
		ports: {
			in: {
				...contextPorts.in,
				/**
				 * What the person asked this narration to do (genre uplift
				 * C2, 2026-09-29): the narrator modal's text or `/narrate
				 * <text>` — the turn's triggering text, `$.input.text`.
				 * Rendered as `{{turnDirection}}`, the name and the meaning
				 * `build-template-context@1` and `build-scene-context@1` give
				 * it (B11); absent when blank, so a row writes
				 * `{{#if turnDirection}}…{{/if}}` and an undirected narration
				 * renders exactly what it did before.
				 *
				 * ⚠ Declared because the placeholder's `instructions` is not
				 * a prompt: it is stored beside the row and shown with it. For
				 * as long as that was the direction's only reader, 0.5.3's
				 * _Additional focus for this response_ reached no model.
				 */
				turnDirection: S.text,
			},
			out: contextPorts.out,
		},
	}),
)

/**
 * The side-character pipeline's context builder (ruling 2026-09-07).
 *
 * Same implementation and the same ports as the other two, plus one in-port —
 * `sideCharacter` — and that port is the whole reason it is a third type rather
 * than a flag.
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
 * class this whole split exists to remove. `sideCharacter` carries the name and
 * the card; the id stays where the host can act on it.
 *
 * ⚠ **The OUT-port `speaker` is the other half of that sentence** (added
 * 2026-09-17, W1). The half-working control was a speaker id that changed the
 * prompt's voice and not the lore; the repair is not an in-port but a lane
 * inside the same clause reading the answer this node already computed —
 * `core:query/character-lore@1` takes `speaker`, so the voice and its private
 * knowledge move together or not at all.
 * @experimental
 */
export const buildSideCharacterContext = pin(
	describeTaskDefinition({
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
				 * `{ name, characterId, ref, known, character }`, from the
				 * trigger's first step. `name` is what the seed line carries and
				 * what `{{char}}` renders; `character` is the card, absent for a
				 * free-form name, which is a normal turn rather than a degraded
				 * one — the builder falls back to the name it was given,
				 * because a typed name is all there is.
				 *
				 * `characterId` (a row id) or `ref` (a participant reference,
				 * `character:<id>` — what a pressed option carries, plan A28
				 * review) names the speaker BY ROW, and then the row is who
				 * speaks: the name is a label, never a second lookup, so two
				 * people sharing a name stay two people and a row the cast does
				 * not seat is still the person it names. A fact with neither
				 * resolves by name against the cast.
				 *
				 * Was `speaker` until 2026-09-16 — see the inlet's port of
				 * this name for why the fact moved off that word.
				 */
				sideCharacter: S.json,
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
				/**
				 * The rooms, listed (`core:query/lorebook-entries@1`), as the
				 * planner and the scene get them (lair pass R8, 2026-09-28):
				 * `{{knownLocations}}` and the one the party stand in as
				 * `{{locationEntry}}`, so a voice can name the room it is in
				 * now that nobody narrates it first. Unwired, neither renders.
				 */
				locationEntries: S.json,
				/**
				 * A place described only in prose, as `{{locationPassage}}`
				 * (lair pass R9, 2026-09-28): the paragraph
				 * `core:task/undescribed-name@1` found describing the room the
				 * party are about to walk into (its `passage`), when no entry
				 * describes it — that room's text for this turn. Blank or
				 * unwired, it does not render.
				 */
				locationPassage: S.text,
				/**
				 * What the person asked this side character's turn to do
				 * (genre uplift C2, 2026-09-29) — the narrator modal's text,
				 * which feeds both of its halves. `{{turnDirection}}`, on the
				 * terms `build-narrator-context@1` states; wired by
				 * `core:spec/chat-side-character` alone, so a genre's voices
				 * (whose composer text is a line somebody said) render
				 * nothing new.
				 */
				turnDirection: S.text,
			},
			out: {
				...contextPorts.out,
				/**
				 * Who this voice is, as a **participant reference** — the row
				 * the fact named (`characterId` or `ref`), else
				 * `character:<id>` for a name the cast holds, else null for a
				 * free-form one. Additive, 2026-09-17 (W1). A lore read wired
				 * to it takes null as unwired, so the run's scope decides for
				 * a free-form voice.
				 *
				 * The resolution already happened: this node derives the
				 * speaking character from the `sideCharacter` fact so the card,
				 * `{{char}}` and the seed line agree. Publishing it is what lets
				 * a lore lane INSIDE the same `each` be handed the same answer
				 * — `speaker: $.voices.item.context.speaker` on
				 * `core:query/character-lore@1` — rather than a second
				 * name-to-row match somewhere downstream, which is how the
				 * prompt's speaker and the lore's speaker come to disagree.
				 *
				 * ⚠ It is published, never taken: there is still no
				 * `currentCharacterId` IN-port here, for the reason the header
				 * gives. What changed is that the id the node computed is now
				 * readable, not that a spec may set it.
				 */
				speaker: S.participantRef,
			},
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
/**
 * ⚠ Returns the literal slot keys, not `Record<string, SlotDecl>` — as
 * `loreSlots` and `relationshipSlots` do. The erased form made
 * `SlotNamesOf<typeof buildPlannerContext>` `never`, so a handler bound to the
 * three surfaces could type-check reading NO slot and declare NO slot read,
 * which is the "declares least, checked least" hole `nodeInput.ts` warns about.
 * Found when the surfaces gained `reads` declarations (R-12, 2026-09-16).
 */
const agentContextSlots = (promptFields: Record<string, { type: 'text' }>) =>
	({
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
	}) satisfies Record<string, SlotDecl>

/**
 * The planner's context: the cast, the state, and nothing about a speaker.
 *
 * A planner decides who speaks; it is not itself anybody, so
 * `currentCharacterId` is deliberately absent rather than declared and left
 * empty. What it publishes is what every other builder publishes, so the
 * planner's prompt is assembled by the same node as everyone else's.
 * @experimental
 */
export const buildPlannerContext = pin(
	describeTaskDefinition({
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
				/**
				 * What the person just sent, when the genre reads it as
				 * **direction** rather than as a line somebody said (lair pass
				 * B11, 2026-09-27) — the Lair's composer. On the template
				 * context and in the prompt as `{{turnDirection}}`; empty or
				 * absent on a turn nobody directed (a Continue), so a prompt
				 * writes `{{#if turnDirection}}…{{/if}}`. A genre whose composer
				 * text is a participant's line leaves it unwired: that line is
				 * already in the transcript. *Turn* direction, never bare
				 * `direction`: that word is the Lair's standing-note state slot
				 * (`core:slot/direction@1`), a different fact (R1, renamed
				 * 2026-09-27).
				 */
				turnDirection: S.text,
				/**
				 * The places the lorebook holds — a
				 * `core:query/lorebook-entries@1` listing of location entries
				 * (lair pass B13, 2026-09-27). On the template context as
				 * `{{knownLocations}}` (their names, one line) and
				 * `{{locationEntry}}` (the entry whose name is the world's
				 * `location` slot — where the party are, its exits included),
				 * whatever the retrieval ranking admitted: a planner that is
				 * never shown the room it stands in cannot tell an open door
				 * from an unbuilt one. Both are absent when nothing is listed.
				 */
				locationEntries: S.json,
				/**
				 * **Side talk** (lair re-plan R13, 2026-09-28): what was said on
				 * another channel since the story's last line — the Lair's
				 * Sanctum talk, read by `session-history@1` with
				 * `unplayedOnly`. Transcript rows, rendered as prose into
				 * `{{sideTalk}}` (one `Name: line` per row, as `recentStory`
				 * is), so a prompt gives it its own labelled block and it never
				 * reads as story turns. Absent when unwired or empty: the Lair
				 * wires it only while the session's _Sanctum talk steers the
				 * story_ is on.
				 */
				sideTalk: S.messages,
				/**
				 * The planner's own running notes (lair re-plan R13, owner
				 * 2026-09-28): the Castellan's **scratchpad**, rendered as
				 * `{{scratchpad}}`. Absent when unwired or blank; the Lair
				 * wires it beside `sideTalk`.
				 */
				scratchpad: S.text,
				/**
				 * **How the cast stand with each other** (genre plan F6(a),
				 * 2026-09-29): the ranker's allocated candidates, of which the
				 * builder reads the `relationships` band's `castRelationships`
				 * lane — `core:query/relationship-search@1` read with nobody
				 * speaking. Rendered as `{{castRelationships}}`: JSON keyed by
				 * who holds each view, then by whom it is of, in rank order.
				 * Only what the budget
				 * admitted arrives, so a band at share 0 renders nothing. Absent
				 * when unwired or empty.
				 *
				 * ⚠ On the planner and the scene only — the game master's two
				 * agents. A voice is a cast member speaking, and
				 * `build-side-character-context@1` has no such port on purpose:
				 * another member's secret must never reach it.
				 */
				castRelationships: S.candidates,
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
 * @experimental
 */
export const buildSceneContext = pin(
	describeTaskDefinition({
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
				/**
				 * What the person just sent, when the genre reads it as
				 * **direction** rather than as a line somebody said (lair pass
				 * B11, 2026-09-27) — the Lair's composer. On the template
				 * context and in the prompt as `{{turnDirection}}`; empty or
				 * absent on a turn nobody directed (a Continue), so a prompt
				 * writes `{{#if turnDirection}}…{{/if}}`. A genre whose composer
				 * text is a participant's line leaves it unwired: that line is
				 * already in the transcript. *Turn* direction, never bare
				 * `direction`: that word is the Lair's standing-note state slot
				 * (`core:slot/direction@1`), a different fact (R1, renamed
				 * 2026-09-27).
				 */
				turnDirection: S.text,
				/**
				 * The places the lorebook holds — a
				 * `core:query/lorebook-entries@1` listing of location entries
				 * (lair pass B13, 2026-09-27). On the template context as
				 * `{{knownLocations}}` (their names, one line) and
				 * `{{locationEntry}}` (the room the world's `location` names,
				 * else the planner's location hint — where the party are, its
				 * exits included), whatever the retrieval ranking admitted: a
				 * planner that is never shown the room it stands in cannot
				 * tell an open door from an unbuilt one. Both are absent when
				 * nothing is listed.
				 */
				locationEntries: S.json,
				/**
				 * **Side talk** (lair re-plan R13, 2026-09-28), on the
				 * planner's terms: the Lair's Sanctum talk since the story's
				 * last line, rendered as prose into `{{sideTalk}}` — for the
				 * Castellan's narration, wired while the session's _Sanctum
				 * talk steers the story_ is on, or when Narrate was pressed in
				 * the Sanctum. Absent when unwired or empty.
				 */
				sideTalk: S.messages,
				/**
				 * How the cast stand with each other, on the narrator's terms
				 * — the same port as the planner's (F6(a), 2026-09-29), rendered
				 * as `{{castRelationships}}`. See `buildPlannerContext`.
				 */
				castRelationships: S.candidates,
				/**
				 * **Whose lines this call writes** (Lair party speech,
				 * 2026-09-30): a list of side-character facts — the planner's
				 * `{ name, intent }`, or `{ characterId }` for a picked
				 * delver — rendered as `{{partySpeakers}}`, one line per
				 * speaker in order: the name the cast gives them, then what
				 * they mean to do when the fact says. A nested list is read
				 * flat, so a spec may hand `[first, rest]` from
				 * `split-first@1` as it is. A name the cast does not hold is
				 * kept as written. Absent when unwired or empty.
				 *
				 * For a call that writes the cast's lines **as nobody's
				 * voice** — the Lair's Castellan speaking for the party: this
				 * surface hears no holder-only slot and reads no member's
				 * private lore, so naming the speakers here gives away nothing
				 * a voice of their own would keep.
				 */
				partySpeakers: S.json,
				/**
				 * 🚧 **Which places' stats this surface reads** (place sight,
				 * owner ruling 2026-09-30), a literal: `'reach'` — the place
				 * the scene is at and the places one way from it (the room's
				 * listed links to other places, the "From here:" ways); every
				 * other place's stats are left out, its name kept. Absent, the
				 * session's sight: every place it sees. The Lair's Castellan
				 * speaking for the party wires `'reach'`; its narration does
				 * not.
				 */
				placeSight: S.json,
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
 * @experimental
 */
export const buildKeeperContext = pin(
	describeTaskDefinition({
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
 * @public
 */
export const processMessages = pin(
	describeTaskDefinition({
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
				 * model starts the reply. Every spec but an extend leaves it
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
 * @public
 */
export const proseTranscript = pin(
	describeTaskDefinition({
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
 * 🚧 **Where each line's attachments go** (PLAN-composer-attachments §3.5; owner
 * D2/D3, 2026-10-02).
 *
 * Pure. Takes the processed lines and the attachments by message, and gives
 * each line an `attachments` string the template renders after the line's text
 * (`{{{attachments}}}` in the shipped template):
 *
 *  - an image or PDF the call can read, within `mediaLookback` messages of the
 *    end, becomes a **media marker** the prompt parser lifts onto that line's
 *    own turn;
 *  - a text file becomes a fenced block with its name, trimmed to
 *    `textFileTokens` with a stated note — never silently;
 *  - anything else — a kind the call cannot read, or media older than the
 *    lookback — becomes a **placeholder**: `[image: cat.png]`, with the
 *    person's description when there is one.
 *
 * What the call can read comes from its `connection` slot — wire it with
 * `slot.connectionOf('<the step that sends the prompt>')` — whose descriptor
 * carries `metadata.reads` (`ConnectionReadsV1`). Unwired, the call reads no
 * media and every image is a name: what a text-only step such as a summary
 * wants. A line with no files is passed through untouched, so a transcript
 * with no attachments renders byte for byte what it did without this step.
 *
 * `notes` are sentences for the run's receipt ("2 images older than the media
 * lookback were sent as names").
 * @experimental
 */
export const placeAttachments = pin(
	describeTaskDefinition({
		id: 'core:task/place-attachments@1',
		i18n: { name: { en: 'Place attachments' } },
		timeoutMs: 1000,
		slots: {
			connection: {
				kind: 'connection',
				shape: S.textGen,
				description:
					'Which step these lines are written for. Point it at the step that sends the prompt: what that step can read decides whether an image is sent or named.',
			},
			params: {
				kind: 'parameters',
				facet: 'weights',
				schema: {
					mediaLookback: {
						type: 'integer',
						min: 0,
						default: 10,
						label: { en: 'Media lookback (messages)' },
						description: {
							en: 'Images and PDFs in the last this-many messages are sent to the model; older ones are sent as their names. Set to zero to send every attachment as a name.',
						},
					},
					textFileTokens: {
						type: 'integer',
						min: 0,
						default: 4000,
						label: { en: 'Text file budget (tokens)' },
						description: {
							en: 'How much of each attached text file goes into the prompt. A longer file is cut here, and the prompt says it was cut.',
						},
					},
				},
			},
		},
		ports: {
			in: { messages: S.messages, attachments: S.mediaByMessage },
			out: { main: S.messages, messages: S.messages, notes: S.json },
		},
	}),
)

/**
 * The turn-order pool, orderer and strategies (PLAN-turn-order §4.4, R3/R8;
 * re-ported in place 2026-09-22, pre-release).
 *
 * Turn order is **state**, not a decision made inside the reply run
 * (§3). One spec per genre — `core:spec/<genre>-turn-order` — answers a session event by
 * reading the cast and the history, pooling who *may* be seated, ordering
 * them, turning them into entries, and writing the result to
 * `sessions.metadata.turnOrder`. The reply run then fires an entry; it
 * decides nothing.
 *
 * Three node families, composable in that order:
 *
 * - **the pool** (`turn-pool`) decides who may be seated at all, from the
 *   settings document's cast. Its params are the genre's and the session's
 *   to set; its floors are not (a removed row is never a candidate, and an
 *   `on-action` envoy speaks only through its action).
 * - **an orderer** (`turn-mentioned`) rewrites the candidate list's order
 *   and hands on the same shape, so any number of them compose.
 * - **a strategy** turns candidates into *entries*: who speaks, where, and
 *   what to fire. It is the last node before the write.
 *
 * ⚠ **No `speaker` in-port, and no halt** (§4.4, §6). An explicit pick never
 * enters a strategy — a person's pick is fired directly (`fireTurnEntry`,
 * §4.6) and the next recompute sees the row it produced — and a strategy
 * that seats nobody publishes an **empty order**, which is an answer. The
 * halt (`nobody is due`) and the `characterId` port went with the decider
 * they belonged to.
 */
const turnStrategy = <Id extends string>(id: Id, label: string, extras: object = {}) =>
	describeTaskDefinition({
		id,
		i18n: { name: { en: label } },
		timeoutMs: 1000,
		...extras,
		ports: {
			in: {
				/** Who may be seated — the pool's output, through any orderers. */
				candidates: S.turnCandidates,
				/** The session's visible history, ascending. */
				messages: S.messages,
			},
			out: {
				/**
				 * The prepared turns, in order. `main` and `order` carry the
				 * same value: `main` is what the shape-based swap list keys
				 * on (a strategy is a node publishing `turn-entries@1`), and
				 * `order` is what `set-turn-order` is wired from, named for
				 * what it is.
				 */
				main: S.turnEntries,
				order: S.turnEntries,
			},
		},
	})

/**
 * Round robin: the candidates that have not spoken since the last user row,
 * in candidate order. A character spoke when a non-hidden, non-narrator row
 * after the last user row carries its id; an envoy when `metadata.speaker`
 * carries its reference; a persona when a user row carries its `personaId`
 * — which is how a session knows it is the person's turn (R15).
 * @experimental
 */
export const turnRoundRobin = pin(turnStrategy('core:task/turn-round-robin@1', 'Round robin'))
/**
 * A seeded uniform pick over the not-yet-spoken candidates — one entry.
 * `declaresRandomness`, so a replayed run re-rolls identically; an
 * unrelated recompute may roll differently, which is documented rather than
 * prevented (§4.4).
 * @experimental
 */
export const turnRandom = pin(
	turnStrategy('core:task/turn-random@1', 'Random', {
		declaresRandomness: true,
	}),
)
/**
 * Round robin over the candidates whose `ownerUserId` is the last sender's,
 * so one person's cast completes a turn before another's; plain round robin
 * when that set is empty. The rule narrows, it never starves.
 * @experimental
 */
export const turnUserSplit = pin(
	turnStrategy('core:task/turn-user-split@1', 'Round robin by user'),
)
/**
 * Round robin, with the `select` point free to rewrite it: the host hands
 * `{ order, candidates, lastSpeaker, sinceUser }` to a
 * `core:script:turn/select@1` chain and keeps the entries it returns whose
 * `ref` is a candidate — a script cannot seat somebody the pool did not
 * admit, and a refusal is a receipt note. Entries the chain changed carry
 * `via: 'script'`.
 * @experimental
 */
export const turnScripted = pin(
	turnStrategy('core:task/turn-scripted@1', 'Scripted', {
		scriptPoints: [
			{
				key: 'select',
				accepts: ['core:script:turn/select@1'],
				label: { en: 'Order the turns' },
				description: {
					en: 'Scripts that rewrite the prepared order, in order — each is handed the order so far and hands one back.',
				},
			},
		],
	}),
)
/** Always an empty order: nothing is prepared, and every turn is a press. @experimental */
export const turnManual = pin(turnStrategy('core:task/turn-manual@1', 'Manual'))
/**
 * One entry in the pipeline's own voice (`{ ref: null, via: 'voice' }`) when
 * the last row is a user row, else empty. How a planner genre — Adventure,
 * the Lair, the Whodunit showcase plugin — gets exactly one reply per send
 * with no cast in the pool at all.
 * @experimental
 */
export const turnNarrator = pin(
	turnStrategy('core:task/turn-narrator@1', 'Narrator replies'),
)

/**
 * The pool (§4.4): who *may* be seated this recompute, from the settings
 * document's cast and the history.
 *
 * Its four params are the whole of a genre's or a session's say over
 * eligibility. Two floors are not params, because a param that could
 * override them would be a way to seat somebody who has left: a row with
 * `removedAt` is never a candidate, and an envoy declared `speaks:
 * 'on-action'` is never a candidate — it speaks through its action's
 * outputs alone.
 *
 * Output order is characters by `position`, then personas by `position`,
 * then envoys by `position`. An orderer may rewrite it; a strategy reads it
 * as given.
 * @experimental
 */
export const turnPool = pin(
	describeTaskDefinition({
		id: 'core:task/turn-pool@1',
		i18n: { name: { en: 'Turn pool' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					characters: {
						type: 'enum',
						of: ['active', 'all', 'none'],
						members: [
							{
								key: 'active',
								label: { en: 'Active' },
								description: { en: 'The characters switched on in the cast.' },
							},
							{
								key: 'all',
								label: { en: 'All' },
								description: { en: 'Ones switched off in the cast too.' },
							},
							{ key: 'none', label: { en: 'None' } },
						],
						default: 'active',
						label: { en: 'Characters' },
						description: {
							en: "Which of the session's characters may take a turn. 'All' admits ones switched off in the cast; a removed character never is.",
						},
					},
					personas: {
						type: 'enum',
						of: ['none', 'all', 'others'],
						members: [
							{ key: 'none', label: { en: 'None' } },
							{
								key: 'all',
								label: { en: 'All' },
								description: { en: 'Everyone in the session.' },
							},
							{
								key: 'others',
								label: { en: 'Others' },
								description: { en: 'Everyone but whoever just wrote.' },
							},
						],
						default: 'all',
						label: { en: 'Personas' },
						description: {
							en: "Whether the people in the session appear in the order. A person's entry is shown as their turn and never generated — that is how a session says it is your turn. 'Others' leaves out whoever just wrote.",
						},
					},
					envoys: {
						type: 'enum',
						of: ['in-turn', 'none', 'only', 'except'],
						members: [
							{
								key: 'in-turn',
								label: { en: 'Those that take turns' },
								description: {
									en: 'Envoys declared to speak in turn; one that speaks only on an action never does.',
								},
							},
							{ key: 'none', label: { en: 'None' } },
							{
								key: 'only',
								label: { en: 'Only' },
								description: { en: 'Only the envoys in the list below.' },
							},
							{
								key: 'except',
								label: { en: 'Except' },
								description: { en: 'Every envoy but those in the list below.' },
							},
						],
						default: 'in-turn',
						label: { en: 'Envoys' },
						description: {
							en: "Which of the genre's envoys may take a turn. 'Only' and 'Except' read the list below.",
						},
					},
					envoySlugs: {
						type: 'string',
						list: true,
						default: [],
						label: { en: 'Envoy list' },
						description: {
							en: "The envoys 'Only' admits, or 'Except' leaves out. Ignored otherwise.",
						},
					},
				},
			},
		},
		ports: {
			in: {
				/** The settings document's cast, envoys included (§4.12). */
				cast: S.sessionCast,
				/** The session's visible history, ascending. */
				messages: S.messages,
			},
			out: { main: S.turnCandidates },
		},
	}),
)

/**
 * The first orderer (R8): mentioned candidates sort to the front.
 *
 * A composable node rather than a seventh strategy, because "who was named"
 * and "whose turn it is" are two questions — a session can have the
 * mentioned rule under round robin, under user-split or under a plugin's
 * strategy by placing this before any of them.
 *
 * Case-insensitive whole-word match of each candidate's `name` and
 * `nickname` against the most recent `lookback` **user** rows; mentioned
 * candidates move to the front ordered by first mention, and the rest keep
 * the order they arrived in. The receipt records `mentioned`. (A
 * gazetteer-backed match is a later improvement; this is names.)
 * @experimental
 */
export const turnMentioned = pin(
	describeTaskDefinition({
		id: 'core:task/turn-mentioned@1',
		i18n: { name: { en: 'Mentioned first' } },
		timeoutMs: 1000,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					lookback: {
						type: 'integer',
						default: 1,
						min: 1,
						label: { en: 'Messages scanned' },
						description: {
							en: 'How many of your most recent messages are read for names.',
						},
					},
				},
			},
		},
		ports: {
			in: { candidates: S.turnCandidates, messages: S.messages },
			out: { main: S.turnCandidates },
		},
	}),
)

/**
 * Tool calling's two pure halves (20 §9). A *tool* is any same-shaped
 * provider — a sandboxed plugin hook canonically — and these tasks only
 * decide how the model learns about it and how its answer is read back.
 * Between them sits the ordinary generate step; around them sits the loop
 * block, whose iterations are the receipted agentic turn.
 * @experimental
 */
export const advertiseTools = pin(
	describeTaskDefinition({
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
						members: [
							{
								key: 'native',
								label: { en: 'Native tool calling' },
								description: { en: "Hands the declarations to the API's own tool-calling." },
							},
							{
								key: 'prompt',
								label: { en: 'In the prompt' },
								description: { en: 'Writes them into the context, for models without tool-calling.' },
							},
						],
						default: 'prompt',
						description:
							"How the model learns its tools: natively through the API's own tool-calling, or written into the prompt for models without one.",
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

/** @experimental */
export const parseToolCall = pin(
	describeTaskDefinition({
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
 * @experimental
 */
export const joinText = pin(
	describeTaskDefinition({
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
 * A document's lists, as one **folded section** a reply carries collapsed
 * (lair pass B5, decision D5, 2026-09-27).
 *
 * The producer the message outlets' `sections` in-port was built for: a
 * planner's document is structure, and the person reading the reply wants its
 * beats and speakers as a short list under a "Plan" heading — never the JSON,
 * and never in the body. `path` names the keys read, comma-separated and in
 * order; each list entry becomes one line, and an object entry reads as its
 * own text values joined with ` — ` (`sectionItemsOf` in the SDK is the one
 * reading). A document with nothing to list publishes an empty list, which a
 * write takes as "no sections".
 *
 * `kind` and `label` are parameters, not ports: they are what the section IS,
 * chosen by whoever wires it, and a model never names them.
 * @experimental
 */
export const listSection = pin(
	describeTaskDefinition({
		id: 'core:task/list-section@1',
		i18n: { name: { en: 'List section' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					path: {
						type: 'string',
						default: '',
						description:
							'Which keys of the document to list, comma-separated and in order. Empty lists the document itself.',
					},
					kind: {
						type: 'string',
						default: 'notes',
						description: "The section's kind: a lowercase slug such as 'plan'.",
					},
					label: {
						type: 'string',
						default: 'Notes',
						description: "The heading the section's button shows.",
					},
				},
			},
		},
		ports: {
			in: { json: S.json },
			out: {
				main: S.foldedSections,
				sections: S.foldedSections,
				/**
				 * The same lines as a markdown list, one `- ` item per line
				 * (lair pass R8, 2026-09-28) — for a message whose BODY is the
				 * list: the Lair's beats row in the Sanctum. Empty when
				 * nothing was listed.
				 */
				text: S.text,
			},
		},
	}),
)

/**
 * A list, split into its **first** item and the **rest**, in order (lair pass
 * R8, 2026-09-28).
 *
 * A data reference is `{node, port}` with no sub-path, and `parse-json@1`'s
 * `path` selects a key or an index but never a tail — so a spec that treats
 * the first of a list differently from the others (the Lair's lead delver,
 * whose line streams into the run's live row, before the rest of the party
 * speak in an `each`) had no way to name "all but the first". Pure: no read,
 * no model, 1 ms.
 *
 * `first` is absent on an empty list, so a junction on it skips the step
 * that needs one; `rest` is always a list — empty on a list of one or none —
 * so an `each` wired to it never has to defend itself. Anything that is not
 * a list is a list of one.
 * @experimental
 */
export const splitFirst = pin(
	describeTaskDefinition({
		id: 'core:task/split-first@1',
		i18n: { name: { en: 'Split first' } },
		timeoutMs: 500,
		ports: {
			in: { items: S.json },
			out: { main: S.json, first: S.json, rest: S.json },
		},
	}),
)

/**
 * A model's JSON answer, read back as data.
 *
 * ## Why a Task and not a shape on the Provider
 *
 * `core:oracle/generate-text@1` is published and frozen, and it publishes
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
 * @experimental
 */
export const parseJson = pin(
	describeTaskDefinition({
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

/** @internal */
export const roll = pin(
	describeTaskDefinition({
		id: 'chariot.dice-tray:roll@1',
		i18n: { name: { en: 'Roll dice' } },
		timeoutMs: 200,
		declaresRandomness: true,
		ports: {
			in: { notation: S.text },
			out: { main: S.json, total: S.json },
		},
	}),
)

/** @internal */
export const gate = pin(
	describeTaskDefinition({
		id: 'test:task/gate@1',
		timeoutMs: 500,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

/** @internal */
export const slow = pin(
	describeTaskDefinition({
		id: 'test:task/slow@1',
		timeoutMs: 30,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

/** @internal */
export const passthrough = pin(
	describeTaskDefinition({
		id: 'test:task/passthrough@1',
		timeoutMs: 500,
		toggleable: true,
		ports: { in: { main: S.json }, out: { main: S.json } },
	}),
)

/** @internal */
export const badToggleable = pin(
	describeTaskDefinition({
		id: 'test:task/bad-toggleable@1',
		timeoutMs: 500,
		toggleable: true,
		ports: { in: { main: S.text }, out: { main: S.image } },
	}),
)

/**
 * A stream consumer with no `earlyExit` declared — the fixture that proves
 * stream-abandoned. Its `earlyExit: true` twin lives with the SDK's own suite
 * (`sdk-tests/fixtures.ts`), where the early-exit proofs are.
 * @internal
 */
export const sloppyStream = pin(
	describeTaskDefinition({
		id: 'test:task/sloppy-stream@1',
		timeoutMs: 5000,
		ports: { in: { main: S.textStream }, out: { main: S.json } },
	}),
)

// ── Forms (plans/29 R-15 *Forms* · *The line*; R-21 (5); 30 §U5d, 2026-09-17) ──

/**
 * The form as a prompt and as a schema. Takes the block and the context the
 * builder compiled for the addressee, and publishes the context with the
 * question and the options laid in (`formQuestion`, `formOptions` — what the
 * assembly template renders under the transcript), the JSON Schema the
 * oracle answers against (`formAnswerSchema`: an enum of the option keys, or
 * the field schema), and the question as text. Pure; no model, no rows.
 * @experimental
 */
export const formContext = pin(
	describeTaskDefinition({
		id: 'core:task/form-context@1',
		i18n: { name: { en: 'Form as prompt and schema' } },
		timeoutMs: 1000,
		ports: {
			in: { form: S.json, templateContext: S.templateContext },
			out: {
				main: S.templateContext,
				templateContext: S.templateContext,
				schema: S.json,
				question: S.text,
			},
		},
	}),
)

/**
 * An oracle's question, as blocks. Takes the document a `generate-json@1`
 * produced — `{ question, options: [{ key, label }], addressee? }` — and the
 * function the options fire, and publishes a block list holding one
 * `choices` block: the question on it, its options carrying the keys,
 * addressed to whom the document names. The document's `addressee` is a
 * **name** the model read off the transcript or a participant reference; a
 * name is resolved against `cast` into `character:<id>` (or `envoy:<slug>`),
 * and the `addressee` in-port, when wired, wins over both. A name nobody in
 * the cast bears leaves the block unaddressed — buttons, not a form. The
 * host stamps the action identity and the block id at the write; this task
 * only shapes. `text` is the question as prose, for the row's own content,
 * so a transcript that reads content alone still carries what was asked. A
 * document with no options publishes an empty list and an empty text.
 * @experimental
 */
export const makeChoices = pin(
	describeTaskDefinition({
		id: 'core:task/make-choices@1',
		i18n: { name: { en: 'Question as choices' } },
		timeoutMs: 1000,
		ports: {
			in: {
				/** The oracle's document: `{ question, options, addressee? }`. */
				json: S.json,
				/** The function every option fires — the block's `fn`. */
				fn: S.text,
				/**
				 * The identity of the declaration the options fire, when it is
				 * another spec's (`core:spec/adventure-answer#answer`). Absent,
				 * the host stamps this spec's own declaration for `fn` at the
				 * write.
				 */
				action: S.text,
				/** Who the question is put to. Wired, it wins over the document's. */
				addressee: S.participantRef,
				/** The cast, to resolve a name the document used into a reference. */
				cast: S.sessionCast,
				/**
				 * What the question is about, by name — stamped on the block
				 * as its `referent` and handed back by `read-answer@1` to the
				 * run the press fires (lair pass B12, 2026-09-27: the room the
				 * party knocked at). Blank or absent writes none.
				 */
				referent: S.text,
				/**
				 * Where the question was asked **from**, by name — stamped on
				 * the block as its `vantage` and handed back by
				 * `read-answer@1`, beside `referent` (plan A27, 2026-09-30:
				 * the room the Lair's planner said the party stood in as
				 * they knocked). JSON because it is usually read off a
				 * model's document (`parse-json@1`'s `value`); anything but
				 * a non-blank string writes none.
				 */
				vantage: S.json,
			},
			out: {
				main: S.json,
				blocks: S.json,
				/** The question as prose — the row's content. */
				text: S.text,
				/** Who the block was addressed to, resolved; null when nobody. */
				addressee: S.participantRef,
			},
		},
	}),
)

/**
 * A form's answer, port by port — for the action a form fires. Takes the
 * inlet's `payload` (what the press sent) and `form` (the block facts the
 * host read off the row) and publishes the parts a spec wires: the chosen
 * option's key and label, the addressee and their character row, the
 * question, and the answered values. Pure.
 * @experimental
 */
export const readAnswer = pin(
	describeTaskDefinition({
		id: 'core:task/read-answer@1',
		i18n: { name: { en: 'Read the answer' } },
		timeoutMs: 1000,
		ports: {
			in: { payload: S.json, form: S.json },
			out: {
				main: S.json,
				/** The chosen option's key (`choices`), else null. */
				choice: S.text,
				/** The chosen option's label, else null. */
				label: S.text,
				/** Who answered, as a participant reference — the form's addressee. */
				addressee: S.participantRef,
				/** The addressee's character row, null for an envoy or a person. */
				characterId: S.rowIds,
				question: S.text,
				/**
				 * What the question was about, by name — the block's
				 * `referent`, as the asking run stamped it (lair pass B12);
				 * empty when it named nothing, never null, so a write wired
				 * to it still offers the field at its review gate (a review
				 * form shows only the fields a payload carries).
				 */
				referent: S.text,
				/**
				 * Where the question was asked from, by name — the block's
				 * `vantage`, as the asking run stamped it (plan A27); null
				 * when it named nowhere.
				 */
				vantage: S.json,
				/** The whole answer: `{ choice }` or the entered values. */
				values: S.json,
			},
		},
	}),
)

// ── Summarization ───────────────────────────────────────────────────────────

/**
 * Cut the messages into batches a model can hold.
 *
 * A Task, not a Query: the cut is a *decision* — how many tokens per batch, and
 * therefore how much context each draft is written against — and it is the
 * first parameter a user with long posts reaches for.
 * @internal
 */
export const batchMessages = pin(
	describeTaskDefinition({
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
			 * ⚠ Wire it as a REFERENCE to the drafting oracle's sampling slot
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
						label: { en: 'How much chat each batch holds' },
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
			/**
			 * `attachments` (2026-10-03, owner ruling on the attachments
			 * follow-ups): the files by message, from
			 * `core:query/history-attachments@1`. Each message that shows
			 * files is batched with a placeholder per file after its text —
			 * `[image: cat.png — a grey cat]`, `[file: notes.txt]` — and the
			 * cut counts them, so a message that is only a picture still
			 * reaches the draft as something. Unwired, or a message with no
			 * files, and the message is batched exactly as it was.
			 */
			in: { messages: S.messages, attachments: S.mediaByMessage },
			out: { main: S.drafts, batches: S.drafts },
		},
	}),
)

// ── Stats and states ────────────────────────────────────────────────────────

/** @experimental */
export const setState = pin(
	describeTaskDefinition({
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
						members: [
							{
								key: 'propose',
								label: { en: 'Propose' },
								description: { en: 'Holds the changes for the player to accept or reject.' },
							},
							{
								key: 'apply',
								label: { en: 'Apply' },
								description: {
									en: 'Writes them immediately, stamped with this run. Only where the pipeline itself decided the number.',
								},
							},
						],
						default: 'propose',
						quick: true,
						description:
							"Whether the changes wait for the player or are written at once. Use Apply only where the pipeline itself decided the number.",
					},
				},
			},
		},
		ports: {
			// [{ owner: { kind, id }, slotId, value, base? } | { owner, entryId, delta, base? }]
			// `scope` is what says which session, and therefore which message a
			// change is anchored to — a change with no anchor is one a swipe
			// could not take back.
			in: {
				changes: S.json,
				scope: S.sessionScope,
				/**
				 * The **state version** the changes are deltas against (plans/29
				 * R-15 *Staleness and order*; U5f) — the session-state query's
				 * `version`, for every change that does not carry its own
				 * `base`. In `apply` mode a base behind the current version is
				 * **rebased**: a change whose slot is untouched since the base
				 * still holds and is applied; one whose slot moved is put on
				 * `refused` with the versions named, and the next turn's
				 * `resolve-state-changes` re-resolves it — a run never re-enters
				 * an earlier node. In `propose` mode the base is stamped on the
				 * proposal for the accept to judge the same way. Optional: with
				 * none, the write is against whatever is current.
				 */
				base: S.json,
				/**
				 * **The row the WORLD's changes are filed at** (lair pass R8,
				 * 2026-09-28): a message this run wrote earlier, as that
				 * write's result. Optional, and only for world-owned changes
				 * (the session and its places); a cast member's change still
				 * files at that member's own latest line (the turn lock).
				 * Declared, never inferred: the Lair wires its Sanctum beats
				 * row, so the turn's world changes show in the Sanctum beside
				 * the plan that made them rather than on whichever delver
				 * spoke last. A write-result only — a run may name its OWN
				 * row, which is open to it for the rest of its turn; any
				 * other value is refused.
				 */
				worldRow: S.writeResult,
			},
			/**
			 * What happened, as three lists: `applied` for rows written,
			 * `proposed` for rows held, `refused` for the sentences — a value
			 * the slot does not accept, or a slot that moved since `base`.
			 * The first two are always present and one of them is always
			 * empty, so nothing downstream decides which mode ran by looking
			 * for a missing key.
			 */
			out: { main: S.json, applied: S.json, proposed: S.json, refused: S.json },
		},
	}),
)

/**
 * A room name, unless something already describes it (lair pass R7,
 * 2026-09-28; replaced `core:task/unlisted-name@1`).
 *
 * The Lair's planner names the room the party are about to walk into when it
 * thinks nobody has built it, and the turn stops to ask the dungeon's master
 * to describe it (owner ruling 2, 2026-09-28: *ask, unless it is already
 * described in prose or the lorebook*). This is the deterministic check after
 * the planner's judgement. Lookups, in order; the first hit wins:
 *
 * 1. **Entry.** An entry whose `name`, or any of whose `keys` (a list, or a
 *    comma-separated string, split on commas), is the same name. Entries on
 *    `locationEntries` are checked before `entries`. Any entry type counts.
 *    → `describedBy` `entry`, `entryId`.
 * 2. **Prose.** Among the newest `window` rows of `messages` on the
 *    `channels` named, the newest row whose author is **a person, an envoy or
 *    a speakerless reply** — never a character: a delver's line naming a door
 *    is not a description — with a paragraph (split on blank lines) that
 *    names the name and holds at least `minWords` words besides it.
 *    → `describedBy` `prose`, `passage` (that paragraph).
 * 3. Otherwise `undescribed` is the name, trimmed.
 *
 * "The same name" and "names the name" are the SDK's name rule
 * (`normalizeName`, `sameName`, `passageNaming` in `names.ts`): NFKC, case,
 * a possessive `'s`, apostrophes and punctuation, and one leading article —
 * then whole equality, never a substring ("the vault" is not "the sunken
 * vault").
 *
 * Pure: the rows come in on ports (a `core:query/lorebook-entries@1` listing,
 * a `core:query/session-history@1` read), so a genre decides what is read
 * and the task decides only what counts. `channels` filters the rows by their
 * own `channel` (a bare slug is every lane of it), so a core task never
 * hard-codes a genre's slug: a spec that wants a side channel's prose to count
 * reads it and names it here.
 *
 * ## Which room is this one (places plan B6, 2026-09-29)
 *
 * The same lookup answers the Lair's other question: *which room do the party
 * stand in?* — the world's `location` stat, resolved against the rooms, so
 * *Answer the door* can link the room it writes to it. Two things make that
 * wireable:
 *
 *  - **`path`**: a data reference has no sub-path, and the location sits
 *    inside a `core:query/session-state@1` document, so `path` says where the
 *    name is inside `name` (`world.location`) — the dotted spelling
 *    `parse-json@1` and `generate-json@1` read. Empty reads `name` itself.
 *  - **A lore reference is its entry.** A location stat set to a place entry
 *    holds `{ entryId }`, not words, and naming it again by its title would
 *    find a namesake. So a value with an `entryId` is answered by the listed
 *    entry with that id (`describedBy` `entry`), and by nothing when no
 *    listing holds it — archived, or hidden from this read.
 *  - **`fallbackName`** (plan A27, 2026-09-30): what to look for when `name`
 *    (at `path`) names nothing — for the Lair, the room its planner said the
 *    party stood in as they knocked (the knock's `vantage`). The world's
 *    value wins and the hint stands in only while it names nothing: the
 *    order a play turn's prompts read the location in (the world's value,
 *    else that turn's plan). No prompt in the knock turn shows the hinted
 *    room; it is the planner's own answer for that turn. Read whole, by the
 *    same rules as `name`.
 * @experimental
 */
export const undescribedName = pin(
	describeTaskDefinition({
		id: 'core:task/undescribed-name@1',
		i18n: { name: { en: 'Undescribed name' } },
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				facet: 'behavior',
				schema: {
					/**
					 * Whose prose counts, by channel slug. `main` by default;
					 * the Lair adds its side channel so a room its master
					 * described there counts too.
					 */
					channels: {
						type: 'string',
						list: true,
						default: ['main'],
						label: { en: 'Channels read' },
						description: {
							en: 'Which channels’ messages can describe a room. A slug covers every lane of that channel.',
						},
					},
					/** How far back prose counts, in rows across those channels. */
					window: {
						type: 'integer',
						default: 40,
						min: 1,
						max: 500,
						label: { en: 'Messages read' },
						description: {
							en: 'How many of the newest messages on those channels are searched for a description.',
						},
					},
					/**
					 * How long a paragraph must be to be a description rather
					 * than a mention: words besides the name itself.
					 */
					minWords: {
						type: 'integer',
						default: 12,
						min: 0,
						max: 500,
						label: { en: 'Words to describe' },
						description: {
							en: 'How many words, besides the name, a paragraph needs before it counts as describing the room rather than mentioning it.',
						},
					},
					/**
					 * Where the name is inside `name`, as a dotted path (places
					 * plan B6) — the Lair reads `world.location` off a
					 * session-state document. Empty reads `name` itself.
					 */
					path: {
						type: 'string',
						default: '',
						label: { en: 'Where the name is' },
						description: {
							en: 'Where the name sits inside what is wired in, as a dotted path such as world.location. Leave it empty when the name itself is wired in.',
						},
					},
				},
			},
		},
		ports: {
			in: {
				/**
				 * The name to look for — JSON rather than text because it is
				 * usually read off a model's document (`parse-json@1`'s
				 * `value`), or a document holding it at `path`; anything but a
				 * string is no name, and nothing is undescribed — save a lore
				 * reference (`{ entryId }`), which is the listed entry it
				 * references (B6).
				 */
				name: S.json,
				/**
				 * What to look for when `name` at `path` names nothing — a
				 * name or a lore reference, read whole (no `path`). Unwired,
				 * nothing is looked for in its place.
				 */
				fallbackName: S.json,
				/** Location entries (rows with `id`, `name`, `keys`), checked first. */
				locationEntries: S.json,
				/** The rest of the book, any entry type, checked second. */
				entries: S.json,
				/** Recent rows, ascending, each carrying its `channel`. */
				messages: S.messages,
			},
			out: {
				main: S.text,
				/** `name`, trimmed, when nothing describes it; else empty. */
				undescribed: S.text,
				/** `entry`, `prose`, or empty when nothing describes it. */
				describedBy: S.text,
				/** The describing entry's id, or null. */
				entryId: S.json,
				/** The describing paragraph, or empty. */
				passage: S.text,
			},
		},
	}),
)

// ── D-4a: pure pick and cast options ──────────────────────────── start ──────

/**
 * The item this session picks — a pure function of a key and a list.
 *
 * ## The gap it closes
 *
 * Nothing in the bound catalogue evaluated a pure function over run data. The
 * closest was `core:task/turn-random@1`, which draws on `ctx.random` — seeded
 * per RUN, so it answers differently every turn — and that is right for whose
 * turn it is and useless for a fact that has to stay the same all game. So a
 * genre wanting its hidden fact **chosen** (which suspect did it, which lore
 * entry the answer is) had two options and neither was honest: ask a model,
 * which can change its mind between two answers, or write it into the one
 * per-session store a spec can reach — the attribute-slot ledger, which the
 * player's own state panel renders. Whodunit shipped adjudicating from an
 * authored case file for exactly this reason, with its rendezvous rule
 * published, tested and called by nobody.
 *
 * Derived instead: the create run and every later turn hand the same
 * `scopeKey` and the same list to this node and reach the same item, with
 * nothing written down anywhere and nothing on screen.
 *
 * ## Rendezvous hashing, and why not `list[hash % length]`
 *
 * Each candidate is scored on its own — `hash(key + '#' + itemKey)` — and the
 * highest wins (`rendezvousPick`, SDK `pick.ts`, the one implementation the
 * app's binding and a plugin's own picker share). A modulo into the list
 * moves *every* session's answer when the list length changes; rendezvous
 * moves it exactly when the newcomer's own score wins, so seating a fifth
 * suspect mid-case displaces the culprit in about a fifth of sessions and
 * leaves the rest alone. The hash carries murmur3's `fmix32` finalizer
 * because the comparison is over whole hashes and plain FNV-1a leaves the
 * high bits systematic for ids differing in their last digit — measured at
 * 49% of sessions for the first of three, instead of 33%.
 *
 * ## `scopeKey` is the session's address, never the run's seed
 *
 * A spec wires `$.input.sessionScope` (or a literal) — something durable. The
 * run's seed is a different string every turn and a pick keyed on it would
 * move between two questions. It is `scopeKey` and not `key` (R3, named
 * 2026-09-17, before anything shipped): *key* alone is the option key on a
 * choice, the identity a candidate is scored under, and a settings field's
 * name, and this port is none of them — it is the scope the pick is made
 * within.
 *
 * ## No `optional`
 *
 * Absent, so an empty list is the run's failure. A genre that derived its
 * secret from this node cannot be handed "nobody" and carry on, and
 * `optional: true` would turn that into an `ok` with every downstream port
 * reading absent — indistinguishable from a turn where the pick genuinely
 * chose nothing.
 * @experimental
 */
export const pickByHash = pin(
	describeTaskDefinition({
		id: 'core:task/pick-by-hash@1',
		i18n: {
			name: { en: 'Pick by hash' },
			description: {
				en: 'Picks one entry of a list for this session, the same one every time, without writing anything down. Adding an entry almost never moves the pick.',
			},
		},
		/** Pure arithmetic over a list that is already in memory. */
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which field on each entry identifies it.
					 *
					 * The identity is what the hash is taken over, so it
					 * decides the answer: two runs that disagree about it
					 * disagree about the pick. Absent, an entry that IS a
					 * string is its own identity and anything else is
					 * identified by `id` — the two shapes a core list
					 * actually arrives in (`cast-choices` publishes `key`,
					 * a lore listing publishes rows with `id`).
					 *
					 * ⚠ It must be **stable**: a name the author may edit
					 * moves the pick the day they edit it. A row id does not.
					 */
					by: {
						type: 'string',
						quick: true,
						label: { en: 'Identified by' },
						description:
							'Which field on each entry identifies it — a row id, or the option key. Leave it empty for plain strings, or for rows with an `id`.',
					},
				},
			},
		},
		ports: {
			in: {
				/** The list to pick from. */
				items: S.json,
				/**
				 * The stable key this session picks under.
				 *
				 * Either the session's **scope** — `$.input.sessionScope`,
				 * which the binding spells `session:<id>` — or a literal
				 * string for a pick that is not per-session.
				 *
				 * ⚠ `S.json` rather than `S.text`, and not for want of a
				 * type. `session-scope@1` is not assignable to `text@1`, and
				 * there is no text-shaped port anywhere that carries a
				 * session's identity — so a `text` port here could be wired
				 * to a literal and to nothing else, which would give every
				 * session of a genre the same answer. `json` is the
				 * permissive sink, so the scope wires, a literal wires, and
				 * anything a spec wires that the binding cannot read as a key
				 * halts with a sentence naming what to wire instead.
				 */
				scopeKey: S.json,
			},
			out: {
				/** The chosen entry, whole and exactly as it arrived. */
				main: S.json,
				/**
				 * Where it sat in the list **as handed in**, not among the
				 * identifiable entries. `pickIndex` rather than `index`
				 * (R3): a bare *index* is a database index, a message's
				 * position and a list offset all at once.
				 */
				pickIndex: S.json,
				/**
				 * The identity it won under — the string the hash was taken
				 * over. This is the side a later junction compares an answer
				 * against with `equalsPath`, which is why it is published at
				 * all: the chosen item is a document, and a predicate
				 * compares keys.
				 */
				chosenKey: S.text,
			},
		},
	}),
)

/**
 * The room, as options a question can be put with.
 *
 * `core:task/make-choices@1` needs `{ key, label }` options and nothing in
 * core turned a cast into that list, so both Whodunit pickers spend a model
 * call whose entire job is to read the cast back out as JSON — a request, a
 * schema and a wait, for a fact the run already held. Worse than slow: a
 * model enumerating the room can misspell a suspect, invent one, or leave one
 * out, and the options it writes are what the player may press.
 *
 * Pure. The cast read is the fact; this shapes it.
 *
 * ## The key is a participant reference
 *
 * `character:<id>`, the reference vocabulary (R-18 (3)) — not a name, which
 * two cast members can share and an author can edit, and not a bare id, which
 * says nothing about what it identifies. It survives the round trip: the key
 * lands on the pressed option, `core:task/read-answer@1` publishes it as
 * `choice`, and a junction can compare that against a
 * `core:task/pick-by-hash@1` `chosenKey` derived over these same options.
 *
 * ## Who is in the list
 *
 * Live seats only — a departed or inactive cast member is not somebody a
 * question may be put about — and **never an envoy**: `exclude` offers no way
 * to turn one off, and a narrator among the suspects with no way to remove it
 * is worse than a narrator a spec has to add for itself.
 *
 * ## It publishes the whole document, not only the list (ruled (b), 2026-09-17)
 *
 * `make-choices@1` reads `{ question, options, addressee? }` off ONE `json`
 * port, so a spec handed only `options` still has nowhere to put the question
 * — and the obvious repair, a second in-port on `make-choices`, would move
 * the hash of a node that is published and wired into shipped specs. So the
 * shaping happens on this side: `question` comes in, `json` goes out in
 * exactly the shape that port reads, and the two nodes wire straight to each
 * other with no model call in between. `options` stays beside it for a spec
 * that wants the bare list (a pick over the same options, a `each` over the
 * room), which is the same value the document carries.
 *
 * No `addressee`: the document's is a **name** `make-choices` resolves
 * against the cast, and this node has no more idea who the question is for
 * than the cast document does. A spec that knows wires `make-choices`'s own
 * `addressee` port, which wins over the document's anyway.
 * @experimental
 */
export const castChoices = pin(
	describeTaskDefinition({
		id: 'core:task/cast-choices@1',
		i18n: {
			name: { en: 'The cast as choices' },
			description: {
				en: 'Turns the session’s cast into the option list a question is asked with — one option per live character, keyed by who they are.',
			},
		},
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					/**
					 * Which half of the room to leave out.
					 *
					 * A persona is a character the player voices (0132), so
					 * both halves are cast members and which one a question
					 * is about depends entirely on the question: *who do you
					 * accuse* is asked about the suspects and must not offer
					 * the detective, while *who do you play* is the other way
					 * round.
					 */
					exclude: {
						type: 'enum',
						of: ['none', 'personas', 'characters'],
						members: [
							{ key: 'none', label: { en: 'Nobody' } },
							{
								key: 'personas',
								label: { en: 'Personas' },
								description: { en: 'The characters the players voice.' },
							},
							{
								key: 'characters',
								label: { en: 'Characters' },
								description: { en: 'The rest of the cast.' },
							},
						],
						default: 'none',
						quick: true,
						label: { en: 'Left out' },
						description:
							'Leave out the characters the players voice (personas), the rest of the cast (characters), or nobody.',
					},
				},
			},
		},
		ports: {
			in: {
				cast: S.sessionCast,
				/**
				 * The question the options answer — the prose that sits
				 * above them on the block, and the row's own content.
				 *
				 * Unwired it is the empty string, and `make-choices@1`
				 * publishes no block for a document with no question — the
				 * same silence it answers an empty option list with, rather
				 * than a block asking nothing.
				 */
				question: S.text,
			},
			out: {
				/** `{ key, label }[]`, in seating order: characters, then personas. */
				main: S.json,
				options: S.json,
				/**
				 * `{ question, options }` — the document
				 * `core:task/make-choices@1` reads off its own `json` port,
				 * in exactly that shape, so the two wire straight to each
				 * other and no oracle stands between a cast read and the
				 * question it is asked with.
				 */
				json: S.json,
			},
		},
	}),
)

// ── D-4a: pure pick and cast options ────────────────────────────── end ──────

// ── Contracts batch 2: the two-document pair ──────────────────── start ──────

/**
 * Two values, side by side in one document, under names a path can read.
 *
 * ## The gap it closes
 *
 * A junction branches on **one** port, and `equalsPath` compares two paths of
 * **one** document (D-4a). So the grammar can ask *is the accused the culprit?*
 * only once something has put the accused and the culprit in the same
 * document, and nothing in core did: no task merged two json ports, and the
 * obvious repair — a second in-port on the junction — is not a repair, it is a
 * different clause. Whodunit shipped with its verdict's `accused` node wired to
 * nothing for exactly this reason.
 *
 * Pure, and deliberately the dullest node in the catalogue. It computes
 * nothing, decides nothing and reads nothing: it is the shape change that lets
 * a predicate see both sides.
 *
 * ## ⚠ An absent side is **omitted**, never null
 *
 * This is the whole of the node's behaviour worth stating. `predicateHolds`
 * answers `false` when either side of an `equalsPath` is `undefined` — two
 * absences are not a match — and that rule is what makes a junction over this
 * document **safe on a turn where nothing was decided**: a run in which the
 * accuse never happened has no `accused`, so
 * `{ path: 'accused', equalsPath: 'culprit' }` fires nothing, and the spec
 * falls through to its default branch.
 *
 * Writing `null` for an unwired side would destroy that. `null` is a *value*:
 * `readPath` returns it, it is not `undefined`, and `null === null` — so a
 * document with both sides missing would compare **equal** and the verdict
 * branch would fire on a turn where nobody accused anybody. The omission is
 * therefore load-bearing and pinned by a test, not an implementation detail of
 * the handler.
 *
 * The same rule covers the side that is wired but produced nothing: a port
 * resolving absent is absent here too. What arrives is written; what does not
 * is not mentioned.
 *
 * ## The names are the spec's
 *
 * `firstKey` and `secondKey` decide what the document's keys are called, so
 * the same node reads as `{ accused, culprit }` in one spec and
 * `{ guess, secret }` in another and the predicate paths are the spec's own
 * words. Defaults `first` and `second`, which are honest and nobody would
 * write a predicate against on purpose.
 *
 * Two keys that are the same string are refused rather than collapsed: one key
 * holding whichever side was written last is a document that compares equal to
 * itself, which is the one answer this node must never produce by accident.
 * @experimental
 */
export const pair = pin(
	describeTaskDefinition({
		id: 'core:task/pair@1',
		i18n: {
			name: { en: 'Pair' },
			description: {
				en: 'Puts two values side by side in one document, under names you choose, so a branch can compare them. Whichever side is missing is left out.',
			},
		},
		/** Two reads and an object literal. */
		timeoutMs: 500,
		slots: {
			params: {
				kind: 'parameters',
				schema: {
					firstKey: {
						type: 'string',
						default: 'first',
						quick: true,
						label: { en: 'Name for the first value' },
						description:
							'What the first value is called in the document — the word a branch reads it by.',
					},
					secondKey: {
						type: 'string',
						default: 'second',
						quick: true,
						label: { en: 'Name for the second value' },
						description:
							'What the second value is called in the document. It must differ from the first.',
					},
				},
			},
		},
		ports: {
			in: {
				/** Whatever the spec wants compared. Absent is a legal input. */
				first: S.json,
				second: S.json,
			},
			out: {
				/**
				 * `{ [firstKey]: first, [secondKey]: second }`, with an absent
				 * side **omitted** — see the note above; it is the property a
				 * junction over this document depends on.
				 */
				main: S.json,
			},
		},
	}),
)

// ── Contracts batch 2: the two-document pair ────────────────────── end ──────
