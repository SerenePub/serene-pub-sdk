/**
 * Scaffolds (24 §7): show the author the whole space before they write into
 * it. `scaffold config` walks a spec document's nodes and prints every
 * declared slot and field as a commented skeleton — types, defaults,
 * `(required)` markers — so authoring a config is deleting down to the four
 * lines you mean. `scaffold preset` prints a genre's event surface with the
 * announced candidates for each slot.
 *
 * Declarations resolve from a declaration artifact (24 §10): a local
 * announcement JSON, an HTTP URL serving one, or the installed
 * `@serene-pub/core-catalog` when nothing is named. The scaffold never
 * guesses — everything printed is read off documents.
 */
import type { SpecDocument } from '@serene-pub/sdk';
import type { AnnouncementDocument } from '@serene-pub/sdk';
/** One registered node type's declared surface, as the scaffold needs it. */
export interface TypeSurface {
    id: string;
    version: number;
    slots?: Record<string, any>;
}
/**
 * The config skeleton for one spec: every node with declarations, every
 * slot, every field — commented, defaults shown, ready to delete down.
 */
export declare function scaffoldConfig(doc: SpecDocument, typeOf: (typeId: string, version: number) => TypeSurface | undefined): string;
/**
 * The preset skeleton for one genre: its event surface with requiredness,
 * and for each slot the announced pipelines able to fill it.
 */
export declare function scaffoldPreset(genreId: string, announcement: AnnouncementDocument): string;
//# sourceMappingURL=scaffold.d.ts.map