<script lang="ts">
	/**
	 * The scene portraits: faces beside the conversation, from one of two
	 * sources (`settings.source`).
	 *
	 * `pinned` is the two images a person pins from the session's avatar
	 * gallery — the PAGE's pins, riding along on `characters.v1`
	 * (`sceneImages`) and cleared through the page (`clear-scene-image`), so
	 * the page and this widget never disagree about what is pinned (R77). It
	 * is the default because pinning is the only thing a Chat session has to
	 * show.
	 *
	 * `scene` is the cast itself — every character still in the session, and
	 * the persona the viewer is voicing when `settings.persona` asks for it
	 * (R77: the viewer's own, never merely the first listed). A genre that
	 * docks this widget means "who is here", and a fresh session has pinned
	 * nothing, so a docked portrait rail on the pinned source is an empty rail
	 * on day one.
	 *
	 * Every URL and each member's current sprite are the host's (`characters`,
	 * R76): this widget reads no log. The mini bar rows read `session_state`.
	 *
	 * The markup carries widget parts (`data-widget-part`), never a look: the
	 * default widget stylesheet draws them, a style may redraw them
	 * (STYLE-GUIDE §6.16). A face with no picture is the same part with
	 * `data-blank`.
	 */
	import type { SessionCharactersV1, SessionStateV1 } from "@serene-pub/sdk/component"
	import {
		pinnedPortraitsOf,
		readScenePortraitsSettings,
		scenePortraitsOf,
		statBarsOf
	} from "@serene-pub/core-catalog/scene-portraits"
	import { scopeNotGranted } from "@serene-pub/core-catalog/widgets"
	import { useWidgetContext } from "../context"
	import StatBars from "./StatBars.svelte"

	const w = useWidgetContext()
	const t = (source: string) => w?.current.t?.(source) ?? source

	const settings = $derived(
		readScenePortraitsSettings(
			w?.current.settings?.v1 as Record<string, unknown> | undefined
		)
	)
	const characters = $derived(
		w?.current.characters?.v1 as SessionCharactersV1 | undefined
	)
	const sessionState = $derived(
		w?.current.session_state?.v1 as SessionStateV1 | undefined
	)
	/**
	 * The host said this widget does not hold `characters` (a plugin's copy
	 * not granted it): the cast will never come — said, not waited for. Its
	 * bars read `session_state`, which is optional: without it, no bars.
	 */
	const castNotGranted = $derived(scopeNotGranted(w?.current, "characters"))
	const fromScene = $derived(settings.source === "scene")
	const portraits = $derived(scenePortraitsOf(characters, sessionState, settings))
	const pins = $derived(pinnedPortraitsOf(characters, sessionState))
	const hasAny = $derived(pins.some((p) => !!p.src))

	/**
	 * This widget's own error (R77): a refused sprite-set switch or clear is
	 * said here, never in another widget, and gone with the next success or
	 * a dismiss.
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

	/** Clear one side's pin — the page's pin, so the page's tab clears with it. */
	async function clear(side: "left" | "right") {
		try {
			await w?.current.request("clear-scene-image", { side })
			error = null
		} catch (e) {
			error = messageOf(e)
		}
	}
</script>

<div data-widget-part="scene-portraits.root" data-state-widget="scene-portraits">
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
	{:else if fromScene}
		{#if !portraits.length}
			<div data-widget-part="scene-portraits.empty empty">
				<sp-icon name="users" size="22"></sp-icon>
				<span>
					{t("Nobody is in this scene yet. Add a character to the session and they show up here.")}
				</span>
			</div>
		{:else}
			<div data-widget-part="scene-portraits.scene">
				{#each portraits as member (member.key)}
					<div data-widget-part="scene-portraits.face" data-scene-member={member.isPersona ? `persona:${member.characterId}` : member.key}>
						{#if member.src}
							<img
								src={member.src}
								alt={member.name}
								data-widget-part="scene-portraits.face-img"
							/>
						{:else}
							<div data-widget-part="scene-portraits.face-img" data-blank>
								<sp-icon name="user-round" size="20"></sp-icon>
							</div>
						{/if}
						<span data-widget-part="scene-portraits.face-name">{member.name}</span>
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
				{/each}
			</div>
		{/if}
	{:else if !hasAny}
		<div data-widget-part="scene-portraits.empty empty">
			<sp-icon name="users" size="22"></sp-icon>
			<span>
				{t("No scene portraits set. Click a character's avatar in the chat to pin one here.")}
			</span>
		</div>
	{:else}
		<div data-widget-part="scene-portraits.pins">
			{#each pins as pin (pin.side)}
				{@const ownerKey = settings.bars ? pin.ownerKey : null}
				<div data-widget-part="scene-portraits.pin">
					{#if pin.src}
						<img
							src={pin.src}
							alt={pin.side === "left" ? t("left scene portrait") : t("right scene portrait")}
							data-widget-part="scene-portraits.pin-img"
						/>
						{#if ownerKey}
							<StatBars {ownerKey} rows={statBarsOf(sessionState, ownerKey)} />
						{/if}
						<button
							type="button"
							data-widget-part="scene-portraits.pin-clear"
							onclick={() => clear(pin.side)}
							title={pin.side === "left" ? t("Clear left portrait") : t("Clear right portrait")}
							aria-label={pin.side === "left" ? t("Clear left portrait") : t("Clear right portrait")}
						>
							<sp-icon name="x" size="13"></sp-icon>
						</button>
					{:else}
						<div data-widget-part="scene-portraits.pin-placeholder">
							{t("Empty")}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
