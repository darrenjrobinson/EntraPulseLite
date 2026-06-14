// Lokka MCP server package constants
// Pin the version so a new upstream major release (e.g. the silent 0.3.0 -> 2.0.0 jump
// on npm) cannot reach users untested. Bump deliberately alongside the package.json
// dependency and re-run the Lokka integration tests.
export const LOKKA_PACKAGE_NAME = '@merill/lokka';
export const LOKKA_VERSION = '2.0.0';
export const LOKKA_PINNED_PACKAGE = `${LOKKA_PACKAGE_NAME}@${LOKKA_VERSION}`;
export const LOKKA_NPX_ARGS = ['-y', LOKKA_PINNED_PACKAGE];

// Lokka v2.0.0 registers 16 tools, including connection management
// (lokka-add-sp-connection accepts client secrets), interactive consent, and
// browser-launching helpers. EntraPulse Lite manages authentication and
// permissions itself, so only these tools are exposed to the LLM.
//
// The `open-*` tools open Lokka's interactive MCP Apps (graph explorer, connections,
// permissions, help). They carry a `_meta.ui.resourceUri` and are rendered inline by
// McpAppFrame. They are gated at runtime by the MCP Apps host's policy (auth-mutating
// calls from those apps are intercepted), so exposing them does not let the apps bypass
// EntraPulse's auth ownership. See docs/EntraPulse-Lokka-MCP-Apps-Plan.md.
export const LOKKA_UI_APP_TOOLS = [
  'open-graph-explorer',
  'open-lokka-connections',
  'open-lokka-permissions',
  'open-lokka-help'
];

export const LOKKA_EXPOSED_TOOLS = [
  'Lokka-Microsoft',
  'set-access-token',
  'get-auth-status',
  ...LOKKA_UI_APP_TOOLS
];

// Lokka tools that PERFORM authentication/connection mutations. EntraPulse owns auth,
// so these are denied when initiated from an MCP App iframe (policy Level A). Read/display
// tools (lokka-list-connections, lokka-get-permissions, get-auth-status, Lokka-Microsoft)
// are NOT listed and remain allowed. See docs/EntraPulse-Lokka-MCP-Apps-Plan.md §4.
export const LOKKA_AUTH_MUTATING_TOOLS = [
  'lokka-add-user-connection',
  'lokka-add-sp-connection',
  'lokka-remove-connection',
  'lokka-set-active-connection',
  'switch-lokka-connection',
  'lokka-consent-permissions',
  'add-graph-permission',
  'set-access-token'
];

// Resolve the Graph API version to use for a Lokka-Microsoft call from the configured
// beta preference. Lokka v2 defaults to beta (which returns the full property set);
// EntraPulse surfaces the leaner v1.0 unless beta is explicitly enabled. Passing this
// explicitly keeps the actual query and the Graph Explorer's displayed version in sync.
export function graphApiVersionFromBeta(useGraphBeta?: boolean): 'beta' | 'v1.0' {
  return useGraphBeta ? 'beta' : 'v1.0';
}

// Tools whose UI link lives on the tool DEFINITION rather than the call result.
// Lokka-Microsoft auto-opens the graph explorer (its result does not carry _meta,
// only the definition does). The open-* tools carry _meta on their results directly,
// so they don't need an entry here. Used by resolveUiResourceUri().
export const LOKKA_TOOL_DEFINITION_UI_RESOURCES: Record<string, string> = {
  'Lokka-Microsoft': 'ui://lokka/graph-explorer.html'
};
