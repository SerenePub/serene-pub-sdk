# `@serene-pub/controls`

The render leg of the four-way registry (24 §8): one Svelte editor per
value-type id, and one form renderer over a whole schema.

```svelte
<script>
	import { SchemaForm, FieldControl, controlFor } from '@serene-pub/controls'
</script>

<!-- a whole SettingsSchema -->
<SchemaForm {schema} bind:values />

<!-- or one field -->
<FieldControl name="sides" decl={schema.sides} value={values.sides}
              oncommit={(v) => (values.sides = v)} />
```

`SchemaForm` is the one renderer behind every generated form (12 §6): plugin
settings, review-pause payloads, and a surface's declared props all arrive in
the same `SettingsSchema` language, so a control fixed here is fixed for all of
them. Grouping, ordering and `showIf` come from the SDK's `formLayout` and
`isVisible` rather than being re-derived, and the editor for each field is
chosen by **value-type id** — the field is bridged through `valueDeclOf` and the
result keys `controlFor` — so a new value type reaches every form without
anyone editing a switch statement.

Two field types deliberately have no value declaration and are rendered by
name: `string[]` (a free list, one per line) and `secret` (write-only, never
echoed back).

## ⚠ Your build has to scan this package

The controls style themselves with the host's global utility classes — `input`,
`select`, `checkbox`, `textarea`, `btn` — and in Skeleton v5 those are Tailwind
`@utility`, which means **candidate-driven**: a rule exists only if your
scanner saw the literal string in a file it scanned. Tailwind v4 skips
`node_modules` by a hardcoded default, so it will not find them here.

```css
@source "<path to>/@serene-pub/controls/src";
```

Without it the failure is *no rule at all* (10 §6) — every control renders as an
unstyled box, on every theme equally, which is easy to misdiagnose as a theming
bug when it is a compilation one.

## What this package does not do

No theme, no design system, no data. Reference pickers whose choices live in the
host's database (`prompt-ref@1`) are marked `hostIntegrated` in the registry and
`controlFor` returns `null` for them — the host renders those itself. That `null`
is a real branch: rendering a null component is a silent blank.
