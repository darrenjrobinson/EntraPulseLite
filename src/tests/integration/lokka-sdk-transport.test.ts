// Tier-0 SDK transport integration test.
// Verifies ExternalLokkaMCPStdioServer prefers the official SDK transport
// (SdkMcpConnection) and routes listTools/callTool/stop through it. SdkMcpConnection
// and the legacy clients are mocked so nothing spawns npx.

// Controllable mock state for the SDK connection (jest hoist-safe: `mock*` prefix).
let mockSdkInitialized = false;
const mockSdkStart = jest.fn().mockImplementation(async () => { mockSdkInitialized = true; });
const mockSdkStop = jest.fn().mockImplementation(async () => { mockSdkInitialized = false; });
const mockSdkListTools = jest.fn();
const mockSdkCallTool = jest.fn();
const mockSdkCtor = jest.fn();

jest.mock('../../mcp/clients/SdkMcpConnection', () => ({
  SdkMcpConnection: jest.fn().mockImplementation((opts: any) => {
    mockSdkCtor(opts);
    return {
      start: mockSdkStart,
      stop: mockSdkStop,
      listTools: mockSdkListTools,
      callTool: mockSdkCallTool,
      isInitialized: () => mockSdkInitialized,
      isAlive: () => mockSdkInitialized,
      getServerCapabilities: () => ({ resources: {}, tools: {} }),
      getStatus: () => ({ running: mockSdkInitialized, initialized: mockSdkInitialized, pid: 1 }),
      pid: 1,
    };
  }),
}));

// Keep legacy clients inert so fallback paths never spawn real processes.
jest.mock('../../mcp/clients/PersistentLokkaMCPClient');
jest.mock('../../mcp/clients/ManagedLokkaMCPClient');
jest.mock('../../mcp/clients/EnhancedStdioMCPClient');
jest.mock('../../mcp/clients/StdioMCPClient');
jest.mock('../../mcp/auth/MCPAuthService');
jest.mock('../../shared/ConfigService');

import { ExternalLokkaMCPStdioServer, ExternalLokkaMCPServerConfig } from '../../mcp/servers/lokka/ExternalLokkaMCPStdioServer';
import { MCPAuthService } from '../../mcp/auth/MCPAuthService';
import { ConfigService } from '../../shared/ConfigService';
import { LOKKA_INTERACTIVE_CLIENT_ID } from '../../mcp/constants';

describe('ExternalLokkaMCPStdioServer — tier-0 SDK transport', () => {
  let server: ExternalLokkaMCPStdioServer;
  let mockAuthService: jest.Mocked<MCPAuthService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let config: ExternalLokkaMCPServerConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSdkInitialized = false;

    mockSdkListTools.mockResolvedValue([
      { name: 'Lokka-Microsoft', description: 'graph', inputSchema: { type: 'object' }, _meta: { ui: { resourceUri: 'ui://lokka/graph-explorer.html' } } },
      { name: 'set-access-token', description: 'set token', inputSchema: { type: 'object' } },
      { name: 'get-auth-status', description: 'status', inputSchema: { type: 'object' } },
      // Should be filtered out by the current allowlist (Phase 1).
      { name: 'open-graph-explorer', description: 'ui', inputSchema: { type: 'object' } },
    ]);
    mockSdkCallTool.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
      structuredContent: { value: [] },
      isError: false,
      _meta: { ui: { resourceUri: 'ui://lokka/graph-explorer.html' } },
    });

    mockAuthService = { getToken: jest.fn() } as any;
    mockConfigService = {
      getAuthenticationPreference: jest.fn().mockReturnValue('interactive'),
      getEntraConfig: jest.fn().mockReturnValue({ useGraphPowerShell: false }),
    } as any;

    config = {
      name: 'external-lokka',
      type: 'external-lokka',
      enabled: true,
      port: 0,
      command: 'npx',
      args: ['-y', '@merill/lokka@2.0.0'],
      env: { TENANT_ID: 't', CLIENT_ID: 'c', ACCESS_TOKEN: 'tok', USE_CLIENT_TOKEN: 'true' },
    };

    server = new ExternalLokkaMCPStdioServer(config, mockAuthService, mockConfigService);
  });

  afterEach(async () => {
    try { await server.stopServer(); } catch { /* ignore */ }
  });

  it('starts via the SDK transport as the active client', async () => {
    await server.startServer();

    expect(mockSdkCtor).toHaveBeenCalledTimes(1);
    expect(mockSdkCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npx',
        args: ['-y', '@merill/lokka@2.0.0'],
        // In client-provided-token mode with a profile-specific tenant, the per-profile CLIENT_ID
        // ('c') is replaced with Lokka's own multi-tenant client so its Connection Manager can sign
        // in to other tenants. The primary connection still authenticates with the injected token.
        env: expect.objectContaining({ TENANT_ID: 't', CLIENT_ID: LOKKA_INTERACTIVE_CLIENT_ID }),
      })
    );
    expect(mockSdkStart).toHaveBeenCalledTimes(1);

    const status = server.getStatus();
    expect(status.activeClient).toBe('sdk');
    expect(status.initialized).toBe(true);
    expect(server.isReady()).toBe(true);
  });

  it('does not attempt the legacy persistent client when SDK succeeds', async () => {
    const { PersistentLokkaMCPClient } = require('../../mcp/clients/PersistentLokkaMCPClient');
    await server.startServer();
    expect(PersistentLokkaMCPClient).not.toHaveBeenCalled();
  });

  it('lists tools from the SDK transport, applying the exposed-tools allowlist', async () => {
    await server.startServer();
    const tools = await server.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('Lokka-Microsoft');
    expect(names).toContain('set-access-token');
    expect(names).toContain('get-auth-status');
    // Phase 2: the open-* UI app tools are now exposed (no longer filtered).
    expect(names).toContain('open-graph-explorer');
  });

  it('routes callTool through the SDK transport and preserves _meta', async () => {
    await server.startServer();
    const result = await server.callTool('Lokka-Microsoft', { apiType: 'graph', path: '/me', method: 'get' });
    expect(mockSdkCallTool).toHaveBeenCalledWith('Lokka-Microsoft', { apiType: 'graph', path: '/me', method: 'get' });
    expect(result._meta?.ui?.resourceUri).toBe('ui://lokka/graph-explorer.html');
    expect(result.structuredContent).toEqual({ value: [] });
  });

  it('maps microsoft_graph_query to Lokka-Microsoft over the SDK transport', async () => {
    await server.startServer();
    await server.callTool('microsoft_graph_query', { endpoint: '/me', method: 'get' });
    expect(mockSdkCallTool).toHaveBeenCalledWith(
      'Lokka-Microsoft',
      expect.objectContaining({ apiType: 'graph', path: '/me', method: 'get' })
    );
  });

  it('stops the SDK transport on stopServer', async () => {
    await server.startServer();
    await server.stopServer();
    expect(mockSdkStop).toHaveBeenCalled();
    expect(server.getStatus().activeClient).toBe('none');
  });

  it('skips the SDK transport when LOKKA_USE_SDK_TRANSPORT=false', async () => {
    const optOut = new ExternalLokkaMCPStdioServer(
      { ...config, env: { ...config.env, LOKKA_USE_SDK_TRANSPORT: 'false' } },
      mockAuthService,
      mockConfigService
    );
    await optOut.startServer();
    expect(mockSdkCtor).not.toHaveBeenCalled();
    await optOut.stopServer();
  });
});
