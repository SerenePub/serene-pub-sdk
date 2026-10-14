/**
 * The three worked widget examples (plans/PLAN-widget-api-dx D7), declared as a
 * plugin declares them. `guides/widget-examples.md` shows each declaration;
 * `widgetExamples.test.ts` mounts each component under the declaration's own
 * `reads`, `scopes` and `channels`, so the page and the test agree.
 */
import { component, defineExtension, widget } from '@serene-pub/sdk'

// Who's here — the cheapest widget: two base sections, no scopes.
export const whoIsHere = widget({
	id: 'who-is-here',
	title: "Who's here",
	component: 'who-is-here',
	reads: ['attendance', 'viewer'],
})

// Log search — one channel's lines, filtered, paged further back on a press.
export const logSearch = widget({
	id: 'log-search',
	title: 'Log search',
	component: 'log-search',
	channels: ['main'],
	reads: ['messages'],
})

// Mood dial — the session's stats, read and nudged; one action pressed.
export const moodDial = widget({
	id: 'mood-dial',
	title: 'Mood dial',
	component: 'mood-dial',
	reads: ['actions', 'settings'],
	scopes: ['session:state', 'session:state:write', 'persona'],
	settings: { step: { type: 'integer', label: 'Step', default: 1 } },
})

export default defineExtension({
	slug: 'acme.widget-examples',
	name: 'Widget examples',
	version: '1.0.0',
	components: [
		component({ slug: 'who-is-here', label: "Who's here", entry: 'components/who-is-here.ts', framework: 'svelte' }),
		component({ slug: 'log-search', label: 'Log search', entry: 'components/log-search.ts', framework: 'svelte' }),
		component({ slug: 'mood-dial', label: 'Mood dial', entry: 'components/mood-dial.ts', framework: 'svelte' }),
	],
	widgets: [whoIsHere, logSearch, moodDial],
})
