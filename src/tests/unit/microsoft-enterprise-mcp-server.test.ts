/**
 * MicrosoftEnterpriseMCPServer Unit Tests
 * Tests for the high-level MCP server that wraps Microsoft Enterprise MCP
 */

import { MicrosoftEnterpriseMCPServer } from '../../mcp/servers/MicrosoftEnterpriseMCPServer';
import { MCPServerConfig } from '../../types';

// Mock AuthService
const mockAuthService = {
  getMCPToken: jest.fn(),
  getToken: jest.fn(),
  isAuthenticated: jest.fn().mockReturnValue(true)
};

describe('MicrosoftEnterpriseMCPServer', () => {
  let server: MicrosoftEnterpriseMCPServer;
  let serverConfig: MCPServerConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    serverConfig = {
      name: 'microsoft-enterprise',
      type: 'microsoft-enterprise',
      url: 'https://mcp.svc.cloud.microsoft/enterprise',
      port: 0,
      enabled: true
    };
    
    server = new MicrosoftEnterpriseMCPServer(serverConfig, mockAuthService as any);
  });

  describe('Constructor', () => {
    it('should create server with config', () => {
      expect(server).toBeDefined();
    });

    it('should create server with default URL if not provided', () => {
      const configWithoutUrl: MCPServerConfig = {
        name: 'microsoft-enterprise',
        type: 'microsoft-enterprise',
        port: 0,
        enabled: true
      };
      
      const serverWithDefaults = new MicrosoftEnterpriseMCPServer(configWithoutUrl);
      expect(serverWithDefaults).toBeDefined();
    });

    it('should create server without auth service', () => {
      const serverNoAuth = new MicrosoftEnterpriseMCPServer(serverConfig);
      expect(serverNoAuth).toBeDefined();
    });
  });

  describe('isReady', () => {
    it('should return false before startServer is called', () => {
      expect(server.isReady()).toBe(false);
    });
  });

  describe('startServer', () => {
    it('should start server and set initialized state', async () => {
      mockAuthService.getMCPToken.mockResolvedValue({
        accessToken: 'mock-token-12345'
      });

      await server.startServer();
      
      expect(server.isReady()).toBe(true);
    });

    it('should handle missing token gracefully', async () => {
      mockAuthService.getMCPToken.mockResolvedValue(null);

      // Should not throw, just log warning
      await expect(server.startServer()).resolves.not.toThrow();
      expect(server.isReady()).toBe(true);
    });

    it('should handle auth service error', async () => {
      mockAuthService.getMCPToken.mockRejectedValue(new Error('Auth failed'));

      await expect(server.startServer()).rejects.toThrow();
    });
  });

  describe('stopServer', () => {
    it('should stop server and clear state', async () => {
      mockAuthService.getMCPToken.mockResolvedValue({
        accessToken: 'mock-token-12345'
      });

      await server.startServer();
      expect(server.isReady()).toBe(true);

      await server.stopServer();
      expect(server.isReady()).toBe(false);
    });

    it('should be safe to call stopServer without starting', async () => {
      await expect(server.stopServer()).resolves.not.toThrow();
    });
  });

  describe('handleRequest - tools/list', () => {
    beforeEach(async () => {
      mockAuthService.getMCPToken.mockResolvedValue({
        accessToken: 'mock-token-12345'
      });
      await server.startServer();
    });

    it('should return list of available tools', async () => {
      const response = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      expect(response).toBeDefined();
      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools.length).toBe(3);
    });

    it('should include microsoft_graph_suggest_queries tool', async () => {
      const response = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      const suggestTool = response.tools.find(
        (t: any) => t.name === 'microsoft_graph_suggest_queries'
      );

      expect(suggestTool).toBeDefined();
      expect(suggestTool.description).toContain('Suggest');
      expect(suggestTool.inputSchema).toBeDefined();
      expect(suggestTool.inputSchema.properties.user_query).toBeDefined();
    });

    it('should include microsoft_graph_get tool', async () => {
      const response = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      const getTool = response.tools.find(
        (t: any) => t.name === 'microsoft_graph_get'
      );

      expect(getTool).toBeDefined();
      expect(getTool.description).toContain('Graph API');
      expect(getTool.inputSchema).toBeDefined();
      expect(getTool.inputSchema.properties.url).toBeDefined();
    });

    it('should include microsoft_graph_list_properties tool', async () => {
      const response = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      const propsTool = response.tools.find(
        (t: any) => t.name === 'microsoft_graph_list_properties'
      );

      expect(propsTool).toBeDefined();
      expect(propsTool.description).toContain('properties');
      expect(propsTool.inputSchema).toBeDefined();
      expect(propsTool.inputSchema.properties.entity_type).toBeDefined();
    });
  });

  describe('handleRequest - ping', () => {
    beforeEach(async () => {
      mockAuthService.getMCPToken.mockResolvedValue({
        accessToken: 'mock-token-12345'
      });
      await server.startServer();
    });

    it('should respond to ping with status ok', async () => {
      const response = await server.handleRequest({
        method: 'ping',
        params: {}
      });

      expect(response).toBeDefined();
      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
    });
  });

  describe('handleRequest - unsupported method', () => {
    beforeEach(async () => {
      mockAuthService.getMCPToken.mockResolvedValue({
        accessToken: 'mock-token-12345'
      });
      await server.startServer();
    });

    it('should throw error for unsupported method', async () => {
      await expect(
        server.handleRequest({
          method: 'unsupported_method',
          params: {}
        })
      ).rejects.toThrow('Unsupported method: unsupported_method');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit status', () => {
      const status = server.getRateLimitStatus();

      expect(status).toBeDefined();
      expect(status.requestsThisMinute).toBeGreaterThanOrEqual(0);
      expect(status.maxRequestsPerMinute).toBe(100);
    });
  });

  describe('Tool schemas', () => {
    beforeEach(async () => {
      mockAuthService.getMCPToken.mockResolvedValue({
        accessToken: 'mock-token-12345'
      });
      await server.startServer();
    });

    it('should have correct schema for microsoft_graph_suggest_queries', async () => {
      const response = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      const tool = response.tools.find(
        (t: any) => t.name === 'microsoft_graph_suggest_queries'
      );

      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toContain('user_query');
      expect(tool.inputSchema.properties.top.type).toBe('number');
      expect(tool.inputSchema.properties.top.default).toBe(5);
    });

    it('should have correct schema for microsoft_graph_get', async () => {
      const response = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      const tool = response.tools.find(
        (t: any) => t.name === 'microsoft_graph_get'
      );

      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toContain('url');
      expect(tool.inputSchema.properties.method.enum).toContain('GET');
    });

    it('should have correct schema for microsoft_graph_list_properties', async () => {
      const response = await server.handleRequest({
        method: 'tools/list',
        params: {}
      });

      const tool = response.tools.find(
        (t: any) => t.name === 'microsoft_graph_list_properties'
      );

      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toContain('entity_type');
    });
  });
});

describe('MicrosoftEnterpriseMCPServer - Auto-initialization', () => {
  it('should auto-initialize on first request if not started', async () => {
    const mockAuth = {
      getMCPToken: jest.fn().mockResolvedValue({
        accessToken: 'auto-init-token'
      })
    };

    const config: MCPServerConfig = {
      name: 'microsoft-enterprise',
      type: 'microsoft-enterprise',
      url: 'https://mcp.svc.cloud.microsoft/enterprise',
      port: 0,
      enabled: true
    };

    const server = new MicrosoftEnterpriseMCPServer(config, mockAuth as any);

    // Should auto-initialize when handling tools/list
    const response = await server.handleRequest({
      method: 'tools/list',
      params: {}
    });

    expect(server.isReady()).toBe(true);
    expect(response.tools).toBeDefined();
  });
});
