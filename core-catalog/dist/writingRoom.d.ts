/**
 * The **Writing Room** genre's two pipelines (plans/genres §2; U2): the create
 * pipeline that is the genre's required member, and the one reply that answers
 * on either channel.
 *
 * ## The one new thing, and where it lives
 *
 * `writing-room-respond` is a **junction on the channel the turn was triggered
 * on** (`$.input.channel`, R-C). Two postures, one document:
 *
 *  - **`manuscript`** — a continuation. The channel is a `folio`, so the host
 *    folds its rows into one block of text ahead of the conversation, and its
 *    declared `voice: 'none'` means `process-messages` writes **no seed row at
 *    all**: the prompt does not end `Verity:`, because a page has no speaker to
 *    announce. The instructions are the manuscript's own — point of view,
 *    tense, chunk length and the author's note, which arrive as the genre's
 *    `fields` and render as `{{pov}}`, `{{tense}}`, `{{chunkLength}}` and
 *    `{{authorsNote}}`.
 *  - **`main`** — the companion's reply, with the manuscript as context. The
 *    speaker is the seated character, or the `scribe` envoy when no card is
 *    seated, and the envoy's instructions are configuration at the address
 *    `envoy:scribe` exactly as the guide's mascot's are.
 *
 * The reply lands on the channel the trigger was on because the placeholder
 * carries `channel: $.input.channel` — one row, created once, on the spine, and
 * finished by whichever branch fired. Both branches read the bible through the
 * same keyword scan, and both are budgeted and ranked once, above the junction.
 *
 * ## Why the two branches use different context builders
 *
 * A shipped prompt is resolved per (node definition, slot) per spec, so two
 * nodes of the same type in one document land on the same authored row. The
 * manuscript's instructions and the companion's are not the same instructions,
 * so they cannot be the same type.
 *
 * ⚠ The manuscript arm therefore borrows `core:task/build-planner-context@1`,
 * which is the only shipped context surface that takes the genre's `fields` and
 * declares no speaker — both of which the manuscript needs. It is the right
 * SHAPE and the wrong NAME: the Pipelines panel labels the step "Build planner
 * context". A neutral `fields`-taking surface would be a new contract type, and
 * a new type is a contracts change core cannot see until that package is
 * rebuilt — so the borrow is deliberate and recorded here rather than smuggled.
 */
/** @internal */
export declare const WRITING_ROOM_CREATE_SPEC_ID = "core:spec/writing-room-create";
/** @internal */
export declare const WRITING_ROOM_CREATE_VERSION = "1.0.0";
/**
 * The genre's one required member (24 §3) — and it writes **nothing**.
 *
 * Greeting is off, so there are no greetings to seed; a blank page is what a
 * writing room is meant to open on. There is no model call either, which is
 * what lets the preset ship enabled: creating a session publishes this
 * document, the run ends with a receipt saying it did, and the genre's
 * declaration — the scribe included — rides `meta.genre` on the version row,
 * which is where the host reads "which speakers does this genre bring" from.
 *
 * An inlet and no more is a valid document (`validate()` asks for one inlet,
 * not for an effect), and it is the honest one: a create pipeline that read the
 * cast's greetings and then declined to write them would be two nodes agreeing
 * to do nothing.
 * @internal
 */
export declare const writingRoomCreateSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const WRITING_ROOM_RESPOND_SPEC_ID = "core:spec/writing-room-respond";
/** @internal */
export declare const WRITING_ROOM_RESPOND_VERSION = "1.1.0";
/** One reply, two postures — see the module note. @internal */
export declare const writingRoomRespondSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=writingRoom.d.ts.map