/**
 * The registered type surfaces, for schema-aware generators.
 *
 * Lifted out of `bin.ts` because it is no longer only the CLI's: the docs
 * compiler's consumer calls `renderAnnouncementDocs(announcement, typeOf)`
 * directly, and the `typeOf` it has to pass is exactly this. Importing a
 * module whose side effect is `main()`'s argv handling to get one lookup
 * function is not a thing to ask of a caller.
 */
import type { TypeSurface } from './scaffold.js';
/** @internal */
export declare function typeSurfaces(): Promise<(definitionId: string, version: number) => TypeSurface | undefined>;
//# sourceMappingURL=typeSurfaces.d.ts.map