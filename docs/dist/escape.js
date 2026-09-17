/**
 * One function, and its own module for one reason: `graph.ts` needs it and
 * nothing else from the dialect.
 *
 * `renderDocsGraph` runs in a browser — the docs playground draws the document
 * it just ran with it — and `dialect.ts` imports `node:path` and `marked`, so a
 * bundler following one import to reach `escapeHtml` pulls the whole markdown
 * compiler in behind it and then fails on `node:path`. Splitting the leaf out
 * is what keeps the drawing importable anywhere the drawing makes sense.
 *
 * `dialect.ts` re-exports it, so nothing about the package's surface moves.
 */
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=escape.js.map