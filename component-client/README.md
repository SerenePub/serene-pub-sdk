# `@serene-pub/component-client`

What a Serene Pub remote component imports: its typed context, and a mount
helper for Svelte. Shipped as TypeScript source — `serene-pub build` bundles it
into the component, so nothing here runs on its own.

```ts
import { defineComponent } from '@serene-pub/component-client'

export default defineComponent((root, ctx) => {
	const p = document.createElement('p')
	root.append(p)
	return ctx.subscribe(() => (p.textContent = `${ctx.messages?.length ?? 0} messages`))
})
```

A Svelte component receives the context as its `ctx` prop:

```ts
import { svelteComponent } from '@serene-pub/component-client/svelte'
import Hello from './Hello.svelte'

export default svelteComponent(Hello)
```

| entry                                         | what it is                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `@serene-pub/component-client`                | `defineComponent` and the context types                                                                |
| `@serene-pub/component-client/svelte`         | `svelteComponent` — mount a Svelte component as a remote                                               |
| `@serene-pub/component-client/worker-runtime` | the host's side of the UI worker; hosts and the component harness start it, components never import it |

`serene-pub scaffold plugin ./my-plugin --slug vendor.name --panel` scaffolds a package
that already depends on it.
