/**
 * Core's `backdrop` component (DESIGN-image-generation §6.4): the session's
 * backdrop, as the page's UI worker runs it. `npm run build` compiles it with
 * the CLI's component bundler to `dist/components/backdrop.js`, the module
 * the app serves at `/core-ui/backdrop`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Backdrop from './Backdrop.svelte'

export default svelteComponent(Backdrop)
