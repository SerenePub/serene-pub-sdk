/**
 * Core's `messages` component (C7): the conversation — the log, the field
 * you write into, and the strips beside it — as the page's UI worker runs
 * it. `npm run build` compiles it with the CLI's component bundler to
 * `dist/components/messages.js`, the module the app serves at
 * `/core-ui/messages`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Messages from './Messages.svelte'

export default svelteComponent(Messages)
