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
/** @experimental */
import NumberControl from './NumberControl.svelte'
/** @experimental */
import BooleanControl from './BooleanControl.svelte'
/** @experimental */
import TextControl from './TextControl.svelte'
/** @experimental */
import SelectControl from './SelectControl.svelte'
/** @experimental */
import WeightsControl from './WeightsControl.svelte'
/** @experimental */
import RankingControl from './RankingControl.svelte'
/** @experimental */
import UnknownControl from './UnknownControl.svelte'
/** @experimental */
import FieldControl from './FieldControl.svelte'
/** @experimental */
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
