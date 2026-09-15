/**
 * Docs from declarations (24 T9, the generation half).
 *
 * A package's announcement already contains everything reference
 * documentation says: identity, genres with their event surfaces and shapes,
 * every pipeline's nodes and options with types, defaults and descriptions,
 * shipped prompts, presets with their bindings. So the docs are *rendered*,
 * never written — the same bytes that ship become the pages, and the pages
 * cannot drift from the product. The docs site (T9 proper) consumes this
 * markdown and adds live controls once @serene-pub/controls exists.
 */
import type { AnnouncementDocument, SpecDocument } from '@serene-pub/sdk'
import type { TypeSurface } from './scaffold.js'

const en = (v: unknown): string =>
	typeof v === 'string' ? v : ((v as any)?.en ?? '')

const code = (s: string) => '`' + s + '`'

export interface DocPage {
	/** Repo-relative path, e.g. `pipelines/core_spec_respond.md`. */
	path: string
	markdown: string
}

const fileSafe = (id: string) => id.replace(/[:/]/g, '_')

function fieldRow(name: string, decl: any): string {
	const type = decl?.type ?? ''
	const dflt =
		decl?.default === undefined
			? '**required**'
			: code(JSON.stringify(decl.default))
	const desc = en(decl?.description).replace(/\n/g, ' ')
	return `| ${code(name)} | ${type} | ${dflt} | ${desc} |`
}

function specPage(
	doc: SpecDocument,
	announcement: AnnouncementDocument,
	typeOf: (typeId: string, version: number) => TypeSurface | undefined,
): DocPage {
	const lines: string[] = []
	lines.push(`# ${doc.id}`)
	lines.push('')
	lines.push(`Version ${code(doc.version)}.`)
	if (doc.input?.event)
		lines.push(
			`Answers ${code(doc.input.event)} for ${code(doc.input.genre ?? '?')} — the usage lock (24 §4).`,
		)
	const tax = doc.taxonomy as any
	if (tax?.zone || tax?.role)
		lines.push(
			`Catalogue: ${[tax?.zone, tax?.role].filter(Boolean).map(code).join(' · ')}.`,
		)
	lines.push('')

	lines.push(`## Steps`)
	lines.push('')
	for (const node of doc.nodes) {
		const surface = typeOf(node.typeId, node.typeVersion)
		lines.push(`### ${code(node.key)} — ${node.kind} (${code(`${node.typeId}@${node.typeVersion}`)})`)
		lines.push('')
		const slots = surface?.slots ?? {}
		let wroteAny = false
		for (const [slotName, slot] of Object.entries(slots) as [string, any][]) {
			if (slot?.kind === 'parameters' && slot.schema) {
				lines.push(`**${slotName}**`)
				lines.push('')
				lines.push('| option | type | default | description |')
				lines.push('|---|---|---|---|')
				for (const [field, decl] of Object.entries(slot.schema))
					lines.push(fieldRow(field, decl))
				lines.push('')
				wroteAny = true
			} else if (slot?.kind === 'prompts' && slot.fields) {
				lines.push(
					`**${slotName}** — authored prompt fields: ${Object.keys(slot.fields).map(code).join(', ')}`,
				)
				lines.push('')
				wroteAny = true
			} else if (slot?.kind === 'scripts') {
				lines.push(
					`**${slotName}** — script chains, accepts ${((slot.accepts as string[]) ?? []).map(code).join(', ')}`,
				)
				lines.push('')
				wroteAny = true
			} else if (slot?.kind === 'template') {
				lines.push(`**${slotName}** — ${slot.engine ?? 'template'} template slot`)
				lines.push('')
				wroteAny = true
			}
		}
		if (!wroteAny) {
			lines.push('_Declares nothing to configure._')
			lines.push('')
		}
	}

	// Prompts are pooled per `(node type, slot)`, so a pipeline's shipped
	// prompts are the ones written for the nodes it actually runs — which is
	// also how a page ends up listing prose this spec did not author. That is
	// the point rather than a leak: the prompt is genuinely offered here,
	// because the node is the same node. `typeId` is already unversioned
	// (`builder.ts` splits the `@n` off into `typeVersion`), so it is the pool
	// key as-is.
	const poolTypes = new Set(doc.nodes.map((n) => n.typeId))
	const prompts = announcement.prompts.filter((p) => poolTypes.has(p.nodeType))
	if (prompts.length) {
		lines.push(`## Shipped prompts`)
		lines.push('')
		for (const p of prompts)
			lines.push(`- **${p.label}** (${code(p.slug)}) — ${code(`${p.nodeType}#${p.slot}`)}`)
		lines.push('')
	}
	return { path: `pipelines/${fileSafe(doc.id)}.md`, markdown: lines.join('\n') }
}

function genrePage(
	genre: AnnouncementDocument['genres'][number],
	announcement: AnnouncementDocument,
): DocPage {
	const lines: string[] = []
	lines.push(`# ${en(genre.name) || genre.id}`)
	lines.push('')
	lines.push(`${code(genre.id)} — family ${code(genre.family)}.`)
	const desc = en(genre.description)
	if (desc) {
		lines.push('')
		lines.push(desc)
	}
	lines.push('')
	lines.push(`## Event surface`)
	lines.push('')
	lines.push('| event | standing | announced pipelines |')
	lines.push('|---|---|---|')
	for (const [event, decl] of Object.entries(genre.events)) {
		const standing = (decl as any)?.required
			? 'required'
			: (decl as any)?.open
				? 'open'
				: 'optional'
		const serves = announcement.pipelines
			.filter((p) => p.input?.genre === genre.id && p.input?.event === event)
			.map((p) => code(p.id))
			.join(', ')
		lines.push(`| ${code(event)} | ${standing} | ${serves || '—'} |`)
	}
	if (genre.shape) {
		lines.push('')
		lines.push(`## Shape`)
		lines.push('')
		lines.push('```json')
		lines.push(JSON.stringify(genre.shape, null, 2))
		lines.push('```')
	}
	return { path: `genres/${fileSafe(genre.id)}.md`, markdown: lines.join('\n') }
}

export function renderAnnouncementDocs(
	announcement: AnnouncementDocument,
	typeOf: (typeId: string, version: number) => TypeSurface | undefined,
): DocPage[] {
	const pages: DocPage[] = []

	// The index: what this package is and ships.
	const index: string[] = []
	index.push(`# ${announcement.identity.title}`)
	index.push('')
	if (announcement.identity.summary) index.push(announcement.identity.summary)
	index.push('')
	if (announcement.genres.length) {
		index.push(`## Genres`)
		index.push('')
		for (const g of announcement.genres)
			index.push(`- [${en(g.name) || g.id}](genres/${fileSafe(g.id)}.md)`)
		index.push('')
	}
	index.push(`## Pipelines`)
	index.push('')
	for (const p of announcement.pipelines)
		index.push(`- [${p.id}](pipelines/${fileSafe(p.id)}.md) — v${p.version}`)
	index.push('')
	if (announcement.presets.length) {
		index.push(`## Presets`)
		index.push('')
		for (const p of announcement.presets) {
			index.push(`### ${p.label} (${code(p.slug)})`)
			index.push('')
			if (p.description) {
				index.push(p.description)
				index.push('')
			}
			index.push('| event | pipeline | config |')
			index.push('|---|---|---|')
			for (const [event, b] of Object.entries(p.bindings))
				index.push(
					`| ${code(event)} | ${code(b.spec)} | ${b.config ? code(b.config) : 'shipped default'} |`,
				)
			if (p.actions?.include.length)
				index.push(`\nActions: ${p.actions.include.map(code).join(', ')}`)
			index.push('')
		}
	}
	if (announcement.requires.length) {
		index.push(`## Requires`)
		index.push('')
		for (const r of announcement.requires) index.push(`- ${code(r)}`)
		index.push('')
	}
	pages.push({ path: 'index.md', markdown: index.join('\n') })

	for (const g of announcement.genres) pages.push(genrePage(g, announcement))
	for (const p of announcement.pipelines)
		pages.push(specPage(p, announcement, typeOf))
	return pages
}
