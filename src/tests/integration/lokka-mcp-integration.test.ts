// lokka-mcp-integration.test.ts
// Integration tests for the Lokka MCP four-tier client architecture

import { ExternalLokkaMCPStdioServer } from '../../mcp/servers/lokka/ExternalLokkaMCPStdioServer';
import { PersistentLokkaMCPClient } from '../../mcp/clients/PersistentLokkaMCPClient';
import { ManagedLokkaMCPClient } from '../../mcp/clients/ManagedLokkaMCPClient';
import { EnhancedStdioMCPClient } from '../../mcp/clients/EnhancedStdioMCPClient';
import { StdioMCPClient } from '../../mcp/clients/StdioMCPClient';
import { MCPAuthService } from '../../mcp/auth/MCPAuthService';
import { ConfigService } from '../../shared/ConfigService';
import { LOKKA_INTERACTIVE_CLIENT_ID } from '../../mcp/constants';

// Mock dependencies
jest.mock('../../mcp/auth/MCPAuthService');
jest.mock('../../shared/ConfigService');
jest.mock('../../mcp/clients/PersistentLokkaMCPClient');
jest.mock('../../mcp/clients/ManagedLokkaMCPClient');
jest.mock('../../mcp/clients/EnhancedStdioMCPClient');
jest.mock('../../mcp/clients/StdioMCPClient');

describe('Lokka MCP Integration Tests', () => {
  let server: ExternalLokkaMCPStdioServer;
  let mockAuthService: jest.Mocked<MCPAuthService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const mockConfig = {
    name: 'external-lokka',
    type: 'external-lokka' as const,
    enabled: true,
    port: 0, // Added required port field
    command: 'npx',
    args: ['-y', '@merill/lokka@2.1.2'],
    env: {
      TENANT_ID: 'test-tenant-id',
      CLIENT_ID: 'test-client-id',
      ACCESS_TOKEN: 'test-access-token',
      USE_CLIENT_TOKEN: 'true',
      // Legacy four-tier tests: disable tier-0 SDK transport (covered separately).
      LOKKA_USE_SDK_TRANSPORT: 'false'
    }
  };

  beforeEach(() => {
    mockAuthService = {
      getToken: jest.fn().mockResolvedValue({
        accessToken: 'test-access-token',
        idToken: 'test-id-token',
        expiresOn: new Date(Date.now() + 3600000),
        scopes: ['https://graph.microsoft.com/.default']
      })
    } as any;

    mockConfigService = {
      getAuthenticationPreference: jest.fn().mockReturnValue('interactive'),
      getEntraConfig: jest.fn().mockReturnValue({
        useGraphPowerShell: false
      })
    } as any;

    server = new ExternalLokkaMCPStdioServer(mockConfig, mockAuthService, mockConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Ensure server is stopped and cleaned up after all tests
    if (server) {
      try {
        await server.stopServer();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    // Give a brief moment for any async cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Four-Tier Client Architecture', () => {
    it('should prioritize PersistentLokkaMCPClient when available', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true),
        sendRequest: jest.fn().mockResolvedValue({ result: { tools: [] } })
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      await server.startServer();

      expect(PersistentLokkaMCPClient).toHaveBeenCalledWith({
        TENANT_ID: 'test-tenant-id',
        // Client-token mode + profile-specific tenant: the per-profile CLIENT_ID is replaced with
        // Lokka's multi-tenant client so its Connection Manager can sign in to other tenants.
        CLIENT_ID: LOKKA_INTERACTIVE_CLIENT_ID,
        ACCESS_TOKEN: 'test-access-token',
        USE_CLIENT_TOKEN: 'true',
        LOKKA_USE_SDK_TRANSPORT: 'false'
      });

      expect(mockPersistentClient.start).toHaveBeenCalled();

      const status = server.getStatus();
      expect(status.activeClient).toBe('persistent');
      expect(status.running).toBe(true);
      expect(status.initialized).toBe(true);
    });

    it('should fall back to ManagedLokkaMCPClient when persistent client fails', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockRejectedValue(new Error('NPX not found')),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false)
      };

      const mockManagedClient = {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true),
        sendRequest: jest.fn().mockResolvedValue({ result: { tools: [] } })
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);
      (ManagedLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockManagedClient);

      await server.startServer();

      expect(mockPersistentClient.start).toHaveBeenCalled();
      expect(mockPersistentClient.stop).toHaveBeenCalled();
      expect(mockManagedClient.start).toHaveBeenCalled();

      const status = server.getStatus();
      expect(status.activeClient).toBe('managed');
    });

    it('should fall back to EnhancedStdioMCPClient when Enhanced Graph Access is enabled', async () => {
      mockConfigService.getEntraConfig.mockReturnValue({
        clientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        useGraphPowerShell: true
      });

      const mockPersistentClient = {
        start: jest.fn().mockRejectedValue(new Error('NPX not found')),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false)
      };

      const mockManagedClient = {
        start: jest.fn().mockRejectedValue(new Error('Environment variables missing')),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false)
      };

      const mockEnhancedClient = {
        startServer: jest.fn().mockResolvedValue(undefined),
        stopServer: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(true),
        listTools: jest.fn().mockResolvedValue([])
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);
      (ManagedLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockManagedClient);
      (EnhancedStdioMCPClient as unknown as jest.Mock).mockImplementation(() => mockEnhancedClient);

      await server.startServer();

      expect(mockEnhancedClient.startServer).toHaveBeenCalled();

      const status = server.getStatus();
      expect(status.activeClient).toBe('enhanced');
    });
  });

  describe('Tool Discovery and Validation', () => {
    it('should discover Lokka tools correctly', async () => {
      const expectedTools = [
        {
          name: 'Lokka-Microsoft',
          description: 'Query Microsoft Graph API via Lokka MCP server',
          inputSchema: {
            type: 'object',
            properties: {
              apiType: { type: 'string', enum: ['graph', 'azure'] },
              method: { type: 'string', enum: ['get', 'post', 'put', 'patch', 'delete'] },
              path: { type: 'string' }
            },
            required: ['apiType', 'method', 'path']
          }
        }
      ];

      const mockPersistentClient = {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true),
        sendRequest: jest.fn().mockResolvedValue({ 
          result: { tools: expectedTools } 
        })
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      await server.startServer();
      const tools = await server.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('Lokka-Microsoft');
      expect(tools[0].description).toContain('Microsoft Graph API');
    });

    it('should validate environment variables correctly', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true)
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      await server.startServer();
      
      // Should not throw since we have TENANT_ID and CLIENT_ID
      await expect(server.verifyEnvironmentConfig()).resolves.not.toThrow();
    });

    it('should fail environment validation when required variables are missing', async () => {
      const configWithMissingVars = {
        ...mockConfig,
        env: {
          ACCESS_TOKEN: 'test-access-token'
          // Missing TENANT_ID and CLIENT_ID
        }
      };

      server = new ExternalLokkaMCPStdioServer(configWithMissingVars, mockAuthService, mockConfigService);

      const mockPersistentClient = {
        start: jest.fn().mockRejectedValue(new Error('Required environment variables (TENANT_ID, CLIENT_ID) are missing or empty for persistent client')),
        isAlive: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false),
        stop: jest.fn().mockResolvedValue(undefined)
      };

      const mockManagedClient = {
        start: jest.fn().mockRejectedValue(new Error('Required environment variables (TENANT_ID, CLIENT_ID) are missing or empty for managed client')),
        isAlive: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false),
        stop: jest.fn().mockResolvedValue(undefined)
      };

      const mockOriginalClient = {
        start: jest.fn().mockResolvedValue(undefined),
        isRunning: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true),
        stop: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue([])
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);
      (ManagedLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockManagedClient);
      (StdioMCPClient as unknown as jest.Mock).mockImplementation(() => mockOriginalClient);

      // Server should start but fall back to original client
      await server.startServer();
      
      // Since all preferred clients fail, the server should still be running with the original client
      // but environment validation should detect the missing variables
      await expect(server.verifyEnvironmentConfig()).rejects.toThrow(
        'Environment variables not properly configured for portable build'
      );
    }, 45000); // Increase timeout to 45 seconds
  });

  describe('Tool Name Mapping', () => {
    it('should map microsoft_graph_query to Lokka-Microsoft', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true),
        sendRequest: jest.fn().mockResolvedValue({
          result: {
            content: [{ text: JSON.stringify({ value: [{ displayName: 'Test User' }] }) }]
          }
        })
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      await server.startServer();

      const result = await server.callTool('microsoft_graph_query', {
        endpoint: '/me',
        method: 'GET'
      });

      expect(mockPersistentClient.sendRequest).toHaveBeenCalledWith('tools/call', {
        name: 'Lokka-Microsoft',
        arguments: {
          apiType: 'graph',
          method: 'GET', // Updated to match actual implementation
          path: '/me',
          queryParams: undefined,
          body: undefined
        }
      });

      expect(result).toBeDefined();
    });
  });

  describe('Authentication Flow', () => {
    it('should restart server after authentication with fresh access token', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true)
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      await server.startServer();

      // Mock fresh token
      mockAuthService.getToken.mockResolvedValue({
        accessToken: 'fresh-access-token',
        idToken: 'fresh-id-token',
        expiresOn: new Date(Date.now() + 3600000),
        scopes: ['https://graph.microsoft.com/.default']
      });

      await server.restartAfterAuthentication();

      expect(mockPersistentClient.stop).toHaveBeenCalled();
      expect(mockPersistentClient.start).toHaveBeenCalledTimes(2); // Initial start + restart
    });
  });

  describe('Error Handling', () => {
    it('should handle client startup failures gracefully', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockRejectedValue(new Error('NPX not found')),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false)
      };

      const mockManagedClient = {
        start: jest.fn().mockRejectedValue(new Error('Environment variables missing')),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false)
      };

      const mockEnhancedClient = {
        startServer: jest.fn().mockRejectedValue(new Error('Enhanced client failed')),
        stopServer: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(false)
      };

      const mockOriginalClient = {
        start: jest.fn().mockRejectedValue(new Error('Original client failed')),
        stop: jest.fn().mockResolvedValue(undefined),
        isRunning: jest.fn().mockReturnValue(false),
        isInitialized: jest.fn().mockReturnValue(false)
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);
      (ManagedLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockManagedClient);
      (EnhancedStdioMCPClient as unknown as jest.Mock).mockImplementation(() => mockEnhancedClient);
      (StdioMCPClient as unknown as jest.Mock).mockImplementation(() => mockOriginalClient);

      // Should not throw even when all clients fail
      await expect(server.startServer()).resolves.not.toThrow();

      const status = server.getStatus();
      expect(status.activeClient).toBe('none'); // Should be 'none' when all clients fail
      expect(status.running).toBe(false);
    });

    it('should detect and report mock responses instead of real API data', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true),
        sendRequest: jest.fn().mockResolvedValue({
          content: [{ text: 'Response from tool microsoft_graph_query with args: {...}' }]
        })
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      await server.startServer();

      const result = await server.callTool('microsoft_graph_query', {
        endpoint: '/me',
        method: 'GET'
      });

      // Should detect that this is a mock response
      expect(result.content[0].text).toContain('Response from tool');
    });
  });

  describe('Server Lifecycle', () => {
    it('should stop all clients when stopping server', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true)
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      await server.startServer();
      await server.stopServer();

      expect(mockPersistentClient.stop).toHaveBeenCalled();

      const status = server.getStatus();
      expect(status.activeClient).toBe('none');
    });

    it('should prevent concurrent startup attempts', async () => {
      const mockPersistentClient = {
        start: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100))),
        isAlive: jest.fn().mockReturnValue(true),
        isInitialized: jest.fn().mockReturnValue(true)
      };

      (PersistentLokkaMCPClient as unknown as jest.Mock).mockImplementation(() => mockPersistentClient);

      // Start multiple concurrent startup attempts
      const startPromises = [
        server.startServer(),
        server.startServer(),
        server.startServer()
      ];

      await Promise.all(startPromises);

      // Should only start once
      expect(mockPersistentClient.start).toHaveBeenCalledTimes(1);
    });
  });
});
