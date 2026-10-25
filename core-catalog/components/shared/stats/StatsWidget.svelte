<script lang="ts">
	/**
	 * The Stats widget: the session's stats for every owner that holds them —
	 * the world, the cast, the places — as cards, a list, a strip, or 🚧 a
	 * row of faces over one sheet (R21; W7; PLAN-sheet-widget §1–§3, §10, §12).
	 *
	 * Values come from the session's one resolved read (the `session_state`
	 * section), so this widget never resolves anything itself. What it owns is
	 * the drawing: a bounded integer is a bar, an enum a chip, text a line, a
	 * boolean a toggle, a list of a ruleset's pieces a row per piece with its
	 * details in a popout, and a derived, retired or locked slot is plain
	 * words because there is nothing to write. Whose stats, which ones and how
	 * they are laid out are its settings (`owners`, `castScope`, `slots`,
	 * `arrangement`, `density`; `statsView`).
	 *
	 * **Flush** (§1): the sheet is the widget, not a card inside it — the box
	 * has no padding of its own and keeps a stable scrollbar gutter, and a
	 * lone owner (`owners: mine`, one picked, a faces sheet) draws flat
	 * (`data-single`). Several owners stack edge to edge with a hairline.
	 *
	 * 🚧 **Faces** (`arrangement: faces`, §10): a strip of owner chips — the
	 * owner's face or initial, its name, a dot when that sheet changed since
	 * the viewer last looked (a value fingerprint, `ownerSheetHash`) — over
	 * ONE sheet. The viewer's own seat is first and chosen; which chip is
	 * chosen, and what each sheet looked like when last seen, is the viewer's
	 * own saved view state (`saveState`), never the layout's.
	 *
	 * 🚧 **The sheet head's face** (§12): a cast member's or a seat's face is
	 * a button opening the portrait picker — Choose (the pictures made in
	 * this session, `session-images`), Draw (offered once a request for it
	 * exists; until then said and greyed), Use this, Clear — written by
	 * `set-owner-face`. The new face arrives on the next push.
	 *
	 * 🚧 **Give to…** (§10; owner ruling ★4, 2026-10-19): a piece's popout
	 * hands it — how many of a stack the viewer says — to another owner that
	 * carries the same stat, or puts it down at a place: ONE `give-piece`
	 * request, and the host decides. Given at once where the viewer may write
	 * both sheets; else an **offer** to that player, drawn on both sheets
	 * (`stats.offers`) until the receiver accepts or declines it, or the giver
	 * withdraws it (`decide-proposal`). A player's character gives only to
	 * another player's character or a place: a companion keeps no sheet a
	 * gift could land on (`giveTargets`).
	 *
	 * A refusal is the row's own (A21): each write resolves to the host's
	 * refusal or nothing, and the control that asked keeps its draft and says
	 * it — in plain words, the host's sentence in the tooltip when it named
	 * the machinery. There is no widget-level error line for a write; only a
	 * failed read is the widget's (`stats.alert`).
	 *
	 * With `trail` (the default), a button at the end of each stat's row opens
	 * its **stat trail** in a popover (F2), asked by `stat-trail` when opened.
	 *
	 * A copy's `emptyState` setting says what the widget says when there is
	 * nothing to draw, in the genre's words, and its `timeFormat` spells a
	 * story-time stat.
	 *
	 * 🚧 **The rules' attributes, every kind** (RF fix 8, owner 2026-10-23):
	 * the sheet draws only the session's rules' attributes, each by its kind
	 * and shown-as hint (`drawnAs`: a number as a bar, a count or a badge; a
	 * pool as pips or a bar; a tally as a count; a word as a badge or words; a
	 * list; free text over several lines), what the owner holds zone by zone
	 * (`stats.zones`, a list or a fan), its ties, and its worked-out values.
	 * The host's place and time are a **Where and when** row of their own
	 * (`stats.where`, the story clock on the world's), never among the
	 * attributes; a genre's tool state is a block of its own under them
	 * (`stats.tools`), unless a copy's `toolState` is `hidden`. A holder switches the rules'
	 * optional attributes on and off here too (`stats.carries`,
	 * `set-attribute-carry`). Rules that declare no attributes say so.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`stats.card card`, `stats.faces`, …), the
	 * arrangement rides on `data-arrangement`, whose on `data-owners`, a lone
	 * owner on `data-single`, and the default widget stylesheet draws them
	 * (STYLE-GUIDE §6.16).
	 */
	import { untrack } from "svelte"
	import type { SessionStateOwnerV1, SessionStateSlotV1 } from "@serene-pub/core-catalog/widgets"
	import {
		derivedRowsAt,
		derivedRowsOf,
		facesOwners,
		giveTargets,
		offersOf,
		ownerSheetHash,
		plainRefusal,
		repertoiresFor,
		statsSettingsOf,
		statsView,
		statTrailByText,
		statTrailRows,
		tieBarPercent,
		tieRowsOf,
		carryRowsOf,
		type CarryRow,
		type ZoneRow,
		type GiveTarget,
		type TieRow,
		type SlotWriteValue,
		type StatsOwnerGroup,
		type StatsShownOwner,
		type StatTrailRow
	} from "@serene-pub/core-catalog/session-state"
	import { useWidgetContext } from "../context"
	import SlotControl from "../state/SlotControl.svelte"
	import { createSlotWriter, type SlotWriteResult } from "../state/slotWriter.svelte"
	import { createEntryFinder } from "../state/entryFinder"

	const widget = useWidgetContext()
	const t = (source: string) => widget?.current.t(source) ?? source
	const writer = createSlotWriter(widget, t)
	// A list's lorebook picker (phase 3c) searches through `session-entries`.
	const entryFinder = createEntryFinder(widget, t)
	/**
	 * 🚧 Offered only where there is a book to pick from: the host says which
	 * book the session reads (`SessionV1.lorebookId`); null is none.
	 */
	let findEntries = $derived(widget?.current.session?.v1?.lorebookId === null ? undefined : entryFinder)

	let section = $derived(widget?.current.scope("session:state"))
	let settings = $derived((widget?.current.settings.v1 ?? {}) as Record<string, unknown>)
	// Not granted `session:state` (a plugin's copy an admin was not asked to,
	// or refused): the section will never come — said, not waited for.
	let view = $derived(statsView(section, settings, widget?.current.grants?.includes("session:state")))
	let read = $derived(statsSettingsOf(settings))
	let worldOnly = $derived(view.owners === "world")
	/** A strip is one line across the top: its slots read compact. */
	let slotDensity = $derived<"compact" | "full">(view.arrangement === "strip" ? "compact" : view.density)
	// The world is `Globe` (NOMENCLATURE §22: the world door), never the narrator's `CloudSun`.
	let emptyIcon = $derived(worldOnly ? "globe" : "heart-pulse")
	let emptyIconSize = $derived(view.arrangement === "cards" || view.arrangement === "faces" ? "20" : "16")
	let shownCount = $derived(view.status === "shown" ? view.groups.reduce((n, g) => n + g.owners.length, 0) : 0)
	/** One sheet, drawn flat (§1): a faces sheet always, cards when only one owner is shown. */
	let single = $derived(
		view.status === "shown" && (view.arrangement === "faces" || (view.arrangement === "cards" && shownCount === 1))
	)

	// A kind's head: the world's door, the characters', the places' lens (§22).
	const GROUP_ICON: Record<StatsOwnerGroup, string> = { world: "globe", cast: "users-round", places: "map" }
	const OWNER_ICON: Record<StatsOwnerGroup, string> = { world: "globe", cast: "user-round", places: "map-pin" }
	const groupLabel = (kind: StatsOwnerGroup) =>
		kind === "world" ? t("World") : kind === "cast" ? t("Cast") : t("Places")

	/** What `nothing-shown` says, by whose stats the widget draws. */
	function nothingShown(): string {
		switch (view.owners) {
			case "world":
				return t("This session's world declares no stats to show here.")
			case "places":
				return t("No place has a stat in play yet.")
			case "all":
				return t("Nothing in this session has a stat in play yet.")
			case "pick":
				return t("Nothing in this session matches the names in this widget's settings.")
			case "mine":
				return t("You have no character in this session yet. Once you play one, its sheet shows here.")
			case "seats":
				return t("Nobody has a character in this session yet. Each player's sheet shows here once it is made.")
			default:
				return t(
					"No one in the cast has a stat in play yet. Set one on a cast member's page, or let the story change one."
				)
		}
	}

	const write = (owner: SessionStateOwnerV1, slotId: string) => (next: SlotWriteValue) => writer.set(owner, slotId, next)

	/* ── Give to… (§10, ★4): one request; the host gives or offers ──────── */

	const targetsFor = (owner: SessionStateOwnerV1, slotId: string): GiveTarget[] =>
		section && section.loaded ? giveTargets(section, owner, slotId) : []

	const give = (owner: SessionStateOwnerV1, slot: SessionStateSlotV1) =>
		async (index: number, target: GiveTarget, count: number): Promise<SlotWriteResult> => {
			if (!widget) return { text: t("You can't change this right now."), detail: null }
			try {
				await widget.current.request("give-piece", {
					from: { kind: owner.kind, id: owner.id },
					to: { kind: target.owner.kind, id: target.owner.id },
					slotId: slot.slotId,
					index,
					count
				})
				return null
			} catch (e) {
				return plainRefusal(e instanceof Error ? e.message : String(e ?? ""), t)
			}
		}

	/** An offer answered: accepted, declined, or (the giver's) withdrawn. */
	let offerError = $state<string | null>(null)
	async function answerOffer(proposalId: number, accept: boolean) {
		offerError = null
		try {
			await widget?.current.request("decide-proposal", { proposalId, accept })
		} catch (e) {
			offerError = plainRefusal(e instanceof Error ? e.message : String(e ?? ""), t).text
		}
	}
	const offerCount = (n: number) => (n > 1 ? ` ×${n}` : "")

	/* ── 🚧 Ties (ties on the graph, screen 2; 2026-10-23) ───────────────── */

	/** A tie side's show-or-hide refused, by `<owner key>|<towards>`: said on its row. */
	let tieError = $state<Record<string, string>>({})
	const tieKey = (owner: SessionStateOwnerV1, tie: TieRow) => `${owner.key}|${tie.entryType}|${tie.towards}`
	async function showTie(owner: SessionStateOwnerV1, tie: TieRow, shown: boolean) {
		const key = tieKey(owner, tie)
		tieError = { ...tieError, [key]: "" }
		try {
			await widget?.current.request("set-tie-shown", { owner: { kind: owner.kind, id: owner.id }, entryType: tie.entryType, towards: tie.towards, shown })
		} catch (e) {
			tieError = { ...tieError, [key]: plainRefusal(e instanceof Error ? e.message : String(e ?? ""), t).text }
		}
	}
	/* ── 🚧 Attribute carries (RF fix 8): a holder's own switch, from the sheet too ── */

	/** A carry refused, by `<owner key>|<slot id>`: said on its row. */
	let carryError = $state<Record<string, string>>({})
	async function setCarry(owner: SessionStateOwnerV1, row: CarryRow, carries: boolean) {
		const key = `${owner.key}|${row.slotId}`
		carryError = { ...carryError, [key]: "" }
		try {
			await widget?.current.request("set-attribute-carry", { owner: { kind: owner.kind, id: owner.id }, slotId: row.slotId, carries })
		} catch (e) {
			carryError = { ...carryError, [key]: plainRefusal(e instanceof Error ? e.message : String(e ?? ""), t).text }
		}
	}
	/** The session's story clock, in words — the world's _when_. */
	let storyTime = $derived(section?.loaded && typeof section.storyTime === "string" && section.storyTime.trim() ? section.storyTime.trim() : null)

	/** A number's words: _7 of 10_. */
	const tieNumber = (n: { value: string | number; max?: number }) => (n.max !== undefined ? t("{n} of {max}").replace("{n}", String(n.value)).replace("{max}", String(n.max)) : String(n.value))

	/* ── the stat trail (F2) ───────────────────────────────────────────── */

	/** How many changes one trail asks for. */
	const TRAIL_LIMIT = 20
	let offersTrail = $derived(read.trail)
	/** Whose trail is open: `<owner key>|<slot id>`; null for none — one trail popover's body at a time. */
	let trailFor = $state<string | null>(null)
	/** The open trail as it stands: asked, answered, or refused (said in the popover, R77). */
	let trail = $state<{ status: "loading" | "shown" | "failed"; rows: StatTrailRow[]; error: string | null }>({
		status: "loading",
		rows: [],
		error: null
	})
	/** Counts asks, so an answer to one closed since is dropped. */
	let trailAsked = 0
	const trailKey = (owner: SessionStateOwnerV1, slotId: string) => `${owner.key}|${slotId}`
	const messageOf = (e: unknown) => plainRefusal(e instanceof Error ? e.message : String(e ?? ""), t).text

	/** Open (and ask for) one stat's trail, or close it. */
	async function toggleTrail(owner: SessionStateOwnerV1, slot: SessionStateSlotV1, open: boolean) {
		const key = trailKey(owner, slot.slotId)
		if (!open) {
			if (trailFor === key) trailFor = null
			return
		}
		trailFor = key
		trail = { status: "loading", rows: [], error: null }
		const asked = ++trailAsked
		try {
			const res = (await widget?.current.request("stat-trail", {
				owner: { kind: owner.kind, id: owner.id },
				slotId: slot.slotId,
				limit: TRAIL_LIMIT
			})) as { changes?: unknown } | undefined
			if (asked !== trailAsked) return
			trail = { status: "shown", rows: statTrailRows(slot, res?.changes, t), error: null }
		} catch (e) {
			if (asked !== trailAsked) return
			trail = { status: "failed", rows: [], error: e instanceof Error ? e.message : String(e ?? t("Something went wrong")) }
		}
	}

	const whenText = (at: number) =>
		at > 0 ? new Date(at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : ""

	/* ── faces (§10): the chosen chip and each sheet's last look, saved per viewer ── */

	interface Saved {
		face?: string
		seen?: Record<string, string>
	}
	const remote = widget?.current as unknown as { state?: unknown; saveState?: (s: unknown) => void } | undefined
	const saved0 = untrack(() => {
		const s = remote?.state
		return s && typeof s === "object" ? (s as Saved) : {}
	})
	let chosenFace = $state<string | null>(typeof saved0.face === "string" ? saved0.face : null)
	let seen = $state<Record<string, string>>(saved0.seen && typeof saved0.seen === "object" ? { ...saved0.seen } : {})

	let faceList = $derived(view.arrangement === "faces" ? facesOwners(view) : [])
	/**
	 * 🚧 A player with no character yet (PLAN-dc-after-walk3 R3-4, the walk's
	 * NEW-15): with `owners: seats` and none of them the viewer's, no sheet
	 * opens by itself — the copy's empty state says theirs is on its way, and
	 * the strip still lets them open another's. A guest saw the host's sheet.
	 */
	let ownless = $derived(view.owners === "seats" && faceList.length > 0 && !faceList.some((o) => o.owner.mine === true))
	let faceShown = $derived(faceList.find((o) => o.owner.key === chosenFace) ?? (ownless ? null : faceList[0]) ?? null)
	let hashes = $derived.by(() => {
		const out: Record<string, string> = {}
		if (section?.loaded) for (const o of faceList) out[o.owner.key] = ownerSheetHash(section, o.owner)
		return out
	})

	function persist() {
		try {
			remote?.saveState?.({ face: chosenFace ?? undefined, seen: { ...seen } })
		} catch {
			// A host without saved state forgets on reload; the strip still works.
		}
	}

	// What the viewer has seen: the chosen sheet as it is now, and any sheet met for the first time.
	$effect(() => {
		const now = hashes
		const open = faceShown?.owner.key ?? null
		const before = untrack(() => seen)
		let changed = false
		const next = { ...before }
		for (const [key, hash] of Object.entries(now)) {
			if (next[key] === undefined || (key === open && next[key] !== hash)) {
				next[key] = hash
				changed = true
			}
		}
		if (changed) {
			seen = next
			untrack(persist)
		}
	})

	function chooseFace(key: string) {
		chosenFace = key
		persist()
	}

	const changedSince = (o: StatsShownOwner) =>
		o.owner.key !== faceShown?.owner.key &&
		seen[o.owner.key] !== undefined &&
		hashes[o.owner.key] !== undefined &&
		seen[o.owner.key] !== hashes[o.owner.key]

	/* ── the sheet head's face (§12): the portrait picker ───────────────── */

	interface Picture {
		ref: string
		src: string
		caption?: string
	}
	const hasFace = (o: SessionStateOwnerV1) => o.kind === "session_cast" || o.kind === "player_seat"
	const initialOf = (label: string) => label.trim().charAt(0).toUpperCase() || "?"
	/** Whose picker is open, by owner key. */
	let faceFor = $state<string | null>(null)
	let pictures = $state<{ images: Picture[]; next: string | null; status: "loading" | "shown" | "failed"; error: string | null }>({
		images: [],
		next: null,
		status: "loading",
		error: null
	})
	let picked = $state<string | null>(null)
	let faceError = $state<string | null>(null)
	let picturesAsked = 0

	const isPicture = (v: unknown): v is Picture =>
		!!v && typeof v === "object" && typeof (v as Picture).ref === "string" && typeof (v as Picture).src === "string"

	async function morePictures(first: boolean) {
		const asked = first ? ++picturesAsked : picturesAsked
		const held = first ? [] : pictures.images
		const cursor = first ? null : pictures.next
		pictures = { ...pictures, status: "loading" }
		try {
			const res = (await widget?.current.request("session-images", cursor ? { cursor } : {})) as
				| { images?: unknown[]; nextCursor?: string }
				| undefined
			if (asked !== picturesAsked) return
			const images = (Array.isArray(res?.images) ? res.images : []).filter(isPicture)
			const next = typeof res?.nextCursor === "string" && res.nextCursor ? res.nextCursor : null
			pictures = { images: [...held, ...images], next, status: "shown", error: null }
		} catch (e) {
			if (asked !== picturesAsked) return
			pictures = { images: held, next: null, status: "failed", error: messageOf(e) }
		}
	}

	function toggleFace(owner: SessionStateOwnerV1, open: boolean) {
		if (!open) {
			if (faceFor === owner.key) faceFor = null
			return
		}
		faceFor = owner.key
		picked = null
		faceError = null
		void morePictures(true)
	}

	async function setFace(owner: SessionStateOwnerV1, mediaRef: string | null) {
		faceError = null
		try {
			await widget?.current.request("set-owner-face", { owner: { kind: owner.kind, id: owner.id }, mediaRef })
			faceFor = null
		} catch (e) {
			faceError = messageOf(e)
		}
	}
</script>

{#snippet trailOf(owner: SessionStateOwnerV1, slot: SessionStateSlotV1)}
	{@const key = trailKey(owner, slot.slotId)}
	<!-- `sp-popover` (§3.5): the button is the trigger, the changes the panel; only the open one draws a body. -->
	<sp-popover
		data-widget-part="stats.trail"
		placement="bottom-end"
		label={t("Changes to {label}").replace("{label}", slot.label)}
		open={trailFor === key}
		onopen-change={(e: CustomEvent<{ open: boolean }>) => toggleTrail(owner, slot, e.detail.open)}
	>
		<button
			slot="trigger"
			type="button"
			data-widget-part="stats.trail-open"
			aria-label={t("How {label} changed").replace("{label}", slot.label)}
			title={t("Changes")}
		>
			<sp-icon name="history" size="12"></sp-icon>
		</button>
		{#if trailFor === key}
			<div data-widget-part="stats.trail-panel">
				<header data-widget-part="stats.trail-head card-head">
					<sp-icon name="history" size="14"></sp-icon>
					<span>{slot.label} · {owner.label}</span>
				</header>
				{#if trail.status === "loading"}
					<p data-widget-part="stats.trail-note" role="status">{t("Reading the changes…")}</p>
				{:else if trail.status === "failed"}
					<p data-widget-part="stats.trail-note" role="alert">{trail.error}</p>
				{:else if !trail.rows.length}
					<p data-widget-part="stats.trail-note empty">{t("No changes in this session yet.")}</p>
				{:else}
					<ol data-widget-part="stats.trail-list list" aria-label={t("Changes to {label}").replace("{label}", slot.label)}>
						{#each trail.rows as row (row.key)}
							<li data-widget-part="stats.trail-row row" data-by={row.by} data-message-id={row.messageId ?? undefined}>
								<span data-widget-part="stats.trail-value value">
									{row.from ? `${row.from} → ${row.to}` : row.to}
								</span>
								<span data-widget-part="stats.trail-by label">
									{statTrailByText(row.by, t)}{row.at ? ` · ${whenText(row.at)}` : ""}
								</span>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		{/if}
	</sp-popover>
{/snippet}

{#snippet faceImage(owner: SessionStateOwnerV1, part: string)}
	{#if owner.face?.src}
		<img data-widget-part={part} src={owner.face.src} alt="" />
	{:else}
		<span data-widget-part="{part} stats.face-initial" aria-hidden="true">{initialOf(owner.label)}</span>
	{/if}
{/snippet}

{#snippet faceOf(owner: SessionStateOwnerV1, group: StatsOwnerGroup)}
	{#if !hasFace(owner)}
		<sp-icon name={OWNER_ICON[group]} size="13"></sp-icon>
	{:else if owner.editable === false}
		<span data-widget-part="stats.face" data-blank={owner.face?.src ? undefined : ""}>
			{@render faceImage(owner, "stats.face-img")}
		</span>
	{:else}
		<sp-popover
			data-widget-part="stats.face-picker"
			placement="bottom-start"
			label={t("Portrait for {name}").replace("{name}", owner.label)}
			open={faceFor === owner.key}
			onopen-change={(e: CustomEvent<{ open: boolean }>) => toggleFace(owner, e.detail.open)}
		>
			<button
				slot="trigger"
				type="button"
				data-widget-part="stats.face"
				data-blank={owner.face?.src ? undefined : ""}
				aria-label={t("Change {name}'s portrait").replace("{name}", owner.label)}
			>
				{@render faceImage(owner, "stats.face-img")}
			</button>
			{#if faceFor === owner.key}
				<div data-widget-part="stats.face-panel">
					<header data-widget-part="stats.face-head card-head">
						<sp-icon name="image" size="14"></sp-icon>
						<span>{t("Portrait · {name}").replace("{name}", owner.label)}</span>
					</header>
					<p data-widget-part="stats.face-heading label">{t("Choose")}</p>
					{#if pictures.images.length}
						<ul data-widget-part="stats.face-choices list" aria-label={t("Pictures made in this session")}>
							{#each pictures.images as pic (pic.ref)}
								<li>
									<button
										type="button"
										data-widget-part="stats.face-choice"
										aria-pressed={picked === pic.ref}
										aria-label={pic.caption ?? t("Picture")}
										onclick={() => (picked = picked === pic.ref ? null : pic.ref)}
									>
										<img src={pic.src} alt="" />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if pictures.status === "loading"}
						<p data-widget-part="stats.face-note" role="status">{t("Finding pictures…")}</p>
					{:else if pictures.status === "failed"}
						<p data-widget-part="stats.face-note" role="alert">{pictures.error}</p>
					{:else if !pictures.images.length}
						<p data-widget-part="stats.face-note empty">{t("No pictures in this session yet.")}</p>
					{/if}
					{#if pictures.next && pictures.status === "shown"}
						<button type="button" data-widget-part="stats.face-more" onclick={() => void morePictures(false)}>{t("More")}</button>
					{/if}
					<div data-widget-part="stats.face-actions toolbar">
						<button
							type="button"
							data-widget-part="stats.face-draw"
							disabled
							title={t("Drawing a portrait needs an image model.")}
						>
							<sp-icon name="paintbrush" size="12"></sp-icon>
							<span>{t("Draw")}</span>
						</button>
						<button
							type="button"
							data-widget-part="stats.face-use"
							disabled={!picked}
							onclick={() => picked && void setFace(owner, picked)}
						>
							{t("Use this")}
						</button>
						{#if owner.face}
							<button type="button" data-widget-part="stats.face-clear" onclick={() => void setFace(owner, null)}>
								{t("Clear")}
							</button>
						{/if}
					</div>
					<p data-widget-part="stats.face-note">{t("Drawing a portrait needs an image model.")}</p>
					{#if faceError}<p data-widget-part="stats.face-note" role="alert">{faceError}</p>{/if}
				</div>
			{/if}
		</sp-popover>
	{/if}
{/snippet}

<!-- 🚧 The owner's derived values (2026-10-18, `derived`): what the ruleset
     works out from the sheet — armour class — as read-only rows in the slot
     row's own parts, beside `stats.derived`. No edit, no trail. -->
{#snippet derivedOf(owner: SessionStateOwnerV1, density: "compact" | "full")}
	{#each derivedRowsOf(owner) as d (d.key)}
		<div
			data-widget-part="stats.derived stat-slot.root row"
			data-density={density}
			data-derived={d.key}
			data-slot-shape="derived"
		>
			<span data-widget-part="stat-slot.label label" title={t("Worked out from the sheet; never set by hand")}>
				{d.label}
				<sp-icon name="sigma" size="10"></sp-icon>
			</span>
			<div data-widget-part="stat-slot.control">
				<span data-widget-part="stat-slot.line value">{d.value}</span>
			</div>
		</div>
	{/each}
{/snippet}

{#snippet slotsOf(shown: StatsShownOwner, density: "compact" | "full")}
	{@const derivedAt = derivedRowsAt(shown.slots)}
	{#if derivedAt === 0}{@render derivedOf(shown.owner, density)}{/if}
	{#each shown.slots as one, i (one.slot.slotId)}
		<SlotControl
			slot={one.slot}
			{density}
			config={one.config}
			value={one.value}
			{t}
			{findEntries}
			timeFormat={read.timeFormat}
			readonly={shown.owner.editable === false}
			repertoires={repertoiresFor(section, shown.owner)}
			targets={targetsFor(shown.owner, one.slot.slotId)}
			ongive={give(shown.owner, one.slot)}
			onset={write(shown.owner, one.slot.slotId)}
		>
			{#snippet trail()}
				{#if offersTrail && one.slot.type !== "derived"}
					{@render trailOf(shown.owner, one.slot)}
				{/if}
			{/snippet}
		</SlotControl>
		{#if derivedAt > 0 && i === derivedAt - 1}{@render derivedOf(shown.owner, density)}{/if}
	{/each}
{/snippet}

<!-- 🚧 Offers on this sheet (★4): one given to it waits for its player's
     Accept or Decline; one made from it, for the other player — its maker
     may withdraw it. Nothing has moved yet, so they read in the future. -->
{#snippet offersBlock(owner: SessionStateOwnerV1)}
	{@const offers = offersOf(section, owner)}
	{#if offers.incoming.length || offers.outgoing.length}
		<ul data-widget-part="stats.offers list" aria-label={t("Offers")}>
			{#each offers.incoming as offer (offer.proposalId)}
				<li data-widget-part="stats.offer row" data-offer="incoming" data-proposal-id={offer.proposalId}>
					<sp-icon name="hand-helping" size="12"></sp-icon>
					<span data-widget-part="stats.offer-text">
						{t("{from} offers {item}").replace("{from}", offer.from.label).replace("{item}", offer.item + offerCount(offer.count))}
					</span>
					{#if owner.editable !== false}
						<button type="button" data-widget-part="stats.offer-accept" onclick={() => void answerOffer(offer.proposalId, true)}>
							{t("Accept")}
						</button>
						<button type="button" data-widget-part="stats.offer-decline" onclick={() => void answerOffer(offer.proposalId, false)}>
							{t("Decline")}
						</button>
					{/if}
				</li>
			{/each}
			{#each offers.outgoing as offer (offer.proposalId)}
				<li data-widget-part="stats.offer row" data-offer="outgoing" data-proposal-id={offer.proposalId}>
					<sp-icon name="hourglass" size="12"></sp-icon>
					<span data-widget-part="stats.offer-text">
						{t("Offered to {to}: {item}").replace("{to}", offer.to.label).replace("{item}", offer.item + offerCount(offer.count))}
					</span>
					{#if offer.yours}
						<button type="button" data-widget-part="stats.offer-withdraw" onclick={() => void answerOffer(offer.proposalId, false)}>
							{t("Withdraw")}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if offerError}<p data-widget-part="stats.offer-note" role="alert">{offerError}</p>{/if}
	{/if}
{/snippet}

<!-- 🚧 The owner's ties (ties on the graph, screen 2): each towards someone —
     its name and words as chips, this side's numbers as bars where the viewer
     may see them, the other person's side as words (its numbers once shown),
     and the holder's switch that shows this side's numbers to others. -->
{#snippet tiesBlock(owner: SessionStateOwnerV1)}
	{@const ties = tieRowsOf(owner)}
	{#if ties.length}
		<ul data-widget-part="stats.ties list" aria-label={t("Ties")}>
			{#each ties as tie (`${tie.entryType}|${tie.towards}`)}
				{@const key = tieKey(owner, tie)}
				<li data-widget-part="stats.tie row" data-tie-towards={tie.towards} data-tie-type={tie.entryType}>
					<div data-widget-part="stats.tie-head">
						<span data-widget-part="stats.tie-name">{tie.towardsLabel}</span>
						{#if tie.name}<span data-widget-part="stats.tie-chip chip" data-tie-chip="name">{tie.name}</span>{/if}
						{#each tie.words as w (w.field)}
							<span data-widget-part="stats.tie-chip chip" data-tie-chip={w.field} title={w.label}>{w.value}</span>
						{/each}
					</div>
					{#each tie.numbers as n (n.field)}
						<div data-widget-part="stats.tie-number" data-tie-number={n.field}>
							<span data-widget-part="stats.tie-number-label">
								{owner.mine ? t("Your {label}").replace("{label}", n.label.toLowerCase()) : n.label}
							</span>
							<span data-widget-part="stats.tie-number-value">{tieNumber(n)}</span>
							<span
								data-widget-part="stats.tie-bar meter"
								role="img"
								aria-label={`${n.label} ${tieNumber(n)}`}
								style:--sp-tie-fill={`${tieBarPercent(n)}%`}
							></span>
						</div>
					{/each}
					{#if tie.other}
						<div data-widget-part="stats.tie-other" data-tie-other>
							<span data-widget-part="stats.tie-other-label">{t("How {name} feels").replace("{name}", tie.towardsLabel)}</span>
							<span data-widget-part="stats.tie-other-words">
								{tie.other.words.map((w) => w.value).join(", ") || t("—")}{#each tie.other.numbers as n (n.field)}{` · ${n.label.toLowerCase()} ${tieNumber(n)}`}{/each}
							</span>
							{#if tie.other.numbers.length && tie.other.shown}
								<span data-widget-part="stats.tie-other-note">{t("{name} showed their side.").replace("{name}", tie.towardsLabel)}</span>
							{/if}
						</div>
					{/if}
					{#if tie.mayShow && tie.numbers.length}
						<label data-widget-part="stats.tie-show">
							<input type="checkbox" checked={tie.shown} onchange={(e) => void showTie(owner, tie, e.currentTarget.checked)} />
							<span>{t("Show my number to {name}").replace("{name}", tie.towardsLabel)}</span>
						</label>
					{/if}
					{#if tieError[key]}<p data-widget-part="stats.tie-error" role="alert">{tieError[key]}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<!-- 🚧 Where and when (RF fix 8): the host's place and time for this owner —
     on the world, where the scene is and the story clock — in a row of their
     own, never among the rules' attributes. -->
{#snippet whereBlock(shown: StatsShownOwner, density: "compact" | "full")}
	{@const clock = shown.group === "world" ? storyTime : null}
	{#if shown.where.length || clock}
		<section data-widget-part="stats.where" aria-label={t("Where and when")}>
			<p data-widget-part="stats.where-head label">{t("Where and when")}</p>
			{#each shown.where as one (one.slot.slotId)}
				<SlotControl
					slot={one.slot}
					{density}
					config={one.config}
					value={one.value}
					{t}
					{findEntries}
					timeFormat={read.timeFormat}
					readonly={shown.owner.editable === false}
					onset={write(shown.owner, one.slot.slotId)}
				/>
			{/each}
			{#if clock}
				<div data-widget-part="stats.where-clock stat-slot.root row" data-density={density} data-slot-shape="time">
					<span data-widget-part="stat-slot.label label">{t("When")}</span>
					<div data-widget-part="stat-slot.control"><span data-widget-part="stat-slot.line value">{clock}</span></div>
				</div>
			{/if}
		</section>
	{/if}
{/snippet}

<!-- 🚧 A genre's tool state (RF fix 8): the crawl's fate and standing orders, the
     Lair's whisper — a block of its own, apart from the rules' attributes (a copy may hide it). -->
{#snippet toolsBlock(shown: StatsShownOwner, density: "compact" | "full")}
	{#if shown.tools.length}
		<section data-widget-part="stats.tools list" data-density={density}>
			{#each shown.tools as one (one.slot.slotId)}
				<SlotControl
					slot={one.slot}
					{density}
					config={one.config}
					value={one.value}
					{t}
					{findEntries}
					timeFormat={read.timeFormat}
					readonly={shown.owner.editable === false}
					repertoires={repertoiresFor(section, shown.owner)}
					targets={targetsFor(shown.owner, one.slot.slotId)}
					ongive={give(shown.owner, one.slot)}
					onset={write(shown.owner, one.slot.slotId)}
				>
					{#snippet trail()}
						{#if offersTrail && one.slot.type !== "derived"}
							{@render trailOf(shown.owner, one.slot)}
						{/if}
					{/snippet}
				</SlotControl>
			{/each}
		</section>
	{/if}
{/snippet}

<!-- 🚧 ⏳ What the owner carries, kept by the host as a list (RF fix 8): the
     lorebook's items handed out in a Story or Lair session — never among the
     rules' attributes, always drawn (a copy's toolState does not hide it). -->
{#snippet carriedBlock(shown: StatsShownOwner, density: "compact" | "full")}
	{#if shown.carried.length}
		<section data-widget-part="stats.carried list" data-density={density}>
			{#each shown.carried as one (one.slot.slotId)}
				<SlotControl
					slot={one.slot}
					{density}
					config={one.config}
					value={one.value}
					{t}
					{findEntries}
					timeFormat={read.timeFormat}
					readonly={shown.owner.editable === false}
					repertoires={repertoiresFor(section, shown.owner)}
					targets={targetsFor(shown.owner, one.slot.slotId)}
					ongive={give(shown.owner, one.slot)}
					onset={write(shown.owner, one.slot.slotId)}
				>
					{#snippet trail()}
						{#if offersTrail}
							{@render trailOf(shown.owner, one.slot)}
						{/if}
					{/snippet}
				</SlotControl>
			{/each}
		</section>
	{/if}
{/snippet}

<!-- 🚧 What the owner holds, zone by zone (RF fix 8): each zone's entries as a
     list, or a fan by its shown-as hint — the name, ×N when more than one. -->
{#snippet zonesBlock(zones: ZoneRow[])}
	{#each zones as zone (zone.zoneType)}
		<section data-widget-part="stats.zone" data-zone-type={zone.zoneType} data-shown-as={zone.shownAs} aria-label={zone.label}>
			<p data-widget-part="stats.zone-head label">{zone.label}</p>
			<ul data-widget-part="stats.zone-entries list">
				{#each zone.entries as e (e.key)}
					<li data-widget-part="stats.zone-entry row chip" data-entry-type={e.entryType} data-exposed={e.exposed ? "" : undefined}>
						<span data-widget-part="stats.zone-name">{e.name}{e.count > 1 ? ` ×${e.count}` : ""}</span>
						{#if e.typeLabel}<span data-widget-part="stats.zone-type label">{e.typeLabel}</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/snippet}

<!-- 🚧 The rules' optional attributes this owner carries or not (RF fix 8): the
     holder's own switch — off, not shown, read or changed for them. Offered
     only where the viewer may switch one. -->
{#snippet carriesBlock(owner: SessionStateOwnerV1)}
	{@const rows = carryRowsOf(owner).filter((r) => r.mayChange)}
	{#if rows.length}
		<section data-widget-part="stats.carries" aria-label={t("What {name} carries").replace("{name}", owner.label)}>
			<p data-widget-part="stats.carries-head label">{t("What {name} carries").replace("{name}", owner.label)}</p>
			<ul data-widget-part="stats.carries-list list">
				{#each rows as row (row.slotId)}
					{@const key = `${owner.key}|${row.slotId}`}
					<li data-widget-part="stats.carry row" data-carry={row.slotId}>
						<label data-widget-part="stats.carry-switch">
							<input type="checkbox" checked={row.carries} onchange={(e) => void setCarry(owner, row, e.currentTarget.checked)} />
							<span>{t("Carries {label}").replace("{label}", row.label)}</span>
						</label>
						{#if carryError[key]}<p data-widget-part="stats.carry-error" role="alert">{carryError[key]}</p>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

{#snippet cardOf(shown: StatsShownOwner)}
	<section
		data-widget-part="stats.card card"
		data-owner-key={shown.owner.key}
		data-owner-group={shown.group}
		aria-label={shown.owner.label}
	>
		<header data-widget-part="stats.card-head card-head">
			{@render faceOf(shown.owner, shown.group)}
			<span data-widget-part="stats.card-name">{shown.owner.label}</span>
		</header>
		{@render offersBlock(shown.owner)}
		{@render whereBlock(shown, view.density)}
		{#if shown.slots.length}
			<div data-widget-part="stats.card-body list" data-density={view.density}>
				{@render slotsOf(shown, view.density)}
			</div>
		{:else if !view.declaresAttributes && shown.group !== "places"}
			<!-- 🚧 RF fix 8: words only — the session's rules keep no attributes (Freeform, From scratch). -->
			<p data-widget-part="stats.card-note" data-declares-none>{t("This session's rules declare no attributes.")}</p>
		{:else if !tieRowsOf(shown.owner).length && !shown.zones.length && !shown.where.length && !shown.tools.length && !shown.carried.length}
			<p data-widget-part="stats.card-note">
				{shown.group === "cast" ? t("No stats to show for this member.") : t("No stats to show here.")}
			</p>
		{/if}
		{@render toolsBlock(shown, view.density)}
		{@render carriedBlock(shown, view.density)}
		{@render zonesBlock(shown.zones)}
		{@render tiesBlock(shown.owner)}
		{@render carriesBlock(shown.owner)}
	</section>
{/snippet}

{#snippet ownerOf(shown: StatsShownOwner)}
	{#if view.arrangement === "cards" || view.arrangement === "faces"}
		{@render cardOf(shown)}
	{:else if shown.group === "world"}
		<!-- The world is the scene: its own slots need no name over them. -->
		{@render whereBlock(shown, slotDensity)}
		{@render slotsOf(shown, slotDensity)}
		{@render toolsBlock(shown, slotDensity)}
		{@render carriedBlock(shown, slotDensity)}
	{:else}
		<section
			data-widget-part="stats.strip"
			data-owner-key={shown.owner.key}
			data-owner-group={shown.group}
			aria-label={shown.owner.label}
		>
			<header data-widget-part="stats.strip-head">
				<sp-icon name={OWNER_ICON[shown.group]} size="13"></sp-icon>
				<span data-widget-part="stats.strip-name">{shown.owner.label}</span>
			</header>
			{@render whereBlock(shown, slotDensity)}
			{@render slotsOf(shown, slotDensity)}
			{@render toolsBlock(shown, slotDensity)}
			{@render carriedBlock(shown, slotDensity)}
		</section>
	{/if}
{/snippet}

<div
	data-widget-part="stats.root"
	data-state-widget="stats"
	data-arrangement={view.arrangement}
	data-owners={view.owners}
	data-owner-key={worldOnly ? "world" : undefined}
	data-single={single ? "" : undefined}
>
	{#if section?.error}
		<p data-widget-part="stats.alert" role="alert">{section.error}</p>
	{/if}

	{#if view.status === "not-granted"}
		<div data-widget-part="stats.empty empty" role="status" data-scope-not-granted="session:state">
			<sp-icon name="lock" size={emptyIconSize}></sp-icon>
			<span>
				{t("This widget has not been granted the session's stats. An administrator can grant it in the extension's permissions.")}
			</span>
		</div>
	{:else if view.status === "loading"}
		<div data-widget-part="stats.empty empty" role="status">
			<sp-icon name={emptyIcon} size={emptyIconSize}></sp-icon>
			<span>
				{worldOnly
					? t("Loading the world's stats…")
					: view.owners === "cast"
						? t("Loading the cast's stats…")
						: t("Loading the session's stats…")}
			</span>
		</div>
	{:else if view.status === "failed"}
		<!-- The first read was refused: the alert above is the whole story. -->
	{:else if view.status === "none-declared"}
		<div data-widget-part="stats.empty empty">
			<sp-icon name={emptyIcon} size={emptyIconSize}></sp-icon>
			<span>
				{read.emptyState
					? t(read.emptyState)
					: t("This session's rules declare no attributes.")}
			</span>
		</div>
	{:else if view.status === "nothing-shown"}
		<div data-widget-part="stats.empty empty">
			<sp-icon name={emptyIcon} size={emptyIconSize}></sp-icon>
			<span>{read.emptyState ? t(read.emptyState) : nothingShown()}</span>
		</div>
	{:else if view.status === "shown" && view.arrangement === "faces"}
		{#if faceList.length > 1 || ownless}
			<div data-widget-part="stats.faces" role="tablist" aria-label={t("Whose sheet")}>
				{#each faceList as one (one.owner.key)}
					{@const changed = changedSince(one)}
					<button
						type="button"
						role="tab"
						data-widget-part="stats.faces-chip"
						data-owner-key={one.owner.key}
						data-changed={changed ? "" : undefined}
						aria-selected={faceShown?.owner.key === one.owner.key}
						onclick={() => chooseFace(one.owner.key)}
					>
						{#if hasFace(one.owner)}
							{@render faceImage(one.owner, "stats.faces-img")}
						{:else}
							<sp-icon name={OWNER_ICON[one.group]} size="13"></sp-icon>
						{/if}
						<span data-widget-part="stats.faces-name">{one.owner.mine ? t("{name} (you)").replace("{name}", one.owner.label) : one.owner.label}</span>
						{#if changed}
							<span data-widget-part="stats.faces-dot" role="img" aria-label={t("changed since you looked")}></span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
		{#if faceShown}
			<div data-widget-part="stats.faces-sheet" role={faceList.length > 1 || ownless ? "tabpanel" : undefined}>
				{@render cardOf(faceShown)}
			</div>
		{:else if ownless}
			<div data-widget-part="stats.empty empty">
				<sp-icon name={emptyIcon} size={emptyIconSize}></sp-icon>
				<span>{read.emptyState ? t(read.emptyState) : t("Your sheet appears once your character is made.")}</span>
			</div>
		{/if}
	{:else if view.status === "shown"}
		{#each view.groups as group (group.kind)}
			{#if view.owners === "all"}
				<section data-widget-part="stats.group" data-owner-group={group.kind} aria-label={groupLabel(group.kind)}>
					<header data-widget-part="stats.group-head">
						<sp-icon name={GROUP_ICON[group.kind]} size="13"></sp-icon>
						<span>{groupLabel(group.kind)}</span>
					</header>
					{#each group.owners as shown (shown.owner.key)}
						{@render ownerOf(shown)}
					{/each}
				</section>
			{:else}
				{#each group.owners as shown (shown.owner.key)}
					{@render ownerOf(shown)}
				{/each}
			{/if}
		{/each}
	{/if}
</div>
