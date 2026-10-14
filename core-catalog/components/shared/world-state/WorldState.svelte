<script lang="ts">
	/**
	 * ⏳ Core's World State widget as a remote component (R21) — Stats now
	 * (W7, 2026-10-11): `world-state` is an alias of `stats`
	 * (`WIDGET_ID_ALIASES`), so the page mounts Stats for it and nothing
	 * mounts this module but a reference to `/core-ui/world-state` itself.
	 * It draws Stats with the settings the alias implies — `owners: world`,
	 * `arrangement: strip`, laid under whatever settings it is handed, a
	 * stored `layout` read as the arrangement (`statsSettingsOf`) — under its
	 * own name. REMOVE in 0.7.0 with the `world-state` declaration.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import StatsWidget from "../stats/StatsWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "world-state", instanceId: "world-state", title: "World State" }
		)
	)

	/** `WIDGET_ID_ALIASES['world-state'].settings` — the SDK's table, which a component does not import. */
	const IMPLIED = { owners: "world", arrangement: "strip" }
</script>

<StatsWidget implied={IMPLIED} />
