/**
 * Core's `dialogue-box` component (PLAN-visual-novel-layout): the one line
 * being read, with the reading bar under it. `npm run build` compiles it with
 * the CLI's component bundler to `dist/components/dialogue-box.js`, the module
 * the app serves at `/core-ui/dialogue-box`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import DialogueBoxMount from './DialogueBoxMount.svelte'

export default svelteComponent(DialogueBoxMount)
