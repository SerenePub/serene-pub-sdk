/**
 * Loading a tree of markdown somebody else generated.
 *
 * `DocsSource.dir` already reads a directory, but it reads it as *the* source:
 * one directory, one group, one reading order. A generator's output is not
 * that — the TypeDoc API reference lands under `docs/generated/api` in the SDK
 * repo and has to be handed to a source that also has a prefix, a banner and a
 * repo link the generator knows nothing about. So this returns the pages and
 * stops, and the caller says what they are.
 *
 * It does not check that the directory exists. A caller who wants a missing
 * directory to be survivable (a fresh checkout that has not built the SDK yet)
 * should test for it and say so in its own words; swallowing ENOENT here would
 * make "the generator never ran" indistinguishable from "it generated nothing".
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
/**
 * Every `.md` under `dir`, recursively, as pages a `DocsSource` accepts.
 *
 * Paths are relative to `dir`, `/`-separated whatever the platform, and sorted
 * — the reading order a source's `order` then overrides.
 */
export async function loadMarkdownDir(dir, options = {}) {
    const root = resolve(dir);
    const prefix = options.prefix?.replace(/^\/+|\/+$/g, '') ?? '';
    const pages = [];
    for (const file of await markdownFilesIn(root)) {
        const relative = file
            .slice(root.length + 1)
            .split(sep)
            .join('/');
        pages.push({
            path: prefix ? `${prefix}/${relative}` : relative,
            markdown: await readFile(file, 'utf8'),
        });
    }
    return pages;
}
async function markdownFilesIn(dir) {
    const found = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const full = join(dir, entry.name);
        if (entry.isDirectory())
            found.push(...(await markdownFilesIn(full)));
        else if (entry.name.toLowerCase().endsWith('.md'))
            found.push(full);
    }
    return found;
}
//# sourceMappingURL=sources.js.map