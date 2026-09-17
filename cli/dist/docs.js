const en = (v) => typeof v === 'string' ? v : (v?.en ?? '');
const code = (s) => '`' + s + '`';
const fileSafe = (id) => id.replace(/[:/]/g, '_');
function fieldRow(name, decl) {
    const type = decl?.type ?? '';
    const dflt = decl?.default === undefined
        ? '**required**'
        : code(JSON.stringify(decl.default));
    const desc = en(decl?.description).replace(/\n/g, ' ');
    return `| ${code(name)} | ${type} | ${dflt} | ${desc} |`;
}
function specPage(doc, announcement, typeOf) {
    const lines = [];
    lines.push(`# ${doc.id}`);
    lines.push('');
    lines.push(`Version ${code(doc.version)}.`);
    if (doc.input?.event)
        lines.push(`Answers ${code(doc.input.event)} for ${code(doc.input.genre ?? '?')} — the usage lock (24 §4).`);
    const tax = doc.taxonomy;
    if (tax?.zone || tax?.role)
        lines.push(`Catalogue: ${[tax?.zone, tax?.role].filter(Boolean).map(code).join(' · ')}.`);
    lines.push('');
    // The map, drawn from the same document the tables below are read off. It
    // is a fence rather than a picture because rendering it needs a layout
    // engine this package does not carry: `@serene-pub/docs` answers it with
    // `pipelineResolver(announcement)`, and a renderer that has no resolver
    // for it says so instead of quietly dropping the graph.
    lines.push('```pipeline ' + doc.id);
    lines.push('```');
    lines.push('');
    lines.push(`## Steps`);
    lines.push('');
    for (const node of doc.nodes) {
        const surface = typeOf(node.definitionId, node.definitionVersion);
        lines.push(`### ${code(node.key)} — ${node.kind} (${code(`${node.definitionId}@${node.definitionVersion}`)})`);
        lines.push('');
        const slots = surface?.slots ?? {};
        let wroteAny = false;
        for (const [slotName, slot] of Object.entries(slots)) {
            if (slot?.kind === 'parameters' && slot.schema) {
                lines.push(`**${slotName}**`);
                lines.push('');
                lines.push('| option | type | default | description |');
                lines.push('|---|---|---|---|');
                for (const [field, decl] of Object.entries(slot.schema))
                    lines.push(fieldRow(field, decl));
                lines.push('');
                wroteAny = true;
            }
            else if (slot?.kind === 'prompts' && slot.fields) {
                lines.push(`**${slotName}** — authored prompt fields: ${Object.keys(slot.fields).map(code).join(', ')}`);
                lines.push('');
                wroteAny = true;
            }
            else if (slot?.kind === 'scripts') {
                lines.push(`**${slotName}** — script chains, accepts ${(slot.accepts ?? []).map(code).join(', ')}`);
                lines.push('');
                wroteAny = true;
            }
            else if (slot?.kind === 'template') {
                lines.push(`**${slotName}** — ${slot.engine ?? 'template'} template slot`);
                lines.push('');
                wroteAny = true;
            }
        }
        if (!wroteAny) {
            lines.push('_Declares nothing to configure._');
            lines.push('');
        }
    }
    // Prompts are pooled per `(node type, slot)`, so a pipeline's shipped
    // prompts are the ones written for the nodes it actually runs — which is
    // also how a page ends up listing prose this spec did not author. That is
    // the point rather than a leak: the prompt is genuinely offered here,
    // because the node is the same node. `definitionId` is already unversioned
    // (`builder.ts` splits the `@n` off into `definitionVersion`), so it is the pool
    // key as-is.
    const poolTypes = new Set(doc.nodes.map((n) => n.definitionId));
    const prompts = announcement.prompts.filter((p) => poolTypes.has(p.nodeType));
    if (prompts.length) {
        lines.push(`## Shipped prompts`);
        lines.push('');
        for (const p of prompts)
            lines.push(`- **${p.label}** (${code(p.slug)}) — ${code(`${p.nodeType}#${p.slot}`)}`);
        lines.push('');
    }
    return { path: `pipelines/${fileSafe(doc.id)}.md`, markdown: lines.join('\n') };
}
function genrePage(genre, announcement) {
    const lines = [];
    lines.push(`# ${en(genre.name) || genre.id}`);
    lines.push('');
    lines.push(`${code(genre.id)} — family ${code(genre.family)}.`);
    const desc = en(genre.description);
    if (desc) {
        lines.push('');
        lines.push(desc);
    }
    lines.push('');
    lines.push(`## Event surface`);
    lines.push('');
    lines.push('| event | standing | announced pipelines |');
    lines.push('|---|---|---|');
    for (const [event, decl] of Object.entries(genre.events)) {
        const standing = decl?.required
            ? 'required'
            : decl?.open
                ? 'open'
                : 'optional';
        const serves = announcement.pipelines
            .filter((p) => p.input?.genre === genre.id && p.input?.event === event)
            .map((p) => code(p.id))
            .join(', ');
        lines.push(`| ${code(event)} | ${standing} | ${serves || '—'} |`);
    }
    if (genre.shape) {
        lines.push('');
        lines.push(`## Shape`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(genre.shape, null, 2));
        lines.push('```');
    }
    return { path: `genres/${fileSafe(genre.id)}.md`, markdown: lines.join('\n') };
}
export function renderAnnouncementDocs(announcement, typeOf) {
    const pages = [];
    // The index: what this package is and ships.
    const index = [];
    index.push(`# ${announcement.identity.title}`);
    index.push('');
    if (announcement.identity.summary)
        index.push(announcement.identity.summary);
    index.push('');
    if (announcement.genres.length) {
        index.push(`## Genres`);
        index.push('');
        for (const g of announcement.genres)
            index.push(`- [${en(g.name) || g.id}](genres/${fileSafe(g.id)}.md)`);
        index.push('');
    }
    index.push(`## Pipelines`);
    index.push('');
    for (const p of announcement.pipelines)
        index.push(`- [${p.id}](pipelines/${fileSafe(p.id)}.md) — v${p.version}`);
    index.push('');
    if (announcement.presets.length) {
        index.push(`## Presets`);
        index.push('');
        for (const p of announcement.presets) {
            index.push(`### ${p.label} (${code(p.slug)})`);
            index.push('');
            if (p.description) {
                index.push(p.description);
                index.push('');
            }
            index.push('| event | pipeline | config |');
            index.push('|---|---|---|');
            for (const [event, b] of Object.entries(p.bindings))
                index.push(`| ${code(event)} | ${code(b.spec)} | ${b.config ? code(b.config) : 'shipped default'} |`);
            if (p.actions?.include.length)
                index.push(`\nActions: ${p.actions.include.map(code).join(', ')}`);
            index.push('');
        }
    }
    if (announcement.requires.length) {
        index.push(`## Requires`);
        index.push('');
        for (const r of announcement.requires)
            index.push(`- ${code(r)}`);
        index.push('');
    }
    pages.push({ path: 'index.md', markdown: index.join('\n') });
    for (const g of announcement.genres)
        pages.push(genrePage(g, announcement));
    for (const p of announcement.pipelines)
        pages.push(specPage(p, announcement, typeOf));
    return pages;
}
//# sourceMappingURL=docs.js.map