// Unit tests for MCP Apps UI-resource resolution (Phase 2).
import { resolveUiResourceUri } from '../../mcp/types';
import { LOKKA_TOOL_DEFINITION_UI_RESOURCES, LOKKA_EXPOSED_TOOLS, LOKKA_UI_APP_TOOLS, graphApiVersionFromBeta, detectLokkaAppIntent } from '../../mcp/constants';

describe('resolveUiResourceUri', () => {
  it('reads nested _meta.ui.resourceUri from a tool result (open-* tools)', () => {
    const result = { _meta: { ui: { resourceUri: 'ui://lokka/connections.html' } }, structuredContent: { lokkaApp: 'connections' } };
    expect(resolveUiResourceUri('open-lokka-connections', result)).toBe('ui://lokka/connections.html');
  });

  it('falls back to the deprecated flat _meta["ui/resourceUri"]', () => {
    const result = { _meta: { 'ui/resourceUri': 'ui://lokka/help.html' } };
    expect(resolveUiResourceUri('open-lokka-help', result)).toBe('ui://lokka/help.html');
  });

  it('prefers nested over flat when both present', () => {
    const result = { _meta: { ui: { resourceUri: 'ui://nested' }, 'ui/resourceUri': 'ui://flat' } };
    expect(resolveUiResourceUri('x', result)).toBe('ui://nested');
  });

  it('falls back to the tool-definition map when the result carries no _meta (Lokka-Microsoft)', () => {
    const result = { content: [{ type: 'text', text: '{}' }], structuredContent: { value: [] } };
    expect(resolveUiResourceUri('Lokka-Microsoft', result, LOKKA_TOOL_DEFINITION_UI_RESOURCES)).toBe('ui://lokka/graph-explorer.html');
  });

  it('returns undefined for a tool with no UI link', () => {
    const result = { content: [{ type: 'text', text: 'ok' }] };
    expect(resolveUiResourceUri('get-auth-status', result, LOKKA_TOOL_DEFINITION_UI_RESOURCES)).toBeUndefined();
  });
});

describe('graphApiVersionFromBeta', () => {
  it('returns v1.0 by default (undefined/false) and beta only when explicitly enabled', () => {
    expect(graphApiVersionFromBeta(undefined)).toBe('v1.0');
    expect(graphApiVersionFromBeta(false)).toBe('v1.0');
    expect(graphApiVersionFromBeta(true)).toBe('beta');
  });
});

describe('detectLokkaAppIntent', () => {
  it('routes the Help app "Open it now" commands to the matching app', () => {
    expect(detectLokkaAppIntent('open lokka')).toEqual({ tool: 'open-graph-explorer', resourceUri: 'ui://lokka/graph-explorer.html' });
    expect(detectLokkaAppIntent('lokka sign in')).toEqual({ tool: 'open-lokka-connections', resourceUri: 'ui://lokka/connections.html' });
    expect(detectLokkaAppIntent('lokka permissions')).toEqual({ tool: 'open-lokka-permissions', resourceUri: 'ui://lokka/permissions.html' });
    expect(detectLokkaAppIntent('lokka help')).toEqual({ tool: 'open-lokka-help', resourceUri: 'ui://lokka/help.html' });
  });

  it('routes "open graph explorer" to the explorer', () => {
    expect(detectLokkaAppIntent('open the graph explorer')).toEqual({ tool: 'open-graph-explorer', resourceUri: 'ui://lokka/graph-explorer.html' });
  });

  it('routes connection-management intents to open-lokka-connections', () => {
    for (const q of ['open the connection manager', 'manage my connections', 'add a tenant', 'switch to a different tenant', 'multi-tenant setup']) {
      expect(detectLokkaAppIntent(q)).toEqual({ tool: 'open-lokka-connections', resourceUri: 'ui://lokka/connections.html' });
    }
  });

  it('routes permission-management intents to open-lokka-permissions', () => {
    for (const q of ['open the permissions manager', 'review my permissions', 'grant consent', 'what scopes do I have']) {
      expect(detectLokkaAppIntent(q)).toEqual({ tool: 'open-lokka-permissions', resourceUri: 'ui://lokka/permissions.html' });
    }
  });

  it('routes help intents to open-lokka-help', () => {
    for (const q of ['lokka help', 'what can lokka do', 'show me the lokka help']) {
      expect(detectLokkaAppIntent(q)).toEqual({ tool: 'open-lokka-help', resourceUri: 'ui://lokka/help.html' });
    }
  });

  it('does NOT hijack ordinary Graph queries', () => {
    for (const q of ['list all users', 'show my group memberships', 'how many guest accounts are there', 'get the CEO of the company', '']) {
      expect(detectLokkaAppIntent(q)).toBeNull();
    }
  });
});

describe('Lokka exposed-tools allowlist', () => {
  it('exposes the four open-* UI app tools alongside the core tools', () => {
    expect(LOKKA_UI_APP_TOOLS).toEqual([
      'open-graph-explorer',
      'open-lokka-connections',
      'open-lokka-permissions',
      'open-lokka-help',
    ]);
    for (const t of LOKKA_UI_APP_TOOLS) {
      expect(LOKKA_EXPOSED_TOOLS).toContain(t);
    }
    expect(LOKKA_EXPOSED_TOOLS).toContain('Lokka-Microsoft');
    expect(LOKKA_EXPOSED_TOOLS).toContain('set-access-token');
    expect(LOKKA_EXPOSED_TOOLS).toContain('get-auth-status');
  });
});
