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
/**
 * The grammar, mirroring the attribute slot id's exactly one kind segment over.
 * Owner is a plugin slug (`vendor.plugin`) or `core`; name is kebab-case;
 * major is the pin.
 * @experimental
 */
export const TEMPLATE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:template\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/;
/** Type guard: is this string a well-formed template id? @internal */
export function isTemplateId(value) {
    return typeof value === 'string' && TEMPLATE_ID.test(value);
}
/** Split a template id, or `null` when it is not one. @internal */
export function parseTemplateId(value) {
    if (!isTemplateId(value))
        return null;
    const [owner, rest] = value.split(':');
    const [name, major] = rest.slice('template/'.length).split('@');
    return { owner, name, major: Number(major) };
}
/**
 * Everything wrong with one declared template, in the author's words.
 *
 * Separate from `defineExtension` so the CLI's packager and the instance's
 * install check can hold a manifest to the same rule the author was held to,
 * without re-deriving it and coming to a different answer.
 * @internal
 */
export function templateSeedProblems(t, owner) {
    const problems = [];
    const parts = parseTemplateId(t.id);
    if (!parts) {
        problems.push(`template id '${t.id}' is not a template id — it must read ` +
            `'${owner}:template/<kebab-name>@<major>' (e.g. '${owner}:template/table-narration@1').`);
    }
    else if (parts.owner === 'core') {
        problems.push(`template '${t.id}' claims the 'core' namespace, which is reserved. ` +
            `Name it '${owner}:template/${parts.name}@${parts.major}'.`);
    }
    else if (parts.owner !== owner) {
        problems.push(`template '${t.id}' sits under namespace '${parts.owner}', not '${owner}'. ` +
            `Ownership is what lets an update replace your rows and leave everyone else's alone.`);
    }
    const isFields = !!t.body && typeof t.body === 'object' && !Array.isArray(t.body);
    const isSource = typeof t.body === 'string';
    if (t.kind === 'prompts') {
        if (!t.nodeDefinitionId)
            problems.push(`template '${t.id}' is a prompts row and names no nodeDefinitionId — a prompt ` +
                `follows the node it was written for, and the node is half its pool key.`);
        if (!t.slot)
            problems.push(`template '${t.id}' is a prompts row and names no slot — a definition may declare ` +
                `more than one prompts slot, each with its own fields, so the slot is the other half.`);
        if (!isFields)
            problems.push(`template '${t.id}' is a prompts row, so 'body' is field name → prose ` +
                `({ systemPrompt: '…' }), not a single string.`);
        if (t.engine)
            problems.push(`template '${t.id}' is a prompts row and declares an engine. Prompts are authored ` +
                `text fields, not a rendered document — drop 'engine'.`);
        if (t.variableId)
            problems.push(`template '${t.id}' is a prompts row and declares a variableId.`);
    }
    else if (t.kind === 'template') {
        if (!t.nodeDefinitionId)
            problems.push(`template '${t.id}' is a context template and names no nodeDefinitionId — the node ` +
                `whose context it renders is half its pool key.`);
        if (!isSource)
            problems.push(`template '${t.id}' is a context template, so 'body' is the source string.`);
        if (!t.engine)
            problems.push(`template '${t.id}' is a context template and declares no engine. The engine travels ` +
                `on the value: a source with none would be rendered in whatever core ships instead ` +
                `of what you wrote it in.`);
        if (t.variableId)
            problems.push(`template '${t.id}' is a context template and declares a variableId.`);
    }
    else if (t.kind === 'variables') {
        if (!t.variableId)
            problems.push(`template '${t.id}' is a variable layout and names no variableId — a layout is keyed ` +
                `by what it renders, never by a node or a spec.`);
        if (!isSource)
            problems.push(`template '${t.id}' is a variable layout, so 'body' is the source string.`);
        if (!t.engine)
            problems.push(`template '${t.id}' is a variable layout and declares no engine. A layout written in ` +
                `one language and selected into a slot that renders another stores cleanly and ` +
                `renders as raw markup.`);
        if (t.nodeDefinitionId || t.slot)
            problems.push(`template '${t.id}' is a variable layout and names a node — layouts are keyed by the ` +
                `variable they render, so that any pipeline rendering it may select this row.`);
    }
    else {
        problems.push(`template '${t.id}' has kind '${t.kind}'. ` +
            `A shipped template fills a 'prompts', 'template' or 'variables' slot.`);
    }
    return problems;
}
//# sourceMappingURL=templateIds.js.map