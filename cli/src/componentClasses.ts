/**
 * The class check: a best-effort look at the classes a Svelte
 * component's markup names, against the classes the host app was built with.
 *
 * The app's utility classes are generated when the app is built, from the
 * classes its own code uses; a class nothing in the app uses does nothing in
 * a component, silently. The host hands its built list in (`knownClasses`)
 * and each static class token is one Set lookup. A token is checked as
 * written — `md:flex`, `hover:underline` — since the built CSS holds those
 * exact selectors. Class expressions (`class={…}`, a `{…}` inside a quoted
 * value) are not checked, and the file is told so once.
 */

/** @internal Where a finding sits in the authored file: line 1-based, column 0-based. */
export interface ComponentClassFinding {
	line: number
	column: number
	text: string
}

/** Blank `<script>`, `<style>` and comments, keeping every offset and newline. */
function markupOnly(source: string): string {
	const blank = (m: string) => m.replace(/[^\n]/g, ' ')
	return source
		.replace(/<!--[\s\S]*?-->/g, blank)
		.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, blank)
		.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, blank)
}

/** The 1-based line and 0-based column of `offset` in `text`. */
function place(text: string, offset: number): { line: number; column: number } {
	let line = 1
	let start = 0
	for (let i = 0; i < offset; i++)
		if (text.charCodeAt(i) === 10) {
			line++
			start = i + 1
		}
	return { line, column: offset - start }
}

/** A quoted value's static tokens (outside any `{…}`), each with its offset in the value; and whether it had an expression. */
function staticTokens(value: string): { tokens: Array<{ token: string; at: number }>; dynamic: boolean } {
	const tokens: Array<{ token: string; at: number }> = []
	let depth = 0
	let dynamic = false
	let cur = ''
	let curAt = 0
	const flush = () => {
		if (cur) tokens.push({ token: cur, at: curAt })
		cur = ''
	}
	for (let i = 0; i < value.length; i++) {
		const ch = value[i]!
		if (ch === '{') {
			flush()
			depth++
			dynamic = true
			continue
		}
		if (ch === '}' && depth > 0) {
			depth--
			continue
		}
		if (depth > 0) continue
		if (/\s/.test(ch)) {
			flush()
			continue
		}
		if (!cur) curAt = i
		cur += ch
	}
	flush()
	// A token touching an expression (`text-{tone}-500`) is half-dynamic: not checked.
	return {
		tokens: tokens.filter(({ token, at }) => value[at - 1] !== '}' && value[at + token.length] !== '{'),
		dynamic,
	}
}

/** @internal The text of an unknown-class finding. */
export const unknownClassText = (cls: string) =>
	`the class '${cls}' is not one the app was built with, so it does nothing here — ` +
	`pick one core's widgets use, or give the widget a style`

/** @internal The once-per-file note that expressions were not checked. */
export const DYNAMIC_CLASS_TEXT =
	`class expressions ({…}) are not checked against the app's classes — only class="…" strings and class: directives are`

/**
 * @internal Every class in a Svelte file's markup that `known` lacks — once
 * per class, at its first use — plus, at the first class expression, one note
 * that expressions are not checked.
 */
export function unknownClassFindings(source: string, known: ReadonlySet<string>): ComponentClassFinding[] {
	const text = markupOnly(source)
	const out: ComponentClassFinding[] = []
	const said = new Set<string>()
	let dynamicAt = -1
	const check = (token: string, offset: number) => {
		if (known.has(token) || said.has(token)) return
		said.add(token)
		out.push({ ...place(source, offset), text: unknownClassText(token) })
	}
	const attr = /(?<=\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|\{)/g
	for (let m; (m = attr.exec(text)); ) {
		const value = m[1] ?? m[2]
		if (value === undefined) {
			if (dynamicAt < 0) dynamicAt = m.index
			continue
		}
		const valueAt = m.index + m[0].length - value.length - 1
		const { tokens, dynamic } = staticTokens(value)
		if (dynamic && dynamicAt < 0) dynamicAt = m.index
		for (const { token, at } of tokens) check(token, valueAt + at)
	}
	const directive = /(?<=\s)class:([^\s=>]+?)(?=[\s=>]|\/>)/g
	for (let m; (m = directive.exec(text)); ) check(m[1]!, m.index + 'class:'.length)
	out.sort((a, b) => a.line - b.line || a.column - b.column)
	if (dynamicAt >= 0) out.push({ ...place(source, dynamicAt), text: DYNAMIC_CLASS_TEXT })
	return out
}
