// The SDK's release tooling — Node built-ins only, so it runs before `npm install`.
// RELEASING.md is the walkthrough; `.github/workflows/publish.yml` is the caller.
//
//   node scripts/release.mjs set <version>      every workspace's version, every inter-package
//                                               range, the plugin scaffold's ranges, the lockfile
//   node scripts/release.mjs check [--tag vX]   refuse unless every published package is ready to
//                                               publish (and, with --tag, carries the tag's version)
//   node scripts/release.mjs order              the published packages, dependency order, one per line
//   node scripts/release.mjs clean              delete the tsc-built dist folders (see CLEANED)
//   node scripts/release.mjs stage              copy LICENSE and NOTICE into each published package
//   node scripts/release.mjs publish [--dry-run]  publish, in order, each package whose version npm
//                                               does not already have — safe to re-run after a failure
//
// Range rules (the reason `set` exists — prerelease ranges only match their own
// major.minor.patch, so a stale range silently stops matching):
//   devDependencies on a workspace package           exactly <version>  (resolves to the workspace link)
//   dependencies / peerDependencies on one            ^<version>
import { spawnSync } from 'node:child_process'
import {
	copyFileSync,
	existsSync,
	readFileSync,
	rmSync,
	writeFileSync,
	appendFileSync,
} from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Published packages, in an order where each one's dependencies and peers come first. */
const PUBLISHED = [
	'sdk',
	'contracts',
	'conformance',
	'docs',
	'component-client',
	'controls',
	'core-catalog',
	'ui-preview',
	'cli',
]

/**
 * Packages whose `dist` is tsc output. `dist` is tracked in git and tsc never
 * deletes a module whose source is gone, so a release build starts from none.
 */
const CLEANED = ['sdk', 'contracts', 'conformance', 'docs', 'cli', 'core-catalog']

/** Files every published package carries from the repo root (Apache-2.0 §4). */
const STAGED = ['LICENSE', 'NOTICE']

const REPO_URL = 'git+https://github.com/SerenePub/serene-pub-sdk.git'
const LICENSE = 'Apache-2.0'
const SCAFFOLD_TEMPLATE = 'cli/templates/plugin/base/package.json.tmpl'
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies']
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const writeJson = (rel, value) =>
	writeFileSync(join(ROOT, rel), JSON.stringify(value, null, '\t') + '\n')

const rootPkg = () => readJson('package.json')
const workspaces = () => rootPkg().workspaces
const pkgOf = (dir) => readJson(join(dir, 'package.json'))
/** Workspace package name → its directory. */
const workspaceNames = () => new Map(workspaces().map((dir) => [pkgOf(dir).name, dir]))

/** What a range on a workspace package must be, by the field it sits in. */
const rangeFor = (field, version) => (field === 'devDependencies' ? version : `^${version}`)

/* ── set ──────────────────────────────────────────────────────────────────── */

function set(version) {
	if (!SEMVER.test(version ?? '')) fail(`'${version}' is not a semver version (e.g. 0.6.0-pr-2)`)
	const names = workspaceNames()
	const root = rootPkg()
	root.version = version
	writeJson('package.json', root)
	for (const dir of workspaces()) {
		const pkg = pkgOf(dir)
		pkg.version = version
		for (const field of [...DEP_FIELDS, 'devDependencies'])
			for (const name of Object.keys(pkg[field] ?? {}))
				if (names.has(name)) pkg[field][name] = rangeFor(field, version)
		writeJson(join(dir, 'package.json'), pkg)
	}
	setScaffold(version)
	setLockfile()
	console.log(
		`every workspace is ${version}; run \`npm run build\` (core-catalog stamps its version into dist)`,
	)
}

/** The plugin scaffold depends on the SDK release its CLI shipped with. */
function setScaffold(version) {
	const path = join(ROOT, SCAFFOLD_TEMPLATE)
	const text = readFileSync(path, 'utf8')
	writeFileSync(path, text.replace(/("@serene-pub\/[a-z-]+": ")[^"]*(")/g, `$1^${version}$2`))
}

/**
 * Mirror each workspace's manifest into package-lock.json the way `npm install`
 * records it, so the lockfile agrees without an install. CI runs `npm install`,
 * which would rewrite it anyway; this keeps the committed copy honest.
 */
function setLockfile() {
	if (!existsSync(join(ROOT, 'package-lock.json'))) return
	const lock = readJson('package-lock.json')
	const root = rootPkg()
	lock.version = root.version
	if (lock.packages?.['']) lock.packages[''].version = root.version
	const FIELDS = [
		'name',
		'version',
		'license',
		'dependencies',
		'bin',
		'devDependencies',
		'peerDependencies',
		'peerDependenciesMeta',
		'optionalDependencies',
		'engines',
	]
	for (const dir of workspaces()) {
		if (!lock.packages?.[dir]) continue
		const pkg = pkgOf(dir)
		const entry = {}
		for (const f of FIELDS) if (pkg[f] !== undefined) entry[f] = pkg[f]
		// npm records bin targets without the leading `./`.
		if (entry.bin && typeof entry.bin === 'object')
			entry.bin = Object.fromEntries(
				Object.entries(entry.bin).map(([k, v]) => [k, v.replace(/^\.\//, '')]),
			)
		lock.packages[dir] = entry
	}
	writeJson('package-lock.json', lock)
}

/* ── check ────────────────────────────────────────────────────────────────── */

function check(tag) {
	const problems = []
	const names = workspaceNames()
	const publishedNames = new Set(PUBLISHED.map((dir) => pkgOf(dir).name))
	const version = pkgOf(PUBLISHED[0]).version
	if (!SEMVER.test(version)) problems.push(`${PUBLISHED[0]}: version '${version}' is not semver`)
	if (tag !== undefined && tag.replace(/^v/, '') !== version)
		problems.push(`tag '${tag}' does not match the packages' version ${version}`)

	for (const dir of workspaces()) {
		const pkg = pkgOf(dir)
		if (pkg.version !== version)
			problems.push(
				`${dir}: version ${pkg.version}, expected ${version} (every workspace moves together — \`node scripts/release.mjs set\`)`,
			)
		for (const field of [...DEP_FIELDS, 'devDependencies'])
			for (const [name, range] of Object.entries(pkg[field] ?? {}))
				if (names.has(name) && range !== rangeFor(field, version))
					problems.push(
						`${dir}: ${field}['${name}'] is '${range}', expected '${rangeFor(field, version)}'`,
					)
	}

	PUBLISHED.forEach((dir, i) => {
		const pkg = pkgOf(dir)
		const at = (msg) => problems.push(`${dir}: ${msg}`)
		if (pkg.private === true) at('is private, but is in PUBLISHED')
		if (!pkg.name?.startsWith('@serene-pub/'))
			at(`name '${pkg.name}' is outside the @serene-pub scope`)
		if (pkg.license !== LICENSE) at(`license '${pkg.license}', expected ${LICENSE}`)
		if (pkg.repository?.url !== REPO_URL || pkg.repository?.directory !== dir)
			at(
				`repository must be { url: '${REPO_URL}', directory: '${dir}' } — npm checks provenance against it`,
			)
		if (pkg.publishConfig?.access !== 'public')
			at('publishConfig.access must be "public" (a scoped package defaults to restricted)')
		if (pkg.publishConfig?.tag !== 'next')
			at('publishConfig.tag must be "next", so a stray manual publish never takes `latest`')
		if (!pkg.engines?.node) at('engines.node is missing')
		if (!pkg.description) at('description is missing')
		if (!Array.isArray(pkg.files))
			at('files is missing — without it npm packs the whole folder')
		if (!existsSync(join(ROOT, dir, 'README.md')))
			at('README.md is missing — it is the npm page')
		for (const target of entryTargets(pkg))
			if (!covered(target, pkg.files ?? []))
				at(`'${target}' is an entry point but not in files`)
		for (const field of DEP_FIELDS)
			for (const name of Object.keys(pkg[field] ?? {})) {
				if (!names.has(name)) continue
				if (!publishedNames.has(name)) at(`${field} names ${name}, which is not published`)
				else if (PUBLISHED.indexOf(names.get(name)) > i)
					at(`depends on ${name}, which PUBLISHED lists after it`)
			}
	})

	const scaffold = readFileSync(join(ROOT, SCAFFOLD_TEMPLATE), 'utf8')
	for (const [, name, range] of scaffold.matchAll(/"(@serene-pub\/[a-z-]+)": "([^"]*)"/g)) {
		if (range !== `^${version}`)
			problems.push(`${SCAFFOLD_TEMPLATE}: '${name}' is '${range}', expected '^${version}'`)
		if (!publishedNames.has(name))
			problems.push(`${SCAFFOLD_TEMPLATE}: '${name}' is not published`)
	}

	if (problems.length) fail(`not ready to publish ${version}:\n  - ${problems.join('\n  - ')}`)
	console.log(
		`ready: ${PUBLISHED.length} packages at ${version}${tag ? `, matching tag ${tag}` : ''}`,
	)
}

/** Every path a consumer can reach through main/types/svelte/bin/exports. */
function entryTargets(pkg) {
	const out = []
	const walk = (v) => {
		if (typeof v === 'string') out.push(v)
		else if (v && typeof v === 'object') Object.values(v).forEach(walk)
	}
	walk([pkg.main, pkg.types, pkg.svelte, pkg.bin, pkg.exports])
	return out.filter((p) => p.startsWith('./') && p !== './package.json')
}

/** Whether `files` ships `target` (a `*` matches within one directory listed in files). */
function covered(target, files) {
	const path = target.replace(/^\.\//, '').replace(/\*.*$/, '')
	return files.some(
		(f) => !f.startsWith('!') && (path === f || path.startsWith(`${f.replace(/\/$/, '')}/`)),
	)
}

/* ── clean / stage ────────────────────────────────────────────────────────── */

function clean() {
	for (const dir of CLEANED) rmSync(join(ROOT, dir, 'dist'), { recursive: true, force: true })
	console.log(`removed dist in ${CLEANED.join(', ')}`)
}

function stage() {
	for (const dir of PUBLISHED)
		for (const f of STAGED) copyFileSync(join(ROOT, f), join(ROOT, dir, f))
	console.log(`copied ${STAGED.join(' + ')} into ${PUBLISHED.length} packages`)
}

/* ── publish ──────────────────────────────────────────────────────────────── */

/** Whether npm already has `name@version`. Throws on anything but a clean yes or no. */
function onRegistry(name, version) {
	for (let attempt = 1; ; attempt++) {
		const r = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--json'], {
			encoding: 'utf8',
		})
		if (r.status === 0) return r.stdout.trim() !== '' && JSON.parse(r.stdout) === version
		if (/E404/.test(r.stderr) || /E404/.test(r.stdout)) return false
		if (attempt === 3) throw new Error(`npm view ${name}@${version} failed:\n${r.stderr}`)
	}
}

function publish(dryRun) {
	const version = pkgOf(PUBLISHED[0]).version
	const tag = process.env.NPM_DIST_TAG || (version.includes('-') ? 'next' : 'latest')
	const provenance = process.env.PROVENANCE === 'true' && !dryRun
	const done = []
	for (const dir of PUBLISHED) {
		const { name } = pkgOf(dir)
		if (onRegistry(name, version)) {
			console.log(`skip     ${name}@${version} — already on npm`)
			done.push(`| ${name} | skipped — already on npm |`)
			continue
		}
		const args = ['publish', '--workspace', dir, '--tag', tag, '--access', 'public']
		if (provenance) args.push('--provenance')
		if (dryRun) args.push('--dry-run')
		console.log(`\n${dryRun ? 'dry-run ' : 'publish  '}${name}@${version} → ${tag}`)
		const r = spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit' })
		if (r.status !== 0) {
			summary(version, tag, dryRun, [...done, `| ${name} | **failed** |`])
			fail(
				`npm publish failed for ${name}; packages before it are published — re-run the workflow to continue`,
			)
		}
		done.push(
			`| ${name} | ${dryRun ? 'dry run' : `published${provenance ? ' with provenance' : ''}`} |`,
		)
	}
	summary(version, tag, dryRun, done)
}

function summary(version, tag, dryRun, rows) {
	const file = process.env.GITHUB_STEP_SUMMARY
	if (!file) return
	appendFileSync(
		file,
		`### ${dryRun ? 'Dry run: ' : ''}${version} → \`${tag}\`\n\n| package | result |\n|---|---|\n${rows.join('\n')}\n`,
	)
}

/* ── cli ──────────────────────────────────────────────────────────────────── */

function fail(message) {
	console.error(`release: ${message}`)
	process.exit(1)
}

const [command, ...rest] = process.argv.slice(2)
const flag = (name) => {
	const i = rest.indexOf(name)
	return i === -1 ? undefined : (rest[i + 1] ?? '')
}
switch (command) {
	case 'set':
		set(rest[0])
		break
	case 'check':
		check(flag('--tag') || undefined)
		break
	case 'order':
		console.log(PUBLISHED.join('\n'))
		break
	case 'clean':
		clean()
		break
	case 'stage':
		stage()
		break
	case 'publish':
		publish(rest.includes('--dry-run'))
		break
	default:
		fail(
			'usage: node scripts/release.mjs set <version> | check [--tag vX] | order | clean | stage | publish [--dry-run]',
		)
}
