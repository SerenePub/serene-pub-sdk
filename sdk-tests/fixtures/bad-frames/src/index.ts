/**
 * A package whose frame documents mount and then do nothing (D-2).
 *
 * Every mistake here is **silent** at runtime: the CSP refuses the inline
 * script and the off-package stylesheet without telling the frame, the
 * sandbox swallows the submit without firing an event, and the surface sits
 * there looking like a layout bug. Both showcase plugins hit two of these in
 * the harness, hours apart, and neither could be debugged from inside the
 * frame.
 *
 * `ui/ok.html` is here for the other half of the test: a document that does
 * all the same things the legal way must produce no finding at all.
 */

import { component, defineExtension, widget } from '@serene-pub/sdk'

export const PLUGIN_SLUG = 'demo.bad-frames'

export default defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Bad frames',
	version: '1.0.0',
	description: 'Four ways to ship a surface that mounts and does nothing.',
	surfaces: {
		'session-view': { entry: 'ui/view.html', title: 'Board' },
		page: { entry: 'ui/page.html', title: 'Records' },
	},
	// The board component places `ui/panel.html` and `ui/ok.html` as `sp-frame`s.
	components: [component({ slug: 'board', label: 'Board', entry: 'components/board.ts', framework: 'vanilla' })],
	widgets: [widget({ id: 'board', title: 'Board', component: 'board' })],
})
