/**
 * Script **types** — the fourth paradigm's contracts (18 §1–§3).
 *
 * A script is user-authored, typed text that transforms data at a declared
 * point in a run: no SDK, no manifest, no build step. This module declares the
 * *contracts* those texts conform to, not the texts themselves. The split is
 * the same one prompts and prompt slots already have, and 18 §2 states it
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
 * filterable; `text-stop` is a naming habit (18 §1).
 *
 * ⚠ This is the **one** compound kind, and the extension stops here. Node kinds
 * are already segmented by kind and never grow qualifiers; scripts are
 * segmented by payload because that is what decides which chain a link may join
 * and which hook may accept it. Generalizing the grammar further is a non-goal.
 *
 * ⚠ The grammar is hard-frozen once the SDK publishes (07 §0g). Scripts are
 * unshipped, so this is the free moment to extend it additively.
 */

import type { I18n } from './descriptors.js'
import type { ShapeId } from './shapes.js'
import { refuseUnlessIdentical } from './hash.js'

/** `core:script:text/stop@1` — namespaced, segmented by payload, pinned. */
export type ScriptTypeId = string

/**
 * What a chain of this operation *does* with what its links return (18 §5).
 *
 * Declared per operation rather than per hook, because it is a property of the
 * contract: two `text` operations differ precisely in whether their return
 * flows onward or is consumed as a judgement.
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

export interface ScriptTypeDecl {
	id: ScriptTypeId
	i18n?: { name?: I18n; description?: I18n }
	/**
	 * What a script of this type is able to do, in the words the panel badges
	 * it with. Display text: stripped from the content hash like `i18n`, for
	 * the same reason — copyediting a warning is not a contract change.
	 *
	 * Present on every type and deliberately blunt. Operations within a content
	 * scope *are* the permission granularity (18 §3): `messages/inject` split
	 * from `messages/transform` so a cautious user can accept injection chains
	 * while refusing rewrites, and that choice is only meaningful if the
	 * difference is stated where the choice is made.
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
	 * property, not the type's (18 §3).
	 *
	 * A `verdict` operation declares `out` as what the hook consumes, which is
	 * never merged downstream.
	 */
	ports: { in: Record<string, ShapeId>; out: Record<string, ShapeId> }
}

/** A parsed script id. The segments callers actually branch on. */
export interface ParsedScriptTypeId {
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

/** Is this a script id at all? Cheap enough to call in a filter. */
export const isScriptTypeId = (id: string): boolean => SCRIPT_ID.test(id)

/**
 * Parse, or throw with the grammar spelled out.
 *
 * Throwing beats returning null here for the reason 12 §2a gives about template
 * engines: a caller that gets `undefined` from a malformed id writes a fallback,
 * and a fallback that half-works is how a script ends up attached to a hook
 * nobody meant. An id is either well-formed or it is a bug in the thing that
 * produced it.
 */
export function parseScriptTypeId(id: string): ParsedScriptTypeId {
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
 * `content/operation` — what every link in one chain must share (18 §5).
 *
 * Checkable off the id, which is the point of putting content in the grammar: a
 * `candidates` script dropped into a `text/transform` chain refuses at attach
 * rather than at run time, and neither the registry nor the script body has to
 * be consulted to know it.
 */
export const scriptSpace = (id: ScriptTypeId): string => parseScriptTypeId(id).space

const scriptTypes = new Map<ScriptTypeId, ScriptTypeDecl>()

/**
 * Register a script type.
 *
 * The same two refusals as every other registry here — an id has exactly one
 * owner, and the grammar is checked at the door rather than trusted. The second
 * matters more for scripts than elsewhere: these ids are matched by *segment*,
 * so a malformed one does not fail loudly, it quietly belongs to no chain and
 * no hook.
 */
export function defineScriptType(decl: ScriptTypeDecl): ScriptTypeDecl {
	parseScriptTypeId(decl.id)
	const existing = scriptTypes.get(decl.id)
	if (existing)
		refuseUnlessIdentical(existing, decl, `duplicate script type id: ${decl.id}`, {
			// `blastRadius` is a badge, and this is where the docblock on
			// `ScriptTypeDecl` becomes true rather than aspirational: it sits beside
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
 * namespace — checked here rather than in `defineScriptType` so core's own
 * declarations do not have to argue past their own guard.
 */
export function definePluginScriptType(pluginId: string, decl: ScriptTypeDecl): ScriptTypeDecl {
	if (decl.id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${decl.id}': the 'core:' namespace is ` +
				`reserved. Publish it under your own namespace — a script type two parties ` +
				`can define is one where the same chain means different things depending on ` +
				`load order.`,
		)
	return defineScriptType(decl)
}

export const getScriptType = (id: ScriptTypeId) => scriptTypes.get(id)
export const allScriptTypes = () => [...scriptTypes.values()]
export function _clearScriptTypes(): void {
	scriptTypes.clear()
}

// ── Core's catalog, v1 (18 §3) ──────────────────────────────────────────────
//
// Eight types across five content scopes. The scopes map onto the existing
// shape vocabulary rather than inventing a second taxonomy of what data is —
// which is also what lets an extension add `image` or `audio` alongside its own
// types and get a modality-agnostic tier for free.

const TEXT = 'core:shape/text@1'
const CANDIDATES = 'core:shape/context-candidates@1'
const JSON_SHAPE = 'core:shape/json@1'

export const textTransform = defineScriptType({
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
 * ⚠ A verdict, not a transform, and the difference is load-bearing.
 *
 * A stop script never rewrites the stream — it answers "where, in the text you
 * have been shown, should this end?" That makes the answer a **min-reduction**:
 * every attached script evaluates independently and the earliest index wins.
 * Order-free and commutative, which is exactly what makes merging the
 * connection's chain with the pipeline's and the chat's well-defined without a
 * precedence rule nobody would remember (18 §5).
 *
 * It is also the one type with a conformance law attached (S1): the verdict is
 * a function of the accumulated text only, never of chunk boundaries, or a
 * reply replays differently than it streamed.
 */
export const textStop = defineScriptType({
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
 */
export const messagesInject = defineScriptType({
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

export const messagesTransform = defineScriptType({
	id: 'core:script:messages/transform@1',
	i18n: {
		name: { en: 'Transform messages' },
		description: { en: 'Rewrite or drop messages before they reach the model.' },
	},
	blastRadius: { en: 'Can remove or rewrite history' },
	semantics: 'transform',
	ports: { in: { messages: JSON_SHAPE }, out: { messages: JSON_SHAPE } },
})

export const candidatesFilter = defineScriptType({
	id: 'core:script:candidates/filter@1',
	i18n: {
		name: { en: 'Filter candidates' },
		description: { en: 'Drop retrieved entries before ranking, with a reason on each.' },
	},
	blastRadius: { en: 'Excludes lore' },
	semantics: 'transform',
	ports: { in: { candidates: CANDIDATES }, out: { candidates: CANDIDATES } },
})

export const candidatesRescore = defineScriptType({
	id: 'core:script:candidates/rescore@1',
	i18n: {
		name: { en: 'Rescore candidates' },
		description: { en: 'Adjust retrieval scores so the ranker orders entries differently.' },
	},
	blastRadius: { en: 'Reorders ranking' },
	semantics: 'transform',
	ports: { in: { candidates: CANDIDATES }, out: { candidates: CANDIDATES } },
})

export const contextTransform = defineScriptType({
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
 * homogeneity is keyed on content (18 §5) and a cast is not a template
 * context — a chain that could hold both would let a context edit land on a
 * cast list by attachment mistake, silently. The scope is what makes the
 * mistake refusable at attach.
 *
 * The flowing value is what `core:provider/extract-cast@1` publishes on its
 * `cast` port: `{ participants, mentioned }`. Scripts here rename, merge
 * aliases, drop a junk detection, or add someone the model missed — the
 * paste-rung half of replaceable cast extraction. The other half is the node
 * rebind: a whole different extractor is a same-shaped provider, never a
 * script, because scripts are pure compute and extraction calls a model.
 */
export const castTransform = defineScriptType({
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
 * Every content scope core ships, in panel order.
 *
 * Derived from the registry rather than restated, so a scope arrives the moment
 * a type using it is declared — including an extension's. A hand-written list
 * is the thing 18 §1 rule 3 warns against: a second taxonomy of what data is,
 * kept in step by hand.
 */
export const scriptContentScopes = (): string[] => [
	...new Set(allScriptTypes().map((t) => parseScriptTypeId(t.id).content)),
]
