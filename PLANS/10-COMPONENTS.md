# 10 — UI Components and Surfaces

**Status:** New, consolidated 2026-08-17. Extends the loader ABI and surface registry formerly in
03 §3–§4. Implements F24. **0.6 ships the `virtual` tier only.**

## 1. Surfaces — an open registry of versioned UI points

- Surface ids are pins: `core:surface/chat-message@1`. The set is open; contracts are versioned
  per point.
- **Invasiveness ladder**, each tier a bigger contract on the same mechanism:
  1. **Leaf** — message renderer, message actions, composer actions, facet blocks, settings
     sections. Props in, events out. **0.6.**
  2. **Container** — sidebar panel, then sidebar replacement. Adds host services: navigation,
     selection state, panel lifecycle. **0.7.**
  3. **Structural** — `layout.root`. Enabled by exporting SP's own regions as SDK client
     components so a custom layout *composes* rather than reimplements. Published only once core's
     default layout renders through it — which also makes the registry path core's own hot path,
     so it cannot be slow without core noticing first.

**0.6 public points:** `chat-message@1`, `message-actions@1`, `composer-action@1`,
`settings-section@1`. `facet-block@1` and `review@1` incubate core-internal.

Why these four: chat-message is the highest-demand point and also the hardest (§4), so it proves
the ABI rather than flattering it. message-actions and composer-action are near-free and are
required by the example plugin. **settings-section is small but load-bearing** — without it the
first real plugin has nowhere to put its configuration, and whatever the author invents becomes
the de facto pattern.

Best next candidates: character/persona card (low churn, strong `match` story, storage lane
already exists), then session/chat list item.

## 2. Render tiers — `virtual` now, `native` later

Declared **per component**, so one package can mix them.

| | **`virtual`** (0.6) | **`native`** (0.7) |
|---|---|---|
| Ships | own framework runtime + component code | compiled Svelte, `svelte/*` externalized |
| Runtime cost | separate runtime and scheduler per plugin | zero extra bytes; SP's own scheduler |
| Framework | any — Svelte, React, vanilla | **Svelte only** |
| Survives SP upgrades | indefinitely | within the declared Svelte ABI range |
| Crash blast radius | contained to its own subtree | larger — runs inside SP's module scope |

Both register against the **same surface registry**; `asSurface()` normalizes, and native simply
skips the adapter. The registry never learns which tier it loaded.

**Why native is deferrable rather than foundational:** compiled Svelte hard-imports
`svelte/internal/client`, whose ABI is unstable **across minors**. Externalizing it pins every
author to SP's exact Svelte version. That is manageable — a plugin already declares an SP range
and a minimum SDK, verified at install, and a mismatch fails **statically and loudly at
activation** rather than mysteriously at runtime — but it churns fast, and the tax falls hardest
on the useful-but-abandoned plugin. Virtual keeps those alive and is the only door for non-Svelte
authors.

**Native is Svelte-only by definition.** Say so in the component docs so React authors aren't
surprised later by a tier they can't reach.

**Required either way: core-owned error boundaries** — see §7, which is weaker than it sounds.

## 3. Component declaration

```jsonc
"components": [
  {
    "id":     "chariot.dice-tray:message",
    "point":  "core:surface/chat-message@1",   // the point *is* the component's kind
    "render": "virtual",                        // "virtual" | "native"
    "entry":  "dist/ui/message.js",
    "export": "DiceMessage",
    "match":  { "extraNamespace": "chariot.dice-tray" },
    "settingsScope": "component"
  }
]
```

The Svelte ABI pin is required only if at least one component declares `native` — a virtual-only
package has no Svelte coupling at all, which is the whole reason to ship virtual first.

## 4. What chat-message stresses

Highest-churn surface in the product, which forces four contract questions early rather than
expensively:

- **Streaming.** For 0.6, **core renders streaming chrome and hands the plugin the settled
  message.** Removes per-token cost across every bundled runtime and keeps the first contract
  small.
- **Virtualization.** Scrolling drives mount/destroy constantly, so the conformance leak check is
  load-bearing. **The ABI already solves most of this and a naive virtualizer will miss it:**
  recycle handles via `update(handle, props)` instead of destroy-then-mount. Scroll becomes prop
  updates rather than lifecycle churn — free if written that way from the start, near-impossible
  to retrofit.
- **Dynamic height.** A component resizing after mount breaks scroll anchoring. Surface points
  declare reserved space (see §9 — client-only rendering makes this worse).
- **Bundle cost.** Lazy-load surface bundles per point, and gate on `match` *before* fetch
  (03 §6).

## 5. `ctx` and the socket channel

Plain data only; nothing framework-reactive crosses the boundary.

- **Scoped to what the surface renders.** A chat-message surface gets that message, its namespaced
  extras, and its chat — not a general data handle. The surface's subject *is* its scope.
- Plus: current user (id, role, display), design tokens, **active theme id** (§6), locale,
  component settings (12 §6).
- Plus **`ctx.state`** — see below.
- Plus `ctx.rpc` / `ctx.events`.

**Extensions never write socket handlers.** They *declare* them — namespaced to the extension with
an arbitrary descriptor appended — and **SP registers the real handler and forwards** calls and
responses to the plugin's UI-facing hooks. Consequences:

- Identity and permission checks live in SP's forwarding layer with **no path around them**. A
  browser-side-only check would have been advisory; this is structural.
- **The forwarding layer is to UI what the executor is to pipelines** (01 §9): because SP owns
  every invocation, SP wraps every invocation — permission check, payload-schema validation,
  per-plugin rate and subscription limits, logging opt-in, uniform error normalization. Build it
  as one mechanism rather than rediscovering it as scattered middleware.
- Handler naming `plugin:<id>:<descriptor>` makes cross-plugin collisions impossible by
  construction.

**Per-plugin channel limits are required**, not optional: two hundred rendered messages each
opening subscriptions is the default case, not the pathological one.

### `ctx.state` — host-owned scratch space

```
ctx.state   plain data, namespaced per plugin,
            keyed by (surface point, contribution id, subject id)
```

Lifetime is **keyed to the mount slot and survives host-initiated remounts**, destroyed only when
the host decides the subject is gone. "While mounted in the DOM" would die with the component and
preserve nothing.

What it buys:

- **Forced remount stops destroying anything**, so remount can be the single mechanism for
  environment changes — no theme event, no second channel. The rule collapses to one sentence:
  *state in `ctx.state` survives, anything else doesn't.*
- It fixes a bug independent of theming: virtualized recycling already resets a message's
  expanded/collapsed state when it scrolls out and back.
- Later persistence has somewhere to hook, with no change to the component contract.

Three requirements:

1. **Keys explicit and stable, never positional.** State leaking between subjects — message A's
   state appearing on message B after recycling — is precisely the failure F21 exists to prevent
   for node keys. Same law, second location.
2. **It is a cache, not storage.** Bounded, LRU-evictable against the virtualization buffer,
   documented as droppable at any time.
3. **Namespaced per plugin.** Not a security boundary, but plugins must not read each other's.

Depends on remount being cheap — see the p95 mount assertion in §7.

## 6. Styling — Skeleton v5, and the one thing that must be built

SP uses Skeleton v5 over Tailwind, with live theme switching and custom themes from the Skeleton
theme generator.

**Theme values inherit, always.** The theme sets `--color-primary-500: …` on a root element;
custom properties cascade, and an in-document plugin component is a descendant like any other.
Switch themes and every descendant re-resolves in the same frame. Nothing is copied, nothing
needs regenerating, and **no refresh is involved**.

**Class rules are a separate, build-time thing.** `bg-primary-500` is a rule Tailwind only emits
if the build *saw that class in a scanned source file*. A plugin built in its own repo is not
scanned by core's build. The failure is therefore **"no rule at all"** — the element renders
unstyled on every theme equally — not "wrong theme". Easy to misdiagnose as a theming bug when
it's a compilation one.

Skeleton makes this tractable: utilities are generated from Tailwind's `@theme` over a **fixed
semantic token set** — `--color-{color}-{shade}` and `--color-{color}-contrast-{shade}`, seven
categories × eleven shades, plus presets, typography and element sizing. Class names are
theme-independent; only values change.

**Therefore:**

- **Publish the Skeleton semantic surface as contract**, safelisted so it is guaranteed present:
  colour utilities, presets, typography, element sizing. Say plainly which classes are contract
  and which are incidental — otherwise authors copy whatever they find in core's source and every
  refactor breaks plugins silently.
- **Tokens-only is the always-safe path.** A plugin writing its own scoped CSS with
  `var(--color-primary-500)` needs no safelist at all.
- Arbitrary layout utilities and JIT values (`w-[327px]`, `grid-cols-7`) belong in a plugin's own
  scoped CSS.
- **Mandate contrast tokens.** Custom themes make token values arbitrary; a plugin hardcoding
  white on `--color-primary-500` is legible on the default theme and unreadable on someone's
  generated one. `--color-{color}-contrast-{shade}` and `preset-filled-*` exist for this, and the
  conformance kit checks it.
- **`parseCss` (svelte@5.48.0) makes a build-time lint feasible** — the SDK packager parses class
  usage and warns on anything outside the published surface.
- Shadow roots stay a rare per-contribution opt-in: they *break* native styling.

**JS that reads computed colours is the one thing that doesn't inherit.** Canvas needs it; SVG does
not (`fill="var(--color-…)"` works). Steer authors to SVG; for canvas, the **active theme id is a
prop**, so a component recomputing derived colours compares against it on the next
render — no event channel, and it self-corrects the one hole `ctx.state` would otherwise open by
carrying a stale palette across a theme change.

## 7. Framework neutrality — and where it stops

**Neutral by construction:** the ABI (vanilla trivially, React via `createRoot`/`render`/
`unmount`, Svelte 5 via `mount`/`unmount` with a `$state` props object), Skeleton classes,
theme inheritance, theme id as a prop, `ctx.rpc`/`ctx.events`/`ctx.state`, forced remount, handle
recycling, settings-at-render, core-rendered streaming chrome.

**Neutral only with a first-party adapter.** Ship Svelte, React and vanilla adapters yourself,
each **passing the conformance kit** — otherwise "works with React" is a claim nobody verified.
React needs a `useHostState()` hook, since React wants state inside React.

**Not neutral:**

- Native tier is Svelte-only (§2).
- Bundle weight differs ~3×: vanilla ~0, Svelte ~15 kB gz, React ~45 kB gz. The declared bundle
  size shown at install (§10) makes that drive author choice instead of hiding it.
- Skeleton's **classes** are universal; its **components** are per-framework. Steer plugins to
  classes and tokens, not framework component packages.

**⚠ Error boundaries are weaker than they look for virtual tier.** A `<svelte:boundary>` around the
host element catches throws in *core's* call stack — `mount`, `update`, `destroy`. It does **not**
catch async errors inside a React root or a vanilla component's own handlers, which live in a
different stack. Two layers required:

1. core wraps every ABI call in try/catch (universal), **and**
2. each adapter installs its framework's own error handling inside its root and reports upward
   through a `ctx` callback — **a conformance requirement**, or non-Svelte surfaces fail silently
   while Svelte ones report cleanly.

**Mount cost is a conformance assertion, not an aspiration:** record p95 mount time and fail above
a threshold. "Indistinguishable from native" is only real if it's measured in the author's CI.

## 8. Accessibility

Deferred as a general contract to post-0.6. Two things hold now:

- **Generated UI is compliant by construction** — settings forms, review forms and facet blocks
  are rendered by core from schemas, so accessibility is core's to get right once, for everyone.
- Custom component accessibility is the author's, and the conformance kit gains checks later.
  Components already declare where they belong (`point`), which is what a future per-point
  accessibility contract will hang off.

## 9. Client-only rendering and the routing decision

**Components are static/front-end only: no backend, no side effects.** SP SSRs; plugin surfaces
mount after hydration. Server-rendering them would need per-framework SSR and isn't neutral, so
client-only is the only universal option.

The cost is a first-paint gap where surfaces are absent, which compounds §4's dynamic-height
problem. **Surface points must declare reserved space**, or the chat log jumps on every load for
anyone with a message renderer installed.

**⚠ One structural decision can't wait for 0.7: SvelteKit routing is compile-time.** A plugin
cannot add routes to a built app, so scoped page replacement and custom layouts need a dispatch
route — a catch-all, or a shell like `/x/[plugin]/[...path]` — resolving against the surface
registry at runtime. **That route must exist in the app skeleton from 0.6.** Adding it now costs
nearly nothing; retrofitting it after plugins ship pages changes every plugin's URLs. (Check
SvelteKit 3's shallow routing before fixing the shape.)

Related: `layout.root` consumes the entire design-token set, so the token list becomes a
versioned API with a compatibility obligation rather than documentation.

## 10. Frontend cost

**The infrastructure is cheap; installed plugins are the cost.**

| Piece | Cost | Note |
|---|---|---|
| Surface registry + loader | small | a lookup table and `import()` calls |
| `asSurface` ABI adapter | negligible | ~15 lines |
| Error boundaries | zero | built into Svelte 5 |
| Namespaced RPC client | small | rides the existing WebSocket layer |
| Routing dispatch shell | ~zero | one route file, inert until used |
| Schema-driven form renderer | moderate | **not an extensibility cost** — the review gate needs it regardless. Three uses, one renderer |

**Three properties bound plugin cost, two already in the design:**

- **Enumeration without loading.** The descriptor/binding split means the plugin manager, settings
  screens and audit view work from rows. Browsing installed plugins loads zero plugin code.
- **`match` is a load gate** (03 §6). Evaluate it pre-fetch; the obvious implementation order does
  it backwards.
- **Lazy per surface point.**

**Guardrails:**

- **Externalize `@serene-pub/sdk/client`** on the same terms as `svelte/*` for native tier, or
  every plugin ships its own RPC client and duplication scales linearly.
- **CI assertion: with zero plugins the bundle stays under a fixed ceiling.** With plugins off by
  default this measures the state most installations are in, so set it tightly and treat a
  regression as a defect.
- **Per-plugin bundle budget in the manifest, displayed at install** — *"adds ~40 kB to your chat
  view."* Turns an invisible cost into a number an admin sees.
- **Field-type renderers load lazily too** — "more supported data types over time" is a real creep
  vector; a form using three types shouldn't ship twenty.

**Perf note:** virtual-tier plugins each run their own reactivity graph, so updates flush on
separate microtasks from core's. Rarely visible, but a core element and a plugin element changing
in the same frame can disagree. Native tier shares SP's scheduler and cannot tear.
