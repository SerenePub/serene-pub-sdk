/**
 * `tf()`'s guarantees, asserted at COMPILE time.
 *
 * Checked by `tsc --noEmit` and never run — the same arrangement, and for the
 * same reason, as `capabilityTypes.assert.ts` beside it. Nearly everything
 * `tf()` is FOR lives in its types: the runtime body is two string joins and it
 * cannot tell `IoKinds.imgae` from `IoKinds.image`, because by the time a value
 * reaches it the typo is already just a string. `capabilities.test.ts` holds the
 * values; this file holds the checking, and there is nowhere else it can live.
 *
 * Each `@ts-expect-error` FAILS THE BUILD if the error it expects stops
 * happening. So a widening bug — a `const` dropped from `tf`'s signature, a
 * loosened `Kinds`, a stray `any` in `IdOf` — reads here as "unused
 * '@ts-expect-error' directive", which is nonsense until you know that is the
 * alarm rather than a lint nit.
 *
 * ⚠ Keep every `@ts-expect-error` case on ONE line. The directive suppresses the
 * next line only, so a call split across several reports its error below the
 * suppressed line and the case fails twice over while appearing to pass.
 */

import { tf, transformId, IoKinds, type TransformId } from '@serene-pub/sdk'

// ── The literal survives ────────────────────────────────────────────────────
// Not `string`, and not `TransformId`. This is what makes the authoring surface
// worth more than a string: a `requires:` written through `tf` is checkable
// against `TRANSFORMS` at the call site by anything that cares to.

const _chat: 'text->text' = tf({ in: [IoKinds.text], out: [IoKinds.text] })
const _vision: 'text+image->text' = tf({ in: [IoKinds.text, IoKinds.image], out: [IoKinds.text] })

// The author's order is irrelevant, in the TYPE as well as in the string. If
// these two ever disagree, the type is lying about the value it describes.
const _reordered: 'text+image->text' = tf({
	in: [IoKinds.image, IoKinds.text],
	out: [IoKinds.text],
})

// Duplicates collapse at the type level too.
const _dupe: 'text->image' = tf({ in: [IoKinds.text, IoKinds.text], out: [IoKinds.image] })

// Three kinds, still IO_KINDS order rather than the author's.
const _three: 'text+image+audio->text' = tf({
	in: [IoKinds.audio, IoKinds.image, IoKinds.text],
	out: [IoKinds.text],
})

// D1 — a combination core never named still compiles, to its exact literal.
// Narrowing `SlotDecl.requires` to a known-transform union would make THIS line
// unassignable to the very field `tf` exists to fill, which is why that
// narrowing was declined rather than deferred by accident.
const _novel: 'audio->image' = tf({ in: [IoKinds.audio], out: [IoKinds.image] })

// @ts-expect-error — the literal is EXACT, so a wrong one is caught even when both sides are well-formed
const _wrong: 'text->image' = tf({ in: [IoKinds.text], out: [IoKinds.text] })

// ── The negatives, which are the entire point ───────────────────────────────

// @ts-expect-error — a mistyped kind MEMBER: the case the ruling names, where 'text+imgae->text' compiles fine
tf({ in: [IoKinds.text, IoKinds.imgae], out: [IoKinds.text] })

// @ts-expect-error — a raw string is not a kind, however plausible it looks
tf({ in: ['txet'], out: [IoKinds.text] })

// @ts-expect-error — an EMPTY input side; `TransformId` is `${string}->${string}`, so '->' is legal to IT
tf({ in: [], out: [IoKinds.text] })

// @ts-expect-error — and an empty output side, which the non-empty `Kinds` tuple refuses just the same
tf({ in: [IoKinds.text], out: [] })

// ── Why `transformId` is not an overload of `tf` ────────────────────────────
// As a second, widened overload it would rescue every negative above: each one
// fails the narrow signature, falls through to `readonly IoKind[]`, and
// compiles as `TransformId`. Two functions over one body keeps `tf` strict
// while this one stays honest about the runtime path — kinds already in hand,
// from a parsed id or a probe, with no literal type left to preserve.

const _widened: TransformId = transformId({ in: ['text', 'image'], out: ['text'] })

export type _Used = [
	typeof _chat,
	typeof _vision,
	typeof _reordered,
	typeof _dupe,
	typeof _three,
	typeof _novel,
	typeof _wrong,
	typeof _widened,
]
