/**
 * Core's `album` component (PLAN-core-widgets W2): every picture on the
 * session's lines, newest first, as the page's UI worker runs it. `npm run
 * build` compiles it with the CLI's component bundler to
 * `dist/components/album.js`, the module the app serves at `/core-ui/album`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Album from './Album.svelte'

export default svelteComponent(Album)
