/**
 * The conformance kit (03 §9).
 *
 * This is the artifact SP Core upgrades *against*. The rest of this package is a
 * reference implementation whose runtime half is placeholder — a real executor will have
 * durable gate parking, a persistent run queue, transactions and four transports, none of
 * which are here. What survives the port is **the contracts**, and a contract nobody can
 * execute is a document.
 *
 * So: core implements `HostUnderTest`, runs `conform(host)`, and gets a pass/fail per
 * requirement with the law it comes from. The SDK's own executor runs the same kit, which
 * is what keeps the kit honest — a requirement the reference implementation cannot pass is
 * a requirement stated wrong.
 *
 * Every check states **what would be broken if it failed**, because a red line saying
 * "F13" tells an implementer nothing about what to go and look at.
 */
import { actionsOf, DEFAULT_CHANNEL, parseChannel, slashFindings, slashNameOf } from '@serene-pub/sdk';
import { allDefinitions, assertHookSurface, effectsOf, sessionEvents, worldBlockFunctions } from '@serene-pub/sdk';
import { uncausedGenreEvents, unterminatedCycles } from '@serene-pub/sdk';
// One verdict per law (01 §13): C27 enumerates what is registered and holds
// the host's doors to each verdict's own sentence.
import { i18nText, verdicts } from '@serene-pub/sdk';
/**
 * The plugin grant table (plans/29 R-3), imported rather than restated.
 * `pluginHarness.ts` keeps it byte-for-byte with the two sandboxes' programs
 * and the app's `hookCtx.ts`, and its docblock says what a further copy would
 * be: the drift the install-time check exists to catch. C25 judges a host's
 * endowment against this one.
 */
import { hookCtxGrants, hookCtxKeysFor, HOOK_CTX_KINDS } from '@serene-pub/sdk/testing';
import { COMPONENT_PROTOCOL_FIXTURE, componentMountCase, componentParityCase, componentParitySections, componentProtocolCase, judgeComponentModule, } from './components.js';
import { probeSampleFor } from './packages.js';
import { swapFitFinding } from '@serene-pub/sdk';
import { probeBinding, probeCtxFor } from '@serene-pub/sdk/testing';
export * from './components.js';
export * from './packages.js';
/** @experimental */
export class ConformanceError extends Error {
}
const must = (cond, why) => {
    if (!cond)
        throw new ConformanceError(why);
};
/**
 * A host that counts what it is asked to commit and hands out row ids of its
 * own — the kit's write probe for F37 and F38. A run whose outlets reach this
 * has written; a dry run must never reach it.
 */
function writeProbe() {
    const committed = [];
    const host = {
        async commit(_payload, node) {
            const id = `probe:${node.key}#${committed.length + 1}`;
            committed.push(id);
            return { id };
        },
    };
    return { host, committed };
}
/** The row ids an outlet's recorded write carries (`write-result@1`: `{ status, ids }`). */
const rowIdsOf = (n) => {
    const out = n.output;
    return out && typeof out === 'object' && out.ids && typeof out.ids === 'object'
        ? Object.values(out.ids)
        : [];
};
/** Bindings that record the ctx and input every hook was handed, then behave as before. */
function spyBindings(base, seen) {
    const out = {};
    for (const [id, hook] of Object.entries(base))
        out[id] = async (input, ctx) => {
            seen.push({ id, ctx, input });
            return hook(input, ctx);
        };
    return out;
}
/**
 * Does a value carry the sentinel anywhere a hook could read it without
 * calling anything — a string, or one nested in objects and arrays? Functions
 * are never invoked (a ctx's `commit` would write), and a cycle is walked once.
 */
function carries(value, sentinel, seen = new Set()) {
    if (typeof value === 'string')
        return value.includes(sentinel);
    if (!value || typeof value !== 'object')
        return false;
    if (seen.has(value))
        return false;
    seen.add(value);
    const parts = Array.isArray(value) ? value : Object.values(value);
    return parts.some((p) => carries(p, sentinel, seen));
}
/**
 * Did `run` refuse the document at publish-time validation under one of these
 * laws? Read off `findings` when the error carries them, else off the
 * `[LAW]` lines `assertValid` writes — the two shapes a host's refusal takes.
 */
function refusedUnder(e, laws) {
    const findings = e?.findings;
    if (Array.isArray(findings) && findings.some((f) => laws.includes(f?.law)))
        return true;
    const message = e instanceof Error ? e.message : String(e);
    return laws.some((law) => message.includes(`[${law}]`));
}
/** An error's first line, and the first `[LAW]` line after it when there is one. */
const headline = (e) => {
    const lines = (e instanceof Error ? e.message : String(e)).split('\n').map((l) => l.trim());
    const law = lines.slice(1).find((l) => l.startsWith('['));
    return law ? `${lines[0]} ${law}` : (lines[0] ?? '');
};
/** Said up front by every C18(b) failure on a refused document (U7 review, W1). */
const UNVALIDATED = 'C18(b) runs a document validate() refuses, on purpose — a host that skips validation must ' +
    'still hand out no setting; a host that cannot run an unvalidated document needs a run seam ' +
    'that skips publish-time validation';
/** Row ids compared across the string/number divide, as the executor compares them. */
const namesRow = (ids, row) => ids.some((id) => String(id) === String(row));
async function observeRun(fx, probe, go) {
    const before = fx.writesSeen ? await fx.writesSeen() : undefined;
    const receipt = await go();
    const after = fx.writesSeen ? await fx.writesSeen() : undefined;
    const delta = before !== undefined && after !== undefined ? after - before : undefined;
    const seen = probe.committed.length;
    return {
        receipt,
        writes: seen > 0 ? seen : delta,
        via: seen > 0 ? 'probe' : delta !== undefined ? 'writesSeen' : 'neither',
        any: seen + (delta ?? 0),
    };
}
/** Why a zero cannot be read as "wrote nothing" on this host — said only when nothing showed a write. */
const unobserved = (real) => 'the kit cannot observe writes on this host: a real run of chatTurn committed nothing through ' +
    'RunOptions.host and ' +
    (real.via === 'neither'
        ? 'the fixtures supply no writesSeen()'
        : `writesSeen() moved by ${real.writes}`) +
    ' — without one of the two showing a write, "a dry run wrote nothing" cannot be told from ' +
    '"the probe saw nothing"';
/**
 * Does a value carry the owner's declared switch — an object with `field` at
 * the planted position anywhere inside it, or (`bare`) the position itself as
 * one of the value's own entries, which is what a data edge drawn from
 * `<owner>.settings.<field>` would deliver to a port? Functions never called.
 */
function carriesSwitch(value, field, position, bare = false, seen = new Set()) {
    if (!value || typeof value !== 'object')
        return false;
    if (seen.has(value))
        return false;
    seen.add(value);
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
    return entries.some(([k, v]) => (k === field && v === position) ||
        (bare && v === position) ||
        carriesSwitch(v, field, position, false, seen));
}
// ── The requirements ────────────────────────────────────────────────────────
/** @experimental */
export const REQUIREMENTS = [
    {
        id: 'C1',
        law: 'F3',
        title: 'import(export(doc)) is identity, and the hash is stable',
        consequence: 'Rows stop being the system of record. Export/import silently mutates specs, and two instances of the same version disagree about what they are running.',
        check(host, fx) {
            const doc = fx.chatTurn();
            const back = host.importDocument(doc);
            must(host.canonicalHash(back) === host.canonicalHash(doc), 'canonical hash changed across a round trip');
            must(JSON.stringify(back) === JSON.stringify(doc), 'the document changed across a round trip');
        },
    },
    {
        id: 'C2',
        law: '01 §2, F1, F7, F9, F25',
        title: 'every statically checkable law is rejected at publish, with a fix',
        consequence: 'Invalid specs reach runtime. A user sees "it does nothing" instead of an error, and the validator stops being the thing authors trust.',
        check(host, fx) {
            for (const { law, doc, because } of fx.invalid()) {
                const errs = host.validate(doc).filter((f) => f.severity === 'error');
                must(errs.length > 0, `${law}: ${because} — but validate() returned no errors`);
                must(errs.every((e) => !!e.fix), `${law}: an error with no \`fix\` — a prohibition without a stated alternative is a bug (15 §1.3)`);
            }
        },
    },
    {
        id: 'C3',
        law: '01 §5',
        title: 'halt ends the run as `halt`, records the node and reason, and skips downstream',
        consequence: 'Halting looks like failure. Every subscriber to a hot event that correctly decides "not applicable" is counted as an error, and the health signal becomes noise.',
        async check(host, fx) {
            const r = await host.run(fx.haltsEarly(), { input: {}, world: fx.world, bindings: fx.bindings() });
            must(r.outcome === 'halt', `outcome was '${r.outcome}', not 'halt'`);
            must(!!r.haltReason, 'no halt reason recorded — "why did nothing happen" is unanswerable');
            must(!r.nodes.some((n) => n.kind === 'oracle'), 'a node downstream of the halt still ran');
        },
    },
    {
        id: 'C4',
        law: 'F11',
        title: 'the run seed is recorded and replays identically',
        consequence: 'Nondeterministic Tasks stop being replayable. A dice roll, a probability roll or a sampled choice can never be explained after the fact.',
        async check(host, fx) {
            const doc = fx.chatTurn();
            const opts = { input: {}, world: fx.world, bindings: fx.bindings(), seed: 'seed:conformance' };
            const a = await host.run(doc, opts);
            const b = await host.run(doc, opts);
            must(a.seed === 'seed:conformance', 'the seed is not recorded on the receipt');
            must(JSON.stringify(a.nodes.map((n) => n.output)) === JSON.stringify(b.nodes.map((n) => n.output)), 'two runs with the same seed produced different outputs');
        },
    },
    {
        id: 'C5',
        law: 'F16',
        title: 'replay reproduces a run without calling the Provider',
        consequence: 'Replay re-infers. Debugging a past run costs money, changes the answer, and cannot be done at all once a connection is gone.',
        async check(host, fx) {
            const doc = fx.chatTurn();
            const first = await host.run(doc, { input: {}, world: fx.world, bindings: fx.bindings() });
            let called = 0;
            const replayed = await host.replay(doc, first, fx.bindings({
                'core:oracle/generate-text@1': async () => {
                    called++;
                    return { kind: 'ok', value: { main: 'DIFFERENT', text: 'DIFFERENT' } };
                },
            }));
            must(called === 0, 'replay invoked the Provider');
            const out = (n) => JSON.stringify(n.output);
            must(replayed.nodes.map(out).join() === first.nodes.map(out).join(), 'replay produced different node outputs');
        },
    },
    {
        id: 'C6',
        law: 'F13',
        title: 'budgets meter consumption; waiting consumes nothing',
        consequence: 'A parked review gate or a queued run bills the user for time nobody spent. Budgets become a reason not to use the review gate, which is the feature they exist to protect.',
        async check(host, fx) {
            const r = await host.run(fx.haltsEarly(), {
                input: {},
                world: fx.world,
                bindings: fx.bindings(),
                queuedMs: 7 * 24 * 60 * 60 * 1000,
                budget: { tokens: 10 },
            });
            must(r.consumption.tokens === 0, `a run that called nothing consumed ${r.consumption.tokens} tokens`);
            must(r.outcome !== 'err', 'a week of waiting tripped a budget');
        },
    },
    {
        id: 'C7',
        law: 'F36',
        title: 'timeouts bound execution, never waiting',
        consequence: 'A review gate cannot be left open overnight, and a queued run dies before it starts. The whole consent model becomes unusable in practice.',
        async check(host, fx) {
            const r = await host.run(fx.chatTurn(), {
                input: {},
                world: fx.world,
                bindings: fx.bindings(),
                queuedMs: 7 * 24 * 60 * 60 * 1000,
                timeoutCeilingMs: 1000,
            });
            must(!r.nodes.some((n) => n.timedOut), 'queue wait tripped a node timeout');
        },
    },
    {
        id: 'C8',
        law: 'F26',
        title: 'forced-sequential execution produces an identical result, and a parallel clause commits its writes in declaration order',
        consequence: 'The async kill switch stops being safe. An admin disabling concurrency changes answers, so the switch can never be used to diagnose anything.',
        async check(host, fx, report) {
            const doc = fx.gather();
            const norm = (r) => r.nodes
                .map((n) => `${n.nodeKey}:${n.result}:${JSON.stringify(n.output)}`)
                .sort()
                .join('\n');
            const par = await host.run(doc, { input: { text: 'hi' }, world: fx.world, bindings: fx.bindings() });
            const seq = await host.run(doc, {
                input: { text: 'hi' },
                world: fx.world,
                bindings: fx.bindings(),
                forceSequential: true,
            });
            must(norm(par) === norm(seq), 'parallel and forced-sequential produced different results');
            // (b) Writes in a parallel clause (W1b): the state a run leaves is
            // the state a sequential run leaves, so the commits land in
            // declaration order whichever chain finishes first.
            const writing = fx.gatherWrites?.();
            if (!writing)
                return report.skip('no fixture puts writes in a parallel gather — supply `gatherWrites()` (chains ending in writes, ' +
                    'the first declared finishing last) for the write-order half to be judged');
            const order = async (forceSequential) => {
                const probe = writeProbe();
                await host.run(writing, {
                    input: { text: 'hi' },
                    world: fx.world,
                    bindings: fx.bindings(),
                    host: probe.host,
                    forceSequential,
                });
                return probe.committed.map((id) => String(id).replace(/^probe:/, '').replace(/#\d+$/, ''));
            };
            const parOrder = await order(false);
            if (parOrder.length < 2)
                return report.skip(`the host's commits for gatherWrites() did not reach RunOptions.host (${parOrder.length} seen), ` +
                    'so their order could not be judged');
            const seqOrder = await order(true);
            must(JSON.stringify(parOrder) === JSON.stringify(seqOrder), `parallel committed ${parOrder.join(' → ')} but forced-sequential committed ${seqOrder.join(' → ')} — ` +
                'a parallel clause must commit its writes in declaration order (01 §4)');
        },
    },
    {
        id: 'C9',
        law: '13 §1',
        title: 'a block publishes branch-results in declaration order',
        consequence: 'Downstream nodes see branches in completion order, so a spec behaves differently under load than in testing — the least reproducible class of bug there is.',
        async check(host, fx) {
            const r = await host.run(fx.gather(), { input: { text: 'hi' }, world: fx.world, bindings: fx.bindings() });
            must(r.outcome === 'ok', `gather did not complete: ${r.haltReason ?? r.outcome}`);
        },
    },
    {
        id: 'C10',
        law: '01 §4, §4a',
        title: 'map and loop are bounded, and exceeding the bound is visible',
        consequence: 'An unbounded repeat is the most likely source of a surprise bill in the system, and for a loop it is the only thing between a bad predicate and a run that never ends.',
        async check(host, fx) {
            const r = await host.run(fx.looped(2), { input: {}, world: fx.world, bindings: fx.bindings() });
            must(r.outcome === 'ok', 'reaching max should not be an error — it is the bound working');
            must((r.notes ?? []).some((n) => /max/.test(n)), 'a loop that hit its ceiling left no record — a truncated loop must never look like a finished one');
        },
    },
    {
        id: 'C11',
        law: '13 §3',
        title: 'an admin kill is `cancelled`, with the actor recorded',
        consequence: '"An admin stopped it" is indistinguishable from "it broke." Error dashboards fill with deliberate actions and stop being read.',
        async check(host, fx) {
            const r = await host.run(fx.chatTurn(), {
                input: {},
                world: fx.world,
                bindings: fx.bindings(),
                cancelSignal: () => ({ by: 'admin:test', reason: 'killed from the queue view' }),
            });
            must(r.outcome === 'cancelled', `outcome was '${r.outcome}'`);
            must(r.cancelledBy === 'admin:test', 'the actor was not recorded');
        },
    },
    {
        id: 'C12',
        law: '13 §2',
        title: 'an event-triggered halt before any effect compacts; a click does not',
        consequence: 'A hot event × every subscribed pipeline × every message writes a full receipt each time. Retention becomes a per-message multiplier and the receipts table eats the disk.',
        async check(host, fx) {
            const doc = fx.haltsEarly();
            const ev = await host.run(doc, {
                input: {},
                world: fx.world,
                bindings: fx.bindings(),
                triggerSource: 'event',
            });
            must(ev.compact === true, 'an event-triggered early halt was not compacted');
            must(ev.nodes.length === 0 && !!ev.haltReason, 'compaction dropped the reason as well as the payloads');
            const ui = await host.run(doc, { input: {}, world: fx.world, bindings: fx.bindings(), triggerSource: 'ui' });
            must(ui.compact !== true, 'a user-initiated run was compacted — it happens once per click');
        },
    },
    {
        id: 'C13',
        law: '16 §7',
        title: 'the previewed payload is the payload that would be sent',
        consequence: 'Debug mode becomes a second estimator. It drifts from reality silently and is most wrong exactly when someone opens it because something is off.',
        async check(host, fx) {
            const doc = fx.chatTurn();
            let sent;
            const previewed = await host.run(doc, {
                input: {},
                world: fx.world,
                bindings: fx.bindings(),
                preview: true,
            });
            must(!!previewed.preview, 'a preview run produced no preview report');
            await host.run(doc, {
                input: {},
                world: fx.world,
                bindings: fx.bindings({
                    'core:oracle/generate-text@1': async (i) => {
                        sent = i.context;
                        return { kind: 'ok', value: { main: 'x', text: 'x' } };
                    },
                }),
            });
            must(JSON.stringify(previewed.preview.context.rendered) === JSON.stringify(sent), 'the previewed payload differs from the one actually sent');
        },
    },
    {
        id: 'C14',
        law: 'F16, F18',
        title: 'no receipt in the corpus contains a credential',
        consequence: 'Receipts are handed to plugin authors for debugging. A credential in one is a credential mailed to a stranger, and the material/metadata split becomes a claim nobody can rely on.',
        async check(host, fx) {
            const runs = [
                await host.run(fx.chatTurn(), { input: {}, world: fx.world, bindings: fx.bindings() }),
                await host.run(fx.gather(), { input: { text: 'hi' }, world: fx.world, bindings: fx.bindings() }),
            ];
            for (const r of runs) {
                const body = JSON.stringify(r);
                must(!/sk-|api[_-]?key"?\s*:\s*"(?!\[)/i.test(body), 'a receipt contains something shaped like a credential');
            }
        },
    },
    {
        id: 'C15',
        law: '15 §1.3',
        title: 'every validation error states what to do instead',
        consequence: 'Authors get told no without being told what yes looks like. Every prohibition becomes a support thread.',
        check(host, fx) {
            for (const { doc } of fx.invalid()) {
                for (const e of host.validate(doc)) {
                    must(!!e.fix && e.fix.length > 10, `finding '${e.message}' has no usable fix`);
                }
            }
        },
    },
    {
        id: 'C16',
        law: 'F37',
        title: 'a run has one live row: two are refused at publish, the one live row is named to the host, and a dry run has no real one',
        consequence: 'The composer streams into the wrong row, or two placeholders appear for one turn. Stop cannot tell which row to finalise, so a cancelled reply stays "generating" forever.',
        async check(host, fx) {
            // (a) At publish: two independent live-row writes are two primary
            // rows. That is F7's refusal, and it is the law's first half — a
            // document that reaches the executor has one row to name.
            const two = fx.twoWrites();
            const errs = host.validate(two).filter((e) => e.severity === 'error');
            must(errs.some((e) => e.law === 'F7'), `twoWrites() places two create-message placeholders — but validate() raised no F7 error ` +
                `(${errs.map((e) => e.law).join(', ') || 'no errors at all'}); two live rows reached the executor`);
            must(errs.filter((e) => e.law === 'F7').every((e) => !!e.fix && e.fix.length > 10), 'two live rows were refused without saying what to do instead (15 §1.3)');
            // (b) At run time, on a document the host can publish: the one
            // write is the run's row, told to the host exactly once, and the
            // world took exactly one write. The write is observed through the
            // kit's probe when the probe saw it, else through `writesSeen` for
            // a host whose commits bypass `RunOptions.host` (as C17; U7 review
            // W2, delta 2).
            const doc = fx.chatTurn();
            const probe = writeProbe();
            const ends = [];
            const real = await observeRun(fx, probe, () => host.run(doc, {
                input: {},
                world: fx.world,
                bindings: fx.bindings(),
                host: probe.host,
                onRunEnd: (end) => {
                    ends.push(end);
                },
            }));
            const r = real.receipt;
            must(r.outcome === 'ok', `the run ended '${r.outcome}': ${r.haltReason ?? ''}`);
            const writes = r.nodes.filter((n) => n.kind === 'outlet' && n.result === 'ok');
            must(writes.length === 1, `chatTurn() has one write outlet; ${writes.length} recorded as writes`);
            must(ends.length === 1, `the host heard the run end ${ends.length} times — it is told once`);
            const end = ends[0];
            const write = writes[0];
            must(rowIdsOf(write).length > 0, `the write ('${write.nodeKey}') was recorded with no row ids — a write publishes what it wrote`);
            must(end.liveRow !== undefined, 'the run named no live row, with a placeholder committed');
            must(namesRow(rowIdsOf(write), end.liveRow), `the live row (${String(end.liveRow)}) is not the write's ('${write.nodeKey}' wrote ` +
                `${JSON.stringify(rowIdsOf(write))}) — the run's row is the most recent live-row outlet's`);
            must(real.writes !== undefined && real.writes > 0, unobserved(real));
            must(real.writes === 1, `the world took ${real.writes} write(s) from one write outlet — one live row is one commit`);
            // (c) Dry: the same document commits nothing, so no real row can
            // be primary — the host is told `dry`, and named nothing or the
            // synthetic `dry:` row. A write on either channel counts.
            const dryEnds = [];
            const dryProbe = writeProbe();
            const dry = await observeRun(fx, dryProbe, () => host.run(doc, {
                input: {},
                world: fx.world,
                bindings: fx.bindings(),
                host: dryProbe.host,
                dry: true,
                onRunEnd: (end) => {
                    dryEnds.push(end);
                },
            }));
            must(dryEnds.length === 1 && dryEnds[0].dry === true, 'a dry run did not tell the host it was dry');
            must(dryEnds[0].liveRow === undefined || String(dryEnds[0].liveRow).startsWith('dry:'), `a dry run named a real row as primary (${String(dryEnds[0].liveRow)}) — a preview that owns a row leaves it behind`);
            must(dry.any === 0, `a dry run committed ${dry.any} row(s)`);
        },
    },
    {
        id: 'C17',
        law: 'F38',
        title: 'a preview writes nothing: every outlet runs and every write is synthetic',
        consequence: 'A token estimate leaves a placeholder row behind every time somebody types, and a debug preview bills the user for rows they never asked for. Preview stops being safe to open.',
        async check(host, fx) {
            const doc = fx.chatTurn();
            const probe = writeProbe();
            const opts = { input: {}, world: fx.world, bindings: fx.bindings(), host: probe.host };
            // Control: a write must be visible at all, or "zero" is no finding.
            // The probe's count when it saw the commit; else `writesSeen` for a
            // host that does not route `ctx.commit` through `RunOptions.host`;
            // with neither showing a write, the gap is named.
            const real = await observeRun(fx, probe, () => host.run(doc, opts));
            must(real.writes !== undefined && real.writes > 0, unobserved(real));
            const dryProbe = writeProbe();
            const ends = [];
            const dry = await observeRun(fx, dryProbe, () => host.run(doc, {
                ...opts,
                host: dryProbe.host,
                dry: true,
                onRunEnd: (end) => {
                    ends.push(end);
                },
            }));
            const r = dry.receipt;
            must(dry.any === 0, `a dry run reached the world: ${dry.any} write(s) committed`);
            must(ends.length === 1 && ends[0].dry === true, 'the run did not report itself dry to the host');
            must(r.outcome === 'ok', `a dry run still runs to the end; this one ended '${r.outcome}'`);
            const outlets = r.nodes.filter((n) => n.kind === 'outlet');
            must(outlets.length > 0, 'no outlet ran — a dry run runs every outlet, it just commits nothing');
            for (const n of outlets) {
                must(n.dry === true, `outlet '${n.nodeKey}' is not marked dry on its receipt row`);
                const ids = rowIdsOf(n);
                must(ids.length > 0, `outlet '${n.nodeKey}' published no ids — a downstream node reads the synthetic id as it would a real one`);
                must(ids.every((id) => typeof id === 'string' && id.startsWith('dry:')), `outlet '${n.nodeKey}' recorded a real-looking id in a dry run: ${JSON.stringify(ids)}`);
            }
            // The event a write causes is still recorded — flagged dry, never
            // dispatched — so a reader of the receipt can tell "nothing was
            // caused" from "a write whose subscribers happened to be zero".
            must(r.emitted.length > 0, 'a dry write caused no recorded event — the event a write would cause is recorded and flagged dry, not dropped (U7 review, S3)');
            must(r.emitted.every((e) => e.dry === true), 'an event a dry write would have caused is recorded as emitted — it must be flagged dry, never dispatched');
        },
    },
    {
        id: 'C18',
        law: 'F39',
        title: 'settings never travel: a setting is read at its owner, and no node can read another\'s',
        consequence: 'A plugin node silently depends on another node\'s review toggle or enabled switch. Configs stop being independent — flipping one switch changes a node nobody tuned — and the panel can no longer say where a value came from.',
        async check(host, fx, report) {
            // (a) Statically: a data edge drawn from a node's `settings` address
            // is refused, under this law, with the fix.
            const entries = fx.invalid().filter((e) => e.law === 'F39');
            must(entries.length > 0, 'the fixtures carry no F39 document — nothing to refuse');
            for (const { doc, because } of entries) {
                const errs = host.validate(doc).filter((e) => e.severity === 'error');
                must(errs.some((e) => e.law === 'F39'), `${because} — but validate() raised no F39 error (${errs.map((e) => e.law).join(', ') || 'no errors at all'})`);
                must(errs.filter((e) => e.law === 'F39').every((e) => !!e.fix && e.fix.length > 10), `${because} — refused without saying what to do instead`);
            }
            // (b) At run time, on the owner's DECLARED switch (U7 delta review,
            // 1). The write outlet is gated, so `settings.review` is declared
            // for it; the kit sets it `on` through `world.overrides` and
            // supplies a reviewer that approves and records who asked.
            //
            // Positive control first: the reviewer was asked for the OWNER at
            // `on` — the owner received its own switch. (Its hook never sees
            // the switch; that is the law. The gate is where the owner reads
            // it, so the gate is where the kit looks.) A host that ignores
            // overrides fails here, and never gets to pass on a leak it could
            // not have made.
            //
            // Then nobody else: no other hook's ctx carries the owner's switch
            // at its planted value, and no other hook's input does — the ctx
            // being the surface a host hands out, the input the data the
            // executor resolved; a data edge drawn from the address (the
            // refused documents, run UNVALIDATED as an import that skipped the
            // check would be) must deliver nothing. A sentinel planted beside
            // the switch on the same slot is the second signal: a host that
            // hands the whole settings object anywhere leaks it too. The
            // sentinel and the switch are THE check (U7 review, S4): a ctx key
            // that merely sounds like an accessor (`settingsOf`,
            // `configuredSampling`) is a hint in the failure text, never a
            // finding. A host that cannot run an unvalidated document is
            // skipped on that half, with the reason on the result (W1).
            const sentinel = 'F39-must-not-travel';
            const accessor = /setting|config/i;
            const probed = [
                { doc: fx.chatTurn(), unvalidated: false },
                ...entries.map((e) => ({ doc: e.doc, unvalidated: true })),
            ];
            for (const { doc, unvalidated } of probed) {
                const preface = unvalidated ? `${UNVALIDATED}: ` : '';
                const writer = doc.nodes.find((n) => n.kind === 'outlet');
                must(!!writer, `'${doc.id}' has no outlet to plant a setting on`);
                const owner = writer.key;
                const world = {
                    ...(fx.world ?? {
                        overrides: [],
                        samplingConfigs: [],
                        connections: [],
                        activeConnection: {},
                    }),
                    overrides: [
                        ...(fx.world?.overrides ?? []),
                        { scopeKind: 'config', nodeKey: owner, slot: 'settings', path: 'review', value: 'on' },
                        { scopeKind: 'config', nodeKey: owner, slot: 'settings', path: 'probe', value: sentinel },
                    ],
                };
                const asked = [];
                const reviewer = async (req) => {
                    asked.push({ nodeKey: req.nodeKey, position: req.position });
                    return { action: 'approve', by: 'conformance', at: 0 };
                };
                const seen = [];
                let r;
                try {
                    r = await host.run(doc, {
                        input: {},
                        world,
                        bindings: spyBindings(fx.bindings(), seen),
                        reviewer,
                    });
                }
                catch (e) {
                    if (unvalidated && refusedUnder(e, ['F39', 'F7'])) {
                        report.skip(`C18(b) on '${doc.id}': this host refused to run it (${headline(e)}). ${UNVALIDATED}.`);
                        continue;
                    }
                    throw e;
                }
                must(r.outcome === 'ok', `${preface}the probed run of '${doc.id}' ended '${r.outcome}': ${r.haltReason ?? ''}`);
                must(seen.length > 0, `${preface}no hook was invoked in '${doc.id}' — nothing to inspect`);
                must(asked.some((q) => q.nodeKey === owner && q.position === 'on'), `${preface}the owner never received its own switch: 'review' was set to 'on' at ` +
                    `'${owner}.settings' through world.overrides, and the reviewer was never asked for ` +
                    `'${owner}' in '${doc.id}' (asked for: ${asked.map((q) => `${q.nodeKey}@${q.position}`).join(', ') || 'nobody'}) ` +
                    `— a setting is read at its owner, and this one was not read at all`);
                const ownerHook = `${writer.definitionId}@${writer.definitionVersion}`;
                const hint = () => {
                    const keys = [
                        ...new Set(seen.flatMap((s) => Object.keys((s.ctx ?? {})).filter((k) => accessor.test(k)))),
                    ];
                    return keys.length
                        ? ` (ctx keys shaped like an accessor, worth a look: ${keys.join(', ')} — a name is a hint, never the finding)`
                        : '';
                };
                for (const { id, input, ctx } of seen) {
                    must(!carries(input, sentinel), `${preface}a setting planted at '${owner}.settings' arrived in the input of ${id} in '${doc.id}' — settings travelled as data${hint()}`);
                    // Its own switches are read AT the owner; the law is about
                    // another node's. Every other hook must be handed nothing
                    // planted there — not the switch, not the sentinel.
                    if (id === ownerHook)
                        continue;
                    must(!carriesSwitch(input, 'review', 'on', true), `${preface}the owner's declared switch ('${owner}.settings.review' = 'on') arrived in the input of ${id} in '${doc.id}' — a data edge from a settings address must deliver nothing${hint()}`);
                    must(!carriesSwitch(ctx, 'review', 'on'), `${preface}the owner's declared switch ('${owner}.settings.review' = 'on') is readable from the ctx handed to ${id} in '${doc.id}' — a node can read another's switches${hint()}`);
                    must(!carries(ctx, sentinel), `${preface}a setting planted at '${owner}.settings' is readable from the ctx handed to ${id} in '${doc.id}' — a node can read another's switches${hint()}`);
                }
            }
        },
    },
    {
        id: 'C19',
        law: 'F40',
        title: 'every enabled action is reachable: listed once in its venue, and by `/` in the composer',
        consequence: 'An installed action is invisible with no way to reach it — a plugin\'s one button is hidden by prominence, or dropped from the channel it was declared for — and its author gets "it does nothing" instead of a bug.',
        async check(host, fx) {
            // The law is about what the HOST lists. A listing the kit computed
            // for it would pass any host, so the host's own projection is the
            // one judged, and a host without one is not judged at all (U7
            // review, C1).
            must(typeof host.listActions === 'function', 'this host supplies no `listActions` seam — C19 cannot be judged: the law is about what the host ' +
                'lists, and a listing the kit computed on its behalf would pass any host. Implement ' +
                'HostUnderTest.listActions(doc, channel) with the host\'s own venue projection');
            const doc = fx.actions();
            const errs = host.validate(doc).filter((e) => e.severity === 'error');
            must(errs.length === 0, `the actions fixture does not validate: ${errs.map((e) => e.message).join('; ')}`);
            const declared = actionsOf(doc);
            must(declared.length >= 4, `the fixture declares ${declared.length} action(s); the law needs a quick one, a plain one, one on a named channel and one whose key is a core verb's`);
            must(declared.some((a) => a.quick === true) && declared.some((a) => a.quick !== true), 'the fixture needs one quick action and one that is not');
            must(declared.some((a) => a.venue.some((v) => !!v.channel)), 'the fixture needs an action on a named channel');
            // The host's listing, read once per channel.
            const listings = new Map();
            const listed = async (channel) => {
                let l = listings.get(channel);
                if (!l) {
                    l = await host.listActions(doc, channel);
                    must(!!l && typeof l === 'object', `listActions('${channel}') returned ${String(l)} — a listing per venue kind`);
                    listings.set(channel, l);
                }
                return l;
            };
            // By identity — key and spec — never by object: a host decorates its entries.
            const same = (a) => (x) => x.key === a.key && x.specId === a.specId;
            const entriesOf = (l, kind) => [
                ...(l[kind]?.primary ?? []),
                ...(l[kind]?.overflow ?? []),
            ];
            const mainSlug = parseChannel(DEFAULT_CHANNEL).slug;
            for (const a of declared)
                for (const v of a.venue) {
                    if (v.kind === 'form')
                        continue; // a form venue is listed by no listing; the block reaches it
                    const kind = v.kind;
                    const channel = v.channel ?? DEFAULT_CHANNEL;
                    const listing = (await listed(channel))[kind];
                    must(!!listing, `the host's listing for '${channel}' has no '${kind}' venue — every listed venue kind is a bucket, empty or not`);
                    const inPrimary = listing.primary.filter(same(a)).length;
                    const inOverflow = listing.overflow.filter(same(a)).length;
                    must(inPrimary + inOverflow === 1, `'${a.key}' appears ${inPrimary + inOverflow} time(s) in the '${kind}' venue on '${channel}' — every enabled action is listed exactly once, in the primary set or the overflow`);
                    must((a.quick === true) === (inPrimary === 1), `'${a.key}' declares quick: ${a.quick === true} but the host listed it in ${inPrimary ? 'the primary set' : 'the overflow'} of '${kind}' on '${channel}'`);
                    // Declared for one channel: absent from another. Judged
                    // against `main` only when the declared slug is not main's
                    // (U7 review, W4).
                    if (v.channel !== undefined && parseChannel(v.channel).slug !== mainSlug) {
                        const elsewhere = entriesOf(await listed(DEFAULT_CHANNEL), kind);
                        must(!elsewhere.some(same(a)), `'${a.key}' is declared for channel '${v.channel}' but the host listed it in '${kind}' on '${DEFAULT_CHANNEL}'`);
                    }
                }
            // By `/`: the slash name the HOST lists a composer action under —
            // in the grammar its spec may claim, and the declared name when
            // there is one, the derived name otherwise.
            for (const a of declared) {
                const composer = a.venue.find((v) => v.kind === 'composer');
                if (!composer)
                    continue;
                const channel = composer.channel ?? DEFAULT_CHANNEL;
                const entry = entriesOf(await listed(channel), 'composer').find(same(a));
                must(!!entry, `composer action '${a.key}' is not in the host's composer listing on '${channel}'`);
                must(typeof entry.slash === 'string' && entry.slash.length > 0, `the host lists composer action '${a.key}' with no slash name — it is unreachable by /`);
                const slash = entry.slash;
                const grammar = slashFindings(slash, a.specId);
                must(grammar.length === 0, `the host lists composer action '${a.key}' under '/${slash}', which its spec may not claim: ${grammar.join('; ')}`);
                const expected = slashNameOf(a, a.specId);
                must(slash === expected, a.slash
                    ? `composer action '${a.key}' declares the slash name '/${a.slash}' but the host lists it under '/${slash}'`
                    : `composer action '${a.key}' declares no slash name, so it is called by the derived one '/${expected}' — the host lists it under '/${slash}'`);
            }
        },
    },
    {
        id: 'C20',
        law: 'F41',
        title: 'the effects line: an out-of-fiction effect is owner-only and never where a character could be asked',
        consequence: 'A character grants another character permission by construction: a `world` action — cards, lore, settings, connections — sits in a form or a widget where an AI-portrayed participant or a plugin can press it, or lists a participant among those who may act.',
        check(host, fx) {
            // The two the validator sees statically: a `world` action in a venue
            // off the owner's side (`form`, `extra`, `widget` — a message's own
            // ⋮ is the owner's since lair re-plan R11), and one whose `act`
            // audience names a participant — each
            // labelled with the line's own law, F41, so the kit keys on the
            // label and never on a word (U7 review, W3). The third half of the
            // line — a message block naming a `world` action — is judged at
            // the write (`worldBlockFunctions`), not by `validate()`: a spec's
            // `blocks` are almost always a data edge from the node that made
            // them, and a literal is not inspected at publish today. Not
            // checked here for that reason — C23 holds it, at the write, and
            // holds the `form` venue's half at publish beside it.
            const entries = fx.invalid().filter((e) => e.law === 'F41');
            must(entries.length >= 2, `the fixtures carry ${entries.length} F41 document(s); the line has a venue half and an audience half`);
            for (const { doc, because } of entries) {
                const errs = host.validate(doc).filter((e) => e.severity === 'error');
                must(errs.some((e) => e.law === 'F41'), `${because} — but validate() raised no F41 error (${errs.map((e) => e.law).join(', ') || 'no errors at all'})`);
                must(errs.filter((e) => e.law === 'F41').every((e) => !!e.fix && e.fix.length > 10), `${because} — refused without a usable fix; the line is a prohibition, and a prohibition states its alternative (15 §1.3)`);
            }
        },
    },
    {
        id: 'C21',
        law: 'F7, 01 §4',
        title: 'one live row per run, never inside a repeat, and no second message on its channel',
        consequence: 'One turn leaves two reply rows behind — or N of them, one per repeat — and the session has no single row to stream into, stop or finalise; or a second message races the reply for its channel. Writes beside the reply (lore, the annex, another channel) are fine: the live row is what must be one.',
        check(host, fx, report) {
            // (a) Two live-row outlets in one document (R44, W1: other writes
            // are unlimited — the live row is what must be one). C16 reads the
            // same refusal.
            const errs = host.validate(fx.twoWrites()).filter((e) => e.severity === 'error');
            const f7 = errs.filter((e) => e.law === 'F7');
            must(f7.length > 0, `twoWrites() places two live-row outlets — but validate() raised no F7 error ` +
                `(${errs.map((e) => e.law).join(', ') || 'no errors at all'}); a run with two live rows has ` +
                `no single row to stream into, stop or finalise`);
            must(f7.every((e) => !!e.fix && e.fix.length > 10), 'two live rows were refused without saying what to do instead — update the first through its ' +
                'target, or write the second thing beside it (15 §1.3)');
            // (b) The same law one level in: a live row inside a repeating
            // clause is one reply row per pass. Other writes may repeat.
            const doc = fx.writeInClause?.();
            if (!doc)
                return report.skip('no fixture places a live row inside a repeat — supply `writeInClause()` (an `each` or ' +
                    'loop body with a live-row outlet in it) for the 01 §4 half to be judged');
            const inner = host.validate(doc).filter((e) => e.severity === 'error');
            must(inner.some((e) => e.law === '01 §4'), `writeInClause() puts a live row inside a repeat — but validate() raised no '01 §4' error ` +
                `(${inner.map((e) => e.law).join(', ') || 'no errors at all'})`);
            must(inner.filter((e) => e.law === '01 §4').every((e) => !!e.fix && e.fix.length > 10), 'a live row inside a repeat was refused without naming the spine as where it goes instead (15 §1.3)');
        },
    },
    {
        id: 'C22',
        law: 'F8, F32',
        title: 'no pipeline triggers another: no trigger outlet, no trigger on a hook surface, no node emits; a custom event is recorded by a write',
        consequence: 'Pipelines start each other. A run nobody asked for calls a model, writes a row and appears on no receipt as anything’s consequence, and a loop between two specs has no budget and no place to break it. The one readable path — a write, the event that write causes, the pipeline a preset bound to that event — stops being the whole story. A package’s own event is on that path too: `record-event` is a write, and the event it causes is the one its config names.',
        check(host, fx, report) {
            // (a) Nothing published is a trigger. The registry is the evidence
            // and it is the host's: whatever it registered is in here. Read by
            // name, and deliberately narrower than the SDK suite's own scan
            // (`authorLaws.test.ts`), because a third-party host's registry is
            // full of names that suite never sees — an outlet that invokes a
            // webhook is not a node that starts a pipeline.
            const startsARun = /^(trigger|dispatch|invoke)(@|$)|^(trigger|dispatch|invoke|start|run)-(spec|pipeline|run|turn)(@|$)/i;
            const triggers = allDefinitions().filter((d) => d.kind === 'outlet' && startsARun.test(d.id.split('/')[1] ?? ''));
            must(triggers.length === 0, `the registry publishes ${triggers.map((d) => d.id).join(', ')} as an outlet — a node that starts ` +
                `another pipeline is a run with no cause on any receipt; a pipeline begins at the event a write ` +
                `caused and a preset that bound it`);
            // (b) Nor may a hook surface hand one out (F32) — `trigger`, and
            // the peer invocation beside it: `run` and `call`.
            for (const member of ['trigger', 'run', 'call']) {
                const found = assertHookSurface('event', { log: () => { }, [member]: () => { } });
                must(found.ok === false && found.found.includes(member), `a hook surface carrying '${member}' was accepted — a hook that can start work opts out of the ` +
                    `receipt, the budget and the consent screen (F32)`);
            }
            must(assertHookSurface('event', { log: () => { } }).ok, 'a hook surface with nothing forbidden on it was refused — the line is the named members, not the shape');
            // (d) A package's own event is caused the same way (E1): by the one
            // write `record-event`, whose event is named by its config
            // (`causesEventFrom`), never by a node declaring what it emits.
            const recorders = allDefinitions().filter((d) => typeof d.causesEventFrom === 'string');
            for (const d of recorders) {
                const effects = d.effects;
                must(d.kind === 'outlet' && effects === 'write', `${d.id} names the event it causes from its config, but is a ${d.kind} with ` +
                    `${String(effects ?? 'no')} effects — only a write outlet may cause an event`);
            }
            // (c) And a node cannot emit its way there: F8, at publish. A node
            // declaring `emits` names the event another pipeline listens for,
            // which is a trigger spelled sideways.
            const emits = fx.invalid().filter((e) => e.law === 'F8');
            if (!emits.length)
                return report.skip("no fixture declares `emits` on a node — supply one under law 'F8' for the third half to be judged");
            for (const { doc, because } of emits) {
                const errs = host.validate(doc).filter((e) => e.severity === 'error');
                must(errs.some((e) => e.law === 'F8'), `${because} — but validate() raised no F8 error ` +
                    `(${errs.map((e) => e.law).join(', ') || 'no errors at all'})`);
                must(errs.filter((e) => e.law === 'F8').every((e) => !!e.fix && e.fix.length > 10), `${because} — refused without naming the one path: a write causes the event its outlet ` +
                    `declares, and a preset binds a pipeline to that event (15 §1.3)`);
            }
        },
    },
    {
        id: 'C23',
        law: 'F41',
        title: 'A `world` action may appear only in the `composer`, `session-settings`, `admin` or `review` venue, its `act` audience is `owner` and/or `admin` only, and no message block may name it — unless that block is addressed to `owner`, who is that action’s whole audience. The `form` venue stays fiction-only: a venue is declared and an addressee is decided at run time, so the construction-time check cannot see one.',
        consequence: 'A block a node wrote puts an out-of-fiction button in front of whoever is reading — "shall I add them to your contacts?" — and a character, or a participant answering a form, presses it. Permission stops being the owner’s to give, and the audit trail says a message did it. Held too widely it breaks the other way: a host that refuses an owner-addressed block refuses the owner their own action, and a genre whose world-building is a question put to the owner cannot ask it at all.',
        check(host, fx, report) {
            // (a) At publish, where a venue makes it visible. `form` is the one
            // venue a block reaches — it is listed nowhere else
            // (`LISTED_VENUE_KINDS` leaves it out) — so an action declaring
            // `effects: 'world'` there is a block-carried world action the
            // document itself admits to, and `validate()` refuses it under F41.
            const formWorld = fx
                .invalid()
                .filter((e) => e.law === 'F41' &&
                actionsOf(e.doc).some((a) => effectsOf(a) === 'world' && a.venue.some((v) => v.kind === 'form')));
            if (!formWorld.length)
                report.skip("no fixture declares a 'world' action in the 'form' venue — supply one under law 'F41' for the " +
                    'publish-time half to be judged');
            for (const { doc, because } of formWorld) {
                const errs = host.validate(doc).filter((e) => e.severity === 'error');
                must(errs.some((e) => e.law === 'F41'), `${because} — but validate() raised no F41 error ` +
                    `(${errs.map((e) => e.law).join(', ') || 'no errors at all'}); the form venue is a block, ` +
                    `and a block is the one place a character can be handed a button`);
                must(errs.filter((e) => e.law === 'F41').every((e) => !!e.fix && e.fix.length > 10), `${because} — refused without a usable fix; a prohibition states its alternative (15 §1.3)`);
            }
            // (b) At the write, where the rest of it lives — and it is a
            // runtime law rather than a publish-time one for a reason worth
            // saying out loud: **no document carries a block tree.** A spec's
            // blocks are a node's output, so "this block names a world action"
            // can only be asked of the blocks a run produced, against the
            // document that contributed the action. `worldBlockFunctions` is
            // that question; the host runs it at the write and refuses when it
            // answers with anything.
            const doc = fx.worldAction?.();
            if (!doc)
                return report.skip('no fixture contributes a `world` action — supply `worldAction()` (a document with one in the ' +
                    'composer, session-settings, admin or review venue) for the block half to be judged');
            const world = actionsOf(doc).filter((a) => effectsOf(a) === 'world');
            must(world.length > 0, `worldAction() contributes no action with \`effects: 'world'\` — the block half has nothing to name`);
            const choices = (fn) => [
                {
                    kind: 'choices',
                    question: 'Give them the keys?',
                    actions: [{ fn, label: 'Yes', choice: 'yes' }],
                },
            ];
            const fn = world[0].key;
            must(worldBlockFunctions(choices(fn), doc).includes(fn), `a choices block naming '${fn}' — a 'world' action of ${doc.id} — was not refused at the write; ` +
                `the effects line holds at the block or it does not hold`);
            // The negative control, because a gate that refused every block
            // would pass the line above and break every message with a choice
            // in it: a function no action declares is not a world action.
            must(worldBlockFunctions(choices('conformance:no-such-function'), doc).length === 0, 'a block naming a function no action declares was refused as a world action — the gate reads the ' +
                "document's declarations, never the block alone");
            // (c) The one exception, both ways round (L1, ruled 2026-09-17).
            // The line exists so that an out-of-fiction effect is never *a
            // question a character could be asked*, and a block put to the
            // OWNER is not that question: the owner is already the whole of
            // such an action's `act` audience, so pressing the button is the
            // owner acting. Two controls, because an exception needs both —
            // a gate that kept refusing would leave the genres that build
            // their world through an owner-addressed form with no way to ask,
            // and a gate that stopped refusing would hand the button to the
            // room.
            const addressed = (to) => choices(fn).map((b) => ({ ...b, addressee: to }));
            must(worldBlockFunctions(addressed('owner'), doc).length === 0, `a choices block addressed to 'owner' naming '${fn}' — a 'world' action of ${doc.id} — was refused at ` +
                'the write; the owner is that action’s whole audience, and the one addressee the line has always ' +
                'allowed to press it');
            must(worldBlockFunctions(addressed('participant'), doc).includes(fn), `a choices block addressed to 'participant' naming '${fn}' was not refused; the exception is the owner ` +
                'and nobody else — `participant` is any member of the session, which is precisely the reader a ' +
                'world button must never reach');
        },
    },
    {
        id: 'C24',
        law: 'R-15',
        title: 'every genre can be addressed by a form, and every shipped preset binds the pipeline that answers one',
        consequence: 'A pipeline writes a form into the session and nothing answers it: the block renders, the reader fills it in, the press reaches no run, and no error says why. The feature works in the genre it was built in and is dead in every other.',
        async check(host, fx, report) {
            const shipped = await host.shipped?.();
            if (!shipped)
                return report.skip('the host declares no catalogue — supply `shipped()` (its genres and presets) for the form ' +
                    'surface to be judged; a host that ships neither has no form to leave unanswered');
            must(shipped.genres.length > 0, 'the host shipped an empty catalogue — a host with no genres of its own omits `shipped()`; an ' +
                'empty one is a seam that judges nothing while looking like it did');
            const EVENT = sessionEvents.formAddressed;
            for (const g of shipped.genres) {
                const decl = g.events?.[EVENT];
                must(!!decl, `genre '${g.id}' does not declare ${EVENT} — a genre that cannot be addressed by a form has ` +
                    `nowhere to route an answer, so a pipeline that writes one into it has written a dead control`);
                must(decl.required !== true, `genre '${g.id}' makes ${EVENT} required — the slot is offered, never demanded: a genre whose ` +
                    `forms are all owner-addressed still declares it, and a preset that binds nothing is still a preset`);
            }
            for (const p of shipped.presets) {
                const bound = p.bindings?.[EVENT];
                must(!!bound?.spec, `preset '${p.slug}' binds no pipeline to ${EVENT} — a shipped preset answers the forms its ` +
                    `genre can be addressed by, or the answer button does nothing in every session started from it`);
            }
        },
    },
    {
        id: 'C25',
        law: 'plans/29 R-3, F11, F32',
        title: 'the plugin grant table: what a hook of each kind is handed, and what no hook is ever handed',
        consequence: 'A plugin reaches through a door nobody granted: a task that was meant to be pure keeps state, a handler calls a model outside the receipt and the budget, or an outlet commits a row the consent screen never mentioned. The permissions an administrator reads stop describing what the package can do.',
        async check(host, fx, report) {
            // (a) The table, stated as the law rather than read as a setting.
            // `hookCtxGrants` is its one implementation — the two sandboxes'
            // programs and the app's `hookCtx.ts` build from it — so pinning it
            // here is what makes a loosened grant a red line instead of a quiet
            // change: a task that gains storage stops being pure (F11), and a
            // query that gains fetch is network access with no consent surface
            // (F32).
            const table = [
                ['task', false, false],
                ['chain-link', false, false],
                ['query', true, false],
                ['outlet', true, false],
                ['event', true, false],
                ['lifecycle', true, false],
                ['oracle', true, true],
            ];
            must(table.length === HOOK_CTX_KINDS.length, `the SDK declares ${HOOK_CTX_KINDS.length} hook ctx kinds (${HOOK_CTX_KINDS.join(', ')}) and this ` +
                `requirement states the grants for ${table.length} — a kind this requirement does not state is a ` +
                `grant nobody decided`);
            for (const [kind, storage, fetch] of table) {
                const g = hookCtxGrants(kind);
                must(g.storage === storage && g.fetch === fetch, `the grant table hands a '${kind}' hook ${JSON.stringify(g)}; the law is ` +
                    `{ storage: ${storage}, fetch: ${fetch} }`);
            }
            must(hookCtxKeysFor('task').join(' ') === 'random now log signal', `a plugin task's context is random, now, log and signal — this build hands it ` +
                `[${hookCtxKeysFor('task').join(', ')}]`);
            // (b) What this host actually endows, kind by kind.
            if (!host.hookCtxKeys)
                return report.skip('the host has no plugin surface to hand a hook — supply `hookCtxKeys(kind)` (the keys a ' +
                    'dispatched handler of that kind finds on its ctx) for the endowment to be judged; until then ' +
                    'the table above is checked and the sandbox is proved by the host’s own tests');
            const why = {
                read: 'core rows — a plugin reads what its own queries and the pipeline hand it, never the database',
                call: 'a model outside the receipt, the budget and the review gate (F32)',
                commit: 'a write. This is also why a plugin write-class outlet is not available at all: it emits the ' +
                    'event it declares and core’s own outlet does the writing (the packager refuses the ' +
                    'declaration up front, `E_PLUGIN_WRITE_OUTLET`)',
            };
            const unjudged = [];
            for (const kind of HOOK_CTX_KINDS) {
                const keys = await host.hookCtxKeys(kind);
                if (!keys) {
                    unjudged.push(kind);
                    continue;
                }
                for (const forbidden of ['read', 'call', 'commit'])
                    must(!keys.includes(forbidden), `a plugin ${kind} hook is handed '${forbidden}' — ${why[forbidden]}`);
                must(keys.join(' ') === hookCtxKeysFor(kind).join(' '), `a plugin ${kind} hook is handed [${keys.join(', ')}]; the grant table says ` +
                    `[${hookCtxKeysFor(kind).join(', ')}]`);
            }
            if (unjudged.length)
                report.skip(`the host dispatches no plugin hook of kind ${unjudged.join(', ')}, so those rows of the table ` +
                    `were not judged against anything it builds`);
        },
    },
    {
        id: 'C26',
        law: '20 §12, F32',
        title: 'a frame has no ambient authority: opaque origin, its own scripts, no forms, no external resources',
        consequence: 'A package’s UI reads the session’s cookies, calls the app’s API as the signed-in user, or posts a form to an origin nobody granted. The boundary that makes third-party UI safe to install stops existing, and installing a package becomes a trust decision the user has no way to reason about.',
        async check(host, fx, report) {
            const mount = await host.frameMount?.();
            if (!mount)
                return report.skip('the host mounts no frames — supply `frameMount()` (the iframe’s sandbox attribute and the ' +
                    'CSP the document is served under) for the boundary to be judged');
            // The sandbox. `allow-scripts` and nothing else: without
            // `allow-same-origin` the document is on an opaque origin, which is
            // what makes its storage, its cookies and its DOM reach its own and
            // nobody else's; without `allow-forms` a `<form>` submit does not
            // leave the frame.
            const tokens = mount.sandbox.split(/\s+/).filter(Boolean);
            must(tokens.includes('allow-scripts'), `the frame is mounted with sandbox="${mount.sandbox}" — a frame is a document that runs, and ` +
                `without allow-scripts the surface is a still image`);
            const extra = tokens.filter((t) => t !== 'allow-scripts');
            must(extra.length === 0, `the frame is mounted with ${extra.join(', ')} beside allow-scripts` +
                (extra.includes('allow-same-origin')
                    ? ' — allow-same-origin gives the document the host’s origin: its cookies, its storage and its API as the signed-in user'
                    : extra.includes('allow-forms')
                        ? ' — allow-forms lets a submit leave the frame, which is a write the port never saw'
                        : ' — the mount is allow-scripts and nothing else, because every token is authority the port already carries safely'));
            // The CSP, which is the other half: the sandbox says what the
            // browser grants the document, this says where its code and its
            // resources may come from.
            const directives = new Map(mount.csp
                .split(';')
                .map((d) => d.trim())
                .filter(Boolean)
                .map((d) => {
                const [name, ...sources] = d.split(/\s+/);
                return [name.toLowerCase(), sources];
            }));
            const shown = (name) => `${name} ${(directives.get(name) ?? []).join(' ')}`.trim();
            must(directives.has('default-src'), `the frame is served under \`${mount.csp}\` — with no default-src there is no floor, and every ` +
                `resource kind nobody thought to name is open`);
            must(directives.get('script-src')?.join(' ') === "'self'", `the frame is served under \`${shown('script-src')}\` — 'self' and nothing else: an inline ` +
                `<script> is the first thing a frame document reaches for (it is refused silently), and a script ` +
                `from anywhere else is code the package did not ship`);
            must(directives.get('form-action')?.join(' ') === "'none'", `the frame is served under \`${shown('form-action')}\` — a frame fires actions through the port it ` +
                `was handed; a form that can submit is a second door`);
            // A source a frame may name: a keyword, or one of the schemes that
            // resolve inside the document. Anything else is somewhere else —
            // an origin, a bare host, a wildcard.
            const local = (src) => /^('.*'|data:|blob:|mediastream:|filesystem:)$/.test(src);
            for (const [name, sources] of directives) {
                // `connect-src` is the one directive that names other origins,
                // and only the hosts the package declared and an administrator
                // left granted — the same grant `ctx.fetch` is metered by. The
                // reporting directives take a URL by definition.
                if (name === 'connect-src' || name === 'report-uri' || name === 'report-to')
                    continue;
                const off = sources.filter((src) => !local(src));
                must(off.length === 0, `\`${name}\` names ${off.join(', ')} — a frame's resources come from the package's own files, ` +
                    `or a surface becomes a beacon to whoever it fetches from`);
                must(!sources.includes("'unsafe-eval'"), `\`${name}\` allows 'unsafe-eval' — the boundary is what the document may run, and eval is ` +
                    `every string it can reach`);
                must(name === 'style-src' || !sources.includes("'unsafe-inline'"), `\`${name}\` allows 'unsafe-inline' — an inline <style> is the frame's own business, an ` +
                    `inline anything else is the rule the boundary is made of`);
            }
            // What the host will listen to from inside the frame. A frame
            // proposes and the host decides: it may name an action the session
            // already lists, and it writes nothing itself.
            if (!mount.accepts)
                report.skip('the host does not say which frame → host messages it answers (`FrameMount.accepts`), so ' +
                    '"a frame fires actions and writes nothing" was judged only at the mount');
            else {
                must(mount.accepts.some((t) => t === 'invoke' || t === 'action'), `the host answers [${mount.accepts.join(', ')}] from a frame — a frame that cannot name an ` +
                    `action can do nothing at all, and its surface is a picture of one`);
                const writes = mount.accepts.filter((t) => /^(commit|write|create-message|update-message|delete-message|save)$/.test(t));
                must(writes.length === 0, `the host answers ${writes.join(', ')} from a frame — a frame proposes and the host decides; ` +
                    `the write belongs to the run the fired action starts`);
            }
            // The clause said rather than skipped in silence: core seats every
            // enabled package's `surfaces.panels` widgets under a namespaced id
            // and posts `{ t: 'settings' }` to them, same as any other widget.
            // That is host behaviour, though, and this kit judges a package,
            // not a host — so the clause records the rule instead of judging it.
            report.skip('a frame surface’s declared settings are delivered by host behaviour: Serene Pub seats every ' +
                'enabled package’s `surfaces.panels` widgets under a namespaced id and posts `{ t: "settings" }` ' +
                'to them like any other widget, as of 2026-09-17 — but this kit judges a package, not a host, ' +
                'so there is nothing here for it to judge.');
        },
    },
    {
        id: 'C27',
        law: '01 §13',
        title: 'every verdict is heard at every door it declares',
        consequence: 'A person meets a different refusal depending on which door they came through — the fire says one thing, the write another, the client a third — and a rule fixed at one door stays broken at the rest. A door that re-derives a rule instead of quoting the verdict is where the next drift starts.',
        async check(host, fx, report) {
            // The law is about the host's DOORS, so the host's own doors are
            // what is judged: each entry drives the real door with the verdict's
            // failing input and answers what that door refused with. The kit
            // asking the verdict on the host's behalf would pass any host — the
            // verdict is the one function, and it agrees with itself.
            const registered = verdicts();
            must(registered.length > 0, 'no verdict is registered — nothing for a door to hear');
            if (!host.doors)
                return report.skip('the host supplies no `doors` seam — supply one entry per door it has (construction, ' +
                    'validate, publish, registry, run, fire, write, list), each driving that real door ' +
                    'with the verdict’s failing input, for the law to be judged');
            for (const v of registered) {
                // The verdict's own coherence first: a failing input that does not
                // fail would make every door below pass by refusing nothing.
                for (const door of v.doors) {
                    const input = v.failing(door);
                    const expected = v.judge(input);
                    must(!expected.ok, `${v.id}: judge(failing('${door}')) answered ok — the input the kit feeds through the ` +
                        `'${door}' door does not fail the verdict, so the door cannot be judged on it`);
                    if (expected.ok)
                        continue;
                    const sentence = i18nText(expected.sentence, 'en');
                    must(typeof sentence === 'string' && sentence.length > 0, `${v.id}: the sentence for '${door}' has no en text — a sentence is display text (R-20)`);
                    const at = host.doors[door];
                    if (!at) {
                        report.skip(`${v.id} declares the '${door}' door and this host has none — not judged there`);
                        continue;
                    }
                    const heard = await at(v.id, input);
                    if (heard === undefined) {
                        report.skip(`${v.id} at '${door}': this host's door does not hear it — not judged there`);
                        continue;
                    }
                    must(heard !== null, `${v.id} at '${door}': the door did not refuse the verdict's failing input — the rule ` +
                        `is not heard there (${v.law})`);
                    must(typeof heard === 'string', `${v.id} at '${door}': the door answered with a ${typeof heard}, not the string a ` +
                        `refusal's sentence is`);
                    // Contained, not equal: a door may frame the sentence — a node key
                    // before it, several findings under one heading, the fix after it
                    // — but never reword it. A paraphrase fails here because its words
                    // are not the verdict's.
                    must(heard.includes(sentence), `${v.id} at '${door}': the door refused with other words than the verdict's — it ` +
                        `re-derives the rule (${v.law}). Expected to hear: ${sentence} — heard: ${heard}`);
                }
            }
        },
    },
    {
        id: 'C28',
        law: 'PLAN-turn-order §B3, R33',
        title: 'every event a genre lists is caused by a write or is a declared root',
        consequence: 'A preset binds a pipeline to an event nothing ever fires: the slot looks filled, the pipeline is published, and it never runs. Nobody is told, because nothing failed.',
        async check(host, fx, report) {
            const shipped = await host.shipped?.();
            if (!shipped)
                return report.skip('the host declares no catalogue — supply `shipped()` (its genres and presets) for the genres’ ' +
                    'event surfaces to be judged');
            for (const g of shipped.genres)
                for (const f of uncausedGenreEvents(g))
                    must(false, `${f.sentence}. Declare the write that causes it (causedBy), or drop it from the genre`);
        },
    },
    {
        id: 'C29',
        law: 'PLAN-turn-order §B3, §3.2',
        title: 'every loop in a genre’s event map passes through something with a termination policy',
        consequence: 'One event starts a loop — a reply completes, the completion recomputes the turn order, the turn order asks for the next reply — and nothing in it says when to stop. Runs pile up, a model is called without end, and the session never goes quiet.',
        async check(host, fx, report) {
            const shipped = await host.shipped?.();
            if (!host.eventMap || !shipped)
                return report.skip('the host supplies no `eventMap(genre)` seam or no `shipped()` catalogue — supply both (the map ' +
                    'it draws for each shipped genre, with each node’s termination policy) for loops to be judged');
            for (const g of shipped.genres) {
                const map = await host.eventMap(g.id);
                for (const f of unterminatedCycles(map, (id) => Object.hasOwn(map.terminations, id) ? map.terminations[id] : undefined))
                    must(false, `genre '${g.id}': ${f.sentence}. Give a listener in the loop a cause rule and a cap, or dispatch ` +
                        `the loop's events through the run caps`);
            }
        },
    },
    {
        id: 'C30',
        law: 'PLAN-sdk-1.0 §3.5, R23',
        title: 'a component is judged, mounted and mirrored the way the page runs it',
        consequence: 'A component that carries the renderer, starts its own worker or imports what the worker cannot resolve reaches a session and fails there; a host whose round trip drops a push or an invoke shows a widget that looks alive and does nothing; a remote that renders or edits differently from the native copy of the same widget is a second widget, and the cutover to it changes what people see.',
        async check(host, _fx, report) {
            const built = (await host.components?.()) ?? null;
            if (!built?.length)
                report.skip('the host lists no built components — supply `components()` for their modules to be judged');
            else
                for (const c of built)
                    for (const advisory of judgeComponentModule(c.id, c.code))
                        report.note(advisory);
            if (!host.mountComponent)
                report.skip('the host mounts no component for the kit — supply `mountComponent(code, sections)` for the round trip');
            else {
                const view = await host.mountComponent(COMPONENT_PROTOCOL_FIXTURE, {});
                try {
                    await componentProtocolCase(view);
                }
                finally {
                    await view.unmount();
                }
            }
            // The parity half judges a messages widget against its remote. A host
            // that lists its components and ships none based on core's messages
            // has no such pair: not applicable, said so, never faked with core's.
            const clones = (built ?? []).filter((c) => c.basedOn === 'messages').map((c) => `'${c.id}'`);
            if (!host.componentParity) {
                if (host.components && !clones.length)
                    report.notApplicable("no component the host lists is based on core's messages widget, so there is no native/remote pair to mirror");
                else if (clones.length)
                    report.skip(`${clones.join(', ')} ${clones.length === 1 ? 'is' : 'are'} based on core's messages widget and the host offers no native/remote pair — supply \`componentParity()\` for it to be judged against its remote`);
                else
                    report.skip('the host offers no native/remote pair — supply `componentParity()` for its messages widget to be judged against its remote');
            }
            else {
                const { native, remote } = await host.componentParity();
                try {
                    await componentParityCase(native, remote);
                }
                finally {
                    await native.unmount();
                    await remote.unmount();
                }
            }
        },
    },
    {
        id: 'C31',
        law: 'PLAN-sdk-1.0 §3.5, 20 §12',
        title: 'every built component mounts in a plugin’s box with nothing refused, no error, and unmounts cleanly',
        consequence: 'A widget installs, is placed on a layout, and shows an empty box: the page dropped what it placed outside the vocabulary, or it raised an error nobody reads — and the person who installed it is the first to find out.',
        async check(host, _fx, report) {
            const built = (await host.components?.()) ?? null;
            if (!built?.length)
                return report.skip('the host lists no built components — supply `components()` for each module to be mounted');
            if (!host.mountComponent)
                return report.skip('the host mounts no component for the kit — supply `mountComponent(code, sections, { grants, reads })` for each module to be mounted');
            const failed = [];
            for (const c of built) {
                try {
                    const view = await host.mountComponent(c.code, c.sections ?? componentParitySections(), {
                        ...(c.grants ? { grants: c.grants } : {}),
                        ...(c.reads ? { reads: c.reads } : {}),
                    });
                    for (const n of await componentMountCase(c.id, view))
                        report.note(n);
                }
                catch (e) {
                    const m = e.message;
                    failed.push(m.startsWith(`component '${c.id}'`) ? m : `component '${c.id}': it did not mount — ${m}`);
                }
            }
            must(!failed.length, failed.join('\n'));
        },
    },
    {
        id: 'C32',
        law: 'R28, R29, R53',
        title: 'every swap a package offers fits the node it stands in for',
        consequence: 'An admin enables the package and its option appears in the genre’s control; a person picks it and the turn order (or whatever the node decides) stops computing — the swap was seated with ports or settings the node never wires, and the run halts on the first recompute.',
        async check(host, _fx, report) {
            if (!host.swaps)
                return report.skip('the host lists no swaps — supply `swaps()` (a manifest’s: `swapsFromManifest`) for them to be fitted');
            if (!host.pinnedDefinition)
                return report.skip('the host supplies no `pinnedDefinition(spec, node)` — the kit cannot know what a swap stands in for without the host’s own spec');
            const swaps = await host.swaps();
            if (!swaps.length)
                return report.skip('the host lists no swaps to fit');
            const failed = [];
            for (const s of swaps) {
                const at = `swap '${s.definitionId}' onto '${s.spec}#${s.node}'`;
                if (!s.definition) {
                    failed.push(`${at}: the package declares no definition '${s.definitionId}' — a package offers only its own (R29)`);
                    continue;
                }
                const pinned = await host.pinnedDefinition(s.spec, s.node);
                if (!pinned) {
                    failed.push(`${at}: this host seats nothing at '${s.node}' of '${s.spec}' — name the node the control swaps (read its strategyNode, never assume a key)`);
                    continue;
                }
                const misfit = swapFitFinding(s.node, pinned, s.definition);
                if (misfit)
                    failed.push(`${at}: ${misfit}`);
            }
            must(!failed.length, failed.join('\n'));
        },
    },
    {
        id: 'C33',
        law: 'F11, 13 §7h (binding probes B1–B5)',
        title: 'every definition a swap seats passes the binding probes',
        consequence: 'A strategy a person picks returns a bare value (recorded as an error), reads the clock or Math.random (a turn order nobody can replay or dispute), hangs (the recompute never finishes and the plugin is marked unhealthy), or ignores the abort an admin sends.',
        async check(host, _fx, report) {
            if (!host.swaps)
                return report.skip('the host lists no swaps — supply `swaps()` for their definitions to be probed');
            if (!host.nodeHandler)
                return report.skip('the host supplies no `nodeHandler(definitionId)` — supply the handler it would call (a bundle export)');
            const seen = new Set();
            const failed = [];
            for (const s of await host.swaps()) {
                if (!s.definition || seen.has(s.definitionId))
                    continue;
                seen.add(s.definitionId);
                const d = s.definition;
                const handler = await host.nodeHandler(d.id);
                if (typeof handler !== 'function') {
                    failed.push(`'${d.id}': the host has no handler for it — the bundle exports none under the name the manifest gives`);
                    continue;
                }
                const given = host.probeInput?.(d);
                const sample = given ? { input: given } : probeSampleFor(d);
                if ('missing' in sample) {
                    report.skip(`'${d.id}' reads shapes the kit has no sample for (${sample.missing.join(', ')}) — supply \`probeInput(d)\``);
                    continue;
                }
                for (const r of await probeBinding(handler, d, probeCtxFor(d.kind, sample.input)))
                    if (!r.pass)
                        failed.push(`'${d.id}' ${r.id} (${r.title}): ${r.error}`);
            }
            must(!failed.length, failed.join('\n'));
        },
    },
];
/**
 * The requirements a package's own declarations can fail, judged over its
 * BUILT artifact with no fixtures: what it ships (C28, C29), its component
 * modules (C30, C31), and its swaps (C32, C33). The rest judge a host's
 * executor, not a package.
 * @experimental — held back from the frozen surface until the host seams (`HostUnderTest`) settle
 */
export const PACKAGE_REQUIREMENTS = ['C28', 'C29', 'C30', 'C31', 'C32', 'C33'];
/**
 * `conform` over `PACKAGE_REQUIREMENTS` (or the subset `only` names) — a
 * plugin's test, carrying its artifact on the SDK's executor and harness.
 * These cases read no fixtures.
 * @experimental — held back from the frozen surface until the host seams (`HostUnderTest`) settle
 */
export function conformPackage(host, only = PACKAGE_REQUIREMENTS) {
    const outside = only.filter((id) => !PACKAGE_REQUIREMENTS.includes(id));
    if (outside.length)
        throw new Error(`${outside.join(', ')} judge a host's executor and need fixtures — run conform(host, fixtures, { only })`);
    return conform(host, {}, { only });
}
/** @experimental */
export async function conform(host, fx, opts = {}) {
    const unknown = (opts.only ?? []).filter((id) => !REQUIREMENTS.some((r) => r.id === id));
    if (unknown.length)
        throw new Error(`the kit has no requirement ${unknown.join(', ')}`);
    const out = [];
    for (const r of REQUIREMENTS) {
        if (opts.only && !opts.only.includes(r.id))
            continue;
        const skipped = [];
        const notes = [];
        const notApplicable = [];
        const report = {
            skip: (why) => {
                skipped.push(why);
            },
            note: (what) => {
                notes.push(what);
            },
            notApplicable: (why) => {
                notApplicable.push(why);
            },
        };
        try {
            await r.check(host, fx, report);
            out.push({
                id: r.id,
                law: r.law,
                title: r.title,
                pass: true,
                ...(skipped.length ? { skipped } : {}),
                ...(notes.length ? { notes } : {}),
                ...(notApplicable.length ? { notApplicable } : {}),
            });
        }
        catch (e) {
            out.push({
                id: r.id,
                law: r.law,
                title: r.title,
                pass: false,
                error: e.message,
                consequence: r.consequence,
                ...(skipped.length ? { skipped } : {}),
                ...(notes.length ? { notes } : {}),
                ...(notApplicable.length ? { notApplicable } : {}),
            });
        }
    }
    return out;
}
/** @experimental — held back from the frozen surface until the host seams (`HostUnderTest`) settle */
export function renderConformance(results) {
    const failed = results.filter((r) => !r.pass);
    const lines = [
        `conformance: ${results.length - failed.length}/${results.length} passing`,
        ...results.flatMap((r) => [
            `  ${r.pass ? '✓' : '✗'} ${r.id.padEnd(4)} [${r.law}] ${r.title}`,
            ...(r.skipped ?? []).map((why) => `         ~ not judged: ${why}`),
            ...(r.notApplicable ?? []).map((why) => `         — not applicable: ${why}`),
            ...(r.notes ?? []).map((what) => `         · note: ${what}`),
        ]),
    ];
    for (const r of failed) {
        lines.push('', `✗ ${r.id} — ${r.error}`, `   what this breaks: ${r.consequence}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=index.js.map