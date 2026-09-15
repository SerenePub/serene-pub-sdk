/**
 * Typed-handle generation (24 T7b): from a declaration artifact, emit a TS
 * module of `use()` handles whose type parameter carries the target's whole
 * option space — node → slot → field, with field types derived from the
 * declared schemas. `config(handle, …)` then autocompletes and typo-checks
 * the delta at the keyboard, before the compile-time coverage pass and long
 * before the instance's authoritative check.
 *
 * Generated, never written: the same declarations that ship become the
 * types, so they cannot drift from the documents.
 */
import type { AnnouncementDocument } from '@serene-pub/sdk';
import type { TypeSurface } from './scaffold.js';
/** The generated module: one typed handle per pipeline, one per genre id. */
export declare function generateTypedHandles(announcement: AnnouncementDocument, typeOf: (typeId: string, version: number) => TypeSurface | undefined): string;
//# sourceMappingURL=typegen.d.ts.map