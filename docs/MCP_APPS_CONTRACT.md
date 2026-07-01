# MCP Apps Contract (pinned)

**Status:** Phase 0 deliverable for [EntraPulse-Lokka-MCP-Apps-Plan.md](EntraPulse-Lokka-MCP-Apps-Plan.md).
**Method:** extracted from installed source, not docs (the spec is a moving proposal — SEP‑1865 / `ext-apps` early access). Re-verify these strings whenever `@merill/lokka` or `@modelcontextprotocol/sdk` is bumped.

> All values below were read from:
> - `node_modules/@merill/lokka/build/main.js` and `node_modules/@merill/lokka/build/ui/*.html` (Lokka 2.1.2)
> - `node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js` and `.../client/index.js` (SDK 1.29.0)

---

## 0. Pinned versions

| Component | Version |
| --- | --- |
| `@merill/lokka` | **2.1.2** (pinned in `package.json` + `src/mcp/constants.ts`) |
| `@modelcontextprotocol/sdk` | declared `^1.12.1`, **resolved 1.29.0** |
| SDK `LATEST_PROTOCOL_VERSION` | `2025-11-25` |
| SDK `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` | `2025-03-26` |
| SDK `SUPPORTED_PROTOCOL_VERSIONS` | `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`, `2024-10-07` |
| MCP Apps iframe-bridge `protocolVersion` | **`2025-06-18`** (sent by Lokka apps in `ui/initialize`) |

---

## 1. Two distinct protocol layers

There are **two** handshakes. Do not conflate them.

### Layer A — MCP transport (Host main process ⇄ Lokka stdio server)
Standard MCP over stdio via the SDK `Client` + `StdioClientTransport`.

- The SDK `Client.connect()` sends `initialize` with `protocolVersion: LATEST_PROTOCOL_VERSION` (`2025-11-25`) and `capabilities: options.capabilities ?? {}`, then validates the server's reply is in `SUPPORTED_PROTOCOL_VERSIONS`. **No special "apps" capability key is required at this layer** — Lokka registers its UI resources unconditionally.
- What EntraPulse must additionally use here (the custom client never did): **`resources/list`** and **`resources/read`**.
- Construct the client with normal info; capabilities can stay `{}` (optionally declare `elicitation`/`roots` later). Example:
  ```ts
  new Client({ name: 'entrapulse-lite', version: '1.3.0' }, { capabilities: {} })
  ```

### Layer B — MCP Apps iframe bridge (Renderer iframe ⇄ Host)
Plain **JSON-RPC 2.0 over `window.postMessage`**. This is the part EntraPulse must build (`McpAppFrame` client side + `McpAppsHost` server side). Lokka's bundled apps are the bridge **client**; EntraPulse is the bridge **host**.

---

## 2. Layer B envelope (postMessage JSON-RPC 2.0)

Lokka's bridge (`window.parent.postMessage(..., "*")`, `addEventListener("message", e => e.data)`):

```jsonc
// iframe → host  request     { "jsonrpc":"2.0", "id":<n>, "method":"<m>", "params":<o> }
// iframe → host  notification{ "jsonrpc":"2.0", "method":"<m>", "params":<o> }      // no id
// host → iframe  response ok { "jsonrpc":"2.0", "id":<n>, "result":<o> }
// host → iframe  response err{ "jsonrpc":"2.0", "id":<n>, "error":{ "code":<n>, "message":"<s>" } }
// host → iframe  request/notif: same shapes, host originates id/method
```

- Lokka posts to `window.parent` with target origin `"*"`. The host **must** validate `event.source === iframe.contentWindow` (origin is `null` for `srcdoc`) and ignore everything else.
- Error code seen in the wild: `-32601` (method not found). Use standard JSON-RPC codes.
- `ui/initialize` and `ui/message` are sent as **requests** (the app awaits an ack); `ui/message` uses a 30 000 ms timeout.

---

## 3. Layer B method directory (from all four Lokka apps)

### iframe → host (the host MUST implement these)
| Method | Kind | Purpose |
| --- | --- | --- |
| `ui/initialize` | request | Handshake. Params: `{ protocolVersion:"2025-06-18", appInfo:{name,version}, appCapabilities:{availableDisplayModes:["inline","fullscreen"]}, capabilities:{}, clientInfo:{name,...} }`. Host returns `{ displayMode, availableDisplayModes, styles? }` (app reads `result.displayMode`, `result.availableDisplayModes`, `result.styles.variables`). |
| `ui/notifications/initialized` | notification | App finished init. |
| `ui/notifications/size-changed` | notification | Content height changed → host resizes the iframe. |
| `tools/call` | request | Run an MCP tool. **This is the gated path** — route through `ServerPolicy` → `SdkMcpConnection.callTool`. Return the MCP `CallToolResult`. |
| `ui/message` | request | Inject a chat message into the host conversation. Params `{ role:"user", content:[{type:"text",text}] }`. |
| `ui/request-display-mode` | request | App asks to switch inline/fullscreen. (graph-explorer) |
| `ui/open-link` | request | Open an external URL in the system browser. (graph-explorer, permissions) |
| `ui/download-file` | request | Trigger a file download. (graph-explorer) |
| `ui/update-model-context` | notification | App pushes context the model should see. (graph-explorer, connections) |
| `notifications/cancelled` | notification | Cancel an in-flight request. |

### host → iframe (the host MAY/▼SHOULD send these)
| Method | Kind | Purpose |
| --- | --- | --- |
| `ui/notifications/tool-result` | notification | **Primary initial-data + update channel.** Delivers a tool's `CallToolResult` (the app reads `params.structuredContent`, `params.isError`). This is how the triggering tool's output reaches the freshly-mounted app. |
| `ui/notifications/tool-input` | notification | Tool input/args for the call. |
| `ui/notifications/tool-input-partial` | notification | Streaming/partial input. (graph-explorer) |
| `ui/notifications/tool-cancelled` | notification | The triggering tool call was cancelled. (graph-explorer) |
| `ui/notifications/host-context-changed` | notification | Host context (e.g. theme/tenant) changed. |
| `ui/resource-teardown` | request | Tell the app to tear down before unmount; app has an `onRequest` handler. |

**Initial-data delivery (Phase 0 question answered):** after the iframe loads and completes `ui/initialize`, the host pushes the triggering tool's result via a **`ui/notifications/tool-result`** notification carrying `{ structuredContent, isError }`. There is no "initialData" field on the resource itself; the data arrives over the bridge as a notification.

---

## 4. UI resources (Layer A — `resources/read`)

Six resources, registered unconditionally by Lokka 2.1.2:

| Resource URI | Tool that opens it |
| --- | --- |
| `ui://lokka/graph-explorer.html` | `open-graph-explorer` (and auto-attached to `Lokka-Microsoft` results) |
| `ui://lokka/connections.html` | `open-lokka-connections` |
| `ui://lokka/permissions.html` | `open-lokka-permissions` |
| `ui://lokka/help.html` | `open-lokka-help` |
| `ui://lokka/settings.html` | `open-lokka-settings` (umbrella over Connections + Guardrails) |
| `ui://lokka/guardrails.html` | `open-lokka-guardrails` (user policy on model-originated calls) |

> Note: the URIs end in **`.html`** (the plan's draft listed them without the extension — use these).

> **Guardrails tool family (bridge-called, not model-exposed).** The Settings and Guardrails
> apps configure guardrails by relaying `tools/call` over the Layer B bridge to
> `lokka-get-guardrails-config`, `lokka-set-guardrails-enabled`, `lokka-set-guardrails-scope`,
> `lokka-remove-guardrails-tenant`, and a directory-search resource picker. These are **allowed**
> by `LokkaPolicy` (guardrails are user-set policy that limits only Lokka calls, not EntraPulse's
> auth) and are not added to `LOKKA_AUTH_MUTATING_TOOLS`. Guardrails enforcement is **off by
> default** in Lokka, so exposing these apps does not change EntraPulse's own query behaviour.

- **mimeType:** `text/html;profile=mcp-app` (constant `UI_APP_MIME_TYPE`). The announcement blog's `text/html+mcp` is **wrong** for 2.1.2.
- `resources/read` returns `{ contents:[{ uri, mimeType, text:<full HTML>, _meta }] }`. The HTML is self-contained (inline bundled JS) → mount via `<iframe srcdoc>`.

### Resource `_meta.ui` (drives sandbox/CSP)
```jsonc
{ "ui": {
    "csp": {
      "connectDomains": ["https://devxapi-func-prod-eastus.azurewebsites.net"], // Graph Explorer "Code" snippet service
      "resourceDomains": []
    },
    "permissions": { "clipboardWrite": {} },
    "prefersBorder": true
} }
```

### Tool → UI linkage (`_meta` on tool definitions & results)
```jsonc
"_meta": {
  "ui": { "resourceUri": "ui://lokka/graph-explorer.html", "visibility": ["model","app"] },
  "ui/resourceUri": "ui://lokka/graph-explorer.html"  // deprecated flat key, kept for pre-GA hosts
}
```
EntraPulse should read the **nested `_meta.ui.resourceUri`** first and fall back to the flat `_meta["ui/resourceUri"]`. `Lokka-Microsoft` carries the graph-explorer URI so query results can auto-open the explorer.

---

## 5. Sandbox / CSP posture for `McpAppFrame`

- Mount as `<iframe srcdoc={html}>` — **no remote origin**; the iframe's origin is opaque (`null`).
- `sandbox="allow-scripts"` (required — the apps run bundled JS). **Do not** add `allow-same-origin` (would give the opaque-origin frame access to host storage). `clipboardWrite` permission → add `allow-clipboard-write` only if needed.
- CSP for the frame content: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src` limited to `csp.connectDomains` from the resource `_meta.ui`. Block all other remote origins.
- Validate `event.source` on every inbound postMessage; never trust `event.origin` (it's `null` for srcdoc).

---

## 6. Open items to confirm at runtime (carry into later phases)
- Confirm `resources/list` returns the four URIs once `SdkMcpConnection` is live (Lokka shows no gating in the bundle).
- Confirm how gracefully Connections/Permissions degrade when auth-mutating `tools/call`s are denied (Level A) — see plan §4/§8.
- Confirm the host's `ui/initialize` reply shape Lokka actually consumes (`displayMode`, `availableDisplayModes`, `styles.variables`).
