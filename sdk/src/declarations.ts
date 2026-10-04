/**
 * The checks a package's declarations get, whichever surface declared them (D-1).
 *
 * A package says the same things in two places. `announce()` collects them as a
 * builder and compiles the announcement document; `defineExtension()` carries
 * them as literals the packager reads without executing the author's code. Both
 * are declaring one package, so both get **one set of checks** — the functions
 * here — rather than two that drift and answer the same mistake with two
 * different sentences.
 *
 * Every function returns findings rather than throwing, because the caller owns
 * the refusal: `announce()` collects them into an `AnnouncementError` with the
 * coverage report attached, `defineExtension()` into an `ExtensionError`, and
 * the packager into `CompileFinding`s with a file and a line. A thrown error
 * would let the first mistake hide the other nine.
 *
 * What is deliberately NOT here: the pipeline-namespace rule, which both
 * callers already enforce in their own words (one names the package namespace,
 * the other the plugin slug), and the identity display text, which only an
 * announcement has.
 */

import type { WidgetDecl } from './layout.js'
import { coreWidgetIds, widgetReadsFindings } from './widgetDecls.js'
import type {
	AnnouncedSpec,
	ExternalRef,
	StoredEventDeclaration,
	ConfigDecl,
	CoverageReport,
	CoverageSlot,
	PresetDecl,
	PromptDecl,
} from './announce.js'
import { COMPONENT_FRAMEWORKS, type ComponentDecl } from './extension.js'
import { CONVERSATION_WIDGET_ID, TURN_ORDER_CHANGED_IS_INTERNAL, sessionEvents, type GenreDecl } from './genres.js'
import { drawnWidgetIds, validateSessionLayout, widgetOfInstance } from './sessionLayout.js'
import { eventsLockFindings, getDefinition, swapFitFinding } from './descriptors.js'
import { eventById, isEventId, notADeclaredEvent } from './events.js'
import type { SpecDocument } from './document.js'
import { actionDocumentFindings, actionsOf, slashCollisions } from './actions.js'
import { isTodo } from './values.js'
import { isServableEntry, type SurfacesDecl } from './surfaces.js'
import { i18nFindings } from './i18n.js'
import { annexDeclarationOf, annexStepFindings, type AnnexFieldDecl } from './annexFields.js'

/**
 * Everything a package declares, as either surface holds it. Every field
 * optional: a package that ships only pipelines and a package that ships only a
 * genre are both real, and the checks that need two of them say so themselves.
 * @experimental
 */
export interface DeclaredPackage {
	/** The namespace every declared id sits under — a package's `ns`, a plugin's `slug`. */
	ns: string
	genres?: readonly GenreDecl[]
	pipelines?: readonly AnnouncedSpec[]
	prompts?: readonly PromptDecl[]
	configs?: readonly ConfigDecl[]
	presets?: readonly PresetDecl[]
	surfaces?: SurfacesDecl
	components?: readonly ComponentDecl[]
	/** The widgets this package declares (R71). */
	widgets?: readonly WidgetDecl[]
	/** Definitions this package offers on another package's swappable nodes (R29). */
	swaps?: readonly (SwapContribution | StoredSwapContribution)[]
	/** Events this package declares, with who may record them. */
	events?: readonly StoredEventDeclaration[]
	/**
	 * The package's annex declaration (owner ruling 2026-09-26): every key its
	 * pipelines keep in its annex document. Undefined is "not stated here" —
	 * the pass does not judge annex writes; `[]` declares nothing, so a
	 * `set-session-annex` step naming a key is refused.
	 */
	annexFields?: readonly AnnexFieldDecl[]
}

/**
 * One swap a package contributes (R29): its own definition, offered on a node
 * another package (usually core) exposes — `{ spec: chatTurnOrder, node:
 * 'decide.rules.strategy', definition: myStrategy }`. The spec is a value
 * — the spec you imported, or `use('<id>')` for one you cannot import.
 * With a value, the node key is checked here; the instance checks exposure and
 * port fit at install. Stored with ids (`StoredSwapContribution`).
 * @experimental
 */
export interface SwapContribution {
	/** The spec whose node this is offered on — never this package's own. */
	spec: AnnouncedSpec | ExternalRef
	/** The node key, as the spec declares it. */
	node: string
	/** The definition's pin. Stored as its id. */
	definition: { readonly id: string }
}

/** A contribution as stored: ids throughout. @experimental */
export interface StoredSwapContribution {
	spec: string
	node: string
	definition: string
}

/** The stored form of a contribution — the spec and the pin read down to their ids. @experimental */
export const storedSwap = (c: SwapContribution | StoredSwapContribution): StoredSwapContribution => ({
	// Read defensively: a JS modder's entry may name nothing at all, and the
	// checks below say so in a sentence rather than a TypeError.
	spec: typeof c?.spec === 'string' ? c.spec : ((c?.spec as { id?: string } | undefined)?.id ?? ''),
	node: c?.node,
	definition: typeof c?.definition === 'string' ? c.definition : (c?.definition?.id ?? ''),
})

/**
 * Swaps as authored: the spec is a value and the definition a pin. A
 * string is refused here, at the entry — the shared pass below also reads the
 * stored form, where both are rightly ids. With a spec value, the node key is
 * checked against the spec's nodes.
 * @experimental
 */
export function swapInputFindings(swaps: readonly SwapContribution[]): string[] {
	const out: string[] = []
	for (const c of swaps) {
		const { spec, node, definition } = storedSwap(c)
		if (typeof c?.spec === 'string')
			out.push(
				`swap names the spec '${spec}' as a string — pass the spec value, or use('${spec}') for one you cannot import`,
			)
		if (typeof c?.definition === 'string')
			out.push(`swap onto '${spec}#${node}' names the definition '${definition}' as a string — pass its pin`)
		const known = c?.spec && typeof c.spec === 'object' && 'nodes' in c.spec ? c.spec : undefined
		const target = known
			? (known.nodes as ReadonlyArray<{ key: string; definitionId: string; definitionVersion: number }>).find(
					(n) => n.key === node,
				)
			: undefined
		if (known && node && !target) out.push(`swap names node '${node}', which '${spec}' does not have`)
		// The fit, now — including R53's refusal for a node that uses a
		// connection — rather than first at install, when both are known here.
		const pinned = definitionOfNode(target)
		const offered = definition ? getDefinition(definition) : undefined
		const misfit = pinned && offered && swapFitFinding(node, pinned, offered)
		if (misfit) out.push(misfit)
	}
	return out
}

/** A definition id as a swap must name one: `ns:kind/name@N`. */
const DEFINITION_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:[a-z]+\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/**
 * Swap contributions (R29): a package offers only its own definitions, never
 * on its own specs (those list swaps on the node with `expose.swaps` — one
 * way to do each thing, R26), and each once.
 * @experimental
 */
export function swapContributionFindings(
	swaps: readonly (SwapContribution | StoredSwapContribution)[],
	ns: string,
	declaredSpecs: ReadonlyMap<string, unknown>,
): string[] {
	const out: string[] = []
	const seen = new Set<string>()
	for (const c of swaps) {
		const { spec, node, definition } = storedSwap(c)
		if (!spec?.includes(':spec/')) out.push(`swap names spec '${spec}', which is not a spec id`)
		if (!node) out.push(`swap onto '${spec}' names no node`)
		if (!DEFINITION_ID.test(definition)) {
			out.push(
				`swap onto '${spec}#${node}' names definition '${definition}', which is not a pinned id ('ns:kind/name@N') — pass the pin`,
			)
			continue
		}
		const owner = definition.slice(0, definition.indexOf(':'))
		if (owner !== ns)
			out.push(
				`swap '${definition}' is owned by '${owner}' — a package contributes its own definitions`,
			)
		if (declaredSpecs.has(spec) || spec.startsWith(`${ns}:`))
			out.push(
				`'${spec}' is this package's own spec — list the swap on its node with expose.swaps, not as a contribution`,
			)
		const key = `${spec}#${node}#${definition}`
		if (seen.has(key)) out.push(`contributes '${definition}' to '${spec}#${node}' twice`)
		seen.add(key)
	}
	return out
}

/** What one pass over a package's declarations produces. @experimental */
export interface DeclarationFindings {
	errors: string[]
	/** What is declared as written but draws otherwise — a layout over a widget's `maxInstances`. Never refuses. */
	warnings: string[]
	/** The preset coverage report and the `todo()` holes — useful even on a refusal. */
	coverage: CoverageReport
	/** Ids referenced but not declared here; the instance enforces these at install. */
	requires: string[]
}

/**
 * The display text of one labelled declaration (R-20): `label` is required
 * — a config, a preset and a prompt are all listed by it — `description` is
 * not.
 * @experimental
 */
export function labelFindings(
	at: string,
	meta: { label?: unknown; description?: unknown },
): string[] {
	return [
		...i18nFindings(meta.label, `${at}.label`, { required: true }),
		...i18nFindings(meta.description, `${at}.description`),
	]
}

/**
 * A package declares only its own genres. Referencing another's is done from a
 * spec's input binding, which is a reference rather than a claim of ownership.
 * @experimental
 */
export function genreOwnershipFindings(genres: readonly GenreDecl[], ns: string): string[] {
	const out: string[] = []
	for (const decl of genres) {
		const owner = decl.id.slice(0, decl.id.indexOf(':'))
		if (owner !== ns)
			out.push(
				`genre '${decl.id}' is owned by '${owner}' — a package declares only its own ` +
					`genres; referencing another's is done from a spec's input binding`,
			)
	}
	return out
}

/** A spec's nodes, built or compiled — both carry `nodes` with `definitionId` and `definitionVersion`. */
const nodesOf = (s: AnnouncedSpec) =>
	s.nodes as ReadonlyArray<{
		key: string
		definitionId: string
		definitionVersion: number
		expose?: { session?: boolean; swaps?: string[] }
	}>

/** The registered definition a node seats, when this SDK knows it. */
const definitionOfNode = (n: { definitionId: string; definitionVersion: number } | undefined) =>
	n ? getDefinition(`${n.definitionId}@${n.definitionVersion}`) : undefined

/**
 * A compiled document's `expose.swaps` (R28), checked as the builder checks
 * them: known ids that do not fit are refused; ids this SDK does not know are
 * the instance's to check at install.
 * @experimental
 */
export function exposeSwapFindings(pipelines: readonly AnnouncedSpec[]): string[] {
	const out: string[] = []
	for (const s of pipelines)
		for (const n of nodesOf(s)) {
			const pinned = definitionOfNode(n)
			if (!pinned || !n.expose?.swaps?.length) continue
			for (const id of n.expose.swaps) {
				const swap = getDefinition(id)
				const misfit = swap && swapFitFinding(n.key, pinned, swap)
				if (misfit) out.push(`pipeline '${s.id}': ${misfit}`)
			}
		}
	return out
}

/**
 * The input lock (24 §4): a spec that answers a session event names the genre it
 * serves, and the event is one core declares or one this package namespaced.
 * A genre the package does not declare is recorded as a requirement.
 * @experimental
 */
export function inputLockFindings(
	pipelines: readonly AnnouncedSpec[],
	declaredGenres: ReadonlySet<string>,
	ns: string,
	requires: Set<string>,
): string[] {
	const out: string[] = []
	for (const s of pipelines) {
		// One `event`, or several `events` (PLAN-turn-order §4.1): judged alike.
		const locked = lockedEvents(s.input)
		if (!locked.length) continue
		const genreId = s.input?.genre
		if (!genreId) {
			// The builder refuses this at authoring time; a hand-built
			// document gets the same answer here.
			out.push(`pipeline '${s.id}' answers '${locked.join(', ')}' with no genre (24 §4)`)
			continue
		}
		if (!declaredGenres.has(genreId)) requires.add(genreId)
		// Core's events, and the events packages declared: a lock on anything
		// else would compile on an event nothing can cause.
		for (const event of locked) {
			if (!eventById(event)) out.push(`pipeline '${s.id}': ${notADeclaredEvent(event)}`)
			else if (event === sessionEvents.turnOrderChanged)
				out.push(`pipeline '${s.id}': ${TURN_ORDER_CHANGED_IS_INTERNAL}`)
		}
		// The builder checks an `events` lock against its inlet (R33); a
		// compiled document handed in directly gets the same sentence here,
		// wherever the inlet's definition is known to this SDK.
		if (s.input?.events?.length) {
			const inlet = definitionOfNode(nodesOf(s)[0])
			if (inlet) for (const f of eventsLockFindings(inlet, s.input.events)) out.push(`pipeline '${s.id}': ${f}`)
		}
	}
	return out
}

/**
 * The events an inlet lock answers: the one `event`, or the `events` list
 * (PLAN-turn-order §4.1) — as one list, so every reader of the lock asks
 * one question. Empty for a spec with no lock.
 * @experimental
 */
export function lockedEvents(
	input: { event?: string; events?: string[] } | undefined,
): string[] {
	if (!input) return []
	if (input.events?.length) return [...input.events]
	return input.event ? [input.event] : []
}

/** Does this lock answer `event` — as its one `event`, or one of its `events`? @experimental */
export const lockAnswers = (
	input: { event?: string; events?: string[] } | undefined,
	event: string,
): boolean => lockedEvents(input).includes(event)

/** Exactly one create pipeline per declared genre (24 §3). @experimental */
export function createPipelineFindings(
	genres: readonly GenreDecl[],
	pipelines: readonly AnnouncedSpec[],
): string[] {
	const out: string[] = []
	for (const g of genres) {
		const creates = pipelines.filter(
			(s) => s.input?.genre === g.id && s.input?.event === sessionEvents.sessionCreated,
		)
		if (creates.length === 0)
			out.push(
				`genre '${g.id}' has no create pipeline — every genre needs exactly one ` +
					`spec answering '${sessionEvents.sessionCreated}' (24 §3)`,
			)
		if (creates.length > 1)
			out.push(
				`genre '${g.id}' has ${creates.length} create pipelines ` +
					`(${creates.map((s) => s.id).join(', ')}) — exactly one (24 §3)`,
			)
	}
	return out
}

/**
 * **A custom pipeline must include a default preset** (owner ruling,
 * 2026-10-02, notes 27/28). The Pipelines view is Genre → Preset →
 * pipelines, and a genre's pipelines are reached only through a session
 * preset: a package that declares a genre and no preset for it ships
 * pipelines nobody can start a session on or find under their genre. The
 * first preset a package declares for its genre is the one an instance makes
 * that genre's default when it has none (`registrySync`); a package that
 * contributes to another package's genre needs none of its own.
 * @experimental
 */
export function genrePresetFindings(
	genres: readonly GenreDecl[],
	presets: readonly PresetDecl[],
): string[] {
	const out: string[] = []
	for (const g of genres) {
		if (presets.some((p) => p.genre === g.id)) continue
		out.push(
			`genre '${g.id}' has no preset — a custom pipeline must include a default preset: ` +
				`declare a preset() for this genre binding its pipelines, so sessions can start ` +
				`on it and the Pipelines view lists them under it (the first one is the genre's default)`,
		)
	}
	return out
}

/**
 * Contributed actions (R-15, U5c): each declaration sound, and one slash name
 * meaning one function across the whole package — the per-document check cannot
 * see two specs of one package claiming `/acme.roll` for two different things,
 * so the package is the first place the collision rule runs across documents;
 * the install is the second.
 * @experimental
 */
export function contributedActionFindings(pipelines: readonly AnnouncedSpec[]): string[] {
	const out: string[] = []
	const packageActions: ReturnType<typeof actionsOf> = []
	for (const s of pipelines) {
		// A built spec keeps its contributions on `meta`; a document carries
		// them at the top — one reader for both.
		const contributed = { id: s.id, contributes: 'meta' in s ? s.meta.contributes : s.contributes }
		for (const finding of actionDocumentFindings(contributed))
			out.push(`pipeline '${s.id}': ${finding}`)
		packageActions.push(...actionsOf(contributed))
	}
	out.push(...slashCollisions(packageActions))
	return out
}

/**
 * Prompts: slugs unique per POOL, which is `(node type, slot)`.
 *
 * Uniqueness is per pool and not global: `summarize-scene-default` names a row
 * in the batch, synth and naming pools, and they are three different prompts
 * that happen to have been split out of one bundle.
 *
 * A prompt for a node this package does not announce is deliberately NOT
 * recorded as a requirement. It is the whole point of node scoping that a
 * package may ship prose for somebody else's node, and a node type is neither a
 * genre nor a spec slug — the only two shapes an instance can check. Listing one
 * would make every install fail permanently on a requirement nothing can ever
 * satisfy, where the real failure mode is mild and self-announcing: the row
 * seeds into a pool no installed pipeline offers, and is simply never shown.
 * @experimental
 */
export function promptFindings(prompts: readonly PromptDecl[]): string[] {
	const out: string[] = []
	const seen = new Set<string>()
	for (const pr of prompts) {
		out.push(...i18nFindings(pr.label, `prompt '${pr.slug}'.label`, { required: true }))
		const pool = `${pr.nodeType}#${pr.slot}`
		const key = `${pool}#${pr.slug}`
		if (seen.has(key)) out.push(`duplicate prompt '${pr.slug}' for '${pool}'`)
		seen.add(key)
	}
	return out
}

/** Configs: node keys verified for declared specs; slugs unique per spec. @experimental */
export function configFindings(
	configs: readonly ConfigDecl[],
	declaredSpecs: ReadonlyMap<string, AnnouncedSpec>,
	requires: Set<string>,
): string[] {
	const out: string[] = []
	const seen = new Set<string>()
	for (const c of configs) {
		out.push(...labelFindings(`config '${c.slug}'`, c))
		const key = `${c.spec}#${c.slug}`
		if (seen.has(key)) out.push(`duplicate config '${c.slug}' for '${c.spec}'`)
		seen.add(key)
		const target = declaredSpecs.get(c.spec)
		if (!target) {
			requires.add(c.spec)
			continue
		}
		for (const nodeKey of Object.keys(c.values))
			if (!target.nodes.some((n) => n.key === nodeKey))
				out.push(`config '${c.slug}' for '${c.spec}' addresses unknown node '${nodeKey}'`)
	}
	return out
}

/** Presets: validated against the genre's event surface, with the coverage (24 §7). @experimental */
export function presetFindings(
	presets: readonly PresetDecl[],
	declaredGenres: ReadonlyMap<string, GenreDecl>,
	declaredSpecs: ReadonlyMap<string, AnnouncedSpec>,
	configs: readonly ConfigDecl[],
	requires: Set<string>,
): { errors: string[]; coverage: CoverageReport['presets'] } {
	const errors: string[] = []
	const coverage: CoverageReport['presets'] = []
	for (const p of presets) {
		errors.push(...labelFindings(`preset '${p.slug}'`, p))
		const g = declaredGenres.get(p.genre)
		if (!g) requires.add(p.genre)
		const surface: Record<string, { required?: boolean; open?: boolean }> = g
			? { ...g.events }
			: {}
		// Slots the preset binds beyond the declared surface are errors when
		// the genre is ours to know; recorded when it is not.
		const slots: CoverageSlot[] = []
		const events = new Set([...Object.keys(surface), ...Object.keys(p.bindings)])
		for (const event of events) {
			const declared = surface[event]
			const binding = p.bindings[event]
			// A binding is keyed by event ID, whoever owns the genre (R-4).
			// A bare name (`message-respond`) is the pre-fold spelling; a
			// package carrying one would have its keys reverted by every
			// boot's preset sync and bind nothing, silently.
			// A binding keyed by an undeclared event — even to a spec another
			// package ships — fills a slot no event can ever reach.
			if (binding && isEventId(event) && !eventById(event)) {
				errors.push(`preset '${p.slug}': ${notADeclaredEvent(event)}`)
				continue
			}
			if (binding && !isEventId(event)) {
				errors.push(
					`preset '${p.slug}' binds '${event}', which is not an event id — bindings ` +
						`are keyed 'owner:event/name@N' (sessionEvents.messageRespond is ` +
						`'${sessionEvents.messageRespond}'), never by bare name (R-4)`,
				)
				continue
			}
			if (g && !declared && binding) {
				errors.push(
					`preset '${p.slug}' binds '${event}', which genre '${p.genre}' does not declare`,
				)
				continue
			}
			if (!binding) {
				const required = !!declared?.required
				if (required)
					errors.push(
						`preset '${p.slug}' leaves required slot '${event}' of '${p.genre}' unbound`,
					)
				slots.push({
					event,
					required,
					status: required ? 'MISSING' : 'unbound',
				})
				continue
			}
			const bound = declaredSpecs.get(binding.spec)
			if (!bound) {
				requires.add(binding.spec)
				slots.push({
					event,
					required: !!declared?.required,
					binding,
					status: 'bound-external',
				})
			} else {
				if (!lockAnswers(bound.input, event))
					errors.push(
						`preset '${p.slug}' binds '${bound.id}' to '${event}', but that spec ` +
							`answers '${lockedEvents(bound.input).join(', ') || 'nothing'}' (24 §4)`,
					)
				if (bound.input?.genre !== p.genre)
					errors.push(
						`preset '${p.slug}' (genre '${p.genre}') binds '${bound.id}', which ` +
							`serves '${bound.input?.genre ?? 'no genre'}' (24 §4)`,
					)
				if (
					binding.config &&
					!configs.some((c) => c.spec === binding.spec && c.slug === binding.config)
				)
					errors.push(
						`preset '${p.slug}' names config '${binding.config}' of ` +
							`'${binding.spec}', which this package does not declare`,
					)
				slots.push({
					event,
					required: !!declared?.required,
					binding,
					status: 'bound',
				})
			}
		}
		// Seeded swaps (R40): the shape is checked here; whether the node offers
		// the definition is the instance's to check at create.
		for (const c of p.defaults?.swaps ?? []) {
			const { spec, node, definition } = storedSwap(c)
			if (!spec?.includes(':spec/'))
				errors.push(`preset '${p.slug}' seeds a swap on '${spec}', which is not a spec id`)
			if (!node) errors.push(`preset '${p.slug}' seeds a swap onto '${spec}' that names no node`)
			if (!DEFINITION_ID.test(definition))
				errors.push(
					`preset '${p.slug}' seeds a swap onto '${spec}#${node}' naming '${definition}', which is not a pinned id — pass the pin`,
				)
			// A spec this package declares is checkable here, so a seed that
			// would be refused at every create is refused now instead (R26):
			// the node must offer the definition, and the spec must serve the
			// preset's genre.
			const own = declaredSpecs.get(spec)
			if (own && node) {
				if (own.input?.genre && own.input.genre !== p.genre)
					errors.push(
						`preset '${p.slug}' (genre '${p.genre}') seeds a swap on '${spec}', which serves '${own.input.genre}'`,
					)
				const n = (own.nodes as ReadonlyArray<{ key: string; definitionId: string; definitionVersion: number; expose?: { session?: boolean; swaps?: string[] } }>).find((x) => x.key === node)
				const offered = n ? [`${n.definitionId}@${n.definitionVersion}`, ...(n.expose?.swaps ?? [])] : []
				if (!n) errors.push(`preset '${p.slug}' seeds a swap onto '${spec}#${node}', which has no such node`)
				else if (!(n.expose as { session?: boolean } | undefined)?.session)
					errors.push(`preset '${p.slug}' seeds a swap onto '${spec}#${node}', which is not in session settings (expose)`)
				else if (!offered.includes(definition))
					errors.push(
						`preset '${p.slug}' seeds '${definition}' onto '${spec}#${node}', which offers ${offered.map((o) => `'${o}'`).join(', ')}`,
					)
			}
		}
		// An included action names a spec by its identity's first half; a spec
		// this package does not declare is a requirement on the install.
		for (const a of p.actions?.include ?? []) {
			const hash = a.lastIndexOf('#')
			const specId = hash === -1 ? a : a.slice(0, hash)
			if (!declaredSpecs.has(specId)) requires.add(specId)
		}
		coverage.push({ preset: p.slug, genre: p.genre, slots })
	}
	return { errors, coverage }
}

/**
 * Surfaces: an entry that does not exist at install is a blank panel nobody can
 * debug, so the shape is checked where the author can still fix it. What is *at*
 * the path is the packager's business.
 * @experimental
 */
export function surfaceFindings(surfaces: SurfacesDecl | undefined): string[] {
	const out: string[] = []
	// A frame placed in the session layout is a widget whose component holds
	// an `sp-frame` — never a declaration of its own.
	if ((surfaces as { panels?: unknown } | undefined)?.panels !== undefined)
		out.push(
			'surfaces.panels is gone — declare each panel as a widget in `widgets` naming a component, ' +
				'and place an `sp-frame` inside the component for the document',
		)
	for (const [where, decl] of [
		['session-view', surfaces?.['session-view']],
		['page', surfaces?.page],
	] as const) {
		if (decl && !decl.entry) out.push(`surfaces.${where} has no entry document`)
		else if (decl?.entry && !isServableEntry(decl.entry))
			out.push(`surfaces.${where} entry '${decl.entry}' is not a path a pub will serve`)
		if ((decl as { settings?: unknown } | undefined)?.settings !== undefined)
			out.push(
				`surfaces.${where}.settings is gone — a ${where} frame is handed no declared values; ` +
					'declare settings on a widget, which its component reads as `ctx.settings`',
			)
	}
	return out
}

/** A component's slug: it names the built module (`components/<slug>.js`), so never a path. @experimental */
export const COMPONENT_SLUG = /^[a-z][a-z0-9-]*$/
/** A component source hash: SHA-256, lowercase hex. */
const SOURCE_HASH = /^[0-9a-f]{64}$/

/**
 * Components (§3.5, R25): one slug, a label, a servable entry and a
 * framework SDK 1.0 ships. There is no mount point on the declaration — a
 * widget names the component, and that is where it mounts.
 * @experimental
 */
export function componentFindings(components: readonly ComponentDecl[]): string[] {
	const out: string[] = []
	const slugs = new Set<string>()
	for (const [i, c] of components.entries()) {
		const at = `component '${c?.slug ?? `components[${i}]`}'`
		if (!c?.slug) out.push(`components[${i}] has no slug — a widget's component names it`)
		else if (!COMPONENT_SLUG.test(c.slug))
			out.push(`component slug '${c.slug}' is lowercase letters, digits and '-' — it names the built module's file`)
		else if (slugs.has(c.slug)) out.push(`duplicate component slug '${c.slug}' — a widget's component names it`)
		else slugs.add(c.slug)
		out.push(...i18nFindings(c?.label, `${at}.label`, { required: true }))
		if (!c?.entry) out.push(`${at} has no entry`)
		// `./dist/x.js` is a module path's ordinary spelling; the manifest
		// carries it without the `./` (the CLI strips it).
		else if (!isServableEntry(c.entry.replace(/^\.\//, '')))
			out.push(`${at} entry '${c.entry}' is not a path a pub will serve`)
		if ((c as { surface?: unknown })?.surface !== undefined)
			out.push(
				`${at} names a surface point — a component has none now; declare a widget whose ` +
					`\`component\` is '${c.slug}' (R25)`,
			)
		if (c?.basedOn && (typeof c.basedOn.component !== 'string' || typeof c.basedOn.version !== 'string'))
			out.push(`${at}.basedOn is { component, version, sourceHash? } — the upstream a clone was made from`)
		else if (c?.basedOn?.sourceHash !== undefined && !SOURCE_HASH.test(String(c.basedOn.sourceHash)))
			out.push(`${at}.basedOn.sourceHash is the upstream source's SHA-256, 64 lowercase hex digits`)
		// Svelte and vanilla at SDK 1.0 (R35); the seam takes more later.
		if (c?.framework && !COMPONENT_FRAMEWORKS.includes(c.framework as never))
			out.push(
				(['react', 'preact'] as string[]).includes(c.framework)
					? `component '${c.slug}' declares framework '${c.framework}', which arrives after SDK 1.0 — ` +
							`use ${COMPONENT_FRAMEWORKS.map((f) => `'${f}'`).join(' or ')}`
					: `component '${c.slug}' declares framework '${c.framework}', which is not a component ` +
							`framework — SDK 1.0 ships ${COMPONENT_FRAMEWORKS.map((f) => `'${f}'`).join(' and ')}`,
			)
	}
	return out
}

/**
 * A package's widgets name its own components (R25): every genre panel with
 * a `component` must name a `ComponentDecl` this package declares — a plugin
 * cannot mount core's or another plugin's component by slug.
 * @experimental
 */
export function widgetComponentFindings(
	genres: readonly GenreDecl[],
	components: readonly ComponentDecl[],
): string[] {
	const declared = new Set(components.map((c) => c?.slug).filter(Boolean))
	const out: string[] = []
	for (const g of genres)
		for (const w of g.shape?.panels ?? []) {
			if (typeof w?.component !== 'string') continue
			if (!declared.has(w.component))
				out.push(
					`${g.id} panel '${w.id}' names component '${w.component}', which this package ` +
						`does not declare — add it to \`components\``,
				)
		}
	return out
}

/**
 * A package's widgets (R71): each names a component the package declares
 * (core's own widgets name core components — a plugin's cannot), and each id
 * is unique in the package, because the package's namespace plus the id is
 * the id every layout row keys on.
 * @experimental
 */
export function packageWidgetFindings(
	widgets: readonly WidgetDecl[],
	components: readonly ComponentDecl[],
): string[] {
	const declared = new Set(components.map((c) => c?.slug).filter(Boolean))
	const out: string[] = []
	const ids = new Set<string>()
	for (const w of widgets) {
		if (ids.has(w?.id)) out.push(`two widgets are '${w?.id}' — a widget id names one`)
		ids.add(w?.id)
		if (coreWidgetIds().has(w?.id))
			out.push(`widget '${w.id}' is core's widget's id — a layout names core's and yours by bare id, so choose another`)
		if (typeof w?.component === 'string' && !declared.has(w.component))
			out.push(`widget '${w.id}' names component '${w.component}', which this package does not declare — add it to \`components\``)
		if (!w?.component) out.push(`widget '${w?.id}' names no component`)
		if ((w as { surface?: unknown } | undefined)?.surface !== undefined)
			out.push(`widget '${w.id}': \`surface\` is gone — name a component, and place an \`sp-frame\` inside it for a document`)
		out.push(...widgetReadsFindings(w?.reads, `widget '${w?.id}' reads`))
	}
	return out
}

/**
 * The layouts a package's genres ship, read as a whole package — what
 * `genre()` and `layout()` cannot see, since a layout names widgets by id and
 * only the package holds their declarations:
 *
 * - **The primary floor** (an error). A genre that withholds the
 *   conversation draws, in the layout it ships first, a widget of this
 *   package declared `role: 'primary'` — the one standing in the
 *   conversation's place. `genre()` asks only that the layout draws
 *   something. A widget of another package (a namespaced id) is that
 *   package's to declare, and is taken as written. Needs the package's
 *   widgets, so a package that states none is not judged.
 * - **What draws, but not as written** (warnings): every warning
 *   `validateSessionLayout` has for a shipped layout — an id placed but never
 *   drawn, two items on one cell, and one of the package's widgets placed
 *   more often than its `maxInstances`.
 * @experimental
 */
export function genreLayoutFindings(
	genres: readonly GenreDecl[],
	widgets: readonly WidgetDecl[] | undefined,
	ns: string,
): { errors: string[]; warnings: string[] } {
	const errors: string[] = []
	const warnings: string[] = []
	// A layout names the package's own widgets by bare id (`someWidget.id`);
	// one written through `widgetRef` carries the package's namespace. Both
	// spellings are the package's widget.
	const own = (id: string): WidgetDecl | undefined => {
		const widget = widgetOfInstance(id)
		const bare = widget.startsWith(`${ns}:`) ? widget.slice(ns.length + 1) : widget
		return widgets?.find((w) => w?.id === bare)
	}
	const capped = (widgets ?? [])
		.filter((w) => typeof w?.maxInstances === 'number')
		.flatMap((w) => [w, { id: `${ns}:${w.id}`, maxInstances: w.maxInstances }])
	for (const g of genres) {
		const layouts = g.layouts ?? []
		for (const l of layouts)
			for (const w of validateSessionLayout(l.preset, { widgets: capped }).warnings)
				warnings.push(`${g.id} layout '${l.slug}': ${w}`)
		if (!widgets || !layouts[0] || !(g.omitWidgets ?? []).includes(CONVERSATION_WIDGET_ID)) continue
		const drawn = drawnWidgetIds(layouts[0].preset)
		const standsIn = drawn.some((id) => {
			const decl = own(id)
			if (decl) return decl.role === 'primary'
			const widget = widgetOfInstance(id)
			return widget.includes(':') && !widget.startsWith(`${ns}:`)
		})
		if (!standsIn)
			errors.push(
				`${g.id} omits the conversation, and its layout '${layouts[0].slug}' draws none of this package's ` +
					`role: 'primary' widgets${drawn.length ? ` (it draws ${drawn.map((id) => `'${id}'`).join(', ')})` : ''} — ` +
					`declare the widget that stands in its place role: 'primary', and place it (any zone)`,
			)
	}
	return { errors, warnings }
}

/** Deliberate holes: `todo()` sentinels found in config values, with their paths (24 §7). @experimental */
export function todoHoles(configs: readonly ConfigDecl[]): CoverageReport['todos'] {
	const out: CoverageReport['todos'] = []
	for (const c of configs)
		for (const [nodeKey, slots] of Object.entries(c.values))
			for (const [slot, value] of Object.entries(slots))
				if (isTodo(value))
					out.push({
						path: `${c.spec}#${c.slug} → ${nodeKey}.${slot}`,
						note: value['todo@1'].note,
					})
	return out
}

/**
 * Every check above, over one package's declarations — what both authoring
 * surfaces run so that one mistake gets one sentence wherever it was written.
 * @experimental
 */
export function declarationFindings(p: DeclaredPackage): DeclarationFindings {
	const genres = p.genres ?? []
	const pipelines = p.pipelines ?? []
	const configs = p.configs ?? []
	const requires = new Set<string>()
	const declaredGenres = new Map(genres.map((g) => [g.id, g]))
	const declaredSpecs = new Map(pipelines.map((s) => [s.id, s]))

	const errors = [
		...genreOwnershipFindings(genres, p.ns),
		...inputLockFindings(pipelines, new Set(declaredGenres.keys()), p.ns, requires),
		...createPipelineFindings(genres, pipelines),
		...genrePresetFindings(genres, p.presets ?? []),
		...contributedActionFindings(pipelines),
		...exposeSwapFindings(pipelines),
		...swapContributionFindings(p.swaps ?? [], p.ns, declaredSpecs),
		...promptFindings(p.prompts ?? []),
		...configFindings(configs, declaredSpecs, requires),
		...eventDeclarationFindings(p.events ?? [], p.ns, pipelines, declaredGenres, requires, p.presets ?? []),
		...annexDeclarationFindings(p.ns, pipelines, p.annexFields),
	]
	// A genre's surface includes the events this package declares for it (R52).
	const withEvents = new Map(
		[...declaredGenres].map(([id, g]) => {
			const own = (p.events ?? []).filter((e) => e.genre === id)
			if (!own.length) return [id, g]
			return [id, { ...g, events: { ...g.events, ...Object.fromEntries(own.map((e) => [e.event, {}])) } }]
		}),
	)
	const presets = presetFindings(
		p.presets ?? [],
		withEvents as typeof declaredGenres,
		declaredSpecs,
		configs,
		requires,
	)
	errors.push(
		...presets.errors,
		...surfaceFindings(p.surfaces),
		...componentFindings(p.components ?? []),
		...widgetComponentFindings(genres, p.components ?? []),
		...packageWidgetFindings(p.widgets ?? [], p.components ?? []),
	)
	const layouts = genreLayoutFindings(genres, p.widgets, p.ns)
	errors.push(...layouts.errors)

	return {
		errors,
		warnings: layouts.warnings,
		coverage: { presets: presets.coverage, todos: todoHoles(configs) },
		requires: [...requires].sort(),
	}
}

/**
 * The binding subjects a spec serves: its inlet lock's events, or — on
 * the action event — its actions' identities (`<spec slug>#<key>`).
 * @internal
 */
export const subjectsOf = (spec: AnnouncedSpec): string[] => {
	const lock = (spec as { input?: { event?: string; events?: string[] } }).input
	const locked = lock?.events ? [...lock.events] : lock?.event ? [lock.event] : []
	if (!locked.includes(sessionEvents.sessionAction)) return locked
	const contributes = 'meta' in spec ? spec.meta.contributes : (spec as SpecDocument).contributes
	const keys = actionsOf({ id: spec.id, contributes }).map((a) => a.key)
	return [...locked.filter((e) => e !== sessionEvents.sessionAction), ...keys.map((k) => `${spec.id}#${k}`)]
}

/**
 * A package's events: each under the package's namespace, declared for a
 * genre (once per genre), recordable by at least one subject or by any spec.
 * Every pipeline of this package that records one of them is locked to a
 * genre the event is declared for and serves a subject in that genre's
 * scope; a lock or a preset naming one uses a genre it is declared for. An
 * event under this package's namespace that `events` does not list is
 * refused — it has no scope. Another package's event is a requirement: its
 * scope is that package's, and the instance checks it.
 * @experimental
 */
export function eventDeclarationFindings(
	events: readonly StoredEventDeclaration[],
	ns: string,
	pipelines: readonly AnnouncedSpec[],
	declaredGenres: ReadonlyMap<string, unknown>,
	requires: Set<string>,
	presets: readonly PresetDecl[] = [],
): string[] {
	const out: string[] = []
	const keyOf = (event: string, genre: string) => `${event} ${genre}`
	const byKey = new Map<string, StoredEventDeclaration>()
	const genresOf = new Map<string, Set<string>>()
	for (const e of events) {
		const owner = e.event.slice(0, e.event.indexOf(':'))
		if (owner !== ns) out.push(`event '${e.event}' is declared by '${ns}' but sits under '${owner}' — a package declares its own`)
		if (!declaredGenres.has(e.genre)) requires.add(e.genre)
		if (e.recordedBy !== 'any' && !e.recordedBy.length)
			out.push(`event '${e.event}' names nothing that may record it`)
		if (byKey.has(keyOf(e.event, e.genre)))
			out.push(`event '${e.event}' is declared twice for genre '${e.genre}'`)
		byKey.set(keyOf(e.event, e.genre), e)
		genresOf.set(e.event, new Set([...(genresOf.get(e.event) ?? []), e.genre]))
	}
	const isOwn = (id: string) => id.slice(0, id.indexOf(':')) === ns
	const unlisted = (id: string, where: string) =>
		`${where} names '${id}', this package's own event, but defineExtension({ events }) does not list it — ` +
		`add { event, genre, recordedBy } so it has a genre and a scope`
	for (const spec of pipelines) {
		const lock = (spec as { input?: { genre?: string; event?: string; events?: string[] } }).input
		const lockGenre = lock?.genre
		// A lock on an own event names a genre the event is declared for.
		for (const heard of lock?.events ?? (lock?.event ? [lock.event] : [])) {
			if (heard.startsWith('core:') || !isOwn(heard)) continue
			const genres = genresOf.get(heard)
			if (!genres) out.push(unlisted(heard, `pipeline '${spec.id}'`))
			else if (lockGenre && !genres.has(lockGenre))
				out.push(
					`pipeline '${spec.id}' listens for '${heard}' on '${lockGenre}', but it is declared for ` +
						`${[...genres].join(', ')}`,
				)
		}
		const nodes = spec.nodes as ReadonlyArray<{
			key: string
			definitionId: string
			definitionVersion: number
			config: Record<string, unknown>
		}>
		for (const n of nodes) {
			const from = getDefinition(`${n.definitionId}@${n.definitionVersion}`)?.causesEventFrom
			const recorded = from ? n.config?.[from] : undefined
			if (typeof recorded !== 'string') continue
			const genres = genresOf.get(recorded)
			if (!genres) {
				if (isOwn(recorded)) out.push(unlisted(recorded, `pipeline '${spec.id}' at '${n.key}'`))
				else requires.add(recorded)
				continue
			}
			const decl = lockGenre ? byKey.get(keyOf(recorded, lockGenre)) : undefined
			if (!decl) {
				out.push(
					`pipeline '${spec.id}' records '${recorded}' at '${n.key}' for genre '${lockGenre ?? 'none'}', ` +
						`but it is declared for ${[...genres].join(', ')}`,
				)
				continue
			}
			if (decl.recordedBy === 'any') continue
			const subjects = subjectsOf(spec)
			if (!subjects.some((sub) => (decl.recordedBy as string[]).includes(sub)))
				out.push(
					`pipeline '${spec.id}' records '${recorded}' at '${n.key}', but serves none of the subjects that may ` +
						`record it (${(decl.recordedBy as string[]).join(', ')}) — add one of its subjects to recordedBy, ` +
						`or declare your own event`,
				)
		}
	}
	// A preset binds an own event only on a genre it is declared for.
	for (const p of presets)
		for (const event of Object.keys(p.bindings ?? {})) {
			if (event.startsWith('core:') || !isOwn(event)) continue
			const genres = genresOf.get(event)
			if (!genres) out.push(unlisted(event, `preset '${p.slug}'`))
			else if (!genres.has(p.genre))
				out.push(`preset '${p.slug}' binds '${event}' on '${p.genre}', but it is declared for ${[...genres].join(', ')}`)
		}
	return out
}

/**
 * Every `set-session-annex` step of the package's pipelines writes only keys
 * its owner declares (owner ruling 2026-09-26) — the package's own
 * `annexFields`, or, for a step that names another owner, that owner's
 * declaration where this process knows it. Judged where the keys are
 * literal; a wired `value` is the host's to judge at the write.
 * @internal
 */
export function annexDeclarationFindings(
	ns: string,
	pipelines: readonly AnnouncedSpec[],
	fields: readonly AnnexFieldDecl[] | undefined,
): string[] {
	if (fields === undefined) return []
	const out: string[] = []
	for (const spec of pipelines) {
		const s = spec as unknown as Parameters<typeof annexStepFindings>[0]
		for (const hit of annexStepFindings(s, (owner) => (owner === ns ? fields : annexDeclarationOf(owner))))
			for (const r of hit.refusals) out.push(`pipeline '${spec.id}' at '${hit.nodeKey}': ${r}`)
	}
	return out
}
