/**
 * The UI worker's runtime (§3.5, C2/C3b): a component's side of the page.
 * Loads Remote DOM's DOM polyfill, forwards every event an element can
 * raise, gives controls their live `value`/`checked`, and runs each mount
 * against its own root and context — whose messages leave behind the DOM
 * changes of the turn that sent them (`wire`).
 *
 * The HOST's runtime, not a component's: the app's UI worker and the
 * component harness (`@serene-pub/cli/testing`) start it, and a component
 * never imports it (the build refuses anything that lands in `@remote-dom`).
 * What a worker must NOT have — network, storage — is the starter's to
 * strip before it runs any component.
 */
import { hooks } from '@remote-dom/core/polyfill'
import {
	BatchingRemoteConnection,
	RemoteRootElement,
	updateRemoteElementAttribute,
	updateRemoteElementEventListener,
} from '@remote-dom/core/elements'
import {
	SP_ELEMENT_TAGS,
	SP_HOST_ELEMENTS,
	createComponentContext,
	encodeFns,
	type ComponentMountFn,
	type ComponentPort,
	type HostElementSpec,
	type HostToWorker,
	type RemoteEventDetail,
	type WorkerToHost,
} from '@serene-pub/sdk'

if (!customElements.get('remote-root')) customElements.define('remote-root', RemoteRootElement)

// Svelte writes an attribute of a custom element through the element's
// SETTER only when its tag is registered (`set_custom_element_data`); an
// unregistered `sp-*` took every value as a string, so `hidden={false}`
// landed on the page as `hidden="false"` — hidden. A stub per tag (the host
// renders them; nothing here does) sends Svelte to the setters: the boolean
// shims below for `hidden`, `inert`, `disabled`, `open`…, and the attribute,
// as before, for a value no setter takes (`value`, `text`, `tone`).
for (const tag of SP_ELEMENT_TAGS)
	if (!customElements.get(tag)) customElements.define(tag, class extends HTMLElement {})

// Classes Svelte's runtime tests against (`instanceof HTMLMediaElement`)
// that the polyfill does not define: a stand-in nothing is an instance of,
// so the test answers no, as it would for every element a worker makes.
for (const name of ['HTMLMediaElement', 'HTMLVideoElement', 'HTMLAudioElement'])
	if (!(name in globalThis))
		Object.defineProperty(globalThis, name, {
			value: class {},
			configurable: true,
			writable: true,
		})

// The polyfill's HTML parser reads an EMPTY comment (`<!---->`) as text and
// throws on it (`decodeCharacterReferences(undefined)` — its comment branch
// tests the comment's text for truthiness). Svelte writes its block anchors
// as exactly that, so every component with an `{#if}` failed to mount. The
// text MATTERS to Svelte (`first_child` skips a comment whose data is ''), so
// an anchor is parsed under a marker and emptied again once it is a node.
{
	const MARK = '__sp_empty_anchor__'
	let proto: object | null = Object.getPrototypeOf(document.createElement('template'))
	let found: PropertyDescriptor | undefined
	while (proto && !(found = Object.getOwnPropertyDescriptor(proto, 'innerHTML')))
		proto = Object.getPrototypeOf(proto)
	const set = found?.set
	const empty = (node: Node) => {
		for (let n = node.firstChild; n; n = n.nextSibling) {
			if (n.nodeType === 8 && (n as Comment).data === MARK) (n as Comment).data = ''
			else if (n.firstChild) empty(n)
		}
	}
	if (proto && found && set)
		Object.defineProperty(proto, 'innerHTML', {
			...found,
			set(this: Element, html: string) {
				const text = String(html)
				set.call(
					this,
					text.includes('<!---->') ? text.replaceAll('<!---->', `<!--${MARK}-->`) : text,
				)
				if (text.includes('<!---->'))
					empty((this as unknown as HTMLTemplateElement).content ?? this)
			},
		})
}

// Remote DOM forwards attributes only for plain elements and leaves custom
// ones to their own classes; the vocabulary's `sp-*` elements have none here
// — they are the host's — so every element's attributes are forwarded.
//
// One exception, `quiet`: a control's DEFAULT written while it holds a live
// value stays the worker's own attribute (see `controlState`).
let quiet: Element | undefined
hooks.setAttribute = (element: Element, name: string, value: string) => {
	if (element !== quiet) updateRemoteElementAttribute(element, name, value)
}
hooks.removeAttribute = (element: Element, name: string) => {
	if (element !== quiet) updateRemoteElementAttribute(element, name)
}

// Every event an element can raise (the vocabulary's list) is forwarded to
// the host when the element is CREATED, not when someone listens: Svelte
// attaches no listener to a button — it delegates `click` to its mount root
// and walks the bubbling event — so a listener-driven forward would never
// hear of it. The host calls back with its summary, redispatched here as a
// BUBBLING `CustomEvent` whose `detail` is the declared detail (`{ value }`
// for a control), which is what a delegated handler catches on its way up.
const forwarded = new WeakMap<Element, Set<string>>()
function forwardEvents(el: Element) {
	if (!el || typeof el.localName !== 'string') return
	const spec = (SP_HOST_ELEMENTS as Record<string, HostElementSpec>)[el.localName]
	if (!spec) return
	const control = !forwarded.has(el) ? controlState(el) : undefined
	const seen = forwarded.get(el) ?? new Set<string>()
	for (const type of spec.events) {
		if (seen.has(type)) continue
		seen.add(type)
		updateRemoteElementEventListener(el, type, (d: RemoteEventDetail) => {
			// The page's value first, so `bind:value` and `e.target.value` read it.
			if (d?.value !== undefined || d?.checked !== undefined)
				(control ?? controls.get(el))?.heard(d.value, d.checked)
			const detail =
				d?.detail !== undefined
					? d.detail
					: d?.value !== undefined || d?.checked !== undefined
						? { value: d.value, checked: d.checked }
						: undefined
			el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }))
		})
	}
	forwarded.set(el, seen)
}

// A control's live `value`/`checked` are PROPERTIES — what Svelte writes
// (`set_value`, `bind:value`) and reads back. The polyfill has neither, so an
// input and a textarea get them here: a write is sent as the attribute (the
// page's receiver turns it back into the property), and what the person
// typed arrives with the event and is held without echoing it back.
interface ControlState {
	heard(value: unknown, checked: unknown): void
}
const controls = new WeakMap<Element, ControlState>()
function controlState(el: Element): ControlState | undefined {
	if (el.localName !== 'input' && el.localName !== 'textarea') return undefined
	let value: string | undefined
	let checked: boolean | undefined
	// Remote DOM sends an attribute only when it differs from the last one
	// SENT; once the person has typed or ticked, that is no longer what the
	// page shows, so the next write first sets the record to the OPPOSITE of
	// its target — else 'empty the field after send' matches the stale '' and
	// is never sent, and a tick the component undoes (`checked` absent onto
	// an absent record) never unticks the page's box.
	const heard = { value: false, checked: false }
	const send = (name: 'value' | 'checked', v: string | undefined) => {
		if (heard[name]) updateRemoteElementAttribute(el, name, v === undefined ? '' : undefined)
		heard[name] = false
		updateRemoteElementAttribute(el, name, v)
	}
	const attr = (name: string) => el.getAttribute(name)
	/** Write this element's attributes here only (not to the page) while `dirty`. */
	const withheld = (dirty: boolean, write: () => void) => {
		if (!dirty) return write()
		quiet = el
		try {
			write()
		} finally {
			quiet = undefined
		}
	}
	Object.defineProperties(el, {
		value: {
			configurable: true,
			get: () => value ?? attr('value') ?? '',
			set(v: unknown) {
				value = v == null ? '' : String(v)
				send('value', value)
			},
		},
		// The DEFAULT is the attribute, written without touching the live value
		// held above — Svelte assigns it (a spread losing its `value`, `<input
		// defaultValue>`), and an accessor without a setter threw at that. On
		// the page the attribute IS the live value, so once the control holds
		// one (dirty) the default stays here: Svelte re-assigns `defaultValue`
		// in the same effect as the rest of the template, every keystroke, and
		// a forwarded default would overwrite what the person typed.
		defaultValue: {
			configurable: true,
			get: () => attr('value') ?? '',
			set(v: unknown) {
				withheld(value !== undefined, () =>
					v == null ? el.removeAttribute('value') : el.setAttribute('value', String(v)),
				)
			},
		},
		checked: {
			configurable: true,
			get: () => checked ?? el.hasAttribute('checked'),
			set(v: unknown) {
				checked = !!v
				send('checked', checked ? '' : undefined)
			},
		},
		defaultChecked: {
			configurable: true,
			get: () => el.hasAttribute('checked'),
			set(v: unknown) {
				withheld(checked !== undefined, () =>
					v ? el.setAttribute('checked', '') : el.removeAttribute('checked'),
				)
			},
		},
		type: {
			configurable: true,
			get: () => (el.localName === 'textarea' ? 'textarea' : (attr('type') ?? 'text')),
		},
	})
	const state: ControlState = {
		heard(v, c) {
			if (v !== undefined) ((value = String(v)), (heard.value = true))
			if (c !== undefined) ((checked = !!c), (heard.checked = true))
		},
	}
	controls.set(el, state)
	return state
}
// The shims below are accessors every element shares — one descriptor
// each, `this`-based, built once — and each element's own properties:
// Svelte's `get_setters` reads an element's setters from the instance up to,
// not including, `Element.prototype`. What an accessor keeps per element (a
// `style`'s declarations) is made on first read. Closures per element cost
// kilobytes each, across every row and icon of a long session.
const SVG = 'http://www.w3.org/2000/svg'
function lazily<T extends object>(make: (el: Element) => T): PropertyDescriptor {
	const made = new WeakMap<Element, T>()
	return {
		configurable: true,
		get(this: Element) {
			let v = made.get(this)
			if (!v) made.set(this, (v = make(this)))
			return v
		},
	}
}

// Svelte writes styles through `el.style` (`cssText`, `setProperty`), which
// the polyfill's elements do not have. This one keeps the declarations and
// writes the `style` ATTRIBUTE — the page's gate keeps custom properties only
// (`--sp-fill: 40%`), which is what a widget's skin reads.
function styleOf(el: Element) {
	const props = new Map<string, string>()
	const text = () => [...props].map(([k, v]) => `${k}: ${v}`).join('; ')
	const write = () => {
		const t = text()
		if (t) el.setAttribute('style', t)
		else el.removeAttribute('style')
	}
	return {
		get cssText() {
			return text()
		},
		set cssText(value: string) {
			props.clear()
			for (const decl of String(value ?? '').split(';')) {
				const i = decl.indexOf(':')
				if (i > 0) props.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim())
			}
			write()
		},
		setProperty(name: string, value: unknown) {
			if (value == null || value === '') props.delete(name)
			else props.set(name, String(value))
			write()
		},
		removeProperty(name: string) {
			const had = props.get(name) ?? ''
			props.delete(name)
			write()
			return had
		},
		getPropertyValue(name: string) {
			return props.get(name) ?? ''
		},
	}
}

// Svelte's `class:` directive calls `el.classList.toggle`, which the
// polyfill's elements do not have: a token list over the `class` attribute.
function classListOf(el: Element) {
	const read = () => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
	const write = (tokens: string[]) => {
		const next = [...new Set(tokens)].join(' ')
		if (next !== (el.getAttribute('class') ?? '')) el.setAttribute('class', next)
	}
	return {
		get length() {
			return read().length
		},
		get value() {
			return el.getAttribute('class') ?? ''
		},
		item: (i: number) => read()[i] ?? null,
		contains: (token: string) => read().includes(token),
		add: (...tokens: string[]) => write([...read(), ...tokens]),
		remove: (...tokens: string[]) => write(read().filter((t) => !tokens.includes(t))),
		toggle(token: string, force?: boolean) {
			const has = read().includes(token)
			const on = force ?? !has
			if (on && !has) write([...read(), token])
			else if (!on && has) write(read().filter((t) => t !== token))
			return on
		},
		replace(old: string, next: string) {
			const tokens = read()
			const i = tokens.indexOf(old)
			if (i < 0) return false
			tokens[i] = next
			write(tokens)
			return true
		},
		[Symbol.iterator]: () => read()[Symbol.iterator](),
		toString: () => el.getAttribute('class') ?? '',
	}
}

// Svelte writes a dynamic `class={…}` through `el.className`, which the
// polyfill keeps as a property the page never sees — every element's
// computed classes were lost (static ones survive: they are in the template's
// markup). `className` is the `class` attribute here, as it is in a document.
// SVG is left alone: its `className` is not a string, and Svelte sets its
// class as an attribute.
const CLASS_NAME: PropertyDescriptor = {
	configurable: true,
	get(this: Element) {
		return this.getAttribute('class') ?? ''
	},
	set(this: Element, value: unknown) {
		const next = String(value ?? '')
		if (next) this.setAttribute('class', next)
		else this.removeAttribute('class')
	},
}

// Svelte writes a boolean attribute as a property (`button.disabled = true`,
// its DOM_BOOLEAN_ATTRIBUTES), which the polyfill keeps where the page never
// sees it: a Send button disabled in the component was enabled on the page.
// Each is the attribute here, as in a document. `checked` is the control
// shim's (`controlState`).
const BOOLEAN_PROPERTIES: ReadonlyArray<readonly [property: string, attribute: string]> = [
	['allowFullscreen', 'allowfullscreen'],
	['async', 'async'],
	['autofocus', 'autofocus'],
	['autoplay', 'autoplay'],
	['controls', 'controls'],
	['default', 'default'],
	['defer', 'defer'],
	['disabled', 'disabled'],
	['formNoValidate', 'formnovalidate'],
	['hidden', 'hidden'],
	['indeterminate', 'indeterminate'],
	['inert', 'inert'],
	['isMap', 'ismap'],
	['loop', 'loop'],
	['multiple', 'multiple'],
	['muted', 'muted'],
	['noModule', 'nomodule'],
	['noValidate', 'novalidate'],
	['open', 'open'],
	['playsInline', 'playsinline'],
	['readOnly', 'readonly'],
	['required', 'required'],
	['reversed', 'reversed'],
	['selected', 'selected'],
]
const booleanAccessor = (attribute: string): PropertyDescriptor => ({
	configurable: true,
	get(this: Element) {
		return this.hasAttribute(attribute)
	},
	set(this: Element, value: unknown) {
		if (value) this.setAttribute(attribute, '')
		else this.removeAttribute(attribute)
	},
})

// What every element gets; an SVG element stops there.
const SHIMS: PropertyDescriptorMap = { style: lazily(styleOf), classList: lazily(classListOf) }
const HTML_SHIMS: PropertyDescriptorMap = {
	...SHIMS,
	className: CLASS_NAME,
	...Object.fromEntries(
		BOOLEAN_PROPERTIES.map(([property, attribute]) => [property, booleanAccessor(attribute)]),
	),
}

hooks.createElement = (element: Element) => {
	if (element && typeof element.localName === 'string' && !Object.hasOwn(element, 'classList'))
		Object.defineProperties(element, element.namespaceURI === SVG ? SHIMS : HTML_SHIMS)
	forwardEvents(element)
}
// An element created before the hook (none today) still forwards once listened to.
hooks.addEventListener = (target: EventTarget) => forwardEvents(target as Element)

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * What a UI worker must not have, removed: the network, shared storage, a
 * second worker, and the navigator's doors to the origin (a service worker,
 * its private file system, its named locks). The page's CSP is the wall;
 * this is the belt — and the harness takes the same belt, so a component
 * that passes its tests does not reach for something the page never gives.
 * Call it before any component loads.
 * @internal
 */
export const WORKER_STRIPPED_GLOBALS = [
	'fetch',
	'XMLHttpRequest',
	'WebSocket',
	'EventSource',
	'WebTransport',
	'importScripts',
	'Worker',
	'SharedWorker',
	'BroadcastChannel',
	'indexedDB',
	'caches',
] as const
/** @internal */
export const WORKER_STRIPPED_NAVIGATOR = ['serviceWorker', 'storage', 'locks'] as const

/** @internal */
export function lockDownWorker(scope: object = globalThis) {
	const strip = (target: object | undefined, names: readonly string[]) => {
		if (!target) return
		for (const name of names)
			try {
				Object.defineProperty(target, name, {
					value: undefined,
					configurable: false,
					writable: false,
				})
			} catch {
				/* not present in this engine */
			}
	}
	strip(scope, WORKER_STRIPPED_GLOBALS)
	strip((scope as { navigator?: object }).navigator, WORKER_STRIPPED_NAVIGATOR)
}

// What waits for the current task to end, first asked first run: one
// MessageChannel ping each — a task, so every microtask before it has run
// (Svelte's flush, then Remote DOM's batch of the DOM changes it made) —
// else a timer. Held open (Node) only while something waits, so an idle
// runtime keeps no process alive.
const waiting: Array<() => void> = []
let ping: MessageChannel | undefined
const holdPing = (on: boolean) => {
	const port = ping?.port1 as unknown as { ref?(): void; unref?(): void } | undefined
	if (on) port?.ref?.()
	else port?.unref?.()
}
function runNext() {
	const fn = waiting.shift()
	if (!waiting.length) holdPing(false)
	fn?.()
}
function nextTask(fn: () => void) {
	waiting.push(fn)
	if (typeof MessageChannel !== 'function') return void setTimeout(runNext, 0)
	if (!ping) {
		ping = new MessageChannel()
		ping.port1.onmessage = runNext
	}
	if (waiting.length === 1) holdPing(true)
	ping.port2.postMessage(null)
}

/**
 * Run `fn` once every message the worker's mounts have queued so far has
 * gone out, behind the DOM changes that came before it — the component
 * harness's round trip (`settle()`) comes back after them.
 * @internal
 */
export function afterOutbox(fn: () => void): void {
	nextTask(fn)
}

const clone = structuredClone

/**
 * A mount's port as its component sees it: what the page sends arrives from
 * the real port; what the component sends is held to the end of the turn,
 * then `flush` hands it on — on the worker channel, after the DOM changes of
 * that turn. Natively a handler that closes a menu and then invokes an
 * action changes both in one synchronous flush; here the DOM change is a
 * microtask batch, and a message on its own port overtook it — the page
 * opened the action's dialog, THEN the menu closed and handed focus back to
 * its trigger, outside the dialog, and the dialog dismissed itself.
 */
function orderedPort(port: ComponentPort, flush: (messages: unknown[]) => void): ComponentPort {
	let queued: unknown[] = []
	let closed = false
	const turnEnd = () => {
		const out = queued
		queued = []
		if (!closed && out.length) flush(out)
	}
	return {
		get onmessage() {
			return port.onmessage
		},
		set onmessage(fn) {
			port.onmessage = fn
		},
		postMessage(message: unknown) {
			if (closed) return
			// Cloned NOW, as a port clones: a payload changed after the call is
			// not what was sent, and one that cannot cross throws to the caller.
			queued.push(clone(message))
			if (queued.length === 1) nextTask(turnEnd)
		},
		close() {
			// Unmounted: what the turn had not sent yet is dropped with it.
			closed = true
			queued = []
			port.close()
		},
	}
}

interface Mounted {
	root: Element
	fns: Map<number, (...a: unknown[]) => unknown>
	cleanup?: () => void
	ctx: ReturnType<typeof createComponentContext>
}

/** Where a worker's mounts come from and go to. @internal */
export interface ComponentWorkerHost {
	/** Worker → page. */
	post(message: WorkerToHost): void
	/** Load a component's built module; the page's worker imports it same-origin. */
	importModule(entry: string): Promise<{ default?: ComponentMountFn; mount?: ComponentMountFn }>
}

/**
 * Start the worker half: returns the handler for what the page sends.
 * One per worker; every mount it is asked for runs against its own
 * `remote-root`, context and function handles.
 * @internal
 */
export function startComponentWorker(host: ComponentWorkerHost): (message: HostToWorker) => void {
	const mounts = new Map<string, Mounted>()
	const send = host.post

	async function mount(mountId: string, entry: string, port: ComponentPort) {
		const fns = new Map<number, (...a: unknown[]) => unknown>()
		// One handle per function: Remote DOM re-sends a listener with every
		// insert or move of its element, and a fresh id each time would grow
		// this map for the life of the mount.
		const ids = new WeakMap<(...a: unknown[]) => unknown, number>()
		let next = 0
		const root = document.createElement('remote-root') as RemoteRootElement
		const connection = new BatchingRemoteConnection({
			mutate(records) {
				const encoded = encodeFns(records, (fn) => {
					const known = ids.get(fn)
					if (known !== undefined) return known
					fns.set(++next, fn)
					ids.set(fn, next)
					return next
				}) as unknown[]
				send({ k: 'mutate', mountId, records: encoded })
			},
			call() {
				throw new Error('a remote calls no host methods')
			},
		})
		root.connect(connection)
		// What the component sends never overtakes the DOM changes of the turn
		// that sent it: a batch still held goes first, then the messages.
		const ctx = createComponentContext(
			orderedPort(port, (messages) => {
				connection.flush()
				for (const msg of messages) send({ k: 'wire', mountId, msg })
			}),
		)
		const m: Mounted = { root, fns, ctx }
		mounts.set(mountId, m)
		try {
			const mod = await host.importModule(entry)
			const fn = mod.default ?? mod.mount
			if (typeof fn !== 'function')
				throw new Error('the module exports no mount function (default or `mount`)')
			// Unmounted while the module loaded: never start what nobody will stop.
			if (mounts.get(mountId) !== m) return
			const cleanup = fn(root as unknown as HTMLElement, ctx)
			if (typeof cleanup === 'function') m.cleanup = cleanup
			ctx.ready()
		} catch (e) {
			// Where, too: a component that fails to mount is the author's to
			// fix, and the message alone rarely says which line.
			const where =
				e instanceof Error && e.stack
					? '\n' + e.stack.split('\n').slice(1, 7).join('\n')
					: ''
			send({ k: 'failed', mountId, message: messageOf(e) + where })
		}
	}

	return (m: HostToWorker) => {
		if (!m || typeof m !== 'object') return
		if (m.k === 'mount') void mount(m.mountId, m.entry, m.port)
		else if (m.k === 'fn') {
			// A component's handler that throws is the component's bug, not the
			// worker's end: said to the page, as a browser reports a listener's
			// error and carries on.
			try {
				const out = mounts.get(m.mountId)?.fns.get(m.id)?.(m.detail)
				if (out && typeof (out as Promise<unknown>).catch === 'function')
					(out as Promise<unknown>).catch((e) =>
						send({ k: 'error', mountId: m.mountId, message: messageOf(e) }),
					)
			} catch (e) {
				send({ k: 'error', mountId: m.mountId, message: messageOf(e) })
			}
		} else if (m.k === 'unmount') {
			const held = mounts.get(m.mountId)
			if (!held) return
			mounts.delete(m.mountId)
			try {
				held.cleanup?.()
			} finally {
				held.ctx.close()
				held.fns.clear()
				held.root.replaceChildren()
			}
		}
	}
}
