import { defineComponent } from '@serene-pub/component-client'

/** Two documents placed as `sp-frame`s: one broken every silent way, one legal. */
export default defineComponent((root) => {
	for (const src of ['ui/panel.html', 'ui/ok.html']) {
		const frame = document.createElement('sp-frame')
		frame.setAttribute('src', src)
		root.append(frame)
	}
})
