// PolyarchyMCPServer integration test.
// Verifies the SDK-transport-only server: spawn config (pinned npx package,
// client-provided-token mode), tool allowlisting, host token injection via
// set-access-token, live token refresh on token errors (no restart), and the
// resources passthrough used by the MCP Apps UI. SdkMcpConnection is mocked so
// nothing spawns npx.

// Controllable mock state for the SDK connection (jest hoist-safe: `mock*` prefix).
let mockSdkInitialized = false;
const mockSdkStart = jest.fn().mockImplementation(async () => { mockSdkInitialized = true; });
const mockSdkStop = jest.fn().mockImplementation(async () => { mockSdkInitialized = false; });
const mockSdkListTools = jest.fn();
const mockSdkCallTool = jest.fn();
const mockSdkListResources = jest.fn();
const mockSdkReadResource = jest.fn();
const mockSdkCtor = jest.fn();

jest.mock('../../mcp/clients/SdkMcpConnection', () => ({
  SdkMcpConnection: jest.fn().mockImplementation((opts: any) => {
    mockSdkCtor(opts);
    return {
      start: mockSdkStart,
      stop: mockSdkStop,
      listTools: mockSdkListTools,
      callTool: mockSdkCallTool,
      listResources: mockSdkListResources,
      readResource: mockSdkReadResource,
      isInitialized: () => mockSdkInitialized,
      isAlive: () => mockSdkInitialized,
      getStatus: () => ({ running: mockSdkInitialized, initialized: mockSdkInitialized, pid: 1 }),
      pid: 1,
    };
  }),
}));

jest.mock('../../mcp/auth/MCPAuthService');
jest.mock('../../shared/ConfigService');

import { PolyarchyMCPServer } from '../../mcp/servers/polyarchy/PolyarchyMCPServer';
import { MCPAuthService } from '../../mcp/auth/MCPAuthService';
import { ConfigService } from '../../shared/ConfigService';
import { MCPServerConfig } from '../../mcp/types';
import { POLYARCHY_PINNED_PACKAGE, POLYARCHY_UI_RESOURCE } from '../../mcp/constants';

const ALL_TOOLS = [
  { name: 'visualize-identity', description: 'open the polyarchy', inputSchema: { type: 'object' }, _meta: { ui: { resourceUri: POLYARCHY_UI_RESOURCE } } },
  { name: 'polyarchy-report', description: 'headless identity report', inputSchema: { type: 'object' } },
  { name: 'polyarchy-search', description: 'find people', inputSchema: { type: 'object' } },
  { name: 'get-auth-status', description: 'auth diagnostics', inputSchema: { type: 'object' } },
  // App-bridge-only tools — not exposed to the LLM.
  { name: 'polyarchy-expand', description: 'expand a node', inputSchema: { type: 'object' } },
  { name: 'get-photo', description: 'photo', inputSchema: { type: 'object' } },
  { name: 'get-manager', description: 'manager', inputSchema: { type: 'object' } },
  { name: 'set-access-token', description: 'token passthrough', inputSchema: { type: 'object' } },
];

describe('PolyarchyMCPServer — SDK transport', () => {
  let server: PolyarchyMCPServer;
  let mockAuthService: jest.Mocked<MCPAuthService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let config: MCPServerConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSdkInitialized = false;

    mockSdkListTools.mockResolvedValue(ALL_TOOLS);
    mockSdkCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Polyarchy opened' }],
      structuredContent: { focus: 'me' },
      isError: false,
    });
    mockSdkListResources.mockResolvedValue([{ uri: POLYARCHY_UI_RESOURCE, name: 'Polyarchy' }]);
    mockSdkReadResource.mockResolvedValue({ contents: [{ uri: POLYARCHY_UI_RESOURCE, mimeType: 'text/html;profile=mcp-app', text: '<html/>' }] });

    mockAuthService = {
      getToken: jest.fn().mockResolvedValue({ accessToken: 'fresh-token', expiresOn: new Date('2026-01-01T00:00:00Z') }),
    } as any;
    mockConfigService = {} as any;

    config = {
      name: 'entrapulse-polyarchy',
      type: 'entrapulse-polyarchy',
      enabled: true,
      port: 0,
      command: 'npx',
      args: ['-y', POLYARCHY_PINNED_PACKAGE],
      env: { USE_CLIENT_TOKEN: 'true', ACCESS_TOKEN: 'boot-token' },
    };

    server = new PolyarchyMCPServer(config, mockAuthService, mockConfigService);
  });

  afterEach(async () => {
    try { await server.stopServer(); } catch { /* ignore */ }
  });

  it('spawns the pinned package in client-provided-token mode', async () => {
    await server.startServer();

    expect(mockSdkCtor).toHaveBeenCalledTimes(1);
    expect(mockSdkCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npx',
        args: ['-y', POLYARCHY_PINNED_PACKAGE],
        env: expect.objectContaining({ USE_CLIENT_TOKEN: 'true', ACCESS_TOKEN: 'boot-token' }),
      })
    );
    expect(mockSdkStart).toHaveBeenCalledTimes(1);
    expect(server.isReady()).toBe(true);
    // Env already carried a token — no post-connect set-access-token call.
    expect(mockSdkCallTool).not.toHaveBeenCalled();
  });

  it('forces USE_CLIENT_TOKEN even when absent from the env', async () => {
    const bare = new PolyarchyMCPServer({ ...config, env: {} }, mockAuthService, mockConfigService);
    await bare.startServer();
    expect(mockSdkCtor).toHaveBeenCalledWith(
      expect.objectContaining({ env: expect.objectContaining({ USE_CLIENT_TOKEN: 'true' }) })
    );
    await bare.stopServer();
  });

  it('pushes a token via set-access-token after connect when the env had none', async () => {
    const tokenless = new PolyarchyMCPServer({ ...config, env: { USE_CLIENT_TOKEN: 'true' } }, mockAuthService, mockConfigService);
    await tokenless.startServer();

    expect(mockAuthService.getToken).toHaveBeenCalled();
    expect(mockSdkCallTool).toHaveBeenCalledWith('set-access-token', expect.objectContaining({
      accessToken: 'fresh-token',
      expiresOn: '2026-01-01T00:00:00.000Z',
    }));
    await tokenless.stopServer();
  });

  it('tolerates a missing token pre-login and still starts', async () => {
    mockAuthService.getToken.mockResolvedValue(null as any);
    const tokenless = new PolyarchyMCPServer({ ...config, env: {} }, mockAuthService, mockConfigService);
    await expect(tokenless.startServer()).resolves.toBeUndefined();
    expect(tokenless.isReady()).toBe(true);
    await tokenless.stopServer();
  });

  it('lists tools applying the exposed-tools allowlist (bridge tools filtered)', async () => {
    await server.startServer();
    const tools = await server.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toEqual(expect.arrayContaining(['visualize-identity', 'polyarchy-report', 'polyarchy-search', 'get-auth-status']));
    expect(names).not.toContain('polyarchy-expand');
    expect(names).not.toContain('get-photo');
    expect(names).not.toContain('get-manager');
    expect(names).not.toContain('set-access-token');

    // The definition-level UI link survives the mapping.
    const visualize = tools.find((t) => t.name === 'visualize-identity');
    expect(visualize?._meta?.ui?.resourceUri).toBe(POLYARCHY_UI_RESOURCE);
  });

  it('falls back to the unfiltered list if no tool matches the allowlist', async () => {
    mockSdkListTools.mockResolvedValue([
      { name: 'renamed-tool', description: '', inputSchema: { type: 'object' } },
    ]);
    await server.startServer();
    const tools = await server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['renamed-tool']);
  });

  it('refreshes the token via set-access-token and retries once on a token error (no restart)', async () => {
    await server.startServer();

    const tokenError = { content: [{ type: 'text', text: 'Token has expired' }], isError: true };
    const success = { content: [{ type: 'text', text: 'ok' }], isError: false };
    mockSdkCallTool
      .mockResolvedValueOnce(tokenError)                        // visualize-identity -> token error
      .mockResolvedValueOnce({ content: [], isError: false })   // set-access-token
      .mockResolvedValueOnce(success);                          // retry

    const result = await server.callTool('visualize-identity', {});

    expect(mockAuthService.getToken).toHaveBeenCalled();
    expect(mockSdkCallTool).toHaveBeenNthCalledWith(2, 'set-access-token', expect.objectContaining({ accessToken: 'fresh-token' }));
    expect(mockSdkCallTool).toHaveBeenNthCalledWith(3, 'visualize-identity', {});
    expect(result).toEqual(success);
    // Live refresh only — the process is never restarted.
    expect(mockSdkStart).toHaveBeenCalledTimes(1);
    expect(mockSdkStop).not.toHaveBeenCalled();
  });

  it('propagates non-token errors (e.g. missing-scope 403s) without retrying', async () => {
    await server.startServer();
    const scopeError = { content: [{ type: 'text', text: 'Missing scope: Group.Read.All (403 Forbidden requires consent)' }], isError: true };
    mockSdkCallTool.mockResolvedValueOnce(scopeError);

    const result = await server.callTool('visualize-identity', {});
    expect(result).toEqual(scopeError);
    expect(mockSdkCallTool).toHaveBeenCalledTimes(1);
  });

  it('passes resources/read and resources/list through to the SDK transport', async () => {
    await server.startServer();

    const contents = await server.readResource(POLYARCHY_UI_RESOURCE);
    expect(mockSdkReadResource).toHaveBeenCalledWith(POLYARCHY_UI_RESOURCE);
    expect(contents.contents[0].mimeType).toBe('text/html;profile=mcp-app');

    const resources = await server.listResources();
    expect(resources).toHaveLength(1);
  });

  it('rejects resource access before the transport is initialized', async () => {
    await expect(server.readResource(POLYARCHY_UI_RESOURCE)).rejects.toThrow(/SDK transport/);
    await expect(server.listResources()).rejects.toThrow(/SDK transport/);
  });

  it('handles tools/call and resources/read via handleRequest', async () => {
    await server.startServer();

    const callResponse = await server.handleRequest({
      id: 1,
      method: 'tools/call',
      params: { name: 'visualize-identity', arguments: { search: 'Megan' } },
    });
    expect(callResponse.id).toBe(1);
    expect(callResponse.result?.isError).toBe(false);
    expect(mockSdkCallTool).toHaveBeenCalledWith('visualize-identity', { search: 'Megan' });

    const readResponse = await server.handleRequest({
      id: 2,
      method: 'resources/read',
      params: { uri: POLYARCHY_UI_RESOURCE },
    });
    expect(readResponse.id).toBe(2);
    expect(readResponse.result?.contents).toBeDefined();
  });

  it('returns an error response for unsupported methods', async () => {
    await server.startServer();
    const response = await server.handleRequest({ id: 3, method: 'prompts/list' });
    expect(response.error).toBeDefined();
  });

  it('stops the SDK transport on stopServer', async () => {
    await server.startServer();
    await server.stopServer();
    expect(mockSdkStop).toHaveBeenCalled();
    expect(server.isReady()).toBe(false);
    expect(server.getStatus()).toEqual({ running: false, initialized: false, pid: null });
  });
});
