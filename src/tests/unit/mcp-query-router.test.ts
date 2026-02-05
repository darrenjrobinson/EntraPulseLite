/**
 * MCPQueryRouter Unit Tests
 * Tests for the intelligent routing logic between Lokka MCP and Microsoft Enterprise MCP
 */

import {
  MCPQueryRouter,
  ENTERPRISE_KEYWORDS,
  RoutingDecision,
  RoutingConfig
} from '../../mcp/routing/MCPQueryRouter';

describe('MCPQueryRouter', () => {
  describe('routeQuery - Single Server Enabled', () => {
    it('should route to Lokka when only Lokka is enabled', () => {
      const config: RoutingConfig = {
        lokkaEnabled: true,
        microsoftMcpEnabled: false
      };

      const decision = MCPQueryRouter.routeQuery('show me all users', config);

      expect(decision.server).toBe('lokka');
      expect(decision.reason).toBe('Only Lokka MCP is enabled');
      expect(decision.confidence).toBe(1.0);
    });

    it('should route to Microsoft MCP when only Microsoft MCP is enabled', () => {
      const config: RoutingConfig = {
        lokkaEnabled: false,
        microsoftMcpEnabled: true
      };

      const decision = MCPQueryRouter.routeQuery('show me all users', config);

      expect(decision.server).toBe('microsoft-enterprise');
      expect(decision.reason).toBe('Only Microsoft Enterprise MCP is enabled');
      expect(decision.confidence).toBe(1.0);
    });

    it('should return null server when no servers are enabled', () => {
      const config: RoutingConfig = {
        lokkaEnabled: false,
        microsoftMcpEnabled: false
      };

      const decision = MCPQueryRouter.routeQuery('show me all users', config);

      expect(decision.server).toBeNull();
      expect(decision.reason).toBe('No MCP servers are enabled');
      expect(decision.confidence).toBe(1.0);
    });
  });

  describe('routeQuery - Auto-Routing (Both Servers Enabled)', () => {
    const autoRoutingConfig: RoutingConfig = {
      lokkaEnabled: true,
      microsoftMcpEnabled: true
    };

    describe('General queries → Lokka', () => {
      const generalQueries = [
        'show me all users',
        'list groups',
        'what applications are registered',
        'get my calendar events',
        'show group memberships',
        'list service principals',
        'get user profile'
      ];

      generalQueries.forEach(query => {
        it(`should route "${query}" to Lokka`, () => {
          const decision = MCPQueryRouter.routeQuery(query, autoRoutingConfig);

          expect(decision.server).toBe('lokka');
          expect(decision.reason).toContain('General query');
          expect(decision.fallbackServer).toBe('microsoft-enterprise');
        });
      });
    });

    describe('Audit Log queries → Microsoft MCP', () => {
      const auditQueries = [
        'show me sign-in logs',
        'get signin activity for users',
        'failed login attempts',
        'audit log for directory',
        'authentication events today',
        'show recent sign in failures'
      ];

      auditQueries.forEach(query => {
        it(`should route "${query}" to Microsoft MCP`, () => {
          const decision = MCPQueryRouter.routeQuery(query, autoRoutingConfig);

          expect(decision.server).toBe('microsoft-enterprise');
          expect(decision.reason).toContain('AUDIT_LOGS');
          expect(decision.fallbackServer).toBe('lokka');
          expect(decision.keywords).toBeDefined();
          expect(decision.keywords!.length).toBeGreaterThan(0);
        });
      });
    });

    describe('PIM queries → Microsoft MCP', () => {
      const pimQueries = [
        'show privileged roles',
        'PIM role assignments',
        'eligible roles for users',
        'privileged access management',
        'just-in-time admin access',
        'role activation history'
      ];

      pimQueries.forEach(query => {
        it(`should route "${query}" to Microsoft MCP`, () => {
          const decision = MCPQueryRouter.routeQuery(query, autoRoutingConfig);

          expect(decision.server).toBe('microsoft-enterprise');
          expect(decision.reason).toContain('PIM');
          expect(decision.fallbackServer).toBe('lokka');
        });
      });
    });

    describe('Conditional Access queries → Microsoft MCP', () => {
      const caQueries = [
        'conditional access policies',
        'CA policy configurations',
        'MFA requirements',
        'access control policies'
      ];

      caQueries.forEach(query => {
        it(`should route "${query}" to Microsoft MCP`, () => {
          const decision = MCPQueryRouter.routeQuery(query, autoRoutingConfig);

          expect(decision.server).toBe('microsoft-enterprise');
          expect(decision.reason).toContain('CONDITIONAL_ACCESS');
          expect(decision.fallbackServer).toBe('lokka');
        });
      });
    });

    describe('Device Compliance queries → Microsoft MCP', () => {
      const complianceQueries = [
        'device compliance status',
        'managed devices',
        'non-compliant devices',
        'intune device status',
        'device health report'
      ];

      complianceQueries.forEach(query => {
        it(`should route "${query}" to Microsoft MCP`, () => {
          const decision = MCPQueryRouter.routeQuery(query, autoRoutingConfig);

          expect(decision.server).toBe('microsoft-enterprise');
          expect(decision.reason).toContain('DEVICE_COMPLIANCE');
          expect(decision.fallbackServer).toBe('lokka');
        });
      });
    });
  });

  describe('shouldUseMicrosoftMCP', () => {
    const config: RoutingConfig = {
      lokkaEnabled: true,
      microsoftMcpEnabled: true
    };

    it('should return true for enterprise queries', () => {
      expect(MCPQueryRouter.shouldUseMicrosoftMCP('show sign-in logs', config)).toBe(true);
    });

    it('should return false for general queries', () => {
      expect(MCPQueryRouter.shouldUseMicrosoftMCP('list all users', config)).toBe(false);
    });
  });

  describe('shouldUseLokka', () => {
    const config: RoutingConfig = {
      lokkaEnabled: true,
      microsoftMcpEnabled: true
    };

    it('should return true for general queries', () => {
      expect(MCPQueryRouter.shouldUseLokka('list all users', config)).toBe(true);
    });

    it('should return false for enterprise queries', () => {
      expect(MCPQueryRouter.shouldUseLokka('show sign-in logs', config)).toBe(false);
    });
  });

  describe('getRoutingMode', () => {
    it('should return "lokka-only" when only Lokka enabled', () => {
      const mode = MCPQueryRouter.getRoutingMode({
        lokkaEnabled: true,
        microsoftMcpEnabled: false
      });
      expect(mode).toBe('lokka-only');
    });

    it('should return "microsoft-only" when only Microsoft MCP enabled', () => {
      const mode = MCPQueryRouter.getRoutingMode({
        lokkaEnabled: false,
        microsoftMcpEnabled: true
      });
      expect(mode).toBe('microsoft-only');
    });

    it('should return "auto-routing" when both enabled', () => {
      const mode = MCPQueryRouter.getRoutingMode({
        lokkaEnabled: true,
        microsoftMcpEnabled: true
      });
      expect(mode).toBe('auto-routing');
    });

    it('should return "none" when neither enabled', () => {
      const mode = MCPQueryRouter.getRoutingMode({
        lokkaEnabled: false,
        microsoftMcpEnabled: false
      });
      expect(mode).toBe('none');
    });
  });

  describe('getRoutingDescription', () => {
    it('should describe Lokka routing', () => {
      const decision: RoutingDecision = {
        server: 'lokka',
        reason: 'General query detected',
        confidence: 0.8
      };

      const description = MCPQueryRouter.getRoutingDescription(decision);

      expect(description).toContain('Lokka MCP');
      expect(description).toContain('local');
      expect(description).toContain('General query detected');
    });

    it('should describe Microsoft MCP routing', () => {
      const decision: RoutingDecision = {
        server: 'microsoft-enterprise',
        reason: 'Enterprise keywords found',
        confidence: 0.9
      };

      const description = MCPQueryRouter.getRoutingDescription(decision);

      expect(description).toContain('Microsoft Enterprise MCP');
      expect(description).toContain('cloud');
      expect(description).toContain('Enterprise keywords found');
    });

    it('should handle null server', () => {
      const decision: RoutingDecision = {
        server: null,
        reason: 'No servers enabled',
        confidence: 1.0
      };

      const description = MCPQueryRouter.getRoutingDescription(decision);

      expect(description).toBe('No MCP server available');
    });
  });

  describe('validateConfig', () => {
    it('should validate config with Lokka enabled', () => {
      const result = MCPQueryRouter.validateConfig({
        lokkaEnabled: true,
        microsoftMcpEnabled: false
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate config with Microsoft MCP enabled', () => {
      const result = MCPQueryRouter.validateConfig({
        lokkaEnabled: false,
        microsoftMcpEnabled: true
      });

      expect(result.valid).toBe(true);
    });

    it('should validate config with both enabled', () => {
      const result = MCPQueryRouter.validateConfig({
        lokkaEnabled: true,
        microsoftMcpEnabled: true
      });

      expect(result.valid).toBe(true);
    });

    it('should invalidate config with neither enabled', () => {
      const result = MCPQueryRouter.validateConfig({
        lokkaEnabled: false,
        microsoftMcpEnabled: false
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('At least one MCP server must be enabled');
    });
  });

  describe('getEnterpriseFeatureCategory', () => {
    it('should detect AUDIT_LOGS category', () => {
      const category = MCPQueryRouter.getEnterpriseFeatureCategory('show sign-in logs');
      expect(category).toBe('AUDIT_LOGS');
    });

    it('should detect PIM category', () => {
      const category = MCPQueryRouter.getEnterpriseFeatureCategory('privileged role assignments');
      expect(category).toBe('PIM');
    });

    it('should detect CONDITIONAL_ACCESS category', () => {
      const category = MCPQueryRouter.getEnterpriseFeatureCategory('conditional access policies');
      expect(category).toBe('CONDITIONAL_ACCESS');
    });

    it('should detect DEVICE_COMPLIANCE category', () => {
      const category = MCPQueryRouter.getEnterpriseFeatureCategory('device compliance status');
      expect(category).toBe('DEVICE_COMPLIANCE');
    });

    it('should return null for non-enterprise queries', () => {
      const category = MCPQueryRouter.getEnterpriseFeatureCategory('show me all users');
      expect(category).toBeNull();
    });
  });

  describe('getRoutingStats', () => {
    const config: RoutingConfig = {
      lokkaEnabled: true,
      microsoftMcpEnabled: true
    };

    it('should calculate routing statistics correctly', () => {
      const queries = [
        'show all users',                    // Lokka
        'list groups',                       // Lokka
        'sign-in logs',                      // Microsoft - AUDIT
        'conditional access policies',       // Microsoft - CA
        'device compliance status'           // Microsoft - COMPLIANCE
      ];

      const stats = MCPQueryRouter.getRoutingStats(queries, config);

      expect(stats.totalQueries).toBe(5);
      expect(stats.lokkaCount).toBe(2);
      expect(stats.microsoftMcpCount).toBe(3);
      expect(stats.routingMode).toBe('auto-routing');
      expect(stats.enterpriseFeatureUsage.AUDIT_LOGS).toBe(1);
      expect(stats.enterpriseFeatureUsage.CONDITIONAL_ACCESS).toBe(1);
      expect(stats.enterpriseFeatureUsage.DEVICE_COMPLIANCE).toBe(1);
    });

    it('should handle empty query list', () => {
      const stats = MCPQueryRouter.getRoutingStats([], config);

      expect(stats.totalQueries).toBe(0);
      expect(stats.lokkaCount).toBe(0);
      expect(stats.microsoftMcpCount).toBe(0);
    });

    it('should track all queries going to Lokka when lokka-only', () => {
      const lokkaOnlyConfig: RoutingConfig = {
        lokkaEnabled: true,
        microsoftMcpEnabled: false
      };

      const queries = ['sign-in logs', 'audit logs', 'users'];
      const stats = MCPQueryRouter.getRoutingStats(queries, lokkaOnlyConfig);

      expect(stats.lokkaCount).toBe(3);
      expect(stats.microsoftMcpCount).toBe(0);
      expect(stats.routingMode).toBe('lokka-only');
    });
  });

  describe('ENTERPRISE_KEYWORDS', () => {
    it('should have AUDIT_LOGS keywords', () => {
      expect(ENTERPRISE_KEYWORDS.AUDIT_LOGS).toBeDefined();
      expect(ENTERPRISE_KEYWORDS.AUDIT_LOGS.length).toBeGreaterThan(0);
      expect(ENTERPRISE_KEYWORDS.AUDIT_LOGS).toContain('sign-in');
      expect(ENTERPRISE_KEYWORDS.AUDIT_LOGS).toContain('audit');
    });

    it('should have PIM keywords', () => {
      expect(ENTERPRISE_KEYWORDS.PIM).toBeDefined();
      expect(ENTERPRISE_KEYWORDS.PIM.length).toBeGreaterThan(0);
      expect(ENTERPRISE_KEYWORDS.PIM).toContain('PIM');
      expect(ENTERPRISE_KEYWORDS.PIM).toContain('privileged');
    });

    it('should have CONDITIONAL_ACCESS keywords', () => {
      expect(ENTERPRISE_KEYWORDS.CONDITIONAL_ACCESS).toBeDefined();
      expect(ENTERPRISE_KEYWORDS.CONDITIONAL_ACCESS.length).toBeGreaterThan(0);
      expect(ENTERPRISE_KEYWORDS.CONDITIONAL_ACCESS).toContain('conditional access');
      expect(ENTERPRISE_KEYWORDS.CONDITIONAL_ACCESS).toContain('MFA');
    });

    it('should have DEVICE_COMPLIANCE keywords', () => {
      expect(ENTERPRISE_KEYWORDS.DEVICE_COMPLIANCE).toBeDefined();
      expect(ENTERPRISE_KEYWORDS.DEVICE_COMPLIANCE.length).toBeGreaterThan(0);
      expect(ENTERPRISE_KEYWORDS.DEVICE_COMPLIANCE).toContain('device compliance');
      expect(ENTERPRISE_KEYWORDS.DEVICE_COMPLIANCE).toContain('intune');
    });
  });

  describe('Confidence Scoring', () => {
    const config: RoutingConfig = {
      lokkaEnabled: true,
      microsoftMcpEnabled: true
    };

    it('should have high confidence for queries with multiple keywords', () => {
      // Query with multiple audit-related keywords
      const decision = MCPQueryRouter.routeQuery(
        'show sign-in audit logs for failed login attempts',
        config
      );

      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should have moderate confidence for queries with single keyword', () => {
      // Query with single keyword
      const decision = MCPQueryRouter.routeQuery(
        'show audit stuff',
        config
      );

      expect(decision.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should have moderate confidence for general queries', () => {
      const decision = MCPQueryRouter.routeQuery(
        'list all users in the directory',
        config
      );

      expect(decision.confidence).toBe(0.8);
    });
  });
});

describe('MCPQueryRouter - Edge Cases', () => {
  const config: RoutingConfig = {
    lokkaEnabled: true,
    microsoftMcpEnabled: true
  };

  it('should handle empty query', () => {
    const decision = MCPQueryRouter.routeQuery('', config);
    expect(decision.server).toBe('lokka');
  });

  it('should handle query with only whitespace', () => {
    const decision = MCPQueryRouter.routeQuery('   ', config);
    expect(decision.server).toBe('lokka');
  });

  it('should be case-insensitive for keywords', () => {
    const decision1 = MCPQueryRouter.routeQuery('SIGN-IN LOGS', config);
    const decision2 = MCPQueryRouter.routeQuery('sign-in logs', config);
    const decision3 = MCPQueryRouter.routeQuery('Sign-In Logs', config);

    expect(decision1.server).toBe('microsoft-enterprise');
    expect(decision2.server).toBe('microsoft-enterprise');
    expect(decision3.server).toBe('microsoft-enterprise');
  });

  it('should handle mixed enterprise and general terms', () => {
    // Query mentions audit but in general context
    const decision = MCPQueryRouter.routeQuery(
      'show sign-in logs for the sales team users',
      config
    );

    // Should still route to Microsoft MCP because of enterprise keywords
    expect(decision.server).toBe('microsoft-enterprise');
  });
});
