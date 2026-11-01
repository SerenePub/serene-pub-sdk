# What the SDK promises before 1.0

This page says what you can rely on today, what may still move, and where changes are announced.
It uses the words in the [vocabulary](vocabulary.md).

## What a pin like `@1` means

Every id a plugin names is `<namespace>:<kind>/<name>@<major>`, for example
`core:query/world-lore@1`. The trailing integer is the **pin**. The version lives in the id, so every
place that uses an id names the version it means.

A pin means one contract. The registry accepts a re-declaration whose contract is unchanged, and the
fresher display text wins. It refuses a re-declaration whose contract moved, and the error names both
hashes.

A pipeline is a published document, so it carries a semver instead, such as `1.21.0`. Publishing files
a document under its content hash. It never rewrites or deletes one, so a superseded version stays
readable by the runs that used it.

Until SDK 1.0, core keeps evolving its `@1` declarations in place. It does so additively, with defaults
for stored rows, rather than bumping to `@2`. The plan for 1.0 is that a change which breaks a contract
arrives under a new pin (`@2`) beside the old one. Nothing enforces that yet.

## What 🚧 and ⏳ mean

| Mark | Word | Meaning |
| --- | --- | --- |
| 🚧 | provisional | Designed or newly built. Its words and shape may still move once people use it. |
| ⏳ | transitional | Real today. It goes away on a known event, and the API reference names the version. |
| ⏸ | paused | Built, and switched off for now. |

A guide marks a whole section with a first line, `🚧 Provisional.` An unmarked word is meant to stay.

## The three export tags

Every export of a published package carries exactly one TSDoc tag.

| Tag | Meaning |
| --- | --- |
| `@public` | Part of the surface that 1.0 freezes. |
| `@experimental` | May still change. Anything marked 🚧 is `@experimental`. |
| `@internal` | For Serene Pub itself. Left out of the API reference. Never import one. |

A test keeps a list of the `@public` names, so growing or shrinking the frozen surface is a visible
change.

## What may still change before 1.0

SDK 1.0 ships with Serene Pub 0.7.0. The 0.7 cycle is spent stabilising the SDK. Until then, anything
marked 🚧, ⏳ or `@experimental` may change. So may:

- the manifest's field set,
- the permission key names,
- the on-disk package layout.

These harden by 0.7.0.

Prereleases such as `0.6.0-pr-7` are published to npm under the `next` tag. Every `@serene-pub/*`
package moves together at one version. While you build against a prerelease, pin an exact version in
your `package.json`.

## What never breaks

- **Data people made.** An upgrade never throws it away. Serene Pub upgrades its own stored data when
  it starts, and a 0.5.3 database is carried forward too.
- **Your plugin's stored data on upgrade.** Its annex documents are carried forward by the `migrate`
  lifecycle moment, which runs once per stored document. If your handler calls `halt(reason)`, the
  document stays as stored. Your storage files are kept apart from the package: an upgrade replaces
  what the package ships (its files, pipelines and shipped configs) and leaves them where they are.
  An uninstall removes the package's files and leaves your storage files too, so clean them up in an
  `uninstall` lifecycle callback. See [Storage](storage.md).
- **Rulesets your plugin ships.** Uninstalling retires them and never deletes them. A session keeps
  playing the version it started on until its owner updates it. See
  [Shipping a ruleset in a plugin package](rulesets.md#shipping-a-ruleset-in-a-plugin-package).
- **A run's receipt.** It keeps resolving the pipeline version it ran, because publishing never deletes.

## Where breaking changes are announced

In the SDK's release notes: <https://github.com/SerenePub/serene-pub-sdk/releases>. Every tag `vX.Y.Z`
gets a GitHub release there, with install lines and GitHub's generated change list. A tag with a suffix
(`-pr-N`, `-rc-N`) is marked a pre-release. The SDK repository has no changelog file, so the release
notes are the place to look.

For more, see [What a plugin can do](extending.md) and [the vocabulary](vocabulary.md).
