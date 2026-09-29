/**
 * Docs from declarations (24 T9, the generation half).
 *
 * A package's announcement already contains everything reference
 * documentation says: identity, genres with their event surfaces and shapes,
 * every pipeline's nodes and options with types, defaults and descriptions,
 * shipped prompts, presets with their bindings. So the docs are *rendered*,
 * never written — the same bytes that ship become the pages, and the pages
 * cannot drift from the product. The docs site (T9 proper) consumes this
 * markdown and adds live controls once @serene-pub/controls exists.
 */
import { type AnnouncementDocument } from '@serene-pub/sdk';
import type { TypeSurface } from './scaffold.js';
/** @experimental */
export interface DocPage {
    /** Repo-relative path, e.g. `pipelines/core_spec_respond.md`. */
    path: string;
    markdown: string;
}
/** @internal */
export declare function renderAnnouncementDocs(announcement: AnnouncementDocument, typeOf: (definitionId: string, version: number) => TypeSurface | undefined): DocPage[];
//# sourceMappingURL=docs.d.ts.map