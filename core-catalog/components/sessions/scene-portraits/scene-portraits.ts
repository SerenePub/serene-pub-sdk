/**
 * Core's `scene-portraits` component (R21): the faces beside the
 * conversation, as the page's UI worker runs it. `npm run build` compiles it
 * with the CLI's component bundler to `dist/components/scene-portraits.js`,
 * the module the app serves at `/core-ui/scene-portraits`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import ScenePortraits from './ScenePortraits.svelte'

export default svelteComponent(ScenePortraits)
