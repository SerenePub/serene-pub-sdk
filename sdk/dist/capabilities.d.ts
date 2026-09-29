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
 * Those four collapse into two INDEPENDENT gradings, and the composite is their
 * floor: the adapter grades the API (what the format can express), while the
 * preset, probe and person grade the MODEL (what the thing answering actually
 * does — vision is a property of a model, never of a format). See `composite`.
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
 *
 * `entities` is out-only for the same reason: a named-entity span is a reading
 * OF text, not a medium anything is stored or sent in. It is a kind rather than
 * a feature because the thing producing it is a different model on a different
 * connection, which is exactly what a transform's output side names.
 *
 * ⚠ **Append, never insert.** `side()` orders a transform's kinds by position
 * here, so moving an existing member rewrites ids that are stored as primary
 * keys (`connection_defaults`) and compared as strings everywhere else.
 * @experimental
 */
export declare const IO_KINDS: readonly ["text", "image", "audio", "video", "document", "embedding", "entities"];
/** @experimental */
export type IoKind = (typeof IO_KINDS)[number];
/** @experimental */
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
 * @experimental
 */
export type TransformId = `${string}->${string}`;
/** Read an id back apart, for a UI that wants the kinds rather than the string. @internal */
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
 * kind, `'inlet' | 'query' | 'task' | 'oracle' | 'outlet'` — since long
 * before this existed, and both names would meet inside a single descriptor
 * literal that already says `kind: 'oracle'`. `IoKinds` also matches the two
 * spellings already here, `IoKind` and `IO_KINDS`.
 *
 * `satisfies Record<IoKind, IoKind>` is load-bearing in both directions: adding
 * a kind to `IO_KINDS` without adding it here stops compiling, and so does a
 * member here whose value is not its own name.
 * @experimental
 */
export declare const IoKinds: {
    readonly text: 'text';
    readonly image: 'image';
    readonly audio: 'audio';
    readonly video: 'video';
    readonly document: 'document';
    readonly embedding: 'embedding';
    readonly entities: 'entities';
};
/**
 * Non-empty, structurally.
 *
 * `TransformId` is the open template `${string}->${string}`, so `'->'` is a
 * legal one today. Requiring at least one kind per side is what makes an empty
 * side unwritable through `tf()` rather than merely wrong.
 */
type Kinds = readonly [IoKind, ...IoKind[]];
/** What an author writes: `{ in: [IoKinds.text, IoKinds.image], out: [IoKinds.text] }`. @experimental */
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
/** The exact id a shape denotes, as a literal type. @experimental */
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
 * @experimental
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
 * @internal
 */
export declare const transformId: (t: Transform) => TransformId;
/** @experimental */
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
 * @internal
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
    readonly 'text->entities': {
        readonly i18n: {
            readonly en: 'Named entities';
        };
        readonly tagline: {
            readonly en: 'Finds the people, places and things a passage names.';
        };
    };
};
/** @internal */
export type KnownTransformId = keyof typeof TRANSFORMS;
/**
 * How a request can be constrained or SHAPED, as opposed to what flows through
 * it.
 *
 * Every one of these is already implemented somewhere in the app and merely
 * unnamed: `json_object` and `json_schema` are OpenAI's two `response_format`
 * modes, `grammar` is the GBNF path the llama.cpp family takes, and `tools` is
 * the four-valued `toolUse` field that sat on every adapter with no consumers.
 *
 * Two kinds live here, and the split is worth naming because it is not obvious
 * from the list:
 *
 *   - **Constraints** on one request — the five above, plus `streaming`, which
 *     constrains how the answer arrives rather than what it says.
 *   - **Behaviours** the connection can be asked for — `continue_reply`, and the
 *     two `wire_*` ids. These are not fields on a request; they say what kind of
 *     request can be made at all.
 *
 * The axis they share, and the reason none of them is a transform, is that every
 * one qualifies a call whose in and out kinds are already settled. `text->text`
 * either way; these say HOW.
 * @experimental
 */
export declare const FEATURES: readonly ['json_object', 'json_schema', 'strict_schema', 'grammar', 'tools', 'streaming', 
/**
 * The connection can resume an assistant message from a partial, as a TRUE
 * PREFILL: the model is handed the text so far inside an OPEN assistant turn
 * and writes the next characters of it, rather than being asked in a fresh
 * turn to carry on.
 *
 * A behaviour rather than a wire, which is why it is not spelled `wire_*`. It
 * is nonetheless answerable only alongside one — a completion wire prefills by
 * leaving the seed block unclosed, and a chat wire can only prefill where the
 * protocol itself accepts a trailing assistant turn — so the app's manifest
 * records which of a type's wire modes actually carries it, and the effective
 * answer is the pair. The SDK names the capability; it does not own that pair,
 * because which endpoint an adapter speaks is not a fact this package can see.
 *
 * ⚠ The distinction it draws is the whole reason it exists. Appending a
 * "please continue" user turn, or sending the partial as a closed assistant
 * turn and hoping, both LOOK like a continuation and neither is one: the model
 * starts a new reply, the join then glues two beginnings together, and nothing
 * reports it. A connection that can only do that does not hold this.
 */
'continue_reply', 'wire_chat', 'wire_completion'];
/** @experimental */
export type FeatureId = (typeof FEATURES)[number];
/** @experimental */
export type CapabilityId = TransformId | FeatureId;
/** Transforms contain `->`; features never do. The two spaces cannot collide. @internal */
export declare const isTransformId: (id: string) => id is TransformId;
/**
 * Strengthenings: holding the key implies holding the values, at the same BAND.
 *
 * A backend that can enforce a strict schema can obviously enforce a loose one.
 * Declaring the implication once means an adapter states the strongest thing it
 * does and the rest follows, rather than seven adapters each remembering to list
 * the weaker forms.
 * @internal
 */
export declare const IMPLIES: Partial<Record<FeatureId, readonly FeatureId[]>>;
/**
 * X is available at its `emulated` band when any of the values is at ITS top.
 *
 * This is where "Serene Pub provides it to a backend that never heard of it"
 * becomes data instead of a comment. `jsonSchemaToGbnf` is literally
 * "provide `json_schema` by compiling it to a `grammar`" — declared here once,
 * rather than re-derived inside each adapter that happens to have a grammar.
 * @internal
 */
export declare const EMULATABLE_VIA: Partial<Record<FeatureId, readonly FeatureId[]>>;
/**
 * How well something is supported, as a number: 0 is unsupported, open upward.
 *
 * This replaced a flat three-value enum (`native | emulated | none`), which
 * could not express the fact the rest of this section is built around: how many
 * WAYS there are to support a capability differs per capability. Serene Pub can
 * format and parse tool calls for a backend that never heard of them, so `tools`
 * has a middle. Nothing fakes a picture, so `text->image` has none — and under
 * the flat enum its very best possible answer was `native`, one of three, which
 * a badge then had to render as though something better existed.
 *
 * A grade means nothing on its own; it is read against `bandsFor(id)`. So the
 * top of a two-band capability is simply the top, and `gradeLetter` calls it an
 * `A` rather than inventing a deficiency the protocol does not have.
 *
 * Not an enum with more members, and not a float. An open integer scale is what
 * lets a capability core never named have a shape core never named, and it makes
 * `Math.min` the entire comparator — see `composite`, which replaced three
 * separately hardcoded `{native: 2, emulated: 1, none: 0}` rank tables.
 * @experimental
 */
export type Grade = number;
/**
 * The band names core knows: what a grade MEANS, once you know the capability.
 *
 * A CLOSED vocabulary, while the grade scale is open, and the asymmetry is
 * deliberate. These are the names an author writes, so closing them makes
 * `"nativ"` a compile error at the place it was typed. The openness that matters
 * is `bandsFor`'s fallback — a plugin's own transform grades correctly without
 * anybody editing this file — and that needs no new band NAMES to work.
 * @experimental
 */
export declare const BAND: {
    readonly none: 'none';
    readonly emulated: 'emulated';
    readonly native: 'native';
};
/** @experimental */
export type Band = (typeof BAND)[keyof typeof BAND];
/**
 * Weakest to strongest, independently of any one capability's own table.
 *
 * Consulted when a band a capability does not HAVE is asked for: `emulated`
 * asked of `text->image` walks down to `none`, because a claim is never stronger
 * than what permits it and nothing supplies an emulated picture.
 * @internal
 */
export declare const BAND_ORDER: readonly ["none", "emulated", "native"];
/**
 * Per capability, what its grades mean — the index IS the grade.
 *
 * Only capabilities whose shape differs from binary are listed. Everything else
 * falls back to `DEFAULT_BANDS` through `bandsFor`, which is the half that keeps
 * this table from having to name a capability in order for that capability to
 * grade correctly: a plugin introduces a transform, and it is binary until
 * somebody says otherwise.
 *
 * The three listed here are exactly the keys of `EMULATABLE_VIA`, and that is
 * not a coincidence. An `emulated` band exists precisely where Serene Pub can
 * supply the capability itself over a backend that cannot, which is what that
 * table records. `closure` raises through `gradeOf(id, BAND.emulated)`, so a
 * capability with no such band cannot be emulated upward at all — the honest
 * answer, arrived at without a second list stating it.
 * @experimental
 */
export declare const BANDS: Partial<Record<CapabilityId, readonly Band[]>>;
/** A capability nobody gave bands: it either works or it does not. @experimental */
export declare const DEFAULT_BANDS: readonly Band[];
/** @internal */
export declare const bandsFor: (id: CapabilityId) => readonly Band[];
/** The best this capability can be — what `native` means FOR IT. @experimental */
export declare const topGrade: (id: CapabilityId) => Grade;
/** Which band a grade lands in, or `undefined` for a grade off the scale. @internal */
export declare const bandOf: (id: CapabilityId, grade: Grade) => Band | undefined;
/**
 * What an author may write for one grade: the band by name, or the number.
 *
 * Both, because neither alone is safe. A bare number in a declaration is
 * unreadable and silently wrong at the one place it matters most — `tools: 1` is
 * emulated tool calling and `tools: 2` is native, one keystroke apart with no
 * type to catch it, while `1` on a two-band capability is its maximum. A name
 * alone cannot address a band core has not named.
 *
 * ⚠ An AUTHORING type, never a stored one. `CapabilitySet` and
 * `CapabilityOverrides` hold grades and nothing else — the same split by
 * position the old vocabulary had, where an adapter could declare `probed` and a
 * connection could only store a resolved answer.
 * @experimental
 */
export type GradeSpec = Band | Grade;
/**
 * A spec as a grade, on this capability's own scale.
 *
 * Total, and never stronger than the scale allows: a number is clamped into
 * range, and a band the capability does not have walks DOWN `BAND_ORDER`. Both
 * failures are authoring bugs rather than data, so this stays pure and the
 * manifest conformance test is what fails the build over one.
 * @internal
 */
export declare function gradeOf(id: CapabilityId, spec: GradeSpec): Grade;
/**
 * The composite of the two independent gradings: their floor.
 *
 * The ONE comparator in this file, and it is `Math.min` because a grade is a
 * number. Three hardcoded rank tables used to do this — in `closure`, in
 * `resolveCapabilities`, and in a `weakest` helper — and the fourth would have
 * been written by whoever next needed to compare two.
 *
 * The two arguments are what the four layers actually produce, named:
 *
 *   - the API grade, from the adapter/manifest layer — what this WIRE FORMAT can
 *     express. Also an absolute gate on the key space, which is why it is the
 *     ceiling every layer below is taken against rather than merely a default.
 *   - the MODEL grade, from the preset, the probe and the person — what the
 *     thing actually answering does. Inherently per-model: vision is a property
 *     of a model, not of a format, which is why no preset can settle it.
 *
 * Neither can promise past the other, so the composite is the floor — and the
 * two need no second column, table or stored field to be graded independently.
 * @experimental
 */
export declare const composite: (api: Grade, model: Grade) => Grade;
/**
 * What an adapter declares for one capability: a grade, or one nobody proved.
 *
 * `unproven` is deliberately a SEPARATE flag rather than a point on the scale.
 * `native`/`emulated`/`none` answered *how well*; `probed` answered *have we
 * asked* — two different questions, and one number would have to conflate them.
 * Whether they should eventually collapse is an open ruling, held on purpose;
 * they do not collapse here.
 *
 * `until` must carry what to assume until an answer arrives, because there is no
 * universally right pessimism. Tool calling degrades to `emulated` — the app can
 * format and parse it for a model that has never heard of tools. Image
 * generation degrades to `none`, because nothing can fake a picture. A single
 * hardcoded default would have to be wrong for one of them.
 * @experimental
 */
export type Declared = GradeSpec | {
    unproven: true;
    until: GradeSpec;
};
/** What a connection STORES: grades, each on its own capability's scale. @experimental */
export type CapabilitySet = Partial<Record<CapabilityId, Grade>>;
/**
 * The grade as a letter, relative to THIS capability's own top band.
 *
 * Derived at render and nowhere else: no letter is ever stored, sent on the wire
 * or compared. `A` is the best this capability can be, so a two-band
 * capability's grade 1 is an `A` — which is the entire reason grades are read
 * per capability rather than against one global scale.
 *
 * Grade 0 has no letter, because 0 is not a quality but an absence; the caller
 * says "Off". Anything past `Z` clamps rather than walking out of the alphabet.
 * @internal
 */
export declare function gradeLetter(id: CapabilityId, grade: Grade): string | undefined;
/** @experimental */
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
/**
 * A preset's opinion. `true` means "on at whatever grade the adapter declares".
 *
 * Authored, so a band name is accepted alongside a grade. A band this capability
 * does not have resolves to 0 — an `emulated` picture is a claim nothing can
 * fulfil, and reading it as "off" is more honest than showing it as supplied.
 * @experimental
 */
export type PresetCapabilities = Partial<Record<CapabilityId, GradeSpec | boolean>>;
/**
 * What a person switched by hand. `false` is an explicit off, not an absence.
 *
 * STORED, so grades only — the wire carries the band name (see the socket
 * contract) and the handler that writes this column is where it becomes a
 * number.
 * @experimental
 */
export type CapabilityOverrides = Partial<Record<CapabilityId, Grade | false>>;
/**
 * Apply `IMPLIES` and `EMULATABLE_VIA` until nothing changes.
 *
 * Run once at the end of resolution rather than at every read, so `satisfies()`
 * stays a lookup. The fixpoint loop is bounded by the feature count; it exists
 * because the two relations chain — a native `grammar` gives `json_schema` at
 * `emulated`, which in turn implies `json_object`.
 * @experimental
 */
export declare function closure(set: CapabilitySet): CapabilitySet;
/** @experimental */
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
 * @internal
 */
export declare function resolveCapabilities(args: ResolveCapabilitiesArgs): CapabilitySet;
/** @experimental */
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
 * @experimental
 */
export interface Verdict {
    ok: boolean;
    /** Required and unavailable. The run cannot proceed. */
    missing: CapabilityId[];
    /**
     * Required, available, and BELOW this capability's own top band. Proceed, but
     * it is worth saying.
     *
     * Per capability, which is the point: `tools` supplied by Serene Pub over a
     * backend that never heard of them is genuinely a lesser thing and says so,
     * while `text->image` at grade 1 is the best `text->image` gets and is not
     * reported as a degradation. A flat enum could not tell those apart.
     */
    degraded: CapabilityId[];
    /** Optional and unavailable — the branches the binding has to take. */
    absent: CapabilityId[];
    /** What `ctx.can()` reads. Only ids this need actually mentioned. */
    grades: Partial<Record<CapabilityId, Grade>>;
}
/** @experimental */
export declare function satisfies(need: Need, have: CapabilitySet): Verdict;
/**
 * Which METHOD a service is called by for the same capability.
 *
 * `chat` sends role-tagged messages; `completion` sends one text prompt. It is
 * the same content generation — `text->text` either way — so a node asking for
 * `text->text` must stay agnostic, and `wireModeOf` below is the "either" the
 * agnostic caller reads.
 *
 * ⚠ Never "chat format". That collides with PROMPT FORMAT, which is the
 * delimiters *inside* a completion's single prompt string (Vicuna, ChatML) and
 * is meaningful only in `completion` mode — in `chat` mode the roles carry the
 * structure and there is no prompt format at all, not even a default one.
 * Conflating the two is what let a live defect hide: adapters derived the wire
 * mode from their own local flags while the pipeline rendered a prompt format
 * nothing carried, so a chat-shaped backend was handed a payload built for text
 * completion and sent a placeholder greeting instead of the assembled prompt.
 * @internal
 */
export type WireMode = (typeof WIRE_MODE_ORDER)[number];
/**
 * The capability each mode is requested as.
 *
 * Features rather than transforms, and deliberately: what flows is `text->text`
 * in both modes. These qualify HOW the request is made, which is exactly what
 * the feature axis is for (`json_schema` is a field on a request, `grammar` is a
 * decoder constraint, and these two are the shape of the prompt field itself).
 *
 * Two ids rather than one enum-valued key because a backend routinely offers
 * BOTH, and a single key could not say so — nor be graded, presetted, probed and
 * hand-overridden independently, which is the entire four-layer model.
 * @internal
 */
export declare const WIRE_CAPABILITY: {
    readonly chat: 'wire_chat';
    readonly completion: 'wire_completion';
};
/**
 * The tie-break, as data: which mode wins when a connection offers both.
 *
 * **Chat first.** Three reasons, in the order they matter:
 *
 *  1. It is the mode that LOSES NOTHING. Roles reach the model as roles; a flat
 *     completion has to encode them as delimiters the model must have been
 *     trained to read. Going the other way is always possible (a flat prompt can
 *     be rebuilt from messages) and going this way is not, so the recoverable
 *     direction is the safe default.
 *  2. Completion mode carries a SECOND choice — which completion template — and
 *     getting it wrong produces run-on generation with no error attached. An
 *     "either" that silently required a second correct decision would not be an
 *     either.
 *  3. It is what every adapter offering both already defaulted to before wire
 *     mode existed (`extraJson.useSession ?? true`, `prerenderPrompt ?? false`),
 *     so an existing connection keeps sending what it sent yesterday.
 *
 * A caller that genuinely requires one mode does not consult this at all — it
 * asks for that mode's capability by id, like any other.
 * @internal
 */
export declare const WIRE_MODE_ORDER: readonly ['chat', 'completion'];
/**
 * The mode a resolved capability set prefers, or `undefined` if it holds neither.
 *
 * The "either" default: a caller that does not care hands over what the four
 * layers resolved and is told which method to use. `undefined` is a real answer
 * — a set that names neither wire capability has not been resolved against an
 * adapter that declares one — and is deliberately not defaulted here, because
 * the honest fallback depends on what the caller knows about the connection.
 * @internal
 */
export declare function wireModeOf(have: CapabilitySet): WireMode | undefined;
/**
 * What to show a person for a capability id.
 *
 * Never render the id itself: `text+image->text` is an address, not a name, and
 * a capability screen full of arrows is the thing rulings about newcomers are
 * trying to prevent. An unknown id falls back to the id so a plugin's capability
 * is legible rather than blank.
 * @internal
 */
export declare function capabilityLabel(id: CapabilityId): string;
/** The one-liner under the name, when there is one. @internal */
export declare function capabilityTagline(id: CapabilityId): string | undefined;
/** Whether a first-timer should see this without opening anything. @internal */
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
/** @experimental */
export type OptionalCapsOf<S> = S extends object ? {
    [K in keyof DeclaredKeysOnly<S>]: DeclaredKeysOnly<S>[K] extends {
        optional?: infer O;
    } ? O extends readonly (infer C)[] ? C extends CapabilityId ? C : never : never : never;
}[keyof DeclaredKeysOnly<S>] : never;
export {};
//# sourceMappingURL=capabilities.d.ts.map