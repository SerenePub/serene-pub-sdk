import { getDefinition } from '@serene-pub/sdk';
/**
 * The BUILT modules a manifest lists, each with what its widgets declare —
 * `HostUnderTest.components` for a package, so C31 mounts every module the
 * way the page mounts it on a layout: granted the section scopes its widgets
 * ask for (`scopes`; a `channel:` scope is not a section grant) and handed
 * only the base sections they read (`reads`, R75).
 *
 * A component more than one widget renders gets the union — the most any
 * placement hands it. When any of those widgets leaves `reads` out, it reads
 * every base section and `reads` is left out here too; a component no widget
 * renders gets neither (every base section, no grants). `code` reads a
 * module's `entry` (a path relative to the package root, as the manifest
 * carries it).
 * @experimental
 */
export async function componentsFromManifest(manifest, code) {
    return Promise.all((manifest.components ?? []).map(async (c) => {
        const widgets = (manifest.widgets ?? []).filter((w) => w.component === c.slug);
        const grants = [...new Set(widgets.flatMap((w) => (w.scopes ?? []).filter((s) => !s.startsWith('channel:'))))];
        const everySection = !widgets.length || widgets.some((w) => !Array.isArray(w.reads));
        const reads = everySection ? undefined : [...new Set(widgets.flatMap((w) => w.reads ?? []))];
        return {
            id: c.slug,
            code: await code(c.entry),
            ...(grants.length ? { grants } : {}),
            ...(reads ? { reads } : {}),
            ...(c.basedOn?.component ? { basedOn: c.basedOn.component } : {}),
        };
    }));
}
/**
 * A manifest's node definition, back as the descriptor its builder judged.
 *
 * The compiled manifest already carries every definition's declaration
 * verbatim (`nodeDefinitions[].declaration`, D-6b) — port names AND shapes,
 * slot declarations. The top-level `ports`/`slots` stay the names-only audit
 * summary an admin's screen and the install check read; turning them into
 * shapes would change a field every existing manifest reader keys on. So
 * this reads the declaration, and refuses — in a sentence — an entry that
 * has none (a manifest packaged before D-6b: re-package it) or one whose
 * declaration names another definition.
 * @experimental
 */
export function definitionFromManifest(entry) {
    const d = entry.declaration;
    if (!d || typeof d !== 'object' || !d.ports)
        throw new Error(`the manifest's node definition '${entry.id}' carries no declaration — its ports are names only, which no ` +
            `fit check can read. Re-package with a current @serene-pub/cli (it records the declaration verbatim, D-6b)`);
    if ((d.id !== undefined && d.id !== entry.id) || (d.kind !== undefined && d.kind !== entry.kind))
        throw new Error(`the manifest's node definition '${entry.id}' (${entry.kind}) carries the declaration of '${String(d.id)}' ` +
            `(${String(d.kind)}) — the manifest was edited by hand or packaged wrong`);
    return { ...d, id: entry.id, kind: entry.kind, slots: d.slots ?? {} };
}
/**
 * The swaps a manifest offers, each with the declaration of the definition it
 * seats — `HostUnderTest.swaps` for a package. A swap naming a definition the
 * manifest does not declare carries `definition: undefined` (C32 says so).
 * @experimental
 */
export function swapsFromManifest(manifest) {
    return (manifest.swaps ?? []).map((s) => {
        const entry = manifest.nodeDefinitions?.find((n) => n.id === s.definition);
        return {
            spec: s.spec,
            node: s.node,
            definitionId: s.definition,
            definition: entry ? definitionFromManifest(entry) : undefined,
        };
    });
}
/**
 * The definition a spec seats at `node`, resolved in this SDK's registry — a
 * host's `pinnedDefinition` over its own compiled spec (for core's, the
 * document `coreSpec(id).build()` returns). Undefined when the spec has no
 * such node or the registry does not know what it seats.
 * @experimental
 */
export function pinnedDefinitionIn(doc, node, lookup = getDefinition) {
    const n = doc?.nodes.find((x) => x.key === node);
    return n ? lookup(`${n.definitionId}@${n.definitionVersion}`) : undefined;
}
/**
 * The hooks a built handler bundle exports (`module.exports.hooks`), by
 * export name. The bundle is the sandbox's self-contained CommonJS module and
 * is evaluated here with a `require` that refuses every id, as the sandbox
 * gives it none — this is NOT the host's isolation (SES/QuickJS are the
 * app's), only the evaluation a test needs to call the handlers.
 * @experimental
 */
export function hooksFromBundle(code) {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', code)(module, module.exports, (id) => {
        throw new Error(`the handler bundle asked for '${id}' — a bundle must be self-contained`);
    });
    return module.exports.hooks ?? {};
}
/**
 * The seams a package's BUILT artifact supplies, from its manifest (and
 * handler bundle): what it ships (C28, C29), the swaps it offers (C32) and
 * the handler each definition runs (C33). Spread into a `HostUnderTest`
 * beside the seams only the test can give — `pinnedDefinition` (the host's
 * own specs), `components`/`mountComponent` (its harness).
 * @experimental
 */
export function manifestSeams(manifest, bundle) {
    let hooks;
    return {
        shipped: () => ({ genres: manifest.genres ?? [], presets: manifest.presets ?? [] }),
        swaps: () => swapsFromManifest(manifest),
        nodeHandler: (id) => {
            if (bundle === undefined)
                return undefined;
            hooks ??= hooksFromBundle(bundle);
            const name = manifest.hooks?.nodeHandlers?.[id];
            return name ? hooks[name] : undefined;
        },
    };
}
/**
 * A sample value per shape, for the binding probes' input (C33): a
 * definition whose every in-port has a sample here is probed with it; the
 * host's `probeInput(d)` answers any other. Turn order's two (a strategy
 * reads candidates and the history) are here because every strategy swap
 * reads them.
 * @experimental
 */
export const PROBE_SAMPLES = {
    'core:shape/turn-candidates@1': [
        { ref: 'character:3', kind: 'character', name: 'Bell', position: 0 },
        { ref: 'character:9', kind: 'persona', name: 'Pip', position: 1 },
    ],
    'core:shape/messages@1': [
        { id: 1, role: 'user', personaId: 9, characterId: null, content: 'Hello there' },
        { id: 2, role: 'assistant', characterId: 3, personaId: null, content: 'Hi!\n\nYour go, Pip.' },
    ],
    'core:shape/text@1': 'Hello there',
    'core:shape/json@1': {},
};
/**
 * The probe input for `d` from `PROBE_SAMPLES`, one value per in-port, or
 * the shapes it has no sample for.
 * @experimental
 */
export function probeSampleFor(d) {
    const input = {};
    const missing = [];
    for (const [port, shape] of Object.entries(d.ports?.in ?? {})) {
        const id = typeof shape === 'string' ? shape : String(shape?.id ?? shape);
        if (Object.hasOwn(PROBE_SAMPLES, id))
            input[port] = structuredClone(PROBE_SAMPLES[id]);
        else
            missing.push(`${port}: ${id}`);
    }
    return missing.length ? { missing } : { input };
}
//# sourceMappingURL=packages.js.map