/**
 * 🚧 Chat's **create pipeline** — `core:spec/assistant-create` (2026-10-19,
 * PLAN-genre-restructure §1): the genre's one required member. A fresh spec
 * id, never the roleplay Chat's (`core:spec/chat-create`, now Story's
 * `story-create`): config rows, deviations and forks follow a spec id, so the
 * assistant never inherits the roleplay's (§2-7 a).
 *
 * Nothing to seed: Chat seats no character and its Assistant has no greeting
 * (★C), so a new Chat opens empty — the create run publishes the genre's
 * declaration on the version row and writes nothing.
 */
import { compile, spec, sessionEvents, coreEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from '../../registry/genres.js'

/** @internal */
export const ASSISTANT_CREATE_SPEC_ID = 'core:spec/assistant-create'
/** @internal */
export const ASSISTANT_CREATE_VERSION = '1.0.0'

/** @internal */
export const createAssistantSpec = () =>
	compile(
		spec(ASSISTANT_CREATE_SPEC_ID, {
			version: ASSISTANT_CREATE_VERSION,
			taxonomy: { role: 'create' },
			genre: {
				name: chatGenre.name,
				family: chatGenre.family,
				description: chatGenre.description,
				shape: chatGenre.shape,
				// The event surface rides the row (24 §5): the dashboard and
				// the preset editor SELECT it, never re-derive it.
				events: chatGenre.events as Record<string, { required?: boolean; open?: boolean }>,
				envoys: chatGenre.envoys,
			},
		})
			.inlet('input', C.sessionCreated.v1(), { suits: [coreEvents.sessionCreated] })
			/**
			 * The cast's greetings, as every create pipeline reads them — none
			 * here (no characters, greetings off), so `seed` writes nothing. Kept
			 * so the run's receipt says so rather than leaving it unsaid.
			 */
			.query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
			.outlet('seed', ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					channel: chatGenre.shape?.greeting?.channel ?? 'main',
				}),
			)
			.build(),
	)
