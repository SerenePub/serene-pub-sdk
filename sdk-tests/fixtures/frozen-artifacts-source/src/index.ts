/**
 * The SOURCE of the frozen old-artifact fixtures (F1): three small components
 * built once with the toolchain of their day and committed, built, under
 * `../frozen-artifacts/<date>/` — see `sdk-tests/frozenArtifacts.test.ts`.
 *
 * Kept so a reader can see what the artifacts were built from, and so the
 * packager's own test builds it fresh (`builtAgainst` on every entry). It is
 * NEVER the thing the frozen test mounts: that test mounts the committed
 * bytes, because the point is a component built long ago against today's
 * host. Editing this file does not change the frozen artifacts, and must not.
 */
import { component, defineExtension, widget } from '@serene-pub/sdk'

export default defineExtension({
	slug: 'frozen.fixtures',
	name: 'Frozen fixtures',
	version: '1.0.0',
	components: [
		component({ slug: 'ledger', label: 'Ledger', framework: 'svelte', entry: 'components/ledger.ts' }),
		component({ slug: 'controls', label: 'Controls', framework: 'svelte', entry: 'components/controls.ts' }),
		component({ slug: 'counter', label: 'Counter', framework: 'vanilla', entry: 'components/counter.ts' }),
	],
	widgets: [
		widget({ id: 'ledger', title: 'Ledger', component: 'ledger' }),
		widget({ id: 'controls', title: 'Controls', component: 'controls' }),
		widget({ id: 'counter', title: 'Counter', component: 'counter' }),
	],
})
