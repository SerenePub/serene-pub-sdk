/**
 * Verdicts — one function per rule, heard at every door (01 §13; plans/31 V4).
 *
 * *A rule has exactly one verdict function. Every door — construction,
 * `validate()`, publish (`saveDocument`), the registry, the run, the fire,
 * the write — calls it and quotes its sentence. A door that re-derives a rule
 * is a defect.*
 *
 * ## The shape
 *
 * A **verdict** is a declaration: an id (`core:verdict/<slug>`), the law it
 * comes from (the label a `Finding` carries — `R-20`, `F39`), the **doors**
 * that hear it, a `judge` over one input, and a `failing()` input the
 * conformance kit feeds through every declared door (C27) expecting the
 * verdict's own sentence back. The judge answers `{ ok: true }` or
 * `{ ok: false, sentence, fix? }` — the sentence is the refusal a person
 * reads, the fix is what to do instead (the teaching-error pattern, 15
 * §1.3), and both are display text (R-20). A door quotes them; it composes
 * nothing. Where a door has one string to speak through — a throw, a halt
 * reason, a receipt note — it says the sentence and then the fix; where it
 * has a `Finding`, the two are its `message` and `fix`.
 *
 * ## A door is where a rule is heard
 *
 * `Door` is the closed list of places a rule can be heard, SDK and host
 * alike. A verdict declares every door that exists in code today, including
 * the ones only a host has (`fire`, `write`, `list`, `publish`) — the kit
 * then holds each host to the doors it has and names the rest as unjudged.
 *
 * ## Where a verdict is declared
 *
 * This module is imported by every door in the SDK — the registry
 * (`descriptors.ts`), the action model, `validate()`, the executor — so it
 * must sit below all of them: it reads only the leaf vocabulary (`i18n`,
 * `predicates`, `participants`, `settingsSlot`, `hash`) and nothing above.
 * A verdict whose judge reads a primitive above this module is declared
 * beside that primitive, with the same `defineVerdict`, and reaches the
 * registry the same way: the effects line and form staleness are declared
 * in `messageBlocks.ts`, because their judges call `worldBlockFunctions`
 * and `isFormStale`. The SDK's own graph carries no import cycle and a
 * registry that pulled the whole vocabulary into one file would start one
 * (DECOMPOSITION.md records what a latent cycle cost once already).
 *
 * `defineVerdict` is idempotent on an identical redeclaration — the same
 * content-keyed rule every registry here applies (`refuseUnlessIdentical`),
 * so a dev server's hot reload re-running this module is a no-op and a
 * *different* declaration under a registered id still throws.
 */
import { type I18n } from './i18n.js';
import { type EnabledWhen } from './predicates.js';
import { type ParticipantRef, type Portrayals } from './participants.js';
/**
 * The closed list of places a rule is heard:
 *
 *  - `construction` — an author building a document or a declaration: the
 *    builder, `.preset()`, `genre()`, `announce.build()`.
 *  - `registry` — a definition registered (`register()`, the `define*`
 *    doors), or a host reading its registry against what it can run.
 *  - `validate` — `validate()` over a stored document.
 *  - `publish` — a host's `saveDocument`, the CLI packager, an install.
 *  - `run` — the executor.
 *  - `fire` — a host's action fire (`fireAction`, the verb handlers).
 *  - `write` — a host's message write (the block gate at `create-message`).
 *  - `list` — a listing or an affordance: a host's action list, a client
 *    drawing a control grey or a form collapsed.
 * @experimental
 */
export declare const DOORS: readonly ['construction', 'registry', 'validate', 'publish', 'run', 'fire', 'write', 'list'];
/** @experimental */
export type Door = (typeof DOORS)[number];
/**
 * What a judge answers. A refusal carries the sentence a person reads and,
 * where the rule has one, the fix — both display text. `code` is a stable
 * word for a refusal a door routes on rather than reads (none of the core
 * verdicts needs one today; a host's may).
 * @experimental
 */
export type VerdictResult = {
    ok: true;
} | {
    ok: false;
    sentence: I18n;
    fix?: I18n;
    code?: string;
};
/**
 * A verdict, declared — and, once `defineVerdict` has it, registered and
 * frozen: the declaration is the registered thing, as a `FacetDecl` or a
 * `ScriptKindDecl` is. (The name `Verdict` is taken: `capabilities.ts`
 * spells the answer to "can this connection run this node" that way.)
 *
 * `judge` and `failing` are methods, not function-typed properties, so
 * that a `VerdictDecl<AudienceInput>` is a `VerdictDecl<unknown>` — the
 * shape `verdicts()` enumerates — under strict function types.
 * @experimental
 */
export interface VerdictDecl<I> {
    /** `core:verdict/<slug>` — a kebab slug: `core:verdict/i18n`, `core:verdict/effects-line`. */
    id: string;
    /** The law's label, as a `Finding` carries it: `R-20`, `F39`, `F41`, `R-2`, `U5e`, `U5f`, `R-15`. */
    law: string;
    /** Every door that hears this rule in code today — SDK and host alike. */
    doors: readonly Door[];
    /** The one judgement. Pure: the same input answers the same sentence at every door. */
    judge(input: I): VerdictResult;
    /**
     * A failing input the conformance kit feeds through the named door (C27);
     * `judge(failing(door))` must be `ok: false`. Named per door because a
     * rule with several input kinds is heard through different ones at
     * different doors — F39's `construction` hears a declared port, its
     * `validate` hears an edge — and the kit needs the one that door hears.
     */
    failing(door: Door): I;
}
/** `owner:verdict/slug` — the owner as every other id spells it, the slug in kebab case. @experimental */
export declare const VERDICT_ID: RegExp;
/**
 * Register a verdict and get it back frozen. Refuses an id outside the
 * grammar, a verdict with no law or no door, and an unknown door — each
 * with the sentence that says what to write instead. An identical
 * redeclaration is a no-op; a different one under a registered id throws.
 * @experimental
 */
export declare function defineVerdict<I>(decl: VerdictDecl<I>): VerdictDecl<I>;
/** Every registered verdict, in registration order. @experimental */
export declare function verdicts(): readonly VerdictDecl<unknown>[];
/** @experimental */
export declare function verdictById(id: string): VerdictDecl<unknown> | undefined;
/**
 * A door with one string to speak through — a throw, a halt reason, a note —
 * says the sentence and then the fix, in `en` through the one resolver
 * (`i18nText`). The refusal's shape at such a door is the verdict's, not the
 * door's: nothing here rewords either half.
 * @internal
 */
export declare function refusalText(r: Extract<VerdictResult, {
    ok: false;
}>): string;
/** The sentence half alone, in `en` — for a door that has nowhere to put the fix. @internal */
export declare function sentenceText(r: Extract<VerdictResult, {
    ok: false;
}>): string;
/** @experimental */
export interface DisplayTextInput {
    /** The value the author wrote. */
    value: unknown;
    /** The field's address as the author sees it (`acme:task/roll@1 i18n.name`). */
    where: string;
    /** Absence is a finding when the field is required. */
    required?: boolean;
}
/**
 * Display text is a non-blank string or a locale map with a non-blank `en`
 * (R-20; U5i, ruled 2026-09-17). `i18nFindings` is the one check and
 * answers at most one sentence per value; this is that check as a verdict.
 * Every publish door runs it: `register()`, the builder's presets, `genre()`,
 * `announce.build()`, the attribute, sheet, script-kind and value
 * declarations, `validate()`, the CLI packager, a host's `saveDocument`, and
 * the executor for a status (a note; the status is dropped, never a halt).
 * @experimental
 */
export declare const i18nVerdict: VerdictDecl<DisplayTextInput>;
/** @experimental */
export interface EnablementInput {
    /** The predicate set in force for the action — a list, one, or none. */
    preds: ReadonlyArray<EnabledWhen> | EnabledWhen | undefined | null;
    /** The published-values document the predicates are read over. */
    doc: unknown;
}
/**
 * An action is offered now when every enabled-when predicate holds over the
 * session's published values (plans/29 R-15; U5e). The sentence is the
 * author's own `reason` on the first predicate that fails — that is the
 * design: the refusal a door quotes and the grey a listing shows are the
 * author's words, in the person's language. `evaluateEnabledWhen` is the
 * judge; the host's listing and its fire read it through here.
 * @internal
 */
export declare const enablementVerdict: VerdictDecl<EnablementInput>;
/** @experimental */
export interface AudienceInput {
    /** The action's name, for the sentence. */
    name: string;
    /** The references being judged — an action's `act`, or its `see`. */
    refs: ReadonlyArray<ParticipantRef>;
    /** Who portrays each reference, as the host's resolver answered. */
    portrayals: Portrayals;
    /** The person asking. */
    viewer: {
        userId: number | string;
    };
    /**
     * The item rule's answer for the message the press is on, when the host
     * has one. Absent at a listing, where `item` is a question for a message
     * and holds for now (`itemGated`); `false` at a fire that names no row.
     */
    item?: boolean;
}
/**
 * An action is a person's to use when they hold one of the references its
 * audience names (plans/29 R-15 *audience*): a portrayal naming them, or
 * the item rule on the message. `audienceHolds` is the judge, the same
 * function the listing's `canAct` reads, so a grey chip and a refusal at
 * the fire can never disagree.
 * @internal
 */
export declare const audienceVerdict: VerdictDecl<AudienceInput>;
/**
 * The three shapes a setting could travel in: a data edge drawn from a
 * node's `settings` address, a config reference naming the substrate's
 * slot, and a definition publishing an out-port of the name — which would
 * put a port at the address the other two are refused for.
 * @experimental
 */
export type SettingsTravelInput = {
    kind: 'edge';
    from: string;
    fromPort: string;
    to: string;
    toPort: string;
} | {
    kind: 'reference';
    node: string;
    key: string;
    slot: unknown;
    target: string;
} | {
    kind: 'port';
    definitionId: string;
    port: string;
};
/**
 * Settings never travel; only data does (12 §2 P3, 29 §5d; F39).
 * `<nodeKey>.settings.*` — `enabled`, `review`, `mode` — is read by the
 * executor at its owner and handed to nobody. It is not a port: a data edge
 * drawn from it carries nothing, a reference naming it resolves to nothing,
 * and a document that draws one has made a node depend on another node's
 * switch, which is exactly the coupling that stops two configs from being
 * independent. Heard at the registry (a declared port of the name), at
 * `validate()` (an edge, a reference) and by the executor (a reference in a
 * document that skipped validation).
 * @experimental
 */
export declare const settingsTravelVerdict: VerdictDecl<SettingsTravelInput>;
/**
 * The two directions of *declared, not bound*: a document placing a
 * definition that carries the flag, and a publication — a registry row, a
 * picker entry — with no handler behind it and no flag excusing it.
 * @experimental
 */
export type ProvisionalInput = {
    kind: 'placement';
    nodeKey: string;
    definitionId: string;
    definitionVersion: number | string;
    provisional: boolean;
} | {
    kind: 'publication';
    definitionId: string;
    provisional: boolean;
    bound: boolean;
};
/**
 * A provisional definition is declared, not bound (plans/29 R-2): published
 * because a plan owns it, run by no handler. A document placing one is
 * refused where the author is — `validate()` — and again by the executor
 * for a stored document older than the flag, so it halts on the law rather
 * than on "no binding registered" pointing at the wrong file. The other
 * direction is the host's boot gate: a core definition it publishes with no
 * handler and no flag is a packaging error, said with the three things a
 * person can do.
 * @internal
 */
export declare const provisionalVerdict: VerdictDecl<ProvisionalInput>;
//# sourceMappingURL=verdicts.d.ts.map