// Unit tests for the McpAppFrame host-side postMessage bridge (Phase 3).
//
// Driven with react-dom/client + act directly (the project has react-dom but not the
// @testing-library/dom peer dep). jsdom does not execute the iframe srcdoc scripts, so we
// simulate the app's bridge messages (source === the iframe's contentWindow) and spy on
// contentWindow.postMessage to observe what the host sends back.

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { McpAppFrame } from '../../renderer/components/McpAppFrame';
import { McpUiResourceRef } from '../../types';

const HTML_DOC = '<html><head></head><body><div id="app"></div></body></html>';

const uiResource: McpUiResourceRef = {
  serverId: 'external-lokka',
  resourceUri: 'ui://lokka/graph-explorer.html',
  toolName: 'Lokka-Microsoft',
  initialData: {
    arguments: { apiType: 'graph', method: 'get', path: '/users/123/memberOf', queryParams: { $top: '5' } },
    structuredContent: { lokkaExplorer: true, value: [{ id: '1' }] },
    isError: false,
  },
};

let readResource: jest.Mock;
let rpc: jest.Mock;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  readResource = jest.fn().mockResolvedValue({
    contents: [{ uri: uiResource.resourceUri, mimeType: 'text/html;profile=mcp-app', text: HTML_DOC, _meta: { ui: { csp: { connectDomains: [] } } } }],
  });
  rpc = jest.fn();
  (window as any).electronAPI = { mcp: { ui: { readResource, rpc } } };
  (window as any).electron = { openExternal: jest.fn() };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { root?.unmount(); });
  container.remove();
  jest.restoreAllMocks();
  delete (window as any).electronAPI;
  delete (window as any).electron;
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** Render the frame and return its iframe (after the HTML has loaded) + a postMessage spy. */
async function renderFrame(props?: Partial<React.ComponentProps<typeof McpAppFrame>>) {
  await act(async () => {
    root = createRoot(container);
    root.render(<McpAppFrame uiResource={uiResource} {...props} />);
  });
  await flush();
  const iframe = container.querySelector('iframe[title^="mcp-app-"]') as HTMLIFrameElement | null;
  if (!iframe) return { iframe: null as any, spy: null as any };
  const spy = jest.spyOn(iframe.contentWindow as Window, 'postMessage');
  return { iframe, spy };
}

function messageFromIframe(iframe: HTMLIFrameElement, data: any) {
  const ev = new MessageEvent('message', { data });
  Object.defineProperty(ev, 'source', { value: iframe.contentWindow });
  window.dispatchEvent(ev);
}

const sent = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => c[0] as any);

describe('McpAppFrame bridge', () => {
  it('reads the resource HTML over IPC and renders a sandboxed iframe with CSP', async () => {
    const { iframe } = await renderFrame();
    expect(readResource).toHaveBeenCalledWith('external-lokka', 'ui://lokka/graph-explorer.html');
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe.getAttribute('srcdoc')).toContain('Content-Security-Policy');
  });

  it('answers ui/initialize then pushes tool-input (query) BEFORE tool-result (data)', async () => {
    const { iframe, spy } = await renderFrame();
    await act(async () => { messageFromIframe(iframe, { jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {} }); });

    const msgs = sent(spy);
    expect(msgs[0]).toMatchObject({ jsonrpc: '2.0', id: 1, result: { displayMode: 'inline' } });
    expect(msgs[1]).toMatchObject({
      method: 'ui/notifications/tool-input',
      params: { toolName: 'Lokka-Microsoft', arguments: { path: '/users/123/memberOf', method: 'get', apiType: 'graph' } },
    });
    expect(msgs[2]).toMatchObject({
      method: 'ui/notifications/tool-result',
      params: { structuredContent: { lokkaExplorer: true } },
    });
  });

  it('pushes initial data only once across ui/initialize + initialized', async () => {
    const { iframe, spy } = await renderFrame();
    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {} });
      messageFromIframe(iframe, { jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} });
    });
    expect(sent(spy).filter((m) => m?.method === 'ui/notifications/tool-input')).toHaveLength(1);
  });

  it('relays tools/call through the policy gate and returns the result to the iframe', async () => {
    rpc.mockResolvedValue({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'ok' }] } });
    const { iframe, spy } = await renderFrame();

    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'Lokka-Microsoft', arguments: { path: '/me' } } });
    });
    await flush();

    expect(rpc).toHaveBeenCalledWith('external-lokka', expect.objectContaining({ method: 'tools/call', id: 7, params: { name: 'Lokka-Microsoft', arguments: { path: '/me' } } }));
    const reply = sent(spy).find((m) => m?.id === 7 && m?.result);
    expect(reply).toMatchObject({ id: 7, result: { content: [{ type: 'text', text: 'ok' }] } });
  });

  it('relays a policy-denied error back to the iframe', async () => {
    rpc.mockResolvedValue({ jsonrpc: '2.0', id: 8, error: { code: -32001, message: 'blocked', data: { redirect: 'entrapulse://settings/authentication' } } });
    const { iframe, spy } = await renderFrame();

    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'lokka-add-sp-connection', arguments: {} } });
    });
    await flush();

    const reply = sent(spy).find((m) => m?.id === 8);
    expect(reply?.error?.code).toBe(-32001);
  });

  it('ignores messages whose source is not the iframe', async () => {
    const { spy } = await renderFrame();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { jsonrpc: '2.0', id: 99, method: 'ui/initialize' } }));
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('forwards ui/message text to onSendMessage and acks', async () => {
    const onSendMessage = jest.fn();
    const { iframe, spy } = await renderFrame({ onSendMessage });
    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', id: 3, method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'hello' }] } });
    });
    expect(onSendMessage).toHaveBeenCalledWith('hello');
    expect(sent(spy).find((m) => m?.id === 3)).toMatchObject({ id: 3, result: {} });
  });

  it('renders compact by default and grows on ui/notifications/size-changed', async () => {
    const { iframe } = await renderFrame();
    expect(iframe.style.height).toBe('56px'); // compact until the query is expanded

    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 820 } });
    });
    expect(iframe.style.height).toBe('820px');
  });

  it('clamps size-changed heights to the allowed range', async () => {
    const { iframe } = await renderFrame();
    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 5 } });
    });
    expect(iframe.style.height).toBe('44px'); // floored at MIN_HEIGHT
    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 99999 } });
    });
    expect(iframe.style.height).toBe('1400px'); // capped at MAX_HEIGHT
  });

  it('forwards a copied prompt (entrapulse/prompt-copied) to onFillInput without sending', async () => {
    const onFillInput = jest.fn();
    const onSendMessage = jest.fn();
    const { iframe } = await renderFrame({ onFillInput, onSendMessage });
    await act(async () => {
      messageFromIframe(iframe, { jsonrpc: '2.0', method: 'entrapulse/prompt-copied', params: { text: 'Show me all guest users' } });
    });
    expect(onFillInput).toHaveBeenCalledWith('Show me all guest users');
    expect(onSendMessage).not.toHaveBeenCalled(); // fill only, user edits/sends
  });

  it('injects the clipboard-forward shim only for the Help app', async () => {
    // Default test resource is the graph explorer -> no shim.
    const { iframe } = await renderFrame();
    expect(iframe.getAttribute('srcdoc')).not.toContain('entrapulse/prompt-copied');
  });

  it('injects the clipboard-forward shim when rendering the Help app', async () => {
    const helpResource = { ...uiResource, resourceUri: 'ui://lokka/help.html' };
    await act(async () => {
      root = createRoot(container);
      root.render(<McpAppFrame uiResource={helpResource} />);
    });
    await flush();
    const iframe = container.querySelector('iframe[title^="mcp-app-"]') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toContain('entrapulse/prompt-copied');
  });

  it('titles the Polyarchy app frame "Polyarchy"', async () => {
    const polyarchyResource = {
      ...uiResource,
      serverId: 'entrapulse-polyarchy',
      resourceUri: 'ui://entrapulse-polyarchy/mcp-app.html',
      toolName: 'visualize-identity',
    };
    readResource.mockResolvedValue({
      contents: [{ uri: polyarchyResource.resourceUri, mimeType: 'text/html;profile=mcp-app', text: HTML_DOC }],
    });
    await act(async () => {
      root = createRoot(container);
      root.render(<McpAppFrame uiResource={polyarchyResource} />);
    });
    await flush();
    expect(readResource).toHaveBeenCalledWith('entrapulse-polyarchy', polyarchyResource.resourceUri);
    expect(container.textContent).toContain('Polyarchy');
  });

  describe('Polyarchy (canvas app) sizing and display controls', () => {
    const polyarchyResource = {
      ...uiResource,
      serverId: 'entrapulse-polyarchy',
      resourceUri: 'ui://entrapulse-polyarchy/mcp-app.html',
      toolName: 'visualize-identity',
    };

    async function renderPolyarchy() {
      readResource.mockResolvedValue({
        contents: [{ uri: polyarchyResource.resourceUri, mimeType: 'text/html;profile=mcp-app', text: HTML_DOC }],
      });
      await act(async () => {
        root = createRoot(container);
        root.render(<McpAppFrame uiResource={polyarchyResource} />);
      });
      await flush();
      return container.querySelector('iframe[title^="mcp-app-"]') as HTMLIFrameElement;
    }

    it('opens at a usable default height (820px), not the compact 56px', async () => {
      const iframe = await renderPolyarchy();
      expect(iframe.style.height).toBe('820px');
    });

    it('floors size-changed reports at the default so a viewport-race cannot shrink it back', async () => {
      const iframe = await renderPolyarchy();
      await act(async () => {
        messageFromIframe(iframe, { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 56 } });
      });
      expect(iframe.style.height).toBe('820px'); // floored at DEFAULT_HEIGHTS
      await act(async () => {
        messageFromIframe(iframe, { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 1000 } });
      });
      expect(iframe.style.height).toBe('1000px'); // growth still allowed
    });

    it('answers ui/request-display-mode with an SDK-compatible `mode` key (inline)', async () => {
      const iframe = await renderPolyarchy();
      const spy = jest.spyOn(iframe.contentWindow as Window, 'postMessage');
      await act(async () => {
        messageFromIframe(iframe, { jsonrpc: '2.0', id: 9, method: 'ui/request-display-mode', params: { mode: 'fullscreen' } });
      });
      const reply = spy.mock.calls.map((c) => c[0] as any).find((m) => m?.id === 9);
      expect(reply?.result).toMatchObject({ mode: 'inline', displayMode: 'inline' });
    });

    it('toggles full screen from the header button and exits on Escape', async () => {
      const iframe = await renderPolyarchy();

      const fsButton = container.querySelector('button[aria-label="Full screen"]') as HTMLButtonElement;
      expect(fsButton).toBeTruthy();
      await act(async () => { fsButton.click(); });
      expect(iframe.style.height).toBe('100%');
      expect(container.querySelector('button[aria-label="Exit full screen"]')).toBeTruthy();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(iframe.style.height).toBe('820px');
    });

    it('grows to most of the window via the expand toggle and shrinks back', async () => {
      const iframe = await renderPolyarchy();
      const expandButton = container.querySelector('button[aria-label="Expand app"]') as HTMLButtonElement;
      expect(expandButton).toBeTruthy();

      await act(async () => { expandButton.click(); });
      const expanded = parseInt(iframe.style.height, 10);
      expect(expanded).toBeGreaterThanOrEqual(820);

      const shrinkButton = container.querySelector('button[aria-label="Shrink app"]') as HTMLButtonElement;
      await act(async () => { shrinkButton.click(); });
      expect(iframe.style.height).toBe('820px');
    });
  });

  it('shows a subtle fallback message when the resource cannot be read', async () => {
    readResource.mockResolvedValue({ error: { code: -32603, message: 'nope' } });
    await act(async () => {
      root = createRoot(container);
      root.render(<McpAppFrame uiResource={uiResource} />);
    });
    await flush();
    expect(container.textContent).toMatch(/couldn.t load/i);
  });

  it('degrades quietly when the transport cannot serve resources (no SDK tier)', async () => {
    readResource.mockResolvedValue({ error: { code: -32603, message: 'resources/read is only available via the SDK transport (tier-0).' } });
    await act(async () => {
      root = createRoot(container);
      root.render(<McpAppFrame uiResource={uiResource} />);
    });
    await flush();
    // Friendly, non-technical message; no internal transport details leaked.
    expect(container.textContent).toMatch(/sign in to enable interactive apps/i);
    expect(container.textContent).not.toMatch(/tier-0|resources\/read/i);
  });
});
