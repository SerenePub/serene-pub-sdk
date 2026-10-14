/**
 * `@serene-pub/core-catalog/album` — the plain-TypeScript half of core's
 * Album widget (PLAN-core-widgets W2): its settings, and the one reading it
 * draws — every picture on the session's lines, newest first, each with
 * where it came from and who showed it when. The widget's Svelte source
 * lives in `components/shared/album/` and ships built
 * (`dist/components/album.js`); a host imports only this half, which carries
 * no Svelte runtime.
 *
 * **What it reads** is the log (`messages.v1`): each row's `core:image`
 * parts, the step's shown revision only, in the order the media strip
 * under the line draws them (`mediaStripItems`). A part with no usable
 * `assetId` is no file anyone can fetch and is left out, as the strip
 * leaves it out. A hidden row's pictures are not drawn. A file part
 * (`core:file`) is not a picture and is the strip's alone.
 *
 * **Where a picture came from** is the row's: a person's line (`role:
 * 'user'`) holds what they **attached**; any other line holds what a run
 * **generated** — image generation, or an outlet that attached its bytes.
 * The part itself names no origin today (`mediaPartFor` writes the same
 * part for all three writers). A line's sprite is not a part — the line
 * records its set and label, the picture is the character's — so the album
 * never draws one.
 *
 * ⚠ Not a **gallery** (a character's or persona's own image set), not the
 * **media strip** (one message's files, under its card) and not the
 * **Media** collection (every file a person stored).
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * 🚧 Provisional with the widget.
 */
import { parseChannel, type MessagePartV1, type MessageV1 } from '@serene-pub/sdk'

/** A translation: English source in, the viewer's words out. @experimental */
export type AlbumT = (source: string) => string

/** Which pictures the album shows. @experimental */
export type AlbumSource = 'all' | 'attached' | 'generated'
/** How large a tile is drawn. @experimental */
export type AlbumTileSize = 'small' | 'medium' | 'large'
/** `grid`: every tile one size. `latest`: the newest large, the rest a strip. @experimental */
export type AlbumArrangement = 'grid' | 'latest'
/** Where one picture came from. @experimental */
export type AlbumOrigin = 'attached' | 'generated'

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface AlbumSettings {
	source: AlbumSource
	tile: AlbumTileSize
	arrangement: AlbumArrangement
	/** One channel's slug, trimmed; `''` for every channel. */
	channel: string
}

/** @experimental */
export const ALBUM_DEFAULTS: AlbumSettings = Object.freeze({
	source: 'all',
	tile: 'medium',
	arrangement: 'grid',
	channel: '',
})

const oneOf = <T extends string>(v: unknown, of: readonly T[], fallback: T): T =>
	typeof v === 'string' && (of as readonly string[]).includes(v) ? (v as T) : fallback

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readAlbumSettings(raw: Record<string, unknown> | undefined): AlbumSettings {
	const v = raw ?? {}
	return {
		source: oneOf(v.source, ['all', 'attached', 'generated'], ALBUM_DEFAULTS.source),
		tile: oneOf(v.tile, ['small', 'medium', 'large'], ALBUM_DEFAULTS.tile),
		arrangement: oneOf(v.arrangement, ['grid', 'latest'], ALBUM_DEFAULTS.arrangement),
		channel: typeof v.channel === 'string' ? v.channel.trim() : ALBUM_DEFAULTS.channel,
	}
}

/** One picture the album shows. @experimental */
export interface AlbumItem {
	/** The part's id — the key. */
	partId: number
	/** The line it is on. */
	messageId: number
	/** `files.id` — the part's `data.assetId`. */
	assetId: number
	/** What a reader is told: the part's alt, then its file's name, then *Image*. */
	label: string
	origin: AlbumOrigin
	/** Who showed it, as the line names them; `''` when the host had no name. */
	speaker: string
	/** When, in the viewer's clock; `''` when the line carries no time. */
	time: string
	/** `speaker · time`, whichever of the two there is. */
	caption: string
	width: number | null
	height: number | null
}

/** The address of one representation (`/media/{id}`, plus `?v=` for a derived one) — the media strip's. @experimental */
export function albumSrc(assetId: number, variant?: 'thumb' | 'fitted'): string {
	return variant ? `/media/${assetId}?v=${variant}` : `/media/${assetId}`
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const count = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/** A `date` column carries the day only; a time of day needs a timestamp. */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The clock beside a line's name, as the line draws it (`SessionMessage`):
 * `createdAt` unless it is a day-only date, then `updatedAt`.
 */
function lineTime(row: MessageV1, locale: string | undefined): string {
	const created: unknown = row.createdAt
	const stamp =
		typeof created === 'string' && DAY_ONLY.test(created)
			? (row.updatedAt ?? created)
			: (created ?? row.updatedAt)
	if (!stamp) return ''
	const at = stamp instanceof Date ? stamp : new Date(stamp as string | number)
	if (Number.isNaN(at.getTime())) return ''
	try {
		return at.toLocaleTimeString(locale || [], { hour: 'numeric', minute: '2-digit' })
	} catch {
		return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	}
}

/** A row's pictures, the shown revision of each step, in the strip's order. */
function imagesOf(row: MessageV1): MessagePartV1[] {
	const parts = Array.isArray(row.parts) ? row.parts : []
	if (!parts.length) return []
	const active = row.activeRevisions ?? {}
	return parts
		.filter(
			(p) =>
				p?.type === 'core:image' &&
				p.revision === (active[String(p.step)] ?? 0) &&
				count((p.data as Record<string, unknown> | null)?.assetId) !== null,
		)
		.sort((a, b) => a.step - b.step || a.ordinal - b.ordinal)
}

/** The row's channel slug: `main` when unset, a lane's slug for `slug:n`. */
const slugOf = (channel: unknown): string => parseChannel(channel).slug

/** What `albumItems` needs beyond the rows and the settings. @experimental */
export interface AlbumItemsOptions {
	/** `locale.v1`, for the clock. */
	locale?: string
	t?: AlbumT
}

/**
 * The album: every picture on `rows` (the log, in its order) the settings
 * let through, **newest line first**, a line's own pictures in the strip's
 * order. `channel`, set, keeps one channel's lines — its every lane — as a
 * Messages copy's `channel` claims one; empty keeps every channel. `source`
 * keeps the attached or the generated alone.
 * @experimental
 */
export function albumItems(
	rows: readonly MessageV1[] | null | undefined,
	settings: Pick<AlbumSettings, 'source' | 'channel'>,
	options: AlbumItemsOptions = {},
): AlbumItem[] {
	if (!rows?.length) return []
	const t = options.t ?? ((s: string) => s)
	const claim = settings.channel ? slugOf(settings.channel) : null
	const out: AlbumItem[] = []
	for (let i = rows.length - 1; i >= 0; i--) {
		const row = rows[i]
		if (!row || typeof row !== 'object' || row.isHidden) continue
		if (claim !== null && slugOf(row.channel) !== claim) continue
		const origin: AlbumOrigin = row.role === 'user' ? 'attached' : 'generated'
		if (settings.source !== 'all' && settings.source !== origin) continue
		const images = imagesOf(row)
		if (!images.length) continue
		const speaker = text(row.speakerLabel) ?? ''
		const time = lineTime(row, options.locale)
		const caption = [speaker, time].filter(Boolean).join(' · ')
		for (const p of images) {
			const d = (p.data ?? {}) as Record<string, unknown>
			out.push({
				partId: p.id,
				messageId: row.id,
				assetId: d.assetId as number,
				label: text(d.alt) ?? text(d.filename) ?? text(d.name) ?? t('Image'),
				origin,
				speaker,
				time,
				caption,
				width: count(d.width),
				height: count(d.height),
			})
		}
	}
	return out
}

/**
 * The `view-image` request for opening picture `index` of `items` (the
 * album as drawn, in display order, less any whose file is gone): the
 * picture itself, full size, and every other as the lightbox's pages,
 * captioned by their names as the media strip captions them.
 * @experimental
 */
export function albumViewImageParams(items: readonly AlbumItem[], index: number) {
	const srcs = items.map((i) => albumSrc(i.assetId))
	return {
		src: srcs[index]!,
		gallery: { srcs, index, captions: items.map((i) => i.label) },
	}
}

/** What the album says when it has nothing to draw, by `source`. @experimental */
export const ALBUM_EMPTY: Readonly<Record<AlbumSource, string>> = Object.freeze({
	all: 'Nothing has been attached or generated in this session yet.',
	attached: 'Nothing has been attached in this session yet.',
	generated: 'Nothing has been generated in this session yet.',
})

/** A tile's name for a reader: *Open attached image cat.png, Wren · 9:41 PM, 2 of 7*. @experimental */
export function albumOpenLabel(
	item: AlbumItem,
	at: number,
	total: number,
	t: AlbumT = (s) => s,
): string {
	const head = item.origin === 'attached' ? t('Open attached image') : t('Open generated image')
	const parts = [`${head} ${item.label}`]
	if (item.caption) parts.push(item.caption)
	if (total > 1) parts.push(`${at + 1} of ${total}`)
	return parts.join(', ')
}

/** The origin glyph's words, for its `title`. @experimental */
export const ALBUM_ORIGIN_NAMES: Readonly<Record<AlbumOrigin, string>> = Object.freeze({
	attached: 'Attached',
	generated: 'Generated',
})
