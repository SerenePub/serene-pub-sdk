/**
 * `@serene-pub/component-client` (§3.5, C3) — what a remote component
 * imports. The context itself is the host's; this names it.
 *
 * ```ts
 * import { defineComponent } from '@serene-pub/component-client'
 *
 * export default defineComponent((root, ctx) => {
 *   const p = document.createElement('p')
 *   root.append(p)
 *   return ctx.subscribe(() => (p.textContent = `${ctx.messages?.length ?? 0} messages`))
 * })
 * ```
 */
export {
	defineComponent,
	type ComponentContext,
	type ComponentInvokeArgs,
	type ComponentMountFn,
	type ComponentSection,
	type ComponentSections,
} from '@serene-pub/sdk'
