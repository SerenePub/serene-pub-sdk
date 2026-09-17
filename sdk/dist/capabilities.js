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
import { MEDIA_KINDS } from './media.js';
// ── Kinds ───────────────────────────────────────────────────────────────────
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
 */
export const IO_KINDS = ['text', ...MEDIA_KINDS, 'embedding', 'entities'];
const KIND_ORDER = new Map(IO_KINDS.map((k, i) => [k, i]));
const side = (kinds) => [...new Set(kinds)]
    .sort((a, b) => (KIND_ORDER.get(a) ?? 99) - (KIND_ORDER.get(b) ?? 99))
    .join('+');
/** Read an id back apart, for a UI that wants the kinds rather than the string. */
export function parseTransform(id) {
    const [inS = '', outS = ''] = id.split('->');
    return {
        in: inS.split('+').filter(Boolean),
        out: outS.split('+').filter(Boolean),
    };
}
// ── Authoring a transform id ────────────────────────────────────────────────
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
 */
export const IoKinds = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    video: 'video',
    document: 'document',
    embedding: 'embedding',
    entities: 'entities',
};
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
export function tf(t) {
    return build(t);
}
/** The one body. Both public faces are this, typed differently. */
const build = (t) => `${side(t.in)}->${side(t.out)}`;
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
export const transformId = (t) => build(t);
/**
 * Human names for the transforms core knows about.
 *
 * A closed table over an open id space: a plugin may introduce a transform this
 * does not name, and everything keeps working — it simply shows as its id until
 * somebody names it. Never render a raw `text->image` to a person; that is what
 * `transformLabel` is for.
 */
export const TRANSFORMS = {
    'text->text': {
        i18n: { en: 'Chat' },
        tagline: { en: 'Writes replies.' },
        disclosure: 'basic',
    },
    'text+image->text': {
        i18n: { en: 'Vision' },
        tagline: { en: 'Can look at pictures you send it.' },
    },
    'text+document->text': {
        i18n: { en: 'Document reading' },
        tagline: { en: 'Can read files you attach.' },
    },
    'text->image': {
        i18n: { en: 'Image generation' },
        tagline: { en: 'Draws pictures from a description.' },
    },
    'text+image->image': {
        i18n: { en: 'Image editing' },
        tagline: { en: 'Changes a picture you give it.' },
    },
    'image->image': {
        i18n: { en: 'Image transform' },
        tagline: { en: 'Upscales or restyles, with no prompt.' },
    },
    'audio->text': {
        i18n: { en: 'Transcription' },
        tagline: { en: 'Turns speech into text.' },
    },
    'text->audio': {
        i18n: { en: 'Speech' },
        tagline: { en: 'Reads text aloud.' },
    },
    'text->embedding': {
        i18n: { en: 'Embeddings' },
        tagline: { en: 'Turns text into vectors, for search.' },
    },
    'text->entities': {
        i18n: { en: 'Named entities' },
        tagline: { en: 'Finds the people, places and things a passage names.' },
    },
};
// ── Features ────────────────────────────────────────────────────────────────
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
 */
export const FEATURES = [
    'json_object',
    'json_schema',
    'strict_schema',
    'grammar',
    'tools',
    'streaming',
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
    'continue_reply',
    'wire_chat',
    'wire_completion',
];
/** Transforms contain `->`; features never do. The two spaces cannot collide. */
export const isTransformId = (id) => id.includes('->');
/**
 * Strengthenings: holding the key implies holding the values, at the same BAND.
 *
 * A backend that can enforce a strict schema can obviously enforce a loose one.
 * Declaring the implication once means an adapter states the strongest thing it
 * does and the rest follows, rather than seven adapters each remembering to list
 * the weaker forms.
 */
export const IMPLIES = {
    strict_schema: ['json_schema'],
    json_schema: ['json_object'],
};
/**
 * X is available at its `emulated` band when any of the values is at ITS top.
 *
 * This is where "Serene Pub provides it to a backend that never heard of it"
 * becomes data instead of a comment. `jsonSchemaToGbnf` is literally
 * "provide `json_schema` by compiling it to a `grammar`" — declared here once,
 * rather than re-derived inside each adapter that happens to have a grammar.
 */
export const EMULATABLE_VIA = {
    json_object: ['json_schema', 'grammar'],
    json_schema: ['grammar'],
    tools: ['json_schema', 'grammar'],
};
/**
 * The band names core knows: what a grade MEANS, once you know the capability.
 *
 * A CLOSED vocabulary, while the grade scale is open, and the asymmetry is
 * deliberate. These are the names an author writes, so closing them makes
 * `"nativ"` a compile error at the place it was typed. The openness that matters
 * is `bandsFor`'s fallback — a plugin's own transform grades correctly without
 * anybody editing this file — and that needs no new band NAMES to work.
 */
export const BAND = {
    none: 'none',
    emulated: 'emulated',
    native: 'native',
};
/**
 * Weakest to strongest, independently of any one capability's own table.
 *
 * Consulted when a band a capability does not HAVE is asked for: `emulated`
 * asked of `text->image` walks down to `none`, because a claim is never stronger
 * than what permits it and nothing supplies an emulated picture.
 */
export const BAND_ORDER = [BAND.none, BAND.emulated, BAND.native];
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
 */
export const BANDS = {
    json_object: [BAND.none, BAND.emulated, BAND.native],
    json_schema: [BAND.none, BAND.emulated, BAND.native],
    tools: [BAND.none, BAND.emulated, BAND.native],
};
/** A capability nobody gave bands: it either works or it does not. */
export const DEFAULT_BANDS = [BAND.none, BAND.native];
export const bandsFor = (id) => BANDS[id] ?? DEFAULT_BANDS;
/** The best this capability can be — what `native` means FOR IT. */
export const topGrade = (id) => bandsFor(id).length - 1;
/** Which band a grade lands in, or `undefined` for a grade off the scale. */
export const bandOf = (id, grade) => bandsFor(id)[grade];
/**
 * A spec as a grade, on this capability's own scale.
 *
 * Total, and never stronger than the scale allows: a number is clamped into
 * range, and a band the capability does not have walks DOWN `BAND_ORDER`. Both
 * failures are authoring bugs rather than data, so this stays pure and the
 * manifest conformance test is what fails the build over one.
 */
export function gradeOf(id, spec) {
    if (typeof spec === 'number')
        return Math.max(0, Math.min(topGrade(id), Math.trunc(spec)));
    const bands = bandsFor(id);
    for (let i = BAND_ORDER.indexOf(spec); i >= 0; i--) {
        const at = bands.indexOf(BAND_ORDER[i]);
        if (at >= 0)
            return at;
    }
    return 0;
}
/**
 * The same BAND, read against another capability's scale.
 *
 * `IMPLIES` propagates strength BETWEEN capabilities, and propagating the raw
 * number would be wrong wherever two shapes differ. `strict_schema` is binary,
 * so its native grade is 1; writing that 1 into three-band `json_schema` would
 * say EMULATED — quietly demoting the strongest claim available into the weakest
 * supported one, which is the exact failure a flat enum could not have. The band
 * is the thing that carries across; the number is local.
 */
const rebase = (from, to, grade) => {
    const band = bandOf(from, grade);
    return band === undefined ? 0 : gradeOf(to, band);
};
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
 */
export const composite = (api, model) => Math.min(api, model);
const isUnproven = (d) => typeof d === 'object' && d !== null;
/**
 * The API grade: the best this capability could be, if something asserts it.
 *
 * For a plain declaration that is the declaration itself. For an unproven one it
 * is the capability's TOP band: the point of probing is that the protocol *can*
 * do it and we do not yet know whether this model does — so an answer, from a
 * preset or a live probe, is allowed to be a full-strength one. Per capability,
 * because "full strength" is 2 for `tools` and 1 for `text->image`.
 */
const ceiling = (id, d) => isUnproven(d) ? topGrade(id) : gradeOf(id, d);
/**
 * What to assume when nobody has asserted anything.
 *
 * Always at or below `ceiling`, by construction: a plain declaration is both,
 * and `until` is clamped to the same scale.
 */
const floor = (id, d) => gradeOf(id, isUnproven(d) ? d.until : d);
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
 */
export function gradeLetter(id, grade) {
    if (typeof grade !== 'number' || grade <= 0)
        return undefined;
    const down = Math.min(25, Math.max(0, topGrade(id) - Math.trunc(grade)));
    return String.fromCharCode(65 + down);
}
// ── Closure ─────────────────────────────────────────────────────────────────
/**
 * Apply `IMPLIES` and `EMULATABLE_VIA` until nothing changes.
 *
 * Run once at the end of resolution rather than at every read, so `satisfies()`
 * stays a lookup. The fixpoint loop is bounded by the feature count; it exists
 * because the two relations chain — a native `grammar` gives `json_schema` at
 * `emulated`, which in turn implies `json_object`.
 */
export function closure(set) {
    const out = { ...set };
    const raise = (id, grade) => {
        const have = out[id];
        if (have === undefined || grade > have) {
            out[id] = grade;
            return true;
        }
        return false;
    };
    for (let pass = 0; pass < FEATURES.length + 1; pass++) {
        let moved = false;
        for (const [id, implied] of Object.entries(IMPLIES)) {
            const source = id;
            const grade = out[source];
            // 0 and absent alike: neither is something to propagate.
            if (!grade)
                continue;
            // By BAND, not by number — see `rebase`. `strict_schema` is binary and
            // `json_schema` is not, so the two scales genuinely disagree here.
            for (const weaker of implied)
                moved = raise(weaker, rebase(source, weaker, grade)) || moved;
        }
        for (const [id, via] of Object.entries(EMULATABLE_VIA)) {
            const feature = id;
            // Already at its own best; nothing to add.
            if (out[feature] === topGrade(feature))
                continue;
            // "Native" per provider, which is its OWN top band: `grammar` is binary
            // and tops out at 1, `json_schema` tops out at 2.
            const can = via.some((v) => out[v] === topGrade(v));
            if (can)
                moved = raise(feature, gradeOf(feature, BAND.emulated)) || moved;
        }
        if (!moved)
            break;
    }
    return out;
}
/**
 * The four layers, collapsed to what a connection stores.
 *
 * Pure and total: no I/O, and every input optional, so a connection that has
 * never been tested still resolves to something coherent rather than to nothing.
 */
export function resolveCapabilities(args) {
    const { adapter, preset, probe, overrides } = args;
    const out = {};
    const defaults = new Set(adapter.defaults ?? []);
    for (const [key, declared] of Object.entries(adapter.supports)) {
        const id = key;
        if (declared === undefined)
            continue;
        // The API grade, graded once and independently: what this WIRE FORMAT can
        // express. Also the gate — every layer below is taken against it, so a
        // toggle can never make a protocol able to do something it has no field
        // for. Taken ONCE at the end rather than at each layer, which is the same
        // answer (every layer already assigned at or below it) and says the
        // api/model split out loud.
        const api = ceiling(id, declared);
        // The MODEL grade, from the three layers that speak about the thing on the
        // other end. Layer 1 — the adapter's own position: its honest assumption,
        // if on.
        let model = defaults.has(id) ? floor(id, declared) : 0;
        // Layer 2 — the preset. A named service knows more than the generic
        // protocol does, so `true` here is an ASSERTION and resolves to the
        // ceiling, not to the adapter's pessimistic fallback. Without that, a
        // preset could never switch on a probed capability at all.
        const p = preset?.[id];
        if (p !== undefined) {
            if (p === true)
                model = api;
            else if (p === false)
                model = 0;
            else
                model = gradeOf(id, p);
        }
        // Layer 3 — what the backend actually answered. Only for a capability the
        // adapter said to ask about: a probe cannot answer a question that was
        // never open, so it cannot contradict an outright declaration. This is the
        // per-MODEL grading; the adapter above is the per-format one.
        if (isUnproven(declared) && probe && probe[id] !== undefined)
            model = gradeOf(id, probe[id]);
        // Layer 4 — the person. Final, and still clamped by `composite` below.
        const o = overrides?.[id];
        if (o !== undefined)
            model = o === false ? 0 : gradeOf(id, o);
        const grade = composite(api, model);
        if (grade > 0)
            out[id] = grade;
    }
    return closure(out);
}
export function satisfies(need, have) {
    const missing = [];
    const degraded = [];
    const absent = [];
    const grades = {};
    // `typeof` and not merely `> 0`, because a `CapabilitySet` routinely arrives
    // from a loose JSON column that no type checked on the way in. A non-number
    // there reads as UNSUPPORTED, which is the safe direction: `!"native"` is
    // false, so a truthiness test alone would grant a capability on the strength
    // of an unmigrated string.
    const held = (id) => {
        const grade = have[id];
        return typeof grade === 'number' && grade > 0 ? grade : undefined;
    };
    for (const id of need.requires ?? []) {
        const grade = held(id);
        if (grade === undefined)
            missing.push(id);
        else {
            grades[id] = grade;
            if (grade < topGrade(id))
                degraded.push(id);
        }
    }
    for (const id of need.optional ?? []) {
        const grade = held(id);
        if (grade === undefined)
            absent.push(id);
        else
            grades[id] = grade;
    }
    return { ok: missing.length === 0, missing, degraded, absent, grades };
}
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
 */
export const WIRE_CAPABILITY = {
    chat: 'wire_chat',
    completion: 'wire_completion',
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
 */
export const WIRE_MODE_ORDER = ['chat', 'completion'];
/**
 * The mode a resolved capability set prefers, or `undefined` if it holds neither.
 *
 * The "either" default: a caller that does not care hands over what the four
 * layers resolved and is told which method to use. `undefined` is a real answer
 * — a set that names neither wire capability has not been resolved against an
 * adapter that declares one — and is deliberately not defaulted here, because
 * the honest fallback depends on what the caller knows about the connection.
 */
export function wireModeOf(have) {
    for (const mode of WIRE_MODE_ORDER) {
        const grade = have[WIRE_CAPABILITY[mode]];
        if (typeof grade === 'number' && grade > 0)
            return mode;
    }
    return undefined;
}
// ── Naming ──────────────────────────────────────────────────────────────────
const FEATURE_LABELS = {
    json_object: 'JSON output',
    json_schema: 'JSON schema',
    strict_schema: 'Strict JSON schema',
    grammar: 'Grammar constraints',
    tools: 'Tool calling',
    streaming: 'Streaming',
    // Plain language, and deliberately the USER's word for the button rather
    // than the mechanism's ("prefill", "assistant prefill"): the row answers
    // "can I press Continue on a reply from this connection?".
    continue_reply: 'Continue a reply',
    // The two wire modes, named by what the backend RECEIVES rather than by the
    // endpoint it is posted to — `prerenderPrompt` on an OpenAI-compatible
    // connection still posts to /v1/chat/completions, and what makes it a
    // completion is that the model is handed one formatted string.
    wire_chat: 'Chat messages',
    wire_completion: 'Text completion',
};
/**
 * What to show a person for a capability id.
 *
 * Never render the id itself: `text+image->text` is an address, not a name, and
 * a capability screen full of arrows is the thing rulings about newcomers are
 * trying to prevent. An unknown id falls back to the id so a plugin's capability
 * is legible rather than blank.
 */
export function capabilityLabel(id) {
    if (isTransformId(id)) {
        const meta = TRANSFORMS[id];
        const label = meta?.i18n;
        if (!label)
            return id;
        return typeof label === 'string' ? label : label.en;
    }
    return FEATURE_LABELS[id] ?? id;
}
/** The one-liner under the name, when there is one. */
export function capabilityTagline(id) {
    if (!isTransformId(id))
        return undefined;
    const t = TRANSFORMS[id]?.tagline;
    return typeof t === 'string' ? t : t?.en;
}
/** Whether a first-timer should see this without opening anything. */
export const isBasicCapability = (id) => isTransformId(id) &&
    TRANSFORMS[id]?.disclosure === 'basic';
//# sourceMappingURL=capabilities.js.map