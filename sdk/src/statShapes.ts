/**
 * Stat shapes — the named shapes a stat's value may take, in the SDK's one
 * field language.
 *
 * A **stat shape** is a `FieldDecl` with a name: *number* is
 * `{ type: 'integer' }`, *list* is `{ type: 'list', item: { type: 'string' } }`.
 * An attribute slot says what its value is by naming one
 * (`shape: 'core:stat-shape/number@1'`) or by writing its own `FieldDecl`
 * inline (ruled 2026-09-25: stat shapes are the field language, and core
 * SEEDS a catalogue of common ones so stats stay predictable). Core's
 * catalogue is declared in `@serene-pub/core-catalog` through this file's
 * door, like anybody's would be (R26).
 *
 * ## Open in the declaration, closed in the behaviour
 *
 * A shape is open — any `FieldDecl` — but only the fields core can STORE,
 * check and draw are stat shapes. `statShapeKindOf` is that line, and it
 * names the six kinds core implements: a number (a bar when bounded), a
 * choice, a list, a story time, a line of text, a switch. A `share`, a
 * `media` reference or an `object` is a perfectly good field and not yet a
 * stat, and declaring a shape of one is refused with a sentence rather than
 * stored as a value nothing can draw.
 *
 * ⚠ **Not a `shape`.** `shapes.ts` owns the bare word — a versioned edge
 * contract between two nodes. This is always the qualified *stat shape*, in
 * prose and in the id segment (`:stat-shape/`).
 *
 * ⚠ Lore entry types keep their own fixed shapes (`entryShape`); a stat
 * shape describes a value an owner holds, never a lorebook row.
 */

import type { I18n } from './descriptors.js'
import { i18nFindings } from './i18n.js'
import { refuseUnlessIdentical } from './hash.js'
import type { FieldDecl } from './settings.js'

/** `owner:stat-shape/name@N` — `core:stat-shape/number@1`. @experimental */
export type StatShapeId = string

const STAT_SHAPE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:stat-shape\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/** @experimental */
export function assertStatShapeId(id: string): void {
	if (!STAT_SHAPE_ID.test(id))
		throw new Error(
			`'${id}' is not a valid stat shape id. Use 'owner:stat-shape/name@N' — ` +
				`'core:stat-shape/number@1'. The id is what a slot names to say what its value is.`,
		)
}

/**
 * What core can do with a stat, by the field it is declared as:
 *
 *  - `number` — `integer` or `number`; a bar when a floor and a ceiling are in force.
 *  - `choice` — `enum`: one of a closed set, a chip over a menu.
 *  - `list` — `list` of text: an ordered list whose items are text or lore
 *    references (`SlotLoreRef`), added, removed and reordered.
 *  - `story-time` — `string` with `format: 'story-time'`: a position on the
 *    story calendar (`storyTime.ts`), shown through the calendar.
 *  - `text` — `string` / `text`: a line of prose.
 *  - `boolean` — on or off.
 * @experimental
 */
export type StatShapeKind = 'number' | 'choice' | 'list' | 'story-time' | 'text' | 'boolean'

/**
 * Which kind of stat a field is, or `undefined` when it is a field core cannot
 * keep as a stat. The one reader of that question — the write gate, the
 * host's projection and the widgets all ask it here.
 * @experimental
 */
export function statShapeKindOf(field: FieldDecl | undefined): StatShapeKind | undefined {
	switch (field?.type) {
		case 'integer':
		case 'number':
			return 'number'
		case 'enum':
			return 'choice'
		case 'boolean':
			return 'boolean'
		case 'string':
		case 'text':
			return field.format === 'story-time' ? 'story-time' : field.format === undefined ? 'text' : undefined
		case 'list': {
			// Items are text (free, or closed by the item's own `of`); lore
			// references ride beside them. A list of numbers or objects is a
			// field, not yet a stat.
			const item = field.item
			if (!item) return 'list'
			if ((item.type === 'string' || item.type === 'text') && item.format === undefined) return 'list'
			if (item.type === 'enum') return 'list'
			return undefined
		}
		default:
			return undefined
	}
}

/** @experimental */
export interface StatShapeProps {
	/** The name a person reads where shapes are offered. Display text: stripped from the hash. */
	label: I18n
	/** What it is for. Display text: stripped. */
	description?: I18n
	/**
	 * The value's declaration. What it bounds (`min`/`max`, `of`) is the
	 * floor every slot of this shape starts from; a slot's own `config`
	 * deviates from it exactly as any layer does.
	 */
	field: FieldDecl
}

/** @experimental */
export interface StatShapeDecl extends StatShapeProps {
	readonly id: StatShapeId
}

const registry = new Map<StatShapeId, StatShapeDecl>()

/** Display text this registry carries outside `i18n`/`description`. @internal */
export const STAT_SHAPE_DISPLAY_KEYS = { display: ['label'] } as const

/**
 * Declare a stat shape.
 *
 * The registry discipline every other one here keeps: an id has one owner,
 * an identical re-declaration is a no-op (a dev-server reload re-running a
 * module must not throw), and a *different* one under a claimed id throws
 * with both hashes named. Declared ABOVE the slots that name it — a slot
 * naming a shape nothing declares is refused.
 * @experimental
 */
export function defineStatShape(id: StatShapeId, props: StatShapeProps): StatShapeDecl {
	assertStatShapeId(id)
	const display = [...i18nFindings(props.label, `${id} label`, { required: true }), ...i18nFindings(props.description, `${id} description`)]
	if (display.length)
		throw new Error(`${id} declares display text a publish refuses (R-20):\n · ${display.join('\n · ')}`)
	if (!statShapeKindOf(props.field))
		throw new Error(
			`${id} declares a '${props.field?.type}' field${props.field?.format ? ` with format '${props.field.format}'` : ''}, ` +
				`which is not a value core can keep as a stat. A stat shape is a number, a choice, a list of ` +
				`text, a story time, a line of text or a switch.`,
		)
	const decl: StatShapeDecl = Object.freeze({ ...props, id, field: Object.freeze({ ...props.field }) })
	const existing = registry.get(id)
	if (existing) refuseUnlessIdentical(existing, decl, `duplicate stat shape id: ${id}`, STAT_SHAPE_DISPLAY_KEYS)
	registry.set(id, decl)
	return decl
}

/** @experimental */
export const getStatShape = (id: StatShapeId): StatShapeDecl | undefined => registry.get(id)

/** Every declared stat shape, in declaration order — the catalogue a picker offers. @experimental */
export const statShapes = (): StatShapeDecl[] => [...registry.values()]

/** @internal */
export function _clearStatShapes(): void {
	registry.clear()
}
