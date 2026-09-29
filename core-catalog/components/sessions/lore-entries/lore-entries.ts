/**
 * Core's `lore-entries` component (R21, R58): the session's lorebook entry
 * by entry, with what this session's rankings made of each, and the two
 * marks — **Off** and **Pin**. `npm run build` compiles it with the CLI's
 * component bundler to `dist/components/lore-entries.js`, the module the app
 * serves at `/core-ui/lore-entries`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import LoreEntries from './LoreEntries.svelte'

export default svelteComponent(LoreEntries)
