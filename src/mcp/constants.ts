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
export const LOKKA_EXPOSED_TOOLS = [
  'Lokka-Microsoft',
  'set-access-token',
  'get-auth-status'
];
