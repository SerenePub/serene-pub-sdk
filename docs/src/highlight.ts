/**
 * Syntax highlighting: ONE shiki highlighter per compile, carrying only the
 * grammars the caller asked for.
 *
 * Both themes are baked into the same markup as `--shiki-light` /
 * `--shiki-dark` CSS variables rather than two rendered copies, because the
 * consumer already owns the light/dark decision (`[data-mode="dark"]`) and a
 * docs page that re-derives it would disagree with the shell the first time
 * someone toggles.
 */
import { createHighlighter, type Highlighter } from 'shiki'

export interface DocsHighlighter {
	/** The highlighted block, or null when the grammar was not loaded. */
	render(code: string, lang: string): string | null
	dispose(): void
}

export async function createDocsHighlighter(languages: string[]): Promise<DocsHighlighter> {
	let highlighter: Highlighter
	try {
		highlighter = await createHighlighter({
			themes: ['github-light', 'github-dark'],
			langs: languages,
		})
	} catch (cause) {
		throw new Error(
			`Could not load the shiki grammars ${languages.map((l) => `\`${l}\``).join(', ')}: ` +
				`${(cause as Error).message}`,
			{ cause },
		)
	}
	const loaded = new Set(highlighter.getLoadedLanguages())
	return {
		render(code, lang) {
			if (!loaded.has(lang)) return null
			return highlighter.codeToHtml(code, {
				lang,
				themes: { light: 'github-light', dark: 'github-dark' },
				defaultColor: false,
			})
		},
		dispose() {
			highlighter.dispose()
		},
	}
}
