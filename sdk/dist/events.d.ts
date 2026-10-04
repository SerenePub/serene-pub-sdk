/**
 * The event registry (01 §8 / F8, 13 §7 and §7g).
 *
 * No node emits: a write causes the event its outlet declares. Core's events are a
 * closed set; a package declares its own with `defineSessionEvent()` and records one
 * with the `record-event` write. Both kinds live in this registry.
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
import type { RunLineage } from './executor.js';
import type { TurnOrderV1 } from './turnOrder.js';
import { type I18n } from './i18n.js';
/** @experimental */
export type EventFamily = 'data' | 'action';
/** @experimental */
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
     * A **declared root** (PLAN-turn-order §B3, C28): the event starts from
     * outside every pipeline — a person or the host does it — so it needs no
     * `causedBy`. A genre may list an event only if it is caused or a declared
     * root. Distinct from the event map's computed `root` (no `causes` edge
     * in): `message-respond` is a declared root the auto-advance listener
     * also causes.
     */
    declaredRoot?: true;
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
/** @experimental */
export declare function defineEvent(def: Omit<EventDef, 'id' | 'ownerPluginId'>): EventDef;
/** @internal */
export declare const getEvent: (slug: string) => EventDef | undefined;
/**
 * The event an id names — core's (`core:event/message-completed@1`) or one a
 * package declared — or `undefined`. Core's are keyed by bare slug, so the
 * owner and version are checked here rather than trusted:
 * `acme:event/message-completed@1` is not core's event.
 * @experimental
 */
export declare function eventById(id: string): EventDef | undefined;
/**
 * The sentence every door refuses an undeclared event with: a lock, a
 * `causesEvent`, a recording. One wording, so a modder meets the same fix
 * wherever the mistake was written.
 * @experimental
 */
export declare const notADeclaredEvent: (id: string) => string;
/** @internal */
export declare const allEvents: () => EventDef[];
/**
 * `owner:event/name@N` — the grammar every event key wears since R-4: a
 * genre's event surface, a preset's `bindings` map and a spec's inlet lock
 * are keyed by this and nothing else. The owner segment matches the genre
 * id's (`core`, `acme.rp`); the name is lowercase-hyphenated; the version
 * is a whole number.
 * @experimental
 */
export declare const EVENT_ID: RegExp;
/**
 * Is this string an event id? A bare name (`message-respond`) is not, and a
 * host that stored bare keys before the fold migrates them once — it never
 * accepts a new one (plans/30 §U3 review, W6).
 * @internal
 */
export declare const isEventId: (id: string) => boolean;
/**
 * The events the inter-spec cycle CTE reads (F9). Action events are excluded by
 * construction rather than by an exception someone has to remember.
 * @experimental
 */
export declare const cycleRelevantEvents: () => EventDef[];
/** @experimental */
export declare function _clearEvents(): void;
/**
 * An event a package declares: something that happened, recorded by a
 * pipeline's `record-event` write and heard by anything in its scope — for a
 * session event, the session's bound pipelines, plugin listeners and widgets
 * (R56). Declared once, globally, and passed by value wherever it is recorded
 * or heard. Who may record it is the package entry's to say:
 * `defineExtension({ events })`.
 *
 * ⚠ An event is a happening, never a secret: everything in the session hears
 * its payload. Keep a secret in state, in a part whose audience is empty.
 * @experimental
 */
export interface SessionEventDecl<Payload = unknown> {
    readonly __decl: 'session-event';
    /** `<package slug>:event/<name>@<version>`. */
    readonly id: string;
    /** The shape of what the recording carries; a new shape is a new version. */
    readonly payload: ShapeId;
    readonly name: I18n;
    readonly description: I18n;
    /** Which part of the app it happens in. Only `session` exists before SDK 1.0. */
    readonly domain: 'session';
    /** Phantom — carries the payload's type. Never populated. */
    readonly __payload?: Payload;
}
/** The shape every recorded event reaches a listener in (see `RecordedEventPayload`). @experimental */
export declare const RECORDED_EVENT_SHAPE = "core:shape/recorded-event@1";
/** What a listener's inlet receives for a recorded event. @experimental */
export interface RecordedEventPayload<P = unknown> {
    event: string;
    sessionId: number;
    at: number;
    cause?: EventCause;
    lineage?: RunLineage;
    /** What the recording pipeline wrote, in the event's declared payload shape. */
    payload: P;
}
/**
 * Declare an event your package's pipelines record. The id is under
 * your package's slug; the payload is a shape id, and a pipeline that records
 * the event is checked against it at publish. Registered on declaration, so a
 * spec's inlet may lock on it: `.inlet('e', C.sessionEvent.v1(), { genre,
 * events: [guessed] })`.
 * @experimental
 */
export declare function defineSessionEvent<Payload = unknown>(d: {
    id: string;
    payload: ShapeId | {
        readonly id: ShapeId;
    };
    name: I18n;
    description: I18n;
}): SessionEventDecl<Payload>;
/** The most a recording's payload may weigh, serialized — it rides every listener's inlet and the ledger. @experimental */
export declare const MAX_RECORDED_PAYLOAD_BYTES: number;
/**
 * What is wrong with a value recorded as an event's payload, or undefined.
 * The host's check at the write: plain JSON, within the size cap, and a
 * string where the declared shape is text. Publish checks the wiring; this
 * checks the value that actually arrived.
 * @experimental
 */
export declare function recordedPayloadFindings(shape: ShapeId, value: unknown): string | undefined;
/**
 * Withdraw a package event, so an upgraded package may declare it again,
 * differently. The host's to call on uninstall and reinstall.
 * @internal
 */
export declare function _withdrawSessionEvent(id: string): void;
/** A package event by id, or undefined. @experimental */
export declare const packageEventById: (id: string) => SessionEventDecl | undefined;
/** Whether a value is an event declaration (so a literal can be written as its id). @experimental */
export declare const isSessionEventDecl: (v: unknown) => v is SessionEventDecl;
/** @experimental */
export declare const CORE_EVENTS: {
    readonly messageCreated: EventDef;
    /**
     * A row was finished or rewritten by a pipeline's own write. A regenerate,
     * a swipe's fresh alternative and an extend are THIS event with `verb`
     * on the payload — `regenerate` · `swipe` · `extend` — rather than three
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
     * A line's **shown sprite** changed (DESIGN-sprites §5.2): a sprite picker
     * chose one after a reply, or a person changed it from the message menu.
     * The payload names the line, the speaker, the `{ set, label }` now shown
     * (null for none) and `source` — `picker` or `person`. What TTS line
     * direction and any face-driven widget listen for.
     */
    readonly spriteShown: EventDef;
    /**
     * Stop is not a write outlet: it is the run-level guarantee (R-17) —
     * core finalises the row a cancelled run was filling — so it has no
     * `causedBy`. Emitted by the host from that finalisation, and from the
     * message's own Stop when it releases the row first.
     */
    readonly messageStopped: EventDef;
    readonly sessionBranched: EventDef;
    /**
     * A row that is **not generating** landed: a user send, a seeded
     * greeting, a finalised reply, a stopped reply. Never for a placeholder
     * or a generating row — the reply's *completion* is the fact, not its
     * opening. Distinct from `message-created` (which fires at the write,
     * placeholder included) and `message-updated` (which also fires on an
     * attach): this is the one event that means "there is a new settled
     * turn to answer".
     */
    readonly messageCompleted: EventDef;
    /**
     * A seated participant's row changed — switched on or off (`active`),
     * `position` or portrayal. Not add or remove: those stay
     * `member-added` / `member-removed`. No `causedBy`: the cast toggles are
     * socket writes, not an outlet's.
     */
    readonly castChanged: EventDef;
    /**
     * The session row changed. Two origins: a person's settings write
     * (`sessions:update` and the other settings sockets — name, scenario,
     * lorebook, genre fields, preset, channels, tags; cause `settings`), and
     * `core:outlet/advance-story-clock`, which moves the session's story
     * clock (`changed: ['storyClock']`, cause `run`). The payload's `changed`
     * lists the fields by name. `causedBy` names the outlet, so the event map
     * draws the edge a spec bound here that advances the clock would loop
     * on; it is therefore not a declared root, though a person's write also
     * starts it (as the auto-advance listener also causes `message-respond`).
     * ⚠ Never emitted by `writeTurnOrder`, which is raw SQL for exactly this
     * reason (§3).
     */
    readonly sessionUpdated: EventDef;
    /**
     * `metadata.turnOrder` was written by `core:outlet/set-turn-order@1`.
     * **Core-internal**: the auto-advance listener and the
     * `sessions:turnOrder` push read it; `genre()` refuses it in a genre's
     * `events`, so no preset can bind a spec to it and the recompute cannot
     * feed itself.
     */
    readonly turnOrderChanged: EventDef;
    /**
     * A pipeline's annex entry changed: "my state changed", for any genre.
     * A package writes its annex through `core:outlet/set-session-annex@1`
     * and binds this; for a named happening of its own it declares an event
     * and records it. Emitted only
     * when the merged value differs from the stored one, so a spec that
     * rewrites the same value cannot feed itself; the lineage caps stop the
     * rest.
     */
    readonly annexChanged: EventDef;
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
    /**
     * A form was **superseded** (plans/29 R-15 *Staleness and order*; 30
     * §U5f): the channel head moved past the turn it was issued at before it
     * was answered, and a press on it reached the door. Recorded ONCE per
     * block, the first time the door sees it stale, so the next reply's
     * inlet learns the question lapsed — not on every render, and never by a
     * render. No outlet causes it: the door does, like the truncation marker.
     */
    readonly formSuperseded: EventDef;
    readonly loreEntryCreated: EventDef;
    /**
     * Two lore entries were linked (L2, 2026-09-17) — a room's exit, who keeps
     * what, what stands near what.
     *
     * Its own event rather than `lore-entry-created`: a link is not an entry,
     * nothing about it is created or changed, and a subscriber that wants to
     * redraw a map wants exactly this and none of the writes that make rows.
     *
     * ⚠ It declares no payload shape — it rides the run's receipt as caused by
     * the outlet, and the link itself (its name, its words both ways) is the
     * outlet's `linkId` row, read where it is needed (places plan B2,
     * 2026-09-29). An idempotent repeat that found the standing row wrote
     * nothing, and causes no event (`written: false`).
     */
    readonly loreLinkCreated: EventDef;
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
     * invisible. Serene Pub emits it hourly (`cadence: 'hourly'`, `scheduledFor`
     * the ISO instant it was due, `scope: 'pub'`), only to subscribed,
     * granted listeners; `SCHEDULED_WORK_PATH` names it.
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
/**
 * Why a session event fired (PLAN-turn-order §4.1) — on every session
 * event's payload since 2026-09-21. The auto-advance listener keys on it:
 * a `user` cause may fire the head turn, an auto `run` cause may fire the
 * next, and `edit` / `settings` / `system` never fire anything. An open
 * string so a plugin's host code may name its own cause; core's five are
 * the ones the listener reads.
 *
 * At the emitters: a user send → `{ kind: 'user', userId }`; a run's write
 * → `{ kind: 'run', runId, auto }` where `auto` is true iff auto-advance
 * fired the run; a person's edit, hide, delete or swipe → `{ kind: 'edit',
 * userId }`; settings and cast toggles → `{ kind: 'settings', userId }`;
 * boot, migration and the importer → `{ kind: 'system' }`.
 * @experimental
 */
export interface EventCause {
    /** Open string; core values: user | run | edit | settings | system. */
    kind: 'user' | 'run' | 'edit' | 'settings' | 'system' | (string & {});
    userId?: number;
    runId?: string;
    /** On kind 'run': the run was fired by auto-advance. */
    auto?: boolean;
}
/** @experimental */
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
    verb?: 'regenerate' | 'swipe' | 'extend';
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
    /** `form-answered` · `form-superseded`: the block in question, within `messageId`. */
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
    /** Why this fired — see `EventCause`. Absent on rows written before 2026-09-21. */
    cause?: EventCause;
    /** The run that made the write, when one did — its place in the tree of runs. */
    lineage?: RunLineage;
    /** `session-updated`: the columns/fields that changed, by name. */
    changed?: string[];
}
/**
 * The payload of `core:event/cast-changed@1` (`core:shape/cast-change@1`):
 * one seated participant's row moved. `ref` is the participant reference
 * (`character:<id>` · `persona:<id>` · `envoy:<slug>`); `change` says which
 * column, open so a host may name one this release does not. `'enabled'` is
 * the seat switched on or off (`value` is the new boolean; renamed from
 * `'active'` 2026-09-28, NOMENCLATURE §25).
 *
 * `member-added` / `member-removed` carry the same payload since the modder
 * pass (R31): `change: 'added' | 'removed'`, so one inlet reads every seat
 * change — an envoy's included — the same way.
 * @experimental
 */
export interface CastChangePayload {
    event: string;
    sessionId: number;
    at: number;
    cause?: EventCause;
    lineage?: RunLineage;
    /** character:<id> | persona:<id> | envoy:<slug> */
    ref: string;
    change: 'enabled' | 'position' | 'portrayal' | 'added' | 'removed' | (string & {});
    value?: unknown;
}
/**
 * The payload of `core:event/annex-changed@1` (`core:shape/annex-change@1`,
 * R30): which owner's annex entry changed. The value itself is not carried —
 * a spec reads it through `core:query/session-annex@1`, so the event stays
 * small and never races the row.
 * @experimental
 */
export interface AnnexChangePayload {
    event: string;
    sessionId: number;
    at: number;
    cause?: EventCause;
    lineage?: RunLineage;
    /** The annex key that changed: a genre id, a plugin id, or `user:<slug>`. */
    owner: string;
}
/**
 * The payload of `core:event/turn-order-changed@1`
 * (`core:shape/turn-order-changed@1`): the order as
 * `core:outlet/set-turn-order@1` wrote it, and the run that wrote it (null
 * when the write was not a run's). `cause` is the inlet's — the cause of
 * the event that led to the recompute, carried through so the listener
 * can tell a send from an edit.
 * @experimental
 */
export interface TurnOrderChangedPayload {
    event: string;
    sessionId: number;
    at: number;
    cause?: EventCause;
    lineage?: RunLineage;
    runId: string | null;
    /** The document as written. */
    turnOrder: TurnOrderV1;
}
/**
 * The payload of `core:event/form-addressed@1` (`core:shape/form-addressed@1`)
 * — what the host records when a block's addressee resolves to the AI, and
 * what `core:inlet/form-addressed@1` publishes port by port.
 * @experimental
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
/** @experimental */
export interface UiActionPayload {
    sessionId: string;
    /** Budget and quota attach here. */
    ownerUserId: string;
    /** Attribution records this. May differ from the owner in a group session. (`triggeringUserId` until 2026-09-28.) */
    actorUserId: string;
    action: string;
    modeId: string;
    input: unknown;
}
//# sourceMappingURL=events.d.ts.map