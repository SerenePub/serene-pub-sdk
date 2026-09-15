/**
 * Context variables as an open registry (F2 — ids namespaced, `core:` reserved).
 *
 * ## The inversion this exists to make
 *
 * A context template today writes `{{{characters}}}` and gets back a blob of
 * JSON whose shape was decided in TypeScript — indentation and all. Which means
 * "I want my characters rendered as prose instead of JSON" is not a
 * configuration question at all; it is a code change. The template can decide
 * *whether* characters appear and *where*, and has no say whatsoever in what
 * they look like when they do.
 *
 * A variable declaration moves that decision into data. The producing node says
 * "this slot renders `core:var/characters@1`", the registry says what is in
 * scope when it renders and what a representative value looks like, and the
 * actual presentation becomes a swappable row the same way a prompt is.
 *
 * ## Why `scope` is on the declaration and not inferred
 *
 * This is the same argument `SlotDecl.variables` makes for source templates and
 * for the same reason (see descriptors.ts): the shape an author needs to write
 * against lives *inside* a payload, not on a port. Typed ports can say a node
 * emits `core:shape/json@1`; they cannot tell whoever is writing
 * `{{#each characters}}{{ this.nickname }}` whether `nickname` is a field.
 * Declaring it is what makes lint and autocomplete possible at all, and it is
 * the "pass expected shapes down to the configuration" half of the feature.
 *
 * `sample` is the other half. A preview that renders against real chat data
 * needs a chat; a preview that renders against a declared sample needs nothing,
 * which is what lets the template editor show output while you type.
 */
import type { I18n } from './descriptors.js';
import { type TemplateScope } from './template.js';
/** `core:var/characters@1` — namespaced and versioned like every other id. */
export type VariableId = string;
export interface VariableDecl {
    id: VariableId;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
    /**
     * What this variable is, shown where it is selected. Display text: stripped
     * from any content hash for the same reason `i18n` is.
     */
    description?: I18n;
    /**
     * What is in the root of a template rendering this variable.
     *
     * Normally one entry named for the variable itself — `{ characters: 'any' }`
     * — but nothing requires that, and a variable whose presentation depends on
     * a second value declares both.
     */
    scope: TemplateScope;
    /** A representative value, for previews and publish-time checking. */
    sample: unknown;
}
/**
 * Register a variable declaration.
 *
 * Two refusals, both the same rule the engine and renderer registries enforce:
 * an id has exactly one owner, and `core:` is not for the taking. A plugin that
 * could redefine `core:var/characters@1` would change how characters render in
 * every pipeline on the instance without appearing in a single spec — invisible
 * in exactly the way a prompt change is not.
 */
export declare function defineVariable(decl: VariableDecl): VariableDecl;
/**
 * The plugin-facing door. Same registration, minus the ability to claim core's
 * namespace — checked here rather than in `defineVariable` so core's own
 * declarations do not have to argue their way past their own guard.
 */
export declare function definePluginVariable(pluginId: string, decl: VariableDecl): VariableDecl;
export declare const getVariable: (id: VariableId) => VariableDecl | undefined;
export declare const allVariables: () => VariableDecl[];
export declare function _clearVariables(): void;
export declare const varInstructions: VariableDecl;
export declare const varCharacters: VariableDecl;
export declare const varPersonas: VariableDecl;
export declare const varScenario: VariableDecl;
export declare const varExampleDialogue: VariableDecl;
export declare const varPostHistoryInstructions: VariableDecl;
export declare const varCharacterNames: VariableDecl;
export declare const varPersonaNames: VariableDecl;
export declare const varWorldLore: VariableDecl;
export declare const varHistory: VariableDecl;
/**
 * The speaker-centric relationship summary from the narrative graph.
 *
 * ⚠ This was declared `'any'` and carried a **pre-stringified string** —
 * `buildGraphContext` called `JSON.stringify(graph, null, 1)` before the value
 * ever reached a template, so the layout was a passthrough. That made it the
 * one context value a layout could do nothing with: not prose, not a dropped
 * section, not even a different indent, because the shape had already been
 * flattened upstream. The node now emits the structure and the layout does the
 * rendering, which is the same inversion `characters` got.
 *
 * All three sections are conditional. An install with no legendary figures has
 * no `legendaryFigures` key at all rather than an empty object, and the shipped
 * layout's guards are written against exactly that.
 *
 * Distinct from `narrativeGraph`, which the infill engines populated and which
 * nothing renders any more: this one is speaker-centric and always-on wherever
 * a chat has a lorebook and the speaker has a bound node.
 */
/**
 * How the speaking character regards everyone else.
 *
 * ⚠ Split, with its sibling below, out of `core:var/speaker-relationships@1`.
 * That one variable held both directions and the legendary figures under a
 * single "Your relationships:" heading — so a model was handed what the speaker
 * thinks of Brannoc and what Rell thinks of the speaker as one undifferentiated
 * list, and a user who wanted one and not the other had no setting for it. Two
 * variables means two layouts, two priorities and two switches.
 */
export declare const varRelationshipsPerspectives: VariableDecl;
/**
 * How everyone else regards the speaking character, and who the world knows of.
 *
 * `legendaryFigures` sits here rather than in its own variable because it is
 * the same kind of claim — what is publicly known — and the opposite kind from
 * "what you think of them". A third variable would put a mostly-empty block in
 * every prompt on every install that has never marked a node legendary.
 *
 * Both sections are conditional: an install with no legendary figures has no
 * `legendaryFigures` key at all rather than an empty object, and the shipped
 * layout's guards are written against exactly that.
 */
export declare const varRelationshipsKnown: VariableDecl;
export declare const varCurrentDate: VariableDecl;
/**
 * A declaration's `sample`, spread across the keys of its `scope`.
 *
 * Nearly every variable declares a single-key scope named for itself, and its
 * `sample` is that key's value. A declaration with several keys has to supply
 * an object covering them, which is the only reading that lets a variable whose
 * presentation depends on a second value describe itself at all.
 *
 * This lives here rather than in the host because two things need it and they
 * must agree: the preview that renders a layout against the sample, and the
 * check that the sample matches the schema. A convention implemented twice is
 * one that eventually holds in one place and not the other, and the failure
 * would be a preview quietly rendering against `undefined`.
 */
export declare function sampleValues(decl: Pick<VariableDecl, 'scope' | 'sample'>): Record<string, unknown>;
/**
 * Every declared variable whose sample does not match its own schema.
 *
 * Exported rather than left in the test because it is the same check a plugin's
 * variable needs at publish time, and because "the sample is a lie" is a defect
 * an installed plugin can carry just as easily as core can — as core did, in
 * two fields of one declaration, for the entire life of this registry.
 */
export declare function checkVariableSamples(decls?: readonly VariableDecl[]): string[];
