/**
 * What `sucrase` resolves to **in the browser build only** (`build.mjs` aliases
 * it here).
 *
 * `runner.ts` keeps a default transpiler that imports the real package, because
 * the suite runs that file under node and has to be able to transpile without a
 * DOM. In the browser that default is never reached — `main.ts` installs the
 * classic-script loader before anything can run — and bundling the real sucrase
 * into the entry would undo the whole point of splitting it out.
 *
 * So the browser gets this instead: the same shape, and a sentence rather than
 * a mystery if the wiring in `main.ts` is ever removed.
 */
export function transform(): never {
	throw new Error(
		'sucrase is not in this bundle. In the browser it is fetched as a classic script ' +
			'on first Run (`loadBundle("sucrase")`), which `main.ts` wires up with ' +
			'`useTranspiler`. Something removed that wiring.',
	)
}
