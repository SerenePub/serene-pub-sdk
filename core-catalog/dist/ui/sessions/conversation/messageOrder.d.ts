/**
 * The `messages` widget's order maths, as pure functions.
 *
 * `order` decides which end of the scroll region the newest message sits at,
 * and four things follow from it: the sequence the log draws, where an
 * autoscroll lands, how close to the older end the reader has to be before the
 * next page is pulled, and where the scroll sits once that page has been added.
 * The log component and the session page both need those answers, so they live
 * here rather than in either of them.
 */
/** Which end of the log the newest message sits at. @experimental */
export type MessageOrder = 'oldest-first' | 'newest-first';
/** How close to the older end a reader gets before the next page is pulled. @experimental */
export declare const OLDER_LOAD_THRESHOLD_PX = 200;
/** The scroll geometry these functions read, as an element reports it. @experimental */
export interface ScrollMetrics {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
}
/**
 * The messages in the sequence the log draws them: conversation order under
 * `oldest-first`, and a reversed copy under `newest-first`. The input array is
 * handed straight back when nothing is reversed, so the common order allocates
 * nothing.
 * @experimental
 */
export declare function orderedMessages<T>(messages: T[], order: MessageOrder): T[];
/**
 * The position in CONVERSATION order of the row drawn at `row`, so a message
 * keeps the index (and the "is this the newest one" answer) it has in the
 * session whichever way the log is drawn.
 * @experimental
 */
export declare function conversationIndex(row: number, total: number, order: MessageOrder): number;
/** Where the scroll region lands when it follows the newest message. @experimental */
export declare function autoscrollTarget(order: MessageOrder, metrics: Pick<ScrollMetrics, 'scrollHeight'>): number;
/**
 * Is the reader within `threshold` of the end the older messages are at — the
 * top under `oldest-first`, the bottom under `newest-first`?
 * @experimental
 */
export declare function atOlderEdge(order: MessageOrder, metrics: ScrollMetrics, threshold?: number): boolean;
/**
 * Where the scroll sits after a page of older messages has been added, so the
 * reader keeps looking at the same message.
 *
 * Under `oldest-first` the new rows land ABOVE the viewport and push everything
 * down by the height they added, so the scroll moves down by that much. Under
 * `newest-first` they land below it, nothing above the viewport moved, and the
 * scroll stays exactly where it was.
 * @experimental
 */
export declare function restoredScrollTop(order: MessageOrder, anchor: {
    previousScrollTop: number;
    previousScrollHeight: number;
}, scrollHeight: number): number;
//# sourceMappingURL=messageOrder.d.ts.map