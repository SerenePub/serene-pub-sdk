/**
 * Core's `composer` component (owner R8 2026-11-05): the field you write
 * into, split from the log. `npm run build` compiles it with the CLI's
 * component bundler to `dist/components/composer.js`, the module the app
 * serves at `/core-ui/composer`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Composer from './Composer.svelte'

export default svelteComponent(Composer)
