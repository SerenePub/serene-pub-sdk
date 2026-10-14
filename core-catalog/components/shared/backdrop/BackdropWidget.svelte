<script lang="ts">
	/**
	 * Backdrop (DESIGN-image-generation §6.4, 2026-10-12): the session's
	 * **backdrop** — one picture, session state (`sessions.backdropMediaId`),
	 * set by a pipeline (`core:outlet/set-backdrop@1`) or by a person here.
	 * It arrives on the `session` section (`SessionV1.backdrop`, its `fitted`
	 * address resolved by the host); this widget draws it, fitted
	 * (`fit`: cover or contain) under a darkening overlay (`dim`, 0–100) so
	 * text laid over it stays legible.
	 *
	 * **Change** opens the chooser: a cast member, then their gallery —
	 * paged by the same `character-images` request Scene Portraits' chosen
	 * images use, so no second picker reaches the server. Below it, **From
	 * this session**: the pictures generated in this session, paged by
	 * `session-images` — the Album's `generated` source over the session's
	 * lines, answered by the page (§16 follow-up D3). A tile sets the
	 * backdrop (`set-backdrop`); **Clear** takes it away. Both are offered
	 * only to the session's owner or an admin — the server's own rule — and
	 * the new picture comes back on the `session` section, never the reply.
	 *
	 * A picture whose file is gone draws *File no longer available*, never a
	 * broken image, and Clear still works.
	 *
	 * **Illustrate** (I9, §6.5) fires the Scene action
	 * (`<chat|adventure>-illustrate-scene#illustrate-scene`) through `invoke`,
	 * with `{ placement: 'backdrop' }` — the picture becomes the backdrop
	 * and nothing is posted. Shown only when the session lists that action
	 * (`actions.v1`; Chat and Adventure today) and to the viewer who may change the
	 * backdrop; greyed with the listing's verdict. The new picture arrives
	 * on the `session` section like any other.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`backdrop.root`, …), the settings ride on the
	 * root's `data-fit` and the `--sp-backdrop-dim` variable, and the default
	 * widget stylesheet draws them (STYLE-GUIDE §6.16).
	 */
	import { untrack } from "svelte"
	import {
		BACKDROP_EMPTY,
		BACKDROP_ILLUSTRATE_PAYLOAD,
		backdropOf,
		illustrateActionOf,
		mayChangeBackdrop,
		readBackdropSettings
	} from "@serene-pub/core-catalog/backdrop"
	import { useWidgetContext } from "../context"

	const w = useWidgetContext()
	const t = (source: string) => w?.current.t?.(source) ?? source

	const settings = $derived(readBackdropSettings(w?.current.settings?.v1))
	const backdrop = $derived(backdropOf(w?.current.session?.v1))
	const mayChange = $derived(mayChangeBackdrop(w?.current.viewer?.v1))
	const illustrate = $derived(illustrateActionOf(w?.current.actions?.v1))
	const characters = $derived(w?.current.scope("characters"))
	/** Who the chooser offers: the session's people, benched ones left out. */
	const members = $derived((characters?.members ?? []).filter((m) => !m.benched))

	/** The picture failed to load: its file is gone. Reset when another is set. */
	let missing = $state(false)
	let lastId = $state<number | null>(null)
	$effect(() => {
		const id = backdrop?.mediaId ?? null
		if (id !== untrack(() => lastId)) {
			lastId = id
			missing = false
		}
	})

	/** This widget's own error line (R77). */
	let error = $state<string | null>(null)
	const messageOf = (e: unknown) =>
		e instanceof Error && e.message ? e.message : t("That did not go through. Try again.")

	/* ── the chooser: a member's gallery, by `character-images` ───────── */

	interface GalleryImage {
		ref: string
		src: string
		caption?: string
	}
	interface GalleryPages {
		images: GalleryImage[]
		next: string | null
		done: boolean
		error: string | null
	}

	let choosing = $state(false)
	/** Whose gallery the chooser shows, by character id. */
	let memberId = $state<number | null>(null)
	let galleries = $state<Record<number, GalleryPages>>({})
	/** Members whose next page is on its way — not state: nothing draws it. */
	const asking = new Set<number>()

	const isImage = (v: unknown): v is GalleryImage =>
		!!v &&
		typeof v === "object" &&
		typeof (v as GalleryImage).ref === "string" &&
		typeof (v as GalleryImage).src === "string"

	async function nextPage(characterId: number): Promise<void> {
		const held = untrack(() => galleries[characterId])
		if (asking.has(characterId) || held?.done) return
		asking.add(characterId)
		const keep = held?.images ?? []
		let pages: GalleryPages
		try {
			const res = (await w?.current.request("character-images", {
				characterId,
				...(held?.next ? { cursor: held.next } : {})
			})) as { images?: unknown[]; nextCursor?: string } | undefined
			const images = (Array.isArray(res?.images) ? res.images : []).filter(isImage)
			const next = typeof res?.nextCursor === "string" && res.nextCursor ? res.nextCursor : null
			pages = { images: [...keep, ...images], next, done: !next, error: null }
		} catch (e) {
			pages = { images: keep, next: null, done: true, error: messageOf(e) }
		} finally {
			asking.delete(characterId)
		}
		galleries = { ...untrack(() => galleries), [characterId]: pages }
	}

	/* ── From this session: its generated pictures, by `session-images` ── */

	let sessionPages = $state<GalleryPages | null>(null)
	/** A page is on its way — not state: nothing draws it. */
	let askingSession = false

	async function nextSessionPage(): Promise<void> {
		const held = untrack(() => sessionPages)
		if (askingSession || held?.done) return
		askingSession = true
		const keep = held?.images ?? []
		let pages: GalleryPages
		try {
			const res = (await w?.current.request("session-images", {
				...(held?.next ? { cursor: held.next } : {})
			})) as { images?: unknown[]; nextCursor?: string } | undefined
			const images = (Array.isArray(res?.images) ? res.images : []).filter(isImage)
			const next = typeof res?.nextCursor === "string" && res.nextCursor ? res.nextCursor : null
			pages = { images: [...keep, ...images], next, done: !next, error: null }
		} catch (e) {
			pages = { images: keep, next: null, done: true, error: messageOf(e) }
		} finally {
			askingSession = false
		}
		sessionPages = pages
	}

	function pickMember(id: number) {
		memberId = id
		if (!untrack(() => galleries[id])) void nextPage(id)
	}

	function openChooser() {
		choosing = true
		error = null
		const first = untrack(() => memberId ?? members[0]?.characterId ?? null)
		if (first !== null) pickMember(first)
		// Asked afresh each time: a Scene may have drawn one since.
		sessionPages = null
		void nextSessionPage()
	}

	const member = $derived(members.find((m) => m.characterId === memberId) ?? null)
	const pages = $derived(memberId !== null ? galleries[memberId] : undefined)

	/** Draw the scene as the backdrop: the Scene action, placement `backdrop`. */
	function illustrateNow() {
		if (!illustrate || illustrate.disabled) return
		error = null
		try {
			w?.current.invoke(illustrate.identity, { payload: { ...BACKDROP_ILLUSTRATE_PAYLOAD } })
		} catch (e) {
			error = messageOf(e)
		}
	}

	/** Set the backdrop to `ref` — null clears it. The picture follows on the session section. */
	async function setBackdrop(ref: string | null) {
		try {
			await w?.current.request("set-backdrop", { mediaRef: ref })
			error = null
			choosing = false
		} catch (e) {
			error = messageOf(e)
		}
	}
</script>

<div
	data-widget-part="backdrop.root"
	data-fit={settings.fit}
	data-empty={backdrop ? undefined : ""}
	style:--sp-backdrop-dim={settings.dim / 100}
	role="group"
	aria-label={t("Backdrop")}
>
	{#if backdrop && !missing}
		<img
			data-widget-part="backdrop.image"
			src={backdrop.src}
			alt={t("The session's backdrop")}
			decoding="async"
			onerror={() => (missing = true)}
		/>
		<div data-widget-part="backdrop.dim" aria-hidden="true"></div>
	{:else if backdrop}
		<div data-widget-part="backdrop.missing" role="img" aria-label={t("File no longer available")}>
			<sp-icon name="image-off" size="20"></sp-icon>
			<span>{t("File no longer available")}</span>
		</div>
	{/if}

	{#if error}
		<p data-widget-part="backdrop.alert" role="alert">{error}</p>
	{/if}

	{#if choosing}
		{@const images = pages?.images ?? []}
		{@const own = sessionPages?.images ?? []}
		<section data-widget-part="backdrop.chooser" aria-label={t("Choose a backdrop")}>
			<header data-widget-part="backdrop.chooser-head card-head">
				<span>{t("Choose a backdrop")}</span>
				<button
					type="button"
					data-widget-part="backdrop.chooser-close"
					aria-label={t("Close")}
					title={t("Close")}
					onclick={() => (choosing = false)}
				>
					<sp-icon name="x" size="13"></sp-icon>
				</button>
			</header>
			{#if !members.length}
				<p data-widget-part="backdrop.chooser-note">
					{t("Nobody in this session has a gallery to pick from yet.")}
				</p>
			{:else}
				<div data-widget-part="backdrop.members" role="group" aria-label={t("Whose images")}>
					{#each members as m (m.ref)}
						<button
							type="button"
							aria-pressed={m.characterId === memberId}
							data-widget-part="backdrop.member"
							onclick={() => pickMember(m.characterId)}
						>
							{m.name}
						</button>
					{/each}
				</div>
				{#if pages?.error}
					<p data-widget-part="backdrop.chooser-note" role="alert">{pages.error}</p>
				{:else if pages?.done && !images.length && member}
					<p data-widget-part="backdrop.chooser-note">
						{t("{name} has no images in their gallery.").replace("{name}", member.name)}
					</p>
				{/if}
				{#if images.length}
					<div data-widget-part="backdrop.chooser-list">
						{#each images as image, index (image.ref)}
							<button
								type="button"
								data-widget-part="backdrop.chooser-tile"
								aria-label={t("Use image {n} as the backdrop").replace("{n}", String(index + 1))}
								onclick={() => setBackdrop(image.ref)}
							>
								<img src={image.src} alt="" loading="lazy" />
							</button>
						{/each}
					</div>
				{/if}
				{#if pages && !pages.done && memberId !== null}
					<button
						type="button"
						data-widget-part="backdrop.chooser-more"
						onclick={() => memberId !== null && nextPage(memberId)}
					>
						{t("Show more")}
					</button>
				{/if}
			{/if}
			<section data-widget-part="backdrop.from-session" aria-label={t("From this session")}>
				<h3 data-widget-part="backdrop.chooser-subhead">{t("From this session")}</h3>
				{#if sessionPages?.error}
					<p data-widget-part="backdrop.chooser-note" role="alert">{sessionPages.error}</p>
				{:else if sessionPages?.done && !own.length}
					<p data-widget-part="backdrop.chooser-note">
						{t("Nothing has been generated in this session yet.")}
					</p>
				{/if}
				{#if own.length}
					<div data-widget-part="backdrop.chooser-list">
						{#each own as image, index (image.ref)}
							<button
								type="button"
								data-widget-part="backdrop.chooser-tile"
								aria-label={t("Use picture {n} from this session as the backdrop").replace("{n}", String(index + 1))}
								title={image.caption}
								onclick={() => setBackdrop(image.ref)}
							>
								<img src={image.src} alt="" loading="lazy" />
							</button>
						{/each}
					</div>
				{/if}
				{#if sessionPages && !sessionPages.done}
					<button type="button" data-widget-part="backdrop.chooser-more" onclick={() => nextSessionPage()}>
						{t("Show more")}
					</button>
				{/if}
			</section>
		</section>
	{:else if !backdrop}
		<div data-widget-part="backdrop.empty empty" role="status">
			<sp-icon name="mountain-snow" size="20"></sp-icon>
			<span>{t(BACKDROP_EMPTY)}</span>
		</div>
	{/if}

	{#if mayChange && !choosing}
		<div data-widget-part="backdrop.toolbar toolbar">
			{#if illustrate}
				<button
					type="button"
					data-widget-part="backdrop.illustrate"
					aria-disabled={illustrate.disabled ? "true" : undefined}
					title={t("Draw the scene as it stands and set it as the backdrop")}
					onclick={illustrateNow}
				>
					{t("Illustrate")}
				</button>
			{/if}
			<button type="button" data-widget-part="backdrop.change" onclick={openChooser}>
				{t("Change")}
			</button>
			{#if backdrop}
				<button type="button" data-widget-part="backdrop.clear" onclick={() => setBackdrop(null)}>
					{t("Clear")}
				</button>
			{/if}
		</div>
	{/if}
</div>
