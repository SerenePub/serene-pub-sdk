/**
 * The component wire (§3.5, C2/C3b): what crosses between a page and its UI
 * worker, beside each mount's own widget-protocol port — and the worker
 * side of that port, the {@link ComponentContext} a component is handed.
 *
 * Shared by the app's page and worker, and by the component harness
 * (`@serene-pub/cli/testing`), so the three cannot drift.
 *
 * Remote DOM's mutation records carry FUNCTIONS (event listeners), which
 * `postMessage` cannot clone. They cross as handles instead — `{ [FN]: id }`
 * — and the host calls a handle back with a small, host-chosen event
 * summary (`RemoteEventDetail`), never the live DOM event.
 *
 * What a component sends on its port (an `invoke`, a request, `ready`)
 * leaves the worker on this channel too, as `wire`: one channel, so it
 * cannot overtake the DOM changes of the turn that sent it.
 *
 * @internal
 */
import type { ComponentContext, ComponentInvokeArgs, ComponentSection, ComponentSections } from './componentClient.js'
import type { RequestDeclineCode } from './surfaces.js'
import { WIDGET_SCOPED_SECTIONS, isWidgetScopedSectionName, type WidgetSectionScope } from './widgets.js'

/** The handle key a function is replaced by on the wire. @experimental */
export const FN = '__spFn'

/** @experimental */
export type FnHandle = { [FN]: number }

/** @experimental */
export const isFnHandle = (v: unknown): v is FnHandle =>
	!!v && typeof v === 'object' && typeof (v as Record<string, unknown>)[FN] === 'number'

/** What a remote listener receives: the declared `detail`, or a control's value. @experimental */
export interface RemoteEventDetail {
	type: string
	/** The sp element's declared detail (`{ value }`, `{ open }`, …), cloned. */
	detail?: unknown
	/** A plain control's value, for `input` / `change`. */
	value?: string
	/** A checkbox's state, for `change`. */
	checked?: boolean
}

/** Host → worker. @experimental */
export type HostToWorker =
	| {
			k: 'mount'
			mountId: string
			/** The component's module, same-origin (`/plugin-ui/<owner>/<entry>`). */
			entry: string
			/**
			 * Rides the transfer list: this mount's widget-protocol port. What
			 * the component sends back rides the worker channel instead
			 * (`wire`), in order with its DOM changes.
			 */
			port: ComponentPort
	  }
	| { k: 'unmount'; mountId: string }
	| { k: 'fn'; mountId: string; id: number; detail: RemoteEventDetail }

/** Worker → host. @experimental */
export type WorkerToHost =
	| { k: 'mutate'; mountId: string; records: unknown[] }
	| { k: 'failed'; mountId: string; message: string }
	/** A mounted component threw while handling an event: said, and the mount lives on. */
	| { k: 'error'; mountId: string; message: string }
	/**
	 * A message the component sent on its widget-protocol port, delivered on
	 * the worker channel after every mutation of the turn that sent it — so
	 * the page sees the DOM change a handler made before the message the
	 * same handler sent next (a menu closes, THEN the host's dialog opens; the
	 * other way round, the closing menu hands focus back to its trigger and
	 * the dialog dismisses itself). The page handles `msg` as one that arrived
	 * on the mount's port; the port itself carries page → worker only.
	 */
	| { k: 'wire'; mountId: string; msg: unknown }

/**
 * 🚧 The error a component's `request` rejects with when the host declines:
 * the host's sentence as `message`, and its {@link RequestDeclineCode} as
 * `code` when it gave one (`unmounted` for every request still pending when
 * the component is unmounted). Test `code`, never the sentence.
 * @experimental
 */
export class RequestDeclined extends Error {
	readonly code?: RequestDeclineCode
	constructor(message: string, code?: RequestDeclineCode) {
		super(message)
		this.name = 'RequestDeclined'
		if (code !== undefined) this.code = code
	}
}

/**
 * Replace every function in a value with a handle, registering it. Walks
 * arrays and plain objects; everything else passes as is.
 * @experimental
 */
export function encodeFns(value: unknown, register: (fn: (...a: unknown[]) => unknown) => number): unknown {
	if (typeof value === 'function') return { [FN]: register(value as (...a: unknown[]) => unknown) }
	if (Array.isArray(value)) return value.map((v) => encodeFns(v, register))
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) out[k] = encodeFns(v, register)
		return out
	}
	return value
}

/** The one port a mount's context speaks over — a DOM or Node `MessagePort`. @experimental */
export interface ComponentPort {
	/**
	 * Only ever ASSIGNED here (never called), and a DOM port's handler takes a
	 * full `MessageEvent` — so the parameter is `never`, which either port's
	 * handler type accepts; the handler this module assigns reads `data` only.
	 */
	onmessage: ((e: never) => void) | null
	postMessage(message: unknown): void
	close(): void
}

/**
 * The worker side of a mount's widget-protocol port: the same sections a
 * native widget reads off its context and a frame is posted, and the same
 * verbs back. Runs where the component runs — no page, no network, nothing
 * but this port.
 * @experimental
 */
export function createComponentContext(port: ComponentPort): ComponentContext & { ready(): void; close(): void } {
	const data: ComponentSections = { channels: {}, suspended: false, scoped: {} }
	// Requests in flight, by id; the host answers each once (`page` / `response`).
	const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
	let nextRequest = 0
	// Translations the host sent, and the misses not yet asked for — asked in
	// one batch per task, as the app's own `t()` does.
	const strings = new Map<string, string>()
	const asked = new Set<string>()
	let misses: string[] = []
	const askLater = () => {
		if (misses.length !== 1) return
		setTimeout(() => {
			const sources = misses
			misses = []
			if (sources.length) port.postMessage({ t: 'translate', sources })
		}, 0)
	}
	const subs = new Set<(section: ComponentSection) => void>()
	const eventSubs = new Set<(event: unknown) => void>()
	const notify = (section: ComponentSection) => {
		for (const fn of subs) {
			try {
				fn(section)
			} catch (e) {
				console.error(e)
			}
		}
	}

	port.onmessage = (e: { data: unknown }) => {
		const m = e.data as Record<string, unknown> | null
		if (!m || typeof m !== 'object') return
		switch (m.t) {
			case 'session':
				data.session = m.session
				return notify('session')
			case 'messages':
				data.messages = m.messages as unknown[]
				return notify('messages')
			case 'channel':
				data.channels = { ...data.channels, [String(m.channel)]: m.messages as unknown[] }
				return notify('channels')
			case 'settings':
				data.settings = m.settings as Record<string, unknown>
				return notify('settings')
			case 'actions':
				data.actions = m.actions
				return notify('actions')
			case 'annex':
				data.annex = m.annex as Record<string, unknown>
				return notify('annex')
			case 'props':
				data.props = m.props as Record<string, unknown>
				return notify('props')
			case 'theme':
				data.theme = { theme: String(m.theme ?? ''), mode: m.mode === 'dark' ? 'dark' : 'light' }
				return notify('theme')
			case 'scoped': {
				const name = m.section
				// A name the table does not carry is not a section this widget can hold.
				if (isWidgetScopedSectionName(name)) {
					// `null` withdraws it: the grant went away.
					const { [name]: _gone, ...rest } = data.scoped
					data.scoped = (m.value === null ? rest : { ...rest, [name]: m.value }) as ComponentSections['scoped']
				}
				return notify('scoped')
			}
			case 'grants': {
				// A list, or nothing new; only a scope the table names is kept.
				if (!Array.isArray(m.grants)) return
				data.grants = m.grants.filter(
					(g): g is WidgetSectionScope => typeof g === 'string' && Object.hasOwn(WIDGET_SCOPED_SECTIONS, g),
				)
				return notify('grants')
			}
			case 'viewer':
				data.viewer = m.viewer as ComponentSections['viewer']
				return notify('viewer')
			case 'turn-order':
				data.turnOrder = m.turnOrder as ComponentSections['turnOrder']
				return notify('turnOrder')
			case 'page':
			case 'response': {
				const waiting = pending.get(String(m.requestId))
				if (!waiting) return
				pending.delete(String(m.requestId))
				if (m.t === 'page') return waiting.resolve({ rows: m.rows, nextCursor: m.nextCursor })
				return m.ok
					? waiting.resolve(m.result)
					: waiting.reject(
							new RequestDeclined(
								String(m.error ?? 'the host declined'),
								m.code === 'unmounted' ? 'unmounted' : undefined,
							),
						)
			}
			case 'strings':
				for (const [k, v] of Object.entries((m.strings ?? {}) as Record<string, unknown>))
					if (typeof v === 'string') strings.set(k, v)
				return notify('strings')
			case 'locale':
				data.locale = String(m.locale ?? 'en')
				return notify('locale')
			case 'layout':
				data.layout = m.layout
				return notify('layout')
			case 'state':
				data.state = m.state
				return notify('state')
			case 'suspend':
			case 'resume':
				data.suspended = m.t === 'suspend'
				return notify('suspended')
			case 'event':
				for (const fn of eventSubs) {
					try {
						fn(m.event)
					} catch (e) {
						console.error(e)
					}
				}
				return notify('event')
			// `style` is the host's: applied to the box, never to worker code.
		}
	}

	const ctx = {
		get session() {
			return data.session
		},
		get messages() {
			return data.messages
		},
		get channels() {
			return data.channels
		},
		get settings() {
			return data.settings
		},
		get actions() {
			return data.actions
		},
		get annex() {
			return data.annex
		},
		get props() {
			return data.props
		},
		get theme() {
			return data.theme
		},
		get locale() {
			return data.locale
		},
		get layout() {
			return data.layout
		},
		get state() {
			return data.state
		},
		get suspended() {
			return data.suspended
		},
		subscribe(fn: (section: ComponentSection) => void) {
			subs.add(fn)
			return () => subs.delete(fn)
		},
		onEvent(fn: (event: unknown) => void) {
			eventSubs.add(fn)
			return () => eventSubs.delete(fn)
		},
		invoke(key: string, args: ComponentInvokeArgs = {}) {
			port.postMessage({ t: 'invoke', key, ...args })
		},
		saveState(state: unknown) {
			port.postMessage({ t: 'save-state', state })
		},
		error(message: string, fatal = false) {
			port.postMessage({ t: 'error', message: String(message), fatal })
		},
		get scoped() {
			return data.scoped
		},
		action(fn: string, messageId?: number, payload?: Record<string, unknown>, action?: string, blockId?: string) {
			port.postMessage({ t: 'action', fn, messageId, payload, action, blockId })
		},
		request(kind: string, params: unknown) {
			const requestId = `r${++nextRequest}`
			return new Promise((resolve, reject) => {
				pending.set(requestId, { resolve, reject })
				port.postMessage(
					kind === 'messages'
						? { t: 'request', requestId, what: 'messages', ...(params as object) }
						: { t: 'request', requestId, what: kind, params },
				)
			}) as never
		},
		t(source: string) {
			const hit = strings.get(source)
			if (hit !== undefined) return hit
			if (!asked.has(source)) {
				asked.add(source)
				misses.push(source)
				askLater()
			}
			return source
		},
		get viewer() {
			return data.viewer
		},
		get turnOrder() {
			return data.turnOrder
		},
		get grants() {
			return data.grants
		},
		granted(scope: WidgetSectionScope) {
			return data.grants === undefined ? undefined : data.grants.includes(scope)
		},
		ready() {
			port.postMessage({ t: 'ready' })
		},
		close() {
			for (const w of pending.values()) w.reject(new RequestDeclined('the component was unmounted', 'unmounted'))
			pending.clear()
			subs.clear()
			eventSubs.clear()
			port.close()
		}
	}
	return ctx
}
