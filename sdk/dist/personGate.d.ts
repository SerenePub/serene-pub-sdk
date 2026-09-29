/**
 * The person gate on a widget's invoke — ONE table for the page and the
 * component harness alike (2026-09-26).
 *
 * Core's verbs that change a message — hide, retry, extend, delete, edit,
 * swipe — are things a person does. A box that is not core's may invoke one
 * only while a person is acting in it: a press in the box within the last
 * {@link PERSON_PRESS_WINDOW_MS}, and focus not having left it since (a
 * `blur` ends the window). The page reads "a press" as a trusted event the
 * box forwarded, a trusted key a plain `input`'s `keys` names, or a press
 * inside an `sp-frame` that frame's own live check vouched for; the harness
 * reads the presses it raises as a person. Both judge by this module.
 *
 * It is a mitigation against a widget acting unprompted, never a proof of
 * intent: the server judges every message write against the viewer's own
 * permissions. Other core verbs (stop, branch) are not gated; a contributed
 * action is the server's to judge.
 *
 * Pure — no DOM, no clock: callers hand in the last press and `now`.
 *
 * @experimental 🚧 provisional with the widget invoke vocabulary (C7, R80).
 */
/** Core's verbs that change a message or start a turn, and so need a person behind a widget's invoke of them. @experimental */
export declare const PERSON_GATED_CORE_VERBS: ReadonlySet<string>;
/** How long a person's press in a box vouches for its invoke — ended early by a `blur`. @experimental */
export declare const PERSON_PRESS_WINDOW_MS = 5000;
/** Is this action one a box that is not core's may invoke only with a person behind it? @experimental */
export declare const isPersonGatedAction: (action: {
    specSlug: string;
    key: string;
}) => boolean;
/**
 * Does the last press still vouch at `now`? `lastPressAt` is null when there
 * was none, or focus has left the box since ({@link personPressAfter}). A
 * press "in the future" (a clock that stepped back) vouches for nothing.
 * @experimental
 */
export declare function personPressCurrent(lastPressAt: number | null, now: number): boolean;
/**
 * The last press after an event of `eventType` reached the box's component:
 * a `blur` ends the window, a person's event opens it anew, anything else
 * (a synthetic event, an element's own) leaves it as it was.
 * @experimental
 */
export declare function personPressAfter(eventType: string, byPerson: boolean, previous: number | null, now: number): number | null;
/** @experimental */
export type PersonGateVerdict = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
};
/**
 * Whether a box that is not core's may invoke `action` now, and the sentence
 * to refuse with when it may not.
 * @experimental
 */
export declare function personGateVerdict(action: {
    specSlug: string;
    key: string;
}, lastPressAt: number | null, now: number): PersonGateVerdict;
//# sourceMappingURL=personGate.d.ts.map