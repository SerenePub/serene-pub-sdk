/**
 * `scaffold plugin` (24 §7, D-5) — the whole package, deleted down.
 *
 * `scaffold config` and `scaffold preset` print one file: the space an author
 * is about to write into, commented, ready to delete down to the four lines
 * they mean. This does the same thing one level up. It writes a **complete,
 * buildable package** on the unified declaration (D-1): one `defineExtension`
 * carrying the code half (node definitions and the handlers behind them) and
 * the declaration half (genres, pipelines, presets, prompts, surfaces,
 * permissions), one default export, one `serene-pub build`.
 *
 * Everything it writes is drawn from the two showcase plugins — Twenty
 * Questions for the genre, the create/reply pair, the contributed action and
 * the Tally panel; Battleship for the keyed `ctx.storage` handlers — with the
 * game taken out. **There is no logic in any template.** Every file carries a
 * short `✎ CHANGE:` line saying what to put in its place, because a scaffold
 * that guessed at behaviour would be a scaffold an author has to read before
 * they can delete it.
 *
 * The flags compose. The base is a package that registers one Task and runs it
 * in an executed example; `--genre` adds the genre, its two pipelines, a preset
 * and a shipped prompt row; `--action` adds a contributed action that asks a
 * question and the spec that answers it; `--panel` adds a panel widget (a
 * component holding one document as an `sp-frame`);
 * `--storage` adds a keyed store and the grant it needs. Each flag adds files
 * and fields and takes nothing away, so any combination is a package that
 * passes `serene-pub check` with no findings and `serene-pub build` without a
 * refusal.
 *
 * The templates are **files on disk** (`cli/templates/plugin/…`) rather than
 * strings in this module, for the same reason the scaffolds print rather than
 * generate: a template an author can open, read and copy by hand is a template
 * they can correct. See {@link render} for the three constructs they use.
 */
/** @experimental What the author asked for. */
export interface ScaffoldPluginOptions {
    /** `vendor.name` — validated on the same terms `defineExtension` validates it. */
    slug: string;
    /** A genre, its create and reply pipelines, a preset and one prompt row. */
    genre?: boolean;
    /** A contributed action that asks a question, and the spec that answers it. */
    action?: boolean;
    /** A panel widget: a component placing one document (`sp-frame`), its script file, protocol 2. */
    panel?: boolean;
    /** A keyed `ctx.storage` handler pair and the grant it declares. */
    storage?: boolean;
}
/** @experimental One file the scaffold would write: a path relative to the package root, and its text. */
export interface ScaffoldedFile {
    path: string;
    text: string;
}
/** @experimental */
export declare class ScaffoldError extends Error {
}
/**
 * The ids and names a scaffolded package uses, all derived from the one slug
 * the author gave — so nothing in the tree is a name they have to reconcile.
 * @experimental
 */
export declare function scaffoldValues(opts: ScaffoldPluginOptions): Record<string, string | boolean>;
/**
 * The whole package, as text. Pure: writing is {@link writeScaffoldedPlugin}'s,
 * so a caller that wants to show the tree before touching a disk can.
 *
 * A template renders to nothing at all when every one of its sections was
 * dropped — that is how a file belongs to a combination of flags rather than to
 * one — and an empty render is not written.
 * @experimental
 */
export declare function scaffoldPlugin(opts: ScaffoldPluginOptions): Promise<ScaffoldedFile[]>;
/**
 * Write the package into `dir`.
 *
 * Refuses rather than overwrites, naming every file it would have replaced. A
 * scaffold is the first thing an author runs and the last thing they expect to
 * lose work to, and `--force` is not offered because re-running it over a
 * package you have edited is never the thing you meant.
 * @experimental
 */
export declare function writeScaffoldedPlugin(dir: string, opts: ScaffoldPluginOptions): Promise<ScaffoldedFile[]>;
//# sourceMappingURL=scaffoldPlugin.d.ts.map