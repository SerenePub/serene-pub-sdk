/**
 * The SDK's reference component mount (C30): the harness, over a built
 * module written into a scratch package beside the suite's node_modules.
 */
import { after } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as esbuild from 'esbuild'
import type { ComponentView } from '@serene-pub/conformance'
import type { CoreComponentSource } from '@serene-pub/core-catalog'
import { compileComponentSource } from '../cli/src/componentCompile.js'
import { mountComponent } from './harnessGuard.js'

const dirs: string[] = []
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

export async function mountCode(
	code: string,
	sections: Record<string, unknown>,
	opts: { grants?: string[]; reads?: string[]; timeoutMs?: number } = {},
): Promise<ComponentView> {
	const base = resolve(import.meta.dirname, '..', 'node_modules', '.cache')
	await mkdir(base, { recursive: true })
	const dir = await mkdtemp(join(base, 'sp-c30-'))
	dirs.push(dir)
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'c30-fixture', type: 'module' }))
	await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
	await writeFile(join(dir, 'component.mjs'), code)
	return mountComponent({
		root: dir,
		entry: 'component.mjs',
		context: sections as never,
		...(opts.grants ? { grants: opts.grants as never } : {}),
		...(opts.reads ? { reads: opts.reads as never } : {}),
		...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
	})
}

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

/**
 * Which build of core's components the core drivers mount (C6 P1): the
 * shipped one, or — `SP_CORE_COMPONENT_BUILD=in-app`, set by
 * `coreComponentSources.test.ts` before it loads the drivers — the module
 * the in-app compiler builds from `dist/components/<slug>.source.json`, the
 * way a clone of it is built before anyone edits it.
 */
export const coreComponentBuild = (): 'shipped' | 'in-app' =>
	process.env.SP_CORE_COMPONENT_BUILD === 'in-app' ? 'in-app' : 'shipped'

/** A core component's source.json, as the build wrote it. */
export async function coreComponentSource(slug: string): Promise<CoreComponentSource> {
	return JSON.parse(await readFile(join(CORE_CATALOG, 'dist', 'components', `${slug}.source.json`), 'utf8'))
}

/** `slug`'s source.json compiled in-app mode — the whole compile result. */
export async function compileCoreSource(slug: string) {
	const doc = await coreComponentSource(slug)
	return compileComponentSource({
		files: doc.files,
		entry: doc.entry,
		framework: doc.framework,
		mode: 'in-app',
		esbuild,
		resolveFrom: CORE_CATALOG,
	})
}

const inApp = new Map<string, Promise<{ root: string; entry: string }>>()

/**
 * Where a core driver mounts `slug` from: `shipped` (its own `root`/`entry`)
 * as it stands, or the in-app compile of the slug's source.json written
 * into a scratch package beside the suite's node_modules.
 */
export function coreComponentEntry(slug: string, shipped: { root: string; entry: string }): Promise<{ root: string; entry: string }> {
	if (coreComponentBuild() === 'shipped') return Promise.resolve(shipped)
	let at = inApp.get(slug)
	if (!at) {
		at = (async () => {
			const built = await compileCoreSource(slug)
			if (built.errors.length) throw new Error(`${slug}.source.json does not compile in-app: ${JSON.stringify(built.errors)}`)
			const base = resolve(import.meta.dirname, '..', 'node_modules', '.cache')
			await mkdir(base, { recursive: true })
			const dir = await mkdtemp(join(base, 'sp-c6-inapp-'))
			dirs.push(dir)
			await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'c6-inapp-fixture', type: 'module' }))
			await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
			await writeFile(join(dir, `${slug}.mjs`), built.code)
			return { root: dir, entry: `${slug}.mjs` }
		})()
		inApp.set(slug, at)
	}
	return at
}
