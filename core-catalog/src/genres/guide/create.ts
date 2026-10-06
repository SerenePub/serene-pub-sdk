/**
 * The guide genre's create pipeline — the genre's required member. Its reply,
 * and the notes on both, are `respond.ts`'s.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { GUIDE_MASCOT_KEY, guideGenre } from '../../registry/genres.js'

/** Where Serene's greeting lands: the channel her declaration names. */
const SERENE_GREETING_CHANNEL =
	guideGenre.envoys?.find((e) => e.key === GUIDE_MASCOT_KEY)?.greeting?.channel ?? 'main'

/** @internal */
export const GUIDE_CREATE_SPEC_ID = 'core:spec/guide-create'
/** @internal */
export const GUIDE_CREATE_VERSION = '1.1.0'

/**
 * The guide's create pipeline — the genre's one required member (24 §3).
 *
 * The same two nodes as `chat-create` — which, with no characters to greet
 * with, write nothing — then Serene's declared greeting (`EnvoyDecl.greeting`),
 * read through `core:query/envoy-greeting@1` and interpolated for this
 * session, written on `main` under her name: only when it has text, which it
 * lacks when she is not seated. No model call: a person is waiting on a
 * create, so the welcome is declared, instant and translatable.
 * The genre's declaration — envoys included — rides `meta.genre` on the
 * version row, which is where the host reads "which speakers does this genre
 * bring" from (`listSessionGenres`).
 * @internal
 */
export const createGuideSpec = () =>
	compile(
		spec(GUIDE_CREATE_SPEC_ID, {
			version: GUIDE_CREATE_VERSION,
			taxonomy: { role: 'create'},
			genre: {
				name: guideGenre.name,
				family: guideGenre.family,
				description: guideGenre.description,
				shape: guideGenre.shape,
				events: guideGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>,
				envoys: guideGenre.envoys,
			},
		})
			.inlet('input', C.sessionCreated.v1(), {
				genre: guideGenre,
				event: sessionEvents.sessionCreated,
			})
			.query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
			.outlet('seed', ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					channel: guideGenre.shape?.greeting?.channel ?? 'main',
				}),
			)
			/** Serene's greeting, interpolated — empty when she is not seated. */
			.query('welcome', ($) =>
				C.envoyGreeting.v1({ scope: $.input.sessionScope, params: slot.params() }),
			)
			.junction('greet', { on: ($: any) => $.welcome.text }, (g) =>
				g.when('greets', { truthy: true }, (c) =>
					c.outlet('write', ($: any) =>
						C.createMessage.v1({
							text: $.welcome.text,
							channel: SERENE_GREETING_CHANNEL,
							speaker: `envoy:${GUIDE_MASCOT_KEY}`,
						}),
					),
				),
			)
			.preset('guide', { label: 'Guide', default: true }, (p) =>
				p.params('welcome', { envoy: GUIDE_MASCOT_KEY }),
			)
			.build(),
	)
