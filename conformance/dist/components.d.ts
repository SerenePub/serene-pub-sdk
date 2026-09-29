/**
 * A mounted component, as a host shows it to the kit — the page's mirrored
 * DOM and the host's record of what the component asked for. The SDK's
 * harness (`@serene-pub/cli/testing` `mountComponent`) is one; a host's own
 * mount (a native widget in a test DOM) is another.
 * @experimental
 */
export interface ComponentView {
    /** The mirrored markup, as the page holds it. */
    html(): string;
    /** Every element matching `selector`, in document order. */
    queryAll(selector: string): Element[];
    /** Push one section, as the page does when it changes. */
    push(section: string, value: unknown): Promise<void>;
    /** Click an element: by selector, or the element itself (one `queryAll` returned). */
    click(target: string | Element): Promise<void>;
    input(selector: string, value: string): Promise<void>;
    /** Every `invoke` the component made, in order. */
    readonly invoked: Array<{
        key: string;
        messageId?: number;
        payload?: Record<string, unknown>;
    }>;
    /** What the vocabulary refused (an element, an attribute, a value). */
    readonly refused: string[];
    /**
     * Raise an `sp-*` element's own event (`input`, `submit`, `key`, …) with
     * its declared detail, as the page raises it — by selector, or the element
     * itself. How a case drives a field the page owns (`sp-composer-field`):
     * a remote hears that field's events, never a DOM `input` on a textarea
     * it does not have. Optional; a case that needs it fails naming it.
     */
    dispatch?(target: string | Element, type: string, detail?: unknown): Promise<void>;
    /** Every `ctx.error` the component raised, in order. Optional; C31 needs it. */
    readonly errors?: ReadonlyArray<{
        message: string;
        fatal: boolean;
    }>;
    /** Wait until the component has done everything it was prompted to. Optional. */
    settle?(): Promise<void>;
    unmount(): Promise<void>;
}
/**
 * The kit's own component, already built: plain ES, no imports — the
 * protocol with nothing else in the way. It counts the messages it is
 * pushed, continues on a click, and tries one element no page takes.
 * @experimental
 */
export declare const COMPONENT_PROTOCOL_FIXTURE = "export default (root, ctx) => {\n\tconst count = document.createElement('p')\n\tcount.setAttribute('class', 'kit-count')\n\tconst go = document.createElement('button')\n\tgo.setAttribute('type', 'button')\n\tgo.setAttribute('class', 'kit-go')\n\tgo.textContent = 'Continue'\n\tgo.addEventListener('click', () => ctx.invoke('advance'))\n\tconst sneaky = document.createElement('script')\n\tsneaky.textContent = 'globalThis.kitRan = true'\n\troot.append(count, go, sneaky)\n\tconst draw = () => { count.textContent = String((ctx.messages ?? []).length) }\n\tdraw()\n\treturn ctx.subscribe(draw)\n}\n";
/** @experimental The built module's own findings: its errors fail it; its advisories are said. */
export declare function judgeComponentModule(id: string, code: string): string[];
/** @experimental The protocol round trip, over a view of the fixture a host mounted. */
export declare function componentProtocolCase(view: ComponentView): Promise<void>;
/**
 * Parity between a messages widget's native copy and a remote built from the
 * same source: the same rows render the same bodies, a streamed reply is
 * followed the same way, and an edit reaches the host as the same `edit`
 * verb. Both views are mounted by the caller with the same sections (two
 * rows, ids 1 and 2, and a listed `edit`), in the core messages widget's
 * contract: rows are the part `messages.message`
 * (`[data-widget-part~="messages.message"]`), a row's text is its `sp-message-body text`,
 * a row's quick Edit is `button[aria-label="Edit"]`, its edit field is the
 * page's field inside the row — `sp-composer-field`, which core's
 * `MessageComposer` places and a remote drives through the field's own
 * `input` event (`ComponentView.dispatch`), or a plain `textarea` a clone
 * may have swapped in — and Save is the row's button reading "Save".
 * `componentParitySections()` is those sections.
 * @experimental
 */
export declare function componentParityCase(native: ComponentView, remote: ComponentView): Promise<void>;
/**
 * The sections the parity case's contract names, as a page pushes them to a
 * messages widget: a session, two rows (ids 1 and 2 — a person's, then a
 * character's), core's listed `edit` as a quick message action, a viewer,
 * and the `session_full` dossier core's widget reads its lines, its
 * composer and its turn from (row 3 is the reply the case streams in). Mount
 * a native copy and its remote each with a fresh call — C31 mounts every
 * module with these unless the host names its own.
 * @experimental
 */
export declare function componentParitySections(): Record<string, unknown>;
/**
 * A package's own built module, mounted by the host in a plugin's box (C31):
 * it mounts (the host's `mountComponent` resolved — the harness waits for
 * the component's ready), the guarded connection refused nothing it placed,
 * it raised no `ctx.error`, and it unmounts without throwing or raising one.
 * Behaviour is the package's own component tests'; this is the floor a
 * module must clear before any behaviour is worth asking about. Returns
 * advisories (an empty box).
 * @experimental
 */
export declare function componentMountCase(id: string, view: ComponentView): Promise<string[]>;
//# sourceMappingURL=components.d.ts.map