/**
 * `serene-pub create component <slug>` (§3.5, C3): the files a remote
 * component starts from, and the declarations to add to the package's
 * `defineExtension` — printed, never edited in: the entry module is the
 * author's, and a tool that rewrites it is a tool nobody trusts twice.
 *
 * One shape. `--vanilla` writes plain DOM instead of Svelte; `--widget` adds
 * the widget declaration naming the component; `--embed-document` adds an
 * `sp-frame` region and a document stub, for the one part that needs a real
 * DOM (a charting library that measures, a rich-text editor).
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export class ComponentScaffoldError extends Error {}

export interface ComponentScaffoldOptions {
	slug: string
	vanilla?: boolean
	widget?: boolean
	embedDocument?: boolean
}

/** @experimental */
export interface ScaffoldedFile {
	path: string
	text: string
}

const SLUG = /^[a-z][a-z0-9-]*$/
const pascal = (slug: string) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')

export function componentFiles(o: ComponentScaffoldOptions): { files: ScaffoldedFile[]; declarations: string } {
	if (!SLUG.test(o.slug))
		throw new ComponentScaffoldError(`'${o.slug}' is not a component slug — lowercase letters, digits and '-'`)
	const Name = pascal(o.slug)
	const label = o.slug[0].toUpperCase() + o.slug.slice(1).replace(/-/g, ' ')
	const files: ScaffoldedFile[] = []
	const frame = o.embedDocument
		? `\n\t<!-- A real document for the one region that needs one; it gets \`props\` and raises \`action\`. -->\n\t<sp-frame src="ui/${o.slug}.html" title="${Name}" props={JSON.stringify({ count })}></sp-frame>`
		: ''
	if (o.vanilla) {
		files.push({
			path: `components/${o.slug}.ts`,
			text: `import { defineComponent } from '@serene-pub/component-client'

/**
 * ✎ CHANGE: what this component shows. It runs in the page's UI worker:
 * build it from the host elements (plain HTML plus the sp-* set), style it
 * with classes, and read what the host pushes off \`ctx\`.
 */
export default defineComponent((root, ctx) => {
\tconst line = document.createElement('p')
\tline.setAttribute('class', 'text-sm')
\troot.append(line)
\tconst draw = () => (line.textContent = \`\${ctx.messages?.length ?? 0} messages\`)
\tdraw()
\treturn ctx.subscribe(draw)
})
`,
		})
	} else {
		files.push({
			path: `components/${Name}.svelte`,
			text: `<script lang="ts">
\timport type { ComponentContext } from '@serene-pub/component-client'

\t/**
\t * ✎ CHANGE: what this component shows. It runs in the page's UI worker:
\t * build it from the host elements (plain HTML plus the sp-* set), style it
\t * with classes — a <style> block is dropped at build — and read what the
\t * host pushes off \`ctx\`.
\t */
\tlet { ctx }: { ctx: ComponentContext } = $props()
\tconst rows = () => ctx.messages?.length ?? 0
\tlet count = $state(rows())
\t$effect(() => ctx.subscribe(() => (count = rows())))
</script>

<div class="space-y-2 p-3">
\t<p class="text-sm">{count} messages</p>${frame}
</div>
`,
		})
		files.push({
			path: `components/${o.slug}.ts`,
			text: `import { svelteComponent } from '@serene-pub/component-client/svelte'
import ${Name} from './${Name}.svelte'

export default svelteComponent(${Name})
`,
		})
	}
	if (o.embedDocument)
		files.push(
			{
				path: `ui/${o.slug}.html`,
				// The document is served under `script-src 'self'`: its script is a
				// file beside it, never inline.
				text: `<!doctype html>
<html>
\t<head>
\t\t<meta charset="utf-8" />
\t\t<title>${Name}</title>
\t\t<script type="module" src="./${o.slug}.js"></script>
\t</head>
\t<body>
\t\t<!-- ✎ CHANGE: a real document, for the one region that needs one. -->
\t\t<p id="out">waiting…</p>
\t</body>
</html>
`,
			},
			{
				path: `ui/${o.slug}.js`,
				text: `// The frame protocol: the page hands this document a port, sends \`props\`,
// and hears \`action\` back.
window.addEventListener('message', (e) => {
\tconst port = e.ports?.[0]
\tif (!port) return
\tport.onmessage = (m) => {
\t\tif (m.data?.t === 'props') document.getElementById('out').textContent = JSON.stringify(m.data.props)
\t}
\tport.postMessage({ t: 'ready' })
})
`,
			},
		)
	const decl = [
		`import { component${o.widget ? ', widget' : ''} } from '@serene-pub/sdk'`,
		``,
		`// in defineExtension({ … }):`,
		`components: [`,
		`\tcomponent({ slug: '${o.slug}', label: '${label}', entry: 'components/${o.slug}.ts', framework: '${o.vanilla ? 'vanilla' : 'svelte'}' }),`,
		`],`,
	]
	if (o.widget)
		decl.push(
			``,
			`// and the widget that names it (R71) — add genres: [yourGenre] to offer it in those genres only:`,
			`widgets: [widget({ id: '${o.slug}', title: '${label}', component: '${o.slug}' })],`,
		)
	return { files, declarations: decl.join('\n') }
}

/** Write the files into `dir`, refusing to overwrite any. */
export async function writeComponentScaffold(dir: string, o: ComponentScaffoldOptions) {
	const { files, declarations } = componentFiles(o)
	for (const f of files) {
		const at = join(dir, f.path)
		const exists = await access(at).then(
			() => true,
			() => false,
		)
		if (exists) throw new ComponentScaffoldError(`${f.path} already exists — nothing was written`)
	}
	for (const f of files) {
		const at = join(dir, f.path)
		await mkdir(dirname(at), { recursive: true })
		await writeFile(at, f.text)
	}
	return { files, declarations }
}
