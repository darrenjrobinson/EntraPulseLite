// MCP Client for communicating with Model Context Protocol servers
import { MCPServerConfig } from '../types';
import { MCPServerManager } from '../servers/MCPServerManager';
import { MCPAuthService } from '../auth/MCPAuthService';
import { MicrosoftDocsMCPClient } from './MicrosoftDocsMCPClient';
import { MicrosoftEnterpriseMCPClient } from './MicrosoftEnterpriseMCPClient';

export interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPClient {
  private serverManager: MCPServerManager;
  private servers: Map<string, MCPServerConfig> = new Map();
  private microsoftDocsClients: Map<string, MicrosoftDocsMCPClient> = new Map();
  private microsoftEnterpriseClients: Map<string, MicrosoftEnterpriseMCPClient> = new Map();
  private authService?: MCPAuthService;

  constructor(serverConfigs: MCPServerConfig[], authService?: MCPAuthService, externalServerManager?: MCPServerManager) {
    this.authService = authService;
    // Use external server manager if provided, otherwise create our own
    // The external server manager is preferred as it has ConfigService for proper server initialization
    if (externalServerManager) {
      this.serverManager = externalServerManager;
      console.log('🔧 MCPClient: Using external MCPServerManager');
    } else {
      this.serverManager = new MCPServerManager(serverConfigs, authService);
      console.log('🔧 MCPClient: Created internal MCPServerManager (no ConfigService)');
    }
    
    console.log('🔧 MCPClient: Initializing with server configs:', serverConfigs.map(s => ({
      name: s.name,
      type: s.type,
      enabled: s.enabled
    })));
    
    // Keep track of server configs for backward compatibility
    serverConfigs.forEach(config => {
      console.log('🔧 MCPClient: Processing config:', {
        name: config.name,
        type: config.type,
        typeCheck: config.type === 'microsoft-enterprise',
        enabled: config.enabled,
        shouldInitEnterprise: config.type === 'microsoft-enterprise' && config.enabled
      });
      
      this.servers.set(config.name, config);
      
      // Initialize Microsoft Docs MCP clients
      if (config.type === 'microsoft-docs' && config.enabled && authService) {
        console.log('🔧 MCPClient: Initializing Microsoft Docs MCP client');
        this.microsoftDocsClients.set(config.name, new MicrosoftDocsMCPClient(config, authService));
      }
      
      // Initialize Microsoft Enterprise MCP clients with auth service for MCP-specific tokens
      if (config.type === 'microsoft-enterprise' && config.enabled) {
        console.log('✅ MCPClient: Condition met! Initializing Microsoft Enterprise MCP client for', config.name);
        console.log('🔧 MCPClient: Using MCP URL:', config.url || 'https://mcp.svc.cloud.microsoft/enterprise');
        const enterpriseClient = new MicrosoftEnterpriseMCPClient({
          baseUrl: config.url || 'https://mcp.svc.cloud.microsoft/enterprise'
        }, authService);  // Pass auth service for MCP token acquisition
        this.microsoftEnterpriseClients.set(config.name, enterpriseClient);
        console.log('✅ MCPClient: Microsoft Enterprise MCP client created and stored with auth service');
      }
    });
    
    console.log('🔧 MCPClient: Initialization complete. Servers:', Array.from(this.servers.keys()));
    console.log('🔧 MCPClient: Enterprise clients:', Array.from(this.microsoftEnterpriseClients.keys()));
  }

  async call(serverName: string, method: string, params?: any): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' not found`);
    }

    if (!server.enabled) {
      throw new Error(`MCP server '${serverName}' is disabled`);
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    try {
      // For built-in servers, we'll use direct communication
      // In a real implementation, this would use the MCP protocol
      const response = await this.sendRequest(server, request);
      
      if (response.error) {
        throw new Error(`MCP Error: ${response.error.message}`);
      }

      return response.result;
    } catch (error) {
      console.error(`MCP call failed for server ${serverName}:`, error);
      throw error;
    }
  }
  async listTools(serverName: string): Promise<any[]> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' not found`);
    }

    if (!server.enabled) {
      throw new Error(`MCP server '${serverName}' is disabled`);
    }

    // Handle Microsoft Docs MCP server
    if (server.type === 'microsoft-docs') {
      const client = this.microsoftDocsClients.get(serverName);
      if (!client) {
        throw new Error(`Microsoft Docs MCP client for '${serverName}' not initialized`);
      }
      return await client.listTools();
    }

    // Handle other server types using existing logic
    return this.call(serverName, 'tools/list');
  }
  async callTool(serverName: string, toolName: string, arguments_: any): Promise<any> {
    const server = this.servers.get(serverName);
    console.log('🔧 MCPClient.callTool:', { serverName, toolName, hasServer: !!server, serverType: server?.type });
    
    if (!server) {
      console.error('❌ MCPClient: Server not found:', serverName, 'Available servers:', Array.from(this.servers.keys()));
      throw new Error(`MCP server '${serverName}' not found`);
    }

    if (!server.enabled) {
      throw new Error(`MCP server '${serverName}' is disabled`);
    }

    // Handle Microsoft Docs MCP server
    if (server.type === 'microsoft-docs') {
      const client = this.microsoftDocsClients.get(serverName);
      if (!client) {
        throw new Error(`Microsoft Docs MCP client for '${serverName}' not initialized`);
      }
      return await client.callTool(toolName, arguments_);
    }

    // Handle Microsoft Enterprise MCP server
    if (server.type === 'microsoft-enterprise') {
      console.log('🔧 MCPClient: Server type is microsoft-enterprise');
      const client = this.microsoftEnterpriseClients.get(serverName);
      console.log('🔧 MCPClient: Enterprise client found:', !!client, 'Available clients:', Array.from(this.microsoftEnterpriseClients.keys()));
      
      if (!client) {
        console.error('❌ MCPClient: Microsoft Enterprise client not initialized for', serverName);
        throw new Error(`Microsoft Enterprise MCP client for '${serverName}' not initialized`);
      }
      
      console.log('🔧 MCPClient: Calling Microsoft Enterprise MCP tool:', toolName, arguments_);
      
      // Set auth service on client for token acquisition via getAuthHeaders
      // The client will use getMCPServerToken() through MCPAuthService.getAuthHeaders('microsoft-enterprise')
      if (this.authService) {
        client.setAuthService(this.authService);
      } else {
        console.warn('⚠️ MCPClient: No auth service available for Enterprise MCP');
      }
      
      // Use proper MCP protocol to call tools on the Enterprise MCP server
      // The server exposes: microsoft_graph_suggest_queries, microsoft_graph_get, microsoft_graph_list_properties
      try {
        console.log(`🔧 MCPClient: Calling MCP tool "${toolName}" via proper MCP protocol`);
        const result = await client.callTool(toolName, arguments_);
        console.log('✅ MCPClient: Enterprise MCP tool call succeeded');
        return result;
      } catch (error) {
        console.error('❌ MCPClient: Enterprise MCP tool call failed:', error);
        throw error;
      }
    }

    // Handle external stdio servers (Lokka, Polyarchy) - need direct handling via
    // server manager: tools/call goes straight to the server's handleRequest without
    // the generic call() path
    if (server.type === 'external-lokka' || server.type === 'entrapulse-polyarchy') {
      console.log(`🔧 MCPClient: Server type is ${server.type}, using direct server manager`);
      try {
        // Format the request properly for the server's handleRequest
        const request = {
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: arguments_
          }
        };

        const response = await this.serverManager.handleRequest(serverName, request);

        if (response.error) {
          throw new Error(response.error.message || `${server.type} MCP request failed`);
        }

        console.log(`✅ MCPClient: ${server.type} MCP tool call succeeded`);
        return response.result;
      } catch (error) {
        console.error(`❌ MCPClient: ${server.type} MCP tool call failed:`, error);
        throw error;
      }
    }

    // Handle other server types using existing logic
    return this.call(serverName, 'tools/call', {
      name: toolName,
      arguments: arguments_,
    });
  }
  async startServer(serverName: string): Promise<void> {
    console.log(`Starting MCP server: ${serverName}`);
    
    const server = this.serverManager.getServer(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' not found`);
    }
    
    if (server.startServer) {
      await server.startServer();
      console.log(`MCP server '${serverName}' started successfully`);
    } else {
      console.warn(`MCP server '${serverName}' has no startServer method`);
    }
  }

  getAvailableServers(): MCPServerConfig[] {
    return Array.from(this.servers.values()).filter(server => server.enabled);
  }

  getAvailableServerNames(): string[] {
    return Array.from(this.servers.keys()).filter(name => {
      const config = this.servers.get(name);
      return config?.enabled || false;
    });
  }

  async listResources(serverName: string): Promise<any[]> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' not found`);
    }

    if (!server.enabled) {
      throw new Error(`MCP server '${serverName}' is disabled`);
    }

    // Handle Microsoft Docs MCP server
    if (server.type === 'microsoft-docs') {
      const client = this.microsoftDocsClients.get(serverName);
      if (!client) {
        throw new Error(`Microsoft Docs MCP client for '${serverName}' not initialized`);
      }
      return await client.listResources();
    }

    // Handle other server types using existing logic
    return this.call(serverName, 'resources/list');
  }

  async readResource(serverName: string, uri: string): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' not found`);
    }

    if (!server.enabled) {
      throw new Error(`MCP server '${serverName}' is disabled`);
    }

    // Handle Microsoft Docs MCP server
    if (server.type === 'microsoft-docs') {
      const client = this.microsoftDocsClients.get(serverName);
      if (!client) {
        throw new Error(`Microsoft Docs MCP client for '${serverName}' not initialized`);
      }
      return await client.readResource(uri);
    }

    // Handle other server types using existing logic
    return this.call(serverName, 'resources/read', { uri });
  }

  async initializeMicrosoftDocsClients(): Promise<void> {
    const promises = Array.from(this.microsoftDocsClients.values()).map(client => 
      client.initialize().catch(error => {
        console.error('Failed to initialize Microsoft Docs MCP client:', error);
        // Don't throw here to allow other clients to initialize
      })
    );
    
    await Promise.all(promises);
  }

  async initializeMicrosoftEnterpriseClients(): Promise<void> {
    const promises = Array.from(this.microsoftEnterpriseClients.values()).map(client => {
      // Set auth service before initializing
      if (this.authService) {
        client.setAuthService(this.authService);
      }
      return client.initialize().catch(error => {
        console.error('Failed to initialize Microsoft Enterprise MCP client:', error);
        // Don't throw here to allow other clients to initialize
      });
    });
    
    await Promise.all(promises);
    console.log('✅ MCPClient: Microsoft Enterprise MCP clients initialized');
  }
  
  async stopAllServers(): Promise<void> {
    try {
      await this.serverManager.stopAllServers();
    } catch (error) {
      console.error('Error stopping MCP servers:', error);
      throw error;
    }
  }

  private async sendRequest(server: MCPServerConfig, request: MCPRequest): Promise<MCPResponse> {
    try {
      // Convert the request format if needed
      const mcpRequest = {
        id: request.id,
        method: request.method,
        params: request.params
      };
      
      // Use the server manager to handle the request
      const response = await this.serverManager.handleRequest(server.name, mcpRequest);
      
      // Convert the response back to the expected format
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: response.result,
        error: response.error
      };
    } catch (error) {
      console.error(`Error calling MCP server ${server.name}:`, error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal server error: ${(error as Error).message}`
        }
      };
    }
  }
  // No need for separate handlers for each server type
  // All request handling is now delegated to the server implementations via the factory
}
