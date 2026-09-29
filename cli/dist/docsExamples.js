/**
 * Executed examples (15 §1.6, 07 §0-i) — pages whose code was RUN to make them.
 *
 * Every example on the docs site is a real module in `sdk-tests/examples`: it is
 * type-checked with the suite, built into a document, validated against the same
 * laws a published pipeline is, and executed against the fixture host. The page
 * shows that module verbatim and, under it, what the run actually produced. So
 * an example cannot claim a method that no longer exists, wire a port that no
 * longer accepts it, or print output the executor no longer emits — the page
 * fails to generate first.
 *
 * The output is held still by a **golden** per example (`toGolden` /
 * `checkGolden`, `@serene-pub/sdk/testing`). Drift is not a page that quietly
 * changes wording; it is a `GoldenMismatch` naming the example and the exact
 * path that moved, and re-recording it is a deliberate `--update-goldens`.
 *
 * ⚠ **Loading is the caller's.** The examples are `.ts`, because they belong to
 * the test suite that type-checks them, and nothing here compiles TypeScript.
 * Pass `load` — `(p) => import(p)` — from a runtime that can import a `.ts`
 * module (the suite runs under `tsx`; a host would register `tsx` first). The
 * default is a plain dynamic import, which is enough for `.js` examples and
 * for any runtime that already has a TypeScript loader installed.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile, previewOf, renderPreview, validate, } from '@serene-pub/sdk';
import { checkGolden, diffGolden, makeExampleRunCtx, renderRunSummary, toGolden, } from '@serene-pub/sdk/testing';
const EXAMPLE_SUFFIX = '.example.ts';
const isExample = (name) => name.endsWith(EXAMPLE_SUFFIX);
const defaultLoad = (path) => import(pathToFileURL(path).href);
/** A document, whichever end of `compile` the example handed back. */
const documentOf = (built) => 'schemaVersion' in built ? built : compile(built);
async function readGolden(path) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return undefined;
        throw e;
    }
}
/**
 * The file's own leading doc comment, as the page's intro.
 *
 * Only a comment the file OPENS with: a licence header or an import's comment
 * is not an introduction, and a page that silently used one would be worse than
 * a page that used the summary.
 */
function introOf(source) {
    const m = /^\s*\/\*\*([\s\S]*?)\*\//.exec(source);
    if (!m)
        return undefined;
    const body = m[1]
        .split('\n')
        .map((line) => line.replace(/^\s*\* ?/, '').trimEnd())
        .join('\n')
        .trim();
    return body || undefined;
}
function page(example, source, output) {
    const lines = [];
    lines.push(`# ${example.title}`);
    lines.push('');
    lines.push(introOf(source) ?? example.summary);
    lines.push('');
    lines.push('## The code');
    lines.push('');
    // A playground fence, not a plain `ts` one: the module below was executed
    // to make this page, so it is the one block on the site a reader has every
    // reason to want to edit and run.
    lines.push('```playground ts');
    lines.push(source.trimEnd());
    lines.push('```');
    lines.push('');
    lines.push('## What it produces');
    lines.push('');
    lines.push('```');
    lines.push(output);
    lines.push('```');
    lines.push('');
    lines.push('## Golden');
    lines.push('');
    lines.push(`This output is not a transcript somebody pasted: it is checked on every build ` +
        `against \`${example.slug}.golden.json\`, so a change in what the executor does ` +
        `fails the suite naming this example instead of quietly rewriting the page.`);
    lines.push('');
    return { path: `examples/${example.slug}.md`, markdown: lines.join('\n') };
}
/**
 * Build, validate, run and render every example in `dir`.
 *
 * Throws rather than reporting, in every case where a page would otherwise ship
 * a claim nobody checked: a module that exports no `example`, a slug that does
 * not match its filename, a document with a validation finding, or a run that
 * no longer matches its golden.
 * @experimental
 */
export async function renderExampleDocs(opts) {
    const load = opts.load ?? defaultLoad;
    const files = (await readdir(opts.dir)).filter(isExample).sort();
    const pages = [];
    const report = [];
    for (const file of files) {
        const path = join(opts.dir, file);
        const stem = file.slice(0, -EXAMPLE_SUFFIX.length);
        const mod = (await load(path));
        if (mod?.componentExample) {
            const c = mod.componentExample;
            if (c.slug !== stem)
                throw new Error(`${file} declares slug '${c.slug}' — the slug is the filename stem`);
            const { page: p, report: r } = await renderComponentExample(c, opts, await readFile(path, 'utf8'));
            pages.push(p);
            report.push(r);
            continue;
        }
        const example = mod?.example;
        if (!example)
            throw new Error(`${file} exports no 'example' (or 'componentExample') — an executed example is one module, one export`);
        if (example.slug !== stem)
            throw new Error(`${file} declares slug '${example.slug}' — the slug is the filename stem, ` +
                `because it names the page and the golden beside it`);
        const doc = documentOf(example.build());
        const findings = validate(doc);
        if (findings.length)
            throw new Error(`example '${example.slug}' does not publish:\n` +
                findings
                    .map((f) => `  ${f.severity} ${f.law} ${f.nodeKey ?? ''} — ${f.message}\n    fix: ${f.fix}`)
                    .join('\n'));
        const receipt = await example.run(makeExampleRunCtx(doc));
        const goldenPath = join(opts.goldensDir, `${example.slug}.golden.json`);
        const stored = await readGolden(goldenPath);
        let recorded = false;
        let changed = false;
        if (opts.update) {
            const golden = toGolden(example.slug, receipt);
            recorded = !stored;
            changed = !!stored && diffGolden(stored, golden).length > 0;
            if (recorded || changed) {
                await mkdir(opts.goldensDir, { recursive: true });
                await writeFile(goldenPath, JSON.stringify(golden, null, '\t') + '\n');
            }
        }
        else if (!stored) {
            throw new Error(`example '${example.slug}' has no golden at ${goldenPath}. ` +
                `Record it with --update-goldens, and commit it — an example whose output ` +
                `nothing pins is a page that can drift.`);
        }
        else {
            // Throws GoldenMismatch, whose message is the rendered diff.
            checkGolden(example.slug, receipt, stored);
        }
        const preview = previewOf(receipt);
        const source = await readFile(path, 'utf8');
        pages.push(page(example, source, preview ? renderPreview(preview) : renderRunSummary(receipt)));
        report.push({ slug: example.slug, recorded, changed });
    }
    return { pages, report };
}
/** Pretty enough to read and diff: one element per line, indented by depth. */
function indentHtml(html) {
    const out = [];
    let depth = 0;
    for (const token of html.split(/(<[^>]+>)/).filter((t) => t.trim())) {
        if (token.startsWith('</'))
            depth = Math.max(0, depth - 1);
        out.push('  '.repeat(depth) + token.trim());
        if (token.startsWith('<') && !token.startsWith('</') && !token.endsWith('/>') && !/^<(input|img|br|hr)\b/.test(token))
            depth++;
    }
    return out.join('\n');
}
async function renderComponentExample(c, opts, moduleSource) {
    // Loaded here: the harness brings Remote DOM, which nothing else in the CLI needs.
    const { mountComponent } = await import('./testing.js');
    const view = await mountComponent({ entry: join(opts.dir, c.entry), context: c.context });
    let golden;
    try {
        await c.act?.(view);
        if (view.refused.length)
            throw new Error(`component example '${c.slug}' places what the vocabulary refuses:\n  ${view.refused.join('\n  ')}`);
        golden = { slug: c.slug, html: indentHtml(view.html()), invoked: [...view.invoked] };
    }
    finally {
        await view.unmount();
    }
    const goldenPath = join(opts.goldensDir, `${c.slug}.golden.json`);
    let stored;
    try {
        stored = JSON.parse(await readFile(goldenPath, 'utf8'));
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            throw e;
    }
    const same = !!stored && JSON.stringify(stored) === JSON.stringify(golden);
    let recorded = false;
    let changed = false;
    if (opts.update) {
        recorded = !stored;
        changed = !!stored && !same;
        if (recorded || changed) {
            await mkdir(opts.goldensDir, { recursive: true });
            await writeFile(goldenPath, JSON.stringify(golden, null, '\t') + '\n');
        }
    }
    else if (!stored) {
        throw new Error(`component example '${c.slug}' has no golden at ${goldenPath}. Record it with --update-goldens, and commit it.`);
    }
    else if (!same) {
        throw new Error(`component example '${c.slug}' no longer renders its golden.\n--- golden\n${stored.html}\n--- now\n${golden.html}` +
            (JSON.stringify(stored.invoked) === JSON.stringify(golden.invoked)
                ? ''
                : `\n--- invoked: golden ${JSON.stringify(stored.invoked)}, now ${JSON.stringify(golden.invoked)}`));
    }
    const lines = [`# ${c.title}`, '', introOf(moduleSource) ?? c.summary, '', '## The code', ''];
    for (const f of c.show ?? [c.entry]) {
        const ext = f.split('.').pop();
        lines.push(`\`${f}\``, '', '```' + (ext === 'svelte' ? 'svelte' : 'ts'), (await readFile(join(opts.dir, f), 'utf8')).trimEnd(), '```', '');
    }
    lines.push('## What the page shows', '', '```html', golden.html, '```', '');
    if (golden.invoked.length)
        lines.push('It pressed:', '', '```json', JSON.stringify(golden.invoked, null, 2), '```', '');
    lines.push('## Golden', '', `Mounted by the component harness (\`@serene-pub/cli/testing\`) on every build and checked ` +
        `against \`${c.slug}.golden.json\` — the DOM above is what the harness mirrored, not a transcript.`, '');
    return {
        page: { path: `examples/${c.slug}.md`, markdown: lines.join('\n') },
        report: { slug: c.slug, recorded, changed },
    };
}
//# sourceMappingURL=docsExamples.js.map