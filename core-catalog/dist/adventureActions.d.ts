/**
 * The Adventure genre's actions — the small pipelines a player fires from the
 * composer (DESIGN-adventure-genre.md, "Actions").
 *
 * `session-action` is an OPEN event: any number of pipelines may serve it, and
 * which ones a session offers is the preset's `actions.include`. So these are
 * the E-series "events are all optional" made concrete — each is two or three
 * nodes, each contributes its own button, and removing one from a preset takes
 * the button with it and breaks nothing.
 *
 * ## Two shapes, three specs
 *
 * `adventure-look` writes a message and changes nothing. The other two change
 * state and write no message at all, which is worth stating plainly because it
 * looks like a bug the first time you see a run with no reply: pressing Rest
 * produces a ledger under the last message, not a new one. A pipeline is
 * allowed exactly one write-class Consumer (F7) and is not obliged to have one.
 *
 * ## Why `adventure-inventory` is not here
 *
 * The design lists a fourth action: a prose inventory check with no model call.
 * Two things say it should not be a pipeline. `core:query/session-state@1`
 * publishes possessions as a map keyed by owner, and no core node turns a map
 * into text — `join-text` reads a list. And the question it answers is the one
 * the **Inventory widget** answers continuously, in the session, with the item
 * prose on hover. A button that writes a worse copy of a panel already on
 * screen is a feature competing with itself.
 */
export declare const ADVENTURE_LOOK_SPEC_ID = "core:spec/adventure-look";
export declare const ADVENTURE_LOOK_VERSION = "1.0.0";
/**
 * The narrator describes where you are, from the lore and the world state, and
 * changes nothing.
 *
 * It is also the opening scene: the create pipeline deliberately makes no model
 * call, so this is the button a new Adventure session is meant to start with.
 *
 * ⚠ **The one shipped spec that wires `core:task/build-template-context@1`'s
 * `state` port.** That port has been declared and unfilled since the stats
 * substrate landed, because Chat must never grow a state block. This is a genre
 * that wants one, using the standard context surface to get it.
 */
export declare const adventureLookSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const ADVENTURE_REST_SPEC_ID = "core:spec/adventure-rest";
export declare const ADVENTURE_REST_VERSION = "1.0.0";
/** Stop and recover: stamina and health back, and the clock moves on. */
export declare const adventureRestSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const ADVENTURE_ADVANCE_TIME_SPEC_ID = "core:spec/adventure-advance-time";
export declare const ADVENTURE_ADVANCE_TIME_VERSION = "1.0.0";
/** Let time pass: the world clock steps on, and the weather may turn with it. */
export declare const adventureAdvanceTimeSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=adventureActions.d.ts.map