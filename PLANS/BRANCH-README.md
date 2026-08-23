# `feature/0.6.0` — how to get it

The branch was built in a cloud sandbox, which has no push credentials and no
shell on your machine, so it travels as a git bundle rather than a pushed ref.

```bash
cd ~/path/to/serene-pub
git stash                 # if you have uncommitted work — see the note below
git fetch "/home/jody/Documents/Serene Pub Extensibility/serene-pub-feature-0.6.0.bundle" \
    feature/0.6.0:feature/0.6.0
git checkout feature/0.6.0
npm install --ignore-scripts   # see note 2
npm run sdk:build
```

The branch is based on `origin/main` at `91cef11` (*Merge pull request #105 from
doolijb/develop*). If your local main has moved, rebase rather than merge —
there are only three commits.

### Note 1 — your uncommitted changes

I could not commit them. This session runs in Anthropic's cloud with a
file bridge to your machine, not a shell, so `git` on your working copy is out
of reach. Nothing here touched your working tree. If you want that part done by
Claude, start the task again with **"Run this task" → on your computer** in the
desktop app, which gets a real shell in your folders.

### Note 2 — `npm install` in the sandbox

`onnxruntime-node`'s postinstall downloads a binary from a host the sandbox
blocks, so I installed with `--ignore-scripts`. On your machine a normal
`npm install` is fine; the flag is only mentioned so the lockfile diff makes
sense.

### What's on it

| commit | what |
|---|---|
| `17b323e` | vendor the SDK as four workspace packages + its suite |
| `5bf1d57` | pipeline spec storage (11 tables, 2 CHECK constraints), C1 against real rows |
| `1b0a300` | boot-time type registry sync with the frozen-version conflict rule |
| `b02088a` | host services, core bindings, and a pipeline that actually runs |
| `3b82bf3` | the assembly/dispatch seam, recorded with a recommendation |

**Verified:** 1341 app tests pass (193 files — main's 1326 unchanged, plus 20
new), 313 SDK tests pass, `npm run sdk:build` emits all four packages,
migration `0094_sparkling_blink.sql` generates and applies cleanly.

**Where it stands:** a spec loaded from rows reads real chat messages and
writes a real one back, through the SDK executor, inside core. `assemble` and
`generate-text` halt with a reason — they are blocked on a decision recorded
in `packages/INTEGRATING.md` step 3, "The seam this step actually hit".
