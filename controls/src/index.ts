/**
 * @serene-pub/controls (24 §9) — the render leg of the four-way registry:
 * one Svelte editor per value-type id, keyed by `controlFor`. Shipped as raw
 * source; the consuming Svelte app compiles it. Styling uses the host's
 * global utility classes (`input`, `select`, `checkbox`, `textarea`, `btn`)
 * plus self-contained CSS, so the controls inherit the host's look without
 * depending on its UI kit.
 *
 * ⚠ Those utility classes are **candidate-driven** in Tailwind v4 — Skeleton
 * ships `input`/`btn`/`select` as `@utility`, so a rule exists only if the
 * host's Tailwind scanner saw the literal string in a scanned file. A host
 * whose build does not scan this package's source gets *no rule at all* and
 * renders every control unstyled (10 §6). Add to your CSS entry:
 *
 *     @source "<path to>/@serene-pub/controls/src";
 *
 * Above the single controls sits `SchemaForm` — one whole `SettingsSchema`
 * rendered as a form, which is the same "one renderer, three uses" the
 * settings surface asks for (12 §6): a control fixed here is fixed for review
 * pauses, plugin settings and extension forms at once.
 */
import NumberControl from './NumberControl.svelte'
import BooleanControl from './BooleanControl.svelte'
import TextControl from './TextControl.svelte'
import SelectControl from './SelectControl.svelte'
import WeightsControl from './WeightsControl.svelte'
import RankingControl from './RankingControl.svelte'
import UnknownControl from './UnknownControl.svelte'
import FieldControl from './FieldControl.svelte'
import SchemaForm from './SchemaForm.svelte'

export {
	NumberControl,
	BooleanControl,
	TextControl,
	SelectControl,
	WeightsControl,
	RankingControl,
	UnknownControl,
	FieldControl,
	SchemaForm,
}
export { CONTROL_REGISTRY } from './registry.js'
export { controlFor } from './resolve.js'
