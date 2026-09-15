#!/usr/bin/env node
/**
 * `serene-pub` — the plugin author's command line.
 *
 * Three verbs, and each one answers a question an author actually asks:
 *
 *   build     what will core see when it installs this? (manifest + documents)
 *   check     what am I doing that core will refuse, and why?
 *   contracts what types does this release give me to pin against?
 *
 * There is deliberately no `publish` and no `install`. Installing an extension is an
 * admin action inside SP, not something a build tool can do to somebody's instance —
 * a CLI that could install would be a CLI that could be scripted into installing.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compilePlugin, scanSource, renderFindings, cannotDo } from './compiler.js';
import { generateContracts } from './codegen.js';
const USAGE = `serene-pub <command>

  build [dir]        package the plugin in [dir] (default: .) into dist/plugin/
  check [dir]        report what core would refuse, without writing anything
  contracts [dir]    generate a /contracts module from the types [dir] registers
  scaffold config <spec-id>    print a config skeleton — the whole option space,
                               commented, defaults shown, (required) marked
  scaffold preset <genre-id>   print a preset skeleton — the genre's event
                               surface with the announced candidates per slot
  docs               render an announcement into markdown reference pages —
                     one per genre and pipeline, plus the package index
                     (--html: a self-contained static site instead)
  types              generate typed use() handles from an announcement, so
                     config() autocompletes the target's whole option space
  ui [dir]           run the surface harness: a dev server that renders the UI
                     surfaces this package announces — frame panels in the same
                     opaque-origin sandbox core mounts them in, components in
                     the host document — with hot reload. (alias: preview)

Options
  --out <dir|file>   where to write (build, contracts, scaffold)
  --port <n>         harness port (ui). Default: vite's choice
  --host             harness listens on all interfaces (ui)
  --open             open a browser (ui)
  --fixtures <file>  JSON replacing the harness's built-in fixtures (ui)
  --from <src>       scaffold declarations source: an announcement JSON file or
                     URL. Default: the installed @serene-pub/core-catalog.
  --release <ver>    stamped into the generated contracts banner
  --json             machine-readable output
`;
async function sourcesIn(dir) {
    const out = [];
    const walk = async (d) => {
        for (const entry of await readdir(d)) {
            if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.'))
                continue;
            const full = join(d, entry);
            const s = await stat(full);
            if (s.isDirectory())
                await walk(full);
            else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !/\.d\.ts$/.test(entry))
                out.push({ path: relative(dir, full), text: await readFile(full, 'utf8') });
        }
    };
    await walk(dir);
    return out;
}
/**
 * The dynamic half. The packager reads source statically *and* evaluates the author's
 * entry module to get the built `Extension` — the two halves are cross-checked against
 * each other, which is what catches a hook registered behind an `if` (13 §30).
 *
 * Evaluating here is safe in a way it is not in core: this runs on the author's own
 * machine, on their own code. **Core never does this** — it imports documents, never
 * authoring JS (F6).
 */
async function loadExtension(dir) {
    const { ENTRY_CANDIDATES } = await import('@serene-pub/sdk');
    for (const candidate of ENTRY_CANDIDATES) {
        const p = resolve(dir, candidate);
        try {
            const mod = await import(pathToFileURL(p).href);
            return mod.default ?? mod.extension;
        }
        catch (e) {
            if (e.code !== 'ERR_MODULE_NOT_FOUND')
                throw e;
        }
    }
    throw new Error(`no entry module found in ${dir}. Export your defineExtension(…) result as the default ` +
        `export of src/index.ts or dist/index.js.`);
}
const flag = (argv, name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
};
/**
 * Declaration resolution, shared by scaffold/docs/types (24 §10): an
 * announcement JSON file, an HTTP URL serving one, or the installed
 * @serene-pub/core-catalog. Nothing is guessed.
 */
async function resolveAnnouncement(argv) {
    const from = flag(argv, 'from');
    if (from && /^https?:\/\//.test(from)) {
        const res = await fetch(from);
        if (!res.ok) {
            process.stderr.write(`--from ${from} answered ${res.status}\n`);
            return null;
        }
        return (await res.json());
    }
    if (from)
        return JSON.parse(await readFile(resolve(from), 'utf8'));
    const catalog = await import('@serene-pub/core-catalog').catch(() => null);
    if (!catalog) {
        process.stderr.write(`no --from given and @serene-pub/core-catalog is not installed — ` +
            `add it as a devDependency, or point --from at an announcement JSON.\n`);
        return null;
    }
    return catalog.coreAnnouncement().document;
}
/** The registered type surfaces, for schema-aware generators. */
async function typeSurfaces() {
    const { allTypes, allScriptTypes, snapshotRegistry } = await import('@serene-pub/sdk');
    await import('@serene-pub/contracts');
    const entries = snapshotRegistry([...allTypes(), ...allScriptTypes()], {
        release: 'cli',
    });
    return (typeId, version) => entries.find((e) => e.id === typeId && e.version === version);
}
export async function main(argv = process.argv.slice(2)) {
    const [cmd, maybeDir] = argv;
    const dir = resolve(maybeDir && !maybeDir.startsWith('--') ? maybeDir : '.');
    const json = argv.includes('--json');
    if (!cmd || cmd === '--help' || cmd === '-h') {
        process.stdout.write(USAGE);
        return 0;
    }
    if (cmd === 'check') {
        const scan = scanSource(await sourcesIn(dir));
        if (json)
            process.stdout.write(JSON.stringify(scan, null, 2) + '\n');
        else {
            process.stdout.write(renderFindings(scan.findings) + '\n');
            process.stdout.write(`\npermissions this code would request:\n`);
            for (const p of scan.permissions)
                process.stdout.write(`  ${p}\n`);
        }
        return scan.findings.some((f) => f.severity === 'error') ? 1 : 0;
    }
    if (cmd === 'build') {
        const sources = await sourcesIn(dir);
        const extension = await loadExtension(dir);
        // The announce() path (24 §6): a package whose entry exports an
        // AnnouncementBuilder builds to a declaration artifact — the
        // announcement IS the manifest. External references land in
        // `requires`; nothing external is bundled (24 §10).
        if (extension &&
            typeof extension.build === 'function' &&
            extension.identity?.ns) {
            const { document, coverage } = extension.build();
            const out = resolve(dir, flag(argv, 'out') ?? 'dist/plugin');
            await mkdir(join(out, 'pipelines'), { recursive: true });
            await writeFile(join(out, 'announcement.json'), JSON.stringify(document, null, 2));
            for (const doc of document.pipelines)
                await writeFile(join(out, 'pipelines', `${doc.id.replace(/[:/]/g, '_')}.json`), JSON.stringify(doc, null, 2));
            if (json)
                process.stdout.write(JSON.stringify(document, null, 2) + '\n');
            else {
                process.stdout.write(`wrote announcement + ${document.pipelines.length} documents to ` +
                    `${relative(process.cwd(), out)}\n`);
                if (document.requires.length) {
                    process.stdout.write(`\nrequires (enforced at install, never bundled):\n`);
                    for (const r of document.requires)
                        process.stdout.write(`  · ${r}\n`);
                }
                for (const p of coverage.presets) {
                    process.stdout.write(`\npreset '${p.preset}' → ${p.genre}\n`);
                    for (const s of p.slots)
                        process.stdout.write(`  ${s.event.padEnd(18)} ${s.status}${s.binding
                            ? ` ← ${s.binding.spec}${s.binding.config ? ` @ ${s.binding.config}` : ''}`
                            : ''}\n`);
                }
                for (const t of coverage.todos)
                    process.stdout.write(`todo: ${t.path} — ${t.note}\n`);
            }
            return 0;
        }
        const r = compilePlugin({ sources, extension: extension });
        if (!r.ok) {
            process.stderr.write(renderFindings(r.findings) + '\n');
            return 1;
        }
        // Warnings on a green build still get said — to stderr, so --json output
        // stays parseable. A warning nobody sees is a check that does not exist.
        if (r.findings.length)
            process.stderr.write(renderFindings(r.findings) + '\n');
        const out = resolve(dir, flag(argv, 'out') ?? 'dist/plugin');
        await mkdir(join(out, 'pipelines'), { recursive: true });
        await writeFile(join(out, 'manifest.json'), JSON.stringify(r.manifest, null, 2));
        for (const doc of r.documents)
            await writeFile(join(out, 'pipelines', `${doc.id.replace(/[:/]/g, '_')}.json`), JSON.stringify(doc, null, 2));
        if (json)
            process.stdout.write(JSON.stringify(r.manifest, null, 2) + '\n');
        else {
            process.stdout.write(`wrote ${r.documents.length + 1} files to ${relative(process.cwd(), out)}\n\n`);
            // Printed on every successful build on purpose. The list of what a plugin
            // *cannot* do is generated from the manifest, so it cannot flatter — and an
            // author who sees it here is not surprised by it on the consent screen.
            process.stdout.write('what this plugin cannot do:\n');
            for (const line of cannotDo(r.manifest))
                process.stdout.write(`  · ${line}\n`);
        }
        return 0;
    }
    if (cmd === 'scaffold') {
        const [, kind, id] = argv;
        if ((kind !== 'config' && kind !== 'preset') || !id) {
            process.stderr.write(`scaffold takes 'config <spec-id>' or 'preset <genre-id>'\n\n${USAGE}`);
            return 1;
        }
        const announcement = await resolveAnnouncement(argv);
        if (!announcement)
            return 1;
        const { scaffoldConfig, scaffoldPreset } = await import('./scaffold.js');
        let text;
        if (kind === 'preset') {
            text = scaffoldPreset(id, announcement);
        }
        else {
            const doc = announcement.pipelines.find((p) => p.id === id);
            if (!doc) {
                process.stderr.write(`'${id}' is not in this announcement. It ships: ${announcement.pipelines
                    .map((p) => p.id)
                    .join(', ')}\n`);
                return 1;
            }
            text = scaffoldConfig(doc, await typeSurfaces());
        }
        const out = flag(argv, 'out');
        if (out) {
            await writeFile(resolve(out), text);
            process.stdout.write(`wrote ${out}\n`);
        }
        else
            process.stdout.write(text);
        return 0;
    }
    if (cmd === 'docs') {
        const announcement = await resolveAnnouncement(argv);
        if (!announcement)
            return 1;
        const typeOf = await typeSurfaces();
        const { renderAnnouncementDocs } = await import('./docs.js');
        const pages = renderAnnouncementDocs(announcement, typeOf);
        const out = resolve(flag(argv, 'out') ?? 'dist/docs');
        if (argv.includes('--html')) {
            const { renderSite } = await import('./docsSite.js');
            const site = renderSite(announcement, pages);
            for (const page of site) {
                const full = join(out, page.path);
                await mkdir(join(full, '..'), { recursive: true });
                await writeFile(full, page.html);
            }
            process.stdout.write(`wrote ${site.length} pages to ${relative(process.cwd(), out)} — open index.html\n`);
            return 0;
        }
        for (const page of pages) {
            const full = join(out, page.path);
            await mkdir(join(full, '..'), { recursive: true });
            await writeFile(full, page.markdown);
        }
        process.stdout.write(`wrote ${pages.length} pages to ${relative(process.cwd(), out)}\n`);
        return 0;
    }
    if (cmd === 'types') {
        const announcement = await resolveAnnouncement(argv);
        if (!announcement)
            return 1;
        const { generateTypedHandles } = await import('./typegen.js');
        const text = generateTypedHandles(announcement, await typeSurfaces());
        const out = flag(argv, 'out');
        if (out) {
            await writeFile(resolve(out), text);
            process.stdout.write(`wrote ${out}\n`);
        }
        else
            process.stdout.write(text);
        return 0;
    }
    if (cmd === 'ui' || cmd === 'preview') {
        // The harness carries SvelteKit and Vite, which is a real install, so
        // it is optional: nobody who only ships pipelines should pay for a
        // frontend toolchain they never launch.
        const harness = await import('@serene-pub/ui-preview/server').catch(() => null);
        if (!harness) {
            process.stderr.write(`the surface harness is not installed. Add it to your package:\n\n` +
                `  npm i -D @serene-pub/ui-preview\n\n` +
                `It carries SvelteKit and Vite, so it is a separate install from the CLI — ` +
                `a package that ships no UI never pays for it.\n`);
            return 1;
        }
        const portFlag = flag(argv, 'port');
        // Computed before the harness starts: it chdir's into its own root
        // (SvelteKit pins Vite to cwd), so a relative path printed afterwards
        // would be relative to the wrong place.
        const watching = relative(process.cwd(), dir) || '.';
        const server = await harness.startSurfaceHarness({
            packageDir: dir,
            port: portFlag ? Number(portFlag) : undefined,
            host: argv.includes('--host'),
            open: argv.includes('--open'),
            fixtures: flag(argv, 'fixtures'),
        });
        server.printUrls();
        process.stdout.write(`\nwatching ${watching} — ctrl-c to stop\n`);
        // Held open by the server's own handles; the promise never settles, so
        // `main` does not return and the process does not exit under us.
        await new Promise(() => { });
    }
    if (cmd === 'contracts') {
        const { allTypes } = await import('@serene-pub/sdk');
        await loadExtension(dir).catch(() => undefined);
        const text = generateContracts(allTypes(), { release: flag(argv, 'release') });
        const out = flag(argv, 'out');
        if (out) {
            await writeFile(resolve(out), text);
            process.stdout.write(`wrote ${out}\n`);
        }
        else
            process.stdout.write(text);
        return 0;
    }
    process.stderr.write(`unknown command '${cmd}'\n\n${USAGE}`);
    return 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().then((code) => process.exit(code), (e) => {
        process.stderr.write(`${e.message}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=bin.js.map