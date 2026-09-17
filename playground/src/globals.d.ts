import type { PlaygroundBundles } from './lazyBundle.js'

declare global {
	/**
	 * The manifest, frozen into the entry bundle at build time (`build.mjs`).
	 *
	 * The lazy bundles are content-hashed, so the entry cannot spell their file
	 * names — it is handed them. Defined rather than fetched, because fetching a
	 * manifest would be a network call this document does not make.
	 */
	const __PLAYGROUND_ASSETS__: Record<keyof PlaygroundBundles, string>

	interface Window {
		/**
		 * Where a lazily-loaded classic script hands its API over.
		 *
		 * One global, one key per bundle. A classic `<script src>` has no
		 * exports — that is the trade for being loadable on an opaque origin —
		 * so a namespace on `window` is the interface, and keeping it to a
		 * single documented name keeps it from becoming a habit.
		 */
		__serenePubPlayground?: Partial<PlaygroundBundles>
	}
}

export {}
