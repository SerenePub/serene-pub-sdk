/**
 * 🚧 Core's `session-runs` component (lay-R, owner 2026-11-06): *Runs* — an
 * administrator's list of the session's pipeline runs, as the page's UI
 * worker runs it. `npm run build` compiles it with the CLI's component
 * bundler to `dist/components/session-runs.js`, the module the app serves
 * at `/core-ui/session-runs`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import SessionRuns from './SessionRuns.svelte'

export default svelteComponent(SessionRuns)
