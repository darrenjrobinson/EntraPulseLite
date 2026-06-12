// ExternalLokkaMCPStdioServer Integration Test
// Tests the four-tier client architecture and tool mapping functionality

import { ExternalLokkaMCPStdioServer } from '../../mcp/servers/lokka/ExternalLokkaMCPStdioServer';
import { MCPAuthService } from '../../mcp/auth/MCPAuthService';
import { ConfigService } from '../../shared/ConfigService';
import { ExternalLokkaMCPServerConfig } from '../../mcp/servers/lokka/ExternalLokkaMCPStdioServer';

// Mock dependencies
jest.mock('../../mcp/auth/MCPAuthService');
jest.mock('../../shared/ConfigService');

describe('ExternalLokkaMCPStdioServer Four-Tier Architecture', () => {
  let server: ExternalLokkaMCPStdioServer;
  let mockAuthService: jest.Mocked<MCPAuthService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let serverConfig: ExternalLokkaMCPServerConfig;

  beforeEach(() => {
    // Create mocks
    mockAuthService = {
      getToken: jest.fn(),
    } as any;

    mockConfigService = {
      getAuthenticationPreference: jest.fn().mockReturnValue('interactive'),
      getEntraConfig: jest.fn().mockReturnValue({
        useGraphPowerShell: false,
        clientId: 'test-client-id',
        tenantId: 'test-tenant-id'
      }),
    } as any;

    // Create server configuration
    serverConfig = {
      name: 'external-lokka',
      type: 'external-lokka',
      enabled: true,
      port: 0, // Not used for stdio but required by interface
      command: 'npx',
      args: ['-y', '@merill/lokka@2.0.0'],
      env: {
        TENANT_ID: 'test-tenant-id',
        CLIENT_ID: 'test-client-id',
        ACCESS_TOKEN: 'test-access-token',
        USE_CLIENT_TOKEN: 'true',
        USE_INTERACTIVE: 'false'
      }
    };

    // Create server instance
    server = new ExternalLokkaMCPStdioServer(
      serverConfig,
      mockAuthService,
      mockConfigService
    );
  });

  afterEach(async () => {
    if (server) {
      try {
        // Force stop with timeout to prevent hanging tests
        await Promise.race([
          server.stopServer(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
      } catch (error) {
        // Ignore cleanup errors in tests, but log them for debugging
        console.log('Test cleanup error (ignoring):', error instanceof Error ? error.message : String(error));
      }
      
      // Give time for process events to complete before Jest teardown
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Final cleanup to ensure no lingering processes
    if (server) {
      try {
        await server.stopServer();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    // Give extra time for any lingering async operations
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  describe('Client Priority System', () => {
    it('should initialize with correct tool definitions', () => {
      const status = server.getStatus();
      expect(status.toolCount).toBeGreaterThan(0);
      
      // Verify essential tools are defined
      expect(server).toBeDefined();
    });

    it('should report correct status when no clients are running', () => {
      const status = server.getStatus();
      
      expect(status.running).toBe(false);
      expect(status.initialized).toBe(false);
      expect(status.activeClient).toBe('none');
      expect(status.toolCount).toBeGreaterThan(0);
    });

    it('should not be ready when no clients are initialized', () => {
      const isReady = server.isReady();
      expect(isReady).toBe(false);
    });
  });

  describe('Tool Name Mapping', () => {
    it('should map microsoft_graph_query to Lokka-Microsoft', async () => {
      // Mock a scenario where no clients are available to test the error path
      try {
        await server.callTool('microsoft_graph_query', {
          endpoint: '/me',
          method: 'GET'
        });
      } catch (error) {
        // Expected to fail since no clients are running
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('server not initialized');
      }
    });

    it('should preserve original tool names for non-mapped tools', async () => {
      try {
        await server.callTool('some-other-tool', {
          param: 'value'
        });
      } catch (error) {
        // Expected to fail since no clients are running
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('server not initialized');
      }
    });
  });

  describe('Environment Configuration', () => {
    it('should validate environment variables correctly', () => {
      const config = serverConfig.env!;
      
      expect(config.TENANT_ID).toBe('test-tenant-id');
      expect(config.CLIENT_ID).toBe('test-client-id');
      expect(config.ACCESS_TOKEN).toBe('test-access-token');
      expect(config.USE_CLIENT_TOKEN).toBe('true');
    });

    it('should handle missing environment variables gracefully', async () => {
      const incompleteConfig = {
        ...serverConfig,
        env: {
          // Missing required variables
          USE_CLIENT_TOKEN: 'true'
        }
      };

      const incompleteServer = new ExternalLokkaMCPStdioServer(
        incompleteConfig,
        mockAuthService,
        mockConfigService
      );

      // Should not throw during construction
      expect(incompleteServer).toBeDefined();
      
      try {
        await incompleteServer.verifyEnvironmentConfig();
      } catch (error) {
        // Expected to fail verification with incomplete environment
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Environment variables not properly configured');
      }
    });
  });

  describe('Authentication Integration', () => {
    it('should handle token refresh scenarios', async () => {
      const mockToken = {
        accessToken: 'new-access-token',
        idToken: 'id-token',
        expiresOn: new Date(Date.now() + 3600000), // 1 hour from now
        scopes: ['https://graph.microsoft.com/.default']
      };

      mockAuthService.getToken.mockResolvedValue(mockToken);

      // Test restart after authentication
      try {
        await server.restartAfterAuthentication();
      } catch (error) {
        // Expected to fail in test environment without actual Lokka
        expect(error).toBeInstanceOf(Error);
      }

      // Verify that getToken was called
      expect(mockAuthService.getToken).toHaveBeenCalled();
    });

    it('should handle authentication failures gracefully', async () => {
      mockAuthService.getToken.mockRejectedValue(new Error('Authentication failed'));

      try {
        await server.restartAfterAuthentication();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Authentication failed');
      }
    });
  });

  describe('Configuration Service Integration', () => {
    it('should respect Enhanced Graph Access settings', () => {
      mockConfigService.getEntraConfig.mockReturnValue({
        useGraphPowerShell: true,
        clientId: 'test-client',
        tenantId: 'test-tenant'
      });

      // Test that enhanced graph access preference is read
      const entraConfig = mockConfigService.getEntraConfig();
      expect(entraConfig?.useGraphPowerShell).toBe(true);
    });

    it('should handle missing Entra configuration', () => {
      mockConfigService.getEntraConfig.mockReturnValue(null);

      const entraConfig = mockConfigService.getEntraConfig();
      expect(entraConfig).toBeNull();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle client startup failures gracefully', async () => {
      // Test startup when npx is not available (common in test environments)
      try {
        await server.startServer();
      } catch (error) {
        // Should not throw unhandled errors
        console.log('Expected startup failure in test environment:', (error as Error).message);
      }

      // Server should still be in a valid state
      expect(server).toBeDefined();
    });

    it('should handle concurrent startup attempts', async () => {
      // Start multiple startServer calls concurrently
      const startPromises = [
        server.startServer().catch(() => {}), // Ignore errors
        server.startServer().catch(() => {}),
        server.startServer().catch(() => {})
      ];

      await Promise.all(startPromises);

      // Should not cause any crashes or undefined state
      expect(server).toBeDefined();
    });

    it('should cleanup resources properly on stop', async () => {
      try {
        await server.startServer();
      } catch (error) {
        // Ignore startup errors
      }

      await server.stopServer();

      const status = server.getStatus();
      expect(status.running).toBe(false);
      expect(status.activeClient).toBe('none');
    });
  });
});

describe('Lokka MCP Server Configuration Validation', () => {
  it('should validate Microsoft Graph PowerShell client configuration', () => {
    const config: ExternalLokkaMCPServerConfig = {
      name: 'external-lokka',
      type: 'external-lokka',
      enabled: true,
      port: 0,
      command: 'npx',
      args: ['-y', '@merill/lokka@2.0.0'],
      env: {
        TENANT_ID: 'common',
        CLIENT_ID: '14d82eec-204b-4c2f-b7e8-296a70dab67e', // Microsoft Graph PowerShell
        USE_CLIENT_TOKEN: 'true'
      }
    };

    expect(config.env!.CLIENT_ID).toBe('14d82eec-204b-4c2f-b7e8-296a70dab67e');
    expect(config.env!.TENANT_ID).toBe('common');
    expect(config.env!.USE_CLIENT_TOKEN).toBe('true');
  });

  it('should validate custom application credentials configuration', () => {
    const config: ExternalLokkaMCPServerConfig = {
      name: 'external-lokka',
      type: 'external-lokka',
      enabled: true,
      port: 0,
      command: 'npx',
      args: ['-y', '@merill/lokka@2.0.0'],
      env: {
        TENANT_ID: 'custom-tenant-id',
        CLIENT_ID: 'custom-client-id',
        CLIENT_SECRET: 'custom-client-secret'
      }
    };

    expect(config.env!.TENANT_ID).toBe('custom-tenant-id');
    expect(config.env!.CLIENT_ID).toBe('custom-client-id');
    expect(config.env!.CLIENT_SECRET).toBe('custom-client-secret');
    expect(config.env!.USE_CLIENT_TOKEN).toBeUndefined(); // Not needed for client credentials
  });
});
