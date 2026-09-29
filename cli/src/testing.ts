/**
 * The component harness (§3.5, C3b): mount a component the way a session
 * page does — built by the same bundler, run in a worker by the same
 * runtime, mirrored through the host-element vocabulary — with a canned
 * context, and assert on the DOM the page would show.
 *
 * ```ts
 * import { mountComponent } from '@serene-pub/cli/testing'
 *
 * const view = await mountComponent({
 *   entry: 'components/who-next.ts',
 *   context: { messages: [{ id: 1, content: 'Hi' }] },
 * })
 * expect(view.query('p')?.textContent).toBe('1 messages')
 * await view.click('button')
 * expect(view.invoked).toEqual([{ key: 'advance' }])
 * await view.unmount()
 * ```
 *
 * A component that asks the page for something (`ctx.request`) is answered
 * by the test, as the page would answer it — and every ask is logged. A
 * plugin's box asks only what the SDK's askers table lets it: here the
 * `lore` grant, without which `session-entries` is declined unasked:
 *
 * ```ts
 * const view = await mountComponent({
 *   entry: 'components/lore.ts',
 *   grants: ['lore'],
 *   requests: (kind, params) =>
 *     kind === 'session-entries' ? { lorebookId: null, ownerOnly: false, rows: [], total: 0, offset: 0 } : undefined,
 * })
 * expect(view.requested).toEqual([{ kind: 'session-entries', params: { limit: 25 } }])
 * ```
 *
 * What the page adds that this does not: `sp-*` elements stay as
 * themselves (their attributes and children, not the app's rendering of
 * them), and the page's confirmations are not asked. What it keeps — the
 * base sections the widget `reads` and nothing else (R75), the page's invoke
 * gate (`invokeGate`: a plugin's box changes a message only with a person's
 * press in it, else `refusedInvokes`), ids prefixed per box (`idPrefix`) but
 * in core's conversation — and the page's own guard
 * (`guardedConnection`, which the page runs too): an element or attribute
 * outside the vocabulary never lands (see `refused`), a value the
 * vocabulary's rules refuse is dropped, what the component later writes into
 * a subtree that never landed is dropped with it, every record is judged
 * against what the receiver attached, and a box whose records the receiver
 * refused takes no more (said in `errors`, fatal); the page's rules for WHOSE
 * box it is hold — a plugin's unless `owner: 'core'`; events cross back as
 * the page's summary — a click on a button's label re-delivered to the
 * button, as the page re-delivers it — and what the component sends arrives
 * after the DOM changes of the turn that sent it, as on the page.
 *
 * Needs a DOM for the mirror: the test runner's (`environment: 'happy-dom'`
 * or `'jsdom'`), else `happy-dom` if installed.
 */
import { Worker, MessageChannel, type MessagePort } from 'node:worker_threads'
import { mkdir, rm, access, rename, readFile, copyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DOMRemoteReceiver } from '@remote-dom/core/receivers'
import {
	FN,
	REDELIVERED_EVENTS,
	isPersonGatedAction,
	personGateVerdict,
	personPressAfter,
	SP_HOST_ELEMENTS,
	guardedConnection,
	hostKeyEvent,
	keyedInputTarget,
	receiverElementPolicy,
	receiverNodeOf,
	redeliveredCopy,
	redeliveryTarget,
	type ComponentInvokeArgs,
	type ComponentSections,
	type FnHandle,
	type HostElementSpec,
	type RemoteEventDetail,
	type WidgetRequestKind,
	type WidgetBaseSection,
	type WidgetScope,
	type WidgetSectionScope,
	type WorkerToHost,
	WIDGET_BASE_SECTIONS,
	WIDGET_SCOPED_SECTIONS,
	componentBuiltAgainstFinding,
	componentModuleFindings,
	parseActionIdentity,
	projectMessageRow,
	widgetEventHeard,
	widgetReads,
	widgetRequestRefusal,
} from '@serene-pub/sdk'
import { bundleComponent, packageRoot } from './componentBundle.js'

/** @public The sections a test hands the component, as the page would push them. */
export type HarnessContext = Partial<Omit<ComponentSections, 'suspended' | 'grants'>>

/** @public */
export interface MountComponentOptions {
	/** The component's source (or a built module), relative to `root` or absolute. */
	entry: string
	/** The package root; the current directory when omitted. */
	root?: string
	/** What the page pushes once the component is ready. `locale` defaults to `en`. */
	context?: HarnessContext
	/** How long to wait for the component to mount. Default 10 s. */
	timeoutMs?: number
	/**
	 * Where built modules go: `<root>/node_modules/.cache/serene-pub-harness`
	 * by default, or one fixed directory under the OS temp dir when the
	 * package has no node_modules.
	 */
	cacheDir?: string
	/** Path aliases the source is written against (`{ $lib: … }`), for the bundler. */
	alias?: Record<string, string>
	/**
	 * Whose box the component is mounted in, as the page names it: a plugin's
	 * when omitted. `'core'` is core's own component, with core's box rules —
	 * it may place `sp-host-view`, `autofocus` and an `https:` or inline image
	 * `src` — which a plugin's box refuses (see `refused`).
	 */
	owner?: string
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
	requests?: (kind: WidgetRequestKind, params: Record<string, unknown>) => unknown
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
	grants?: WidgetScope[]
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
	reads?: readonly WidgetBaseSection[]
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
	invokeGate?: boolean
	/**
	 * Core's own conversation (the page's `/core-ui/messages`), with
	 * `owner: 'core'`: it keeps the ids its native copy had, because the page
	 * navigates by them. Every other box's ids — a plugin's, and each of
	 * core's other widgets — are prefixed per mount, as the page prefixes
	 * them (`idPrefix`).
	 */
	coreConversation?: boolean
	/**
	 * `entry` is an ALREADY-BUILT module, mounted byte for byte as a host
	 * serves it — never re-bundled. For a test that holds an artifact built
	 * long ago (a frozen fixture, a package's `dist/`) to today's host.
	 */
	built?: boolean
	/**
	 * The manifest entry's `builtAgainst` (F1): judged as a host judges it
	 * (`componentBuiltAgainstFinding`) before anything mounts — a component
	 * built for a protocol this host does not speak, or a vocabulary major it
	 * lacks, is refused with the host's sentence (thrown).
	 */
	builtAgainst?: unknown
}

/** @public */
export interface InvokeRecord extends ComponentInvokeArgs {
	key: string
}

/** @public An invoke the page's gate refused (`invokeGate`), and the page's reason. */
export interface RefusedInvokeRecord extends InvokeRecord {
	reason: string
}

/** @public One `ctx.request` the component made: its kind, and the params it sent. */
export interface RequestRecord {
	kind: string
	params: Record<string, unknown>
}

/** @public */
export interface MountedComponent {
	/** The mirrored box — what the page would show. */
	readonly root: Element
	html(): string
	query<E extends Element = Element>(selector: string): E | null
	queryAll<E extends Element = Element>(selector: string): E[]
	/** Push one section, as the page does when it changes. */
	push<K extends keyof HarnessContext>(section: K, value: HarnessContext[K]): Promise<void>
	/**
	 * Deliver a widget event (`ctx.onEvent`) — unless the page would not tell
	 * this box: a kind about scoped data the box's `grants` do not cover.
	 */
	event(event: unknown): Promise<void>
	/** Click an element: by selector, or one `queryAll` returned. */
	click(target: string | Element): Promise<void>
	/** Type into a control: its value, then an `input` event. */
	input(selector: string, value: string): Promise<void>
	/**
	 * Press a key on a control, as a person does: a `keydown` (`held` names
	 * the modifiers down with it). A plain `input` whose `keys` names the
	 * press raises `key` to the component, as the page raises it — and, as
	 * on the page, counts as a person pressing in the box for its invoke
	 * gate (`personGateVerdict`). Resolves
	 * to whether the press was kept from the field (its default prevented).
	 */
	pressKey(target: string | Element, key: string, held?: { shift?: boolean; ctrl?: boolean; meta?: boolean }): Promise<boolean>
	/** Tick or untick a checkbox or radio: its state, then a `change` event. */
	check(selector: string, checked?: boolean): Promise<void>
	/** Raise an sp element's own event (`change`, `open-change`, …) with its declared detail — by selector, or one `queryAll` returned. */
	dispatch(target: string | Element, type: string, detail?: unknown): Promise<void>
	/**
	 * Change the box's grants while it is mounted, as an admin's review does:
	 * the component is told (`ctx.grants`), a scoped section they no longer
	 * cover is withdrawn, and requests and events are judged by them from now
	 * on. A section newly covered arrives with the next `push('scoped', …)`.
	 */
	setGrants(grants: WidgetScope[]): Promise<void>
	/** Wait until the component has done everything it was prompted to. */
	settle(): Promise<void>
	/** Every `ctx.invoke` the page would carry out, in order (see `invokeGate`). */
	readonly invoked: InvokeRecord[]
	/** Every `ctx.invoke` the page's gate refused, in order, with its reason (see `invokeGate`). */
	readonly refusedInvokes: RefusedInvokeRecord[]
	/**
	 * What the box prefixes the component's ids with (`id`, `for`, `aria-*`
	 * references, a `#fragment`, a control's `name`) — unique per mount, as
	 * on the page; `''` for core's conversation (`coreConversation`).
	 * Query one by `#${view.idPrefix}name`.
	 */
	readonly idPrefix: string
	/** Every `ctx.saveState`, in order. */
	readonly saved: unknown[]
	/** Every `ctx.error`, in order. */
	readonly errors: Array<{ message: string; fatal: boolean }>
	/** Every `ctx.request`, in order — answered or not (see `requests`). */
	readonly requested: RequestRecord[]
	/** What the vocabulary refused — an element, an attribute, a value. */
	readonly refused: string[]
	unmount(): Promise<void>
}

// ─── the page's summary of an event ─────────────────────────────────────────

/** The page's summary of an event — never the event itself. */
function summarize(event: Event | undefined, type: string, Custom: typeof CustomEvent): RemoteEventDetail {
	const out: RemoteEventDetail = { type }
	if (!event) return out
	if (event instanceof Custom) {
		try {
			out.detail = structuredClone((event as CustomEvent).detail)
		} catch {
			/* not cloneable: no detail, as on the page */
		}
		return out
	}
	const t = event.target as HTMLInputElement | null
	if (t && (type === 'input' || type === 'change')) {
		if (typeof t.value === 'string') out.value = t.value
		if (t.type === 'checkbox' || t.type === 'radio') out.checked = !!t.checked
	}
	return out
}

// ─── the worker ─────────────────────────────────────────────────────────────

/** The worker bootstrap, bundled once per process per cache dir (the runtime ships as source). */
const workers = new Map<string, Promise<string>>()
function workerModule(cache: string): Promise<string> {
	let held = workers.get(cache)
	if (!held) {
		held = (async () => {
			const out = join(cache, 'harness-worker.mjs')
			// A path, never a `URL`: a DOM test environment replaces `URL` with its own.
			const here = dirname(fileURLToPath(import.meta.url))
			const js = join(here, 'testingWorker.js')
			const source = (await exists(js)) ? js : join(here, 'testingWorker.ts')
			const esbuild = await import('esbuild')
			// Written aside, then renamed: parallel test processes share the file.
			const aside = `${out}.${process.pid}-${randomUUID()}.tmp`
			await esbuild.build({
				entryPoints: [source],
				outfile: aside,
				bundle: true,
				format: 'esm',
				platform: 'node',
				target: 'node20',
				logLevel: 'silent',
				// A bundled CJS dependency still reaches for `require`.
				banner: {
					js: "import { createRequire as __spRequire } from 'node:module'; const require = __spRequire(import.meta.url);",
				},
			})
			await rename(aside, out)
			return out
		})()
		held.catch(() => workers.delete(cache))
		workers.set(cache, held)
	}
	return held
}

const exists = (p: string) =>
	access(p).then(
		() => true,
		() => false,
	)

/** Where a mount's built module and the worker bundle go. */
async function cacheDir(root: string, given?: string): Promise<string> {
	if (given) return given
	// Beside the package when it has a node_modules (a crashed run leaves
	// nothing where no one looks); else one fixed directory under the OS temp
	// dir — never a fresh one per run.
	const nm = join(root, 'node_modules')
	return (await exists(nm)) ? join(nm, '.cache', 'serene-pub-harness') : join(tmpdir(), 'serene-pub-harness')
}

// A happy-dom window lent to every mount that runs without a DOM, and taken
// back when the LAST of them leaves: concurrent mounts share it.
let lent: { document: Document; names: string[]; close?: () => void; users: number } | undefined

async function ensureDocument(): Promise<{ document: Document; restore: () => void }> {
	const g = globalThis as Record<string, unknown>
	if (lent) {
		lent.users++
		return { document: lent.document, restore: release }
	}
	if (g.document) return { document: g.document as Document, restore: () => {} }
	let HappyWindow: new () => Record<string, unknown> & { document: Document; close?: () => void }
	try {
		;({ Window: HappyWindow } = (await import('happy-dom')) as never)
	} catch {
		throw new Error(
			'mountComponent needs a DOM to mirror into: run it in a DOM test environment ' +
				"(vitest `environment: 'happy-dom'`), or install happy-dom",
		)
	}
	if (lent) {
		;(lent as { users: number }).users++
		return { document: (lent as { document: Document }).document, restore: release }
	}
	const win = new HappyWindow()
	// Remote DOM's receiver reads the DOM's globals, not only `document`:
	// lend the ones this runtime lacks.
	const names: string[] = []
	for (const name of ['document', ...DOM_GLOBALS])
		if (g[name] === undefined && win[name] !== undefined) {
			g[name] = win[name]
			names.push(name)
		}
	lent = { document: win.document, names, close: () => win.close?.(), users: 1 }
	return { document: win.document, restore: release }
}

function release() {
	if (!lent || --lent.users > 0) return
	const g = globalThis as Record<string, unknown>
	for (const name of lent.names) delete g[name]
	lent.close?.()
	lent = undefined
}

const DOM_GLOBALS = [
	'Node',
	'Element',
	'HTMLElement',
	'Text',
	'Comment',
	'CharacterData',
	'DocumentFragment',
	'MutationObserver',
	'Event',
	'CustomEvent',
]

/** The order the page's widget wire posts in (`push()`): saved state first, theme and locale last. */
const PUSH_ORDER: Array<keyof HarnessContext> = [
	'state',
	'session',
	'messages',
	'channels',
	'props',
	'settings',
	'actions',
	'annex',
	'layout',
	'theme',
	'locale',
	'viewer',
	'turnOrder',
	'scoped',
]

/**
 * The events the page's widget wire raises about a base section, and the
 * section each is about: a widget that does not read it is not told (R75).
 */
const READ_GATED_EVENTS: Readonly<Record<string, WidgetBaseSection>> = {
	'message:created': 'messages',
	'layout:changed': 'layout',
}

type ListedAction = { specSlug?: unknown; key?: unknown }

/**
 * The person-gated core action a key names, as the page resolves it: against the posted
 * `actions` venues (an identity, or the bare key's one carrier), else by the
 * key itself (`retry`, `core#retry`) — a harness is often posted no venues,
 * and on the page an unlisted key is never carried out at all.
 */
function gatedCoreAction(key: string, actions: unknown): { specSlug: string; key: string } | undefined {
	const listed: ListedAction[] = Object.values((actions ?? {}) as Record<string, { primary?: unknown; overflow?: unknown }>).flatMap(
		(v) => [...(Array.isArray(v?.primary) ? v.primary : []), ...(Array.isArray(v?.overflow) ? v.overflow : [])] as ListedAction[],
	)
	const parsed = parseActionIdentity(key)
	const found: ListedAction | undefined = parsed
		? (listed.find((a) => a.specSlug === parsed.specSlug && a.key === parsed.key) ?? parsed)
		: (listed.find((a) => a.key === key && a.specSlug === 'core') ?? listed.find((a) => a.key === key) ?? { specSlug: 'core', key })
	if (typeof found.specSlug !== 'string' || typeof found.key !== 'string') return undefined
	const action = { specSlug: found.specSlug, key: found.key }
	return isPersonGatedAction(action) ? action : undefined
}

// ─── mount ──────────────────────────────────────────────────────────────────

/** Boxes mounted so far in this process — the page numbers its boxes into their id prefix. */
let boxes = 0

/** @public */
export async function mountComponent(opts: MountComponentOptions): Promise<MountedComponent> {
	const entry = resolve(opts.root ?? process.cwd(), opts.entry)
	// What a host refuses before mounting (F1): a contract it no longer speaks.
	const incompatible = componentBuiltAgainstFinding(opts.builtAgainst)
	if (incompatible) throw new Error(`the component is not mounted: ${incompatible}`)
	if (opts.built && !(await exists(entry))) throw new Error(`no component at ${entry}`)
	// The package the component belongs to, as `serene-pub build` finds it —
	// its Svelte, its own files — unless the caller names one.
	const root = opts.root ? resolve(opts.root) : await packageRoot(entry)
	if (/\.m?js$/.test(entry) && !(await exists(entry))) throw new Error(`no component at ${entry}`)
	const cache = await cacheDir(root, opts.cacheDir)
	await mkdir(cache, { recursive: true })
	const built = join(cache, `component-${randomUUID()}.mjs`)

	// The box's grants, as the page holds them: core's with none given holds
	// every scope (core holds every scope it declares, and the harness cannot
	// see the declaration); a plugin's with none holds none.
	let currentGrants: WidgetScope[] =
		opts.owner === 'core' && opts.grants === undefined
			? (Object.keys(WIDGET_SCOPED_SECTIONS) as WidgetScope[])
			: [...(opts.grants ?? [])]
	const invoked: InvokeRecord[] = []
	const refusedInvokes: RefusedInvokeRecord[] = []
	const owner = opts.owner ?? 'plugin'
	/** The base sections the box is posted (R75), clamped as the page clamps them. */
	const reads = new Set<WidgetBaseSection>(widgetReads({ reads: opts.reads as WidgetBaseSection[] | undefined }))
	const gated = owner !== 'core' && opts.invokeGate !== false
	// When a person last acted in the box (a press the component heard), or
	// null — also once focus left it — as the page's `lastInteractionAt`.
	let lastPress: number | null = null
	/** The `actions` section as last posted: what an invoke is resolved against. */
	let postedActions: unknown = opts.context?.actions
	const saved: unknown[] = []
	const errors: Array<{ message: string; fatal: boolean }> = []
	const refused: string[] = []
	const requested: RequestRecord[] = []
	// Requests asked and not yet answered, by id → kind: declined at unmount.
	const unanswered = new Map<string, string>()
	// Answers posted so far: an answer prompts the component, so `settle` waits on it too.
	let replies = 0

	// Everything below is undone by `cleanup`, whichever step fails.
	let restore: (() => void) | undefined
	let box: Element | undefined
	let worker: Worker | undefined
	let controls: MutationObserver | undefined
	let port: MessagePort | undefined
	let clearCapture: (() => void) | undefined
	const cleanup = async () => {
		controls?.disconnect()
		clearCapture?.()
		port?.close()
		await worker?.terminate()
		box?.remove()
		restore?.()
		await rm(built, { force: true })
	}

	try {
		if (opts.built) await copyFile(entry, built)
		else await bundleComponent({ entry, outfile: built, root, alias: opts.alias })
		// Judged as a host judges it: what no page would load is not mounted here either.
		const { errors: findings } = componentModuleFindings(await readFile(built, 'utf8'))
		if (findings.length) throw new Error(`the built component would be refused: ${findings.join('; ')}`)
		const dom = await ensureDocument()
		restore = dom.restore
		const document = dom.document
		const win = document.defaultView as unknown as typeof globalThis
		const theBox = document.createElement('div')
		box = theBox
		theBox.setAttribute('data-sp-harness', '')
		document.body.appendChild(theBox)

		// The event each listener answers is the one of ITS type firing now —
		// a click on a checkbox fires `change` inside the `click` — caught on
		// the way down, as the page does (`currentEvent`).
		const current = new Map<string, Event>()
		const redelivered = new WeakSet<Event>()
		// The events the harness raises AS a person (`click`, `pressKey`,
		// `input`, `check`) — what the page tells by `isTrusted`.
		const personal = new WeakSet<Event>()
		const capture = (e: Event) => {
			// A re-delivered copy is not the person's event: theirs stays current.
			if (redelivered.has(e)) return
			current.set(e.type, e)
			setTimeout(() => current.get(e.type) === e && current.delete(e.type), 0)
		}
		// A click on a node that does not take it (a button's label, an icon)
		// re-delivered to the element that does, as the page re-delivers it —
		// the SDK's rule and copy, the page's. A copy is not re-delivered again.
		const redeliver = (e: Event) => {
			if (redelivered.has(e) || !e.target) return
			const to = redeliveryTarget(e.target as Node, e.type, theBox)
			if (!to) return
			capture(e)
			const copy = redeliveredCopy(e)
			redelivered.add(copy)
			to.dispatchEvent(copy)
			if (copy.defaultPrevented) e.preventDefault()
		}
		// A press a plain `input`'s `keys` names, kept from the field and
		// raised on it as `key` — the SDK's reading and event, the page's. A
		// person's press opens the box's invoke window, as the page vouches a
		// trusted one (the raised `key` itself is no person's event).
		const raiseKey = (e: Event) => {
			const to = keyedInputTarget(e as KeyboardEvent, theBox)
			if (!to) return
			e.preventDefault()
			lastPress = personPressAfter('keydown', personal.has(e), lastPress, Date.now())
			to.dispatchEvent(hostKeyEvent(e as KeyboardEvent))
		}
		const types = new Set(Object.values(SP_HOST_ELEMENTS as Record<string, HostElementSpec>).flatMap((s) => s.events))
		for (const t of types) theBox.addEventListener(t, capture, true)
		for (const t of REDELIVERED_EVENTS) document.addEventListener(t, redeliver, true)
		theBox.addEventListener('keydown', raiseKey, true)
		clearCapture = () => {
			for (const t of types) theBox.removeEventListener(t, capture, true)
			for (const t of REDELIVERED_EVENTS) document.removeEventListener(t, redeliver, true)
			theBox.removeEventListener('keydown', raiseKey, true)
		}

		const theWorker = new Worker(await workerModule(cache))
		worker = theWorker
		const mountId = randomUUID()
		// The page's rule for whose ids are whose: every box's are prefixed per
		// mount — a plugin's, and each of core's widgets' — but core's own
		// conversation, which the page navigates by its native ids.
		const idPrefix = owner === 'core' && opts.coreConversation ? '' : `sp-r${++boxes}-${mountId.slice(0, 8)}-`
		const fnFor = (handle: FnHandle, event: string) => () => {
			// As the page's `interactionAfter`: a person's press opens the
			// invoke window, a synthetic event leaves it, a `blur` closes it.
			const e = current.get(event)
			lastPress = personPressAfter(event, !!e && personal.has(e), lastPress, Date.now())
			theWorker.postMessage({
				k: 'fn',
				mountId,
				id: handle[FN],
				detail: summarize(current.get(event), event, win.CustomEvent),
			})
		}
		// The page's guard, by the page's own call: judged against what the
		// receiver attached, ids the component's own (the page prefixes them
		// per box), each refusal listed as its sentence.
		const receiver = new DOMRemoteReceiver({ root: theBox, elements: receiverElementPolicy() })
		const connection = guardedConnection(receiver.connection, receiverNodeOf(receiver), {
			owner,
			idPrefix,
			fnFor,
			refuse: (r) => refused.push(r.finding),
		})

		// A control's value written by the component is its LIVE value, as the page makes it.
		const sync = (el: Element, name: string | null) => {
			if (el.localName !== 'input' && el.localName !== 'textarea') return
			const c = el as HTMLInputElement
			if (name !== 'checked') {
				const v = el.getAttribute('value')
				if (v !== null && c.value !== v) c.value = v
			}
			if (name !== 'value' && el.localName === 'input') c.checked = el.hasAttribute('checked')
		}
		controls = new win.MutationObserver((records) => {
			for (const r of records)
				if (r.type === 'attributes') sync(r.target as Element, r.attributeName)
				else
					for (const n of r.addedNodes)
						if (n.nodeType === 1) {
							sync(n as Element, null)
							;(n as Element).querySelectorAll('input, textarea').forEach((c) => sync(c, null))
						}
		})
		controls.observe(theBox, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'checked'] })

		let mutations = 0
		let pongs = 0
		const pongWaiters = new Map<number, { resolve: () => void; reject: (e: Error) => void }>()
		let dead: Error | undefined
		let onReady: (() => void) | undefined
		let onFail: ((e: Error) => void) | undefined
		const die = (e: Error) => {
			dead ??= e
			onFail?.(e)
			for (const w of pongWaiters.values()) w.reject(e)
			pongWaiters.clear()
		}

		// The page's answers to what the component asks, on the mount's port.
		// Each answers once, and never after the harness let go of the port.
		const reply = (requestId: string, m: Record<string, unknown>) => {
			if (!unanswered.delete(requestId)) return
			replies++
			port?.postMessage({ requestId, ...m })
		}
		const decline = (requestId: string, kind: string, why: string) => {
			// `messages` declines silently, as the page's does (the frame
			// protocol's rule): it waits, and is declined at unmount.
			if (kind !== 'messages') reply(requestId, { t: 'response', ok: false, error: why })
		}
		const answer = (m: Record<string, unknown>) => {
			const requestId = String(m.requestId)
			const kind = String(m.what)
			// `messages` carries its params at the top level; every other kind in `params`.
			const params: Record<string, unknown> =
				kind === 'messages'
					? Object.fromEntries(
							(['channel', 'cursor', 'limit'] as const).filter((k) => m[k] !== undefined).map((k) => [k, m[k]]),
						)
					: m.params && typeof m.params === 'object'
						? (m.params as Record<string, unknown>)
						: {}
			requested.push({ kind, params })
			unanswered.set(requestId, kind)
			const refusal = widgetRequestRefusal(kind, {
				owner,
				grants: currentGrants,
			})
			if (refusal) return decline(requestId, kind, refusal)
			if (!opts.requests) return
			let out: unknown
			try {
				out = opts.requests(kind as WidgetRequestKind, params)
			} catch (e) {
				return decline(requestId, kind, (e as Error)?.message ?? String(e))
			}
			Promise.resolve(out).then(
				(result) => {
					if (kind !== 'messages') return reply(requestId, { t: 'response', ok: true, result })
					const page = (result ?? {}) as { rows?: unknown[]; nextCursor?: string }
					// The page strips host bookkeeping off every row it posts (`MESSAGE_HOST_FIELDS`).
					reply(requestId, { t: 'page', rows: (page.rows ?? []).map(projectMessageRow), nextCursor: page.nextCursor })
				},
				(e) => decline(requestId, kind, (e as Error)?.message ?? String(e)),
			)
		}

		// What the component sent on its port: on the worker channel (`wire`),
		// behind the DOM changes of its turn — or on the port, from a worker
		// that predates that.
		const onWire = (m: Record<string, unknown>) => {
			if (!m || typeof m !== 'object') return
			if (m.t === 'ready') onReady?.()
			else if (m.t === 'invoke') {
				const { t: _t, ...rest } = m
				const record = rest as unknown as InvokeRecord
				// The page's gate: a verb that changes a message, from a box that
				// is not core's, needs a person acting in the box right now.
				const action = gated ? gatedCoreAction(String(record.key), postedActions) : undefined
				const verdict = action ? personGateVerdict(action, lastPress, Date.now()) : { allowed: true as const }
				if (!verdict.allowed) refusedInvokes.push({ ...record, reason: verdict.reason })
				else invoked.push(record)
			} else if (m.t === 'save-state') saved.push(m.state)
			else if (m.t === 'error') errors.push({ message: String(m.message), fatal: !!m.fatal })
			else if (m.t === 'request' && typeof m.requestId === 'string') answer(m)
		}

		theWorker.on('message', (m: WorkerToHost | { k: 'pong'; n: number }) => {
			if (m.k === 'pong') {
				pongWaiters.get(m.n)?.resolve()
				pongWaiters.delete(m.n)
			} else if (m.k === 'mutate') {
				mutations++
				try {
					connection.mutate(m.records as never)
				} catch (e) {
					// As the page: a box that no longer matches the component stops, and says so.
					errors.push({ message: `the page could not show what the component sent: ${(e as Error).message}`, fatal: true })
				}
			} else if (m.k === 'wire') onWire(m.msg as Record<string, unknown>)
			else if (m.k === 'error') errors.push({ message: m.message, fatal: false })
			else if (m.k === 'failed') die(new Error(`the component did not mount: ${m.message}`))
		})
		theWorker.on('error', (e) => die(e))
		theWorker.on('exit', (code) => die(new Error(`the component's worker exited (${code})`)))

		const channel = new MessageChannel()
		port = channel.port1
		port.on('message', onWire)

		const ready = new Promise<void>((res, rej) => {
			onReady = res
			onFail = rej
		})
		theWorker.postMessage({ k: 'mount', mountId, entry: pathToFileURL(built).href, port: channel.port2 }, [channel.port2])

		const timeout = opts.timeoutMs ?? 10_000
		let timer: NodeJS.Timeout | undefined
		try {
			await Promise.race([
				ready,
				new Promise<never>((_, rej) => {
					timer = setTimeout(() => rej(new Error(`the component did not mount within ${timeout} ms`)), timeout)
				}),
			])
		} finally {
			clearTimeout(timer)
		}
		onFail = undefined

		const thePort = port
		const post = (m: Record<string, unknown>) => thePort.postMessage(m)
		const macrotask = () => new Promise<void>((r) => setTimeout(r, 0))
		const settle = async () => {
			// Until a round trip brings nothing new: a change can prompt another,
			// and so can an answer to a request (`requests`). What the component
			// schedules for LATER (a timer, an answer your `requests` gives
			// later) is not waited for.
			for (let i = 0; i < 50; i++) {
				if (dead) throw dead
				await macrotask()
				const before = mutations
				const answered = replies
				const n = ++pongs
				await new Promise<void>((resolve, reject) => {
					pongWaiters.set(n, { resolve, reject })
					theWorker.postMessage({ k: 'ping', n })
				})
				await macrotask()
				if (mutations === before && replies === answered) return
			}
		}
		// The scoped sections this box may hold, by posted name: those its
		// grants cover — the page never posts a section past its grant, core's
		// widget included (it is posted its declared scopes' sections), so
		// neither does the harness. Core's box with no `grants` holds every
		// one: core holds every scope it declares, and the harness cannot see
		// the declaration.
		// The scopes the box holds that deliver a section, as the page tells
		// the component (`grants`) — `channel:<slug>` is not one.
		const heldScopes = (): WidgetSectionScope[] =>
			currentGrants.filter((scope): scope is WidgetSectionScope => Object.hasOwn(WIDGET_SCOPED_SECTIONS, scope))
		const heldSections = new Set<string>(heldScopes().map((scope) => WIDGET_SCOPED_SECTIONS[scope]))
		/** The scoped sections posted and not withdrawn — what a narrower grant takes back. */
		const postedScoped = new Set<string>()
		const pushSection = (section: string, value: unknown) => {
			// A base section the widget does not read is never posted (R75) —
			// the lanes (`channels`) are the `messages` section, as the page posts them.
			const base = section === 'channels' ? 'messages' : section
			if ((WIDGET_BASE_SECTIONS as readonly string[]).includes(base) && !reads.has(base as WidgetBaseSection)) return
			if (section === 'actions') postedActions = value
			switch (section) {
				// Rows as the page posts them: host bookkeeping stripped (`MESSAGE_HOST_FIELDS`),
				// so a test cannot pass on a field a real session never sends.
				case 'messages':
					return post({ t: 'messages', messages: Array.isArray(value) ? value.map(projectMessageRow) : value })
				case 'channels':
					for (const [channel, messages] of Object.entries((value ?? {}) as Record<string, unknown[]>))
						post({ t: 'channel', channel, messages: (messages ?? []).map(projectMessageRow) })
					return
				case 'scoped':
					for (const [name, v] of Object.entries((value ?? {}) as Record<string, unknown>))
						if (heldSections.has(name)) {
							post({ t: 'scoped', section: name, value: v })
							if (v === null) postedScoped.delete(name)
							else postedScoped.add(name)
						}
					return
				case 'turnOrder':
					return post({ t: 'turn-order', turnOrder: value })
				case 'theme': {
					const t = value as { theme: string; mode: string }
					return post({ t: 'theme', theme: t.theme, mode: t.mode })
				}
				default:
					return post({ t: section, [section]: value })
			}
		}

		// What the page posts once the component says it is ready, in the page's order.
		const initial: HarnessContext = { theme: { theme: '', mode: 'light' }, locale: 'en', ...opts.context }
		for (const section of PUSH_ORDER) {
			if (initial[section] !== undefined) pushSection(section, initial[section])
			// The grants after saved state, before any section — as the page posts them.
			if (section === 'state') post({ t: 'grants', grants: heldScopes() })
		}
		await settle()

		const target = (selector: string | Element) => {
			if (typeof selector !== 'string') return selector
			const el = theBox.querySelector(selector)
			if (!el) throw new Error(`nothing matches '${selector}' in the mirrored component`)
			return el
		}
		const person = <E extends Event>(event: E): E => {
			personal.add(event)
			return event
		}
		const raise = async (el: Element, event: Event) => {
			el.dispatchEvent(event)
			await settle()
		}

		return {
			root: theBox,
			html: () => theBox.innerHTML,
			query: <E extends Element = Element>(s: string) => theBox.querySelector(s) as E | null,
			queryAll: <E extends Element = Element>(s: string) => [...theBox.querySelectorAll(s)] as E[],
			async push(section, value) {
				pushSection(section as string, value)
				await settle()
			},
			async event(event) {
				// As the page tells a box: a kind about scoped data only past its grant.
				const kind = (event as { kind?: unknown } | null)?.kind
				// And one about a base section only to a widget that reads it (R75).
				const about = typeof kind === 'string' && Object.hasOwn(READ_GATED_EVENTS, kind) ? READ_GATED_EVENTS[kind] : undefined
				if (
					(about === undefined || reads.has(about)) &&
					(typeof kind !== 'string' || widgetEventHeard(kind, { owner, grants: currentGrants }))
				)
					post({ t: 'event', event })
				await settle()
			},
			async setGrants(grants) {
				currentGrants = [...grants]
				heldSections.clear()
				for (const scope of heldScopes()) heldSections.add(WIDGET_SCOPED_SECTIONS[scope])
				post({ t: 'grants', grants: heldScopes() })
				// A worker keeps nothing it may no longer see, as the page withdraws it.
				for (const name of [...postedScoped])
					if (!heldSections.has(name)) {
						post({ t: 'scoped', section: name, value: null })
						postedScoped.delete(name)
					}
				await settle()
			},
			click: (s) => raise(target(s), person(new win.MouseEvent('click', { bubbles: true, cancelable: true }))),
			async input(s, value) {
				const el = target(s) as HTMLInputElement
				el.value = value
				await raise(el, person(new win.Event('input', { bubbles: true })))
			},
			async pressKey(s, key, held = {}) {
				const press = new win.KeyboardEvent('keydown', {
					key,
					shiftKey: !!held.shift,
					ctrlKey: !!held.ctrl,
					metaKey: !!held.meta,
					bubbles: true,
					cancelable: true,
				})
				await raise(target(s), person(press))
				return press.defaultPrevented
			},
			async check(s, checked = true) {
				const el = target(s) as HTMLInputElement
				el.checked = checked
				await raise(el, person(new win.Event('change', { bubbles: true })))
			},
			dispatch(s, type, detail) {
				const el = target(s)
				// An sp element's own event is the element's, not a person's — but
				// a document's press arriving as an `sp-frame`'s `invoke` is a
				// person's inside it, which the page vouches for at the box's gate.
				if (type === 'invoke' && el.localName === 'sp-frame') lastPress = Date.now()
				return raise(el, new win.CustomEvent(type, { detail, bubbles: true }))
			},
			settle,
			invoked,
			refusedInvokes,
			idPrefix,
			saved,
			errors,
			refused,
			requested,
			unmount: async () => {
				if (!dead) {
					// What nobody answered is declined first, while the
					// component is still mounted to hear it.
					if (unanswered.size) {
						for (const requestId of [...unanswered.keys()])
							reply(requestId, {
								t: 'response',
								ok: false,
								error: 'the page was unmounted before it answered',
								code: 'unmounted',
							})
						await settle().catch(() => {})
					}
					theWorker.postMessage({ k: 'unmount', mountId })
					await settle().catch(() => {})
				}
				unanswered.clear()
				await cleanup()
			},
		}
	} catch (e) {
		await cleanup()
		throw e
	}
}
