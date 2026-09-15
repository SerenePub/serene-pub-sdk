/**
 * The control registry (24 §8) — the render leg of the four-way registry,
 * as pure data so the conformance canary can read it without a Svelte
 * compiler: value-type id → which component edits it.
 *
 * `hostIntegrated` kinds are reference pickers whose choices live in the
 * host's database (a prompt list is an instance fact, not a declaration) —
 * the host renders those with its own data-connected control; the package
 * deliberately ships none, and the canary counts the marker as covered.
 */
export interface ControlEntry {
	/** The component's export name in `@serene-pub/controls`. */
	component: string
	/** The host supplies the control — the choices are instance data. */
	hostIntegrated?: boolean
}

export const CONTROL_REGISTRY: Record<string, ControlEntry> = {
	'integer@1': { component: 'NumberControl' },
	'number@1': { component: 'NumberControl' },
	'boolean@1': { component: 'BooleanControl' },
	'text@1': { component: 'TextControl' },
	'select@1': { component: 'SelectControl' },
	'ranking@1': { component: 'RankingControl' },
	'weights@1': { component: 'WeightsControl' },
	'prompt-ref@1': { component: 'PromptRefControl', hostIntegrated: true },
	// The choices are this user's media library — instance data, like a prompt
	// list — so the host renders it with its own data-connected picker.
	'media-ref@1': { component: 'MediaRefControl', hostIntegrated: true },
}
