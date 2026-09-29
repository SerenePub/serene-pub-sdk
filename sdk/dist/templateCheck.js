/**
 * The one template checker (typed templates P4): does this Handlebars or
 * Liquid source parse, and does every name it reads exist in the scope it will
 * be rendered against?
 *
 * ## Why a separate entry point
 *
 * `@serene-pub/sdk/template-check`, not the barrel. The checker parses with
 * the real engines — `handlebars` and `liquidjs`, parse only (Q5) — and the
 * barrel is what every node author and plugin bundle imports; it has no
 * dependencies and stays that way. A host (the editor lint, a save, a
 * packager) imports this on purpose. Nothing here renders: the host keeps its
 * own engines with its own helpers, and hands this module their NAMES.
 *
 * ## What it reports, and what it leaves alone
 *
 * - **syntax** — the engine's own words and position. Always an error: a
 *   template that does not parse breaks every pipeline that selects it.
 * - **unknown-name** — a root the scope does not have. Renders as nothing.
 * - **unknown-path** — a field the declared type positively contradicts
 *   (`characters.nmae`, a field read straight off a list).
 * - **unknown-helper** — a Handlebars helper nobody registered.
 *
 * Conservative by construction: an `'any'` root, a record's author-chosen
 * key, a dynamic lookup (`lookup`, `a[k]`) and a subexpression's result are
 * unchecked, never guessed. Loop items, `{% assign %}`/`{% capture %}`
 * locals, `@data` and `forloop` are never scope names.
 *
 * **Untyped sources.** When `templateScopeReport().untyped` is non-empty some
 * producer supplies keys nobody declared, so a name missing from the scope may
 * still arrive: name and path findings are then WARNINGS, never errors, and
 * say which producer might supply them.
 * @experimental
 */
import Handlebars from 'handlebars';
import { Liquid, Tag, Hash, analyzeSync } from 'liquidjs';
import { handlebars as handlebarsEngine, liquid as liquidEngine } from './engines.js';
import { enterHandlebarsBlock, nearestName, resolveHandlebarsPath, rootHandlebarsReach, typeOfHandlebarsPath, } from './handlebarsReach.js';
import { resolvePath } from './template.js';
/**
 * Helpers Handlebars itself registers. A host's own (`json`, `isSet`, …) are
 * an input — {@link TemplateCheckOptions.helpers} — never hard-coded here.
 * @experimental
 */
export const HANDLEBARS_BUILTIN_HELPERS = [
    'if',
    'unless',
    'each',
    'with',
    'lookup',
    'log',
    'blockHelperMissing',
    'helperMissing',
];
/** Whether {@link checkTemplateSource} can say anything about this engine. @experimental */
export const canCheckTemplateEngine = (engine) => engine === handlebarsEngine.id || engine === liquidEngine.id;
/**
 * Check `src` in `engine` against `scope`. The findings only — see
 * {@link checkTemplateSourceReport} for whether anything was checked at all.
 * @experimental
 */
export function checkTemplateSource(engine, src, scope, options = {}) {
    return checkTemplateSourceReport(engine, src, scope, options).findings;
}
/**
 * Check `src` in `engine` against `scope`, and say whether it was checked.
 *
 * A syntax finding short-circuits: nothing useful can be said about the names
 * in a template that does not parse, and saying it anyway buries the one
 * message that matters. Each finding is reported once per place it appears.
 * @experimental
 */
export function checkTemplateSourceReport(engine, src, scope, options = {}) {
    if (!canCheckTemplateEngine(engine))
        return { checked: false, findings: [] };
    const lines = lineStarts(src);
    const isHandlebars = engine === handlebarsEngine.id;
    let parsed;
    try {
        parsed = isHandlebars ? Handlebars.parse(src) : liquidFor(options).parse(src);
    }
    catch (err) {
        return { checked: true, findings: [syntaxFinding(err, lines)] };
    }
    const sink = new FindingSink(scope, options.untyped ?? [], lines);
    try {
        if (isHandlebars)
            walkHandlebars(parsed, scope, helperSet(options), sink);
        else
            walkLiquid(parsed, src, scope, sink);
    }
    catch {
        // The source parsed a moment ago, so this is the analyser failing on
        // something it did not expect rather than the template being wrong.
        // Reporting nothing is right; claiming it was checked is not.
        return { checked: false, findings: [] };
    }
    return { checked: true, findings: sink.findings };
}
// ── Positions ───────────────────────────────────────────────────────────────
function lineStarts(src) {
    const out = [0];
    for (let i = 0; i < src.length; i++)
        if (src[i] === '\n')
            out.push(i + 1);
    return out;
}
/** 1-based line, 1-based column → 0-based offset. */
const offsetOf = (lines, line, column) => (lines[line - 1] ?? 0) + column - 1;
/**
 * Read a line and column off whatever the engine threw — the engine's own
 * report, never a guess. Handlebars sets `lineNumber` when a block does not
 * match its closer and otherwise states the line in its message; LiquidJS puts
 * the position on the token it failed at. None is guaranteed.
 */
function positionOf(err) {
    const e = err;
    if (typeof e?.lineNumber === 'number')
        return { line: e.lineNumber, column: (typeof e.column === 'number' ? e.column : 0) + 1 };
    const stated = /^Parse error on line (\d+)/.exec(String(e?.message ?? ''));
    if (stated)
        return { line: Number(stated[1]) };
    if (e?.token && typeof e.token.getPosition === 'function') {
        const [line, column] = e.token.getPosition();
        if (typeof line === 'number')
            return { line, column };
    }
    return {};
}
function syntaxFinding(err, lines) {
    const at = positionOf(err);
    const message = String(err?.message ?? err);
    return {
        kind: 'syntax',
        severity: 'error',
        message,
        fix: at.line
            ? `fix line ${at.line} so the template parses — the engine names the construct it stopped at`
            : 'fix the template so it parses — the engine names the construct it stopped at',
        ...at,
        ...(at.line ? { start: offsetOf(lines, at.line, at.column ?? 1) } : {}),
    };
}
class FindingSink {
    scope;
    untyped;
    lines;
    findings = [];
    seen = new Set();
    constructor(scope, untyped, lines) {
        this.scope = scope;
        this.untyped = untyped;
        this.lines = lines;
    }
    get nameSeverity() {
        return this.untyped.length ? 'warning' : 'error';
    }
    /** The sentence an untyped source earns a warning, or nothing. */
    get untypedNote() {
        if (!this.untyped.length)
            return '';
        const who = this.untyped.join(', ');
        return ` It may still come from ${who}, which ${this.untyped.length === 1 ? 'declares' : 'declare'} no types.`;
    }
    push(f) {
        const key = `${f.kind}:${f.path ?? f.name}:${f.start}`;
        if (this.seen.has(key))
            return;
        this.seen.add(key);
        this.findings.push(f);
    }
    where(line, column, length, tag) {
        const start = offsetOf(this.lines, line, column);
        return { line, column, start, end: start + length, ...(tag ? { tag } : {}) };
    }
    unknownRoot(root, path, available, line, column, tag) {
        const suggestion = nearestName(root, available);
        this.push({
            kind: 'unknown-name',
            severity: this.nameSeverity,
            name: root,
            path,
            message: `"${root}" isn't a recognized field at this scope, so it renders as nothing.` +
                (suggestion ? ` Did you mean "${suggestion}"?` : '') +
                this.untypedNote,
            fix: suggestion
                ? `use "${suggestion}"`
                : available.length
                    ? `available here: ${available.join(', ')}`
                    : 'nothing is declared here — check the node this template belongs to',
            available,
            ...(suggestion ? { suggestion } : {}),
            ...this.where(line, column, path.length, tag),
        });
    }
    badPath(r, root, path, line, column, tag) {
        const suggestion = r.at && r.available?.length ? nearestName(r.at, r.available) : undefined;
        this.push({
            kind: 'unknown-path',
            severity: this.nameSeverity,
            name: root,
            path,
            message: 
            // A sentence, so the did-you-mean after it reads as one too.
            (r.message ?? 'that path does not exist.').replace(/([^.?!])$/, '$1.') +
                (suggestion ? ` Did you mean "${suggestion}"?` : '') +
                this.untypedNote,
            fix: suggestion
                ? `use "${suggestion}"`
                : r.available?.length
                    ? `'${r.at}' is not one of: ${r.available.join(', ')}`
                    : 'check the shape this template declares — the path does not exist on it',
            ...(r.available ? { available: r.available } : {}),
            ...(suggestion ? { suggestion } : {}),
            ...this.where(line, column, path.length, tag),
        });
    }
    unknownHelper(name, known, line, column, tag) {
        const suggestion = nearestName(name, known);
        this.push({
            kind: 'unknown-helper',
            severity: 'error',
            name,
            message: `"${name}" isn't a recognized helper.` +
                (suggestion ? ` Did you mean "${suggestion}"?` : ''),
            fix: suggestion ? `use "${suggestion}"` : `helpers here: ${known.join(', ')}`,
            available: [...known],
            ...(suggestion ? { suggestion } : {}),
            ...this.where(line, column, name.length, tag),
        });
    }
    /** Report whatever a resolution says is wrong. */
    resolution(r, path, line, column, tag) {
        if (r.kind === 'unknown-root')
            this.unknownRoot(r.root, path, r.available, line, column, tag);
        else if (r.kind === 'resolved' && !r.resolution.ok)
            this.badPath(r.resolution, r.label, path, line, column, tag);
    }
    get scopeNames() {
        return Object.keys(this.scope);
    }
}
function helperSet(options) {
    return new Set([...HANDLEBARS_BUILTIN_HELPERS, ...(options.helpers ?? [])]);
}
const isPath = (n) => n?.type === 'PathExpression';
/** `this.x`, `./x` — Handlebars' own `scopedId` test. */
const scopedOf = (p) => /^\.|this\b/.test(p.original);
const readPath = (p) => ({
    depth: p.depth ?? 0,
    scoped: scopedOf(p),
    data: !!p.data,
    parts: p.parts ?? [],
});
/** A one-segment, unclimbed, unscoped name — what a helper call is spelled with. */
const simpleName = (p) => isPath(p) && !p.data && !p.depth && p.parts?.length === 1 && !scopedOf(p)
    ? p.parts[0]
    : undefined;
function walkHandlebars(ast, scope, helpers, sink) {
    const knownHelpers = [...helpers].sort();
    const lines = sink.lines;
    const spanOf = (loc) => loc
        ? {
            start: offsetOf(lines, loc.start.line, loc.start.column + 1),
            end: offsetOf(lines, loc.end.line, loc.end.column + 1),
        }
        : undefined;
    const ref = (node, reach, tag) => {
        if (!node)
            return;
        if (node.type === 'SubExpression')
            return call(node, reach, tag);
        if (!isPath(node))
            return;
        const path = readPath(node);
        if (path.data || !path.parts.length)
            return;
        const r = resolveHandlebarsPath(path, reach, scope);
        const written = node.original || path.parts.join('.');
        sink.resolution(r, written, node.loc?.start.line ?? 1, (node.loc?.start.column ?? 0) + 1, tag);
    };
    const args = (node, reach, tag) => {
        for (const p of node.params ?? [])
            ref(p, reach, tag);
        for (const pair of node.hash?.pairs ?? [])
            ref(pair.value, reach, tag);
    };
    /** A helper invocation — `(eq a b)`, `{{pad x 2}}`: the name is a helper, the rest are values. */
    const call = (node, reach, tag) => {
        const name = simpleName(node.path);
        if (name !== undefined && !helpers.has(name))
            sink.unknownHelper(name, knownHelpers, node.path.loc?.start.line ?? 1, (node.path.loc?.start.column ?? 0) + 1, tag);
        else if (name === undefined)
            ref(node.path, reach, tag);
        args(node, reach, tag);
    };
    const program = (p, reach) => {
        for (const stmt of p?.body ?? [])
            statement(stmt, reach);
    };
    const statement = (node, reach) => {
        const tag = spanOf(node.loc);
        switch (node.type) {
            case 'MustacheStatement': {
                const m = node;
                if (m.params?.length || m.hash?.pairs?.length)
                    return call(m, reach, tag);
                // `{{log}}`-style: a bare name that IS a helper is a call, not a read.
                const name = simpleName(m.path);
                if (name !== undefined && helpers.has(name))
                    return;
                return ref(m.path, reach, tag);
            }
            case 'BlockStatement': {
                const b = node;
                // `{{#foo}}` is always an invocation, never a variable.
                const name = simpleName(b.path);
                if (name !== undefined && !helpers.has(name))
                    sink.unknownHelper(name, knownHelpers, b.path.loc?.start.line ?? 1, (b.path.loc?.start.column ?? 0) + 1, tag);
                args(b, reach, tag);
                const helper = name ?? '';
                const first = b.params?.[0];
                const target = (helper === 'each' || helper === 'with') && isPath(first)
                    ? typeOfHandlebarsPath(readPath(first), reach, scope)
                    : undefined;
                program(b.program, enterHandlebarsBlock(reach, helper, target, b.program?.blockParams ?? []));
                // An `{{else}}` runs in the reach the block was opened in: an
                // `each` over nothing, a `with` of nothing — never the element.
                program(b.inverse, enterHandlebarsBlock(reach, 'if', undefined, b.inverse?.blockParams ?? []));
                return;
            }
            case 'PartialStatement':
            case 'PartialBlockStatement': {
                const p = node;
                for (const x of p.params ?? [])
                    ref(x, reach, tag);
                for (const pair of p.hash?.pairs ?? [])
                    ref(pair.value, reach, tag);
                program(p.program, reach);
                return;
            }
            default:
                return;
        }
    };
    program(ast, rootHandlebarsReach());
}
// ── Liquid ──────────────────────────────────────────────────────────────────
/**
 * The filesystem the checker's Liquid gets: none. It parses; nothing it does
 * should ever read a file, and a re-registered `include` finds no loader.
 */
const NO_FILESYSTEM = {
    exists: async () => false,
    existsSync: () => false,
    readFile: async () => {
        throw new Error('templates are rows, not files');
    },
    readFileSync: () => {
        throw new Error('templates are rows, not files');
    },
    resolve: () => {
        throw new Error('templates are rows, not files');
    },
    contains: async () => false,
    containsSync: () => false,
};
/** A tag refused at parse time, with the host's sentence. */
function refusedTag(message) {
    return class extends Tag {
        constructor(token, remainTokens, liquid) {
            super(token, remainTokens, liquid);
            throw new Error(message);
        }
        *render() { }
    };
}
/**
 * A `{% name %}…{% endname %}` tag the host registers, parsed the way the
 * host's is: the body up to the closer, `key: value` arguments as a hash. It
 * exposes both to the analyser, so a name inside the body — or in `id: m.id` —
 * is seen.
 */
function blockTag() {
    return class extends Tag {
        args;
        body = [];
        constructor(token, remainTokens, liquid, parser) {
            super(token, remainTokens, liquid);
            this.args = new Hash(this.tokenizer, liquid.options.keyValueSeparator);
            const body = this.body;
            parser
                .parseStream(remainTokens)
                .on('template', (tpl) => body.push(tpl))
                .on(`tag:end${token.name}`, function () {
                this.stop();
            })
                .on('end', () => {
                throw new Error(`tag ${token.getText()} not closed`);
            })
                .start();
        }
        *render(_ctx, _emitter) { }
        *children() {
            return this.body;
        }
        *arguments() {
            for (const v of Object.values(this.args.hash))
                if (v)
                    yield v;
        }
    };
}
const liquidCache = new WeakMap();
let defaultLiquid;
function liquidFor(options) {
    const o = options.liquid;
    if (!o)
        return (defaultLiquid ??= makeLiquid({}));
    let l = liquidCache.get(o);
    if (!l)
        liquidCache.set(o, (l = makeLiquid(o)));
    return l;
}
function makeLiquid(o) {
    const liquid = new Liquid({
        strictFilters: true,
        strictVariables: false,
        ownPropertyOnly: true,
        cache: false,
        root: [],
        partials: [],
        layouts: [],
        relativeReference: false,
        fs: NO_FILESYSTEM,
        ...(o.parseLimit ? { parseLimit: o.parseLimit } : {}),
    });
    for (const [name, message] of Object.entries(o.refusedTags ?? {}))
        liquid.registerTag(name, refusedTag(message));
    for (const name of o.blockTags ?? [])
        liquid.registerTag(name, blockTag());
    // Parse only: a filter need exist, not work.
    for (const name of o.filters ?? [])
        liquid.registerFilter(name, (v) => v);
    return liquid;
}
/** Liquid answers these on a list (and `size` on a string) without a declaration. */
const LIQUID_LIST_INTRINSICS = new Set(['size', 'first', 'last']);
/**
 * Walk Liquid segments against a declaration, one at a time so `first`/`last`
 * step into the element and `size` ends the walk — the three reads Liquid
 * answers on a list that the schema never declares.
 */
function resolveLiquidPath(decl, segs, base) {
    let cur = decl;
    let label = base;
    for (const seg of segs) {
        const field = cur && cur !== 'any' && !Array.isArray(cur) ? cur : undefined;
        if (field &&
            LIQUID_LIST_INTRINSICS.has(seg) &&
            (field.type === 'list' || (field.type === 'string' && seg === 'size'))) {
            if (seg === 'size')
                return { ok: true, checked: true, field: { type: 'number' } };
            if (!field.of)
                return { ok: true, checked: false };
            cur = field.of;
            label = `${label}.${seg}`;
            continue;
        }
        const r = resolvePath(cur, [seg], label);
        if (!r.ok)
            return r;
        if (!r.field)
            return { ok: true, checked: false };
        cur = r.field;
        label = `${label}.${seg}`;
    }
    return {
        ok: true,
        checked: true,
        ...(cur && cur !== 'any' && !Array.isArray(cur) ? { field: cur } : {}),
    };
}
/** `a.b['c d']` as written at `start` — a span for the finding, not a parse. */
const WRITTEN_PATH = /^[A-Za-z_][\w-]*(?:\s*(?:\.[\w-]+|\[[^\]]*\]))*/;
function walkLiquid(templates, src, scope, sink) {
    // `globals` is Liquid's own answer to "which names come from outside": loop
    // bindings, assigns, captures and `forloop` are already excluded, which is
    // the conservative line. Loop items are therefore unchecked.
    const analysis = analyzeSync(templates, { partials: false });
    const lines = sink.lines;
    for (const [root, uses] of Object.entries(analysis.globals))
        for (const use of uses) {
            const { row, col } = use.location;
            const start = offsetOf(lines, row, col);
            const written = WRITTEN_PATH.exec(src.slice(start))?.[0] ?? root;
            // A dynamic segment (`a[k]`) ends what can be checked; `k` is
            // reported on its own, as the analyser lists it separately.
            const segs = [];
            for (const s of use.segments.slice(1)) {
                if (typeof s === 'string' || typeof s === 'number')
                    segs.push(String(s));
                else
                    break;
            }
            const decl = scope[root];
            if (decl === undefined) {
                sink.unknownRoot(root, written, sink.scopeNames, row, col);
                continue;
            }
            const r = resolveLiquidPath(decl, segs, root);
            if (!r.ok)
                sink.badPath(r, root, written, row, col);
        }
}
//# sourceMappingURL=templateCheck.js.map