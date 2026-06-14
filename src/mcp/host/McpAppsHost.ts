// McpAppsHost.ts
//
// Phase 4 of the Lokka MCP Apps migration. Generic main-process relay for iframe-initiated
// JSON-RPC. The renderer's McpAppFrame relays UI-originated requests (tools/call,
// resources/read) over the `mcp:ui:rpc` IPC channel; this host runs each through the
// ServerPolicy gate and forwards allowed calls to the EXISTING live connection (no second
// server spawn). Bridge-only methods (ui/initialize, ui/message, ui/open-link, etc.) are
// handled in the renderer and never reach here.
//
// See docs/EntraPulse-Lokka-MCP-Apps-Plan.md §4 and docs/MCP_APPS_CONTRACT.md §2-3.

import { ServerPolicy, policyForServer, RELAYABLE_METHODS } from './ServerPolicy';

/** Minimal connection surface the host needs from a live MCP server. */
export interface HostConnection {
  callTool(name: string, args: any): Promise<any>;
  readResource(uri: string): Promise<any>;
  listResources(): Promise<any[]>;
  isReady?: () => boolean;
}

export interface JsonRpcRequest {
  jsonrpc?: '2.0';
  id?: number | string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export interface McpAppsHostOptions {
  /** Resolve the live connection for a server id, or null if not running. */
  getConnection: (serverId: string) => HostConnection | null;
  /** Resolve the policy for a server id. Defaults to policyForServer(). */
  getPolicy?: (serverId: string) => ServerPolicy;
  logger?: { info: (m: string) => void; warn: (m: string, e?: any) => void };
}

// JSON-RPC error codes (standard + host-specific).
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;
const POLICY_DENIED = -32001; // host-specific: blocked by ServerPolicy

export class McpAppsHost {
  private readonly opts: McpAppsHostOptions;
  private readonly log: NonNullable<McpAppsHostOptions['logger']>;

  constructor(options: McpAppsHostOptions) {
    this.opts = options;
    this.log = options.logger ?? {
      info: (m) => console.log(`[McpAppsHost] ${m}`),
      warn: (m, e) => console.warn(`[McpAppsHost] ${m}`, e ?? ''),
    };
  }

  /**
   * Handle one relayed iframe JSON-RPC request. Never throws — always returns a
   * JSON-RPC response (errors are encoded), so the renderer can post it straight back
   * to the iframe.
   */
  async handleRpc(serverId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = request?.id ?? null;
    const method = request?.method;

    try {
      if (!method || !RELAYABLE_METHODS.includes(method)) {
        return this.err(id, METHOD_NOT_FOUND, `Method '${method}' is not relayable to the host.`);
      }

      const policy = (this.opts.getPolicy ?? policyForServer)(serverId);
      const decision = policy.evaluate(method, request.params);
      if (decision.action === 'deny') {
        this.log.info(`Policy denied ${serverId} ${method} (${request.params?.name ?? ''})`);
        return this.err(id, POLICY_DENIED, decision.reason || 'Blocked by host policy.', {
          redirect: decision.redirect,
        });
      }

      const conn = this.opts.getConnection(serverId);
      if (!conn) {
        return this.err(id, INTERNAL_ERROR, `MCP server '${serverId}' is not running.`);
      }

      let result: any;
      switch (method) {
        case 'tools/call':
          result = await conn.callTool(request.params?.name, request.params?.arguments ?? {});
          break;
        case 'resources/read':
          result = await conn.readResource(request.params?.uri);
          break;
        case 'resources/list':
          result = { resources: await conn.listResources() };
          break;
        default:
          return this.err(id, METHOD_NOT_FOUND, `Method '${method}' is not relayable to the host.`);
      }

      return { jsonrpc: '2.0', id, result };
    } catch (e) {
      this.log.warn(`handleRpc failed for ${serverId} ${method}`, e);
      return this.err(id, INTERNAL_ERROR, (e as Error)?.message || 'Host relay failed.');
    }
  }

  private err(id: number | string | null, code: number, message: string, data?: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
  }
}
