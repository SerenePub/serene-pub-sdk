/**
 * Descriptors — the shared-scope declaration of a **node definition** (01 §1, 04 §3;
 * NOMENCLATURE §5 — *node type* is retired, ruled 2026-09-14).
 *
 * A descriptor is data: it can be listed, rendered and validated without loading
 * the handler that implements it. That is what lets the plugin manager and the
 * editor work from rows (10 §10.2).
 */
import type { ShapeId } from './shapes.js';
import type { CapabilityId } from './capabilities.js';
import type { ReviewPosition } from './review.js';
import type { TemplateScope, VarField } from './template.js';
import type { VariableDecl } from './variables.js';
import { type SettingsSchema, type FieldDecl } from './settings.js';
import { type I18n, type LocaleMap } from './i18n.js';
import { type EnabledWhen, type EnabledWhenDecl } from './predicates.js';
import type { WidgetDecl } from './layout.js';
import type { MediaCapability } from './media.js';
import { type DisplayKeys } from './hash.js';
/**
 * The node kinds (R-13, ruled 2026-09-14): **inlet** (where the run enters) ·
 * **query** (reads) · **task** (pure transform) · **oracle** (calls out to an
 * external nondeterministic source — a model, TTS, image gen, embeddings, a human)
 * · **outlet** (the only effect-capable kind: writes, attaches, emits — the run
 * leaves into the world here). Was `input · query · task · provider · consumer`
 * until 2026-09-16; the kind is part of the id grammar (`core:inlet/…`), so every
 * definition id moved with it.
 *
 * `entry` is the odd one out and deliberately so: the first five are **nodes**
 * — things a spec wires — and an entry type is a **row shape**, the declared
 * answer to "what kind of thing is this lorebook row". It is a Kind rather than
 * a registry of its own because everything downstream of a declaration is the
 * same machinery: one `snapshotRegistry`, one content hash, one boot sync, one
 * freeze rule (the argument 18 §2 makes for script kinds, one construct over).
 * @experimental
 */
export type Kind = 'inlet' | 'query' | 'task' | 'oracle' | 'outlet' | 'entry';
export type { I18n, LocaleMap } from './i18n.js';
/**
 * Slot kinds (12 §2). Siblings; only two are ever cross-referenced.
 *
 * `settings` (R-9, ruled 2026-09-15) is the one kind **no author declares**:
 * the substrate declares it, on every definition that is `optional`
 * (`enabled`), every one whose `effects` gate (`review`), and every gather
 * clause (`mode`). The slot name `settings` is reserved for it — `register`
 * refuses a descriptor that authors one, and an out-port of the name, since
 * `<node>.settings` is the address F39 reads as a switch — and it is projected into the
 * registry row by `snapshotRegistry` rather than written on the descriptor,
 * so the executor keeps reading `config[key].settings.*` exactly as before
 * and the panel renders it from the row like any slot (`settingsSlot.ts`).
 * @experimental
 */
export type SlotKind = 'connection' | 'sampling' | 'prompts' | 'template' | 'parameters' | 'wire' | 'variables' | 'scripts' | 'settings';
/** @experimental */
export interface SlotDecl {
    kind: SlotKind;
    /**
     * One of the few settings people actually change on this node.
     *
     * A panel that lists every declared setting equally makes the reader find
     * the prompt among the thresholds every time. The author is the one who
     * knows which three or four are reached for and which exist for the day
     * somebody needs them, so the answer is declared rather than guessed from
     * type or position — a client heuristic would be wrong differently on every
     * plugin.
     *
     * Presentation, not permission: nothing is hidden by it, and everything
     * unmarked is one disclosure away.
     */
    quick?: boolean;
    /** For connection/sampling: which shape's connections are eligible. */
    shape?: ShapeId;
    /**
     * What the connection in this slot must be able to do.
     *
     * Unmet is a hard failure at bind, naming the capability in the words a
     * person saw when they configured it — never a 400 from a provider that was
     * asked for something its API has no field for.
     *
     * On the SLOT rather than on the Descriptor because the requirement is about
     * a *connection*, and a connection comes from a slot: a node with two
     * connection slots needs to state two different things.
     *
     * This supersedes `shape` for connection slots. `shape` says "an image-gen
     * connection"; this says "one that can do text→image", which is the same fact
     * with the modality assumption removed.
     */
    requires?: readonly CapabilityId[];
    /**
     * What the binding will *use if present* and must cope without.
     *
     * The binding asks with `ctx.can(id)`, which is narrowed to exactly these
     * ids — so an undeclared capability, or a typo, does not compile. The
     * fallback path is the author's to write; declaring something optional is a
     * promise that both branches exist.
     *
     * ⚠ Not the same `optional` as `Descriptor.optional` further down this file,
     * which means "producing nothing is a legitimate outcome for this node". Two
     * meanings, one word, one file — the objects differ so it compiles, and the
     * reader is the one who pays. Named to match the ruling; if it is ever
     * renamed, `prefers` is the word that was wanted.
     */
    optional?: readonly CapabilityId[];
    /** What this slot is for, shown under its option. Display text — see FieldDecl. */
    description?: I18n;
    /** Which lens renders it (05 §3). */
    facet?: string;
    /** For prompts: the authored text fields. */
    fields?: Record<string, {
        type: 'text';
        i18n?: I18n;
    }>;
    /** For parameters: the declared schema. Options may be sourced from the connection. */
    schema?: Record<string, FieldDecl>;
    /**
     * Which template language this slot's source is written in — a registry id, not a
     * hardcoded literal (src/engines.ts). The value stored in the slot carries it too, so
     * two slots in one spec may use different engines.
     *
     * The one-element spelling of `acceptedEngines`, and permanently valid: a reader
     * must resolve both, or every slot authored before the set existed silently widens
     * to the host's default.
     */
    engine?: string;
    /**
     * Every template language this slot accepts, most-preferred first.
     *
     * A template's pool is `(what it renders, which language)` and stays that way —
     * a Liquid source and a Handlebars one are not interchangeable, and neither
     * renders the other. What a set widens is the SLOT: a picker offers the union of
     * the accepted pools, so a person may write the same layout in either language
     * without the slot having to be re-declared.
     *
     * **Order is meaning.** The first entry is what a NEW template here is written
     * in, so re-ordering this list changes what an untouched install produces —
     * which is why it is content, hashed with the rest of the declaration.
     *
     * Supersedes `engine` when both are given; an empty array declares nothing.
     */
    acceptedEngines?: readonly string[];
    /**
     * For `wire` slots: the format id this oracle defaults to. Overridable through the
     * normal scope chain, and in core sourced from the connection's adapter metadata so
     * picking Ollama gets the right instruct format without configuring anything
     * (src/wire.ts).
     */
    format?: string;
    /**
     * For template slots: the variables this template may reference.
     *
     * ⚠ Required, and 16 §4 is wrong to imply otherwise. A *source* template renders one
     * item out of a collection, and the item's shape lives inside the port's payload
     * rather than on the port — so typed ports alone cannot tell an author what
     * `{{ entry.title }}` is allowed to be. See src/template.ts.
     */
    variables?: TemplateScope;
    /**
     * For `scripts` slots: which script types this hook accepts (18 §4a).
     *
     * Pinned ids — `core:script:text/transform@1` — and **part of the content
     * hash** (S3): widening or narrowing what a hook accepts changes what an
     * untouched spec does, which is the `optional` lesson applied before it is
     * re-learned. Plain strings rather than the `ScriptKindId` alias, because
     * scripts.ts already imports from this module and a type-only cycle is
     * still a cycle.
     *
     * The value stored in a scripts slot is an ordered list of script row ids —
     * a chain. Transform chains fold; verdict chains reduce (18 §5). The chain
     * is configuration like any slot value: resolved through the scope chain,
     * carried by presets, exported with the document.
     */
    accepts?: string[];
    /**
     * For `scripts` slots: where the chains apply, as (port, phase) — the
     * substrate declaration of 18 §4a. `before` transforms a value entering the
     * named in-port; `after` transforms what left the named out-port. The
     * binding never sees a chain and cannot decline one; declaring is all a
     * type does, which is what makes a plugin's hook trustworthy without
     * trusting the plugin (03 §4 symmetry).
     */
    port?: string;
    phase?: 'before' | 'after';
    /**
     * For `scripts` slots: read-only context this hook supplies beyond the
     * port's own variables — a speaker's name, the cast list. In-only **by
     * construction**: extras have no legal out declaration, so the general
     * in-but-not-out rule (18 §6a) covers them with no special case. The
     * editor offers exactly `ports + extras` as the fixed choices for a
     * script's declared reads — never a freeform name, which would be a
     * declaration nothing supplies.
     */
    extras?: string[];
    /**
     * For `variables` slots: which context variable each key renders.
     *
     * `{ characters: 'core:var/characters@1' }` says this node produces a value
     * called `characters`, and how it is presented is the registered variable's
     * business rather than this node's. Each key becomes one addressable setting
     * pointing at a swappable template row — so a prose rendering written for one
     * pipeline can be selected from any other pipeline that renders the same
     * variable. That cross-pipeline reuse is the point, and it only works because
     * the row is keyed by *what it renders* rather than by which spec it was
     * authored in.
     *
     * Named `renders` rather than `variables` because the field above already
     * owns that name for a different question — that one asks what a template
     * *may reference*, this one asks what a slot *produces*.
     */
    renders?: Record<string, string>;
    /**
     * For `variables` slots: the slot also renders every **band declared
     * upstream** of in-port `from` (typed templates P2) — each under its band
     * key, through the variable the declaring source names
     * (`Descriptor.bands`). So `renders` is open: a plugin's source adds a
     * layout setting here by declaring its band, with no edit to this node.
     *
     * Followed through any node that takes candidates in (concatenation,
     * fusion, ranking); `rendersAt` is the answer for one node of a document.
     * **Contract** — hashed with the slot: which bands a node renders is what
     * its template may place.
     * @experimental
     */
    rendersBands?: {
        from: string;
    };
}
/**
 * One band of a `share` or `perMember` parameter.
 *
 * The client renders a bar with a label and a colour per band, and **none of
 * those may be written in the client**. A plugin that adds a sixth retrieval
 * source has to get a labelled band without anyone editing that screen, which
 * is the 1:1 rule applied to a control that would otherwise need a hardcoded
 * list of five.
 */
/**
 * The field language, re-exported from settings.ts — where it is now defined
 * once for node params, plugin settings, session-mode fields and message-block
 * forms alike.
 *
 * These used to be a second, subtly different declaration living here: it had
 * `share` and `perMember` where settings had `text`, keyed its label `i18n`
 * where settings said `label`, and nothing converted between the two. The
 * comment in settings.ts promising "the same shape node params use" was
 * describing an intention, not the code. It is the code now.
 */
export type { MemberDecl, FieldDecl, FieldType } from './settings.js';
export { fieldLabel, fieldAccepts } from './settings.js';
/**
 * One interior script point (18 §4e): a named moment inside a binding's work
 * where a user chain may run, and which script kinds may be attached there.
 *
 * `accepts` is the attachment rule, on the same terms as `SlotDecl.accepts`
 * for a port hook — pinned ids, part of the content hash. Plain strings rather
 * than the `ScriptKindId` alias for the reason that field gives: scripts.ts
 * imports from this module. `label` is display text, stripped from the hash.
 * @experimental
 */
export interface ScriptPointDecl {
    key: string;
    accepts: string[];
    label?: I18n;
    description?: I18n;
}
/**
 * A definition's interior points, as copies — the one reader of
 * `scriptPoints` (the executor's broker and the registry projection both go
 * through it), so a caller may not edit the declaration through it.
 * @experimental
 */
export declare function scriptPointsOf(d: {
    scriptPoints?: ReadonlyArray<ScriptPointDecl>;
}): ScriptPointDecl[];
/**
 * The message verbs no genre may remove (R-15, ruled 2026-09-15): a person
 * can always stop a reply, branch a session and rewrite a line. Not keys of
 * `SessionShape.messageVerbs`; a declaration naming one `false` is refused
 * at registration (`assertMessageVerbFloors`).
 * @experimental
 */
export declare const MESSAGE_VERB_FLOORS: readonly ['stop', 'branch', 'edit'];
/** @experimental */
export type MessageVerbFloor = (typeof MESSAGE_VERB_FLOORS)[number];
/**
 * The opt-in built-ins: core's writes a genre may switch off and never
 * re-implement. Default on.
 * @experimental
 */
export declare const MESSAGE_VERB_BUILT_INS: readonly ['delete', 'hide', 'swipe'];
/** @experimental */
export type MessageVerbBuiltIn = (typeof MESSAGE_VERB_BUILT_INS)[number];
/** The genre-declared content actions — built-in write + declared content. @experimental */
export declare const MESSAGE_VERB_CONTENT: readonly ['retry', 'extend', 'stepBack'];
/** @experimental */
export type MessageVerbContent = (typeof MESSAGE_VERB_CONTENT)[number];
/** Every forbiddable verb, in the order the availability map reads them. @experimental */
export declare const MESSAGE_VERBS: readonly ["retry", "extend", "stepBack", "delete", "hide", "swipe"];
/** @experimental */
export type MessageVerb = (typeof MESSAGE_VERBS)[number];
/**
 * The turn controls (lair pass B7 + B8, 2026-09-27) — the composer's presses
 * that move the story on, as opposed to the message verbs, which act on one
 * row. Keys of `SessionShape.turnControls`, in the order the extra venue
 * draws them.
 *
 * - `advance` is **Continue**: it fires the turn order's head
 *   (`sessions:fireTurn` with no entry). ⚠ Not `extend` — that is the
 *   message verb that extends one reply by prefill (`messageVerbs.extend`).
 * - `pick` is **Pick who speaks**: it fires a character the person names
 *   (`sessions:fireTurn` with a `character:<id>` entry the order does not
 *   hold).
 * - `narrate` fires a **narrator turn** (`sessions:fireTurn` with a `null`
 *   ref the order does not hold) — only a `voice: 'narrator'` genre has a
 *   narrator to fire (`turnControlDefault`).
 * - `retake` is **Regenerate the last turn, as a whole** (lair pass R2,
 *   owner 2026-09-28; label _Regenerate_, `sessions:retakeTurn`): it
 *   deletes the newest turn's **turn yield** — every row that turn's run
 *   created, on every channel, never a person's own line — and takes the
 *   same turn again. ⚠ Not `retry`, the message verb that rewrites ONE
 *   reply in place and keeps its swipes. Offered only where a genre
 *   declares it (`turnControlDefault`): a genre whose turn writes one row
 *   keeps `retry`.
 * @experimental
 */
export declare const TURN_CONTROLS: readonly ['advance', 'pick', 'narrate', 'retake'];
/** @experimental */
export type TurnControl = (typeof TURN_CONTROLS)[number];
/**
 * What an undeclared turn control resolves to — read off the shape's own
 * declarations, so a genre that says nothing keeps what its shape already
 * means (R42: turn controls only where there is somebody to take a turn):
 *
 * - `advance` and `pick` are on where the shape has a **character system**
 *   (`characters` declared with a `max` other than 0; an unreadable shape
 *   counts as having one) — the composer's historical rule.
 * - `narrate` is on where the shape has a **narrator** (`voice:
 *   'narrator'`), the one genre family with a narrator to fire.
 * - `retake` is never on by default: nothing in a shape says a turn writes
 *   more than one row, so a genre opts in (`turnControls.retake: true`).
 * @experimental
 */
export declare function turnControlDefault(shape: unknown, control: TurnControl): boolean;
/**
 * One turn control as a genre declares it: `true` / `false`, or offered with
 * a **present-when** — enabled-when predicates over the session's published
 * values (`predicates.ts`, the junction's grammar) that say whether the
 * control *applies* in the session's current mode. A control whose
 * present-when fails is **hidden**, not greyed: it has no meaning in that
 * mode. Its `reason` is the sentence the door
 * refuses a press with. Whether an applicable control can be pressed *now*
 * is the core action's own enabled-when — greyed, with a reason.
 * @experimental
 */
export type TurnControlDecl = boolean | {
    presentWhen: EnabledWhenDecl;
};
/**
 * One turn control, resolved: offered at all, and the present-when to
 * evaluate against the published values (empty = always present).
 * @experimental
 */
export interface TurnControlPresence {
    offered: boolean;
    presentWhen: EnabledWhen[];
}
/** Every turn control, resolved. @experimental */
export type TurnControlPolicy = Record<TurnControl, TurnControlPresence>;
/**
 * What turn controls this shape offers, resolved — the `resolveWrites`
 * posture: an undeclared or unreadable control is the shape's default
 * (`turnControlDefault`), `false` takes it away, `true` or an object offers it. Pure, and
 * takes `unknown` for a stored shape.
 *
 * With a `channel` (a slug or `slug:lane`; lair re-plan R6), that channel's
 * declared `ChannelDecl.turnControls` win over the genre's, key by key — the
 * `messageVerbs` merge. A channel the shape does not declare in the long
 * form answers the genre's policy.
 * @experimental
 */
export declare function resolveTurnControls(shape: unknown, channel?: string): TurnControlPolicy;
/**
 * Is this turn control present over these published values — offered, and
 * every present-when holds? The failing predicate's reason when not; `null`
 * reason for a control the genre does not offer at all.
 * @experimental
 */
export declare function turnControlPresent(policy: TurnControlPolicy, control: TurnControl, values: unknown): {
    present: true;
} | {
    present: false;
    reason: LocaleMap | null;
};
/**
 * A `turnControls` declaration's faults, refused at the declaration: an
 * unknown control, a value that is neither a boolean nor `{ presentWhen }`,
 * a present-when the enabled-when grammar refuses, or a present-when over
 * `item.*` (a turn control acts on no row).
 * @experimental
 */
export declare function assertTurnControls(shape: SessionShape | undefined, who: string): void;
/**
 * The writes a genre may switch off (R-B, 2026-09-17) — what a session does
 * *beyond messages*. Keys of `SessionShape.writes`, in the order a policy
 * reads them.
 * @experimental
 */
export declare const SESSION_WRITES: readonly ['lore', 'scenes'];
/** @experimental */
export type SessionWrite = (typeof SESSION_WRITES)[number];
/** Availability of every switchable session write. Absent means both on. @experimental */
export type SessionWritePolicy = Record<SessionWrite, boolean>;
/**
 * What this shape lets a session write, resolved. Absent, unknown or
 * unreadable is **both on** — the standard chat's posture, and the same
 * "a policy that cannot be read refuses nothing" rule `messageVerbs` keeps.
 * Only an explicit `false` takes a write away.
 *
 * Pure, and takes `unknown` on purpose: the app reads a shape that arrived
 * from a stored registry row, not a typed declaration.
 * @experimental
 */
export declare function resolveWrites(shape: unknown): SessionWritePolicy;
/**
 * A `writes` declaration whose values are not booleans is refused — with a
 * sentence, at the declaration, where the author is. Shared by `register`
 * (an inlet's `sessionShape`) and `genre()` (a genre's `shape`), on the same
 * terms as `assertMessageVerbFloors`. Unknown keys are ignored, as the
 * resolver ignores them: a key this release does not know is not a write.
 * @experimental
 */
export declare function assertSessionWrites(shape: SessionShape | undefined, who: string): void;
/**
 * The five built-in writes (R-15), by the verb a person knows them as: the
 * one-node spec core runs for each, and the outlet that spec ends in.
 *
 * Here rather than only in the core catalog because the **validator** needs
 * them (U5b review W8): a built-in outlet performs the item rule's write —
 * the handler judged who may act on which row before the run began — so a
 * spec that is not the built-in's own placing one would perform that write
 * with nobody having judged anything. `validate()` refuses the placement
 * unless the document's id is one of `BUILTIN_SPEC_IDS`, and the host
 * refuses the commit on the same test (defence in depth). A manifest
 * permission letting a plugin spec place one is the future this leaves room
 * for; it is not granted today.
 * @internal
 */
export declare const BUILTIN_SPEC_IDS: Readonly<{
    readonly delete: 'core:spec/builtin-delete';
    readonly hide: 'core:spec/builtin-hide';
    readonly edit: 'core:spec/builtin-edit';
    readonly swipe: 'core:spec/builtin-swipe';
    readonly branch: 'core:spec/builtin-branch';
}>;
/** @internal */
export type BuiltInKind = keyof typeof BUILTIN_SPEC_IDS;
/** The outlet each built-in's spec ends in — `effects: 'write'`, every one. @experimental */
export declare const BUILTIN_OUTLET_IDS: Readonly<{
    readonly delete: 'core:outlet/delete-message@1';
    readonly hide: 'core:outlet/hide-message@1';
    readonly edit: 'core:outlet/edit-message@1';
    readonly swipe: 'core:outlet/swipe-message@1';
    readonly branch: 'core:outlet/branch-session@1';
}>;
/** Is this definition id one of the five built-in write outlets? @experimental */
export declare const isBuiltInOutlet: (definitionId: string) => boolean;
/** Is this spec id one of the five built-in specs — the only documents that may place a built-in outlet? @internal */
export declare const isBuiltInSpec: (specId: string) => boolean;
/**
 * The form-answer pair (plans/29 R-15 *Forms*; 30 §U5d, built 2026-09-17):
 * the inlet `core:event/form-addressed@1` lands on, and the outlet that
 * commits an oracle's answer exactly as a click would. The outlet may be
 * placed only in a document whose inlet is the form-addressed one
 * (`validate()`; the host checks the same at the commit): it answers THE
 * form the event carried, and a document reached by any other event has no
 * form to answer — a spec placing it elsewhere would fire an action as
 * somebody nobody asked.
 * @internal
 */
export declare const FORM_ADDRESSED_INLET_ID = "core:inlet/form-addressed@1";
/** @experimental */
export declare const ANSWER_FORM_OUTLET_ID = "core:outlet/answer-form@1";
/**
 * The review-fields rule (R-15 *The review gate*; 30 §U5d): a definition
 * with `effects: 'write' | 'external'` declares `review: { fields }` — what a
 * reviewer may edit at the gate, `[]` when nothing (approve or refuse). A
 * definition that declares none still registers and still gates — the form
 * is then **inferred** from the whole payload, every field editable, which is
 * the documented fallback a plugin definition gets — but `register()` records
 * the omission as a finding and `validate()` reports it on every node bound
 * to such a definition, so a shipped effectful definition without one is
 * visible rather than silent. Every core definition declares one.
 * @experimental
 */
export declare function reviewFieldsFinding(d: {
    id: string;
    effects?: string;
    review?: {
        fields: readonly string[];
    };
}): string | null;
/**
 * What `register()` noted about a definition without refusing it — today
 * the review-fields rule alone. Keyed by definition id; empty for a clean
 * one. Read by a host at boot to say so once, and by tests asserting that
 * every shipped effectful definition declares its fields.
 * @experimental
 */
export declare function definitionFindings(id?: string): string[];
/**
 * A `messageVerbs` declaration that names a floor `false` is refused — with a
 * sentence, at the declaration, where the author is. Shared by `register`
 * (an inlet's `sessionShape`) and `genre()` (a genre's `shape`), so the two
 * places a shape can be declared cannot disagree about what a floor is.
 * Unknown keys are ignored, as the app's reader ignores them: a key this
 * release does not know is not a floor.
 * @experimental
 */
export declare function assertMessageVerbFloors(shape: SessionShape | undefined, who: string): void;
/** @experimental */
export interface PortDecl {
    [port: string]: ShapeId;
}
/**
 * `Out`/`In` are generic so the *port names* survive into the type system. That is what
 * lets the builder offer `$.history.messages` with autocomplete instead of
 * `$ref('history', 'messages')` with a string (see src/scope.ts). Both default to the
 * open `PortDecl`, so nothing that ignores the generics changes.
 */
/**
 * The chat-shape contract a mode-bearing input type carries (19 §1). See
 * `Descriptor.shape` for the rules; this is the vocabulary.
 *
 * Bounds omit `max` for "unlimited" and omit the whole capability for "does
 * not exist here". Every field is optional so the standard mode can state
 * today's behaviour exactly and a prose mode can state almost nothing.
 * @experimental
 */
export interface SessionShape {
    /** The character system: toggles, ordering, pickers, cast rows. */
    characters?: {
        min: number;
        max?: number;
    };
    /** The persona system. Absent or `max: 0`: the user is prose. */
    personas?: {
        min: number;
        max?: number;
    };
    /** The lorebook attachment picker, and retrieval satisfiability. */
    lorebook?: 'optional' | 'required';
    /** What the send surface is. `none` for purely trigger-driven modes. */
    composer?: 'text' | 'none';
    /** Whose name the seed line carries (16's seedName rule, declared). */
    voice?: 'character' | 'narrator';
    /**
     * Mode-declared per-session fields (`SettingsSchema` — the one field
     * language). Rendered in session settings, stored on the session, supplied
     * back through this input's published document.
     */
    fields?: SettingsSchema;
    /**
     * Does the session settings form offer a **Scenario** field (§4.11,
     * R12)? Declared, never assumed: core's chat, adventure and lair say
     * `true`; guide says `false`. Absent = no field.
     */
    scenario?: boolean;
    /**
     * Does the session settings form offer **Tags** (§4.11, R12)? `true` for
     * every core genre. Absent = no tags section.
     */
    tags?: boolean;
    /**
     * Whether creating a chat of this mode seeds the cast's greeting messages,
     * and on which channel (20 §7). Absent means the default — **on, on
     * `main`** — so a custom input node gets the standard chat's welcoming
     * behaviour for free and turns it off or redirects it only if it wants to.
     * Core's `user-message` input declares it explicitly so the reusable case
     * reads at a glance.
     */
    greeting?: {
        /** Seed character greetings on creation. Default true. */
        enabled?: boolean;
        /** Which channel the greetings land on. Default `main`. */
        channel?: string;
    };
    /**
     * Which message verbs sessions of this genre offer (20 §4; R-15, ruled
     * 2026-09-15). Absent means all on — the standard chat's posture. Core
     * owns the mechanics and integrity rules; this only declares
     * *availability*, checked server-side at the verb (presence is
     * presentation, refusal is the law).
     *
     * Three groups, and the type is the enforcement:
     *
     *  · **Floors** — `stop` · `branch` · `edit` — are **unrepresentable
     *    here**, and `register`/`genre()` refuse a declaration that names one
     *    `false` (`assertMessageVerbFloors`). They are present in every genre:
     *    a person can always stop a reply, always branch a session and always
     *    rewrite a line, and a genre that could take those away would own the
     *    user.
     *  · **Opt-in built-ins** — `delete` · `hide` · `swipe` — are core's
     *    writes (`core:outlet/delete-message@1` …), always emitting what
     *    changed; a genre may switch one off, never re-implement it.
     *  · **Genre-declared content actions** — `retry` (regenerate) ·
     *    `extend` · `stepBack` — are the genre's pipeline producing text
     *    plus core's rewrite of the row. A dice-are-final genre forbidding
     *    `retry` is a real design.
     *
     * ⚠ `extend` here is the **prefill** extend — carry one reply on. The
     * composer's Continue, which fires the next turn, is a turn control
     * (`turnControls.advance`), switched separately.
     */
    messageVerbs?: {
        retry?: boolean;
        extend?: boolean;
        stepBack?: boolean;
        delete?: boolean;
        hide?: boolean;
        swipe?: boolean;
    };
    /**
     * Which turn controls sessions of this genre offer, and when each is
     * present (lair pass B7 + B8, 2026-09-27). Absent is the shape's
     * default (`turnControlDefault`: Continue and Pick where there is a
     * character system, narrate where there is a narrator). A
     * control is `true`, `false`, or `{ presentWhen }` — enabled-when
     * predicates over the published values; when they fail the control is
     * hidden, and the door refuses a press with the failing reason
     * (`TurnControlDecl`). Enforced server-side at the fire, like
     * `messageVerbs`: presence is presentation, refusal is the law.
     *
     * `advance` is the composer's **Continue** — fire the turn order's head.
     * ⚠ Not `messageVerbs.extend`, which extends one reply by prefill: a
     * genre whose composed reply cannot be extended mid-sentence switches
     * that off and keeps this.
     *
     * `retake` is **Regenerate the last turn** (R2, 2026-09-28) — delete the
     * newest turn's yield and take the turn again. Never on by default: a
     * genre whose turn writes several rows declares it.
     */
    turnControls?: {
        advance?: TurnControlDecl;
        pick?: TurnControlDecl;
        narrate?: TurnControlDecl;
        retake?: TurnControlDecl;
    };
    /**
     * What sessions of this genre may write beyond messages (R-B, 2026-09-17).
     * Absent = both on — the standard chat's posture. Enforced server-side at
     * the write, like `messageVerbs`: presence is presentation, refusal is the
     * law.
     *
     * Not a third `lorebook` value: `lorebook: 'optional'` with
     * `writes.lore: false` already reads as attach-and-reference, and the two
     * answer different questions — one is whether a book may be attached, the
     * other whether the session's own machinery may add to it. A genre whose
     * lorebook is a *reference* (a rulebook, a docs set) says so here, and a
     * user-attached pipeline or a plugin hook cannot then rewrite it mid-game.
     *
     * The lever is about what a **session** does. Editing the same lorebook
     * from the lorebook screens is untouched: that is a person at a book, not
     * a session writing through one.
     */
    writes?: {
        /** May a session of this genre add lore entries to its lorebook? */
        lore?: boolean;
        /** May a session of this genre open scenes? */
        scenes?: boolean;
    };
    /**
     * Which surface renders sessions of this mode (20 §12). Absent means
     * core's log — today's behaviour exactly. A plugin id (`acme/crawl`)
     * names the plugin whose declared `session-view` frame surface replaces
     * the whole message section: the total-conversion lane. The frame gets
     * the session over the MessageChannel and returns actions as validated
     * requests; it forfeits core's in-log chrome deliberately. "Restyle the
     * standard chat" is blocks, never this.
     */
    view?: string;
    /**
     * The session's channels beyond the implicit `main` (20 §7) — filter
     * lanes inside one session. What renders a channel is the surface story
     * (a frame subscribes to it); what *stores* it is `messages.channel`; and
     * pipelines choose which lanes build their context through the history
     * query's `channel` param. Declaring one here is what makes it exist for
     * sessions of this mode.
     *
     * **Slugs, and only slugs (ruling 2026-09-09).** A channel is an
     * organizational bucket this genre chooses arbitrarily and names here; the
     * **lanes** under a slug are runtime and open-ended — a lane exists because
     * a pipeline wrote to it, and this genre's pipelines allocate and manage
     * them (one lane per agent with the agent↔lane map in extension data; five
     * ongoing private conversations under `text-messages`, with a sixth later).
     * **No lane count is declared**, here or anywhere. `main` is always the
     * default channel and lane 1 always the default lane, so a bare slug is
     * `slug:1`, `main` is `main:1`, and lane 1 is stored as the bare slug —
     * lanes from 2 up store `slug:n`. The number is multiplicity and order,
     * never identity: the slug is the reference. Lane metadata (title,
     * participants, open or closed) is this genre's business and lives in its
     * extension data — core stores a string. Parse and format one with
     * `parseChannel` / `formatChannel`.
     *
     * **A bare string, or a `ChannelDecl`** (R-C, 2026-09-17). The string is
     * the whole declaration for the ordinary case and keeps meaning exactly
     * what it meant — `'phone'` is `{ slug: 'phone', role: 'conversation' }`
     * with the genre's `voice` and `messageVerbs`. Read the normalised list
     * with `channelDecls`; a string stays a string in the declaration, so the
     * content hash of every genre written before this union is unmoved.
     */
    channels?: (string | ChannelDecl)[];
    /**
     * The panels a session of this mode offers in the surface grid (21). The
     * grid is container-responsive: panels flow into tracks that appear and
     * disappear with the *content box* width (not the viewport), so opening a
     * sidebar cascades panels the same way shrinking the window would.
     *
     * Absent means the default — the standard chat's single primary panel (the
     * log + composer). A mode declares extra panels by pushing `WidgetDecl`s; a
     * panel names a **component** (`component`, run in the UI worker), which
     * places an `sp-frame` for any region that needs a real document. A panel
     * is a *view onto channels* — it renders what a node
     * writes to the channels it subscribes to. This is the "map / cell phone /
     * mission list appears when the action is toggled on" lane: a node emits a
     * `surface:open` intent naming a declared panel, and the grid flows it in.
     *
     * Exactly one panel should carry `role: 'primary'` — it is anchored, always
     * placed, and never cascades to the drawer. Absent-panels defaults supply a
     * primary log automatically, so a mode only lists what it adds.
     */
    panels?: WidgetDecl[];
}
/**
 * One channel, declared in full (R-C, 2026-09-17) — the long form of an
 * element of `SessionShape.channels`, where the short form is the slug alone.
 *
 * Three things a genre may say about a channel that it cannot say about the
 * session as a whole: how the channel's messages **enter a prompt**, whose
 * **name** a turn triggered there speaks under, and which **verbs** its rows
 * offer. A writing room's `manuscript` is a folio with no speaker and no
 * deleting; its `main` is an ordinary conversation. One genre, two postures,
 * and nothing about either is expressible on the shape alone.
 *
 * Every field but `slug` is optional and every default is today's behaviour,
 * which is what makes the union additive: a bare string is this object with
 * `role: 'conversation'`, the genre's `voice` and the genre's `messageVerbs`.
 * @experimental
 */
export interface ChannelDecl {
    /**
     * The channel's slug — a bare slug, never `slug:lane`. Lanes are runtime
     * (see `SessionShape.channels`); a declaration that names one is refused.
     */
    slug: string;
    /**
     * How this channel enters a prompt. `conversation` (the default): turns
     * with speakers, as every channel has always been assembled. `folio`:
     * one text block in time order, no speaker names, placed **before** the
     * conversation — the manuscript the conversation is about.
     */
    role?: 'conversation' | 'folio';
    /**
     * Whose name the seed line carries for a turn triggered on this channel
     * (the genre-wide `voice`, per channel). Default: the genre's `voice`.
     * `none`: no seed row at all — the extend-prefill posture, which is
     * what a folio channel wants, since a manuscript has no speaker to
     * announce.
     */
    voice?: 'character' | 'narrator' | 'none';
    /**
     * Which verbs this channel's messages offer, over the genre's. Declared
     * keys win; the rest keep the genre's answer. The floors are
     * unrepresentable here too — `assertMessageVerbFloors` judges a channel's
     * declaration on exactly the terms it judges a genre's.
     */
    messageVerbs?: SessionShape['messageVerbs'];
    /**
     * The channel's display name (lair re-plan R6, 2026-09-28) — what a
     * widget header and the composer's channel control call it: the Lair's
     * `sanctum` is _Sanctum_. Display text (R-20), normalised by
     * `channelDecls` to a locale map. Absent: readers show the slug, as
     * before the field existed.
     */
    label?: I18n;
    /**
     * Which turn controls this channel's composer offers, over the genre's
     * `turnControls` (lair re-plan R6) — the `messageVerbs` merge rule:
     * declared keys win, the rest keep the genre's answer. The Lair's
     * Sanctum takes Pick who speaks and Regenerate the last turn away and
     * keeps Continue and Narrate. Read one channel's policy with
     * `resolveTurnControls(shape, channel)`.
     */
    turnControls?: SessionShape['turnControls'];
}
/** The roles a channel's messages may play in a prompt. @experimental */
export declare const CHANNEL_ROLES: readonly ['conversation', 'folio'];
/** @experimental */
export type ChannelRole = (typeof CHANNEL_ROLES)[number];
/** The voices a channel's turn may seed under. `none` seeds no row at all. @experimental */
export declare const CHANNEL_VOICES: readonly ['character', 'narrator', 'none'];
/** @experimental */
export type ChannelVoice = (typeof CHANNEL_VOICES)[number];
/**
 * This shape's channels as full declarations, defaults resolved — the one
 * reader every consumer of `SessionShape.channels` should use, so the short
 * and long forms cannot be read differently anywhere.
 *
 * `main` comes first and always exists, declared or not: it is the session's
 * default channel, so a genre that lists only `manuscript` still has it. A
 * genre that *does* declare `main` gets its own declaration in that first
 * position rather than a second row.
 *
 * What "resolved" means, per entry: `role` is always present; `voice` is the
 * channel's, else the genre's, else absent; `messageVerbs` is the genre's
 * with the channel's declared keys over the top, absent when neither declares
 * any; `turnControls` the same, over the genre's `turnControls`; `label` a
 * locale map, absent when undeclared. So the answer read off an entry is the
 * effective one, and no caller has to remember the inheritance.
 *
 * Takes `unknown` for the same reason `resolveWrites` does, and never throws:
 * a shape from a stored registry row is data. An unreadable entry is skipped
 * rather than guessed at — the refusal belongs at the declaration
 * (`assertChannelDecls`), not at a read on the turn's path.
 * @experimental
 */
export declare function channelDecls(shape: unknown): ChannelDecl[];
/**
 * A channel declaration that cannot mean what it says is refused — with a
 * sentence, at the declaration, on the same terms as `assertMessageVerbFloors`.
 *
 * `main` may only be a conversation: it is the channel every session has and
 * the one a turn lands on by default, so a genre that made it a document
 * would leave the session with nowhere to talk.
 * @experimental
 */
export declare function assertChannelDecls(shape: SessionShape | undefined, who: string): void;
/** @experimental */
export interface Descriptor<Out extends PortDecl = PortDecl, In extends PortDecl = PortDecl, Id extends string = string> {
    /**
     * `namespace:kind/name@N` — and the `@N` is the **type** version, which is a pin
     * (01 §3). Distinct from a spec's semver, which is an upgrade key (src/identity.ts).
     * Carried in the type so a pinned constructor can expose `.v1()` at the call site.
     */
    id: Id;
    kind: Kind;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
    slots?: Record<string, SlotDecl>;
    ports: {
        in?: In;
        out?: Out;
    };
    /** Oracle/outlet only — the review gate keys on this, not on kind (01 §7). */
    effects?: 'none' | 'external' | 'write' | 'emit';
    /**
     * An author may default review **on** for their own node. There is no value here
     * that forbids it — that is the enforcement, not a rule someone checks (F14).
     *
     * **Policy**, not contract (`DESCRIPTOR_POLICY_KEYS`): where the gate
     * starts is offered to the person who configures the node, and moving it
     * changes no port, shape or behaviour of the node itself.
     */
    reviewDefault?: ReviewPosition;
    /**
     * Which of this node's in-ports a reviewer may **edit** at the gate (R-15,
     * U5b review C1, 2026-09-16): an allow-list of port names. Absent, the
     * form is inferred from the whole payload the node received, as it always
     * was — every field editable. Declared, the form shows these fields and
     * no other, and a decision that submits any other key is refused with a
     * sentence rather than folded in silently.
     *
     * The case it exists for is an **identity** field: the `target` of a
     * delete, the `fromMessage` of a branch, the `index` of a swipe. The
     * handler judged whether THIS person may act on THIS row before the run
     * started; a form that let the reviewer retype the id re-aimed a write
     * that had already passed that check, at a row it never saw. So an
     * effectful definition whose payload names a row declares what may
     * change — the text, the direction, the title — and the id is never
     * among them. `fields: []` is a legitimate declaration: approve or
     * reject, nothing to edit (a delete).
     *
     * **Contract** (`DESCRIPTOR_CONTRACT_KEYS`, plans/31 V6): `fields` is the
     * list a decision is validated against, so a pinned spec's review form
     * and the keys its decisions may carry run against it — widening or
     * narrowing the list moves the hash.
     *
     * Read from the in-process definition, and carried on the registry row
     * (`RegistryEntry.review`) so a `transport: process` plugin outlet's form
     * can be read without loading the plugin.
     */
    review?: {
        fields: readonly string[];
    };
    /** Connection kind for providers (== produced shape). Contract. */
    shape?: ShapeId;
    /**
     * May this node be switched off? Requires shape transparency (01 §14
     * F-toggleable). **Policy** — what the panel offers; the switch itself is
     * a setting, and the node runs the same either side of it.
     */
    toggleable?: boolean;
    /**
     * Producing nothing is a legitimate outcome, so failing is not the run's
     * failure.
     *
     * An `err` — including a timeout — becomes an empty `ok` and the run
     * continues. The receipt still records what went wrong: `result` stays
     * `err`, `reason` keeps the message, and `recoveredAsEmpty` marks it, so
     * this is *tolerated* rather than hidden. A node whose failure nobody can
     * see is worse than one that stops the run.
     *
     * For enrichment a template already guards with `{{#if}}` — the narrative
     * graph's relationship summary is the case this exists for: a slow read of
     * an optional block should never cost somebody their reply. It does **not**
     * license wiring a required input to an optional node; downstream still has
     * to mean something when the value is absent, which is a property of the
     * ports, not of this flag.
     *
     * Deliberately not `halt` or `cancelled`. A halt is a binding saying "stop
     * here" on purpose (a preview, a review gate) and a cancellation is the
     * user; neither is a failure to absorb.
     *
     * **Contract**: the ports do not move when it flips, but every spec pinning
     * the version changes behaviour on failure.
     */
    optional?: boolean;
    /**
     * Declares it consumes the run seed — keeps Tasks pure (F11). **Contract**:
     * a replay with the same seed is only a replay while the set of nodes
     * drawing on it is the set the document was compiled against.
     */
    declaresRandomness?: boolean;
    /**
     * Declared, not bound (plans/29 R-2, 2026-09-17).
     *
     * A definition core publishes because a plan owns it — `speak` (plans/14),
     * the two MCP oracles (plans/28) — while no handler implements it yet. The
     * flag is what stops the gap from being invisible: the registry row reads
     * `status: 'provisional'` and is badged; every listing that OFFERS
     * definitions leaves it out; `validate()` refuses a document placing it
     * (law R-2, *bind it or remove the node*); and the executor refuses to run
     * the node with the same sentence, so a document that reached it by another
     * door halts legibly rather than on "no binding registered".
     *
     * **Policy, never hashed** (plans/31 V6, 2026-09-17 — reversing U6's
     * choice): what is *offered* is policy and what *runs* is contract, and
     * this flag decides only the first. The day the handler lands the pin
     * stays where it is; the registry row's `status` moves from
     * `provisional` to `live` on the next sync, and the receipts that named
     * the hash still describe the same contract. `true` or absent, never
     * `false`: a definition is either provisional or it is not.
     */
    provisional?: true;
    /**
     * Interior script points (18 §4e): named moments *inside* the binding's
     * work where user text-transform chains may run — a drafting loop's
     * intermediate texts. Declared here so "which nodes can run scripts, and
     * where" is answerable from the document; the binding invokes one with
     * `ctx.scripts.applyText(key, text)` and gets no `ctx.scripts` at all
     * without a declaration. **Part of the hashed contract** — a point
     * appearing or vanishing, or what it `accepts`, changes what an untouched
     * spec's configuration can reach (S3's argument, one construct over).
     * `label`/`description` are display text and stripped from the hash as
     * everywhere.
     *
     * A point declares what it **accepts** (R-11, ruled 2026-09-15; 18 §4e):
     * the executor hands that list to the applier, which refuses a link of any
     * other kind — it hardcoded `text/transform` until 2026-09-16. Read the
     * list through `scriptPointsOf`. A bare-string point (`'each-draft'`) is
     * refused at `register()` — the spelling was retired without an alias.
     */
    scriptPoints?: ScriptPointDecl[];
    /**
     * The chat-shape contract (19 §0–§1) — present **only on input types**,
     * and its presence is what makes the input type a **chat mode**. The mode
     * id is this type's id; any spec pinning it and matching the primary-write
     * signature is in the mode's bucket, by construction.
     *
     * The core idea is **capability references**: the shape names the systems
     * of core it uses, and declaring one is what enables that system's UI,
     * storage and query satisfiability for chats of the mode. A capability the
     * shape does not declare does not exist for the chat — no toggles, no
     * rows, no budget spent retrieving for it. `personas` absent or `max: 0`
     * means the user is prose: nameless text, no identity, a first-class
     * state rather than an edge case.
     *
     * **Hashed contract** (display lives in `i18n` as everywhere): widening
     * `characters.max` changes what existing sessions legally contain — the
     * `optional` lesson, again. `fields` reuses `SettingsSchema` — the
     * one-field-language rule — rendered in session settings and supplied back
     * through this input's published document. Duties and triggers are
     * deliberately NOT here: the shape is owner-only, and event functions
     * beyond the intrinsic composer are contributed by the specs that serve
     * them (19 §3–§4), so a mode never has to know its narrator exists.
     *
     * Named `sessionShape` because `shape` was already taken by the provider
     * connection kind above — renaming *that* would re-hash every provider
     * on the instance for a word.
     */
    sessionShape?: SessionShape;
    /**
     * May finish before an upstream stream ends (01 §11). **Contract**: a
     * stream consumer that may return early and one that must drain are two
     * different things to wire a stream into.
     */
    earlyExit?: boolean;
    /**
     * Public pipeline hooks may be pinned by any spec (01 §9b). **Policy**:
     * who may pin it is decided at install, not run — a spec that already
     * pins it runs against the same contract either way.
     */
    public?: boolean;
    /**
     * F36 — every hook invocation is bounded. **Policy**, both of them: how
     * long the host waits is the host's to tune, and a spec's document is
     * indifferent to it.
     *
     * `timeoutKind` says what `timeoutMs` measures. `'wall'` (the default):
     * the invocation, start to finish. `'idle'`: the gap between signs of
     * progress — every `ctx.pulse()` (and every `CallHandles.pulse` the host
     * calls for a request it performs) restarts it, and the pub's ceiling
     * bounds the whole. Declare `'idle'` for work whose length is honest but
     * unknown — a streamed reply, a model loading — and `'wall'` for work
     * that should simply be quick.
     */
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    /**
     * Which core event a write causes. Declared here, never per spec (01 §8).
     * Refused at registration unless that event's `causedBy` names this
     * definition (R33): `EventDef.causedBy` is the one authored statement of
     * what causes what, and this field must agree with it.
     */
    causesEvent?: string;
    /**
     * The in-port whose literal names the event a write causes, when that is
     * decided per node rather than per definition — `record-event`'s `event`. The event must be one a package declared; the receipt records it
     * like any `causesEvent`. Never both on one definition.
     */
    causesEventFrom?: string;
    /**
     * Inlet only (R33, PLAN-turn-order §4.14): the event payload shapes this
     * inlet reads. A spec may lock one inlet to several events (`{ genre,
     * events }`) only when every listed event's `payload` is here; an inlet
     * that declares none answers one event. `core:inlet/session-event@1`
     * declares the session payloads.
     */
    payloads?: ShapeId[];
    /**
     * Outlet only: the row this outlet commits becomes the run's **live row**
     * (R-21 (2)) — where core routes an oracle's stream, and what Stop
     * finalises when a run is cancelled with nothing left to run.
     *
     * Declared rather than inferred from the event the write causes, because
     * two outlets can cause `message-created` and only one of them makes a
     * row a stream should land in: a greeting seed writes several messages
     * and none of them is anybody's placeholder. **Contract**: where the
     * stream lands is a property of the wiring the document was compiled
     * against.
     *
     * The declaration says the outlet *can* open the live row; a write opens
     * it only when it is a row still being written — its `generating` in-port
     * fed truthy, or its `row` in-port claiming an existing row
     * (`LIVE_ROW_PORTS`, `opensLiveRow`). A complete message written by the
     * same outlet is an ordinary write (F7, W1).
     */
    liveRow?: boolean;
    /**
     * Where an oracle's token usage sits on its response — a dotted path a
     * host may read for the receipt. **Policy**: it could only change what a
     * receipt reports, never what the node produces.
     */
    usage?: string;
    /**
     * Which media kinds this type can take in and give out.
     *
     * Declared rather than inferred from ports, because the ports are
     * deliberately general: one `media-ref` shape carries every kind, so the
     * port says *that* media flows here and this says *which*. That split is
     * what keeps a new modality from being a new shape, new ports and a new
     * branch in every wire adapter, while still letting a picker grey out a
     * connection that cannot read PDFs.
     *
     * A **type** declaring `accepts` says the contract has somewhere to put
     * media. Whether a given *connection* behind it actually does is a runtime
     * capability the adapter reports — same shape, same field name, resolved
     * against this at bind time. A spec that wires an image into a connection
     * whose model is text-only should fail where the user can see it, not at
     * the provider's HTTP call.
     *
     * **Contract**: it decides what a document may wire into the node's media
     * ports, which is what a bind-time refusal is checked against.
     */
    media?: MediaCapability;
    /**
     * The entry-row contract — present **only on entry types**, and its
     * presence is what makes one (`describeEntryType` is the only door that
     * sets it).
     *
     * Named `entryShape` on the same terms as `sessionShape`: `shape` above is
     * already the provider connection kind, and the two facts are unrelated.
     * Hashed, whole — see the note on `EntryShape`.
     */
    entryShape?: EntryShape;
    /**
     * The bands this source publishes, each with the variable that lays it out
     * (typed templates P2, 2026-09-27) — `{ secretEntry: varSecretEntry }`.
     *
     * A band is the ranker's word for one source's slice of the window, named
     * at the head of the source's candidates (`bandIntent`). Declared here, it
     * is also a **top-level template name**: Assemble renders it as
     * `{{{secretEntry}}}` through the variable's selected layout, and its
     * `variables` slot offers that layout as a setting (`rendersBands`).
     *
     * Keys are identifiers; the variable is registered and its scope declares
     * the key; a key never shadows a name core renders or means two things —
     * each refused at registration with the fix (`checkBandDeclarations`). A
     * band a source emits and does not declare is still ranked and budgeted,
     * reaches no template name, and is named on the receipt with the fix.
     *
     * **Contract** (`DESCRIPTOR_CONTRACT_KEYS`, owner ruling 2026-09-27): it
     * decides what a template may reference, so a plugin update that changes
     * which bands a step produces moves the hash — hashed as `{ key:
     * variableId }`, key order ignored. It still rides the registry row's
     * `policy` as `{ key: variableId }`, so a host reads a plugin's bands
     * without loading the plugin (F6), and `definitionContract` reads it back
     * from there to the same hash.
     * @experimental
     */
    bands?: Record<string, VariableDecl>;
    /**
     * Which out-ports carry each declared band — `{ recalledLines: ['messages'] }`.
     * A band not named here is carried on every out-port, which is what every
     * single-port source means.
     *
     * Needed by a source publishing different bands on different ports:
     * `core:query/entity-search@1` puts lore on `main` and recalled lines on
     * `messages`, and a spec wiring only `main` must not offer a template
     * `{{{recalledLines}}}` that can never fill. `bandsReaching` follows it;
     * each key must be a declared band and each port a declared out-port
     * (`checkBandDeclarations`).
     *
     * **Contract**, beside `bands` and for its reason: it decides which bands
     * reach a template. Rides the registry row's `policy` verbatim.
     * @experimental
     */
    bandPorts?: Record<string, readonly string[]>;
    /**
     * What each out-port's payload looks like, in the template type language
     * (typed templates P1) — `{ out: { templateContext: { type: 'object', … } } }`.
     *
     * A port says which shape flows; this says what is inside it, which is what
     * a template editor needs to offer `{{ templateContext.char }}` with a type.
     * Optional and additive: a port without one is `'any'`, as every port was.
     *
     * **Contract** (owner ruling 2026-09-27): what a template reading the port
     * may reference, so changing it moves the hash (display text stripped, as
     * in the slots). Like `bands`, it rides the row's `policy` verbatim and is
     * hashed from there.
     * @experimental
     */
    portSchemas?: {
        out?: Record<string, VarField>;
    };
}
/**
 * A descriptor's display text, beyond the `i18n`/`description` pair every
 * declaration carries.
 *
 * `label` is what settings.ts calls the canonical key for a field or a member
 * band — `i18n` there is its deprecated alias — and those sit two levels down
 * inside `slots[].schema` and `entryShape.fields`. Renaming "Top K" was
 * therefore a hash change, which is exactly the edit src/hash.ts promises will
 * not put the reload loop back.
 *
 * ⚠ `title` is deliberately absent. `WidgetDecl.title` is a heading, but
 * `EntryRoles.title` is which field the engine reads as a row's title —
 * contract, and moving one is an `@N+1` on purpose. One word, two answers, both
 * reachable from here, so a key-name rule cannot have it both ways; the panel
 * heading stays hashed until one of them is renamed.
 *
 * ## Where it is read
 *
 * Inside `definitionContract`, on every contract field that can carry a
 * label — `slots`, `scriptPoints`, `sessionShape`, `entryShape`. The
 * re-declaration guard below and core's `pipeline_definition_registry`
 * projection both hash through that one function, so there is no second list
 * to keep in step; the value is exported for the tests that prove the strip
 * holds at every depth. Adding a word here re-hashes every definition that
 * carries it — a pointer move on every install, exactly as adding one to
 * `UNIVERSAL_DISPLAY` would be.
 * @internal
 */
export declare const DESCRIPTOR_DISPLAY_KEYS: DisplayKeys;
/**
 * The two halves of a `Descriptor` (plans/31 V6, ruled 2026-09-17).
 *
 * **Contract** is what a pinned spec runs against: the ports and shapes a
 * document was compiled against, the slots it configures and their schema,
 * the effects the gate keys on, the fields a reviewer's decision may carry,
 * whether the node may fail empty, return early, draw on the seed, hold the
 * live row, cause an event, take media. It is what `definitionContractHash`
 * digests, and that hash is what a registry row's pointer and a run's receipt
 * name — so moving any of it republishes the slug on every install.
 *
 * **Policy** is what is *offered* or *shown*: whether the definition is
 * listed (`provisional`, `public`), where its gate starts, whether the panel
 * offers a switch, how long the host waits, what the receipt reads, what the
 * node is called. It lives on the registry row (`RegistryEntry.policy`,
 * `i18n`, `public`) and is never hashed: flipping any of it leaves every pin
 * where it is and takes effect on the next sync — and on the next hot reload,
 * since the registry replaces a re-declaration whose contract is unchanged.
 *
 * Every `Descriptor` key is in exactly one list. `DescriptorFieldsClassified`
 * below makes a key in neither — or in both — a compile error, so a new field
 * is classified before it exists; `sdk-tests/contract.test.ts` gives the
 * one-line reason per field.
 * @experimental
 */
export declare const DESCRIPTOR_CONTRACT_KEYS: readonly ["id", "kind", "ports", "slots", "effects", "review", "shape", "optional", "declaresRandomness", "scriptPoints", "sessionShape", "earlyExit", "causesEvent", "causesEventFrom", "payloads", "liveRow", "media", "entryShape", "bands", "bandPorts", "portSchemas"];
/** @experimental */
export declare const DESCRIPTOR_POLICY_KEYS: readonly ["i18n", "reviewDefault", "toggleable", "provisional", "public", "timeoutMs", "timeoutKind", "usage"];
/** @experimental */
export type DescriptorContractKey = (typeof DESCRIPTOR_CONTRACT_KEYS)[number];
/** @experimental */
export type DescriptorPolicyKey = (typeof DESCRIPTOR_POLICY_KEYS)[number];
type IsNever<T> = [T] extends [never] ? true : false;
/**
 * `true` — and `never`, so the constant below stops compiling, the day a
 * `Descriptor` field is in neither list or in both. Nothing reads either;
 * the type error is the point.
 * @experimental
 */
export type DescriptorFieldsClassified = [
    IsNever<Exclude<keyof Descriptor, DescriptorContractKey | DescriptorPolicyKey>>,
    IsNever<Extract<DescriptorContractKey, DescriptorPolicyKey>>
] extends [true, true] ? true : never;
/** @experimental */
export declare const DESCRIPTOR_FIELDS_CLASSIFIED: DescriptorFieldsClassified;
/**
 * The policy half of a definition as a registry row carries it
 * (`RegistryEntry.policy`): the `Descriptor` fields that are policy and have
 * no column of their own. `i18n` and `public` are policy too and project to
 * their own columns; `usage` is read by no row reader and is not carried.
 * Mutable by design — a sync refreshes it in place, the hash never sees it —
 * with one exception: `bands` and `portSchemas` are contract carried here
 * (owner ruling 2026-09-27), so the row needs no column for them, and
 * `definitionContract` hashes them from here.
 * @experimental
 */
export interface DefinitionPolicy {
    provisional?: true;
    reviewDefault?: ReviewPosition;
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    toggleable?: boolean;
    /** The bands a source declares, as `{ key: variableId }` — `Descriptor.bands`, by id. */
    bands?: Record<string, string>;
    /** `Descriptor.bandPorts`, keys and ports sorted. */
    bandPorts?: Record<string, string[]>;
    /** `Descriptor.portSchemas`, verbatim. */
    portSchemas?: {
        out?: Record<string, VarField>;
    };
}
/** A definition's policy, projected — `undefined` keys dropped so a row and a re-read agree. @experimental */
export declare function definitionPolicy(d: {
    provisional?: true;
    reviewDefault?: ReviewPosition;
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    toggleable?: boolean;
    bands?: Record<string, VariableDecl | string>;
    bandPorts?: Record<string, readonly string[]>;
    portSchemas?: {
        out?: Record<string, VarField>;
    };
}): DefinitionPolicy;
/**
 * What `definitionContract` reads. A `Descriptor` satisfies it, and so does a
 * `RegistryEntry` — the same declaration from the other end of the table,
 * where the id is bare beside a `version`, the ports are shape ids, the
 * substrate's `settings` slot rides among the author's, and an entry type's
 * `fields` schema lives in `configSchema`. The material is the same object
 * from either, which is what lets core hash a row it read back and get the
 * hash it was written under.
 *
 * Script kinds ride the same registry rows (18 §2), so a row's `semantics` is
 * contract here too. Their own re-declaration guard (`scripts.ts`) hashes the
 * declaration whole and is not this function.
 * @experimental
 */
export interface ContractSource {
    /** `ns:kind/name@N` on a descriptor; bare beside `version` on a row. */
    id: string;
    version?: number;
    kind: string;
    ports?: {
        in?: Record<string, unknown>;
        out?: Record<string, unknown>;
    };
    slots?: Record<string, unknown>;
    effects?: string;
    review?: {
        fields: readonly string[];
    };
    shape?: string;
    optional?: boolean;
    declaresRandomness?: boolean;
    scriptPoints?: ReadonlyArray<ScriptPointDecl>;
    sessionShape?: unknown;
    earlyExit?: boolean;
    causesEvent?: string;
    causesEventFrom?: string;
    payloads?: readonly string[];
    liveRow?: boolean;
    media?: unknown;
    entryShape?: unknown;
    /** A row's spelling of `entryShape.fields` (`RegistryEntry.configSchema`). */
    configSchema?: unknown;
    /** A descriptor's bands (`VariableDecl`) — or ids, as a row's policy spells them. */
    bands?: Record<string, VariableDecl | string>;
    bandPorts?: Record<string, readonly string[]>;
    portSchemas?: {
        out?: Record<string, VarField>;
    };
    /**
     * A row's policy half. Never hashed — except `bands` and `portSchemas`,
     * contract that rides here (owner ruling 2026-09-27) and is read from
     * here when the source has no field of its own.
     */
    policy?: {
        bands?: Record<string, string>;
        bandPorts?: Record<string, readonly string[]>;
        portSchemas?: {
            out?: Record<string, VarField>;
        };
    } | null;
    /** Script kinds only. */
    semantics?: string;
}
/**
 * The hashed material of a definition — the contract, as data.
 *
 * `id` and `version` are the slug's two halves; `ports` is shape ids by port
 * name, both directions always present; `slots` is the author's, display
 * text out (`DESCRIPTOR_DISPLAY_KEYS`); `entryShape` is whole, `fields`
 * included; `scriptPoints` is the full shape `scriptPointsOf` folds to. A
 * boolean flag is `true` or absent — `false` and unset mean the same thing
 * and hash the same, which is also what lets a `NOT NULL DEFAULT false`
 * column read back to the hash it was written under. A function value is
 * not contract (`declarationData`).
 * @experimental
 */
export interface DefinitionContract {
    id: string;
    version: number;
    kind: string;
    ports: {
        in: Record<string, string | undefined>;
        out: Record<string, string | undefined>;
    };
    slots: Record<string, unknown>;
    effects?: string;
    review?: {
        fields: string[];
    };
    shape?: string;
    optional?: true;
    declaresRandomness?: true;
    scriptPoints?: unknown;
    sessionShape?: unknown;
    earlyExit?: true;
    causesEvent?: string;
    causesEventFrom?: string;
    payloads?: string[];
    liveRow?: true;
    media?: unknown;
    entryShape?: unknown;
    /** `{ key: variableId }` — which top-level template names this source publishes. */
    bands?: Record<string, string>;
    /** `{ key: ports }` — which out-ports carry a band; sorted. */
    bandPorts?: Record<string, string[]>;
    /** Out-port payload schemas, display text out. */
    portSchemas?: unknown;
    semantics?: string;
}
/** The contract of a definition — every `DESCRIPTOR_CONTRACT_KEYS` field, as data, and nothing else. @internal */
export declare function definitionContract(source: ContractSource): DefinitionContract;
/**
 * The content hash of a definition — a digest of `definitionContract`, and
 * the one answer to *is this the same definition?* The registry guard below,
 * core's `pipeline_definition_registry` pointer and a run's receipt all name
 * this string.
 * @internal
 */
export declare function definitionContractHash(source: ContractSource): string;
/**
 * The extras every script site is offered, whatever its slot lists (R32,
 * PLAN-turn-order §4.14): `session`, the run's settings document. The
 * executor supplies them at every site — a slot's port hook and an interior
 * point alike — so a slot's `extras` names only what is particular to it,
 * and listing an ambient one is refused (one way to say it, R26).
 * @internal
 */
export declare const AMBIENT_SCRIPT_EXTRAS: readonly ['session'];
/**
 * Can `swap` stand in for `pinned` at node `key` (R28)? A swap is seated with
 * the pin's node config, so it must be the same kind with the same in- and
 * out-ports (by name and shape) and the same slots — a slot the pin's node
 * does not wire would never reach the swap, and a person would pick an
 * option that silently ignores its own settings. Script points are free: a
 * chain is configured on the node key, whatever sits there. One sentence
 * for the builder and the package pass alike.
 * @experimental
 */
export declare function swapFitFinding(key: string, pinned: Pick<Descriptor, 'id' | 'kind' | 'ports' | 'slots'>, swap: Pick<Descriptor, 'id' | 'kind' | 'ports' | 'slots'> & {
    provisional?: true;
}): string | undefined;
/**
 * Can one inlet answer every event of an `events` lock (R33)? Each listed
 * event must carry a payload the inlet declares it reads; an inlet that
 * declares none answers one event only. One sentence for the builder and
 * the package pass alike.
 * @experimental
 */
export declare function eventsLockFindings(inlet: Pick<Descriptor, 'id' | 'payloads'>, events: readonly string[]): string[];
/**
 * The display text of a list of widget declarations (R-20): each `title`
 * (required — the chrome and the tray show it) and each `settings` schema.
 * Shared by a session shape's `panels` and a genre's shape, which carry the
 * same declarations.
 * @experimental
 */
export declare function widgetDeclsFindings(raw: unknown, where: string): string[];
/** @experimental */
export declare function getDefinition(id: string): Descriptor | undefined;
/** @experimental */
export declare function allDefinitions(): Descriptor[];
/** @experimental */
export declare function _clearDefinitions(): void;
/**
 * ## Why every `describe*` is generic over its slots
 *
 * `Descriptor.slots` is the open `Record<string, SlotDecl>`, so a declaration
 * passed straight into it arrives with its **keys erased** — and with them the
 * `params` slot's `schema` keys, which is the entire declared parameter
 * vocabulary of the node. That erasure is what let `input.params.foo` be an
 * `any` lookup on a node whose schema has no `foo`: `topK` and `limit` were
 * both read that way for releases, off nodes that did declare them, at a
 * spelling nothing supplied.
 *
 * Capturing the argument in `S` keeps the literal keys, which is what
 * `InputOf` (src/nodeInput.ts) derives a handler's `input` type from.
 *
 * ⚠ **Type-level only.** `register()` still receives the same object and the
 * content hash is computed over the same runtime value, so nothing here moves a
 * declaration or re-hashes a type.
 *
 * ⚠ **`S` is constrained rather than `const`, and the difference is
 * deliberate.** `describeOracleDefinition` below needs the literal *values* — the
 * `optional: ['json_schema']` tuple `ctx.can()` narrows against — so it pays
 * for `const` with a validation done by intersection in the parameter. Names
 * are all `InputOf` needs, and an object literal keeps its own keys with or
 * without `const`; a `const` here would additionally freeze `accepts: [...]`
 * and `extras: [...]` into readonly tuples, which `SlotDecl` declares as
 * mutable `string[]` and which several core input and task types use.
 * @experimental
 */
export declare const describeInletDefinition: <O extends PortDecl, I extends PortDecl, const Id extends string, const S extends Record<string, SlotDecl> = Record<string, SlotDecl>>(d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
    slots?: S;
}) => Descriptor<O, I, Id> & {
    kind: 'inlet';
    slots?: S;
};
/** @experimental */
export declare const describeQueryDefinition: <O extends PortDecl, I extends PortDecl, const Id extends string, const S extends Record<string, SlotDecl> = Record<string, SlotDecl>>(d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
    slots?: S;
}) => Descriptor<O, I, Id> & {
    kind: 'query';
    slots?: S;
};
/** @public */
export declare const describeTaskDefinition: <O extends PortDecl, I extends PortDecl, const Id extends string, const S extends Record<string, SlotDecl> = Record<string, SlotDecl>>(d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
    slots?: S;
}) => Descriptor<O, I, Id> & {
    kind: 'task';
    slots?: S;
};
/**
 * An oracle definition.
 *
 * `const S` on the slots is what makes `ctx.can()` safe: without it,
 * `optional: ['json_schema']` widens to `CapabilityId[]` at the declaration and
 * the binding can only be told "some capability", which is no narrowing at all.
 * With it the literal tuple survives into `Pinned<D>` and out the other side, so
 * a binding asking about a capability its node never declared does not compile.
 * @experimental
 */
export declare const describeOracleDefinition: <O extends PortDecl, I extends PortDecl, const Id extends string, const S extends Record<string, unknown> = Record<string, never>>(d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
    slots?: S & Record<string, SlotDecl>;
}) => Descriptor<O, I, Id> & {
    kind: 'oracle';
    slots?: S;
};
/** @experimental */
export declare const describeOutletDefinition: <O extends PortDecl, I extends PortDecl, const Id extends string, const S extends Record<string, SlotDecl> = Record<string, SlotDecl>>(d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
    slots?: S;
}) => Descriptor<O, I, Id> & {
    kind: 'outlet';
    slots?: S;
};
/**
 * The field roles the engine reads. Frozen, and the reason it is frozen is rule 2
 * above: the list grows when a *behaviour* needs a new question answered, never
 * because a type has a field it would like consulted.
 * @experimental
 */
export declare const ENTRY_ROLES: readonly [
/** Which field is this row's display title. */
'title', 
/** How siblings sort among themselves — structured keys, never a string. */
'order', 
/** Which field carries the manual 1..3 boost. Absent means **no bonus**. */
'priority', 
/** Which reference column decides who may see this row, under which policy. */
'anchor', 
/** Which fields make the text an embedding is computed over. */
'embedText', 
/** Which field holds the trigger keys the keyword scan matches. */
'key', 
/** Which reference column points at the row this one hangs under. */
'parent'];
/** @experimental */
export type EntryRole = (typeof ENTRY_ROLES)[number];
/**
 * The budget bands a candidate can compete in — the engine's `RetrievalBand`,
 * closed on purpose.
 *
 * ⚠ Closed because the failure of an open one is **silent**: the signal-weight
 * and share maps are total over this union, so an entry type declaring a band
 * nobody budgets has its candidates scored against `undefined` and dropped with
 * a green test suite. That is not hypothetical — history was absent from every
 * prompt for two spec versions exactly this way. A new shape picks the band it
 * competes in; it does not mint one.
 * @experimental
 */
export declare const ENTRY_SOURCE_KINDS: readonly ['messages', 'worldLore', 'characterLore', 'history', 'relationships'];
/** @experimental */
export type EntrySourceKind = (typeof ENTRY_SOURCE_KINDS)[number];
/**
 * The short name this type's rows carry on the wire — `extensions.serenepub`
 * in a character-card book.
 *
 * Closed to the names the importer reads: the three every file has carried,
 * plus `location` and `item`, which the app's importer restores as a place and
 * an item (lorebooks plan A26 — written as world lore, a place reads back
 * without its links' meaning or its stats). A type outside them declares
 * nothing here: no marker is honest, where a marker no importer reads is a
 * file that round-trips into the wrong shape. Widening the list is a
 * deliberate act with an importer change beside it.
 * @experimental
 */
export declare const ENTRY_EXPORT_KEYS: readonly ['world', 'character', 'history', 'location', 'item'];
/** @experimental */
export type EntryExportKey = (typeof ENTRY_EXPORT_KEYS)[number];
/**
 * Visibility policies a type may select for its anchor.
 *
 * `core:policy/binding-visibility@1` is the four branches character lore
 * already has — character equality, persona membership, narrator-only when the
 * binding is unbound, invisible when the row is unanchored. That is *policy*,
 * so it is named, versioned and implemented by core; the type picks from this
 * list and never authors one (rule 3).
 * @experimental
 */
export declare const ENTRY_ANCHOR_POLICIES: readonly ['core:policy/binding-visibility@1'];
/** @experimental */
export type EntryAnchorPolicy = (typeof ENTRY_ANCHOR_POLICIES)[number];
/**
 * How this type reaches a prompt: the id of the variable whose layout renders
 * its admitted rows (`core:var/world-lore@1`, `core:var/character-lore@1`).
 * A context template places that variable; nothing folds a type's rows into
 * another variable's value.
 * @experimental
 */
export type EntryRender = string;
/** One key of a sort, in an ordered list. Structured data — never a parsed string. @experimental */
export interface EntryOrderKey {
    /** A declared field, or a column the engine reads for every type. */
    field: string;
    dir: 'asc' | 'desc';
    /**
     * Where absent values sort. Optional because the two-key case (a year and
     * a month that may be null) is the one that needs it, and most do not.
     */
    nulls?: 'first' | 'last';
}
/** The reference column that decides who may see a row, and under which policy. @experimental */
export interface EntryAnchor {
    /**
     * The column carrying the reference. A **real column with a real foreign
     * key**, never a value inside `fields`: dangling and cross-tenant refs are
     * a live threat here, which is why cross-ref validation exists at all.
     */
    column: string;
    policy: EntryAnchorPolicy;
}
/**
 * Which field plays each field role for this type.
 *
 * Every field role is optional: a type answers the questions it has answers to,
 * and `checkEntryTypes` is what notices when a field role has stopped being
 * answered by anybody — so a dead field role is deleted rather than accreting.
 * @experimental
 */
export interface EntryRoles {
    title?: string;
    order?: readonly EntryOrderKey[];
    priority?: string;
    anchor?: EntryAnchor;
    embedText?: readonly string[];
    key?: string;
    parent?: string;
}
/**
 * The entry-row contract, as it sits on the descriptor and in the row.
 *
 * **Hashed, all of it.** Field roles, render, source kind, export key and the anchor
 * policy are what the engine reads to decide where a row competes, how it
 * sorts, who may see it and where it renders — so changing one changes what an
 * untouched install does while every pin keeps resolving, which is precisely
 * the silent behaviour change the freeze rule exists to stop. The consequence
 * is intended: **moving a field role forces `@N+1`.**
 *
 * `fields` is hashed too, and it has to be for a second reason: the declared
 * schema is projected into database CHECK constraints, so a schema change is a
 * constraint change. Display text inside it (`i18n`, `description`) is stripped
 * before hashing like everywhere else.
 * @experimental
 */
export interface EntryShape {
    roles: EntryRoles;
    /**
     * The type-specific half of the row — what lands in `fields` jsonb, declared
     * in the one field language (settings.ts), rendered by the one form
     * renderer, and projected into constraints and indexes by one boot step.
     *
     * Only the **T1 declarative** subset projects into a constraint: required,
     * type, min/max, enum. T2 predicates (`showIf`) are UI-level and depend on
     * state a row does not carry.
     */
    fields?: SettingsSchema;
    render?: EntryRender;
    sourceKind: EntrySourceKind;
    exportKey?: EntryExportKey;
    /**
     * What an amendment to one of these rows means: `amend` layers onto the
     * base, `replace` supersedes it.
     *
     * A **mode, not a per-amendment choice** — mixing both semantics in one
     * assembled view makes the result unpredictable. Declared on the type with
     * a per-row override, which is the nullable-with-fallback pattern
     * `matchMode` already uses.
     */
    amendMode?: 'amend' | 'replace';
}
/** What an author writes. Flat, because nesting the facets buys nothing here. @experimental */
export interface EntryTypeDecl<Id extends string = string> extends EntryShape {
    /** `core:entry/<name>@N`. The version is the pin, exactly as for node definitions. */
    id: Id;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
}
/** An entry type as it comes back out of the registry — the kind, narrowed. @experimental */
export type EntryDescriptor<Id extends string = string> = Descriptor<PortDecl, PortDecl, Id> & {
    kind: 'entry';
    entryShape: EntryShape;
};
/**
 * Declare an entry type.
 *
 * The version lives in the id and therefore at every call site that names one,
 * which is the same convention `pin()` keeps for node definitions. What is
 * deliberately *not* here is a pinned constructor: `pin()` mints `v1()`, and
 * `v1()` builds a node a spec wires. An entry type is a row shape — there is
 * nothing to construct — so minting one would offer a call that can only ever
 * be a mistake.
 * @experimental
 */
export declare const describeEntryType: <const Id extends string>(d: EntryTypeDecl<Id>) => EntryDescriptor<Id>;
/** Every entry type this build declares. @internal */
export declare const allEntryTypes: () => EntryDescriptor[];
/** A conformance finding. Every one names what to do, as everywhere here (15 §1.3). @experimental */
export interface EntryFinding {
    severity: 'error';
    code: 'E_UNKNOWN_ROLE' | 'E_DEAD_ROLE';
    message: string;
    fix: string;
    where?: string;
}
/**
 * The conformance canary — the field role vocabulary checked in **both** directions
 * (the shape values.ts's four-way registry canary already has).
 *
 * Forward: nothing declares a field role the engine does not read.
 * `describeEntryType`
 * refuses that at the author's line, so this is the backstop for declarations
 * that did not come through the door — a row written by another build, a type
 * read back from the registry.
 *
 * Backward, and this is the direction that earns the canary: **every field role
 * the engine reads is declared by somebody.** A field role no type answers is a
 * question
 * the engine asks nothing, and the vocabulary is frozen precisely so that one
 * gets deleted rather than sitting there looking supported.
 * @experimental
 */
export declare function checkEntryTypes(types: ReadonlyArray<{
    id: string;
    entryShape?: EntryShape;
}>): EntryFinding[];
/**
 * A pinned constructor. The builder method names the *kind*; this names the
 * *type and version* (04 §4b). Both are required — drop either and F21 or static
 * pin-checking goes with it.
 * @experimental
 */
export interface NodeSpec<D extends Descriptor<any, any, any> = Descriptor> {
    readonly __node: true;
    descriptor: D;
    config: Record<string, unknown>;
}
/** `'core:query/session-history@2'` → `'2'`. Absent means `1`. */
type VersionOf<S extends string> = S extends `${string}@${infer V}` ? V : '1';
/** @experimental */
export type NodeCtor<D extends Descriptor<any, any, any>> = (config?: Record<string, unknown>) => NodeSpec<D>;
/**
 * A pinned constructor (04 §4b).
 *
 * The builder method names the **kind**; this names the **type and version**, and the
 * version sits at the call site — `generateText.v1({ … })` — for three reasons that a
 * version baked into the id cannot deliver:
 *
 *  - upgrading a pin is a **visible diff**, not an invisible change of meaning
 *  - two versions of a type can **coexist in one spec**, which a migration needs
 *  - a deprecated pin **strikes through** on `generateText.v1` precisely, because the
 *    key is what carries the version
 * @experimental
 */
export type Pinned<D extends Descriptor<any, any, any>> = {
    readonly [K in `v${VersionOf<D['id']>}`]: NodeCtor<D>;
} & {
    readonly id: D['id'];
    readonly descriptor: D;
};
/** @public */
export declare function pin<D extends Descriptor<any, any, any>>(descriptor: D): Pinned<D>;
/** The out-port map of whatever a pinned constructor produces — the scope's raw material. @experimental */
export type OutPortsOf<N> = N extends NodeSpec<infer D> ? D extends Descriptor<infer O, any, any> ? O : PortDecl : PortDecl;
/**
 * The in-ports that make a `liveRow` outlet's write the run's live row (F7,
 * W1): a placeholder (`generating`) or a claimed row (`row`). Anything else
 * the outlet writes is a complete row — an ordinary write, as many as the
 * pipeline likes.
 * @experimental
 */
export declare const LIVE_ROW_PORTS: readonly ['generating', 'row'];
/** Whether a `liveRow` outlet's resolved payload opens the live row (see `LIVE_ROW_PORTS`). @experimental */
export declare function opensLiveRow(payload: unknown): boolean;
//# sourceMappingURL=descriptors.d.ts.map