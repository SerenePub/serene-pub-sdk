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
import { type ScopeValues, type TemplateScope, type VarField, type VarValue } from './template.js';
/** `core:var/characters@1` — namespaced and versioned like every other id. @experimental */
export type VariableId = string;
/** @experimental */
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
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
/**
 * What a declaration's `sample` must be, from its `scope` (typed templates P1).
 *
 * One root — the usual case, `{ worldLore: … }` — and the sample is that
 * root's value; several, and it is an object covering them (`sampleValues`).
 * A scope the compiler cannot see into (`TemplateScope` itself, a widened
 * `VarField`) leaves the sample `unknown`, exactly as before.
 * @experimental
 */
export type VariableSample<S extends TemplateScope> = string extends keyof S ? unknown : true extends IsUnion<keyof S> ? ScopeValues<S> : VarValue<S[keyof S]>;
/**
 * A variable declaration whose `sample` is checked against its `scope` by the
 * compiler — what `defineVariable` and `definePluginVariable` take.
 * @experimental
 */
export type TypedVariableDecl<S extends TemplateScope> = Omit<VariableDecl, 'scope' | 'sample'> & {
    scope: S;
    sample: VariableSample<S>;
};
/**
 * Register a variable declaration.
 *
 * Two refusals, both the same rule the engine and renderer registries enforce:
 * an id has exactly one owner, and `core:` is not for the taking. A plugin that
 * could redefine `core:var/characters@1` would change how characters render in
 * every pipeline on the instance without appearing in a single spec — invisible
 * in exactly the way a prompt change is not.
 * @experimental
 */
export declare function defineVariable<S extends TemplateScope>(decl: TypedVariableDecl<S>): VariableDecl & {
    scope: S;
};
/**
 * The plugin-facing door. Same registration, minus the ability to claim core's
 * namespace — checked here rather than in `defineVariable` so core's own
 * declarations do not have to argue their way past their own guard.
 * @experimental
 */
export declare function definePluginVariable<S extends TemplateScope>(pluginId: string, decl: TypedVariableDecl<S>): VariableDecl & {
    scope: S;
};
/** @internal */
export declare const getVariable: (id: VariableId) => VariableDecl | undefined;
/** @internal */
export declare const allVariables: () => VariableDecl[];
/** @internal */
export declare function _clearVariables(): void;
/**
 * Take one variable back out of the registry — a HOST's door, for a plugin's
 * variables it registered from a stored manifest and withdraws on uninstall
 * (the way `_withdrawGenre` serves a plugin's genres). Refuses `core:` ids: core's
 * variables are this build's, and nothing a plugin's lifecycle does removes them.
 * @internal
 */
export declare function _withdrawVariable(id: VariableId): boolean;
/**
 * What is wrong with a package's variable list, one sentence each — the check
 * `defineExtension`, the packager and a host's install share (typed templates,
 * 2026-09-27). Every id sits under the package's own namespace: `core:` is
 * reserved and another package's namespace is theirs (F2). A list naming one
 * id twice with different content is refused — an id means one thing.
 * @experimental
 */
export declare function pluginVariableFindings(slug: string, raw: unknown, at?: string): string[];
/** @experimental */
export declare const varInstructions: VariableDecl & {
    scope: {
        instructions: {
            type: "string";
        };
    };
};
/** @experimental */
export declare const varCharacters: VariableDecl & {
    scope: {
        characters: {
            type: "list";
            of: VarField;
        };
    };
};
/** @experimental */
export declare const varPersonas: VariableDecl & {
    scope: {
        personas: {
            type: "list";
            of: {
                type: "object";
                fields: {
                    name: {
                        type: "string";
                    };
                    description: {
                        type: "string";
                        optional: true;
                    };
                };
            };
        };
    };
};
/** @experimental */
export declare const varScenario: VariableDecl & {
    scope: {
        scenario: {
            type: "string";
        };
    };
};
/** @experimental */
export declare const varExampleDialogue: VariableDecl & {
    scope: {
        exampleDialogue: {
            type: "string";
        };
    };
};
/** @experimental */
export declare const varPostHistoryInstructions: VariableDecl & {
    scope: {
        postHistoryInstructions: {
            type: "string";
        };
    };
};
/** @experimental */
export declare const varCharacterNames: VariableDecl & {
    scope: {
        characterNames: {
            type: "string";
        };
    };
};
/** @experimental */
export declare const varPersonaNames: VariableDecl & {
    scope: {
        personaNames: {
            type: "string";
        };
    };
};
/** @experimental */
export declare const varWorldLore: VariableDecl & {
    scope: {
        worldLore: {
            type: "record";
            of: {
                type: "string";
            };
        };
    };
};
/** @experimental */
export declare const varHistory: VariableDecl & {
    scope: {
        history: {
            type: "record";
            of: {
                type: "string";
            };
        };
    };
};
/**
 * Documentation excerpts retrieved for the latest question — the band
 * `core:query/docs-search@1` publishes (the guide genre's retrieval; declared
 * 2026-09-27). Its own band, not `worldLore`: an excerpt is the app's manual,
 * not a fact about a story's world, and a template has to be able to frame it
 * as the one source of truth about the app — and to say so when it is empty.
 *
 * Keyed by "Page › Section"; each value begins with the page's path
 * (`Path: /docs/<slug>#<anchor>`), so the address a reply cites is the one
 * the compiled docs actually serve.
 * @experimental
 */
export declare const varDocsExcerpts: VariableDecl & {
    scope: {
        docsExcerpts: {
            type: "record";
            of: {
                type: "string";
            };
        };
    };
};
/**
 * Recalled lines — older transcript lines found again because they name what
 * the current context names: the band `core:query/entity-search@1` publishes
 * on its `messages` out-port (declared 2026-09-27, owner ruling option b).
 *
 * Its own band, not `messages`: the transcript renders from the recent
 * window (`sessionMessages`), so a recalled line in the transcript's band was
 * budgeted and then rendered nowhere. As a declared band a template places it
 * where it belongs — `{{{recalledLines}}}` — per genre; nothing places it
 * automatically.
 *
 * One entry per line, oldest first. `turn` is the line's 1-based position in
 * its channel's visible transcript, so "turn 12" is the twelfth message a
 * reader of that channel would count; `speaker` is named by the same chain
 * that names the transcript's own lines.
 *
 * Not *recall* the measurement (precision/recall): a **recalled line** is a
 * line, and the qualifier is what keeps the two apart (R3).
 * @experimental
 */
export declare const varRecalledLines: VariableDecl & {
    scope: {
        recalledLines: {
            type: "list";
            of: {
                type: "object";
                fields: {
                    speaker: {
                        type: "string";
                        description: {
                            en: string;
                        };
                    };
                    turn: {
                        type: "number";
                        description: {
                            en: string;
                        };
                    };
                    text: {
                        type: "string";
                        description: {
                            en: string;
                        };
                    };
                };
            };
        };
    };
};
/**
 * Lore bound to a cast member that fit the budget — Assemble's
 * `characterLore`, one entry per admitted row in the order they were ranked.
 *
 * Privacy is decided before this: the lore read gives a speaker only the
 * entries that speaker may see (`core:policy/binding-visibility@1`) — their
 * own and the personas'; for the narrator, the background members' and the
 * entries bound to nobody. A template renders it where it wants it,
 * typically beside the character cards.
 * @experimental
 */
export declare const varCharacterLore: VariableDecl & {
    scope: {
        characterLore: {
            type: "list";
            of: VarField;
        };
    };
};
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
 * @experimental
 */
export declare const varRelationshipsPerspectives: VariableDecl & {
    scope: {
        relationshipsPerspectives: {
            type: import("./template.js").VarType;
            fields?: Record<string, VarField>;
            of?: VarField;
            optional?: boolean;
            description: {
                en: string;
            };
        };
    };
};
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
 * @experimental
 */
export declare const varRelationshipsKnown: VariableDecl & {
    scope: {
        relationshipsKnown: {
            type: "object";
            fields: {
                howOthersRegardYou: {
                    type: import("./template.js").VarType;
                    fields?: Record<string, VarField>;
                    of?: VarField;
                    optional: true;
                    description: {
                        en: string;
                    };
                };
                legendaryFigures: {
                    type: "record";
                    optional: true;
                    description: {
                        en: string;
                    };
                    of: {
                        type: "object";
                        fields: {
                            summary: {
                                type: "string";
                                optional: true;
                            };
                            state: {
                                type: "string";
                                optional: true;
                            };
                            relationships: {
                                type: import("./template.js").VarType;
                                description?: I18n;
                                fields?: Record<string, VarField>;
                                of?: VarField;
                                optional: true;
                            };
                        };
                    };
                };
            };
        };
    };
};
/** @experimental */
export declare const varCurrentDate: VariableDecl & {
    scope: {
        currentDate: {
            type: "object";
            fields: {
                year: {
                    type: "number";
                    description: {
                        en: string;
                    };
                };
                month: {
                    type: "number";
                    optional: true;
                    description: {
                        en: string;
                    };
                };
                day: {
                    type: "number";
                    optional: true;
                    description: {
                        en: string;
                    };
                };
                hour: {
                    type: "number";
                    optional: true;
                    description: {
                        en: string;
                    };
                };
                minute: {
                    type: "number";
                    optional: true;
                    description: {
                        en: string;
                    };
                };
                label: {
                    type: "string";
                    optional: true;
                    description: {
                        en: string;
                    };
                };
            };
        };
    };
};
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
 * @internal
 */
export declare function sampleValues(decl: Pick<VariableDecl, 'scope' | 'sample'>): Record<string, unknown>;
/**
 * Every declared variable whose sample does not match its own schema.
 *
 * Exported rather than left in the test because it is the same check a plugin's
 * variable needs at publish time, and because "the sample is a lie" is a defect
 * an installed plugin can carry just as easily as core can — as core did, in
 * two fields of one declaration, for the entire life of this registry.
 * @experimental
 */
export declare function checkVariableSamples(decls?: readonly VariableDecl[]): string[];
export {};
//# sourceMappingURL=variables.d.ts.map