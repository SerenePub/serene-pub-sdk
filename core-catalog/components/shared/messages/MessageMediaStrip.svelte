<script lang="ts">
	/**
	 * The media strip (composer attachments plan §3.4; next-pass note 40,
	 * 2026-10-03): a message's images and files as a row of square tiles
	 * BELOW the message's card — never inside it — in every state of the row:
	 * settled, legacy text, editing and generating alike. `SessionMessage`
	 * mounts it as its own cell of the message grid, under the content.
	 *
	 * - every image, one or many, is a square **tile**: the `thumb` variant
	 *   cropped to fill the square, the same size each; past
	 *   `MEDIA_STRIP_MAX_TILES` the rest fold into a count tile that opens
	 *   the lightbox where the tiles stop;
	 * - a file is a square **file tile**: its kind's icon, its name, its size
	 *   when known, and a download link.
	 *
	 * Every tile is a button (keyboard-reachable, named "Open image cat.png,
	 * 1 of 3") that asks the page for its lightbox through `onOpen`. An image
	 * whose file is gone (deleted from the Media panel) raises `error` and is
	 * drawn as "File no longer available" — never a broken image — and leaves
	 * the lightbox's gallery.
	 *
	 * No look here: every element is a widget part (`messages.media-*`,
	 * STYLE-GUIDE §6.16, §6.18), drawn by the default widget stylesheet.
	 */
	import { SvelteSet } from 'svelte/reactivity'
	import {
		fileIcon,
		formatBytes,
		mediaDownloadHref,
		mediaSrc,
		MEDIA_STRIP_MAX_TILES,
		type MediaStripItem,
	} from './mediaStrip'

	interface Props {
		items: MediaStripItem[]
		/** Open image `index` of `images` (the strip's available images) in the lightbox. */
		onOpen?: (images: MediaStripItem[], index: number) => void
		/** The row is being edited: a tile may be taken off (D9, remove only). */
		editing?: boolean
		/**
		 * Take one attachment off the message. Absent, no ✕ is drawn — the
		 * host has no removal to offer yet — and absent too for a viewer who
		 * does not control the row.
		 */
		onRemove?: (item: MediaStripItem) => void
	}

	let { items, onOpen, editing = false, onRemove }: Props = $props()

	/** Images whose file failed to load, by part id. */
	const missing = new SvelteSet<number>()

	const images = $derived(items.filter((i) => i.kind === 'image'))
	const files = $derived(items.filter((i) => i.kind === 'file'))
	/** What the lightbox can page through: every image still there. */
	const openable = $derived(images.filter((i) => !missing.has(i.partId)))
	const folds = $derived(images.length > MEDIA_STRIP_MAX_TILES)
	/** With a count tile, the tiles leave its place: one fewer than the cap. */
	const shown = $derived(folds ? images.slice(0, MEDIA_STRIP_MAX_TILES - 1) : images)
	const hidden = $derived(images.length - shown.length)
	const removable = $derived(editing && !!onRemove)

	function open(item: MediaStripItem) {
		const index = openable.findIndex((i) => i.partId === item.partId)
		if (index >= 0) onOpen?.(openable, index)
	}

	function openFolded() {
		// The first image the tiles left out that is still there.
		const first = images.slice(shown.length).find((i) => !missing.has(i.partId))
		if (first) open(first)
	}

	/** "Open image cat.png, 2 of 3" — the position among what the lightbox shows. */
	function openLabel(item: MediaStripItem): string {
		const at = openable.findIndex((i) => i.partId === item.partId)
		return openable.length > 1
			? `Open image ${item.label}, ${at + 1} of ${openable.length}`
			: `Open image ${item.label}`
	}
</script>

{#snippet removeButton(item: MediaStripItem)}
	{#if removable}
		<button
			type="button"
			data-widget-part="messages.media-remove"
			aria-label="Remove {item.label}"
			title="Remove {item.label}"
			onclick={() => onRemove?.(item)}
		>
			<sp-icon name="x" size="14"></sp-icon>
		</button>
	{/if}
{/snippet}

{#snippet gone(item: MediaStripItem)}
	<div data-widget-part="messages.media-missing" role="img" aria-label="{item.label}: file no longer available">
		<sp-icon name="image-off" size="20"></sp-icon>
		<span data-widget-part="messages.media-missing-text">File no longer available</span>
	</div>
{/snippet}

{#if items.length}
	<div
		data-widget-part="messages.media-strip"
		data-editing={removable ? '' : undefined}
		role="group"
		aria-label={items.length === 1 ? 'Attachment' : `${items.length} attachments`}
	>
		{#if images.length}
			<div data-widget-part="messages.media-images">
				{#each shown as item (item.partId)}
					<div data-widget-part="messages.media-item">
						{#if missing.has(item.partId)}
							{@render gone(item)}
						{:else}
							<button
								type="button"
								data-widget-part="messages.media-tile"
								aria-label={openLabel(item)}
								onclick={() => open(item)}
							>
								<img
									data-widget-part="messages.media-tile-img"
									src={mediaSrc(item.assetId, 'thumb')}
									alt={item.label}
									loading="lazy"
									decoding="async"
									onerror={() => missing.add(item.partId)}
								/>
							</button>
						{/if}
						{@render removeButton(item)}
					</div>
				{/each}
				{#if folds}
					<button
						type="button"
						data-widget-part="messages.media-more"
						aria-label="Show {hidden} more {hidden === 1 ? 'image' : 'images'}"
						onclick={openFolded}
					>
						+{hidden}
					</button>
				{/if}
			</div>
		{/if}
		{#if files.length}
			<ul data-widget-part="messages.media-files">
				{#each files as item (item.partId)}
					<li data-widget-part="messages.media-item">
						<a
							data-widget-part="messages.media-file"
							href={mediaDownloadHref(item.assetId)}
							download={item.name ?? undefined}
							title={item.label}
							aria-label="Download {item.label}{item.bytes ? `, ${formatBytes(item.bytes)}` : ''}"
						>
							<sp-icon name={fileIcon(item.mime)} size="20"></sp-icon>
							<span data-widget-part="messages.media-file-name">{item.label}</span>
							{#if item.bytes}
								<span data-widget-part="messages.media-file-size">{formatBytes(item.bytes)}</span>
							{/if}
							<sp-icon name="download" size="14"></sp-icon>
						</a>
						{@render removeButton(item)}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
