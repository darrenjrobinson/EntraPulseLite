import { mcpToggleRequiresReauth, MCP_ENDPOINT_REAUTH_NOTE, interactiveMcpAppsEnabled } from '../../shared/mcpSettings';

describe('mcpToggleRequiresReauth', () => {
  it('requires re-auth for both MCP profile toggles (they reinitialize services)', () => {
    expect(mcpToggleRequiresReauth('lokkaUseGraphBeta')).toBe(true);
    expect(mcpToggleRequiresReauth('microsoftEnterpriseEnabled')).toBe(true);
  });

  it('exposes a user-facing re-auth note', () => {
    expect(MCP_ENDPOINT_REAUTH_NOTE).toMatch(/sign in again/i);
  });
});

describe('interactiveMcpAppsEnabled', () => {
  it('defaults to enabled when unset (undefined config or field)', () => {
    expect(interactiveMcpAppsEnabled(undefined)).toBe(true);
    expect(interactiveMcpAppsEnabled(null)).toBe(true);
    expect(interactiveMcpAppsEnabled({})).toBe(true);
    expect(interactiveMcpAppsEnabled({ interactiveApps: true })).toBe(true);
  });

  it('is disabled only when explicitly false', () => {
    expect(interactiveMcpAppsEnabled({ interactiveApps: false })).toBe(false);
  });
});
