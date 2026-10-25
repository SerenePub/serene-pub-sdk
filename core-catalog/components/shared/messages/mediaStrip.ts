/**
 * The media strip's reading of a message (composer attachments plan §3.4):
 * which of its parts are files, in what order, and how each is addressed.
 * Pure, so the strip and its tests read one answer.
 *
 * A **media strip** is the square image tiles and file tiles below a
 * message's card (next-pass note 40, 2026-10-03) — `core:image` /
 * `core:file` parts, whoever wrote them (a person's attachment, a
 * pipeline's generated image) — and, since O11 (2026-10-21), a player for
 * each `core:audio` / `core:video` part (a voice note, a spoken reply).
 * Not the character gallery, not
 * an image a block tree places (`messages.block-image` stays where its plugin
 * put it).
 */
import type { MessagePartV1 } from '@serene-pub/sdk/component'

/** One image or file the strip shows. */
export interface MediaStripItem {
	/** The part's id — the key, and what a removal names. */
	partId: number
	/** 🚧 `audio` / `video` since O11 (2026-10-21): drawn as players. */
	kind: 'image' | 'audio' | 'video' | 'file'
	/** `files.id` — the part's `data.assetId`. */
	assetId: number
	/** What a reader is told: the part's alt, then its file's name. */
	label: string
	/** The file's name, when the part kept one. */
	name: string | null
	width: number | null
	height: number | null
	mime: string | null
	bytes: number | null
}

/**
 * The part types the strip shows — the SDK's `MEDIA_PART_TYPES`, spelled
 * here because a component imports no runtime from the SDK. Every one
 * carries `data.assetId`.
 */
const STRIP_PART_TYPES: ReadonlySet<string> = new Set(['core:image', 'core:audio', 'core:video', 'core:file'])
const KIND_OF_PART: Record<string, MediaStripItem['kind']> = {
	'core:image': 'image',
	'core:audio': 'audio',
	'core:video': 'video',
	'core:file': 'file',
}
const KIND_LABEL: Record<MediaStripItem['kind'], string> = {
	image: 'Image',
	audio: 'Audio',
	video: 'Video',
	file: 'File',
}

/** How many image tiles show before the rest fold into a count tile. */
export const MEDIA_STRIP_MAX_TILES = 6

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

/**
 * The message's files, steps ascending and each step's active revision only
 * (the swipe cursor, as `MessagePartsView` reads it), parts in ordinal order.
 * A part with no usable `assetId` is not a file anyone can fetch, so it is
 * left out rather than drawn broken.
 */
export function mediaStripItems(
	parts: readonly MessagePartV1[] | null | undefined,
	activeRevisions: Record<string, number> | null | undefined,
): MediaStripItem[] {
	if (!parts?.length) return []
	const active = activeRevisions ?? {}
	return parts
		.filter(
			(p) =>
				STRIP_PART_TYPES.has(p.type) &&
				p.revision === (active[String(p.step)] ?? 0) &&
				count((p.data as Record<string, unknown> | null)?.assetId) !== null,
		)
		.sort((a, b) => a.step - b.step || a.ordinal - b.ordinal)
		.map((p) => {
			const d = (p.data ?? {}) as Record<string, unknown>
			const kind = KIND_OF_PART[p.type] ?? 'file'
			const name = text(d.filename) ?? text(d.name)
			return {
				partId: p.id,
				kind,
				assetId: d.assetId as number,
				label: text(d.alt) ?? name ?? KIND_LABEL[kind],
				name,
				width: count(d.width),
				height: count(d.height),
				mime: text(d.mime),
				bytes: count(d.bytes),
			}
		})
}

/** The address of one representation (`/media/{id}`, plus `?v=` for a derived one). */
export function mediaSrc(assetId: number, variant?: 'thumb' | 'fitted'): string {
	return variant ? `/media/${assetId}?v=${variant}` : `/media/${assetId}`
}

/** A file's download address — the app's own, saved under its name. */
export function mediaDownloadHref(assetId: number): string {
	return `/media/${assetId}?download=1`
}

/** A byte count for a file tile: `812 B`, `14 KB`, `3.2 MB`. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The icon a file tile wears, by its type. */
export function fileIcon(mime: string | null): string {
	if (!mime) return 'file'
	if (mime.startsWith('text/') || mime === 'application/pdf') return 'file-text'
	if (mime.startsWith('audio/')) return 'file-audio'
	if (mime.startsWith('video/')) return 'file-video'
	return 'file'
}

/**
 * The `view-image` request for opening image `index` of `images`: the image
 * itself, full size, and the message's other images as the lightbox's
 * gallery so it can page through them. Images the strip found missing are
 * not offered.
 */
export function viewImageParams(images: readonly MediaStripItem[], index: number) {
	const srcs = images.map((i) => mediaSrc(i.assetId))
	return {
		src: srcs[index],
		gallery: { srcs, index, captions: images.map((i) => i.label) },
	}
}
