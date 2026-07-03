// src/tests/unit/mcp-servers.test.ts
// Tests for MCP server implementations

import { FetchMCPServer } from '../../mcp/servers/fetch';
import { PolyarchyMCPServer } from '../../mcp/servers/polyarchy/PolyarchyMCPServer';
import { MCPServerConfig } from '../../mcp/types';
import { MCPServerFactory } from '../../mcp/servers';
import { MCPAuthService } from '../../mcp/auth/MCPAuthService';
import { ConfigService } from '../../shared/ConfigService';

jest.mock('../../shared/ConfigService');

describe('MCP Servers', () => {
  // Mock auth service
  const mockAuthService = {
    getGraphAuthProvider: jest.fn().mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue('mock-token')
    })
  } as unknown as MCPAuthService;

  describe('FetchMCPServer', () => {
    let fetchServer: FetchMCPServer;
    
    beforeEach(() => {
      const config: MCPServerConfig = {
        name: 'fetch',
        type: 'fetch',
        port: 8080,
        enabled: true,
      };
      fetchServer = new FetchMCPServer(config);
    });
    
    test('should handle tools/list request', async () => {
      const request = {
        id: '1',
        method: 'tools/list',
      };
      
      const response = await fetchServer.handleRequest(request);
      
      expect(response).toHaveProperty('id', '1');
      expect(response).toHaveProperty('result');
      expect(Array.isArray(response.result)).toBe(true);
      expect(response.result.length).toBeGreaterThan(0);
      expect(response.result[0]).toHaveProperty('name');
      expect(response.result[0]).toHaveProperty('description');
      expect(response.result[0]).toHaveProperty('inputSchema');
    });
    
    test('should handle unknown method', async () => {
      const request = {
        id: '2',
        method: 'unknown_method',
      };
      
      const response = await fetchServer.handleRequest(request);
      
      expect(response).toHaveProperty('id', '2');
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code', 404);
      expect(response.error).toHaveProperty('message', expect.stringContaining('not found'));
    });
  });
  
  describe('MCPServerFactory', () => {
    test('should create FetchMCPServer', () => {
      const config: MCPServerConfig = {
        name: 'fetch',
        type: 'fetch',
        port: 8080,
        enabled: true,
      };
      
      const server = MCPServerFactory.createServer(config);
      
      expect(server).toBeInstanceOf(FetchMCPServer);
    });

    test('should create PolyarchyMCPServer with auth and config services', () => {
      const config: MCPServerConfig = {
        name: 'entrapulse-polyarchy',
        type: 'entrapulse-polyarchy',
        port: 0,
        enabled: true,
      };

      const mockConfigService = new (ConfigService as any)() as ConfigService;
      const server = MCPServerFactory.createServer(config, mockAuthService, mockConfigService);

      expect(server).toBeInstanceOf(PolyarchyMCPServer);
    });

    test('should throw when PolyarchyMCPServer is created without required services', () => {
      const config: MCPServerConfig = {
        name: 'entrapulse-polyarchy',
        type: 'entrapulse-polyarchy',
        port: 0,
        enabled: true,
      };

      expect(() => MCPServerFactory.createServer(config)).toThrow('Auth service is required');
      expect(() => MCPServerFactory.createServer(config, mockAuthService)).toThrow('Config service is required');
    });

    test('should throw error for unsupported server type', () => {
      const config: MCPServerConfig = {
        name: 'unsupported',
        type: 'unsupported' as any,
        port: 8082,
        enabled: true,
      };
      
      expect(() => MCPServerFactory.createServer(config)).toThrow('Unsupported MCP server type: unsupported');
    });
  });
});
