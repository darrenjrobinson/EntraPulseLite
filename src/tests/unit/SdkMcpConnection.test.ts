// Unit tests for SdkMcpConnection (Phase 1 of the Lokka MCP Apps migration).
// The official SDK Client + StdioClientTransport are mocked so these tests exercise
// the connection's lifecycle, delegation, and _meta passthrough without spawning npx.

// --- SDK mocks -------------------------------------------------------------
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockPing = jest.fn().mockResolvedValue({});
const mockListTools = jest.fn();
const mockCallTool = jest.fn();
const mockListResources = jest.fn();
const mockReadResource = jest.fn();
const mockGetServerCapabilities = jest.fn().mockReturnValue({ tools: {}, resources: {} });

const ClientCtor = jest.fn().mockImplementation((clientInfo: any, options: any) => ({
  clientInfo,
  options,
  connect: mockConnect,
  close: mockClose,
  ping: mockPing,
  listTools: mockListTools,
  callTool: mockCallTool,
  listResources: mockListResources,
  readResource: mockReadResource,
  getServerCapabilities: mockGetServerCapabilities,
}));

const TransportCtor = jest.fn().mockImplementation((params: any) => ({
  params,
  pid: 4321,
  stderr: null,
  onclose: undefined,
  onerror: undefined,
}));

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: ClientCtor }));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: TransportCtor }));

import { SdkMcpConnection } from '../../mcp/clients/SdkMcpConnection';

const baseOpts = {
  command: 'npx',
  args: ['-y', '@merill/lokka@2.0.0'],
  env: { TENANT_ID: 't', CLIENT_ID: 'c', USE_CLIENT_TOKEN: 'true', ACCESS_TOKEN: 'tok' },
  clientInfo: { name: 'EntraPulseLite', version: '1.3.0' },
  capabilities: {},
  // silence logs in tests
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
};

describe('SdkMcpConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerCapabilities.mockReturnValue({ tools: {}, resources: {} });
  });

  it('connects and reports initialized state, passing clientInfo + capabilities + env', async () => {
    const conn = new SdkMcpConnection(baseOpts as any);
    expect(conn.isInitialized()).toBe(false);

    await conn.start();

    expect(TransportCtor).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'npx', args: baseOpts.args, env: baseOpts.env, stderr: 'pipe' })
    );
    expect(ClientCtor).toHaveBeenCalledWith(
      { name: 'EntraPulseLite', version: '1.3.0' },
      { capabilities: {} }
    );
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(conn.isInitialized()).toBe(true);
    expect(conn.isAlive()).toBe(true);
    expect(conn.pid).toBe(4321);
    expect(conn.getServerCapabilities()).toEqual({ tools: {}, resources: {} });
  });

  it('serializes concurrent start() calls into a single connect', async () => {
    const conn = new SdkMcpConnection(baseOpts as any);
    await Promise.all([conn.start(), conn.start(), conn.start()]);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('start() is a no-op once connected', async () => {
    const conn = new SdkMcpConnection(baseOpts as any);
    await conn.start();
    await conn.start();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('listTools returns raw tools with _meta (ui/resourceUri) preserved', async () => {
    mockListTools.mockResolvedValue({
      tools: [
        {
          name: 'Lokka-Microsoft',
          description: 'graph',
          inputSchema: { type: 'object' },
          _meta: { ui: { resourceUri: 'ui://lokka/graph-explorer.html' }, 'ui/resourceUri': 'ui://lokka/graph-explorer.html' },
        },
      ],
    });
    const conn = new SdkMcpConnection(baseOpts as any);
    await conn.start();
    const tools = await conn.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]._meta?.ui?.resourceUri).toBe('ui://lokka/graph-explorer.html');
  });

  it('callTool passes through structuredContent, isError and _meta verbatim', async () => {
    const result = {
      content: [{ type: 'text', text: '{}' }],
      structuredContent: { lokkaExplorer: true, value: [1, 2] },
      isError: false,
      _meta: { ui: { resourceUri: 'ui://lokka/graph-explorer.html' } },
    };
    mockCallTool.mockResolvedValue(result);
    const conn = new SdkMcpConnection(baseOpts as any);
    await conn.start();
    const out = await conn.callTool('Lokka-Microsoft', { apiType: 'graph', path: '/me', method: 'get' });
    expect(mockCallTool).toHaveBeenCalledWith({ name: 'Lokka-Microsoft', arguments: { apiType: 'graph', path: '/me', method: 'get' } });
    expect(out).toEqual(result);
    expect(out.structuredContent.lokkaExplorer).toBe(true);
    expect(out._meta?.ui?.resourceUri).toBe('ui://lokka/graph-explorer.html');
  });

  it('listResources and readResource delegate to the SDK client', async () => {
    mockListResources.mockResolvedValue({
      resources: [{ uri: 'ui://lokka/graph-explorer.html', mimeType: 'text/html;profile=mcp-app' }],
    });
    mockReadResource.mockResolvedValue({
      contents: [{ uri: 'ui://lokka/graph-explorer.html', mimeType: 'text/html;profile=mcp-app', text: '<html></html>' }],
    });
    const conn = new SdkMcpConnection(baseOpts as any);
    await conn.start();

    const resources = await conn.listResources();
    expect(resources[0].uri).toBe('ui://lokka/graph-explorer.html');
    expect(resources[0].mimeType).toBe('text/html;profile=mcp-app');

    const contents = await conn.readResource('ui://lokka/graph-explorer.html');
    expect(mockReadResource).toHaveBeenCalledWith({ uri: 'ui://lokka/graph-explorer.html' });
    expect(contents.contents[0].text).toBe('<html></html>');
  });

  it('throws if a call is made before start()', async () => {
    const conn = new SdkMcpConnection(baseOpts as any);
    await expect(conn.listTools()).rejects.toThrow('not connected');
  });

  it('stop() closes the client and resets state', async () => {
    const conn = new SdkMcpConnection(baseOpts as any);
    await conn.start();
    await conn.stop();
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(conn.isInitialized()).toBe(false);
    expect(conn.isAlive()).toBe(false);
    expect(conn.getServerCapabilities()).toBeUndefined();
  });

  it('ping returns true on success and false on failure', async () => {
    const conn = new SdkMcpConnection(baseOpts as any);
    await conn.start();
    expect(await conn.ping()).toBe(true);
    mockPing.mockRejectedValueOnce(new Error('dead'));
    expect(await conn.ping()).toBe(false);
  });

  it('getStatus reflects lifecycle', async () => {
    const conn = new SdkMcpConnection(baseOpts as any);
    expect(conn.getStatus()).toEqual({ running: false, initialized: false, pid: null });
    await conn.start();
    expect(conn.getStatus()).toEqual({ running: true, initialized: true, pid: 4321 });
  });
});
