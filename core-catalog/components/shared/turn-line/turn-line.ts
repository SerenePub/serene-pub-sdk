/**
 * Core's `turn-line` component (owner R8 2026-11-05): what the last run did
 * and who is next, split from the log. `npm run build` compiles it with the
 * CLI's component bundler to `dist/components/turn-line.js`, the module the
 * app serves at `/core-ui/turn-line`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import TurnLineMount from './TurnLineMount.svelte'

export default svelteComponent(TurnLineMount)
