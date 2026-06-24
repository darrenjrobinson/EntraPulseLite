// Example of using MCP servers to fetch documentation and make Graph API calls

import { MCPClient } from './clients';
import { MCPAuthService } from './auth';
import { AuthService } from '../auth/AuthService';
import { MCPServerConfig } from './types';
import { MCPErrorHandler, ErrorCode } from './utils';
import { LOKKA_NPX_ARGS } from './constants';

// Define types for MCP content items
interface MCPContentItem {
  type: string;
  text?: string;
  name?: string;
  url?: string;
  json?: any;
}

interface MCPContentResult {
  content?: MCPContentItem[];
  [key: string]: any;
}

export class MCPExample {
  private mcpClient: MCPClient;
  
  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }
    /**
   * Fetch Microsoft Graph API documentation
   */
  async fetchGraphDocumentation(query: string): Promise<string> {
    try {
      const result = await this.mcpClient.callTool('docs', 'fetch_documentation', {
        query: `Microsoft Graph API ${query}`
      }) as MCPContentResult;
      
      // Process and extract the text content
      if (result?.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter((item: MCPContentItem) => item.type === 'text')
          .map((item: MCPContentItem) => item.text || '')
          .join('\n\n');
        
        return textContent || 'No documentation found';
      }
      
      return 'No content returned from documentation service';
    } catch (error) {
      const mcpError = MCPErrorHandler.handleError(error, 'MCPExample.fetchGraphDocumentation');
      return `Failed to fetch documentation: [${mcpError.code}] ${mcpError.message}`;
    }
  }
  
  /**
   * Get Microsoft Graph schema for an entity
   */
  async getGraphSchema(entity: string, version: string = 'v1.0'): Promise<string> {
    try {
      const result = await this.mcpClient.callTool('docs', 'fetch_graph_schema', {
        entity,
        version
      }) as MCPContentResult;
      
      if (result?.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter((item: MCPContentItem) => item.type === 'text')
          .map((item: MCPContentItem) => item.text || '')
          .join('\n\n');
        
        return textContent || `No schema found for ${entity}`;
      }
      
      return `No schema content returned for ${entity}`;
    } catch (error) {
      console.error('Error fetching Graph schema:', error);
      return `Failed to fetch schema: ${(error as Error).message}`;
    }
  }
  
  /**
   * Get information about Microsoft Graph permissions
   */
  async getPermissionsInfo(permission?: string, category?: string): Promise<string> {
    try {
      const result = await this.mcpClient.callTool('docs', 'fetch_permissions_info', {
        permission,
        category
      }) as MCPContentResult;
      
      if (result?.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter((item: MCPContentItem) => item.type === 'text')
          .map((item: MCPContentItem) => item.text || '')
          .join('\n\n');
        
        return textContent || 'No permissions information found';
      }
      
      return 'No permissions information returned';
    } catch (error) {
      console.error('Error fetching permissions info:', error);
      return `Failed to fetch permissions info: ${(error as Error).message}`;
    }
  }
    /**
   * Make a call to Microsoft Graph API
   */
  async callGraphApi(endpoint: string, method: string = 'GET', data?: any, version: string = 'v1.0'): Promise<any> {
    try {
      const result = await this.mcpClient.callTool('graph', 'microsoft_graph_query', {
        endpoint,
        method,
        data,
        version
      }) as MCPContentResult;
      
      if (result?.content && Array.isArray(result.content)) {
        const jsonContent = result.content.find((item: MCPContentItem) => item.type === 'json');
        if (jsonContent?.json) {
          return jsonContent.json;
        }
      }
      
      return null;
    } catch (error) {
      const mcpError = MCPErrorHandler.handleError(error, `MCPExample.callGraphApi(${endpoint})`);
      
      // Determine if it's an authentication error
      if (mcpError.code === ErrorCode.UNAUTHORIZED) {
        throw new Error(`Authentication required for Graph API. Please sign in again.`);
      }
      
      // If it's a permissions issue
      if (mcpError.code === ErrorCode.FORBIDDEN) {
        throw new Error(`Insufficient permissions to access ${endpoint}. Check your account permissions.`);
      }
      
      throw new Error(`Graph API call failed: [${mcpError.code}] ${mcpError.message}`);
    }
  }
  
  /**
   * Get user profile with enriched permission information
   * This method combines data from multiple MCP tools
   */
  async getUserProfileWithPermissions(): Promise<any> {
    try {
      // First, get the user profile from Graph API
      const userProfile = await this.callGraphApi('/me');
      
      if (!userProfile) {
        throw new Error('Could not retrieve user profile');
      }
      
      // Then get information about required permissions
      const permissionsInfo = await this.getPermissionsInfo('User.Read');
      
      // Return combined information
      return {
        profile: userProfile,
        permissions: {
          info: permissionsInfo,
          granted: ['User.Read'] // In a real app, we'd check which permissions are granted
        }
      };
    } catch (error) {
      const mcpError = MCPErrorHandler.handleError(error, 'MCPExample.getUserProfileWithPermissions');
      console.error('Failed to get user profile with permissions:', mcpError);
      
      // Create a more user-friendly error message based on the error code
      switch (mcpError.code) {
        case ErrorCode.UNAUTHORIZED:
          throw new Error('Authentication required. Please sign in to access your profile.');
        case ErrorCode.FORBIDDEN:
          throw new Error('You don\'t have permission to access this information. Contact your administrator.');
        default:
          throw new Error(`Failed to retrieve profile: ${mcpError.message}`);
      }
    }
  }
  
  /**
   * List all available MCP tools with their descriptions
   */
  async listAvailableTools(): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    
    try {
      // Get the list of available servers
      const servers = this.mcpClient.getAvailableServerNames();
      
      // For each server, get the list of tools
      for (const server of servers) {
        try {
          const tools = await this.mcpClient.listTools(server);
          result[server] = tools;
        } catch (error) {
          const mcpError = MCPErrorHandler.handleError(error, `MCPExample.listTools(${server})`);
          console.warn(`Failed to get tools for server ${server}:`, mcpError);
          result[server] = { error: mcpError.message };
        }
      }
      
      return result;
    } catch (error) {
      const mcpError = MCPErrorHandler.handleError(error, 'MCPExample.listAvailableTools');
      console.error('Failed to list available tools:', mcpError);
      throw new Error(`Failed to list available tools: ${mcpError.message}`);
    }
  }
}

/**
 * Create MCP clients with default configuration
 */
export function createDefaultMCPClient(): MCPClient {
  // Initialize dependencies
  const authService = new AuthService();
  const mcpAuthService = new MCPAuthService(authService);
  
  // Define server configurations
  const serverConfigs: MCPServerConfig[] = [    {
      name: 'graph',
      type: 'external-lokka',
      port: 8080,
      enabled: true,
      command: 'npx',
      args: [...LOKKA_NPX_ARGS],
      authConfig: {
        type: 'msal',
        scopes: ['User.Read', 'User.ReadBasic.All']
      }
    },
    {
      name: 'docs',
      type: 'fetch',
      port: 8081,
      enabled: true,
      authConfig: {
        type: 'none'
      }
    }
  ];
  
  // Create MCP client
  return new MCPClient(serverConfigs, mcpAuthService);
}
