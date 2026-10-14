/**
 * Script **types** — the fourth paradigm's contracts.
 *
 * A script is user-authored, typed text that transforms data at a declared
 * point in a run: no SDK, no manifest, no build step. This module declares the
 * *contracts* those texts conform to, not the texts themselves. The split is
 * the same one prompts and prompt slots already have, stated
 * plainly: few types, declared by core and extensions and versioned by a
 * content hash; many scripts, authored by users and stored as rows.
 *
 * Structured like the other declared-thing registries beside it — `engines.ts`,
 * `variables.ts` — so a plugin reading the registry sees core's declarations on
 * the same terms as its own, and `snapshotRegistry` projects these into the
 * type registry with `kind: 'script'` under the same sync, conflict-refusal and
 * re-projection rules as node types.
 *
 * ## Why the id grows a segment
 *
 * `<namespace>:script:<content>/<operation>@<major>`
 *
 * The content segment is structural, not decorative: hook matching, chain
 * homogeneity, panel grouping and import validation all read it, which is why
 * it earns a delimiter rather than a hyphen convention. `text/stop` is
 * filterable; `text-stop` is a naming habit.
 *
 * ⚠ This is the **one** compound kind, and the extension stops here. Node kinds
 * are already segmented by kind and never grow qualifiers; scripts are
 * segmented by payload because that is what decides which chain a link may join
 * and which hook may accept it. Generalizing the grammar further is a non-goal.
 *
 * ⚠ The grammar is hard-frozen once the SDK publishes. Scripts are
 * unshipped, so this is the free moment to extend it additively.
 * @ruling 18 §1–§3, 18 §2, 18 §1, 07 §0g
 */

import type { I18n } from './descriptors.js'
import { i18nFindings } from './i18n.js'
import type { ShapeId } from './shapes.js'
import { refuseUnlessIdentical } from './hash.js'

/** `core:script:text/stop@1` — namespaced, segmented by payload, pinned. @experimental */
export type ScriptKindId = string

/**
 * What a chain of this operation *does* with what its links return.
 *
 * Declared per operation rather than per hook, because it is a property of the
 * contract: two `text` operations differ precisely in whether their return
 * flows onward or is consumed as a judgement.
 * @experimental
 * @ruling 18 §5
 */
export type ChainSemantics =
	/**
	 * The return merges back into the flowing variable bag, in order. Each link
	 * receives its declared ins and merges only its declared outs; everything
	 * else passes through untouched.
	 */
	| 'transform'
	/**
	 * The return is a verdict the hook consumes and never merges. Verdicts are
	 * reduced, not folded — `text/stop` takes the minimum index — which is what
	 * makes merging chains from several scopes well-defined with no precedence
	 * fight.
	 */
	| 'verdict'

/** @experimental */
export interface ScriptKindDecl {
	id: ScriptKindId
	i18n?: { name?: I18n; description?: I18n }
	/**
	 * What a script of this type is able to do, in the words the panel badges
	 * it with. Display text: stripped from the content hash like `i18n`, for
	 * the same reason — copyediting a warning is not a contract change.
	 *
	 * Present on every type and deliberately blunt. Operations within a content
	 * scope *are* the permission granularity: `messages/inject` split
	 * from `messages/transform` so a cautious user can accept injection chains
	 * while refusing rewrites, and that choice is only meaningful if the
	 * difference is stated where the choice is made.
	 * @ruling 18 §3
	 */
	blastRadius: I18n
	semantics: ChainSemantics
	/**
	 * The shapes this operation reads and produces.
	 *
	 * The *contract*, not the hook's variable space. A hook decides which
	 * variables exist at its point and what extras it supplies; the type says
	 * what kind of thing flows. One `text/transform` therefore serves the input
	 * hook, the write hook and the display hook — placement is the hook's
	 * property, not the type's.
	 *
	 * A `verdict` operation declares `out` as what the hook consumes, which is
	 * never merged downstream.
	 * @ruling 18 §3
	 */
	ports: { in: Record<string, ShapeId>; out: Record<string, ShapeId> }
}

/** A parsed script id. The segments callers actually branch on. @experimental */
export interface ParsedScriptKindId {
	namespace: string
	/** e.g. `text`, `messages`, `candidates`, `context`. */
	content: string
	/** e.g. `transform`, `stop`, `inject`, `filter`, `rescore`. */
	operation: string
	version: number
	/** `content/operation` — the chain-homogeneity key, computed once here. */
	space: string
}

const SCRIPT_ID =
	/^([a-z0-9][a-z0-9.-]*):script:([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)@(\d+)$/

/** Is this a script id at all? Cheap enough to call in a filter. @experimental */
export const isScriptKindId = (id: string): boolean => SCRIPT_ID.test(id)

/**
 * Parse, or throw with the grammar spelled out.
 *
 * Throwing beats returning null here for the same reason it does in template
 * engines: a caller that gets `undefined` from a malformed id writes a fallback,
 * and a fallback that half-works is how a script ends up attached to a hook
 * nobody meant. An id is either well-formed or it is a bug in the thing that
 * produced it.
 * @internal
 * @ruling 12 §2a
 */
export function parseScriptKindId(id: string): ParsedScriptKindId {
	const m = SCRIPT_ID.exec(id)
	if (!m)
		throw new Error(
			`'${id}' is not a valid script type id. The grammar is ` +
				`'<namespace>:script:<content>/<operation>@<major>' — ` +
				`'core:script:text/stop@1', 'stats:script:data/check@1'. Lowercase, digits ` +
				`and hyphens in each segment; dots additionally allowed in the namespace. ` +
				`The content segment is structural: hook matching, chain homogeneity and ` +
				`panel grouping all read it, which is why it is a segment and not a naming ` +
				`habit inside the name (18 §1).`,
		)
	return {
		namespace: m[1]!,
		content: m[2]!,
		operation: m[3]!,
		version: Number(m[4]!),
		space: `${m[2]!}/${m[3]!}`,
	}
}

/**
 * `content/operation` — what every link in one chain must share.
 *
 * Checkable off the id, which is the point of putting content in the grammar: a
 * `candidates` script dropped into a `text/transform` chain refuses at attach
 * rather than at run time, and neither the registry nor the script body has to
 * be consulted to know it.
 * @experimental
 * @ruling 18 §5
 */
export const scriptSpace = (id: ScriptKindId): string => parseScriptKindId(id).space

const scriptTypes = new Map<ScriptKindId, ScriptKindDecl>()

/**
 * Register a script type.
 *
 * The same two refusals as every other registry here — an id has exactly one
 * owner, and the grammar is checked at the door rather than trusted. The second
 * matters more for scripts than elsewhere: these ids are matched by *segment*,
 * so a malformed one does not fail loudly, it quietly belongs to no chain and
 * no hook.
 * @experimental
 */
export function defineScriptKind(decl: ScriptKindDecl): ScriptKindDecl {
	parseScriptKindId(decl.id)
	// The display text (R-20): the name and description a panel lists it by,
	// and the blast-radius badge — required, because a chain a person cannot
	// read the consequences of is a permission nobody can grant knowingly.
	const findings = [
		...i18nFindings(decl.i18n?.name, `${decl.id} i18n.name`),
		...i18nFindings(decl.i18n?.description, `${decl.id} i18n.description`),
		...i18nFindings(decl.blastRadius, `${decl.id} blastRadius`, { required: true }),
	]
	if (findings.length)
		throw new Error(
			`${decl.id} declares display text a publish refuses (R-20):\n · ${findings.join('\n · ')}`,
		)
	const existing = scriptTypes.get(decl.id)
	if (existing)
		refuseUnlessIdentical(existing, decl, `duplicate script type id: ${decl.id}`, {
			// `blastRadius` is a badge, and this is where the docblock on
			// `ScriptKindDecl` becomes true rather than aspirational: it sits beside
			// `i18n` instead of inside it because it is required on every type and
			// `i18n` is not, so the generic strip never saw it and re-wording a
			// warning threw. `semantics` is the same shape of word and is *not*
			// listed — it is contract, and only this file knows the difference.
			display: ['blastRadius'],
		})
	scriptTypes.set(decl.id, decl)
	return decl
}

/**
 * The plugin-facing door. Same registration, minus the ability to claim core's
 * namespace — checked here rather than in `defineScriptKind` so core's own
 * declarations do not have to argue past their own guard.
 * @experimental
 */
export function definePluginScriptKind(pluginId: string, decl: ScriptKindDecl): ScriptKindDecl {
	if (decl.id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${decl.id}': the 'core:' namespace is ` +
				`reserved. Publish it under your own namespace — a script type two parties ` +
				`can define is one where the same chain means different things depending on ` +
				`load order.`,
		)
	return defineScriptKind(decl)
}

/** @internal */
export const getScriptKind = (id: ScriptKindId) => scriptTypes.get(id)
/** @experimental */
export const allScriptKinds = () => [...scriptTypes.values()]
/** @internal */
export function _clearScriptKinds(): void {
	scriptTypes.clear()
}

// ── Core's catalog, v1 (18 §3) ──────────────────────────────────────────────
//
// Nine types across six content scopes. The scopes map onto the existing
// shape vocabulary rather than inventing a second taxonomy of what data is —
// which is also what lets an extension add `image` or `audio` alongside its own
// types and get a modality-agnostic tier for free.

const TEXT = 'core:shape/text@1'
const CANDIDATES = 'core:shape/context-candidates@1'
const JSON_SHAPE = 'core:shape/json@1'

/** @experimental */
export const textTransform = defineScriptKind({
	id: 'core:script:text/transform@1',
	i18n: {
		name: { en: 'Transform text' },
		description: {
			en: 'Rewrite a piece of text — strip a phrase, fix spacing, replace a name.',
		},
	},
	blastRadius: { en: 'Rewrites content' },
	semantics: 'transform',
	ports: { in: { text: TEXT }, out: { text: TEXT } },
})

/**
 * The generic link: any JSON value in, any JSON value out. The body of a
 * script step (`core:task/run-script@1`) — the one kind with no content scope
 * of its own, so a step can carry a computation core never named.
 * @experimental
 */
export const dataTransform = defineScriptKind({
	id: 'core:script:data/transform@1',
	i18n: {
		name: { en: 'Transform data' },
		description: {
			en: 'Takes a JSON value and returns a JSON value — the body of a script step.',
		},
	},
	blastRadius: { en: 'Rewrites one value' },
	semantics: 'transform',
	ports: { in: { value: JSON_SHAPE }, out: { value: JSON_SHAPE } },
})

/**
 * ⚠ A verdict, not a transform, and the difference is load-bearing.
 *
 * A stop script never rewrites the stream — it answers "where, in the text you
 * have been shown, should this end?" That makes the answer a **min-reduction**:
 * every attached script evaluates independently and the earliest index wins.
 * Order-free and commutative, which is exactly what makes merging the
 * connection's chain with the pipeline's and the chat's well-defined without a
 * precedence rule nobody would remember.
 *
 * It is also the one type with a conformance law attached: the verdict is
 * a function of the accumulated text only, never of chunk boundaries, or a
 * reply replays differently than it streamed.
 * @experimental
 * @ruling 18 §5, S1
 */
export const textStop = defineScriptKind({
	id: 'core:script:text/stop@1',
	i18n: {
		name: { en: 'Stop generation' },
		description: {
			en: 'Decide where a reply should end — a leaked template token, an impersonated speaker.',
		},
	},
	blastRadius: { en: 'Ends generations' },
	semantics: 'verdict',
	ports: { in: { text: TEXT }, out: { stopIndex: JSON_SHAPE } },
})

/**
 * Additive only, and split from `messages/transform` on purpose.
 *
 * Same content, different blast radius: injection cannot touch what is already
 * there, so a cautious user can accept injection chains while refusing
 * rewrites. That choice only exists because the two are separate operations —
 * a single `messages/edit` would have made "add a reminder at depth 2" and
 * "delete half the history" the same permission.
 * @experimental
 */
export const messagesInject = defineScriptKind({
	id: 'core:script:messages/inject@1',
	i18n: {
		name: { en: 'Inject messages' },
		description: {
			en: 'Add messages at a chosen depth — a reminder, a system note, an assistant prefill.',
		},
	},
	blastRadius: { en: 'Additive only — cannot change existing history' },
	semantics: 'transform',
	ports: { in: { context: JSON_SHAPE }, out: { injections: JSON_SHAPE } },
})

/** @experimental */
export const messagesTransform = defineScriptKind({
	id: 'core:script:messages/transform@1',
	i18n: {
		name: { en: 'Transform messages' },
		description: { en: 'Rewrite or drop messages before they reach the model.' },
	},
	blastRadius: { en: 'Can remove or rewrite history' },
	semantics: 'transform',
	ports: { in: { messages: JSON_SHAPE }, out: { messages: JSON_SHAPE } },
})

/** @experimental */
export const candidatesFilter = defineScriptKind({
	id: 'core:script:candidates/filter@1',
	i18n: {
		name: { en: 'Filter candidates' },
		description: { en: 'Drop retrieved entries before ranking, with a reason on each.' },
	},
	blastRadius: { en: 'Excludes lore' },
	semantics: 'transform',
	ports: { in: { candidates: CANDIDATES }, out: { candidates: CANDIDATES } },
})

/** @experimental */
export const candidatesRescore = defineScriptKind({
	id: 'core:script:candidates/rescore@1',
	i18n: {
		name: { en: 'Rescore candidates' },
		description: { en: 'Adjust retrieval scores so the ranker orders entries differently.' },
	},
	blastRadius: { en: 'Reorders ranking' },
	semantics: 'transform',
	ports: { in: { candidates: CANDIDATES }, out: { candidates: CANDIDATES } },
})

/** @experimental */
export const contextTransform = defineScriptKind({
	id: 'core:script:context/transform@1',
	i18n: {
		name: { en: 'Transform context' },
		description: { en: 'Edit the values a prompt template renders — instructions, scenario.' },
	},
	blastRadius: { en: 'Edits instructions' },
	semantics: 'transform',
	ports: { in: { context: JSON_SHAPE }, out: { context: JSON_SHAPE } },
})

/**
 * The extracted cast, after the model has answered and the host has parsed.
 *
 * Its own content scope rather than a `context` operation, because chain
 * homogeneity is keyed on content and a cast is not a template
 * context — a chain that could hold both would let a context edit land on a
 * cast list by attachment mistake, silently. The scope is what makes the
 * mistake refusable at attach.
 *
 * The flowing value is what `core:oracle/extract-cast@1` publishes on its
 * `cast` port: `{ participants, mentioned }`. Scripts here rename, merge
 * aliases, drop a junk detection, or add someone the model missed — the
 * paste-rung half of replaceable cast extraction. The other half is the node
 * rebind: a whole different extractor is a same-shaped provider, never a
 * script, because scripts are pure compute and extraction calls a model.
 * @experimental
 * @ruling 18 §5
 */
export const castTransform = defineScriptKind({
	id: 'core:script:cast/transform@1',
	i18n: {
		name: { en: 'Transform cast' },
		description: {
			en: 'Edit the extracted cast — rename someone, merge aliases, drop a junk detection, add someone the model missed.',
		},
	},
	blastRadius: { en: 'Rewrites who is in the scene' },
	semantics: 'transform',
	ports: { in: { cast: JSON_SHAPE }, out: { cast: JSON_SHAPE } },
})

/**
 * Who speaks next, as a script.
 *
 * The one seam a plugin — or an admin, in the Scripts panel with no plugin at
 * all — has for turn detection of its own. Core's `core:task/turn-scripted@1`
 * declares this kind at its `select` point and hands the chain a
 * **selection**: `{ speaker, candidates, lastSpeaker, sinceUser }` — the pick so
 * far (null until a link decides), every seat a strategy may seat (characters
 * and in-turn envoys, each a participant reference with its position and name),
 * who spoke last, and how many replies have landed since the person last
 * spoke. A link returns the selection with `speaker` set, or nothing to leave
 * the decision to the next link. The host seats only a reference that is in
 * `candidates`; anything else is recorded and ignored, so a script can never
 * seat somebody the cast does not hold.
 *
 * A transform rather than a verdict: the chain's *order* is its precedence —
 * "the mentioned character, else whoever is due" is two links — and a verdict
 * reduction would need a rule for which reference wins that no reduction states
 * naturally. Its own content scope for the reason `cast` has one: chain
 * homogeneity is keyed on content, and a selection is not a cast.
 * @experimental
 * @ruling plans/19 §5 (second half; ruled 2026-09-21)
 */
export const turnSelect = defineScriptKind({
	id: 'core:script:turn/select@1',
	i18n: {
		name: { en: 'Select the speaker' },
		description: {
			en: 'Decide who takes the next turn — the character who was addressed, the one who has been quiet longest, whoever the scene calls for.',
		},
	},
	blastRadius: { en: 'Decides who speaks' },
	semantics: 'transform',
	ports: { in: { selection: JSON_SHAPE }, out: { selection: JSON_SHAPE } },
})

/**
 * Every content scope core ships, in panel order.
 *
 * Derived from the registry rather than restated, so a scope arrives the moment
 * a type using it is declared — including an extension's. A hand-written list
 * is the thing to avoid: a second taxonomy of what data is,
 * kept in step by hand.
 * @experimental
 * @ruling 18 §1 rule 3
 */
export const scriptContentScopes = (): string[] => [
	...new Set(allScriptKinds().map((t) => parseScriptKindId(t.id).content)),
]

// ── Seam addresses (PLAN-script-placement D1) ───────────────────────────────

/**
 * A **seam** — a place a script chain may run — spelled as one string.
 *
 * Three forms, one per kind of seam:
 *
 * - `in:<port>` — a `scripts` slot with `phase: 'before'` on in-port
 *   `<port>`: the chain runs over the value entering the binding
 *   (`create-message` → `in:text`).
 * - `out:<port>` — a `scripts` slot with `phase: 'after'` on out-port
 *   `<port>`: the chain runs over what the binding published
 *   (`user-message` → `out:text`, `extract-cast`'s `castScripts` → `out:cast`).
 * - `<pointKey>` — an interior point (`scriptPoints`), invoked by the binding
 *   through `ctx.scripts` (`each-draft`).
 *
 * The address is a *name*, not a storage address: chains stay stored at
 * `config[nodeKey][slotName]['']` and `config[nodeKey].scripts[point]`.
 * Typed as a plain string on its third branch, because a point key is any
 * key a definition declares; `parseSeamAddress` is the reader.
 * @experimental
 */
export type SeamAddress = `in:${string}` | `out:${string}` | string

/** A parsed seam address. @experimental */
export interface ParsedSeamAddress {
	kind: 'in' | 'out' | 'point'
	/** The port for `in`/`out`; the point key for `point`. */
	name: string
}

/** A `scripts` slot's placement, as the seam address reads it. Structural, so a registry row's slot fits. @experimental */
export interface SeamSlotPlacement {
	port?: string
	phase?: 'before' | 'after' | string
}

/** An interior point, as the seam address reads it. @experimental */
export interface SeamPointPlacement {
	key: string
}

// Loose on purpose: ports and point keys are whatever a definition declares, and
// the executor resolves seams through this reader, so a stricter grammar would
// refuse a run over a name `register()` accepted. Only what would make the
// address ambiguous is refused: empty, whitespace, a second ':'.
const SEAM_NAME = /^[^\s:]+$/

const seamGrammar = (at: string): string =>
	`'${at}' is not a valid seam address. The grammar is 'in:<port>' (a scripts slot, ` +
	`phase 'before', on that in-port), 'out:<port>' (phase 'after', on that out-port) ` +
	`or a bare '<pointKey>' (an interior script point) — 'in:text', 'out:cast', 'each-draft'. ` +
	`A port name or point key is non-empty, with no whitespace and no ':'.`

/**
 * The seam address of a declaration: a `scripts` slot `{ port, phase }`
 * (defaults `'main'` and `'before'`, the executor's) or an interior point
 * `{ key }`. The one place the spelling is computed.
 * @experimental
 */
export function seamAddressOf(decl: SeamSlotPlacement | SeamPointPlacement): SeamAddress {
	if ('key' in decl && typeof (decl as SeamPointPlacement).key === 'string') {
		const key = (decl as SeamPointPlacement).key
		parseSeamAddress(key)
		if (key.includes(':')) throw new Error(seamGrammar(key))
		return key
	}
	const slot = decl as SeamSlotPlacement
	const port = slot.port ?? 'main'
	const phase = slot.phase ?? 'before'
	if (phase !== 'before' && phase !== 'after')
		throw new Error(
			`A scripts slot's phase is 'before' or 'after', not '${String(phase)}' — ` +
				`'before' runs over the in-port's value, 'after' over the out-port's.`,
		)
	const at = `${phase === 'before' ? 'in' : 'out'}:${port}`
	parseSeamAddress(at)
	return at
}

/**
 * Parse a seam address, or throw with the grammar spelled out — for the
 * reason `parseScriptKindId` gives: a fallback that half-works is how a chain
 * ends up somewhere nobody meant.
 * @experimental
 */
export function parseSeamAddress(at: string): ParsedSeamAddress {
	if (typeof at !== 'string' || at.length === 0) throw new Error(seamGrammar(String(at)))
	const colon = at.indexOf(':')
	if (colon === -1) {
		if (!SEAM_NAME.test(at)) throw new Error(seamGrammar(at))
		return { kind: 'point', name: at }
	}
	const head = at.slice(0, colon)
	const name = at.slice(colon + 1)
	if ((head !== 'in' && head !== 'out') || !SEAM_NAME.test(name)) throw new Error(seamGrammar(at))
	return { kind: head, name }
}
