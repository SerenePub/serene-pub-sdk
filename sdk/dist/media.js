/**
 * The media vocabulary — one discriminated kind, not a family of sibling shapes.
 *
 * ## Why a discriminator rather than separate shapes per modality
 *
 * The tempting design is `S.image`, `S.audio`, `S.video`, `S.document` as
 * peers, each with its own ports. It does not survive contact with the way
 * models are actually going: every new modality would be a new shape, new ports
 * on every provider that touches media, and a new branch in every wire adapter
 * — the combinatorial growth this SDK avoids everywhere else by declaring data
 * rather than switching on it. The contracts file opens by noting that the LLM,
 * TTS and image-gen providers are structurally identical precisely *because*
 * nothing switches on modality (17 §1); sibling media shapes would undo that.
 *
 * ## Why not simply "file", either
 *
 * Full generalisation loses the one thing the type system is actually needed
 * for: **capability negotiation**. "This model takes images but not PDFs" is a
 * real and common constraint, and it is the check that turns a failed API call
 * into a disabled button. A bare `file` shape cannot express it.
 *
 * So: **one shape, a declared kind, and capability sets that enumerate kinds.**
 * Ports stay general (no explosion), while what a connection or node will
 * accept stays specific (a real check). This is the same split the app's own
 * `files` table already makes — a coarse `kind` derived from the mime and
 * stored, so "every document" is an index scan rather than a string parse.
 */
/**
 * The coarse classification, matching the app's `files.kind` exactly so a blob
 * does not change category on its way through a pipeline.
 *
 * Declared as a const array rather than a bare union so it is introspectable:
 * a settings control that offers "which kinds does this accept" enumerates
 * this instead of hardcoding a list that drifts.
 */
export const MEDIA_KINDS = ['image', 'audio', 'video', 'document'];
export const isMediaKind = (v) => typeof v === 'string' && MEDIA_KINDS.includes(v);
/** Does `cap` accept this reference? The check a picker and a wire adapter
 *  both need, written once so they cannot disagree. */
export function accepts(cap, ref) {
    if (!cap?.accepts?.length)
        return false;
    if (!cap.accepts.includes(ref.kind))
        return false;
    if (cap.mimes?.length && !cap.mimes.includes(ref.mime))
        return false;
    return true;
}
/** Everything in a part list that is prose, concatenated — the degrade path
 *  for a consumer that only understands text. Reasoning is deliberately
 *  excluded: it is not the answer. */
export function partsToText(parts) {
    return parts
        .filter((p) => p.t === 'text')
        .map((p) => p.text)
        .join('');
}
/** Every media reference in a part list, in order. */
export function partsToMedia(parts) {
    return parts
        .filter((p) => p.t === 'media')
        .map((p) => p.ref);
}
//# sourceMappingURL=media.js.map