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
import { i18nFindings } from './i18n.js';
import { refuseUnlessIdentical } from './hash.js';
const SCRIPT_ID = /^([a-z0-9][a-z0-9.-]*):script:([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)@(\d+)$/;
/** Is this a script id at all? Cheap enough to call in a filter. @experimental */
export const isScriptKindId = (id) => SCRIPT_ID.test(id);
/**
 * Parse, or throw with the grammar spelled out.
 *
 * Throwing beats returning null here for the reason 12 §2a gives about template
 * engines: a caller that gets `undefined` from a malformed id writes a fallback,
 * and a fallback that half-works is how a script ends up attached to a hook
 * nobody meant. An id is either well-formed or it is a bug in the thing that
 * produced it.
 * @internal
 */
export function parseScriptKindId(id) {
    const m = SCRIPT_ID.exec(id);
    if (!m)
        throw new Error(`'${id}' is not a valid script type id. The grammar is ` +
            `'<namespace>:script:<content>/<operation>@<major>' — ` +
            `'core:script:text/stop@1', 'stats:script:data/check@1'. Lowercase, digits ` +
            `and hyphens in each segment; dots additionally allowed in the namespace. ` +
            `The content segment is structural: hook matching, chain homogeneity and ` +
            `panel grouping all read it, which is why it is a segment and not a naming ` +
            `habit inside the name (18 §1).`);
    return {
        namespace: m[1],
        content: m[2],
        operation: m[3],
        version: Number(m[4]),
        space: `${m[2]}/${m[3]}`,
    };
}
/**
 * `content/operation` — what every link in one chain must share (18 §5).
 *
 * Checkable off the id, which is the point of putting content in the grammar: a
 * `candidates` script dropped into a `text/transform` chain refuses at attach
 * rather than at run time, and neither the registry nor the script body has to
 * be consulted to know it.
 * @experimental
 */
export const scriptSpace = (id) => parseScriptKindId(id).space;
const scriptTypes = new Map();
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
export function defineScriptKind(decl) {
    parseScriptKindId(decl.id);
    // The display text (R-20): the name and description a panel lists it by,
    // and the blast-radius badge — required, because a chain a person cannot
    // read the consequences of is a permission nobody can grant knowingly.
    const findings = [
        ...i18nFindings(decl.i18n?.name, `${decl.id} i18n.name`),
        ...i18nFindings(decl.i18n?.description, `${decl.id} i18n.description`),
        ...i18nFindings(decl.blastRadius, `${decl.id} blastRadius`, { required: true }),
    ];
    if (findings.length)
        throw new Error(`${decl.id} declares display text a publish refuses (R-20):\n · ${findings.join('\n · ')}`);
    const existing = scriptTypes.get(decl.id);
    if (existing)
        refuseUnlessIdentical(existing, decl, `duplicate script type id: ${decl.id}`, {
            // `blastRadius` is a badge, and this is where the docblock on
            // `ScriptKindDecl` becomes true rather than aspirational: it sits beside
            // `i18n` instead of inside it because it is required on every type and
            // `i18n` is not, so the generic strip never saw it and re-wording a
            // warning threw. `semantics` is the same shape of word and is *not*
            // listed — it is contract, and only this file knows the difference.
            display: ['blastRadius'],
        });
    scriptTypes.set(decl.id, decl);
    return decl;
}
/**
 * The plugin-facing door. Same registration, minus the ability to claim core's
 * namespace — checked here rather than in `defineScriptKind` so core's own
 * declarations do not have to argue past their own guard.
 * @experimental
 */
export function definePluginScriptKind(pluginId, decl) {
    if (decl.id.startsWith('core:'))
        throw new Error(`plugin '${pluginId}' may not declare '${decl.id}': the 'core:' namespace is ` +
            `reserved. Publish it under your own namespace — a script type two parties ` +
            `can define is one where the same chain means different things depending on ` +
            `load order.`);
    return defineScriptKind(decl);
}
/** @internal */
export const getScriptKind = (id) => scriptTypes.get(id);
/** @experimental */
export const allScriptKinds = () => [...scriptTypes.values()];
/** @internal */
export function _clearScriptKinds() {
    scriptTypes.clear();
}
// ── Core's catalog, v1 (18 §3) ──────────────────────────────────────────────
//
// Nine types across six content scopes. The scopes map onto the existing
// shape vocabulary rather than inventing a second taxonomy of what data is —
// which is also what lets an extension add `image` or `audio` alongside its own
// types and get a modality-agnostic tier for free.
const TEXT = 'core:shape/text@1';
const CANDIDATES = 'core:shape/context-candidates@1';
const JSON_SHAPE = 'core:shape/json@1';
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
});
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
 * @experimental
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
});
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
});
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
});
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
});
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
});
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
});
/**
 * The extracted cast, after the model has answered and the host has parsed.
 *
 * Its own content scope rather than a `context` operation, because chain
 * homogeneity is keyed on content (18 §5) and a cast is not a template
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
});
/**
 * Who speaks next, as a script (plans/19 §5, second half; ruled 2026-09-21).
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
});
/**
 * Every content scope core ships, in panel order.
 *
 * Derived from the registry rather than restated, so a scope arrives the moment
 * a type using it is declared — including an extension's. A hand-written list
 * is the thing 18 §1 rule 3 warns against: a second taxonomy of what data is,
 * kept in step by hand.
 * @experimental
 */
export const scriptContentScopes = () => [
    ...new Set(allScriptKinds().map((t) => parseScriptKindId(t.id).content)),
];
//# sourceMappingURL=scripts.js.map