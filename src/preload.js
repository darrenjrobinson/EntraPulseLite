// Preload script for EntraPulse Lite - Electron security bridge
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Asset handling
  getAssetPath: (assetName) => {
    return ipcRenderer.invoke('app:getAssetPath', assetName);
  },
  // Open external links
  openExternal: (url) => {
    return ipcRenderer.invoke('shell:openExternal', url);
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication methods
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getToken: () => ipcRenderer.invoke('auth:getToken'),
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
    getIdTokenClaims: () => ipcRenderer.invoke('auth:getIdTokenClaims'),
    requestPermissions: (permissions) => ipcRenderer.invoke('auth:requestPermissions', permissions),
    getTokenWithPermissions: (permissions) => ipcRenderer.invoke('auth:getTokenWithPermissions', permissions),
    getAuthenticationInfo: () => ipcRenderer.invoke('auth:getAuthenticationInfo'),
    getTokenPermissions: () => ipcRenderer.invoke('auth:getTokenPermissions'),
    getCurrentGraphPermissions: () => ipcRenderer.invoke('auth:getCurrentGraphPermissions'),
    getTenantInfo: () => ipcRenderer.invoke('auth:getTenantInfo'),
    clearTokenCache: () => ipcRenderer.invoke('auth:clearTokenCache'),
    forceReauthentication: () => ipcRenderer.invoke('auth:forceReauthentication'),
    testConfiguration: (config) => ipcRenderer.invoke('auth:testConfiguration', config),
  },

  // Microsoft Graph methods
  graph: {
    query: (endpoint, method, data) => ipcRenderer.invoke('graph:query', endpoint, method, data),
    getUserPhoto: (userId) => ipcRenderer.invoke('graph:getUserPhoto', userId),
    clearPhotoCache: () => ipcRenderer.invoke('graph:clearPhotoCache'),
    clearUserPhotoCache: (userId) => ipcRenderer.invoke('graph:clearUserPhotoCache', userId),
    getPhotoCacheStats: () => ipcRenderer.invoke('graph:getPhotoCacheStats'),
  },

  // Local LLM methods
  llm: {
    chat: (messages, sessionId) => ipcRenderer.invoke('llm:chat', messages, sessionId),
    isAvailable: () => ipcRenderer.invoke('llm:isAvailable'),
    isLocalAvailable: () => ipcRenderer.invoke('llm:isLocalAvailable'),
    testConnection: (config) => ipcRenderer.invoke('llm:testConnection', config),
    getAvailableModels: (config) => ipcRenderer.invoke('llm:getAvailableModels', config),
    testProviderConnection: (provider, config) => ipcRenderer.invoke('llm:testProviderConnection', provider, config),
    getProviderModels: (provider, config) => ipcRenderer.invoke('llm:getProviderModels', provider, config),
  },

  // MCP methods
  mcp: {
    call: (server, toolName, arguments_) => ipcRenderer.invoke('mcp:call', server, toolName, arguments_),
    listServers: () => ipcRenderer.invoke('mcp:listServers'),
    listTools: (server) => ipcRenderer.invoke('mcp:listTools', server),
    restartLokkaMCPServer: () => ipcRenderer.invoke('mcp:restartLokkaMCPServer'),
  },

  // Configuration methods
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (config) => ipcRenderer.invoke('config:update', config),
    getLLMConfig: () => ipcRenderer.invoke('config:getLLMConfig'),
    saveLLMConfig: (config) => ipcRenderer.invoke('config:saveLLMConfig', config),
    clearModelCache: (provider) => ipcRenderer.invoke('config:clearModelCache', provider),
    getCachedModels: (provider) => ipcRenderer.invoke('config:getCachedModels', provider),
    saveCloudProviderConfig: (provider, config) => ipcRenderer.invoke('config:saveCloudProviderConfig', provider, config),
    getCloudProviderConfig: (provider) => ipcRenderer.invoke('config:getCloudProviderConfig', provider),
    getConfiguredCloudProviders: () => ipcRenderer.invoke('config:getConfiguredCloudProviders'),
    setDefaultCloudProvider: (provider) => ipcRenderer.invoke('config:setDefaultCloudProvider', provider),
    getDefaultCloudProvider: () => ipcRenderer.invoke('config:getDefaultCloudProvider'),
    removeCloudProviderConfig: (provider) => ipcRenderer.invoke('config:removeCloudProviderConfig', provider),
    getEntraConfig: () => ipcRenderer.invoke('config:getEntraConfig'),
    saveEntraConfig: (config) => ipcRenderer.invoke('config:saveEntraConfig', config),
    clearEntraConfig: () => ipcRenderer.invoke('config:clearEntraConfig'),
    getTenantProfiles: () => ipcRenderer.invoke('config:getTenantProfiles'),
    getActiveTenantProfile: () => ipcRenderer.invoke('config:getActiveTenantProfile'),
    saveTenantProfile: (profile) => ipcRenderer.invoke('config:saveTenantProfile', profile),
    deleteTenantProfile: (id) => ipcRenderer.invoke('config:deleteTenantProfile', id),
    setActiveTenantProfile: (id) => ipcRenderer.invoke('config:setActiveTenantProfile', id),
    getMCPConfig: () => ipcRenderer.invoke('config:getMCPConfig'),
    saveMCPConfig: (config) => ipcRenderer.invoke('config:saveMCPConfig', config),
  },

  // App methods
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },

  // Auto-updater methods
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('updater:installUpdate'),
    getCurrentVersion: () => ipcRenderer.invoke('updater:getCurrentVersion'),
    isUpdatePending: () => ipcRenderer.invoke('updater:isUpdatePending'),
    setAutoUpdateEnabled: (enabled) => ipcRenderer.invoke('updater:setAutoUpdateEnabled', enabled),
    getAutoUpdateEnabled: () => ipcRenderer.invoke('updater:getAutoUpdateEnabled'),
  },

  // Send events to main process for broadcasting
  send: (channel, data) => {
    const validChannels = ['auth:logoutBroadcast'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`Invalid send channel: ${channel}`);
    }
  },

  // Event listeners for real-time updates with better memory management
  on: (channel, callback) => {
    const validChannels = [
      'auth-status-changed', 
      'chat-message', 
      'graph-api-call', 
      'config:defaultCloudProviderChanged', 
      'auth:configurationAvailable', 
      'auth:enhancedGraphAccessChanged',
      'profiles:activeChanged',
      'auth:logout',
      'llm:forceStatusRefresh',
      'update:checking-for-update',
      'update:available',
      'update:not-available',
      'update:error',
      'update:download-progress',
      'update:downloaded',
      'main-debug' // Debug messages from main process
    ];
    if (validChannels.includes(channel)) {
      // Get current listener count BEFORE adding
      const beforeCount = ipcRenderer.listenerCount(channel);
      
      // Remove any existing listeners for this callback to prevent duplicates
      ipcRenderer.removeListener(channel, callback);
      
      // If we have too many listeners, do aggressive cleanup
      if (beforeCount > 25) {
        console.warn(`Too many listeners for ${channel} (${beforeCount}). Performing aggressive cleanup...`);
        // Remove all listeners and let components re-add as needed
        ipcRenderer.removeAllListeners(channel);
      }
      
      // Add the new listener
      ipcRenderer.on(channel, callback);
      
      const afterCount = ipcRenderer.listenerCount(channel);
      const currentMaxListeners = ipcRenderer.getMaxListeners();
      
      // Dynamically adjust max listeners based on current count
      if (afterCount >= currentMaxListeners - 2) {
        const newMaxListeners = Math.min(currentMaxListeners + 5, 50); // Cap at 50 listeners
        ipcRenderer.setMaxListeners(newMaxListeners);
        console.log(`Increased max listeners for channel ${channel} to ${newMaxListeners}. Current: ${afterCount}`);
      }
      
      console.log(`Added listener for ${channel}. Before: ${beforeCount}, After: ${afterCount}`);
    }
  },

  // Remove specific event listener
  removeListener: (channel, callback) => {
    const validChannels = [
      'auth-status-changed', 
      'chat-message', 
      'graph-api-call', 
      'config:defaultCloudProviderChanged', 
      'auth:configurationAvailable', 
      'auth:enhancedGraphAccessChanged',
      'profiles:activeChanged',
      'llm:forceStatusRefresh',
      'update:checking-for-update',
      'update:available',
      'update:not-available',
      'update:error',
      'update:download-progress',
      'update:downloaded',
      'main-debug' // Debug messages from main process
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },

  // Remove event listeners
  removeAllListeners: (channel) => {
    const validChannels = [
      'auth-status-changed', 
      'chat-message', 
      'graph-api-call', 
      'config:defaultCloudProviderChanged', 
      'auth:configurationAvailable', 
      'auth:enhancedGraphAccessChanged',
      'profiles:activeChanged',
      'llm:forceStatusRefresh',
      'update:checking-for-update',
      'update:available',
      'update:not-available',
      'update:error',
      'update:download-progress',
      'update:downloaded',
      'main-debug' // Debug messages from main process
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },

  // Diagnostic method to check listener counts
  getListenerDiagnostics: () => {
    const validChannels = [
      'auth-status-changed', 
      'chat-message', 
      'graph-api-call', 
      'config:defaultCloudProviderChanged', 
      'auth:configurationAvailable', 
      'auth:enhancedGraphAccessChanged',
      'profiles:activeChanged',
      'llm:forceStatusRefresh',
      'update:checking-for-update',
      'update:available',
      'update:not-available',
      'update:error',
      'update:download-progress',
      'update:downloaded',
      'main-debug' // Debug messages from main process
    ];
    const diagnostics = {};
    
    validChannels.forEach(channel => {
      diagnostics[channel] = {
        count: ipcRenderer.listenerCount(channel),
        maxListeners: ipcRenderer.getMaxListeners()
      };
    });
    
    return diagnostics;
  },

  // Force cleanup of listeners (aggressive cleanup)
  forceCleanupListeners: (channel) => {
    const validChannels = [
      'auth-status-changed', 
      'chat-message', 
      'graph-api-call', 
      'config:defaultCloudProviderChanged', 
      'auth:configurationAvailable', 
      'auth:enhancedGraphAccessChanged',
      'profiles:activeChanged',
      'auth:logout',
      'llm:forceStatusRefresh',
      'main-debug' // Debug messages from main process
    ];
    if (validChannels.includes(channel)) {
      const beforeCount = ipcRenderer.listenerCount(channel);
      ipcRenderer.removeAllListeners(channel);
      const afterCount = ipcRenderer.listenerCount(channel);
      console.log(`Force cleaned ${channel}: ${beforeCount} -> ${afterCount} listeners`);
      return { before: beforeCount, after: afterCount };
    }
    return null;
  },
});
