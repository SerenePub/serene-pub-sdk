/**
 * A widget component: the three most recent speakers, newest first, and a
 * Continue button. It runs in the page's UI worker, reads the messages off
 * `ctx`, and places plain HTML and one `sp-icon` — the page shows what is
 * below, and pressing Continue asks the host to run the session's
 * `advance` action — the composer's Continue, whoever is next.
 */
import type { ComponentExample } from '@serene-pub/cli'

export const componentExample: ComponentExample = {
	slug: 'who-spoke',
	title: 'A widget component',
	summary: 'The three most recent speakers and a Continue button, rendered by the component harness.',
	entry: 'components/who-spoke.ts',
	show: ['components/WhoSpoke.svelte', 'components/who-spoke.ts'],
	context: {
		messages: [
			{ id: 1, role: 'user', content: 'Where are we?', speakerLabel: 'Tobin' },
			{ id: 2, role: 'assistant', content: 'The old mill.', speakerLabel: 'Mira' },
			{ id: 3, role: 'assistant', content: 'It creaks.', speakerLabel: 'Narrator' },
			{ id: 4, role: 'user', content: 'Inside, then.', speakerLabel: 'Tobin' },
		],
	},
	act: (view) => view.click('button'),
}
