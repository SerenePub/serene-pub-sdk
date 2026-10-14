<script lang="ts">
	/**
	 * Who's here (PLAN-core-widgets W10): which people have this session open
	 * now, as whom each writes, and who is typing — the session's attendance
	 * (`attendance.v1`), drawn as two groups.
	 *
	 * **Here**: a row per person with the session open — their name, *you*
	 * on the viewer's own, the persona each writes as (face and name, from
	 * the cast), a typing pulse while one of their personas is typing, and
	 * *Owner* / *Guest* as a quiet chip. Under it, *Nobody else is here.*
	 * when the viewer has the room to themselves. **Away**: the session's
	 * other people, with when they were last here (off with `showAway`). A
	 * press on a persona opens its sheet (`open-character`). Everything it
	 * shows is worked out in the plain half (`attendanceView`); this only
	 * draws it, and keeps the clock the Away times are told from.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`attendance.person row`, …), the row's state rides
	 * on `data-state`, and the default widget stylesheet draws them
	 * (STYLE-GUIDE §6.16).
	 */
	import type { ViewerV1 } from "@serene-pub/sdk/component"
	import { attendanceView, readAttendanceSettings } from "@serene-pub/core-catalog/attendance"
	import { useWidgetContext } from "../context"

	const NOBODY: ViewerV1 = { userId: null, isAdmin: false, isGuest: false }

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current.t(source) ?? source

	/** The clock the Away rows' "Last here …" are told from, moved once a minute. */
	let now = $state(Date.now())
	$effect(() => {
		const tick = setInterval(() => (now = Date.now()), 60_000)
		return () => clearInterval(tick)
	})

	const settings = $derived(
		readAttendanceSettings(widget?.current.settings?.v1)
	)
	const view = $derived(
		attendanceView({
			attendance: widget?.current.attendance?.v1,
			characters: widget?.current.scope("characters"),
			viewer: widget?.current.viewer?.v1 ?? NOBODY,
			settings,
			now,
			t
		})
	)

	/** Why the page declined the last press, this widget's own. */
	let refusal = $state<string | null>(null)

	async function openPersona(characterId: number): Promise<void> {
		refusal = null
		try {
			await widget?.current.request("open-character", { characterId })
		} catch (e) {
			refusal = e instanceof Error && e.message ? e.message : t("That did not go through. Try again.")
		}
	}
</script>

{#snippet personRow(person: (typeof view.here)[number], state: "here" | "away")}
	<li
		data-widget-part="attendance.person row"
		data-state={state}
		data-role={person.role}
		data-you={person.you ? "" : undefined}
		data-typing={person.typing ? "" : undefined}
	>
		<span data-widget-part="attendance.name">{person.name}</span>
		{#if person.you}
			<span data-widget-part="attendance.you">{t("you")}</span>
		{/if}
		{#each person.personas as persona (persona.ref)}
			<button
				type="button"
				data-widget-part="attendance.persona"
				data-ref={persona.ref}
				title={t("Open {name}").replace("{name}", persona.name)}
				onclick={() => openPersona(persona.characterId)}
			>
				{#if settings.faces}
					{#if persona.face}
						<img data-widget-part="attendance.face" src={persona.face} alt="" />
					{:else}
						<span data-widget-part="attendance.face" data-blank="">
							<sp-icon name="user-round" size="12"></sp-icon>
						</span>
					{/if}
				{/if}
				<span>{persona.name}</span>
			</button>
		{/each}
		{#if person.typing}
			<span data-widget-part="attendance.typing" role="status">{t("typing…")}</span>
		{/if}
		{#if person.lastHere}
			<span data-widget-part="attendance.away">{person.lastHere}</span>
		{/if}
		<span data-widget-part="attendance.role chip">{person.roleChip}</span>
	</li>
{/snippet}

<div data-widget-part="attendance.root" data-faces={settings.faces ? "" : undefined}>
	{#if refusal}
		<p data-widget-part="attendance.alert" role="alert">{refusal}</p>
	{/if}

	<section data-widget-part="attendance.group" data-group="here" aria-label={t("Here")}>
		<h3 data-widget-part="attendance.group-head">{t("Here")}</h3>
		{#if view.here.length}
			<ul data-widget-part="attendance.list list">
				{#each view.here as person (person.key)}
					{@render personRow(person, "here")}
				{/each}
			</ul>
		{/if}
		{#if view.alone}
			<p data-widget-part="attendance.empty empty" role="status">{view.alone}</p>
		{/if}
	</section>

	{#if view.away.length}
		<section data-widget-part="attendance.group" data-group="away" aria-label={t("Away")}>
			<h3 data-widget-part="attendance.group-head">{t("Away")}</h3>
			<ul data-widget-part="attendance.list list">
				{#each view.away as person (person.key)}
					{@render personRow(person, "away")}
				{/each}
			</ul>
		</section>
	{/if}
</div>
