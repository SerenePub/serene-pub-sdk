/**
 * Two handlers, and a test beside them that calls a local `handler`.
 *
 * `handler` is an ordinary English word. A plugin's own test looping
 * `for (const handler of […]) await handler(input, ctx)` was counted as three
 * more registrations than the extension exposes, and `serene-pub build`
 * refused the package for registering hooks conditionally — a mistake it had
 * not made, in a file that is not the plugin.
 */

import { defineExtension, describeTaskDefinition, handler, ok, S } from '@serene-pub/sdk'

export const PLUGIN_SLUG = 'demo.local-handler'

export const shout = describeTaskDefinition({
	id: 'demo.local-handler:task/shout@1',
	i18n: { name: { en: 'Shout' } },
	timeoutMs: 500,
	ports: { in: { text: S.text }, out: { main: S.text } },
})

export const whisper = describeTaskDefinition({
	id: 'demo.local-handler:task/whisper@1',
	i18n: { name: { en: 'Whisper' } },
	timeoutMs: 500,
	ports: { in: { text: S.text }, out: { main: S.text } },
})

export default defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Volume',
	version: '1.0.0',
	description: 'Says it louder, or quieter.',
	handlers: [
		handler(shout, async (input: { text?: string }) =>
			ok({ main: (input.text ?? '').toUpperCase() }),
		),
		handler(whisper, async (input: { text?: string }) =>
			ok({ main: (input.text ?? '').toLowerCase() }),
		),
	],
})
