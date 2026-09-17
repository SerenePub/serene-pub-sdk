/**
 * The pipeline type registry — the ruling on 13 §10c.
 *
 * ## Where a type's shape comes from, at three different moments
 *
 * The question underneath "schema sources" is which artefact is authoritative, and the
 * honest answer is that a different one is authoritative at each moment. Writing that
 * down is the ruling; pretending there is a single source is what would go wrong.
 *
 * | moment | source of truth | why |
 * |---|---|---|
 * | authoring | the `Descriptor` in code | the author is *defining* the type; nothing else knows it yet |
 * | compiling a spec | generated `/contracts` | frozen per release, so a pin resolves the same way forever (04 §2) |
 * | installing | **the registry row** | the only one core can read without executing the plugin |
 *
 * The third row is the whole point. Core must decide whether a plugin is installable
 * before it ever runs the plugin's code — F6 means core imports documents, never
 * authoring JS — so install-time validation reads two things that are both plain data:
 * the plugin's **manifest** (types summarized, permissions compiled from usage) and its
 * **documents** (nodes pinned by `definitionId@version`, edges carrying the shapes they were
 * compiled against).
 *
 * ## What that makes checkable
 *
 * The interesting failure is not a plugin that pins a type nobody has — that one is
 * obvious and fails loudly. It is a plugin **built against a different release**, where
 * every id still resolves but a port now produces a different shape. The document
 * records the shape each edge was compiled against, so comparing it to the registry
 * catches exactly that, and catches it at install rather than mid-run.
 */
import { type Descriptor, type EntryShape, type ScriptPointDecl, type SlotDecl } from './descriptors.js';
import { type ScriptKindDecl } from './scripts.js';
import type { SettingsSchema } from './settings.js';
import type { SpecDocument } from './document.js';
/** A `pipeline_definition_registry` row (02 §3), as data. */
export interface RegistryEntry {
    id: string;
    version: number;
    kind: string;
    /**
     * Failing is tolerated (see `Descriptor.optional`). Carried into the row
     * because it is part of the contract a pin freezes: the ports do not move
     * when it flips, but every spec pinning the version changes behaviour on
     * failure.
     */
    optional?: boolean;
    /**
     * Interior script points (18 §4e) — carried into the row for the same
     * reason `slots` is: the panel offers one chain option per point and must
     * render it without loading the plugin (F6). Keys and `accepts` are
     * contract and hash; labels are display text, stripped like `i18n`
     * everywhere else. Always the full shape — the projection folds the
     * deprecated spellings through `scriptPointsOf`, so a row never carries a
     * bare string or a point without `accepts`.
     */
    scriptPoints?: ScriptPointDecl[];
    /**
     * The chat-shape contract (19 §1) — present only on mode-bearing input
     * types. Carried for the reason `slots` is: the mode picker and the chat
     * settings render from rows (F6), never from a loaded spec. Hashed —
     * widening a capability changes what existing sessions legally contain —
     * with any embedded `i18n`/`description` stripped like everywhere.
     */
    sessionShape?: unknown;
    ports: {
        in: Record<string, string | undefined>;
        out: Record<string, string | undefined>;
    };
    /**
     * The **declarations**, not their names.
     *
     * This carried `string[]` until 0.6.0, and that quietly broke the promise the
     * column exists to keep. 12 §2 says slot declarations live in the type descriptor
     * *"so a plugin Provider's prompt fields render next to core's automatically, with
     * no UI work"*, and the table above says the registry row is what core reads
     * **without executing the plugin**. A name list satisfies neither: a form
     * generator given `['prompts', 'params']` knows a form exists and nothing about
     * what is in it, so it has to fall back to the in-process descriptor map — which
     * exists for core types, does not exist for a `transport: 'process'` plugin type,
     * and is the exact thing F6 forbids reaching for.
     *
     * Storing the declaration makes the pipeline view (05 §0a) and the lens view
     * (05 §3) generated from rows, which is what lets a plugin's sliders appear beside
     * core's with nothing authored twice.
     *
     * One of them the author did not write: `settings` (R-9), which the
     * projection derives from `optional` / `effects` / `reviewDefault` so the
     * panel finds the switch and the gate here like any slot. It is left out
     * of the content hash — `authoredSlots` — for the reason that file gives.
     */
    slots: Record<string, SlotDecl>;
    /**
     * The entry-row contract (Part 1), minus its `fields` — present only on
     * entry types. Carried for the reason `slots` is: the ranker, the assembler
     * and the constraint projection all read the declaration from **rows**, and
     * the row is the only source that exists for a type this process never
     * loaded (F6).
     *
     * Hashed whole. Roles decide where a row competes, how it sorts, who may
     * see it and where it renders, so moving one changes what an untouched
     * install does — `@N+1`, deliberately.
     */
    entryShape?: Omit<EntryShape, 'fields'>;
    /**
     * The declared schema of the type-specific half of a row — `entryShape.fields`,
     * living in the column that already exists for a declared schema rather
     * than riding inside the blob above.
     *
     * Split out because the readers differ: the boot step that projects CHECK
     * constraints and indexes wants a schema, generically, from a column it can
     * name — the same shape the form renderer already reads everywhere else.
     * Hashed for the reason the constraint projection makes unavoidable: a
     * schema change *is* a constraint change.
     */
    configSchema?: SettingsSchema;
    /**
     * What the type calls itself — the name a screen shows for it.
     *
     * Outside the content hash, like every other piece of display text: naming
     * a node better is not a contract change. Carried in the row for the same
     * reason `slots` is — the pipeline builder renders from rows and never
     * loads the plugin (F6), so a name only the descriptor knows is a name no
     * plugin's node can have.
     */
    i18n?: unknown;
    /**
     * Script types only: how a chain of this operation treats what its links
     * return — `transform` folds into the flowing bag, `verdict` is consumed by
     * the hook and reduced (18 §5).
     *
     * Hashed, and it has to be. Flipping it moves no port and keeps every
     * attachment compiling, while turning "each link rewrites the text" into
     * "the earliest answer wins" — the same shape of silent behaviour change
     * `optional` was, and the reason that one is hashed.
     */
    semantics?: string;
    effects?: string;
    causesEvent?: string;
    public?: boolean;
    /** Null for core types; the plugin slug for plugin types (12 §3b). */
    owner?: string;
    /** Which SP release seeded this row. */
    release?: string;
}
/** Project descriptors into registry rows — how core seeds and refreshes the table. */
export declare function snapshotRegistry(types: Array<Descriptor | ScriptKindDecl>, meta?: {
    owner?: string;
    release?: string;
}): RegistryEntry[];
export type InstallCode = 'E_UNKNOWN_TYPE' | 'E_SHAPE_DRIFT' | 'E_REDECLARES_CORE' | 'E_PRIVATE_TYPE' | 'E_MISSING_BINDING' | 'E_IN_PROCESS_HOOK' | 'W_NEWER_VERSION';
export interface InstallFinding {
    severity: 'error' | 'warning';
    code: InstallCode;
    message: string;
    /** What the admin or author does about it. Never omitted (15 §1.3). */
    fix: string;
    where?: string;
}
export interface InstallInput {
    /** The plugin's own declared types, as summarized in its manifest. */
    declares: Array<{
        id: string;
        binding?: string;
        ports?: RegistryEntry['ports'];
        runtime?: string;
    }>;
    /** The pipeline documents shipped beside the manifest. */
    documents: SpecDocument[];
    /** The installing instance's registry. */
    registry: RegistryEntry[];
    /** Type ids the plugin enumerates hooks for — a declared type with no binding cannot run. */
    bound?: string[];
    owner?: string;
}
/**
 * Decide whether a plugin is installable, from data alone.
 *
 * Never loads the plugin. Every finding names what to do, because the reader is an admin
 * who did not write the plugin and cannot be expected to infer the fix from the symptom.
 */
export declare function checkInstall(input: InstallInput): InstallFinding[];
export declare const installable: (f: InstallFinding[]) => boolean;
export declare function renderInstall(findings: InstallFinding[]): string;
//# sourceMappingURL=registry.d.ts.map