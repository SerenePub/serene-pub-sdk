/**
 * The component client's contract (§3.5, C3): what a remote component is
 * handed. The host implements it in the page's UI worker over the widget
 * wire — the same sections a native widget reads off its context and a
 * frame is posted, and the same verbs back — and `@serene-pub/component-client`
 * is how a component names it.
 *
 * A component module exports one mount function: it draws into `root`
 * (placing elements from `SP_HOST_ELEMENTS`) and returns a cleanup.
 */
/** Types a component's mount function; returns it unchanged. @experimental */
export const defineComponent = (fn) => fn;
//# sourceMappingURL=componentClient.js.map