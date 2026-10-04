/** The attachment kinds, in the order the composer lists them. @experimental */
export const ATTACHMENT_KINDS_V1 = ['image', 'text', 'pdf'];
const KIND_PLURAL = {
    image: 'images',
    text: 'text files',
    pdf: 'PDFs',
};
/** What each kind is called in the Attach menu and the What can be attached dialog. @experimental */
export const KIND_NAME = {
    image: 'Images',
    text: 'Text files',
    pdf: 'PDFs',
};
/** One file of a kind, as a sentence opens (the server's own wording). */
const KIND_ONE = {
    image: 'An image',
    text: 'A text file',
    pdf: 'A PDF',
};
/** The formats each kind takes, as the menu says them. @experimental */
export const KIND_FORMATS = {
    image: 'PNG, JPEG, WebP, GIF',
    text: '.txt, .md',
    pdf: '.pdf',
};
/** "images · text files" — a list of kinds as a person reads it. @experimental */
export function kindList(kinds) {
    return ATTACHMENT_KINDS_V1.filter((k) => kinds.includes(k))
        .map((k) => KIND_PLURAL[k])
        .join(' · ');
}
/** The kinds this session's reply can read — the union over its reading calls (D1). @experimental */
export function readableKinds(readers) {
    if (!readers)
        return [];
    return ATTACHMENT_KINDS_V1.filter((k) => readers.kinds[k]?.allowed);
}
/**
 * The readers summary: "This reply can read: images · text files" — the
 * first line of the composer's **What can be attached** dialog (More ⋮;
 * next-pass note 41) and the Attach button's tooltip. With more than one
 * reading call, the dialog lists each under it (`readerCallLines`).
 * @experimental
 */
export function readersSummary(readers) {
    if (!readers)
        return null;
    const kinds = readableKinds(readers);
    if (!kinds.length)
        return 'This reply reads no attachments.';
    return `${readers.calls.length > 1 ? 'Can read' : 'This reply can read'}: ${kindList(kinds)}`;
}
/**
 * One line per reading call, for the What can be attached dialog: "Narrator: images, text
 * files" — and what it gets as a name instead ("images appear to it as a
 * name"). An administrator's line names the model.
 * @experimental
 */
export function readerCallLines(readers) {
    if (!readers)
        return [];
    return readers.calls.map((c) => {
        const who = c.model ? `${c.label} (${c.model})` : c.label;
        const reads = ATTACHMENT_KINDS_V1.filter((k) => c.reads.includes(k)).map((k) => KIND_PLURAL[k]);
        const named = ATTACHMENT_KINDS_V1.filter((k) => c.placeholderFor.includes(k)).map((k) => KIND_PLURAL[k]);
        return (`${who}: ${reads.join(', ') || 'nothing'}` +
            (named.length ? ` (${named.join(' and ')} appear to it as a name)` : ''));
    });
}
const MiB = 1024 * 1024;
const formatCap = (bytes) => `${Math.round(bytes / MiB)} MB`;
/** The sentence an SVG's tile shows: SVG is refused by name. @experimental */
export const SVG_REFUSAL = "An SVG can't be attached. Attach an image (PNG, JPEG, WebP, GIF), a text file (.txt, .md) or a PDF.";
/** The sentence a tile shows for a file of no offered kind. @experimental */
export const TYPE_REFUSAL = "That file type can't be attached. Attach an image (PNG, JPEG, WebP, GIF), a text file (.txt, .md) or a PDF.";
const startsWith = (head, sig, at = 0) => sig.every((b, i) => head[at + i] === b);
/**
 * A file's attachment kind by its first bytes (magic numbers), or null when
 * it is none the composer offers. Text has no magic: a `.txt` / `.md` /
 * `text/*` file whose first bytes hold no control byte is text. An SVG —
 * by name, or text that opens as one — is `'svg'`, refused by name.
 * @experimental
 */
export function sniffAttachmentKind(head, filename, type = '') {
    if (startsWith(head, [0x89, 0x50, 0x4e, 0x47]))
        return 'image';
    if (startsWith(head, [0xff, 0xd8, 0xff]))
        return 'image';
    if (startsWith(head, [0x47, 0x49, 0x46, 0x38]))
        return 'image';
    if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8))
        return 'image';
    if (startsWith(head, [0x25, 0x50, 0x44, 0x46]))
        return 'pdf';
    if (/\.svgz?$/i.test(filename) || type === 'image/svg+xml')
        return 'svg';
    const textual = /\.(txt|md|markdown)$/i.test(filename) || type === 'text/plain' || type === 'text/markdown';
    if (!textual)
        return null;
    for (const b of head)
        if (b === 0 || (b < 0x09) || (b > 0x0d && b < 0x20 && b !== 0x1b))
            return null;
    const start = new TextDecoder('utf-8', { fatal: false }).decode(head.subarray(0, 512)).trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>/]/i.test(start))
        return 'svg';
    return 'text';
}
/** The pre-check over files sniffed already: which go up, which are refused and why. @experimental */
export function preCheckFiles(files, tray, readers) {
    const accept = [];
    const refusals = [];
    const cap = readers?.filesPerMessage ?? 10;
    let room = cap - tray.filter((t) => t.status !== 'refused').length;
    files.forEach((f, i) => {
        const refuse = (reason) => refusals.push({ filename: f.name, reason });
        if (f.kind === 'svg')
            return refuse(SVG_REFUSAL);
        if (!f.kind)
            return refuse(TYPE_REFUSAL);
        const verdict = readers?.kinds[f.kind];
        if (readers && !verdict?.allowed)
            return refuse(verdict?.reason ?? `Nothing in this reply reads ${KIND_PLURAL[f.kind]}.`);
        if (f.size <= 0)
            return refuse('That file is empty.');
        const limit = readers?.bytesPerKind[f.kind];
        if (limit && f.size > limit)
            return refuse(`${KIND_ONE[f.kind]} can be at most ${formatCap(limit)}.`);
        if (room <= 0)
            return refuse(`A message can carry at most ${cap} files.`);
        room--;
        accept.push(i);
    });
    return { accept, refusals };
}
/** "Uploading 1 of 2…" — what Send says while it waits, or null when nothing uploads. @experimental */
export function uploadingNote(tray) {
    const live = tray.filter((t) => t.status !== 'refused');
    const uploading = live.filter((t) => t.status === 'uploading').length;
    return uploading ? `Uploading ${uploading} of ${live.length}…` : null;
}
/** The tray items a Send carries: the ready ones, in tray order. @experimental */
export function sendableTrayIds(tray) {
    return tray.filter((t) => t.status === 'ready').map((t) => t.id);
}
//# sourceMappingURL=composerTray.js.map