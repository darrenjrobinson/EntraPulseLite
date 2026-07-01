# EntraPulse Lite — Supporting Lokka's Interactive MCP Apps

**Target branch:** `v1.2.0-beta.3`
**Author of plan:** drafted with Claude, for Darren Robinson
**Status:** planning / pre-implementation

---

## 1. Decisions locked for this plan

| Decision | Choice |
| --- | --- |
| Which Lokka apps to support | **All four** (Graph explorer, Connections, Permissions, Help) |
| Auth ownership | **EntraPulse keeps owning auth** (client-token mode stays) |
| Bridge design | **Generic MCP Apps host** (works for any MCP Apps server, not only Lokka) |
| Lokka transport | **Move EntraPulse's Lokka transport onto the official `@modelcontextprotocol/sdk` Client** |

> Note on the transport decision: Lokka 2.1.2 *already* runs on `@modelcontextprotocol/sdk ^1.29.0` on the server side. EntraPulse also already depends on the SDK (`^1.12.1`, resolved `1.29.0`) but talks to Lokka through a **hand-rolled stdio JSON-RPC client**. This plan replaces that custom client with the SDK's `Client` + `StdioClientTransport`, which is what the MCP Apps early-access SDK (`modelcontextprotocol/ext-apps`) is built against.

---

## 2. Verified findings (from source inspection, not assumptions)

### EntraPulse Lite (this repo)
- Electron + React (MUI) + TypeScript + webpack. MCP clients live in the **main process**; the renderer talks to them over IPC (`mcp:call`, `mcp:listTools`, `mcp:restartLokkaMCPServer`, …).
- The Lokka path uses custom clients: `StdioMCPClient`, `EnhancedStdioMCPClient`, `ManagedLokkaMCPClient`, `PersistentLokkaMCPClient`, orchestrated by `ExternalLokkaMCPStdioServer`.
- `StdioMCPClient.initialize()` hardcodes `protocolVersion: '2024-11-05'` and `capabilities: { tools: {} }`. **No UI/apps capability is negotiated.**
- `src/mcp/constants.ts` pins `@merill/lokka@2.1.2` and filters exposed tools to **three**: `Lokka-Microsoft`, `set-access-token`, `get-auth-status`. The `open-*` UI tools are filtered out.
- Auth is owned by EntraPulse: it injects a token via `set-access-token` and runs Lokka with `USE_CLIENT_TOKEN`. Supporting services already exist: `MCPAuthService`, `MCPAdminConsentHelper`, `MCPScopes`.
- `ChatComponent.tsx` renders tool output as **stringified JSON / metadata** (`message.metadata.mcpResults`, `traceData`, etc.). There is **no iframe, no `dangerouslySetInnerHTML`, no postMessage bridge** anywhere.
- `EnhancedLLMService` extracts text/structured content from tool results; it currently does **not** carry `_meta` through to the renderer.

### Lokka 2.1.2 (verified by unpacking the published package)
- Ships **six UI resources**, registered via `registerResource` (this plan's initial draft
  listed only the first four; Settings + Guardrails were added and are now exposed too):
  - `ui://lokka/graph-explorer.html`
  - `ui://lokka/connections.html`
  - `ui://lokka/permissions.html`
  - `ui://lokka/help.html`
  - `ui://lokka/settings.html` (umbrella over Connections + Guardrails)
  - `ui://lokka/guardrails.html` (user policy on model-originated calls; off by default)
- Tools reference their UI via `_meta.ui.resourceUri` (and the deprecated flat `_meta["ui/resourceUri"]`).
- UI resource mimeType is **`text/html;profile=mcp-app`** (note: the announcement blog showed `text/html+mcp` — the spec has since drifted, which is exactly why the contract must be pinned from code, not docs).
- The `open-graph-explorer`, `open-lokka-connections`, `open-lokka-permissions`, `open-lokka-help` tools are present in the bundle.
- No version bump is required — everything needed is already in the pinned `2.1.2`.

---

## 3. Architecture overview

```
┌────────────────────────────── Renderer (React) ──────────────────────────────┐
│  ChatComponent                                                                 │
│    └─ McpAppFrame (NEW)                                                         │
│         • sandboxed <iframe srcdoc=…>                                           │
│         • postMessage ⇄ JSON-RPC bridge (client side)                           │
└───────────────▲───────────────────────────────────────────────▲───────────────┘
                │ IPC: mcp:ui:rpc (NEW)                            │ IPC: existing
                │ (relays iframe JSON-RPC)                         │ (mcp:call etc.)
┌───────────────┴───────────────────────────────────────────────┴───────────────┐
│  Main process                                                                   │
│    McpAppsHost (NEW, generic)                                                   │
│      • consent / policy gate  ──uses──►  ServerPolicy (pluggable)               │
│      • routes JSON-RPC to the active connection                 LokkaPolicy(NEW)│
│                                                                  knows which     │
│    SdkMcpConnection (NEW, replaces custom Lokka client)          tools mutate    │
│      • @modelcontextprotocol/sdk Client + StdioClientTransport   auth → routes   │
│      • resources/list, resources/read, tools/call, caps          to MCPAuth*     │
│                                                                                 │
│    ExternalLokkaMCPStdioServer (REFACTORED to wrap SdkMcpConnection)            │
│      • token injection (USE_CLIENT_TOKEN / set-access-token)                    │
│      • lifecycle: start / restart / persistence                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                │ stdio
                       @merill/lokka 2.1.2 (SDK server, ui:// resources)
```

Two render triggers, one path:
1. The model calls an `open-*` tool → result carries a `ui/resourceUri`.
2. The model calls `Lokka-Microsoft` → Lokka auto-attaches the graph-explorer `ui/resourceUri`.

Both surface as `message.metadata.uiResource` and mount `McpAppFrame`.

---

## 4. The auth reconciliation (all four apps + EntraPulse owns auth)

The Graph explorer and Help tour are low-conflict: they run Graph queries through the token EntraPulse already injects. The **Connections** and **Permissions** managers exist to *perform* auth (sign-in, service-principal creation, app-registration creation, consent, keychain storage), which conflicts with EntraPulse owning auth in client-token mode.

Resolution uses the **consent/policy gate** that the MCP Apps spec requires for UI-initiated tool calls anyway. The gate classifies each iframe-initiated `tools/call`:

- **Read / display** (e.g. list connections, read current permissions, run a Graph query) → **allow**.
- **Auth-mutating** (sign-in, add SP, create app registration, grant consent) → **intercept**.

Intercept has two levels:

- **Level A — minimum (ship first).** Deny the mutating call and surface a short message + a link to EntraPulse's own auth settings. Simplest, but **UX risk** (see §8): Lokka's connections/permissions UIs may show errors or dead controls when their calls are denied — this must be verified at runtime.
- **Level B — integrated (follow-up).** Intercept the mutating call and fulfil it through EntraPulse's existing services (`MCPAuthService`, `MCPAdminConsentHelper`, `MCPScopes`), then return a success result to the iframe so its UI stays coherent. More work, materially better UX, keeps auth in EntraPulse's hands.

Because the host is **generic**, this logic is not hardcoded. It lives in a pluggable `ServerPolicy`:
- `DefaultPolicy`: allow reads, gate any write/mutation behind an explicit user consent prompt.
- `LokkaPolicy`: knows the specific Lokka tool names that mutate auth and how to route them (deny in Level A, or hand to EntraPulse's auth services in Level B).

---

## 5. Phased implementation

### Phase 0 — Pin the contract (do before writing bridge code)
Read the authoritative handshake from `modelcontextprotocol/ext-apps` (early-access SDK) and from the SDK version Lokka uses:
- The exact **apps/UI capability key** and the **`protocolVersion`** string to negotiate.
- The **iframe ⇄ host postMessage JSON-RPC** method names and message envelope.
- How **initial tool-result data** is delivered into the iframe after it loads.
- The expected **sandbox / CSP** posture for the iframe.

Deliverable: a short `MCP_APPS_CONTRACT.md` capturing the pinned strings + SDK versions, referenced by the code. Everything below depends on this.

### Phase 1 — Transport migration to the official SDK
Replace EntraPulse's custom Lokka stdio client with the SDK `Client` + `StdioClientTransport`.

- New `SdkMcpConnection` (main process) wrapping the SDK `Client`: handles `initialize` (with the apps capability + correct protocol version from Phase 0), `tools/list`, `tools/call`, **`resources/list`, `resources/read`**, and notifications.
- Refactor `ExternalLokkaMCPStdioServer` to **delegate transport to `SdkMcpConnection`** while keeping its responsibilities: token injection (`USE_CLIENT_TOKEN` / `set-access-token`), startup serialization (`isStarting` / `startupPromise`), restart, and persistence.
- Decommission (or thin to a shim) `StdioMCPClient`, `EnhancedStdioMCPClient`, `ManagedLokkaMCPClient`, `PersistentLokkaMCPClient` for the Lokka path.

**Migration risk to validate first (was flagged as uncertain):** the custom clients carry behaviour the SDK client doesn't out of the box — token-injection *timing* relative to `initialize`, the persistent/long-lived connection layer, and restart/health logic (`mcp:restartLokkaMCPServer`, `mcp:checkHealth`). Each must be re-mapped onto the SDK client and re-tested; treat this as the gating task of the migration, not an afterthought.

### Phase 2 — Stop filtering UI tools / propagate `_meta`
- In `src/mcp/constants.ts`, expose the four `open-*` tools (or stop filtering them). Keep `set-access-token` / `get-auth-status` behaviour unchanged.
- In `EnhancedLLMService`, **preserve `_meta` (`ui/resourceUri`)** on tool definitions and on `tools/call` results, and set `message.metadata.uiResource = { serverId, resourceUri, toolName, initialData }` so the renderer knows to mount a frame. Existing text/JSON rendering stays as fallback.

### Phase 3 — Generic iframe host + bridge (renderer)
- New `McpAppFrame` component: fetches the resource HTML (via IPC → `resources/read`), mounts it in a **sandboxed `<iframe srcdoc>`** (no remote origin), and runs the **client side of the postMessage ⇄ JSON-RPC bridge** per the Phase 0 contract — handshake, push `initialData` in, relay UI-initiated JSON-RPC out, return responses.
- Mount `McpAppFrame` inline in `ChatComponent` when `message.metadata.uiResource` is present.

### Phase 4 — Host bridge endpoint + policy gate (main process)
- New `McpAppsHost`: receives relayed JSON-RPC from the renderer over a new IPC channel (e.g. `mcp:ui:rpc`), runs it through the **`ServerPolicy`** gate, and forwards allowed calls to the **existing** `SdkMcpConnection` (no second Lokka spawn).
- Implement `DefaultPolicy` + `LokkaPolicy` (§4). Start at **Level A**.
- Add the IPC channel to the preload bridge and main `ipcMain.handle` set, alongside the existing `mcp:*` handlers in `src/main/main.ts`.

### Phase 5 — Electron/CSP, settings, fallback, tests
- Tighten `webPreferences` / CSP so the sandboxed local HTML runs while staying locked down.
- Settings toggle: **Enable interactive MCP apps** (default on; off → text fallback).
- Preserve text-only rendering everywhere the iframe isn't mounted.
- Extend the existing Lokka integration suite (`src/tests/integration/lokka-*`, `src/tests/e2e/lokka-mcp-e2e.test.ts`) to cover: `resources/list`, `resources/read`, `_meta` propagation, and the policy gate's allow / deny / intercept decisions. Add a renderer test for `McpAppFrame` bridge round-trips.

---

## 6. File touchpoints (initial estimate)

| Area | Files | Change |
| --- | --- | --- |
| Transport | `src/mcp/clients/*` (Lokka path), **new** `SdkMcpConnection` | Replace custom stdio client with SDK `Client` |
| Lokka server wrapper | `src/mcp/servers/lokka/ExternalLokkaMCPStdioServer.ts` | Delegate transport; keep token/lifecycle logic |
| Tool exposure | `src/mcp/constants.ts` | Expose `open-*` tools |
| Types | `src/mcp/types.ts` | Add resource/`_meta`/UI-resource types (or import SDK types) |
| LLM service | `src/llm/EnhancedLLMService.ts` | Preserve & surface `_meta` → `metadata.uiResource` |
| Renderer | **new** `McpAppFrame.tsx`, `ChatComponent.tsx` | Iframe + bridge; mount inline |
| Host + policy | **new** `McpAppsHost`, `ServerPolicy`, `LokkaPolicy` | Generic relay + gate |
| IPC | `src/main/main.ts`, preload | New `mcp:ui:rpc` channel |
| Auth integration (Level B) | `MCPAuthService`, `MCPAdminConsentHelper`, `MCPScopes` | Route intercepted consent/auth |
| Tests | `src/tests/**/lokka-*`, new renderer test | Resources, `_meta`, policy, bridge |

---

## 7. Sequencing recommendation

1. Phase 0 (contract) — small, unblocks everything.
2. Phase 1 (transport) — largest risk; do early and prove it with the existing Lokka tests **before** touching UI.
3. Phases 2–4 — UI + bridge + gate (Graph explorer / Help work end-to-end here under Level A).
4. Connections / Permissions at Level A, then revisit Level B based on observed degradation.
5. Phase 5 hardening throughout.

---

## 8. Risks & open uncertainties (explicit)

- **Spec is a proposal.** MCP Apps is SEP-1865; `ext-apps` is "early access." Capability key, protocol version, mime profile (`text/html;profile=mcp-app`), and the postMessage contract can change. Mitigation: Phase 0 pins them in one place.
- **Transport migration cost is not yet fully scoped.** Re-plumbing token-injection timing, persistence, and restart/health onto the SDK client is the main unknown. Prove with existing tests before building on top.
- **Connections/Permissions UX under denied calls (Level A).** Unverified how gracefully Lokka's UIs degrade when mutating calls are blocked. Needs runtime testing; Level B is the fallback if degradation is poor.
- **Lokka capability gating.** Lokka appears to register UI resources unconditionally (no gating found in the bundle), but confirm at runtime via `resources/list` once the SDK transport is in.
- **CSP/sandbox vs. bundled JS.** The Lokka app HTML includes script; the sandbox/CSP must permit it to run while blocking remote origins and limiting capabilities. Expect iteration here.
- **Freemium/permission gating.** Exposing `open-*` tools and richer Graph access through the explorer should be checked against EntraPulse's entitlement model so the apps don't bypass existing gating.

---

## 9. Definition of done

- All four Lokka apps render inline in chat on a UI-capable build; text fallback intact when disabled.
- EntraPulse still owns auth: no UI-initiated sign-in/SP/consent escapes the policy gate.
- Lokka transport runs on `@modelcontextprotocol/sdk`; existing Lokka integration/e2e tests pass.
- New tests cover resources, `_meta` propagation, the bridge, and the policy gate.
- A settings toggle enables/disables interactive apps.
