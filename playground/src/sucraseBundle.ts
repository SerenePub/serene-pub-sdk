/**
 * The sucrase bundle: its own IIFE, fetched the first time somebody presses Run.
 *
 * It is the only *compiler* the playground carries — everything else in the
 * initial bundle is the SDK a reader came to look at — so a page nobody runs
 * never pays for it.
 *
 * The transform pair is chosen here rather than at the call site so this bundle
 * is the whole of "how source becomes something runnable": `typescript` erases
 * types (including the `import type { Example }` every executed example opens
 * with), and `imports` rewrites ESM to CommonJS, which is what lets the runner
 * answer `require` from a fixed map instead of letting the browser resolve
 * anything.
 */
import { transform } from 'sucrase'

window.__serenePubPlayground = {
	...window.__serenePubPlayground,
	sucrase: {
		transpile: (source: string) =>
			transform(source, { transforms: ['typescript', 'imports'] }).code,
	},
}
