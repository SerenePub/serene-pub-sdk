/**
 * 🚧 Core's `routine-log` component (PLAN-layering A7, R23; lane 7,
 * 2026-10-21): *While you were away* — what the session's routines ran,
 * wrote and skipped, as the page's UI worker runs it. `npm run build`
 * compiles it with the CLI's component bundler to
 * `dist/components/routine-log.js`, the module the app serves at
 * `/core-ui/routine-log`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import RoutineLog from './RoutineLog.svelte'

export default svelteComponent(RoutineLog)
