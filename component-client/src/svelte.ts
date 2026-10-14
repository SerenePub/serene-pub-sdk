/**
 * Mount a Svelte component as a remote. The component receives
 * the context as its `ctx` prop, reactive: read `ctx.messages` in markup or
 * `$derived` and it redraws when the host pushes, with no `subscribe`. The
 * plain context the host handed over is beside it as `raw`.
 *
 * ```ts
 * import { svelteComponent } from '@serene-pub/component-client/svelte'
 * import Hello from './Hello.svelte'
 * export default svelteComponent(Hello)
 * ```
 * @ruling §3.5, C3
 */
import { mount, unmount, type Component } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'
// Imported so the augmentation below has a module to augment: without it
// the compiler cannot find `svelte/elements` for a `declare module` alone.
import type {} from 'svelte/elements'
import type {
	ComponentContext,
	ComponentMountFn,
	ComponentSection,
	ComponentSections,
	HostKeyEventDetail,
} from '@serene-pub/sdk'

/**
 * What the host vocabulary adds to a plain element Svelte already types:
 * a plain `input` takes `keys` and raises `key` — so
 * `<input type="number" keys="Escape Enter" onkey={…}>` checks. The `sp-*`
 * elements need nothing here: Svelte types an unknown custom element
 * loosely.
 * @ruling R80
 */
declare module 'svelte/elements' {
	interface HTMLInputAttributes {
		/** Keys the widget handles itself (`Escape Enter`, `Control+Enter`), each raised as `key`. */
		keys?: string | null | undefined
		/** A key `keys` names was pressed in the field — kept from it, and raised here. */
		onkey?: ((e: CustomEvent<HostKeyEventDetail>) => unknown) | null | undefined
	}
}

/** The props `svelteComponent` hands a component: the reactive context, and the plain one. @experimental */
export interface SvelteComponentProps {
	/** The context, reactive: a read in markup or `$derived` redraws on the next push. */
	ctx: ComponentContext
	/** The context as the host handed it: current on every read, not reactive; `subscribe` to hear a push. */
	raw: ComponentContext
}

/**
 * Mount `C` with `ctx` (the reactive context, {@link reactive}) and `raw`.
 * A component that declares only `ctx` is accepted.
 * @public
 */
export function svelteComponent(C: Component<{ ctx: ComponentContext; raw: ComponentContext }>): ComponentMountFn {
	return (root, raw) => {
		const app = mount(C, { target: root, props: { ctx: reactive(raw), raw } })
		return () => {
			void unmount(app)
		}
	}
}

// Every section the context carries, once. A section added to
// `ComponentSections` and not here does not compile.
const SECTIONS = [
	'session',
	'messages',
	'layout',
	'actions',
	'props',
	'settings',
	'annex',
	'locale',
	'viewer',
	'turnOrder',
	'attendance',
	'channels',
	'theme',
	'scoped',
	'grants',
	'state',
	'suspended',
] as const satisfies readonly (keyof ComponentSections)[]
const listsEvery: [Exclude<keyof ComponentSections, (typeof SECTIONS)[number]>] extends [never]
	? true
	: never = true
void listsEvery

const mirrors = new WeakMap<ComponentContext, ComponentContext>()
const isMirror = new WeakSet<ComponentContext>()

/**
 * The context, reactive to Svelte: reading a section (`ctx.messages`), or
 * calling `scope`, `granted` or `t`, inside markup, `$derived` or `$effect`
 * reruns it when the host pushes that section (`strings` for `t`). Each
 * read returns the plain context's current value, never a copy; the verbs
 * are the plain context's. `svelteComponent` hands this as `ctx` already,
 * so call it only for a context you got another way. The same context
 * always gives the same mirror. Outside Svelte it is the plain context with
 * nothing added: a plain-DOM component uses `subscribe`.
 * @experimental
 */
export function reactive(raw: ComponentContext): ComponentContext {
	if (isMirror.has(raw)) return raw
	const hit = mirrors.get(raw)
	if (hit) return hit
	// One tracker per section, made on first read. Each listens to the plain
	// context only while some effect reads that section, and stops after.
	const trackers = new Map<ComponentSection, () => void>()
	const read = (section: ComponentSection) => {
		let track = trackers.get(section)
		if (!track) {
			track = createSubscriber((update) =>
				raw.subscribe((pushed) => {
					if (pushed === section) update()
				}),
			)
			trackers.set(section, track)
		}
		track()
	}
	const mirror = {
		subscribe: (fn) => raw.subscribe(fn),
		onEvent: (fn) => raw.onEvent(fn),
		invoke: (key, args) => raw.invoke(key, args),
		action: (fn, messageId, payload, action, blockId) =>
			raw.action(fn, messageId, payload, action, blockId),
		saveState: (state) => raw.saveState(state),
		error: (message, fatal) => raw.error(message, fatal),
		request: (kind, params) => raw.request(kind, params),
		t(source) {
			read('strings')
			return raw.t(source)
		},
		granted(scope) {
			read('grants')
			return raw.granted(scope)
		},
		scope(scope) {
			read('scoped')
			return raw.scope(scope)
		},
	} as Pick<ComponentContext, Exclude<keyof ComponentContext, keyof ComponentSections>>
	for (const section of SECTIONS)
		Object.defineProperty(mirror, section, {
			enumerable: true,
			get() {
				read(section)
				return raw[section]
			},
		})
	const ctx = mirror as ComponentContext
	mirrors.set(raw, ctx)
	isMirror.add(ctx)
	return ctx
}
