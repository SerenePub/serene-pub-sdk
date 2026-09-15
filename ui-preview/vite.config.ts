import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { defineConfig } from 'vite'
import { serenePubSurfaces } from './vite/surfaces'

/**
 * The package under preview is passed in by `serene-pub ui` through the
 * environment rather than a config file, because the harness is one installed
 * copy serving whichever package the modder points it at — writing a config
 * into their repo to say "preview me" would be a file they then have to
 * maintain and gitignore.
 */
const pluginDir = process.env.SERENE_PUB_PACKAGE_DIR ?? process.cwd()

/**
 * Where `@serene-pub/controls` actually is. It is raw Svelte source rather
 * than a build, so Vite has to be allowed to *serve* it — and inside the SDK
 * workspace it is hoisted a directory above this app, which is outside the
 * root Vite would otherwise permit. Resolved rather than hardcoded because
 * the answer differs between the workspace and a modder's install.
 */
const require = createRequire(import.meta.url)
let controlsDir: string
try {
	controlsDir = dirname(require.resolve('@serene-pub/controls/package.json'))
} catch {
	// Not optional: the sandbox and every generated form import it statically,
	// so a missing install is a broken harness. Failing here with the reason
	// beats failing later with a module-resolution stack trace.
	throw new Error(
		'@serene-pub/ui-preview requires @serene-pub/controls, which did not resolve. ' +
			'Reinstall the harness (npm i @serene-pub/ui-preview).',
	)
}

export default defineConfig({
	plugins: [
		serenePubSurfaces({
			pluginDir,
			fixtures: process.env.SERENE_PUB_FIXTURES,
			controlsDir,
		}),
		tailwindcss(),
		sveltekit(),
	],
	server: {
		// The package lives outside this app's root; without this Vite refuses
		// to serve a single one of its files.
		fs: { allow: [pluginDir, controlsDir] },
	},
	// One Svelte identity, even when the previewed package carries its own copy.
	resolve: { dedupe: ['svelte'] },
})
