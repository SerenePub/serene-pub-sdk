import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { COMPONENT_IMPORTS, componentImportFinding, componentModuleFindings, currentBuiltAgainst } from '@serene-pub/sdk';
import { COMPONENT_COMPILE_LIMITS, SAFE_PATH, hasDotSegment, isSafeComponentPath } from './componentSource.js';
export { COMPONENT_COMPILE_LIMITS, isSafeComponentPath, componentSourceHash, builtAgainstOfFingerprint } from './componentSource.js';
/**
 * Bumped whenever this compiler's output for the same input can change —
 * a host recompiles every stored component whose fingerprint differs.
 * @internal
 */
export const COMPONENT_COMPILER_REVISION = 1;
/* ── the path grammar ───────────────────────────────────────────────────── */
const SVELTE_FILE = /\.svelte(\.(ts|js))?$/;
/** A bare specifier's grammar: `name` or `@scope/name`, then plain segments. */
const BARE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*)*$/;
/** A relative specifier: `./` or `../…/`, then the UI-path grammar. */
const RELATIVE = /^(\.\/|(\.\.\/)+)/;
/** Files an in-app build may load, authored or resolved. */
const LOADABLE = /\.(svelte|ts|js|mjs)$/;
const LIST = COMPONENT_IMPORTS.map((p) => `'${p}'`).join(', ');
const RELATIVELY = 'a component imports its own files relatively';
/**
 * Every in-app refusal names what IS allowed — said once: a finding that
 * already ends on the lead-in (an absolute path or URL) only gains the list.
 */
const namingTheList = (text) => text.includes(LIST)
    ? text
    : text.endsWith(RELATIVELY)
        ? `${text}, and only ${LIST}`
        : `${text} — ${RELATIVELY}, and only ${LIST}`;
const packageName = (bare) => {
    const parts = bare.split('/');
    return bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};
/* ── the shared build ───────────────────────────────────────────────────── */
/** @internal The virtual namespace authored files live in. */
export const COMPONENT_SOURCE_NAMESPACE = 'sp-component';
const RENDERER = /[\\/]@remote-dom[\\/]/;
const RESOLVING = Symbol('sp-component-resolving');
const inside = (file, dir) => {
    const r = relative(dir, file);
    return r !== '' && !r.startsWith('..') && !isAbsolute(r);
};
/** The nearest `package.json` above `file`, and its name. */
async function packageAt(file, cache) {
    let dir = dirname(file);
    const seen = [];
    for (;;) {
        if (cache.has(dir))
            return settle(cache.get(dir));
        seen.push(dir);
        const name = await readFile(join(dir, 'package.json'), 'utf8').then((t) => JSON.parse(t).name ?? null, () => undefined);
        if (name !== undefined)
            return settle(name);
        const up = dirname(dir);
        if (up === dir)
            return settle(null);
        dir = up;
    }
    function settle(name) {
        for (const d of seen)
            cache.set(d, name);
        return name;
    }
}
/** The directory of the package named `name` that `file` belongs to, or null. */
async function ownPackageDir(file, name) {
    let dir = dirname(file);
    for (;;) {
        const found = await readFile(join(dir, 'package.json'), 'utf8').then((t) => JSON.parse(t).name ?? null, () => null);
        if (found === name)
            return dir;
        const up = dirname(dir);
        if (up === dir)
            return null;
        dir = up;
    }
}
/** @internal The one build both front doors run. Throws esbuild's failure as-is. */
export async function runComponentBuild(opts) {
    const { host, mode, esbuild } = opts;
    const virtual = host.kind === 'virtual';
    const inApp = mode === 'in-app';
    const split = typeof opts.entry !== 'string';
    if (split && (virtual || inApp || !opts.outdir))
        throw new Error('a split component build is disk, package mode and an outdir only — an in-app build is one self-contained module');
    const root = host.kind === 'virtual' ? host.resolveFrom : host.root;
    const alias = host.kind === 'disk' ? (host.alias ?? {}) : {};
    const NS = COMPONENT_SOURCE_NAMESPACE;
    const bundled = new Set();
    const warnings = [];
    const names = new Map();
    /** A file of the author's own — not a dependency's, wherever that is linked from. */
    const ownOnDisk = (file) => inside(file, root) && !/[\\/]node_modules[\\/]/.test(relative(root, file));
    const mine = (args) => virtual ? args.namespace === NS : ownOnDisk(args.importer);
    const refuse = (text) => ({ errors: [{ text: inApp ? namingTheList(text) : text }] });
    let svelteCompiler = opts.svelte;
    const loadSvelte = async () => {
        if (svelteCompiler !== undefined)
            return svelteCompiler;
        try {
            svelteCompiler = (await import('svelte/compiler'));
        }
        catch {
            svelteCompiler = null;
        }
        return svelteCompiler;
    };
    const read = async (path, namespace) => namespace === NS && host.kind === 'virtual' ? host.files.get(path) : readFile(path, 'utf8');
    /** A virtual relative import, resolved the way esbuild resolves one on disk. */
    const resolveVirtual = (importer, spec) => {
        if (host.kind !== 'virtual')
            return undefined;
        const joined = posix.normalize(posix.join(posix.dirname(importer), spec));
        // The virtual root is the whole world: nothing above it exists.
        if (joined === '..' || joined.startsWith('../') || joined.startsWith('/'))
            return { escapes: true };
        const tries = [joined, `${joined}.ts`, `${joined}.js`, `${joined}/index.ts`, `${joined}/index.js`];
        if (joined.endsWith('.js'))
            tries.push(joined.slice(0, -3) + '.ts');
        return tries.find((t) => host.files.has(t));
    };
    /** The worker runtime's own file, resolved once — no component reaches it. */
    let workerRuntime;
    const isWorkerRuntime = async (path, build) => {
        if (workerRuntime === undefined) {
            const r = await build.resolve('@serene-pub/component-client/worker-runtime', {
                kind: 'import-statement',
                resolveDir: root,
                importer: join(root, 'package.json'),
                pluginData: { [RESOLVING]: true },
            });
            workerRuntime = r.errors.length || !r.path ? null : await realpath(r.path).catch(() => r.path);
        }
        if (!workerRuntime)
            return false;
        return path === workerRuntime || (await realpath(path).catch(() => path)) === workerRuntime;
    };
    const guard = {
        name: 'sp-component-imports',
        setup(build) {
            build.onResolve({ filter: /.*/ }, async (args) => {
                if (args.kind === 'entry-point')
                    return virtual ? { path: args.path, namespace: NS } : undefined;
                if (args.pluginData?.[RESOLVING])
                    return undefined;
                const authored = mine(args);
                // What the author wrote is judged as written (URLs, absolute paths,
                // traversal, the renderer by name)…
                if (authored) {
                    const refused = componentImportFinding(args.path, { bundled: !inApp });
                    if (refused)
                        return refuse(refused);
                    if (inApp) {
                        if (args.with && Object.keys(args.with).length)
                            return refuse(`'${args.path}' carries an import attribute (with { ${Object.entries(args.with)
                                .map(([k, v]) => `${k}: '${v}'`)
                                .join(', ')} }) — a component imports modules, never raw files`);
                        const rel = RELATIVE.exec(args.path);
                        const rest = rel ? args.path.slice(rel[0].length) : args.path;
                        if (rel ? !SAFE_PATH.test(rest) || hasDotSegment(rest) : !BARE.test(args.path))
                            return refuse(`'${args.path}' is not a plain import path`);
                    }
                    if (virtual && RELATIVE.test(args.path)) {
                        const found = resolveVirtual(args.importer, args.path);
                        if (typeof found === 'object')
                            return refuse(`'${args.path}' reaches past the component's own files`);
                        if (!found)
                            return refuse(`'${args.path}' is not one of the component's files`);
                        return { path: found, namespace: NS };
                    }
                }
                // …and every import by where it LANDS: a tsconfig path, a package
                // `imports` alias or a symlink can name one thing and reach another.
                // One Svelte, the package's own, for its compiled components and
                // for the component client alike: two runtimes cannot share a mount.
                const svelte = args.path === 'svelte' || args.path.startsWith('svelte/');
                const aliased = Object.entries(alias).find(([key]) => args.path === key || args.path.startsWith(key + '/'));
                const target = aliased ? aliased[1] + args.path.slice(aliased[0].length) : args.path;
                const fromVirtual = args.namespace === NS;
                const r = await build.resolve(target, {
                    kind: args.kind,
                    importer: svelte || fromVirtual ? join(root, 'package.json') : args.importer,
                    resolveDir: svelte || fromVirtual ? root : args.resolveDir,
                    with: args.with,
                    pluginData: { [RESOLVING]: true },
                });
                if (r.errors.length)
                    return { errors: r.errors };
                if (RENDERER.test(r.path))
                    return refuse(`'${args.path}' resolves into @remote-dom — the host's renderer is never part of a component`);
                if (!r.external && r.path && (await isWorkerRuntime(r.path, build)))
                    return refuse(`'${args.path}' resolves into the component client's worker runtime — a component is started by it, never imports it`);
                if (inApp) {
                    if (r.external || r.namespace !== 'file' || !LOADABLE.test(r.path))
                        return refuse(`'${args.path}' resolves to '${r.path}', which is not a module a component may load`);
                    if (authored) {
                        // A listed name is not enough: the file it lands on must be that
                        // package's OWN file, not a sibling's, a parent's or a nested dependency's.
                        const pkg = packageName(args.path);
                        const real = await realpath(r.path).catch(() => null);
                        const dir = real && (await ownPackageDir(real, pkg));
                        const realDir = dir && (await realpath(dir).catch(() => null));
                        if (!real || !realDir || !inside(real, realDir) || /[\\/]node_modules[\\/]/.test(relative(realDir, real)))
                            return refuse(`'${args.path}' resolves outside the package '${pkg}'`);
                    }
                }
                // What the author imports by a listed name is the kit, not a
                // third-party package carried along (`@serene-pub/sdk/component`
                // lands in the SDK's own files, and is not "bundling the SDK").
                const listed = COMPONENT_IMPORTS.some((p) => p.endsWith('/*') ? args.path.startsWith(p.slice(0, -1)) : args.path === p);
                if (authored && !listed && !r.external && !(virtual ? false : ownOnDisk(r.path))) {
                    const name = await packageAt(r.path, names);
                    if (name && !COMPONENT_IMPORTS.some((p) => (p.endsWith('/*') ? name.startsWith(p.slice(0, -1)) : name === p)))
                        bundled.add(name);
                }
                return {
                    path: r.path,
                    namespace: r.namespace,
                    external: r.external,
                    sideEffects: r.sideEffects,
                    suffix: r.suffix,
                    pluginData: r.pluginData,
                };
            });
            build.onLoad({ filter: /\.svelte$/ }, async (args) => {
                if (opts.framework === 'vanilla' && args.namespace === NS)
                    return { errors: [{ text: `'${args.path}' is a Svelte component and this component's framework is vanilla` }] };
                const svelteC = await loadSvelte();
                if (!svelteC)
                    return {
                        errors: [{ text: `'${args.path}' is a Svelte component and svelte is not installed — npm i -D svelte` }],
                    };
                const source = await read(args.path, args.namespace);
                let out;
                try {
                    out = svelteC.compile(source, { filename: args.path, generate: 'client', css: 'external' });
                }
                catch (e) {
                    return { errors: [svelteError(e, args.path, args.namespace)] };
                }
                if (out.css?.code?.trim())
                    warnings.push(`${args.path}: its <style> is dropped — a component styles itself with classes ` +
                        `(styles are not in the host-element vocabulary; a widget skin does the rest)`);
                for (const w of out.warnings)
                    warnings.push(`${args.path}: ${w.message}`);
                return { contents: out.js.code, loader: 'js', resolveDir: args.namespace === NS ? root : dirname(args.path) };
            });
            // A rune module (`store.svelte.ts`): its `$state` is compiled too, or
            // it reaches the worker as a call to nothing.
            build.onLoad({ filter: /\.svelte\.(js|ts)$/ }, async (args) => {
                if (opts.framework === 'vanilla' && args.namespace === NS)
                    return { errors: [{ text: `'${args.path}' is a Svelte module and this component's framework is vanilla` }] };
                const svelteC = await loadSvelte();
                if (!svelteC)
                    return { errors: [{ text: `'${args.path}' is a Svelte module and svelte is not installed — npm i -D svelte` }] };
                let source = await read(args.path, args.namespace);
                if (args.path.endsWith('.ts')) {
                    try {
                        source = (await esbuild.transform(source, { loader: 'ts', sourcefile: args.path, target: 'es2022' })).code;
                    }
                    catch (e) {
                        const failure = e;
                        if (!failure.errors)
                            throw e;
                        return {
                            errors: failure.errors.map((m) => ({
                                text: m.text,
                                location: m.location && { ...m.location, file: args.path, namespace: args.namespace },
                            })),
                        };
                    }
                }
                let out;
                try {
                    out = svelteC.compileModule(source, { filename: args.path, generate: 'client' });
                }
                catch (e) {
                    return { errors: [svelteError(e, args.path, args.namespace)] };
                }
                for (const w of out.warnings)
                    warnings.push(`${args.path}: ${w.message}`);
                return { contents: out.js.code, loader: 'js', resolveDir: args.namespace === NS ? root : dirname(args.path) };
            });
            if (host.kind === 'virtual')
                build.onLoad({ filter: /\.(ts|js)$/, namespace: NS }, (args) => ({
                    contents: host.files.get(args.path),
                    loader: args.path.endsWith('.ts') ? 'ts' : 'js',
                    resolveDir: root,
                }));
        },
    };
    const result = await esbuild.build({
        metafile: true,
        entryPoints: typeof opts.entry === 'string' ? [opts.entry] : opts.entry,
        ...(virtual
            ? { absWorkingDir: root }
            : split
                ? { outdir: opts.outdir, entryNames: '[name]', chunkNames: 'shared-[hash]', splitting: true }
                : { outfile: opts.outfile }),
        write: false,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        conditions: ['svelte', 'browser'],
        mainFields: ['svelte', 'browser', 'module', 'main'],
        plugins: [guard],
        logLevel: 'silent',
        legalComments: 'none',
    });
    const inputs = Object.keys(result.metafile?.inputs ?? {});
    if (typeof opts.entry !== 'string') {
        const outdir = resolve(opts.outdir);
        const metaOut = new Map(Object.entries(result.metafile.outputs).map(([out, meta]) => [resolve(process.cwd(), out), meta]));
        const rel = (abs) => relative(outdir, abs).split('\\').join('/');
        const byInput = new Map(Object.entries(opts.entry).map(([name, file]) => [resolve(file), name]));
        const onDisk = (key) => resolve(process.cwd(), key.replace(/^[^:]+:/, ''));
        const outputs = (result.outputFiles ?? []).map((f) => {
            const meta = metaOut.get(resolve(f.path));
            const entry = meta?.entryPoint ? byInput.get(onDisk(meta.entryPoint)) : undefined;
            return {
                file: rel(resolve(f.path)),
                code: f.text,
                ...(entry ? { entry } : {}),
                imports: (meta?.imports ?? []).map((i) => ({ file: rel(resolve(process.cwd(), i.path)), kind: i.kind })),
            };
        });
        // Every source an entry reaches, as its own single build would list it:
        // the import graph walked from the entry, not the bytes that survived.
        const graph = result.metafile.inputs;
        const entryInputs = {};
        for (const [key] of Object.entries(graph)) {
            const name = byInput.get(onDisk(key));
            if (!name)
                continue;
            const seen = new Set();
            const walk = (k) => {
                if (seen.has(k) || !graph[k])
                    return;
                seen.add(k);
                for (const i of graph[k].imports)
                    if (!i.external)
                        walk(i.path);
            };
            walk(key);
            entryInputs[name] = [...seen].map(onDisk).sort();
        }
        return { code: '', bundled: [...bundled].sort(), warnings, inputs, outputs, entryInputs };
    }
    const code = result.outputFiles?.find((f) => f.path.endsWith('.js'))?.text ?? result.outputFiles?.[0]?.text ?? '';
    // A computed `import(x)` gets past any build: the worker's CSP is what
    // refuses it at run time, and an author should hear that before then.
    if (/\bimport\s*\(/.test(code))
        warnings.push(`${opts.entry}: the module still imports at run time (\`import(…)\`) — a component's ` +
            `UI worker loads nothing but the app's own files, so bundle what it needs`);
    return { code, bundled: [...bundled].sort(), warnings, inputs };
}
/* ── the split front door (core's own components) ───────────────────────── */
/** @internal A split build's shared chunk file name. */
export const COMPONENT_CHUNK_FILE = /^shared-[A-Za-z0-9_-]+\.js$/;
/**
 * Build a set of ONE owner's components together (core's, C7 unit M): each
 * entry one module, what they share in `shared-<hash>.js` chunks the entries
 * import relatively, so the owner's one UI worker loads Svelte's runtime and
 * the helpers once. The same build, guard and loaders as every other
 * component (`package` mode); nothing is written — the caller writes
 * `modules` into `outdir`.
 *
 * Every served module is judged as a host judges it (`componentModuleFindings`)
 * and may reach another only by a static `import`; a finding, a run-time
 * `import(…)` or an output that is neither an entry nor a chunk throws.
 *
 * Never for a plugin or an authored component: their modules stay
 * self-contained, and nothing here is loaded by another owner's worker (R35).
 * @internal
 */
export async function buildComponentSet(opts) {
    const built = await runComponentBuild({
        host: { kind: 'disk', root: opts.root, alias: opts.alias },
        entry: opts.entries,
        outdir: opts.outdir,
        mode: 'package',
        esbuild: opts.esbuild,
        svelte: opts.svelte,
    });
    const outputs = new Map(built.outputs.map((o) => [o.file, o]));
    const modules = {};
    const reach = (file) => {
        const out = outputs.get(file);
        if (!out)
            throw new Error(`component set: no output ${file}`);
        const name = out.entry ?? file;
        if (Object.hasOwn(modules, name))
            return;
        if (!out.entry && !COMPONENT_CHUNK_FILE.test(file))
            throw new Error(`component set: unexpected output ${file}`);
        const { errors } = componentModuleFindings(out.code);
        if (errors.length)
            throw new Error(`component set: ${file} would be refused: ${errors.join('; ')}`);
        if (/\bimport\s*\(/.test(out.code))
            throw new Error(`component set: ${file} imports at run time`);
        modules[name] = out.code;
        for (const i of out.imports) {
            if (i.kind !== 'import-statement')
                throw new Error(`component set: ${file} imports ${i.file} by ${i.kind}`);
            reach(i.file);
        }
    };
    for (const name of Object.keys(opts.entries)) {
        const out = built.outputs.find((o) => o.entry === name);
        if (!out)
            throw new Error(`component set: no module for ${name}`);
        reach(out.file);
    }
    return { modules, inputs: built.entryInputs, bundled: built.bundled, warnings: built.warnings };
}
/** A thrown Svelte `CompileError` as an esbuild message at the authored line. */
function svelteError(e, file, namespace) {
    const err = e;
    const text = String(err?.message ?? e).split('\n')[0];
    return err?.start
        ? { text, location: { file, namespace, line: err.start.line, column: err.start.column, lineText: '' } }
        : { text };
}
/* ── the source hash ────────────────────────────────────────────────────── */
/* ── the fingerprint ────────────────────────────────────────────────────── */
/** `name`'s `package.json` version as Node would find it from `from`, or `none`. */
function versionFrom(name, from) {
    let dir = resolve(from);
    for (;;) {
        for (const candidate of [join(dir, 'node_modules', name, 'package.json'), join(dir, 'package.json')]) {
            if (!existsSync(candidate))
                continue;
            try {
                const pkg = JSON.parse(readFileSync(realpathSync(candidate), 'utf8'));
                if (pkg.name === name)
                    return pkg.version ?? 'none';
            }
            catch {
                /* unreadable: keep looking */
            }
        }
        const up = dirname(dir);
        if (up === dir)
            return 'none';
        dir = up;
    }
}
/**
 * What a compiled component depends on besides its source: the compiler's
 * revision, the bundler, Svelte's compiler, and the runtime packages inlined
 * into every module (Svelte, the SDK, the component client, the controls),
 * as resolved from `resolveFrom`. A host stores it beside each artifact and
 * recompiles wherever it differs.
 * @internal
 */
export function toolchainFingerprint(opts = {}) {
    const from = opts.resolveFrom ?? process.cwd();
    const svelteRuntime = versionFrom('svelte', from);
    const against = componentBuiltAgainst(from);
    return [
        `compiler@${COMPONENT_COMPILER_REVISION}`,
        // The host contract the module assumes (F1) — `builtAgainstOfFingerprint` reads these back.
        `widget-protocol@${against.widgetProtocol}`,
        `host-elements@${against.hostElements}`,
        `esbuild@${opts.esbuild?.version ?? versionFrom('esbuild', from)}`,
        `svelte-compiler@${opts.svelte ? opts.svelte.VERSION : svelteRuntime}`,
        `svelte@${svelteRuntime}`,
        `sdk@${versionFrom('@serene-pub/sdk', from)}`,
        `component-client@${versionFrom('@serene-pub/component-client', from)}`,
        `controls@${versionFrom('@serene-pub/controls', from)}`,
    ].join(' ');
}
/**
 * @internal The packager and the in-app compile record it; read it off their output.
 *
 * What a module built from `resolveFrom` is built against (F1): the widget
 * protocol and host-element vocabulary of the SDK the CLI runs (the one the
 * component client it bundles was released with), and the SDK and
 * component-client versions as resolved from `resolveFrom`, for the reader.
 * The packager writes it on each manifest component entry; the in-app
 * compile returns it (and the fingerprint carries it).
 */
export function componentBuiltAgainst(resolveFrom = process.cwd()) {
    const v = (name) => {
        const found = versionFrom(name, resolveFrom);
        return found === 'none' ? undefined : found;
    };
    return currentBuiltAgainst({ sdk: v('@serene-pub/sdk'), componentClient: v('@serene-pub/component-client') });
}
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const at = (file, text) => ({ file, line: 0, column: 0, text });
/** @internal Compile a component from in-memory source. Never throws for the author's mistakes: they come back in `errors`. */
export async function compileComponentSource(opts) {
    const resolveFrom = resolve(opts.resolveFrom ?? process.cwd());
    const fingerprint = toolchainFingerprint({ esbuild: opts.esbuild, svelte: opts.svelte ?? null, resolveFrom });
    const builtAgainst = componentBuiltAgainst(resolveFrom);
    const failed = (errors, warnings = []) => ({
        code: '',
        hash: '',
        warnings: [...warnings].sort(),
        errors,
        fingerprint,
        builtAgainst,
    });
    const L = Object.fromEntries(Object.entries(COMPONENT_COMPILE_LIMITS).map(([k, v]) => {
        const lower = opts.limits?.[k];
        return [k, typeof lower === 'number' && lower >= 0 ? Math.min(v, lower) : v];
    }));
    const entries = Object.entries(opts.files ?? {});
    const errors = [];
    if (entries.length > L.files)
        errors.push(at('', `${entries.length} files — a component has at most ${L.files}`));
    let total = 0;
    for (const [path, source] of entries) {
        if (typeof source !== 'string') {
            errors.push(at(path, `'${path}' is not text`));
            continue;
        }
        if (!isSafeComponentPath(path))
            errors.push(at(path, `'${path}' is not a component file path — plain relative segments of [A-Za-z0-9._-], no '.' or '..', ending .svelte, .ts or .js`));
        else if (opts.framework === 'vanilla' && SVELTE_FILE.test(path))
            errors.push(at(path, `'${path}' is a Svelte file and this component's framework is vanilla`));
        const size = bytes(source);
        total += size;
        if (size > L.fileBytes)
            errors.push(at(path, `'${path}' is ${size} bytes — a file is at most ${L.fileBytes}`));
    }
    if (total > L.sourceBytes)
        errors.push(at('', `${total} bytes of source — a component is at most ${L.sourceBytes}`));
    if (!Object.prototype.hasOwnProperty.call(opts.files ?? {}, opts.entry))
        errors.push(at(opts.entry, `the entry '${opts.entry}' is not one of the component's files`));
    if (errors.length)
        return failed(errors);
    let built;
    try {
        built = await runComponentBuild({
            host: { kind: 'virtual', files: new Map(entries), resolveFrom },
            entry: opts.entry,
            mode: opts.mode,
            framework: opts.framework,
            esbuild: opts.esbuild,
            svelte: opts.svelte,
        });
    }
    catch (e) {
        const failure = e;
        if (!failure.errors)
            return failed([at('', String(e?.message ?? e))]);
        return failed(failure.errors.map(located));
    }
    const warnings = [...built.warnings];
    if (built.bundled.length)
        warnings.push(`the module bundles ${built.bundled.join(', ')}`);
    const size = bytes(built.code);
    if (size > L.outputBytes)
        return failed([at(opts.entry, `the built module is ${size} bytes — a component is at most ${L.outputBytes}`)], warnings);
    return {
        code: built.code,
        hash: createHash('sha256').update(built.code).digest('hex'),
        warnings: warnings.sort(),
        errors: [],
        fingerprint,
        builtAgainst,
    };
}
/** An esbuild message at the authored file (the virtual namespace stripped). */
function located(m) {
    const loc = m.location;
    if (!loc)
        return at('', m.text);
    const prefix = `${COMPONENT_SOURCE_NAMESPACE}:`;
    const file = loc.file.startsWith(prefix) ? loc.file.slice(prefix.length) : loc.file;
    return { file, line: loc.line, column: loc.column, text: m.text };
}
//# sourceMappingURL=componentCompile.js.map