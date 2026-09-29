/**
 * **Template ids** — the owner-namespaced name a spec uses to reference a
 * template row, and the declaration a plugin ships one under (R19).
 *
 * ## The problem this closes
 *
 * A prompt, a context template and a variable layout are all ROWS in the
 * instance, and a spec's shipped configuration points at one by its integer id
 * — a number an identity sequence assigns, different on every install, which no
 * shipped document can write. Core's rows carry a `seedKey` as their storage
 * identity, and that got core as far as core needed to go: an unnamespaced,
 * bare string like `pipeline-prompt:core:task/assemble:prompts:tool-loop-default`
 * is fine when there is exactly one party minting them.
 *
 * It does not survive a second party. An extension could already ship
 * `pipelines`, and had no way at all to ship a template row one of them
 * references; and a third-party spec added to somebody else's genre had no
 * stable name for that genre's prompt except a seed key with no owner in it,
 * which is a name anyone can collide with and nobody can version.
 *
 * So a template row gains a second identity column — the same deliberate
 * second-identity pattern `completion_templates.key` states — holding an id in
 * the grammar every other declared thing already uses:
 *
 * ```
 * owner:template/name@major        core:template/pipeline-context-template-core-default@1
 *                                 acme.dice:template/table-narration@1
 * ```
 *
 * `seedKey` is untouched and stays what it is: core's storage identity, matched
 * on by the seed pass, NULL on every row a person wrote.
 *
 * ## `@N` governs breakage
 *
 * A template id is pinned like every other id in this vocabulary. Rewording a
 * template is an edit to the row the id already names. A change that would make
 * a spec pinned to it render something it did not ask for — a field removed, a
 * variable renamed, a different language — is a **new major**, which is a NEW
 * ROW under a new id. Both ids resolve; every spec keeps rendering what it was
 * written against, and moving is an edit somebody makes on purpose.
 *
 * ## ⚠ Not a template ENGINE id
 *
 * `core:template/handlebars@1` and `core:template/liquid@1` are **engine** ids
 * (`engines.ts`) and share this kind segment. The two never meet in one field:
 * an engine id is only ever read from an `engine` column or an engine registry,
 * a template id only from `template_id` or a config value's `templateId`. The
 * overlap is recorded here rather than left to be discovered — see the report
 * accompanying R19.
 */
import type { EngineId } from './engines.js';
/**
 * The grammar, mirroring the attribute slot id's exactly one kind segment over.
 * Owner is a plugin slug (`vendor.plugin`) or `core`; name is kebab-case;
 * major is the pin.
 * @experimental
 */
export declare const TEMPLATE_ID: RegExp;
/** The three parts of a template id, or `null` when it is not one. @experimental */
export interface TemplateIdParts {
    owner: string;
    name: string;
    major: number;
}
/** Type guard: is this string a well-formed template id? @internal */
export declare function isTemplateId(value: unknown): value is string;
/** Split a template id, or `null` when it is not one. @internal */
export declare function parseTemplateId(value: unknown): TemplateIdParts | null;
/**
 * Which kind of row a shipped template is. The three values are `SlotKind`
 * members, deliberately — a template row exists to fill one kind of slot, and
 * saying which is what routes it to the right table without anything having to
 * infer it from the shape of `body`.
 * @experimental
 */
export type TemplateSeedKind = 'prompts' | 'template' | 'variables';
/**
 * A template row an extension ships, beside its `pipelines`.
 *
 * Mirrors `CorePromptSeed` — core's own shipped-prompt shape — with the seed
 * key replaced by the namespaced `id`, because a plugin's row is referenced by
 * a name that carries its owner and core's is not.
 *
 * ⚠ There is no `description`. None of the three tables has a column for one,
 * and a declared field that silently reaches no row is worse than an absent
 * one; it can be added with the column, additively, the day there is somewhere
 * to put it.
 * @experimental
 */
export interface TemplateSeed {
    /**
     * `<pluginId>:template/<name>@<major>`. The owner segment must be the
     * declaring plugin's own slug — `defineExtension` refuses anything else,
     * including `core:`, because ownership is what lets an update replace your
     * rows and leave everybody else's alone.
     */
    id: string;
    kind: TemplateSeedKind;
    /**
     * `prompts` and `template`: the pool's node definition id, **UNVERSIONED**
     * (`core:task/build-template-context`) — which may belong to another
     * package. Unversioned so a node's @1 → @2 does not strand the prose
     * written for it.
     */
    nodeDefinitionId?: string;
    /**
     * `prompts`: which prompts slot on that node. A definition may declare more
     * than one, each with its own field set, so it is half the pool key.
     */
    slot?: string;
    /** `variables`: the registered variable this renders (`core:var/characters@1`). */
    variableId?: string;
    /**
     * `template` and `variables`: the registered engine id `body` is written in.
     * Required for both — a stored template keeps the language it was authored
     * in rather than inheriting whatever core renders with later, and a Liquid
     * source handed to a Handlebars slot stores cleanly and ships `{% %}` to the
     * model as prose.
     */
    engine?: EngineId;
    /**
     * The content. Field name → prose for `prompts` (exactly the fields that
     * slot declares); the template source for `template` and `variables`.
     */
    body: string | Record<string, string>;
    /** The human title. Defaults to the id's name segment where absent. */
    label?: string;
}
/**
 * Everything wrong with one declared template, in the author's words.
 *
 * Separate from `defineExtension` so the CLI's packager and the instance's
 * install check can hold a manifest to the same rule the author was held to,
 * without re-deriving it and coming to a different answer.
 * @internal
 */
export declare function templateSeedProblems(t: TemplateSeed, owner: string): string[];
//# sourceMappingURL=templateIds.d.ts.map