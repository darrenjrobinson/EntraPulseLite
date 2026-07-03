// PolyarchyMCPServer.ts
//
// EntraPulse Polyarchy MCP server (entrapulse-polyarchy on npm): an interactive
// Entra ID identity-relationship visualization served as an MCP App and rendered
// inline by McpAppFrame.
//
// Unlike ExternalLokkaMCPStdioServer this is SDK-transport-only (tier-0): the
// legacy stdio fallback tiers predate the official SDK and the MCP Apps flow
// needs resources/read anyway, which only the SDK transport provides.
//
// Auth: always client-provided-token mode. EntraPulse owns the Graph token and
// injects it via the ACCESS_TOKEN env var at spawn, then keeps it fresh with the
// server's set-access-token tool — polyarchy was designed for exactly this host
// flow, so token refresh is a live tool call, never a process restart.

import { MCPServerConfig, MCPTool } from '../../types';
import { MCPErrorHandler, ErrorCode } from '../../utils';
import { MCPAuthService } from '../../auth/MCPAuthService';
import { SdkMcpConnection } from '../../clients/SdkMcpConnection';
import { ConfigService } from '../../../shared/ConfigService';
import { POLYARCHY_NPX_ARGS, POLYARCHY_EXPOSED_TOOLS } from '../../constants';
import { VERSION } from '../../../shared/version';

export class PolyarchyMCPServer {
  private config: MCPServerConfig;
  private authService: MCPAuthService;
  private configService: ConfigService;
  private sdkConnection: SdkMcpConnection | null = null;

  constructor(config: MCPServerConfig, authService: MCPAuthService, configService: ConfigService) {
    this.config = config;
    this.authService = authService;
    this.configService = configService;
  }

  async startServer(): Promise<void> {
    if (this.sdkConnection?.isInitialized()) {
      return;
    }

    const env = this.config.env || {};
    const filteredEnv: Record<string, string> = {};
    Object.entries(env).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        filteredEnv[key] = value;
      }
    });
    // Client-provided-token mode always; without it the package would attempt its
    // own interactive browser sign-in, and EntraPulse owns authentication.
    filteredEnv.USE_CLIENT_TOKEN = 'true';

    console.log('🚀 [Polyarchy] Starting Polyarchy MCP server via SDK transport...', {
      hasAccessToken: !!filteredEnv.ACCESS_TOKEN,
      envKeys: Object.keys(filteredEnv)
    });

    this.sdkConnection = new SdkMcpConnection({
      command: this.config.command || 'npx',
      args: this.config.args || [...POLYARCHY_NPX_ARGS],
      env: filteredEnv,
      clientInfo: { name: 'EntraPulseLite', version: VERSION },
      capabilities: {},
      onStderr: (line) => console.log(`[Polyarchy stderr] ${line}`),
    });

    try {
      await this.sdkConnection.start();
    } catch (error) {
      console.error('❌ [Polyarchy] SDK transport failed to start:', error);
      try {
        await this.sdkConnection.stop();
      } catch {
        // best effort
      }
      this.sdkConnection = null;
      throw error;
    }

    console.log('✅ [Polyarchy] Connected via SDK transport');

    // Pre-login the app boots token-less and idles awaiting set-access-token; push a
    // token now if one is already available so the first visualize call doesn't 401.
    if (!filteredEnv.ACCESS_TOKEN) {
      await this.pushFreshToken({ tolerateFailure: true });
    }
  }

  async stopServer(): Promise<void> {
    const connection = this.sdkConnection;
    this.sdkConnection = null;
    if (connection) {
      await connection.stop();
      console.log('Polyarchy MCP server stopped');
    }
  }

  // Only the allowlisted tools are exposed to the LLM; the app's own tools
  // (polyarchy-expand, get-photo, get-manager) flow over the iframe bridge,
  // which calls this class directly and bypasses this list.
  private filterExposedTools(tools: MCPTool[]): MCPTool[] {
    const filtered = tools.filter(tool => POLYARCHY_EXPOSED_TOOLS.includes(tool.name));
    // If the server returned tools but none matched the allowlist, fall back to
    // the full list rather than crippling the integration (e.g. upstream rename).
    if (filtered.length === 0 && tools.length > 0) {
      console.warn('⚠️ No Polyarchy tools matched the allowlist - exposing unfiltered list. Upstream tool names may have changed.');
      return tools;
    }
    return filtered;
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.sdkConnection?.isInitialized()) {
      return [];
    }
    try {
      const tools = await this.sdkConnection.listTools();
      return this.filterExposedTools(tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: (tool.inputSchema as object) || {},
        // visualize-identity carries its ui://... link on the definition's _meta.
        ...(tool._meta ? { _meta: tool._meta } : {}),
      } as MCPTool)));
    } catch (error) {
      console.error('Failed to list Polyarchy tools:', error);
      return [];
    }
  }

  async handleRequest(request: any): Promise<any> {
    try {
      switch (request.method) {
        case 'tools/list':
          return { id: request.id, result: { tools: await this.listTools() } };
        case 'tools/call':
          return {
            id: request.id,
            result: await this.callTool(request.params?.name, request.params?.arguments ?? {})
          };
        case 'resources/read':
          return { id: request.id, result: await this.readResource(request.params?.uri) };
        case 'resources/list':
          return { id: request.id, result: { resources: await this.listResources() } };
        default:
          throw new Error(`Unsupported request method: ${request.method}`);
      }
    } catch (error) {
      console.error('Polyarchy MCP request failed:', error);
      return {
        id: request.id,
        error: MCPErrorHandler.createError(
          ErrorCode.INTERNAL_SERVER_ERROR,
          `Polyarchy MCP request failed: ${(error as Error).message}`
        )
      };
    }
  }

  async callTool(toolName: string, arguments_: any): Promise<any> {
    const connection = this.requireConnection();

    let result = await connection.callTool(toolName, arguments_ ?? {});

    // Expired/invalid token: refresh via the server's set-access-token tool and retry
    // once. Live refresh, no respawn — polyarchy is built for host-fed tokens. Missing-
    // scope 403s are NOT token errors and propagate (they name the scope themselves).
    if (toolName !== 'set-access-token' && this.isTokenError(result)) {
      console.log(`🔄 [Polyarchy] Token error on '${toolName}' - refreshing token and retrying once`);
      const refreshed = await this.pushFreshToken({ tolerateFailure: true });
      if (refreshed) {
        result = await connection.callTool(toolName, arguments_ ?? {});
      }
    }

    return result;
  }

  // MCP Apps: read a UI resource (text/html;profile=mcp-app) from the live server.
  // Wording kept aligned with ExternalLokkaMCPStdioServer so McpAppFrame's
  // degradation matching keeps working.
  async readResource(uri: string): Promise<any> {
    if (this.sdkConnection?.isInitialized()) {
      return this.sdkConnection.readResource(uri);
    }
    throw new Error('resources/read is only available via the SDK transport (tier-0). Active client does not support MCP resources.');
  }

  async listResources(): Promise<any[]> {
    if (this.sdkConnection?.isInitialized()) {
      return this.sdkConnection.listResources();
    }
    throw new Error('resources/list is only available via the SDK transport (tier-0).');
  }

  isReady(): boolean {
    return this.sdkConnection?.isInitialized() ?? false;
  }

  getStatus(): { running: boolean; initialized: boolean; pid: number | null } {
    return this.sdkConnection?.getStatus() ?? { running: false, initialized: false, pid: null };
  }

  /**
   * Fetch a fresh Graph token from EntraPulse's auth service and hand it to the
   * server via its set-access-token tool. Returns true if a token was pushed.
   * Pre-login there is no token yet — that's normal, the server idles until one
   * arrives, so failures are tolerated when requested.
   */
  private async pushFreshToken(options: { tolerateFailure: boolean }): Promise<boolean> {
    try {
      const token = await this.authService.getToken();
      if (!token?.accessToken) {
        throw new Error('No authentication token available');
      }
      const connection = this.requireConnection();
      await connection.callTool('set-access-token', {
        accessToken: token.accessToken,
        ...(token.expiresOn ? { expiresOn: new Date(token.expiresOn).toISOString() } : {})
      });
      console.log('✅ [Polyarchy] Access token pushed to server');
      return true;
    } catch (error) {
      if (options.tolerateFailure) {
        console.log('⚠️ [Polyarchy] No token pushed (normal before sign-in):', (error as Error).message);
        return false;
      }
      throw error;
    }
  }

  private requireConnection(): SdkMcpConnection {
    if (!this.sdkConnection?.isInitialized()) {
      throw new Error('Polyarchy MCP server not initialized - no active client available');
    }
    return this.sdkConnection;
  }

  private isTokenError(result: any): boolean {
    if (!result?.isError) return false;
    const content = (result.content?.[0]?.text || '').toLowerCase();
    return content.includes('failed to acquire access token') ||
           content.includes('token has expired') ||
           content.includes('token is expired') ||
           content.includes('access token is invalid') ||
           content.includes('no access token') ||
           content.includes('401') ||
           content.includes('unauthorized') ||
           content.includes('authentication failed');
  }
}

export default PolyarchyMCPServer;
