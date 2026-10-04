import { defineComponent } from '@serene-pub/component-client'

/**
 * The Tally panel's component: one document (`ui/tally.html`), placed as an
 * `sp-frame`. The document is deliberately not shipped — a declared document
 * that is not on disk is the instance's to report, not the packager's.
 */
export default defineComponent((root, ctx) => {
	const frame = document.createElement('sp-frame')
	frame.setAttribute('src', 'ui/tally.html')
	frame.setAttribute('title', 'Tally')
	root.append(frame)
	const draw = () => frame.setAttribute('props', JSON.stringify({ messages: (ctx.channels.main ?? []).length }))
	draw()
	return ctx.subscribe(draw)
})
