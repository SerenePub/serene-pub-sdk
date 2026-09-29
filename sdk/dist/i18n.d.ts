/**
 * Display text (plans/29 R-20; plans/30 U5i) — one type, one check, one
 * resolver.
 *
 * Every string an author writes for a person to read — a definition's name, a
 * slot's description, an action's label, a preset's title, a status — is
 * `I18n`: a bare string or a **locale map**. The two spellings are one value:
 * `title: 'Title'` is `title: { en: 'Title' }` (ruled 2026-09-17, which
 * supersedes 09-B B11's "a bare string is refused"). A bare string reads as
 * `en`, and `en` is the locale every other falls back to.
 *
 * ## Enforced at publish
 *
 * A publish refuses exactly four things, each with a sentence that names the
 * field and says what to write instead:
 *
 *  · a locale map without a string `en`;
 *  · an `en` (or a bare string) that is empty or whitespace;
 *  · any other value — a number, an array, `null`, an object without `en`;
 *  · absence, where the field is required.
 *
 * Every door runs `i18nFindings`: `register()` for a definition and its slots,
 * `genre()` and `envoyFindings`, the attribute slot and sheet doors,
 * `defineScriptKind`, a value declaration, `config()` / `preset()` /
 * `announce.build()`, the widget declarations a shape carries, an action's
 * label, an enabled-when's reason, `validate()` for a stored document, the CLI
 * packager for a manifest, and the executor for a status (a note on the
 * receipt, the status dropped — a status is advisory and never halts a run).
 *
 * ## Exempt by rule
 *
 * Not everything a person reads is display text an author declared. A **slash
 * name** is an id (`/narrate`); a **receipt note** is the executor's record;
 * a form block's `question`, its option labels, a `kv` or `stat` label are the
 * runtime output of a pipeline; **message content** is the user's; a
 * **permission id** is an address. None of these is localised and none is
 * checked here.
 *
 * ## Reading it
 *
 * `i18nText(v, language)` is the one resolver: a bare string is itself; a map
 * answers the requested locale, else `en`. After publish enforcement a
 * malformed value cannot reach a reader, so a malformed value answers
 * `undefined` rather than being patched over — nothing swallows one silently.
 */
/** A locale map: `en` required, any other language code beside it. @public */
export type LocaleMap = {
    en: string;
} & Record<string, string>;
/** Author-facing display text: a bare string (read as `en`) or a locale map. @public */
export type I18n = string | LocaleMap;
/**
 * `I18nText` is the settings vocabulary's spelling of the same type — one
 * definition, two names, so every contract written against either keeps
 * compiling.
 * @experimental
 */
export type I18nText = I18n;
/** Has the value the shape of a locale map — an object, not an array, with a string `en`? @experimental */
export declare const isLocaleMap: (v: unknown) => v is LocaleMap;
/**
 * Is this display text a publish accepts — a non-blank string, or a locale map
 * whose `en` is non-blank? A map with only `fr` is not: `en` is the fallback
 * every other locale rests on.
 * @experimental
 */
export declare const isI18n: (v: unknown) => v is I18n;
/** A bare `en` string is the short spelling of `{ en }`; a map is itself. @internal */
export declare const localeMapOf: (v: I18n) => LocaleMap;
/**
 * Every fault in one display-text value, as sentences that name the field and
 * say what to write instead (the teaching-error pattern, 15 §1.3). Empty when
 * the value is sound, and for an absent optional value; `required` makes
 * absence a finding.
 *
 * `where` is the field's address as the author sees it (`acme:task/roll@1
 * i18n.name`, `contributes.actions[roll].label`), so the sentence can be
 * acted on without a search.
 * @experimental
 */
export declare function i18nFindings(v: unknown, where: string, opts?: {
    required?: boolean;
}): string[];
/**
 * The display text of an `I18n` in `language`: a bare string is itself; a map
 * answers the requested locale, else `en`. A locale the map carries as blank
 * counts as absent — a half-translated map is the normal state of one, and a
 * blank label is never the right answer. `undefined` for a value that is not
 * `I18n` at all: publish enforcement keeps those from a reader, so a reader
 * does not paper over one.
 * @public
 */
export declare function i18nText(v: I18n | undefined, language?: string): string | undefined;
//# sourceMappingURL=i18n.d.ts.map