/**
 * A package that is BOTH halves at once — the acceptance fixture for D-1.
 *
 * A genre, a frame panel, a preset, two configs, a prompt, two pipelines, one
 * node definition with the handler that implements it, and a storage grant,
 * from one `defineExtension` and one default export. Before D-1 this package
 * could not exist: the genre and the surface were sayable only through
 * `announce()`, whose build emits no handlers and no permissions, and the
 * handler was sayable only through `defineExtension`, whose build emitted no
 * genre. An author had to export both and watch the build pick one.
 *
 * Kept as a real package under `fixtures/` rather than written into a temp
 * directory at test time because `serene-pub build` imports the entry module,
 * and a module outside this workspace resolves `@serene-pub/sdk` to the built
 * dist rather than the sources under test — two SDK instances, two definition
 * registries, and a fixture that fails for a reason that has nothing to do with
 * what it is testing.
 */

import {
	config,
	defineExtension,
	describeTaskDefinition,
	genre,
	handler,
	ok,
	pin,
	S,
	sessionEvents,
	spec,
	use,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

export const PLUGIN_SLUG = 'demo.unified'

/* ── the genre ──────────────────────────────────────────────────────────── */

export const TALLY_PANEL_ID = 'tally'

export const tallyGenre = genre(`${PLUGIN_SLUG}:genre/tally`, {
	name: { en: 'Tally' },
	family: 'game',
	description: { en: 'Somebody is counting.' },
	events: {
		[sessionEvents.messageRespond]: { required: true },
	},
})

/* ── the node definition, and the handler that implements it ────────────── */

export const tallyDefinition = pin(
	describeTaskDefinition({
		id: `${PLUGIN_SLUG}:task/tally@1`,
		i18n: { name: { en: 'Tally' } },
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.json } },
	}),
)

export const tallyHandler = async (input: { text?: string }) =>
	ok({ main: { words: (input.text ?? '').split(/\s+/).filter(Boolean).length } })

/* ── the pipelines ──────────────────────────────────────────────────────── */

export const CREATE_SPEC_ID = `${PLUGIN_SLUG}:spec/create-session`
export const RESPOND_SPEC_ID = `${PLUGIN_SLUG}:spec/respond`

const createSession = spec(CREATE_SPEC_ID, { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), {
		genre: tallyGenre,
		event: sessionEvents.sessionCreated,
	})
	.build()

const respond = spec(RESPOND_SPEC_ID, { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), {
		genre: tallyGenre,
		event: sessionEvents.messageRespond,
	})
	.task('tally', ($) => tallyDefinition.v1({ text: $.input.text }))
	.build()

const tallyDefault = config(
	respond,
	'tally-default',
	{ label: 'Tally', description: 'As shipped.' },
	{ tally: { params: { trim: true } } },
)

/* ── the package ────────────────────────────────────────────────────────── */

export const extension = defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Tally',
	version: '1.0.0',
	description: 'Counts words and says so.',
	engines: { 'serene-pub': '>=0.7 <0.8' },
	handlers: [handler(tallyDefinition, tallyHandler)],
	pipelines: [createSession, respond],
	genres: [tallyGenre],
	surfaces: {
		panels: [{ id: TALLY_PANEL_ID, entry: 'ui/tally.html', title: 'Tally', channels: ['main'] }],
	},
	configs: [
		tallyDefault,
		// A config over somebody else's spec: legitimate, and the one thing in
		// this package that has to land in `requires`.
		config(use('core:spec/respond'), 'tally-flavoured', { label: 'Tally flavoured' }, {}),
	],
	prompts: [
		{
			nodeType: 'core:task/build-template-context',
			slot: 'prompts',
			slug: 'tally-referee',
			label: 'Tally referee',
			fields: { systemPrompt: 'Count, and say the number.' },
		},
	],
	presets: [
		{
			slug: 'tally',
			genre: tallyGenre,
			label: 'Tally',
			description: 'Counts what you say.',
			bindings: [createSession, { spec: respond, config: tallyDefault }],
		},
	],
	permissions: { storage: { quotaBytes: 4 * 1024 * 1024 } },
})

export default extension
