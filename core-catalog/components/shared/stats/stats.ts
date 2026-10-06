/**
 * Core's `stats` component (R21): one card per cast member, one row per stat
 * they carry, as the page's UI worker runs it. `npm run build` compiles it
 * with the CLI's component bundler to `dist/components/stats.js`, the module
 * the app serves at `/core-ui/stats`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Stats from './Stats.svelte'

export default svelteComponent(Stats)
