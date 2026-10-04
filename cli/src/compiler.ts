/**
 * The packager (04 §5a, U24b).
 *
 * Two halves, and the split is a law rather than a convenience:
 *
 * **Static.** Hooks, components, settings and permissions are extracted by walking the
 * TypeScript AST — *without executing the author's code*. "Hooks are never discovered at
 * runtime" (13/§30), so a registration built by a loop or a variable is a **lint error,
 * never a silent omission**. The manifest has to be a complete statement of what a plugin
 * can do, or the permission model is a guess and the audit screen is fiction.
 *
 * **Evaluated.** Pipelines are compiled by building the spec value and projecting it to a
 * document. That is allowed: F6 says *SP* never evaluates a builder chain — "no importer
 * path evaluates a builder chain" — not that the author's own build tool doesn't. SP
 * imports the document. This is where the document comes from.
 *
 * The line matters because it decides what an attacker can do. A malicious plugin can run
 * whatever it likes on the author's machine at build time; it cannot make SP run anything
 * at install time, because install reads documents and a manifest, both of which are data.
 *
 * **One artifact (D-1).** A package that declares a genre used to have to say so through
 * `announce()`, whose build emitted the genre and not the handlers; this one emitted the
 * handlers and not the genre. Since D-1 the extension carries both halves and this
 * packager emits one `manifest.json` carrying both — the announcement's declarations go in
 * the manifest rather than beside it, because the manifest is what an instance stores and
 * every reader it has reads that.
 */

import type { AnnexFieldDecl, Extension, Descriptor, I18n, SessionLayoutV1, VariableDecl, WidgetDecl } from '@serene-pub/sdk'
import type { SpecDocument } from '@serene-pub/sdk'
import {
	compile,
	declarationFindings,
	i18nFindings,
	isI18n,
	permissionFindings,
	pluginVariableFindings,
	storedSwap,
	templateLawFindings,
	templateSeedFindings,
	variablesOf,
	widgetOfInstance,
} from '@serene-pub/sdk'
import { checkTemplateSourceReport } from '@serene-pub/sdk/template-check'
import type {
	ConfigDecl,
	CoverageReport,
	DeclaredPermissions,
	GenreDecl,
	PresetDecl,
	PromptDecl,
	StoredEventDeclaration,
	StoredSwapContribution,
	SurfacesDecl,
	TemplateSeed,
} from '@serene-pub/sdk'
import type { ManifestInput } from './sandbox.js'
import { summarizeDefinition, type DefinitionSummary } from './codegen.js'
import { pluginRuleRef, LIFECYCLE_MOMENTS } from '@serene-pub/sdk'
import { hookBindingsFor, type HookDeclLike } from './pluginHooks.js'

// ── Findings ────────────────────────────────────────────────────────────────

/** @experimental */
export interface CompileFinding {
	severity: 'error' | 'warning'
	file: string
	line: number
	code: string
	message: string
	/** Required on every error — a prohibition without an alternative is a bug (15 §1.3). */
	fix: string
	/**
	 * The definition id this finding is about, where it is about one.
	 *
	 * The lexical scan and the evaluated extension see most of the same
	 * mistakes, and an author reading two sentences about one line stops
	 * reading. `compilePlugin` drops the scan's copy of anything the
	 * evaluated half says more precisely, and this is the key it matches on.
	 */
	id?: string
}

/**
 * One source file as the packager reads it.
 *
 * `permissions: false` marks a file that is **not the plugin**: a test, an
 * example, a fixture's stand-in host. Nothing the packager says *about the
 * plugin* is read out of it — not a permission, not a declaration count, not a
 * sandbox-endowment refusal — because every one of those is a statement about
 * what the shipped package can do, and a stand-in is written precisely to do
 * what the package cannot.
 *
 * Both halves of that were incidents, a day apart. `check .` answering
 * `core:write · provider:call` off `examples/fixtures.ts` taught an author to
 * ignore the one list the consent screen is built from. Then a plugin's test
 * file looping `for (const handler of […]) await handler(…)` was counted as
 * eleven handler registrations against the extension's ten, and the package
 * stopped building.
 *
 * ⏳ The field is still called `permissions` because two lanes read it by that
 * name while this widened; it now gates more than permissions, and the rename
 * is a follow-up rather than a surprise mid-flight.
 * @internal
 */
export interface SourceFile {
	path: string
	text: string
	permissions?: boolean
}

/**
 * Paths that are not the plugin, absent any `--ignore`.
 *
 * Deliberately *not* skipped outright: a `fetch()` in a test file is still a
 * `fetch()` in the package, and a rule that fired only outside `test/` would
 * be a rule an author could move a file to escape. `--ignore <glob>` is the
 * blunt instrument; this list is the narrow one.
 * @experimental
 */
export const DEFAULT_PERMISSION_IGNORES = [
	'**/*.test.ts',
	'**/test/**',
	'**/tests/**',
	'**/examples/**',
	'**/fixtures/**',
] as const

/**
 * A glob over a package-relative path: `**` crosses directories, `*` does not,
 * `?` is one non-separator character. Small on purpose — the packager has no
 * dependencies, and a matcher an author has to read the semantics of is worse
 * than one whose whole definition fits on a screen.
 * @internal
 */
export function matchesGlob(pattern: string, path: string): boolean {
	const target = path.replace(/\\/g, '/').replace(/^\.\//, '')
	let re = '^'
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i]!
		if (c === '*' && pattern[i + 1] === '*') {
			// `**/` is zero or more directories, so `**/*.test.ts` matches a file
			// at the root as well as one six levels down.
			if (pattern[i + 2] === '/') {
				re += '(?:[^/]*/)*'
				i += 2
			} else {
				re += '.*'
				i += 1
			}
		} else if (c === '*') re += '[^/]*'
		else if (c === '?') re += '[^/]'
		else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}
	return new RegExp(re + '$').test(target)
}

// ── The manifest ────────────────────────────────────────────────────────────

/** @experimental */
export interface Manifest {
	schemaVersion: 1
	slug: string
	/** What the plugin is called where it is listed — a string or a locale map with `en` (R-20). */
	name: I18n
	version: string
	description?: I18n
	/**
	 * The Serene Pub range this plugin supports, npm-style —
	 * `{ 'serene-pub': '>=0.7 <0.8' }`. Version ranges only (R1); template
	 * engines are `templateEngines`.
	 */
	engines?: { 'serene-pub'?: string }
	/**
	 * Template engines this plugin ships — `{ '<engine id>': '<hook name>' }`,
	 * e.g. `{ 'acme.x:template/mustache@1': 'renderMustache' }`. The host
	 * registers a forwarding renderer per entry that calls the named bundle
	 * export in the sandbox. Absent when the plugin ships none.
	 */
	templateEngines?: Record<string, string>
	/**
	 * Node definitions this plugin registers — summarized for the audit screen
	 * (10 §10.2), each carrying the declaration an instance registers it from
	 * (`DefinitionSummary.declaration`, D-6b).
	 */
	nodeDefinitions: DefinitionSummary[]
	/** The three extension callables (R-1): handlers, lifecycle callbacks, event listeners. */
	hooks: {
		handlers: Array<{
			definitionId: string
			visibility: 'private' | 'public'
			runtime: 'process'
		}>
		lifecycleCallbacks: Array<{ moment: string }>
		/**
		 * Each subscription with the **exported function that answers it**
		 * (D-6b). A host dispatching an occurrence calls a hook by name, and
		 * an entry naming only the event left it guessing — so core refused
		 * the subscription rather than guess, and a packaged listener never
		 * ran. `hook` is the app-runtime spelling, the same key an
		 * `eventHooks: [{ event, hook }]` declaration uses.
		 */
		eventListeners: Array<{ event: string; hook: string; timeoutMs?: number }>
		/**
		 * Which exported function implements each node definition, by pin —
		 * `{ '<definitionId>@<version>': hookName }` (D-6b).
		 *
		 * A map rather than a field on `handlers` above because that is the
		 * shape every reader has: core's node bindings, the conformance
		 * probe and the app-runtime `hookKinds` / `templateEngines` declarations all
		 * ask "which hook implements this id", and the answer is a lookup.
		 * The names are the bundle's own exports — one derivation
		 * (`pluginHooks.ts`) writes both, so the manifest cannot name a hook
		 * the bundle does not export.
		 */
		nodeHandlers: Record<string, string>
	}
	/** Components (§3.5, R25): a widget names one by slug; it runs in the page's UI worker. */
	components: Array<{
		slug: string
		label: unknown
		framework: string
		entry: string
		settings?: Record<string, unknown>
		basedOn?: { component: string; version: string; sourceHash?: string }
		/** The declared source; `entry` is the BUILT module once `build` ran (C3). */
		source?: string
		/** Third-party packages the build inlined into the module. */
		bundled?: string[]
		/**
		 * The host contract the built module assumes (F1) — widget protocol,
		 * host-element vocabulary, and the SDK / component-client versions —
		 * written by `build`. A host refuses a component whose protocol it does
		 * not speak or whose vocabulary major it lacks
		 * (`componentBuiltAgainstFinding`); absent = built before the record.
		 */
		builtAgainst?: import('@serene-pub/sdk').ComponentBuiltAgainst
	}>
	settings?: Record<string, unknown>
	/** Pipelines shipped, by identity — the documents travel beside the manifest. */
	pipelines: Array<{ id: string; version: string; nodes: number; presets: string[] }>
	/**
	 * Template rows shipped (R19), **verbatim** rather than summarized.
	 *
	 * The pipelines above are summarized because their documents travel beside the
	 * manifest as their own files; a template is a handful of fields and has no second
	 * file, so the manifest is where it travels. The instance projects these into rows
	 * on enable, which is the same shape a `preset()` declaration already has.
	 */
	templates?: TemplateSeed[]
	/**
	 * **Compiled from usage** wherever usage can say it. An author cannot over-request,
	 * and cannot under-declare either — the audit screen shows what the code can
	 * actually reach.
	 *
	 * The two exceptions are declared, because no call site carries them: a storage
	 * quota is a number and a network host is a name. They land here in the same flat
	 * taxonomy as the rest — `storage:<bytes>`, `network:<host>` — so an instance reads
	 * one list and an administrator denies one entry at a time. A declaration can only
	 * add: nothing an author writes removes what the scan found.
	 */
	permissions: string[]
	peerTypes: string[]

	/* ── what the package declares, beside what it implements (D-1) ──────────── */

	/**
	 * The genres, surfaces, presets, configs and prompts this package declares —
	 * the half that used to be sayable only through `announce()`, and so only
	 * emittable by the other build path.
	 *
	 * They travel **in the manifest** rather than in a document beside it because
	 * every reader an instance has already reads the manifest: `surfacesOf` takes
	 * `manifest.surfaces`, `requirementsOf` takes `manifest.requires`, the
	 * permission model takes `manifest.permissions`, the plugin list takes
	 * `manifest.name`. A second file would need a second install step that nothing
	 * implements, and the two would drift the first time one was written without
	 * the other.
	 *
	 * All optional, so a package that declares none of them emits exactly the
	 * manifest it emitted before.
	 */
	genres?: GenreDecl[]
	/** The widgets this package offers (R71), ids local — the instance puts them under the package. */
	widgets?: WidgetDecl[]
	/** Annex fields this package offers every session it is on (`annexField()`); the owner is the package slug. @experimental */
	annexFields?: AnnexFieldDecl[]
	/**
	 * The context variables this package declares — its `variables` list and
	 * every variable its definitions' bands hold (`variablesOf`), verbatim:
	 * id, i18n, description, scope, sample. An instance registers them from
	 * the stored manifest before the package's definitions and specs, so a
	 * band's variable is known where its template is checked (typed templates,
	 * 2026-09-27). Own namespace only. Omitted when there are none.
	 * @experimental
	 */
	variables?: VariableDecl[]
	/**
	 * The layouts this package's genres ship (R71), one entry per layout with
	 * its genre, each a **session layout** with the package's own widget ids
	 * already under its namespace — the shape the instance's layout reconciler
	 * reads.
	 */
	layouts?: Array<{ genreId: string; slug: string; name: unknown; description?: unknown; preset: SessionLayoutV1 }>
	surfaces?: SurfacesDecl
	presets?: PresetDecl[]
	configs?: ConfigDecl[]
	prompts?: PromptDecl[]
	/**
	 * This plugin's definitions offered on other packages' swappable nodes
	 * (R29), definitions as ids. The instance checks the node and the fit at
	 * install and lists enabled contributions after the node's own swaps.
	 */
	swaps?: StoredSwapContribution[]
	/**
	 * Events this plugin declares, with who may record them (R52). The
	 * instance registers each and holds recordings to its scope.
	 */
	events?: StoredEventDeclaration[]
	/** Ids referenced but not declared here — the instance enforces these at install. */
	requires?: string[]
}

/** @experimental */
export interface CompileResult {
	manifest?: Manifest
	documents: SpecDocument[]
	findings: CompileFinding[]
	ok: boolean
	/**
	 * The preset coverage — which of each genre's event slots this package fills,
	 * and the `todo()` holes it left. Present whenever the package declares
	 * presets or configs, so `serene-pub build` can print for a unified package
	 * what the announce path has always printed.
	 */
	coverage?: CoverageReport
}

// ── Static extraction ───────────────────────────────────────────────────────

/** Calls whose arguments must be written out, and why a computed one is refused. */
const MUST_BE_STATIC: Record<string, string> = {
	defineExtension: 'the manifest is built from this call without running it',
	handler:
		'a handler assembled at runtime cannot appear in the manifest, so it could never be permitted',
	lifecycleCallback: 'lifecycle moments are fixed; a computed one cannot be audited',
	eventListener: 'an event subscription nobody can see is a side effect nobody consented to',
	component: 'surfaces are declared so core can render them without loading your code',
	defineSettings: 'core renders the form from this, and validates against it on save',
}

/** Injected-surface calls that map to a permission. Compiled from usage (F10, U10). */
const PERMISSION_CALLS: Record<string, string> = {
	readCore: 'core:read',
	read: 'core:read',
	commit: 'core:write',
	emit: 'socket:emit',
	call: 'provider:call',
}

/**
 * Blank out comments and string bodies, **preserving length and newlines**, so indices
 * still map to the original text and a brace inside a string cannot confuse the matcher.
 */
function blankNonCode(text: string): string {
	const out = text.split('')
	let i = 0
	const blank = (from: number, to: number) => {
		for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '
	}
	while (i < text.length) {
		const c = text[i]
		const next = text[i + 1]
		if (c === '/' && next === '/') {
			const end = text.indexOf('\n', i)
			blank(i, end === -1 ? text.length : end)
			i = end === -1 ? text.length : end
		} else if (c === '/' && next === '*') {
			const end = text.indexOf('*/', i + 2)
			blank(i, end === -1 ? text.length : end + 2)
			i = end === -1 ? text.length : end + 2
		} else if (c === "'" || c === '"' || c === '`') {
			const quote = c
			let j = i + 1
			while (j < text.length) {
				if (text[j] === '\\') {
					j += 2
					continue
				}
				if (text[j] === quote) break
				j++
			}
			blank(i, Math.min(j + 1, text.length))
			i = j + 1
		} else {
			i++
		}
	}
	return out.join('')
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length

/**
 * Best-effort source location for a finding about an evaluated value: the id is written
 * out in the descriptor (register refuses computed ids), so it appears literally in some
 * source file. Falls back to the entry file when it does not — a finding with a rough
 * address beats one with none.
 */
function locate(
	sources: Array<{ path: string; text: string }>,
	needle: string,
): { file: string; line: number } {
	for (const s of sources) {
		const i = s.text.indexOf(needle)
		if (i !== -1) return { file: s.path, line: lineAt(s.text, i) }
	}
	return { file: sources[0]?.path ?? '(none)', line: 1 }
}

/**
 * Is there text a person reads — a non-blank string, or a map with a non-blank
 * `en`? The SDK's `isI18n` (R-20): a map carrying only `fr` has no face on an
 * English install.
 */
const hasDisplayText = (v: I18n | undefined): boolean => isI18n(v)

/** Index just past the `)` matching the `(` at `open`. Operates on blanked code. */
function matchParen(code: string, open: number): number {
	let depth = 0
	for (let i = open; i < code.length; i++) {
		const c = code[i]
		if (c === '(' || c === '[' || c === '{') depth++
		else if (c === ')' || c === ']' || c === '}') {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

function topLevelSplit(
	code: string,
	from: number,
	to: number,
): Array<{ start: number; end: number }> {
	const parts: Array<{ start: number; end: number }> = []
	let depth = 0
	let start = from
	for (let i = from; i < to; i++) {
		const c = code[i]
		if (c === '(' || c === '[' || c === '{') depth++
		else if (c === ')' || c === ']' || c === '}') depth--
		else if (c === ',' && depth === 0) {
			parts.push({ start, end: i })
			start = i + 1
		}
	}
	if (code.slice(start, to).trim()) parts.push({ start, end: to })
	return parts
}

/**
 * Is this argument written out, rather than computed?
 *
 * A function body is fine — that is the handler, and the packager never reads inside it.
 * What is refused is a *declaration* the packager cannot see: a spread, a ternary, or a
 * template literal standing in for an id.
 */
function isWrittenOut(raw: string, blanked: string): boolean {
	const t = blanked.trim()
	const r = raw.trim()
	// The scanner blanks string bodies so that a call written inside a comment or a string
	// cannot be mistaken for a real one — which means a *legitimate* quoted argument also
	// blanks to nothing. `eventListener('core:event/session-created@1', h)` is the most written-out
	// form there is, so emptiness only means "computed" when the raw text was not a literal.
	const quoted = /^['"`]/.test(r)
	if (!t && !quoted) return false
	if (r.startsWith('...')) return false
	if (t.startsWith('...')) return false
	// A top-level ternary or concatenation means the value depends on something.
	let depth = 0
	for (let i = 0; i < t.length; i++) {
		const c = t[i]
		if (c === '(' || c === '[' || c === '{') depth++
		else if (c === ')' || c === ']' || c === '}') depth--
		else if (depth === 0 && (c === '?' || c === '+')) {
			// `?.` and `??` are not ternaries; `=>` bodies are fine.
			if (c === '?' && (t[i + 1] === '.' || t[i + 1] === '?')) continue
			if (c === '+' && t[i + 1] === '+') continue
			return false
		}
	}
	// A template literal used as a value: blanked to spaces, so the raw tells us.
	if (/^`/.test(raw.trim()) && raw.includes('${')) return false
	return true
}

// ── What a plugin's sandbox cannot endow (D-2) ──────────────────────────────

/**
 * The context a plugin's handlers actually run with, and the sentence every
 * refusal below is made of.
 *
 * A sandbox endows `random, now, log, signal`, plus `storage` for the kinds
 * `hookCtxGrants` grants it (query, outlet, event, lifecycle, oracle) and
 * `fetch` for an oracle with a declared host. `read`, `call` and `commit` are
 * the **executor's**, and no sandbox has ever handed one over, for any kind.
 *
 * That is the line, and it is not the kind line. A plugin Query is a perfectly
 * good node — it is the kind a plugin uses to read *its own* rows, which is why
 * Battleship declares two of them. Refusing the kind turned those into
 * emit-class outlets that write nothing. What is refused here is a handler
 * reaching for an endowment nobody makes.
 *
 * ⚠ **The reach is one hop.** The scan sees a member where it is written: in a
 * definition's region here, in the bound handler's own source in
 * `compilePlugin`. A handler that reaches storage through a helper of its own
 * (`writeRow(ctx, key, value)`, which is how Battleship writes) is invisible to
 * both, and stays a job for install. Closing that needs a call graph, and a
 * call graph needs a parser; the packager's whole static half is lexical and
 * says so.
 */
const SANDBOX_ENDOWMENT =
	'which endows `random, now, log, signal` and, for a query or emit-class outlet, ' +
	'`storage` (and `fetch` with a declared host) — never `read`, `call` or `commit`'

/** What the executor endows and no sandbox does, with the way back for each. */
const EXECUTOR_ONLY: Record<string, string> = {
	read:
		`Read Serene Pub's data on an input port wired from a core query ` +
		`(\`core:query/…\`); a plugin reads its own rows with \`ctx.storage\`.`,
	readCore:
		`Read Serene Pub's data on an input port wired from a core query ` +
		`(\`core:query/…\`); a plugin reads its own rows with \`ctx.storage\`.`,
	call:
		`Cross the network from an Oracle: \`call\` is the executor's, and what a plugin's ` +
		`own oracle handler gets is \`ctx.fetch\`, with a host declared in its manifest.`,
	commit:
		`Let a core outlet do the write, on a port this run publishes; a plugin's own rows ` +
		`are \`ctx.storage\`, granted to a query or an emit-class outlet.`,
}

/** `describe<Kind>Definition` → the kind it registers. */
const DEFINITION_CALLS: Record<string, string> = {
	describeInletDefinition: 'inlet',
	describeQueryDefinition: 'query',
	describeTaskDefinition: 'task',
	describeOracleDefinition: 'oracle',
	describeOutletDefinition: 'outlet',
}

interface ScannedDefinition {
	id: string
	kind: string
	effects?: string
	index: number
}

/** A written-out `name: 'value'` inside an object literal. Operates on raw text. */
function literalField(text: string, name: string): string | undefined {
	const m = new RegExp(`(?<![\\w$])${name}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`).exec(text)
	return m?.[1]
}

/** Index of the `{` opening the object literal `index` sits inside. Blanked code. */
function enclosingBrace(code: string, index: number): number {
	let depth = 0
	for (let i = index; i >= 0; i--) {
		const c = code[i]
		if (c === '}' || c === ')' || c === ']') depth++
		else if (c === '{' || c === '(' || c === '[') {
			if (depth === 0) return c === '{' ? i : -1
			depth--
		}
	}
	return -1
}

/**
 * The node definitions one file registers, read lexically: a `describe*` call,
 * or a descriptor written out with its own `kind`. Only a definition whose id
 * is written out is returned — an object with a computed id is somebody else's
 * finding (`E_DYNAMIC_DECLARATION`), and requiring the literal is also what
 * keeps a type annotation (`kind: 'query'` on an interface) out of this list.
 */
function definitionsIn(raw: string, code: string): ScannedDefinition[] {
	const out: ScannedDefinition[] = []
	const seen = new Set<string>()
	const add = (d: ScannedDefinition) => {
		if (seen.has(d.id)) return
		seen.add(d.id)
		out.push(d)
	}
	for (const [call, kind] of Object.entries(DEFINITION_CALLS)) {
		const re = new RegExp(`(?<![\\w.$])${call}\\s*\\(`, 'g')
		let m: RegExpExecArray | null
		while ((m = re.exec(code))) {
			const open = code.indexOf('(', m.index)
			const close = matchParen(code, open)
			if (close === -1) continue
			const body = raw.slice(open, close + 1)
			const id = literalField(body, 'id')
			if (id) add({ id, kind, effects: literalField(body, 'effects'), index: m.index })
		}
	}
	const bare = /(?<![\w$])kind\s*:\s*['"](inlet|query|task|oracle|outlet)['"]/g
	let b: RegExpExecArray | null
	while ((b = bare.exec(raw))) {
		// The scanner blanks comments and strings; if `kind` survived blanking it
		// is code, and if it did not this is prose about a descriptor.
		if (code.slice(b.index, b.index + 4) !== 'kind') continue
		const open = enclosingBrace(code, b.index)
		if (open === -1) continue
		const close = matchParen(code, open)
		if (close === -1) continue
		const body = raw.slice(open, close + 1)
		const id = literalField(body, 'id')
		if (id) add({ id, kind: b[1]!, effects: literalField(body, 'effects'), index: b.index })
	}
	// In source order, because each one's region is "from here to the next".
	return out.sort((a, b2) => a.index - b2.index)
}

/**
 * Where a slice of a file reaches for a `ctx` member, or -1.
 *
 * The slice is a definition's **region** — from its declaration to the next
 * one — because a file declares node after node and a finding that named every
 * task in a file because one of them kept state refused two pure tasks in the
 * package this rule was written for. Read on the raw text and confirmed
 * against the blanked copy, so a `ctx.storage` in a comment is prose.
 */
function ctxReachIn(
	raw: string,
	code: string,
	members: string,
	from = 0,
	to = raw.length,
	called = false,
): number {
	const re = new RegExp(
		`(?<![\\w$])\\w*[Cc]tx\\s*\\.\\s*(?:${members})\\b${called ? '\\s*\\(' : ''}`,
		'g',
	)
	re.lastIndex = from
	let m: RegExpExecArray | null
	while ((m = re.exec(raw)) && m.index < to) if (code[m.index] !== ' ') return m.index
	return -1
}

/**
 * The names this file imported from the SDK, and whether it imported at all.
 *
 * `handler` is an ordinary English word, and a plugin's own test looping
 * `for (const handler of […]) await handler(input, ctx)` was counted as a
 * registration — eleven against the extension's ten, and the package stopped
 * building. A file that imports from the SDK and did not import *that name* is
 * calling something of its own. A file that imports nothing from the SDK is
 * left to the older, looser reading: a re-export is a thing authors write, and
 * that miscount is the one this scanner already refuses loudly.
 */
function sdkImportsIn(text: string): { any: boolean; names: Set<string> } {
	const names = new Set<string>()
	let any = false
	const from = /import\s[^;]*?from\s*['"]@serene-pub\/sdk[^'"]*['"]/g
	let m: RegExpExecArray | null
	while ((m = from.exec(text))) {
		any = true
		const braces = /\{([^}]*)\}/.exec(m[0])
		for (const part of braces?.[1]?.split(',') ?? []) {
			const named = part
				.trim()
				.replace(/^type\s+/, '')
				.split(/\s+as\s+/)
			const local = (named[1] ?? named[0] ?? '').trim()
			if (local) names.add(local)
		}
	}
	return { any, names }
}

interface At {
	file: string
	line: number
}

const ctxEndowmentFinding = (member: string, at: At, within?: string): CompileFinding => ({
	severity: 'error',
	...at,
	code: 'E_PLUGIN_CTX_ENDOWMENT',
	id: `ctx.${member}`,
	message:
		`${within ? `${within} ` : ''}reaches \`ctx.${member}\`. A plugin's handlers run in its ` +
		`sandbox, ${SANDBOX_ENDOWMENT}`,
	fix: (EXECUTOR_ONLY[member] ?? EXECUTOR_ONLY.read!) + pluginRuleRef('kind-query'),
})

const pluginWriteOutletFinding = (id: string, at: At): CompileFinding => ({
	severity: 'error',
	...at,
	code: 'E_PLUGIN_WRITE_OUTLET',
	id,
	message:
		`${id} is a write-class outlet. A plugin's handlers run in its sandbox, where nothing ` +
		`can commit a core row`,
	fix:
		`declare \`effects: 'emit'\` (it may still hold its own storage) and let a core outlet do the ` +
		`write — \`ctx.commit\` is the executor's, not the sandbox's, and the executor wraps a plugin ` +
		`outlet's output as \`{ status: 'committed' }\`, which is a claim nobody made.` +
		pluginRuleRef('kind-outlet'),
})

const pluginTaskGrantFinding = (
	id: string,
	at: At,
	member: 'storage' | 'fetch',
	precise: boolean,
): CompileFinding => ({
	severity: 'error',
	...at,
	code: 'E_PLUGIN_TASK_GRANT',
	id,
	message: `${id} is a Task and ${precise ? 'its handler' : 'the code declaring it'} reads \`ctx.${member}\``,
	fix:
		(member === 'fetch'
			? `a task is pure (F11) and is granted no network — declare it as an oracle, the one kind ` +
				`granted \`ctx.fetch\``
			: `a task is pure (F11) and is granted no storage — declare it as a query (read) or an ` +
				`emit-class outlet (write)`) +
		pluginRuleRef(member === 'fetch' ? 'kind-oracle' : 'kind-task') +
		'.' +
		(precise
			? ''
			: ` This half of the scan is lexical: it reads the source from this declaration to the next ` +
				`one, so a handler written far from its definition is caught at \`build\` instead.`),
})

/** @internal */
export interface StaticScan {
	findings: CompileFinding[]
	permissions: string[]
	/**
	 * The executor-only `ctx` members the source reaches — `read`, `call`,
	 * `commit`. Kept beside the findings so the evaluated half does not say the
	 * same thing again at a worse address: a handler's `Function.toString()`
	 * knows which definition it belongs to, the source knows the line.
	 */
	endowments: string[]
	/** Declaration call sites found, for cross-checking against the evaluated module. */
	declared: {
		extensions: number
		handlers: number
		lifecycleCallbacks: number
		eventListeners: number
		components: number
	}
}

/**
 * Walk source text. **Never evaluates.**
 *
 * ⚠ This is a lexical scanner, not a parser. It is dependency-free and version-stable,
 * which is right for a draft, and it will miss things a real AST would catch — an
 * identifier named `component` used for something else, for one. **Core should swap in a
 * proper parser**; the interface is the part that matters, and the findings it produces
 * are the contract.
 * @internal
 */
export function scanSource(files: readonly SourceFile[]): StaticScan {
	const findings: CompileFinding[] = []
	const permissions = new Set<string>()
	const endowments = new Set<string>()
	const declared = {
		extensions: 0,
		handlers: 0,
		lifecycleCallbacks: 0,
		eventListeners: 0,
		components: 0,
	}

	for (const f of files) {
		const code = blankNonCode(f.text)
		// Everything said *about the plugin* is read only out of the plugin
		// (see `SourceFile`). A stand-in host is still read for the rules that
		// are about the code itself, like a direct `fetch()`.
		const shipped = f.permissions !== false
		const sdk = sdkImportsIn(f.text)

		if (shipped)
			for (const name of Object.keys(MUST_BE_STATIC)) {
				const re = new RegExp(`(?<![\\w.$])${name}\\s*\\(`, 'g')
				let m: RegExpExecArray | null
				while ((m = re.exec(code))) {
					// A file that imports from the SDK and did not import *this*
					// name is calling something of its own: `for (const handler of
					// …) await handler(…)` counted as eleven registrations against
					// an extension's ten and stopped a package building.
					if (sdk.any && !sdk.names.has(name)) continue
					// A registration is never awaited. A call is.
					if (/\b(?:await|yield)\s*$/.test(code.slice(Math.max(0, m.index - 8), m.index)))
						continue
					const open = code.indexOf('(', m.index)
					const close = matchParen(code, open)
					if (close === -1) continue
					if (name === 'defineExtension') declared.extensions++
					if (name === 'handler') declared.handlers++
					if (name === 'lifecycleCallback') declared.lifecycleCallbacks++
					if (name === 'eventListener') declared.eventListeners++
					if (name === 'component') declared.components++

					for (const [i, part] of topLevelSplit(code, open + 1, close).entries()) {
						if (
							isWrittenOut(
								f.text.slice(part.start, part.end),
								code.slice(part.start, part.end),
							)
						)
							continue
						findings.push({
							severity: 'error',
							file: f.path,
							line: lineAt(f.text, m.index),
							code: 'E_DYNAMIC_DECLARATION',
							message: `${name}() argument ${i + 1} is computed, not written out`,
							fix:
								`write the value literally at the call site — ${MUST_BE_STATIC[name]}. ` +
								`A registration the packager cannot read is one core can never permit, so this ` +
								`is an error rather than a silent omission (13/§30).`,
						})
					}
				}
			}

		if (shipped)
			for (const [call, perm] of Object.entries(PERMISSION_CALLS)) {
				if (new RegExp(`\\.\\s*${call}\\s*\\(`).test(code)) permissions.add(perm)
			}

		// What no sandbox endows, for any kind (D-2). One finding per member per
		// file: an author fixes a reach, not a line, and ten lines of the same
		// sentence is a wall nobody reads.
		if (shipped)
			for (const member of ['read', 'readCore', 'call', 'commit']) {
				const at = ctxReachIn(f.text, code, member, 0, f.text.length, true)
				if (at === -1) continue
				endowments.add(member === 'readCore' ? 'read' : member)
				findings.push(
					ctxEndowmentFinding(member, { file: f.path, line: lineAt(f.text, at) }),
				)
			}

		// The two kind rules that remain, because these are about what the kind
		// itself can never do rather than about a member (D-2). Lexical, like
		// everything else here; `compilePlugin` says the same of a definition
		// imported from a built dependency, and more precisely.
		const definitions = shipped ? definitionsIn(f.text, code) : []
		for (const [i, d] of definitions.entries()) {
			const to = definitions[i + 1]?.index ?? f.text.length
			const reaches = (members: string) =>
				ctxReachIn(f.text, code, members, d.index, to) !== -1
			const at = { file: f.path, line: lineAt(f.text, d.index) }
			if (d.kind === 'outlet' && d.effects === 'write')
				findings.push(pluginWriteOutletFinding(d.id, at))
			else if (d.kind === 'task' && (reaches('storage') || reaches('fetch')))
				findings.push(
					pluginTaskGrantFinding(
						d.id,
						at,
						reaches('storage') ? 'storage' : 'fetch',
						false,
					),
				)
		}

		// A hook reaching for the network directly walks around the kind boundary: a Query
		// may not reach the network at all (16 §1), and a Provider reaches it through its
		// injected `call`, never `fetch`.
		const fetchAt = new RegExp(`(?<![\\w.$])fetch\\s*\\(`, 'g')
		let fm: RegExpExecArray | null
		while ((fm = fetchAt.exec(code))) {
			findings.push({
				severity: 'error',
				file: f.path,
				line: lineAt(f.text, fm.index),
				code: 'E_DIRECT_NETWORK',
				message: 'a hook calls fetch() directly',
				fix:
					"reach the network from an oracle, through `ctx.fetch` — the one kind granted it, held to the " +
					'hosts your manifest declares. A task or a query may not reach the network at all.' +
					pluginRuleRef('kind-oracle'),
			})
		}
	}

	return {
		findings,
		permissions: [...permissions].sort(),
		endowments: [...endowments].sort(),
		declared,
	}
}

// ── Frame documents (D-2) ───────────────────────────────────────────────────

/**
 * Blank HTML comments, **preserving length and newlines**, so indices still map
 * to the original text — `blankNonCode`'s trick, for the other language. A
 * `<form>` an author commented out is not a `<form>`.
 */
function blankHtmlComments(text: string): string {
	const out = text.split('')
	let i = 0
	while (i < text.length) {
		if (text.startsWith('<!--', i)) {
			const end = text.indexOf('-->', i + 4)
			const stop = end === -1 ? text.length : end + 3
			for (let k = i; k < stop; k++) if (out[k] !== '\n') out[k] = ' '
			i = stop
		} else i++
	}
	return out.join('')
}

/** Off-package: absolute http(s), or protocol-relative. Everything else is the package's own. */
const isOffPackage = (url: string) => /^(?:https?:)?\/\//i.test(url.trim())

/**
 * The attributes of one tag, from the text between its name and its `>`.
 *
 * The values are `string | undefined` because an absent attribute and an empty
 * one are different answers here: `<script>` has a body, `<script src="">` is
 * somebody's typo, and only the first is an inline script.
 */
function attrsOf(text: string): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {}
	const re = /([A-Za-z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g
	let m: RegExpExecArray | null
	while ((m = re.exec(text))) {
		if (!m[0].trim()) continue
		out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
	}
	return out
}

/**
 * What core refuses in a frame document, read where the author still is.
 *
 * A frame is mounted in an opaque-origin iframe with `sandbox="allow-scripts"`
 * and served under `script-src 'self'`. Both refusals are **silent** at
 * runtime: an inline script never runs, a form submit never fires, and the
 * surface simply sits there. That is the whole reason this check exists — a
 * mistake that shouts does not need a packager to catch it.
 *
 * ⚠ Lexical, like the source scan: tags are matched with a regular
 * expression, not parsed. A document that hides a `<form>` from this will
 * still be refused by the browser, which is the harder audience.
 * @internal
 */
export function scanFrameDocument(doc: { path: string; text: string }): CompileFinding[] {
	const findings: CompileFinding[] = []
	const raw = doc.text
	const html = blankHtmlComments(raw)
	const at = (index: number): At => ({ file: doc.path, line: lineAt(raw, index) })

	const tags = /<\s*(script|link|img|form)\b([^>]*)>/gi
	let m: RegExpExecArray | null
	while ((m = tags.exec(html))) {
		const name = m[1]!.toLowerCase()
		const attrs = attrsOf(m[2] ?? '')
		const here = at(m.index)
		if (name === 'form') {
			findings.push({
				severity: 'error',
				...here,
				code: 'E_FRAME_FORM',
				message:
					'has a <form>. Frames mount with `sandbox="allow-scripts"` and no ' +
					'`allow-forms`, so a form cannot submit',
				fix:
					'use a button and a key handler, and post the result on the frame port — the ' +
					'submit is swallowed by the sandbox, with no event and no error to debug.',
			})
			continue
		}
		if (name === 'script') {
			const src = attrs.src
			if (src === undefined) {
				const from = m.index + m[0].length
				const end = html.slice(from).search(/<\s*\/\s*script\s*>/i)
				const body = end === -1 ? html.slice(from) : html.slice(from, from + end)
				if (body.trim())
					findings.push({
						severity: 'error',
						...here,
						code: 'E_FRAME_INLINE_SCRIPT',
						message:
							"has an inline script. Frames are served under `script-src 'self'` " +
							'and an inline script is refused silently',
						fix: 'put it in a file beside the document and load it with `<script src="…">`.',
					})
			} else if (isOffPackage(src))
				findings.push({
					severity: 'error',
					...here,
					code: 'E_FRAME_EXTERNAL_SCRIPT',
					message: `loads a script from off-package ('${src}')`,
					fix:
						"frames are served under `script-src 'self'` — vendor the file beside the " +
						'document and load it by a relative path. The request is blocked and nothing says so.',
				})
			continue
		}
		const url = name === 'link' ? attrs.href : attrs.src
		if (url && isOffPackage(url))
			findings.push({
				severity: 'error',
				...here,
				code: 'E_FRAME_EXTERNAL_RESOURCE',
				message: `<${name}> points off-package ('${url}')`,
				fix:
					'a frame reaches its own package and nothing else — copy the file beside the ' +
					'document and reference it by a relative path. The request is blocked and nothing says so.',
			})
	}

	// A submit control, with or without a `<form>` around it: the same dead end,
	// and the one an author reaches for after deleting the form.
	const submits = /type\s*=\s*['"]submit['"]/gi
	while ((m = submits.exec(html)))
		findings.push({
			severity: 'error',
			...at(m.index),
			code: 'E_FRAME_FORM',
			message:
				'has a type="submit" control. Frames mount with `sandbox="allow-scripts"` and no ' +
				'`allow-forms`, so a submit cannot fire',
			fix: 'use `type="button"` and a click or key handler, and post the result on the frame port.',
		})

	return findings
}

/**
 * @internal The documents a package's `surfaces` name, in declaration order
 * (session view, page). A document inside a component (`sp-frame`) is found
 * by the lexical pass, {@link frameEntriesIn}.
 */
export function declaredFrameEntries(surfaces: SurfacesDecl | undefined): string[] {
	return [surfaces?.['session-view']?.entry, surfaces?.page?.entry].filter(
		(e): e is string => typeof e === 'string' && e.length > 0,
	)
}

/**
 * The same list, read lexically out of the source — what `check` has, since it
 * never evaluates the author's module.
 *
 * Every package-relative document the source names, not only the ones written
 * at an `entry:` key: Battleship names both of its surfaces through a
 * `const SESSION_VIEW_ENTRY = 'ui/session.html'`, which is the ordinary way to
 * write it and would otherwise be read by `build` and not by `check`. A URL
 * and an absolute path are somebody else's document and are left alone; a
 * `.html` this package ships and does not mount is scanned anyway, and if that
 * is wrong for a package, `--ignore` says so.
 * @internal
 */
export function frameEntriesIn(files: readonly SourceFile[]): string[] {
	const out: string[] = []
	const seen = new Set<string>()
	for (const f of files) {
		const re = /['"]([^'"\s]+\.html?)['"]/g
		let m: RegExpExecArray | null
		while ((m = re.exec(f.text))) {
			const entry = m[1]!
			if (entry.includes('://') || entry.startsWith('/') || seen.has(entry)) continue
			seen.add(entry)
			out.push(entry)
		}
	}
	return out
}

// ── Assembly ────────────────────────────────────────────────────────────────

/** @experimental */
export interface CompileInput {
	/** Source files, for the static half. */
	sources: SourceFile[]
	/**
	 * The frame documents the package declares, already read.
	 *
	 * Passed in rather than read here because nothing in this file touches a
	 * filesystem — the packager is a pure function from text to findings, which
	 * is what lets a test state a document in three lines. The command line
	 * resolves `surfaces` to paths and reads them.
	 */
	frameDocuments?: Array<{ path: string; text: string }>
	/** The evaluated extension, for the pipeline half. */
	extension?: Extension
	/**
	 * A separate sandbox manifest, for a package that has not moved its
	 * permissions onto the extension (`ExtensionDecl.permissions`). Its declared
	 * `storage` and `network` fold into the compiled list exactly as the
	 * extension's own would; the two are a union, so a package part-way through
	 * the move loses nothing. Its `hooks`, `components` and `pipelines` lists are
	 * not read — those come from the extension, which is the statement the
	 * packager can cross-check against the source.
	 */
	manifest?: ManifestInput
}

/**
 * Produce the manifest and the pipeline documents.
 *
 * Cross-checks the two halves against each other: if the AST found three hooks and the
 * evaluated module exposes two, something is being registered conditionally, and the
 * manifest would understate what the plugin can do.
 * @experimental
 */
export function compilePlugin(input: CompileInput): CompileResult {
	const scan = scanSource(input.sources)
	const findings = [...scan.findings]
	const e = input.extension

	if (!e) {
		findings.push({
			severity: 'error',
			file: input.sources[0]?.path ?? '(none)',
			line: 1,
			code: 'E_NO_EXTENSION',
			message: 'no extension was produced by the entry module',
			fix: 'export the result of defineExtension({ … }) as the default export of your entry file',
		})
		return { documents: [], findings, ok: false }
	}
	if ((e as { __extension?: unknown }).__extension !== true) {
		findings.push({
			severity: 'error',
			file: input.sources[0]?.path ?? '(none)',
			line: 1,
			code: 'E_NOT_EXTENSION',
			message: "the entry module's default export is not a defineExtension(…) result",
			fix:
				'export default defineExtension({ … }) — the packager reads the declaration it returns, ' +
				'with every reference read down to its id',
		})
		return { documents: [], findings, ok: false }
	}

	// `hooks` declares points (R54). An array there is the implementations
	// list under its old name — an extension evaluated against an older SDK —
	// and a record is a plugin's declared points, which no manifest carries yet.
	const declaredHooks = (e as { hooks?: unknown }).hooks
	if (Array.isArray(declaredHooks) || (declaredHooks && Object.keys(declaredHooks).length)) {
		findings.push({
			severity: 'error',
			file: input.sources[0]?.path ?? '(none)',
			line: 1,
			code: 'E_HOOKS_FIELD',
			message: Array.isArray(declaredHooks)
				? "the extension lists its code under 'hooks' — that list is 'handlers' now"
				: "the extension declares hooks of its own, which a plugin's manifest does not carry yet",
			fix: Array.isArray(declaredHooks)
				? 'rename hooks: [handler(…), …] to handlers: [handler(…), …] and rebuild against the current SDK'
				: "remove 'hooks' — a plugin cannot define its own hook points before SDK 1.0; implement core's under 'handlers'",
		})
		return { documents: [], findings, ok: false }
	}

	const handlers = (e.handlers ?? []).filter((h) => h.__decl === 'handler') as any[]
	// A node is as public as its handler (R62): the definition may not say it.
	const selfPublic = handlers.filter((h) => h.type?.public !== undefined)
	if (selfPublic.length) {
		for (const h of selfPublic)
			findings.push({
				severity: 'error',
				file: input.sources[0]?.path ?? '(none)',
				line: 1,
				code: 'E_PUBLIC_ON_DEFINITION',
				message: `'${h.type.id}' says 'public' on its definition; a node's visibility is its handler's`,
				fix:
					`remove 'public' from the definition and write handler(definition, fn, { visibility: 'public' }) — or leave it out to keep the node private to this package` +
					pluginRuleRef('private-nodes'),
			})
		return { documents: [], findings, ok: false }
	}
	const lifecycle = (e.handlers ?? []).filter((h) => h.__decl === 'lifecycle-callback') as any[]
	const events = (e.handlers ?? []).filter((h) => h.__decl === 'event-listener') as any[]
	// A moment the host never calls is a callback that never runs, and an
	// author who declared one would read its silence as success. The two the
	// owner dropped (2026-09-26) get their own sentence; anything else is a typo.
	for (const h of lifecycle) {
		if ((LIFECYCLE_MOMENTS as readonly string[]).includes(h.moment)) continue
		const dropped = h.moment === 'sidecarSpawn' || h.moment === 'scheduled'
		findings.push({
			severity: 'error',
			file: input.sources[0]?.path ?? '(none)',
			line: 1,
			code: 'E_LIFECYCLE_MOMENT_UNSUPPORTED',
			message: dropped
				? `lifecycleCallback('${h.moment}') is not supported yet — the host never calls it, so the callback would never run`
				: `lifecycleCallback('${String(h.moment)}') names no lifecycle moment — the host never calls it`,
			fix:
				h.moment === 'scheduled'
					? "remove it; scheduled work subscribes to 'core:event/schedule-tick@1' with eventListener()"
					: `remove it, or use one of: ${LIFECYCLE_MOMENTS.join(', ')}`,
		})
	}
	// What each callable is exported as, keyed by the declaration itself — the
	// same derivation `serene-pub build` generates the bundle's entry module
	// from (D-6b). Keyed by identity rather than by index so the manifest and
	// the bundle cannot disagree about which function a name refers to.
	const bindings = hookBindingsFor(
		e.handlers as HookDeclLike[] | undefined,
		e.templateEngines as Record<string, unknown> | undefined,
	)
	const hookNames = new Map<unknown, string>(bindings.map((b) => [b.decl, b.hookName]))
	// Engine id → the export that renders it, for the manifest's `templateEngines`.
	const templateEngines = Object.fromEntries(
		bindings.filter((b) => b.kind === 'template-engine').map((b) => [b.engineId!, b.hookName]),
	)

	const mismatch = (kind: string, statically: number, evaluated: number) => {
		if (statically === evaluated || statically === 0) return
		findings.push({
			severity: 'error',
			file: input.sources[0]?.path ?? '(none)',
			line: 1,
			code: 'E_CONDITIONAL_REGISTRATION',
			message: `${statically} ${kind} declaration(s) in the source, ${evaluated} in the built extension`,
			fix:
				'register every handler unconditionally at module scope. One behind an `if` is absent from ' +
				'the manifest on some machines and present on others, so the audit screen stops being true.',
		})
	}
	mismatch('handler', scan.declared.handlers, handlers.length)
	mismatch('lifecycleCallback', scan.declared.lifecycleCallbacks, lifecycle.length)
	mismatch('eventListener', scan.declared.eventListeners, events.length)
	mismatch('component', scan.declared.components, (e.components ?? []).length)

	// What a plugin's sandbox cannot endow (D-2). The lexical half has already
	// said this for every definition written out in the source; this half
	// catches one imported from a built dependency, and says it of a task more
	// precisely — it reads the handler that was actually bound rather than the
	// module the definition sits in. Where both halves see the same mistake the
	// precise sentence wins, because an author reading the same finding twice
	// stops reading findings.
	const endowment: CompileFinding[] = []
	for (const h of handlers) {
		const t = h.type as Descriptor | undefined
		if (!t?.id) continue
		const at = locate(input.sources, t.id)
		const body = typeof h.handler === 'function' ? String(h.handler) : ''
		const blanked = blankNonCode(body)
		const reaches = (members: string, called = false) =>
			ctxReachIn(body, blanked, members, 0, body.length, called) !== -1
		// The executor's endowments, for any kind. Skipped where the source
		// already named the line — the lexical half has the better address, and
		// one mistake gets one sentence.
		for (const member of ['read', 'readCore', 'call', 'commit'])
			if (!scan.endowments.includes(member === 'readCore' ? 'read' : member))
				if (reaches(member, true)) endowment.push(ctxEndowmentFinding(member, at, t.id))
		if (t.kind === 'outlet' && t.effects === 'write')
			endowment.push(pluginWriteOutletFinding(t.id, at))
		else if (t.kind === 'task') {
			const member = reaches('storage') ? 'storage' : reaches('fetch') ? 'fetch' : undefined
			if (member) endowment.push(pluginTaskGrantFinding(t.id, at, member, true))
		}
	}
	// Matched from the first colon on, because an author writes the namespace
	// as an interpolation (`${PLUGIN_SLUG}:task/tally@1`) and the lexical half
	// reads what is written while this half reads what it evaluated to. The
	// tail is the package's own and unique within it — a plugin's ids all sit
	// under its one slug, which `defineExtension` enforces.
	const sameDefinition = (code: string, id: string) =>
		`${code}\u0000${id.includes(':') ? id.slice(id.indexOf(':')) : id}`
	const saidAlready = new Set(endowment.map((f) => sameDefinition(f.code, f.id ?? '')))
	for (let i = findings.length - 1; i >= 0; i--) {
		const f = findings[i]!
		if (f.id && saidAlready.has(sameDefinition(f.code, f.id))) findings.splice(i, 1)
	}
	findings.push(...endowment)

	// What is *in* the declared frame documents — the surfaces pass checks the
	// path, this checks the file at it (D-2).
	for (const doc of input.frameDocuments ?? []) findings.push(...scanFrameDocument(doc))

	// A shape-bearing input type *is* a chat mode (19 §2), and the New Chat picker
	// renders one card per mode: `i18n.name` is the card's face, `i18n.description` its
	// subtitle. The SDK already refuses an untitled mode at declaration; the packager
	// repeats the check because the evaluated extension may have been built against an
	// older SDK — and warns on a missing description, which is a poorer card rather
	// than a broken one.
	for (const h of handlers) {
		const t = h.type as Descriptor | undefined
		if (t?.kind !== 'inlet' || !t.sessionShape) continue
		const at = locate(input.sources, t.id)
		if (!hasDisplayText(t.i18n?.name))
			findings.push({
				severity: 'error',
				file: at.file,
				line: at.line,
				code: 'E_MODE_NO_TITLE',
				message: `chat mode '${t.id}' has no i18n.name`,
				fix:
					`give the type a title — i18n: { name: { en: '…' } }. The New Chat picker ` +
					`renders every mode as a card, and an untitled card can only show the type id, ` +
					`which is an address rather than a name.`,
			})
		if (!hasDisplayText(t.i18n?.description))
			findings.push({
				severity: 'warning',
				file: at.file,
				line: at.line,
				code: 'W_MODE_NO_DESCRIPTION',
				message: `chat mode '${t.id}' has no i18n.description`,
				fix:
					`add i18n: { description: { en: '…' } } — the card's subtitle is how a user ` +
					`chooses between modes without trying them.`,
			})
	}

	// The manifest's own face (R-20): `name` is what the plugin list shows,
	// `description` what reads under it. `defineExtension` refuses these where
	// the author is; repeated here for a bundle built against an older SDK, and
	// the instance's install repeats it once more over the stored manifest.
	for (const finding of [
		...i18nFindings(e.name, 'name', { required: true }),
		...i18nFindings(e.description, 'description'),
	]) {
		const at = locate(input.sources, 'defineExtension')
		findings.push({
			severity: 'error',
			file: at.file,
			line: at.line,
			code: 'E_MANIFEST_DISPLAY_TEXT',
			message: finding,
			fix:
				`write display text a person reads — a plain string ('Dice tray') or a locale map ` +
				`with 'en' ({ en: 'Dice tray', fr: 'Plateau de dés' }); a bare string reads as en`,
		})
	}

	const documents: SpecDocument[] = []
	for (const p of e.pipelines ?? []) {
		try {
			documents.push(compile(p))
		} catch (err) {
			findings.push({
				severity: 'error',
				file: input.sources[0]?.path ?? '(none)',
				line: 1,
				code: 'E_SPEC_COMPILE',
				message: `pipeline '${p.id}' did not compile: ${(err as Error).message}`,
				fix: 'fix the spec so it publishes — the error above names the law it violates',
			})
		}
	}

	// What the package declares rather than implements (D-1). `defineExtension`
	// already refused these where the author is; repeated here because the
	// evaluated extension may have been built against an older SDK, exactly as the
	// display-text check above is. The pass also hands back the requirements and
	// the coverage, which are the two things only a whole-package read can know.
	const declared = declarationFindings({
		ns: e.slug,
		genres: e.genres,
		pipelines: e.pipelines,
		prompts: e.prompts,
		configs: e.configs,
		presets: e.presets,
		surfaces: e.surfaces,
		components: e.components,
		widgets: e.widgets,
		swaps: e.swaps,
		events: e.events,
		annexFields: e.annexFields ?? [],
	})
	// Variables travel for an instance to register (typed templates,
	// 2026-09-27): own namespace only, one content per id.
	const variables = variablesOf(e)
	for (const finding of [
		...declared.errors,
		...pluginVariableFindings(e.slug, variables),
		...permissionFindings(e.permissions),
		...permissionFindings(input.manifest?.permissions),
	]) {
		const at = locate(input.sources, 'defineExtension')
		findings.push({
			severity: 'error',
			file: at.file,
			line: at.line,
			code: 'E_INVALID_DECLARATION',
			message: finding,
			fix:
				`fix the declaration the message names — it is refused at install on the same ` +
				`terms, where nobody can see the line that wrote it`,
		})
	}
	// A shipped layout that draws, but not as written: an id placed and never
	// drawn, two items on one cell, a widget over its `maxInstances`. Warned
	// here because nothing refuses it and no one else reads the layout before
	// a session draws it.
	for (const finding of declared.warnings) {
		const at = locate(input.sources, 'layout(')
		findings.push({
			severity: 'warning',
			file: at.file,
			line: at.line,
			code: 'W_LAYOUT_DRAWS_OTHERWISE',
			message: finding,
			fix:
				`change the layout so it draws what it says — a session copies the layout as shipped, ` +
				`and a reader drops or draws over what the message names`,
		})
	}

	// Typed templates P5 (2026-09-27): the package's templates fit where they are
	// rendered. Law T1 over each compiled spec — a preset's or a node's template
	// naming something nothing supplies at that node — and each shipped context
	// template seed against every node of the package's own specs that renders
	// it. Refused here, where the author can still see the line; the instance
	// refuses the same selection at install and at the panel.
	const templateChecking = { check: checkTemplateSourceReport }
	for (const d of documents)
		for (const t1 of templateLawFindings(d, templateChecking)) {
			const at = locate(input.sources, '.preset(')
			findings.push({
				severity: 'error',
				file: at.file,
				line: at.line,
				code: 'E_TEMPLATE_SCOPE',
				message: `pipeline '${d.id}': ${t1.message}`,
				fix: t1.fix,
			})
		}
	for (const seed of templateSeedFindings(e.templates ?? [], documents, templateChecking)) {
		const at = locate(input.sources, seed.template)
		findings.push({
			severity: 'error',
			file: at.file,
			line: at.line,
			code: 'E_TEMPLATE_SCOPE',
			message: `template '${seed.template}' at '${seed.nodeKey}' of '${seed.specId}': ${seed.message}`,
			fix: seed.fix,
		})
	}

	// Subscriptions are a permission surface: a pipeline that runs on every message is a
	// side effect a user consents to (11 §4), so it belongs in the manifest. Since R-4
	// the inlet lock is the only subscription a pipeline has.
	const permissions = new Set(scan.permissions)
	for (const p of e.pipelines ?? []) if (p.input?.event) permissions.add(`event:${p.input.event}`)
	for (const h of events) permissions.add(`event:${h.event}`)
	// A widget's data request (`WidgetDecl.scopes`) is a grant an admin
	// reviews: `widget:<scope>`, echoed here so the install summary is true.
	for (const w of [...(e.widgets ?? []), ...(e.genres ?? []).flatMap((g) => g.shape?.panels ?? [])])
		for (const scope of w.scopes ?? []) permissions.add(`widget:${scope}`)
	// The declared half — a quota and a host allowlist, which no call site carries.
	// The extension's own declaration and a separately-supplied sandbox manifest are
	// a union, so a package part-way through the move loses neither.
	for (const p of [e.permissions, input.manifest?.permissions] as Array<
		DeclaredPermissions | undefined
	>) {
		if (p?.storage)
			permissions.add(
				p.storage.quotaBytes === undefined ? 'storage' : `storage:${p.storage.quotaBytes}`,
			)
		for (const host of p?.network?.hosts ?? []) permissions.add(`network:${host}`)
	}
	// Resources and events a separate manifest declared; the extension has no such
	// field, because both are compiled from the code that uses them.
	for (const r of input.manifest?.permissions?.resources ?? []) permissions.add(`resource:${r}`)
	for (const ev of input.manifest?.permissions?.events ?? []) permissions.add(`event:${ev}`)

	const manifest: Manifest = {
		schemaVersion: 1,
		slug: e.slug,
		name: e.name,
		version: e.version,
		description: e.description,
		engines: e.engines,
		// Written only when the plugin ships one, so a manifest without engines
		// is byte-identical to one built before the key existed.
		...(Object.keys(templateEngines).length ? { templateEngines } : {}),
		// The row's `public` is projected from the handler (R62).
		nodeDefinitions: handlers.map((h) =>
			summarizeDefinition({ ...h.type, ...(h.visibility === 'public' ? { public: true } : {}) }),
		),
		hooks: {
			handlers: handlers.map((h) => ({
				definitionId: h.type.id,
				visibility: h.visibility,
				runtime: h.runtime ?? 'node',
			})),
			lifecycleCallbacks: lifecycle.map((h) => ({ moment: h.moment })),
			// The name each callable is exported under, from the one derivation
			// the generated bundle is written from (`pluginHooks.ts`) — so the
			// manifest and the code cannot name different functions.
			eventListeners: events.map((h) => ({
				event: h.event,
				hook: hookNames.get(h) ?? '',
				...(typeof h.timeoutMs === 'number' ? { timeoutMs: h.timeoutMs } : {}),
			})),
			nodeHandlers: Object.fromEntries(
				handlers.map((h) => [h.type.id, hookNames.get(h) ?? '']),
			),
		},
		components: (e.components ?? []).map((c) => ({
			slug: c.slug,
			label: c.label,
			framework: c.framework,
			entry: c.entry.replace(/^\.\//, ''),
			...(c.settings ? { settings: c.settings as Record<string, unknown> } : {}),
			...(c.basedOn ? { basedOn: c.basedOn } : {}),
		})),
		settings: e.settings?.schema as Record<string, unknown> | undefined,
		pipelines: documents.map((d) => ({
			id: d.id,
			version: d.version,
			nodes: d.nodes.length,
			presets: (d.presets ?? []).map((p) => p.slug),
		})),
		templates: e.templates ? e.templates.map((t) => ({ ...t })) : undefined,
		permissions: [...permissions].sort(),
		peerTypes: (e.peerTypes ?? []).slice().sort(),
		// Omitted rather than emptied when the package declares none, so a plugin
		// that ships no genre emits the manifest it emitted before D-1 — byte for
		// byte, which is what the packager's own test pins.
		// A genre's layouts travel once, as `layouts` below, with ids the page knows.
		...(e.genres?.length ? { genres: e.genres.map(({ layouts: _l, ...g }) => g as GenreDecl) } : {}),
		...(e.widgets?.length ? { widgets: e.widgets } : {}),
		// Annex fields (2026-09-26): omitted when none, so the manifest is byte-for-byte as before.
		...(e.annexFields?.length ? { annexFields: e.annexFields } : {}),
		// Variables (2026-09-27): omitted when none, so the manifest is byte-for-byte as before.
		...(variables.length ? { variables } : {}),
		...(genreLayouts(e).length ? { layouts: genreLayouts(e) } : {}),
		...(e.surfaces ? { surfaces: e.surfaces } : {}),
		...(e.presets?.length ? { presets: e.presets } : {}),
		...(e.configs?.length ? { configs: e.configs } : {}),
		...(e.prompts?.length ? { prompts: e.prompts } : {}),
		...(e.swaps?.length ? { swaps: e.swaps.map(storedSwap) } : {}),
		...(e.events?.length ? { events: e.events } : {}),
		...(declared.requires.length ? { requires: declared.requires } : {}),
	}

	const ok = !findings.some((f) => f.severity === 'error')
	return {
		manifest: ok ? manifest : undefined,
		documents,
		findings,
		ok,
		coverage: declared.coverage,
	}
}

/**
 * The layouts a package's genres ship, as manifest entries (R71): each
 * **session layout** with the package's own widgets named under its namespace
 * (`<slug>:<id>`) and everyone else's ids as written.
 *
 * A widget instance id is namespaced in its WIDGET half only: `map#north`
 * becomes `acme:map#north`, and a copy of core's widget (`messages#sanctum`)
 * is left alone. Every place a layout names an instance is rewritten the same
 * way — the zone lists, the grid, the arranged items and the tab-group ids
 * built from them, and the `widgetSettings` and `widgetStyles` keys — so the
 * id stays one string wherever the layout stores it.
 * @internal
 */
export function genreLayouts(e: Extension): NonNullable<Manifest['layouts']> {
	const own = new Set((e.widgets ?? []).map((w) => w.id))
	const q = (id: string): string => (own.has(widgetOfInstance(id)) ? `${e.slug}:${id}` : id)
	// A tab group's id is `g:` + its members' ids, sorted and joined by `+`
	// (what the app's layout editor mints); a member renamed renames the group.
	const group = (g: unknown) =>
		typeof g === 'string' && g.startsWith('g:') ? `g:${g.slice(2).split('+').map(q).sort().join('+')}` : g
	const rekey = <T>(m: Record<string, T> | undefined) =>
		m ? Object.fromEntries(Object.entries(m).map(([k, v]) => [q(k), v])) : undefined
	const namespaced = (layout: SessionLayoutV1): SessionLayoutV1 => {
		const out: SessionLayoutV1 = { ...layout }
		if (layout.zoneLayout)
			out.zoneLayout = {
				...layout.zoneLayout,
				zones: Object.fromEntries(
					Object.entries(layout.zoneLayout.zones).map(([k, z]) => [k, { ...z, widgets: z.widgets.map(q) }]),
				),
			}
		if (layout.widgetGrid)
			out.widgetGrid = {
				...layout.widgetGrid,
				widgets: layout.widgetGrid.widgets.map((w) => ({
					...w,
					id: q(w.id),
					...(w.group !== undefined ? { group: group(w.group) as string } : {}),
				})),
			}
		if (layout.arrangedGrid)
			out.arrangedGrid = Object.fromEntries(
				Object.entries(layout.arrangedGrid).map(([k, frame]) => [
					k,
					frame && {
						...frame,
						items: frame.items.map((i) => ({
							...i,
							id: q(i.id),
							...(i.group !== undefined ? { group: group(i.group) as string } : {}),
						})),
					},
				]),
			)
		if (layout.widgetSettings) out.widgetSettings = rekey(layout.widgetSettings)
		if (layout.widgetStyles) out.widgetStyles = rekey(layout.widgetStyles)
		return out
	}
	const out: NonNullable<Manifest['layouts']> = []
	for (const g of e.genres ?? [])
		for (const l of g.layouts ?? [])
			out.push({
				genreId: g.id,
				slug: l.slug,
				name: l.name,
				...(l.description ? { description: l.description } : {}),
				preset: namespaced(l.preset),
			})
	return out
}

/** @experimental */
export function renderFindings(findings: CompileFinding[]): string {
	if (!findings.length) return 'compiled cleanly'
	return findings
		.map(
			(f) =>
				`${f.severity === 'error' ? '✗' : '⚠'} ${f.file}:${f.line}  [${f.code}] ${f.message}\n    → ${f.fix}`,
		)
		.join('\n')
}

/**
 * The install-time counterpart to "permissions are compiled from usage": what a plugin
 * says it *cannot* do. Generated, so it cannot flatter (U32).
 * @experimental
 */
export function cannotDo(m: Manifest): string[] {
	const has = (p: string) => m.permissions.includes(p)
	// A declared host allowlist is a way out to the network that no call site
	// names, so the line has to read it too — this list is generated precisely so
	// that it cannot flatter, and "reaches nothing" beside a declared host would
	// be the one sentence here that is false.
	const network = m.permissions.some((p) => p === 'network' || p.startsWith('network:'))
	const out: string[] = []
	if (!has('core:write')) out.push('cannot write to any of your data')
	// A widget is shown its session's messages (its channels), so a plugin that
	// renders anything reads them there — and `widget:<scope>` asks for more.
	const s = m.surfaces
	const renders = !!(m.components.length || m.widgets?.length || s?.['session-view'] || s?.page)
	if (!has('core:read') && !renders && !m.permissions.some((p) => p.startsWith('widget:')))
		out.push('cannot read your sessions, characters or messages')
	if (!has('provider:call') && !network)
		out.push('cannot call a model or reach any external service')
	if (!m.hooks.eventListeners.length && !m.permissions.some((p) => p.startsWith('event:')))
		out.push('cannot run in response to anything you do')
	// A frame surface renders too — in its own opaque-origin document rather than
	// the host's, which is a smaller reach and not none. Reading only `components`
	// would tell somebody installing a plugin whose whole session view is a frame
	// that it cannot draw anything.
	if (!renders) out.push('cannot render anything in the interface')
	// Scheduled work has one path, the schedule-tick event (SCHEDULED_WORK_PATH).
	if (!m.hooks.eventListeners.some((h) => h.event === 'core:event/schedule-tick@1'))
		out.push('cannot run on a schedule')
	return out
}
