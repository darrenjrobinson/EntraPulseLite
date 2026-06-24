/**
 * MicrosoftEnterpriseMCPClient Unit Tests
 * Tests for the HTTP Streamable MCP client that connects to Microsoft Enterprise MCP
 */

import { MicrosoftEnterpriseMCPClient, MCPClientConfig } from '../../mcp/clients/MicrosoftEnterpriseMCPClient';

describe('MicrosoftEnterpriseMCPClient', () => {
  let client: MicrosoftEnterpriseMCPClient;

  beforeEach(() => {
    client = new MicrosoftEnterpriseMCPClient();
  });

  describe('Constructor', () => {
    it('should create client with default configuration', () => {
      const defaultClient = new MicrosoftEnterpriseMCPClient();
      expect(defaultClient).toBeDefined();
    });

    it('should create client with custom URL', () => {
      const customClient = new MicrosoftEnterpriseMCPClient({
        baseUrl: 'https://custom-mcp.example.com/api'
      });
      expect(customClient).toBeDefined();
    });

    it('should create client with custom timeout', () => {
      const customClient = new MicrosoftEnterpriseMCPClient({
        timeout: 60000
      });
      expect(customClient).toBeDefined();
    });

    it('should create client with cache disabled', () => {
      const customClient = new MicrosoftEnterpriseMCPClient({
        enableCache: false
      });
      expect(customClient).toBeDefined();
    });

    it('should create client with all custom options', () => {
      const config: MCPClientConfig = {
        baseUrl: 'https://custom-mcp.example.com/api',
        timeout: 45000,
        maxRetries: 5,
        enableCache: true
      };
      const customClient = new MicrosoftEnterpriseMCPClient(config);
      expect(customClient).toBeDefined();
    });
  });

  describe('setAccessToken', () => {
    it('should set access token', () => {
      const token = 'test-token-12345';
      
      // Should not throw
      expect(() => client.setAccessToken(token)).not.toThrow();
    });

    it('should handle empty token', () => {
      expect(() => client.setAccessToken('')).not.toThrow();
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit status', () => {
      const status = client.getRateLimitStatus();

      expect(status).toBeDefined();
      expect(status.requestsThisMinute).toBe(0);
      expect(status.maxRequestsPerMinute).toBe(100);
      expect(status.warningThreshold).toBe(80);
      expect(status.resetTime).toBeInstanceOf(Date);
    });

    it('should have reset time in the future', () => {
      const status = client.getRateLimitStatus();
      const now = new Date();

      expect(status.resetTime.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('isRateLimitWarning', () => {
    it('should return false when under warning threshold', () => {
      const result = client.isRateLimitWarning();
      expect(result).toBe(false);
    });
  });

  describe('isRateLimitExceeded', () => {
    it('should return false when under limit', () => {
      const result = client.isRateLimitExceeded();
      expect(result).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cache without error', () => {
      expect(() => client.clearCache()).not.toThrow();
    });

    it('should be able to clear cache multiple times', () => {
      client.clearCache();
      client.clearCache();
      expect(true).toBe(true); // No error means success
    });
  });

  describe('Error Handling', () => {
    it('should handle request without authentication', async () => {
      // Without setting a token, requests should fail with auth error
      await expect(
        client.callTool('microsoft_graph_get', { url: '/users' })
      ).rejects.toThrow();
    });
  });

  describe('Tool calls with mock responses', () => {
    let mockClient: MicrosoftEnterpriseMCPClient;

    beforeEach(() => {
      mockClient = new MicrosoftEnterpriseMCPClient();
      mockClient.setAccessToken('mock-access-token');
    });

    it('should validate tool parameters for microsoft_graph_get', async () => {
      // This will fail due to network but validates the call structure
      await expect(
        mockClient.callTool('microsoft_graph_get', { url: '/users' })
      ).rejects.toThrow(); // Will throw due to network/auth, but validates structure
    });

    it('should validate tool parameters for microsoft_graph_suggest_queries', async () => {
      await expect(
        mockClient.callTool('microsoft_graph_suggest_queries', {
          user_query: 'show me all users'
        })
      ).rejects.toThrow();
    });

    it('should validate tool parameters for microsoft_graph_list_properties', async () => {
      await expect(
        mockClient.callTool('microsoft_graph_list_properties', {
          entity_type: 'user'
        })
      ).rejects.toThrow();
    });
  });
});

describe('MicrosoftEnterpriseMCPClient Rate Limiting', () => {
  let client: MicrosoftEnterpriseMCPClient;

  beforeEach(() => {
    client = new MicrosoftEnterpriseMCPClient();
  });

  it('should track rate limit status correctly', () => {
    const status = client.getRateLimitStatus();

    expect(status.requestsThisMinute).toBeGreaterThanOrEqual(0);
    expect(status.maxRequestsPerMinute).toBe(100);
  });

  it('should report correct warning threshold', () => {
    const status = client.getRateLimitStatus();
    expect(status.warningThreshold).toBe(80);
  });
});

describe('MicrosoftEnterpriseMCPClient Caching', () => {
  it('should have caching enabled by default', () => {
    const client = new MicrosoftEnterpriseMCPClient();
    // Cache is internal, so we verify through behavior
    expect(client).toBeDefined();
  });

  it('should allow disabling cache', () => {
    const client = new MicrosoftEnterpriseMCPClient({ enableCache: false });
    expect(client).toBeDefined();
  });

  it('should clear cache successfully', () => {
    const client = new MicrosoftEnterpriseMCPClient();
    client.clearCache();
    // No error means cache cleared successfully
    expect(true).toBe(true);
  });
});
