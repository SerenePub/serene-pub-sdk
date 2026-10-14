<script lang="ts">
	/**
	 * Album (PLAN-core-widgets W2): what has this session shown me — every
	 * picture on its lines (`messages.v1` parts), newest line first, as
	 * square tiles. Each tile wears a corner glyph for where it came from —
	 * a paperclip for what a person attached, sparkles for what a run
	 * generated — and names who showed it and when on hover or focus. A
	 * press opens the page's lightbox (`view-image`) on that picture, with
	 * the whole album as its pages in the order drawn. Everything it shows is
	 * worked out in the plain half (`albumItems`); this only draws it.
	 *
	 * `arrangement: latest` draws the newest picture large (the `fitted`
	 * representation) and the rest as a thumbnail strip, so an illustrated
	 * scene can sit beside the log as it is generated.
	 *
	 * A picture whose file is gone (deleted from the Media panel) raises
	 * `error` and is drawn as *File no longer available*, never a broken
	 * image, and leaves the lightbox's pages — the media strip's rule.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`album.tile`, …), the settings ride on the root's
	 * `data-tile` and `data-arrangement`, a tile's origin on `data-origin`,
	 * and the default widget stylesheet draws them (STYLE-GUIDE §6.16).
	 */
	import { SvelteSet } from "svelte/reactivity"
	import {
		ALBUM_EMPTY,
		ALBUM_ORIGIN_NAMES,
		albumItems,
		albumOpenLabel,
		albumSrc,
		albumViewImageParams,
		readAlbumSettings,
		type AlbumItem
	} from "@serene-pub/core-catalog/album"
	import { useWidgetContext } from "../context"

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current.t(source) ?? source

	const settings = $derived(
		readAlbumSettings(widget?.current.settings?.v1)
	)
	const items = $derived(
		albumItems(widget?.current.messages?.v1, settings, {
			locale: widget?.current.locale?.v1,
			t
		})
	)

	/** Pictures whose file failed to load, by part id. */
	const missing = new SvelteSet<number>()
	/** What the lightbox pages through: every picture still there, in the order drawn. */
	const openable = $derived(items.filter((i) => !missing.has(i.partId)))

	const latest = $derived(settings.arrangement === "latest")
	const lead = $derived(items[0])
	const rest = $derived(items.slice(1))

	/** Why the page declined the last press, this widget's own. */
	let refusal = $state<string | null>(null)

	async function open(item: AlbumItem): Promise<void> {
		const index = openable.findIndex((i) => i.partId === item.partId)
		if (index < 0) return
		refusal = null
		try {
			await widget?.current.request("view-image", albumViewImageParams(openable, index))
		} catch (e) {
			refusal = e instanceof Error && e.message ? e.message : t("That did not go through. Try again.")
		}
	}

	function label(item: AlbumItem): string {
		const at = openable.findIndex((i) => i.partId === item.partId)
		return albumOpenLabel(item, at, openable.length, t)
	}

	const count = $derived(
		items.length === 1 ? t("1 picture") : `${items.length} ${t("pictures")}`
	)
</script>

{#snippet tile(item: AlbumItem, big: boolean)}
	{#if missing.has(item.partId)}
		<div
			data-widget-part="album.tile"
			data-origin={item.origin}
			data-missing=""
			role="img"
			aria-label={`${item.label}: ${t("File no longer available")}`}
		>
			<sp-icon name="image-off" size="20"></sp-icon>
			<span>{t("File no longer available")}</span>
		</div>
	{:else}
		<button
			type="button"
			data-widget-part="album.tile"
			data-origin={item.origin}
			data-part-id={item.partId}
			data-message-id={item.messageId}
			aria-label={label(item)}
			onclick={() => open(item)}
		>
			<img
				src={albumSrc(item.assetId, big ? "fitted" : "thumb")}
				alt=""
				loading="lazy"
				decoding="async"
				onerror={() => missing.add(item.partId)}
			/>
			<span data-widget-part="album.origin" title={t(ALBUM_ORIGIN_NAMES[item.origin])} aria-hidden="true">
				<sp-icon name={item.origin === "attached" ? "paperclip" : "sparkles"} size="12"></sp-icon>
			</span>
			{#if item.caption}
				<span data-widget-part="album.caption" aria-hidden="true">{item.caption}</span>
			{/if}
		</button>
	{/if}
{/snippet}

<div
	data-widget-part="album.root"
	data-tile={settings.tile}
	data-arrangement={settings.arrangement}
	data-source={settings.source}
	role="group"
	aria-label={t("Album")}
>
	{#if refusal}
		<p data-widget-part="album.alert" role="alert">{refusal}</p>
	{/if}

	{#if !items.length}
		<div data-widget-part="album.empty empty" role="status">
			<sp-icon name="book-image" size="20"></sp-icon>
			<span>{t(ALBUM_EMPTY[settings.source])}</span>
		</div>
	{:else}
		<p data-widget-part="album.toolbar toolbar">{count}</p>
		{#if latest}
			{#if lead}
				<div data-widget-part="album.latest">
					{@render tile(lead, true)}
				</div>
			{/if}
			{#if rest.length}
				<ul data-widget-part="album.strip list">
					{#each rest as item (item.partId)}
						<li>{@render tile(item, false)}</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<ul data-widget-part="album.grid list">
				{#each items as item (item.partId)}
					<li>{@render tile(item, false)}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
