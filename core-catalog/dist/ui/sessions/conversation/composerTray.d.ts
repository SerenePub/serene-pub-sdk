/**
 * The composer's attachments, read (composer attachments §3.3): what the
 * What can be attached dialog says, which kinds the Attach menu offers, and which picked,
 * dropped or pasted files go up — the **client pre-check**. Pure, so the
 * composer and its tests read one answer.
 *
 * The server is the authority and checks every file again (at
 * `attachments:begin` by its first bytes, at Send as a set). The pre-check
 * only spares a person an upload that would be refused: a file whose kind
 * nothing in this reply reads, an SVG, a file over its kind's cap, or one
 * past the message's count.
 */
import type { AttachmentKindV1, AttachmentReadersV1, TrayItemV1 } from './dossier.js';
/** The attachment kinds, in the order the composer lists them. @experimental */
export declare const ATTACHMENT_KINDS_V1: readonly AttachmentKindV1[];
/** What each kind is called in the Attach menu and the What can be attached dialog. @experimental */
export declare const KIND_NAME: Record<AttachmentKindV1, string>;
/** The formats each kind takes, as the menu says them. @experimental */
export declare const KIND_FORMATS: Record<AttachmentKindV1, string>;
/** "images · text files" — a list of kinds as a person reads it. @experimental */
export declare function kindList(kinds: readonly AttachmentKindV1[]): string;
/** The kinds this session's reply can read — the union over its reading calls (D1). @experimental */
export declare function readableKinds(readers: AttachmentReadersV1 | null | undefined): AttachmentKindV1[];
/**
 * The readers summary: "This reply can read: images · text files" — the
 * first line of the composer's **What can be attached** dialog (More ⋮;
 * next-pass note 41) and the Attach button's tooltip. With more than one
 * reading call, the dialog lists each under it (`readerCallLines`).
 * @experimental
 */
export declare function readersSummary(readers: AttachmentReadersV1 | null | undefined): string | null;
/**
 * One line per reading call, for the What can be attached dialog: "Narrator: images, text
 * files" — and what it gets as a name instead ("images appear to it as a
 * name"). An administrator's line names the model.
 * @experimental
 */
export declare function readerCallLines(readers: AttachmentReadersV1 | null | undefined): string[];
/** A refusal before upload: the file, and the sentence its tile shows. @experimental */
export interface TrayRefusalV1 {
    filename: string;
    reason: string;
}
/** The sentence an SVG's tile shows: SVG is refused by name. @experimental */
export declare const SVG_REFUSAL = "An SVG can't be attached. Attach an image (PNG, JPEG, WebP, GIF), a text file (.txt, .md) or a PDF.";
/** The sentence a tile shows for a file of no offered kind. @experimental */
export declare const TYPE_REFUSAL = "That file type can't be attached. Attach an image (PNG, JPEG, WebP, GIF), a text file (.txt, .md) or a PDF.";
/**
 * A file's attachment kind by its first bytes (magic numbers), or null when
 * it is none the composer offers. Text has no magic: a `.txt` / `.md` /
 * `text/*` file whose first bytes hold no control byte is text. An SVG —
 * by name, or text that opens as one — is `'svg'`, refused by name.
 * @experimental
 */
export declare function sniffAttachmentKind(head: Uint8Array, filename: string, type?: string): AttachmentKindV1 | 'svg' | null;
/** The pre-check over files sniffed already: which go up, which are refused and why. @experimental */
export declare function preCheckFiles(files: ReadonlyArray<{
    name: string;
    size: number;
    kind: AttachmentKindV1 | 'svg' | null;
}>, tray: readonly TrayItemV1[], readers: AttachmentReadersV1 | null | undefined): {
    accept: number[];
    refusals: TrayRefusalV1[];
};
/** "Uploading 1 of 2…" — what Send says while it waits, or null when nothing uploads. @experimental */
export declare function uploadingNote(tray: readonly TrayItemV1[]): string | null;
/** The tray items a Send carries: the ready ones, in tray order. @experimental */
export declare function sendableTrayIds(tray: readonly TrayItemV1[]): string[];
//# sourceMappingURL=composerTray.d.ts.map