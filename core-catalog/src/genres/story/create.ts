/**
 * The Story genre's **create pipeline** (the roleplay Chat's until 2026-10-19, when
 * Chat became the plain assistant and its roleplay moved here with Adventure) — the genre's one required member
 * (24 §3, revising 23 §7: the genre owns its id; this spec answers its
 * `session-created` slot rather than *being* the genre).
 *
 * ## 2.0.0 — the honest input (24 §12)
 *
 * 1.x reused `core:inlet/user-message@1` as an "identity only" placeholder,
 * which welded creation to the chat turn's shape and was wrong: a create run
 * has no triggering text and no speaker; it has a request. The input is
 * `core:inlet/session-created@1`, and the usage lock (24 §4) declares
 * exactly what this spec is: the pipeline answering `session-created` for
 * `core:genre/chat`.
 *
 * ## 2.2.0 — the event surface persists
 *
 * `meta.genre.events` rides the version row, so the genre dashboard and the
 * preset editor read "which events exist, which are required" as a SELECT.
 *
 * ## 2.1.0 — creation as a run (T8)
 *
 * The seeding is nodes now: `collect` reads what the cast wants to say first
 * (greeting histories, interpolated, position order) and `seed` writes them
 * as the session's first messages on the genre's greeting channel. The same
 * implementation the imperative path used, behind two declared nodes — so
 * the receipt says what creation did, and a custom genre swaps either half
 * without reimplementing the other. `sessions:create` runs this spec through
 * the ordinary executor; the byte-parity test in SP guards the seam.
 *
 * The genre's declaration (name, family, shape) rides `meta.genre` on the
 * version row so every "what is this session" check stays a SELECT; the id
 * association comes from the input lock's `genre` column.
 */
import { compile, spec, sessionEvents, coreEvents } from "@serene-pub/sdk"
import * as C from "@serene-pub/contracts"
import { storyGenre } from "../../registry/genres.js"
import { STORY_NOBODY_TO_REPLY } from "./turnOrder.js"

/** @internal */
/** The two seat lists of the settings document, as the create gate counts them. */
interface CastCounts {
	readonly cast: { readonly sessionCharacters: readonly unknown[]; readonly sessionPersonas: readonly unknown[] }
}

export const STORY_CREATE_SPEC_ID = "core:spec/story-create"
/** @internal */
export const STORY_CREATE_VERSION = "2.2.0"

/** @internal */
export const createStorySpec = () =>
	compile(
		spec(STORY_CREATE_SPEC_ID, {
			version: STORY_CREATE_VERSION,
			taxonomy: { role: "create"},
			genre: {
				name: storyGenre.name,
				family: storyGenre.family,
				description: storyGenre.description,
				shape: storyGenre.shape,
				// 🚧 ed B1 (2026-11-05): the genre's pinned settings ride the row (sheet latitude pins), as its shape does.
				settings: storyGenre.settings,
				// The event surface rides the row (24 §5): the dashboard and
				// the preset editor SELECT it, never re-derive it.
				events: storyGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>
			}
		})
			.inlet("input", C.sessionCreated.v1(), { suits: [coreEvents.sessionCreated] })
			.query("collect", ($) =>
				C.sessionGreetings.v1({ scope: $.input.sessionScope })
			)
			.outlet("seed", ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					// The genre's declared greeting channel (19 §1) — stated
					// here so the spec and the shape cannot silently disagree.
					channel: storyGenre.shape?.greeting?.channel ?? "main"
				})
			)
			// 🚧 A session born with nobody in it (owner ruling 2026-11-08):
			// the composer is closed with the reason until someone is seated —
			// the turn order (`emptyCast`) lifts it on the first seat, and no
			// turn order runs at create. Two seat lists, two nested reads:
			// character seats, then persona seats (both can take a turn).
			// ⚠ No empty `otherwise` branches: a branch with no node is not
			// stored, and the published document would drift from this one.
			.junction("seats", { on: ($) => $.input.session }, (j) =>
				j.when("noCharacters", { path: (v: CastCounts) => v.cast.sessionCharacters.length, equals: 0 }, (n) =>
					n.junction("players", { on: ($) => $.input.session }, (p) =>
						p.when("nobody", { path: (v: CastCounts) => v.cast.sessionPersonas.length, equals: 0 }, (o) =>
							o.outlet(
								"close",
								() =>
									C.setComposerState.v1({
										channel: "main",
										open: false as any,
										reason: STORY_NOBODY_TO_REPLY
									}),
								{ expose: { label: "Close the composer while nobody can reply" } }
							)
						)
					)
				)
			)
			.build()
	)
