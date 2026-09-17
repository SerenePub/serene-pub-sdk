/**
 * The document a reader sees: an editor, a Run button, and four panes.
 *
 * Everything that touches the DOM is here, and everything that decides anything
 * is in `runner.ts`. That split is not tidiness — it is what lets the suite run
 * the real examples through the real module map under node, where there is no
 * `document` to speak of.
 *
 * The four panes are four different questions, and a reader picks which one
 * they are asking: **Result** is what the run did, **Document** is what the
 * builder compiled to, **Graph** is that document drawn, **Preview** is the
 * payload a preview run stopped before sending. Each is empty until there is
 * something true to put in it — an empty pane that says why beats a pane
 * showing the last run's answer to a different question.
 */

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import {
	bracketMatching,
	defaultHighlightStyle,
	indentUnit,
	syntaxHighlighting,
} from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import {
	EditorView,
	drawSelection,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	lineNumbers,
} from '@codemirror/view'

import { renderDocumentGraph } from './graph.js'
import type { PlaygroundLang, PlaygroundTheme } from './protocol.js'
import { runSource, type PlaygroundRun } from './runner.js'

type PaneId = 'result' | 'document' | 'graph' | 'preview'

const PANES: Array<{ id: PaneId; label: string; empty: string }> = [
	{ id: 'result', label: 'Result', empty: 'Press Run to execute this code.' },
	{
		id: 'document',
		label: 'Document',
		empty: 'The compiled SpecDocument appears here once something builds.',
	},
	{ id: 'graph', label: 'Graph', empty: 'The document, drawn, once something builds.' },
	{
		id: 'preview',
		label: 'Preview',
		empty: 'What a preview run would have sent, when the run is a preview run.',
	},
]

export interface Playground {
	/** Replace the editor's contents, and remember them as what Reset returns to. */
	load(code: string, lang: PlaygroundLang): void
	setTheme(theme: PlaygroundTheme): void
	run(): void
}

export interface PlaygroundOptions {
	/** Told whenever a run starts and settles, so the host can be told too. */
	onRunState?: (running: boolean) => void
}

const el = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] => {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text !== undefined) node.textContent = text
	return node
}

/** The editor's own look, in both themes. Colours come from `styles.css`. */
const baseTheme = EditorView.theme({
	'&': { fontSize: '13px', backgroundColor: 'transparent', height: '100%' },
	'.cm-scroller': {
		fontFamily: 'var(--pg-font-mono)',
		lineHeight: '1.6',
		overflow: 'auto',
	},
	'&.cm-focused': { outline: '2px solid var(--pg-focus)', outlineOffset: '-2px' },
	'.cm-gutters': {
		backgroundColor: 'transparent',
		border: 'none',
		color: 'var(--pg-muted)',
	},
	'.cm-content': { caretColor: 'var(--pg-ink)' },
})

const lightTheme = EditorView.theme(
	{
		'&': { color: 'var(--pg-ink)' },
		'.cm-activeLine': { backgroundColor: 'var(--pg-surface-2)' },
		'.cm-activeLineGutter': { backgroundColor: 'var(--pg-surface-2)' },
		'.cm-selectionBackground, ::selection': { backgroundColor: 'var(--pg-selection)' },
	},
	{ dark: false },
)

export function createPlayground(root: HTMLElement, opts: PlaygroundOptions = {}): Playground {
	// ── Chrome ──────────────────────────────────────────────────────────────
	const shell = el('div', 'pg')

	const toolbar = el('div', 'pg-toolbar')
	toolbar.setAttribute('role', 'toolbar')
	toolbar.setAttribute('aria-label', 'Playground')

	const runButton = el('button', 'pg-button pg-button-run')
	runButton.type = 'button'
	runButton.append('Run', el('kbd', 'pg-kbd', modLabel()))

	const resetButton = el('button', 'pg-button', 'Reset')
	resetButton.type = 'button'
	resetButton.title = 'Put the original code back'

	const status = el('span', 'pg-status')
	status.setAttribute('role', 'status')
	status.setAttribute('aria-live', 'polite')

	toolbar.append(runButton, resetButton, status)

	const editorHost = el('div', 'pg-editor')

	const tabs = el('div', 'pg-tabs')
	tabs.setAttribute('role', 'tablist')
	tabs.setAttribute('aria-label', 'Output')

	const output = el('div', 'pg-output')

	const tabButtons = new Map<PaneId, HTMLButtonElement>()
	const panels = new Map<PaneId, HTMLElement>()

	for (const pane of PANES) {
		const tab = el('button', 'pg-tab', pane.label)
		tab.type = 'button'
		tab.id = `pg-tab-${pane.id}`
		tab.setAttribute('role', 'tab')
		tab.setAttribute('aria-controls', `pg-panel-${pane.id}`)
		tab.addEventListener('click', () => select(pane.id))
		tabs.append(tab)
		tabButtons.set(pane.id, tab)

		const panel = el('div', 'pg-panel')
		panel.id = `pg-panel-${pane.id}`
		panel.setAttribute('role', 'tabpanel')
		panel.setAttribute('aria-labelledby', tab.id)
		panel.tabIndex = 0
		panel.append(el('p', 'pg-empty', pane.empty))
		output.append(panel)
		panels.set(pane.id, panel)
	}

	// Left/Right move between tabs and take focus with them — the roving
	// tabindex a tablist is supposed to have, rather than four tab stops.
	tabs.addEventListener('keydown', (e) => {
		const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
		if (!step) return
		e.preventDefault()
		const order = PANES.map((p) => p.id)
		const next = order[(order.indexOf(selected) + step + order.length) % order.length]!
		select(next)
		tabButtons.get(next)!.focus()
	})

	shell.append(toolbar, editorHost, tabs, output)
	root.append(shell)

	// ── The editor ──────────────────────────────────────────────────────────
	const themeCompartment = new Compartment()
	// The fence's declared language. It only changes how the editor colours
	// what it shows — everything goes through the TypeScript transform either
	// way, because that transform is a superset and a `js` fence that happens
	// to annotate a type is a fence that should still run.
	const langCompartment = new Compartment()
	let loaded = ''

	const view = new EditorView({
		parent: editorHost,
		state: EditorState.create({
			doc: '',
			extensions: [
				lineNumbers(),
				highlightActiveLineGutter(),
				highlightActiveLine(),
				highlightSpecialChars(),
				history(),
				drawSelection(),
				bracketMatching(),
				indentUnit.of('\t'),
				langCompartment.of(javascript({ typescript: true })),
				EditorView.lineWrapping,
				baseTheme,
				themeCompartment.of([syntaxHighlighting(defaultHighlightStyle), lightTheme]),
				keymap.of([
					{ key: 'Mod-Enter', run: () => (run(), true) },
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
				]),
			],
		}),
	})

	// ── Panes ───────────────────────────────────────────────────────────────
	let selected: PaneId = 'result'
	/** The most recent run, so selecting Graph later draws THIS document. */
	let latest: PlaygroundRun | undefined

	function select(id: PaneId): void {
		selected = id
		for (const pane of PANES) {
			const active = pane.id === id
			const tab = tabButtons.get(pane.id)!
			tab.setAttribute('aria-selected', String(active))
			tab.tabIndex = active ? 0 : -1
			panels.get(pane.id)!.hidden = !active
		}
		if (id === 'graph' && latest?.doc) void drawGraph(latest)
	}
	select('result')

	function setPane(id: PaneId, content: Node | string | undefined, empty?: string): void {
		const panel = panels.get(id)!
		panel.replaceChildren()
		if (content === undefined) {
			panel.append(el('p', 'pg-empty', empty ?? PANES.find((p) => p.id === id)!.empty))
			return
		}
		panel.append(typeof content === 'string' ? el('pre', 'pg-pre', content) : content)
	}

	/**
	 * The graph is drawn only when somebody asks for it, and only once per run.
	 * elkjs is a megabyte and a half; a reader who never opens the pane never
	 * fetches it.
	 */
	let graphFor: PlaygroundRun | undefined
	async function drawGraph(result: PlaygroundRun): Promise<void> {
		if (graphFor === result || !result.doc) return
		graphFor = result
		const figure = el('div', 'pg-graph')
		figure.append(el('p', 'pg-empty', 'Laying the graph out…'))
		setPane('graph', figure)
		try {
			const svg = await renderDocumentGraph(result.doc)
			// First-party markup from the docs compiler, which escapes every
			// label it interpolates. Nothing a reader typed reaches this as
			// markup — only as a node key inside an escaped `<text>`.
			figure.innerHTML = svg
		} catch (e) {
			// The elk bundle failed to arrive. Say so where the reader is
			// looking, and let them try again by leaving the tab selectable.
			graphFor = undefined
			figure.replaceChildren(el('pre', 'pg-pre', e instanceof Error ? e.message : String(e)))
		}
	}

	// ── Running ─────────────────────────────────────────────────────────────
	let running = false

	function setRunning(next: boolean): void {
		running = next
		runButton.disabled = next
		shell.classList.toggle('pg-running', next)
		status.textContent = next ? 'running…' : ''
		opts.onRunState?.(next)
	}

	function show(result: PlaygroundRun): void {
		shell.dataset.status = result.status
		setPane('result', result.result)
		setPane(
			'document',
			result.doc ? JSON.stringify(result.doc, null, '\t') : undefined,
			'Nothing compiled, so there is no document to show.',
		)
		setPane('preview', result.preview, 'This run produced no preview.')
		graphFor = undefined
		latest = result
		setPane(
			'graph',
			undefined,
			result.doc
				? 'Select this tab to draw the document.'
				: 'Nothing compiled, so there is nothing to draw.',
		)
		select(result.status === 'ok' ? selected : 'result')
	}

	function run(): void {
		if (running) return
		setRunning(true)
		// Handed to the microtask queue so the button's disabled state and the
		// "running…" line have painted before the first synchronous stretch of
		// a reader's own code runs on this thread.
		void Promise.resolve()
			.then(() => runSource(view.state.doc.toString()))
			.then(show)
			.finally(() => setRunning(false))
	}

	runButton.addEventListener('click', run)
	resetButton.addEventListener('click', () => {
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: loaded } })
		view.focus()
	})

	return {
		load(code, lang) {
			loaded = code
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: code },
				effects: langCompartment.reconfigure(javascript({ typescript: lang === 'ts' })),
			})
		},
		setTheme(theme) {
			document.documentElement.dataset.theme = theme
			view.dispatch({
				effects: themeCompartment.reconfigure(
					theme === 'dark'
						? oneDark
						: [syntaxHighlighting(defaultHighlightStyle), lightTheme],
				),
			})
		},
		run,
	}
}

/**
 * The shortcut as this machine writes it.
 *
 * `navigator.platform` is deprecated and `userAgentData` is not everywhere, so
 * this reads whichever exists and falls back to the Ctrl spelling — a wrong
 * label on a button whose keybinding works either way, rather than a crash.
 */
function modLabel(): string {
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
	const platform = nav.userAgentData?.platform ?? nav.platform ?? ''
	return /mac|iphone|ipad/i.test(platform) ? '⌘↵' : 'Ctrl+↵'
}
