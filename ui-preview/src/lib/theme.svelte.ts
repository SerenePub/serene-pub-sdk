/**
 * The active theme and mode, applied the way the app applies them.
 *
 * `data-theme="<bare name>"` and `data-mode="light|dark"` on <html> — the
 * same two attributes `Layout.svelte` sets in Serene Pub, so what a modder
 * sees here is what the shipped Skeleton version does. `data-mode` is not a
 * Skeleton convention; it is the app's, turned into `color-scheme` by the one
 * `@custom-variant` line in `app.css`, and copied verbatim for that reason.
 *
 * Persisted, because a harness that forgot the theme every reload would make
 * "check it on every theme" a chore instead of a click.
 */
const KEY = 'serene-pub:harness-theme'

export interface ThemeState {
	theme: string
	mode: 'light' | 'dark'
}

const DEFAULTS: ThemeState = { theme: 'cerberus', mode: 'dark' }

function load(): ThemeState {
	if (typeof localStorage === 'undefined') return DEFAULTS
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
		if (raw && typeof raw.theme === 'string' && (raw.mode === 'light' || raw.mode === 'dark'))
			return raw as ThemeState
	} catch {
		// A corrupt preference is not worth a broken harness.
	}
	return DEFAULTS
}

class Theme {
	current = $state<ThemeState>(load())

	set(next: Partial<ThemeState>) {
		this.current = { ...this.current, ...next }
		try {
			localStorage.setItem(KEY, JSON.stringify(this.current))
		} catch {
			// Private-mode storage refusal: switching still works, it just
			// does not survive a reload. Not worth surfacing.
		}
		this.apply()
	}

	toggleMode() {
		this.set({ mode: this.current.mode === 'dark' ? 'light' : 'dark' })
	}

	apply() {
		if (typeof document === 'undefined') return
		document.documentElement.setAttribute('data-theme', this.current.theme)
		document.documentElement.setAttribute('data-mode', this.current.mode)
	}
}

export const theme = new Theme()
