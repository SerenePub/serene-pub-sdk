/**
 * Value-type id → component. Split out of `index.ts` so a control component
 * can resolve a sibling without importing the barrel that imports it — the
 * cycle that would otherwise appear the moment a form renders a field.
 */
import NumberControl from './NumberControl.svelte'
import BooleanControl from './BooleanControl.svelte'
import TextControl from './TextControl.svelte'
import SelectControl from './SelectControl.svelte'
import WeightsControl from './WeightsControl.svelte'
import RankingControl from './RankingControl.svelte'
import UnknownControl from './UnknownControl.svelte'
import { CONTROL_REGISTRY } from './registry.js'

/**
 * Deliberately untyped as `any`: naming svelte's `Component` here would make
 * this package resolve its own `svelte` for types — the duplicate-identity
 * trap. The consuming app's Svelte toolchain types the components at import.
 */
const COMPONENTS: Record<string, any> = {
	NumberControl,
	BooleanControl,
	TextControl,
	SelectControl,
	WeightsControl,
	RankingControl,
}

/**
 * The editor for a value-type id. `null` = host-integrated (the host renders
 * a data-connected picker); `UnknownControl` = the safe degradation.
 *
 * The `null` branch is a real branch, not a "shouldn't happen": rendering
 * `<Comp />` with a null component is a silent blank, so every caller has to
 * say what a host-integrated field looks like in *its* surface.
 */
export function controlFor(kind: string): any | null {
	const entry = CONTROL_REGISTRY[kind]
	if (!entry) return UnknownControl
	if (entry.hostIntegrated) return null
	return COMPONENTS[entry.component] ?? UnknownControl
}

export { UnknownControl }
