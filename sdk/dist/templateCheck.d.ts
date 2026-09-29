/**
 * The one template checker (typed templates P4): does this Handlebars or
 * Liquid source parse, and does every name it reads exist in the scope it will
 * be rendered against?
 *
 * ## Why a separate entry point
 *
 * `@serene-pub/sdk/template-check`, not the barrel. The checker parses with
 * the real engines — `handlebars` and `liquidjs`, parse only (Q5) — and the
 * barrel is what every node author and plugin bundle imports; it has no
 * dependencies and stays that way. A host (the editor lint, a save, a
 * packager) imports this on purpose. Nothing here renders: the host keeps its
 * own engines with its own helpers, and hands this module their NAMES.
 *
 * ## What it reports, and what it leaves alone
 *
 * - **syntax** — the engine's own words and position. Always an error: a
 *   template that does not parse breaks every pipeline that selects it.
 * - **unknown-name** — a root the scope does not have. Renders as nothing.
 * - **unknown-path** — a field the declared type positively contradicts
 *   (`characters.nmae`, a field read straight off a list).
 * - **unknown-helper** — a Handlebars helper nobody registered.
 *
 * Conservative by construction: an `'any'` root, a record's author-chosen
 * key, a dynamic lookup (`lookup`, `a[k]`) and a subexpression's result are
 * unchecked, never guessed. Loop items, `{% assign %}`/`{% capture %}`
 * locals, `@data` and `forloop` are never scope names.
 *
 * **Untyped sources.** When `templateScopeReport().untyped` is non-empty some
 * producer supplies keys nobody declared, so a name missing from the scope may
 * still arrive: name and path findings are then WARNINGS, never errors, and
 * say which producer might supply them.
 * @experimental
 */
import type { TemplateCheckOptions, TemplateFinding, TemplateSourceCheck, TemplateScope } from './template.js';
export type { TemplateCheckOptions, TemplateFinding, TemplateFindingKind, TemplateSourceCheck, } from './template.js';
/**
 * Helpers Handlebars itself registers. A host's own (`json`, `isSet`, …) are
 * an input — {@link TemplateCheckOptions.helpers} — never hard-coded here.
 * @experimental
 */
export declare const HANDLEBARS_BUILTIN_HELPERS: readonly string[];
/** Whether {@link checkTemplateSource} can say anything about this engine. @experimental */
export declare const canCheckTemplateEngine: (engine: string) => boolean;
/**
 * Check `src` in `engine` against `scope`. The findings only — see
 * {@link checkTemplateSourceReport} for whether anything was checked at all.
 * @experimental
 */
export declare function checkTemplateSource(engine: string, src: string, scope: TemplateScope, options?: TemplateCheckOptions): TemplateFinding[];
/**
 * Check `src` in `engine` against `scope`, and say whether it was checked.
 *
 * A syntax finding short-circuits: nothing useful can be said about the names
 * in a template that does not parse, and saying it anyway buries the one
 * message that matters. Each finding is reported once per place it appears.
 * @experimental
 */
export declare function checkTemplateSourceReport(engine: string, src: string, scope: TemplateScope, options?: TemplateCheckOptions): TemplateSourceCheck;
//# sourceMappingURL=templateCheck.d.ts.map