/**
 * Core's `annex` component (PLAN-core-widgets W9): one declared annex key, by
 * its label, in the shape it was declared in, as the page's UI worker runs
 * it. `npm run build` compiles it with the CLI's component bundler to
 * `dist/components/annex.js`, the module the app serves at `/core-ui/annex`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Annex from './Annex.svelte'

export default svelteComponent(Annex)
