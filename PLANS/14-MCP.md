# 14 — Model Context Protocol

**Status:** New 2026-08-17. Implements MCP support as core types, not as a plugin category.
Depends on 01 §10 (Provider), §11 (streaming), 09 (permissions), 11 (consent).

**Why it's worth doing:** the ecosystem has standardized on MCP — Open WebUI and LibreChat ship
it, SillyTavern has community bridges — and SP is already shaped for it. Supporting it means
inheriting an ecosystem instead of bootstrapping one. And SP would be the only client where every
tool call lands in a replayable receipt and passes a review gate before it acts.

## 1. MCP servers are connections, not plugins

An MCP server is foreign code SP talks to, not code SP loads. It belongs in the connections
system.

```
connections   kind = 'mcp'
              config: { transport, command|url, args, cwd, toolPrefix }
              credentials: env vars and tokens, ENCRYPTED, core custody
```

- **Core holds the credentials and never exposes them** — F18, unchanged. No plugin, and no MCP
  server, receives another connection's material.
- **Transport reuses what exists.** MCP is JSON-RPC; `runtime: process` already spawns a child and
  speaks JSON-RPC over stdio, with health checks, restart policy and kill-on-cancel. 0.6 ships
  stdio; HTTP/SSE is 0.7.
- Admins add MCP servers the same way they add any connection. Users never see credentials, and
  per-slot permissions (12 §4) already forbid users writing a connection.

## 2. Mapping MCP to the five kinds

| MCP concept | SP kind | Type |
|---|---|---|
| Tool call | **Provider** | `core:provider/mcp-tool@1` |
| Resource read | **Provider** | `core:provider/mcp-resource@1` |
| Prompt | template / prompts slot source | 12 §2 |
| Elicitation | **Provider** (Human-as-Provider) | parks a promise, renders a surface |
| Sampling | see §6 — **off by default** | |

**A resource read is a Provider, not a Query, and the reason matters.** Queries may not reach the
network (01 §2), and everything crossing the process boundary must be recorded verbatim so replay
never re-infers (F16). An MCP resource is external state that can change between runs; modelling
it as a Query would quietly break both rules. Provider keeps it honest and costs nothing.

**Elicitation is a free win.** MCP servers asking the user for input maps exactly onto
Human-as-Provider: park a promise, render a surface, resolve. The mechanism already exists for the
`sync` review position.

## 3. Static specs against a dynamic server

A spec pins types and shapes at publish; an MCP server advertises its tools at connect and can
change them at any time. Resolution:

1. **Snapshot on connect.** When an MCP connection is configured or refreshed, SP reads the
   server's tool and resource list and materializes each entry into `type_registry` as a shape
   under that connection's namespace.
2. **Specs pin the snapshot**, so publish-time validation, typed ports and the node swap list all
   work exactly as they do for any other type.
3. **Drift is a diagnostic, not a surprise.** If the live server's schema no longer matches the
   snapshot, the call fails with a routable error and a row lands in `spec_diagnostics` — the same
   deprecation-audit machinery as any other pin (02 §8). "This MCP server changed under you" is
   then a query, not a mystery.
4. Refresh is explicit and admin-initiated, so a server can't silently rewrite what your pipelines
   pinned.

## 4. ⚠ Gating: annotations are advisory, and the spec says so

MCP tools carry `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. The
specification states these are **not guarantees** and clients **must** treat them as untrusted
unless the server is trusted — a server can claim `readOnlyHint: true` and delete your files
anyway.

**Therefore SP never decides gating from an annotation.**

- Every MCP tool is treated as **effectful by default**.
- Annotations **pre-fill the admin's choice** when the connection is set up; the admin confirms
  per tool. Advisory input to a human decision, never an automatic one.
- The admin's classification is stored on the snapshot and is what the executor honours.

This is the same pattern the design already uses for generated permissions (09 §4): a machine
suggestion that is a convenience and a lint, never the boundary. Being consistent here is worth
more than the small ergonomic cost.

### 4a. Amendment required: the review gate must key on effects, not on kind

The gate currently fires "after a Consumer's input resolves and before its binding is invoked"
(01 §7). An effectful MCP tool is a **Provider** — external I/O — so as written it is ungateable,
which is unacceptable for a node that can send mail or delete a file.

**Recommended amendment: the gate fires before invoking any node declared to have external
effects, whatever its kind.** Consumers remain effectful by definition; effectful Providers join
them. This is a generalization of the existing substrate check, not a new mechanism, and it
arguably improves the law — the gate becomes about *effects*, which is what it was always for,
rather than about *kind*, which was a proxy.

Everything else about the gate is unchanged: authors may default it on and can never forbid it,
plugin code cannot detect or decline it, and decisions enter the receipt. **Ratified 2026-08-18
(13 §7a); amends F14.**

## 5. Budgets, receipts and the differentiator

- **Budgets:** call count and wall clock by default, plus any usage the server reports — the
  existing declared usage-extractor path (01 §10).
- **Receipts record every MCP request and response verbatim**, with the connection, the tool, the
  arguments, the result and the gate decision.

That last line is the whole pitch. Every other MCP client executes tools with no audit trail and
no gate. In SP, "what did this tool actually do, and did I approve it" is a query, and
`replay(receipt)` re-runs the pipeline using the recorded result rather than calling the tool
again — which also means goldens work over MCP-using pipelines.

## 6. Sampling is off by default

MCP servers may ask the client to run a model completion on their behalf. That is a foreign
process spending your tokens, initiated by code you didn't write.

- **Disabled by default**, enabled per connection.
- When enabled, sampling requests resolve through a **declared connection with its own budget**,
  never the pipeline's ambient one.
- Requests and responses are recorded like any other Provider call.
- A sampling request that exceeds its budget fails as `err`, routable and recorded.

## 7. Prompt injection is a real surface, and receipts are the answer

MCP tool results flow into assembled context, which is a known attack path — a poisoned resource
can carry instructions to the model.

- **Mark MCP-derived content as untrusted where it enters the context**, so templates and Assemble
  Tasks can treat it differently (fence it, summarize it, or refuse to interpolate it raw).
- Surface it in the L2 weights lens, so "what actually went into this prompt, and where did it
  come from" is inspectable per run.
- SP cannot prevent injection. What it can do — and no competitor does — is make every instance of
  it visible after the fact.

## 8. Consent and permissions

- Reaching an MCP server is a declared permission, granted by an admin, checked at the call like
  any other SDK access (F28).
- An MCP node touching a user's data participates in the consent model (11 §4): **read is not
  refusable, write is.** An MCP tool that writes to a user's chats requires that user's consent —
  or the admin's implicit self-consent under 11 §4a.
- The connection's `managesOwnCredentials` equivalent does not apply: MCP credentials are core's,
  under core custody, like any other connection.

## 9. Scope

**0.6:** `mcp` connection kind · stdio transport · `mcp-tool@1` and `mcp-resource@1` Providers ·
snapshot into `type_registry` with drift diagnostics · admin gating classification · budgets ·
verbatim receipts · sampling off.

**0.7:** HTTP/SSE transports · sampling opt-in with its own budget · MCP prompts wired into the
prompts/template slots · elicitation surfaced through Human-as-Provider · server discovery UX
beside the plugin repository model.

**Check before 0.6 freezes:** nothing in the shape registry or connection-kind model should
foreclose any of the 0.7 items. The connection kind and the snapshot table are the two places
that could.
