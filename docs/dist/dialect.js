/**
 * The dialect: everything a Serene Pub docs page may say beyond CommonMark,
 * plus the pure helpers the app and the compiler have to agree on.
 *
 * `slugifyHeading` and the one-argument `rewriteDocHref` are shared with the
 * app, which computes the same anchors for the same pages. This file is the
 * one that decides what they are, and it is not the place to have a better
 * idea about slugs: readers have bookmarked them.
 *
 * Rendering is deliberately a lex → resolve → parse sandwich rather than
 * marked's `async: true` walk: one token tree means the previews, the heading
 * ids and the emitted HTML are all read off the same lex, and an image's
 * converted asset can simply be hung on its token.
 */
import { posix } from 'node:path';
import GithubSlugger from 'github-slugger';
import { Marked } from 'marked';
import { escapeHtml } from './escape.js';
/** Re-exported: it was this module's export first, and every caller names it here. */
export { escapeHtml };
const ADMONITION_KINDS = ['note', 'tip', 'warning'];
/** Anything with a scheme, a root, a protocol-relative host, or a bare anchor. */
const PASSTHROUGH_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;
const MD_HREF = /^([^#?]*\.md)(#.*)?$/i;
/** A bare `#anchor`: a link to a heading on the page that wrote it. */
const SELF_ANCHOR_HREF = /^#(.+)$/;
/** The slug the page being rendered compiles to — `collectPages`' rule. */
function pageSlug(ctx) {
    const bare = (ctx.path || '').replace(/\.md$/i, '');
    return ctx.prefix ? `${ctx.prefix}/${bare}` : bare;
}
/**
 * GitHub's heading-slug rule, via `github-slugger`.
 *
 * Not a choice about slugs so much as an admission of where the corpus comes
 * from: the guides lived on GitHub for a year and link each other with the
 * anchors GitHub gave them (`#portable--self-contained-setup`,
 * `#serene_pub_data_dir-is-the-one-exception`), and TypeDoc's markdown emits
 * the same shape (`#slot_value`, `#band_order`). Any other rule makes those
 * dead on arrival.
 *
 * It lowercases, drops the punctuation GitHub drops — `_` and `-` are not
 * punctuation to it, which is the whole of the `SERENE_PUB_DATA_DIR` case —
 * and turns EACH space into a `-`, so an `&` removed from between two spaces
 * leaves two: `Prompt Configs & Summarization Config` becomes
 * `prompt-configs--summarization-config`.
 *
 * This is the stateless single-heading form — a fresh slugger per call, so
 * nothing de-duplicates across calls. A page renders through ONE slugger (see
 * `renderMarkdown`), which is where the `-1`, `-2` suffixes come from.
 *
 * Nothing is trimmed or otherwise tidied on the way in. Heading text reaches
 * this already trimmed by the lexer, and normalisation GitHub does not do is a
 * slug GitHub's readers do not have.
 */
export function slugifyHeading(text) {
    return new GithubSlugger().slug(text);
}
/** The app's, character for character. Used for descriptions and previews. */
export function stripInlineMarkdown(text) {
    return text
        .replace(/`([^`]*)`/g, '$1')
        .replace(/[*_~]/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/#/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Cuts already-stripped text to at most `limit` chars, ellipsis included, at
 * the last word boundary at or before the limit — never mid-word. Falls back
 * to a hard cut when the text has no whitespace to break on. Trailing
 * punctuation left dangling by the cut is trimmed before the ellipsis lands.
 */
function truncateAtWord(text, limit) {
    if (text.length <= limit)
        return text;
    const budget = limit - 1;
    let cut = text.slice(0, budget);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 0)
        cut = cut.slice(0, lastSpace);
    cut = cut.replace(/[\s,;:—-]+$/, '');
    return `${cut}…`;
}
/**
 * Where a relative `.md` link lands, given the page that wrote it. Returns
 * null for anchor-only, offsite and non-markdown hrefs — those pass through
 * untouched, and are never validated.
 */
export function resolveDocLink(href, ctx) {
    if (!href || PASSTHROUGH_HREF.test(href))
        return null;
    const parts = MD_HREF.exec(href);
    if (!parts)
        return null;
    const dir = posix.dirname(ctx.path || '.');
    const rel = parts[1];
    const target = posix.normalize(dir === '.' || dir === '' ? rel : `${dir}/${rel}`);
    const bare = target.replace(/\.md$/i, '');
    const slug = ctx.prefix ? `${ctx.prefix}/${bare}` : bare;
    const anchor = (parts[2] ?? '').replace(/^#/, '');
    const linkBase = (ctx.linkBase ?? '/docs').replace(/\/+$/, '');
    return { slug, anchor, href: `${linkBase}/${slug}${anchor ? `#${anchor}` : ''}` };
}
/**
 * Rewrites a relative markdown link into the route it maps to.
 *
 * With no context this is the app's original one-argument function, kept
 * because the app still calls it that way: flat slugs only, `/docs` hardcoded.
 * With a context it understands nested paths and a source prefix, which is
 * what a catalog page linking `pipelines/core_spec_respond.md` needs.
 */
export function rewriteDocHref(href, ctx) {
    if (!ctx) {
        const match = href.match(/^\.?\/?([a-z0-9-]+)\.md(#.*)?$/i);
        if (match)
            return `/docs/${match[1]}${match[2] ?? ''}`;
        return href;
    }
    return resolveDocLink(href, ctx)?.href ?? href;
}
const IMAGE_BODY = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\{w=(\d+)\})?/;
const BLOCK_IMAGE = new RegExp(`^${IMAGE_BODY.source}[ \\t]*(?:\\n{2,}|\\n?$)`);
const INLINE_IMAGE = new RegExp(`^${IMAGE_BODY.source}`);
const ADMONITION = new RegExp(`^:::(${ADMONITION_KINDS.join('|')})[ \\t]*([^\\n]*)\\n([\\s\\S]*?)\\n?:::[ \\t]*(?:\\n+|$)`);
function imageToken(match, type) {
    return {
        type,
        raw: match[0],
        caption: match[1] ?? '',
        href: match[2] ?? '',
        maxWidth: match[3] ? Number(match[3]) : undefined,
    };
}
function imgTag(token, assetsBase) {
    const alt = escapeHtml(token.caption);
    const src = token.asset ? `${assetsBase.replace(/\/+$/, '')}/${token.asset.file}` : token.href;
    const dims = token.asset && token.asset.width && token.asset.height
        ? ` width="${token.asset.width}" height="${token.asset.height}"`
        : '';
    return `<img src="${escapeHtml(src)}" alt="${alt}"${dims} loading="lazy" decoding="async">`;
}
/**
 * Markdown → the article body, with everything the compile needs to check
 * itself read off the same token tree.
 */
export async function renderMarkdown(markdown, opts) {
    const headings = [];
    const links = [];
    const images = [];
    const pipelines = [];
    const assetsBase = opts.assetsBase ?? '';
    const slugger = new GithubSlugger();
    const marked = new Marked({
        gfm: true,
        extensions: [
            {
                name: 'docAdmonition',
                level: 'block',
                start(src) {
                    return src.match(/^:::/m)?.index;
                },
                tokenizer(src) {
                    const match = ADMONITION.exec(src);
                    if (!match)
                        return undefined;
                    return {
                        type: 'docAdmonition',
                        raw: match[0],
                        kind: match[1],
                        title: (match[2] ?? '').trim(),
                        tokens: this.lexer.blockTokens(match[3] ?? ''),
                    };
                },
                renderer(token) {
                    const kind = token.kind;
                    const title = token.title || kind.charAt(0).toUpperCase() + kind.slice(1);
                    const body = this.parser.parse(token.tokens);
                    return (`<aside class="doc-admonition doc-admonition-${kind}" role="note">` +
                        `<p class="doc-admonition-title">${escapeHtml(title)}</p>${body}</aside>\n`);
                },
            },
            {
                name: 'docFigure',
                level: 'block',
                start(src) {
                    return src.match(/^!\[/m)?.index;
                },
                tokenizer(_src) {
                    const match = BLOCK_IMAGE.exec(_src);
                    return match ? imageToken(match, 'docFigure') : undefined;
                },
                renderer(token) {
                    const image = token;
                    const style = image.maxWidth ? ` style="max-width:${image.maxWidth}px"` : '';
                    const caption = image.caption
                        ? `<figcaption>${escapeHtml(image.caption)}</figcaption>`
                        : '';
                    return (`<figure class="doc-figure"${style}>` +
                        `${imgTag(image, assetsBase)}${caption}</figure>\n`);
                },
            },
            {
                name: 'docImage',
                level: 'inline',
                start(src) {
                    const at = src.indexOf('![');
                    return at < 0 ? undefined : at;
                },
                tokenizer(src) {
                    const match = INLINE_IMAGE.exec(src);
                    return match ? imageToken(match, 'docImage') : undefined;
                },
                renderer(token) {
                    return imgTag(token, assetsBase);
                },
            },
        ],
        renderer: {
            heading({ tokens, depth, text }) {
                // The id is GitHub's slug of the heading text, and the page's own
                // slugger is what makes a repeated heading `-1`, `-2` — exactly as
                // GitHub numbers them. The text shown in "On this page" and in
                // search results is a different audience and gets the inline
                // markdown stripped instead.
                const id = slugger.slug(text);
                headings.push({ id, text: stripInlineMarkdown(text), depth });
                const inner = this.parser.parseInline(tokens);
                return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
            },
            link({ href, title, tokens }) {
                const text = this.parser.parseInline(tokens);
                const resolved = resolveDocLink(href, opts);
                if (resolved) {
                    links.push({ href, slug: resolved.slug, anchor: resolved.anchor });
                }
                else {
                    // A bare `#anchor` is not rewritten — it is already the href a
                    // reader needs — but it still names a heading id, and a heading
                    // that got retitled is the same dead link as any other. Its
                    // target page is the one that wrote it.
                    const anchor = SELF_ANCHOR_HREF.exec(href)?.[1];
                    if (anchor)
                        links.push({ href, slug: pageSlug(opts), anchor });
                }
                const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
                return `<a href="${escapeHtml(resolved?.href ?? href)}"${titleAttr}>${text}</a>`;
            },
            code(token) {
                const { text, lang } = token;
                const info = infoWords(lang);
                // The graph was laid out before the parse; all that is left
                // here is to drop it in where its fence stood.
                if (info[0] === 'pipeline') {
                    const figure = token.docGraph;
                    return figure ? figure + '\n' : `<pre><code>${escapeHtml(text)}</code></pre>\n`;
                }
                const playground = info[0] === 'playground';
                const language = (playground ? info[1] : info[0]) ?? (playground ? 'ts' : '');
                const highlighted = language ? (opts.highlight?.(text, language) ?? null) : null;
                const block = highlighted ?? `<pre><code>${escapeHtml(text)}</code></pre>`;
                if (!playground)
                    return block + '\n';
                // The fence's own text, carried beside the highlighted markup
                // for the host to read back out of `textContent`. Shiki's
                // output is spans and entities — recoverable in principle,
                // wrong in practice the first time a fence contains something
                // the highlighter styled — so the source travels as source.
                //
                // `type="text/plain"` is inert: nothing executes, and nothing
                // in it is a tag. It is HTML-escaped, so the reader on the
                // other side unescapes; the second replace is the guard that
                // matters if `escapeHtml`'s policy ever narrows, because a
                // literal `</script` in a fence body would otherwise close
                // this element and spill the rest of the example into the page.
                const source = escapeHtml(text).replace(/<\/script/gi, '<\\/script');
                return (`<div class="doc-playground" data-playground data-lang="${escapeHtml(language)}">` +
                    `<script type="text/plain" class="doc-playground-source">${source}</script>` +
                    `${block}</div>\n`);
            },
            // A GFM table can run wider than a narrow screen; the wrapper is
            // what the consumer hangs `overflow-x: auto` on. The table markup
            // itself is exactly what marked's own default renderer produces.
            table(token) {
                let header = '';
                let cell = '';
                for (let j = 0; j < token.header.length; j++)
                    cell += this.tablecell(token.header[j]);
                header += this.tablerow({ text: cell });
                let body = '';
                for (let j = 0; j < token.rows.length; j++) {
                    const row = token.rows[j];
                    cell = '';
                    for (let k = 0; k < row.length; k++)
                        cell += this.tablecell(row[k]);
                    body += this.tablerow({ text: cell });
                }
                if (body)
                    body = `<tbody>${body}</tbody>`;
                return (`<div class="doc-table">\n<table>\n<thead>\n${header}</thead>\n${body}</table>\n` +
                    `</div>\n`);
            },
        },
    });
    const tokens = marked.lexer(markdown);
    const imageTokens = [];
    collectImages(tokens, imageTokens);
    for (const token of imageTokens)
        images.push(token.href);
    if (opts.resolveImage) {
        await Promise.all(imageTokens.map(async (token) => {
            token.asset = await opts.resolveImage(token.href);
        }));
    }
    const fenceTokens = [];
    collectPipelineFences(tokens, fenceTokens);
    for (const token of fenceTokens)
        pipelines.push(pipelineIdOf(token.lang));
    if (opts.resolvePipeline) {
        await Promise.all(fenceTokens.map(async (token) => {
            token.docGraph = await opts.resolvePipeline(pipelineIdOf(token.lang));
        }));
    }
    const previews = extractPreviews(tokens);
    const body = marked.parser(tokens);
    const banner = opts.banner
        ? `<aside class="doc-banner" role="note">${escapeHtml(opts.banner)}</aside>\n`
        : '';
    return {
        html: banner + body,
        headings,
        previews,
        links,
        images,
        pipelines,
        title: headings.find((h) => h.depth === 1)?.text,
        description: firstParagraph(markdown),
    };
}
/** Containers a heading can legitimately hide inside. */
const DESCENDS_INTO = new Set(['blockquote', 'docAdmonition']);
/** Tokens that contribute nothing a reader would want to see in a search hit. */
const PREVIEW_SKIPS = new Set(['space', 'hr', 'code', 'docFigure']);
/** A fence's info string, as words: ` ```pipeline core:spec/respond ` → two. */
function infoWords(lang) {
    return String(lang ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}
/** The id a `pipeline` fence names — '' when it names none. */
function pipelineIdOf(lang) {
    return infoWords(lang)[1] ?? '';
}
/**
 * Every `pipeline` fence, in document order. A fence can sit inside a list
 * item or a blockquote, so this walks the tree rather than the top level —
 * the same reach `collectImages` has, for the same reason.
 */
function collectPipelineFences(tokens, out) {
    for (const token of tokens) {
        if (!token)
            continue;
        if (token.type === 'code' && infoWords(token.lang)[0] === 'pipeline')
            out.push(token);
        if (Array.isArray(token.tokens))
            collectPipelineFences(token.tokens, out);
        if (Array.isArray(token.items))
            collectPipelineFences(token.items, out);
    }
}
function collectImages(tokens, out) {
    for (const token of tokens) {
        if (!token)
            continue;
        if (token.type === 'docFigure' || token.type === 'docImage')
            out.push(token);
        if (Array.isArray(token.tokens))
            collectImages(token.tokens, out);
        if (Array.isArray(token.items))
            collectImages(token.items, out);
        if (Array.isArray(token.header))
            collectImages(token.header, out);
        if (Array.isArray(token.rows))
            for (const row of token.rows)
                collectImages(row, out);
    }
}
/**
 * The body under each heading, ≤180 chars, keyed by the id that heading will
 * get. Read off the same token tree the HTML is rendered from, so a `#` inside
 * a fenced block cannot invent a section the page does not have — which is the
 * failure the app's line-regex version has.
 */
function extractPreviews(tokens) {
    const flat = [];
    const walk = (list) => {
        for (const token of list) {
            if (!token)
                continue;
            if (token.type === 'heading') {
                flat.push({ heading: true, text: token.text });
            }
            else if (DESCENDS_INTO.has(token.type) && Array.isArray(token.tokens)) {
                walk(token.tokens);
            }
            else if (PREVIEW_SKIPS.has(token.type)) {
                // A fence, a rule and a figure all read as noise in a search
                // result — and a figure's raw is the image markup itself.
                continue;
            }
            else {
                flat.push({ heading: false, raw: token.raw ?? '' });
            }
        }
    };
    walk(tokens);
    const previews = {};
    // Its own slugger, walking the same headings in the same order as the
    // renderer's — so a repeat is numbered identically and the previews stay
    // keyed by the ids the page actually emits.
    const slugger = new GithubSlugger();
    for (let i = 0; i < flat.length; i++) {
        const entry = flat[i];
        if (!entry.heading)
            continue;
        const id = slugger.slug(entry.text);
        const body = [];
        for (let j = i + 1; j < flat.length && !flat[j].heading; j++) {
            body.push(flat[j].raw);
            if (stripInlineMarkdown(body.join('\n')).length >= 180)
                break;
        }
        previews[id] = truncateAtWord(stripInlineMarkdown(body.join('\n')), 180);
    }
    return previews;
}
/** The app's description rule: first paragraph after the H1, ≤200 chars. */
function firstParagraph(markdown) {
    const h1 = markdown.match(/^#\s+(.+)$/m);
    const rest = h1 ? markdown.slice(markdown.indexOf(h1[0]) + h1[0].length) : markdown;
    const para = rest.match(/^\s*\n+([^\n#][^\n]*(?:\n[^\n#][^\n]*)*)/m);
    return truncateAtWord(stripInlineMarkdown(para?.[1] ?? ''), 200);
}
/** The title rule: first H1 in the source, else the slug. */
export function docTitle(markdown, slug) {
    return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
}
//# sourceMappingURL=dialect.js.map