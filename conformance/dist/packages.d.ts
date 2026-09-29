/**
 * A package's own evidence (C31–C33): what a plugin's BUILT artifact — its
 * `manifest.json` and handler bundle — hands the kit, read the way an
 * instance reads it at install, never by evaluating the package's source.
 *
 * The kit stays a host kit: these helpers only build the seams a host
 * supplies (`HostUnderTest.shipped`, `swaps`, `nodeHandler`, `components`),
 * so a package's test runs the same cases core runs, over its artifact.
 */
import type { Descriptor, GenreDecl, PresetDecl } from '@serene-pub/sdk';
/** @experimental One swap a package offers (R28/R29), with the declaration of what it seats. */
export interface SwapEvidence {
    /** The spec the swap targets (`core:spec/chat-turn-order`). */
    spec: string;
    /** The node key on that spec it stands in for. */
    node: string;
    /** The contributed definition's id. */
    definitionId: string;
    /**
     * Its declaration — the descriptor the package's builder judged, as the
     * manifest carries it (`nodeDefinitions[].declaration`). Undefined when the
     * package offers a definition it does not declare, which C32 refuses.
     */
    definition: Descriptor | undefined;
}
/**
 * A manifest's node-definition entry. `ports` and `slots` are the audit
 * summary (names only); `declaration` is the descriptor verbatim (D-6b), which
 * is what a fit check reads.
 * @experimental
 */
export interface ManifestNodeDefinition {
    id: string;
    kind: string;
    ports?: {
        in: string[];
        out: string[];
    };
    declaration?: Partial<Descriptor> & Record<string, unknown>;
}
/** @experimental The parts of a compiled `manifest.json` the kit reads. Structural: any compiler version's manifest fits. */
export interface PackageManifestLike {
    slug: string;
    genres?: GenreDecl[];
    presets?: PresetDecl[];
    swaps?: Array<{
        spec: string;
        node: string;
        definition: string;
    }>;
    nodeDefinitions?: ManifestNodeDefinition[];
    components?: Array<{
        slug: string;
        entry: string;
        basedOn?: {
            component: string;
        };
    }>;
    /** The widgets it offers: which component each renders, the scopes it asks for, the base sections it reads. */
    widgets?: Array<{
        id: string;
        component?: string;
        scopes?: readonly string[];
        reads?: readonly string[];
    }>;
    hooks?: {
        nodeHandlers?: Record<string, string>;
    };
}
/** @experimental A built module as `HostUnderTest.components()` lists it (C30, C31) — structurally `BuiltComponent`. */
export interface ManifestComponent {
    id: string;
    code: string;
    grants?: string[];
    reads?: string[];
    /** The core component it is a clone of (`components[].basedOn.component`) — C30's parity half reads it. */
    basedOn?: string;
}
/**
 * The BUILT modules a manifest lists, each with what its widgets declare —
 * `HostUnderTest.components` for a package, so C31 mounts every module the
 * way the page mounts it on a layout: granted the section scopes its widgets
 * ask for (`scopes`; a `channel:` scope is not a section grant) and handed
 * only the base sections they read (`reads`, R75).
 *
 * A component more than one widget renders gets the union — the most any
 * placement hands it. When any of those widgets leaves `reads` out, it reads
 * every base section and `reads` is left out here too; a component no widget
 * renders gets neither (every base section, no grants). `code` reads a
 * module's `entry` (a path relative to the package root, as the manifest
 * carries it).
 * @experimental
 */
export declare function componentsFromManifest(manifest: PackageManifestLike, code: (entry: string) => string | Promise<string>): Promise<ManifestComponent[]>;
/**
 * A manifest's node definition, back as the descriptor its builder judged.
 *
 * The compiled manifest already carries every definition's declaration
 * verbatim (`nodeDefinitions[].declaration`, D-6b) — port names AND shapes,
 * slot declarations. The top-level `ports`/`slots` stay the names-only audit
 * summary an admin's screen and the install check read; turning them into
 * shapes would change a field every existing manifest reader keys on. So
 * this reads the declaration, and refuses — in a sentence — an entry that
 * has none (a manifest packaged before D-6b: re-package it) or one whose
 * declaration names another definition.
 * @experimental
 */
export declare function definitionFromManifest(entry: ManifestNodeDefinition): Descriptor;
/**
 * The swaps a manifest offers, each with the declaration of the definition it
 * seats — `HostUnderTest.swaps` for a package. A swap naming a definition the
 * manifest does not declare carries `definition: undefined` (C32 says so).
 * @experimental
 */
export declare function swapsFromManifest(manifest: PackageManifestLike): SwapEvidence[];
/**
 * The definition a spec seats at `node`, resolved in this SDK's registry — a
 * host's `pinnedDefinition` over its own compiled spec (for core's, the
 * document `coreSpec(id).build()` returns). Undefined when the spec has no
 * such node or the registry does not know what it seats.
 * @experimental
 */
export declare function pinnedDefinitionIn(doc: {
    nodes: ReadonlyArray<{
        key: string;
        definitionId: string;
        definitionVersion: number;
    }>;
} | undefined, node: string, lookup?: (id: string) => Descriptor | undefined): Descriptor | undefined;
/** @experimental A node handler as the executor calls it. */
export type NodeHandler = (input: unknown, ctx: unknown) => unknown;
/**
 * The hooks a built handler bundle exports (`module.exports.hooks`), by
 * export name. The bundle is the sandbox's self-contained CommonJS module and
 * is evaluated here with a `require` that refuses every id, as the sandbox
 * gives it none — this is NOT the host's isolation (SES/QuickJS are the
 * app's), only the evaluation a test needs to call the handlers.
 * @experimental
 */
export declare function hooksFromBundle(code: string): Record<string, NodeHandler>;
/**
 * The seams a package's BUILT artifact supplies, from its manifest (and
 * handler bundle): what it ships (C28, C29), the swaps it offers (C32) and
 * the handler each definition runs (C33). Spread into a `HostUnderTest`
 * beside the seams only the test can give — `pinnedDefinition` (the host's
 * own specs), `components`/`mountComponent` (its harness).
 * @experimental
 */
export declare function manifestSeams(manifest: PackageManifestLike, bundle?: string): {
    shipped: () => {
        genres: GenreDecl[];
        presets: PresetDecl[];
    };
    swaps: () => SwapEvidence[];
    nodeHandler: (definitionId: string) => NodeHandler | undefined;
};
/**
 * A sample value per shape, for the binding probes' input (C33): a
 * definition whose every in-port has a sample here is probed with it; the
 * host's `probeInput(d)` answers any other. Turn order's two (a strategy
 * reads candidates and the history) are here because every strategy swap
 * reads them.
 * @experimental
 */
export declare const PROBE_SAMPLES: Readonly<Record<string, unknown>>;
/**
 * The probe input for `d` from `PROBE_SAMPLES`, one value per in-port, or
 * the shapes it has no sample for.
 * @experimental
 */
export declare function probeSampleFor(d: Pick<Descriptor, 'ports'>): {
    input: Record<string, unknown>;
} | {
    missing: string[];
};
//# sourceMappingURL=packages.d.ts.map