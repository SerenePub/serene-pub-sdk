/**
 * Components (§3.5, C4 / C30): what a host must do with a remote component,
 * as cases a host is run through — the built module's own findings, the
 * protocol round trip, and parity between a widget's native copy and a
 * remote built from the same source.
 */
import { componentModuleFindings } from '@serene-pub/sdk';
/**
 * The kit's own component, already built: plain ES, no imports — the
 * protocol with nothing else in the way. It counts the messages it is
 * pushed, continues on a click, and tries one element no page takes.
 * @experimental
 */
export const COMPONENT_PROTOCOL_FIXTURE = `export default (root, ctx) => {
	const count = document.createElement('p')
	count.setAttribute('class', 'kit-count')
	const go = document.createElement('button')
	go.setAttribute('type', 'button')
	go.setAttribute('class', 'kit-go')
	go.textContent = 'Continue'
	go.addEventListener('click', () => ctx.invoke('advance'))
	const sneaky = document.createElement('script')
	sneaky.textContent = 'globalThis.kitRan = true'
	root.append(count, go, sneaky)
	const draw = () => { count.textContent = String((ctx.messages ?? []).length) }
	draw()
	return ctx.subscribe(draw)
}
`;
const must = (cond, message) => {
    if (!cond)
        throw new Error(message);
};
/** @experimental The built module's own findings: its errors fail it; its advisories are said. */
export function judgeComponentModule(id, code) {
    const { errors, advisories } = componentModuleFindings(code);
    must(!errors.length, `component '${id}': ${errors.join('; ')}`);
    return advisories.map((a) => `component '${id}': ${a}`);
}
/** @experimental The protocol round trip, over a view of the fixture a host mounted. */
export async function componentProtocolCase(view) {
    const count = () => view.queryAll('.kit-count')[0]?.textContent;
    must(count() === '0', `the fixture should render its count ('0'), got ${JSON.stringify(count())}`);
    await view.push('messages', [{ id: 1, role: 'user', content: 'a' }, { id: 2, role: 'assistant', content: 'b' }]);
    must(count() === '2', `a pushed section must reach the component and its redraw the page — count is ${JSON.stringify(count())}`);
    await view.click('.kit-go');
    must(view.invoked.length === 1 && view.invoked[0].key === 'advance', `a click must cross to the component and its invoke back to the host — invoked ${JSON.stringify(view.invoked)}`);
    must(!view.queryAll('script').length, 'an element outside the vocabulary landed in the page (<script>)');
    must(view.refused.some((r) => r.includes('script')), 'an element outside the vocabulary was dropped without being said');
}
/** A row's edit field: the page's composer field, or a plain textarea. */
const EDIT_FIELD = 'sp-composer-field, textarea';
/**
 * Type into a row's edit field the way the page delivers typing: the page's
 * `sp-composer-field` raises its own `input` with `{ value }` (through
 * `dispatch`); a plain `textarea` takes a value and a DOM `input`.
 */
async function editField(v, field, value, which) {
    if (field.tagName.toLowerCase() === 'textarea') {
        field.setAttribute('data-kit-edit', '');
        try {
            return await v.input('[data-kit-edit]', value);
        }
        finally {
            field.removeAttribute('data-kit-edit');
        }
    }
    must(v.dispatch, `the row's field is the page's sp-composer-field, and the ${which} view offers no dispatch() to raise its input — ` +
        `supply ComponentView.dispatch (the SDK harness's does)`);
    await v.dispatch(field, 'input', { value });
}
const row = (id, role, content, extra = {}) => ({
    id,
    role,
    content,
    channel: 'main',
    createdAt: '2026-09-24T10:00:00Z',
    ...extra,
});
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
export async function componentParityCase(native, remote) {
    const bodies = (v) => v.queryAll('sp-message-body').map((b) => b.getAttribute('text'));
    const streaming = (v) => !!v.queryAll('sp-message-body').at(-1)?.hasAttribute('streaming');
    /**
     * Each row's structure, as a person meets it: who speaks, in what role,
     * the text, and the controls it offers — the same for both copies, or the
     * cutover changes what people see.
     */
    const rows = (v) => v.queryAll('[data-widget-part~="messages.message"]').map((m) => ({
        role: m.getAttribute('data-msg-role'),
        author: m.getAttribute('data-msg-author'),
        name: m.querySelector('[data-widget-part~="messages.message-name"]')?.textContent?.trim() ?? null,
        text: m.querySelector('sp-message-body')?.getAttribute('text') ?? null,
        controls: [...m.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')),
    }));
    const same = (what, a, b) => must(JSON.stringify(a) === JSON.stringify(b), `${what} differ: native ${JSON.stringify(a)}, remote ${JSON.stringify(b)}`);
    const expect = (what, v, got, want) => must(JSON.stringify(got) === JSON.stringify(want), `${what} (${v === native ? 'native' : 'remote'}): ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    same('the rows', rows(native), rows(remote));
    for (const v of [native, remote])
        expect('the rendered bodies', v, bodies(v), ['Hello there', 'Hi!']);
    const steps = [
        [[row(1, 'user', 'Hello there'), row(2, 'assistant', 'Hi!'), row(3, 'assistant', 'Once', { isGenerating: true })], ['Hello there', 'Hi!', 'Once'], true],
        [[row(1, 'user', 'Hello there'), row(2, 'assistant', 'Hi!'), row(3, 'assistant', 'Once upon a time.')], ['Hello there', 'Hi!', 'Once upon a time.'], false],
    ];
    for (const [messages, want, generating] of steps) {
        await native.push('messages', messages);
        await remote.push('messages', messages);
        for (const v of [native, remote]) {
            expect('a streamed reply', v, bodies(v), want);
            expect('the streaming mark on the reply', v, streaming(v), generating);
        }
        same('the rows while streaming', rows(native), rows(remote));
    }
    for (const v of [native, remote]) {
        const which = v === native ? 'native' : 'remote';
        const second = () => v.queryAll('[data-widget-part~="messages.message"]')[1];
        const edit = second()?.querySelector('button[aria-label="Edit"]');
        must(edit, `the second row offers no quick Edit (${which})`);
        await v.click(edit);
        const fields = second()?.querySelectorAll(EDIT_FIELD) ?? [];
        must(fields.length === 1, `Edit opened no field in the row (${which}) — looked for ${EDIT_FIELD}`);
        await editField(v, fields[0], 'Hi, friend!', which);
        const save = [...(second()?.querySelectorAll('button') ?? [])].find((b) => /^\s*save\s*$/i.test(b.textContent ?? ''));
        must(save, `editing offers no Save in the row (${which})`);
        await v.click(save);
        must(!second()?.querySelector(EDIT_FIELD), `Save left the field open (${which})`);
    }
    const edits = (v) => v.invoked.filter((i) => i.key === 'edit');
    for (const v of [native, remote])
        expect('the edit the host was asked for', v, edits(v), [{ key: 'edit', messageId: 2, payload: { content: 'Hi, friend!' } }]);
}
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
export function componentParitySections() {
    const at = '2026-09-24T10:00:00Z';
    const line = (name, ref) => ({
        controllable: true,
        speaker: { name, ref, face: null, sprite: null },
        swipes: { show: false, right: false },
        embedding: 'hidden',
    });
    return {
        session: { id: 1, name: 'Parity' },
        messages: [
            row(1, 'user', 'Hello there', { characterId: null, personaId: 9, createdAt: at }),
            row(2, 'assistant', 'Hi!', { characterId: 3, personaId: null, createdAt: at }),
        ],
        settings: {},
        actions: {
            message: {
                primary: [
                    {
                        key: 'edit',
                        specSlug: 'core',
                        name: 'Edit',
                        icon: 'pencil',
                        slash: 'edit',
                        audience: { see: ['participant'], act: ['item'] },
                        venue: 'message',
                        origin: 'core',
                        canAct: true,
                        itemGated: true,
                        isNew: false,
                        enabled: true,
                        quick: true,
                    },
                ],
                overflow: [],
            },
        },
        viewer: { userId: 7, isAdmin: false, isGuest: false },
        scoped: {
            session_full: {
                sessionId: 1,
                lines: { 1: line('Pip', 'character:9'), 2: line('Bell', 'character:3'), 3: line('Bell', 'character:3') },
                scenes: [],
                scened: [],
                hasOlder: false,
                loadingOlder: false,
                isOwner: true,
                cast: { sessionPersonas: [], sessionCharacters: [] },
                writes: { scenes: false, lore: false },
                debugPrompts: false,
                selectForSummary: 0,
                summaryEnded: 0,
                composer: {
                    draft: { content: '', write: 0 },
                    personas: [{ personaId: 9, name: 'Pip' }],
                    personaId: 9,
                    addPersona: false,
                    hidden: false,
                    channels: ['main'],
                    usage: null,
                    tabs: [],
                    actions: false,
                    notice: false,
                    overflow: [],
                    palette: [],
                    newest: null,
                    sendTonal: false,
                },
                turn: { order: [], candidates: [], show: false, canChoose: false },
                readOnly: null,
                state: { ledgers: {}, pending: {}, waiting: [] },
                backdrop: false,
            },
        },
    };
}
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
export async function componentMountCase(id, view) {
    const notes = [];
    let unmounted = false;
    try {
        await view.settle?.();
        must(!view.refused.length, `component '${id}': the page refused what it placed — ${view.refused.join('; ')}. A plugin's box takes the ` +
            `host-element vocabulary only; move what was refused inside it`);
        must(view.errors, `component '${id}': the view reports no errors — supply ComponentView.errors (the SDK harness's does)`);
        must(!view.errors.length, `component '${id}': it raised ${view.errors.map((e) => `${e.fatal ? 'a fatal' : 'an'} error '${e.message}'`).join(', ')} on mount`);
        if (!view.html().trim())
            notes.push(`component '${id}': mounted with the kit's sections and rendered nothing`);
        unmounted = true;
        try {
            await view.unmount();
        }
        catch (e) {
            throw new Error(`component '${id}': it did not unmount cleanly — ${e.message}`);
        }
        must(!view.errors.length, `component '${id}': it raised ${view.errors.map((e) => `'${e.message}'`).join(', ')} while unmounting`);
    }
    catch (e) {
        if (!unmounted)
            await view.unmount().catch(() => { });
        throw e;
    }
    return notes;
}
//# sourceMappingURL=components.js.map