import { compile } from './document.js';
const isDocument = (s) => 'schemaVersion' in s;
/** @public */
export function use(ref) {
    const m = /^(.*?)@([~^]?\d[^@]*)$/.exec(ref);
    return Object.freeze(m
        ? { kind: 'external-ref', id: m[1], range: m[2] }
        : { kind: 'external-ref', id: ref });
}
const isExternalRef = (v) => !!v && typeof v === 'object' && v.kind === 'external-ref';
/** The id a `SpecRef` names; a bare string is refused with the fix. @experimental */
export function specIdOf(v, where) {
    if (typeof v === 'string')
        throw new Error(`${where} names the spec '${v}' as a string — pass the spec value you built, ` +
            `or use('${v}') for another package's`);
    if (!v || typeof v !== 'object' || typeof v.id !== 'string')
        throw new Error(`${where} names no spec — pass the spec value you built, or use('<spec id>') for another package's`);
    return v.id;
}
/** The events a spec's inlet lock answers; undefined for another package's (`use()`). */
const lockEventsOf = (v) => {
    if (isExternalRef(v))
        return undefined;
    const lock = v.input;
    return lock?.events ? [...lock.events] : lock?.event ? [lock.event] : [];
};
/** The action keys a spec contributes; undefined for another package's (`use()`). */
const actionKeysOf = (v) => {
    if (isExternalRef(v))
        return undefined;
    const contributes = 'meta' in v ? v.meta.contributes : v.contributes;
    return actionsOf({ id: v.id, contributes }).map((a) => a.key);
};
import { genre as makeGenre, genreIdOf, sessionEvents } from './genres.js';
import { eventById, isEventId, isSessionEventDecl } from './events.js';
import { makeValueToolkit } from './values.js';
import { ACTION_IDENTITY, actionsOf } from './actions.js';
import { i18nFindings } from './i18n.js';
import { declarationFindings, labelFindings, storedSwap, subjectsOf, swapInputFindings, } from './declarations.js';
/**
 * Author a config against a spec value, or another package's through `use()`.
 * With a spec value the node keys are checked at build; through `use()` they
 * are recorded and checked by the instance that has the spec.
 * @experimental
 */
export function config(spec, slug, meta, values) {
    assertDisplayText(`config '${slug}'`, meta);
    specIdOf(spec, `config '${slug}'`);
    return { spec, slug, label: meta.label, description: meta.description, values };
}
/** The stored form of a config — the spec read down to its id. @experimental */
export function storedConfig(c) {
    return {
        spec: specIdOf(c?.spec, `config '${c?.slug}'`),
        slug: c.slug,
        label: c.label,
        ...(c.description !== undefined ? { description: c.description } : {}),
        values: c.values,
    };
}
/**
 * The display text rule (R-20) as a throw for `config()` / `preset()`, where
 * the author is. `build()` collects the same findings instead, through the
 * shared declaration pass.
 */
function assertDisplayText(at, meta) {
    const findings = labelFindings(at, meta);
    if (findings.length)
        throw new Error(`${at} declares display text a publish refuses (R-20):\n · ${findings.join('\n · ')}`);
}
/** The stored form of an event declaration; throws the first mistake, with the fix. @experimental */
export function storedEventDeclaration(d) {
    const where = `event '${d?.event?.id ?? '?'}'`;
    if (!isSessionEventDecl(d?.event))
        throw new Error(`${where}: 'event' is the value defineSessionEvent() returned, not an id`);
    if (typeof d.genre === 'string')
        throw new Error(`${where} names its genre as a string — pass the genre value, or use('${d.genre}')`);
    const genre = isExternalRef(d.genre) ? d.genre.id : genreIdOf(d.genre);
    let recordedBy;
    if (d.recordedBy === 'any')
        recordedBy = 'any';
    else {
        if (!Array.isArray(d.recordedBy) || !d.recordedBy.length)
            throw new Error(`${where} names nothing that may record it — list the subjects whose pipelines record it, or 'any'`);
        recordedBy = d.recordedBy.flatMap((entry, n) => {
            const at = `${where} recordedBy ${n + 1}`;
            if (typeof entry === 'string') {
                if (!isEventId(entry) || !eventById(entry))
                    throw new Error(`${at}: '${entry}' is not a declared event id — pass an event of the genre, a spec, or { spec, key }`);
                if (entry === sessionEvents.sessionAction)
                    throw new Error(`${at}: the action event serves each action on its own — pick the action: { spec, key }, or pass the spec`);
                return [entry];
            }
            if (isBindingObject(entry)) {
                const { spec: ref, key } = entry;
                const id = specIdOf(ref, at);
                if (typeof key !== 'string')
                    throw new Error(`${at} picks from '${id}' without a key — { spec, key }`);
                const keys = actionKeysOf(ref);
                if (keys && !keys.includes(key))
                    throw new Error(`${at} picks '${key}' from '${id}', which contributes ${keys.map((k) => `'${k}'`).join(', ') || 'no actions'}`);
                return [`${id}#${key}`];
            }
            specIdOf(entry, at);
            const subjects = subjectsOf(entry);
            if (!subjects.length)
                throw new Error(`${at}: '${entry.id}' has no inlet lock — it serves no subject`);
            return subjects;
        });
    }
    return {
        event: d.event.id,
        payload: d.event.payload,
        name: d.event.name,
        description: d.event.description,
        domain: d.event.domain,
        genre,
        recordedBy,
    };
}
const isBindingObject = (v) => !!v && typeof v === 'object' && 'spec' in v;
/**
 * The stored form of a preset. Every reference is read down to its id and
 * checked against what the value says: a binding's events against its spec's
 * lock, a config against the spec it was made for, an action key against
 * the keys the spec declares. Throws the first mistake, with the fix.
 * @experimental
 */
export function preset(input) {
    const where = `preset '${input?.slug}'`;
    assertDisplayText(where, input);
    if (typeof input.genre === 'string')
        throw new Error(`${where} names its genre as a string — pass the genre value (import it), or use('${input.genre}')`);
    const genre = isExternalRef(input.genre) ? input.genre.id : genreIdOf(input.genre);
    const bindings = {};
    if (!Array.isArray(input.bindings))
        throw new Error(`${where}: bindings is a list of specs — [createSession, { spec: respond, config: tuned }]; ` +
            `each is bound on the events its inlet lock answers`);
    for (const [i, raw] of input.bindings.entries()) {
        const entry = isBindingObject(raw) ? raw : { spec: raw };
        const at = `${where} binding ${i + 1}`;
        const id = specIdOf(entry.spec, at);
        const locked = lockEventsOf(entry.spec);
        let events = entry.events;
        if (events === undefined) {
            if (!locked)
                throw new Error(`${at} binds '${id}', another package's spec — name the events it answers: ` +
                    `{ spec: use('${id}'), events: [ … ] }`);
            if (!locked.length)
                throw new Error(`${at} binds '${id}', which has no inlet lock — a preset binds a spec on the events its lock answers`);
            events = locked;
        }
        else if (!events.length) {
            throw new Error(`${at} binds '${id}' on no events — drop \`events\` to bind every event its lock answers`);
        }
        else if (locked) {
            const outside = events.filter((e) => !locked.includes(e));
            if (outside.length)
                throw new Error(`${at} binds '${id}' on ${outside.map((e) => `'${e}'`).join(', ')}, which its inlet lock ` +
                    `does not answer (${locked.join(', ') || 'no lock'})`);
        }
        let configSlug;
        if (entry.config !== undefined) {
            const configured = specIdOf(entry.config?.spec, `${at} config`);
            if (configured !== id)
                throw new Error(`${at} binds '${id}' with config '${entry.config.slug}', which was made for '${configured}'`);
            configSlug = entry.config.slug;
        }
        for (const event of events) {
            if (bindings[event])
                throw new Error(`${where} binds '${event}' twice — to '${bindings[event].spec}' and to '${id}'`);
            bindings[event] = { spec: id, ...(configSlug !== undefined ? { config: configSlug } : {}) };
        }
    }
    const include = (pick, n) => {
        const at = `${where} action ${n + 1}`;
        if (typeof pick === 'string')
            throw new Error(`${at} names '${pick}' as a string — pass the spec value (every action it contributes) ` +
                `or { spec, key } for one`);
        if (isBindingObject(pick)) {
            const { spec: ref, key } = pick;
            const id = specIdOf(ref, at);
            if (typeof key !== 'string' || !ACTION_IDENTITY.test(`${id}#${key}`))
                throw new Error(`${at} picks from '${id}' without a valid key — { spec, key: '<action key>' }`);
            const keys = actionKeysOf(ref);
            if (keys && !keys.includes(key))
                throw new Error(`${at} picks '${key}' from '${id}', which contributes ${keys.length ? keys.map((k) => `'${k}'`).join(', ') : 'no actions'}`);
            return [`${id}#${key}`];
        }
        const id = specIdOf(pick, at);
        const keys = actionKeysOf(pick);
        if (!keys)
            throw new Error(`${at} includes '${id}', another package's spec — name the action: { spec: use('${id}'), key: '<action key>' }`);
        if (!keys.length)
            throw new Error(`${at} includes '${id}', which contributes no actions — nothing to bring along`);
        return keys.map((k) => `${id}#${k}`);
    };
    const swapsOf = (swaps) => {
        const faults = swapInputFindings(swaps);
        if (faults.length)
            throw new Error(`${where} defaults.swaps: ${faults.join('; ')}`);
        return swaps.map((c) => storedSwap(c));
    };
    return {
        slug: input.slug,
        genre,
        label: input.label,
        description: input.description,
        bindings,
        ...(input.actions ? { actions: { include: input.actions.include.flatMap(include) } } : {}),
        ...(input.defaults
            ? {
                defaults: {
                    ...input.defaults,
                    ...(input.defaults.swaps ? { swaps: swapsOf(input.defaults.swaps) } : {}),
                },
            }
            : {}),
        // Omitted rather than defaulted to `false`, so a declaration that says
        // nothing hashes as it always did — the announcement is content-hashed
        // like every other declaration here.
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    };
}
const NS = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
/** @internal The builder behind `announcementOf()`; author a package with `defineExtension()`. */
export class AnnouncementBuilder {
    identity;
    /** The context-bound value toolkit — custom kinds mint under this package. */
    v;
    _genres = new Map();
    _hooks = {};
    _pipelines = [];
    _configs = [];
    _presets = [];
    _prompts = [];
    _surfaces;
    _components = [];
    _swaps = [];
    _events = [];
    constructor(identity) {
        this.identity = identity;
        if (!NS.test(identity.ns))
            throw new Error(`'${identity.ns}' is not a valid package namespace — lowercase, digits, hyphens, dots`);
        this.v = makeValueToolkit(identity.ns);
    }
    /** Context sugar: mints `${ns}:genre/${name}` so the id cannot be mistyped. */
    genre(name, props) {
        const decl = makeGenre(`${this.identity.ns}:genre/${name}`, props);
        this._genres.set(decl.id, decl);
        return decl;
    }
    genres(map) {
        for (const decl of Object.values(map)) {
            const owner = decl.id.slice(0, decl.id.indexOf(':'));
            if (owner !== this.identity.ns)
                throw new Error(`genre '${decl.id}' is owned by '${owner}' — a package declares only its own ` +
                    `genres; referencing another's is done from a spec's input binding`);
            this._genres.set(decl.id, decl);
        }
        return this;
    }
    /** Declarations only — implementations bind by id per trust domain (24 §11). */
    hooks(map) {
        for (const [key, decl] of Object.entries(map))
            this._hooks[`${this.identity.ns}:hook/${key}`] = decl;
        return this;
    }
    pipelines(...specs) {
        this._pipelines.push(...specs);
        return this;
    }
    configs(...configs) {
        this._configs.push(...configs.map(storedConfig));
        return this;
    }
    prompts(...prompts) {
        this._prompts.push(...prompts);
        return this;
    }
    presets(...presets) {
        this._presets.push(...presets.map(preset));
        return this;
    }
    /**
     * The frame surfaces this package ships (20 §12): documents mounted in
     * opaque-origin iframes. Declared, never discovered — an instance renders
     * what the manifest says and `serene-pub preview` renders the same list,
     * so a surface a modder previewed is a surface an instance will offer.
     */
    surfaces(decl) {
        this._surfaces = { ...this._surfaces, ...decl };
        return this;
    }
    /** In-document components (10 §2, virtual tier) — code trust at install. */
    components(...components) {
        this._components.push(...components);
        return this;
    }
    /**
     * Offer this package's definitions on another package's swappable nodes:
     * `.swaps({ spec: chatTurnOrder, node: 'decide.rules.strategy', definition: myStrategy })`,
     * the spec a value you imported, or `use('<spec id>')`. For a node of this package's own spec, list
     * the swap on the node itself with `expose.swaps` instead.
     */
    swaps(...contributions) {
        const faults = swapInputFindings(contributions);
        if (faults.length)
            throw new Error(`swaps:\n · ${faults.join('\n · ')}`);
        this._swaps.push(...contributions);
        return this;
    }
    /**
     * Validate the announcement as a whole and compile it to the document.
     * Errors carry exact paths — the teaching-error pattern (15 §1.3).
     */
    build() {
        const errors = [];
        const ns = this.identity.ns;
        // The display text (R-20, U5i): the package's own title, summary and
        // description. Every prompt's, config's and preset's label is checked
        // by the shared declaration pass below, so a hand-built document gets
        // the same answer the constructor gives.
        errors.push(...i18nFindings(this.identity.title, 'identity.title', { required: true }));
        errors.push(...i18nFindings(this.identity.summary, 'identity.summary'));
        errors.push(...i18nFindings(this.identity.description, 'identity.description'));
        // Every announced id lives under the package namespace. Kept here rather
        // than in the shared pass because `defineExtension` refuses the same
        // thing in its own words, naming the plugin slug (D-1).
        for (const s of this._pipelines) {
            const owner = s.id.includes(':') ? s.id.slice(0, s.id.indexOf(':')) : undefined;
            if (owner !== ns)
                errors.push(`pipeline '${s.id}' is not under this package's namespace '${ns}'`);
        }
        // Everything else a package declares — genres, the input lock, create
        // pipelines, actions, prompts, configs, presets, surfaces, components —
        // is checked by the pass `defineExtension` runs too (D-1), so one
        // mistake gets one sentence wherever it was written.
        const found = declarationFindings({
            ns,
            genres: [...this._genres.values()],
            pipelines: this._pipelines,
            prompts: this._prompts,
            configs: this._configs,
            presets: this._presets,
            surfaces: this._surfaces,
            components: this._components,
            swaps: this._swaps,
            events: this._events,
        });
        errors.push(...found.errors);
        const coverage = found.coverage;
        if (errors.length)
            throw new AnnouncementError(errors, coverage);
        return {
            document: {
                schemaVersion: 1,
                identity: this.identity,
                genres: [...this._genres.values()],
                hooks: this._hooks,
                pipelines: this._pipelines.map((s) => (isDocument(s) ? s : compile(s))),
                prompts: this._prompts,
                configs: this._configs,
                presets: this._presets,
                ...(this._surfaces ? { surfaces: this._surfaces } : {}),
                components: this._components,
                ...(this._swaps.length ? { swaps: this._swaps.map(storedSwap) } : {}),
                ...(this._events.length ? { events: this._events } : {}),
                requires: found.requires,
            },
            coverage,
        };
    }
}
/** Build refusal that still carries the coverage — the report is the error's context. @experimental */
export class AnnouncementError extends Error {
    errors;
    coverage;
    constructor(errors, coverage) {
        super(`announcement refused:\n  - ${errors.join('\n  - ')}`);
        this.errors = errors;
        this.coverage = coverage;
        this.name = 'AnnouncementError';
    }
}
/** @internal Author a package with `defineExtension()`; this is the serializer behind it. */
export function announce(identity) {
    return new AnnouncementBuilder(identity);
}
/**
 * The announcement document a `defineExtension()` declaration compiles to —
 * what a host syncs and what the coverage report reads. Core declares itself
 * with `defineExtension()` like any package and is announced through this.
 *
 * @internal Author a package with `defineExtension()`; this is the host's
 * view of it.
 */
export function announcementOf(e) {
    const builder = announce({
        ns: e.slug,
        author: e.author ?? e.slug,
        title: e.name,
        ...(e.repo !== undefined ? { repo: e.repo } : {}),
        ...(e.description !== undefined ? { summary: e.description } : {}),
    });
    if (e.hooks && Object.keys(e.hooks).length)
        builder.hooks(e.hooks);
    if (e.genres?.length)
        builder.genres(Object.fromEntries(e.genres.map((g) => [g.id, g])));
    if (e.pipelines?.length)
        builder.pipelines(...e.pipelines);
    if (e.prompts?.length)
        builder.prompts(...e.prompts);
    if (e.surfaces)
        builder.surfaces(e.surfaces);
    if (e.components?.length)
        builder.components(...e.components);
    // Already read down to ids by `defineExtension()`: the stored shapes go in as they are.
    const stored = builder;
    stored._configs.push(...(e.configs ?? []));
    stored._presets.push(...(e.presets ?? []));
    stored._swaps.push(...(e.swaps ?? []));
    builder._events.push(...(e.events ?? []));
    return builder.build();
}
//# sourceMappingURL=announce.js.map