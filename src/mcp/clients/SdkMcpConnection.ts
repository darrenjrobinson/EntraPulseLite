// SdkMcpConnection.ts
//
// Phase 1 of the Lokka MCP Apps migration (see docs/EntraPulse-Lokka-MCP-Apps-Plan.md
// and docs/MCP_APPS_CONTRACT.md).
//
// A thin, transport-only wrapper around the official `@modelcontextprotocol/sdk`
// `Client` + `StdioClientTransport`. It replaces the hand-rolled, newline-delimited
// JSON-RPC clients (StdioMCPClient / EnhancedStdioMCPClient / ManagedLokkaMCPClient /
// PersistentLokkaMCPClient) for the Lokka path.
//
// Deliberately knows NOTHING about authentication, token injection, USE_CLIENT_TOKEN,
// or Lokka tool semantics. Those responsibilities stay in ExternalLokkaMCPStdioServer,
// which composes this connection. This keeps the connection generic enough to host any
// MCP Apps server, per the plan's "generic MCP Apps host" decision.
//
// Import note: the SDK is ESM-only with an `exports` map and ships solely under `dist/`.
// The `@modelcontextprotocol/sdk/client/{index,stdio}.js` specifiers are the ones the
// exports map (and Node/webpack at runtime) resolve correctly. The project's TS config
// uses `moduleResolution: "node"` (classic), which ignores `exports` and can't find a
// physical `client/` dir, so tsconfig.json adds `paths` entries mapping these specifiers
// to the physical `dist/cjs/client/*.d.ts` for type-checking only. cross-spawn (used
// internally by StdioClientTransport) resolves `npx` -> `npx.cmd` on Windows, so the
// elaborate batch fallbacks the old PersistentLokkaMCPClient needed are unnecessary.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { VERSION } from '../../shared/version';

/** A tool as returned by tools/list (raw SDK shape; `_meta` carries ui/resourceUri). */
export interface SdkTool {
  name: string;
  description?: string;
  inputSchema?: object;
  _meta?: Record<string, any>;
  [key: string]: any;
}

/** A resource as returned by resources/list. */
export interface SdkResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, any>;
  [key: string]: any;
}

/** The contents of a resource as returned by resources/read. */
export interface SdkResourceContents {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: Record<string, any>;
    [key: string]: any;
  }>;
  _meta?: Record<string, any>;
}

/** A tool-call result (CallToolResult); `_meta` and structuredContent preserved verbatim. */
export interface SdkCallToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: any }>;
  structuredContent?: any;
  isError?: boolean;
  _meta?: Record<string, any>;
  [key: string]: any;
}

export interface SdkMcpConnectionOptions {
  /** Executable to spawn (e.g. "npx"). */
  command: string;
  /** Arguments (e.g. ["-y", "@merill/lokka@2.1.2"]). */
  args: string[];
  /**
   * Environment for the spawned process. This is where the caller injects auth
   * (USE_CLIENT_TOKEN / ACCESS_TOKEN / TENANT_ID / CLIENT_ID). Passed through verbatim.
   */
  env: Record<string, string>;
  /** Optional working directory for the child process. */
  cwd?: string;
  /** Client identity reported in `initialize`. */
  clientInfo?: { name: string; version: string };
  /**
   * Client capabilities to advertise at `initialize`. Lokka registers UI resources
   * unconditionally, so no special "apps" capability key is required at this (MCP
   * transport) layer — see MCP_APPS_CONTRACT.md §1. Defaults to `{}`.
   */
  capabilities?: Record<string, any>;
  /** Optional log sink; defaults to console. */
  logger?: { info: (m: string) => void; warn: (m: string, e?: any) => void; error: (m: string, e?: any) => void };
  /** Called for each line the server writes to stderr (diagnostics). */
  onStderr?: (line: string) => void;
  /** Called if the transport closes unexpectedly (process exit / pipe break). */
  onClose?: () => void;
}

/**
 * Transport-only MCP connection over stdio using the official SDK.
 *
 * Lifecycle: construct -> start() -> (listTools/callTool/listResources/readResource)* -> stop().
 * start() is idempotent-safe via an internal startup promise so concurrent callers share one spawn.
 */
export class SdkMcpConnection {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private readonly opts: SdkMcpConnectionOptions;
  private readonly log: NonNullable<SdkMcpConnectionOptions['logger']>;

  private connected = false;
  private startupPromise: Promise<void> | null = null;
  private serverCapabilities: Record<string, any> | undefined;

  constructor(options: SdkMcpConnectionOptions) {
    this.opts = options;
    this.log = options.logger ?? {
      info: (m) => console.log(`[SdkMcpConnection] ${m}`),
      warn: (m, e) => console.warn(`[SdkMcpConnection] ${m}`, e ?? ''),
      error: (m, e) => console.error(`[SdkMcpConnection] ${m}`, e ?? ''),
    };
  }

  /** True once `initialize` has completed and the transport is live. */
  isInitialized(): boolean {
    return this.connected && this.client !== null;
  }

  /** True if the underlying child process appears to be running. */
  isAlive(): boolean {
    return this.connected && this.transport !== null && this.transport.pid != null;
  }

  /** Server capabilities reported during `initialize` (undefined before connect). */
  getServerCapabilities(): Record<string, any> | undefined {
    return this.serverCapabilities;
  }

  /** The spawned child process pid, or null. */
  get pid(): number | null {
    return this.transport?.pid ?? null;
  }

  /**
   * Spawn the server and complete the MCP handshake. Safe to call concurrently:
   * overlapping callers await the same in-flight startup (mirrors the old
   * isStarting/startupPromise serialization in ExternalLokkaMCPStdioServer).
   */
  async start(): Promise<void> {
    if (this.connected) return;
    if (this.startupPromise) return this.startupPromise;

    this.startupPromise = this.performStart();
    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  private async performStart(): Promise<void> {
    this.log.info(`Spawning: ${this.opts.command} ${this.opts.args.join(' ')}`);

    const transport = new StdioClientTransport({
      command: this.opts.command,
      args: this.opts.args,
      env: this.opts.env,
      cwd: this.opts.cwd,
      // Pipe stderr so we can surface Lokka diagnostics instead of letting them
      // vanish into the Electron main process stderr.
      stderr: 'pipe',
    });

    transport.onclose = () => {
      if (this.connected) {
        this.log.warn('Transport closed unexpectedly');
        this.connected = false;
        this.opts.onClose?.();
      }
    };
    transport.onerror = (err: Error) => this.log.error('Transport error', err);

    const client = new Client(
      this.opts.clientInfo ?? { name: 'entrapulse-lite', version: VERSION },
      { capabilities: this.opts.capabilities ?? {} }
    );

    // connect() starts the transport and performs the `initialize` exchange. The SDK
    // sends protocolVersion = LATEST_PROTOCOL_VERSION and validates the server's reply
    // against SUPPORTED_PROTOCOL_VERSIONS (see MCP_APPS_CONTRACT.md §1, Layer A).
    await client.connect(transport);

    // Attach stderr listener after connect (PassThrough is available immediately, but
    // connect() is where start() runs and the stream is wired).
    const stderr = transport.stderr;
    if (stderr && this.opts.onStderr) {
      let buf = '';
      stderr.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) this.opts.onStderr!(line.trim());
        }
      });
    }

    this.client = client;
    this.transport = transport;
    this.serverCapabilities = client.getServerCapabilities() as Record<string, any> | undefined;
    this.connected = true;

    this.log.info(
      `Connected (pid=${transport.pid}). Server capabilities: ${JSON.stringify(this.serverCapabilities ?? {})}`
    );
  }

  private ensureReady(): Client {
    if (!this.client || !this.connected) {
      throw new Error('SdkMcpConnection is not connected. Call start() first.');
    }
    return this.client;
  }

  /** tools/list. Returns raw tool objects with `_meta` preserved. */
  async listTools(): Promise<SdkTool[]> {
    const client = this.ensureReady();
    const result = await client.listTools();
    return (result.tools ?? []) as SdkTool[];
  }

  /**
   * tools/call. Returns the raw CallToolResult — `_meta`, `structuredContent`, and
   * `isError` are passed through unchanged so downstream (EnhancedLLMService / the apps
   * bridge) can read `_meta.ui.resourceUri` and structured payloads.
   */
  async callTool(name: string, args: Record<string, any> = {}): Promise<SdkCallToolResult> {
    const client = this.ensureReady();
    const result = await client.callTool({ name, arguments: args });
    return result as SdkCallToolResult;
  }

  /** resources/list. New capability the custom clients never had. */
  async listResources(): Promise<SdkResource[]> {
    const client = this.ensureReady();
    const result = await client.listResources();
    return (result.resources ?? []) as SdkResource[];
  }

  /** resources/read. Used to fetch the `text/html;profile=mcp-app` UI documents. */
  async readResource(uri: string): Promise<SdkResourceContents> {
    const client = this.ensureReady();
    const result = await client.readResource({ uri });
    return result as SdkResourceContents;
  }

  /** Liveness check that round-trips to the server. */
  async ping(): Promise<boolean> {
    try {
      await this.ensureReady().ping();
      return true;
    } catch (err) {
      this.log.warn('ping failed', err);
      return false;
    }
  }

  /** Close the transport and terminate the child process. */
  async stop(): Promise<void> {
    this.connected = false;
    const client = this.client;
    this.client = null;
    this.transport = null;
    this.serverCapabilities = undefined;
    if (client) {
      try {
        await client.close();
      } catch (err) {
        this.log.warn('Error during close', err);
      }
    }
  }

  /** Convenience for callers that want a single status object. */
  getStatus(): { running: boolean; initialized: boolean; pid: number | null } {
    return { running: this.isAlive(), initialized: this.isInitialized(), pid: this.pid };
  }
}
