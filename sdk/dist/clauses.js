/**
 * A gather clause's execution mode, as a setting rather than only an authoring
 * choice (R-14: `mode` is a setting, the construct is the clause).
 *
 * `gather` chains are declared `parallel` or `sequential` by whoever wrote the
 * spec, and until now that was the end of it. But the right answer is not a
 * property of the pipeline — it is a property of the machine it runs on and the
 * provider it talks to. Four reads that overlap happily against a local
 * database may want to be sequential against a rate-limited remote one, and the
 * person who knows that is the administrator, not the author.
 *
 * So the author's declaration becomes the default and the user's setting wins,
 * on exactly the terms `review` already uses (see `resolvePosition`): same
 * `settings` slot, same precedence, same refusal to let an author forbid the
 * override.
 */
/** @experimental */
export const CLAUSE_MODES = ['parallel', 'sequential'];
/**
 * What the panel renders for a gather clause, declared here rather than written
 * in the client.
 *
 * A clause is not a node definition, so it has no descriptor to carry its wording —
 * which would leave the one string on that control invented by whichever screen
 * drew it. Naming it here keeps the rule that every label comes from the SDK,
 * and means a host and a plugin's tooling say the same thing.
 * @experimental
 */
export const CLAUSE_MODE_DECL = {
    path: 'mode',
    i18n: { en: 'Run' },
    description: {
        en: 'Whether the steps in this group run at the same time or one after another. Running together is faster; one at a time is gentler on a rate-limited provider.',
    },
    of: CLAUSE_MODES,
};
/** The author's declaration is the default; the user's setting wins. @experimental */
export function resolveClauseMode(authorDefault, userSetting) {
    if (typeof userSetting === 'string' && CLAUSE_MODES.includes(userSetting))
        return userSetting;
    return authorDefault === 'sequential' ? 'sequential' : 'parallel';
}
//# sourceMappingURL=clauses.js.map