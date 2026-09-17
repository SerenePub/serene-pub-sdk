/**
 * The playground's build: three classic IIFE bundles, content-hashed, plus the
 * one page that loads them.
 *
 * esbuild rather than Vite, and IIFE rather than ESM, for one reason that
 * decides everything else here. This document is embedded as
 * `<iframe sandbox="allow-scripts">`, which is an **opaque origin**. A
 * `<script type="module">` — and every `import()` inside one — is always
 * fetched in CORS mode, so the frame asks for its own `assets/*.js` with
 * `Origin: null`, and no static host (Cloudflare, Netlify, Pages, S3, nginx,
 * sirv) answers that with `Access-Control-Allow-Origin`. The frame renders as a
 * blank box with a console error and no other symptom. A classic script is not
 * CORS-fetched. This is the same rule `ui-preview/README.md` already states for
 * frame documents, applied here.
 *
 * A classic bundle cannot code-split, so the split is done by hand: three
 * entries, each an IIFE, the two optional ones hanging their API on
 * `window.__serenePubPlayground` and fetched by injecting a `<script src>` on
 * first use (`src/lazyBundle.ts`). The boundaries are the ones that matter —
 * the compiler is not downloaded until somebody runs something, and elkjs is
 * not downloaded until somebody looks at a graph.
 *
 * Usage: `node build.mjs` · `node build.mjs --watch [--serve[=PORT]]`
 */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'

import * as esbuild from 'esbuild'

const here = fileURLToPath(new URL('.', import.meta.url))
const src = join(here, 'src')
const dist = join(here, 'dist')
const assets = join(dist, 'assets')

/**
 * The fixture host the examples import.
 *
 * It lives in `sdk-tests` because it is the suite's, and that is the point: the
 * hooks a reader's run answers with are the hooks the goldens were recorded
 * against, not a second set that drifts.
 *
 * `runner.ts` imports it as `../../sdk-tests/helpers.js` — the path the examples
 * themselves use — so the same specifier means the same file whether esbuild or
 * node resolves it. esbuild's `alias` option takes package names only, so the
 * `.js` → `.ts` step is a resolver rather than a mapping.
 */
const fixtures = resolve(here, '../sdk-tests/helpers.ts')

const fixtureHost = {
	name: 'fixture-host',
	setup(build) {
		build.onResolve({ filter: /(^|\/)sdk-tests\/helpers\.js$/ }, () => ({ path: fixtures }))
	},
}

/** Shared by all three bundles. `iife` is the whole point; see the note above. */
const common = {
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: ['es2022'],
	minify: true,
	sourcemap: false,
	legalComments: 'none',
	logLevel: 'warning',
	// The workspace tsconfig maps packages to their SOURCE for editor
	// navigation. The bundle must be built from the same `dist` a consumer
	// installs, so those mappings are deliberately not applied here.
	tsconfigRaw: { compilerOptions: { target: 'es2022', useDefineForClassFields: true } },
	plugins: [fixtureHost],
}

const hashOf = (bytes) => createHash('sha256').update(bytes).digest('base64url').slice(0, 8)

/** Build one entry to `assets/<name>.js`, then rename it to carry its hash. */
async function bundle(name, entry, extra = {}) {
	await esbuild.build({
		...common,
		...extra,
		entryPoints: { [name]: entry },
		outdir: assets,
		entryNames: '[name]',
	})
	const out = {}
	for (const file of await readdir(assets)) {
		if (file !== `${name}.js` && file !== `${name}.css`) continue
		const ext = extname(file)
		const bytes = await readFile(join(assets, file))
		// `styles` rather than `entry.css`: the stylesheet is the page's, and
		// naming it after whichever entry happened to import it would be an
		// implementation detail in a URL.
		const stem = ext === '.css' ? 'styles' : name
		const hashed = `${stem}-${hashOf(bytes)}${ext}`
		await rename(join(assets, file), join(assets, hashed))
		out[ext] = { file: hashed, bytes: bytes.length }
	}
	return out
}

async function build() {
	const started = Date.now()
	await rm(dist, { recursive: true, force: true })
	await mkdir(assets, { recursive: true })

	// The lazy pair first: the entry has to be handed their hashed names, and
	// it cannot know them until they exist.
	const sucrase = await bundle('sucrase', join(src, 'sucraseBundle.ts'))
	const graph = await bundle('graph', join(src, 'graphBundle.ts'))

	const manifest = { sucrase: sucrase['.js'].file, graph: graph['.js'].file }

	const entry = await bundle('entry', join(src, 'main.ts'), {
		define: { __PLAYGROUND_ASSETS__: JSON.stringify(manifest) },
		// Never in the entry: it is fetched as a classic script on first Run.
		// `src/sucraseAbsent.ts` explains what happens if this is removed, and
		// says so out loud rather than silently inlining 200KB.
		alias: { sucrase: join(src, 'sucraseAbsent.ts') },
	})

	const template = await readFile(join(here, 'index.template.html'), 'utf8')
	const html = template
		.replace('{{styles}}', entry['.css'].file)
		.replace('{{entry}}', entry['.js'].file)
	if (html.includes('{{')) throw new Error('index.template.html has an unfilled placeholder')
	await writeFile(join(dist, 'index.html'), html)

	const rows = [
		['entry (CodeMirror, SDK, UI)', entry['.js']],
		['styles', entry['.css']],
		['sucrase (first Run)', sucrase['.js']],
		['graph: elkjs + renderer (first Graph tab)', graph['.js']],
	]
	const total = rows.reduce((n, [, r]) => n + r.bytes, 0)
	for (const [label, r] of rows)
		console.log(`  ${label.padEnd(42)} ${String(r.bytes).padStart(9)}  ${r.file}`)
	console.log(`  ${'total'.padEnd(42)} ${String(total).padStart(9)}`)
	console.log(`playground built in ${Date.now() - started}ms`)
}

// ── dev ─────────────────────────────────────────────────────────────────────

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
}

/**
 * The dev server sets **no** CORS header, on purpose.
 *
 * Every static host this ships to is a plain file server, and the one failure
 * this build exists to prevent only appears without that header. A dev server
 * that was more permissive than production would hide it.
 */
function serve(port) {
	createServer(async (req, res) => {
		const path = (req.url ?? '/').split('?')[0]
		const file = join(dist, path === '/' ? 'index.html' : path.replace(/^\/+/, ''))
		try {
			const body = await readFile(file)
			res.writeHead(200, {
				'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
			})
			res.end(body)
		} catch {
			res.writeHead(404).end('not found')
		}
	}).listen(port, () => console.log(`playground on http://127.0.0.1:${port}`))
}

const args = process.argv.slice(2)
await build()

if (args.includes('--watch')) {
	let queued = null
	watch(src, { recursive: true }, () => {
		clearTimeout(queued)
		queued = setTimeout(() => build().catch((e) => console.error(e.message)), 80)
	})
	const serveArg = args.find((a) => a.startsWith('--serve'))
	if (serveArg) serve(Number(serveArg.split('=')[1] ?? 5180))
	console.log('watching src/ …')
}
