# Releasing the SDK

Every published package moves together: one version, one tag, one run of
[`.github/workflows/publish.yml`](.github/workflows/publish.yml). The workflow builds from
nothing, runs the suite, and publishes each package npm does not already have at that version.
`scripts/release.mjs` does the bookkeeping, locally and in CI.

## What is published

In this order — each package's dependencies and peers come before it:

| package                        | why it is published                                                |
| ------------------------------ | ------------------------------------------------------------------ |
| `@serene-pub/sdk`              | the runtime every other package builds on                          |
| `@serene-pub/contracts`        | the node types core ships                                          |
| `@serene-pub/conformance`      | the host conformance kit; the plugin scaffold's package checks     |
| `@serene-pub/docs`             | the docs compiler; `@serene-pub/cli`'s root entry imports it       |
| `@serene-pub/component-client` | what a remote component imports; a dependency of `@serene-pub/cli` |
| `@serene-pub/controls`         | the Svelte control per value-type id                               |
| `@serene-pub/core-catalog`     | core's announcement and components                                 |
| `@serene-pub/ui-preview`       | the surface harness `serene-pub ui` launches                       |
| `@serene-pub/cli`              | the `serene-pub` command                                           |

`sdk-tests`, `playground` and `api-docs` are private.

A prerelease (`0.6.0-pr-2`) is published under the `next` dist-tag, a release (`0.6.0`) under
`latest`. Every package also sets `publishConfig.tag: "next"`, so a manual `npm publish` never
moves `latest` by accident. npm gives a package that has no `latest` yet its first version under
`latest` too, so expect `latest` to read `0.6.0-pr-2` until the first release replaces it.

## One-time setup

1. **Create the npm organization** `serene-pub` (npmjs.com → your avatar → _Add Organization_;
   the free plan covers public packages). The org name is the `@serene-pub` scope. Turn on
   two-factor authentication for your npm account if it is not on already.
2. **Create a token for the first publish.** npmjs.com → _Access Tokens_ → _Generate New Token_ →
   _Granular Access Token_: permission _Read and write_, scope `@serene-pub`, a short expiry
   (7 days), and tick _Bypass two-factor authentication_ (CI cannot answer a 2FA prompt). Save it
   on GitHub as the repository secret **`NPM_TOKEN`** (_Settings → Secrets and variables →
   Actions_).

    Why a token at all: trusted publishing is configured on a package's own settings page, and a
    package has no settings page until its first version exists. The token gets the nine packages
    onto npm once; trusted publishing takes over from there.

3. **Release** — see below. The first run publishes all nine packages with the token, with
   provenance.
4. **Configure trusted publishing on each of the nine packages.** npmjs.com → the package →
   _Settings_ → _Trusted Publisher_ → _GitHub Actions_:
    - Organization or user: `SerenePub`
    - Repository: `serene-pub-sdk`
    - Workflow filename: `publish.yml`
    - Environment: leave empty

    Then, on the same page, set _Publishing access_ to _Require two-factor authentication and
    disallow tokens_. Trusted publishing keeps working; tokens stop.

5. **Delete the `NPM_TOKEN` secret** on GitHub and revoke the token on npm. Every later run
   authenticates through the workflow's OIDC token — nothing is stored.

## Cutting a release

```sh
node scripts/release.mjs set 0.6.0-pr-2          # or: npm run release:set -- 0.6.0-pr-2
npm run build                                    # core-catalog stamps the version into dist
npm test -w @serene-pub/sdk-tests
node scripts/release.mjs check --tag v0.6.0-pr-4 # or: npm run release:check -- --tag v0.6.0-pr-4
```

`set` moves every workspace's version, every range one workspace package holds on another, the
plugin scaffold's dependency ranges (`cli/templates/plugin/base/package.json.tmpl`) and the
lockfile. Commit the result, push it, then tag the commit:

```sh
git tag v0.6.0-pr-4
git push origin v0.6.0-pr-4
```

The tag starts the workflow. It refuses to publish unless the tag names the version every package
carries. The run's summary lists each package as published or skipped.

**Dry run.** _Actions → Publish SDK packages → Run workflow_ with _Dry run_ ticked, from any branch:
everything up to `npm publish --dry-run`, and nothing reaches npm. Run it with _Dry run_ off only
from a tag (choose it under _Use workflow from_); from a branch the run refuses.

**A run that failed part-way.** Re-run it. A package whose version is already on npm is skipped,
so the run picks up where it stopped. npm never accepts the same version twice, even after an
unpublish, so a broken release is fixed by publishing the next version.

## Versions and ranges

| where one package names another    | range                                                |
| ---------------------------------- | ---------------------------------------------------- |
| `devDependencies`                  | exactly `<version>` — resolves to the workspace link |
| `dependencies`, `peerDependencies` | `^<version>`                                         |

A prerelease range only matches prereleases of its own `major.minor.patch`, and prerelease tags
compare as text: `>=0.6.0-preview.0` does **not** match `0.6.0-pr-2`, because `pr-1` sorts before
`preview`. A range left behind by a version change stops matching without an error until someone
installs. `release.mjs check` refuses any range that is not the one above.

## What the workflow does

1. `release.mjs check` — every package is ready to publish (version, ranges, `repository` with
   `directory` (npm checks provenance against it), `publishConfig`, `engines`, `files` covering
   every entry point, a README) and matches the tag.
2. `npm install`, then `release.mjs clean` and `npm run build`. `dist` is not tracked in git, and
   cleaning first means the published build starts empty (`tsc` never deletes a module whose
   source is gone).
3. `npm test --prefix sdk-tests`. Tests that read the app repository (`../serene-pub`) skip
   themselves when it is absent, and say so.
4. `release.mjs stage` copies the root `LICENSE` and `NOTICE` into each package (Apache-2.0 §4).
   The copies are gitignored.
5. `npm pack --dry-run` per package, into the log.
6. `release.mjs publish` — `npm publish --workspace <dir> --tag <next|latest> --provenance` per
   package, in order, skipping any version npm already has.

To see what a package would ship without CI:

```sh
npm run build
node scripts/release.mjs stage
npm pack --dry-run -w @serene-pub/cli
```

## The GitHub release

A real publish from a tag also creates (or updates) the GitHub release for that tag:
the nine package tarballs exactly as npm received them, plus `SHA256SUMS`, and a short
body with install lines and npm links (GitHub's generated change list follows it).

- `vX.Y.Z` is a normal release and becomes the repository's latest.
- Any suffix — `-pr-N`, `-rc-N`, `-alpha`, `-beta`, `-dev` — is marked a **pre-release**
  and never becomes latest; npm gets it under `next`.

A dry run never creates a release. A tag published before this job existed
(`v0.6.0-pr-4`) gets its release by hand (Releases → Draft a new release → that tag →
tick "Set as a pre-release"): running the workflow "from" an old tag uses the workflow
file as it was at that tag, which has no release job.
