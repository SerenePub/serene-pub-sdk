// Vanilla: plain elements, saved state, a click, a subscription.
import { defineComponent } from '@serene-pub/component-client'

export default defineComponent((root, ctx) => {
	const line = document.createElement('p')
	line.setAttribute('class', 'count')
	const bump = document.createElement('button')
	bump.setAttribute('type', 'button')
	bump.setAttribute('class', 'bump')
	bump.textContent = 'Add one'
	root.append(line, bump)
	let n = typeof (ctx.state as { n?: unknown } | undefined)?.n === 'number' ? (ctx.state as { n: number }).n : 0
	const draw = () => (line.textContent = `count ${n} of ${ctx.messages?.length ?? 0} messages`)
	bump.addEventListener('click', () => {
		n += 1
		ctx.saveState({ n })
		draw()
	})
	draw()
	return ctx.subscribe((section) => {
		if (section === 'state') {
			const saved = (ctx.state as { n?: unknown } | undefined)?.n
			if (typeof saved === 'number') n = saved
		}
		draw()
	})
})
