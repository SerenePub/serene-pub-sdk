/**
 * Widgets as a package declares them, and genres as they subtract and lay
 * them out (R71, ruled 2026-09-24).
 *
 * - A **package** — a plugin, or core in `core-catalog` — declares its
 *   widgets once (`defineExtension({ widgets })`), each optionally scoped to
 *   genres by value (`widget({ genres: [myGenre] })`; absent = every genre).
 * - A **genre** withholds any package's widgets (`omitWidgets`, by value) and
 *   ships its layouts (`layouts`, the first its default).
 *
 * A session of a genre is offered every widget scoped to it or to all,
 * minus the genre's `omitWidgets`.
 *
 * **Whose a widget is** is recorded when its package declares it — core's by
 * `core-catalog`, a plugin's by `defineExtension` — so a genre that names
 * another package's widget by value names the id the page knows it by
 * (`widgetRef`): core's bare (`stats`), a plugin's under its package
 * (`acme.dice:tray`, the `pluginWidgetId` grammar).
 */
import type { WidgetDecl } from './layout.js'
import { validateSessionLayout, type SessionLayoutV1 } from './sessionLayout.js'
import { i18nFindings, type I18n } from './i18n.js'
import { WIDGET_BASE_SECTIONS, isWidgetScopedSectionName, type WidgetBaseSection } from './widgets.js'

/**
 * One registry per process, however many copies of the SDK a package's
 * dependencies resolved: a genre that names core's widget from one copy and
 * a core-catalog built against another still agree whose it is.
 */
const REGISTRY = ((globalThis as Record<symbol, unknown>)[Symbol.for('serene-pub.widget-owners')] ??= {
	owners: new WeakMap<object, string>(),
	coreIds: new Set<string>(),
}) as { owners: WeakMap<object, string>; coreIds: Set<string> }
const OWNERS = REGISTRY.owners

/** Record whose widgets these are. Core's `core-catalog` and `defineExtension` call it; nothing else should. @internal */
export function ownWidgets(owner: string, widgets: readonly WidgetDecl[]): void {
	for (const w of widgets) {
		const held = OWNERS.get(w)
		if (held && held !== owner)
			throw new Error(`widget '${w.id}' is already ${held}'s — a widget belongs to the one package that declares it`)
		OWNERS.set(w, owner)
		if (owner === 'core') REGISTRY.coreIds.add(w.id)
	}
}

/**
 * Core's widget ids, as far as core's catalogue has been loaded. A package's
 * widget may not take one: a layout names core's widgets and the package's
 * own by bare id, so the two sets never overlap.
 * @experimental
 */
export const coreWidgetIds = (): ReadonlySet<string> => REGISTRY.coreIds

/** The package that declared this widget value, if one has. @experimental */
export const widgetOwner = (w: WidgetDecl): string | undefined => OWNERS.get(w)

/** The id a page, a layout row and a genre's `omitWidgets` know this widget by. @experimental */
export function widgetRef(w: WidgetDecl): string {
	const owner = OWNERS.get(w)
	if (!owner)
		throw new Error(
			`widget '${w?.id}' belongs to no package yet — name a widget value from core (\`coreWidgets\`) ` +
				`or from a package's \`defineExtension({ widgets })\``,
		)
	return owner === 'core' ? w.id : `${owner}:${w.id}`
}

/** A genre as a widget's `genres` names it: the genre value, or `use('<id>')` for one declared elsewhere. @experimental */
export type GenreLike = { readonly id: string }

/** @experimental */
export interface WidgetInput extends Omit<WidgetDecl, 'genres'> {
	/** The genres whose sessions offer it, by value. Absent = every genre. */
	genres?: readonly GenreLike[]
}

const WIDGET_ID = /^[a-z][a-z0-9-]*$/

/**
 * The base sections a widget reads (R75): its `reads`, or every base section
 * when it declares none — what its host sends it. A host asks this rather
 * than reading `reads`, so the default lives in one place.
 *
 * Clamped, as a host must clamp what an install stored verbatim: a name that
 * is not a base section (a scoped one, junk) never comes back, and each name
 * comes back once.
 * @experimental
 */
export function widgetReads(w: Pick<WidgetDecl, 'reads'>): readonly WidgetBaseSection[] {
	if (!Array.isArray(w?.reads)) return WIDGET_BASE_SECTIONS
	return [
		...new Set(
			(w.reads as readonly unknown[]).filter((name): name is WidgetBaseSection =>
				(WIDGET_BASE_SECTIONS as readonly unknown[]).includes(name),
			),
		),
	]
}

/**
 * What is wrong with a widget's `reads` (R75), one sentence each, each led by
 * `at` (where it was written): a name that is not a base section is refused
 * where it is declared, rather than naming a section the widget would
 * silently never receive.
 * @experimental
 */
export function widgetReadsFindings(reads: unknown, at: string): string[] {
	if (reads === undefined) return []
	const names = WIDGET_BASE_SECTIONS.map((s) => `'${s}'`).join(', ')
	if (!Array.isArray(reads)) return [`${at}: a list of base section names — any of ${names}`]
	const out: string[] = []
	for (const name of reads as unknown[]) {
		if ((WIDGET_BASE_SECTIONS as readonly unknown[]).includes(name)) continue
		out.push(
			isWidgetScopedSectionName(name)
				? `${at}: '${name}' is a scoped section — ask for it in \`scopes\`, never in \`reads\``
				: `${at}: '${String(name)}' is not a base section — one of ${names}`,
		)
	}
	return out
}

/** Declare a widget — the value a package lists in `widgets` and a genre names in `omitWidgets` or a layout. @experimental */
export function widget(d: WidgetInput): WidgetDecl {
	const problems: string[] = []
	if (!WIDGET_ID.test(d.id ?? ''))
		problems.push(`'${d.id}' is not a widget id — lowercase letters, digits and '-' (the package supplies the namespace)`)
	problems.push(...i18nFindings(d.title, `widget '${d.id}' title`, { required: true }))
	if (typeof d.component !== 'string' || !d.component)
		problems.push(`widget '${d.id}' names no component — give \`component\`, the slug of a component this package declares`)
	if ((d as { surface?: unknown }).surface !== undefined)
		problems.push(`widget '${d.id}': \`surface\` is gone — name a component, and place an \`sp-frame\` inside it for a document`)
	problems.push(...widgetReadsFindings(d.reads, `widget '${d.id}' reads`))
	if (d.maxInstances !== undefined && !(Number.isInteger(d.maxInstances) && d.maxInstances > 0))
		problems.push(`widget '${d.id}' maxInstances: a positive whole number, or leave it out for no cap`)
	const genres = d.genres?.map((g) => g?.id)
	if (genres?.some((g) => typeof g !== 'string' || !g))
		problems.push(`widget '${d.id}' genres: each is a genre value (or use('<id>')), never a bare string`)
	if (problems.length) throw new Error(problems.join('\n'))
	const { genres: _g, ...rest } = d
	return Object.freeze({ ...rest, ...(genres?.length ? { genres: [...new Set(genres)] } : {}) }) as WidgetDecl
}

/**
 * A layout a genre ships (R71): a **session layout** under a slug and a name.
 * The first is the genre's default — its **genre default layout**.
 * @experimental
 */
export interface GenreLayoutDecl {
	/** Unique within the genre; `default` for the first. */
	slug: string
	name: I18n
	description?: I18n
	/**
	 * The session layout, with the widget settings and style pins that come
	 * with it. It places widgets by the id the page knows them by —
	 * `someWidget.id` for one of this package's, `coreWidgets.x.id` for core's
	 * — or a copy of one (`messages#sanctum`); the packager puts a plugin's own
	 * widget ids under its namespace.
	 */
	preset: SessionLayoutV1
}

const LAYOUT_SLUG = /^[a-z][a-z0-9-]*$/

/** Declare a layout a genre ships. Refused unless `validateSessionLayout` finds no error in it. @experimental */
export function layout(d: GenreLayoutDecl): GenreLayoutDecl {
	const problems: string[] = []
	if (!LAYOUT_SLUG.test(d.slug ?? '')) problems.push(`'${d.slug}' is not a layout slug — lowercase letters, digits and '-'`)
	problems.push(...i18nFindings(d.name, `layout '${d.slug}' name`, { required: true }))
	problems.push(...i18nFindings(d.description, `layout '${d.slug}' description`))
	const verdict = validateSessionLayout(d.preset)
	for (const e of verdict.errors) problems.push(`layout '${d.slug}' preset: ${e}`)
	if (problems.length) throw new Error(problems.join('\n'))
	return Object.freeze({ ...d })
}
