/**
 * Type definitions for static assets
 */

// React JSX namespace for react-markdown compatibility
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tagName: string]: any;
    }
  }
}

// Image file declarations
declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.ico' {
  const content: string;
  export default content;
}

// Global electron window interface
interface Window {
  electron: {
    getAssetPath: (assetName: string) => string;
    openExternal: (url: string) => Promise<boolean>;
  };
  electronAPI: {
    auth: {
      login: (useSystemBrowser?: boolean) => Promise<any>;
      logout: () => Promise<void>;
      getToken: () => Promise<any>;
      getCurrentUser: () => Promise<any>;      requestPermissions: (permissions: string[]) => Promise<any>;
      getTokenWithPermissions: (permissions: string[]) => Promise<any>;
      clearTokenCache: () => Promise<{ success: boolean }>;
      forceReauthentication: () => Promise<any>;
      getAuthenticationInfo: () => Promise<{
        mode: 'client-credentials' | 'interactive';
        permissions: string[];
        actualPermissions?: string[];
        isAuthenticated: boolean;
        clientId: string;
        tenantId: string;
      }>;
    };    graph: {
      query: (endpoint: string, method?: string, data?: any) => Promise<any>;
      getUserPhoto: (userId?: string) => Promise<any>;
      clearPhotoCache: () => Promise<{ success: boolean; error?: string }>;
      clearUserPhotoCache: (userId: string) => Promise<{ success: boolean; error?: string }>;
      getPhotoCacheStats: () => Promise<{ size: number; maxSize: number; entries: Array<{ userId: string; hasPhoto: boolean; age: number }> } | null>;
    };
    llm: {
      chat: (messages: any[], sessionId?: string) => Promise<any>;
      isAvailable: () => Promise<boolean>;
      testConnection: (config: any) => Promise<any>;
      getAvailableModels: (config: any) => Promise<string[]>;
      testProviderConnection: (provider: string, config: any) => Promise<any>;
      getProviderModels: (provider: string, config: any) => Promise<string[]>;
    };
    mcp: {
      call: (server: string, toolName: string, arguments_: any) => Promise<any>;
      listServers: () => Promise<string[]>;
      listTools: (server: string) => Promise<any[]>;
    };
    config: {
      get: () => Promise<any>;
      update: (config: any) => Promise<any>;
      getLLMConfig: () => Promise<any>;
      saveLLMConfig: (config: any) => Promise<any>;
      clearModelCache: (provider?: string) => Promise<{ success: boolean }>;
      getCachedModels: (provider: string) => Promise<string[]>;
    };
    debug: {
      checkMCPServerHealth: () => Promise<any>;
      debugMCP: () => Promise<any>;
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
    on: (channel: string, callback: (...args: any[]) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
}
