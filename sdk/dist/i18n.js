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
const blank = (s) => s.trim().length === 0;
/** Has the value the shape of a locale map — an object, not an array, with a string `en`? @experimental */
export const isLocaleMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.en === 'string';
/**
 * Is this display text a publish accepts — a non-blank string, or a locale map
 * whose `en` is non-blank? A map with only `fr` is not: `en` is the fallback
 * every other locale rests on.
 * @experimental
 */
export const isI18n = (v) => typeof v === 'string' ? !blank(v) : isLocaleMap(v) && !blank(v.en);
/** A bare `en` string is the short spelling of `{ en }`; a map is itself. @internal */
export const localeMapOf = (v) => (typeof v === 'string' ? { en: v } : v);
/** What the author wrote, named for the sentence — never the value itself, which may be long. */
const describe = (v) => {
    if (v === null)
        return 'null';
    if (Array.isArray(v))
        return 'an array';
    if (typeof v === 'object')
        return "an object without 'en'";
    return `a ${typeof v}`;
};
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
export function i18nFindings(v, where, opts = {}) {
    if (v === undefined) {
        return opts.required
            ? [
                `${where} is required — display text, a string ('Title') or a locale map with ` +
                    `'en' ({ en: 'Title', fr: 'Titre' }) (R-20)`,
            ]
            : [];
    }
    if (typeof v === 'string') {
        return blank(v)
            ? [`${where} is empty — give it text a person reads, 'Title' or { en: 'Title' } (R-20)`]
            : [];
    }
    if (isLocaleMap(v)) {
        return blank(v.en)
            ? [
                `${where}.en is empty — 'en' is the text every other locale falls back to; ` +
                    `write { en: 'Title' } (R-20)`,
            ]
            : [];
    }
    return [
        `${where}: a locale map with a required 'en' (R-20) — got ${describe(v)}; write ` +
            `'Title' or { en: 'Title', fr: 'Titre' }`,
    ];
}
/**
 * The display text of an `I18n` in `language`: a bare string is itself; a map
 * answers the requested locale, else `en`. A locale the map carries as blank
 * counts as absent — a half-translated map is the normal state of one, and a
 * blank label is never the right answer. `undefined` for a value that is not
 * `I18n` at all: publish enforcement keeps those from a reader, so a reader
 * does not paper over one.
 * @public
 */
export function i18nText(v, language = 'en') {
    if (typeof v === 'string')
        return v;
    if (!isLocaleMap(v))
        return undefined;
    const wanted = v[language];
    return typeof wanted === 'string' && !blank(wanted) ? wanted : v.en;
}
//# sourceMappingURL=i18n.js.map