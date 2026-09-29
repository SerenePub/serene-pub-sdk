/**
 * The **sandbox-extension** authoring reference — the manifest shape a plugin's
 * entry point declares, compiled and validated here so drift is caught at build
 * time, not at install.
 *
 * This is a DISTINCT authoring surface from `compilePlugin` (./compiler): that
 * one packages a *pipeline* extension and derives `permissions` **compiled from
 * usage** in the pipeline taxonomy (`core:read`, `provider:call`, `event:…`).
 * A sandbox extension instead **declares** its permissions in the sandbox
 * taxonomy — `storage`, `network` (host allowlist, wildcards allowed),
 * `resource:*`, `event:*` — names its hooks directly, and runs on the QuickJS/SES
 * backends. The two models genuinely diverge on transport, permission derivation
 * and hook identity; they coexist here as separate surfaces for the 0.6.0 preview
 * and are reconciled in 0.7.0 rather than force-merged now. See the divergence
 * note in the app's project memory.
 *
 * Kept dependency-free and pure so it runs in any author toolchain; the app's
 * runtime reads exactly the manifest this emits (its `permissions.ts` interprets
 * `{ storage, network, resources, events }`).
 */
/** @internal */
export interface ManifestInput {
    /** "namespace/name" — lowercase, the stable address. */
    id: string;
    name: string;
    version: string;
    /** Declared hook names (must be valid identifiers). */
    hooks?: string[];
    /** Declared UI component names. */
    components?: string[];
    /** Included pipeline slugs. */
    pipelines?: string[];
    /** Sequential-only execution (manifest-declared). */
    sequential?: boolean;
    permissions?: {
        storage?: {
            quotaBytes?: number;
        };
        network?: {
            hosts?: string[];
        };
        resources?: string[];
        events?: string[];
    };
}
/** @internal */
export interface CompiledManifest {
    id: string;
    name: string;
    version: string;
    hooks: string[];
    components: string[];
    pipelines: string[];
    sequential: boolean;
    permissions: {
        storage?: {
            quotaBytes: number;
        };
        network?: {
            hosts: string[];
        };
        resources?: string[];
        events?: string[];
    };
}
/** @internal */
export declare function compileManifest(input: ManifestInput): CompiledManifest;
//# sourceMappingURL=sandbox.d.ts.map