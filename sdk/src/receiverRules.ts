/**
 * 🚧 The receiver's rules (C7): what the page does with an element a remote
 * component places and an attribute it writes, beyond the vocabulary table
 * ({@link hostAttributeAllowed}, {@link hostAttributeValueFinding}) — the
 * rules that turn on WHOSE box it is, and the rule that the value a check
 * judged is the value that is written. ONE implementation, which the page's
 * receiver and the component harness (`@serene-pub/cli/testing`) both call,
 * so an author's green test describes the page it will run in.
 *
 * Whose box: `'core'` is core's own component — the host names it only for
 * core's own modules, and refuses a `core` claim from anywhere else — and
 * every other owner is a plugin's.
 *
 * - `sp-host-view` is core's: a plugin's widget does not place the page's own
 *   views (it could lay the page's controls under its own).
 * - `autofocus` is core's to place: a plugin's field never takes the caret
 *   from core's on landing.
 * - `hidden` / `inert` written as the string `"false"` are absent: a boolean
 *   reaching an sp element as its string would otherwise hide what the
 *   component meant to show.
 * - `href` / `src` are trimmed BEFORE they are judged, and the trimmed value
 *   is the one written: the ends the URL parser strips (C0 controls and
 *   space) and the ones the value rules trim (Unicode white space). A value
 *   the rules read as a `#fragment` is then one the host's id prefix reaches,
 *   and one no parser reads as a path.
 * - an `img src` in core's box may also be an `https:` URL or an inline
 *   `data:image/(png|jpeg|gif|webp);base64,…` image — an envoy's face, which
 *   the page's own CSP allows (`img-src https: data:`). A plugin's stays the
 *   app's own media: an image URL is a request the page makes, and a remote's
 *   only way out is its plugin's own server-side actions.
 *
 * What the guard adds, record by record (`guardedConnection`, which both also
 * run): prefixing ids when the host names a prefix (the page does, per box;
 * the harness does not), the tag an update is judged against, and what the
 * remote writes into a subtree these rules refused.
 *
 * @experimental 🚧 provisional with the vocabulary it extends (C7, R21).
 */
import { hostAttributeAllowed, hostAttributeValueFinding, isHostElement } from './hostElements.js'

/** The owner id of core's own component — the one box the owner rules favour. */
const CORE_OWNER = 'core'

/** Global presence booleans a remote can only have meant OFF when it wrote `"false"`. */
const PRESENCE_GLOBALS: ReadonlySet<string> = new Set(['hidden', 'inert'])

/** Attributes holding a URL: trimmed before they are judged, and written trimmed. */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(['href', 'src'])

/** The ends the URL parser strips (C0 controls and space) and the ends `trim` strips (Unicode white space). */
const URL_EDGES = /^[\u0000- \s]+|[\u0000- \s]+$/g

/** Core's box only: an `img src` on another host, over TLS. */
const CORE_IMAGE_HTTPS = /^https:\/\/[^\s]+$/i
/**
 * Core's box only: an inline raster image. Base64 alone, and the four types
 * Remote DOM's own receiver floor also lets through — an `svg+xml` data URI
 * it refuses outright, which would stop the whole box rather than drop one
 * attribute.
 */
const CORE_IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]*={0,2}$/i

/**
 * One attribute, judged: `{ value }` is what to write (`null` removes the
 * attribute), `{ refused }` says why it is dropped. The host appends its own
 * words (`— dropped`); the harness lists the sentence in `refused`.
 * @experimental
 */
export type ReceiverAttribute = { readonly value: string | null } | { readonly refused: string }

/**
 * Judge one attribute a remote writes on a vocabulary element (`tag`, already
 * lowercased and in the vocabulary), in `owner`'s box.
 * @experimental
 */
export function receiverAttribute(tag: string, attribute: string, value: unknown, owner: string): ReceiverAttribute {
	if (!hostAttributeAllowed(tag, attribute)) return { refused: `<${tag}> takes no '${attribute}'` }
	if (attribute === 'autofocus' && owner !== CORE_OWNER) return { refused: `<${tag}> autofocus is core's to place` }
	if (value === null || value === undefined) return { value: null }
	let text = String(value)
	if (URL_ATTRIBUTES.has(attribute)) text = text.replace(URL_EDGES, '')
	if (PRESENCE_GLOBALS.has(attribute) && text === 'false') return { value: null }
	if (
		owner === CORE_OWNER &&
		tag === 'img' &&
		attribute === 'src' &&
		(CORE_IMAGE_HTTPS.test(text) || CORE_IMAGE_DATA.test(text))
	)
		return { value: text }
	const finding = hostAttributeValueFinding(tag, attribute, text)
	return finding ? { refused: finding } : { value: text }
}

/**
 * Why an element a remote places in `owner`'s box does not land — its whole
 * subtree is dropped — or `undefined` when it does.
 * @experimental
 */
export function receiverElementFinding(tag: string, owner: string): string | undefined {
	if (!isHostElement(tag)) return `<${tag}> is not in the host-element vocabulary`
	if (tag.toLowerCase() === 'sp-host-view' && owner !== CORE_OWNER)
		return `<sp-host-view> is core's — a plugin's widget does not place the page's own views`
	return undefined
}
