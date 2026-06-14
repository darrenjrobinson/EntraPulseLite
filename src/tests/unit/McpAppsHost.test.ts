// Unit tests for the MCP Apps host relay + policy gate (Phase 4).
import { McpAppsHost, HostConnection } from '../../mcp/host/McpAppsHost';
import { LokkaPolicy, DefaultPolicy, policyForServer } from '../../mcp/host/ServerPolicy';
import { LOKKA_AUTH_MUTATING_TOOLS } from '../../mcp/constants';

describe('ServerPolicy', () => {
  describe('LokkaPolicy', () => {
    const policy = new LokkaPolicy('external-lokka');

    it('allows read/display tool calls (Lokka-Microsoft, get-auth-status, lokka-list-connections)', () => {
      for (const name of ['Lokka-Microsoft', 'get-auth-status', 'lokka-list-connections', 'lokka-get-permissions']) {
        expect(policy.evaluate('tools/call', { name }).action).toBe('allow');
      }
    });

    it('allows resource reads', () => {
      expect(policy.evaluate('resources/read', { uri: 'ui://lokka/graph-explorer.html' }).action).toBe('allow');
    });

    it('denies every auth-mutating tool with a redirect hint', () => {
      for (const name of LOKKA_AUTH_MUTATING_TOOLS) {
        const d = policy.evaluate('tools/call', { name });
        expect(d.action).toBe('deny');
        expect(d.reason).toBeTruthy();
        expect(d.redirect).toContain('settings');
      }
    });

    it('denies non-relayable methods', () => {
      expect(policy.evaluate('ui/open-link', { url: 'x' }).action).toBe('deny');
    });
  });

  describe('DefaultPolicy', () => {
    const policy = new DefaultPolicy('some-server');
    it('allows relayable methods including arbitrary tools', () => {
      expect(policy.evaluate('tools/call', { name: 'anything' }).action).toBe('allow');
      expect(policy.evaluate('resources/read', { uri: 'x' }).action).toBe('allow');
    });
    it('denies non-relayable methods', () => {
      expect(policy.evaluate('foo/bar', {}).action).toBe('deny');
    });
  });

  it('policyForServer returns LokkaPolicy for external-lokka, DefaultPolicy otherwise', () => {
    expect(policyForServer('external-lokka')).toBeInstanceOf(LokkaPolicy);
    expect(policyForServer('other')).toBeInstanceOf(DefaultPolicy);
  });
});

describe('McpAppsHost', () => {
  let conn: jest.Mocked<HostConnection>;
  let host: McpAppsHost;

  beforeEach(() => {
    conn = {
      callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }], _meta: { ui: { resourceUri: 'ui://x' } } }),
      readResource: jest.fn().mockResolvedValue({ contents: [{ uri: 'ui://x', text: '<html></html>' }] }),
      listResources: jest.fn().mockResolvedValue([{ uri: 'ui://x' }]),
    } as any;
    host = new McpAppsHost({ getConnection: () => conn });
  });

  it('forwards an allowed tools/call to the connection and returns the result', async () => {
    const res = await host.handleRpc('external-lokka', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'Lokka-Microsoft', arguments: { path: '/me' } } });
    expect(conn.callTool).toHaveBeenCalledWith('Lokka-Microsoft', { path: '/me' });
    expect(res.id).toBe(1);
    expect(res.result?._meta?.ui?.resourceUri).toBe('ui://x');
    expect(res.error).toBeUndefined();
  });

  it('blocks an auth-mutating tool with a policy-denied error and does NOT call the connection', async () => {
    const res = await host.handleRpc('external-lokka', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lokka-add-sp-connection', arguments: {} } });
    expect(conn.callTool).not.toHaveBeenCalled();
    expect(res.error?.code).toBe(-32001);
    expect(res.error?.data?.redirect).toContain('settings');
  });

  it('forwards resources/read', async () => {
    const res = await host.handleRpc('external-lokka', { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'ui://x' } });
    expect(conn.readResource).toHaveBeenCalledWith('ui://x');
    expect(res.result?.contents?.[0]?.text).toBe('<html></html>');
  });

  it('rejects non-relayable methods with method-not-found', async () => {
    const res = await host.handleRpc('external-lokka', { jsonrpc: '2.0', id: 4, method: 'ui/message', params: {} });
    expect(res.error?.code).toBe(-32601);
    expect(conn.callTool).not.toHaveBeenCalled();
  });

  it('returns an internal error when the server is not running', async () => {
    const offline = new McpAppsHost({ getConnection: () => null });
    const res = await offline.handleRpc('external-lokka', { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'Lokka-Microsoft' } });
    expect(res.error?.code).toBe(-32603);
  });

  it('encodes connection errors as JSON-RPC errors instead of throwing', async () => {
    conn.callTool.mockRejectedValueOnce(new Error('boom'));
    const res = await host.handleRpc('external-lokka', { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'Lokka-Microsoft' } });
    expect(res.error?.code).toBe(-32603);
    expect(res.error?.message).toContain('boom');
  });
});
