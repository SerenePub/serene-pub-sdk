/**
 * Scaffolds (24 §7): show the author the whole space before they write into
 * it. `scaffold config` walks a spec document's nodes and prints every
 * declared slot and field as a commented skeleton — types, defaults,
 * `(required)` markers — so authoring a config is deleting down to the four
 * lines you mean. `scaffold preset` prints a genre's event surface with the
 * announced candidates for each slot.
 *
 * Declarations resolve from a declaration artifact (24 §10): a local
 * announcement JSON, an HTTP URL serving one, or the installed
 * `@serene-pub/core-catalog` when nothing is named. The scaffold never
 * guesses — everything printed is read off documents.
 */
import type { SpecDocument } from '@serene-pub/sdk'
import type { AnnouncementDocument } from '@serene-pub/sdk'
import { sessionEvents } from '@serene-pub/sdk'

/** One registered node type's declared surface, as the scaffold needs it. */
export interface TypeSurface {
	id: string
	version: number
	slots?: Record<string, any>
}

const comment = (lines: string[], indent: string) =>
	lines.map((l) => `${indent}// ${l}`).join('\n')

const short = (v: unknown): string => {
	const s = JSON.stringify(v)
	return s === undefined ? 'undefined' : s.length > 72 ? s.slice(0, 69) + '…' : s
}

const en = (v: unknown): string =>
	typeof v === 'string' ? v : ((v as any)?.en ?? '')

/** One params-schema field as a commented line. */
function fieldLines(name: string, field: any): string[] {
	const bits: string[] = [`${name}: ${short(field?.default)}`]
	const meta: string[] = []
	if (field?.type) meta.push(String(field.type))
	if (field?.min !== undefined) meta.push(`min ${field.min}`)
	if (field?.max !== undefined) meta.push(`max ${field.max}`)
	if (field?.of) meta.push(`one of [${(field.of as unknown[]).join(', ')}]`)
	if (field?.members)
		meta.push(
			`per member: ${(field.members as any[]).map((m) => m.key ?? m).join(', ')}`,
		)
	if (field?.default === undefined) meta.push('(required — no shipped default)')
	const head = `${bits[0]}${meta.length ? `   (${meta.join(' · ')})` : ''}`
	const out = [head]
	const desc = en(field?.description)
	if (desc) out.push(`  ${desc}`)
	return out
}

/**
 * The config skeleton for one spec: every node with declarations, every
 * slot, every field — commented, defaults shown, ready to delete down.
 */
export function scaffoldConfig(
	doc: SpecDocument,
	typeOf: (typeId: string, version: number) => TypeSurface | undefined,
): string {
	const lines: string[] = []
	lines.push(`// ${doc.id} @ ${doc.version} — the full configurable space.`)
	lines.push(`// Uncomment only what you mean; everything else inherits the`)
	lines.push(`// shipped default. (required) fields have no default — a config`)
	lines.push(`// must supply them, and the coverage report lists the holes.`)
	lines.push(`import { config, use } from "@serene-pub/sdk"`)
	lines.push(``)
	lines.push(`const target = use(${JSON.stringify(`${doc.id}@^${doc.version.split('.')[0]}`)})`)
	lines.push(``)
	lines.push(`export const myConfig = config(target, "mine", { label: "Mine" }, {`)

	for (const node of doc.nodes) {
		const surface = typeOf(node.typeId, node.typeVersion)
		const slots = surface?.slots ?? {}
		const slotNames = Object.keys(slots)
		if (!slotNames.length) continue
		lines.push(`\t// ── ${node.key}  (${node.typeId}@${node.typeVersion}) ──`)
		lines.push(`\t// ${node.key}: {`)
		for (const slotName of slotNames) {
			const slot = slots[slotName]
			if (slot?.kind === 'parameters' && slot.schema) {
				lines.push(`\t// \t${slotName}: {`)
				for (const [field, decl] of Object.entries(slot.schema))
					lines.push(comment(fieldLines(field, decl), '\t\t\t'))
				lines.push(`\t// \t},`)
			} else if (slot?.kind === 'prompts' && slot.fields) {
				lines.push(
					`\t// \t${slotName}: {  (prompts — reference a shipped prompt or write your own)`,
				)
				for (const field of Object.keys(slot.fields))
					lines.push(`\t\t\t// ${field}: <prompt text or ref>`)
				lines.push(`\t// \t},`)
			} else if (slot?.kind === 'template') {
				lines.push(
					`\t// \t${slotName}: <${slot.engine ?? 'template'} source>  ${en(slot.description) ? `— ${en(slot.description)}` : ''}`,
				)
			} else if (slot?.kind === 'scripts') {
				lines.push(
					`\t// \t${slotName}: [ ]  (script chains — accepts ${((slot.accepts as string[]) ?? []).join(', ')})`,
				)
			} else if (slot?.kind === 'variables') {
				lines.push(
					`\t// \t${slotName}: { ${Object.keys(slot.renders ?? {}).join(', ')} }  (variable layouts)`,
				)
			} else if (slot?.kind === 'sampling') {
				lines.push(`\t// \t${slotName}: <sampling config ref>`)
			}
		}
		lines.push(`\t// },`)
		lines.push(``)
	}
	lines.push(`})`)
	return lines.join('\n') + '\n'
}

/**
 * The preset skeleton for one genre: its event surface with requiredness,
 * and for each slot the announced pipelines able to fill it.
 */
export function scaffoldPreset(
	genreId: string,
	announcement: AnnouncementDocument,
): string {
	const genre = announcement.genres.find((g) => g.id === genreId)
	if (!genre)
		throw new Error(
			`'${genreId}' is not declared by this announcement. Declared: ${
				announcement.genres.map((g) => g.id).join(', ') || '(none)'
			}`,
		)
	const candidates = (event: string) =>
		announcement.pipelines
			.filter((p) => p.input?.genre === genreId && p.input?.event === event)
			.map((p) => p.id)

	const lines: string[] = []
	lines.push(`// ${genreId} — the event surface a preset fills (24 §7).`)
	lines.push(`// Required slots refuse to build unbound; open slots list actions.`)
	lines.push(`import { preset, use } from "@serene-pub/sdk"`)
	lines.push(``)
	lines.push(`export const myPreset = preset("mine", {`)
	lines.push(`\tgenre: ${JSON.stringify(genreId)},`)
	lines.push(`\tlabel: "Mine",`)
	lines.push(`\tbindings: {`)
	for (const [event, decl] of Object.entries(genre.events)) {
		if ((decl as any)?.open) continue
		const c = candidates(event)
		const required = (decl as any)?.required
		lines.push(
			`\t\t// ${event}${required ? '  (required)' : '  (optional)'}${
				c.length ? ` — candidates: ${c.join(', ')}` : ' — no announced candidate'
			}`,
		)
		lines.push(
			c.length
				? `\t\t${JSON.stringify(event)}: ${JSON.stringify(c[0])},`
				: `\t\t// ${JSON.stringify(event)}: <spec id>,`,
		)
	}
	lines.push(`\t},`)
	const open = Object.entries(genre.events)
		.filter(([, d]) => (d as any)?.open)
		.map(([e]) => e)
	if (open.length) {
		const actions = candidates(sessionEvents.sessionAction)
		lines.push(
			`\t// open slots (${open.join(', ')}): which actions come along.`,
		)
		lines.push(
			`\tactions: { include: [${actions.map((a) => JSON.stringify(a)).join(', ')}] },`,
		)
	}
	lines.push(`})`)
	return lines.join('\n') + '\n'
}
