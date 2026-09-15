/**
 * Validation — the Fixed Ledger laws that can be checked statically.
 *
 * Every finding names what to do instead (15 §1.3). A prohibition without a stated
 * alternative is a bug, and there is a test asserting exactly that.
 */
import { getType } from './descriptors.js';
import { assignable, isStreaming } from './shapes.js';
import { capabilityLabel, FEATURES, IO_KINDS, isTransformId, parseTransform, transformId, } from './capabilities.js';
export function validate(doc) {
    const f = [];
    const byKey = new Map(doc.nodes.map((n) => [n.key, n]));
    const desc = (k) => {
        const n = byKey.get(k);
        return n ? getType(`${n.typeId}@${n.typeVersion}`) : undefined;
    };
    // ── 01 §2 — exactly one Input, positionally first ─────────────────────────
    const inputs = doc.nodes.filter((n) => n.kind === 'input');
    if (inputs.length !== 1) {
        f.push({
            law: '01 §2',
            severity: 'error',
            message: `a spec has exactly one Input; found ${inputs.length}`,
            fix: 'declare a single .input() as the first step',
        });
    }
    else if (inputs[0].position !== 0) {
        f.push({
            law: '01 §2',
            severity: 'error',
            nodeKey: inputs[0].key,
            message: 'the Input is not the first node',
            fix: 'move .input() to the top of the chain',
        });
    }
    // ── F7 — one primary write; emits unlimited ───────────────────────────────
    const writes = doc.nodes.filter((n) => n.kind === 'consumer' && desc(n.key)?.effects === 'write');
    if (writes.length > 1) {
        f.push({
            law: 'F7',
            severity: 'error',
            nodeKey: writes[1].key,
            message: `a pipeline has at most one primary write; found ${writes.length} (${writes.map((w) => w.key).join(', ')})`,
            fix: 'keep one write-class .consume(); emit-class consumers are unlimited, or trigger a second pipeline via the event a write causes',
        });
    }
    // ── F25 — no branching. A node may not feed two divergent spine successors ─
    const spine = doc.nodes.filter((n) => !n.blockId).sort((a, b) => a.position - b.position);
    const spineKeys = new Set(spine.map((n) => n.key));
    const outByNode = new Map();
    for (const e of doc.edges) {
        if (!spineKeys.has(e.from) || !spineKeys.has(e.to))
            continue;
        if (!outByNode.has(e.from))
            outByNode.set(e.from, new Set());
        outByNode.get(e.from).add(e.to);
    }
    for (const [from, tos] of outByNode) {
        if (tos.size <= 1)
            continue;
        // fan-in-to-a-common-successor is legal; genuine divergence is not.
        const positions = [...tos].map((k) => byKey.get(k).position).sort((a, b) => a - b);
        const between = spine.filter((n) => n.position > positions[0] && n.position < positions[positions.length - 1]);
        const diverges = between.some((n) => !reaches(doc, n.key, spine[spine.length - 1].key));
        if (diverges) {
            f.push({
                law: 'F25',
                severity: 'error',
                nodeKey: from,
                message: `'${from}' feeds divergent paths (${[...tos].join(', ')})`,
                fix: 'pipelines are linear: use .async() for parallel work, .map() for per-item work, or halt() to stop early',
            });
        }
    }
    // ── Port shape compatibility (01 §3) ──────────────────────────────────────
    for (const e of doc.edges) {
        if (e.implicit)
            continue;
        const up = desc(e.from);
        const down = desc(e.to);
        if (!up || !down)
            continue;
        const outShape = up.ports.out?.[e.fromPort];
        const inShape = down.ports.in?.[e.toPort.split('.')[0]];
        if (!outShape || !inShape)
            continue;
        if (!assignable(outShape, inShape)) {
            // The write-result case gets its own message, because the generic one
            // ("insert a converter") is the wrong advice: there is nothing to convert.
            // Under `async` review the value genuinely may not be a row id yet, and no
            // branch node exists to check `status` with (F25) — so the downstream *type*
            // has to accept both cases (13 §7j-b).
            if (outShape === 'core:shape/write-result@1') {
                f.push({
                    law: '13 §7j-b',
                    severity: 'error',
                    nodeKey: e.to,
                    message: `'${e.to}' expects ${inShape} from '${e.from}.${e.fromPort}', but a gate-eligible ` +
                        `write publishes core:shape/write-result@1 — under async review it is a proposal, ` +
                        `not a committed row`,
                    fix: `declare '${e.to}' with an input port of core:shape/write-result@1 and handle both ` +
                        `status:'committed' and status:'pending' in its hook. Do not unwrap the ids upstream: ` +
                        `a proposal a reviewer may still reject would become a foreign key that dangles later`,
                });
            }
            else {
                f.push({
                    law: '01 §3',
                    severity: 'error',
                    nodeKey: e.to,
                    message: `'${e.from}.${e.fromPort}' produces ${outShape}; '${e.to}.${e.toPort}' needs ${inShape}`,
                    fix: `insert a node that converts ${outShape} to ${inShape}, or pick a type whose port accepts ${outShape}`,
                });
            }
        }
        // F22 — earlyExit only means something on a stream-capable input
        if (down.earlyExit && !isStreaming(outShape)) {
            f.push({
                law: 'F22',
                severity: 'warning',
                nodeKey: e.to,
                message: `'${e.to}' declares earlyExit but '${e.from}.${e.fromPort}' does not stream`,
                fix: 'remove earlyExit, or connect it to a stream-shaped port — on a settled value there is nothing to exit early from',
            });
        }
    }
    // ── Blocks: no write-class consumers inside (01 §4) ───────────────────────
    for (const n of doc.nodes) {
        if (!n.blockId)
            continue;
        if (n.kind === 'consumer' && desc(n.key)?.effects === 'write') {
            f.push({
                law: '01 §4',
                severity: 'error',
                nodeKey: n.key,
                message: `write-class consumer '${n.key}' is inside ${n.blockKind} block '${n.blockId}'`,
                fix: 'move the write onto the spine after the block completes — concurrent writes make ordering observable and break the equivalence law (F26)',
            });
        }
    }
    // ── Repetition bounds (01 §4, §4a) ────────────────────────────────────────
    const blockById = new Map(doc.blocks.map((b) => [b.id, b]));
    const repeats = (blockId) => {
        let cur = blockId;
        while (cur) {
            const b = blockById.get(cur);
            if (!b)
                return undefined;
            if (b.kind === 'map' || b.kind === 'loop')
                return b.id;
            cur = b.blockId;
        }
        return undefined;
    };
    const within = (inner, outer) => {
        let cur = inner;
        while (cur) {
            if (cur === outer)
                return true;
            cur = blockById.get(cur)?.blockId;
        }
        return false;
    };
    for (const b of doc.blocks) {
        if (b.kind !== 'route')
            continue;
        const routes = b.routes ?? {};
        const on = b.on;
        if (!on || on.__ref !== 'data') {
            f.push({
                law: '20 §10',
                severity: 'error',
                message: `route '${b.id}' has no routed value`,
                fix: 'reference a port with on:, e.g. on: $ => $.parse.call — the decision is data a task computed',
            });
        }
        if (!b.chains.length) {
            f.push({
                law: '20 §10',
                severity: 'error',
                message: `route '${b.id}' declares no branches`,
                fix: 'declare at least one when() branch',
            });
        }
        let defaults = 0;
        for (const chain of b.chains) {
            const p = routes[chain];
            if (!p) {
                f.push({
                    law: '20 §10',
                    severity: 'error',
                    message: `route '${b.id}' branch '${chain}' has no predicate`,
                    fix: 'declare it with when(name, predicate) or otherwise(name)',
                });
                continue;
            }
            const stated = ['equals', 'truthy', 'default'].filter((k) => p[k] !== undefined);
            if (p.default)
                defaults++;
            if (stated.length !== 1) {
                f.push({
                    law: '20 §10',
                    severity: 'error',
                    message: `route '${b.id}' branch '${chain}' states ${stated.length || 'no'} conditions`,
                    fix: 'exactly one of equals / truthy / default per branch — a richer decision belongs in a Task the route reads',
                });
            }
        }
        if (defaults > 1) {
            f.push({
                law: '20 §10',
                severity: 'error',
                message: `route '${b.id}' declares ${defaults} default branches`,
                fix: "at most one otherwise() — 'fires when nothing else did' cannot be true of two branches",
            });
        }
    }
    for (const b of doc.blocks) {
        if (b.kind !== 'map' && b.kind !== 'loop')
            continue;
        if (!b.max || b.max <= 0) {
            f.push({
                law: b.kind === 'map' ? '01 §4' : '01 §4a',
                severity: 'error',
                message: `${b.kind} '${b.id}' has no declared maximum`,
                fix: b.kind === 'map'
                    ? 'declare max — an unbounded map is the most likely source of a surprise bill in the system'
                    : 'declare max — for a loop it is also the only thing between a bad predicate and a run that never ends',
            });
        }
        if (b.kind !== 'loop')
            continue;
        const ref = b.repeatWhile;
        if (!ref || ref.__ref !== 'data') {
            f.push({
                law: '01 §4a',
                severity: 'error',
                message: `loop '${b.id}' has no repeatWhile predicate`,
                fix: 'reference a port on a node inside the loop body, e.g. repeatWhile: $ => $.agent.item.generate.hasToolCalls',
            });
            continue;
        }
        // A predicate that cannot change is a loop that always runs to max.
        const source = doc.nodes.find((n) => n.key === ref.node);
        if (!source || !within(source.blockId, b.id)) {
            f.push({
                law: '01 §4a',
                severity: 'error',
                message: `loop '${b.id}' repeats on '${ref.node}', which is not inside the loop body`,
                fix: `reference a node declared inside '${b.id}' — a predicate computed outside the body never changes, so the loop would always run to its max of ${b.max}`,
            });
        }
    }
    // ── Referencing into a repeating block from outside (01 §4a) ──────────────
    for (const e of doc.edges) {
        if (e.implicit)
            continue;
        const from = byKey.get(e.from);
        const to = byKey.get(e.to);
        if (!from || !to)
            continue;
        const repeating = repeats(from.blockId);
        if (!repeating || within(to.blockId, repeating))
            continue;
        f.push({
            law: '01 §4a',
            severity: 'error',
            nodeKey: e.to,
            message: `'${e.to}' references '${e.from}', which is inside ${blockById.get(repeating).kind} '${repeating}' and runs more than once`,
            fix: `reference the block's own output instead — $.${repeating}.values for the results in order, or $.${repeating} for the full branch record. "Whichever iteration happened to run last" is not a value anyone means`,
        });
    }
    // ── A write inside a repeating block would write N times (F7, 01 §4) ──────
    for (const n of doc.nodes) {
        if (n.kind !== 'consumer' || desc(n.key)?.effects !== 'write')
            continue;
        const repeating = repeats(n.blockId);
        if (!repeating)
            continue;
        f.push({
            law: 'F7',
            severity: 'error',
            nodeKey: n.key,
            message: `write-class consumer '${n.key}' is inside ${blockById.get(repeating).kind} '${repeating}'`,
            fix: 'move the write onto the spine after the block completes — one primary write per pipeline is one transaction, and a repeated write is neither',
        });
    }
    // ── F8 — nodes cannot emit events ─────────────────────────────────────────
    for (const n of doc.nodes) {
        if ('emits' in n.config) {
            f.push({
                law: 'F8',
                severity: 'error',
                nodeKey: n.key,
                message: `'${n.key}' declares emits`,
                fix: 'only core emits events, from its own actions. A write causes the event its consumer target declares; subscribe with .on()',
            });
        }
    }
    // ── F36 — every hook invocation is bounded ────────────────────────────────
    for (const n of doc.nodes) {
        if (n.kind === 'input')
            continue;
        const d = desc(n.key);
        if (d && d.timeoutMs === undefined) {
            f.push({
                law: 'F36',
                severity: 'warning',
                nodeKey: n.key,
                message: `type '${n.typeId}@${n.typeVersion}' declares no timeout`,
                fix: 'declare timeoutMs on the descriptor; the instance ceiling applies regardless, but an explicit default is what stops a stuck hook running to the ceiling',
            });
        }
    }
    // ── Author presets (12 §3a) ───────────────────────────────────────────────
    for (const p of doc.presets ?? []) {
        for (const v of p.values) {
            const node = byKey.get(v.nodeKey);
            if (!node) {
                f.push({
                    law: '12 §3a',
                    severity: 'error',
                    message: `preset '${p.slug}' sets '${v.slot}' on unknown node '${v.nodeKey}'`,
                    fix: `name a node this spec declares (${[...byKey.keys()].join(', ')}), or remove the entry — a preset row that matches no node is silently dead config`,
                });
                continue;
            }
            const d = desc(v.nodeKey);
            // Slots are declared by the type, so a preset writing an undeclared slot is
            // the same class of mistake as a typo'd node key: it resolves to nothing and
            // the user sees the preset "not working" with no error anywhere.
            if (d && !d.slots?.[v.slot] && v.slot !== 'settings' && v.slot !== 'connection') {
                f.push({
                    law: '12 §3a',
                    severity: 'error',
                    nodeKey: v.nodeKey,
                    message: `preset '${p.slug}' sets slot '${v.slot}' on '${v.nodeKey}', which declares ${Object.keys(d.slots ?? {}).join(', ') || 'no slots'}`,
                    fix: `set a slot the type declares, or add '${v.slot}' to the descriptor if the node should accept it`,
                });
            }
            if (v.slot === 'connection') {
                f.push({
                    law: '12 §4',
                    severity: 'error',
                    nodeKey: v.nodeKey,
                    message: `preset '${p.slug}' sets a connection`,
                    fix: 'an author preset may not pin compute or credentials — the admin cascade works because connection has no writable scope below instance. Ship the behaviour (prompts, params, template) and let the admin choose the connection',
                });
            }
            // A template value carries its own engine, so a bare string is ambiguous the
            // moment more than one engine is registered (src/engines.ts).
            if (v.slot === 'template' && (typeof v.value !== 'object' || !v.value?.engine)) {
                f.push({
                    law: '12 §3a',
                    severity: 'error',
                    nodeKey: v.nodeKey,
                    message: `preset '${p.slug}' sets a template on '${v.nodeKey}' with no engine`,
                    fix: "wrap it: jinja(source), text(source), or yourEngine(source) — the engine travels on the value so a slot can say what it is written in",
                });
            }
        }
    }
    // ── Toggleable requires shape transparency ────────────────────────────────
    for (const n of doc.nodes) {
        const d = desc(n.key);
        if (!d?.toggleable)
            continue;
        const outs = Object.values(d.ports.out ?? {});
        const ins = Object.values(d.ports.in ?? {});
        const transparent = outs.some((o) => ins.some((i) => assignable(o, i) || assignable(i, o)));
        if (!transparent) {
            f.push({
                law: '01 §14',
                severity: 'error',
                nodeKey: n.key,
                message: `'${n.key}' declares toggleable but its output is not assignable to its input`,
                fix: 'only shape-transparent nodes may be switched off; otherwise turning it off breaks everything downstream',
            });
        }
    }
    // ── capability declarations ───────────────────────────────────────────────
    //
    // Checked HERE and not by `satisfies`, because at publish time there is no
    // connection to satisfy — the document may be imported onto an instance whose
    // connections nobody has created yet. What is checkable statically is whether
    // the declaration itself is coherent, and every one of these is a mistake that
    // would otherwise surface as a slot that silently never matches anything.
    for (const n of doc.nodes) {
        const d = getType(`${n.typeId}@${n.typeVersion}`);
        for (const [slotName, decl] of Object.entries(d?.slots ?? {})) {
            const requires = decl.requires ?? [];
            const optional = decl.optional ?? [];
            if (!requires.length && !optional.length)
                continue;
            if (decl.kind !== 'connection') {
                f.push({
                    law: 'capabilities',
                    severity: 'error',
                    nodeKey: n.key,
                    message: `'${n.key}.${slotName}' declares capabilities but is a ${decl.kind} slot`,
                    fix: 'capabilities describe a connection; declare them on the connection slot that resolves it',
                });
                continue;
            }
            for (const id of [...requires, ...optional]) {
                if (isKnownCapability(id))
                    continue;
                // A transform built from known kinds but written in the wrong
                // ORDER is a different mistake from a typo, and telling them
                // apart is the difference between a one-word fix and a hunt.
                // `image+audio->video` and `audio+image->video` name one
                // capability, but only the canonical spelling is what
                // `transformId()` ever produces — so the other matches nothing,
                // forever, and the node's requirement is unsatisfiable by any
                // connection however capable.
                const canonical = isTransformId(id) ? canonicalise(id) : undefined;
                f.push({
                    law: 'capabilities',
                    severity: 'error',
                    nodeKey: n.key,
                    message: canonical
                        ? `'${n.key}.${slotName}' spells the capability '${id}' non-canonically`
                        : `'${n.key}.${slotName}' names an unknown capability '${id}'`,
                    fix: canonical
                        ? `write it as '${canonical}' — kinds are ordered by IO_KINDS (text, image, audio, video, document, embedding), and only that spelling is ever matched`
                        : `use a declared transform (e.g. 'text->image') or feature (${FEATURES.join(', ')})`,
                });
            }
            // Both at once is not a stricter requirement, it is a contradiction:
            // `requires` guarantees presence, `optional` obliges the binding to
            // handle absence. One of the two branches would be unreachable.
            const both = requires.filter((r) => optional.includes(r));
            for (const id of both) {
                f.push({
                    law: 'capabilities',
                    severity: 'error',
                    nodeKey: n.key,
                    message: `'${n.key}.${slotName}' lists ${capabilityLabel(id)} as both required and optional`,
                    fix: 'pick one — required means the run fails without it; optional means the binding handles its absence',
                });
            }
        }
    }
    return f;
}
/**
 * A capability id core or a plugin has actually declared.
 *
 * Transforms are checked structurally rather than against `TRANSFORMS`, because
 * that table names the ones core ships and a plugin may legitimately introduce
 * another — `image+audio->video` is not core's business but it is well-formed.
 * A feature, by contrast, is a closed set: it names a mechanism something has to
 * implement, so an unrecognised one is always a typo.
 *
 * ⚠ "Structurally" used to mean `!!lhs && !!rhs`, which passed `'text->tex'`,
 * `'txet->text'` and `'->'` — every typo this check exists to catch, since the
 * ones it did catch were already impossible to write. The real structure is
 * that both sides are non-empty lists of KNOWN kinds in CANONICAL order, which
 * is exactly "the id round-trips through `parseTransform` and back". That
 * rejects an unknown kind, a misspelled one, an empty side and `image+text->text`
 * (whose canonical spelling is `text+image->text`, so two ids would name one
 * capability and only one of them would ever match) — while still admitting
 * `image+audio->video`, because the plugin escape hatch above is the point.
 *
 * There is no registry of plugin-declared transforms to consult here: `validate`
 * reads a spec document, not an instance, so a set-membership test would have to
 * be `TRANSFORMS` alone and would close the door this docblock holds open. With
 * `tf()` emitting canonical spellings by construction, this is the runtime
 * backstop for hand-written strings rather than a check anything trips over.
 */
function isKnownCapability(id) {
    if (isTransformId(id))
        return canonicalise(id) === id;
    return FEATURES.includes(id);
}
/**
 * The canonical spelling of a transform id, or `undefined` if it is not one.
 *
 * `undefined` covers an empty side and any kind this build does not know —
 * neither of which has a canonical form to suggest, because there is nothing to
 * reorder. A mis-ORDERED id, by contrast, round-trips to a different string,
 * and that string is the fix.
 */
function canonicalise(id) {
    const t = parseTransform(id);
    if (!t.in.length || !t.out.length)
        return undefined;
    const known = (k) => IO_KINDS.includes(k);
    if (!t.in.every(known) || !t.out.every(known))
        return undefined;
    return transformId(t);
}
function reaches(doc, from, to, seen = new Set()) {
    if (from === to)
        return true;
    if (seen.has(from))
        return false;
    seen.add(from);
    return doc.edges.filter((e) => e.from === from).some((e) => reaches(doc, e.to, to, seen));
}
export function assertValid(doc) {
    const errs = validate(doc).filter((x) => x.severity === 'error');
    if (errs.length) {
        throw new Error('spec validation failed:\n' + errs.map((e) => `  [${e.law}] ${e.message}\n    → ${e.fix}`).join('\n'));
    }
}
//# sourceMappingURL=validate.js.map