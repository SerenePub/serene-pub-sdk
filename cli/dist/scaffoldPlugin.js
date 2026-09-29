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
 * the frame panel; Battleship for the keyed `ctx.storage` handlers — with the
 * game taken out. **There is no logic in any template.** Every file carries a
 * short `✎ CHANGE:` line saying what to put in its place, because a scaffold
 * that guessed at behaviour would be a scaffold an author has to read before
 * they can delete it.
 *
 * The flags compose. The base is a package that registers one Task and runs it
 * in an executed example; `--genre` adds the genre, its two pipelines, a preset
 * and a shipped prompt row; `--action` adds a contributed action that asks a
 * question and the spec that answers it; `--panel` adds a frame panel;
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
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
/** Where the template tree lives, from `dist/` and from `src/` alike. */
const TEMPLATE_ROOT = join(import.meta.dirname, '..', 'templates', 'plugin');
/** Same rule as `defineExtension` — the namespace every declared id sits under. */
const SLUG = /^[a-z0-9]+([.-][a-z0-9]+)*$/;
/** @experimental */
export class ScaffoldError extends Error {
}
/* ── The template language ──────────────────────────────────────────────── */
/**
 * Three constructs, and deliberately no more: `{{name}}` substitutes a value,
 * `{{#flag}}…{{/flag}}` keeps a section when the flag is on, `{{^flag}}…{{/flag}}`
 * keeps it when the flag is off. Sections nest.
 *
 * A section opener and its closer each eat the newline they sit on when they
 * are alone on their line, so a dropped section leaves no blank line behind and
 * a kept one is not indented by the marker that introduced it.
 */
function render(template, values) {
    const section = /\{\{([#^])([a-zA-Z0-9_]+)\}\}\n?([\s\S]*?)\{\{\/\2\}\}\n?/;
    let out = template;
    // Outermost-first, one pass per section. The backreference is what makes
    // nesting work: scanning finds the outer opener first, and `{{/inner}}` does
    // not close it, so the inner section rides along inside the body — kept with
    // it, dropped with it, and matched on the next pass through the loop.
    while (section.test(out)) {
        out = out.replace(section, (_all, kind, name, body) => {
            const on = !!values[name];
            return (kind === '#') === on ? body : '';
        });
    }
    // An unbalanced marker renders to itself rather than to nothing, which is a
    // scaffold that writes a file nobody can compile and says it succeeded.
    const stray = /\{\{[#^/][a-zA-Z0-9_]*\}\}/.exec(out);
    if (stray)
        throw new ScaffoldError(`template has an unbalanced section marker '${stray[0]}' — every {{#name}} and ` +
            `{{^name}} needs its own {{/name}}`);
    return out.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_all, name) => {
        const value = values[name];
        if (value === undefined)
            throw new ScaffoldError(`template refers to '${name}', which the scaffold does not set`);
        return String(value);
    });
}
/* ── The values every template is rendered against ──────────────────────── */
/** Title Case from a slug segment: `dice-tray` → `Dice Tray`. */
const titleCase = (segment) => segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
/**
 * The ids and names a scaffolded package uses, all derived from the one slug
 * the author gave — so nothing in the tree is a name they have to reconcile.
 * @experimental
 */
export function scaffoldValues(opts) {
    if (!SLUG.test(opts.slug))
        throw new ScaffoldError(`'${opts.slug}' is not a valid plugin slug — lowercase letters, digits, dots and ` +
            `hyphens (e.g. 'chariot.dice-tray'). It is the namespace every id you register ` +
            `must sit under, so the scaffold cannot pick one for you.`);
    const stem = opts.slug.slice(opts.slug.lastIndexOf('.') + 1);
    const camel = stem.replace(/-([a-z0-9])/g, (_a, c) => c.toUpperCase());
    return {
        slug: opts.slug,
        stem,
        /** The identifier the genre is bound to — `dice-tray` → `diceTrayGenre`. */
        genreVar: `${camel}Genre`,
        /** npm names take no dots, and this one has to be typeable. */
        packageName: opts.slug.replace(/\./g, '-'),
        displayName: titleCase(stem),
        genreId: `${opts.slug}:genre/${stem}`,
        createSpecId: `${opts.slug}:spec/create-session`,
        respondSpecId: `${opts.slug}:spec/respond`,
        askSpecId: `${opts.slug}:spec/ask`,
        answerSpecId: `${opts.slug}:spec/answer`,
        exampleSpecId: `${opts.slug}:spec/example`,
        echoDefinitionId: `${opts.slug}:task/echo@1`,
        saveNoteDefinitionId: `${opts.slug}:outlet/save-note@1`,
        readNoteDefinitionId: `${opts.slug}:outlet/read-note@1`,
        askActionKey: 'ask',
        answerActionKey: 'answer',
        /** `<plugin>.<action>`, so a collision with core's slash names is impossible. */
        askSlash: `${opts.slug}.ask`,
        panelId: 'panel',
        panelEntry: 'ui/panel.html',
        presetSlug: stem,
        promptSlug: `${stem}-default`,
        /** 1 MiB: inside the band `permissions.storage.quotaBytes` accepts. */
        quotaBytes: String(1024 * 1024),
        genre: !!opts.genre,
        action: !!opts.action,
        panel: !!opts.panel,
        storage: !!opts.storage,
    };
}
/* ── Which templates a flag brings ──────────────────────────────────────── */
/**
 * The template directories, in the order they are laid down. `base` is always
 * there; each flag adds a directory of whole files beside it. A flag never
 * rewrites a base file — what it changes inside one it changes through a
 * section, so the composition is readable in the template rather than here.
 */
const PARTS = [
    { dir: 'base' },
    { dir: 'genre', when: 'genre' },
    { dir: 'action', when: 'action' },
    { dir: 'panel', when: 'panel' },
    { dir: 'storage', when: 'storage' },
];
const TEMPLATE_SUFFIX = '.tmpl';
/** Every `*.tmpl` under `dir`, as paths relative to it. */
async function templatesIn(dir) {
    const out = [];
    const walk = async (d) => {
        for (const entry of (await readdir(d)).sort()) {
            const full = join(d, entry);
            if ((await stat(full)).isDirectory())
                await walk(full);
            else if (entry.endsWith(TEMPLATE_SUFFIX))
                out.push(relative(dir, full));
        }
    };
    await walk(dir);
    return out;
}
/**
 * The whole package, as text. Pure: writing is {@link writeScaffoldedPlugin}'s,
 * so a caller that wants to show the tree before touching a disk can.
 *
 * A template renders to nothing at all when every one of its sections was
 * dropped — that is how a file belongs to a combination of flags rather than to
 * one — and an empty render is not written.
 * @experimental
 */
export async function scaffoldPlugin(opts) {
    const values = scaffoldValues(opts);
    const files = [];
    for (const part of PARTS) {
        if (part.when && !opts[part.when])
            continue;
        const dir = join(TEMPLATE_ROOT, part.dir);
        for (const name of await templatesIn(dir)) {
            const text = render(await readFile(join(dir, name), 'utf8'), values);
            if (!text.trim())
                continue;
            files.push({
                // `gitignore.tmpl` on disk, `.gitignore` in the package: a
                // dotfile in the template tree is a file npm and git tools
                // treat as theirs.
                path: name
                    .slice(0, -TEMPLATE_SUFFIX.length)
                    .replace(/(^|\/)gitignore$/, '$1.gitignore'),
                text,
            });
        }
    }
    // Codepoint order, not locale order: the list is printed, asserted on and
    // diffed, and `localeCompare` moves with the runtime's ICU data.
    return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
/**
 * Write the package into `dir`.
 *
 * Refuses rather than overwrites, naming every file it would have replaced. A
 * scaffold is the first thing an author runs and the last thing they expect to
 * lose work to, and `--force` is not offered because re-running it over a
 * package you have edited is never the thing you meant.
 * @experimental
 */
export async function writeScaffoldedPlugin(dir, opts) {
    const files = await scaffoldPlugin(opts);
    const root = resolve(dir);
    const clashes = [];
    for (const file of files) {
        try {
            await stat(join(root, file.path));
            clashes.push(file.path);
        }
        catch {
            /* not there, which is what we want */
        }
    }
    if (clashes.length)
        throw new ScaffoldError(`${relative(process.cwd(), root) || '.'} already holds ${clashes.length} of the ` +
            `files this would write:\n` +
            clashes.map((c) => `  · ${c}`).join('\n') +
            `\nScaffold into an empty directory and copy across what you want — a scaffold ` +
            `that overwrote would be one that could take an afternoon's work with it.`);
    for (const file of files) {
        const full = join(root, file.path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, file.text);
    }
    return files;
}
//# sourceMappingURL=scaffoldPlugin.js.map