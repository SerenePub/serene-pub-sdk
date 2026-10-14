/**
 * Core's `chronicle` component (PLAN-core-widgets W3): the session's story
 * clock, the history entry it reads now with this session's scenes under
 * it, and the entries before. `npm run build` compiles it with the CLI's
 * component bundler to `dist/components/chronicle.js`, the module the app
 * serves at `/core-ui/chronicle`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Chronicle from './Chronicle.svelte'

export default svelteComponent(Chronicle)
