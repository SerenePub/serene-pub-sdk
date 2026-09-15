/**
 * What a connection can do, and what a node needs from one.
 *
 * A connection used to carry a single `modality` — one scalar saying "this is a
 * text connection" or "this is an image connection" — and adapters were split
 * into two families by it. That model cannot describe a real backend. KoboldCPP
 * does text, images, vision, speech and transcription from one process and
 * already reports so. An OpenAI-compatible endpoint may or may not do images
 * depending entirely on who is behind it. And the model was already violated in
 * practice: rows carrying `modality: 'embeddings'` existed and matched no family.
 *
 * The replacement has two axes, deliberately kept apart:
 *
 *   - **Transforms** say what can *flow*: text in, an image out. They are the
 *     modality question, asked properly — as a relation rather than a label.
 *   - **Features** say how a request can be *constrained*: JSON schema, a
 *     grammar, tool calls. Orthogonal to transforms; a backend that generates
 *     text may or may not be able to promise the shape of it.
 *
 * Mixing the two into one list is what makes a capability screen unreadable:
 * "Chat" and "Strict JSON schema" are not the same kind of fact and should not
 * sit in the same column.
 *
 * ## Who decides
 *
 * Four layers, each narrowing the last, resolved once by `resolveCapabilities`:
 *
 *   adapter (what the WIRE FORMAT can express — gates the key space entirely)
 *     → preset  (what this named service defaults to)
 *     → probe   (what the live backend actually answered)
 *     → user    (the final toggle)
 *
 * The adapter layer is a gate, not a default: a capability absent from
 * `supports` can never be turned on by any later layer, because the protocol has
 * no way to say it. That is the whole reason an adapter is scoped by API format
 * rather than by vendor — "Claude over an OpenAI-compatible endpoint" and
 * "Claude over the native Anthropic API" differ in exactly this.
 */
import type { I18nText } from './settings.js';
/**
 * The endpoints of a transform.
 *
 * A superset of `MediaKind`, and the difference is the point. In
 * `MediaCapability`, text is the *implicit* kind — `accepts: ['image']` means
 * "images as well as text", and there is no way to write "an image and text
 * together, both required". That is precisely the thing vision needs to say, so
 * text is a first-class member here.
 *
 * `embedding` is out-only: a vector is never stored as media and never travels
 * as a `MediaRef`. It is here because embedding connections exist and had
 * nowhere to live under the old one-modality model.
 */
export declare const IO_KINDS: readonly ["text", "image", "audio", "video", "document", "embedding"];
export type IoKind = (typeof IO_KINDS)[number];
export interface Transform {
    in: readonly IoKind[];
    out: readonly IoKind[];
}
/**
 * A transform's canonical address, e.g. `text+image->text`.
 *
 * A transform is a map key, a JSON object key, a UI list key, a database value
 * and a `satisfies()` lookup — and `{in, out}` is none of those. The derived
 * string is, and it is stable because the sides are ordered by `IO_KINDS`
 * declaration order rather than alphabetically: text leads, so vision reads
 * `text+image->text` rather than `image+text->text`.
 */
export type TransformId = `${string}->${string}`;
/** Read an id back apart, for a UI that wants the kinds rather than the string. */
export declare function parseTransform(id: TransformId): Transform;
/**
 * The kinds, as values.
 *
 * `IoKinds.image` autocompletes; `IoKinds.imgae` is a compile error. That is the
 * whole job — a JS/TS-defined node names its combinations with objects and enum
 * members rather than by spelling a string, because `'text+imgae->text'` is a
 * perfectly good `TransformId` today and fails at *run* time, on the machine of
 * whoever installed the plugin, as a capability nothing can ever satisfy.
 *
 * ⚠ Named `IoKinds`, NOT `Kind`. `descriptors.ts` has exported `Kind` — the node
 * kind, `'input' | 'query' | 'task' | 'provider' | 'consumer'` — since long
 * before this existed, and both names would meet inside a single descriptor
 * literal that already says `kind: 'provider'`. `IoKinds` also matches the two
 * spellings already here, `IoKind` and `IO_KINDS`.
 *
 * `satisfies Record<IoKind, IoKind>` is load-bearing in both directions: adding
 * a kind to `IO_KINDS` without adding it here stops compiling, and so does a
 * member here whose value is not its own name.
 */
export declare const IoKinds: {
    readonly text: 'text';
    readonly image: 'image';
    readonly audio: 'audio';
    readonly video: 'video';
    readonly document: 'document';
    readonly embedding: 'embedding';
};
/**
 * Non-empty, structurally.
 *
 * `TransformId` is the open template `${string}->${string}`, so `'->'` is a
 * legal one today. Requiring at least one kind per side is what makes an empty
 * side unwritable through `tf()` rather than merely wrong.
 */
type Kinds = readonly [IoKind, ...IoKind[]];
/** What an author writes: `{ in: [IoKinds.text, IoKinds.image], out: [IoKinds.text] }`. */
export interface TransformShape {
    in: Kinds;
    out: Kinds;
}
/**
 * Walk the CANONICAL order keeping members of `Ks` — sorting and deduping fall
 * out free.
 *
 * We filter the fixed six-element `IO_KINDS` tuple rather than sorting the
 * author's, so this mirrors the runtime `side()` by CONSTRUCTION: recursion
 * depth six, no combinatorics, no type-level comparator to keep in step, and no
 * way for the computed type and the emitted string to drift. An author writing
 * `[IoKinds.image, IoKinds.text]` gets `text+image->…`, the same id `side()` builds.
 *
 * ⚠ Walks `typeof IO_KINDS` positionally, so it degrades SILENTLY to `never` if
 * `IO_KINDS` ever stops being a literal tuple — drop the `as const` and every
 * `tf()` call becomes an unassignable `never` rather than a wrong string.
 */
type InOrder<O extends readonly IoKind[], Ks extends readonly IoKind[]> = O extends readonly [
    infer H extends IoKind,
    ...infer T extends readonly IoKind[]
] ? H extends Ks[number] ? [H, ...InOrder<T, Ks>] : InOrder<T, Ks> : [];
type Join<T extends readonly string[]> = T extends readonly [
    infer H extends string
] ? H : T extends readonly [
    infer H extends string,
    ...infer R extends readonly string[]
] ? `${H}+${Join<R>}` : never;
type Side<Ks extends readonly IoKind[]> = Join<InOrder<typeof IO_KINDS, Ks>>;
/** The exact id a shape denotes, as a literal type. */
export type IdOf<T extends TransformShape> = `${Side<T['in']>}->${Side<T['out']>}`;
/**
 * A transform id, from the kinds rather than from a string.
 *
 * Returns the EXACT literal — `tf({ in: [IoKinds.text, IoKinds.image], out: [IoKinds.text] })`
 * has type `'text+image->text'`, not `TransformId` and not `string`. So a
 * `requires:` entry written this way is checkable against `TRANSFORMS` at the
 * call site by anything that cares to, and a mistyped kind is a compile error
 * where it was written.
 *
 * The canonical STRING is still what gets stored, keyed on and compared — this
 * is an authoring surface over `transformId`'s machinery, not a second
 * representation. There is one body, `build`; the widened face over it is
 * `transformId`, and see there for why the two are separate functions rather
 * than an overload pair.
 *
 * A novel combination is deliberately still expressible: `tf({ in: [IoKinds.audio],
 * out: [IoKinds.image] })` compiles and yields `'audio->image'`, which `TRANSFORMS`
 * does not name. Core's table names what core ships; a plugin may introduce a
 * transform, and closing that door is a separate ruling nobody has taken.
 */
export declare function tf<const T extends TransformShape>(t: T): IdOf<T>;
/**
 * The widened form, over the same body.
 *
 * Kept because the runtime path has kinds in hand as `readonly IoKind[]` — a
 * parsed id, a probe result — where there is no literal type to preserve and
 * `TransformId` is the honest answer.
 *
 * ⚠ Deliberately a SEPARATE function rather than a second overload on `tf`. As
 * an overload it silently rescues everything the narrow signature is there to
 * reject: `tf({ in: [], out: [IoKinds.text] })` fails the non-empty `Kinds`
 * check, falls through to `readonly IoKind[]`, and compiles as `TransformId`.
 * Two faces over one body keeps `tf` strict and this one honest.
 */
export declare const transformId: (t: Transform) => TransformId;
export interface TransformMeta {
    i18n: I18nText;
    /** One line under the name, in plain language. */
    tagline?: I18nText;
    /**
     * `basic` is shown to everyone; everything else waits behind a disclosure.
     *
     * A first-timer opening a connection form should meet Chat and nothing else.
     * Seven capability toggles on a first run is how somebody concludes the app
     * is not for them — and the person who needs Image editing is by definition
     * not a first-timer.
     */
    disclosure?: 'basic' | 'advanced';
}
/**
 * Human names for the transforms core knows about.
 *
 * A closed table over an open id space: a plugin may introduce a transform this
 * does not name, and everything keeps working — it simply shows as its id until
 * somebody names it. Never render a raw `text->image` to a person; that is what
 * `transformLabel` is for.
 */
export declare const TRANSFORMS: {
    readonly 'text->text': {
        readonly i18n: {
            readonly en: 'Chat';
        };
        readonly tagline: {
            readonly en: 'Writes replies.';
        };
        readonly disclosure: 'basic';
    };
    readonly 'text+image->text': {
        readonly i18n: {
            readonly en: 'Vision';
        };
        readonly tagline: {
            readonly en: 'Can look at pictures you send it.';
        };
    };
    readonly 'text+document->text': {
        readonly i18n: {
            readonly en: 'Document reading';
        };
        readonly tagline: {
            readonly en: 'Can read files you attach.';
        };
    };
    readonly 'text->image': {
        readonly i18n: {
            readonly en: 'Image generation';
        };
        readonly tagline: {
            readonly en: 'Draws pictures from a description.';
        };
    };
    readonly 'text+image->image': {
        readonly i18n: {
            readonly en: 'Image editing';
        };
        readonly tagline: {
            readonly en: 'Changes a picture you give it.';
        };
    };
    readonly 'image->image': {
        readonly i18n: {
            readonly en: 'Image transform';
        };
        readonly tagline: {
            readonly en: 'Upscales or restyles, with no prompt.';
        };
    };
    readonly 'audio->text': {
        readonly i18n: {
            readonly en: 'Transcription';
        };
        readonly tagline: {
            readonly en: 'Turns speech into text.';
        };
    };
    readonly 'text->audio': {
        readonly i18n: {
            readonly en: 'Speech';
        };
        readonly tagline: {
            readonly en: 'Reads text aloud.';
        };
    };
    readonly 'text->embedding': {
        readonly i18n: {
            readonly en: 'Embeddings';
        };
        readonly tagline: {
            readonly en: 'Turns text into vectors, for search.';
        };
    };
};
export type KnownTransformId = keyof typeof TRANSFORMS;
/**
 * How a request can be constrained, as opposed to what flows through it.
 *
 * Every one of these is already implemented somewhere in the app and merely
 * unnamed: `json_object` and `json_schema` are OpenAI's two `response_format`
 * modes, `grammar` is the GBNF path the llama.cpp family takes, and `tools` is
 * the four-tier field that has been sitting on every adapter with no consumers.
 */
export declare const FEATURES: readonly ['json_object', 'json_schema', 'strict_schema', 'grammar', 'tools', 'streaming'];
export type FeatureId = (typeof FEATURES)[number];
export type CapabilityId = TransformId | FeatureId;
/** Transforms contain `->`; features never do. The two spaces cannot collide. */
export declare const isTransformId: (id: string) => id is TransformId;
/**
 * Strengthenings: holding the key implies holding the values, at the same tier.
 *
 * A backend that can enforce a strict schema can obviously enforce a loose one.
 * Declaring the implication once means an adapter states the strongest thing it
 * does and the rest follows, rather than seven adapters each remembering to list
 * the weaker forms.
 */
export declare const IMPLIES: Partial<Record<FeatureId, readonly FeatureId[]>>;
/**
 * X is available at `emulated` when any of the values is native.
 *
 * This is where "Serene Pub provides it to a backend that never heard of it"
 * becomes data instead of a comment. `jsonSchemaToGbnf` is literally
 * "provide `json_schema` by compiling it to a `grammar`" — declared here once,
 * rather than re-derived inside each adapter that happens to have a grammar.
 */
export declare const EMULATABLE_VIA: Partial<Record<FeatureId, readonly FeatureId[]>>;
/**
 * How well something is supported — and, for one value, whether we know yet.
 *
 * `probed` is the odd one out and deliberately so: `native`, `emulated` and
 * `none` answer *how well*, while `probed` answers *have we asked*. Keeping all
 * four in the stored vocabulary would make every consumer of a stored value
 * invent its own reading of `probed`, and they would diverge. So the type is
 * split by position: an adapter may DECLARE `probed`, a connection may only
 * STORE a resolved answer.
 */
export declare const TIERS: readonly ['native', 'emulated', 'probed', 'none'];
export type Tier = (typeof TIERS)[number];
export type ResolvedTier = Exclude<Tier, 'probed'>;
/**
 * What an adapter declares for one capability.
 *
 * `probed` must carry what to assume until an answer arrives, because there is
 * no universally right default. Tool calling degrades to `emulated` — the app
 * can format and parse it for a model that has never heard of tools. Image
 * generation cannot be emulated by anything, so its honest fallback is `none`.
 * A single hardcoded default would have to be wrong for one of them.
 */
export type Declared = ResolvedTier | {
    tier: 'probed';
    until: ResolvedTier;
};
/** What a connection stores. An absent key means `none`. */
export type CapabilitySet = Partial<Record<CapabilityId, ResolvedTier>>;
export interface AdapterCapabilities {
    /**
     * What this WIRE PROTOCOL can express.
     *
     * A gate, not a default. A capability absent here can never be switched on by
     * a preset, a probe or a person, because the protocol has no way to say it —
     * which is exactly why the native Anthropic API hides image generation
     * outright while an OpenAI-compatible endpoint pointed at Anthropic merely
     * defaults it off.
     */
    supports: Partial<Record<CapabilityId, Declared>>;
    /** Which of those are ON when no preset says otherwise. */
    defaults?: readonly CapabilityId[];
}
/** A preset's opinion. `true` means "on at whatever tier the adapter declares". */
export type PresetCapabilities = Partial<Record<CapabilityId, ResolvedTier | boolean>>;
/** What a person switched by hand. `false` is an explicit off, not an absence. */
export type CapabilityOverrides = Partial<Record<CapabilityId, ResolvedTier | false>>;
/**
 * Apply `IMPLIES` and `EMULATABLE_VIA` until nothing changes.
 *
 * Run once at the end of resolution rather than at every read, so `satisfies()`
 * stays a lookup. The fixpoint loop is bounded by the feature count; it exists
 * because the two relations chain — a native `grammar` gives `json_schema` at
 * `emulated`, which in turn implies `json_object`.
 */
export declare function closure(set: CapabilitySet): CapabilitySet;
export interface ResolveCapabilitiesArgs {
    adapter: AdapterCapabilities;
    preset?: PresetCapabilities;
    /** What a live probe answered. Only keys it actually determined. */
    probe?: CapabilitySet;
    overrides?: CapabilityOverrides;
}
/**
 * The four layers, collapsed to what a connection stores.
 *
 * Pure and total: no I/O, and every input optional, so a connection that has
 * never been tested still resolves to something coherent rather than to nothing.
 */
export declare function resolveCapabilities(args: ResolveCapabilitiesArgs): CapabilitySet;
export interface Need {
    /** Unmet ⇒ the run fails at bind, with a sentence naming the capability. */
    requires?: readonly CapabilityId[];
    /** May be absent; the binding must handle both. See `ctx.can()`. */
    optional?: readonly CapabilityId[];
}
/**
 * The answer to "can this connection run this node", in the four forms its four
 * callers need.
 *
 * A boolean would force each of them to walk the sets again to say anything
 * useful — and the picker in particular must be able to say *why* a connection
 * is not offered, or "why isn't mine in the list" has no answer anywhere.
 */
export interface Verdict {
    ok: boolean;
    /** Required and unavailable. The run cannot proceed. */
    missing: CapabilityId[];
    /** Required and only emulated. Proceed, but it is worth saying. */
    degraded: CapabilityId[];
    /** Optional and unavailable — the branches the binding has to take. */
    absent: CapabilityId[];
    /** What `ctx.can()` reads. Only ids this need actually mentioned. */
    tiers: Partial<Record<CapabilityId, ResolvedTier>>;
}
export declare function satisfies(need: Need, have: CapabilitySet): Verdict;
/**
 * What to show a person for a capability id.
 *
 * Never render the id itself: `text+image->text` is an address, not a name, and
 * a capability screen full of arrows is the thing rulings about newcomers are
 * trying to prevent. An unknown id falls back to the id so a plugin's capability
 * is legible rather than blank.
 */
export declare function capabilityLabel(id: CapabilityId): string;
/** The one-liner under the name, when there is one. */
export declare function capabilityTagline(id: CapabilityId): string | undefined;
/** Whether a first-timer should see this without opening anything. */
export declare const isBasicCapability: (id: CapabilityId) => boolean;
/**
 * The capabilities a descriptor's slots declared as optional, as a literal union.
 *
 * Matched in two steps rather than one. The obvious single-step form —
 * `S[K] extends { optional: readonly (infer C)[] }` — never matches anything,
 * because `SlotDecl.optional` is declared OPTIONAL and that `?` survives into
 * every inferred slot type, so a required property in the pattern can never line
 * up with an optional one in the source. The result is a silent `never`: every
 * `ctx.can()` call becomes an error, which at least fails loudly. The genuinely
 * dangerous direction is the opposite one, so the inner check is written against
 * `readonly (infer C)[]` explicitly: a slot with no `optional` infers `undefined`
 * there, which does not match an array and contributes `never` — rather than
 * inferring `unknown` and widening the union to accept anything at all.
 *
 * `DeclaredKeysOnly` is load-bearing for the same reason. The slots type arrives
 * as `Record<string, SlotDecl> & { connection: {...literal...} }` — the literal
 * survives, but so does the index signature, and `S[string]` is a bare `SlotDecl`
 * whose `optional` is the full `CapabilityId[]`. Mapping over the raw `keyof`
 * therefore unions in EVERY capability and `can()` accepts anything, silently.
 * Stripping the index signature first is what keeps the answer to exactly what
 * the author wrote.
 */
type DeclaredKeysOnly<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};
export type OptionalCapsOf<S> = S extends object ? {
    [K in keyof DeclaredKeysOnly<S>]: DeclaredKeysOnly<S>[K] extends {
        optional?: infer O;
    } ? O extends readonly (infer C)[] ? C extends CapabilityId ? C : never : never : never;
}[keyof DeclaredKeysOnly<S>] : never;
export {};
