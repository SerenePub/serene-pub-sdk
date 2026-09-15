/**
 * Configuration resolution (12 §2). Five layers, first hit wins, evaluated
 * independently per path — which is what makes an admin's connection change reach a
 * user who has customized their prompts (F20).
 *
 * ## Why `instance` sits above `preset` (0.6 revision)
 *
 * The original order put the selected config above the instance layer, reading
 * `instance` as "the defaults a config sits on". That made an administrator's
 * live edit the one write in the system that could store cleanly and do
 * nothing: the shipped default config covers most paths, so an instance
 * override under it was permanently shadowed — found the day an admin changed
 * a budget on screen and the run kept using the config's number.
 *
 * The revised reading: a *named config* is a value source you select; an
 * *override* is a decision someone made on top of it. Overrides therefore
 * always beat the selected config, and among overrides the more specific
 * scope wins — chat, then user, then instance.
 *
 * `defaults` is the sixth scope the split forced into the open: values a host
 * *projects* — system settings, a legacy layer — rather than values anyone
 * decided. They sit under the selected config, which is where "defaults" have
 * always belonged; the old chain filed them under `instance` and the two
 * meanings of that word are exactly what shadowed the admin's edits. Nothing
 * interactive ever writes at `defaults` (it appears in no write matrix row);
 * `author` — the type's declared parameter defaults — stays the floor.
 *
 * Resolved run-wide *before* execution, which is why referencing another node's
 * config is not a data edge (F35).
 */
import type { CapabilitySet } from './capabilities.js';
export type ScopeKind = 'session' | 'user' | 'preset' | 'instance' | 'defaults' | 'author';
export declare const SCOPE_ORDER: ScopeKind[];
export interface OverrideRow {
    nodeKey: string;
    slot: string;
    path: string;
    value: unknown;
    scopeKind: ScopeKind;
    scopeId?: string | number;
}
/**
 * The path a REF slot's single value lives at.
 *
 * A `connection` or `sampling` slot holds exactly one thing — the id of a row in
 * its own table — so it has no sub-paths and its address is the empty one.
 *
 * This constant exists because that fact was written down three different ways
 * and the three never met. The panel wrote `''`, the app's legacy projection
 * wrote `'ref'`, and this file's own executor read `'$ref'`; resolution below is
 * exact-match on `(nodeKey, slot, path)`, so the three were unrelated addresses
 * that could never collide and never warn. A pick made in the config panel was
 * saved, shown back, and read by nobody — for as long as the feature has existed.
 *
 * `''` is the winner because it is what the writer already emits, so it is what
 * is already in every user's `pipeline_config_values`. Any other choice would
 * migrate live data to match a convention only the reader believed in.
 *
 * @see normalizeSlotPath — accepts the two dead spellings, loudly.
 */
export declare const SLOT_VALUE: '';
/** Test seam: the warn-once set is process-global by design. */
export declare function _resetSlotPathWarnings(): void;
export interface SamplingConfig {
    id: string;
    name: string;
    /** Which vocabulary `values` speaks — a `SAMPLING_SCHEMAS` key (sampling.ts). */
    shape: string;
    values: Record<string, unknown>;
    /**
     * Which of `values` is actually switched on.
     *
     * Without this the world could carry a config's values but not its
     * switchboard, so slot resolution had no choice but to hand every stored
     * value to the provider — including the ones a person had switched off. A
     * sampler turned off in the sidebar went on being sent, and the only symptom
     * was generation that did not match the settings on screen.
     *
     * Absent (as opposed to empty) means a world that predates the distinction:
     * every value is treated as on, which is what resolution did before.
     */
    enabled?: string[];
}
export interface ConnectionRecord {
    id: string;
    name: string;
    kind: string;
    /** Readable — not a credential (01 §10). */
    metadata: {
        contextLength?: number;
        tokenizer?: string;
        model?: string;
        supportedSamplers?: string[];
    };
    /** Never readable by any node. Injected per call by the executor. */
    material: Record<string, string>;
    /**
     * What this connection can actually do (capabilities.ts), resolved.
     *
     * Readable, and on the same side of the line as `metadata`: a binding asking
     * whether it may send an image is asking about the wire protocol, not about a
     * credential. Absent or empty means **undetermined** — what a connection
     * nobody has tested yet looks like — and never "this connection can do
     * nothing"; a caller that reads it as a denial will hide working connections.
     */
    capabilities?: CapabilitySet;
    enabled?: boolean;
}
export interface ConfigWorld {
    overrides: OverrideRow[];
    samplingConfigs: SamplingConfig[];
    connections: ConnectionRecord[];
    /** Singleton kinds, e.g. embeddings (01 §10). */
    activeConnection: Record<string, string | null>;
    authorDefaults?: Record<string, Record<string, Record<string, unknown>>>;
}
export type ResolvedConfig = Record<string, Record<string, Record<string, unknown>>>;
/**
 * A resolved value **and the layer it won at**.
 *
 * The layer is not decoration. *"I changed this and nothing happened"* is the
 * most common support question this system can produce, and it is unanswerable
 * from the value alone — the answer is always "something above you set it too",
 * and only this says which something.
 */
export interface ResolvedSource {
    value: unknown;
    /** Which layer won. `author` means the declared default was never overridden. */
    scopeKind: ScopeKind | 'author';
    /** The user or chat the winning row belonged to, where one applies. */
    scopeId?: string | number;
}
export type ResolvedConfigSources = Record<string, Record<string, Record<string, ResolvedSource>>>;
/**
 * Effective config **with provenance** = base ⊕ overrides, per (nodeKey, slot, path).
 *
 * This is the primitive; `resolveConfig` is derived from it rather than written
 * beside it. Two implementations of a five-layer walk are two implementations
 * that eventually disagree about which layer wins — and the one that disagrees
 * silently is whichever one the UI is not using.
 */
export declare function resolveConfigSources(world: ConfigWorld, nodeKeys: string[]): ResolvedConfigSources;
/** Effective config = base ⊕ overrides, per (nodeKey, slot, path). */
export declare function resolveConfig(world: ConfigWorld, nodeKeys: string[]): ResolvedConfig;
/**
 * Which scopes may write which slot (12 §4). The admin cascade needs no mechanism:
 * connection has no writable scope at chat/user, so an admin's choice reaches
 * everyone automatically.
 */
export declare const WRITE_MATRIX: Record<string, ScopeKind[]>;
export declare function mayWrite(slot: string, scope: ScopeKind): boolean;
/** Reject a write the matrix forbids, with the reason (15 §1.3). */
export declare function assertWritable(slot: string, scope: ScopeKind): void;
