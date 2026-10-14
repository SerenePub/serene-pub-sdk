/**
 * Core's `attendance` component (PLAN-core-widgets W10): Who's here — the
 * session's people, who has it open now, as whom each writes and who is
 * typing, and who is away, as the page's UI worker runs it. `npm run build`
 * compiles it with the CLI's component bundler to
 * `dist/components/attendance.js`, the module the app serves at
 * `/core-ui/attendance`.
 */
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Attendance from './Attendance.svelte'

export default svelteComponent(Attendance)
