/**
 * Launching the harness. Plain JS on purpose: `serene-pub ui` imports this
 * from Node directly, and a package that needed compiling before it could be
 * started would need a build step in a package whose whole point is not having
 * one.
 *
 * Vite is created programmatically rather than shelled out to, so the CLI owns
 * the process: one Ctrl-C, one exit code, and no orphaned dev server left
 * holding a port after the terminal goes away.
 */
import { createServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * @param {{ packageDir: string, port?: number, host?: boolean|string, open?: boolean, fixtures?: string }} opts
 * @returns {Promise<import('vite').ViteDevServer>}
 */
export async function startSurfaceHarness(opts) {
	// The config reads these: the harness is one installed copy pointed at
	// whichever package the modder is working on, so the target cannot live in
	// a config file committed to their repo.
	process.env.SERENE_PUB_PACKAGE_DIR = resolve(opts.packageDir)
	if (opts.fixtures) process.env.SERENE_PUB_FIXTURES = resolve(opts.fixtures)

	// SvelteKit pins Vite's root to `process.cwd()` and says so out loud —
	// passing `root` is not enough. Both paths above are already absolute, so
	// moving the process here costs nothing, and it is what makes the harness
	// runnable from inside the package being previewed.
	process.chdir(here)

	const server = await createServer({
		root: here,
		configFile: resolve(here, 'vite.config.ts'),
		server: {
			port: opts.port,
			host: opts.host,
			open: opts.open,
			// Fail rather than wander to another port: a harness that silently
			// moved would leave a modder reloading a stale tab.
			strictPort: opts.port !== undefined,
		},
	})
	await server.listen()
	return server
}
