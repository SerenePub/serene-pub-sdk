/**
 * The standard chat's **create pipeline** — the genre's one required member
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
import { compile, spec, sessionEvents } from "@serene-pub/sdk"
import * as C from "@serene-pub/contracts"
import { chatGenre } from "./genres.js"

/** @internal */
export const CREATE_CHAT_SPEC_ID = "core:spec/create-chat"
/** @internal */
export const CREATE_CHAT_VERSION = "2.2.0"

/** @internal */
export const createChatSpec = () =>
	compile(
		spec(CREATE_CHAT_SPEC_ID, {
			version: CREATE_CHAT_VERSION,
			taxonomy: { role: "create"},
			genre: {
				name: chatGenre.name,
				family: chatGenre.family,
				description: chatGenre.description,
				shape: chatGenre.shape,
				// The event surface rides the row (24 §5): the dashboard and
				// the preset editor SELECT it, never re-derive it.
				events: chatGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>
			}
		})
			.inlet("input", C.sessionCreated.v1(), {
				genre: chatGenre,
				event: sessionEvents.sessionCreated
			})
			.query("collect", ($) =>
				C.sessionGreetings.v1({ scope: $.input.sessionScope })
			)
			.outlet("seed", ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					// The genre's declared greeting channel (19 §1) — stated
					// here so the spec and the shape cannot silently disagree.
					channel: chatGenre.shape?.greeting?.channel ?? "main"
				})
			)
			.build()
	)
