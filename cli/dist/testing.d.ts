import { type ComponentInvokeArgs, type ComponentSections, type WidgetRequestKind, type WidgetBaseSection, type WidgetScope } from '@serene-pub/sdk';
/** @public The sections a test hands the component, as the page would push them. */
export type HarnessContext = Partial<Omit<ComponentSections, 'suspended' | 'grants'>>;
/** @public */
export interface MountComponentOptions {
    /** The component's source (or a built module), relative to `root` or absolute. */
    entry: string;
    /** The package root; the current directory when omitted. */
    root?: string;
    /** What the page pushes once the component is ready. `locale` defaults to `en`. */
    context?: HarnessContext;
    /** How long to wait for the component to mount. Default 10 s. */
    timeoutMs?: number;
    /**
     * Where built modules go: `<root>/node_modules/.cache/serene-pub-harness`
     * by default, or one fixed directory under the OS temp dir when the
     * package has no node_modules.
     */
    cacheDir?: string;
    /** Path aliases the source is written against (`{ $lib: … }`), for the bundler. */
    alias?: Record<string, string>;
    /**
     * Whose box the component is mounted in, as the page names it: a plugin's
     * when omitted. `'core'` is core's own component, with core's box rules —
     * it may place `sp-host-view`, `autofocus` and an `https:` or inline image
     * `src` — which a plugin's box refuses (see `refused`).
     */
    owner?: string;
    /**
     * The page's answer to the component's `ctx.request(kind, params)`:
     * return the kind's result (or a promise of it) and the component's
     * promise resolves with it — for `messages`, `{ rows, nextCursor? }`,
     * posted as the page posts a page. Throw or reject and it is declined
     * with your message, as the page declines: `messages` silently (the frame
     * protocol's rule), every other kind with a rejection.
     *
     * Asked only what the page would answer: an unknown kind, or one the
     * SDK's table of askers (`WIDGET_REQUEST_ASKERS`) keeps from this box — a
     * core-only kind in a plugin's box, a kind that reads a scope `grants`
     * does not hold — is declined without asking you.
     *
     * Omitted, nothing is answered. Whatever is still unanswered when the
     * harness unmounts is declined then, while the component is mounted to
     * hear it. Every request is in `requested` either way.
     */
    requests?: (kind: WidgetRequestKind, params: Record<string, unknown>) => unknown;
    /**
     * The scopes this widget was granted — bare scopes (`'lore'`), never the
     * permission keys (`'widget:lore'`). They decide the requests that read
     * scoped data (`session-entries` reads `lore`) and the scoped sections
     * the box is posted: the box gets only the `context.scoped` (or pushed
     * `scoped`) sections its grants cover, as the page never posts one past
     * its grant — core's box too when `grants` is given, since the page posts
     * core's widget only its declared scopes' sections. Omitted for core,
     * core's box holds every scope: core holds every scope it declares, and
     * the harness cannot see the declaration. They decide the widget events
     * the box hears too: a kind about scoped data (`lore:ranked`) reaches a
     * plugin's box only with its scope granted, as the page tells it. And
     * the component is TOLD them, as the page tells it (`ctx.grants`,
     * `ctx.granted(scope)`): a plugin's box with none is told it holds none —
     * so it can say "not granted" rather than wait. Change them later with
     * `setGrants`.
     */
    grants?: WidgetScope[];
    /**
     * The base sections the widget reads — its `WidgetDecl.reads` (R75):
     * pass the declaration's (`reads: myWidget.reads`). As on the page, a
     * base section it does not read is never posted (the SDK's `widgetReads`
     * clamps, as the page does), and neither is an event about one:
     * `message:created` needs `messages`, `layout:changed` needs `layout`.
     * The channel posts (`channels`) are the `messages` section scoped to
     * lanes, so they need `messages` too. Saved `state`, `theme`, `grants`
     * and granted `scoped` sections are not base sections: always posted.
     * Omitted, the widget reads every base section — as a declaration
     * without `reads` does.
     */
    reads?: readonly WidgetBaseSection[];
    /**
     * Whether a plugin's box is held to the page's invoke gate — default
     * `true`. On the page an invoke of one of core's verbs that change a
     * message (`hide`, `retry`, `extend`, `delete`, `edit`, `swipe`) from
     * a box that is not core's goes through only while a person is acting in
     * the box: a press the component heard (a `click`, `pressKey`, `input` or
     * `check` on an element it listens on) within the last five seconds, not
     * since left (`blur`) — or a person's press inside an `sp-frame`'s
     * document (`dispatch(frame, 'invoke', …)` here). Refused, it is listed in
     * `refusedInvokes`, never in `invoked`. The verb is read as the page
     * reads it: resolved against the `actions` section posted, else by its
     * name (`retry`, `core#retry`). `false` records every invoke, for a test
     * that only cares about the call. Core's box is never gated. The page's
     * confirmations (`retry`, `extend`, `advance`, a plugin's `edit`) are not asked.
     */
    invokeGate?: boolean;
    /**
     * Core's own conversation (the page's `/core-ui/messages`), with
     * `owner: 'core'`: it keeps the ids its native copy had, because the page
     * navigates by them. Every other box's ids — a plugin's, and each of
     * core's other widgets — are prefixed per mount, as the page prefixes
     * them (`idPrefix`).
     */
    coreConversation?: boolean;
    /**
     * `entry` is an ALREADY-BUILT module, mounted byte for byte as a host
     * serves it — never re-bundled. For a test that holds an artifact built
     * long ago (a frozen fixture, a package's `dist/`) to today's host.
     */
    built?: boolean;
    /**
     * The manifest entry's `builtAgainst` (F1): judged as a host judges it
     * (`componentBuiltAgainstFinding`) before anything mounts — a component
     * built for a protocol this host does not speak, or a vocabulary major it
     * lacks, is refused with the host's sentence (thrown).
     */
    builtAgainst?: unknown;
}
/** @public */
export interface InvokeRecord extends ComponentInvokeArgs {
    key: string;
}
/** @public An invoke the page's gate refused (`invokeGate`), and the page's reason. */
export interface RefusedInvokeRecord extends InvokeRecord {
    reason: string;
}
/** @public One `ctx.request` the component made: its kind, and the params it sent. */
export interface RequestRecord {
    kind: string;
    params: Record<string, unknown>;
}
/** @public */
export interface MountedComponent {
    /** The mirrored box — what the page would show. */
    readonly root: Element;
    html(): string;
    query<E extends Element = Element>(selector: string): E | null;
    queryAll<E extends Element = Element>(selector: string): E[];
    /** Push one section, as the page does when it changes. */
    push<K extends keyof HarnessContext>(section: K, value: HarnessContext[K]): Promise<void>;
    /**
     * Deliver a widget event (`ctx.onEvent`) — unless the page would not tell
     * this box: a kind about scoped data the box's `grants` do not cover.
     */
    event(event: unknown): Promise<void>;
    /** Click an element: by selector, or one `queryAll` returned. */
    click(target: string | Element): Promise<void>;
    /** Type into a control: its value, then an `input` event. */
    input(selector: string, value: string): Promise<void>;
    /**
     * Press a key on a control, as a person does: a `keydown` (`held` names
     * the modifiers down with it). A plain `input` whose `keys` names the
     * press raises `key` to the component, as the page raises it — and, as
     * on the page, counts as a person pressing in the box for its invoke
     * gate (`personGateVerdict`). Resolves
     * to whether the press was kept from the field (its default prevented).
     */
    pressKey(target: string | Element, key: string, held?: {
        shift?: boolean;
        ctrl?: boolean;
        meta?: boolean;
    }): Promise<boolean>;
    /** Tick or untick a checkbox or radio: its state, then a `change` event. */
    check(selector: string, checked?: boolean): Promise<void>;
    /** Raise an sp element's own event (`change`, `open-change`, …) with its declared detail — by selector, or one `queryAll` returned. */
    dispatch(target: string | Element, type: string, detail?: unknown): Promise<void>;
    /**
     * Change the box's grants while it is mounted, as an admin's review does:
     * the component is told (`ctx.grants`), a scoped section they no longer
     * cover is withdrawn, and requests and events are judged by them from now
     * on. A section newly covered arrives with the next `push('scoped', …)`.
     */
    setGrants(grants: WidgetScope[]): Promise<void>;
    /** Wait until the component has done everything it was prompted to. */
    settle(): Promise<void>;
    /** Every `ctx.invoke` the page would carry out, in order (see `invokeGate`). */
    readonly invoked: InvokeRecord[];
    /** Every `ctx.invoke` the page's gate refused, in order, with its reason (see `invokeGate`). */
    readonly refusedInvokes: RefusedInvokeRecord[];
    /**
     * What the box prefixes the component's ids with (`id`, `for`, `aria-*`
     * references, a `#fragment`, a control's `name`) — unique per mount, as
     * on the page; `''` for core's conversation (`coreConversation`).
     * Query one by `#${view.idPrefix}name`.
     */
    readonly idPrefix: string;
    /** Every `ctx.saveState`, in order. */
    readonly saved: unknown[];
    /** Every `ctx.error`, in order. */
    readonly errors: Array<{
        message: string;
        fatal: boolean;
    }>;
    /** Every `ctx.request`, in order — answered or not (see `requests`). */
    readonly requested: RequestRecord[];
    /** What the vocabulary refused — an element, an attribute, a value. */
    readonly refused: string[];
    unmount(): Promise<void>;
}
/** @public */
export declare function mountComponent(opts: MountComponentOptions): Promise<MountedComponent>;
//# sourceMappingURL=testing.d.ts.map