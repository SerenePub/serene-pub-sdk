/**
 * Preview runs — "show me what would be sent, and why" (debug mode in chat).
 *
 * A preview is **not a second estimator**. It is the ordinary run, stopping at the
 * pre-call substrate: input resolved, context assembled, payload formed, token count
 * taken — and then `halt` instead of `call`. That is the whole design constraint. Any
 * implementation that computes "what we would send" on a separate path drifts from what
 * actually gets sent, silently, and is most wrong exactly when someone is debugging
 * because something is off.
 *
 * Almost everything the panel shows is already in the receipt: Assemble records the
 * allocation it computed and the inputs it computed it from (16 §5a), and the Provider's
 * resolved input is recorded like any node's. The preview hoists those into one place so
 * a UI does not have to reassemble them from three node receipts, and adds the one thing
 * that only exists at the call site — the formed payload and its token count.
 */
/**
 * What a counter measures when it is handed something that is not a string.
 *
 * A wire payload is a messages array as often as it is prose, and every counter
 * in the SDK has to agree about what counting one of those means — otherwise a
 * receipt's figure and a budget's figure are measurements of two different
 * things. Shared with `src/tokenizers.ts` rather than reimplemented there.
 */
export const countableText = (v) => typeof v === 'string' ? v : JSON.stringify(v ?? '');
/**
 * A stand-in tokenizer, and the floor everything else degrades to.
 *
 * The real one comes from connection metadata (`tokenizer`), is resolved and
 * loaded ONCE before the run starts (`RunOptions.tokenizer`, `loadTokenizer`)
 * and reused — counting sixty blocks should be sixty cheap calls against
 * something already resident, not sixty model loads. This is what counts when
 * no id was configured, when no loader is registered for the one that was, and
 * when a loader threw: budgeting degrades to an estimate rather than failing a
 * run over a tokenizer.
 */
export const roughTokens = (v) => Math.ceil(countableText(v).length / 4);
/** Choose where a preview stops. */
export function previewTarget(nodes, explicit) {
    if (explicit)
        return { key: explicit, targetedBy: 'explicit' };
    // "The first Provider" needs one qualifier: in any retrieval pipeline the literally
    // first Provider is `embed`, which lives inside the gather block — stopping there
    // would preview a context that had not been retrieved yet. Spine-only is the rule
    // that means what people intend, and it is the same rule
    // `slot.downstreamOracle()` already resolves with (16 §5b-i).
    const spine = nodes
        .filter((n) => !n.clauseId && n.kind === 'oracle')
        .sort((a, b) => a.position - b.position);
    return spine[0] ? { key: spine[0].key, targetedBy: 'first-provider-on-spine' } : undefined;
}
export function renderPreview(p) {
    const out = [];
    out.push(`preview · stopped before ${p.atNode} (${p.definitionId}) · ${p.targetedBy}`);
    if (p.connection) {
        out.push(`  connection ${p.connection.kind ?? '?'}` +
            (p.connection.contextLength ? ` · context ${p.connection.contextLength}` : '') +
            (p.connection.tokenizer ? ` · tokenizer ${p.connection.tokenizer}` : ''));
    }
    if (p.budget) {
        out.push(`  budget: ${p.budget.available ?? '?'} available of ${p.budget.maxContext ?? '?'}`);
    }
    if (p.wire) {
        out.push(`  wire ${p.wire.format}: ${p.wire.blockTokens} block + ${p.wire.overheadTokens} scaffold`);
    }
    out.push(`  would send ${p.context.tokens} tokens · ${p.totals.included}/${p.totals.blocks} blocks included` +
        (p.totals.overBudgetBy ? `  ⚠ OVER by ${p.totals.overBudgetBy}` : ''));
    for (const b of p.blocks) {
        out.push(`   ${b.included ? '✓' : '✗'} ${(b.sourceKey ?? b.id ?? '?').padEnd(20)} ${String(b.tokens).padStart(6)} tok` +
            (b.reason ? `   ${b.reason}` : ''));
        // The trail is the difference between a panel worth opening and a token counter.
        for (const w of b.why ?? [])
            out.push(`        · ${w}`);
    }
    return out.join('\n');
}
/** Convenience for a UI: the preview, if this receipt is one. */
export const previewOf = (r) => r.preview;
//# sourceMappingURL=preview.js.map