import { compile } from './document.js';
const isDocument = (s) => 'schemaVersion' in s;
export function use(ref) {
    const m = /^(.*?)@([~^]?\d[^@]*)$/.exec(ref);
    return Object.freeze(m
        ? { kind: 'external-ref', id: m[1], range: m[2] }
        : { kind: 'external-ref', id: ref });
}
const refId = (v) => typeof v === 'string'
    ? v
    : 'kind' in v && v.kind === 'external-ref'
        ? v.id
        : v.id;
import { genre as makeGenre, genreIdOf, sessionEvents, } from './genres.js';
import { makeValueToolkit, isTodo } from './values.js';
import { isServableEntry, isServablePanelId } from './surfaces.js';
/**
 * Author a config against a spec handle (announced or external). With a
 * BuiltSpec handle the node keys are validated at announce-compile; with a
 * bare id they are recorded and verified by the instance that has the spec.
 */
export function config(spec, slug, meta, values) {
    return {
        spec: refId(spec),
        slug,
        label: meta.label,
        description: meta.description,
        values: values,
    };
}
export function preset(slug, props) {
    const bindings = {};
    for (const [event, b] of Object.entries(props.bindings)) {
        const [specRef, configRef] = Array.isArray(b) ? b : [b, undefined];
        bindings[event] = {
            spec: refId(specRef),
            ...(configRef !== undefined
                ? { config: typeof configRef === 'string' ? configRef : configRef.slug }
                : {}),
        };
    }
    return {
        slug,
        genre: genreIdOf(props.genre),
        label: props.label,
        description: props.description,
        bindings,
        ...(props.actions
            ? {
                actions: {
                    include: props.actions.include.map(refId),
                },
            }
            : {}),
        ...(props.defaults ? { defaults: props.defaults } : {}),
        // Omitted rather than defaulted to `false`, so a declaration that says
        // nothing hashes as it always did — the announcement is content-hashed
        // like every other declaration here.
        ...(props.enabled === undefined ? {} : { enabled: props.enabled }),
    };
}
const NS = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
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
        this._configs.push(...configs);
        return this;
    }
    prompts(...prompts) {
        this._prompts.push(...prompts);
        return this;
    }
    presets(...presets) {
        this._presets.push(...presets);
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
     * Validate the announcement as a whole and compile it to the document.
     * Errors carry exact paths — the teaching-error pattern (15 §1.3).
     */
    build() {
        const errors = [];
        const ns = this.identity.ns;
        const announcedSpecs = new Map(this._pipelines.map((s) => [s.id, s]));
        const requires = new Set();
        // Every announced id lives under the package namespace.
        for (const s of this._pipelines) {
            const owner = s.id.includes(':') ? s.id.slice(0, s.id.indexOf(':')) : undefined;
            if (owner !== ns)
                errors.push(`pipeline '${s.id}' is not under this package's namespace '${ns}'`);
        }
        // The input lock (24 §4): session-event specs verified; external genres recorded.
        const sessionEventSet = new Set(Object.values(sessionEvents));
        for (const s of this._pipelines) {
            if (!s.input?.event)
                continue;
            const genreId = s.input.genre;
            if (!genreId) {
                // The builder refuses this at authoring time; a hand-built
                // document gets the same answer here.
                errors.push(`pipeline '${s.id}' answers '${s.input.event}' with no genre (24 §4)`);
                continue;
            }
            if (!this._genres.has(genreId))
                requires.add(genreId);
            if (!sessionEventSet.has(s.input.event) &&
                !s.input.event.includes(':') // custom events carry their namespace
            )
                errors.push(`pipeline '${s.id}' answers unknown event '${s.input.event}' — core events ` +
                    `come from sessionEvents; custom ones are namespaced ('${ns}:your-event')`);
        }
        // Exactly one create pipeline per declared genre (24 §3).
        for (const g of this._genres.values()) {
            const creates = this._pipelines.filter((s) => s.input?.genre === g.id && s.input?.event === sessionEvents.sessionCreated);
            if (creates.length === 0)
                errors.push(`genre '${g.id}' has no create pipeline — every genre needs exactly one ` +
                    `spec answering '${sessionEvents.sessionCreated}' (24 §3)`);
            if (creates.length > 1)
                errors.push(`genre '${g.id}' has ${creates.length} create pipelines ` +
                    `(${creates.map((s) => s.id).join(', ')}) — exactly one (24 §3)`);
        }
        // Prompts: slugs unique per POOL, which is `(node type, slot)`.
        //
        // Uniqueness is per pool and not global: `summarize-scene-default` names
        // a row in the batch, synth and naming pools, and they are three
        // different prompts that happen to have been split out of one bundle.
        //
        // A prompt for a node this package does not announce is deliberately NOT
        // recorded as a requirement, which is the one thing that changed here
        // besides the key. It is the whole point of node scoping that a package
        // may ship prose for somebody else's node, and a node type is neither a
        // genre nor a spec slug — the only two shapes an instance can check
        // (`requirements.ts`). Listing one would make every install of the
        // package fail permanently on a requirement nothing can ever satisfy,
        // where the real failure mode is mild and self-announcing: the row seeds
        // into a pool no installed pipeline offers, and is simply never shown.
        const seenPrompts = new Set();
        for (const pr of this._prompts) {
            const pool = `${pr.nodeType}#${pr.slot}`;
            const key = `${pool}#${pr.slug}`;
            if (seenPrompts.has(key))
                errors.push(`duplicate prompt '${pr.slug}' for '${pool}'`);
            seenPrompts.add(key);
        }
        // Configs: node keys verified for announced specs; slugs unique per spec.
        const configKey = (c) => `${c.spec}#${c.slug}`;
        const seenConfigs = new Set();
        for (const c of this._configs) {
            if (seenConfigs.has(configKey(c)))
                errors.push(`duplicate config '${c.slug}' for '${c.spec}'`);
            seenConfigs.add(configKey(c));
            const target = announcedSpecs.get(c.spec);
            if (!target) {
                requires.add(c.spec);
                continue;
            }
            for (const nodeKey of Object.keys(c.values))
                if (!target.nodes.some((n) => n.key === nodeKey))
                    errors.push(`config '${c.slug}' for '${c.spec}' addresses unknown node '${nodeKey}'`);
        }
        // Presets: validated against the genre's event surface (24 §7).
        const coverage = { presets: [], todos: [] };
        for (const p of this._presets) {
            const g = this._genres.get(p.genre);
            if (!g)
                requires.add(p.genre);
            const surface = g
                ? { ...g.events }
                : {};
            // Slots the preset binds beyond the declared surface are errors when
            // the genre is ours to know; recorded when it is not.
            const slots = [];
            const events = new Set([...Object.keys(surface), ...Object.keys(p.bindings)]);
            for (const event of events) {
                const declared = surface[event];
                const binding = p.bindings[event];
                if (g && !declared && binding) {
                    errors.push(`preset '${p.slug}' binds '${event}', which genre '${p.genre}' does not declare`);
                    continue;
                }
                if (!binding) {
                    const required = !!declared?.required;
                    if (required)
                        errors.push(`preset '${p.slug}' leaves required slot '${event}' of '${p.genre}' unbound`);
                    slots.push({
                        event,
                        required,
                        status: required ? 'MISSING' : 'unbound',
                    });
                    continue;
                }
                const bound = announcedSpecs.get(binding.spec);
                if (!bound) {
                    requires.add(binding.spec);
                    slots.push({
                        event,
                        required: !!declared?.required,
                        binding,
                        status: 'bound-external',
                    });
                }
                else {
                    if (bound.input?.event !== event)
                        errors.push(`preset '${p.slug}' binds '${bound.id}' to '${event}', but that spec ` +
                            `answers '${bound.input?.event ?? 'nothing'}' (24 §4)`);
                    if (bound.input?.genre !== p.genre)
                        errors.push(`preset '${p.slug}' (genre '${p.genre}') binds '${bound.id}', which ` +
                            `serves '${bound.input?.genre ?? 'no genre'}' (24 §4)`);
                    if (binding.config &&
                        !this._configs.some((c) => c.spec === binding.spec && c.slug === binding.config))
                        errors.push(`preset '${p.slug}' names config '${binding.config}' of ` +
                            `'${binding.spec}', which this package does not declare`);
                    slots.push({
                        event,
                        required: !!declared?.required,
                        binding,
                        status: 'bound',
                    });
                }
            }
            for (const a of p.actions?.include ?? [])
                if (!announcedSpecs.has(a))
                    requires.add(a);
            coverage.presets.push({ preset: p.slug, genre: p.genre, slots });
        }
        // Surfaces and components: an entry that does not exist at install is a
        // blank panel nobody can debug, so the shape is checked where the author
        // can still fix it. What is *at* the path is the packager's business.
        const panelIds = new Set();
        for (const [i, p] of (this._surfaces?.panels ?? []).entries()) {
            if (!p?.id)
                errors.push(`surfaces.panels[${i}] has no id — a layout row keys on it`);
            else if (panelIds.has(p.id))
                errors.push(`duplicate panel id '${p.id}' — ids are the layout key (21 §6)`);
            else {
                panelIds.add(p.id);
                if (!isServablePanelId(p.id))
                    errors.push(`panel id '${p.id}' is not one an instance accepts (lowercase letters, ` +
                        `digits, '-' and '_') — it would be dropped silently at install`);
            }
            if (!p?.entry)
                errors.push(`surfaces.panels[${i}] has no entry document`);
            else if (!isServableEntry(p.entry))
                errors.push(`surfaces.panels[${i}] entry '${p.entry}' is not a path an instance will ` +
                    `serve — it would be dropped silently at install`);
        }
        for (const [where, decl] of [
            ['session-view', this._surfaces?.['session-view']],
            ['page', this._surfaces?.page],
        ]) {
            if (decl && !decl.entry)
                errors.push(`surfaces.${where} has no entry document`);
            else if (decl?.entry && !isServableEntry(decl.entry))
                errors.push(`surfaces.${where} entry '${decl.entry}' is not a path an instance will serve`);
        }
        const componentSlugs = new Set();
        for (const [i, c] of this._components.entries()) {
            if (!c?.slug)
                errors.push(`components[${i}] has no slug — slugs are the sync key (12 §3b)`);
            else if (componentSlugs.has(c.slug))
                errors.push(`duplicate component slug '${c.slug}' (12 §3b)`);
            else
                componentSlugs.add(c.slug);
            if (!c?.entry)
                errors.push(`components[${i}] ('${c?.slug ?? '?'}') has no entry`);
            if (!c?.surface)
                errors.push(`components[${i}] ('${c?.slug ?? '?'}') names no surface point`);
        }
        // Deliberate holes: todo() sentinels, listed with their paths (24 §7).
        for (const c of this._configs)
            for (const [nodeKey, slots] of Object.entries(c.values))
                for (const [slot, value] of Object.entries(slots))
                    if (isTodo(value))
                        coverage.todos.push({
                            path: `${c.spec}#${c.slug} → ${nodeKey}.${slot}`,
                            note: value['todo@1'].note,
                        });
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
                requires: [...requires].sort(),
            },
            coverage,
        };
    }
}
/** Build refusal that still carries the coverage — the report is the error's context. */
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
export function announce(identity) {
    return new AnnouncementBuilder(identity);
}
//# sourceMappingURL=announce.js.map