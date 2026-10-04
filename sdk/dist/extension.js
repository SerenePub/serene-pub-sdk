/**
 * `defineExtension` — the one entry point a plugin author starts from (03, 09).
 *
 * Before this existed, the SDK could express a pipeline and nothing else. An author could
 * build a spec but had nowhere to say *"this is my plugin, here are its lifecycle
 * callbacks, its settings, its node definitions, its components, and the pipelines it
 * ships."* That is the
 * difference between authoring a pipeline and writing a plugin, and it is most of what
 * "download the SDK" has to mean.
 *
 * Since D-1 it says the rest of it too — the **genres**, **surfaces**, **presets**,
 * **configs**, **prompts** and declared **permissions** that were only sayable through
 * `announce()`. One declaration, one build: `serene-pub build` emits a single manifest
 * carrying both halves, and a package no longer has to choose which half of itself to
  * ship. It is the one authoring entry: a package with no code at all declares itself
 * here too — core's own catalog does — and `announcementOf()` compiles it to the
 * announcement document a host syncs.
 *
 * Everything here is a **literal declaration**, because the compiler extracts it from the
 * source without executing it (F6, 03 §3, 13/§30). A registration assembled at runtime is
 * a lint error rather than a silent omission — the manifest has to be a complete statement
 * of what a plugin can do, or the permission model is a guess.
 */
import { ownWidgets } from './widgetDecls.js';
import { pluginRuleRef } from './pluginRuleRef.js';
import { templateSeedProblems } from './templateIds.js';
import { i18nFindings } from './i18n.js';
import { isSessionEventDecl } from './events.js';
import { preset, storedConfig, storedEventDeclaration, } from './announce.js';
import { annexFieldListFindings } from './annexFields.js';
import { pluginVariableFindings } from './variables.js';
import { declarationFindings, storedSwap, swapInputFindings, } from './declarations.js';
/** @public */
export function handler(definition, fn, opts = {}) {
    const descriptor = ('descriptor' in definition ? definition.descriptor : definition);
    return {
        __decl: 'handler',
        type: descriptor,
        // The one knob (R62): a node is as public as its handler, private
        // unless its author says otherwise here.
        visibility: opts.visibility ?? 'private',
        handler: fn,
        // Not configurable. See the note on the field.
        runtime: 'process',
    };
}
/** @experimental */
export const lifecycleCallback = (moment, handler, opts = {}) => ({ __decl: 'lifecycle-callback', moment, handler, ...opts });
/** @public */
export const eventListener = (event, handler, opts = {}) => ({
    __decl: 'event-listener',
    event: isSessionEventDecl(event) ? event.id : event,
    handler,
    ...opts,
});
/** The component frameworks SDK 1.0 ships (R35). The list grows; it never shrinks. @experimental */
export const COMPONENT_FRAMEWORKS = ['svelte', 'vanilla'];
/** @public */
export const component = (d) => ({
    __decl: 'component',
    ...d,
});
/** The quota band an author may ask for. An instance clamps into its own. @experimental */
export const MIN_STORAGE_QUOTA = 1024;
/** @experimental */
export const MAX_STORAGE_QUOTA = 256 * 1024 * 1024;
/**
 * A declared fetch host: an exact host, a `*.suffix` / bare `*` wildcard, each
 * with an optional `:port`. The instance enforces the match and the internal-IP
 * block at call time; this only pins the authoring vocabulary.
 */
const HOSTNAME = /^(?:\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d+)?$/i;
/**
 * What is wrong with a declared permission set, in the same words the CLI's
 * sandbox-manifest compiler uses — a package that moves from a separate
 * manifest to this field gets the same answer to the same mistake.
 * @experimental
 */
export function permissionFindings(p) {
    const out = [];
    if (!p)
        return out;
    if (p.storage) {
        const q = p.storage.quotaBytes;
        if (q !== undefined &&
            (typeof q !== 'number' || !Number.isFinite(q) || q < MIN_STORAGE_QUOTA || q > MAX_STORAGE_QUOTA))
            out.push(`permissions.storage.quotaBytes must be ${MIN_STORAGE_QUOTA}…${MAX_STORAGE_QUOTA}. ` +
                `A pub clamps whatever it is handed, so a number outside the band is not a ` +
                `bigger grant — it is a declaration that says something other than what you get.`);
    }
    if (p.network) {
        const hosts = p.network.hosts ?? [];
        if (!Array.isArray(hosts) || hosts.length === 0)
            out.push(`permissions.network requires a non-empty hosts allowlist — name the hosts you reach ` +
                `('api.example.com', '*.example.com'). A network request naming none reaches nothing.`);
        else
            for (const host of hosts)
                if (typeof host !== 'string' || !HOSTNAME.test(host))
                    out.push(`permissions.network host '${String(host)}' is not a valid host, wildcard, or host:port.`);
    }
    return out;
}
/** The template-engine id grammar — `<namespace>:template/<name>@<major>`. */
const TEMPLATE_ENGINE_ID = /^([a-z0-9][a-z0-9.-]*):template\/([a-z0-9][a-z0-9-]*)@(\d+)$/;
/** @experimental */
export class ExtensionError extends Error {
}
const SLUG = /^[a-z0-9]+([.-][a-z0-9]+)*$/;
/**
 * Declare a plugin. Validated here rather than at install, because an error an author
 * sees while writing costs a minute and the same error at install costs a support thread.
 * @public
 */
export function defineExtension(d) {
    const problems = [];
    if (!SLUG.test(d.slug)) {
        problems.push(`'${d.slug}' is not a valid plugin slug — lowercase letters, digits, dots and hyphens ` +
            `(e.g. 'chariot.dice-tray'). It is the namespace every id you register must sit under.`);
    }
    if (!/^\d+\.\d+\.\d+/.test(d.version)) {
        problems.push(`'${d.version}' is not semver. A plugin upgrades by version comparison (12 §3b).`);
    }
    // The display text (R-20): the name the plugin list shows and the
    // description under it. The packager and the install repeat this check
    // over the manifest, because a bundle may have been built against an
    // older SDK.
    problems.push(...i18nFindings(d.name, 'name', { required: true }));
    problems.push(...i18nFindings(d.description, 'description'));
    // `engines` is version ranges only (R1). A namespaced key there is a
    // template engine put in the wrong map — no host reads it as one, so it
    // would silently never register.
    for (const key of Object.keys((d.engines ?? {})))
        if (key.includes(':'))
            problems.push(`engines['${key}'] is a template engine id — 'engines' holds Serene Pub version ` +
                `ranges only. Declare it under templateEngines: { '${key}': renderFn }.`);
    // A template engine sits under this plugin's namespace, like every id it
    // registers — an engine two plugins could claim renders differently by
    // install order.
    for (const [id, fn] of Object.entries(d.templateEngines ?? {})) {
        const m = TEMPLATE_ENGINE_ID.exec(id);
        if (!m)
            problems.push(`templateEngines['${id}'] is not a template engine id. The grammar is ` +
                `'<slug>:template/<name>@<major>' — '${d.slug}:template/mustache@1'.`);
        else if (m[1] !== d.slug)
            problems.push(`templateEngines['${id}'] is not in this plugin's namespace — declare it as ` +
                `'${d.slug}:template/${m[2]}@${m[3]}'.`);
        if (typeof fn !== 'function')
            problems.push(`templateEngines['${id}'] must be the function that renders it.`);
    }
    // Every id a plugin registers must sit under its own namespace. `core:` is reserved
    // and the registry rejects it, but a plugin claiming *another plugin's* namespace
    // would be accepted and would break ownership-based updates (12 §3b).
    // `hooks` declares points; the code a plugin runs is `handlers` (R54).
    if (Array.isArray(d.hooks))
        problems.push(`'hooks' is a list — the code a plugin runs is declared under 'handlers' now: rename ` +
            `hooks: [handler(…), …] to handlers: [handler(…), …]. 'hooks' declares the points your ` +
            `package defines, by key.`);
    for (const h of d.handlers ?? []) {
        if (h.__decl !== 'handler')
            continue;
        const ns = h.type.id.split(':')[0];
        if (ns !== d.slug) {
            problems.push(`type '${h.type.id}' is registered by plugin '${d.slug}' but sits under namespace '${ns}'. ` +
                `Rename it to '${d.slug}:…' — ownership is what lets an update replace your rows and ` +
                `leave everyone else's alone.`);
        }
    }
    for (const p of d.pipelines ?? []) {
        const ns = p.id.split(':')[0];
        if (p.id.includes(':') && ns !== d.slug) {
            problems.push(`pipeline '${p.id}' sits under namespace '${ns}', not '${d.slug}'.`);
        }
    }
    // Same ownership rule as a handler's definition id, one kind over, plus the
    // per-kind shape check — an author who ships a Liquid source with no engine
    // finds out while writing rather than when an instance renders `{% %}` at a
    // model. Duplicates are refused here because the id is the sync key: two
    // entries under one id would race to be the row on every enable.
    const templateIds = new Set();
    for (const t of d.templates ?? []) {
        problems.push(...templateSeedProblems(t, d.slug));
        if (templateIds.has(t.id))
            problems.push(`duplicate template id '${t.id}' — the id is the sync key (12 §3b).`);
        templateIds.add(t.id);
    }
    problems.push(...permissionFindings(d.permissions));
    problems.push(...annexFieldListFindings(d.annexFields));
    // The variables an instance registers from the manifest — the declared
    // list and every band's own (typed templates, 2026-09-27).
    problems.push(...pluginVariableFindings(d.slug, variablesOf(d)));
    // Whose widgets these are (R71): recorded now, so a genre anywhere that
    // names one by value names the id the page knows it by.
    try {
        ownWidgets(d.slug, d.widgets ?? []);
    }
    catch (e) {
        problems.push(e.message);
    }
    // References are values (R48): read each down to its id here, where a
    // mistake still names the author's own declaration.
    const stored = (list, fn) => {
        if (!list)
            return undefined;
        const out = [];
        for (const item of list) {
            try {
                out.push(fn(item));
            }
            catch (e) {
                problems.push(e.message);
            }
        }
        return out;
    };
    problems.push(...swapInputFindings(d.swaps ?? []));
    // A swap runs the contributed node in another package's pipeline, so its
    // handler must be public (R62): a private one would be offered, picked,
    // and then refused on every turn.
    for (const c of d.swaps ?? []) {
        const id = typeof c?.definition === 'string' ? c.definition : c?.definition?.id;
        const impl = (d.handlers ?? []).find((h) => h.__decl === 'handler' && h.type?.id === id);
        if (impl && impl.visibility !== 'public')
            problems.push(`swap contributes '${id}', whose handler is private — a swap runs your node in another ` +
                `package's pipeline; write handler(definition, fn, { visibility: 'public' })` +
                pluginRuleRef('private-nodes'));
    }
    const configs = stored(d.configs, storedConfig);
    const presets = stored(d.presets, preset);
    const events = stored(d.events, storedEventDeclaration);
    // Everything a package declares rather than implements — genres, the input
    // lock, create pipelines, contributed actions, prompts, configs, presets,
    // surfaces, components — is checked by the pass `announce()` runs too
    // (D-1), so one mistake gets one sentence wherever it was written. The
    // namespace rules above are the exception: a definition id and a pipeline id
    // are refused here in words that name the plugin slug.
    problems.push(...declarationFindings({
        ns: d.slug,
        genres: d.genres,
        pipelines: d.pipelines,
        prompts: d.prompts,
        configs,
        presets,
        surfaces: d.surfaces,
        components: d.components,
        widgets: d.widgets,
        swaps: d.swaps,
        events,
        // Declared nothing is `[]`: every key a pipeline of this package
        // writes to its own annex must be declared (ruling 2026-09-26).
        annexFields: d.annexFields ?? [],
    }).errors);
    if (problems.length) {
        throw new ExtensionError(`invalid extension '${d.slug}':\n` + problems.map((p) => `  • ${p}`).join('\n'));
    }
    return {
        __extension: true,
        ...d,
        ...(configs ? { configs } : {}),
        ...(presets ? { presets } : {}),
        ...(events ? { events } : {}),
        ...(d.swaps ? { swaps: d.swaps.map(storedSwap) } : {}),
    };
}
// ── Derived views ───────────────────────────────────────────────────────────
/** @experimental */
export const handlersOf = (e) => (e.handlers ?? []).filter((h) => h.__decl === 'handler');
/** @experimental */
export const lifecycleCallbacksOf = (e) => (e.handlers ?? []).filter((h) => h.__decl === 'lifecycle-callback');
/** @experimental */
export const eventListenersOf = (e) => (e.handlers ?? []).filter((h) => h.__decl === 'event-listener');
/**
 * Every variable a package declares, as its manifest carries them: the
 * `variables` list first, then each variable a band of its handlers'
 * definitions holds (`Descriptor.bands`) — a band is a value holding its
 * variable, so the author never lists it twice. One entry per distinct
 * declaration: the same variable reached twice (two definitions declaring
 * one band) is one entry; one id with two different contents stays two, and
 * `pluginVariableFindings` refuses it.
 * @experimental
 */
export function variablesOf(e) {
    const out = [];
    const seen = new Set();
    const add = (v) => {
        if (!v || typeof v !== 'object')
            return; // a band naming its variable by id is a reference
        const sig = JSON.stringify(v);
        if (seen.has(sig))
            return;
        seen.add(sig);
        out.push(v);
    };
    for (const v of e.variables ?? [])
        add(v);
    for (const h of e.handlers ?? []) {
        if (h.__decl !== 'handler')
            continue;
        const bands = h.type?.bands;
        for (const v of Object.values(bands ?? {}))
            add(v);
    }
    return out;
}
/**
 * The bindings map the executor wants, built from the declaration. So an author's tests
 * run their real handlers rather than a hand-maintained parallel map that drifts.
 * @experimental
 */
export function bindingsOf(e) {
    const out = {};
    for (const h of handlersOf(e))
        out[h.type.id] = h.handler;
    return out;
}
//# sourceMappingURL=extension.js.map