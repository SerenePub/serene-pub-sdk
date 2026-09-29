/**
 * Whether one action is offered on one message right now, and why not when
 * it is not (plans/29 R-15; plans/30 U5c, U5e).
 *
 * The server's action list (`sessions:actions`, venue `message`) says which
 * actions this session offers, who may act (`canAct`, `itemGated`), and the
 * **enabled-when verdict** over the session's published values (`enabled`,
 * `reason`) — plus the `item.*` predicates it could not judge without a
 * message (`itemPredicates`). This is where those are judged: the row's own
 * `item` document is built here (`shared/actions/itemValues.ts`, the same
 * shape the server builds at the door) and `core:verdict/enablement`'s
 * `judge` (01 §13) runs over it. One table, read by the quick row and the
 * ⋮ menu alike, so the two can never disagree about a verb.
 *
 * What stays client-side, because it is not a published value: an edit in
 * progress (`editing`), the item rule's sentence, and the audience's — which
 * is `core:verdict/audience`'s own sentence, quoted (01 §13), never a
 * paraphrase of it. Every other condition a verb greys on — the newest row,
 * hidden, generating, a swipe to take — is a declared predicate on
 * `CORE_ACTIONS` (U5e), and the sentence beside a grey entry is that
 * predicate's `reason`.
 */
import { type EnabledWhen } from '@serene-pub/sdk';
import { statusText } from './text.js';
/** @experimental */
export interface VerbMessage {
    id?: number;
    isGenerating?: boolean | null;
    isHidden?: boolean | null;
    characterId?: number | null;
    /** The persona the row was written as — read so `item.speaker` is answered the same on both sides (R11). */
    personaId?: number | null;
    isNarratorResponse?: boolean | null;
    content?: string | null;
    role?: string | null;
    /**
     * Which channel the row is on (R-C) — read here so an `item.channel`
     * predicate is answered the same way on both sides. Absent is `main`, the
     * column's own default, so nothing moves for a session with one channel.
     */
    channel?: string | null;
    metadata?: {
        isGreeting?: boolean;
        swipes?: {
            currentIdx: number | null;
            history: string[];
        };
        /** An envoy's line records its speaker here (`item.speaker`, R11). */
        speaker?: unknown;
    } | null;
}
/** @experimental */
export interface VerbContext {
    msg: VerbMessage;
    isLastMessage: boolean;
    /** Some message is in edit mode (this one or another). */
    editing: boolean;
    hasGeneratingMessage: boolean;
    /** The item rule's answer for this message. */
    canControl: boolean;
    /** Why Extend is unavailable in this session, when it is. */
    extendRefusal?: string;
    /** The action list's own answer — `canAct` off `sessions:actions`. */
    canAct: boolean;
    /** The action's name and `act` audience, off the list — what the audience's sentence names. */
    action: {
        name: string;
        act: ReadonlyArray<string>;
    };
    /**
     * The action's `act` names `item` (`itemGated` off `sessions:actions`),
     * so `canAct` was answered `true` ahead of any message and the message's
     * own ownership rule (`canControl`) decides here (U5c review, W6). Only
     * read for a contributed action; core's verbs know their own rule.
     */
    itemGated?: boolean;
    /**
     * The enabled-when verdict off the list (U5e): every predicate the
     * server could evaluate holds. Absent (an older server) reads as
     * enabled.
     */
    enabled?: boolean;
    /** Why it is grey when `enabled` is false — already resolved to a sentence. */
    reason?: string;
    /** The `item.*` predicates, judged here against this message. */
    itemPredicates?: ReadonlyArray<EnabledWhen>;
}
/** @experimental */
export interface VerbState {
    /** Rendered at all on this message. */
    shown: boolean;
    /** Rendered, but not pressable. */
    disabled: boolean;
    /** The sentence beside a disabled verb, when one exists. */
    reason?: string;
}
/**
 * The sentences beside a disabled verb — the same words the chips and the
 * palette use for the same conditions (`paletteRowState`), so a person
 * meets one vocabulary wherever a control is grey (U5c review, UI nit 2).
 * The state half is the SDK's (`CORE_VERB_REASONS`, the `reason` of each
 * core verb's predicate); the two that are not published values are here.
 * The audience's sentence is not: it is the verdict's (`notYoursToUse`).
 * @experimental
 */
export declare const VERB_REASONS: Readonly<{
    notYours: "not yours to change";
    editing: "finish the edit first";
    generating: "wait for the reply to finish";
    hidden: "unhide it first";
    notNewest: "only the newest reply can be regenerated";
    noSwipe: "nothing to swipe to";
}>;
/**
 * The audience's sentence for an action that is not the viewer's to use —
 * `core:verdict/audience`'s own words, the ones the fire refuses with (01
 * §13). Asked once the refusal is decided: the listing answered that the
 * viewer holds none of the references (`canAct: false`), or the row's own
 * ownership rule answered for `item` — so no portrayal is handed to the
 * judge and the item rule's answer is `false`, and the judge says the
 * sentence for the audience as declared.
 * @experimental
 */
export declare function notYoursToUse(action: {
    name: string;
    act: ReadonlyArray<string>;
}): string;
/**
 * The enabled-when half for one message (U5e): the list's verdict over the
 * session's values first (`session.generating`, `state.*` — the server's,
 * re-listed whenever a reply starts or ends or the state changes), then the
 * `item.*` predicates over this row's own document — the same `item` the
 * server builds at the door, so the sentence here is the sentence a press
 * would be refused with. `opts.statusText` puts that sentence in the
 * viewer's language as `paletteRowState`'s does; absent, the resolver a
 * conversation set in this realm.
 * @experimental
 */
export declare function enabledWhenState(ctx: Pick<VerbContext, 'msg' | 'isLastMessage' | 'canControl' | 'enabled' | 'reason' | 'itemPredicates'>, opts?: {
    statusText?: typeof statusText;
}): [holds: boolean, reason: string | undefined];
/**
 * The state of a core verb on a message. A key this table does not know is
 * a contributed action and gets the generic answer: shown, disabled by the
 * audience, by its enabled-when, while editing, and — for an item-gated one
 * — by the message's ownership rule. Every disabled answer carries its
 * reason. What is *shown* is still the row's own affair (a streaming reply
 * has nothing to regenerate yet); what is *grey* is the audience, the
 * declared predicates, and an edit in progress.
 * @experimental
 */
export declare function coreVerbState(key: string, ctx: VerbContext): VerbState;
/** The fields the row reads off an action — the wire's `Actions.Action` has them. @experimental */
export interface RowAction {
    key: string;
    specSlug: string;
    name: string;
    audience: {
        act: string[];
    };
    canAct: boolean;
    itemGated: boolean;
    enabled?: boolean;
    reason?: {
        i18n: {
            en: string;
        } & Record<string, string>;
        vars?: Record<string, string | number>;
    };
    itemPredicates?: EnabledWhen[];
}
/** The verb-table key for one listed action: core's by key, a contributed one under its own prefix. @experimental */
export declare const verbKeyOf: (a: {
    key: string;
    specSlug: string;
}) => string;
/** The listed verdict's half of the context, off one action — resolved to a sentence. @experimental */
export declare const verdictOf: (a: RowAction) => Pick<VerbContext, 'canAct' | 'itemGated' | 'action' | 'enabled' | 'reason' | 'itemPredicates'>;
/**
 * The message row's quick icons: the message venue's **primary set** (R-15
 * `quick`), core's and a plugin's alike (U5c review, S8 — a contributed
 * `quick` message action is in the primary set per the law, not only in the
 * ⋮ menu), each shown on exactly the messages the ⋮ menu offers it on and
 * only while the menu would have it enabled, through the one verb table
 * both read. Stop is the primary set's too, but it has its own pill rather
 * than an icon.
 * @experimental
 */
export declare function quickRowActions<A extends RowAction>(primary: ReadonlyArray<A>, ctx: Omit<VerbContext, 'canAct' | 'itemGated' | 'action' | 'enabled' | 'reason' | 'itemPredicates'>): Array<{
    action: A;
    state: VerbState;
}>;
//# sourceMappingURL=messageVerbState.d.ts.map