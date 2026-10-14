/**
 * Core's `actions` component (PLAN-core-widgets W8): the session's actions as
 * buttons — the turn controls, the genre's own, the added ones — as the
 * page's UI worker runs it. `npm run build` compiles it with the CLI's
 * component bundler to `dist/components/actions.js`, the module the app
 * serves at `/core-ui/actions`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Actions from './Actions.svelte'

export default svelteComponent(Actions)
