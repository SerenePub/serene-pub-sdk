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
 * @experimental
 */
export const MEDIA_KINDS = ['image', 'audio', 'video', 'document'] as const
/** @experimental */
export type MediaKind = (typeof MEDIA_KINDS)[number]

/** @experimental */
export const isMediaKind = (v: unknown): v is MediaKind =>
	typeof v === 'string' && (MEDIA_KINDS as readonly string[]).includes(v)

/**
 * A reference to stored media, as it travels on a port.
 *
 * **A reference, never bytes.** The uuid is the app's public media address.
 * Passing bytes on a port instead would put megabytes in every receipt, defeat
 * dedupe, and give a plugin a copy the host cannot account for.
 *
 * The fields split along the same seam the app's tables do (0182), and knowing
 * which side a field is on is the difference between a correct consumer and one
 * that quietly serves the wrong representation:
 *
 *  - FILE-level, and exact: `uuid`, `kind`, `width`, `height`, `duration`,
 *    `filename`, `text`. One file, one uuid, shared by every representation of
 *    it, and it no longer rotates — the app carries cache invalidation in a
 *    separate revision counter that never reaches a port.
 *  - VARIANT-level, and therefore a HINT: `mime` and `bytes`. They describe the
 *    file's DISPLAY variant — which is what a bare `/media/{uuid}` serves — and
 *    a request that names a variant, or one negotiated down by an `Accept`
 *    header, can legitimately be answered with different bytes and a different
 *    type. Do not treat them as a promise about what arrived; a receipt records
 *    what was actually sent.
 * @experimental
 */
export interface MediaRef {
	/** The public address (`/media/{uuid}`). Stable for this FILE, shared by
	 *  every variant of it. */
	uuid: string
	kind: MediaKind
	/** The display variant's mime. A HINT — see above. */
	mime: string
	/** The display variant's byte length. A HINT — see above. */
	bytes: number
	width?: number
	height?: number
	/** Seconds, when the source has a time dimension. Its PRESENCE is the signal
	 *  that converting to a still format would be a downgrade. */
	duration?: number
	/** Display metadata only — never resolved, never part of a path. */
	filename?: string
	/** Alt text / transcript, when one is known. Carried so a downgrade to a
	 *  text-only consumer has something to say instead of nothing. */
	text?: string
}

/**
 * 🚧 One file attached to one history message (PLAN-composer-attachments §3.5)
 * — an entry of `core:shape/media-by-message@1`, which
 * `core:query/history-attachments@1` publishes keyed by message id.
 *
 * A {@link MediaRef} plus the two facts placement needs and a reference does
 * not carry: which **attachment kind** the file is (`image`, `text`, `pdf`, or
 * `null` for a file no model is offered — an EPUB an outlet posted), and, for
 * a text file, its **body**, because a text file reaches every model as text
 * and a pure placement step cannot read a disk.
 * @experimental
 */
export interface HistoryAttachmentV1 extends MediaRef {
	/** `image` / `text` / `pdf`, decided from the stored mime; `null` for any
	 *  other file, which every call is shown as a name. */
	attachmentKind: 'image' | 'text' | 'pdf' | null
	/** A text file's body, read up to the query's cap. Absent for other files. */
	body?: string
	/** True when `body` stopped at the query's cap rather than at the file's end. */
	bodyTruncated?: boolean
}

/**
 * 🚧 What the pair behind a connection slot reads (PLAN-composer-attachments
 * §5.2) — `metadata.reads` on a resolved connection descriptor, computed by the
 * host's ONE reading predicate (the same answer the composer's readers line
 * shows). A placement step reads it the way `assemble` reads
 * `metadata.promptFormat`, so it stays pure.
 * @experimental
 */
export interface ConnectionReadsV1 {
	/** The pair sends images to its model on its wire mode. */
	image: boolean
	/** The pair sends PDFs to its model on its wire mode. */
	pdf: boolean
	/** Why not, per kind — a sentence that names no connection. */
	why?: { image?: string; pdf?: string }
	/** Estimated prompt tokens one placed image costs. An estimate, never a cap. */
	tokensPerImage?: number
}

/**
 * What a node, provider or connection will handle.
 *
 * Both directions are declared because they are genuinely independent: a vision
 * model accepts images and emits none; an image generator is the reverse; a
 * multimodal model that reads and draws does both. A single `supports` list
 * could not tell those apart, and the difference is exactly what a picker needs
 * in order to grey out the wrong connection.
 * @experimental
 */
export interface MediaCapability {
	/** Kinds this can take as input. Absent or empty: text only. */
	accepts?: readonly MediaKind[]
	/** Kinds this can produce. Absent or empty: text only. */
	emits?: readonly MediaKind[]
	/** Mime allow-list, when a kind is too coarse — e.g. a model that reads
	 *  `image/png` and `image/jpeg` but not `image/gif`. Absent means every
	 *  mime of an accepted kind. */
	mimes?: readonly string[]
}

/** Does `cap` accept this reference? The check a picker and a wire adapter
 *  both need, written once so they cannot disagree. 
 * @experimental
 */
export function accepts(cap: MediaCapability | undefined, ref: MediaRef): boolean {
	if (!cap?.accepts?.length) return false
	if (!cap.accepts.includes(ref.kind)) return false
	if (cap.mimes?.length && !cap.mimes.includes(ref.mime)) return false
	return true
}

/**
 * One item of a model's output.
 *
 * ## Why output is a list of parts rather than a string
 *
 * Because that is what a model call already returns, everywhere. A single
 * response now routinely carries an ordered mix of prose, reasoning, tool calls
 * and generated media — interleaved image output alongside text, code
 * execution that yields both a summary and a file, audio with its transcript.
 * Modelling the reply as `text` and bolting media on beside it means the
 * *order* is lost, which is the one thing an interleaved response is about.
 *
 * The app already stores messages this way (`messageParts`, with
 * `core:image` / `core:file`). This is the provider contract catching up to
 * the storage model, not a speculative addition.
 * @experimental
 */
export type OutputPart =
	| { t: 'text'; text: string }
	/** Chain-of-thought or similar, kept separate so it can be hidden,
	 *  budgeted and excluded from context independently of the answer. */
	| { t: 'reasoning'; text: string }
	| { t: 'media'; ref: MediaRef }
	| { t: 'tool-call'; id: string; name: string; args: unknown }
	/** Provider-specific passthrough. Named so an unknown part is inert rather
	 *  than an error — a host that does not understand one skips it. */
	| { t: 'other'; subtype: string; data: unknown }

/** Everything in a part list that is prose, concatenated — the degrade path
 *  for a consumer that only understands text. Reasoning is deliberately
 *  excluded: it is not the answer. 
 * @experimental
 */
export function partsToText(parts: readonly OutputPart[]): string {
	return parts
		.filter((p): p is Extract<OutputPart, { t: 'text' }> => p.t === 'text')
		.map((p) => p.text)
		.join('')
}

/** Every media reference in a part list, in order. @experimental */
export function partsToMedia(parts: readonly OutputPart[]): MediaRef[] {
	return parts
		.filter((p): p is Extract<OutputPart, { t: 'media' }> => p.t === 'media')
		.map((p) => p.ref)
}
