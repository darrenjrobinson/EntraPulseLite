// MCPAuthService.ts
// Authentication service for MCP servers

import { AuthService } from '../../auth/AuthService';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { AuthToken } from '../../types';

export class MCPAuthService {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }
  /**
   * Get an authentication provider for Microsoft Graph API
   * @returns AuthenticationProvider for Microsoft Graph
   */
  async getGraphAuthProvider(): Promise<AuthenticationProvider> {
    // Create a custom authentication provider for Microsoft Graph
    return {
      getAccessToken: async (): Promise<string> => {
        try {
          const token = await this.authService.getToken();
          if (!token) {
            throw new Error('Failed to get authentication token');
          }
          return token.accessToken;
        } catch (error) {
          console.error('Failed to acquire graph token:', error);
          // Pass the original error so it can be properly inspected
          const errorMessage = (error as Error).message || 'Authentication failed for Microsoft Graph API';
          throw new Error(`Graph authentication error: ${errorMessage}`);
        }
      }
    };
  }
  /**
   * Get headers for authentication to MCP servers
   * @param serverType Type of MCP server
   * @returns Authentication headers
   * @throws Error if authentication fails
   */  async getAuthHeaders(serverType: string): Promise<Record<string, string>> {
    // Different servers may require different authentication headers
    try {      switch (serverType) {
        case 'external-lokka':
          const token = await this.authService.getToken();
          if (!token) {
            throw new Error('No authentication token available');
          }
          return {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          };
        case 'fetch':
          // Fetch server doesn't need auth headers by default
          return {
            'User-Agent': 'EntraPulseLite/1.0',
            'Content-Type': 'application/json'
          };
        case 'microsoft-docs':
          // Microsoft Docs MCP likely doesn't require authentication
          // but we'll include user agent for identification
          return {
            'User-Agent': 'EntraPulseLite/1.0',
            'Content-Type': 'application/json'
          };
        case 'microsoft-enterprise':
          // Microsoft Enterprise MCP requires bearer token with MCP server audience
          // IMPORTANT: Use getMCPServerToken() NOT getToken() - the MCP server requires
          // a token with audience api://e8c77dc2-69b3-43f4-bc51-3213c9d915b4 (MCP Server App ID)
          console.log('🔐 Getting MCP server token for microsoft-enterprise...');
          const mcpToken = await this.authService.getMCPServerToken();
          if (!mcpToken?.accessToken) {
            throw new Error('No access token available for Microsoft Enterprise MCP. User may need to consent to MCP permissions.');
          }
          console.log('✅ Got MCP server token for microsoft-enterprise');
          return {
            'Authorization': `Bearer ${mcpToken.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'EntraPulseLite/1.1.0'
          };
        default:
          console.warn(`Unknown server type: ${serverType}, returning default headers`);
          return {
            'Content-Type': 'application/json'
          };
      }
    } catch (error) {
      console.error(`Error getting authentication headers for ${serverType} server:`, error);
      const errorMessage = (error as Error).message || 'Unknown authentication error';
      throw new Error(`Failed to get authentication headers for ${serverType} server: ${errorMessage}`);
    }
  }

  /**
   * Get the current authentication token
   * @returns The current auth token or null if not authenticated
   */
  async getToken(): Promise<AuthToken | null> {
    try {
      return await this.authService.getToken();
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }

  /**
   * Get a token for the Microsoft MCP Server for Enterprise
   * This acquires a token with the MCP server as the audience, not Microsoft Graph
   * @returns Authentication token for MCP server or null if not authenticated
   */
  async getMCPServerToken(): Promise<AuthToken | null> {
    try {
      return await this.authService.getMCPServerToken();
    } catch (error) {
      console.error('Error getting MCP server token:', error);
      throw error; // Re-throw to allow proper error handling upstream
    }
  }
}
