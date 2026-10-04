/**
 * Core's `authors-note` component (2026-10-02, AN1): the session's author's
 * note — its text, how far back it goes, how often it repeats — saved
 * explicitly, and what the newest reply did with it. `npm run build`
 * compiles it with the CLI's component bundler to
 * `dist/components/authors-note.js`, the module the app serves at
 * `/core-ui/authors-note`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import AuthorsNote from './AuthorsNote.svelte'

export default svelteComponent(AuthorsNote)
