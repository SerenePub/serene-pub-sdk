# `@serene-pub/cli`

Build-time tooling for Serene Pub plugins.

```bash
serene-pub check      # what core would refuse, and why — exits non-zero
serene-pub build      # manifest + pipeline documents into dist/plugin/
serene-pub contracts  # generate a /contracts module from a type registry
serene-pub ui         # the surface harness: preview announced UI, hot-reloading
```

`ui` starts a SvelteKit dev server that renders the UI surfaces your package
**announces** — frame panels in the same opaque-origin sandbox core mounts them
in, components in the host document — against editable fixtures. It reads the
announcement, never a directory scan, so a surface you preview is a surface an
instance would be offered. It needs `@serene-pub/ui-preview`, which is a
separate install: a package that ships no UI never pays for a frontend
toolchain.

`build` prints the generated **"what this plugin cannot do"** list on every success. It is
computed from the manifest, so it cannot flatter — and an author who reads it here is not
surprised by it on a user's consent screen.

There is deliberately no `publish` and no `install`: installing an extension is an admin
action inside SP, and a CLI that could install is a CLI that can be scripted into installing.

Nothing here is importable by a running plugin. The packager computes a plugin's permissions
from its source; a plugin that could import the packager could argue with its own manifest.
