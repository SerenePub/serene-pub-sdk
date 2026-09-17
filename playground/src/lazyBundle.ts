/**
 * How the two heavy pieces arrive: a classic `<script src>`, injected on first
 * use.
 *
 * Not `import()`, and this is the one constraint the whole build is shaped
 * around. A module script — static or dynamic — is **always** fetched in CORS
 * mode, and this document runs in a `sandbox="allow-scripts"` frame, which is
 * an opaque origin sending `Origin: null`. No static host answers that with
 * `Access-Control-Allow-Origin`, so every module fetch fails and the frame
 * renders as a blank box with nothing but a console error. A classic script is
 * not CORS-fetched. Same rule, same reason, as `ui-preview/README.md`'s "Two
 * things frames cannot do".
 *
 * Which is why each lazy bundle is a separate IIFE that hangs its API on one
 * global rather than exporting anything: a classic script has no exports, so
 * the global IS the interface. One namespace, one key per bundle, documented in
 * `README.md` — `window.__serenePubPlayground`.
 *
 * `src` is deliberately relative (`./assets/…`), like every other URL here: the
 * document is served under `/docs/playground/` on more than one host, and a
 * root-relative path is wrong on at least one of them.
 */

/** Which bundles exist, and what each one puts on the namespace. */
export interface PlaygroundBundles {
	sucrase: { transpile(source: string): string }
	graph: { renderDocumentGraph(doc: unknown): Promise<string> }
}

const loading = new Map<keyof PlaygroundBundles, Promise<unknown>>()

function inject(file: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script')
		script.src = `./assets/${file}`
		script.async = true
		script.addEventListener('load', () => resolve(), { once: true })
		script.addEventListener(
			'error',
			() =>
				reject(
					new Error(
						`could not load ./assets/${file}. The playground needs it to do this, ` +
							`and it is served alongside this page — so this is a broken or ` +
							`partial deployment rather than anything you typed.`,
					),
				),
			{ once: true },
		)
		document.head.append(script)
	})
}

/**
 * The named bundle's API, fetching it the first time and never again.
 *
 * The in-flight promise is cached, not just the result: opening the Graph tab
 * twice in the second it takes elkjs to arrive must not inject the script
 * twice. A failure is not cached — the load is dropped from the map so a reader
 * who lost their connection can press the button again.
 */
export async function loadBundle<K extends keyof PlaygroundBundles>(
	name: K,
): Promise<PlaygroundBundles[K]> {
	let pending = loading.get(name) as Promise<PlaygroundBundles[K]> | undefined
	if (!pending) {
		pending = inject(__PLAYGROUND_ASSETS__[name]).then(() => {
			const api = window.__serenePubPlayground?.[name]
			if (!api)
				throw new Error(
					`./assets/${__PLAYGROUND_ASSETS__[name]} loaded but registered no '${name}' ` +
						`API. The bundle and this page are from different builds.`,
				)
			return api
		})
		loading.set(name, pending)
	}
	try {
		return await pending
	} catch (e) {
		loading.delete(name)
		throw e
	}
}
