// MCP (Model Context Protocol) type definitions

export interface MCPAuthConfig {
  type: 'msal' | 'apiKey' | 'basic' | 'none';
  scopes?: string[];
  clientId?: string;
  tenantId?: string;
}

export interface MCPServerConfig {
  name: string;
  type: 'fetch' | 'external-lokka' | 'microsoft-docs' | string;
  port: number;
  enabled: boolean;
  url?: string;
  apiKey?: string;
  command?: string;
  args?: string[];
  options?: Record<string, any>;
  authConfig?: MCPAuthConfig;
  env?: {
    [key: string]: string | undefined;
  };
}

export interface MCPMessage {
  id: string;
  method: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPRequest {
  id: string;
  method: string;
  params?: any;
}

export interface MCPResponse {
  id: string;
  result?: any;
  error?: MCPError;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
  // MCP Apps: tools may reference a UI resource via _meta.ui.resourceUri (nested) or
  // the deprecated flat _meta["ui/resourceUri"]. See docs/MCP_APPS_CONTRACT.md.
  _meta?: Record<string, any>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, any>;
}

/**
 * A reference to an MCP Apps UI resource that should be mounted inline in chat.
 * Surfaced on chat-message metadata so the renderer can mount an McpAppFrame.
 */
export interface McpUiResourceRef {
  /** The MCP server that owns the resource (e.g. 'external-lokka'). */
  serverId: string;
  /** The ui:// resource URI to read and render (e.g. 'ui://lokka/graph-explorer.html'). */
  resourceUri: string;
  /** The tool whose call triggered this UI. */
  toolName: string;
  /**
   * The triggering tool call, delivered into the iframe after handshake:
   *  - `arguments` → ui/notifications/tool-input  (populates the app's query form)
   *  - result fields → ui/notifications/tool-result (renders the data)
   * See MCP_APPS_CONTRACT.md §3.
   */
  initialData?: { arguments?: any; structuredContent?: any; content?: any; isError?: boolean };
}

/**
 * Resolve the UI resource URI for a tool call result. Reads the result's _meta first
 * (open-* tools carry it directly), then falls back to a tool-definition map (e.g.
 * Lokka-Microsoft auto-opens the graph explorer, where the link is on the definition).
 */
export function resolveUiResourceUri(
  toolName: string,
  result: any,
  toolDefinitionUris: Record<string, string> = {}
): string | undefined {
  const meta = result?._meta;
  return (
    meta?.ui?.resourceUri ||
    meta?.['ui/resourceUri'] ||
    toolDefinitionUris[toolName] ||
    undefined
  );
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: {};
}

export interface MCPClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: {};
}

export interface MCPInitialize {
  protocolVersion: string;
  capabilities: MCPClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}
