/**
 * Sampling parameters, declared per shape.
 *
 * A sampling config used to be thirty typed columns and thirty `<key>Enabled`
 * booleans on one table — a layout that could only ever describe *text*
 * generation, because the columns named text samplers. Adding image generation
 * would have meant either a second table with a second seeding path and a second
 * picker, or image columns sitting empty on every text row. Both make the modality
 * a branch in every consumer.
 *
 * So a row is now `{ shape, values, enabled }`: an id saying which vocabulary it
 * speaks, an object of values, and the list of keys that are actually in play.
 * The vocabulary itself lives here, in the SDK, next to the shapes it is keyed by
 * — the same place a provider declares `shape: S.imageGen`, so a sampling config
 * and the provider that consumes it cannot drift into disagreeing about what a
 * parameter is called.
 *
 * ## Resolution
 *
 * `resolveSamplingValues` is the one path from a stored row to what an adapter
 * receives:
 *
 *   values → keep the keys named in `enabled` → keep the keys the shape declares
 *          → fill enabled-but-unset from the schema default → hand over
 *
 * Two kinds of key deliberately survive in the row without ever being sent: keys
 * that are switched off, and keys the shape does not declare. Neither is an error
 * and neither is discarded — turning a sampler off and back on must not lose the
 * value you had, and a row written by a newer build (or carrying a UI-only flag
 * like `contextTokensUnlocked`) must round-trip through an older one intact. The
 * filter is on the way *out*, not on the way in.
 *
 * ## What is not here
 *
 * Backend-specific knobs. Fooocus' `performance_selection`, a ComfyUI workflow, an
 * A1111 `override_settings` — those belong to the *connection*, declared by its
 * adapter's `profileSchema`. A sampling config is the modality's shared vocabulary;
 * if a key here meant something to only one backend, every other backend's picker
 * would be showing a control that does nothing. Adapters translate what they can
 * and report the rest as ignored.
 */
import type { SettingsSchema } from './settings.js';
import type { ShapeId } from './shapes.js';
/**
 * Text generation — the union of what the shipped adapters can map.
 *
 * Every key here appears in at least one adapter's key map. A row may enable a
 * key the *chosen* connection cannot honour (enabling DRY and then pointing the
 * config at Anthropic); that is reported by the adapter as ignored, not blocked
 * here, because the config outlives the connection it happens to be paired with.
 */
export declare const textSamplingSchema: SettingsSchema;
/**
 * Image generation — the parameters every image backend either honours or can
 * say it ignored.
 *
 * Everything is optional and nothing is required to have a value: an unset key
 * means "whatever the backend does by default", which is the only honest answer
 * when the same config is pointed at Fooocus, ComfyUI and a hosted API in turn.
 * `sampler` and `scheduler` are free strings rather than enums for the same
 * reason — the valid set is a property of the connection (its checkpoint, its
 * build), not of the vocabulary, so a picker fills them from the adapter's
 * reported capabilities.
 *
 * ⚠ These are the knobs of LOCAL DIFFUSION, and that is a real boundary rather
 * than an accident of which adapters happened to ship first. A hosted image
 * service shares almost none of them: OpenAI's gpt-image-1 takes `size` (an ENUM
 * of exactly `1024x1024`, `1024x1536`, `1536x1024`), `quality`, `background`,
 * `output_format`, `output_compression` and `n` — no steps, no CFG, no sampler,
 * no scheduler, no seed. `batch` maps to `n`, a free width/height has to SNAP to
 * one of the three allowed sizes, and the rest is inexpressible.
 *
 * That does not make this schema wrong; it makes it the shared vocabulary of the
 * backends that HAVE these knobs — and the rest of the answer is already in
 * place, so the fix is never "add hosted keys here". What one backend alone
 * offers belongs to its CONNECTION, declared by the adapter's `profileSchema`
 * (`quality` and `background` are profile fields); what a backend cannot honour
 * is REPORTED through `applied`/`ignored`, not dropped. A hosted-only key added
 * here would put a control that does nothing in front of every local user, which
 * is exactly what the "What is not here" note above forbids — and by the same
 * argument there is no such thing as a hosted sampling *preset*: a hosted
 * service has no sampling knobs to preset, it has a profile.
 */
export declare const imageSamplingSchema: SettingsSchema;
/**
 * Speech synthesis.
 *
 * Present because `core:oracle/speak@1` declares `sampling: { shape: S.tts }`,
 * and a sampling slot whose shape has no vocabulary resolves to nothing at all —
 * silently, since an unknown shape is an empty schema by design. A declared slot
 * with no declared vocabulary is the one combination where that fallback is
 * indistinguishable from a bug.
 *
 * `voice` is a free string for the same reason `sampler` is on images: the valid
 * names belong to the connection, not to the vocabulary.
 */
export declare const ttsSamplingSchema: SettingsSchema;
/** Every vocabulary, keyed by the shape whose connections speak it. */
export declare const SAMPLING_SCHEMAS: Record<ShapeId, SettingsSchema>;
/** The shape a row without one is assumed to speak. */
export declare const DEFAULT_SAMPLING_SHAPE: ShapeId;
/**
 * The vocabulary for a shape.
 *
 * An unknown shape resolves to an empty schema rather than throwing: a row
 * written by a plugin whose provider is not installed should read as "no
 * parameters I can offer", not as a crash in whatever happened to load it.
 */
export declare function samplingSchemaFor(shape?: ShapeId | null): SettingsSchema;
/** The stored side of a sampling config — the three columns that carry meaning. */
export interface SamplingRowLike {
    shape?: ShapeId | null;
    values?: Record<string, unknown> | null;
    enabled?: readonly string[] | null;
}
/** What an adapter receives: flat, enabled-only, defaults already applied. */
export type ResolvedSampling = Record<string, unknown>;
/**
 * Stored row → what the adapter is handed.
 *
 * The whole filter lives here so that no consumer has to remember the order, and
 * so "is this key on?" has exactly one answer in the codebase. Callers get a
 * plain object: spreading a runtime override onto it is expected and is how
 * per-call budgets are applied.
 */
export declare function resolveSamplingValues(row: SamplingRowLike, schema?: SettingsSchema): ResolvedSampling;
/**
 * Bring a row into a consistent state, without discarding anything.
 *
 * Called on the write path, so that what the form submits and what a seed
 * declares end up identical in the table. It coerces the types the schema
 * declares (a number field arriving as `"0.7"` from a form input is the common
 * case) and drops duplicate/ill-typed entries from `enabled`.
 *
 * It deliberately does NOT drop unknown keys from `values`: `enabled` is the
 * switchboard, `values` is the memory. Off-schema keys — a UI-only flag such as
 * `contextTokensUnlocked`, or a parameter belonging to a shape this build does
 * not know — stay exactly where they were, and `resolveSamplingValues` is what
 * keeps them off the wire.
 */
export declare function normalizeSamplingRow(row: SamplingRowLike, schema?: SettingsSchema): {
    shape: ShapeId;
    values: Record<string, unknown>;
    enabled: string[];
};
//# sourceMappingURL=sampling.d.ts.map