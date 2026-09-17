import { escapeHtml } from './escape.js';
/** The app's step card, to the pixel (`STEP_W` / `STEP_H`). */
const NODE_W = 220;
const NODE_H = 58;
/** The app's `scopeOptions`, minus the direction it fills in per call. */
const SPACING = {
    'elk.spacing.nodeNode': '26',
    'elk.layered.spacing.nodeNodeBetweenLayers': '36',
    'elk.spacing.edgeNode': '16',
};
/**
 * Characters a label keeps. At the emitted 13px this is about 196px of text —
 * the card's 220 less its 12px gutters — so a label that fits is never cut and
 * one that is cut never overruns its box.
 */
const LABEL_MAX = 28;
let elkModule = null;
async function loadElk() {
    elkModule ??= import('elkjs/lib/elk.bundled.js').then((mod) => mod.default);
    return elkModule;
}
/** Ids inside an SVG are document-wide, so every one of ours carries the graph's. */
function slugifyId(id) {
    return (id
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'graph');
}
const round = (value) => Math.round((value ?? 0) * 10) / 10;
function truncate(text) {
    return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1).trimEnd()}…` : text;
}
/** `M x,y L x,y …` over one ELK edge section. */
function sectionPath(section) {
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    return points
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point?.x)},${round(point?.y)}`)
        .join(' ');
}
function nodeSvg(node, x, y) {
    const label = truncate(node.label);
    const sublabel = node.sublabel ? truncate(node.sublabel) : '';
    // The tooltip is the fallback for what the cut took, so it is only worth a
    // node when something was actually cut.
    const cut = label !== node.label || (!!node.sublabel && sublabel !== node.sublabel);
    const full = node.sublabel ? `${node.label} — ${node.sublabel}` : node.label;
    const kind = slugifyId(node.kind);
    return (`<g class="doc-graph-node doc-graph-node-${escapeHtml(kind)}" transform="translate(${x},${y})">` +
        (cut ? `<title>${escapeHtml(full)}</title>` : '') +
        `<rect width="${NODE_W}" height="${NODE_H}" rx="8" fill="none" stroke="currentColor"/>` +
        `<text x="12" y="${sublabel ? 25 : 34}" font-size="13" fill="currentColor">` +
        `${escapeHtml(label)}</text>` +
        (sublabel
            ? `<text class="doc-graph-sublabel" x="12" y="42" font-size="11" ` +
                `fill="currentColor">${escapeHtml(sublabel)}</text>`
            : '') +
        `</g>`);
}
/**
 * One `DocsGraph` → one `<figure class="doc-graph">` holding an inline SVG.
 *
 * Every id the SVG defines is prefixed with a slug of the graph's id, so two
 * graphs on one page do not share a marker or an `aria-labelledby` target. A
 * page embedding the SAME graph twice would, which is why the fence's id is
 * the thing that has to be unique on a page rather than merely present.
 */
export async function renderDocsGraph(graph) {
    const uid = slugifyId(graph.id);
    const title = graph.title ?? graph.id;
    const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
    // An edge to a key no node has would make ELK throw about an id it cannot
    // resolve, from inside a layout the reader never asked for. The resolver
    // owns what a graph means; the drawing just refuses to draw a half-edge.
    const edges = graph.edges.filter((edge) => byKey.has(edge.from) && byKey.has(edge.to));
    const Elk = await loadElk();
    const laidOut = await new Elk().layout({
        id: `${uid}-root`,
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': graph.direction ?? 'DOWN',
            ...SPACING,
            'elk.padding': '[top=8,left=8,bottom=8,right=8]',
        },
        children: graph.nodes.map((node) => ({
            id: node.key,
            width: NODE_W,
            height: NODE_H,
        })),
        edges: edges.map((edge, index) => ({
            id: `${uid}-e${index}`,
            sources: [edge.from],
            targets: [edge.to],
        })),
    });
    const width = round(laidOut.width);
    const height = round(laidOut.height);
    const labelByEdgeId = new Map(edges.map((edge, index) => [`${uid}-e${index}`, edge.label]));
    const parts = [];
    parts.push(`<figure class="doc-graph"><svg role="img" aria-labelledby="${uid}-title" ` +
        `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
        `<title id="${uid}-title">${escapeHtml(title)}</title>`);
    parts.push(`<defs><marker id="${uid}-arrow" viewBox="0 0 8 8" refX="7" refY="4" ` +
        `markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
        `<path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker></defs>`);
    // Edges first: a card drawn over a line is a card, a line drawn over a
    // card is a line through it.
    for (const edge of (laidOut.edges ?? [])) {
        for (const section of (edge.sections ?? [])) {
            parts.push(`<path class="doc-graph-edge" d="${sectionPath(section)}" fill="none" ` +
                `stroke="currentColor" marker-end="url(#${uid}-arrow)"/>`);
        }
        const label = labelByEdgeId.get(edge.id);
        const first = (edge.sections ?? [])[0];
        if (label && first) {
            const mid = (first.bendPoints ?? [])[0] ?? {
                x: ((first.startPoint?.x ?? 0) + (first.endPoint?.x ?? 0)) / 2,
                y: ((first.startPoint?.y ?? 0) + (first.endPoint?.y ?? 0)) / 2,
            };
            parts.push(`<text class="doc-graph-edge-label" x="${round(mid.x)}" y="${round(mid.y)}" ` +
                `font-size="11" fill="currentColor">${escapeHtml(label)}</text>`);
        }
    }
    for (const child of (laidOut.children ?? [])) {
        const node = byKey.get(child.id);
        if (!node)
            continue;
        parts.push(nodeSvg(node, round(child.x), round(child.y)));
    }
    parts.push(`</svg><figcaption>${escapeHtml(title)}</figcaption></figure>`);
    return parts.join('');
}
//# sourceMappingURL=graph.js.map