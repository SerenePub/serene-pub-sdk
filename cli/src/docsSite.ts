/**
 * The docs site shell (24 T9): the generated markdown, rendered as a
 * self-contained static site — no dependencies, no build step, open
 * index.html. The converter handles exactly the markdown `docs.ts` emits
 * (headings, tables, lists, fenced code, inline code, links, bold) — it is a
 * renderer for our own output, not a general markdown engine, which is what
 * keeps it a page of code instead of a dependency.
 *
 * Live controls join these pages when @serene-pub/controls exists (T6c);
 * until then the option tables are the reference.
 */
import type { AnnouncementDocument } from '@serene-pub/sdk'
import type { DocPage } from './docs.js'

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Inline spans: code, bold, links — applied after escaping. */
const inline = (s: string): string =>
	esc(s)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/_([^_]+)_/g, '<em>$1</em>')
		.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			(_, text, href) => `<a href="${href.replace(/\.md$/, '.html')}">${text}</a>`,
		)

export function markdownToHtml(md: string): string {
	const lines = md.split('\n')
	const out: string[] = []
	let i = 0
	while (i < lines.length) {
		const line = lines[i]!
		if (line.startsWith('```')) {
			const buf: string[] = []
			i++
			while (i < lines.length && !lines[i]!.startsWith('```')) buf.push(lines[i++]!)
			i++
			out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`)
			continue
		}
		const h = /^(#{1,4})\s+(.*)$/.exec(line)
		if (h) {
			const level = h[1]!.length
			out.push(`<h${level}>${inline(h[2]!)}</h${level}>`)
			i++
			continue
		}
		if (line.startsWith('|')) {
			const rows: string[][] = []
			while (i < lines.length && lines[i]!.startsWith('|')) {
				const cells = lines[i]!
					.split('|')
					.slice(1, -1)
					.map((c) => c.trim())
				// The separator row (---) is markdown syntax, not data.
				if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells)
				i++
			}
			const [head, ...body] = rows
			out.push('<table>')
			if (head)
				out.push(
					`<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`,
				)
			out.push('<tbody>')
			for (const r of body)
				out.push(`<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
			out.push('</tbody></table>')
			continue
		}
		if (line.startsWith('- ')) {
			out.push('<ul>')
			while (i < lines.length && lines[i]!.startsWith('- '))
				out.push(`<li>${inline(lines[i++]!.slice(2))}</li>`)
			out.push('</ul>')
			continue
		}
		if (line.trim() === '') {
			i++
			continue
		}
		out.push(`<p>${inline(line)}</p>`)
		i++
	}
	return out.join('\n')
}

const CSS = `
:root { --bg:#ffffff; --ink:#1c2130; --muted:#5b6478; --line:#e3e6ee; --accent:#4459c9; --code:#f2f4f9; }
@media (prefers-color-scheme: dark) {
	:root { --bg:#14161d; --ink:#e6e9f2; --muted:#98a0b5; --line:#2a2f3e; --accent:#8fa4c9cc; --accent:#94a6ff; --code:#1d2130; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 system-ui,sans-serif; }
.layout { display:flex; min-height:100vh; }
nav { width:250px; flex:none; border-right:1px solid var(--line); padding:1.2rem; position:sticky; top:0; height:100vh; overflow-y:auto; }
nav h1 { font-size:1rem; margin:0 0 .8rem; }
nav a { display:block; color:var(--muted); text-decoration:none; padding:.15rem 0; font-size:.86rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
nav a:hover, nav a.active { color:var(--accent); }
nav .group { font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:1rem 0 .3rem; }
main { flex:1; min-width:0; padding:2rem 2.5rem; max-width:56rem; }
h1,h2,h3,h4 { line-height:1.25; }
h1 { font-size:1.6rem; } h2 { margin-top:2rem; border-bottom:1px solid var(--line); padding-bottom:.3rem; }
code { background:var(--code); padding:.1em .35em; border-radius:4px; font-size:.88em; }
pre { background:var(--code); padding:.9rem 1rem; border-radius:8px; overflow-x:auto; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; width:100%; margin:1rem 0; font-size:.9rem; }
th,td { border:1px solid var(--line); padding:.4rem .6rem; text-align:left; vertical-align:top; }
th { background:var(--code); }
a { color:var(--accent); }
@media (max-width: 760px) { .layout { display:block; } nav { position:static; width:auto; height:auto; border-right:none; border-bottom:1px solid var(--line); } }
`

export interface SitePage {
	path: string
	html: string
}

export function renderSite(
	announcement: AnnouncementDocument,
	pages: DocPage[],
): SitePage[] {
	const title = announcement.identity.title

	const navFor = (depth: number, current: string): string => {
		const prefix = depth === 0 ? '' : '../'
		const link = (mdPath: string, label: string) => {
			const href = prefix + mdPath.replace(/\.md$/, '.html')
			const active = mdPath === current ? ' class="active"' : ''
			return `<a href="${href}"${active}>${esc(label)}</a>`
		}
		const parts: string[] = []
		parts.push(`<h1><a href="${prefix}index.html">${esc(title)}</a></h1>`)
		if (announcement.genres.length) {
			parts.push(`<div class="group">Genres</div>`)
			for (const g of announcement.genres)
				parts.push(
					link(
						`genres/${g.id.replace(/[:/]/g, '_')}.md`,
						typeof g.name === 'string' ? g.name : ((g.name as any)?.en ?? g.id),
					),
				)
		}
		parts.push(`<div class="group">Pipelines</div>`)
		for (const p of announcement.pipelines)
			parts.push(link(`pipelines/${p.id.replace(/[:/]/g, '_')}.md`, p.id))
		return parts.join('\n')
	}

	return pages.map((page) => {
		const depth = page.path.split('/').length - 1
		const body = markdownToHtml(page.markdown)
		const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="layout">
<nav>${navFor(depth, page.path)}</nav>
<main>${body}</main>
</div>
</body>
</html>
`
		return { path: page.path.replace(/\.md$/, '.html'), html }
	})
}
