/**
 * Scaffolds (24 §7): show the author the whole space before they write into
 * it. `scaffold config` walks a spec document's nodes and prints every
 * declared slot and field as a commented skeleton — types, defaults,
 * `(required)` markers — so authoring a config is deleting down to the four
 * lines you mean. `scaffold preset` prints a genre's event surface with the
 * announced candidates for each slot.
 *
 * `scaffold plugin` does the same thing one level up — a whole buildable
 * package, deleted down to placeholders — and lives in `scaffoldPlugin.ts`
 * because it writes a tree rather than printing a file. It is re-exported here
 * so `./scaffold.js` stays the one import the CLI reaches for.
 *
 * Declarations resolve from a declaration artifact (24 §10): a local
 * announcement JSON, an HTTP URL serving one, or the installed
 * `@serene-pub/core-catalog` when nothing is named. The scaffold never
 * guesses — everything printed is read off documents.
 */
import type { SpecDocument } from '@serene-pub/sdk';
import type { AnnouncementDocument } from '@serene-pub/sdk';
export { scaffoldPlugin, scaffoldValues, writeScaffoldedPlugin, ScaffoldError, type ScaffoldPluginOptions, type ScaffoldedFile, } from './scaffoldPlugin.js';
/** @experimental One registered node type's declared surface, as the scaffold needs it. */
export interface TypeSurface {
    id: string;
    version: number;
    slots?: Record<string, any>;
}
/**
 * The config skeleton for one spec: every node with declarations, every
 * slot, every field — commented, defaults shown, ready to delete down.
 * @experimental
 */
export declare function scaffoldConfig(doc: SpecDocument, typeOf: (definitionId: string, version: number) => TypeSurface | undefined): string;
/**
 * The preset skeleton for one genre: its event surface with requiredness,
 * and for each slot the announced pipelines able to fill it.
 * @experimental
 */
export declare function scaffoldPreset(genreId: string, announcement: AnnouncementDocument): string;
//# sourceMappingURL=scaffold.d.ts.map