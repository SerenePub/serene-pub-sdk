/**
 * What the playground actually does, with no DOM anywhere in it.
 *
 * Source in, one `PlaygroundRun` out: transpile TypeScript, evaluate it against
 * a fixed set of modules, and then do to the program exactly what the docs
 * generator does to an executed example — build, validate, run on the same seed
 * and clock. That last part is the point. A reader who edits the fence on an
 * example page and presses Run has to get the page's own output back when they
 * change nothing, or the page and the playground are two different claims about
 * the same code. So the seed, the clock and the receipt rendering are the
 * generator's, imported from `@serene-pub/sdk/testing` rather than re-written
 * here (`renderRunSummary`, `makeExampleRunCtx`).
 *
 * Kept free of the DOM so the suite can import it: `sdk-tests/playground.test.ts`
 * runs the three real examples through this file under node, which is the only
 * way to know the browser build runs the same code the site publishes. Anything
 * that touches `document` lives in `ui.ts`.
 *
 * Nothing here reaches the network, the filesystem, `location` or storage — the
 * module map is the whole of what a program can import, and `bindings` is the
 * suite's fixture host, every hook of it deterministic and in-process.
 */

import {
	compile,
	previewOf,
	renderPreview,
	validate,
	type BuiltSpec,
	type Finding,
	type Receipt,
	type SpecBuilder,
	type SpecDocument,
} from '@serene-pub/sdk'
import { makeExampleRunCtx, renderRunSummary } from '@serene-pub/sdk/testing'
import type { Example } from '@serene-pub/cli'

import * as sdk from '@serene-pub/sdk'
import * as sdkTesting from '@serene-pub/sdk/testing'
import * as contracts from '@serene-pub/contracts'
import * as coreCatalog from '@serene-pub/core-catalog'

// The suite's fixture host, imported as source. It is browser-safe on purpose
// (no node imports anywhere in it), which is what lets the page a reader runs
// answer with the same hooks the golden was recorded against.
import * as fixtures from '../../sdk-tests/helpers.js'

// ── The module map ──────────────────────────────────────────────────────────

/**
 * Every specifier a program may `require`, and what it gets.
 *
 * A fixed map rather than a resolver, because the playground has no network and
 * must never look like it might: a reader who types an import of their own gets
 * told what exists, immediately, instead of a request that fails somewhere they
 * cannot see.
 *
 * `@serene-pub/cli` is `{}` deliberately. An executed example imports exactly
 * one thing from it — the `Example` *type* — and a type import is erased by the
 * TypeScript transform before this map is ever consulted. The entry is what
 * stands between a stray value import and an error message about a package that
 * cannot run in a browser at all.
 *
 * `../helpers.js` and `./helpers.js` are the same object: the examples live one
 * directory below the fixture host and import it as `../helpers.js`, and a
 * reader who pastes one into a flat editor writes `./helpers.js` without
 * thinking about it. Both are the fixture host; neither is a path.
 */
export const PLAYGROUND_MODULES: Readonly<Record<string, unknown>> = Object.freeze({
	'@serene-pub/sdk': sdk,
	'@serene-pub/sdk/testing': sdkTesting,
	'@serene-pub/contracts': contracts,
	'@serene-pub/core-catalog': coreCatalog,
	'@serene-pub/cli': {},
	'../helpers.js': fixtures,
	'./helpers.js': fixtures,
})

/** What the playground answers with when a program imports something it has never heard of. */
export class UnknownModuleError extends Error {
	constructor(readonly specifier: string) {
		super(
			`the playground cannot import '${specifier}'. It runs offline in a sandboxed ` +
				`frame, so the only modules that exist are: ` +
				`${Object.keys(PLAYGROUND_MODULES).join(', ')}.`,
		)
		this.name = 'UnknownModuleError'
	}
}

/** The `require` an evaluated program is handed. Throws `UnknownModuleError`, never fetches. */
export function resolveModule(
	specifier: string,
	modules: Readonly<Record<string, unknown>> = PLAYGROUND_MODULES,
): unknown {
	if (!Object.prototype.hasOwnProperty.call(modules, specifier))
		throw new UnknownModuleError(specifier)
	return modules[specifier]
}

// ── Transpile and evaluate ──────────────────────────────────────────────────

/** Source in, runnable CommonJS out. Async because the compiler is fetched. */
export type Transpiler = (source: string) => Promise<string>

/**
 * The default: sucrase as an ordinary module.
 *
 * This is the path the suite takes — `sdk-tests/playground.test.ts` runs the
 * three real examples through this file under node, where there is no DOM to
 * inject a script tag into and no reason to want one.
 *
 * The browser never reaches it. It cannot: a module fetch from an opaque origin
 * is CORS-blocked, which is the whole reason the browser build splits sucrase
 * into a classic script, aliases this import away (`sucraseAbsent.ts`) and
 * installs its own transpiler below.
 */
const importedSucrase: Transpiler = async (source) => {
	const { transform } = await import('sucrase')
	return transform(source, { transforms: ['typescript', 'imports'] }).code
}

let transpiler: Transpiler = importedSucrase

/** Replace how source is compiled. The browser entry calls this once, on startup. */
export function useTranspiler(next: Transpiler): void {
	transpiler = next
}

/**
 * TypeScript → something `new Function` can take.
 *
 * Whichever transpiler is installed, the transform pair is the same: types
 * erased, ESM rewritten to CommonJS. The second half is what makes the module
 * map possible — a real `import` would be resolved by the browser against the
 * frame's opaque origin, where there is nothing to resolve against.
 */
export const transpile: Transpiler = (source) => transpiler(source)

/** Evaluate transpiled CommonJS and hand back its exports. */
export function evaluateModule(
	js: string,
	modules: Readonly<Record<string, unknown>> = PLAYGROUND_MODULES,
): Record<string, unknown> {
	const module = { exports: {} as Record<string, unknown> }
	const require = (specifier: string) => resolveModule(specifier, modules)
	// Indirect, so the program closes over nothing of this file's scope.
	new Function('require', 'module', 'exports', js)(require, module, module.exports)
	return module.exports
}

// ── What a program can be ───────────────────────────────────────────────────

/** A document, whichever end of `compile` the program handed back. */
function documentOf(value: SpecBuilder<any> | BuiltSpec | SpecDocument): SpecDocument {
	if (!value || typeof value !== 'object')
		throw new TypeError(
			`build() returned ${typeof value}, not a spec. Return the builder chain, ` +
				`\`.build()\` on it, or an already-compiled document.`,
		)
	if (typeof (value as SpecBuilder<any>).build === 'function')
		return documentOf((value as SpecBuilder<any>).build())
	return 'schemaVersion' in value ? (value as SpecDocument) : compile(value as BuiltSpec)
}

const isSpecish = (v: unknown): v is SpecBuilder<any> | BuiltSpec | SpecDocument =>
	!!v &&
	typeof v === 'object' &&
	(typeof (v as any).build === 'function' ||
		'schemaVersion' in (v as object) ||
		('nodes' in (v as object) && 'clauses' in (v as object)))

const isExample = (v: unknown): v is Example =>
	!!v &&
	typeof v === 'object' &&
	typeof (v as any).build === 'function' &&
	typeof (v as any).run === 'function'

/**
 * The trivial input a bare spec is fed.
 *
 * A superset rather than a guess: the three fields the core inlets read, all at
 * once, so `userMessage` and `messageText` both find what they need without the
 * playground having to work out which one this document opens with. It is only
 * ever handed to fixture hooks, which is the other half of why a superset is
 * safe — nothing downstream of here can be surprised by a field it ignores.
 */
const TRIVIAL_INPUT = {
	text: 'hello from the playground',
	sessionScope: 'session:playground',
	messageId: 'msg:playground',
}

// ── The run ─────────────────────────────────────────────────────────────────

export interface PlaygroundRun {
	/**
	 * `ok` — it ran; `findings` — it does not publish, so it was never run;
	 * `error` — something threw, at any stage.
	 */
	status: 'ok' | 'findings' | 'error'
	/** The Result pane's text. Always populated. */
	result: string
	/** The compiled document, once there is one. Feeds the Document and Graph panes. */
	doc?: SpecDocument
	receipt?: Receipt
	/** `renderPreview` output, when the run was a preview run. */
	preview?: string
	findings?: Finding[]
}

/** Findings as the generator prints them when it refuses to publish a page. */
export function renderFindings(findings: Finding[]): string {
	const out = [
		`this spec does not publish — ${findings.length} finding${findings.length === 1 ? '' : 's'}`,
	]
	for (const f of findings) {
		out.push(`  ${f.severity} ${f.law}${f.nodeKey ? ` ${f.nodeKey}` : ''} — ${f.message}`)
		out.push(`    fix: ${f.fix}`)
	}
	return out.join('\n')
}

/** A thrown value as a reader can act on it: the message, then where it came from. */
export function renderThrown(e: unknown): string {
	if (e instanceof Error) {
		const stack = e.stack ?? ''
		return stack.startsWith(`${e.name}: ${e.message}`) || stack.startsWith(e.message)
			? stack
			: `${e.name}: ${e.message}\n${stack}`
	}
	return String(e)
}

/**
 * Whether the fixture host can answer for every node in a document.
 *
 * A bare spec is run only when it can be — the playground has one set of hooks,
 * the suite's, and a document using a definition none of them cover would halt
 * on its first unbound node with an error about the harness rather than about
 * the pipeline. Saying so up front, naming the definition, is the more useful
 * answer.
 */
function unboundDefinition(doc: SpecDocument, bindings: Record<string, unknown>) {
	for (const node of doc.nodes) {
		if (
			!(node.definitionId in bindings) &&
			!(`${node.definitionId}@${node.definitionVersion}` in bindings)
		)
			return node
	}
	return undefined
}

async function fromExample(example: Example): Promise<PlaygroundRun> {
	const doc = documentOf(example.build())
	const findings = validate(doc)
	if (findings.length)
		return { status: 'findings', result: renderFindings(findings), doc, findings }

	const receipt = await example.run(makeExampleRunCtx(doc))
	const preview = previewOf(receipt)
	return {
		status: 'ok',
		result: renderRunSummary(receipt),
		doc,
		receipt,
		preview: preview ? renderPreview(preview) : undefined,
	}
}

async function fromSpec(
	value: SpecBuilder<any> | BuiltSpec | SpecDocument,
): Promise<PlaygroundRun> {
	const doc = documentOf(value)
	const findings = validate(doc)
	if (findings.length)
		return { status: 'findings', result: renderFindings(findings), doc, findings }

	const hooks = fixtures.bindings()
	const unbound = unboundDefinition(doc, hooks as unknown as Record<string, unknown>)
	if (unbound)
		return {
			status: 'ok',
			doc,
			result:
				`${doc.id} compiles and publishes — ${doc.nodes.length} nodes, ${doc.edges.length} edges.\n` +
				`It was not run: the playground's fixture host has no hook for ` +
				`\`${unbound.definitionId}\` (the \`${unbound.key}\` node), so a run would say more ` +
				`about the harness than about this pipeline.\n` +
				`Export an \`example\` instead — \`{ slug, title, summary, build, run(ctx) }\` — to ` +
				`choose the input, the bindings and the world the run uses.`,
		}

	const ctx = makeExampleRunCtx(doc)
	const receipt = await ctx.run({
		input: TRIVIAL_INPUT,
		bindings: hooks,
		world: fixtures.world,
	})
	const preview = previewOf(receipt)
	return {
		status: 'ok',
		result:
			`${doc.id} published, then ran on the fixture host with a trivial input.\n\n` +
			renderRunSummary(receipt),
		doc,
		receipt,
		preview: preview ? renderPreview(preview) : undefined,
	}
}

/** One evaluated module → what to show. Throws nothing; failures come back as `status`. */
export async function runProgram(exports: Record<string, unknown>): Promise<PlaygroundRun> {
	try {
		if (isExample(exports.example)) return await fromExample(exports.example)
		const bare = exports.default ?? exports.spec
		if (isSpecish(bare)) return await fromSpec(bare)
		return {
			status: 'error',
			result:
				`nothing to run. Export \`example\` — \`{ slug, title, summary, build, run(ctx) }\`, ` +
				`the shape every page under Examples uses — or export \`default\` (or \`spec\`) as a ` +
				`spec builder, a built spec or a compiled document.`,
		}
	} catch (e) {
		return { status: 'error', result: renderThrown(e) }
	}
}

/** Source → what to show. The whole of the playground's work, in one call. */
export async function runSource(source: string): Promise<PlaygroundRun> {
	let exports: Record<string, unknown>
	try {
		exports = evaluateModule(await transpile(source))
	} catch (e) {
		return { status: 'error', result: renderThrown(e) }
	}
	return runProgram(exports)
}
