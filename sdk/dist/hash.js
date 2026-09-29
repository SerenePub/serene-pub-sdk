/**
 * One canonical form, one digest, one re-declaration rule.
 *
 * Two things in the SDK have to answer "is this the same content as that": a
 * spec document's `canonicalHash` (02 §3), and every registry here that refuses
 * a second declaration under an id it already holds. They must not answer
 * differently, so the sort and the digest live here once and both call in — a
 * second hashing scheme is how two places quietly start disagreeing about what
 * "the same" means.
 *
 * ## Why the registries needed an answer at all
 *
 * `if (map.has(id)) throw` is the right guard for the case it was written for:
 * two *different* declarations claiming one id means one of them silently wins
 * and which one depends on load order. It is the wrong guard for a case nobody
 * had in mind — a module re-evaluating with the same source. That is exactly
 * what a dev server's hot reload does: saving an app file that imports
 * `@serene-pub/contracts` re-runs every `describe*` in it against a registry
 * living in a module that was *not* reloaded, so the first id threw, the reload
 * failed, and the server retried in a loop.
 *
 * The fix is to key the refusal on content rather than on arrival. Deliberately
 * not gated on `import.meta.hot` or `NODE_ENV`: an identical re-declaration is
 * harmless everywhere, and an environment check would only hide the case where
 * it is *not* identical — which is the case the guard exists for.
 */
const sortDeep = (v) => {
    if (Array.isArray(v))
        return v.map(sortDeep);
    if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, val]) => [k, sortDeep(val)]));
    }
    return v;
};
/** Canonical form — stable key order, for hashing and round-trip identity (F3). @experimental */
export function canonicalize(v) {
    return JSON.stringify(sortDeep(v));
}
/** Cheap deterministic content hash — stands in for the real canonical_hash (02 §3). @experimental */
export function contentHash(v) {
    const s = canonicalize(v);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
/**
 * The display-text keys every declaration carries, whatever registry it is in.
 *
 * Always stripped, and deliberately not expressed as a default that
 * `DisplayKeys.display` replaces: a registry passing `{ display: ['label'] }`
 * meaning "and also this one" would silently put `i18n` back into the hash and
 * restore the reload loop for the most common edit there is. The option adds to
 * this pair; nothing subtracts from it.
 */
const UNIVERSAL_DISPLAY = ['i18n', 'description'];
const stripDisplay = (v, display, functions = 'source') => {
    if (typeof v === 'function')
        return functions === 'source' ? `[fn] ${String(v)}` : undefined;
    if (Array.isArray(v))
        return v.map((e) => stripDisplay(e, display, functions));
    if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v)
            .filter(([k, val]) => !display.has(k) && !(functions === 'omit' && typeof val === 'function'))
            .map(([k, val]) => [k, stripDisplay(val, display, functions)]));
    }
    return v;
};
const DEFAULT_DISPLAY = new Set(UNIVERSAL_DISPLAY);
/** Built once per hash rather than per node, since the strip recurses. */
const displaySet = (opts) => opts?.display?.length ? new Set([...UNIVERSAL_DISPLAY, ...opts.display]) : DEFAULT_DISPLAY;
/**
 * What is *material* about a declaration, as the registries compare them.
 *
 * Two departures from hashing a declaration as plain data, and both are rules
 * this codebase already applies to the registry rows these declarations project
 * into (core's `typeContentHash`):
 *
 *  · **Display text is not content.** `i18n` and `description` are stripped
 *    recursively, along with whatever else the calling registry names as
 *    display (see `DisplayKeys`), because renaming a node or copyediting an
 *    explanation is not a change to what the declaration means. It is also what
 *    makes the reload case fully fixed rather than half fixed: editing a label
 *    is the most common thing a person saves, and it must not put the loop
 *    back.
 *  · **Behaviour is.** A template engine or a wire format is almost entirely
 *    functions, and `JSON.stringify` drops those silently — so hashing one as
 *    data would make *every* declaration under an id identical and the guard
 *    would stop guarding. Functions canonicalize to their source text, which is
 *    the comparison a re-evaluation needs: the same source re-runs to the same
 *    hash, an edited one does not.
 *
 * ## Exported, because the strip is the one thing every hash here shares
 *
 * A `Descriptor` is compared when it is re-declared, and projected into a
 * `pipeline_definition_registry` row whose `content_hash` decides whether an
 * upgrading install may republish it. Those are two answers to one question —
 * *is this the same content?* — and they were once computed by two functions
 * that disagreed: core stripped `i18n` and `description`, this stripped
 * `label` as well (see `DESCRIPTOR_DISPLAY_KEYS`), so renaming a parameter was
 * free on one side and a frozen-type conflict on the other. Both now call
 * `definitionContract`, which reads every contract field through this strip
 * (`declarationData`); the strip is exported so that function is the only
 * place a definition's material is composed, and so the registries that hash
 * a declaration whole keep the same words for display text.
 * @experimental
 */
export function declarationMaterial(v, opts) {
    return stripDisplay(v, displaySet(opts));
}
/**
 * `declarationMaterial` for a declaration that is **data**: display text out,
 * and a function value **omitted** rather than rendered as source.
 *
 * The node-definition contract (`definitionContract`) reads its fields
 * through this. A definition's contract is what a registry row carries so
 * core can judge a plugin without executing it (F6), and a row cannot carry
 * a function — so a function is not contract, and its source text is not
 * either. No `Descriptor` field is a function today; the rule is here so the
 * day one is, it is classified rather than digested by accident.
 * @experimental
 */
export function declarationData(v, opts) {
    return stripDisplay(v, displaySet(opts), 'omit');
}
/** The content hash of a declaration — see `declarationMaterial` for what counts. @experimental */
export function declarationHash(v, opts) {
    return contentHash(stripDisplay(v, displaySet(opts)));
}
/**
 * The one rule every registry here applies when an id is declared twice.
 *
 * Identical content is a no-op and the caller goes on to store the *new*
 * declaration. Storing the new one rather than keeping the old is what makes a
 * reloaded module authoritative over the one it replaced: the two agree on
 * everything hashed, and on the display text that is not hashed the fresher
 * declaration is the one the author just wrote.
 *
 * Different content throws exactly as before, with both hashes named — because
 * the first question an author asks a "duplicate id" error is "but they *are*
 * the same", and the two hashes are the evidence that they are not.
 * @experimental
 */
export function refuseUnlessIdentical(existing, next, why, opts) {
    refuseUnlessSameHash(declarationHash(existing, opts), declarationHash(next, opts), why);
}
/**
 * The refusal itself, for a registry that digests its own material: the
 * descriptor registry compares two `definitionContractHash`es through this,
 * so a "duplicate type id" reads the same whichever material was digested.
 * @experimental
 */
export function refuseUnlessSameHash(registered, redeclared, why) {
    if (registered === redeclared)
        return;
    throw new Error(`${why} (registered ${registered}, redeclared ${redeclared})`);
}
//# sourceMappingURL=hash.js.map