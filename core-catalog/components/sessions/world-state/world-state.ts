/**
 * Core's `world-state` component (R21): the session's world stats, as the
 * page's UI worker runs it. `npm run build` compiles it with the CLI's
 * component bundler to `dist/components/world-state.js`, the module the app
 * serves at `/core-ui/world-state`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import WorldState from './WorldState.svelte'

export default svelteComponent(WorldState)
