import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * No adapter on purpose. This harness only ever runs as a dev server on the
 * modder's own machine — there is nothing to deploy, and an adapter would be
 * a dependency bought for a `build` nobody runs.
 */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// The harness renders plugin UI, and plugin UI is client-only by
		// contract (10 §9) — SSRing a surface would need per-framework SSR and
		// would be a fidelity lie besides.
		alias: {},
	},
}
