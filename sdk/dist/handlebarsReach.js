/**
 * What a Handlebars reference can reach, at one point in a template.
 *
 * Typed templates P4. The template checker (`@serene-pub/sdk/template-check`)
 * and a host's editor assist both need the same three answers — what `../`
 * climbs to, what a block param is bound to, and what one `{{#each}}` element
 * is — and when they were two copies they drifted: the assist treated an
 * `{{#if}}` as a new context, so a root name inside one was "unknowable". This
 * module is the one reading; it has no dependencies, so an editor that only
 * scans tags (it sees half-typed source, which no parser accepts) can use it
 * without the parser the checker carries.
 *
 * **Conservative by construction**: whatever the schema cannot speak to — an
 * `'any'` root, a record's author-chosen key, a subexpression's result —
 * resolves as *unchecked*, never as wrong.
 */
import { elementOf, resolvePath } from './template.js';
/** The root: names resolve against the scope. @experimental */
export const rootHandlebarsReach = () => ({ unchecked: false, params: new Map() });
/**
 * Read a written path the way Handlebars' parser does, for a caller that only
 * has the text (an editor scanning tags). The checker reads the parser's own
 * AST instead and builds the same shape from it.
 * @experimental
 */
export function handlebarsPath(expr) {
    let rest = expr.trim();
    if (rest.startsWith('@'))
        return { depth: 0, scoped: false, data: true, parts: splitSegments(rest.slice(1)) };
    let depth = 0;
    while (rest.startsWith('../')) {
        rest = rest.slice(3);
        depth++;
    }
    if (rest === '..')
        return { depth: depth + 1, scoped: false, data: false, parts: [] };
    let scoped = false;
    if (rest.startsWith('./')) {
        scoped = true;
        rest = rest.slice(2);
    }
    let parts = splitSegments(rest);
    if (parts[0] === 'this') {
        scoped = true;
        parts = parts.slice(1);
    }
    if (parts.length === 1 && parts[0] === '.')
        parts = [];
    return { depth, scoped, data: false, parts };
}
/**
 * `this.[extra lore].note` → `['this', 'extra lore', 'note']`.
 *
 * Splitting on `.` alone is right until a segment literal holds one, and
 * unwrapping the brackets is what lets the name match the schema's key — the
 * schema knows `extra lore`, not `[extra lore]`. A half-typed `[extra lo` still
 * names its segment.
 */
function splitSegments(expr) {
    const out = [];
    let cur = '';
    let inBracket = false;
    for (const c of expr) {
        if (c === '[') {
            inBracket = true;
            continue;
        }
        if (c === ']') {
            inBracket = false;
            continue;
        }
        if (c === '.' && !inBracket) {
            if (cur)
                out.push(cur);
            cur = '';
            continue;
        }
        cur += c;
    }
    if (cur)
        out.push(cur);
    return out;
}
const UNCHECKED = { kind: 'unchecked' };
/** Is this the root reach, where names resolve against the scope? */
const isRoot = (r) => !r.context && !r.parent;
/**
 * Resolve a path within a reach — Handlebars' own order: `../` climbs first; a
 * block param only answers an unscoped, unclimbed name; the root answers from
 * the scope; any other context answers from its type.
 * @experimental
 */
export function resolveHandlebarsPath(path, reach, scope) {
    if (path.data)
        return UNCHECKED;
    let r = reach;
    for (let i = 0; i < path.depth; i++) {
        if (!r.parent)
            return UNCHECKED;
        r = r.parent;
    }
    const [first, ...tail] = path.parts;
    if (first === undefined)
        return {
            kind: 'resolved',
            base: r.context,
            label: 'this',
            rest: [],
            resolution: resolvePath(r.context, []),
        };
    if (!path.depth && !path.scoped && reach.params.has(first)) {
        const bound = reach.params.get(first);
        return {
            kind: 'resolved',
            base: bound,
            label: first,
            rest: tail,
            resolution: resolvePath(bound, tail, first),
        };
    }
    if (isRoot(r)) {
        const decl = scope[first];
        if (decl === undefined)
            return { kind: 'unknown-root', root: first, available: Object.keys(scope) };
        return {
            kind: 'resolved',
            base: decl,
            label: first,
            rest: tail,
            resolution: resolvePath(decl, tail, first),
        };
    }
    if (r.unchecked || !r.context)
        return UNCHECKED;
    return {
        kind: 'resolved',
        base: r.context,
        label: 'this',
        rest: path.parts,
        resolution: resolvePath(r.context, path.parts, 'this'),
    };
}
/** What a path's value is, as a declaration — undefined when unknowable. @experimental */
export function typeOfHandlebarsPath(path, reach, scope) {
    const r = resolveHandlebarsPath(path, reach, scope);
    if (r.kind !== 'resolved' || !r.resolution.ok)
        return undefined;
    return r.resolution.field ?? (r.rest.length ? undefined : r.base);
}
/** A declaration that is a walkable field — not `'any'`, not the legacy name list. @experimental */
export function asVarField(decl) {
    return decl && decl !== 'any' && !Array.isArray(decl) ? decl : undefined;
}
/**
 * The reach a block's body sees.
 *
 * Only `each` and `with` move the context, and only they give `../` a step to
 * climb; `if`, `unless` and every other block helper keep the reach they were
 * opened in (plus any `as |x|` names, unchecked). `each` binds its first param
 * to one element and the second to the index or key; `with` binds it to the
 * value itself.
 *
 * An `{{else}}` branch of `each`/`with` runs in the reach the block was opened
 * in — the caller keeps that one, it is not this.
 * @experimental
 */
export function enterHandlebarsBlock(reach, helper, target, blockParams = []) {
    if (helper !== 'each' && helper !== 'with') {
        if (!blockParams.length)
            return reach;
        const params = new Map(reach.params);
        for (const name of blockParams)
            params.set(name, undefined);
        return { ...reach, params };
    }
    const context = helper === 'each' ? elementOf(target) : asVarField(target);
    const params = new Map(reach.params);
    if (blockParams[0])
        params.set(blockParams[0], context);
    for (const extra of blockParams.slice(1))
        params.set(extra, undefined);
    return { context, unchecked: !context, params, parent: reach };
}
/**
 * The nearest name, when there is an obviously-nearest one — the "did you
 * mean" half of a finding.
 *
 * Deliberately tight: within one edit for a name of four characters or fewer,
 * two otherwise. A wrong guess sends someone to change a line that was
 * correct, which costs more than saying nothing. Ties resolve alphabetically,
 * so the answer is stable.
 * @experimental
 */
export function nearestName(typed, available) {
    if (!typed || !available.length)
        return undefined;
    const limit = typed.length <= 4 ? 1 : 2;
    let best;
    let bestDistance = Infinity;
    for (const name of [...available].sort()) {
        const d = editDistance(typed.toLowerCase(), name.toLowerCase());
        if (d < bestDistance && d <= limit) {
            best = name;
            bestDistance = d;
        }
    }
    return best;
}
/** Levenshtein, two rows. */
function editDistance(a, b) {
    if (a === b)
        return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++)
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = row;
    }
    return prev[b.length];
}
//# sourceMappingURL=handlebarsReach.js.map