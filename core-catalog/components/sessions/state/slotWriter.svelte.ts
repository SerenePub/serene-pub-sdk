/**
 * A state widget's writes (R21): `set-attribute-value` through the widget's
 * own context, and the widget's OWN error line (R77) — a write that fails is
 * said in the widget that asked, never in every state widget on the page.
 *
 * The newest write owns the line: asking again clears it, and a refusal of
 * an older write that lands after a newer one was asked says nothing.
 */
import type { SessionStateOwnerV1, WidgetContextRef } from "@serene-pub/core-catalog/widgets"
import type { SlotWriteValue } from "@serene-pub/core-catalog/session-state"

export interface SlotWriter {
	/** Why the newest write failed, in words; null when it did not (or has not answered). */
	readonly error: string | null
	set(owner: SessionStateOwnerV1, slotId: string, value: SlotWriteValue): Promise<void>
}

export function createSlotWriter(widget: WidgetContextRef | undefined): SlotWriter {
	let error = $state<string | null>(null)
	let asked = 0
	return {
		get error() {
			return error
		},
		async set(owner, slotId, value) {
			const mine = ++asked
			error = null
			if (!widget) return
			try {
				await widget.current.request("set-attribute-value", {
					owner: { kind: owner.kind, id: owner.id },
					slotId,
					value
				})
			} catch (e) {
				if (mine === asked) error = e instanceof Error ? e.message : String(e)
			}
		}
	}
}
