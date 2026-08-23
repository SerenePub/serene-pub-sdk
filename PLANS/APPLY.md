# Applying both bundles

I have file read/write on your machine through the desktop bridge, but **no
shell** — so I cannot run git there. Each of these is one command you run.

## 1. serene-pub — the feature/0.6.0 branch

The bundle is already in the repo folder. It is based on `93fd4b1`, which your
`develop` already contains.

```sh
cd ~/github/serene-pub
git fetch feature-0.6.0.bundle feature/0.6.0:feature/0.6.0
git checkout feature/0.6.0
rm feature-0.6.0.bundle
```

Then push it yourself — the sandbox's git proxy refuses to inject a credential
for `doolijb/serene-pub`, so I cannot:

```sh
git push -u origin feature/0.6.0
```

**Note on the base.** Your `develop` has moved 5 commits ahead of where this
branch was cut (shared base `93fd4b1`). Nothing conflicts yet, but the longer it
sits the more there is to reconcile — worth a `git merge develop` early rather
than at the end.

## 2. serene-pub-sdk — the new repository

```sh
cd ~/github/serene-pub-sdk
git init -b main
git fetch serene-pub-sdk.bundle main
git reset --hard FETCH_HEAD
rm serene-pub-sdk.bundle
npm install && npm test        # 315 tests, verified from a clean clone
git remote add origin git@github.com:doolijb/serene-pub-sdk.git
git push -u origin main
```

It carries the SDK's real history via `git subtree split -P packages` — eight
commits, not one squashed import.

## What I did NOT do, and why

**serene-pub still vendors `packages/`.** You chose "npm versions + local link",
and that switch cannot land until `@serene-pub/*` is actually published:
stripping `packages/` now would leave `npm install` unable to resolve them, so
a fresh clone — and CI, and Docker — would fail.

The order that works:

1. publish `0.6.0-preview.0` from serene-pub-sdk (`npm publish --tag preview`
   in each of `sdk`, `contracts`, `cli`, `conformance`)
2. in serene-pub: delete `packages/`, drop the `workspaces` field, add
   `@serene-pub/sdk` and `@serene-pub/contracts` at `0.6.0-preview.0`
3. `npm install`, run the suite, commit

That is one small commit once step 1 is done, and I can make it as soon as the
packages resolve. Until then the vendored copy is what keeps the branch
building.

## Two things worth a decision

**Licence.** The SDK inherited AGPL-3.0 from Serene Pub. A copyleft licence on
an SDK reaches the plugins that link it, which may not be what you want for a
plugin ecosystem — the usual shape is a permissive SDK with the application
staying AGPL. Flagged in the SDK README rather than decided.

**Prettier.** The SDK sources are written single-quote; serene-pub's config says
`singleQuote: false`. That mismatch is how a stray format run of mine reformatted
31 files that had no other change. The new repo declares its own config, so the
two no longer fight — but if you would rather they match, that is a one-time
reformat to do deliberately.
