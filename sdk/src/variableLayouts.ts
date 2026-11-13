/**
 * 🚧 **Variable layouts by reference** — the name a context template, a
 * preset and the pub use to point at one of a variable's layouts, and the
 * typed builder a plugin ships one with.
 *
 * A variable is written out by one layout, chosen once for the whole pub; a
 * preset may decide differently for its sessions, per variable; a context
 * template that wants a different one names it in place:
 *
 * ```hbs
 * {{{layout characters "core/json@1"}}}
 * ```
 * ```liquid
 * {{ characters | layout: "core/json@1" }}
 * ```
 *
 * ## The layout reference
 *
 * `<owner>/<slug>@<major>`: the owner is a plugin slug (`acme.dice`) or
 * `core`, the slug is kebab-case, the major a positive integer and always
 * written. Unique within its variable, so `core/json@1` names one layout of
 * `characters` and another of `personas`.
 *
 * ⚠ Not a **template id** (`acme:template/omens-prose@1`), the row's
 * app-wide identity. ⚠ Not a session layout (a genre's `layouts`).
 * @experimental
 * @ruling PLAN-variable-layouts-2026-11-10 ★4, ★7
 */

import type { EngineId } from './engines.js'
import type { TemplateCheckOptions, TemplateScope, VarField } from './template.js'
import { templateSeedProblems, type TemplateSeed } from './templateIds.js'
import type { VariableDecl } from './variables.js'

/**
 * The slug half of a layout reference: kebab-case. Also what
 * `TemplateSeed.slug` must read.
 * @experimental
 */
export const VARIABLE_LAYOUT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** A plugin slug (`acme.dice`) or `core`. */
const OWNER = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

/**
 * A layout reference: `<owner>/<slug>@<major>` — `core/json@1`,
 * `acme.dice/prose@2`. Module-private: `parseVariableLayoutReference` is the
 * one way to read one.
 */
const VARIABLE_LAYOUT_REFERENCE =
	/^([a-z0-9]+(?:[.-][a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9]\d*)$/

/** The three parts of a layout reference. @experimental */
export interface VariableLayoutReferenceParts {
	/** A plugin slug, or `core`. */
	owner: string
	/** Kebab-case. */
	slug: string
	/** A positive integer. */
	major: number
}

/**
 * Split a layout reference, or `null` when it is not one.
 * @experimental
 */
export function parseVariableLayoutReference(value: unknown): VariableLayoutReferenceParts | null {
	if (typeof value !== 'string') return null
	const m = VARIABLE_LAYOUT_REFERENCE.exec(value)
	if (!m) return null
	return { owner: m[1]!, slug: m[2]!, major: Number(m[3]) }
}

/**
 * Write a layout reference from its parts. Throws, in words, on a part
 * outside the grammar — the one place a reference is spelled.
 * @experimental
 */
export function formatVariableLayoutReference(parts: VariableLayoutReferenceParts): string {
	const { owner, slug, major } = parts ?? ({} as VariableLayoutReferenceParts)
	if (typeof owner !== 'string' || !OWNER.test(owner))
		throw new Error(
			`layout reference owner '${String(owner)}' is not a plugin slug or 'core' — ` +
				`lowercase letters and digits, joined by '.' or '-' (acme.dice).`,
		)
	if (typeof slug !== 'string' || !VARIABLE_LAYOUT_SLUG.test(slug))
		throw new Error(
			`layout reference slug '${String(slug)}' is not kebab-case — lowercase letters and ` +
				`digits joined by '-' (titled-json).`,
		)
	if (typeof major !== 'number' || !Number.isInteger(major) || major < 1)
		throw new Error(`layout reference major '${String(major)}' is not a positive whole number.`)
	return `${owner}/${slug}@${major}`
}

/**
 * The helper (Handlebars) and filter (Liquid) a context template names a
 * layout with: `{{{layout characters "core/json@1"}}}`,
 * `{{ characters | layout: "core/json@1" }}`. Inside a template no session
 * layout can appear, so the bare word is unambiguous there.
 * @experimental
 */
export const VARIABLE_LAYOUT_HELPER = 'layout'

/**
 * One layout a variable offers, as a `layout` call's completion and hover
 * list it, and as the template check accepts it
 * (`TemplateCheckOptions.variableLayoutOffers`).
 * @experimental
 */
export interface VariableLayoutOffer {
	/** `core/json@1`. */
	reference: string
	/** The layout's display name — `JSON`, `Titled JSON block`. */
	label: string
}

/**
 * A variable id split into owner, name and major, or `null` when it is not
 * one — `core:var/characters@1`. A camelCase name is tolerated: the variable
 * registry does not refuse one, and the app kebabs it when it names a layout row.
 * @internal
 */
export function variableIdParts(
	id: unknown,
): { owner: string; name: string; major: number } | null {
	if (typeof id !== 'string') return null
	const m = /^([a-z0-9]+(?:[.-][a-z0-9]+)*):var\/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)@(\d+)$/.exec(id)
	if (!m) return null
	return { owner: m[1]!, name: m[2]!, major: Number(m[3]) }
}

/**
 * A new scope in which every root key `renders` maps carries `laidOutBy` — the
 * variable that writes it out. `renders` is what `rendersAt()` returns (key →
 * variable id). This is how a host tells the template check and the editor
 * which keys are laid out. A key that is not a root of `scope` is skipped: the
 * scope is the authority on names. A laid-out value is a string, so an `'any'`
 * or `string[]` root becomes an optional string. Never mutates its input.
 * @experimental
 */
export function laidOutScope(
	scope: TemplateScope,
	renders: Readonly<Record<string, string>>,
): TemplateScope {
	const out: TemplateScope = { ...scope }
	for (const [key, laidOutBy] of Object.entries(renders ?? {})) {
		if (!Object.prototype.hasOwnProperty.call(scope, key)) continue
		const decl = scope[key]!
		out[key] =
			decl === 'any' || Array.isArray(decl)
				? { type: 'string', optional: true, laidOutBy }
				: ({ ...(decl as VarField), laidOutBy } satisfies VarField)
	}
	return out
}

/**
 * The layouts offered by the variable that writes `key` out
 * (`scope[key].laidOutBy`) — for completion inside `layout characters "` and
 * for hover. `[]` when the key isn't laid out, the offers are absent, or the
 * variable offers none.
 * @experimental
 */
export function variableLayoutOffersFor(
	scope: TemplateScope,
	key: string,
	offers: TemplateCheckOptions['variableLayoutOffers'],
): readonly VariableLayoutOffer[] {
	if (!offers || !Object.prototype.hasOwnProperty.call(scope, key)) return []
	const decl = scope[key]
	if (!decl || decl === 'any' || Array.isArray(decl)) return []
	const by = (decl as VarField).laidOutBy
	if (typeof by !== 'string' || !Object.prototype.hasOwnProperty.call(offers, by)) return []
	return offers[by] ?? []
}

/**
 * What a plugin gives {@link variableLayout}.
 * @experimental
 */
export interface VariableLayoutInput {
	/** Kebab-case — the slug of the layout reference `<plugin>/<slug>@<major>`. */
	slug: string
	/** A positive integer. */
	major: number
	/** The layout's display name — `Titled JSON block`. */
	label: string
	/** The registered engine `source` is written in. */
	engine: EngineId
	/** The template source, reading the variable's scope. */
	source: string
}

/**
 * The typed builder of a variable layout's `TemplateSeed` — list the result in
 * `defineExtension({ templates })`. `variable` is the value `defineVariable` /
 * `definePluginVariable` returned, so a typo is a compile error; it may be
 * another package's (a plugin may lay out `core:var/characters@1`).
 *
 * The seed's id is `<pluginId>:template/<variable name>-<slug>@<major>`. Throws,
 * naming the plugin and the variable, on any part outside its grammar, and
 * with the problems `templateSeedProblems` finds.
 *
 * ⚠ It does not check `source`: the template checker carries the engines and
 * lives at `@serene-pub/sdk/template-check`, which this dependency-free module
 * must not import. The packager (`variableSeedFindings`, `E_TEMPLATE_SCOPE`)
 * and the instance's install check hold the source to the variable's scope.
 * @experimental
 */
export function variableLayout(
	pluginId: string,
	variable: VariableDecl,
	input: VariableLayoutInput,
): TemplateSeed {
	const who = `plugin '${pluginId}' variable layout for '${String(variable?.id)}'`
	const parts = variableIdParts(variable?.id)
	if (!parts)
		throw new Error(
			`${who}: '${String(variable?.id)}' is not a variable id — it must read ` +
				`'<owner>:var/<name>@<major>' (core:var/characters@1).`,
		)
	const { slug, major, label, engine, source } = input ?? ({} as VariableLayoutInput)
	if (typeof slug !== 'string' || !VARIABLE_LAYOUT_SLUG.test(slug))
		throw new Error(
			`${who}: slug '${String(slug)}' is not kebab-case — lowercase letters and digits joined by '-' (titled-json).`,
		)
	if (typeof major !== 'number' || !Number.isInteger(major) || major < 1)
		throw new Error(`${who}: major '${String(major)}' is not a positive whole number.`)
	if (typeof label !== 'string' || !label.trim())
		throw new Error(`${who}: label is the layout's display name — give a non-empty string.`)
	if (typeof engine !== 'string' || !engine)
		throw new Error(
			`${who}: engine is the registered engine the source is written in — give a non-empty engine id.`,
		)
	if (typeof source !== 'string')
		throw new Error(`${who}: source is the template text — give a string.`)
	const name = parts.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
	const seed: TemplateSeed = {
		id: `${pluginId}:template/${name}-${slug}@${major}`,
		kind: 'variables',
		variableId: variable.id,
		slug,
		engine,
		body: source,
		label,
	}
	const problems = templateSeedProblems(seed, pluginId)
	if (problems.length) throw new Error(`${who}: ${problems.join(' ')}`)
	return seed
}
