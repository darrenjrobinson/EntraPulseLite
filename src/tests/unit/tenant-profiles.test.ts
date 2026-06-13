// tenant-profiles.test.ts
// Tests for tenant profile storage, migration, and context application

// Stateful in-memory electron-store mock
let storeData: Record<string, any> = {};

const mockStoreInstance = {
  get: jest.fn((key: string) => storeData[key]),
  set: jest.fn((key: string, value: any) => { storeData[key] = value; }),
  delete: jest.fn((key: string) => { delete storeData[key]; }),
  clear: jest.fn(() => { storeData = {}; })
};

jest.doMock('electron-store', () => jest.fn().mockImplementation((config: any) => {
  // Apply defaults like the real electron-store
  for (const [key, value] of Object.entries(config?.defaults || {})) {
    if (storeData[key] === undefined) {
      storeData[key] = value;
    }
  }
  return mockStoreInstance;
}));

import { ConfigService } from '../../shared/ConfigService';
import { TenantProfile } from '../../types';

function makeProfile(overrides: Partial<TenantProfile> = {}): TenantProfile {
  return {
    id: overrides.id ?? `id-${Math.random().toString(36).slice(2)}`,
    name: overrides.name ?? 'Contoso',
    entraConfig: overrides.entraConfig ?? {
      clientId: 'client-1',
      tenantId: 'tenant-1',
      useGraphPowerShell: false,
      useSystemBrowser: true
    },
    mcp: overrides.mcp ?? { microsoftEnterpriseEnabled: true, lokkaUseGraphBeta: false },
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z'
  };
}

describe('ConfigService - Tenant Profiles', () => {
  let configService: ConfigService;

  beforeEach(() => {
    storeData = {};
    jest.clearAllMocks();
    configService = new ConfigService();
    configService.setServiceLevelAccess(true);
  });

  describe('CRUD', () => {
    test('saves and retrieves profiles sorted by name', () => {
      configService.saveTenantProfile(makeProfile({ name: 'Zeta Corp' }));
      configService.saveTenantProfile(makeProfile({ name: 'Alpha Inc' }));

      const profiles = configService.getTenantProfiles();
      expect(profiles.map(p => p.name)).toEqual(['Alpha Inc', 'Zeta Corp']);
    });

    test('rejects duplicate names case-insensitively', () => {
      configService.saveTenantProfile(makeProfile({ name: 'Contoso' }));
      expect(() =>
        configService.saveTenantProfile(makeProfile({ name: '  contoso ' }))
      ).toThrow(/already exists/);
    });

    test('allows updating a profile without tripping the duplicate check', () => {
      const saved = configService.saveTenantProfile(makeProfile({ name: 'Contoso' }));
      const updated = configService.saveTenantProfile({
        ...saved,
        entraConfig: { ...saved.entraConfig, tenantId: 'tenant-2' }
      });
      expect(updated.entraConfig.tenantId).toBe('tenant-2');
      expect(configService.getTenantProfiles()).toHaveLength(1);
    });

    test('deletes a non-active profile', () => {
      const a = configService.saveTenantProfile(makeProfile({ name: 'A' }));
      const b = configService.saveTenantProfile(makeProfile({ name: 'B' }));
      configService.setActiveTenantProfileId(a.id);

      configService.deleteTenantProfile(b.id);
      expect(configService.getTenantProfiles().map(p => p.name)).toEqual(['A']);
    });

    test('refuses to delete the active profile', () => {
      const a = configService.saveTenantProfile(makeProfile({ name: 'A' }));
      configService.setActiveTenantProfileId(a.id);
      expect(() => configService.deleteTenantProfile(a.id)).toThrow(/active profile/);
    });

    test('active profile pointer round-trips', () => {
      const a = configService.saveTenantProfile(makeProfile({ name: 'A' }));
      configService.setActiveTenantProfileId(a.id);
      expect(configService.getActiveTenantProfileId()).toBe(a.id);
      expect(configService.getActiveTenantProfile()?.name).toBe('A');
    });

    test('setting an unknown active profile id throws', () => {
      expect(() => configService.setActiveTenantProfileId('nope')).toThrow(/not found/);
    });

    test('access is blocked without authentication or service-level access', () => {
      configService.setServiceLevelAccess(false);
      expect(configService.getTenantProfiles()).toEqual([]);
      expect(() => configService.saveTenantProfile(makeProfile())).toThrow(/blocked/);
    });
  });

  describe('migration (ensureTenantProfilesInitialized)', () => {
    test('wraps an existing Entra config into a Default profile and activates it', () => {
      configService.setAuthenticationContext('interactive', { id: 'test-user' });
      configService.saveEntraConfig({
        clientId: 'legacy-client',
        tenantId: 'legacy-tenant',
        useGraphPowerShell: true
      });
      configService.saveMCPConfig({
        lokka: { enabled: true, authMode: 'delegated', useGraphBeta: false },
        microsoftEnterprise: { enabled: true, grantedScopes: ['MCP.User.Read.All'] }
      } as any);

      const migrated = configService.ensureTenantProfilesInitialized();

      expect(migrated).not.toBeNull();
      expect(migrated!.name).toBe('Default');
      expect(migrated!.entraConfig.clientId).toBe('legacy-client');
      expect(migrated!.mcp).toEqual({ microsoftEnterpriseEnabled: true, lokkaUseGraphBeta: false });
      expect(configService.getActiveTenantProfileId()).toBe(migrated!.id);
    });

    test('is idempotent', () => {
      configService.setAuthenticationContext('interactive', { id: 'test-user' });
      configService.saveEntraConfig({ clientId: 'c', tenantId: 't' });

      const first = configService.ensureTenantProfilesInitialized();
      const second = configService.ensureTenantProfilesInitialized();

      expect(second!.id).toBe(first!.id);
      expect(configService.getTenantProfiles()).toHaveLength(1);
    });

    test('returns null when there is nothing to migrate', () => {
      configService.setAuthenticationContext('interactive', { id: 'test-user' });
      expect(configService.ensureTenantProfilesInitialized()).toBeNull();
      expect(configService.getTenantProfiles()).toEqual([]);
    });
  });

  describe('applyTenantProfileToCurrentContext', () => {
    test('writes entra config and MCP flags while preserving consent state', () => {
      configService.setAuthenticationContext('interactive', { id: 'test-user' });
      configService.saveMCPConfig({
        lokka: { enabled: true, authMode: 'delegated', useGraphBeta: true },
        microsoftEnterprise: { enabled: false, grantedScopes: ['MCP.User.Read.All'], consentedAt: '2026-01-01' }
      } as any);

      const profile = configService.saveTenantProfile(makeProfile({
        name: 'Fabrikam',
        entraConfig: { clientId: 'fab-client', tenantId: 'fab-tenant', useGraphPowerShell: true },
        mcp: { microsoftEnterpriseEnabled: true, lokkaUseGraphBeta: false }
      }));

      configService.applyTenantProfileToCurrentContext(profile);

      expect(configService.getEntraConfig()).toEqual(
        expect.objectContaining({ clientId: 'fab-client', tenantId: 'fab-tenant', useGraphPowerShell: true })
      );
      const mcp = configService.getMCPConfig();
      expect(mcp.lokka?.useGraphBeta).toBe(false);
      expect(mcp.lokka?.useGraphPowerShell).toBe(true);
      expect(mcp.microsoftEnterprise?.enabled).toBe(true);
      expect(mcp.microsoftEnterprise?.grantedScopes).toEqual(['MCP.User.Read.All']);
      expect(mcp.microsoftEnterprise?.consentedAt).toBe('2026-01-01');
    });
  });

  describe('root-key isolation', () => {
    test('profiles survive switching to a different user context', () => {
      configService.saveTenantProfile(makeProfile({ name: 'Persistent' }));

      configService.setAuthenticationContext('interactive', { id: 'user-tenant-b', email: 'admin@b.com' });

      expect(configService.getTenantProfiles().map(p => p.name)).toEqual(['Persistent']);
    });
  });

  describe('updateLokkaMCPConfig regression', () => {
    test('preserves useGraphBeta when updating other lokka fields', () => {
      configService.setAuthenticationContext('interactive', { id: 'test-user' });
      configService.saveMCPConfig({
        lokka: { enabled: true, authMode: 'delegated', useGraphBeta: false }
      } as any);

      configService.updateLokkaMCPConfig({ enabled: true, accessToken: 'tok' });

      expect(configService.getMCPConfig().lokka?.useGraphBeta).toBe(false);
    });
  });
});
