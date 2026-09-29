import { i18nFindings } from './i18n.js';
import { WIDGET_BASE_SECTIONS, isWidgetScopedSectionName } from './widgets.js';
/**
 * One registry per process, however many copies of the SDK a package's
 * dependencies resolved: a genre that names core's widget from one copy and
 * a core-catalog built against another still agree whose it is.
 */
const REGISTRY = (globalThis[Symbol.for('serene-pub.widget-owners')] ??= {
    owners: new WeakMap(),
    coreIds: new Set(),
});
const OWNERS = REGISTRY.owners;
/** Record whose widgets these are. Core's `core-catalog` and `defineExtension` call it; nothing else should. @internal */
export function ownWidgets(owner, widgets) {
    for (const w of widgets) {
        const held = OWNERS.get(w);
        if (held && held !== owner)
            throw new Error(`widget '${w.id}' is already ${held}'s — a widget belongs to the one package that declares it`);
        OWNERS.set(w, owner);
        if (owner === 'core')
            REGISTRY.coreIds.add(w.id);
    }
}
/**
 * Core's widget ids, as far as core's catalogue has been loaded. A package's
 * widget may not take one: a layout names core's widgets and the package's
 * own by bare id, so the two sets never overlap.
 * @experimental
 */
export const coreWidgetIds = () => REGISTRY.coreIds;
/** The package that declared this widget value, if one has. @experimental */
export const widgetOwner = (w) => OWNERS.get(w);
/** The id a page, a layout row and a genre's `omitWidgets` know this widget by. @experimental */
export function widgetRef(w) {
    const owner = OWNERS.get(w);
    if (!owner)
        throw new Error(`widget '${w?.id}' belongs to no package yet — name a widget value from core (\`coreWidgets\`) ` +
            `or from a package's \`defineExtension({ widgets })\``);
    return owner === 'core' ? w.id : `${owner}:${w.id}`;
}
const WIDGET_ID = /^[a-z][a-z0-9-]*$/;
/**
 * The base sections a widget reads (R75): its `reads`, or every base section
 * when it declares none — what its host sends it. A host asks this rather
 * than reading `reads`, so the default lives in one place.
 *
 * Clamped, as a host must clamp what an install stored verbatim: a name that
 * is not a base section (a scoped one, junk) never comes back, and each name
 * comes back once.
 * @experimental
 */
export function widgetReads(w) {
    if (!Array.isArray(w?.reads))
        return WIDGET_BASE_SECTIONS;
    return [
        ...new Set(w.reads.filter((name) => WIDGET_BASE_SECTIONS.includes(name))),
    ];
}
/**
 * What is wrong with a widget's `reads` (R75), one sentence each, each led by
 * `at` (where it was written): a name that is not a base section is refused
 * where it is declared, rather than naming a section the widget would
 * silently never receive.
 * @experimental
 */
export function widgetReadsFindings(reads, at) {
    if (reads === undefined)
        return [];
    const names = WIDGET_BASE_SECTIONS.map((s) => `'${s}'`).join(', ');
    if (!Array.isArray(reads))
        return [`${at}: a list of base section names — any of ${names}`];
    const out = [];
    for (const name of reads) {
        if (WIDGET_BASE_SECTIONS.includes(name))
            continue;
        out.push(isWidgetScopedSectionName(name)
            ? `${at}: '${name}' is a scoped section — ask for it in \`scopes\`, never in \`reads\``
            : `${at}: '${String(name)}' is not a base section — one of ${names}`);
    }
    return out;
}
/** Declare a widget — the value a package lists in `widgets` and a genre names in `omitWidgets` or a layout. @experimental */
export function widget(d) {
    const problems = [];
    if (!WIDGET_ID.test(d.id ?? ''))
        problems.push(`'${d.id}' is not a widget id — lowercase letters, digits and '-' (the package supplies the namespace)`);
    problems.push(...i18nFindings(d.title, `widget '${d.id}' title`, { required: true }));
    if (d.component && d.surface)
        problems.push(`widget '${d.id}' names a component and a surface — name the component`);
    problems.push(...widgetReadsFindings(d.reads, `widget '${d.id}' reads`));
    const genres = d.genres?.map((g) => g?.id);
    if (genres?.some((g) => typeof g !== 'string' || !g))
        problems.push(`widget '${d.id}' genres: each is a genre value (or use('<id>')), never a bare string`);
    if (problems.length)
        throw new Error(problems.join('\n'));
    const { genres: _g, ...rest } = d;
    return Object.freeze({ ...rest, ...(genres?.length ? { genres: [...new Set(genres)] } : {}) });
}
const LAYOUT_SLUG = /^[a-z][a-z0-9-]*$/;
/** Declare a layout a genre ships. @experimental */
export function layout(d) {
    const problems = [];
    if (!LAYOUT_SLUG.test(d.slug ?? ''))
        problems.push(`'${d.slug}' is not a layout slug — lowercase letters, digits and '-'`);
    problems.push(...i18nFindings(d.name, `layout '${d.slug}' name`, { required: true }));
    problems.push(...i18nFindings(d.description, `layout '${d.slug}' description`));
    if (d.preset?.layout?.version !== 2 || !d.preset.layout.zones?.middle)
        problems.push(`layout '${d.slug}' preset is not a layout document (version 2, with a middle zone)`);
    if (problems.length)
        throw new Error(problems.join('\n'));
    return Object.freeze({ ...d });
}
/** Every widget a layout document places, by the id it names. @experimental */
export function layoutWidgetIds(preset) {
    const out = [];
    const zones = [preset.layout.zones, ...Object.values(preset.layout.variants ?? {})];
    for (const z of zones)
        for (const zone of Object.values(z ?? {}))
            for (const u of zone?.units ?? [])
                if (u.kind === 'widget' && u.widget)
                    out.push(u.widget);
                else if (u.kind === 'group')
                    for (const m of u.members ?? [])
                        out.push(m.widget);
    return out;
}
/** The widgets placed in a layout's middle zone (its base document). @experimental */
export function middleWidgetIds(preset) {
    const out = [];
    for (const u of preset.layout.zones.middle.units ?? [])
        if (u.kind === 'widget' && u.widget)
            out.push(u.widget);
        else if (u.kind === 'group')
            for (const m of u.members ?? [])
                out.push(m.widget);
    return out;
}
//# sourceMappingURL=widgetDecls.js.map