/**
 * What a BUILT component module may carry (§3.5, C4 / C30) — judged on the
 * module's text, as a host judges a package it is handed and the CLI judges
 * what it just wrote.
 *
 * - **Errors:** the host's renderer bundled in (`@remote-dom`); a worker of
 *   its own (`new Worker`, `SharedWorker`, `importScripts`, however named) —
 *   a component runs in the one worker the host starts, and never starts
 *   another; an import the worker cannot resolve — a bare specifier
 *   (`import 'lodash'`), a Node built-in (`node:fs`), a URL (`https:`): a
 *   built module is self-contained, and the worker loads nothing but the
 *   app's own paths.
 * - **Advisories:** element names the module creates that the vocabulary
 *   does not hold. The runtime allowlist is the law (a refused element is
 *   dropped, and said); this only says so before anyone mounts it.
 *
 * The module is LEXED, not grepped: code, strings, templates, comments and
 * regular expressions are told apart, so a sentence in a string ("new
 * Worker( is bad") is not code, and minified output (`import{a}from"x"`)
 * is read as the import it is. The CSP of the page's worker is the wall;
 * this says so at build time.
 */
import { isHostElement } from './hostElements.js'

/** @experimental */
export interface ComponentModuleFindings {
	errors: string[]
	advisories: string[]
}

type Token =
	| { k: 'id'; v: string }
	| { k: 'punct'; v: string }
	| { k: 'str'; v: string }
	/** A template literal: its text, and whether it interpolates. */
	| { k: 'tpl'; v: string; dynamic: boolean }

/** Keywords after which a `/` starts a regular expression, not a division. */
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])

/** Code tokens, and the comments beside them (esbuild's `// node_modules/…` path markers live there). */
function lex(code: string): { tokens: Token[]; comments: string[] } {
	const tokens: Token[] = []
	const comments: string[] = []
	let i = 0
	const n = code.length
	const regexAllowed = () => {
		const last = tokens[tokens.length - 1]
		if (!last) return true
		if (last.k === 'id') return REGEX_AFTER.has(last.v)
		if (last.k === 'punct') return !(last.v === ')' || last.v === ']' || last.v === '}')
		return false
	}
	while (i < n) {
		const c = code[i]!
		if (c === '/' && code[i + 1] === '/') {
			const end = code.indexOf('\n', i)
			comments.push(code.slice(i, end < 0 ? n : end))
			i = end < 0 ? n : end
		} else if (c === '/' && code[i + 1] === '*') {
			const end = code.indexOf('*/', i + 2)
			comments.push(code.slice(i, end < 0 ? n : end + 2))
			i = end < 0 ? n : end + 2
		} else if (c === '"' || c === "'") {
			let j = i + 1
			let v = ''
			while (j < n && code[j] !== c) {
				if (code[j] === '\\') {
					v += code[j + 1] ?? ''
					j += 2
				} else v += code[j++]
			}
			tokens.push({ k: 'str', v })
			i = j + 1
		} else if (c === '`') {
			let j = i + 1
			let v = ''
			let dynamic = false
			let depth = 0
			while (j < n) {
				const d = code[j]!
				if (depth === 0 && d === '`') break
				if (d === '\\') {
					v += code[j + 1] ?? ''
					j += 2
					continue
				}
				if (depth === 0 && d === '$' && code[j + 1] === '{') {
					dynamic = true
					depth = 1
					j += 2
					continue
				}
				if (depth > 0) {
					if (d === '{') depth++
					else if (d === '}') depth--
					j++
					continue
				}
				v += d
				j++
			}
			tokens.push({ k: 'tpl', v, dynamic })
			i = j + 1
		} else if (c === '/' && regexAllowed()) {
			// A regular expression literal: skipped whole (its text is not code).
			let j = i + 1
			let inClass = false
			while (j < n && code[j] !== '\n') {
				const d = code[j]!
				if (d === '\\') {
					j += 2
					continue
				}
				if (d === '[') inClass = true
				else if (d === ']') inClass = false
				else if (d === '/' && !inClass) break
				j++
			}
			j++
			while (j < n && /[a-z]/i.test(code[j]!)) j++
			tokens.push({ k: 'punct', v: 'regex' })
			i = j
		} else if (/[A-Za-z_$]/.test(c)) {
			let j = i + 1
			while (j < n && /[\w$]/.test(code[j]!)) j++
			tokens.push({ k: 'id', v: code.slice(i, j) })
			i = j
		} else if (/\s/.test(c)) i++
		else if (/[0-9]/.test(c)) {
			let j = i + 1
			while (j < n && /[\w.]/.test(code[j]!)) j++
			tokens.push({ k: 'id', v: code.slice(i, j) })
			i = j
		} else {
			tokens.push({ k: 'punct', v: c })
			i++
		}
	}
	return { tokens, comments }
}

/** A specifier the worker can load: the module's own relative files, the app's own absolute paths, inline data. */
const LOADABLE = /^(\.{1,2}\/|\/(?!\/)|data:)/i

/** The specifiers a module imports, and whether it computes one. */
function imports(tokens: Token[]): { specs: string[]; computed: boolean } {
	const specs: string[] = []
	let computed = false
	const literal = (t: Token | undefined) =>
		t && (t.k === 'str' || (t.k === 'tpl' && !t.dynamic)) ? t.v : undefined
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!
		if (t.k !== 'id') continue
		const prev = tokens[i - 1]
		// A property (`x.import`) is not the keyword.
		if (prev?.k === 'punct' && prev.v === '.') continue
		if (t.v === 'import' || t.v === 'require') {
			const next = tokens[i + 1]
			if (next?.k === 'punct' && next.v === '(') {
				const s = literal(tokens[i + 2])
				if (s !== undefined) specs.push(s)
				else if (t.v === 'import') computed = true
				continue
			}
			if (t.v !== 'import') continue
			// `import.meta` is not an import.
			if (next?.k === 'punct' && next.v === '.') continue
			const direct = literal(next)
			if (direct !== undefined) {
				specs.push(direct)
				continue
			}
		}
		if (t.v === 'import' || t.v === 'export') {
			// Up to the statement's `from "x"` — or its end, for a declaration.
			for (let j = i + 1; j < tokens.length && j < i + 400; j++) {
				const u = tokens[j]!
				if (u.k === 'punct' && (u.v === ';' || u.v === '=' || u.v === '(')) break
				if (u.k === 'id' && (u.v === 'function' || u.v === 'class' || u.v === 'const' || u.v === 'let' || u.v === 'var' || u.v === 'default'))
					break
				if (u.k === 'id' && u.v === 'from') {
					const s = literal(tokens[j + 1])
					if (s !== undefined) specs.push(s)
					break
				}
			}
		}
	}
	return { specs, computed }
}

/** A worker the module starts, however it names the constructor. */
function startsWorker(tokens: Token[]): boolean {
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!
		if (t.k !== 'id') continue
		if (t.v === 'importScripts' && tokens[i + 1]?.k === 'punct' && tokens[i + 1]!.v === '(') return true
		// `Worker` / `SharedWorker` named in code at all — constructed, aliased
		// or reached through `globalThis.`: a component has no reason to name
		// either (a string saying the word is not code, and is not read).
		if (t.v === 'Worker' || t.v === 'SharedWorker') return true
	}
	return false
}

/** Element names the module asks the DOM for, or writes into a compiled template. */
function elementNames(tokens: Token[]): string[] {
	const out = new Set<string>()
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!
		if (t.k !== 'id') continue
		if ((t.v === 'createElement' || t.v === 'createElementNS') && tokens[i + 1]?.v === '(') {
			// `createElementNS(ns, name)`: the name follows the first comma.
			let at = i + 2
			if (t.v === 'createElementNS') {
				const comma = tokens.findIndex((u, k) => k > i + 1 && k < i + 40 && u.k === 'punct' && u.v === ',')
				at = comma < 0 ? -1 : comma + 1
			}
			const name = at < 0 ? undefined : tokens[at]
			if (name && (name.k === 'str' || (name.k === 'tpl' && !name.dynamic)) && /^[a-z][\w-]*$/i.test(name.v))
				out.add(name.v.toLowerCase())
		}
		// Svelte's compiled templates (`from_html(\`<div>…\`)`) — markup, not a sentence.
		if (/^from_(?:html|svg|mathml)$/.test(t.v) && tokens[i + 1]?.v === '(') {
			const tpl = tokens[i + 2]
			if (tpl && (tpl.k === 'tpl' || tpl.k === 'str'))
				for (const m of tpl.v.matchAll(/<([a-zA-Z][\w-]*)[\s/>]/g)) out.add(m[1]!.toLowerCase())
		}
	}
	return [...out]
}

/** @experimental */
export function componentModuleFindings(code: string): ComponentModuleFindings {
	const errors: string[] = []
	const advisories: string[] = []
	const { tokens, comments } = lex(code)
	// The renderer, bundled: esbuild's path marker for it, or its own classes.
	if (
		comments.some((c) => /node_modules\/@remote-dom\//.test(c)) ||
		tokens.some((t) => t.k === 'id' && (t.v === 'RemoteRootElement' || t.v === 'BatchingRemoteConnection'))
	)
		errors.push("the module carries @remote-dom — the host's renderer is never part of a component")
	if (startsWorker(tokens))
		errors.push('the module reaches for a worker of its own — a component runs in the one worker the host starts')
	const { specs } = imports(tokens)
	for (const spec of new Set(specs))
		if (spec.includes('@remote-dom/'))
			errors.push(`the module imports '${spec}' — the host's renderer is never part of a component`)
		else if (!LOADABLE.test(spec))
			errors.push(
				`the module imports '${spec}' — the worker loads nothing but the module's own files and the app's paths; bundle it`,
			)
	for (const name of elementNames(tokens))
		if (name !== 'template' && !isHostElement(name))
			advisories.push(`<${name}> is not in the host-element vocabulary — the page will drop it`)
	return { errors, advisories }
}
