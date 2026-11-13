import { i18nText, type I18n } from './i18n.js'

/**
 * 🚧 The one rule for a package's applet card (M2d), run by the packager
 * (`serene-pub check`) and again by the instance's install over the stored
 * manifest. Pure: the caller says which package files exist.
 *
 * Returns one finding per mistake, each with a `fix`: `E_APPLET_CARD_OUTSIDE_ASSETS`,
 * `E_APPLET_CARD_MISSING`, `E_APPLET_CARD_BLURB_LONG`, `E_APPLET_CARD_WITHOUT_APPLET`.
 * Empty when `appletCard` is undefined. Not a reader of files and not a layout
 * check — no aspect ratio is tested.
 * @experimental (M2d)
 */
export function appletCardFindings(
	card: unknown,
	assetsDir: string | undefined,
	fileExists: (path: string) => boolean,
	hasAppletGenre: boolean,
): Array<{ code: string; message: string; fix: string }> {
	if (card === undefined) return []
	const out: Array<{ code: string; message: string; fix: string }> = []
	const c = (card && typeof card === 'object' ? card : {}) as { poster?: unknown; logo?: unknown; blurb?: I18n }
	const dir = assetsDir?.replace(/\/+$/, '')
	for (const key of ['poster', 'logo'] as const) {
		const raw = c[key]
		if (raw === undefined) continue
		const shown = String(raw)
		const safe =
			typeof raw === 'string' &&
			!raw.startsWith('/') &&
			!raw.includes('\\') &&
			!raw.split('/').some((x) => !x || x === '.' || x === '..')
		if (!safe || !dir || !raw.startsWith(`${dir}/`)) {
			out.push({
				code: 'E_APPLET_CARD_OUTSIDE_ASSETS',
				message: `appletCard.${key} is '${shown}', which is not a file under the package's assets folder${dir ? ` '${dir}'` : ' (the package declares none)'}`,
				fix: `declare assets: { dir: 'assets' } and put the picture under it — 'assets/card/${key}.png'`,
			})
			continue
		}
		if (!fileExists(raw))
			out.push({
				code: 'E_APPLET_CARD_MISSING',
				message: `appletCard.${key} names '${shown}', and the package has no such file`,
				fix: `add the picture at that path, or remove appletCard.${key}`,
			})
	}
	if (c.blurb !== undefined) {
		const text = i18nText(c.blurb) ?? ''
		if (text.length > 160)
			out.push({
				code: 'E_APPLET_CARD_BLURB_LONG',
				message: `appletCard.blurb is ${text.length} characters; the card shows at most 160`,
				fix: 'shorten it to one line of at most 160 characters',
			})
	}
	if (!hasAppletGenre)
		out.push({
			code: 'E_APPLET_CARD_WITHOUT_APPLET',
			message: 'appletCard is declared, and no genre of this package presents as an applet',
			fix: "add applet: true to a genre's shape, or remove appletCard",
		})
	return out
}
