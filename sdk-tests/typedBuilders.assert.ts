/**
 * Typed branching builders (A18, lane 2), asserted at COMPILE time.
 *
 * Checked by `tsc --noEmit` and never run. The runtime half — that the typed
 * forms store byte-identical documents — is `typedBuilders.test.ts`. Each
 * `@ts-expect-error` FAILS THE BUILD if its error stops happening, so a
 * builder that falls back to `Scope<any>` (or a junction whose result loses
 * its branches) reads here as an unused directive.
 *
 * ⚠ Keep every `@ts-expect-error` case on ONE line.
 */

import { spec, pin, describeTaskDefinition, nodeAt, S } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const pick = pin(
	describeTaskDefinition({
		id: 'typed:task/pick@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.text, word: S.text } },
	}),
)
const read = pin(
	describeTaskDefinition({
		id: 'typed:task/read@1',
		timeoutMs: 500,
		ports: { in: { word: S.text }, out: { main: S.text, call: S.json } },
	}),
)

interface Decided {
	scripts: boolean
	call: { tool: string }
}

// ── junction: `on` typed, branches typed by short key, the result keeps them ─

spec('typed:spec/junction', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.junction('decide', { on: ($) => $.input.text }, (j) =>
		j
			.when('a', { path: (v: Decided) => v.call.tool, equals: 'roll' }, (c) =>
				c.task('go', ($) => pick.v1({ text: $.input.text })).task('next', ($) => read.v1({ word: $.go.word })),
			)
			.otherwise('b', (c) => c.task('other', ($) => pick.v1({ text: $.input.text }))),
	)
	// After the junction: every branch's node, by its full key, with its own ports.
	.task('after', ($) => read.v1({ word: $.decide.a.go.word }))
	.task('after2', ($) => read.v1({ word: $.decide.b.other.word }))
	.task('after3', ($) => read.v1({ word: $.decide.main }))
	// The typed replacement for core-catalog's `at($, 'a.b.c')`.
	.task('after4', ($) => read.v1({ word: nodeAt($, 'decide.a.go').word }))

// @ts-expect-error — `on` reads the nodes before the junction: there is no `nope`
spec('typed:spec/j-on', { version: '1.0.0' }).inlet('input', C.userMessage.v1()).junction('d', { on: ($) => $.nope.text }, (j) => j.otherwise('x', (c) => c))

spec('typed:spec/j-short', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.junction('d', { on: ($) => $.input.text }, (j) =>
		j.when('a', { truthy: true }, (c) =>
			c
				.task('go', ($) => pick.v1({ text: $.input.text }))
				// @ts-expect-error — `go` has no `wrod` port
				.task('next', ($) => read.v1({ word: $.go.wrod })),
		),
	)

spec('typed:spec/j-after', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.junction('d', { on: ($) => $.input.text }, (j) => j.when('a', { truthy: true }, (c) => c.task('go', ($) => pick.v1({ text: $.input.text }))))
	// @ts-expect-error — after the junction a branch node is named by its full key; `d.a.gone` is not one
	.task('after', ($) => read.v1({ word: $.d.a.gone.word }))

spec('typed:spec/j-sibling', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.junction('d', { on: ($) => $.input.text }, (j) =>
		j
			.when('a', { truthy: true }, (c) => c.task('go', ($) => pick.v1({ text: $.input.text })))
			// @ts-expect-error — a sibling branch's node is not this branch's to read
			.when('b', { truthy: false }, (c) => c.task('peek', ($) => read.v1({ word: $.go.word }))),
	)

// @ts-expect-error — a typed path states the type it reads: an unannotated value is `never`
spec('typed:spec/j-path', { version: '1.0.0' }).inlet('input', C.userMessage.v1()).junction('d', { on: ($) => $.input.text }, (j) => j.when('a', { path: (v) => v.tools, truthy: true }, (c) => c))

// @ts-expect-error — nodeAt names a declared node: `decide` is not one here
spec('typed:spec/at', { version: '1.0.0' }).inlet('input', C.userMessage.v1()).task('t', ($) => read.v1({ word: nodeAt($, 'decide').word }))

// ── loop: the predicate stated at the end of the body, typed by the body ────

spec('typed:spec/loop', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.loop('tools', { max: 4 }, (l) =>
		l
			.task('parse', ($) => read.v1({ word: $.input.text }))
			.repeatWhile(($) => $.parse.call),
	)
	.task('after', ($) => read.v1({ word: $.tools.main }))

spec('typed:spec/loop-bad', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.loop('tools', { max: 4 }, (l) =>
		l
			.task('parse', ($) => read.v1({ word: $.input.text }))
			// @ts-expect-error — the body has no `parsed`
			.repeatWhile(($) => $.parsed.call),
	)

// The body reads the loop's own carry — what the passes so far published (lane 4).
spec('typed:spec/loop-carry', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.loop('tools', { max: 4 }, (l) =>
		l
			.task('results', ($) => read.v1({ word: $.tools.values }))
			.repeatWhile(($) => $.results.call),
	)

// The options form is typed against the nodes declared before the loop.
spec('typed:spec/loop-opts', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1())
	.loop('tools', { repeatWhile: ($) => $.input.text, max: 4 }, (l) => l.task('parse', ($) => read.v1({ word: $.input.text })))

// @ts-expect-error — the options form names nodes before the loop: there is no `nope`
spec('typed:spec/loop-opts-bad', { version: '1.0.0' }).inlet('input', C.userMessage.v1()).loop('tools', { repeatWhile: ($) => $.nope.text, max: 4 }, (l) => l)

export {}
