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
import { i18nFindings } from './i18n.js';
import { refuseUnlessIdentical } from './hash.js';
const STAT_SHAPE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:stat-shape\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/;
/** @experimental */
export function assertStatShapeId(id) {
    if (!STAT_SHAPE_ID.test(id))
        throw new Error(`'${id}' is not a valid stat shape id. Use 'owner:stat-shape/name@N' — ` +
            `'core:stat-shape/number@1'. The id is what a slot names to say what its value is.`);
}
/**
 * Which kind of stat a field is, or `undefined` when it is a field core cannot
 * keep as a stat. The one reader of that question — the write gate, the
 * host's projection and the widgets all ask it here.
 * @experimental
 */
export function statShapeKindOf(field) {
    switch (field?.type) {
        case 'integer':
        case 'number':
            return 'number';
        case 'enum':
            return 'choice';
        case 'boolean':
            return 'boolean';
        case 'string':
        case 'text':
            return field.format === 'story-time' ? 'story-time' : field.format === undefined ? 'text' : undefined;
        case 'list': {
            // Items are text (free, or closed by the item's own `of`); lore
            // references ride beside them. A list of numbers or objects is a
            // field, not yet a stat.
            const item = field.item;
            if (!item)
                return 'list';
            if ((item.type === 'string' || item.type === 'text') && item.format === undefined)
                return 'list';
            if (item.type === 'enum')
                return 'list';
            return undefined;
        }
        default:
            return undefined;
    }
}
const registry = new Map();
/** Display text this registry carries outside `i18n`/`description`. @internal */
export const STAT_SHAPE_DISPLAY_KEYS = { display: ['label'] };
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
export function defineStatShape(id, props) {
    assertStatShapeId(id);
    const display = [...i18nFindings(props.label, `${id} label`, { required: true }), ...i18nFindings(props.description, `${id} description`)];
    if (display.length)
        throw new Error(`${id} declares display text a publish refuses (R-20):\n · ${display.join('\n · ')}`);
    if (!statShapeKindOf(props.field))
        throw new Error(`${id} declares a '${props.field?.type}' field${props.field?.format ? ` with format '${props.field.format}'` : ''}, ` +
            `which is not a value core can keep as a stat. A stat shape is a number, a choice, a list of ` +
            `text, a story time, a line of text or a switch.`);
    const decl = Object.freeze({ ...props, id, field: Object.freeze({ ...props.field }) });
    const existing = registry.get(id);
    if (existing)
        refuseUnlessIdentical(existing, decl, `duplicate stat shape id: ${id}`, STAT_SHAPE_DISPLAY_KEYS);
    registry.set(id, decl);
    return decl;
}
/** @experimental */
export const getStatShape = (id) => registry.get(id);
/** Every declared stat shape, in declaration order — the catalogue a picker offers. @experimental */
export const statShapes = () => [...registry.values()];
/** @internal */
export function _clearStatShapes() {
    registry.clear();
}
//# sourceMappingURL=statShapes.js.map