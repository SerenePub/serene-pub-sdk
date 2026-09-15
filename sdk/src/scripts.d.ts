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
import type { I18n } from './descriptors.js';
import type { ShapeId } from './shapes.js';
/** `core:script:text/stop@1` — namespaced, segmented by payload, pinned. */
export type ScriptTypeId = string;
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
'transform'
/**
 * The return is a verdict the hook consumes and never merges. Verdicts are
 * reduced, not folded — `text/stop` takes the minimum index — which is what
 * makes merging chains from several scopes well-defined with no precedence
 * fight.
 */
 | 'verdict';
export interface ScriptTypeDecl {
    id: ScriptTypeId;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
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
    blastRadius: I18n;
    semantics: ChainSemantics;
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
    ports: {
        in: Record<string, ShapeId>;
        out: Record<string, ShapeId>;
    };
}
/** A parsed script id. The segments callers actually branch on. */
export interface ParsedScriptTypeId {
    namespace: string;
    /** e.g. `text`, `messages`, `candidates`, `context`. */
    content: string;
    /** e.g. `transform`, `stop`, `inject`, `filter`, `rescore`. */
    operation: string;
    version: number;
    /** `content/operation` — the chain-homogeneity key, computed once here. */
    space: string;
}
/** Is this a script id at all? Cheap enough to call in a filter. */
export declare const isScriptTypeId: (id: string) => boolean;
/**
 * Parse, or throw with the grammar spelled out.
 *
 * Throwing beats returning null here for the reason 12 §2a gives about template
 * engines: a caller that gets `undefined` from a malformed id writes a fallback,
 * and a fallback that half-works is how a script ends up attached to a hook
 * nobody meant. An id is either well-formed or it is a bug in the thing that
 * produced it.
 */
export declare function parseScriptTypeId(id: string): ParsedScriptTypeId;
/**
 * `content/operation` — what every link in one chain must share (18 §5).
 *
 * Checkable off the id, which is the point of putting content in the grammar: a
 * `candidates` script dropped into a `text/transform` chain refuses at attach
 * rather than at run time, and neither the registry nor the script body has to
 * be consulted to know it.
 */
export declare const scriptSpace: (id: ScriptTypeId) => string;
/**
 * Register a script type.
 *
 * The same two refusals as every other registry here — an id has exactly one
 * owner, and the grammar is checked at the door rather than trusted. The second
 * matters more for scripts than elsewhere: these ids are matched by *segment*,
 * so a malformed one does not fail loudly, it quietly belongs to no chain and
 * no hook.
 */
export declare function defineScriptType(decl: ScriptTypeDecl): ScriptTypeDecl;
/**
 * The plugin-facing door. Same registration, minus the ability to claim core's
 * namespace — checked here rather than in `defineScriptType` so core's own
 * declarations do not have to argue past their own guard.
 */
export declare function definePluginScriptType(pluginId: string, decl: ScriptTypeDecl): ScriptTypeDecl;
export declare const getScriptType: (id: ScriptTypeId) => ScriptTypeDecl | undefined;
export declare const allScriptTypes: () => ScriptTypeDecl[];
export declare function _clearScriptTypes(): void;
export declare const textTransform: ScriptTypeDecl;
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
export declare const textStop: ScriptTypeDecl;
/**
 * Additive only, and split from `messages/transform` on purpose.
 *
 * Same content, different blast radius: injection cannot touch what is already
 * there, so a cautious user can accept injection chains while refusing
 * rewrites. That choice only exists because the two are separate operations —
 * a single `messages/edit` would have made "add a reminder at depth 2" and
 * "delete half the history" the same permission.
 */
export declare const messagesInject: ScriptTypeDecl;
export declare const messagesTransform: ScriptTypeDecl;
export declare const candidatesFilter: ScriptTypeDecl;
export declare const candidatesRescore: ScriptTypeDecl;
export declare const contextTransform: ScriptTypeDecl;
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
export declare const castTransform: ScriptTypeDecl;
/**
 * Every content scope core ships, in panel order.
 *
 * Derived from the registry rather than restated, so a scope arrives the moment
 * a type using it is declared — including an extension's. A hand-written list
 * is the thing 18 §1 rule 3 warns against: a second taxonomy of what data is,
 * kept in step by hand.
 */
export declare const scriptContentScopes: () => string[];
