# `@serene-pub/cli`

Build-time tooling for Serene Pub plugins.

```bash
serene-pub check      # what core would refuse, and why — exits non-zero
serene-pub build      # manifest + pipeline documents into dist/plugin/
serene-pub contracts  # generate a /contracts module from a type registry
serene-pub ui         # the surface harness: preview announced UI, hot-reloading
serene-pub clone stats --as party-stats  # copy a core component's source into the package
serene-pub clone --list                  # the core components a package may copy
serene-pub drift      # has core changed since you cloned? which files?
```

`ui` starts a SvelteKit dev server that renders the UI surfaces your package
**announces** — frame panels in the same opaque-origin sandbox core mounts them
in, components in the host document — against editable fixtures. It reads the
announcement, never a directory scan, so a surface you preview is a surface an
instance would be offered. It needs `@serene-pub/ui-preview`, which is a
separate install: a package that ships no UI never pays for a frontend
toolchain.

`clone <core-slug>` copies a core component's source (`@serene-pub/core-catalog`'s
`dist/components/<slug>.source.json`) into `components/<as>/` with its paths kept, records
what it copied in `based-on.json`, and prints the `component({ …, basedOn })` and `widget({ … })`
declarations to paste; it never edits your entry module, refuses to overwrite without `--force`,
and never writes outside the package. It also prints what the copy, a plugin's widget, cannot
do: core-only request kinds, `<sp-host-view>` and `autofocus`. `drift` compares each
component's `basedOn.sourceHash` with core's source now and lists the files core changed (exit 1
when it did). See `guides/widgets.md` §2.

`build` prints the generated **"what this plugin cannot do"** list on every success. It is
computed from the manifest, so it cannot flatter — and an author who reads it here is not
surprised by it on a user's consent screen.

There is deliberately no `publish` and no `install`: installing an extension is an admin
action inside SP, and a CLI that could install is a CLI that can be scripted into installing.

Nothing here is importable by a running plugin. The packager computes a plugin's permissions
from its source; a plugin that could import the packager could argue with its own manifest.
