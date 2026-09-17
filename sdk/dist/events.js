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
import { refuseUnlessIdentical } from './hash.js';
import { S } from './shapes.js';
const bySlug = new Map();
let nextId = 1;
export function defineEvent(def) {
    const existing = bySlug.get(def.slug);
    // Built against the id the slug already holds, so an identical re-declaration
    // compares like for like and — the part that matters here rather than in the
    // other registries — does not consume a second number from the sequence. The
    // id is local; the slug is what syncs the row across instances, and a module
    // re-evaluating must not renumber what it re-declares.
    const e = { ...def, id: existing?.id ?? nextId, ownerPluginId: null };
    if (existing)
        refuseUnlessIdentical(existing, e, `duplicate event slug '${def.slug}' — slugs are unique because they are the ` +
            `reference used to sync seeded rows across instances (13 §7g)`);
    if (def.family === 'action' && def.causedBy?.length) {
        throw new Error(`action event '${def.slug}' declares causedBy. Action events are requests, not ` +
            `consequences of a write — that is what keeps them out of the cycle graph (13 §7)`);
    }
    if (!existing)
        nextId++;
    bySlug.set(def.slug, e);
    return e;
}
export const getEvent = (slug) => bySlug.get(slug);
export const allEvents = () => [...bySlug.values()];
/**
 * `owner:event/name@N` — the grammar every event key wears since R-4: a
 * genre's event surface, a preset's `bindings` map and a spec's inlet lock
 * are keyed by this and nothing else. The owner segment matches the genre
 * id's (`core`, `acme.rp`); the name is lowercase-hyphenated; the version
 * is a whole number.
 */
export const EVENT_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:event\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/;
/**
 * Is this string an event id? A bare name (`message-respond`) is not, and a
 * host that stored bare keys before the fold migrates them once — it never
 * accepts a new one (plans/30 §U3 review, W6).
 */
export const isEventId = (id) => EVENT_ID.test(id);
/**
 * The events the inter-spec cycle CTE reads (F9). Action events are excluded by
 * construction rather than by an exception someone has to remember.
 */
export const cycleRelevantEvents = () => allEvents().filter((e) => e.family === 'data');
export function _clearEvents() {
    bySlug.clear();
    nextId = 1;
}
// ── The closed core set — THE ONE registry (R-4, ruled 2026-09-15) ──────────
//
// The genre's session events (24 §5) are core events, folded in here from
// `genres.ts` 2026-09-16 (09-B B5): `core:event/session-created@1`,
// `…/message-respond@1`, `…/session-action@1`, `…/member-added@1`,
// `…/member-removed@1`. A preset binds a spec to one of these by id; the
// spec's inlet lock (`.inlet(key, node, { genre, event })`) is the only
// subscription there is. The DATA events core's outlets cause are here too, so
// a host projecting this set projects the whole registry and keeps no copy.
export const CORE_EVENTS = {
    messageCreated: defineEvent({
        slug: 'message-created',
        name: { en: 'Message written' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/create-message', 'core:outlet/seed-greetings'],
        description: 'A message was written into a session.',
    }),
    /**
     * A row was finished or rewritten by a pipeline's own write. A regenerate,
     * a swipe's fresh alternative and a continue are THIS event with `verb`
     * on the payload — `regenerate` · `swipe` · `continue` — rather than three
     * events of their own (R-15, 2026-09-16): each is the genre's pipeline
     * producing text plus core's rewrite of the row, and the rewrite is one
     * outlet. A plain reply's finishing write carries no `verb`.
     */
    messageUpdated: defineEvent({
        slug: 'message-updated',
        name: { en: 'Message changed' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/update-message', 'core:outlet/attach-image', 'core:outlet/attach-audio'],
        payload: S.sessionChange,
        description: 'An existing message was changed.',
    }),
    // ── The built-in writes (R-15, 2026-09-16) — DATA family, each caused ──
    // by the core outlet that performs it. Every one carries what changed
    // and what was lost, lands on the receipt as `emitted`, and is written to
    // the session's changes so the next reply's inlet publishes it.
    messageDeleted: defineEvent({
        slug: 'message-deleted',
        name: { en: 'Message deleted' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/delete-message'],
        payload: S.sessionChange,
        description: 'A message was deleted. The payload carries what was lost — its content, role, speaker and metadata.',
    }),
    messageHidden: defineEvent({
        slug: 'message-hidden',
        name: { en: 'Message hidden or shown' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/hide-message'],
        payload: S.sessionChange,
        description: 'A message was hidden from the prompt, or shown again. The payload says which.',
    }),
    messageEdited: defineEvent({
        slug: 'message-edited',
        name: { en: 'Message edited' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/edit-message'],
        payload: S.sessionChange,
        description: "A person rewrote a settled message. The payload carries the previous content.",
    }),
    messageSwiped: defineEvent({
        slug: 'message-swiped',
        name: { en: 'Message swiped' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/swipe-message'],
        payload: S.sessionChange,
        description: 'A different alternative of a message was selected, or a new one recorded. The payload carries the alternative that was showing and the index now selected.',
    }),
    /**
     * Stop is not a write outlet: it is the run-level guarantee (R-17) —
     * core finalises the row a cancelled run was filling — so it has no
     * `causedBy`. Emitted by the host from that finalisation, and from the
     * message's own Stop when it releases the row first.
     */
    messageStopped: defineEvent({
        slug: 'message-stopped',
        name: { en: 'Reply stopped' },
        version: 1,
        family: 'data',
        affectsUser: true,
        payload: S.sessionChange,
        description: 'A reply was stopped while it was being written. The payload carries how much text had arrived.',
    }),
    sessionBranched: defineEvent({
        slug: 'session-branched',
        name: { en: 'Session branched' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/branch-session'],
        payload: S.sessionChange,
        description: 'A session was branched at a message into a new session. The payload names the new session and the message it forked from.',
    }),
    /**
     * Not a write's event: the marker the `sessionChanges` list ends with when
     * more than fifty changes waited between two replies (U5b review S1). The
     * newest fifty are delivered and this one entry says how many older ones
     * were not, so a pipeline can tell a full list from a truncated one. Never
     * written to `session_changes` and never on a receipt's `emitted` — no
     * `causedBy`, because no outlet causes it.
     */
    sessionChangesTruncated: defineEvent({
        slug: 'session-changes-truncated',
        name: { en: 'Session changes truncated' },
        version: 1,
        family: 'data',
        affectsUser: false,
        payload: S.sessionChange,
        description: 'More session changes waited than one reply is handed. The newest fifty were delivered; the payload says how many older ones were dropped.',
    }),
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
    formAddressed: defineEvent({
        slug: 'form-addressed',
        name: { en: 'Form addressed' },
        version: 1,
        family: 'data',
        affectsUser: false,
        causedBy: ['core:outlet/create-message', 'core:outlet/update-message'],
        payload: S.formAddressed,
        description: 'A question or form in a message was addressed to a participant the AI portrays this turn — the genre\'s answer pipeline answers it. The payload names the message, the block, the action and the addressee.',
    }),
    /**
     * A form was **answered** — by a click, or by the answer pipeline's
     * outlet committing an oracle's answer exactly as a click would. Lands in
     * the session's changes so the next reply's inlet sees it (`answer`,
     * `addressee`, `blockId`, `action` on the payload).
     */
    formAnswered: defineEvent({
        slug: 'form-answered',
        name: { en: 'Form answered' },
        version: 1,
        family: 'data',
        affectsUser: false,
        causedBy: ['core:outlet/answer-form'],
        payload: S.sessionChange,
        description: 'A question or form in a message was answered. The payload carries the answer, who answered as whom, and the action it fired.',
    }),
    loreEntryCreated: defineEvent({
        slug: 'lore-entry-created',
        name: { en: 'Lore entry written' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/create-lore-entry'],
        description: 'A lorebook entry was written.',
    }),
    graphProposalCreated: defineEvent({
        slug: 'graph-proposal-created',
        name: { en: 'Graph proposal filed' },
        version: 1,
        family: 'data',
        affectsUser: true,
        causedBy: ['core:outlet/graph-proposal'],
        description: 'A narrative-graph proposal was filed for review.',
    }),
    // ── The session lifecycle (24 §5) — ACTION family: a person did it ──────
    /** The create slot — required; exactly one pipeline per genre answers it. */
    sessionCreated: defineEvent({
        slug: 'session-created',
        name: { en: 'Session created' },
        version: 1,
        family: 'action',
        affectsUser: false,
        description: "A session was created — the genre's create pipeline answers this.",
    }),
    /** The primary turn. A swipe is this pipeline re-run, not a new event. */
    messageRespond: defineEvent({
        slug: 'message-respond',
        name: { en: 'Reply' },
        version: 1,
        family: 'action',
        affectsUser: true,
        description: 'A reply was asked for — the primary turn of a session.',
    }),
    /** Arbitrary buttons/triggers — the contributed functions surface (19 §3). */
    sessionAction: defineEvent({
        slug: 'session-action',
        name: { en: 'Action' },
        version: 1,
        family: 'action',
        affectsUser: true,
        description: 'A person triggered a contributed action in a session.',
    }),
    memberAdded: defineEvent({
        slug: 'member-added',
        name: { en: 'Member joined' },
        version: 1,
        family: 'action',
        affectsUser: false,
        description: 'A character or persona joined a session; the payload carries which.',
    }),
    memberRemoved: defineEvent({
        slug: 'member-removed',
        name: { en: 'Member left' },
        version: 1,
        family: 'action',
        affectsUser: false,
        description: 'A character or persona left a session; the payload carries which.',
    }),
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
    uiAction: defineEvent({
        slug: 'ui-action',
        name: { en: 'Interface action' },
        version: 1,
        family: 'action',
        affectsUser: true,
        description: 'Someone asked for a run from the interface — a composer action, a message action, ' +
            'a re-roll. Payload: sessionId, ownerUserId, triggeringUserId, action, modeId, input.',
    }),
    /**
     * The path for scheduled model work (13 §7c). No callable may call an oracle
     * (F32), and lifecycle callbacks may not trigger pipelines, so nightly
     * summarization subscribes here instead — which also puts it on the consent
     * screen, where a lifecycle callback doing the same work would have been
     * invisible. ⏳ Nothing emits it yet; `SCHEDULED_WORK_PATH` names it.
     */
    scheduleTick: defineEvent({
        slug: 'schedule-tick',
        name: { en: 'Schedule tick' },
        version: 1,
        family: 'action',
        affectsUser: false,
        description: 'A declared cadence elapsed. Payload: cadence, scheduledFor, scope.',
    }),
};
//# sourceMappingURL=events.js.map