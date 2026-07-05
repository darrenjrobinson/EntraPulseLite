// Lokka's published multi-tenant public client id (mirrors LokkaClientId in @merill/lokka's
// build/constants.js for the pinned LOKKA_VERSION below). In client-provided-token mode Lokka's
// AuthManager uses the injected ACCESS_TOKEN and ignores CLIENT_ID — but Lokka's Connection Manager
// reuses process.env.CLIENT_ID for interactive "add connection" sign-ins. A per-profile app (or
// EntraPulse Lite's own app) is single-tenant and fails for any OTHER tenant (AADSTS700016:
// application not found in directory). Lokka's own client is multi-tenant and consentable in any
// tenant (the same client Lokka uses standalone), so EntraPulse runs Lokka with it in token mode so
// added connections can sign in anywhere. Re-verify this id when bumping LOKKA_VERSION.
export const LOKKA_INTERACTIVE_CLIENT_ID = 'a9bac4c3-af0d-4292-9453-9da89e390140';

// Lokka MCP server package constants
// Pin the version so a new upstream major release (e.g. the silent 0.3.0 -> 2.0.0 jump
// on npm) cannot reach users untested. Bump deliberately alongside the package.json
// dependency and re-run the Lokka integration tests.
export const LOKKA_PACKAGE_NAME = '@merill/lokka';
export const LOKKA_VERSION = '2.1.2';
export const LOKKA_PINNED_PACKAGE = `${LOKKA_PACKAGE_NAME}@${LOKKA_VERSION}`;
export const LOKKA_NPX_ARGS = ['-y', LOKKA_PINNED_PACKAGE];

// Lokka v2.1.2 registers many tools, including connection management
// (lokka-add-sp-connection accepts client secrets), interactive consent, guardrails
// configuration, and browser-launching helpers. EntraPulse Lite manages authentication
// and permissions itself, so only these tools are exposed to the LLM.
//
// The `open-*` tools open Lokka's six interactive MCP Apps (graph explorer, connections,
// permissions, help, settings, guardrails). They carry a `_meta.ui.resourceUri` and are
// rendered inline by McpAppFrame. They are gated at runtime by the MCP Apps host's policy
// (auth-mutating calls from those apps are intercepted), so exposing them does not let the
// apps bypass EntraPulse's auth ownership. Settings is an umbrella over Connections +
// Guardrails; Guardrails is user-set policy limiting model-originated Lokka calls.
// See docs/EntraPulse-Lokka-MCP-Apps-Plan.md.
export const LOKKA_UI_APP_TOOLS = [
  'open-graph-explorer',
  'open-lokka-connections',
  'open-lokka-permissions',
  'open-lokka-help',
  'open-lokka-settings',
  'open-lokka-guardrails'
];

export const LOKKA_EXPOSED_TOOLS = [
  'Lokka-Microsoft',
  'set-access-token',
  'get-auth-status',
  ...LOKKA_UI_APP_TOOLS
];

// Lokka tools blocked when initiated from an MCP App iframe. EntraPulse owns the PRIMARY
// connection (injected as Lokka's "env" connection via client-token mode) and owns permission
// consent, so these stay denied with a redirect to EntraPulse's settings:
//   - set-access-token        — EntraPulse's primary-token injection channel; the app must not
//                               override it.
//   - lokka-consent-permissions / add-graph-permission — permission grants belong to EntraPulse's
//                               own auth/consent flow.
//
// Lokka's CONNECTION-management tools (lokka-add-user-connection, lokka-add-sp-connection,
// switch-lokka-connection, lokka-set-active-connection, lokka-remove-connection,
// lokka-list-connections) are deliberately NOT listed: Lokka owns additional connections, doing
// its own sign-in and routing Graph calls through the active connection's own credential
// (connectionManager.getActiveClient), so the Connection Manager works natively while the
// EntraPulse-owned primary connection remains available. See docs/EntraPulse-Lokka-MCP-Apps-Plan.md §4.
//
// Lokka's GUARDRAILS-config tools (lokka-get-guardrails-config, lokka-set-guardrails-enabled,
// lokka-set-guardrails-scope, lokka-remove-guardrails-tenant, and the guardrails resource picker)
// are also deliberately NOT listed: guardrails are user-set policy that only limits Lokka calls,
// not EntraPulse's auth, so the Settings/Guardrails apps configure them natively over the bridge.
export const LOKKA_AUTH_MUTATING_TOOLS = [
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

// Intent routing for Lokka's interactive MCP apps. When the user clearly wants to manage
// connections, review permissions, or get help, EntraPulse opens the matching open-* tool
// so its MCP app renders inline (rather than running a Graph query). Patterns are kept
// specific to app-management intents to avoid hijacking ordinary Graph questions.
export const LOKKA_APP_INTENTS: Array<{ tool: string; resourceUri: string; patterns: RegExp[] }> = [
  {
    // Graph Explorer also auto-opens on Graph queries; these handle the explicit
    // "open it now" command from the Help app (openMessage: "open lokka").
    tool: 'open-graph-explorer',
    resourceUri: 'ui://lokka/graph-explorer.html',
    patterns: [
      /\bopen\s+lokka\b/i,
      /\bopen\s+(the\s+)?graph\s+explorer\b/i,
      /\bopen\s+(the\s+)?(lokka\s+)?explorer\b/i,
    ],
  },
  {
    tool: 'open-lokka-connections',
    resourceUri: 'ui://lokka/connections.html',
    patterns: [
      /\blokka\s+sign[\s-]?in\b/i,           // Help app "Open it now" -> openMessage "lokka sign in"
      /\b(connection|tenant)\s+manager\b/i,
      /\bmanage\s+(my\s+)?(connections|tenants)\b/i,
      /\bmulti[-\s]?tenant\b/i,
      /\badd\s+(a\s+)?(connection|tenant)\b/i,
      /\b(switch|change)\s+(to\s+)?(?:a\s+|an\s+|another\s+|different\s+|the\s+|my\s+)*tenant\b/i,
      /\bsign\s*in\s+to\s+(another|a\s+different)\s+tenant\b/i,
    ],
  },
  {
    tool: 'open-lokka-permissions',
    resourceUri: 'ui://lokka/permissions.html',
    patterns: [
      /\blokka\s+permissions\b/i,             // Help app "Open it now" -> openMessage "lokka permissions"
      /\bpermissions?\s+manager\b/i,
      /\bmanage\s+(my\s+)?permissions\b/i,
      /\breview\s+(my\s+)?(graph\s+)?permissions\b/i,
      /\b(grant|manage)\s+consent\b/i,
      /\bconsent\s+to\b/i,
      /\bwhat\s+(scopes|permissions)\s+(do\s+i\s+have|are\s+granted)\b/i,
    ],
  },
  {
    tool: 'open-lokka-help',
    resourceUri: 'ui://lokka/help.html',
    patterns: [
      /\blokka\s+help\b/i,
      /\bwhat\s+can\s+lokka\s+do\b/i,
      /\bhelp\s+tour\b/i,
      /\bshow\s+(me\s+)?(the\s+)?lokka\s+help\b/i,
      /\bgetting\s+started\s+with\s+lokka\b/i,
    ],
  },
  {
    // Lokka Settings is an umbrella app over Connections + Guardrails. Help app
    // "Open it now" -> openMessage "lokka settings".
    tool: 'open-lokka-settings',
    resourceUri: 'ui://lokka/settings.html',
    patterns: [
      /\blokka\s+settings\b/i,
      /\bmanage\s+lokka\b/i,
      /\blokka\s+config(uration)?\b/i,
      /\bopen\s+(the\s+)?lokka\s+settings\b/i,
    ],
  },
  {
    // Guardrails = user-set policy limiting what model tool calls may do.
    tool: 'open-lokka-guardrails',
    resourceUri: 'ui://lokka/guardrails.html',
    patterns: [
      /\b(lokka\s+)?guardrails?\b/i,
      /\b(limit|restrict)\s+(what\s+)?(the\s+)?(ai|model)\s+can\b/i,
      /\bmanage\s+(my\s+)?guardrails\b/i,
    ],
  },
];

/**
 * Detect whether a user query is an explicit request to open one of Lokka's MCP apps.
 * Returns the open-* tool + its UI resource, or null if it's an ordinary query.
 */
export function detectLokkaAppIntent(query: string): { tool: string; resourceUri: string } | null {
  if (!query) return null;
  for (const intent of LOKKA_APP_INTENTS) {
    if (intent.patterns.some((p) => p.test(query))) {
      return { tool: intent.tool, resourceUri: intent.resourceUri };
    }
  }
  return null;
}

// Tools whose UI link lives on the tool DEFINITION rather than the call result.
// Lokka-Microsoft auto-opens the graph explorer (its result does not carry _meta,
// only the definition does). The open-* tools carry _meta on their results directly,
// so they don't need an entry here. Used by resolveUiResourceUri().
export const LOKKA_TOOL_DEFINITION_UI_RESOURCES: Record<string, string> = {
  'Lokka-Microsoft': 'ui://lokka/graph-explorer.html'
};

// ---------------------------------------------------------------------------
// EntraPulse Polyarchy MCP server (interactive identity-relationship visualizer)
// ---------------------------------------------------------------------------

// Pin the version so a new upstream release cannot reach users untested. Bump
// deliberately alongside the package.json dependency and re-run the polyarchy
// integration tests.
export const POLYARCHY_PACKAGE_NAME = 'entrapulse-polyarchy';
export const POLYARCHY_VERSION = '0.1.11';
export const POLYARCHY_PINNED_PACKAGE = `${POLYARCHY_PACKAGE_NAME}@${POLYARCHY_VERSION}`;
export const POLYARCHY_NPX_ARGS = ['-y', POLYARCHY_PINNED_PACKAGE];

// Used as both the server config `name` and `type`.
export const POLYARCHY_SERVER_ID = 'entrapulse-polyarchy';

// The single self-contained MCP App the server serves (D3 force graph).
export const POLYARCHY_UI_RESOURCE = 'ui://entrapulse-polyarchy/mcp-app.html';

// Polyarchy runs in client-provided-token mode (USE_CLIENT_TOKEN): EntraPulse owns the
// token channel. The LLM gets the opener, the headless report (v0.1.11+, structured
// JSON for analysis/summaries), plus lightweight lookups/diagnostics;
// polyarchy-expand / get-photo / get-manager are driven by the app UI over the iframe
// bridge, which bypasses this allowlist (same as Lokka's un-exposed tools).
export const POLYARCHY_EXPOSED_TOOLS = [
  'visualize-identity',
  'polyarchy-report',
  'polyarchy-search',
  'get-auth-status'
];

// Denied from the MCP App iframe: set-access-token is EntraPulse's primary-token
// injection channel; the app must not override it.
export const POLYARCHY_AUTH_MUTATING_TOOLS = ['set-access-token'];

// visualize-identity's UI link lives on its tool definition; map it explicitly so the
// app auto-opens even when the call result carries no _meta. Used by resolveUiResourceUri().
export const POLYARCHY_TOOL_DEFINITION_UI_RESOURCES: Record<string, string> = {
  'visualize-identity': POLYARCHY_UI_RESOURCE
};

// Intent routing for the Polyarchy app. Patterns stay anchored to identity/org/
// relationship nouns (never bare "visualize") so ordinary Graph questions aren't
// hijacked. Subject-capturing patterns pass the captured name as a search argument.
const POLYARCHY_SELF_SUBJECTS = new Set(['me', 'my', 'myself', 'the', 'my own']);

export const POLYARCHY_APP_INTENTS: Array<{ patterns: RegExp[]; captureSearch?: boolean }> = [
  {
    // "open/show the polyarchy", or any mention of the distinctive word itself
    patterns: [
      /\b(open|show)\s+(me\s+)?(the\s+)?(identity\s+)?polyarchy\b/i,
      /\bpolyarchy\b/i,
    ],
  },
  {
    // "visualize my identity/org chart/relationships" -> /me
    patterns: [/\bvisuali[sz]e\s+(?:my|the)\s+(?:identity|org(?:\s+chart)?|relationships)\b/i],
  },
  {
    // "visualize Megan's relationships", "identity graph for Rebecca" -> { search }
    captureSearch: true,
    patterns: [
      /\bvisuali[sz]e\s+(.+?)(?:'s)?\s+(?:identity|relationships|org(?:\s+chart)?)\b/i,
      /\b(?:identity|relationship)\s+(?:graph|map|visuali[sz]ation)\s+(?:for|of)\s+(.+?)\s*[.?!]?\s*$/i,
    ],
  },
];

// polyarchy-report (v0.1.11+) is the headless counterpart to visualize-identity:
// a structured JSON identity report the LLM analyzes in chat instead of opening the
// app. Map the relationship noun the user asked about to the report's dimensions
// (default: all).
const POLYARCHY_REPORT_DIMENSIONS: Record<string, string[]> = {
  'group membership': ['groups'],
  'group memberships': ['groups'],
  'groups': ['groups'],
  'access': ['roles', 'applications'],
  'roles': ['roles'],
  'applications': ['applications'],
  'app assignments': ['applications'],
};

const POLYARCHY_REPORT_PATTERNS: Array<{ re: RegExp; subject?: number; noun?: number }> = [
  // "identity report for Megan", "run a polyarchy report on Adele Vance"
  { re: /\b(?:identity|relationship|access|polyarchy)\s+report\s+(?:for|of|on)\s+(.+?)\s*[.?!]?\s*$/i, subject: 1 },
  // "identity report", "access report" — the signed-in user
  { re: /\b(?:identity|relationship|access|polyarchy)\s+report\b/i },
  // "report on Megan's group memberships", "summarize Rebecca's access"
  { re: /\breport\s+on\s+(.+?)(?:'s)?\s+(identity|relationships?|access|group\s+memberships?|groups|roles|applications|app\s+assignments)\b/i, subject: 1, noun: 2 },
  { re: /\bsummari[sz]e\s+(.+?)(?:'s)?\s+(identity|relationships|access|group\s+memberships?|groups|roles|applications|app\s+assignments)\b/i, subject: 1, noun: 2 },
];

/**
 * Detect whether a user query asks for an identity relationship report/summary —
 * the headless polyarchy-report tool, whose structured JSON the LLM analyzes in
 * chat (no app UI). Check this BEFORE detectPolyarchyAppIntent: "polyarchy report"
 * would otherwise match the visualizer's bare /polyarchy/ pattern.
 */
export function detectPolyarchyReportIntent(
  query: string
): { tool: string; args: Record<string, any> } | null {
  if (!query) return null;
  for (const { re, subject, noun } of POLYARCHY_REPORT_PATTERNS) {
    const match = re.exec(query);
    if (!match) continue;
    const args: Record<string, any> = {};
    if (subject && match[subject]) {
      const s = match[subject].trim().replace(/[.?!]+$/, '');
      if (s && !POLYARCHY_SELF_SUBJECTS.has(s.toLowerCase())) {
        args.search = s;
      }
    }
    if (noun && match[noun]) {
      const dims = POLYARCHY_REPORT_DIMENSIONS[match[noun].toLowerCase().replace(/\s+/g, ' ')];
      if (dims) args.dimensions = dims;
    }
    return { tool: 'polyarchy-report', args };
  }
  return null;
}

/**
 * Detect whether a user query asks to open the Polyarchy identity visualizer.
 * Returns the visualize-identity tool call (with a search arg when the query
 * names someone else), or null for ordinary queries.
 */
export function detectPolyarchyAppIntent(
  query: string
): { tool: string; resourceUri: string; args: Record<string, any> } | null {
  if (!query) return null;
  for (const intent of POLYARCHY_APP_INTENTS) {
    for (const pattern of intent.patterns) {
      const match = pattern.exec(query);
      if (!match) continue;
      const args: Record<string, any> = {};
      if (intent.captureSearch && match[1]) {
        const subject = match[1].trim().replace(/[.?!]+$/, '');
        if (subject && !POLYARCHY_SELF_SUBJECTS.has(subject.toLowerCase())) {
          args.search = subject;
        }
      }
      return { tool: 'visualize-identity', resourceUri: POLYARCHY_UI_RESOURCE, args };
    }
  }
  return null;
}
