/**
 * The event registry (01 §8 / F8, 13 §7 and §7g).
 *
 * Only core emits, from a closed core-owned set. Nodes have no emit API and plugins
 * cannot define events; they subscribe. This file is the registry's *shape*, built so
 * that reopening plugin-defined events later is a permission rather than a migration.
 *
 * Two things here are deliberate and both were rulings, not conveniences:
 *
 * 1. **`slug` is the stable reference, not the id.** The primary key differs between
 *    instances because it autoincrements; the slug is what lets a seeded row be
 *    identified, synced and updated across instances and upgrades. Same convention
 *    belongs on every core-seeded registry — types, surfaces, shapes — so there is
 *    one identity convention rather than four.
 *
 * 2. **Two families.** A *data* event says something changed and carries write-target
 *    mappings, so it participates in the write → event → subscription cycle check.
 *    An *action* event says someone asked — a click, a scheduler tick. It has no write
 *    targets, so it drops out of the cycle graph instead of needing an exception.
 *    Without the distinction, `ui-action` would either blur F8's "occurrences core
 *    observes" or need a special case in the CTE.
 */
import type { ShapeId } from './shapes.js';
export type EventFamily = 'data' | 'action';
export interface EventDef {
    /** Autoincrement in core; opaque here. Never the reference used to sync. */
    id: number;
    /** Unique, PK-agnostic, stable across instances and upgrades (13 §7g). */
    slug: string;
    version: number;
    family: EventFamily;
    /** Does firing this touch a user's account or assets? Drives consent (11 §4). */
    affectsUser: boolean;
    /** Data events only: the consumer targets whose writes cause this event. */
    causedBy?: string[];
    /**
     * The shape of what a listener receives (R-15, 2026-09-16). A shape id,
     * on the same terms as a port's: `pipeline_event_registry.payload_shape`
     * projects it, and the field-by-field account lives on the payload
     * interface the id names (`SessionChangePayload` for
     * `core:shape/session-change@1`). Optional so an event whose payload is
     * still the description's prose (`ui-action`, `schedule-tick`) registers
     * as it always did.
     */
    payload?: ShapeId;
    /**
     * What a person reads for this event where a screen names one — a
     * preset's binding slots, a consent line. A locale map with `en`
     * mandatory, like every other display string; the id
     * (`core:event/message-respond@1`) is the address and is shown as the
     * tooltip, never as the label. Optional so a declaration without one
     * still registers; a host falls back to the humanised slug.
     */
    name?: {
        en: string;
    } & Record<string, string>;
    description: string;
    /** Reserved, always null in 0.6. Reopening is a permission, not a migration. */
    ownerPluginId?: null;
}
export declare function defineEvent(def: Omit<EventDef, 'id' | 'ownerPluginId'>): EventDef;
export declare const getEvent: (slug: string) => EventDef | undefined;
export declare const allEvents: () => EventDef[];
/**
 * `owner:event/name@N` — the grammar every event key wears since R-4: a
 * genre's event surface, a preset's `bindings` map and a spec's inlet lock
 * are keyed by this and nothing else. The owner segment matches the genre
 * id's (`core`, `acme.rp`); the name is lowercase-hyphenated; the version
 * is a whole number.
 */
export declare const EVENT_ID: RegExp;
/**
 * Is this string an event id? A bare name (`message-respond`) is not, and a
 * host that stored bare keys before the fold migrates them once — it never
 * accepts a new one (plans/30 §U3 review, W6).
 */
export declare const isEventId: (id: string) => boolean;
/**
 * The events the inter-spec cycle CTE reads (F9). Action events are excluded by
 * construction rather than by an exception someone has to remember.
 */
export declare const cycleRelevantEvents: () => EventDef[];
export declare function _clearEvents(): void;
export declare const CORE_EVENTS: {
    readonly messageCreated: EventDef;
    /**
     * A row was finished or rewritten by a pipeline's own write. A regenerate,
     * a swipe's fresh alternative and a continue are THIS event with `verb`
     * on the payload — `regenerate` · `swipe` · `continue` — rather than three
     * events of their own (R-15, 2026-09-16): each is the genre's pipeline
     * producing text plus core's rewrite of the row, and the rewrite is one
     * outlet. A plain reply's finishing write carries no `verb`.
     */
    readonly messageUpdated: EventDef;
    readonly messageDeleted: EventDef;
    readonly messageHidden: EventDef;
    readonly messageEdited: EventDef;
    readonly messageSwiped: EventDef;
    /**
     * Stop is not a write outlet: it is the run-level guarantee (R-17) —
     * core finalises the row a cancelled run was filling — so it has no
     * `causedBy`. Emitted by the host from that finalisation, and from the
     * message's own Stop when it releases the row first.
     */
    readonly messageStopped: EventDef;
    readonly sessionBranched: EventDef;
    /**
     * Not a write's event: the marker the `sessionChanges` list ends with when
     * more than fifty changes waited between two replies (U5b review S1). The
     * newest fifty are delivered and this one entry says how many older ones
     * were not, so a pipeline can tell a full list from a truncated one. Never
     * written to `session_changes` and never on a receipt's `emitted` — no
     * `causedBy`, because no outlet causes it.
     */
    readonly sessionChangesTruncated: EventDef;
    /**
     * A **form** — a `choices` or `form` block a message carries — was
     * addressed to a participant the AI portrays this turn (R-15 *Forms*;
     * R-21 (5); 30 §U5d). Caused by the write that carried the block, and
     * dispatched through the same path as the lifecycle events, so every
     * answer run is a child of the run that asked (`parentRunId`,
     * `rootRunId`, `depth`) and 01 §8's cycle caps hold: a form whose answer
     * asks another form stops at the depth cap, receipted. A form addressed
     * to a person is no event: the block waits for the click.
     */
    readonly formAddressed: EventDef;
    /**
     * A form was **answered** — by a click, or by the answer pipeline's
     * outlet committing an oracle's answer exactly as a click would. Lands in
     * the session's changes so the next reply's inlet sees it (`answer`,
     * `addressee`, `blockId`, `action` on the payload).
     */
    readonly formAnswered: EventDef;
    readonly loreEntryCreated: EventDef;
    readonly graphProposalCreated: EventDef;
    /** The create slot — required; exactly one pipeline per genre answers it. */
    readonly sessionCreated: EventDef;
    /** The primary turn. A swipe is this pipeline re-run, not a new event. */
    readonly messageRespond: EventDef;
    /** Arbitrary buttons/triggers — the contributed functions surface (19 §3). */
    readonly sessionAction: EventDef;
    readonly memberAdded: EventDef;
    readonly memberRemoved: EventDef;
    /**
     * A UI action asked for a run (13 §7). Carrying both users is what answers the
     * budget-owner question without a separate rule: **budget and quota attach to the
     * owner; the receipt's attribution records the trigger.** Group sessions need no
     * special case.
     *
     * ⏳ Overlaps `session-action` since the fold (a contributed action IS a UI
     * action). Kept because ruling 49 (`UiActionPayload`, the owner/trigger
     * split) has no other home yet; nothing subscribes to it. Retire when the
     * action model (30 §U5) gives the payload one.
     */
    readonly uiAction: EventDef;
    /**
     * The path for scheduled model work (13 §7c). No callable may call an oracle
     * (F32), and lifecycle callbacks may not trigger pipelines, so nightly
     * summarization subscribes here instead — which also puts it on the consent
     * screen, where a lifecycle callback doing the same work would have been
     * invisible. ⏳ Nothing emits it yet; `SCHEDULED_WORK_PATH` names it.
     */
    readonly scheduleTick: EventDef;
};
/**
 * One **session change** — the payload of every built-in write's event
 * (`core:shape/session-change@1`), and one entry of the `sessionChanges`
 * list the next reply's inlet publishes (R-15). The fields past `at` are per
 * event; every one is additive and a reader keys on `event` before reaching
 * for them.
 *
 * Written to the session's changes at the write, read once by the next
 * reply run that is not a preview, so a pipeline sees each change exactly
 * once. The list a run receives is capped at the newest fifty, and ends with
 * a `session-changes-truncated` entry when older ones were dropped.
 *
 * ## What a delete leaves behind, and for how long
 *
 * The content a change carries — `lost.content`, `previous.content` — exists
 * so the NEXT run can see what went. Once a run has consumed the change it
 * has done its job: the host nulls the content on the stored row and keeps
 * the event, the ids and the rest of the payload, so the ledger still says a
 * line was deleted without holding the line indefinitely. A run's receipt
 * keeps what the outlet published under the receipt's own retention.
 */
export interface SessionChangePayload {
    /** The event id — `core:event/message-deleted@1`. */
    event: string;
    sessionId: number;
    /** The message the change was about. Absent on a branch, which is about a session. */
    messageId?: number;
    /** When, as epoch milliseconds. */
    at: number;
    /** `message-deleted`: what the row held. `content` is nulled on the stored row once consumed. */
    lost?: {
        content: string | null;
        role: string;
        /** Who voiced it, as a participant reference; null for narration. */
        speaker: string | null;
        channel: string;
        metadata: unknown;
    };
    /**
     * `message-edited` and `message-swiped`: what was showing before; on
     * `message-updated` with `verb: regenerate`, the reply the regenerate
     * replaced (U5b review W3). `content` is nulled on the stored row once
     * consumed.
     */
    previous?: {
        content: string | null;
        swipeIndex?: number | null;
    };
    /** `message-hidden`: hidden now, or shown again. */
    hidden?: boolean;
    /** `message-swiped`: the alternative now selected. */
    swipeIndex?: number;
    /** `message-updated`: the verb that re-drove the row, when one did. */
    verb?: 'regenerate' | 'swipe' | 'continue';
    /** `session-changes-truncated`: how many older changes the list did not carry. */
    dropped?: number;
    /** `message-stopped`: how much of the reply had arrived. */
    textLength?: number;
    /**
     * `session-branched`: recorded on the NEW session — `sessionId` is the
     * branch — with the session and message it forked from. The source's
     * history did not move, so it is told nothing.
     */
    fromSessionId?: number;
    fromMessageId?: number;
    /** `form-answered`: the block that was answered, within `messageId`. */
    blockId?: string;
    /** `form-answered`: the action identity the answer fired (`<spec slug>#<key>`). */
    action?: string;
    /** `form-answered`: who the form was addressed to, as a participant reference. */
    addressee?: string;
    /**
     * `form-answered`: the answer — `{ choice }` for a choices block, the
     * entered values for a form — and who committed it: `click` (a person
     * portraying the addressee) or `oracle` (the answer pipeline).
     */
    answer?: Record<string, unknown>;
    answeredBy?: 'click' | 'oracle';
}
/**
 * The payload of `core:event/form-addressed@1` (`core:shape/form-addressed@1`)
 * — what the host records when a block's addressee resolves to the AI, and
 * what `core:inlet/form-addressed@1` publishes port by port.
 */
export interface FormAddressedPayload {
    sessionId: number;
    /** The message carrying the block. */
    messageId: number;
    /** The block's id within the message (`FormBlockFields.id`). */
    blockId: string;
    /** The stamped identity of the action the form answers with (`<spec slug>#<key>`). */
    action: string;
    /** Who the form is put to — a reference the resolver answered `ai` for. */
    addressee: string;
}
export interface UiActionPayload {
    sessionId: string;
    /** Budget and quota attach here. */
    ownerUserId: string;
    /** Attribution records this. May differ from the owner in a group session. */
    triggeringUserId: string;
    action: string;
    modeId: string;
    input: unknown;
}
//# sourceMappingURL=events.d.ts.map