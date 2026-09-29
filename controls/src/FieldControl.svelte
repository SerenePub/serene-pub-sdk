<script lang="ts">
	/**
	 * One field of a generated form: the label and description the host owes
	 * the field, and the right editor underneath it.
	 *
	 * The editor is chosen by **value-type id**, not by field type — the field
	 * declaration is bridged through the SDK's `valueDeclOf` and the result
	 * keys `controlFor`. That indirection is the whole point of the four-way
	 * registry: a new value type ships a factory, a validator, a control and a
	 * scaffold printer, and every generated form gets it without editing a
	 * switch statement somewhere.
	 *
	 * Four field types have no value declaration and are handled here rather
	 * than pretended into one:
	 *
	 *   `string[]`  a free list — one per line, because no shipped kind means
	 *               "ordered set of arbitrary strings" (`ranking` needs its
	 *               options declared, `select` picks one of a closed set).
	 *   `list` /    a tree. Reorder, add, remove and per-row edits are the
	 *   `object`    owning surface's gestures, so the host renders it from the
	 *               row declaration and this says so rather than putting a text
	 *               box over an array.
	 *   `secret`    write-only by type: never echoed back, ever. A stored
	 *               secret is ciphertext, and a form that round-tripped it
	 *               would write the mask back over the value.
	 *   anything    a plain text box. `valueDeclOf` returns null for "declared
	 *   else       but unrenderable" too — an enum with no options, a share
	 *               with no members — so this branch is a real fallback, not
	 *               dead code.
	 */
	import {
		i18nText,
		valueDeclOf,
		valueKind,
		validateValue,
		type I18n,
		type ValueDecl,
	} from '@serene-pub/sdk'
	import { controlFor } from './resolve.js'

	interface Props {
		/** The field's key in the schema — the id and the label fallback. */
		name: string
		/** The SDK's `FieldDecl`. Typed loosely so a host may pass extras. */
		decl: Record<string, any>
		value: unknown
		readonly?: boolean
		/** Namespaces the generated ids when a page shows more than one form. */
		idPrefix?: string
		oncommit: (next: unknown) => void
	}

	let { name, decl, value, readonly = false, idPrefix = 'sf', oncommit }: Props =
		$props()

	const id = $derived(`${idPrefix}-${name}`)
	// Display text through the SDK's one resolver (R-20); the key when a field declares none.
	const en = (v: unknown, fallback: string): string => i18nText(v as I18n | undefined) ?? fallback

	const vd = $derived<ValueDecl | null>(valueDeclOf(decl))
	const kind = $derived(vd ? valueKind(vd) : null)
	const Control = $derived(kind ? controlFor(kind) : undefined)

	/** Live validation, from the same validator the server writes through. */
	const errors = $derived(
		vd && value !== undefined && value !== null ? validateValue(vd, value) : [],
	)

	const asLines = (v: unknown): string =>
		Array.isArray(v) ? v.join('\n') : String(v ?? '')
</script>

<div class="controls-field flex flex-col gap-1">
	<!--
		Always a real `<label for>`, booleans included.

		An earlier version rendered a plain <span> for `boolean@1`, reasoning
		that BooleanControl wraps its own <label> and a second one would
		associate the input twice. Multiple labels are legal, and the cost of
		avoiding them was the whole point of a label: the checkbox's only
		accessible name became BooleanControl's wrapper, which reads "On" or
		"Off". Every boolean field in every generated form announced itself as
		"On" — the field's name was on screen and invisible to a screen reader.
	-->
	<label class="text-sm font-medium" for={id}>
		{en(decl.label, name)}{#if decl.required}<span class="controls-required" title="required"
				>*</span
			>{/if}
	</label>

	{#if vd && Control}
		<Control decl={vd} {value} {readonly} {id} oncommit={(next: unknown) => oncommit(next)} />
	{:else if vd && Control === null}
		<!-- Host-integrated (24 §8): the choices are instance data — a prompt
		     list is a fact about a database, not about a declaration — so the
		     package ships no control and the host supplies one. Saying so is
		     the honest render; a blank box is not. -->
		<p class="controls-host-integrated text-xs">
			<code>{kind}</code> is host-integrated — the host renders a data-connected
			picker for it, because its choices live in the instance, not in the declaration.
		</p>
	{:else if decl.type === 'string[]'}
		<textarea
			{id}
			class="textarea w-full"
			disabled={readonly}
			rows="3"
			placeholder="One per line"
			value={asLines(value)}
			onchange={(e) =>
				oncommit(
					e.currentTarget.value
						.split('\n')
						.map((l) => l.trim())
						.filter(Boolean),
				)}
		></textarea>
	{:else if decl.type === 'list' || decl.type === 'object'}
		<!-- Host-integrated, on the same terms as the branch above and for a
		     different reason: the value is a TREE, and editing one is reorder,
		     add, remove and per-row edits — gestures that belong to whatever
		     surface owns the write, not to a field renderer. The host's list
		     editor renders from `decl.item` / `decl.fields`; saying so is the
		     honest render, and a text box over an array is not. -->
		<p class="controls-host-integrated text-xs">
			<code>{decl.type}</code>
			is host-integrated — the host renders an editor for it from the row
			declaration, because reordering and adding rows are its gestures to
			own.
		</p>
	{:else if decl.type === 'secret'}
		<input
			{id}
			type="password"
			class="input w-full"
			disabled={readonly}
			placeholder="••••••••"
			autocomplete="off"
			onchange={(e) => oncommit(e.currentTarget.value)}
		/>
		<p class="controls-muted text-xs">
			Write-only: a stored secret is never read back into a form.
		</p>
	{:else}
		<input
			{id}
			type="text"
			class="input w-full"
			disabled={readonly}
			value={value == null ? '' : String(value)}
			onchange={(e) => oncommit(e.currentTarget.value)}
		/>
	{/if}

	{#if decl.description}
		<p class="controls-muted text-xs">{en(decl.description, '')}</p>
	{/if}

	{#if errors.length}
		<ul class="controls-errors text-xs">
			{#each errors as e}
				<li>{e}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.controls-muted {
		opacity: 0.65;
	}
	.controls-required {
		opacity: 0.7;
		margin-inline-start: 0.15em;
	}
	.controls-host-integrated {
		opacity: 0.75;
		border-inline-start: 2px solid currentColor;
		padding-inline-start: 0.5rem;
	}
	.controls-errors {
		margin: 0;
		padding-inline-start: 1.1rem;
		color: var(--controls-error, #e07a7a);
	}
</style>
