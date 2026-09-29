/**
 * The component bundler (§3.5, C3): one declared component's source → one
 * self-contained ES module the page's UI worker imports.
 *
 * - `.svelte` files compile with the package's own Svelte (`svelte/compiler`,
 *   an optional peer: only a package with a Svelte component needs it).
 *   A component's `<style>` is dropped, and said: styles are not in the
 *   host-element vocabulary — a component styles itself with classes, and a
 *   skin does the rest.
 * - Imports are held to `COMPONENT_IMPORTS` (`componentImportFinding`,
 *   `bundled: true`): absolute paths and URLs are refused as written, and
 *   every import is judged again by the file it RESOLVES to — a tsconfig path,
 *   a package `imports` alias or a symlink can name one thing and reach
 *   another — so nothing lands in `@remote-dom` (the host's renderer). Any
 *   other package the author's own files import is BUNDLED and recorded, so
 *   an admin sees what third-party code a component carries.
 * - One Svelte: `svelte` always resolves from the package root, so a
 *   component client linked from elsewhere (`file:`) mounts with the same
 *   runtime the components were compiled against.
 *
 * esbuild is imported lazily by the caller, as the sandbox bundler is.
 */
import * as esbuild from 'esbuild'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { ComponentBuiltAgainst } from '@serene-pub/sdk'
import { componentBuiltAgainst, runComponentBuild } from './componentCompile.js'

/** @experimental */
export interface ComponentBundle {
	/** Third-party packages inlined into the module, by name. */
	bundled: string[]
	/** Said, not fatal: a `<style>` dropped, and the like. */
	warnings: string[]
	/** Every source file the module was built from, absolute — what a host watches to rebuild it. */
	inputs: string[]
	/** The host contract the module was built against (F1), as the packager records it on the manifest entry. */
	builtAgainst: ComponentBuiltAgainst
}

/**
 * The disk front door of the one component compiler (`componentCompile.ts`):
 * the package's files are read where they sit, built in `package` mode, and
 * the module written to `outfile`. Throws esbuild's failure as the build did.
 * @experimental
 */
export async function bundleComponent(opts: {
	/** The component's source, absolute. */
	entry: string
	/** Where the built module is written. */
	outfile: string
	/** The package the component belongs to; its nearest `package.json` above `entry` when omitted. */
	root?: string
	/**
	 * Path aliases the source is written against (`{ $lib: '/abs/src/lib' }`),
	 * as its own build resolves them: `$lib/x` → `<target>/x`. Core's widgets
	 * are built this way; a plugin's are relative.
	 */
	alias?: Record<string, string>
}): Promise<ComponentBundle> {
	const root = opts.root ?? (await packageRoot(opts.entry))
	const built = await runComponentBuild({
		host: { kind: 'disk', root, alias: opts.alias },
		entry: opts.entry,
		outfile: opts.outfile,
		mode: 'package',
		esbuild,
	})
	await mkdir(dirname(opts.outfile), { recursive: true })
	await writeFile(opts.outfile, built.code)
	const inputs = built.inputs.map((f) => resolve(process.cwd(), f.replace(/^[^:]+:/, '')))
	return { bundled: built.bundled, warnings: built.warnings, inputs, builtAgainst: componentBuiltAgainst(root) }
}

/** The directory of the nearest `package.json` above `file`. */
export async function packageRoot(file: string): Promise<string> {
	let dir = dirname(file)
	for (;;) {
		const found = await access(join(dir, 'package.json')).then(
			() => true,
			() => false,
		)
		if (found) return dir
		const up = dirname(dir)
		if (up === dir) return dirname(file)
		dir = up
	}
}
