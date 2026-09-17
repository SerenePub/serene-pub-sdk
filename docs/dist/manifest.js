const byBareSlug = (a, b) => (a.bareSlug < b.bareSlug ? -1 : 1);
export function navOrder(source, pages) {
    if (!source.order?.length)
        return { ordered: [...pages].sort(byBareSlug), warnings: [] };
    const remaining = new Map(pages.map((page) => [page.bareSlug, page]));
    const ordered = [];
    const warnings = [];
    for (const slug of source.order) {
        const page = remaining.get(slug);
        if (!page) {
            warnings.push(`\`order\` for source \`${source.id}\` lists \`${slug}\`, which has no page.`);
            continue;
        }
        remaining.delete(slug);
        ordered.push(page);
    }
    const appended = [...remaining.values()].sort(byBareSlug);
    for (const page of appended) {
        warnings.push(`\`${page.bareSlug}\` (source \`${source.id}\`) is missing from \`order\` — ` +
            `appended alphabetically.`);
    }
    ordered.push(...appended);
    return { ordered, warnings };
}
//# sourceMappingURL=manifest.js.map