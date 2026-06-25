/**
 * MicrosoftEnterpriseMCPServer
 * High-level MCP server for Microsoft Enterprise MCP endpoint
 *
 * Implements three MCP tools:
 * 1. microsoft_graph_suggest_queries - RAG-powered query suggestions
 * 2. microsoft_graph_get - Execute Graph API queries
 * 3. microsoft_graph_list_properties - List entity properties
 *
 * Reference: https://learn.microsoft.com/en-us/graph/mcp-server/overview
 */

import { MCPServerConfig } from '../../types';
import { MCPServerHandlers } from './MCPServerFactory';
import { MicrosoftEnterpriseMCPClient } from '../clients/MicrosoftEnterpriseMCPClient';
import { AuthService } from '../../auth/AuthService';
import { MCP_PERMISSION_TIERS } from '../../auth/MCPScopes';

export interface MicrosoftGraphSuggestQueriesParams {
  user_query: string;
  top?: number; // Default 5
}

export interface MicrosoftGraphGetParams {
  url: string; // Relative Graph API path (e.g., '/users' or 'users')
  method?: 'GET'; // Only GET supported in preview
}

export interface MicrosoftGraphListPropertiesParams {
  entity_type: string; // e.g., 'user', 'group', 'device', 'application'
}

export interface MicrosoftGraphSuggestQueriesResponse {
  suggestions: Array<{
    query: string;
    description: string;
    graphUrl: string;
    confidence: number;
  }>;
}

export interface MicrosoftGraphGetResponse {
  data: any;
  nextLink?: string;
  count?: number;
}

export interface MicrosoftGraphListPropertiesResponse {
  entity_type: string;
  properties: Array<{
    name: string;
    type: string;
    description?: string;
    required?: boolean;
  }>;
}

export class MicrosoftEnterpriseMCPServer implements MCPServerHandlers {
  private config: MCPServerConfig;
  private client: MicrosoftEnterpriseMCPClient;
  private authService: AuthService | null = null;
  private isInitialized = false;

  constructor(config: MCPServerConfig, authService?: AuthService) {
    this.config = config;
    this.authService = authService || null;

    const baseUrl = config.url || 'https://mcp.svc.cloud.microsoft/enterprise';

    this.client = new MicrosoftEnterpriseMCPClient({
      baseUrl,
      timeout: 30000,
      maxRetries: 3,
      enableCache: true
    });

    console.log('[MicrosoftEnterpriseMCPServer] Initialized with base URL:', baseUrl);
  }

  /**
   * Start the MCP server (initialize authentication)
   */
  async startServer(): Promise<void> {
    console.log('[MicrosoftEnterpriseMCPServer] Starting server...');

    try {
      // Get MCP token from auth service
      if (this.authService) {
        const token = await this.authService.getMCPToken();
        if (token) {
          this.client.setAccessToken(token.accessToken);
          console.log('[MicrosoftEnterpriseMCPServer] Access token set');
        } else {
          console.warn('[MicrosoftEnterpriseMCPServer] No access token available');
        }
      } else {
        console.warn('[MicrosoftEnterpriseMCPServer] No auth service provided');
      }

      this.isInitialized = true;
      console.log('[MicrosoftEnterpriseMCPServer] Server started successfully');
    } catch (error) {
      console.error('[MicrosoftEnterpriseMCPServer] Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stopServer(): Promise<void> {
    console.log('[MicrosoftEnterpriseMCPServer] Stopping server...');
    this.client.clearCache();
    this.isInitialized = false;
    console.log('[MicrosoftEnterpriseMCPServer] Server stopped');
  }

  /**
   * Handle MCP requests
   */
  async handleRequest(request: any): Promise<any> {
    if (!this.isInitialized) {
      await this.startServer();
    }

    const { method, params } = request;

    console.log('[MicrosoftEnterpriseMCPServer] Handling request:', {
      method,
      params: JSON.stringify(params).substring(0, 100)
    });

    // Check rate limit status
    const rateLimitStatus = this.client.getRateLimitStatus();
    if (this.client.isRateLimitWarning()) {
      console.warn('[MicrosoftEnterpriseMCPServer] Rate limit warning:', rateLimitStatus);
    }

    try {
      switch (method) {
        case 'microsoft_graph_suggest_queries':
          return await this.suggestQueries(params as MicrosoftGraphSuggestQueriesParams);

        case 'microsoft_graph_get':
          return await this.executeGraphQuery(params as MicrosoftGraphGetParams);

        case 'microsoft_graph_list_properties':
          return await this.listProperties(params as MicrosoftGraphListPropertiesParams);

        case 'tools/list':
          return this.listTools();

        case 'ping':
          return { status: 'ok', timestamp: Date.now() };

        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    } catch (error) {
      console.error('[MicrosoftEnterpriseMCPServer] Request failed:', error);

      // Provide helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('Authentication failed')) {
          throw new Error(
            'Microsoft MCP authentication failed. Please refresh your access token or re-authenticate.'
          );
        }

        if (error.message.includes('Authorization failed')) {
          throw new Error(
            'Missing required MCP permissions. Please run the admin consent flow in Settings > MCP Configuration.'
          );
        }

        if (error.message.includes('Rate limit')) {
          throw new Error(
            `Rate limit reached (${rateLimitStatus.requestsThisMinute}/${rateLimitStatus.maxRequestsPerMinute} requests/min). Please wait until ${rateLimitStatus.resetTime.toLocaleTimeString()}.`
          );
        }
      }

      throw error;
    }
  }

  /**
   * Suggest Graph API queries based on natural language input
   * Uses Microsoft's RAG system to find relevant API examples
   */
  private async suggestQueries(
    params: MicrosoftGraphSuggestQueriesParams
  ): Promise<any> {
    const { user_query } = params;

    console.log('[MicrosoftEnterpriseMCPServer] Suggesting queries for:', user_query);

    // The Microsoft Enterprise MCP server exposes this as an MCP tool. Invoke it via the
    // client's callTool helper (it has no HTTP-style post()). The preview tool takes a
    // generic, anonymized intent description only.
    const result = await this.client.suggestQueries(user_query);

    console.log('[MicrosoftEnterpriseMCPServer] Suggestions received');

    return result;
  }

  /**
   * Execute a Graph API query
   * Only GET operations are supported in preview
   */
  private async executeGraphQuery(
    params: MicrosoftGraphGetParams
  ): Promise<any> {
    let { url, method = 'GET' } = params;

    // Normalize URL (remove leading slash if present)
    if (url.startsWith('/')) {
      url = url.substring(1);
    }

    if (method !== 'GET') {
      throw new Error('Only GET method is supported in preview');
    }

    console.log('[MicrosoftEnterpriseMCPServer] Executing Graph query:', url);

    // Invoke the upstream microsoft_graph_get tool via the MCP client. The MCP server
    // enforces user privileges and granted scopes; only GET is supported in preview.
    const result = await this.client.graphGet(url);

    console.log('[MicrosoftEnterpriseMCPServer] Query executed successfully');

    return result;
  }

  /**
   * List properties for a Graph API entity type
   * Helps LLM understand available properties for queries
   */
  private async listProperties(
    params: MicrosoftGraphListPropertiesParams
  ): Promise<any> {
    const { entity_type } = params;

    console.log('[MicrosoftEnterpriseMCPServer] Listing properties for:', entity_type);

    // Invoke the upstream microsoft_graph_list_properties tool via the MCP client.
    const result = await this.client.listProperties(entity_type);

    console.log('[MicrosoftEnterpriseMCPServer] Properties listed');

    return result;
  }

  /**
   * List available tools
   */
  private listTools(): any {
    return {
      tools: [
        {
          name: 'microsoft_graph_suggest_queries',
          description:
            'Suggest Microsoft Graph API queries based on natural language input. Uses RAG to find relevant API examples.',
          inputSchema: {
            type: 'object',
            properties: {
              user_query: {
                type: 'string',
                description: 'Natural language description of what you want to query'
              },
              top: {
                type: 'number',
                description: 'Number of suggestions to return (default: 5)',
                default: 5
              }
            },
            required: ['user_query']
          }
        },
        {
          name: 'microsoft_graph_get',
          description:
            'Execute a Microsoft Graph API GET query. Only read operations are supported in preview.',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'Relative Graph API path (e.g., "users" or "/users")'
              },
              method: {
                type: 'string',
                description: 'HTTP method (only GET supported in preview)',
                default: 'GET',
                enum: ['GET']
              }
            },
            required: ['url']
          }
        },
        {
          name: 'microsoft_graph_list_properties',
          description:
            'List available properties for a Microsoft Graph entity type. Helps understand what properties can be queried.',
          inputSchema: {
            type: 'object',
            properties: {
              entity_type: {
                type: 'string',
                description:
                  'Entity type to list properties for (e.g., "user", "group", "device", "application")'
              }
            },
            required: ['entity_type']
          }
        }
      ]
    };
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.client.getRateLimitStatus();
  }

  /**
   * Check if server is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
