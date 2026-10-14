<script lang="ts">
	/**
	 * The scene portraits: faces beside the conversation, three questions
	 * answered by three settings (PLAN-core-widgets W6, 2026-10-11):
	 *
	 *  - **who** (`who`): everyone in the scene — every character still in
	 *    the session, and the persona the viewer is voicing when
	 *    `settings.persona` asks (R77: the viewer's own, never merely the
	 *    first listed); whoever spoke last, newest first (`recent`, ranked by
	 *    `SessionCharacterV1.lastSpokeAt`); or the members named in
	 *    `pickMembers`. A benched character is never drawn.
	 *  - **which picture** (`face`): the avatar, the current sprite, or the
	 *    instance's **chosen image** for that member — its own `src` the
	 *    host's answer to `character-images`, the avatar until then.
	 *  - **how laid out** (`arrangement`): a row, a grid, a column, or a
	 *    stage — the first two, large, side by side, the look the pinned
	 *    portraits had.
	 *
	 * ⋯ on a face (with `face: chosen`) opens the **chooser**: that member's
	 * gallery, paged by `character-images`. A tile chooses that image for the
	 * face (`set-chosen-image`, F2: written into this widget's own settings,
	 * `chosenImages`, as the viewer's own values); *Use the avatar* takes the
	 * choice away. The chooser closes at once, and the face changes when the
	 * settings come back as this widget's `settings` section.
	 *
	 * Every URL and each member's current sprite are the host's (`characters`,
	 * R76): this widget reads no log. The mini bar rows read `session_state`.
	 *
	 * The markup carries widget parts (`data-widget-part`), never a look: the
	 * default widget stylesheet draws them, a style may redraw them
	 * (STYLE-GUIDE §6.16). A face with no picture is the same part with
	 * `data-blank`; the arrangement rides on the root's `data-arrangement`.
	 */
	import { untrack } from "svelte"
	import {
		readScenePortraitsSettings,
		scenePortraitsOf,
		statBarsOf,
		type ScenePortrait
	} from "@serene-pub/core-catalog/scene-portraits"
	import { scopeNotGranted } from "@serene-pub/core-catalog/widgets"
	import { useWidgetContext } from "../context"
	import StatBars from "./StatBars.svelte"

	const w = useWidgetContext()
	const t = (source: string) => w?.current.t?.(source) ?? source

	const settings = $derived(readScenePortraitsSettings(w?.current.settings?.v1))
	const characters = $derived(w?.current.scope("characters"))
	const sessionState = $derived(w?.current.scope("session:state"))
	/**
	 * The host said this widget does not hold `characters` (a plugin's copy
	 * not granted it): the cast will never come — said, not waited for. Its
	 * bars read `session_state`, which is optional: without it, no bars.
	 */
	const castNotGranted = $derived(scopeNotGranted(w?.current, "characters"))
	const portraits = $derived(scenePortraitsOf(characters, sessionState, settings))

	/**
	 * This widget's own error (R77): a refused sprite-set switch is said
	 * here, never in another widget, and gone with the next success or a
	 * dismiss.
	 */
	let error = $state<string | null>(null)
	const messageOf = (e: unknown) =>
		e instanceof Error ? e.message : String(e ?? t("Something went wrong"))

	/** Which face's sprite-set menu is open, by member key. */
	let menuFor = $state<string | null>(null)

	/**
	 * The face menu's sprite-set switch: show a character in another of its
	 * sprite sets for this session only (`null`: as the story has it). The
	 * page asks the server, which checks the asker may and pushes the change
	 * to every member; the menu is offered only where it will be allowed.
	 */
	async function changeSpriteSet(characterId: number, set: string | null) {
		menuFor = null
		try {
			await w?.current.request("set-sprite-set", { characterId, set })
			error = null
		} catch (e) {
			error = messageOf(e)
		}
	}

	/* ── galleries: what `character-images` answered, page by page ─────── */

	interface GalleryImage {
		ref: string
		src: string
		caption?: string
	}
	interface GalleryPages {
		images: GalleryImage[]
		/** The cursor of the next page; null when the last has arrived. */
		next: string | null
		done: boolean
		/** The host refused: said in the chooser, never as the widget's alert. */
		error: string | null
	}
	/** Each member's gallery as far as it has been paged, by character id. */
	let galleries = $state<Record<number, GalleryPages>>({})
	/** Members whose next page is on its way — not state: nothing draws it. */
	const asking = new Set<number>()

	const isImage = (v: unknown): v is GalleryImage =>
		!!v &&
		typeof v === "object" &&
		typeof (v as GalleryImage).ref === "string" &&
		typeof (v as GalleryImage).src === "string"

	/** Ask for the next page of one member's gallery (once at a time). */
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

	/** A chosen image's own `src`, once its member's gallery has shown it. */
	const chosenSrcOf = (p: ScenePortrait): string | null =>
		p.chosenRef
			? (galleries[p.characterId]?.images.find((i) => i.ref === p.chosenRef)?.src ?? null)
			: null

	// Page each shown member's gallery until its chosen image turns up (or
	// the gallery ends): the face shows the avatar until then.
	$effect(() => {
		for (const p of portraits) {
			if (!p.chosenRef) continue
			const g = galleries[p.characterId]
			if (g?.done || g?.images.some((i) => i.ref === p.chosenRef)) continue
			void nextPage(p.characterId)
		}
	})

	/* ── the chooser (⋯ on a face) ─────────────────────────────────────── */

	/** Whose chooser is open, by member key; null for none. */
	let chooserFor = $state<string | null>(null)
	const chooser = $derived(
		chooserFor ? (portraits.find((p) => p.key === chooserFor) ?? null) : null
	)
	const chooserPages = $derived(chooser ? galleries[chooser.characterId] : undefined)

	function openChooser(p: ScenePortrait) {
		chooserFor = p.key
		if (!untrack(() => galleries[p.characterId])) void nextPage(p.characterId)
	}

	/**
	 * Choose `ref` as the image this member's face shows — null for none, so
	 * the avatar again (`set-chosen-image`, F2). The host writes it into
	 * this widget's settings; the face follows when they come back. The
	 * chosen one pressed again changes nothing and just closes. A refusal
	 * is this widget's own line (R77), with the chooser left open.
	 */
	async function chooseImage(member: ScenePortrait, ref: string | null) {
		if (ref === member.chosenRef) {
			chooserFor = null
			return
		}
		try {
			await w?.current.request("set-chosen-image", { characterRef: member.key, mediaRef: ref })
			error = null
			chooserFor = null
		} catch (e) {
			error = messageOf(e)
		}
	}

	/** What the faces say when there are none — by who they would have been. */
	const emptyText = $derived(
		settings.who === "recent"
			? t("Nobody has spoken yet. Faces show up here as the cast speaks.")
			: settings.who === "pick"
				? settings.pickMembers.length
					? t("Nobody in this session goes by the names picked in this widget's settings.")
					: t("Nobody picked yet. Name who to show in this widget's settings.")
				: t("Nobody is in this scene yet. Add a character to the session and they show up here.")
	)
</script>

{#snippet portrait(member: ScenePortrait)}
	{@const src = chosenSrcOf(member) ?? member.src}
	<div
		data-widget-part="scene-portraits.face"
		data-scene-member={member.isPersona ? `persona:${member.characterId}` : member.key}
		data-chosen={member.chosenRef && chosenSrcOf(member) ? "" : undefined}
	>
		{#if src}
			<img {src} alt={member.name} data-widget-part="scene-portraits.face-img" />
		{:else}
			<div data-widget-part="scene-portraits.face-img" data-blank>
				<sp-icon name="user-round" size="20"></sp-icon>
			</div>
		{/if}
		<span data-widget-part="scene-portraits.face-name">{member.name}</span>
		{#if member.rank !== null}
			<span
				data-widget-part="scene-portraits.recent-rank"
				title={member.rank === 1 ? t("Spoke last") : t("Spoke before that")}
				aria-label={t("Recent speaker {n}").replace("{n}", String(member.rank))}
			>{member.rank}</span>
		{/if}
		{#if settings.face === "chosen"}
			<button
				type="button"
				data-widget-part="scene-portraits.choose"
				aria-label={t("Choose an image for {name}").replace("{name}", member.name)}
				title={t("Choose image")}
				onclick={() => openChooser(member)}
			>
				<sp-icon name="ellipsis" size="14"></sp-icon>
			</button>
		{/if}
		{#if member.offersSpriteSets}
			<!-- `sp-popover` (§3.5): our button is the trigger, the set panel the panel. -->
			<sp-popover
				data-widget-part="scene-portraits.set-menu"
				placement="bottom-end"
				label={t("Sprite set")}
				open={menuFor === member.key}
				onopen-change={(e: CustomEvent<{ open: boolean }>) =>
					(menuFor = e.detail.open ? member.key : null)}
			>
				<button
					slot="trigger"
					type="button"
					data-widget-part="scene-portraits.set"
					aria-label={t("Change {name}'s sprite set").replace("{name}", member.name)}
				>
					<sp-icon name="shirt" size="12"></sp-icon>
					<span data-widget-part="scene-portraits.set-name">{member.spriteSetOverride ?? t("Sprite set")}</span>
				</button>
				<div data-widget-part="scene-portraits.set-panel">
					<header data-widget-part="scene-portraits.set-title">
						<sp-icon name="shirt" size="16"></sp-icon>
						<p>{t("Sprite set")}</p>
					</header>
					<div data-widget-part="scene-portraits.set-list" role="menu" aria-label={t("Sprite set")}>
						{#each member.spriteSets as setName (setName)}
							<button
								type="button"
								role="menuitemradio"
								aria-checked={member.spriteSetOverride === setName}
								data-widget-part="scene-portraits.set-option"
								onclick={() => changeSpriteSet(member.characterId, setName)}
							>
								<span>{setName}</span>
							</button>
						{/each}
						<button
							type="button"
							role="menuitemradio"
							aria-checked={!member.spriteSetOverride}
							data-widget-part="scene-portraits.set-option"
							onclick={() => changeSpriteSet(member.characterId, null)}
						>
							<span>{t("As the story has it")}</span>
						</button>
					</div>
					<p data-widget-part="scene-portraits.set-note">
						{t("For this session only. An outfit, an age or a form; the lorebook's cast decides it everywhere else.")}
					</p>
				</div>
			</sp-popover>
		{/if}
		{#if settings.bars && member.ownerKey}
			<StatBars ownerKey={member.ownerKey} rows={statBarsOf(sessionState, member.ownerKey)} />
		{/if}
	</div>
{/snippet}

<div
	data-widget-part="scene-portraits.root"
	data-state-widget="scene-portraits"
	data-arrangement={settings.arrangement}
	data-who={settings.who}
>
	{#if error}
		<div data-widget-part="scene-portraits.alert" role="alert">
			<span data-widget-part="scene-portraits.alert-text">{error}</span>
			<button
				type="button"
				data-widget-part="scene-portraits.dismiss"
				aria-label={t("Dismiss")}
				title={t("Dismiss")}
				onclick={() => (error = null)}
			>
				<sp-icon name="x" size="12"></sp-icon>
			</button>
		</div>
	{/if}
	{#if castNotGranted}
		<div data-widget-part="scene-portraits.empty empty" role="status" data-scope-not-granted="characters">
			<sp-icon name="lock" size="22"></sp-icon>
			<span>
				{t("This widget has not been granted the session's cast. An administrator can grant it in the extension's permissions.")}
			</span>
		</div>
	{:else if !characters}
		<!-- Not yet arrived: say nothing rather than "nothing is here". -->
	{:else if chooser}
		{@const images = chooserPages?.images ?? []}
		<section
			data-widget-part="scene-portraits.chooser"
			aria-label={t("{name}'s images").replace("{name}", chooser.name)}
		>
			<header data-widget-part="scene-portraits.chooser-head card-head">
				<span>{t("{name}'s images").replace("{name}", chooser.name)}</span>
				<button
					type="button"
					data-widget-part="scene-portraits.chooser-close"
					aria-label={t("Close")}
					title={t("Close")}
					onclick={() => (chooserFor = null)}
				>
					<sp-icon name="x" size="13"></sp-icon>
				</button>
			</header>
			{#if chooserPages?.error}
				<p data-widget-part="scene-portraits.chooser-note" role="alert">{chooserPages.error}</p>
			{:else if chooserPages?.done && !images.length}
				<div data-widget-part="scene-portraits.empty empty">
					<sp-icon name="images" size="20"></sp-icon>
					<span>{t("{name} has no images in their gallery.").replace("{name}", chooser.name)}</span>
				</div>
			{/if}
			{#if images.length}
				<div data-widget-part="scene-portraits.chooser-list">
					{#each images as image, index (image.ref)}
						<button
							type="button"
							data-widget-part="scene-portraits.chooser-tile"
							data-chosen={image.ref === chooser.chosenRef ? "" : undefined}
							aria-current={image.ref === chooser.chosenRef ? "true" : undefined}
							aria-label={image.ref === chooser.chosenRef
								? t("Image {n}, shown for {name} now").replace("{n}", String(index + 1)).replace("{name}", chooser.name)
								: t("Show image {n} for {name}").replace("{n}", String(index + 1)).replace("{name}", chooser.name)}
							onclick={() => chooseImage(chooser, image.ref)}
						>
							<img src={image.src} alt="" loading="lazy" />
						</button>
					{/each}
				</div>
			{/if}
			{#if chooserPages && !chooserPages.done}
				<button
					type="button"
					data-widget-part="scene-portraits.chooser-more"
					onclick={() => nextPage(chooser.characterId)}
				>
					{t("Show more")}
				</button>
			{/if}
			{#if chooser.chosenRef}
				<button
					type="button"
					data-widget-part="scene-portraits.chooser-clear"
					onclick={() => chooseImage(chooser, null)}
				>
					{t("Use the avatar")}
				</button>
			{/if}
			<p data-widget-part="scene-portraits.chooser-note">
				{t("Pick the image this face shows. Only your view of this widget changes.")}
			</p>
		</section>
	{:else if !portraits.length}
		<div data-widget-part="scene-portraits.empty empty">
			<sp-icon name="square-user-round" size="22"></sp-icon>
			<span>{emptyText}</span>
		</div>
	{:else if settings.arrangement === "stage"}
		<div data-widget-part="scene-portraits.stage">
			{#each portraits as member (member.key)}
				{@render portrait(member)}
			{/each}
		</div>
	{:else}
		<div data-widget-part="scene-portraits.scene">
			{#each portraits as member (member.key)}
				{@render portrait(member)}
			{/each}
		</div>
	{/if}
</div>
