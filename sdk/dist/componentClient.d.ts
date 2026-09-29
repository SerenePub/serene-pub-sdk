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
import type { ViewerV1, WidgetRequestKind, WidgetRequests, WidgetScopedSectionValues, WidgetSectionScope } from './widgets.js';
import type { TurnOrderV1 } from './turnOrder.js';
/** Every section the host pushes, as the latest value received. @experimental */
export interface ComponentSections {
    session?: unknown;
    messages?: unknown[];
    /** Per-lane rows, when the widget declared channels. */
    channels: Record<string, unknown[]>;
    settings?: Record<string, unknown>;
    actions?: unknown;
    annex?: Record<string, unknown>;
    props?: Record<string, unknown>;
    theme?: {
        theme: string;
        mode: 'light' | 'dark';
    };
    /** The viewer's language code — render a locale map with `i18nText(text, ctx.locale)`. */
    locale?: string;
    /** 🚧 Who is looking: `{ userId, isAdmin, isGuest }`. */
    viewer?: ViewerV1;
    /** The session's turn order: who is due, in order, and who could be (`turnOrder.v1`). */
    turnOrder?: TurnOrderV1;
    /**
     * 🚧 The scoped sections this widget was granted, by their posted name
     * (`session_full`, `session_state`, …) — the SDK's one table
     * (`WidgetScopedSections`), each its section's `v1`.
     */
    scoped: Partial<WidgetScopedSectionValues>;
    /**
     * 🚧 The scopes this widget holds, BARE (`session:state`, never
     * `widget:session:state`) — as the host last said (`grants`), on mount
     * and whenever an admin's review changes them. `undefined` until the host
     * says (and from a host that never does). So a component tells "this
     * scope was not granted" (drawn as such) from "its section has not been
     * posted yet" (drawn as loading) — both of which are an absent `scoped`
     * entry. Read one scope with {@link ComponentContext.granted}.
     */
    grants?: readonly WidgetSectionScope[];
    layout?: unknown;
    /** The view state this widget saved last time, handed back once on mount. */
    state?: unknown;
    suspended: boolean;
}
/** @experimental */
export type ComponentSection = keyof ComponentSections | 'event' | 'strings';
/** @experimental */
export interface ComponentInvokeArgs {
    messageId?: number;
    payload?: Record<string, unknown>;
    blockId?: string;
    /** The text the press supplies — a slash argument (`WidgetInvokeArgs.text`). */
    text?: string;
}
/** @experimental */
export interface ComponentContext extends Readonly<ComponentSections> {
    /** Called with the section's name whenever the host pushes one. */
    subscribe(fn: (section: ComponentSection) => void): () => void;
    /** Widget events (`message:created`, `layout:changed`, …). */
    onEvent(fn: (event: unknown) => void): () => void;
    /** Press an action by key or identity, as the native `invoke` verb does. */
    invoke(key: string, args?: ComponentInvokeArgs): void;
    /**
     * ⏳ Fire a function by name — a form block's press, whose identity the
     * outlet stamped and no venue need list (the native `action` verb).
     */
    action(fn: string, messageId?: number, payload?: Record<string, unknown>, action?: string, blockId?: string): void;
    /** Keep a little view state for the next mount (capped by the host). */
    saveState(state: unknown): void;
    /** Tell the host something went wrong; `fatal` shows the host's own notice. */
    error(message: string, fatal?: boolean): void;
    /** Ask the host for something ({@link WidgetRequests}); rejects when it declines. */
    request<K extends WidgetRequestKind>(kind: K, params: WidgetRequests[K]['params']): Promise<WidgetRequests[K]['result']>;
    /**
     * 🚧 The viewer's translation of one of the component's own English
     * strings — the source until a translation arrives, when `subscribe` hears
     * `strings` and a redraw shows it.
     */
    t(source: string): string;
    /**
     * 🚧 Was `scope` granted? `true` or `false` once the host has said
     * (`grants`); `undefined` before it has — so `false` is the one answer
     * that means "draw not granted", and `undefined` still means "wait".
     */
    granted(scope: WidgetSectionScope): boolean | undefined;
}
/** What a component module exports: mount into `root`; return a cleanup. @experimental */
export type ComponentMountFn = (root: HTMLElement, ctx: ComponentContext) => void | (() => void);
/** Types a component's mount function; returns it unchanged. @experimental */
export declare const defineComponent: (fn: ComponentMountFn) => ComponentMountFn;
//# sourceMappingURL=componentClient.d.ts.map