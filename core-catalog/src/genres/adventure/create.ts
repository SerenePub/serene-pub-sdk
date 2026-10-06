/**
 * Adventure's create pipeline: make the world (DESIGN-adventure-genre.md). The
 * genre's turn, and the notes both share, are `respond.ts`'s.
 */

import { compile, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { adventureGenre } from '../../registry/genres.js'

/* ── create ─────────────────────────────────────────────────────────────── */

/** @internal */
export const ADVENTURE_CREATE_SPEC_ID = 'core:spec/adventure-create'
/** @internal */
export const ADVENTURE_CREATE_VERSION = '1.0.0'

/**
 * The genre's one required member: what happens when an Adventure session is
 * created.
 *
 * ## Attaching the slots is writing nothing
 *
 * The design says creation "attaches the lorebook's world slots and each cast
 * member's card config". Resolution already does that by READING: `valueOf`
 * walks session → lorebook → card → declaration default, and absence means
 * inherit. So attaching is materialising rows that say what the declaration
 * already says, and the one thing a seed must never do is write a row nobody
 * asked for — a stored 20 would stop tracking a card that later says 40.
 *
 * What makes the slots appear at all is the genre declaring them (`genreSlots`);
 * this pipeline's job is the greetings, exactly as Chat's is.
 *
 * ## No opening narration, deliberately
 *
 * The design asks for the narrator to run once for the opening scene. It is not
 * here, and the reason is what creating a session is: a synchronous action a
 * person is waiting on. A model call inside it makes "New session" as slow as
 * the slowest backend and fails the whole creation when no connection is set —
 * on the one screen where a new user is most likely to have set none. The
 * opening scene is `core:spec/adventure-look` instead, which is a button.
 * @internal
 */
export const adventureCreateSpec = () =>
	compile(
		spec(ADVENTURE_CREATE_SPEC_ID, {
			version: ADVENTURE_CREATE_VERSION,
			taxonomy: {
				role: 'create',
			},
			genre: {
				name: adventureGenre.name,
				family: adventureGenre.family,
				description: adventureGenre.description,
				shape: adventureGenre.shape,
				events: adventureGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>,
			},
		})
			.inlet('input', C.sessionCreated.v1(), {
				genre: adventureGenre,
				event: sessionEvents.sessionCreated,
			})
			.query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
			.outlet('seed', ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					channel: adventureGenre.shape?.greeting?.channel ?? 'main',
				}),
			)
			.build(),
	)
