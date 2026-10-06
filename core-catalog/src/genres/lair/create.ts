/**
 * The Lair's create pipeline: make a dungeon. The genre's turn, and the notes
 * both share, are `respond.ts`'s.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_CASTELLAN_KEY, lairGenre } from '../../registry/genres.js'

/* ── create ─────────────────────────────────────────────────────────────── */

/** @internal */
export const LAIR_CREATE_SPEC_ID = 'core:spec/lair-create'
/** @internal */
export const LAIR_CREATE_VERSION = '1.0.0'

/** Where the Castellan's greeting lands — its declaration's channel, read at build like the cards' greeting channel. */
const CASTELLAN_GREETING_CHANNEL =
	lairGenre.envoys?.find((e) => e.key === LAIR_CASTELLAN_KEY)?.greeting?.channel ?? 'main'

/**
 * The genre's required member (24 §3): what happens when a Lair session is
 * created.
 *
 * **The dungeon welcomes nobody, but its steward welcomes its master** (R6,
 * owner F1 2026-09-28). The cards' greetings are off — the party are delvers
 * who have not arrived yet — so `collect` and `seed` still write nothing,
 * as the guide's do. Then the Castellan's declared greeting
 * (`EnvoyDecl.greeting`), read through `core:query/envoy-greeting@1` and
 * interpolated for this session, is written on the Sanctum under its name —
 * only when it has text, which it lacks when the Castellan is not seated.
 *
 * No model call, deliberately: creation is a synchronous action a person is
 * waiting on (see `adventure-create` for the argument at length). The
 * welcome is declared, so it is instant, translatable and reviewable; the
 * Castellan's first *reply* is where it tailors itself to the dungeon.
 * @internal
 */
export const lairCreateSpec = () =>
	compile(
		spec(LAIR_CREATE_SPEC_ID, {
			version: LAIR_CREATE_VERSION,
			taxonomy: {
				role: 'create',
			},
			genre: {
				name: lairGenre.name,
				family: lairGenre.family,
				description: lairGenre.description,
				shape: lairGenre.shape,
				events: lairGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>,
				// R4: the host names the person's lines off this row.
				playerLabel: lairGenre.playerLabel,
				// R6: the Castellan — which speakers this genre brings is
				// read off this row, as the writing room's scribe is.
				envoys: lairGenre.envoys,
			},
		})
			.inlet('input', C.sessionCreated.v1(), {
				genre: lairGenre,
				event: sessionEvents.sessionCreated,
			})
			.query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
			.outlet('seed', ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					channel: lairGenre.shape?.greeting?.channel ?? 'main',
				}),
			)
			/** The Castellan's greeting, interpolated — empty when it is not seated. */
			.query('welcome', ($) =>
				C.envoyGreeting.v1({ scope: $.input.sessionScope, params: slot.params() }),
			)
			.junction('greet', { on: ($: any) => $.welcome.text }, (g) =>
				g.when('greets', { truthy: true }, (c) =>
					c.outlet('write', ($: any) =>
						C.createMessage.v1({
							text: $.welcome.text,
							channel: CASTELLAN_GREETING_CHANNEL,
							speaker: `envoy:${LAIR_CASTELLAN_KEY}`,
						}),
					),
				),
			)
			.preset('lair', { label: 'Lair', default: true }, (p) =>
				p.params('welcome', { envoy: LAIR_CASTELLAN_KEY }),
			)
			.build(),
	)
