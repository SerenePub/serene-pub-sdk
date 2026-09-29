/**
 * Core's shipped session presets (24 T6b) — declared here, seeded by SP.
 *
 * The announcement carries the full `preset()` declaration (validated
 * against the genre's event surface like any package's); `corePresetSeeds()`
 * is the same fact in the shape SP's seed pass writes, with the idempotence
 * keys existing installs already carry. The two are one list mapped, so they
 * cannot disagree.
 */
import { type PresetDecl, type PresetInput } from "@serene-pub/sdk";
/** Core's presets as authored — what the announcement declares (R48). @internal */
export declare const corePresetInputs: () => PresetInput[];
/** Core's presets in their stored form, every reference read down to its id. @experimental */
export declare const corePresets: () => PresetDecl[];
/** The seed-pass shape: idempotence key + the row fields SP writes. @internal */
export interface CorePresetSeed {
    /** Never change spelling — existing installs match on this. */
    seedKey: string;
    name: string;
    description: string;
    genreId: string;
    /**
     * Event → spec, from the declaration. Config references stay absent here
     * (= the spec's shipped default): a config id is an instance fact.
     */
    bindings: Record<string, {
        spec: string;
    }>;
    /**
     * The creation pre-fill, from the declaration's `defaults` (23 §9).
     * Written verbatim into the row's `defaults` column, so a declared
     * pre-fill reaches the create form without an extra carrier. Absent on
     * every core preset today — core ships no opinion about a new session's
     * name or scenario — and present the moment one declares it.
     *
     * Loosely typed on purpose: `PresetDefaults` is the SDK's *authoring*
     * shape, and this is the row shape, which is a JSON column the create form
     * reads key by key.
     */
    defaults?: Record<string, unknown>;
    /**
     * ⚠ **`includedActions` is deliberately not here**, though every core
     * preset declares `actions.include`.
     *
     * The column reads NULL as "the companion rule" — every action a spec
     * contributed for this genre comes along, enabled by default when it is in
     * the genre owner's own namespace — and an array as "exactly these". Core's
     * actions ARE in core's namespace for core's genres, so the two answers are
     * the same list and NULL is the one that keeps being right when a later
     * release adds a fourth. The declaration still carries the list, because an
     * announcement states what a package offers; the row states what an
     * administrator curated, and nobody has curated anything yet.
     */
    /**
     * Whether the instance offers it the moment it is seeded.
     *
     * The column defaults to true and every core preset has always been
     * offered, so this is written only where a declaration says so. It is a
     * SEED-time value: an administrator who later disables a preset keeps that
     * decision, because the seed pass never touches a row it did not create.
     */
    enabled?: boolean;
    isDefault: boolean;
    isImmutable: boolean;
}
/** The seed rows, in the order the seed pass writes them. @internal */
export declare const corePresetSeeds: () => CorePresetSeed[];
//# sourceMappingURL=presets.d.ts.map