/**
 * Does this template fit this node? (typed templates P5, 2026-09-27)
 *
 * The refusals of design §4, in one place: a template is checked against the
 * typed scope of the node that renders it (`templateScopeReport`), and a name
 * or path nothing there supplies is REFUSED — at selection (the host), at a
 * spec's save and publish (law T1, `validate()`), and at packaging (a plugin's
 * shipped template seeds). Warnings never refuse, and nor does anything while
 * a producer upstream declares no types (`untyped`): its keys may still
 * arrive, so the checker only warns (owner Q6: refuse new selections and new
 * saves; a stored row becomes a notice, never a retroactive refusal).
 *
 * ## The checker is a value
 *
 * The checker parses with the real engines (`@serene-pub/sdk/template-check`,
 * which carries `handlebars` and `liquidjs`); this module is on the barrel,
 * which stays dependency-free. So every door here takes the checker as an
 * argument — `{ check: checkTemplateSourceReport }` — and a caller without one
 * gets the checker-free half of T1 (scope collisions, forbidden kinds, a band
 * with no variable) and no name check. One way to check; the engines stay
 * where they were imported on purpose.
 *
 * ## What refuses
 *
 * `SCOPE_FINDING_KINDS` — `unknown-name` and `unknown-path` at error
 * severity. A syntax finding and an unknown helper depend on the host's
 * vocabulary (its helpers, its Liquid tags), which a spec document and a
 * package do not carry; a host that passes its own vocabulary may widen
 * `refuse`.
 * @experimental
 */
import { BandCollisionError, rendersAt } from './bands.js';
import { getDefinition } from './descriptors.js';
import { ForbiddenTemplateFieldError, TEMPLATE_ANNEX_PORT, templateScopeReport, } from './templateScopeAt.js';
import { getVariable } from './variables.js';
/** What a scope decides — a name or a path nothing supplies. @experimental */
export const SCOPE_FINDING_KINDS = ['unknown-name', 'unknown-path'];
/** Check one template against a scope report already computed. */
function fitWithin(report, template, checking) {
    const result = checking.check(template.engine, template.source, report.scope, {
        ...checking.options,
        ...(report.untyped.length ? { untyped: report.untyped } : {}),
    });
    const refuse = new Set(checking.refuse ?? SCOPE_FINDING_KINDS);
    const refusals = [];
    const warnings = [];
    for (const f of result.findings)
        (f.severity === 'error' && f.kind && refuse.has(f.kind) ? refusals : warnings).push(f);
    return { checked: result.checked, untyped: [...report.untyped], refusals, warnings };
}
/**
 * Check `template` against the typed scope of its template slot at `nodeKey`.
 * Throws what `templateScopeReport` throws — a root two declarers claim, a
 * forbidden kind — because then the document is wrong, not the template.
 * @experimental
 */
export function templateFit(doc, nodeKey, template, checking, env = {}) {
    return fitWithin(templateScopeReport(doc, nodeKey, env), template, checking);
}
const AVAILABLE_SHOWN = 40;
const quoted = (names) => names.map((n) => `\`${n}\``).join(', ');
/** One finding as the clause after "it". */
function clause(f) {
    const written = f.path ?? f.name ?? '';
    switch (f.kind) {
        case 'syntax':
            return `it does not parse (${f.message})`;
        case 'unknown-helper':
            return `it calls \`${f.name}\`, which is not a helper here`;
        default:
            return `it uses \`${written}\`, which nothing supplies here`;
    }
}
/**
 * The refusal, in the design's words:
 *
 * > 'speakPrompt' can't render 'Riddle layout': it uses `secretEntri`, which
 * > nothing supplies here. Did you mean `secretEntry`? Available: …
 *
 * `where` names the step (a node key); `what` names the template (its name, or
 * "the 'x' preset's template").
 * @experimental
 */
export function templateFitSentence(where, what, refusals) {
    const [first, ...rest] = refusals;
    if (!first)
        return `'${where}' can render ${what}.`;
    let s = `'${where}' can't render ${what}: ${clause(first)}.`;
    if (first.suggestion)
        s += ` Did you mean \`${first.suggestion}\`?`;
    const available = first.available ?? [];
    if (available.length && first.kind !== 'syntax')
        s +=
            ` Available: ${quoted(available.slice(0, AVAILABLE_SHOWN))}` +
                (available.length > AVAILABLE_SHOWN
                    ? `, and ${available.length - AVAILABLE_SHOWN} more`
                    : '') +
                '.';
    const others = [
        ...new Set(rest
            .map((f) => f.path ?? f.name ?? '')
            .filter((n) => n && n !== (first.path ?? first.name))),
    ];
    if (others.length)
        s += ` It also uses ${quoted(others)}, which nothing supplies either.`;
    return s;
}
// ── Law T1 — a spec's templates fit where they are rendered ─────────────────
const isTemplateValue = (v) => !!v &&
    typeof v === 'object' &&
    typeof v.source === 'string' &&
    typeof v.engine === 'string';
const defaultDescribe = (n) => getDefinition(`${n.definitionId}@${n.definitionVersion}`);
/**
 * Every template source a document carries for one template slot: the node's
 * own configured value, and each preset's (`p.template(nodeKey, …)` writes
 * slot `'template'`, meaning the node's template slot).
 */
function templateSourcesAt(doc, node, slotName, first) {
    const out = [];
    const own = node.config?.[slotName];
    if (isTemplateValue(own))
        out.push({ what: 'its configured template', template: own });
    for (const p of doc.presets ?? [])
        for (const v of p.values ?? [])
            if (v.nodeKey === node.key &&
                (v.slot === slotName || (first && v.slot === 'template')) &&
                isTemplateValue(v.value))
                out.push({ what: `the '${p.slug}' preset's template`, template: v.value });
    return out;
}
/**
 * Law T1 over one document (design §4.2):
 *
 * - a root two declarers claim at a template node, or a forbidden kind in its
 *   scope — refused, naming both declarers (`templateScopeReport`);
 * - a band reaching a `rendersBands` slot whose variable is not registered —
 *   refused (a band with no variable renders under a name nothing declares);
 * - with `checking`: every template source the document carries (a node's
 *   configured value, each preset's) is checked against the typed scope of
 *   the slot it fills, and a name or path nothing supplies is refused.
 *
 * Also law T2 (P6, `annexPortFindings`): the annex in-port.
 *
 * Errors only: a warning is the editor's and the receipt's to say.
 * @experimental
 */
export function templateLawFindings(doc, checking, env = {}) {
    const f = [];
    const describe = env.describe ?? defaultDescribe;
    const variable = env.variable ?? getVariable;
    for (const node of doc.nodes) {
        const d = describe(node);
        if (!d)
            continue;
        const slots = (d.slots ?? {});
        for (const slot of Object.values(slots)) {
            if (slot.kind !== 'variables' || !slot.rendersBands)
                continue;
            let renders;
            try {
                renders = rendersAt(doc, node.key, slot, describe);
            }
            catch (e) {
                if (!(e instanceof BandCollisionError))
                    throw e;
                f.push({
                    law: 'T1',
                    severity: 'error',
                    nodeKey: node.key,
                    message: e.message,
                    fix: 'rename one of the two bands — a band key is a top-level template name and means one thing',
                });
                continue;
            }
            for (const [band, id] of Object.entries(renders))
                if (!(slot.renders ?? {})[band] && !variable(id))
                    f.push({
                        law: 'T1',
                        severity: 'error',
                        nodeKey: node.key,
                        message: `band '${band}' reaches '${node.key}' with variable '${id}', which is not registered — a template would read {{{${band}}}} with no layout and no type`,
                        fix: `declare '${id}' with definePluginVariable() (defineVariable() in core) and register it before the definition that names it`,
                    });
        }
        const templateSlots = Object.entries(slots).filter(([, s]) => s.kind === 'template');
        templateSlots.forEach(([slotName], i) => {
            let report;
            try {
                report = templateScopeReport(doc, node.key, { ...env, slot: slotName });
            }
            catch (e) {
                if (e instanceof BandCollisionError || e instanceof ForbiddenTemplateFieldError)
                    f.push({
                        law: 'T1',
                        severity: 'error',
                        nodeKey: node.key,
                        message: e.message,
                        fix: e instanceof BandCollisionError
                            ? 'rename one of the two declarers — a top-level template name means one thing'
                            : 'take the forbidden value out of what reaches this template; it may never enter a prompt',
                    });
                // Anything else (an unknown definition) is another law's to say.
                return;
            }
            if (!checking)
                return;
            for (const { what, template } of templateSourcesAt(doc, node, slotName, i === 0)) {
                const fit = fitWithin(report, template, checking);
                if (!fit.refusals.length)
                    continue;
                f.push({
                    law: 'T1',
                    severity: 'error',
                    nodeKey: node.key,
                    message: templateFitSentence(node.key, what, fit.refusals),
                    fix: fit.refusals[0].fix,
                });
            }
        });
    }
    f.push(...annexPortFindings(doc, describe));
    return f;
}
// ── Law T2 — the annex reaches a template on one road ───────────────────────
/** The one query that may feed a template's annex in-port, and the view it must read. @experimental */
export const TEMPLATE_ANNEX_QUERY = 'core:query/session-annex';
/** @experimental */
export const TEMPLATE_ANNEX_VIEW = 'template';
const headOf = (p) => p.split('.')[0];
const isDataRef = (v) => !!v && typeof v === 'object' && v.__ref === 'data';
/**
 * Law T2 (typed templates P6, owner ruling Q1): a template node's `annex`
 * in-port is fed only by `core:query/session-annex@1` reading `view:
 * 'template'` — every declared key of every owner in scope, and nothing a
 * declaration does not cover — and a template-view read feeds nothing but
 * such a port. Either half broken would put undeclared data into a prompt, or
 * the prompt's data somewhere a prompt is not. Errors only.
 * @experimental
 */
export function annexPortFindings(doc, describe = defaultDescribe) {
    const f = [];
    const byKey = new Map(doc.nodes.map((n) => [n.key, n]));
    const annexPortOf = (n) => {
        const d = describe(n);
        if (!d)
            return false;
        const takesTemplate = Object.values((d.slots ?? {})).some((s) => s.kind === 'template');
        return takesTemplate && Object.prototype.hasOwnProperty.call(d.ports?.in ?? {}, TEMPLATE_ANNEX_PORT);
    };
    const isTemplateView = (n) => !!n && n.definitionId === TEMPLATE_ANNEX_QUERY && n.config?.view === TEMPLATE_ANNEX_VIEW;
    const road = `wire ${TEMPLATE_ANNEX_QUERY}@1 with view: '${TEMPLATE_ANNEX_VIEW}' (a literal) into the ` +
        `'${TEMPLATE_ANNEX_PORT}' port — nothing else`;
    for (const node of doc.nodes) {
        if (annexPortOf(node)) {
            const literal = node.config?.[TEMPLATE_ANNEX_PORT];
            if (literal !== undefined && !isDataRef(literal))
                f.push({
                    law: 'T2',
                    severity: 'error',
                    nodeKey: node.key,
                    message: `'${node.key}' sets its '${TEMPLATE_ANNEX_PORT}' port to a value; a template's annex is read from the session, never written into the spec`,
                    fix: road,
                });
            for (const e of doc.edges) {
                if (e.to !== node.key || headOf(e.toPort) !== TEMPLATE_ANNEX_PORT)
                    continue;
                const from = byKey.get(e.from);
                if (isTemplateView(from) && headOf(e.fromPort) === 'main')
                    continue;
                f.push({
                    law: 'T2',
                    severity: 'error',
                    nodeKey: node.key,
                    message: `'${node.key}.${TEMPLATE_ANNEX_PORT}' is fed by '${e.from}.${e.fromPort}'` +
                        (from?.definitionId === TEMPLATE_ANNEX_QUERY
                            ? `, a session-annex read whose view is not '${TEMPLATE_ANNEX_VIEW}'`
                            : '') +
                        ` — only the declared annex keys of the owners in scope may reach a template`,
                    fix: road,
                });
            }
        }
        if (isTemplateView(node))
            for (const e of doc.edges) {
                if (e.from !== node.key || e.implicit)
                    continue;
                const to = byKey.get(e.to);
                if (to && annexPortOf(to) && headOf(e.toPort) === TEMPLATE_ANNEX_PORT)
                    continue;
                f.push({
                    law: 'T2',
                    severity: 'error',
                    nodeKey: node.key,
                    message: `'${node.key}' reads the annex with view: '${TEMPLATE_ANNEX_VIEW}' — every owner's declared keys — ` +
                        `and feeds '${e.to}.${e.toPort}', which is not a template's '${TEMPLATE_ANNEX_PORT}' port`,
                    fix: `read one owner's document with view: 'ai' (or no view) for a pipeline's own use; the template view feeds only a template's '${TEMPLATE_ANNEX_PORT}' port`,
                });
            }
    }
    return f;
}
/**
 * Check a package's `context template` seeds (`TemplateSeed` kind
 * `template`) against every node of its own specs that renders them — the
 * seed's pool is the node definition, so each such node is a place it can be
 * selected. A seed no spec of the package places is left to the host, whose
 * selection check sees the spec that selects it.
 * @experimental
 */
export function templateSeedFindings(seeds, documents, checking, env = {}) {
    const out = [];
    const describe = env.describe ?? defaultDescribe;
    for (const seed of seeds) {
        if (seed.kind !== 'template' || typeof seed.body !== 'string' || !seed.engine)
            continue;
        const template = { engine: seed.engine, source: seed.body };
        for (const doc of documents)
            for (const node of doc.nodes) {
                if (node.definitionId !== seed.nodeDefinitionId)
                    continue;
                const slots = (describe(node)?.slots ?? {});
                for (const [slotName, slot] of Object.entries(slots)) {
                    if (slot.kind !== 'template')
                        continue;
                    let report;
                    try {
                        report = templateScopeReport(doc, node.key, { ...env, slot: slotName });
                    }
                    catch {
                        // The document's own fault — T1 says it over the document.
                        continue;
                    }
                    const fit = fitWithin(report, template, checking);
                    if (!fit.refusals.length)
                        continue;
                    out.push({
                        template: seed.id,
                        specId: doc.id,
                        nodeKey: node.key,
                        message: templateFitSentence(node.key, `'${seed.label ?? seed.id}'`, fit.refusals),
                        fix: fit.refusals[0].fix,
                    });
                }
            }
    }
    return out;
}
//# sourceMappingURL=templateFit.js.map