/**
 * A clean package with a noisy `examples/` beside it (D-2, G6).
 *
 * The plugin requests nothing. Its example stands a host up so the example
 * can be *run* — and before `--ignore` and the default patterns, `serene-pub
 * check .` answered `core:write · provider:call` for this package, off a fake
 * nobody installs.
 */

import { defineExtension, describeTaskDefinition, handler, ok, S } from '@serene-pub/sdk'

export const PLUGIN_SLUG = 'demo.noisy-examples'

export const wordCount = describeTaskDefinition({
	id: 'demo.noisy-examples:task/word-count@1',
	i18n: { name: { en: 'Word count' } },
	timeoutMs: 500,
	ports: { in: { text: S.text }, out: { main: S.json } },
})

export default defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Word count',
	version: '1.0.0',
	description: 'Counts words and asks for nothing.',
	handlers: [
		handler(wordCount, async (input: { text?: string }) =>
			ok({ main: { words: (input.text ?? '').split(/\s+/).filter(Boolean).length } }),
		),
	],
})
