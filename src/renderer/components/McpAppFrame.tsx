// McpAppFrame.tsx
//
// Phase 3 of the Lokka MCP Apps migration. Renders an interactive MCP App (Lokka's graph
// explorer / connections / permissions / help / settings / guardrails) inline in chat inside
// a sandboxed iframe, and implements the HOST side of the postMessage ⇄ JSON-RPC bridge.
//
// Protocol is pinned in docs/MCP_APPS_CONTRACT.md:
//   - iframe → host (requests):  ui/initialize, tools/call, resources/read, ui/message,
//                                ui/open-link, ui/request-display-mode, ui/download-file
//   - iframe → host (notifs):    ui/notifications/initialized, ui/notifications/size-changed
//   - host → iframe (notifs):    ui/notifications/tool-result  (delivers initial data)
//
// Security: the HTML is mounted via <iframe srcdoc> (opaque origin), sandbox="allow-scripts"
// (no allow-same-origin), and a CSP derived from the resource's _meta.ui.csp. All inbound
// messages are validated against the iframe's contentWindow.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, CircularProgress, IconButton, Tooltip } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { McpUiResourceRef } from '../../types';
import { VERSION } from '../../shared/version';

interface McpAppFrameProps {
  uiResource: McpUiResourceRef;
  /** Optional: called when the app sends a chat message via ui/message. */
  onSendMessage?: (text: string) => void;
  /** Called when the app copies a prompt to the clipboard — used to drop it into the chat input for review/edit (Help app). */
  onFillInput?: (text: string) => void;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

const APP_PROTOCOL_VERSION = '2025-06-18'; // MCP Apps iframe bridge version (Lokka 2.0)
const COLLAPSED_HEIGHT = 56; // compact default; grown by ui/notifications/size-changed
const MIN_HEIGHT = 44;
const MAX_HEIGHT = 1400;

// Canvas-style apps fill whatever viewport they're given, so their scrollHeight-based
// size reports can never grow past the iframe's own height — they need a usable default
// instead of the Lokka-style compact start. 820 matches the polyarchy's own inline
// height preference (what it reports when a host declines its fullscreen request).
const DEFAULT_HEIGHTS: Record<string, number> = {
  'ui://entrapulse-polyarchy/mcp-app.html': 820,
};

/** Build a restrictive CSP from the resource's _meta.ui.csp (defaults deny remote). */
function buildCsp(meta: any): string {
  const ui = meta?.ui ?? {};
  const connect: string[] = Array.isArray(ui?.csp?.connectDomains) ? ui.csp.connectDomains : [];
  const resourceDomains: string[] = Array.isArray(ui?.csp?.resourceDomains) ? ui.csp.resourceDomains : [];
  const connectSrc = ["'self'", ...connect].join(' ');
  const imgSrc = ["'self'", 'data:', ...resourceDomains].join(' ');
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src data:",
    `connect-src ${connectSrc}`,
    "form-action 'none'",
  ].join('; ');
}

// Some Lokka apps (the Help "welcome" app) offer sample prompts that copy to the clipboard
// instead of sending a ui/message. This injected shim wraps navigator.clipboard.writeText so
// the copied prompt is ALSO forwarded to the host, which drops it into the chat input for the
// user to review/edit before sending. Scoped to apps without result/code copy buttons (Help)
// so it doesn't hijack the chat input with unrelated copies.
const CLIPBOARD_FORWARD_SCRIPT =
  '<script>(function(){try{var c=navigator.clipboard;if(c&&c.writeText){var o=c.writeText.bind(c);' +
  'c.writeText=function(t){try{window.parent.postMessage({jsonrpc:"2.0",method:"entrapulse/prompt-copied",params:{text:String(t)}},"*");}catch(e){}return o(t);};}}catch(e){}})();</script>';

/** Inject the CSP meta (and optional extra head markup) into the resource HTML <head>. */
function withCsp(html: string, csp: string, extraHead = ''): string {
  const head = `<meta http-equiv="Content-Security-Policy" content="${csp}">${extraHead}`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  }
  return `${head}${html}`;
}

export const McpAppFrame: React.FC<McpAppFrameProps> = ({ uiResource, onSendMessage, onFillInput }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { serverId, resourceUri, toolName, initialData } = uiResource;

  // Start compact so the app's first size report reflects its (collapsed) content.
  // Lokka reports height as documentElement.scrollHeight, which is floored at the iframe's
  // own viewport height — so a large initial height can never shrink back. The app grows
  // this via ui/notifications/size-changed when the user expands the query. Canvas apps
  // (see DEFAULT_HEIGHTS) start at a usable height instead.
  const [height, setHeight] = useState<number>(DEFAULT_HEIGHTS[resourceUri] ?? COLLAPSED_HEIGHT);
  // Manual overrides from the header controls; fullscreen is also grantable by the app
  // itself via ui/request-display-mode.
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const initialPushedRef = useRef(false);

  // --- Fetch the resource HTML over IPC (resources/read) -------------------
  useEffect(() => {
    let cancelled = false;
    initialPushedRef.current = false;
    setHtml(null);
    setError(null);

    (async () => {
      try {
        const api = (window as any).electronAPI?.mcp?.ui;
        if (!api?.readResource) throw new Error('MCP Apps bridge is unavailable.');
        const res = await api.readResource(serverId, resourceUri);
        if (res?.error) throw new Error(res.error.message || 'Failed to read UI resource.');
        const contents = res?.contents?.[0];
        const rawHtml: string | undefined = contents?.text;
        if (!rawHtml) throw new Error('UI resource returned no HTML.');
        const csp = buildCsp(contents?._meta ?? res?._meta);
        // The Help app uses clipboard-copy for its sample prompts; forward those to the
        // chat input. Other apps have result/code copy buttons, so don't inject there.
        const extraHead = resourceUri === 'ui://lokka/help.html' ? CLIPBOARD_FORWARD_SCRIPT : '';
        if (!cancelled) setHtml(withCsp(rawHtml, csp, extraHead));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => { cancelled = true; };
  }, [serverId, resourceUri]);

  // --- Post a message into the iframe -------------------------------------
  const postToIframe = useCallback((msg: JsonRpcMessage) => {
    // srcdoc iframes have an opaque ('null') origin, so '*' is required here. Safe because
    // the content is local and inbound messages are validated against contentWindow.
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  // Deliver the triggering tool call into the app (MCP_APPS_CONTRACT.md §3):
  // tool-input populates the query form; tool-result renders the data.
  const pushInitialData = useCallback(() => {
    if (initialPushedRef.current) return;
    initialPushedRef.current = true;
    if (initialData?.arguments) {
      postToIframe({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-input',
        params: { toolName, arguments: initialData.arguments },
      });
    }
    postToIframe({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: {
        toolName,
        structuredContent: initialData?.structuredContent,
        content: initialData?.content,
        isError: initialData?.isError ?? false,
      },
    });
  }, [postToIframe, toolName, initialData]);

  // --- Host side of the bridge -------------------------------------------
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      // Only accept messages originating from THIS iframe's window.
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const msg = event.data as JsonRpcMessage;
      if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return;

      const isRequest = msg.id !== undefined && msg.id !== null;
      const reply = (body: Partial<JsonRpcMessage>) =>
        postToIframe({ jsonrpc: '2.0', id: msg.id, ...body });

      try {
        switch (msg.method) {
          case 'ui/initialize': {
            reply({
              result: {
                protocolVersion: APP_PROTOCOL_VERSION,
                hostInfo: { name: 'EntraPulse Lite', version: VERSION },
                displayMode: 'inline',
                availableDisplayModes: ['inline'],
                capabilities: {},
                styles: {},
              },
            });
            // App has its handlers registered after init; deliver initial data.
            pushInitialData();
            return;
          }

          case 'ui/request-display-mode': {
            // Keep app-initiated mode changes inline (the polyarchy auto-requests
            // fullscreen at startup — inside a chat that decision belongs to the user,
            // via the header's fullscreen button). `mode` is the key the ext-apps SDK
            // validates; `displayMode` kept for older bridges.
            reply({ result: { mode: 'inline', displayMode: 'inline' } });
            return;
          }

          case 'ui/message': {
            const text = (msg.params?.content ?? [])
              .filter((c: any) => c?.type === 'text')
              .map((c: any) => c.text)
              .join('\n');
            if (text && onSendMessage) onSendMessage(text);
            reply({ result: {} });
            return;
          }

          case 'ui/open-link': {
            const url = msg.params?.url;
            if (url) (window as any).electron?.openExternal?.(url);
            reply({ result: {} });
            return;
          }

          case 'tools/call':
          case 'resources/read':
          case 'resources/list': {
            // Relay through the main-process policy gate.
            const api = (window as any).electronAPI?.mcp?.ui;
            const response = await api.rpc(serverId, {
              jsonrpc: '2.0',
              id: msg.id,
              method: msg.method,
              params: msg.params,
            });
            // An IPC failure leaves `response` undefined; surface it as a JSON-RPC error rather
            // than an empty success so the app doesn't silently treat it as a valid result.
            if (!response) {
              reply({ error: { code: -32603, message: 'No response from host.' } });
              return;
            }
            if (response.error) {
              reply({ error: response.error });
              return;
            }
            reply({ result: response.result });
            return;
          }

          // Notifications from the app (no reply expected).
          case 'entrapulse/prompt-copied': {
            // Injected clipboard shim (Help app): drop the copied prompt into the chat
            // input so the user can review/edit before sending.
            const text = msg.params?.text;
            if (typeof text === 'string' && text.trim() && onFillInput) onFillInput(text);
            return;
          }
          case 'ui/notifications/initialized': {
            pushInitialData();
            return;
          }
          case 'ui/notifications/size-changed': {
            // Canvas apps fill their viewport, so their scrollHeight-based reports can
            // race back down to the current iframe height — floor them at the app's
            // default so a good height never shrinks into uselessness.
            const floor = Math.max(DEFAULT_HEIGHTS[resourceUri] ?? 0, MIN_HEIGHT);
            const h = Number(msg.params?.height);
            if (Number.isFinite(h) && h > 0) setHeight(Math.min(Math.max(h, floor), MAX_HEIGHT));
            return;
          }
          case 'ui/update-model-context':
          case 'notifications/cancelled':
            return; // accepted, no-op

          default: {
            if (isRequest) reply({ error: { code: -32601, message: `Method '${msg.method}' not supported by host.` } });
            return;
          }
        }
      } catch (e) {
        if (isRequest) reply({ error: { code: -32603, message: (e as Error).message } });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [serverId, resourceUri, postToIframe, pushInitialData, onSendMessage, onFillInput]);

  // Escape exits fullscreen (when focus is outside the iframe; the header button always works).
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  const title = useMemo(() => {
    const map: Record<string, string> = {
      'ui://lokka/graph-explorer.html': 'Graph Explorer',
      'ui://lokka/connections.html': 'Connections',
      'ui://lokka/permissions.html': 'Permissions',
      'ui://lokka/help.html': 'Help',
      'ui://lokka/settings.html': 'Lokka Settings',
      'ui://lokka/guardrails.html': 'Guardrails',
      'ui://entrapulse-polyarchy/mcp-app.html': 'Polyarchy',
    };
    return map[resourceUri] || 'Interactive App';
  }, [resourceUri]);

  if (error) {
    // The interactive app needs the SDK transport (tier-0), which requires an active
    // signed-in Lokka connection. When that's unavailable (e.g. auth not established yet,
    // or a non-SDK fallback client is active), degrade quietly — the text answer above
    // already stands on its own — rather than surfacing an internal transport error.
    const resourcesUnavailable = /resources\/read|SDK transport|MCP resources|bridge is unavailable/i.test(error);
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 0.5, fontStyle: 'italic' }}>
        {resourcesUnavailable
          ? `${title} isn’t available for this result (sign in to enable interactive apps).`
          : `${title} couldn’t load: ${error}`}
      </Typography>
    );
  }

  // Manual expand grows the frame to most of the window; fullscreen overlays it.
  const expandedHeight = Math.min(MAX_HEIGHT, Math.round((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.8));
  const inlineHeight = expanded ? Math.max(height, expandedHeight) : height;

  return (
    <>
      {fullscreen && (
        <Box
          onClick={() => setFullscreen(false)}
          sx={{ position: 'fixed', inset: 0, zIndex: (theme) => theme.zIndex.modal - 1, bgcolor: 'rgba(0,0,0,0.5)' }}
        />
      )}
      {/* Fullscreen is CSS-only on the SAME Paper/iframe nodes — reparenting the iframe
          (e.g. into a Dialog portal) would reload srcdoc and lose the app's state. */}
      <Paper
        variant="outlined"
        sx={{
          my: 1,
          overflow: 'hidden',
          borderRadius: 1,
          ...(fullscreen && {
            position: 'fixed',
            inset: 12,
            zIndex: (theme) => theme.zIndex.modal,
            m: 0,
            display: 'flex',
            flexDirection: 'column',
          }),
        }}
      >
        <Box sx={{ px: 1, py: 0.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <OpenInNewIcon sx={{ fontSize: 14 }} color="action" />
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>{title}</Typography>
          {!fullscreen && (
            <Tooltip title={expanded ? 'Shrink' : 'Expand'}>
              <IconButton size="small" aria-label={expanded ? 'Shrink app' : 'Expand app'} onClick={() => setExpanded((v) => !v)} sx={{ p: 0.25 }}>
                {expanded ? <UnfoldLessIcon sx={{ fontSize: 16 }} /> : <UnfoldMoreIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}>
            <IconButton
              size="small"
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              onClick={() => setFullscreen((v) => !v)}
              sx={{ p: 0.25 }}
            >
              {fullscreen ? <FullscreenExitIcon sx={{ fontSize: 16 }} /> : <FullscreenIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
        </Box>
        {html ? (
          <iframe
            ref={iframeRef}
            title={`mcp-app-${title}`}
            srcDoc={html}
            sandbox="allow-scripts allow-forms"
            // Lokka apps request clipboardWrite (copy buttons); grant it via Permissions Policy.
            allow="clipboard-write"
            style={{
              width: '100%',
              height: fullscreen ? '100%' : inlineHeight,
              border: 'none',
              display: 'block',
              background: '#fff',
              ...(fullscreen ? { flex: 1, minHeight: 0 } : {}),
            }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
            <CircularProgress size={20} />
          </Box>
        )}
      </Paper>
    </>
  );
};

export default McpAppFrame;
