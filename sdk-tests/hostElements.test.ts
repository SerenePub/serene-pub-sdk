/**
 * The component contract (§3.5, C1): the host-element vocabulary a remote
 * may place, the imports a component may make, `ComponentDecl` as the one
 * unit of custom UI and `WidgetDecl.component` naming it (R25) — the one
 * way; the `surface` shortcut is refused (retired 2026-10-02).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	SP_HOST_ELEMENTS,
	SP_ELEMENT_TAGS,
	hostAttributeAllowed,
	hostAttributeValueFinding,
	hostElementsDts,
	hostEventAllowed,
	isHostElement,
	COMPONENT_IMPORTS,
	componentImportFinding,
	componentFindings,
	declarationFindings,
	resolveWidgetSurface,
	widgetDeclsFindings,
	component,
	widget,
	type HostElementSpec,
} from '@serene-pub/sdk'

const specs = Object.entries(SP_HOST_ELEMENTS) as Array<[string, HostElementSpec]>

test('the vocabulary carries no script, style, iframe, on* attribute or style attribute', () => {
	for (const banned of ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'])
		assert.equal(isHostElement(banned), false, `${banned} must not be placeable`)
	for (const [tag, spec] of specs) {
		for (const a of spec.attributes) {
			assert.doesNotMatch(a, /^on/i, `${tag} accepts an event-handler attribute '${a}'`)
			assert.notEqual(a, 'style', `${tag} accepts inline style`)
			assert.notEqual(a, 'srcdoc', `${tag} accepts an inline document`)
		}
		// An sp element names the events it raises; nothing raises a handler attribute.
		for (const e of spec.events) assert.doesNotMatch(e, /^on/)
	}
})

test('every element takes class, and every sp element is an sp-* element with a doc', () => {
	for (const [tag, spec] of specs) {
		assert.ok(spec.attributes.includes('class') || tag === 'br', `${tag} takes no class`)
		assert.ok(spec.doc.length > 0, `${tag} is undocumented`)
	}
	assert.ok(SP_ELEMENT_TAGS.length > 0)
	for (const t of SP_ELEMENT_TAGS) assert.match(t, /^sp-[a-z-]+$/)
	// The sp elements §3.5 names are all present.
	for (const t of [
		'sp-avatar', 'sp-icon', 'sp-popover', 'sp-menu', 'sp-dialog', 'sp-tabs', 'sp-combobox',
		'sp-tooltip', 'sp-accordion', 'sp-switch', 'sp-slider', 'sp-progress', 'sp-badge',
		'sp-message-body', 'sp-composer-field', 'sp-scroll', 'sp-frame',
	])
		assert.ok((SP_ELEMENT_TAGS as string[]).includes(t), `${t} is missing`)
	// Every child an sp element lays out is itself in the vocabulary.
	for (const [tag, spec] of specs)
		for (const c of spec.children ?? []) assert.ok(isHostElement(c), `${tag}'s child ${c} is not placeable`)
})

test('the lookups answer from the table, case-insensitively for tags', () => {
	assert.equal(hostAttributeAllowed('BUTTON', 'disabled'), true)
	assert.equal(hostAttributeAllowed('button', 'onclick'), false)
	assert.equal(hostEventAllowed('sp-menu', 'select'), true)
	assert.equal(hostEventAllowed('div', 'click'), false)
	assert.equal(isHostElement('sp-nothing'), false)
	// A named slot is reachable from anywhere: every element takes `slot`.
	assert.equal(hostAttributeAllowed('button', 'slot'), true)
	assert.equal(hostAttributeAllowed('sp-nothing', 'slot'), false)
})

test('a value is checked, not only a name', () => {
	const bad = (tag: string, a: string, v: string) => assert.ok(hostAttributeValueFinding(tag, a, v), `${tag} ${a}=${v}`)
	const ok = (tag: string, a: string, v: string) => assert.equal(hostAttributeValueFinding(tag, a, v), undefined)
	ok('a', 'href', 'https://example.com/x')
	ok('a', 'href', '#section')
	bad('a', 'href', 'javascript:alert(1)')
	bad('a', 'href', 'http://example.com')
	bad('a', 'href', '/admin')
	ok('a', 'target', '_blank')
	bad('a', 'target', 'someWindow')
	bad('a', 'target', '_self')
	assert.equal(hostAttributeAllowed('a', 'rel'), false)
	ok('img', 'src', '/media/abc.png')
	// A face names its revision; a dot segment would leave the media route.
	ok('img', 'src', '/media/0b6e2f1c-9d1a-4c3e-8f55-2d1e0a7b9c10?v=thumb&r=3')
	// A session asset is the route's own shape — one file id — and nothing under it.
	ok('img', 'src', '/session-assets/12')
	ok('img', 'src', '/session-assets/12?v=thumb')
	ok('a', 'href', '/session-assets/12')
	bad('img', 'src', '/session-assets/12/sprites/happy.webp?r=2')
	bad('img', 'src', '/session-assets/abc')
	bad('img', 'src', '/session-assets/0')
	bad('img', 'src', '/session-assets/')
	bad('img', 'src', '/session-assets/..')
	bad('a', 'href', '/session-assets/12/../../api/admin')
	bad('a', 'href', '//evil.example/session-assets/12')
	bad('img', 'src', 'https://evil.example/session-assets/12')
	bad('img', 'src', '/media/../api/admin')
	bad('img', 'src', '/media/%2e%2e/api/admin')
	bad('img', 'src', '/media/a/./b.png')
	bad('img', 'src', '/media/a.png?x#y')
	bad('a', 'href', '/media/../api/admin')
	bad('img', 'src', 'https://cdn.example/a.png')
	ok('img', 'src', '/plugin-ui/acme.dice/ui/die.png')
	bad('img', 'src', 'data:image/png;base64,AAAA')
	ok('sp-frame', 'src', 'ui/chart.html')
	bad('sp-frame', 'src', '../other/ui.html')
	bad('sp-frame', 'src', 'https://evil.example/')
	ok('input', 'type', 'checkbox')
	bad('input', 'type', 'file')
	bad('input', 'type', 'password')
	ok('sp-frame', 'props', '{"a":1}')
	bad('sp-frame', 'props', '[1]')
})

test('aria-current and aria-live: on every plain element that takes aria-label, a closed value set each', () => {
	for (const [tag, spec] of Object.entries(SP_HOST_ELEMENTS)) {
		const attrs = spec.attributes as readonly string[]
		if (tag.startsWith('sp-') || !attrs.includes('aria-label')) continue
		assert.ok(attrs.includes('aria-current'), `${tag} takes aria-current`)
		assert.ok(attrs.includes('aria-live'), `${tag} takes aria-live`)
	}
	for (const v of ['page', 'step', 'location', 'date', 'time', 'true', 'false'])
		assert.equal(hostAttributeValueFinding('li', 'aria-current', v), undefined, v)
	for (const v of ['yes', 'PAGE', '', 'page step'])
		assert.match(hostAttributeValueFinding('li', 'aria-current', v) ?? '', /aria-current/, v)
	for (const v of ['off', 'polite']) assert.equal(hostAttributeValueFinding('div', 'aria-live', v), undefined, v)
	// A widget never shouts over the reader.
	for (const v of ['assertive', 'rude', ''])
		assert.match(hostAttributeValueFinding('div', 'aria-live', v) ?? '', /aria-live/, v)
	// The value set holds on an sp element too (every element takes aria-*).
	assert.ok(hostAttributeValueFinding('sp-badge', 'aria-live', 'assertive'))
	assert.match(hostElementsDts(), /'aria-current'\?: SpAttr/)
	assert.match(hostElementsDts(), /'aria-live'\?: SpAttr/)
})

test('keys, on sp-composer-field and a plain input alike: every token a key, after any of the modifiers the host reads', () => {
	for (const tag of ['sp-composer-field', 'input']) {
		const finding = (v: string) => hostAttributeValueFinding(tag, 'keys', v)
		for (const v of [
			'',
			'Enter',
			'ArrowUp ArrowDown Tab Escape Enter',
			'Escape Control+Enter Meta+Enter',
			'Shift+Meta+ArrowUp',
			'  Escape\tEnter ',
		])
			assert.equal(finding(v), undefined, `${tag}: '${v}' is kept`)
		// A modifier the host does not read, or a token ending at its `+`: a key
		// no press ever matches.
		for (const [v, token] of [
			['+', '+'],
			['Control++', 'Control++'],
			['Ctrl+Enter', 'Ctrl+Enter'],
			['control+Enter', 'control+Enter'],
			['Control+', 'Control+'],
			['Alt+Enter', 'Alt+Enter'],
			['Escape Alt+Enter', 'Alt+Enter'],
			['Enter+Control', 'Enter+Control'],
		]) {
			const why = finding(v)
			assert.ok(why?.includes(`${tag} keys '${token}'`), `${tag}: '${v}' is refused, naming '${token}': ${why}`)
			assert.match(why!, /Control\+, Meta\+ and Shift\+/)
		}
	}
})

test('a plain input takes keys and raises key (R80), and says when it is left (blur); a textarea takes neither', () => {
	assert.equal(hostAttributeAllowed('input', 'keys'), true)
	assert.equal(hostEventAllowed('input', 'key'), true)
	// Its values and changes are what they were: numeric semantics are the field's.
	assert.deepEqual(SP_HOST_ELEMENTS.input.events, ['input', 'change', 'key', 'blur'])
	assert.equal(hostAttributeAllowed('textarea', 'keys'), false)
	assert.equal(hostEventAllowed('textarea', 'key'), false)
})

test('the shipped .d.ts is the table, generated', () => {
	const shipped = readFileSync(new URL('../sdk/host-elements.d.ts', import.meta.url), 'utf8')
	assert.equal(shipped, hostElementsDts(), 'regenerate with `npm run host-elements -w sdk` after a build')
})

test('a component imports svelte, the component client and controls — never the renderer', () => {
	assert.deepEqual([...COMPONENT_IMPORTS], [
		'svelte',
		'svelte/*',
		'@serene-pub/component-client',
		'@serene-pub/component-client/*',
		'@serene-pub/controls',
		// @experimental (C6 P1): the SDK's component subpath and core's UI kit.
		'@serene-pub/sdk/component',
		'@serene-pub/core-catalog/conversation',
		'@serene-pub/core-catalog/lore-entries',
		'@serene-pub/core-catalog/scene-portraits',
		'@serene-pub/core-catalog/session-state',
		'@serene-pub/core-catalog/widgets',
		'@serene-pub/core-catalog/authors-note',
	])
	assert.equal(componentImportFinding('@serene-pub/component-client/svelte'), undefined)
	assert.equal(componentImportFinding('svelte'), undefined)
	assert.equal(componentImportFinding('svelte/store'), undefined)
	assert.equal(componentImportFinding('./Card.svelte'), undefined)
	assert.match(componentImportFinding('@remote-dom/core')!, /host's renderer/)
	assert.match(componentImportFinding('@remote-dom/core', { bundled: true })!, /host's renderer/)
	assert.match(componentImportFinding('lodash')!, /not something a component may import/)
	// The renderer by any path, and anything absolute, are refused.
	assert.match(componentImportFinding('./node_modules/@remote-dom/core/index.js')!, /host's renderer/)
	assert.match(componentImportFinding('/abs/Card.js')!, /absolute path or URL/)
	assert.match(componentImportFinding('https://cdn.example/x.js')!, /absolute path or URL/)
	assert.match(componentImportFinding('node:fs', { bundled: true })!, /absolute path or URL/)
	// A CLI build may bundle a third-party package into the component's module.
	assert.equal(componentImportFinding('lodash', { bundled: true }), undefined)
})

test('a component declares slug, label, entry and framework — and no surface point (R25)', () => {
	const ok = component({ slug: 'who-next', label: 'Who is next', entry: 'dist/whoNext.js', framework: 'svelte' })
	assert.deepEqual(componentFindings([ok]), [])
	const old = { ...ok, surface: 'core:surface/chat-message@1' } as never
	assert.match(componentFindings([old]).join(' '), /a component has none now/)
	assert.match(componentFindings([{ ...ok, entry: '../escape.js' }]).join(' '), /not a path a pub will serve/)
	assert.match(componentFindings([{ ...ok, label: '' }]).join(' '), /label/)
	assert.match(componentFindings([{ ...ok, framework: 'react' as never }]).join(' '), /after SDK 1\.0/)
	assert.match(componentFindings([ok, ok]).join(' '), /duplicate component slug/)
})

test('a widget names a component — the one way; a written `surface` is refused', () => {
	const w = (extra: object) => [{ id: 'w', title: 'W', ...extra }]
	assert.deepEqual(widgetDeclsFindings(w({ component: 'who-next' }), 'x'), [])
	assert.match(widgetDeclsFindings(w({}), 'x').join(' '), /names nothing to render/)
	assert.match(widgetDeclsFindings(w({ component: '' }), 'x').join(' '), /a component's slug/)
	// The retired shortcut, whatever kind it spelled: refused and pointed at a component.
	for (const surface of [
		{ kind: 'frame', pluginId: 'p', entry: 'ui/a.html' },
		{ kind: 'native', component: 'messages' },
		{ kind: 'remote', component: 'a' },
	])
		assert.match(widgetDeclsFindings(w({ component: 'a', surface }), 'x').join(' '), /surface: gone — give `component`/)
	assert.throws(
		() => widget({ id: 'w', title: 'W', component: 'a', surface: { kind: 'frame' } } as never),
		/`surface` is gone/,
	)
	assert.throws(() => widget({ id: 'w', title: 'W' } as never), /names no component/)
})

test("a component resolves to its owner's remote, core's too (R79)", () => {
	assert.deepEqual(resolveWidgetSurface({ component: 'messages' }, 'core'), { kind: 'remote', owner: 'core', component: 'messages' })
	assert.deepEqual(resolveWidgetSurface({ component: 'who-next' }, 'showcase.twenty'), {
		kind: 'remote',
		owner: 'showcase.twenty',
		component: 'who-next',
	})
	assert.equal(resolveWidgetSurface({} as never, 'core'), null)
	// The retired shortcut resolves to nothing — the host offers no such widget.
	assert.equal(resolveWidgetSurface({ surface: { kind: 'frame', pluginId: 'p', entry: 'ui/a.html' } } as never, 'p'), null)
})

test("a package's widget must name a component the package declares", () => {
	const genre = {
		id: 'acme.game:genre/game',
		name: 'Game',
		events: {},
		shape: { panels: [{ id: 'who', title: 'Who', component: 'who-next' }] },
	} as never
	const findings = declarationFindings({ ns: 'acme.game', genres: [genre], components: [] }).errors
	assert.match(findings.join(' '), /names component 'who-next', which this package does not declare/)
	const declared = declarationFindings({
		ns: 'acme.game',
		genres: [genre],
		components: [component({ slug: 'who-next', label: 'Who', entry: 'dist/who.js', framework: 'vanilla' })],
	}).errors
	assert.doesNotMatch(declared.join(' '), /does not declare/)
})
