/**
 * ⏳ Core's `world-state` component (R21): Stats in World State's settings
 * since W7 (2026-10-11; `WorldState.svelte`). `npm run build` compiles it
 * with the CLI's component bundler to `dist/components/world-state.js`, the
 * module the app serves at `/core-ui/world-state`. REMOVE in 0.7.0.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import WorldState from './WorldState.svelte'

export default svelteComponent(WorldState)
