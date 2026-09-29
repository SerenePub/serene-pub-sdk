const byBareSlug = (a, b) => (a.bareSlug < b.bareSlug ? -1 : 1);
/** A flat `order` is one group headed by the source's own `group`. */
function orderGroups(source) {
    const order = source.order ?? [];
    if (order.every((entry) => typeof entry === 'string'))
        return [{ group: source.group, pages: order }];
    if (order.some((entry) => typeof entry === 'string'))
        throw new Error(`\`order\` for source \`${source.id}\` mixes slugs and groups — ` +
            `it is either a list of slugs or a list of groups.`);
    const seen = new Set();
    for (const { group } of order) {
        if (seen.has(group))
            throw new Error(`\`order\` for source \`${source.id}\` declares the group \`${group}\` twice.`);
        seen.add(group);
    }
    return order;
}
/**
 * Settle a source's reading order: its pages in order, and the nav groups
 * they fall into.
 *
 * A flat `order` (or none) gives one group headed `source.group`. A grouped
 * `order` gives one group per declared group, in declaration order; a group
 * none of whose pages exist is left out of the nav (each missing slug still
 * warns). Unlisted pages are appended alphabetically, with a warning, to the
 * group headed `source.group` — a declared one of that name, or a new
 * trailing one — so they land at the end and say so.
 */
export function navOrder(source, pages) {
    if (!source.order?.length) {
        const ordered = [...pages].sort(byBareSlug);
        return { ordered, groups: [{ group: source.group, pages: ordered }], warnings: [] };
    }
    const remaining = new Map(pages.map((page) => [page.bareSlug, page]));
    const listed = new Set();
    const groups = [];
    const warnings = [];
    for (const declared of orderGroups(source)) {
        const settled = { group: declared.group, pages: [] };
        for (const slug of declared.pages) {
            if (listed.has(slug)) {
                warnings.push(`\`order\` for source \`${source.id}\` lists \`${slug}\` more than once; ` +
                    `the first place wins.`);
                continue;
            }
            listed.add(slug);
            const page = remaining.get(slug);
            if (!page) {
                warnings.push(`\`order\` for source \`${source.id}\` lists \`${slug}\`, which has no page.`);
                continue;
            }
            remaining.delete(slug);
            settled.pages.push(page);
        }
        groups.push(settled);
    }
    const appended = [...remaining.values()].sort(byBareSlug);
    for (const page of appended) {
        warnings.push(`\`${page.bareSlug}\` (source \`${source.id}\`) is missing from \`order\` — ` +
            `appended alphabetically.`);
    }
    if (appended.length) {
        const home = groups.find((g) => g.group === source.group);
        if (home)
            home.pages.push(...appended);
        else
            groups.push({ group: source.group, pages: appended });
    }
    const nonEmpty = groups.filter((g) => g.pages.length > 0);
    return { ordered: nonEmpty.flatMap((g) => g.pages), groups: nonEmpty, warnings };
}
//# sourceMappingURL=manifest.js.map