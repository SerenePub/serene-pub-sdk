/**
 * The laws page, rendered from the conformance kit.
 *
 * `@serene-pub/conformance` already states every guarantee a host must hold —
 * the law it comes from, what it means, and what breaks in the product when it
 * stops being true. Those strings are read by whoever watches a requirement go
 * red, so they are already written for a human. Rendering the page from them
 * rather than re-describing them keeps the documented guarantee and the
 * executed one the same sentence: a requirement that changes changes the page,
 * and a requirement nobody wrote a consequence for cannot hide in prose.
 */
import { REQUIREMENTS } from '@serene-pub/conformance'
import type { DocPage } from './docs.js'

const code = (s: string) => '`' + s + '`'

/**
 * `laws.md` — one section per requirement, in the kit's own order.
 *
 * Returns an array because this sits beside `renderAnnouncementDocs()` in the
 * same source and may grow a second page; a caller appends it to that source's
 * pages.
 * @internal
 */
export function renderLawsDocs(): DocPage[] {
	const lines: string[] = []
	lines.push('# What the executor guarantees')
	lines.push('')
	lines.push(
		'These are not descriptions of the executor — they are the conformance kit, ' +
			'the executable requirements every host that runs Serene Pub pipelines has to ' +
			'pass, and this page is rendered from them. Each one names the law it comes from ' +
			'and what stops working in the product if a host gets it wrong, because a red ' +
			'line reading ' +
			code('C7') +
			' tells nobody what to go and look at. A plugin author reads this as the set of ' +
			'promises a pipeline may rely on wherever it runs.',
	)
	lines.push('')

	for (const r of REQUIREMENTS) {
		lines.push(`## ${r.id} — ${r.title}`)
		lines.push('')
		lines.push(`Law ${code(r.law)}.`)
		lines.push('')
		lines.push(`**If a host breaks this:** ${r.consequence}`)
		lines.push('')
	}

	return [{ path: 'laws.md', markdown: lines.join('\n') }]
}
