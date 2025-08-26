// Global type definitions for EntraPulse Lite

export type LogLevel = 'Error' | 'Warning' | 'Info' | 'Verbose';

export interface User {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  department?: string;
  photoUrl?: string;
  tenantDisplayName?: string;
}

export interface AuthToken {
  accessToken: string;
  idToken: string;
  expiresOn: Date;
  scopes: string[];
  clientId?: string;
  tenantId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    graphApiCalls?: GraphApiCall[];
    llmProvider?: string;
    model?: string;
    queryAnalysis?: QueryAnalysis;
    mcpResults?: {
      fetchResult?: any;
      lokkaResult?: any;
    };
    traceData?: {
      steps: string[];
      timing: Record<string, number>;
      errors?: string[];
    };
    isError?: boolean; // Flag to identify error messages for special styling
  };
}

export interface GraphApiCall {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  timestamp: Date;
  duration: number;
  status: number;
  response?: any;
  error?: string;
}

export interface CloudLLMProviderConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
  model: string;
  apiKey: string;
  organization?: string; // For OpenAI
  baseUrl?: string; // For Azure OpenAI endpoint
  temperature?: number;
  maxTokens?: number;
}

export interface EntraConfig {
  clientId: string;
  tenantId: string;
  useGraphPowerShell?: boolean; // Toggle for Microsoft Graph PowerShell client ID
  useSystemBrowser?: boolean; // Toggle for system browser authentication instead of embedded browser
}

export interface LLMConfig {
  provider: 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
  baseUrl?: string; // Not required for cloud providers
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string; // For cloud providers
  organization?: string; // For OpenAI
  preferLocal?: boolean; // Whether to prefer local over cloud when both are available
  // New fields for multiple cloud provider support
  cloudProviders?: {
    [K in 'openai' | 'anthropic' | 'gemini' | 'azure-openai']?: CloudLLMProviderConfig;
  };
  defaultCloudProvider?: 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
}

export interface MCPAuthConfig {
  type: 'msal' | 'apiKey' | 'basic' | 'none';
  scopes?: string[];
  clientId?: string;
  tenantId?: string;
}

// Add new interface for storing MCP configuration
export interface MCPConfig {
  lokka?: {
    enabled: boolean;
    authMode: 'client-credentials' | 'enhanced-graph-access' | 'delegated';
    clientId?: string; // Used for 'client-credentials' and 'delegated' modes
    tenantId?: string; // Used for 'client-credentials' and 'delegated' modes  
    clientSecret?: string; // Only used for 'client-credentials' mode
    useGraphPowerShell?: boolean; // Controls 'enhanced-graph-access' mode
    accessToken?: string; // Runtime token for 'enhanced-graph-access' and 'delegated' modes
  };
  fetch?: {
    enabled: boolean;
  };
  microsoftDocs?: {
    enabled: boolean;
  };
}

export interface MCPServerConfig {
  name: string;
  type: 'fetch' | 'external-lokka' | 'microsoft-docs';
  port: number;
  enabled: boolean;
  url?: string;
  apiKey?: string;
  command?: string; // For external MCP servers
  args?: string[]; // For external MCP servers
  options?: Record<string, any>;
  authConfig?: MCPAuthConfig;
  env?: {
    [key: string]: string | undefined;
  };
}

export interface AppConfig {
  app?: {
    name: string;
  };
  auth: {
    clientId: string;
    tenantId: string;
    scopes: string[];
    clientSecret?: string;
    useClientCredentials?: boolean;
  };
  llm: LLMConfig;
  mcpServers: MCPServerConfig[];
  features: {
    enablePremiumFeatures: boolean;
    enableTelemetry: boolean;
  };
}

export interface ElectronAPI {
  auth: {
    login: (useSystemBrowser?: boolean) => Promise<AuthToken>;
    logout: () => Promise<void>;
    getToken: () => Promise<AuthToken | null>;
    getCurrentUser: () => Promise<User | null>;
    requestPermissions: (permissions: string[]) => Promise<AuthToken | null>;
    getTokenWithPermissions: (permissions: string[]) => Promise<AuthToken | null>;
    testConfiguration: (config: EntraConfig) => Promise<{ success: boolean; error?: string; details?: any }>;
  };  graph: {
    query: (endpoint: string, method?: string, data?: any) => Promise<any>;
    getUserPhoto: (userId?: string) => Promise<string | null>;
    clearPhotoCache: () => Promise<{ success: boolean; error?: string }>;
    clearUserPhotoCache: (userId: string) => Promise<{ success: boolean; error?: string }>;
    getPhotoCacheStats: () => Promise<{ size: number; maxSize: number; entries: Array<{ userId: string; hasPhoto: boolean; age: number }> } | null>;
  };  llm: {
    chat: (messages: ChatMessage[], sessionId?: string) => Promise<string>;
    isAvailable: () => Promise<boolean>;
    testConnection: (config: LLMConfig) => Promise<boolean>;
    getAvailableModels: (config: LLMConfig) => Promise<string[]>;
    testProviderConnection: (provider: string, config: any) => Promise<any>;
    getProviderModels: (provider: string, config: any) => Promise<string[]>;
  };mcp: {
    call: (server: string, toolName: string, arguments_: any) => Promise<any>;
    listServers: () => Promise<MCPServerConfig[]>;
    restartLokkaMCPServer: () => Promise<void>;
  };  config: {
    get: () => Promise<AppConfig>;
    update: (config: Partial<AppConfig>) => Promise<void>;
    getLLMConfig: () => Promise<LLMConfig>;
    saveLLMConfig: (config: LLMConfig) => Promise<void>;
    saveCloudProviderConfig: (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai', config: CloudLLMProviderConfig) => Promise<void>;
    getCloudProviderConfig: (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => Promise<CloudLLMProviderConfig | null>;
    getConfiguredCloudProviders: () => Promise<Array<{ provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'; config: CloudLLMProviderConfig }>>;
    setDefaultCloudProvider: (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => Promise<void>;
    getDefaultCloudProvider: () => Promise<{ provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'; config: CloudLLMProviderConfig } | null>;
    removeCloudProviderConfig: (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => Promise<void>;
    getEntraConfig: () => Promise<EntraConfig | null>;
    saveEntraConfig: (config: EntraConfig) => Promise<void>;
    clearEntraConfig: () => Promise<void>;
    // MCP Configuration methods
    getMCPConfig: () => Promise<MCPConfig>;
    saveMCPConfig: (config: MCPConfig) => Promise<void>;
    updateLokkaMCPConfig: (config: Partial<MCPConfig['lokka']>) => Promise<void>;
    isLokkaMCPConfigured: () => Promise<boolean>;
  };
  app: {
    getVersion: () => Promise<string>;
  };
  updater: {
    checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
    downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
    installUpdate: () => Promise<{ success: boolean; error?: string }>;
    getCurrentVersion: () => Promise<string>;
    isUpdatePending: () => Promise<boolean>;
    setAutoUpdateEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
    getAutoUpdateEnabled: () => Promise<boolean>;
  };
}

export interface QueryAnalysis {
  needsFetchMcp: boolean;
  needsLokkaMcp: boolean;
  graphEndpoint?: string;
  graphMethod?: string;
  graphParams?: any;
  documentationQuery?: string;
  permissionQuery?: string;
  confidence: number;
  reasoning: string;
}

export interface EnhancedLLMResponse {
  analysis: QueryAnalysis;
  mcpResults: {
    fetchResult?: any;
    lokkaResult?: any;
  };
  finalResponse: string;
  traceData: {
    steps: string[];
    timing: Record<string, number>;
    errors?: string[];
  };
}

export interface AuthenticationContext {
  mode: 'interactive';
}

// Window interface is defined in assets.d.ts to avoid conflicts
