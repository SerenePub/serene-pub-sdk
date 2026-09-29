/**
 * The **sandbox-extension** authoring reference — the manifest shape a plugin's
 * entry point declares, compiled and validated here so drift is caught at build
 * time, not at install.
 *
 * This is a DISTINCT authoring surface from `compilePlugin` (./compiler): that
 * one packages a *pipeline* extension and derives `permissions` **compiled from
 * usage** in the pipeline taxonomy (`core:read`, `provider:call`, `event:…`).
 * A sandbox extension instead **declares** its permissions in the sandbox
 * taxonomy — `storage`, `network` (host allowlist, wildcards allowed),
 * `resource:*`, `event:*` — names its hooks directly, and runs on the QuickJS/SES
 * backends. The two models genuinely diverge on transport, permission derivation
 * and hook identity; they coexist here as separate surfaces for the 0.6.0 preview
 * and are reconciled in 0.7.0 rather than force-merged now. See the divergence
 * note in the app's project memory.
 *
 * Kept dependency-free and pure so it runs in any author toolchain; the app's
 * runtime reads exactly the manifest this emits (its `permissions.ts` interprets
 * `{ storage, network, resources, events }`).
 */


const ID_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+].+)?$/
// A declared fetch host: an exact host, a `*.suffix` / bare `*` wildcard, each
// with an optional `:port`. The app enforces the match + internal-IP block at
// call time; this only pins the authoring vocabulary.
const HOSTNAME_RE = /^(?:\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d+)?$/i

/** @internal */
export interface ManifestInput {
	/** "namespace/name" — lowercase, the stable address. */
	id: string
	name: string
	version: string
	/** Declared hook names (must be valid identifiers). */
	hooks?: string[]
	/** Declared UI component names. */
	components?: string[]
	/** Included pipeline slugs. */
	pipelines?: string[]
	/** Sequential-only execution (manifest-declared). */
	sequential?: boolean
	permissions?: {
		storage?: { quotaBytes?: number }
		network?: { hosts?: string[] }
		resources?: string[]
		events?: string[]
	}
}

/** @internal */
export interface CompiledManifest {
	id: string
	name: string
	version: string
	hooks: string[]
	components: string[]
	pipelines: string[]
	sequential: boolean
	permissions: {
		storage?: { quotaBytes: number }
		network?: { hosts: string[] }
		resources?: string[]
		events?: string[]
	}
}

/** A quota may be declared in bytes; keep it sane (1 KB … 256 MB). */
const MIN_QUOTA = 1024
const MAX_QUOTA = 256 * 1024 * 1024

function fail(msg: string): never {
	throw new Error(`manifest: ${msg}`)
}

function uniqueIdents(list: unknown, field: string): string[] {
	if (list == null) return []
	if (!Array.isArray(list)) fail(`${field} must be an array`)
	const out: string[] = []
	const seen = new Set<string>()
	for (const v of list) {
		if (typeof v !== "string" || !IDENT_RE.test(v))
			fail(`${field} entry '${String(v)}' is not a valid identifier`)
		if (!seen.has(v)) {
			seen.add(v)
			out.push(v)
		}
	}
	return out
}

/** @internal */
export function compileManifest(input: ManifestInput): CompiledManifest {
	if (!input || typeof input !== "object") fail("declaration is required")
	if (typeof input.id !== "string" || !ID_RE.test(input.id))
		fail(`id '${String(input.id)}' must be lowercase "namespace/name"`)
	if (typeof input.name !== "string" || input.name.trim() === "")
		fail("name is required")
	if (typeof input.version !== "string" || !SEMVER_RE.test(input.version))
		fail(`version '${String(input.version)}' must be semver (x.y.z)`)

	const hooks = uniqueIdents(input.hooks, "hooks")
	const components = uniqueIdents(input.components, "components")

	const pipelines: string[] = []
	for (const p of input.pipelines ?? []) {
		if (typeof p !== "string" || p.trim() === "")
			fail("pipelines entries must be non-empty strings")
		pipelines.push(p)
	}

	const permissions: CompiledManifest["permissions"] = {}
	const pin = input.permissions ?? {}
	if (pin.storage) {
		const q = pin.storage.quotaBytes ?? 5 * 1024 * 1024
		if (typeof q !== "number" || !Number.isFinite(q) || q < MIN_QUOTA || q > MAX_QUOTA)
			fail(`storage.quotaBytes must be ${MIN_QUOTA}…${MAX_QUOTA}`)
		permissions.storage = { quotaBytes: Math.floor(q) }
	}
	if (pin.network) {
		const hosts = pin.network.hosts ?? []
		if (!Array.isArray(hosts) || hosts.length === 0)
			fail("network requires a non-empty hosts allowlist")
		for (const host of hosts)
			if (typeof host !== "string" || !HOSTNAME_RE.test(host))
				fail(`network host '${String(host)}' is not a valid host, wildcard, or host:port`)
		permissions.network = { hosts: [...new Set(hosts)] }
	}
	if (pin.resources && pin.resources.length) {
		for (const r of pin.resources)
			if (typeof r !== "string" || r.trim() === "")
				fail("resources entries must be non-empty strings")
		permissions.resources = [...new Set(pin.resources)]
	}
	if (pin.events && pin.events.length) {
		for (const e of pin.events)
			if (typeof e !== "string" || e.trim() === "")
				fail("events entries must be non-empty strings")
		permissions.events = [...new Set(pin.events)]
	}

	return {
		id: input.id,
		name: input.name.trim(),
		version: input.version,
		hooks,
		components,
		pipelines,
		sequential: !!input.sequential,
		permissions
	}
}
