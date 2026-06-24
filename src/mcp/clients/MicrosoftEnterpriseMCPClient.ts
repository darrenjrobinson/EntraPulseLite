/**
 * MicrosoftEnterpriseMCPClient
 * MCP client for Microsoft Enterprise MCP Server using HTTP Streamable transport
 *
 * This client communicates with the Microsoft MCP Server for Enterprise
 * using the proper Model Context Protocol (MCP) over HTTP Streamable transport.
 *
 * The server exposes these tools:
 * - microsoft_graph_suggest_queries: RAG-based semantic search for Graph API examples
 * - microsoft_graph_get: Execute read-only Microsoft Graph API calls
 * - microsoft_graph_list_properties: Get schema for Graph entities
 *
 * Reference: https://learn.microsoft.com/en-us/graph/mcp-server/overview
 */

import { MCPServerConfig } from '../types';
import { MCPAuthService } from '../auth/MCPAuthService';
import { VERSION } from '../../shared/version';

export interface MCPClientConfig {
  baseUrl?: string; // Defaults to Microsoft's endpoint
  timeout?: number; // Request timeout in ms (default 30s)
  maxRetries?: number; // Max retry attempts (default 3)
  enableCache?: boolean; // Enable response caching (default true)
}

export interface JsonRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPResponse<T = any> {
  data: T;
  cached?: boolean;
  requestId?: string;
  timestamp: number;
}

export interface RateLimitStatus {
  requestsThisMinute: number;
  maxRequestsPerMinute: number;
  resetTime: Date;
  warningThreshold: number; // 80% of max
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

export class MicrosoftEnterpriseMCPClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly enableCache: boolean;
  private accessToken: string | null = null;
  private sessionId: string | null = null;
  private requestId = 1;

  // Rate limiting (Microsoft limits to 100 requests/minute per user)
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerMinute = 100;
  private readonly warningThreshold = 80; // 80% of max

  // Caching
  private cache: Map<string, CacheEntry> = new Map();
  private readonly defaultCacheTTL = 5 * 60 * 1000; // 5 minutes

  // Server configuration for auth service compatibility
  private serverConfig: MCPServerConfig;
  private authService?: MCPAuthService;

  // Initialization tracking
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: MCPClientConfig = {}, authService?: MCPAuthService) {
    this.baseUrl = config.baseUrl || 'https://mcp.svc.cloud.microsoft/enterprise';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.enableCache = config.enableCache !== false;
    this.authService = authService;

    // Create a server config for auth service compatibility
    this.serverConfig = {
      name: 'microsoft-enterprise',
      type: 'microsoft-enterprise',
      url: this.baseUrl,
      port: 0, // Not used for HTTP-based MCP servers
      enabled: true
    };

    console.log('[MicrosoftEnterpriseMCPClient] Created with URL:', this.baseUrl);
  }

  /**
   * Set auth service for token management
   */
  setAuthService(authService: MCPAuthService): void {
    this.authService = authService;
    console.log('[MicrosoftEnterpriseMCPClient] Auth service updated');
  }

  /**
   * Set access token for authentication (direct token setting)
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
    console.log('[MicrosoftEnterpriseMCPClient] Access token updated, length:', token.length);
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    this.cleanupOldTimestamps();

    const now = Date.now();
    const resetTime = new Date(now + 60000); // Next minute

    return {
      requestsThisMinute: this.requestTimestamps.length,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      resetTime,
      warningThreshold: this.warningThreshold
    };
  }

  /**
   * Check if rate limit warning threshold is reached
   */
  isRateLimitWarning(): boolean {
    const status = this.getRateLimitStatus();
    return status.requestsThisMinute >= status.warningThreshold;
  }

  /**
   * Check if rate limit is exceeded
   */
  isRateLimitExceeded(): boolean {
    const status = this.getRateLimitStatus();
    return status.requestsThisMinute >= status.maxRequestsPerMinute;
  }

  /**
   * Remove timestamps older than 1 minute
   */
  private cleanupOldTimestamps(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
  }

  /**
   * Add request timestamp for rate limiting
   */
  private trackRequest(): void {
    this.requestTimestamps.push(Date.now());
    this.cleanupOldTimestamps();
  }

  /**
   * Wait until rate limit allows request
   */
  private async waitForRateLimit(): Promise<void> {
    while (this.isRateLimitExceeded()) {
      const status = this.getRateLimitStatus();
      const waitTime = status.resetTime.getTime() - Date.now() + 100; // Add 100ms buffer

      console.log('[MicrosoftEnterpriseMCPClient] Rate limit reached, waiting', waitTime, 'ms');
      await new Promise(resolve => setTimeout(resolve, Math.max(0, waitTime)));
      this.cleanupOldTimestamps();
    }
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(method: string, params?: any): string {
    return `${method}:${JSON.stringify(params || {})}`;
  }

  /**
   * Get cached response if available and not expired
   */
  private getFromCache(cacheKey: string): any | null {
    if (!this.enableCache) {
      return null;
    }

    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    console.log('[MicrosoftEnterpriseMCPClient] Cache hit:', cacheKey);
    return entry.data;
  }

  /**
   * Store response in cache
   */
  private storeInCache(cacheKey: string, data: any, ttl: number): void {
    if (!this.enableCache) {
      return;
    }

    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl
    });

    console.log('[MicrosoftEnterpriseMCPClient] Cached response:', cacheKey);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[MicrosoftEnterpriseMCPClient] Cache cleared');
  }

  /**
   * Get next request ID
   */
  private getNextId(): number {
    return this.requestId++;
  }

  /**
   * Send JSON-RPC request to the MCP server
   */
  private async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': `EntraPulseLite/${VERSION}`
      };

      // Add session ID if we have one
      if (this.sessionId) {
        headers['Mcp-Session-Id'] = this.sessionId;
      }

      // Add authentication - prefer direct token, fallback to auth service
      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        console.log('[MicrosoftEnterpriseMCPClient] Using direct access token');
      } else if (this.authService) {
        try {
          const authHeaders = await this.authService.getAuthHeaders('microsoft-enterprise');
          Object.assign(headers, authHeaders);
          console.log('[MicrosoftEnterpriseMCPClient] Got auth headers from service');
        } catch (authError) {
          console.error('[MicrosoftEnterpriseMCPClient] Failed to get auth headers:', authError);
          throw new Error(`Authentication required for Microsoft Enterprise MCP: ${(authError as Error).message}`);
        }
      } else {
        throw new Error('No authentication available for Microsoft Enterprise MCP');
      }

      console.log('🌐 [MicrosoftEnterpriseMCPClient] Sending MCP request:', {
        url: this.baseUrl,
        method: request.method,
        id: request.id,
        hasSessionId: !!this.sessionId,
        paramsPreview: JSON.stringify(request.params || {}).substring(0, 200)
      });

      // Wait for rate limit if needed
      await this.waitForRateLimit();
      this.trackRequest();

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      // Log response details for debugging (including all headers)
      const allHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        allHeaders[key] = value;
      });
      console.log('📡 [MicrosoftEnterpriseMCPClient] Received response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('Content-Type'),
        hasSessionId: !!response.headers.get('Mcp-Session-Id'),
        allHeaders
      });

      // Check for session ID in response headers
      const responseSessionId = response.headers.get('Mcp-Session-Id');
      if (responseSessionId && !this.sessionId) {
        this.sessionId = responseSessionId;
        console.log('[MicrosoftEnterpriseMCPClient] Received session ID:', responseSessionId);
      }

      if (!response.ok) {
        // For debugging errors, try to get response body
        let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails += ` - Response: ${errorBody}`;
            console.log('❌ [MicrosoftEnterpriseMCPClient] Error response body:', errorBody);
          }
        } catch {
          console.log('❌ [MicrosoftEnterpriseMCPClient] Could not read error response body');
        }
        throw new Error(errorDetails);
      }

      const contentType = response.headers.get('Content-Type') || '';

      // Handle SSE stream response
      if (contentType.includes('text/event-stream')) {
        console.log('[MicrosoftEnterpriseMCPClient] Received SSE stream response, parsing...');
        return await this.parseSSEResponse(response);
      }

      // Handle JSON response
      const data = await response.json();
      console.log('📨 [MicrosoftEnterpriseMCPClient] Received JSON response:', {
        hasResult: !!data.result,
        hasError: !!data.error,
        id: data.id
      });

      return data as JsonRpcResponse;
    } catch (error) {
      console.error('❌ [MicrosoftEnterpriseMCPClient] MCP request failed:', error);
      throw error;
    }
  }

  /**
   * Parse Server-Sent Events response
   */
  private async parseSSEResponse(response: Response): Promise<JsonRpcResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for SSE stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let lastResponse: JsonRpcResponse | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return lastResponse || { jsonrpc: '2.0', id: 0, error: { code: -1, message: 'No response received' } };
            }

            try {
              const jsonData = JSON.parse(data);
              // Log all SSE data for debugging server responses
              console.log('📦 [MicrosoftEnterpriseMCPClient] SSE data received:', JSON.stringify(jsonData, null, 2));
              if (jsonData.jsonrpc) {
                lastResponse = jsonData;
                // Log error details if present in the result
                if (jsonData.result?.isError) {
                  console.log('⚠️ [MicrosoftEnterpriseMCPClient] Server returned error in result:', JSON.stringify(jsonData.result, null, 2));
                }
                if (jsonData.error) {
                  console.log('❌ [MicrosoftEnterpriseMCPClient] Server returned JSON-RPC error:', JSON.stringify(jsonData.error, null, 2));
                }
              }
            } catch {
              console.warn('[MicrosoftEnterpriseMCPClient] Failed to parse SSE data:', data);
            }
          }
        }
      }

      return lastResponse || { jsonrpc: '2.0', id: 0, error: { code: -1, message: 'No valid response received' } };
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Initialize the MCP client and perform handshake with the server
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.initialized) {
      console.log('[MicrosoftEnterpriseMCPClient] Already initialized, skipping');
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      console.log('[MicrosoftEnterpriseMCPClient] Initialization in progress, waiting...');
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        const initRequest: JsonRpcRequest = {
          jsonrpc: '2.0',
          id: this.getNextId(),
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              sampling: {}
            },
            clientInfo: {
              name: 'EntraPulseLite',
              version: VERSION
            }
          }
        };

        console.log('🔌 [MicrosoftEnterpriseMCPClient] Initializing MCP client for:', this.baseUrl);
        const response = await this.sendRequest(initRequest);

        if (response.error) {
          throw new Error(`Initialization failed: ${response.error.message}`);
        }

        this.initialized = true;
        console.log('✅ [MicrosoftEnterpriseMCPClient] MCP client initialized successfully');
        console.log('📋 Server capabilities:', response.result?.capabilities || 'unknown');
        
        // List available tools after initialization to understand what's available
        try {
          const tools = await this.listTools();
          console.log('🔧 [MicrosoftEnterpriseMCPClient] Available tools:', JSON.stringify(tools, null, 2));
        } catch (toolsError) {
          console.warn('⚠️ [MicrosoftEnterpriseMCPClient] Failed to list tools:', toolsError);
        }
      } catch (error) {
        this.initializationPromise = null; // Allow retry
        console.error('❌ [MicrosoftEnterpriseMCPClient] Failed to initialize:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Ensure client is initialized before making calls
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<any[]> {
    const cacheKey = this.getCacheKey('tools/list');
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log('[MicrosoftEnterpriseMCPClient] Returning cached tools list');
      return cached;
    }

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/list',
      params: {}
    };

    console.log('📋 [MicrosoftEnterpriseMCPClient] Requesting tools list...');
    const response = await this.sendRequest(request);
    
    if (response.error) {
      console.error('❌ [MicrosoftEnterpriseMCPClient] Failed to list tools:', response.error);
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    const tools = response.result?.tools || [];
    console.log(`📋 [MicrosoftEnterpriseMCPClient] Retrieved ${tools.length} tools`);
    this.storeInCache(cacheKey, tools, this.defaultCacheTTL);
    return tools;
  }

  /**
   * Call a tool on the MCP server
   * 
   * Available tools from Microsoft Enterprise MCP Server:
   * - microsoft_graph_suggest_queries: Semantic search for Graph API examples
   * - microsoft_graph_get: Execute read-only Graph API calls
   * - microsoft_graph_list_properties: Get schema for Graph entities
   */
  async callTool(toolName: string, arguments_: any): Promise<any> {
    // Ensure client is initialized before making tool calls
    await this.ensureInitialized();

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments_
      }
    };

    console.log(`🔧 [MicrosoftEnterpriseMCPClient] Calling tool "${toolName}" with args:`, arguments_);
    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    console.log(`✅ [MicrosoftEnterpriseMCPClient] Tool "${toolName}" completed successfully`);
    return response.result;
  }

  /**
   * Suggest Microsoft Graph queries based on natural language intent
   * Uses RAG to search a curated catalog of Graph API examples
   * @param intentDescription - Generic, anonymized intent in English (e.g., 'find tenant information', 'get user by email')
   */
  async suggestQueries(intentDescription: string): Promise<any> {
    return this.callTool('microsoft_graph_suggest_queries', { intentDescription });
  }

  /**
   * Execute a read-only Microsoft Graph API call
   * The MCP server enforces user privileges and granted scopes
   * @param relativeUrl - The EXACT relative Microsoft Graph API path (e.g., '/beta/auditLogs/signIns?$top=5')
   */
  async graphGet(relativeUrl: string): Promise<any> {
    return this.callTool('microsoft_graph_get', { relativeUrl });
  }

  /**
   * List properties/schema for a Microsoft Graph entity
   * @param entityName - The name of the Microsoft Graph entity (e.g., 'user', 'group', 'directoryObject')
   */
  async listProperties(entityName: string): Promise<any> {
    return this.callTool('microsoft_graph_list_properties', { entityName });
  }

  /**
   * Execute GET request (legacy compatibility - redirects to graphGet)
   * @deprecated Use graphGet or callTool instead
   */
  async get<T>(url: string): Promise<MCPResponse<T>> {
    console.log('[MicrosoftEnterpriseMCPClient] Legacy get() called, using graphGet instead');
    const result = await this.graphGet(url);
    return {
      data: result,
      cached: false,
      timestamp: Date.now()
    };
  }

  /**
   * Health check - try to list tools
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.listTools();
      return true;
    } catch (error) {
      console.error('[MicrosoftEnterpriseMCPClient] Health check failed:', error);
      return false;
    }
  }
}
