/**
 * Core's `turn-order` component (PLAN-core-widgets W1): whose turn it is, who
 * follows, and Continue and Pick who speaks, as the page's UI worker runs it.
 * `npm run build` compiles it with the CLI's component bundler to
 * `dist/components/turn-order.js`, the module the app serves at
 * `/core-ui/turn-order`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import TurnOrder from './TurnOrder.svelte'

export default svelteComponent(TurnOrder)
