// Unit tests for Microsoft Docs MCP Client (no network required)
import { MicrosoftDocsMCPClient } from '../../mcp/clients/MicrosoftDocsMCPClient';
import { MCPAuthService } from '../../mcp/auth/MCPAuthService';
import { MCPServerConfig } from '../../mcp/types';

// Mock fetch globally for unit tests
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('MicrosoftDocsMCPClient Unit Tests', () => {
  let client: MicrosoftDocsMCPClient;
  let serverConfig: MCPServerConfig;
  let mockAuthService: jest.Mocked<MCPAuthService>;

  beforeEach(() => {
    // Setup mock auth service
    mockAuthService = {
      getAuthHeaders: jest.fn().mockResolvedValue({
        'User-Agent': 'EntraPulseLite/1.0',
        'Content-Type': 'application/json'
      })
    } as any;

    // Setup server config
    serverConfig = {
      name: 'microsoft-docs',
      type: 'microsoft-docs',
      port: 0,
      enabled: true,
      url: 'https://learn.microsoft.com/api/mcp',
      authConfig: {
        type: 'none'
      }
    };

    client = new MicrosoftDocsMCPClient(serverConfig, mockAuthService);
    
    // Reset fetch mock
    mockFetch.mockClear();
  });

  describe('Constructor', () => {
    test('should create client with correct configuration', () => {
      expect(client).toBeInstanceOf(MicrosoftDocsMCPClient);
    });

    test('should use custom URL if provided', () => {
      const customConfig = {
        ...serverConfig,
        url: 'https://custom-url.com/mcp'
      };
      const customClient = new MicrosoftDocsMCPClient(customConfig, mockAuthService);
      expect(customClient).toBeInstanceOf(MicrosoftDocsMCPClient);
    });
  });

  describe('listTools', () => {
    test('should make correct HTTP request for listing tools', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            {
              name: 'search_docs',
              description: 'Search Microsoft documentation'
            }
          ]
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const tools = await client.listTools();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://learn.microsoft.com/api/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'User-Agent': 'MCP-Client/1.0.1'
          }),
          body: expect.stringContaining('"method":"tools/list"')
        })
      );

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('search_docs');
    });

    test('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers()
      } as Response);

      await expect(client.listTools()).rejects.toThrow('HTTP Streamable MCP request failed: HTTP 500: Internal Server Error');
    });

    test('should handle MCP errors gracefully', async () => {
      const mockErrorResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        json: () => Promise.resolve(mockErrorResponse)
      } as Response);

      await expect(client.listTools()).rejects.toThrow('Failed to list tools: Method not found');
    });
  });

  describe('callTool', () => {
    test('should make correct HTTP request for calling tools', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: 'Documentation content here'
            }
          ]
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const result = await client.callTool('search_docs', {
        query: 'Microsoft Graph authentication',
        maxResults: 5
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://learn.microsoft.com/api/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('"method":"tools/call"')
        })
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBe('Documentation content here');
    });
  });

  describe('healthCheck', () => {
    test('should return true when server is healthy', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: []
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(true);
    });

    test('should return false when server is unhealthy', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle network timeouts', async () => {
      mockFetch.mockRejectedValue(new Error('fetch timeout'));

      await expect(client.listTools()).rejects.toThrow('HTTP Streamable MCP request failed: fetch timeout');
    });

    test('should handle invalid JSON responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        json: () => Promise.reject(new Error('Invalid JSON'))
      } as Response);

      await expect(client.listTools()).rejects.toThrow('HTTP Streamable MCP request failed');
    });
  });
});
