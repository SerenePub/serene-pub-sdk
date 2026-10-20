/**
 * A state widget's writes (R21): `set-attribute-value` through the widget's
 * own context. The answer goes back to the control that asked (A21,
 * 2026-10-17): a write resolves to `null` once written, or to the refusal in
 * plain words — the editor that asked keeps its draft open and says it in
 * its own `invalid` line. There is no widget-level error line: a refusal
 * belongs to the row it refused, and it goes when that row is edited again.
 *
 * A host sentence that names the machinery (a slot id, an owner kind) reads
 * as "You can't change this right now.", its own words kept as `detail` for
 * the line's tooltip (`plainRefusal`).
 */
import type { SessionStateOwnerV1, WidgetContextRef } from "@serene-pub/core-catalog/widgets"
import { plainRefusal, type SlotWriteValue } from "@serene-pub/core-catalog/session-state"

/** Why a write was refused: the words a person reads, and the host's own sentence when those were replaced. */
export interface SlotRefusal {
	text: string
	detail: string | null
}

/** What a control's write resolves to: `null` once written, else why not. */
export type SlotWriteResult = SlotRefusal | null

/** Whose value: an owner as the section carries it, or just its kind and id. */
export type OwnerNamed = Pick<SessionStateOwnerV1, "kind" | "id">

export interface SlotWriter {
	/** `say`: a line the table hears when the write lands (`set-attribute-value`'s `say`). */
	set(owner: OwnerNamed, slotId: string, value: SlotWriteValue, opts?: { say?: string }): Promise<SlotWriteResult>
}

export function createSlotWriter(widget: WidgetContextRef | undefined, t: (source: string) => string): SlotWriter {
	return {
		async set(owner, slotId, value, opts) {
			if (!widget) return null
			try {
				await widget.current.request("set-attribute-value", {
					owner: { kind: owner.kind, id: owner.id },
					slotId,
					value,
					...(opts?.say ? { say: opts.say } : {})
				})
				return null
			} catch (e) {
				return plainRefusal(e instanceof Error ? e.message : String(e ?? ""), t)
			}
		}
	}
}
