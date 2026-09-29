/**
 * Template engines are a registry, not a hardcoded choice (F2 — types are open
 * registries, ids namespaced, `core:` reserved).
 *
 * `SlotDecl.engine` used to be the literal `'jinja2'`, which quietly said "there is one
 * template language and core owns it." An extension shipping its own compiler had nowhere
 * to register it, and a template slot had no way to say what it was written in. Now the
 * engine is a versioned id like everything else, and it travels **on the template value**
 * — so two slots in one spec may use different engines.
 *
 * That is safe for a reason worth stating: source templates render *before* Assemble
 * (16 §3b, enforced by port shapes), so only text crosses into allocation. Mixing engines
 * cannot confuse the budget, because the budget never sees a template — it sees rendered
 * blocks and a cost profile.
 *
 * ## The cost profile is why this interface has four members instead of one
 *
 * The budget guarantee (16 §7) is that Assemble's estimate is a **ceiling**: literals are
 * counted exactly, per-iteration literals are counted once and multiplied, conditionals
 * take their largest branch. That is a static analysis of the template, so it can only be
 * done by whoever understands the syntax — the engine.
 *
 * An engine that cannot analyse itself is still legal. It reports `exact: false`, Assemble
 * widens its safety margin, and the receipt records that the estimate was approximate. So
 * a sloppy engine costs its users context headroom rather than correctness — a pressure
 * gradient rather than a ban.
 */
import { type TemplateFinding, type TemplateScope } from "./template.js";
/** @experimental */
export type EngineId = string;
/** What a template slot actually stores: the source **and** what it is written in. @experimental */
export interface TemplateValue {
    engine: EngineId;
    source: string;
}
/** @experimental */
export interface CostProfile {
    /** Tokens contributed by literal text outside any repetition. */
    fixed: number;
    /** Tokens contributed per iteration of the named loop variable. */
    perIteration: Record<string, number>;
    /**
     * False when the engine could not analyse statically and these numbers are a guess.
     * Assemble widens its margin and the receipt says so — the estimate degrades to
     * conservative rather than to wrong (16 §7).
     */
    exact: boolean;
}
/** @experimental */
export interface TemplateEngine {
    id: EngineId;
    /** Human-facing, for the template editor's language picker. */
    label: string;
    render(source: string, scope: Record<string, unknown>): string;
    /** Variables the source references — feeds the editor and publish-time checking (16 §4). */
    extract(source: string): string[];
    /** Publish-time diagnostics against the slot's declared `variables` (13 §7j-a). */
    check(source: string, declared: TemplateScope): TemplateFinding[];
    /**
     * Static token cost, given a tokenizer. Called once per (source, tokenizer) and
     * cached — never per allocation step, or the budget loop has a cliff exactly when
     * a user's context is biggest.
     */
    costProfile(source: string, count: (s: string) => number): CostProfile;
}
/** @experimental */
export declare function defineEngine(e: TemplateEngine): TemplateEngine;
/** @experimental */
export declare const getEngine: (id: EngineId) => TemplateEngine | undefined;
/** @experimental */
export declare const allEngines: () => TemplateEngine[];
/** @experimental */
export declare function _clearEngines(): void;
/** Resolve and render, with an error that names the engine rather than failing obscurely. @experimental */
export declare function renderWith(value: TemplateValue, scope: Record<string, unknown>): string;
/** @experimental */
export declare const jinja2: TemplateEngine;
/**
 * No substitution at all. Useful on its own — a fixed system preamble is a template with
 * no variables — and useful as the reference implementation of an exact cost profile.
 * @experimental
 */
export declare const plain: TemplateEngine;
/**
 * Handlebars — **the engine Serene Pub's context templates are actually written in.**
 *
 * Registered as a declaration rather than an implementation: a template's engine is a
 * datapoint on the slot (12 §2a), and the host supplies the renderer. The SDK ships no
 * Handlebars dependency, so `render` here refuses rather than silently producing
 * something that is not what core would produce — a near-miss renderer is worse than an
 * absent one, because parity would fail in a way that looks like a template bug.
 *
 * The correction this represents is worth stating: the draft assumed Jinja throughout,
 * and every core template in SP is Handlebars with a registered helper set. The
 * template-engine registry is exactly the mechanism that makes that a one-line change
 * rather than a redesign, which is the argument for having built it.
 * @experimental
 */
export declare const handlebars: TemplateEngine;
/**
 * Liquid — core's **second** template engine, added beside Handlebars rather than
 * instead of it.
 *
 * Host-supplied for the same reason Handlebars is: core renders with its own
 * registered tag and filter set (`systemBlock`/`assistantBlock`/`userBlock`, `json`,
 * `jsonValue`, `pad`) under a configuration a second implementation would not
 * reproduce, and a near-miss renderer fails as what reads like a template bug.
 * @experimental
 */
export declare const liquid: TemplateEngine;
/** Sugar so a spec reads `template: jinja(SOURCE)` rather than repeating the id. @experimental */
export declare const templateOf: (engine: TemplateEngine) => (source: string) => TemplateValue;
/** @experimental */
export declare const jinja: (source: string) => TemplateValue;
/** @experimental */
export declare const text: (source: string) => TemplateValue;
//# sourceMappingURL=engines.d.ts.map