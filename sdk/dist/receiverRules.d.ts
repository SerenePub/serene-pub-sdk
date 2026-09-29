/**
 * One attribute, judged: `{ value }` is what to write (`null` removes the
 * attribute), `{ refused }` says why it is dropped. The host appends its own
 * words (`— dropped`); the harness lists the sentence in `refused`.
 * @experimental
 */
export type ReceiverAttribute = {
    readonly value: string | null;
} | {
    readonly refused: string;
};
/**
 * Judge one attribute a remote writes on a vocabulary element (`tag`, already
 * lowercased and in the vocabulary), in `owner`'s box.
 * @experimental
 */
export declare function receiverAttribute(tag: string, attribute: string, value: unknown, owner: string): ReceiverAttribute;
/**
 * Why an element a remote places in `owner`'s box does not land — its whole
 * subtree is dropped — or `undefined` when it does.
 * @experimental
 */
export declare function receiverElementFinding(tag: string, owner: string): string | undefined;
//# sourceMappingURL=receiverRules.d.ts.map