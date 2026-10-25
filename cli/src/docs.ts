/**
 * Docs from declarations (the generation half).
 *
 * A package's announcement already contains everything reference
 * documentation says: identity, genres with their event surfaces and shapes,
 * every pipeline's nodes and options with types, defaults and descriptions,
 * shipped prompts, presets as changes on their genre's defaults. So the docs are *rendered*,
 * never written — the same bytes that ship become the pages, and the pages
 * cannot drift from the product. The docs site (`docsSite.ts`) consumes this
 * markdown and adds live controls once @serene-pub/controls exists.
 */
import {
	entitiesRead,
	entityWord,
	getCadence,
	i18nText,
	type AnnouncementDocument,
	type I18n,
	type RegistrationDecl,
	type SpecDocument,
} from '@serene-pub/sdk'
import type { TypeSurface } from './scaffold.js'
import { renderEventsDocs } from './docsEvents.js'

/** Display text in the docs' one language — the SDK's resolver, `en`. */
const en = (v: unknown): string => i18nText(v as I18n | undefined) ?? ''

const code = (s: string) => '`' + s + '`'

/** @experimental */
export interface DocPage {
	/** Repo-relative path, e.g. `pipelines/core_spec_chat-respond.md`. */
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
	typeOf: (definitionId: string, version: number) => TypeSurface | undefined,
): DocPage {
	const lines: string[] = []
	lines.push(`# ${doc.id}`)
	lines.push('')
	lines.push(`Version ${code(doc.version)}.`)
	// A pipeline is mounted, it does not lock (PLAN-layering §2): `suits` is a
	// picker's hint, and what it reads decides where it fits.
	const suits = (doc as { suits?: readonly string[] }).suits
	if (suits?.length) lines.push(`Made for ${suits.map(code).join(', ')} — a hint for pickers; a genre or a preset registers it.`)
	else if (doc.input?.event)
		lines.push(`Made for ${code(doc.input.event)} — declared the older way, as an inlet lock.`)
	const reads = entitiesRead(doc)
	if (reads.length)
		lines.push(
			`Reads ${reads.map((k) => entityWord(k)).join(', ')}: it fits a trigger that carries ${reads.length === 1 ? 'it' : 'them'} ([Events and what they carry](../events.md)).`,
		)
	const emits = (doc as { emits?: readonly string[] }).emits
	if (emits?.length) lines.push(`Emits ${emits.map(code).join(', ')}.`)
	const tax = doc.taxonomy as any
	if (tax?.zone || tax?.role)
		lines.push(
			`Catalogue: ${[tax?.zone, tax?.role].filter(Boolean).map(code).join(' · ')}.`,
		)
	lines.push('')

	// The map, drawn from the same document the tables below are read off. It
	// is a fence rather than a picture because rendering it needs a layout
	// engine this package does not carry: `@serene-pub/docs` answers it with
	// `pipelineResolver(announcement)`, and a renderer that has no resolver
	// for it says so instead of quietly dropping the graph.
	lines.push('```pipeline ' + doc.id)
	lines.push('```')
	lines.push('')

	lines.push(`## Steps`)
	lines.push('')
	for (const node of doc.nodes) {
		const surface = typeOf(node.definitionId, node.definitionVersion)
		lines.push(`### ${code(node.key)} — ${node.kind} (${code(`${node.definitionId}@${node.definitionVersion}`)})`)
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
	// because the node is the same node. `definitionId` is already unversioned
	// (`builder.ts` splits the `@n` off into `definitionVersion`), so it is the pool
	// key as-is.
	const poolTypes = new Set(doc.nodes.map((n) => n.definitionId))
	const prompts = announcement.prompts.filter((p) => poolTypes.has(p.nodeType))
	if (prompts.length) {
		lines.push(`## Shipped prompts`)
		lines.push('')
		for (const p of prompts)
			lines.push(`- **${en(p.label)}** (${code(p.slug)}) — ${code(`${p.nodeType}#${p.slot}`)}`)
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
	const registrations = ((genre as { defaults?: { registrations?: readonly RegistrationDecl[] } }).defaults
		?.registrations ?? []) as readonly RegistrationDecl[]
	lines.push(`## Event surface`)
	lines.push('')
	lines.push('| event | standing | registered by the genre’s defaults |')
	lines.push('|---|---|---|')
	for (const [event, decl] of Object.entries(genre.events)) {
		const standing = (decl as any)?.required
			? 'required'
			: (decl as any)?.open
				? 'open'
				: 'optional'
		const serves = registrations
			.filter((r) => r.trigger.family === 'event' && r.trigger.event === event)
			.map((r) => code(r.pipeline))
		// ⏳ A pipeline still locked to this genre and event (an older document).
		for (const p of announcement.pipelines)
			if (p.input?.genre === genre.id && p.input?.event === event && !serves.includes(code(p.id))) serves.push(code(p.id))
		lines.push(`| ${code(event)} | ${standing} | ${serves.join(', ') || '—'} |`)
	}
	lines.push(...genreDefaultsLines(genre, registrations))
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

/** A cadence as words: its declared name, and the options a registration states. */
function cadenceText(ref: { id: string; options?: Readonly<Record<string, unknown>> }): string {
	const name = en(getCadence(ref.id)?.i18n.name) || ref.id
	const options = Object.entries(ref.options ?? {})
		.map(([k, v]) => `${k} ${JSON.stringify(v)}`)
		.join(', ')
	return options ? `${name} (${options})` : name
}

/** What a registration's trigger is, as a table cell. */
function triggerText(r: RegistrationDecl): string {
	const t = r.trigger as { family: string; event?: string; action?: string; cadence?: { id: string; options?: Record<string, unknown> } }
	if (t.family === 'event') return code(t.event ?? '?')
	if (t.family === 'action') return code(t.action ?? '?')
	if (t.family === 'routine' && t.cadence) return cadenceText(t.cadence)
	return t.family
}

/**
 * 🚧 The genre's defaults (R22): what every preset of the genre starts from —
 * its registrations by trigger family, and the settings it sets.
 */
function genreDefaultsLines(
	genre: AnnouncementDocument['genres'][number],
	registrations: readonly RegistrationDecl[],
): string[] {
	if (!registrations.length) return []
	const out: string[] = ['', `## The genre’s defaults`, '']
	out.push(
		'What every preset of this genre starts from. A preset is one set of changes on these: it registers more, drops some, or changes their values.',
	)
	const section = (title: string, rows: string[], head: string) => {
		if (!rows.length) return
		out.push('', `### ${title}`, '', head, head.replace(/[^|]+/g, '---'), ...rows)
	}
	const of = (family: string) => registrations.filter((r) => r.trigger.family === family)
	section(
		'Event pipelines',
		of('event').map((r) => `| ${triggerText(r)} | ${code(r.pipeline)} |`),
		'| event | pipeline |',
	)
	section(
		'Action pipelines',
		of('action').map((r) => `| ${triggerText(r)} | ${code(r.pipeline)} |`),
		'| action | pipeline |',
	)
	section(
		'Routines',
		of('routine').map(
			(r) => `| ${triggerText(r)} | ${code(r.pipeline)} | ${r.mode ?? 'full'} | ${r.allowStacking ? 'on' : 'off'} |`,
		),
		'| cadence | pipeline | mode | allow stacking |',
	)
	const settings = (genre as { defaults?: { settings?: Readonly<Record<string, unknown>> } }).defaults?.settings
	if (settings && Object.keys(settings).length) {
		out.push('', '### Settings', '')
		for (const [k, v] of Object.entries(settings)) out.push(`- ${code(k)}: ${code(JSON.stringify(v))}`)
	}
	return out
}

/** A preset as the announcement stores it — its changes, and ⏳ the older bindings form. */
type PresetLike = AnnouncementDocument['presets'][number] & {
	default?: boolean
	registrations?: {
		register?: readonly RegistrationDecl[]
		drop?: readonly string[]
		change?: ReadonlyArray<{ key: string; values?: unknown; mode?: string; allowStacking?: boolean }>
	}
	settings?: Readonly<Record<string, unknown>>
	requires?: readonly string[]
}

/** 🚧 A preset as changes on its genre's defaults (R2). */
function presetLines(p: PresetLike): string[] {
	const out: string[] = []
	out.push(`Genre ${code(String(p.genre))}${p.default ? ' — the genre’s default preset' : ''}.`)
	const changes = p.registrations
	const rows: string[] = []
	for (const r of changes?.register ?? []) rows.push(`| registers | ${triggerText(r)} → ${code(r.pipeline)} |`)
	for (const key of changes?.drop ?? []) rows.push(`| drops | ${code(key)} |`)
	for (const c of changes?.change ?? []) {
		const what = [
			c.mode ? `mode ${c.mode}` : '',
			c.allowStacking !== undefined ? `allow stacking ${c.allowStacking ? 'on' : 'off'}` : '',
			c.values ? `values ${code(JSON.stringify(c.values))}` : '',
		]
			.filter(Boolean)
			.join(', ')
		rows.push(`| changes | ${code(c.key)}${what ? ': ' + what : ''} |`)
	}
	// ⏳ The bindings alias (an older preset): event → pipeline.
	for (const [event, b] of Object.entries(p.bindings ?? {}))
		if (b?.spec) rows.push(`| registers | ${code(event)} → ${code(b.spec)} |`)
	if (rows.length) out.push('', '| change | on the genre’s defaults |', '|---|---|', ...rows)
	else out.push('', 'No changes: it runs the genre’s defaults as they stand.')
	if (p.settings && Object.keys(p.settings).length) {
		out.push('', 'Settings:')
		for (const [k, v] of Object.entries(p.settings)) out.push(`- ${code(k)}: ${code(JSON.stringify(v))}`)
	}
	if (p.requires?.length) out.push('', `Requires ${p.requires.map(code).join(', ')}.`)
	return out
}

/** @internal */
export function renderAnnouncementDocs(
	announcement: AnnouncementDocument,
	typeOf: (definitionId: string, version: number) => TypeSurface | undefined,
): DocPage[] {
	const pages: DocPage[] = []

	// The index: what this package is and ships.
	const index: string[] = []
	index.push(`# ${en(announcement.identity.title)}`)
	index.push('')
	if (announcement.identity.summary) index.push(en(announcement.identity.summary))
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
			index.push(`### ${en(p.label)} (${code(p.slug)})`)
			index.push('')
			if (p.description) {
				index.push(en(p.description))
				index.push('')
			}
			index.push(...presetLines(p as PresetLike))
			index.push('')
		}
	}
	index.push(`## Events`)
	index.push('')
	index.push('- [Events and what they carry](events.md) — what each event, action and cadence hands the pipelines registered on it.')
	index.push('')
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
	// What a registration is judged against (A1): every event, action and
	// cadence with what it carries. Rendered with every announcement so a
	// spec page's "fits a trigger that carries…" always has its page.
	pages.push(...renderEventsDocs())
	return pages
}
