/**
 * Core's `places` component (PLAN-core-widgets W4): where are we, what is
 * around us, where can we go — the session's places as a list or a map
 * (the shared map canvas). `npm run build` compiles it with the CLI's
 * component bundler to `dist/components/places.js`, the module the app
 * serves at `/core-ui/places`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Places from './Places.svelte'

export default svelteComponent(Places)
