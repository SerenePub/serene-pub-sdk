/**
 * 🚧 Wherewithal's own stat slots — its three **pools** (2026-10-22, M3):
 * what a character can spend to carry a risk. Declaring a slot registers it,
 * so this module is named in core-catalog's `sideEffects`.
 *
 * Ids carry the ruleset's name (`wherewithal-…`) so another ruleset's
 * _Nerve_ never shares a value with this one's. Owned by listing: the
 * ruleset names them under its `stats`, so they are pickable only in its
 * sessions. ⚠ _Provisions_, never _supply_ — an item's **supply** (how many
 * of it exist, `ITEM_SUPPLY_MODES`) is another word already (R1).
 */
import { defineAttributeSlot } from "@serene-pub/sdk"
import { numberStatShape } from "../../registry/statShapes.js"

const pool = (key: string, label: string, spentOn: string) =>
	defineAttributeSlot(`core:slot/wherewithal-${key}@1`, {
		shape: numberStatShape.id,
		label: { en: label },
		description: { en: `${label} left to spend, from 0 to 6; 3 is usual.` },
		descriptor: `${label}: a pool from 0 to 6, spent ${spentOn}. Spent is gone until a rest or a boon restores it; at 0 there is nothing left to spend.`,
		appliesTo: ["cast"],
		config: { min: 0, max: 6 },
		default: 3
	})

/** 🚧 Courage and composure — spent to dare. @experimental */
export const wherewithalNerveSlot = pool("nerve", "Nerve", "to push through danger, fear or pain")
/** 🚧 Goodwill and standing — spent to sway people. @experimental */
export const wherewithalFavourSlot = pool("favour", "Favour", "to persuade, call in help or smooth a way")
/** 🚧 What is on hand — food, coin, tools — spent to make do. @experimental */
export const wherewithalProvisionsSlot = pool("provisions", "Provisions", "to have the right thing, pay a way or endure hardship")

/** Every slot this module declares, in sheet order. @internal */
export const WHEREWITHAL_OWN_SLOTS = Object.freeze([wherewithalNerveSlot, wherewithalFavourSlot, wherewithalProvisionsSlot])
