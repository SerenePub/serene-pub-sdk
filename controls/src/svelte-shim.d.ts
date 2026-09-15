/**
 * Plain-tsc resolution for the .svelte imports: consumers that only read the
 * pure-TS surface (the registry, the canary) type-check the package without
 * a Svelte toolchain — and without the package resolving its own copy of
 * `svelte`, which is exactly the duplicate that split type identities in the
 * host once already. Svelte-aware toolchains compile the real components.
 */
declare module '*.svelte' {
	const component: any
	export default component
}
