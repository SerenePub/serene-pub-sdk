/**
 * Mount a Svelte component as a remote (§3.5, C3). The component receives
 * the context as its `ctx` prop and reads sections off it; `subscribe` is
 * how it learns a push arrived.
 *
 * ```ts
 * import { svelteComponent } from '@serene-pub/component-client/svelte'
 * import Hello from './Hello.svelte'
 * export default svelteComponent(Hello)
 * ```
 */
import { mount, unmount, type Component } from 'svelte'
// Imported so the augmentation below has a module to augment: without it
// the compiler cannot find `svelte/elements` for a `declare module` alone.
import type {} from 'svelte/elements'
import type { ComponentContext, ComponentMountFn, HostKeyEventDetail } from '@serene-pub/sdk'

/**
 * What the host vocabulary adds to a plain element Svelte already types
 * (R80): a plain `input` takes `keys` and raises `key` — so
 * `<input type="number" keys="Escape Enter" onkey={…}>` checks. The `sp-*`
 * elements need nothing here: Svelte types an unknown custom element
 * loosely.
 */
declare module 'svelte/elements' {
	interface HTMLInputAttributes {
		/** Keys the widget handles itself (`Escape Enter`, `Control+Enter`), each raised as `key`. */
		keys?: string | null | undefined
		/** A key `keys` names was pressed in the field — kept from it, and raised here. */
		onkey?: ((e: CustomEvent<HostKeyEventDetail>) => unknown) | null | undefined
	}
}

/** @public */
export function svelteComponent(C: Component<{ ctx: ComponentContext }>): ComponentMountFn {
	return (root, ctx) => {
		const app = mount(C, { target: root, props: { ctx } })
		return () => {
			void unmount(app)
		}
	}
}
