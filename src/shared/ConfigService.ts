// ConfigService.ts
// Secure configuration management service with user-context awareness

import Store from 'electron-store';
import { LLMConfig, CloudLLMProviderConfig, EntraConfig, MCPConfig } from '../types';

interface UserConfigSchema {
  llm: LLMConfig;
  lastUsedProvider: string;
  entraConfig?: EntraConfig;
  mcpConfig?: MCPConfig; // Add MCP configuration storage
  modelCache: {
    [provider: string]: {
      models: string[];
      lastFetched: string;
      cacheExpiry: number; // 24 hours in milliseconds
    };
  };
}

interface AppConfigSchema {
  // Global application settings (admin/client-credentials mode)
  application: UserConfigSchema;
  
  // User-specific configurations (interactive mode)
  users: {
    [userKey: string]: UserConfigSchema;
  };
  
  // Metadata
  currentAuthMode: 'client-credentials' | 'interactive';
  currentUserKey?: string;
}

export class ConfigService {
  private store: any; // Use any to avoid type conflicts with electron-store
  private currentAuthMode: 'client-credentials' | 'interactive' = 'client-credentials';
  private currentUserKey?: string;
  private isAuthenticationVerified: boolean = false; // Security flag to prevent data exposure
  private isServiceLevelAccess: boolean = false; // Flag for trusted main process access

  constructor() {
    this.store = new Store({
      name: 'entrapulse-lite-config',
      encryptionKey: 'entrapulse-lite-secret-key-2025', // In production, this should be generated or from env
      defaults: {        application: {
          llm: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            apiKey: '',
            baseUrl: '',
            temperature: 0.2,
            maxTokens: 4096,
            organization: ''
          },
          lastUsedProvider: 'anthropic',
          modelCache: {}
        },
        users: {},
        currentAuthMode: 'client-credentials'
      }
    });

    // Load current context from store
    this.currentAuthMode = this.store.get('currentAuthMode');
    this.currentUserKey = this.store.get('currentUserKey');
  }  /**
   * Set service-level access for the main process (trusted environment)
   * @param hasAccess True if this is the main process or other trusted context
   */
  setServiceLevelAccess(hasAccess: boolean): void {
    this.isServiceLevelAccess = hasAccess;
    console.log(`[ConfigService] Service level access set to: ${hasAccess}`);
  }

  /**
   * Verify that authentication has occurred before exposing sensitive data
   * @param isAuthenticated True if user is authenticated
   */
  setAuthenticationVerified(isAuthenticated: boolean): void {
    this.isAuthenticationVerified = isAuthenticated;
    console.log(`[ConfigService] Authentication verified set to: ${isAuthenticated}`);
  }

  /**
   * Set the authentication context
   * @param mode Authentication mode (client-credentials for admin, interactive for users)
   * @param userInfo User information for interactive mode
   */
  setAuthenticationContext(mode: 'client-credentials' | 'interactive', userInfo?: { id: string, email?: string }) {
    console.log(`[ConfigService] setAuthenticationContext called - Mode: ${mode}, UserInfo:`, userInfo ? 'Yes' : 'No');
    console.log(`[ConfigService] Previous context - Mode: ${this.currentAuthMode}, UserKey: ${this.currentUserKey}`);
    
    // Only allow setting authentication context if authentication is verified or service-level access
    if (!this.isAuthenticationVerified && !this.isServiceLevelAccess) {
      console.log(`[ConfigService] 🔒 Authentication context change blocked - authentication not verified and not service-level access`);
      return;
    }this.currentAuthMode = mode;
    this.store.set('currentAuthMode', mode);

    if (mode === 'interactive' && userInfo) {
      // Create a unique key for this user (using their ID)
      this.currentUserKey = `user_${userInfo.id}`;
      this.store.set('currentUserKey', this.currentUserKey);

      // Initialize user config if it doesn't exist
      const users = this.store.get('users');
      if (!users[this.currentUserKey]) {
        console.log(`[ConfigService] Creating new user config for ${this.currentUserKey}`);
        users[this.currentUserKey] = {          llm: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            apiKey: '',
            baseUrl: '',
            temperature: 0.2,
            maxTokens: 4096,
            organization: ''
          },
          lastUsedProvider: 'anthropic',
          modelCache: {}
        };
        this.store.set('users', users);
      }
    } else if (mode === 'client-credentials') {
      this.currentUserKey = undefined;
      this.store.delete('currentUserKey');
    }
    
    console.log(`[ConfigService] New context - Mode: ${this.currentAuthMode}, UserKey: ${this.currentUserKey}`);
  }  /**
   * Get the current user configuration context
   */
  private getCurrentContext(): UserConfigSchema {
    try {      console.log(`[ConfigService] getCurrentContext - Mode: ${this.currentAuthMode}, UserKey: ${this.currentUserKey}`);
      
      // Security check: If authentication is not verified AND this is not service-level access, return safe defaults
      if (!this.isAuthenticationVerified && !this.isServiceLevelAccess) {
        console.log(`[ConfigService] 🔒 Authentication not verified and no service access - returning safe defaults`);
        return this.getDefaultUserConfig();
      }
      
      if (this.currentAuthMode === 'client-credentials') {
        const config = this.store.get('application');
        console.log(`[ConfigService] Using application config - Has cloudProviders:`, !!config?.llm?.cloudProviders);
        return config || this.getDefaultUserConfig();
      } else if (this.currentAuthMode === 'interactive' && this.currentUserKey) {
        const users = this.store.get('users');
        if (users && users[this.currentUserKey]) {
          console.log(`[ConfigService] Using user config for ${this.currentUserKey} - Has cloudProviders:`, !!users[this.currentUserKey]?.llm?.cloudProviders);
          return users[this.currentUserKey];
        }
        // Fallback to application config
        const appConfig = this.store.get('application');
        console.log(`[ConfigService] Fallback to application config - Has cloudProviders:`, !!appConfig?.llm?.cloudProviders);
        return appConfig || this.getDefaultUserConfig();
      }
      // Default fallback
      const config = this.store.get('application');
      console.log(`[ConfigService] Default fallback to application config - Has cloudProviders:`, !!config?.llm?.cloudProviders);
      return config || this.getDefaultUserConfig();
    } catch (error) {
      // If store access fails, return default configuration
      console.warn('Store access error, falling back to defaults:', error);
      return this.getDefaultUserConfig();
    }
  }
  /**
   * Get default user configuration - safe defaults with no sensitive data
   */
  private getDefaultUserConfig(): UserConfigSchema {
    return {
      llm: {
        provider: 'anthropic' as const,
        model: 'claude-3-5-sonnet-20241022',
        apiKey: '', // Always empty for security
        baseUrl: '',
        temperature: 0.2,
        maxTokens: 4096,
        organization: '',
        preferLocal: true, // Prefer local for security
        // No cloudProviders - prevents exposure of sensitive data
      },
      lastUsedProvider: 'anthropic',
      modelCache: {}
    };
  }
  /**
   * Save the current user configuration context
   */
  private saveCurrentContext(config: UserConfigSchema): void {
    try {
      console.log(`[ConfigService] saveCurrentContext - Mode: ${this.currentAuthMode}, UserKey: ${this.currentUserKey}`);
      
      if (this.currentAuthMode === 'client-credentials') {
        console.log('[ConfigService] Saving to application config (client-credentials mode)');
        this.store.set('application', config);
      } else if (this.currentAuthMode === 'interactive' && this.currentUserKey) {
        console.log(`[ConfigService] Saving to user config for ${this.currentUserKey}`);
        const users = this.store.get('users') || {};
        users[this.currentUserKey] = config;
        this.store.set('users', users);
      } else {
        // Fallback to application config when user context is not available
        console.log('[ConfigService] Fallback: Saving to application config (no user context)');
        this.store.set('application', config);
        
        // For Enhanced Graph Access settings, also ensure they're preserved in application config
        if (config.entraConfig?.useGraphPowerShell !== undefined) {
          console.log('[ConfigService] Preserving Enhanced Graph Access setting in application config:', config.entraConfig.useGraphPowerShell);
        }
      }
    } catch (error) {
      console.warn('Error saving configuration:', error);
      // In a real application, you might want to throw this error or handle it differently
      // For now, we'll just log it to maintain the expected behavior
    }
  }  /**
   * Get the current LLM configuration (context-aware)
   */  getLLMConfig(): LLMConfig {
    try {
      const context = this.getCurrentContext();
      const config = context?.llm || this.getDefaultUserConfig().llm;
      
      console.log('[ConfigService] getLLMConfig - Retrieved config:', {
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        preferLocal: config.preferLocal,
        hasCloudProviders: !!config.cloudProviders
      });
      
      // Add debugging for Azure OpenAI specifically
      if (config.cloudProviders?.['azure-openai']) {
        console.log(`[ConfigService] getLLMConfig - Azure OpenAI found:`, {
          hasApiKey: !!config.cloudProviders['azure-openai'].apiKey,
          model: config.cloudProviders['azure-openai'].model,
          baseUrl: config.cloudProviders['azure-openai'].baseUrl
        });
      } else {
        console.log(`[ConfigService] getLLMConfig - No Azure OpenAI config found`);
      }
      
      return config;
    } catch (error) {
      console.warn('Error getting LLM config, falling back to defaults:', error);
      return this.getDefaultUserConfig().llm;
    }
  }
  /**
   * Save LLM configuration securely (context-aware)
   */  saveLLMConfig(config: LLMConfig): void {
    console.log('[ConfigService] saveLLMConfig - Input config:', {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      preferLocal: config.preferLocal,
      hasCloudProviders: !!config.cloudProviders,
      cloudProviderKeys: config.cloudProviders ? Object.keys(config.cloudProviders) : 'none',
      inputDefaultProvider: config.defaultCloudProvider
    });
    
    const currentContext = this.getCurrentContext();
    
    // Preserve existing cloud providers when saving LLM config
    const existingLlmConfig = currentContext.llm || {};
    const preservedCloudProviders = existingLlmConfig.cloudProviders;
    const preservedDefaultCloudProvider = existingLlmConfig.defaultCloudProvider;
    
    console.log('[ConfigService] saveLLMConfig - Existing config:', {
      existingModel: existingLlmConfig.model,
      existingTemperature: existingLlmConfig.temperature,
      existingMaxTokens: existingLlmConfig.maxTokens,
      existingPreferLocal: existingLlmConfig.preferLocal,
      hasExistingCloudProviders: !!preservedCloudProviders,
      existingProviderKeys: preservedCloudProviders ? Object.keys(preservedCloudProviders) : 'none',
      existingDefaultProvider: preservedDefaultCloudProvider
    });    // Merge cloud providers: prioritize incoming config over existing config
    let finalCloudProviders: LLMConfig['cloudProviders'] = {};
    
    if (config.cloudProviders && Object.keys(config.cloudProviders).length > 0) {
      // If incoming config has cloud providers, use them (preserving existing ones that aren't overwritten)
      
      // First add preserved configs
      if (preservedCloudProviders) {
        Object.entries(preservedCloudProviders).forEach(([key, value]) => {
          if (value) {
            const providerKey = key as 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
            // Use JSON stringify/parse for deep copy to avoid reference issues
            finalCloudProviders![providerKey] = JSON.parse(JSON.stringify(value));
          }
        });
      }
      
      // Then add new configs (overriding existing ones)
      Object.entries(config.cloudProviders).forEach(([key, value]) => {
        if (value) {
          const providerKey = key as 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
          // Use JSON stringify/parse for deep copy to avoid reference issues
          finalCloudProviders![providerKey] = JSON.parse(JSON.stringify(value));
            // Special handling for Azure OpenAI
          if (key === 'azure-openai' && value.baseUrl && finalCloudProviders && finalCloudProviders[providerKey]) {
            // Explicitly set the baseUrl again to ensure it's preserved exactly as provided
            finalCloudProviders[providerKey].baseUrl = value.baseUrl;
            console.log(`[ConfigService] saveLLMConfig - Azure OpenAI URL being preserved: ${finalCloudProviders[providerKey].baseUrl}`);
          }
        }
      });
    } else {
      // If incoming config has no cloud providers, create a deep copy of existing ones
      if (preservedCloudProviders) {
        Object.entries(preservedCloudProviders).forEach(([key, value]) => {
          if (value) {
            const providerKey = key as 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
            // Use JSON stringify/parse for deep copy to avoid reference issues
            finalCloudProviders![providerKey] = JSON.parse(JSON.stringify(value));
          }
        });
      } else {
        // If there are no cloud providers at all, set to undefined
        finalCloudProviders = undefined;
      }
    }

    // Determine the final default cloud provider
    let finalDefaultCloudProvider;
    if (config.defaultCloudProvider) {
      // If incoming config explicitly sets a default provider, use it (if it exists in the merged config)
      if (finalCloudProviders && finalCloudProviders[config.defaultCloudProvider]) {
        finalDefaultCloudProvider = config.defaultCloudProvider;
        console.log('[ConfigService] saveLLMConfig - Using incoming default provider:', config.defaultCloudProvider);
      } else {
        // Incoming default provider doesn't exist in cloud providers, keep existing
        finalDefaultCloudProvider = preservedDefaultCloudProvider;
        console.log('[ConfigService] saveLLMConfig - Incoming default provider not found, keeping existing:', preservedDefaultCloudProvider);
      }
    } else {
      // No incoming default provider specified, keep existing
      finalDefaultCloudProvider = preservedDefaultCloudProvider;
      console.log('[ConfigService] saveLLMConfig - No incoming default provider, keeping existing:', preservedDefaultCloudProvider);
    }

    // Create the final configuration, ensuring all values are preserved
    currentContext.llm = {
      ...config,
      // Use the merged cloud provider configurations
      cloudProviders: finalCloudProviders,
      // Use the determined default cloud provider
      defaultCloudProvider: finalDefaultCloudProvider
    };
    currentContext.lastUsedProvider = config.provider;
    
    console.log('[ConfigService] saveLLMConfig - Final config being saved:', {
      provider: currentContext.llm.provider,
      model: currentContext.llm.model,
      temperature: currentContext.llm.temperature,
      maxTokens: currentContext.llm.maxTokens,
      preferLocal: currentContext.llm.preferLocal,
      hasCloudProviders: !!currentContext.llm.cloudProviders,
      finalProviderKeys: currentContext.llm.cloudProviders ? Object.keys(currentContext.llm.cloudProviders) : 'none',
      finalDefaultProvider: currentContext.llm.defaultCloudProvider
    });
    
    this.saveCurrentContext(currentContext);
    
    // Verify the save worked by reading it back
    const verifyContext = this.getCurrentContext();
    console.log('[ConfigService] saveLLMConfig - Verification read back:', {
      provider: verifyContext.llm?.provider,
      model: verifyContext.llm?.model,
      temperature: verifyContext.llm?.temperature,
      maxTokens: verifyContext.llm?.maxTokens,
      preferLocal: verifyContext.llm?.preferLocal
    });
  }

  /**
   * Get cached models for a provider (context-aware)
   */
  getCachedModels(provider: string): string[] | null {
    const context = this.getCurrentContext();
    const cache = context.modelCache;
    const providerCache = cache[provider];
    
    if (!providerCache) {
      return null;
    }

    // Check if cache is expired (24 hours)
    const now = Date.now();
    const cacheAge = now - new Date(providerCache.lastFetched).getTime();
    const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours

    if (cacheAge > cacheExpiry) {
      // Cache expired, remove it
      delete cache[provider];
      this.saveCurrentContext(context);
      return null;
    }

    return providerCache.models;
  }

  /**
   * Cache models for a provider (context-aware)
   */
  cacheModels(provider: string, models: string[]): void {
    const context = this.getCurrentContext();
    const cache = context.modelCache;
    cache[provider] = {
      models: [...new Set(models)], // Remove duplicates
      lastFetched: new Date().toISOString(),
      cacheExpiry: 24 * 60 * 60 * 1000 // 24 hours
    };
    this.saveCurrentContext(context);
  }

  /**
   * Clear model cache for a specific provider (context-aware)
   */
  clearModelCache(provider?: string): void {
    const context = this.getCurrentContext();
    if (provider) {
      delete context.modelCache[provider];
    } else {
      // Clear all caches
      context.modelCache = {};
    }
    this.saveCurrentContext(context);
  }
  /**
   * Get the last used provider (context-aware)
   */
  getLastUsedProvider(): string {
    return this.getCurrentContext().lastUsedProvider;
  }  /**
   * Save a cloud provider configuration
   */  saveCloudProviderConfig(provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai', config: CloudLLMProviderConfig): void {
    console.log(`[ConfigService] Saving cloud provider config for ${provider}:`, {
      hasApiKey: !!config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      authMode: this.currentAuthMode,
      userKey: this.currentUserKey
    });
    
    // Special handling for Azure OpenAI to ensure the full URL is saved
    if (provider === 'azure-openai' && config.baseUrl) {
      // Make sure we're saving the complete URL (not just the base)
      console.log(`[ConfigService] Azure OpenAI URL before save: "${config.baseUrl}"`);
      
      // Validate the URL has the essential components
      if (!config.baseUrl.includes('/chat/completions') || 
          !config.baseUrl.includes('api-version=') ||
          !config.baseUrl.includes('/deployments/')) {
        console.warn(`[ConfigService] Warning: Azure OpenAI URL may not be complete: ${config.baseUrl}`);
      }
    }
    
    const currentConfig = this.getLLMConfig();
    
    // Initialize cloudProviders if it doesn't exist
    if (!currentConfig.cloudProviders) {
      currentConfig.cloudProviders = {};
    }
    
    // Create a deep copy of the config to avoid potential reference issues
    const configCopy: CloudLLMProviderConfig = JSON.parse(JSON.stringify({
      ...config,
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      organization: config.organization
    }));
    
    // Extra protection for Azure OpenAI URL to ensure it's not truncated
    if (provider === 'azure-openai' && config.baseUrl) {
      // Explicitly set the baseUrl again to ensure it's preserved exactly as provided
      configCopy.baseUrl = config.baseUrl;
      console.log(`[ConfigService] Azure OpenAI URL explicitly preserved as: "${configCopy.baseUrl}"`);
    }
    
    // Save the cloud provider config - ensure it's a completely new object
    currentConfig.cloudProviders[provider] = configCopy;
    
    // If this is the first cloud provider or no default is set, make it the default
    if (!currentConfig.defaultCloudProvider) {
      currentConfig.defaultCloudProvider = provider;
    }
    
    console.log(`[ConfigService] Before saving, cloudProviders:`, Object.keys(currentConfig.cloudProviders));
    console.log(`[ConfigService] Default provider:`, currentConfig.defaultCloudProvider);
    
    if (provider === 'azure-openai' && currentConfig.cloudProviders[provider]) {
      console.log(`[ConfigService] Azure OpenAI config being saved:`, {
        baseUrl: currentConfig.cloudProviders[provider].baseUrl,
        model: currentConfig.cloudProviders[provider].model,
        hasApiKey: !!currentConfig.cloudProviders[provider].apiKey
      });
    }
    
    this.saveLLMConfig(currentConfig);
    
    // Verify the save
    const savedConfig = this.getLLMConfig();
    console.log(`[ConfigService] After saving, verification - cloudProviders:`, Object.keys(savedConfig.cloudProviders || {}));
    console.log(`[ConfigService] After saving, verification - ${provider} config exists:`, !!savedConfig.cloudProviders?.[provider]);
    
    if (provider === 'azure-openai' && savedConfig.cloudProviders?.[provider]) {
      console.log(`[ConfigService] Azure OpenAI verified saved URL: "${savedConfig.cloudProviders[provider].baseUrl}"`);
    }
  }/**
   * Get a specific cloud provider configuration
   */  getCloudProviderConfig(provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): CloudLLMProviderConfig | null {
    console.log(`[ConfigService] Getting cloud provider config for ${provider}`);
    
    const config = this.getLLMConfig();
    const result = config.cloudProviders?.[provider] || null;
    
    console.log(`[ConfigService] Found ${provider} config:`, !!result);
    if (result && provider === 'azure-openai') {
      console.log(`[ConfigService] Azure OpenAI config details:`, {
        hasApiKey: !!result.apiKey,
        model: result.model,
        baseUrl: result.baseUrl
      });
      
      // Add enhanced logging for Azure OpenAI endpoint URL
      if (result.baseUrl) {
        console.log(`[ConfigService] Azure OpenAI loaded full URL: "${result.baseUrl}"`);
        
        // Check URL format
        if (!result.baseUrl.includes('/chat/completions')) {
          console.warn('[ConfigService] Warning: Azure OpenAI URL is missing /chat/completions path');
        }
        if (!result.baseUrl.includes('api-version=')) {
          console.warn('[ConfigService] Warning: Azure OpenAI URL is missing api-version parameter');
        }
        if (!result.baseUrl.includes('/deployments/')) {
          console.warn('[ConfigService] Warning: Azure OpenAI URL is missing /deployments/ path');
        }
      } else {
        console.warn('[ConfigService] Warning: Azure OpenAI config missing baseUrl');
      }
    }
    
    // Create a deep copy to avoid reference issues
    return result ? { ...result } : null;
  }
  /**
   * Get all configured cloud providers
   */  getConfiguredCloudProviders(): Array<{ provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'; config: CloudLLMProviderConfig }> {
    const config = this.getLLMConfig();
    const providers: Array<{ provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'; config: CloudLLMProviderConfig }> = [];
    
    if (config.cloudProviders) {
      Object.entries(config.cloudProviders).forEach(([provider, providerConfig]) => {
        if (providerConfig) {
          // Create a deep copy of the config
          const configCopy: CloudLLMProviderConfig = {
            ...providerConfig,
            provider: providerConfig.provider,
            model: providerConfig.model,
            apiKey: providerConfig.apiKey,
            baseUrl: providerConfig.baseUrl,
            temperature: providerConfig.temperature,
            maxTokens: providerConfig.maxTokens,
            organization: providerConfig.organization
          };
          
          providers.push({
            provider: provider as 'openai' | 'anthropic' | 'gemini' | 'azure-openai',
            config: configCopy
          });
          
          // Special debug logging for Azure OpenAI
          if (provider === 'azure-openai') {
            console.log(`[ConfigService] getConfiguredCloudProviders - Azure OpenAI loaded:`, {
              baseUrl: configCopy.baseUrl,
              model: configCopy.model,
              hasApiKey: !!configCopy.apiKey
            });
          }
        }
      });
    }
    
    return providers;
  }
  /**
   * Set the default cloud provider
   */  setDefaultCloudProvider(provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): void {
    const config = this.getLLMConfig();
    
    // Verify the provider is configured
    if (!config.cloudProviders?.[provider]) {
      throw new Error(`Cloud provider ${provider} is not configured`);
    }
    
    // Set the default cloud provider
    config.defaultCloudProvider = provider;
    
    // Also update the main provider field to match the default
    // This ensures consistency between the default and the active provider
    config.provider = provider;
    
    // If switching to a cloud provider, update the model to match the cloud provider's model
    if (config.cloudProviders[provider]?.model) {
      config.model = config.cloudProviders[provider].model;
    }
    
    console.log(`[ConfigService] Set default cloud provider: ${provider}, updated main provider to match`);
    
    this.saveLLMConfig(config);
  }
  /**
   * Get the default cloud provider configuration
   */
  getDefaultCloudProvider(): { provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'; config: CloudLLMProviderConfig } | null {
    const config = this.getLLMConfig();
    const defaultProvider = config.defaultCloudProvider;
    
    if (!defaultProvider || !config.cloudProviders?.[defaultProvider]) {
      return null;
    }
    
    return {
      provider: defaultProvider,
      config: config.cloudProviders[defaultProvider]
    };
  }
  /**
   * Remove a cloud provider configuration
   */
  removeCloudProviderConfig(provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): void {
    console.log(`[ConfigService] removeCloudProviderConfig - Removing provider: ${provider}`);
    
    const currentContext = this.getCurrentContext();
    const config = currentContext.llm || {};
    
    if (config.cloudProviders?.[provider]) {
      console.log(`[ConfigService] removeCloudProviderConfig - Provider ${provider} found, removing...`);
      
      // Create a deep copy to avoid reference issues
      const updatedCloudProviders = { ...config.cloudProviders };
      delete updatedCloudProviders[provider];
      
      // If this was the default provider, choose a new default
      let newDefaultProvider = config.defaultCloudProvider;
      if (config.defaultCloudProvider === provider) {
        const remainingProviders = Object.keys(updatedCloudProviders) as Array<'openai' | 'anthropic' | 'gemini' | 'azure-openai'>;
        newDefaultProvider = remainingProviders.length > 0 ? remainingProviders[0] : undefined;
        console.log(`[ConfigService] removeCloudProviderConfig - Default provider was ${provider}, changed to: ${newDefaultProvider || 'none'}`);
      }
      
      // Update the context directly to avoid the complex merging logic in saveLLMConfig
      currentContext.llm = {
        ...config,
        cloudProviders: Object.keys(updatedCloudProviders).length > 0 ? updatedCloudProviders : undefined,
        defaultCloudProvider: newDefaultProvider
      };
      
      console.log(`[ConfigService] removeCloudProviderConfig - Updated config provider keys: [${Object.keys(updatedCloudProviders).join(', ')}]`);
      console.log(`[ConfigService] removeCloudProviderConfig - New default provider: ${newDefaultProvider || 'none'}`);
      
      // Save directly to avoid merging conflicts
      this.saveCurrentContext(currentContext);
      
      // Verify the deletion worked
      const verifyContext = this.getCurrentContext();
      const remainingKeys = verifyContext.llm?.cloudProviders ? Object.keys(verifyContext.llm.cloudProviders) : [];
      console.log(`[ConfigService] removeCloudProviderConfig - Verification: remaining providers [${remainingKeys.join(', ')}]`);
      console.log(`[ConfigService] removeCloudProviderConfig - Verification: provider ${provider} still exists: ${!!verifyContext.llm?.cloudProviders?.[provider]}`);
    } else {
      console.log(`[ConfigService] removeCloudProviderConfig - Provider ${provider} not found in config`);
    }
  }

  /**
   * Check if API key exists for a provider (context-aware)
   */
  hasApiKey(provider: string): boolean {
    const config = this.getLLMConfig();
    return config.provider === provider && !!config.apiKey && config.apiKey.trim().length > 0;
  }

  /**
   * Get authentication context information
   */
  getAuthenticationContext(): { mode: 'client-credentials' | 'interactive', userKey?: string } {
    return {
      mode: this.currentAuthMode,
      userKey: this.currentUserKey
    };
  }
  /**
   * Backup configuration to file (for debugging) - sanitized
   */
  exportConfig(): any {
    // Get the current store data
    const appConfig = {
      application: this.store.get('application'),
      users: this.store.get('users'),
      currentAuthMode: this.store.get('currentAuthMode'),
      currentUserKey: this.store.get('currentUserKey')
    };
    
    // Sanitize API keys for export
    const sanitized = JSON.parse(JSON.stringify(appConfig));
    
    // Sanitize application config
    if (sanitized.application?.llm?.apiKey) {
      sanitized.application.llm.apiKey = '[REDACTED]';
    }
    
    // Sanitize user configs
    if (sanitized.users) {
      Object.keys(sanitized.users).forEach(userKey => {
        if (sanitized.users[userKey]?.llm?.apiKey) {
          sanitized.users[userKey].llm.apiKey = '[REDACTED]';
        }
      });
    }
    
    return sanitized;
  }

  /**
   * Clear all stored configuration (reset to defaults)
   */
  resetConfig(): void {
    this.store.clear();
    this.currentAuthMode = 'client-credentials';
    this.currentUserKey = undefined;
  }
  /**
   * Clear configuration for current user only
   */
  resetCurrentUserConfig(): void {
    if (this.currentAuthMode === 'interactive' && this.currentUserKey) {
      const users = this.store.get('users');
      delete users[this.currentUserKey];
      this.store.set('users', users);
    } else {
      // Reset application config to defaults
      const defaultAppConfig: UserConfigSchema = {
        llm: {
          provider: 'anthropic',          model: 'claude-3-5-sonnet-20241022',
          apiKey: '',
          baseUrl: '',
          temperature: 0.2,
          maxTokens: 4096,
          organization: ''
        },
        lastUsedProvider: 'anthropic',
        modelCache: {}
      };
      this.store.set('application', defaultAppConfig);
    }
  }

  /**
   * Get Entra application configuration
   * @returns Current Entra configuration or null if not set
   */
  getEntraConfig(): EntraConfig | null {
    if (!this.isAuthenticationVerified && !this.isServiceLevelAccess) {
      console.log('[ConfigService] 🔒 Access to Entra config blocked - authentication not verified and not service-level access');
      return null;
    }

    // Get Entra config based on current authentication mode without fallback
    let entraConfig: EntraConfig | null = null;
    
    if (this.currentAuthMode === 'client-credentials') {
      // In client-credentials mode, use application config
      try {
        const appConfig = this.store.get('application');
        entraConfig = appConfig?.entraConfig || null;
        if (entraConfig) {
          console.log('[ConfigService] getEntraConfig - Using application config (client-credentials mode)');
        }
      } catch (error) {
        console.warn('[ConfigService] Failed to get Entra config from application config:', error);
      }
    } else if (this.currentAuthMode === 'interactive' && this.currentUserKey) {
      // In interactive mode, use user-specific config ONLY - no fallback to application config
      try {
        const users = this.store.get('users');
        if (users && users[this.currentUserKey]) {
          entraConfig = users[this.currentUserKey].entraConfig || null;
          if (entraConfig) {
            console.log(`[ConfigService] getEntraConfig - Using user config for ${this.currentUserKey}`);
          } else {
            console.log(`[ConfigService] getEntraConfig - No Entra config found for user ${this.currentUserKey}`);
          }
        } else {
          console.log(`[ConfigService] getEntraConfig - No user config found for ${this.currentUserKey}`);
        }
      } catch (error) {
        console.warn('[ConfigService] Failed to get Entra config from user config:', error);
      }
    } else {
      console.log('[ConfigService] getEntraConfig - No valid authentication context');
    }
    
    if (entraConfig) {
      console.log('[ConfigService] getEntraConfig - Found config with Enhanced Graph Access:', entraConfig.useGraphPowerShell);
    } else {
      console.log('[ConfigService] getEntraConfig - No Entra config found');
    }
    
    return entraConfig;
  }
  /**
   * Save Entra application configuration
   * @param entraConfig Entra configuration to save
   */  
  saveEntraConfig(entraConfig: EntraConfig): void {
    if (!this.isAuthenticationVerified && !this.isServiceLevelAccess) {
      console.log('[ConfigService] 🔒 Save Entra config blocked - authentication not verified and not service-level access');
      return;
    }

    console.log('[ConfigService] saveEntraConfig - Input config:', {
      clientId: entraConfig.clientId ? '[REDACTED]' : 'none',
      tenantId: entraConfig.tenantId ? '[REDACTED]' : 'none',
      useGraphPowerShell: entraConfig.useGraphPowerShell
    });

    console.log(`[ConfigService] saveEntraConfig - Mode: ${this.currentAuthMode}, UserKey: ${this.currentUserKey}`);

    if (this.currentAuthMode === 'client-credentials') {
      // Save to application config
      try {
        const appConfig = this.store.get('application') || {};
        appConfig.entraConfig = entraConfig;
        this.store.set('application', appConfig);
        console.log('[ConfigService] saveEntraConfig - Saved to application config (client-credentials mode)');
      } catch (error) {
        console.warn('[ConfigService] Failed to save to application config:', error);
      }
    } else if (this.currentAuthMode === 'interactive' && this.currentUserKey) {
      // Save to user-specific config only
      try {
        const users = this.store.get('users') || {};
        if (!users[this.currentUserKey]) {
          users[this.currentUserKey] = this.getDefaultUserConfig();
        }
        users[this.currentUserKey].entraConfig = entraConfig;
        this.store.set('users', users);
        console.log(`[ConfigService] saveEntraConfig - Saved to user config for ${this.currentUserKey}`);
      } catch (error) {
        console.warn('[ConfigService] Failed to save to user config:', error);
      }
    } else {
      console.log('[ConfigService] saveEntraConfig - No valid authentication context to save to');
    }

    // Update authentication context based on new config
    this.updateAuthenticationContext();

    console.log('[ConfigService] saveEntraConfig - Configuration saved successfully');
  }
  /**
   * Clear Entra application configuration
   */
  clearEntraConfig(): void {
    if (!this.isAuthenticationVerified && !this.isServiceLevelAccess) {
      console.log('[ConfigService] 🔒 Clear Entra config blocked - authentication not verified and not service-level access');
      return;
    }

    console.log(`[ConfigService] clearEntraConfig - Mode: ${this.currentAuthMode}, UserKey: ${this.currentUserKey}`);

    if (this.currentAuthMode === 'client-credentials') {
      // Clear from application config
      try {
        const appConfig = this.store.get('application') || {};
        delete appConfig.entraConfig;
        this.store.set('application', appConfig);
        console.log('[ConfigService] clearEntraConfig - Cleared from application config (client-credentials mode)');
      } catch (error) {
        console.warn('[ConfigService] Failed to clear application config:', error);
      }
    } else if (this.currentAuthMode === 'interactive' && this.currentUserKey) {
      // Clear from user-specific config only
      try {
        const users = this.store.get('users') || {};
        if (users[this.currentUserKey]) {
          delete users[this.currentUserKey].entraConfig;
          this.store.set('users', users);
          console.log(`[ConfigService] clearEntraConfig - Cleared from user config for ${this.currentUserKey}`);
        } else {
          console.log(`[ConfigService] clearEntraConfig - No user config found for ${this.currentUserKey}`);
        }
      } catch (error) {
        console.warn('[ConfigService] Failed to clear user config:', error);
      }
    } else {
      console.log('[ConfigService] clearEntraConfig - No valid authentication context to clear');
    }

    console.log('[ConfigService] clearEntraConfig - Configuration cleared successfully');
  }

  /**
   * Get the user's authentication preference (always user-token since Application Credentials mode was removed)
   */
  getAuthenticationPreference(): 'user-token' | 'application-credentials' {
    // Application Credentials mode has been removed for security reasons
    // Always return 'user-token' as only delegated permissions are supported
    return 'user-token';
  }

  /**
   * Update authentication context (always use interactive mode since Application Credentials mode was removed)
   */
  updateAuthenticationContext(): void {
    // Application Credentials mode has been removed for security reasons
    // Always use interactive mode (delegated permissions)
    this.setAuthenticationContext('interactive');
    
    console.log('[ConfigService] Updated authentication context to interactive mode (delegated permissions only)');
  }

  /**
   * Set auto-update preference
   * @param enabled Whether auto-updates should be enabled
   */
  setAutoUpdatePreference(enabled: boolean): void {
    if (!this.isServiceLevelAccess && !this.isAuthenticationVerified) {
      console.warn('[ConfigService] Cannot set auto-update preference - authentication not verified');
      return;
    }
    
    try {
      const context = this.getCurrentContext();
      if (context) {
        (context as any).autoUpdate = enabled;
        this.saveCurrentContext(context);
        console.log(`[ConfigService] Auto-update preference set to: ${enabled}`);
      }
    } catch (error) {
      console.warn('Error setting auto-update preference:', error);
    }
  }

  /**
   * Get auto-update preference
   * @returns Whether auto-updates are enabled (defaults to true)
   */
  getAutoUpdatePreference(): boolean {
    if (!this.isServiceLevelAccess && !this.isAuthenticationVerified) {
      console.warn('[ConfigService] Cannot get auto-update preference - authentication not verified');
      return true; // Default to enabled for security
    }
    
    try {
      const context = this.getCurrentContext();
      if (context) {
        return (context as any).autoUpdate !== false; // Default to true unless explicitly disabled
      }
    } catch (error) {
      console.warn('Error getting auto-update preference:', error);
    }
    
    return true; // Default to enabled
  }

  // =========================
  // MCP Configuration Methods
  // =========================

  /**
   * Get MCP configuration
   * @returns Current MCP configuration or default
   */
  getMCPConfig(): MCPConfig {
    console.log(`[ConfigService] getMCPConfig called - ServiceLevel: ${this.isServiceLevelAccess}, AuthVerified: ${this.isAuthenticationVerified}`);
    
    // For packaged apps, we need to be more permissive to ensure MCP config works
    // The main process should always have access to MCP configuration
    if (!this.isServiceLevelAccess && !this.isAuthenticationVerified) {
      console.warn('[ConfigService] MCP config access with limited permissions - using stored config');
      // Try to access stored config directly for MCP functionality
      try {
        const appConfig = this.store.get('application');
        const usersConfig = this.store.get('users');
        console.log('[ConfigService] Store access attempt:', {
          hasAppConfig: !!appConfig,
          hasUsersConfig: !!usersConfig,
          appMcpConfig: !!appConfig?.mcpConfig,
          userKeys: usersConfig ? Object.keys(usersConfig) : []
        });
        
        const storedConfig = appConfig?.mcpConfig || 
                           (usersConfig && Object.values(usersConfig)[0] as UserConfigSchema)?.mcpConfig;
        if (storedConfig) {
          console.log('[ConfigService] Successfully retrieved MCP config from store:', storedConfig);
          return storedConfig;
        }
      } catch (error) {
        console.warn('[ConfigService] Could not access stored MCP config:', error);
      }
      console.log('[ConfigService] Falling back to default MCP config');
      return this.getDefaultMCPConfig();
    }

    try {
      const context = this.getCurrentContext();
      console.log('[ConfigService] Retrieved context MCP config:', context.mcpConfig);
      return context.mcpConfig || this.getDefaultMCPConfig();
    } catch (error) {
      console.warn('Error getting MCP config:', error);
      return this.getDefaultMCPConfig();
    }
  }

  /**
   * Save MCP configuration
   * @param config MCP configuration to save
   */
  saveMCPConfig(config: MCPConfig): void {
    // For packaged apps, we need to be more permissive to ensure MCP config works
    if (!this.isServiceLevelAccess && !this.isAuthenticationVerified) {
      console.warn('[ConfigService] MCP config save with limited permissions - saving to default location');
      // Try to save to application config as fallback
      try {
        const appConfig = this.store.get('application') || this.getDefaultUserConfig();
        appConfig.mcpConfig = config;
        this.store.set('application', appConfig);
        console.log('[ConfigService] MCP configuration saved to application config');
        return;
      } catch (error) {
        console.error('Error saving MCP config to application config:', error);
        throw error;
      }
    }

    try {
      const context = this.getCurrentContext();
      context.mcpConfig = config;
      this.saveCurrentContext(context);
      console.log('[ConfigService] MCP configuration saved successfully');
    } catch (error) {
      console.error('Error saving MCP config:', error);
      throw error;
    }
  }

  /**
   * Get default MCP configuration
   * @returns Default MCP configuration
   */
  private getDefaultMCPConfig(): MCPConfig {
    return {
      lokka: {
        enabled: false,
        authMode: 'delegated',
        useGraphPowerShell: false
      },
      fetch: {
        enabled: true
      },
      microsoftDocs: {
        enabled: true
      }
    };
  }

  /**
   * Update Lokka MCP configuration
   * @param lokkaConfig Lokka-specific configuration
   */
  updateLokkaMCPConfig(lokkaConfig: Partial<MCPConfig['lokka']>): void {
    const currentConfig = this.getMCPConfig();
    const defaultLokka = this.getDefaultMCPConfig().lokka!;
    const existingLokka = currentConfig.lokka;
    
    currentConfig.lokka = {
      enabled: lokkaConfig?.enabled ?? existingLokka?.enabled ?? defaultLokka.enabled,
      authMode: lokkaConfig?.authMode ?? existingLokka?.authMode ?? defaultLokka.authMode,
      clientId: lokkaConfig?.clientId ?? existingLokka?.clientId,
      tenantId: lokkaConfig?.tenantId ?? existingLokka?.tenantId,
      clientSecret: lokkaConfig?.clientSecret ?? existingLokka?.clientSecret,
      useGraphPowerShell: lokkaConfig?.useGraphPowerShell ?? existingLokka?.useGraphPowerShell ?? defaultLokka.useGraphPowerShell,
      accessToken: lokkaConfig?.accessToken ?? existingLokka?.accessToken
    };
    this.saveMCPConfig(currentConfig);
  }

  /**
   * Get Lokka MCP environment variables for current configuration
   * @param userToken Optional user access token for runtime
   * @returns Environment variables object for Lokka MCP server
   */
  getLokkaMCPEnvironment(userToken?: string): Record<string, string> {
    console.log('[ConfigService] getLokkaMCPEnvironment called with userToken:', !!userToken);
    const mcpConfig = this.getMCPConfig();
    console.log('[ConfigService] MCP config retrieved:', mcpConfig);
    const lokkaConfig = mcpConfig.lokka;
    console.log('[ConfigService] Lokka config:', lokkaConfig);

    if (!lokkaConfig || !lokkaConfig.enabled) {
      return {};
    }

    let env: Record<string, string> = {
      // Always add debug flag for better troubleshooting
      DEBUG_ENTRAPULSE: 'true',
      NODE_ENV: 'development'
    };

    switch (lokkaConfig.authMode) {
      case 'client-credentials':
        if (lokkaConfig.clientId && lokkaConfig.tenantId && lokkaConfig.clientSecret) {
          env = {
            ...env,
            TENANT_ID: lokkaConfig.tenantId,
            CLIENT_ID: lokkaConfig.clientId,
            CLIENT_SECRET: lokkaConfig.clientSecret
          };
        }
        break;

      case 'enhanced-graph-access':
        env = {
          ...env,
          TENANT_ID: 'common',
          CLIENT_ID: '14d82eec-204b-4c2f-b7e8-296a70dab67e' // Microsoft Graph PowerShell client ID
        };
        // Check for runtime token first, then stored token
        const accessToken = userToken || lokkaConfig.accessToken;
        if (accessToken) {
          env.ACCESS_TOKEN = accessToken;
          env.USE_INTERACTIVE = 'false';
          env.USE_CLIENT_TOKEN = 'true'; // Always needed for client-provided-token mode
        } else {
          env.USE_CLIENT_TOKEN = 'true';
        }
        break;

      case 'delegated':
      default:
        // Check for runtime token first, then stored token
        const delegatedAccessToken = userToken || lokkaConfig.accessToken;
        if (delegatedAccessToken) {
          env = {
            ...env,
            ACCESS_TOKEN: delegatedAccessToken,
            USE_INTERACTIVE: 'false',
            USE_CLIENT_TOKEN: 'true' // Always needed for client-provided-token mode
          };
        } else if (lokkaConfig.clientId && lokkaConfig.tenantId) {
          env = {
            ...env,
            TENANT_ID: lokkaConfig.tenantId,
            CLIENT_ID: lokkaConfig.clientId,
            USE_CLIENT_TOKEN: 'true'
          };
        }
        break;
    }

    console.log('[ConfigService] Generated Lokka MCP environment:', {
      authMode: lokkaConfig.authMode,
      hasRuntimeToken: !!userToken,
      hasStoredToken: !!lokkaConfig.accessToken,
      runtimeTokenLength: userToken ? userToken.length : 0,
      storedTokenLength: lokkaConfig.accessToken ? lokkaConfig.accessToken.length : 0,
      envKeys: Object.keys(env),
      useClientToken: env.USE_CLIENT_TOKEN,
      useInteractive: env.USE_INTERACTIVE,
      tenantId: env.TENANT_ID,
      clientId: env.CLIENT_ID ? env.CLIENT_ID.substring(0, 8) + '...' : 'none'
    });

    return env;
  }

  /**
   * Check if Lokka MCP is properly configured
   * @returns Whether Lokka MCP can be enabled
   */
  isLokkaMCPConfigured(): boolean {
    console.log('[ConfigService] isLokkaMCPConfigured called');
    const mcpConfig = this.getMCPConfig();
    console.log('[ConfigService] MCP config for isConfigured check:', mcpConfig);
    const lokkaConfig = mcpConfig.lokka;
    console.log('[ConfigService] Lokka config for isConfigured check:', lokkaConfig);

    if (!lokkaConfig || !lokkaConfig.enabled) {
      console.log('[ConfigService] Lokka MCP not enabled or missing config');
      return false;
    }

    switch (lokkaConfig.authMode) {
      case 'client-credentials':
        return !!(lokkaConfig.clientId && lokkaConfig.tenantId && lokkaConfig.clientSecret);
      
      case 'enhanced-graph-access':
        return true; // Always available if enabled
      
      case 'delegated':
      default:
        return !!(lokkaConfig.clientId && lokkaConfig.tenantId);
    }
  }
}
