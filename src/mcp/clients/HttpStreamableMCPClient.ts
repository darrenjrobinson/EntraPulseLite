// HTTP Streamable MCP Client for communicating with MCP servers over HTTP
import { MCPServerConfig } from '../types';
import { MCPAuthService } from '../auth/MCPAuthService';

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

export class HttpStreamableMCPClient {
  private serverConfig: MCPServerConfig;
  private authService: MCPAuthService;
  private baseUrl: string;
  private sessionId: string | null = null;
  private requestId = 1;

  constructor(serverConfig: MCPServerConfig, authService: MCPAuthService) {
    this.serverConfig = serverConfig;
    this.authService = authService;
    this.baseUrl = serverConfig.url || 'https://learn.microsoft.com/api/mcp';
  }

  /**
   * Initialize the MCP client and perform handshake with the server
   */
  async initialize(): Promise<void> {
    try {      const initRequest: JsonRpcRequest = {
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
            version: '1.0.0'
          }
        }
      };

      console.log('🔌 Initializing HTTP Streamable MCP client for:', this.baseUrl);
      const response = await this.sendRequest(initRequest);
      
      if (response.error) {
        throw new Error(`Initialization failed: ${response.error.message}`);
      }

      console.log('✅ HTTP Streamable MCP client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize HTTP Streamable MCP client:', error);
      throw error;
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<any[]> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/list',
      params: {}
    };

    const response = await this.sendRequest(request);
    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    return response.result?.tools || [];
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, arguments_: any): Promise<any> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments_
      }
    };

    console.log(`🔧 HTTP Streamable MCP calling tool "${toolName}" with args:`, arguments_);
    const response = await this.sendRequest(request);
    
    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    console.log(`✅ HTTP Streamable MCP tool "${toolName}" completed successfully`);
    return response.result;
  }

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<any[]> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'resources/list',
      params: {}
    };

    const response = await this.sendRequest(request);
    if (response.error) {
      throw new Error(`Failed to list resources: ${response.error.message}`);
    }

    return response.result?.resources || [];
  }

  /**
   * Get the contents of a specific resource
   */
  async readResource(uri: string): Promise<any> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'resources/read',
      params: {
        uri
      }
    };

    const response = await this.sendRequest(request);
    if (response.error) {
      throw new Error(`Failed to read resource: ${response.error.message}`);
    }

    return response.result;
  }

  /**
   * Send HTTP Streamable request to the MCP server
   */
  private async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'MCP-Client/1.0.0'
      };

      // Add session ID if we have one
      if (this.sessionId) {
        headers['Mcp-Session-Id'] = this.sessionId;
      }

      // Add authentication headers if needed
      if (this.serverConfig.authConfig?.type !== 'none') {
        try {
          const authHeaders = await this.authService.getAuthHeaders('microsoft-docs');
          Object.assign(headers, authHeaders);
        } catch (authError) {
          console.warn('Failed to get auth headers for Microsoft Docs MCP:', authError);
          // Continue without auth headers as Microsoft Docs MCP may not require authentication
        }
      }      console.log('🌐 Sending HTTP Streamable MCP request:', {
        url: this.baseUrl,
        method: request.method,
        id: request.id,
        hasSessionId: !!this.sessionId,
        headers: Object.keys(headers),
        bodyPreview: JSON.stringify(request).substring(0, 200)
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      // Log response details for debugging
      console.log('📡 Received response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('Content-Type'),
        hasSessionId: !!response.headers.get('Mcp-Session-Id')
      });

      // Check for session ID in response headers
      const responseSessionId = response.headers.get('Mcp-Session-Id');
      if (responseSessionId && !this.sessionId) {
        this.sessionId = responseSessionId;
        console.log('📝 Received session ID from server:', responseSessionId);
      }

      if (!response.ok) {
        // For debugging 406 errors, try to get response body
        let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails += ` - Response: ${errorBody}`;
            console.log('❌ Error response body:', errorBody);
          }
        } catch (e) {
          console.log('❌ Could not read error response body');
        }
        throw new Error(errorDetails);
      }

      const contentType = response.headers.get('Content-Type') || '';
      
      // Handle SSE stream response
      if (contentType.includes('text/event-stream')) {
        console.log('📡 Received SSE stream response, parsing...');
        return await this.parseSSEResponse(response);
      }
      
      // Handle JSON response
      const data = await response.json();
      console.log('📨 Received JSON response:', {
        hasResult: !!data.result,
        hasError: !!data.error,
        id: data.id
      });
      
      return data as JsonRpcResponse;
    } catch (error) {
      console.error('❌ HTTP Streamable MCP request failed:', error);
      throw new Error(`HTTP Streamable MCP request failed: ${(error as Error).message}`);
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
              if (jsonData.jsonrpc) {
                lastResponse = jsonData;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', data);
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
   * Get next request ID
   */
  private getNextId(): number {
    return this.requestId++;
  }

  /**
   * Check if the server is healthy and responding
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.listTools();
      return true;
    } catch (error) {
      console.error('HTTP Streamable MCP health check failed:', error);
      return false;
    }
  }
}
