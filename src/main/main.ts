// Main Electron process for EntraPulse Lite
import { app, BrowserWindow, ipcMain, Menu, globalShortcut, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AuthService } from '../auth/AuthService';
import { GraphService } from '../shared/GraphService';
import { ConfigService } from '../shared/ConfigService';
import { LLMService } from '../llm/LLMService';
import { EnhancedLLMService } from '../llm/EnhancedLLMService';
import { MCPClient } from '../mcp/clients/MCPSDKClient';
import { MCPAuthService } from '../mcp/auth/MCPAuthService';
import { MCPServerManager } from '../mcp/servers/MCPServerManager';
import { GraphMCPClient } from '../mcp/clients/GraphMCPClient';
import { MCPErrorHandler, ErrorCode } from '../mcp/utils';
import { debugMCP, checkMCPServerHealth } from '../mcp/mcp-debug';
import { AutoUpdaterService } from './AutoUpdaterService';
import { AppConfig, MCPServerConfig, MCPConfig } from '../types';
import { exposeVersionToRenderer } from '../shared/VersionUtils';

// Get version from package.json
function getAppVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    console.error('Failed to read version from package.json:', error);
    return '1.0.0'; // Fallback version
  }
}

// Set app ID for Windows taskbar integration
if (process.platform === 'win32') {
  app.setAppUserModelId('com.darrenjrobinson.entrapulselite');
}

class EntraPulseLiteApp {
  private mainWindow: BrowserWindow | null = null;
  private authService!: AuthService;
  private graphService!: GraphService;
  private configService!: ConfigService;
  private llmService!: EnhancedLLMService;
  private mcpClient!: MCPClient;
  private mcpServerManager!: MCPServerManager;
  private autoUpdaterService!: AutoUpdaterService;
  private config!: AppConfig;
  private configurationAvailabilityNotified: boolean = false;
  private previousClientId?: string; // Track client ID changes for cache clearing

  constructor() {
    console.log('[Main] ===== ENTRAPULSE LITE CONSTRUCTOR CALLED =====');
    console.log('[Main] Process type:', process.type);
    console.log('[Main] Environment:', process.env.NODE_ENV || 'not set');
    console.log('[Main] Is packaged:', app.isPackaged);
    console.log('[Main] App path:', app.getAppPath());
    
    // Send debug message to renderer process (when window is ready)
    this.sendDebugToRenderer('[Main] ===== ENTRAPULSE LITE CONSTRUCTOR CALLED =====');
    this.sendDebugToRenderer(`[Main] Process type: ${process.type}`);
    this.sendDebugToRenderer(`[Main] Environment: ${process.env.NODE_ENV || 'not set'}`);
    this.sendDebugToRenderer(`[Main] Is packaged: ${app.isPackaged}`);
    this.sendDebugToRenderer(`[Main] App path: ${app.getAppPath()}`);
    
    this.initializeServices().then(() => {
      console.log('[Main] Services initialization completed, setting up event handlers...');
      this.sendDebugToRenderer('[Main] Services initialization completed, setting up event handlers...');
      this.setupEventHandlers();
    }).catch((error) => {
      console.error('[Main] Services initialization failed:', error);
      this.sendDebugToRenderer(`[Main] Services initialization failed: ${error.message}`);
    });
  }

  private getDefaultModelForProvider(provider: 'ollama' | 'lmstudio' | 'openai' | 'anthropic'): string {
    switch (provider) {
      case 'ollama':
        return 'codellama:7b';
      case 'lmstudio':
        return 'gpt-4';
      case 'openai':
        return 'gpt-4o-mini';      case 'anthropic':
        return 'claude-3-haiku-20240307';
      default:        return 'gpt-4o-mini';
    }
  }
  private async initializeServices(): Promise<void> {
    console.log('[Main] ===== INITIALIZE SERVICES CALLED =====');
    console.log('[Main] Starting service initialization...');
    this.sendDebugToRenderer('[Main] ===== INITIALIZE SERVICES CALLED =====');
    this.sendDebugToRenderer('[Main] Starting service initialization...');
    
    // Initialize configuration service first
    console.log('[Main] Initializing ConfigService...');
    this.sendDebugToRenderer('[Main] Initializing ConfigService...');
    this.configService = new ConfigService();
    console.log('[Main] ConfigService initialized');
    this.sendDebugToRenderer('[Main] ConfigService initialized');
    
    // Get authentication configuration (stored config takes precedence)
    console.log('[Main] ===== DEBUGGING AUTH INITIALIZATION =====');
    this.sendDebugToRenderer('[Main] ===== DEBUGGING AUTH INITIALIZATION =====');
    const authConfig = await this.getAuthConfiguration();
    console.log('[Main] authConfig result:', {
      clientId: authConfig.clientId.substring(0, 8) + '...',
      tenantId: authConfig.tenantId.substring(0, 8) + '...',
      hasClientSecret: Boolean(authConfig.clientSecret)
    });
    this.sendDebugToRenderer(`[Main] authConfig received - clientId: ${authConfig.clientId.substring(0, 8)}..., tenantId: ${authConfig.tenantId.substring(0, 8)}..., hasClientSecret: ${Boolean(authConfig.clientSecret)}`);
      // Check if we have Lokka credentials OR if user can authenticate interactively
    const hasLokkaCreds = authConfig.clientSecret && authConfig.clientId && authConfig.tenantId;
    const canUseTokenAuth = authConfig.clientId && authConfig.tenantId; // Token auth only needs these
    
    console.log('[Main] Lokka authentication options:', {
      hasLokkaCreds,
      canUseTokenAuth,
      clientIdExists: Boolean(authConfig.clientId),
      tenantIdExists: Boolean(authConfig.tenantId),
      clientSecretExists: Boolean(authConfig.clientSecret)
    });
    
    // Set service-level access for the main process (trusted environment)
    this.configService.setServiceLevelAccess(true);
    
    // Set authentication as verified since we are in the main process
    this.configService.setAuthenticationVerified(true);
    
    // Check user's authentication preference from the Entra config (always delegated now)
    const authPreference = this.configService.getAuthenticationPreference();
    
    console.log('[Main] Authentication preference analysis:', {
      authPreference,
      authConfigClientId: authConfig.clientId.substring(0, 8) + '...'
    });
    
    // Set authentication context to delegated mode (User Token mode only)
    const authMode = 'interactive';
    console.log(`[Main] Setting authentication mode: ${authMode} (preference: ${authPreference})`);
    this.configService.setAuthenticationContext(authMode);
    // Initialize configuration using stored config
    const storedLLMConfig = this.configService.getLLMConfig();
    
    // Initialize MCP configuration in storage if not exists
    console.log('[Main] About to initialize MCP configuration...');
    this.sendDebugToRenderer('[Main] About to initialize MCP configuration...');
    await this.initializeMCPConfiguration();
    console.log('[Main] MCP configuration initialization completed');
    this.sendDebugToRenderer('[Main] MCP configuration initialization completed');
    
    // Main AuthService configuration - always use delegated permissions (User Token mode only)
    console.log('[Main] Main AuthService configured for User Token mode with client:', authConfig.clientId.substring(0, 8) + '...');
    this.sendDebugToRenderer(`[Main] Main AuthService configured for User Token mode with client: ${authConfig.clientId.substring(0, 8)}...`);
    
    console.log('[Main] About to create MCP server configuration...');
    this.sendDebugToRenderer('[Main] About to create MCP server configuration...');
    const mcpServerConfig = this.createMCPServerConfig();
    console.log('[Main] MCP server configuration created:', mcpServerConfig);
    this.sendDebugToRenderer(`[Main] MCP server configuration created with ${mcpServerConfig.length} servers`);
    
    this.config = {
      auth: {
        clientId: authConfig.clientId,
        tenantId: authConfig.tenantId,
        scopes: ['https://graph.microsoft.com/.default'], // Interactive flow using .default to inherit all app registration permissions
        useClientCredentials: false, // Always use delegated permissions (User Token mode)
      },
      llm: storedLLMConfig, // Use stored LLM configuration
      mcpServers: mcpServerConfig, // Use stored MCP configuration
      features: {
        enablePremiumFeatures: false, // Set via UI preferences
        enableTelemetry: false, // Set via UI preferences
      },
    };

    // Log the final MCP server configuration for debugging
    const lokkaConfig = this.config.mcpServers.find(server => server.name === 'external-lokka');
    console.log('[Main] Final MCP server configuration loaded from storage:', {
      lokkaEnabled: lokkaConfig?.enabled,
      lokkaHasEnv: Boolean(lokkaConfig?.env),
      lokkaEnvKeys: lokkaConfig?.env ? Object.keys(lokkaConfig.env) : [],
      fetchEnabled: this.config.mcpServers.find(s => s.name === 'fetch')?.enabled,
      microsoftDocsEnabled: this.config.mcpServers.find(s => s.name === 'microsoft-docs')?.enabled
    });

    // Initialize services
    this.authService = new AuthService(this.config);
    
    this.graphService = new GraphService(this.authService);    // Initialize MCP services first
    const mcpAuthService = new MCPAuthService(this.authService);
    
    // Create MCPServerManager with auth service
    console.log('Initializing MCP client with server configs:', this.config.mcpServers);
    this.mcpServerManager = new MCPServerManager(this.config.mcpServers, mcpAuthService, this.configService);
      // Initialize MCP client with auth service
    this.mcpClient = new MCPClient(this.config.mcpServers, mcpAuthService);    // Determine LLM configuration based on preferences
    let llmConfig = { ...this.config.llm }; // Start with the full configuration
    const preferLocal = this.config.llm.preferLocal;
    const hasLocalProvider = (this.config.llm.provider === 'ollama' || this.config.llm.provider === 'lmstudio') && 
                            this.config.llm.baseUrl && this.config.llm.model;
    
    console.log('[Main] LLM provider selection debug:', {
      preferLocal,
      currentProvider: this.config.llm.provider,
      currentModel: this.config.llm.model,
      currentBaseUrl: this.config.llm.baseUrl,
      hasLocalProvider,
      hasCloudProviders: !!this.config.llm.cloudProviders,
      cloudProviderKeys: this.config.llm.cloudProviders ? Object.keys(this.config.llm.cloudProviders) : [],
      defaultCloudProviderField: this.config.llm.defaultCloudProvider
    });
    
    // Check if we should use local LLM (preferLocal is true and local provider is configured)
    if (preferLocal && hasLocalProvider) {
      console.log('🔧 Using LOCAL LLM as preferred:', this.config.llm.provider, 'Model:', this.config.llm.model);
      // Use the existing local configuration (already copied above)
    } else {
      // Fall back to cloud provider logic
      const defaultCloudProvider = this.configService.getDefaultCloudProvider();
      
      if (defaultCloudProvider) {
        // Update the main provider fields to match the default cloud provider
        // but keep the full cloudProviders configuration intact
        llmConfig.provider = defaultCloudProvider.provider;
        llmConfig.model = defaultCloudProvider.config.model;
        
        // Only update these fields if they're not already set at the root level
        if (!llmConfig.apiKey || llmConfig.apiKey.trim() === '') {
          llmConfig.apiKey = defaultCloudProvider.config.apiKey;
        }
        if (!llmConfig.baseUrl || llmConfig.baseUrl.trim() === '') {
          llmConfig.baseUrl = defaultCloudProvider.config.baseUrl;
        }
        if (llmConfig.temperature === undefined) {
          llmConfig.temperature = defaultCloudProvider.config.temperature;
        }
        if (llmConfig.maxTokens === undefined) {
          llmConfig.maxTokens = defaultCloudProvider.config.maxTokens;
        }
        if (!llmConfig.organization || llmConfig.organization.trim() === '') {
          llmConfig.organization = defaultCloudProvider.config.organization;
        }
        
        console.log('🔄 Using default cloud provider for LLM:', defaultCloudProvider.provider, 'Model:', defaultCloudProvider.config.model);
        console.log('🔄 Full llmConfig includes cloudProviders:', !!llmConfig.cloudProviders, 'keys:', llmConfig.cloudProviders ? Object.keys(llmConfig.cloudProviders) : 'none');
      } else {
        console.log('⚠️ No default cloud provider configured, using stored LLM config');
        console.log('⚠️ This means either defaultCloudProvider is not set or the provider is not in cloudProviders');
      }
    }
    
    // Initialize LLM service with the appropriate configuration
    this.llmService = new EnhancedLLMService(llmConfig, this.authService, this.mcpClient);
    
    // Initialize auto-updater service
    this.autoUpdaterService = new AutoUpdaterService(this.configService);
    
    // Log successful initialization
    console.log('Services initialized successfully');
  }
  /**
   * Reinitialize services when configuration changes (e.g., Entra config updated)
   */
  private async reinitializeServices(): Promise<void> {
    try {
      console.log('[Main] Reinitializing services with updated configuration...');
      
      // Store current cloud provider configurations before context switch
      const currentCloudProviders = this.configService.getLLMConfig()?.cloudProviders;
      const currentDefaultProvider = this.configService.getDefaultCloudProvider();
      console.log('[Main] Preserving cloud providers during reinitialization:', {
        hasCloudProviders: !!currentCloudProviders,
        providerCount: currentCloudProviders ? Object.keys(currentCloudProviders).length : 0,
        defaultProvider: currentDefaultProvider?.provider
      });
        // Get updated authentication configuration
      const authConfig = await this.getAuthConfiguration();
        // Check if we have Lokka credentials configured for non-interactive authentication
      const hasLokkaCreds = authConfig.clientSecret && authConfig.clientId && authConfig.tenantId;
      
      // Check user's authentication preference from the Entra config
      const authPreference = this.configService.getAuthenticationPreference();
      const useAppCredentials = authPreference === 'application-credentials' && hasLokkaCreds;
      
      // Determine the new authentication mode based on user preference
      const newAuthMode = useAppCredentials ? 'client-credentials' : 'interactive';
      console.log(`[Main] Switching authentication mode to: ${newAuthMode}`);
      
      // For interactive mode, we need to get user information if a user is already logged in
      if (newAuthMode === 'interactive') {
        try {
          // Try to get current user information from the auth service
          const currentUser = await this.authService.getCurrentUser();
          if (currentUser) {
            console.log('[Main] Found logged-in user, setting authentication context with user info');
            this.configService.setAuthenticationContext(newAuthMode, { 
              id: currentUser.localAccountId || currentUser.username || 'default-user',
              email: currentUser.username 
            });
          } else {
            console.log('[Main] No logged-in user found, deferring user context until login');
            // For now, use service-level access but we'll update context on login
            this.configService.setServiceLevelAccess(true);
          }
        } catch (error) {
          console.log('[Main] Could not get current user info, using service-level access:', error);
          this.configService.setServiceLevelAccess(true);
        }
      } else {
        // Set authentication context for client-credentials mode
        this.configService.setAuthenticationContext(newAuthMode);
      }
      
      // Restore cloud provider configurations if they exist
      if (currentCloudProviders && Object.keys(currentCloudProviders).length > 0) {
        console.log('[Main] Restoring cloud provider configurations after context switch...');
        const restoredConfig = this.configService.getLLMConfig();
        restoredConfig.cloudProviders = currentCloudProviders;
        if (currentDefaultProvider) {
          restoredConfig.defaultCloudProvider = currentDefaultProvider.provider;
        }
        this.configService.saveLLMConfig(restoredConfig);
        console.log('[Main] Cloud provider configurations restored successfully');
      }
      
      // Update the config object - use preference not just credential availability
      this.config.auth = {
        clientId: authConfig.clientId,
        tenantId: authConfig.tenantId,
        scopes: useAppCredentials 
          ? ['https://graph.microsoft.com/.default'] 
          : ['https://graph.microsoft.com/.default'],
        clientSecret: authConfig.clientSecret,
        useClientCredentials: Boolean(useAppCredentials),
      };      // Update MCP configuration in storage with latest authentication settings
      await this.initializeMCPConfiguration();
      
      // Update MCP server configuration from stored settings
      try {
        // Get user access token for passing to MCP servers if available
        let userToken: string | undefined;
        try {
          const tokenResult = await this.authService.getToken();
          userToken = tokenResult?.accessToken;
          console.log('[Main] Retrieved user token for MCP server reinitialization:', !!userToken);
        } catch (error) {
          console.log('[Main] No user token available for MCP server reinitialization:', error);
        }
        
        // Update MCP server configurations using stored settings
        this.config.mcpServers = this.createMCPServerConfig(userToken);
        
        console.log('[Main] Updated MCP server configurations from storage:', {
          lokkaEnabled: this.config.mcpServers.find(s => s.name === 'external-lokka')?.enabled,
          lokkaHasEnv: Boolean(this.config.mcpServers.find(s => s.name === 'external-lokka')?.env),
          lokkaEnvKeys: this.config.mcpServers.find(s => s.name === 'external-lokka')?.env ? Object.keys(this.config.mcpServers.find(s => s.name === 'external-lokka')!.env!) : [],
          fetchEnabled: this.config.mcpServers.find(s => s.name === 'fetch')?.enabled,
          microsoftDocsEnabled: this.config.mcpServers.find(s => s.name === 'microsoft-docs')?.enabled
        });
      } catch (error) {
        console.error('[Main] Error updating MCP server configuration:', error);
      }
      
      // Get updated authentication configuration before reinitializing services
      console.log('[Main] Getting updated authentication configuration for reinitialize...');
      const updatedAuthConfig = await this.getAuthConfiguration();
      console.log('[Main] Updated auth config for reinitialize:', {
        clientId: updatedAuthConfig.clientId.substring(0, 8) + '...',
        tenantId: updatedAuthConfig.tenantId.substring(0, 8) + '...',
        hasClientSecret: Boolean(updatedAuthConfig.clientSecret)
      });
      
      // Update main config with new auth settings
      this.config.auth = {
        clientId: updatedAuthConfig.clientId,
        tenantId: updatedAuthConfig.tenantId,
        scopes: this.config.auth.scopes, // Keep existing scopes
        ...(updatedAuthConfig.clientSecret && { clientSecret: updatedAuthConfig.clientSecret }),
        useClientCredentials: Boolean(updatedAuthConfig.clientSecret)
      };
      
      console.log('[Main] Updated main config auth for reinitialize:', {
        clientId: this.config.auth.clientId.substring(0, 8) + '...',
        tenantId: this.config.auth.tenantId.substring(0, 8) + '...',
        useClientCredentials: this.config.auth.useClientCredentials
      });

      // Check if client ID has changed - if so, clear MSAL cache to prevent token conflicts
      const currentClientId = this.config.auth.clientId;
      const previousClientId = this.previousClientId || currentClientId;
      
      if (previousClientId !== currentClientId) {
        console.log('[Main] 🧹 Client ID changed, clearing MSAL token cache...');
        console.log(`[Main] Previous client ID: ${previousClientId.substring(0, 8)}...`);
        console.log(`[Main] New client ID: ${currentClientId.substring(0, 8)}...`);
        
        try {
          if (this.authService) {
            await this.authService.clearTokenCache();
            console.log('[Main] ✅ MSAL token cache cleared successfully');
          }
        } catch (error) {
          console.warn('[Main] ⚠️ Could not clear token cache:', error);
          // Continue anyway - non-fatal error
        }
      } else {
        console.log('[Main] Client ID unchanged, keeping existing cache');
      }
      
      // Store current client ID for next comparison
      this.previousClientId = currentClientId;

      // Reinitialize AuthService with updated configuration
      this.authService = new AuthService(this.config);
      
      // Update GraphService with new AuthService
      this.graphService = new GraphService(this.authService);
        // Reinitialize MCP services
      const mcpAuthService = new MCPAuthService(this.authService);
      console.log('[Main] Reinitializing MCP client with updated server configs:', this.config.mcpServers);
        // Stop existing MCP services gracefully
      if (this.mcpServerManager) {
        try {
          console.log('[Main] Stopping existing MCP server manager...');
          await this.mcpServerManager.stopAllServers();
          console.log('[Main] MCP server manager stopped successfully');
        } catch (error) {
          console.warn('[Main] Error stopping MCP server manager:', error);
        }
      }
      if (this.mcpClient) {
        try {
          console.log('[Main] Stopping existing MCP client...');
          await this.mcpClient.stopAllServers();
          console.log('[Main] MCP client stopped successfully');
        } catch (error) {
          console.warn('[Main] Error stopping MCP client:', error);
        }
      }
      
      // Wait a moment for services to fully stop
      await new Promise(resolve => setTimeout(resolve, 500));
        // Create new MCP services with updated configuration
      console.log('[Main] Creating new MCP services with updated configs...');
      console.log('[Main] MCP server configs for initialization:', 
        this.config.mcpServers.map(s => ({
          name: s.name,
          type: s.type,
          enabled: s.enabled,
          hasEnv: Boolean(s.env),
          envKeys: s.env ? Object.keys(s.env) : []        }))
      );      
      this.mcpServerManager = new MCPServerManager(this.config.mcpServers, mcpAuthService, this.configService);
      this.mcpClient = new MCPClient(this.config.mcpServers, mcpAuthService);
        
      // Start the new MCP servers explicitly
      console.log('[Main] Starting new MCP servers...');
      try {
        // The MCPServerManager constructor normally starts the servers, but let's be explicit
        // and ensure the Lokka MCP server is started if it's enabled
          // Find the Lokka server config
        const lokkaConfig = this.config.mcpServers.find(server => server.name === 'external-lokka');
        
        if (lokkaConfig && lokkaConfig.enabled) {
          console.log('[Main] Ensuring Lokka MCP server is started...');
          
          try {
            // Use our new method in MCPClient to start the Lokka server explicitly
            await this.mcpClient.startServer('external-lokka');
            console.log('[Main] ✅ Lokka MCP server started explicitly through client');
          } catch (error) {
            // Check if this is an authentication error (user not logged in yet)
            if (error instanceof Error && error.message.includes('without valid access token')) {
              console.log('[Main] ⏸️ Lokka MCP server startup delayed - waiting for user authentication');
              console.log('[Main] 📌 Lokka will be started automatically after successful login');
            } else {
              console.error('[Main] Failed to start Lokka MCP server through client:', error);
              
              // Fallback to using server manager directly
              const lokkaServer = this.mcpServerManager.getServer('external-lokka');
              if (lokkaServer && lokkaServer.startServer) {
                console.log('[Main] Attempting to start Lokka MCP server through manager...');
                try {
                  await lokkaServer.startServer();
                  console.log('[Main] ✅ Lokka MCP server started explicitly through manager');
                } catch (managerError) {
                  // Check if this is also an authentication error
                  if (managerError instanceof Error && managerError.message.includes('without valid access token')) {
                    console.log('[Main] ⏸️ Lokka MCP server startup delayed via manager - waiting for user authentication');
                  } else {
                    console.error('[Main] Failed to start Lokka MCP server through manager:', managerError);
                  }
                }
              } else {
                console.warn('[Main] Could not find Lokka server instance in manager');
              }
            }
          }
        } else {
          console.log('[Main] Lokka server is not enabled, skipping explicit start');
        }
        
        // Wait a moment for servers to fully initialize
        await new Promise(resolve => setTimeout(resolve, 1000));        // Verify available servers
        const availableServers = this.mcpClient.getAvailableServers();
        console.log('[Main] Number of available MCP servers after reinitialization:', availableServers.length);
        
        // MCPClient.getAvailableServers() returns MCPServerConfig[] of enabled servers
        const lokkaServerExists = availableServers.some(server => server.name === 'external-lokka');
        if (lokkaServerExists) {
          console.log('[Main] ✅ External Lokka MCP server is available');
        } else {
          console.warn('[Main] ⚠️ External Lokka MCP server is NOT available');
          console.log('[Main] Available servers:', availableServers.map(s => s.name));
        }
        
        console.log('[Main] MCP services reinitialized successfully');
      } catch (error) {
        console.error('[Main] Error starting new MCP servers:', error);
      }      // Get updated LLM configuration
      const storedLLMConfig = this.configService.getLLMConfig();
      const defaultCloudProvider = this.configService.getDefaultCloudProvider();
      let llmConfig = this.config.llm;
      
      console.log('[Main] LLM Selection Debug:', {
        storedProvider: storedLLMConfig?.provider,
        storedPreferLocal: storedLLMConfig?.preferLocal,
        defaultCloudProvider: defaultCloudProvider?.provider,
        hasDefaultCloud: !!defaultCloudProvider
      });
      
      // Implement preferLocal logic
      if (storedLLMConfig) {
        if (storedLLMConfig.preferLocal && (storedLLMConfig.provider === 'ollama' || storedLLMConfig.provider === 'lmstudio')) {
          // User prefers local and has configured a local provider
          console.log('[Main] 🖥️ Using local LLM (preferLocal=true):', storedLLMConfig.provider);
          llmConfig = storedLLMConfig;
        } else if (defaultCloudProvider && (storedLLMConfig.provider === 'openai' || storedLLMConfig.provider === 'anthropic' || storedLLMConfig.provider === 'gemini' || storedLLMConfig.provider === 'azure-openai')) {
          // User has selected a cloud provider or preferLocal is false
          console.log('[Main] ☁️ Using cloud LLM (default provider):', defaultCloudProvider.provider);
          llmConfig = {
            provider: defaultCloudProvider.provider,
            model: defaultCloudProvider.config.model,
            apiKey: defaultCloudProvider.config.apiKey,
            baseUrl: defaultCloudProvider.config.baseUrl,
            temperature: defaultCloudProvider.config.temperature,
            maxTokens: defaultCloudProvider.config.maxTokens,
            organization: defaultCloudProvider.config.organization,
            preferLocal: storedLLMConfig.preferLocal // Preserve the preference
          };
        } else {
          // Use the stored configuration as-is
          console.log('[Main] 📋 Using stored LLM config:', storedLLMConfig.provider);
          llmConfig = storedLLMConfig;
        }
      } else if (defaultCloudProvider) {
        // Fallback to default cloud provider if no stored config
        console.log('[Main] ☁️ Fallback to default cloud provider:', defaultCloudProvider.provider);
        llmConfig = {
          provider: defaultCloudProvider.provider,
          model: defaultCloudProvider.config.model,
          apiKey: defaultCloudProvider.config.apiKey,
          baseUrl: defaultCloudProvider.config.baseUrl,
          temperature: defaultCloudProvider.config.temperature,
          maxTokens: defaultCloudProvider.config.maxTokens,
          organization: defaultCloudProvider.config.organization
        };
      } else {
        console.warn('[Main] No LLM configuration available - neither stored config nor default cloud provider');
      }
        // Reinitialize LLM service
      if (this.llmService && typeof this.llmService.dispose === 'function') {
        this.llmService.dispose();
        console.log('[Main] Disposed previous LLM service instance');
      }
      this.llmService = new EnhancedLLMService(llmConfig, this.authService, this.mcpClient);
      
      console.log('[Main] Services reinitialized successfully');
        // Notify renderer that configuration has been updated - but only if not already notified
      if (this.mainWindow && !this.configurationAvailabilityNotified) {
        console.log('📡 [Main] Sending auth:configurationAvailable event from config-update - FIRST TIME ONLY');
        this.configurationAvailabilityNotified = true;
        this.mainWindow.webContents.send('auth:configurationAvailable', { source: 'config-update' });
      }
      
    } catch (error) {
      console.error('[Main] Failed to reinitialize services:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // Set application ID for Windows taskbar
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.darrenjrobinson.entrapulselite');
    }    app.whenReady().then(async () => {
      this.createWindow();
      this.setupMenu();
      this.setupIpcHandlers();
      this.setupGlobalShortcuts();
      
      // Check for existing authentication session after everything is set up
      await this.initializeAuthenticationState();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
      });
    });app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
      // Flag to track if cleanup has been completed
    let cleanupDone = false;
    
    app.on('will-quit', async (event) => {
      // Prevent default quit and perform cleanup only once
      if (!cleanupDone) {
        event.preventDefault();
          try {
          // Unregister all global shortcuts
          globalShortcut.unregisterAll();
          console.log('Global shortcuts unregistered');
          
          // Dispose of LLM service to clean up resources
          if (this.llmService && typeof this.llmService.dispose === 'function') {
            this.llmService.dispose();
            console.log('LLM service disposed');
          }
          
          // Stop all MCP servers gracefully before quitting
          await this.mcpClient.stopAllServers();
          console.log('MCP servers stopped');
          
          // Set the flag to avoid repeated cleanup
          cleanupDone = true;
          
          // Continue with the quit process
          app.exit();
        } catch (error) {
          console.error('Error during cleanup:', error);
          cleanupDone = true;
          app.exit();
        }
      }
    });
  }
  private createWindow(): void {
    this.mainWindow = new BrowserWindow({      width: 1280,
      height: 900,
      minWidth: 900,
      minHeight: 700,
      icon: process.platform === 'win32'
        ? path.resolve(process.resourcesPath || app.getAppPath(), 'assets', 'icon.ico')
        : path.resolve(process.resourcesPath || app.getAppPath(), 'assets', 'EntraPulseLiteLogo.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      titleBarStyle: 'default',
      show: false, // Don't show until ready
    });

    // Load the index.html from the dist directory
    this.mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      
      // Set up auto-updater with the main window reference
      if (this.autoUpdaterService && this.mainWindow) {
        this.autoUpdaterService.setMainWindow(this.mainWindow);
        
        // Check for updates on startup (with delay)
        this.autoUpdaterService.checkForUpdatesOnStartup();
      }
    });

    // Open DevTools in development or if explicitly enabled
    if (process.env.NODE_ENV === 'development' || 
        process.env.ENABLE_DEVTOOLS === 'true' ||
        process.env.DEBUG_MODE === 'true') {
      this.mainWindow.webContents.openDevTools();
    }
    // Show additional debugging information in console when debug mode is enabled
    if (process.env.DEBUG_MODE === 'true') {
      console.log('🐛 Debug mode enabled - Enhanced logging active');
      this.mainWindow.webContents.openDevTools();
    }
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (this.mainWindow) {
        if (this.mainWindow.webContents.isDevToolsOpened()) {
          this.mainWindow.webContents.closeDevTools();
        } else {
          this.mainWindow.webContents.openDevTools();
        }
      }
    });
    
    // Also register F12 as alternative DevTools shortcut
    globalShortcut.register('F12', () => {
      if (this.mainWindow) {
        if (this.mainWindow.webContents.isDevToolsOpened()) {
          this.mainWindow.webContents.closeDevTools();
        } else {
          this.mainWindow.webContents.openDevTools();
        }
      }
    });
    
    // Ctrl+Shift+J - Chrome DevTools console shortcut
    globalShortcut.register('CommandOrControl+Shift+J', () => {
      if (this.mainWindow) {
        if (this.mainWindow.webContents.isDevToolsOpened()) {
          this.mainWindow.webContents.closeDevTools();
        } else {
          this.mainWindow.webContents.openDevTools();
        }
      }
    });
    
    // Ctrl+Shift+K - Firefox DevTools console shortcut
    globalShortcut.register('CommandOrControl+Shift+K', () => {
      if (this.mainWindow) {
        if (this.mainWindow.webContents.isDevToolsOpened()) {
          this.mainWindow.webContents.closeDevTools();
        } else {
          this.mainWindow.webContents.openDevTools();
        }
      }
    });
  }

  private setupMenu(): void {
    // In production, hide the menu entirely for a cleaner app experience
    if (process.env.NODE_ENV !== 'development') {
      Menu.setApplicationMenu(null);
      return;
    }

    // Development menu with DevTools and debug options
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              // Open settings window
            },
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
        ],
      },      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { 
            role: 'toggleDevTools',
            accelerator: 'F12'
          },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About EntraPulse Lite',
            click: () => {
              // Show about dialog
            },
          },
        ],
      },
    ];    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private setupGlobalShortcuts(): void {
    // Only register development shortcuts in development mode
    if (process.env.NODE_ENV !== 'development') {
      console.log('Production mode: Development shortcuts disabled');
      return;
    }

    // Register F12 to toggle DevTools - this ensures it works even if menu doesn't respond
    globalShortcut.register('F12', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.toggleDevTools();
      }
    });

    // Register Ctrl+Shift+I as backup shortcut for DevTools
    globalShortcut.register('CmdOrCtrl+Shift+I', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.toggleDevTools();
      }
    });

    console.log('Development mode: Global shortcuts registered: F12 and Ctrl+Shift+I for DevTools');
  }

  private setupIpcHandlers(): void {
    // Asset path handler with comprehensive debugging
    ipcMain.handle('app:getAssetPath', (event, assetName: string) => {
      // Handle different asset locations based on build system
      let assetPath: string;
      
      this.sendDebugToRenderer(`Asset path request for: ${assetName}`);
      this.sendDebugToRenderer(`App is packaged: ${app.isPackaged}`);
      this.sendDebugToRenderer(`Process resourcesPath: ${process.resourcesPath}`);
      this.sendDebugToRenderer(`App getAppPath: ${app.getAppPath()}`);
      this.sendDebugToRenderer(`__dirname: ${__dirname}`);
      
      if (app.isPackaged) {
        // For packaged apps, try multiple possible asset locations
        if (process.resourcesPath) {
          // Electron Builder puts assets in resources/assets
          assetPath = path.join(process.resourcesPath, 'assets', assetName);
          this.sendDebugToRenderer(`Using Electron Builder path: ${assetPath}`);
        } else {
          // Fallback to app path for other packagers
          assetPath = path.join(app.getAppPath(), 'assets', assetName);
          this.sendDebugToRenderer(`Using fallback app path: ${assetPath}`);
        }
      } else {
        // Development mode - assets are in the project root
        assetPath = path.join(__dirname, '..', '..', 'assets', assetName);
        this.sendDebugToRenderer(`Using development path: ${assetPath}`);
      }
      
      // Check if the file exists and log the result
      const fs = require('fs');
      const exists = fs.existsSync(assetPath);
      this.sendDebugToRenderer(`Asset path exists: ${exists} - ${assetPath}`);
      
      return assetPath;
    });

    // DevTools toggle handler
    ipcMain.handle('app:toggleDevTools', () => {
      if (this.mainWindow) {
        if (this.mainWindow.webContents.isDevToolsOpened()) {
          this.mainWindow.webContents.closeDevTools();
        } else {
          this.mainWindow.webContents.openDevTools();
        }
      }
    });

    // Authentication handlers
    ipcMain.handle('auth:login', async () => {
      // Send debug info to renderer immediately
      this.mainWindow?.webContents.send('main-debug', '🔐 [AUTH-HANDLER] *** IPC AUTH:LOGIN HANDLER CALLED ***');
      
      console.log('🔐 [AUTH-HANDLER] auth:login IPC handler called!');
      try {
        console.log('🔐 [AUTH-HANDLER] Starting authService.login()...');
        this.mainWindow?.webContents.send('main-debug', '🔐 [AUTH-HANDLER] Starting authService.login()...');
        
        const result = await this.authService.login();
        
        console.log('🔐 [AUTH-HANDLER] authService.login() completed:', {
          success: !!result,
          resultType: typeof result
        });
        this.mainWindow?.webContents.send('main-debug', `🔐 [AUTH-HANDLER] authService.login() completed: success=${!!result}`);
          // After successful login, reinitialize LLM service with full configuration
        if (result) {
          this.mainWindow?.webContents.send('main-debug', '🔐 [AUTH-SUCCESS] Login successful, reloading LLM configuration...');
          
          console.log('🔐 [AUTH-SUCCESS] Login successful, reloading LLM configuration...');
          console.log('🔐 [AUTH-SUCCESS] Authentication result:', {
            success: !!result,
            hasAccessToken: !!(result && result.accessToken),
            tokenLength: result?.accessToken?.length || 0,
            scopes: result?.scopes || []
          });
            // CRITICAL: Set authentication verification flag first
          this.configService.setAuthenticationVerified(true);
          
          // Get current user information for proper context setting
          const currentUser = await this.authService.getCurrentUser();
          
          // Get Entra config and set authentication context (always interactive/delegated mode)
          const storedEntraConfig = this.configService.getEntraConfig();
          const authContext = 'interactive'; // Always use delegated permissions
          
          // Set authentication context with user information for interactive mode
          if (currentUser) {
            console.log('🔐 Setting interactive authentication context with user info');
            this.configService.setAuthenticationContext(authContext, {
              id: currentUser.localAccountId || currentUser.username || 'default-user',
              email: currentUser.username
            });
          } else {
            console.log('🔐 Setting authentication context:', authContext);
            this.configService.setAuthenticationContext(authContext);
          }
          
          // Get the full LLM configuration now that we're authenticated
          const fullLLMConfig = this.configService.getLLMConfig();
          console.log('🔧 Reloading LLM service with full configuration including cloud providers');
          // Reinitialize LLM service with full config
          this.llmService = new EnhancedLLMService(fullLLMConfig, this.authService, this.mcpClient);
          
          // Always configure Lokka MCP for authenticated users
          console.log('🔧 Configuring Lokka MCP server for authenticated user...');
          const lokkaServerIndex = this.config.mcpServers.findIndex(server => server.name === 'external-lokka');
          
          if (lokkaServerIndex !== -1) {
            let env: Record<string, string>;
            let authMode: string;
            
            if (storedEntraConfig && (
                (storedEntraConfig.clientId && storedEntraConfig.tenantId) ||
                storedEntraConfig.useGraphPowerShell
              )) {
              // Stored Entra config exists - use Enhanced Graph Access or custom credentials
              console.log('🔐 Using stored Entra credentials for Lokka MCP...');
              
              // Priority 1: Custom credentials (when custom client ID and tenant ID are provided and NOT using Enhanced Graph Access)
              if (storedEntraConfig.clientId && storedEntraConfig.tenantId && !storedEntraConfig.useGraphPowerShell) {
                console.log('🔧 Using custom application credentials (Priority 1) for Lokka MCP');
                const clientId = storedEntraConfig.clientId;
                authMode = 'custom-credentials';
                
                // CRITICAL FIX: Even for custom credentials, we need to get the user's access token when using USE_CLIENT_TOKEN=true
                try {
                  const token = await this.authService.getToken();
                  
                  if (token && token.accessToken) {
                    console.log('🔐 [ACCESS-TOKEN-CUSTOM] Successfully obtained user access token for custom credentials');
                    console.log(`🔧 [ACCESS-TOKEN-CUSTOM] Token length: ${token.accessToken.length} characters`);
                    console.log(`🔧 [ACCESS-TOKEN-CUSTOM] Token expires: ${token.expiresOn ? new Date(token.expiresOn).toISOString() : 'Unknown'}`);
                    this.mainWindow?.webContents.send('main-debug', `🔐 [ACCESS-TOKEN-CUSTOM] Got user access token for custom credentials: ${token.accessToken.length} chars`);
                    
                    env = {
                      TENANT_ID: storedEntraConfig.tenantId,
                      CLIENT_ID: clientId,
                      ACCESS_TOKEN: token.accessToken,
                      USE_INTERACTIVE: 'false', // Use provided token, don't authenticate interactively
                      USE_CLIENT_TOKEN: 'true'
                    };
                  } else {
                    console.error('❌ Failed to get user access token for custom credentials, falling back to client token mode');
                    this.mainWindow?.webContents.send('main-debug', '❌ Failed to get user access token for custom credentials');
                    env = {
                      TENANT_ID: storedEntraConfig.tenantId,
                      CLIENT_ID: clientId,
                      USE_CLIENT_TOKEN: 'true'
                    };
                  }
                } catch (error) {
                  console.error('❌ Error getting user access token for custom credentials:', error);
                  this.mainWindow?.webContents.send('main-debug', `❌ Error getting user access token for custom credentials: ${(error as Error).message}`);
                  env = {
                    TENANT_ID: storedEntraConfig.tenantId,
                    CLIENT_ID: clientId,
                    USE_CLIENT_TOKEN: 'true'
                  };
                }
              }
              // Priority 2: Enhanced Graph Access (when explicitly enabled)
              else if (storedEntraConfig.useGraphPowerShell) {
                console.log('🔧 Using Enhanced Graph Access mode (Priority 2) - leveraging user\'s token with enhanced permissions');
                authMode = 'enhanced-graph-access';
                
                try {
                  // For Enhanced Graph Access, use the current user's token directly
                  // The user's token already has enhanced permissions due to the Graph PowerShell consent
                  const token = await this.authService.getToken();
                  
                  if (token && token.accessToken) {
                    console.log('🔐 [ACCESS-TOKEN] Successfully obtained user access token for Enhanced Graph Access');
                    console.log(`🔧 [ACCESS-TOKEN] Token length: ${token.accessToken.length} characters`);
                    console.log(`🔧 [ACCESS-TOKEN] Token expires: ${token.expiresOn ? new Date(token.expiresOn).toISOString() : 'Unknown'}`);
                    console.log(`🔧 [ACCESS-TOKEN] Token preview: ${token.accessToken.substring(0, 50)}...`);
                    env = {
                      TENANT_ID: 'common', // Use 'common' for multi-tenant Enhanced Graph Access
                      CLIENT_ID: process.env.MSAL_CLIENT_ID || 'ad6e8b1b-4ced-4088-bd72-d3d02e71df4e', // Current client ID
                      ACCESS_TOKEN: token.accessToken,
                      USE_INTERACTIVE: 'false', // Use provided token, don't authenticate interactively
                      USE_CLIENT_TOKEN: 'true' // Required for Lokka to use client-provided-token mode
                    };
                  } else {
                    console.error('❌ Failed to get user access token for Enhanced Graph Access, falling back to client token mode');
                    env = {
                      TENANT_ID: 'common',
                      CLIENT_ID: process.env.MSAL_CLIENT_ID || 'ad6e8b1b-4ced-4088-bd72-d3d02e71df4e',
                      USE_CLIENT_TOKEN: 'true'
                    };
                  }
                } catch (error) {
                  console.error('❌ Error getting user access token for Enhanced Graph Access:', error);
                  console.log('🔧 Falling back to client token mode');
                  env = {
                    TENANT_ID: 'common',
                    CLIENT_ID: process.env.MSAL_CLIENT_ID || 'ad6e8b1b-4ced-4088-bd72-d3d02e71df4e',
                    USE_CLIENT_TOKEN: 'true'
                  };
                }
              } else {
                // Priority 3: Default fallback mode
                console.log('🔧 Using default delegated mode with default client ID');
                const clientId = process.env.MSAL_CLIENT_ID || 'ad6e8b1b-4ced-4088-bd72-d3d02e71df4e';
                authMode = 'delegated';
                env = {
                  TENANT_ID: 'common',
                  CLIENT_ID: clientId,
                  USE_CLIENT_TOKEN: 'true'
                };
              }
            } else {
              // No stored Entra config - User Token (Delegated Permissions) mode
              console.log('🔐 No stored credentials found - using User Token (Delegated Permissions) mode');
              authMode = 'user-token-delegated';
              
              try {
                // Get the current user's access token
                const token = await this.authService.getToken();
                
                if (token && token.accessToken) {
                  console.log('🔐 [ACCESS-TOKEN-USER] Successfully obtained user access token for Lokka MCP');
                  console.log(`🔧 [ACCESS-TOKEN-USER] Token length: ${token.accessToken.length} characters`);
                  console.log(`🔧 [ACCESS-TOKEN-USER] Token expires: ${token.expiresOn ? new Date(token.expiresOn).toISOString() : 'Unknown'}`);
                  console.log(`🔧 [ACCESS-TOKEN-USER] Token preview: ${token.accessToken.substring(0, 50)}...`);
                  env = {
                    TENANT_ID: 'common', // Use common for multi-tenant user tokens
                    CLIENT_ID: process.env.MSAL_CLIENT_ID || 'ad6e8b1b-4ced-4088-bd72-d3d02e71df4e', // Default EntraPulse Lite client ID
                    ACCESS_TOKEN: token.accessToken,
                    USE_INTERACTIVE: 'false', // Use provided token, don't authenticate interactively
                    USE_CLIENT_TOKEN: 'true' // Required for Lokka to use client-provided-token mode
                  };
                } else {
                  console.error('❌ Failed to get user access token for Lokka MCP');
                  // Fall back to client token mode
                  env = {
                    TENANT_ID: 'common',
                    CLIENT_ID: process.env.MSAL_CLIENT_ID || 'ad6e8b1b-4ced-4088-bd72-d3d02e71df4e',
                    USE_CLIENT_TOKEN: 'true'
                  };
                }
              } catch (error) {
                console.error('❌ Error getting user access token for Lokka MCP:', error);
                // Fall back to client token mode
                env = {
                  TENANT_ID: 'common',
                  CLIENT_ID: process.env.MSAL_CLIENT_ID || 'ad6e8b1b-4ced-4088-bd72-d3d02e71df4e',
                  USE_CLIENT_TOKEN: 'true'
                };
              }
            }

            // Update Lokka MCP server configuration
            this.config.mcpServers[lokkaServerIndex] = {
              ...this.config.mcpServers[lokkaServerIndex],
              enabled: true, // Enable for any authenticated user
              env
            };
            
            console.log(`✅ Updated Lokka MCP server configuration after login (mode: ${authMode})`);
            const displayClientId = env.CLIENT_ID ? env.CLIENT_ID.substring(0, 8) + '...' : 'None';
            console.log(`🔧 Lokka client ID: ${displayClientId}`);
            const authMethod = env.ACCESS_TOKEN ? 'direct access token' : (env.USE_CLIENT_TOKEN ? 'delegated (client token)' : 'application credentials');
            console.log(`🔧 Lokka auth method: ${authMethod}`);
            
            // Reinitialize MCP services with updated config
            const mcpAuthService = new MCPAuthService(this.authService);
            
            // Stop existing MCP services gracefully
            if (this.mcpServerManager) {
              try {
                await this.mcpServerManager.stopAllServers();
              } catch (error) {
                console.warn('Error stopping MCP server manager:', error);
              }
            }
            
            // Create new MCP services with updated configuration
            this.mcpServerManager = new MCPServerManager(this.config.mcpServers, mcpAuthService, this.configService);
            this.mcpClient = new MCPClient(this.config.mcpServers, mcpAuthService);
            
            console.log('🚀 MCP services reinitialized with authentication context');
            
            // NOW explicitly start the Lokka MCP server after successful authentication
            console.log('🔄 [LOKKA-RESTART] Starting Lokka MCP server after successful authentication...');
            this.mainWindow?.webContents.send('main-debug', '🔄 [LOKKA-RESTART] Starting Lokka MCP server after successful authentication...');
            
            console.log('🔄 [LOKKA-RESTART] Environment variables for restart:', {
              hasAccessToken: !!env.ACCESS_TOKEN,
              useClientToken: env.USE_CLIENT_TOKEN,
              clientId: env.CLIENT_ID ? env.CLIENT_ID.substring(0, 8) + '...' : 'None',
              tenantId: env.TENANT_ID,
              authMode: authMode
            });
            this.mainWindow?.webContents.send('main-debug', `🔄 [LOKKA-RESTART] Environment variables for restart: hasAccessToken=${!!env.ACCESS_TOKEN}, authMode=${authMode}`);
            
            try {
              await this.mcpClient.startServer('external-lokka');
              console.log('✅ [LOKKA-RESTART] Lokka MCP server started successfully after authentication');
            } catch (lokkaError) {
              console.error('❌ [LOKKA-RESTART] Failed to start Lokka MCP server after authentication:', lokkaError);
              // Try the server manager as fallback
              try {
                const lokkaServer = this.mcpServerManager.getServer('external-lokka');
                if (lokkaServer && lokkaServer.startServer) {
                  await lokkaServer.startServer();
                  console.log('✅ [LOKKA-RESTART] Lokka MCP server started successfully via server manager after authentication');
                } else {
                  console.warn('⚠️ [LOKKA-RESTART] Could not find Lokka server instance in manager');
                }
              } catch (managerError) {
                console.error('❌ [LOKKA-RESTART] Failed to start Lokka via server manager after authentication:', managerError);
              }
            }
          } else {
            console.log('⚠️ Lokka MCP server not found in configuration');
          }
        }
        
        console.log('🔐 [AUTH-HANDLER] Authentication flow completed successfully');
        this.mainWindow?.webContents.send('main-debug', '🔐 [AUTH-HANDLER] Authentication flow completed successfully');
        return result;
      } catch (error) {
        console.error('🔐 [AUTH-HANDLER] Login failed:', error);
        this.mainWindow?.webContents.send('main-debug', `🔐 [AUTH-HANDLER] Login failed: ${(error as Error).message}`);
        
        console.error('🔐 [AUTH-HANDLER] Error details:', {
          message: (error as Error).message,
          stack: (error as Error).stack,
          errorType: typeof error
        });
        throw error;
      }
    });    ipcMain.handle('auth:logout', async () => {
      try {
        await this.authService.logout();
        
        // Reset authentication verification flag on logout
        this.configService.setAuthenticationVerified(false);
        
        // Reset configuration availability notification flag for next login session
        this.configurationAvailabilityNotified = false;
        console.log('[Main] Reset configurationAvailabilityNotified flag on logout');
        
        return true;
      } catch (error) {
        console.error('Logout failed:', error);
        throw error;
      }
    });

    // Authentication logout broadcast handler
    ipcMain.on('auth:logoutBroadcast', (event, data) => {
      console.log('🔔 [Main] Logout broadcast requested:', data);
      // Broadcast to all renderer processes
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('auth:logout', data);
        console.log('✅ [Main] Logout event broadcasted to renderer');
      }
    });

    ipcMain.handle('auth:getToken', async () => {
      try {
        return await this.authService.getToken();
      } catch (error) {
        console.error('Get token failed:', error);
        return null;
      }
    });

    ipcMain.handle('auth:getCurrentUser', async () => {
      try {
        return await this.authService.getCurrentUser();
      } catch (error) {
        console.error('Get current user failed:', error);
        return null;
      }
    });

    ipcMain.handle('auth:getIdTokenClaims', async () => {
      try {
        return await this.authService.getIdTokenClaims();
      } catch (error) {
        console.error('Get ID token claims failed:', error);
        return null;
      }
    });

    // Progressive permission handlers
    ipcMain.handle('auth:requestPermissions', async (event, permissions: string[]) => {
      try {
        return await this.authService.requestAdditionalPermissions(permissions);
      } catch (error) {
        console.error('Request permissions failed:', error);
        return null;
      }
    });

    ipcMain.handle('auth:getTokenWithPermissions', async (event, permissions: string[]) => {
      try {
        return await this.authService.getTokenWithPermissions(permissions);
      } catch (error) {
        console.error('Get token with permissions failed:', error);
        return null;
      }
    });

    ipcMain.handle('auth:getAuthenticationInfo', async () => {
      try {
        return await this.authService.getAuthenticationInfoWithToken();
      } catch (error) {
        console.error('Get authentication info failed:', error);
        return null;
      }
    });

    // Token cache management handlers
    ipcMain.handle('auth:clearTokenCache', async () => {
      try {
        await this.authService.clearTokenCache();
        return { success: true };
      } catch (error) {
        console.error('Clear token cache failed:', error);
        throw error;
      }
    });

    ipcMain.handle('auth:forceReauthentication', async () => {
      try {
        return await this.authService.forceReauthentication();
      } catch (error) {
        console.error('Force reauthentication failed:', error);
        throw error;
      }
    });    ipcMain.handle('auth:testConfiguration', async (event, testConfig) => {
      try {
        console.log('🧪 Testing authentication configuration via IPC...');
        console.log('🔧 Test config:', {
          hasClientId: !!testConfig.clientId,
          hasClientSecret: !!testConfig.clientSecret,
          useApplicationCredentials: testConfig.useApplicationCredentials,
          useGraphPowerShell: testConfig.useGraphPowerShell
        });
        
        // Determine authentication configuration based on user's settings
        let clientId = testConfig.clientId;
        let useClientCredentials = false;
        let scopes = ['https://graph.microsoft.com/.default'];
          // Check if Enhanced Graph Access is enabled and not in application credentials mode
        if (testConfig.useGraphPowerShell && !testConfig.useApplicationCredentials) {
          console.log('🔧 Testing Enhanced Graph Access mode with Microsoft Graph PowerShell client ID');
          clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e'; // Microsoft Graph PowerShell client ID
          useClientCredentials = false; // Force delegated mode
          scopes = [
            'https://graph.microsoft.com/User.Read',
            'https://graph.microsoft.com/Mail.Read',
            'https://graph.microsoft.com/Mail.ReadWrite',
            'https://graph.microsoft.com/Calendars.Read',
            'https://graph.microsoft.com/Files.Read.All',
            'https://graph.microsoft.com/Directory.Read.All'
          ]; // Request specific mail and other permissions
        } else if (testConfig.useApplicationCredentials && testConfig.clientSecret) {
          console.log('🔧 Testing Application Credentials mode');
          useClientCredentials = true;
          scopes = ['https://graph.microsoft.com/.default'];
        } else {
          console.log('🔧 Testing User Token (delegated) mode');
          useClientCredentials = false;
          scopes = ['https://graph.microsoft.com/.default'];
        }
        
        // Create AppConfig from the provided Entra config
        const appConfig = {
          auth: {
            clientId,
            tenantId: testConfig.tenantId,
            clientSecret: testConfig.clientSecret,
            useClientCredentials,
            scopes
          }
        };

        console.log('🧪 Testing with configuration:', {
          clientId: clientId.substring(0, 8) + '...',
          useClientCredentials,
          scopes,
          authMode: testConfig.useGraphPowerShell ? 'enhanced-delegated' : 
                    testConfig.useApplicationCredentials ? 'application-credentials' : 'delegated'
        });

        return await this.authService.testAuthentication(appConfig);
      } catch (error) {
        console.error('Auth configuration test failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // Microsoft Graph handlers
    ipcMain.handle('graph:query', async (event, endpoint: string, method?: string, data?: any) => {
      try {
        return await this.graphService.query(endpoint, method, data);
      } catch (error) {
        console.error('Graph query failed:', error);
        throw error;
      }
    });
    
    ipcMain.handle('graph:getUserPhoto', async (event, userId?: string) => {
      try {
        return await this.graphService.getUserPhoto(userId);
      } catch (error) {
        console.error('Get user photo failed:', error);
        return null;
      }
    });    // Photo cache management handlers
    ipcMain.handle('graph:clearPhotoCache', async () => {
      try {
        this.graphService.clearPhotoCache();
        return { success: true };
      } catch (error) {
        console.error('Clear photo cache failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('graph:clearUserPhotoCache', async (event, userId: string) => {
      try {
        this.graphService.clearUserPhotoCache(userId);
        return { success: true };
      } catch (error) {
        console.error('Clear user photo cache failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('graph:getPhotoCacheStats', async () => {
      try {
        return this.graphService.getPhotoCacheStats();
      } catch (error) {
        console.error('Get photo cache stats failed:', error);
        return null;
      }
    });    // LLM handlers
    ipcMain.handle('llm:chat', async (event, messages: any, sessionId?: string) => {
      try {
        // Ensure Lokka MCP server is running before chat
        // This handles the case where the user has authenticated but server isn't started
        await this.ensureLokkaMCPServerRunning();
        
        // Use provided session ID if available, otherwise generate a new one
        const effectiveSessionId = sessionId || `session-${event.sender.id}-${Date.now()}`;
        
        console.log(`🔄 Main Process: Received sessionId: ${sessionId}, Using: ${effectiveSessionId}, Messages: ${messages.length}`);
        
        // Now proceed with enhanced chat with conversation context
        return await this.llmService.enhancedChat(messages, effectiveSessionId);
      } catch (error) {
        console.error('LLM chat failed:', error);
        throw error;
      }
    });
    
    ipcMain.handle('llm:isAvailable', async () => {
      try {
        return await this.llmService.isAvailable();
      } catch (error) {
        console.error('LLM availability check failed:', error);
        return false;
      }
    });

    // Check specifically for local LLM availability (Ollama/LM Studio)
    ipcMain.handle('llm:isLocalAvailable', async () => {
      try {
        // Check if we have a local LLM service configured and available
        const config = this.configService.getLLMConfig();
        
        // Only check local providers
        if (config.provider === 'ollama' || config.provider === 'lmstudio') {
          const localLLM = new LLMService(config);
          return await localLLM.isAvailable();
        }
        
        // If current provider is cloud, check if we have local providers configured and available
        const defaultOllamaConfig = {
          provider: 'ollama' as const,
          baseUrl: 'http://localhost:11434',
          model: 'llama2',
          temperature: 0.7,
          maxTokens: 2048
        };
        
        const ollamaService = new LLMService(defaultOllamaConfig);
        const ollamaAvailable = await ollamaService.isAvailable();
        
        if (ollamaAvailable) return true;
        
        // Also check LM Studio
        const defaultLMStudioConfig = {
          provider: 'lmstudio' as const,
          baseUrl: 'http://localhost:1234',
          model: 'local-model',
          temperature: 0.7,
          maxTokens: 2048
        };
        
        const lmStudioService = new LLMService(defaultLMStudioConfig);
        return await lmStudioService.isAvailable();
      } catch (error) {
        console.error('Local LLM availability check failed:', error);
        return false;      }
    });

    // MCP handlers
    ipcMain.handle('mcp:call', async (event, server: string, toolName: string, arguments_: any) => {
      try {
        return await this.mcpClient.callTool(server, toolName, arguments_);
      } catch (error) {
        const mcpError = MCPErrorHandler.handleError(error, `mcp:call(${server}, ${toolName})`);
        console.error('MCP tool call failed:', mcpError);
        
        // Return the error in a consistent format that the renderer can handle
        return {
          error: {
            code: mcpError.code,
            message: mcpError.message
          }
        };
      }
    });

    ipcMain.handle('mcp:listServers', async () => {
      try {
        return this.mcpClient.getAvailableServers();
      } catch (error) {
        const mcpError = MCPErrorHandler.handleError(error, 'mcp:listServers');
        console.error('MCP list servers failed:', mcpError);
        return [];
      }
    });

    ipcMain.handle('mcp:listTools', async (event, server: string) => {
      try {
        return await this.mcpClient.listTools(server);
      } catch (error) {
        const mcpError = MCPErrorHandler.handleError(error, `mcp:listTools(${server})`);
        console.error(`MCP list tools for server ${server} failed:`, mcpError);
        return [];
      }
    });

    // MCP Debug handlers
    ipcMain.handle('mcp:debug', async () => {
      try {
        await debugMCP(this.config);
        return 'Debug information logged to console';
      } catch (error) {
        console.error('MCP debug failed:', error);
        return `Debug failed: ${error}`;
      }
    });    ipcMain.handle('mcp:checkHealth', async () => {
      try {
        return await checkMCPServerHealth();
      } catch (error) {
        console.error('MCP health check failed:', error);
        return {};
      }
    });    // Add new IPC handler for restarting Lokka MCP server
    ipcMain.handle('mcp:restartLokkaMCPServer', async () => {
      try {
        console.log('🔄 Restarting Lokka MCP server due to authentication mode change...');
        
        if (this.mcpServerManager) {
          // Stop the specific Lokka server
          const lokkaServer = this.mcpServerManager.getServer('external-lokka');
          if (lokkaServer && lokkaServer.stopServer) {
            await lokkaServer.stopServer();
            console.log('✅ Stopped Lokka MCP server');
          }
          
          // Update server configuration with new auth settings
          const entraConfig = this.configService.getEntraConfig();
          const lokkaServerIndex = this.config.mcpServers.findIndex(server => server.name === 'external-lokka');
          
          if (lokkaServerIndex !== -1) {
            this.config.mcpServers[lokkaServerIndex] = {
              ...this.config.mcpServers[lokkaServerIndex],
              env: {
                TENANT_ID: entraConfig?.tenantId || process.env.MSAL_TENANT_ID,
                CLIENT_ID: entraConfig?.clientId || process.env.MSAL_CLIENT_ID
              }
            };
          }
          
          // Recreate MCP services with updated config
          const mcpAuthService = new MCPAuthService(this.authService);
          await this.mcpServerManager.stopAllServers();
          this.mcpServerManager = new MCPServerManager(this.config.mcpServers, mcpAuthService, this.configService);
          this.mcpClient = new MCPClient(this.config.mcpServers, mcpAuthService);
          
          console.log('✅ Restarted Lokka MCP server with new authentication mode');
          
          // Force UI refresh
          if (this.mainWindow) {
            this.mainWindow.webContents.send('llm:forceStatusRefresh', { source: 'auth-mode-change' });
          }
        }
      } catch (error) {
        console.error('Failed to restart Lokka MCP server:', error);
        throw error;
      }
    });

    // Configuration handlers
    ipcMain.handle('config:get', async () => {
      return this.config;
    });

    ipcMain.handle('config:update', async (event, newConfig: Partial<AppConfig>) => {
      try {
        this.config = { ...this.config, ...newConfig };
        // In a real implementation, save to file
        return this.config;
      } catch (error) {
        console.error('Config update failed:', error);
        throw error;
      }
    });    // LLM Configuration handlers
    ipcMain.handle('config:getLLMConfig', async () => {
      const config = this.configService.getLLMConfig();
      
      // If configuration contains cloud providers (indicating authentication is verified and config is available), notify renderer ONCE
      if (config && config.cloudProviders && Object.keys(config.cloudProviders).length > 0 && this.mainWindow && !this.configurationAvailabilityNotified) {
        console.log('📡 [Main] Sending auth:configurationAvailable event from config:getLLMConfig (cloud providers detected) - FIRST TIME ONLY');
        this.configurationAvailabilityNotified = true;
        this.mainWindow.webContents.send('auth:configurationAvailable', { source: 'config:getLLMConfig' });
      }
      
      return config;
    });    ipcMain.handle('config:saveLLMConfig', async (event, newLLMConfig) => {
      try {        
        // Save configuration securely
        this.configService.saveLLMConfig(newLLMConfig);
        
        // Update runtime config
        this.config.llm = newLLMConfig;
        
        // Update existing LLM service with new configuration
        if (this.llmService && this.llmService.updateConfig) {
          console.log('[Main] Updating LLM service configuration with new settings');
          this.llmService.updateConfig(newLLMConfig);
        }
        
        return this.configService.getLLMConfig();
      } catch (error) {
        console.error('LLM config update failed:', error);
        throw error;
      }
    });

    // Model cache management handlers
    ipcMain.handle('config:clearModelCache', async (event, provider?: string) => {
      try {
        this.configService.clearModelCache(provider);
        return { success: true };
      } catch (error) {
        console.error('Failed to clear model cache:', error);
        throw error;
      }
    });

    ipcMain.handle('config:getCachedModels', async (event, provider: string) => {
      try {
        return this.configService.getCachedModels(provider) || [];
      } catch (error) {
        console.error('Failed to get cached models:', error);
        return [];
      }
    });    // Cloud provider configuration handlers
    ipcMain.handle('config:saveCloudProviderConfig', async (event, provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai', config) => {
      try {
        this.configService.saveCloudProviderConfig(provider, config);
        return true;
      } catch (error) {
        console.error('Save cloud provider config failed:', error);
        throw error;
      }
    });

    ipcMain.handle('config:getCloudProviderConfig', async (event, provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => {
      try {
        return this.configService.getCloudProviderConfig(provider);
      } catch (error) {
        console.error('Get cloud provider config failed:', error);
        return null;
      }
    });    ipcMain.handle('config:getConfiguredCloudProviders', async () => {
      try {
        const providers = this.configService.getConfiguredCloudProviders();
        
        // If we have configured cloud providers, notify renderer that configuration is available ONCE
        if (providers && providers.length > 0 && this.mainWindow && !this.configurationAvailabilityNotified) {
          console.log('📡 [Main] Sending auth:configurationAvailable event from config:getConfiguredCloudProviders - FIRST TIME ONLY');
          this.configurationAvailabilityNotified = true;
          this.mainWindow.webContents.send('auth:configurationAvailable', { source: 'config:getConfiguredCloudProviders' });
        }
        
        return providers;
      } catch (error) {
        console.error('Get configured cloud providers failed:', error);
        return [];
      }
    });

    ipcMain.handle('config:setDefaultCloudProvider', async (event, provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => {
      try {
        this.configService.setDefaultCloudProvider(provider);
          // Reinitialize LLM service with the new default provider
        const defaultCloudProvider = this.configService.getDefaultCloudProvider();
        if (defaultCloudProvider) {
          // Get current LLM config to preserve all settings and cloud provider configurations
          const currentLLMConfig = this.configService.getLLMConfig();
          
          // Create the updated config by modifying the current config rather than creating a new object
          const llmConfig = {
            ...currentLLMConfig, // Start with all current settings
            // Update the main provider fields to match the new default
            provider: defaultCloudProvider.provider,
            model: defaultCloudProvider.config.model,
            // Only override root-level credentials if they're not already set
            apiKey: currentLLMConfig.apiKey || defaultCloudProvider.config.apiKey,
            baseUrl: currentLLMConfig.baseUrl || defaultCloudProvider.config.baseUrl,
            temperature: currentLLMConfig.temperature !== undefined ? currentLLMConfig.temperature : defaultCloudProvider.config.temperature,
            maxTokens: currentLLMConfig.maxTokens !== undefined ? currentLLMConfig.maxTokens : defaultCloudProvider.config.maxTokens,
            organization: currentLLMConfig.organization || defaultCloudProvider.config.organization
          };
          
          // DEBUG: Check config before LLM service creation
          const preInitConfig = this.configService.getLLMConfig();
          console.log('🔍 DEBUG: Config before LLM service creation - Azure OpenAI exists:', !!preInitConfig.cloudProviders?.['azure-openai']);
            console.log('🔄 Reinitializing LLM with new default cloud provider:', defaultCloudProvider.provider, 'Model:', defaultCloudProvider.config.model);
          
          // Dispose of the previous LLM service instance to prevent memory leaks
          if (this.llmService && typeof this.llmService.dispose === 'function') {
            this.llmService.dispose();
            console.log('🧹 Disposed previous LLM service instance before reinitializing');
          }
          
          this.llmService = new EnhancedLLMService(llmConfig, this.authService, this.mcpClient);
          
          // DEBUG: Check if config still exists immediately after LLM service creation
          const postInitConfig = this.configService.getLLMConfig();
          console.log('🔍 DEBUG: Config after LLM service creation - Has cloudProviders:', !!postInitConfig.cloudProviders);
          if (postInitConfig.cloudProviders) {
            console.log('🔍 DEBUG: Available providers after LLM init:', Object.keys(postInitConfig.cloudProviders));
            console.log('🔍 DEBUG: Azure OpenAI config exists after LLM init:', !!postInitConfig.cloudProviders['azure-openai']);
          }          // Update the runtime config as well
          this.config.llm = llmConfig;
          
          // DEBUG: Check config after runtime config update
          const postRuntimeConfig = this.configService.getLLMConfig();
          console.log('🔍 DEBUG: Config after runtime config update - Azure OpenAI exists:', !!postRuntimeConfig.cloudProviders?.['azure-openai']);
          
          // Notify renderer process that the default cloud provider has changed
          if (this.mainWindow) {
            this.mainWindow.webContents.send('config:defaultCloudProviderChanged', {
              provider: defaultCloudProvider.provider,
              model: defaultCloudProvider.config.model
            });
          }
        }
        
        return true;
      } catch (error) {
        console.error('Set default cloud provider failed:', error);
        throw error;
      }
    });    ipcMain.handle('config:getDefaultCloudProvider', async () => {
      try {
        const defaultProvider = this.configService.getDefaultCloudProvider();
        
        // If we have a default cloud provider, notify renderer that configuration is available ONCE
        if (defaultProvider && this.mainWindow && !this.configurationAvailabilityNotified) {
          console.log('📡 [Main] Sending auth:configurationAvailable event from config:getDefaultCloudProvider - FIRST TIME ONLY');
          this.configurationAvailabilityNotified = true;
          this.mainWindow.webContents.send('auth:configurationAvailable', { source: 'config:getDefaultCloudProvider' });
        }
        
        return defaultProvider;
      } catch (error) {
        console.error('Get default cloud provider failed:', error);
        return null;
      }
    });

    ipcMain.handle('config:removeCloudProviderConfig', async (event, provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => {
      try {
        this.configService.removeCloudProviderConfig(provider);
        return true;
      } catch (error) {
        console.error('Remove cloud provider config failed:', error);
        throw error;
      }
    });

    // Entra configuration handlers
    ipcMain.handle('config:getEntraConfig', async () => {
      try {
        return this.configService.getEntraConfig();
      } catch (error) {
        console.error('Get Entra config failed:', error);
        return null;
      }
    });

    ipcMain.handle('config:saveEntraConfig', async (event, entraConfig) => {
      try {
        console.log('[Main] Saving Entra config with Enhanced Graph Access setting:', {
          useGraphPowerShell: entraConfig.useGraphPowerShell,
          hasClientId: !!entraConfig.clientId,
          hasClientSecret: !!entraConfig.clientSecret
        });
        
        // Ensure service-level access for configuration operations
        this.configService.setServiceLevelAccess(true);
        
        // Save the Entra configuration
        this.configService.saveEntraConfig(entraConfig);
        
        // Set authentication verified for UI updates
        this.configService.setAuthenticationVerified(true);
        
        console.log('[Main] Enhanced Graph Access setting saved - useGraphPowerShell:', entraConfig.useGraphPowerShell);
        
        // Emit configuration update event for UI synchronization
        event.sender.send('auth:configurationAvailable');
        console.log('📡 Sending auth:configurationAvailable event after Entra config save');
        
        // Reinitialize services with new Entra configuration
        console.log('[Main] Entra config saved, reinitializing services...');
        await this.reinitializeServices();
        
        return true;
      } catch (error) {
        console.error('Save Entra config failed:', error);
        throw error;
      }
    });

    ipcMain.handle('config:clearEntraConfig', async () => {
      try {
        this.configService.clearEntraConfig();
        
        // Reinitialize services after clearing Entra configuration
        console.log('[Main] Entra config cleared, reinitializing services...');
        await this.reinitializeServices();
        
        return true;
      } catch (error) {
        console.error('Clear Entra config failed:', error);
        throw error;
      }
    });

    // MCP Configuration handlers
    ipcMain.handle('config:getMCPConfig', async () => {
      try {
        return this.configService.getMCPConfig();
      } catch (error) {
        console.error('Get MCP config failed:', error);
        throw error;
      }
    });

    ipcMain.handle('config:saveMCPConfig', async (event, mcpConfig) => {
      try {
        this.configService.saveMCPConfig(mcpConfig);
        
        // Reinitialize MCP services after configuration change
        console.log('[Main] MCP config saved, reinitializing MCP services...');
        await this.reinitializeServices();
        
        return true;
      } catch (error) {
        console.error('Save MCP config failed:', error);
        throw error;
      }
    });

    ipcMain.handle('config:updateLokkaMCPConfig', async (event, lokkaConfig) => {
      try {
        this.configService.updateLokkaMCPConfig(lokkaConfig);
        
        // Reinitialize MCP services after Lokka configuration change
        console.log('[Main] Lokka MCP config updated, reinitializing MCP services...');
        await this.reinitializeServices();
        
        return true;
      } catch (error) {
        console.error('Update Lokka MCP config failed:', error);
        throw error;
      }
    });

    ipcMain.handle('config:isLokkaMCPConfigured', async () => {
      try {
        return this.configService.isLokkaMCPConfigured();
      } catch (error) {
        console.error('Check Lokka MCP configuration failed:', error);
        throw error;
      }
    });

    // Auto-updater handlers
    ipcMain.handle('updater:checkForUpdates', async () => {
      try {
        await this.autoUpdaterService.checkForUpdates();
        return { success: true };
      } catch (error) {
        console.error('Check for updates failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('updater:downloadUpdate', async () => {
      try {
        this.autoUpdaterService.downloadUpdate();
        return { success: true };
      } catch (error) {
        console.error('Download update failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('updater:installUpdate', async () => {
      try {
        this.autoUpdaterService.installUpdate();
        return { success: true };
      } catch (error) {
        console.error('Install update failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('updater:getCurrentVersion', async () => {
      try {
        return this.autoUpdaterService.getCurrentVersion();
      } catch (error) {
        console.error('Get current version failed:', error);
        return '1.0.0';
      }
    });

    ipcMain.handle('updater:isUpdatePending', async () => {
      try {
        return this.autoUpdaterService.isUpdatePending();
      } catch (error) {
        console.error('Check update pending failed:', error);
        return false;
      }
    });

    ipcMain.handle('updater:setAutoUpdateEnabled', async (event, enabled: boolean) => {
      try {
        this.autoUpdaterService.setAutoUpdateEnabled(enabled);
        return { success: true };
      } catch (error) {
        console.error('Set auto-update enabled failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('updater:getAutoUpdateEnabled', async () => {
      try {
        return this.autoUpdaterService.getAutoUpdateEnabled();
      } catch (error) {
        console.error('Get auto-update enabled failed:', error);
        return true; // Default to enabled
      }
    });

    // LLM testing handlers
    ipcMain.handle('llm:testConnection', async (event, testConfig) => {
      try {
        const { UnifiedLLMService } = require('../llm/UnifiedLLMService');
        const testService = new UnifiedLLMService(testConfig, this.mcpClient);
        
        // First check basic API availability
        const isApiAvailable = await testService.isAvailable();
        if (!isApiAvailable) {
          console.log('LLM connection test failed: API not available');
          return false;
        }
        
        // For cloud providers, also validate the specific model
        if (testConfig.provider === 'openai' || testConfig.provider === 'anthropic' || 
            testConfig.provider === 'gemini' || testConfig.provider === 'azure-openai') {
          
          console.log(`Testing model "${testConfig.model}" for provider "${testConfig.provider}"`);
          
          // Get available models and check if the configured model is valid
          try {
            const availableModels = await testService.getAvailableModels();
            
            if (availableModels.length === 0) {
              console.warn('LLM connection test: Could not fetch models from provider, but API is available');
              // If we can't fetch models but API is available, consider it a successful connection
              // The model validation warning will still show in the UI
              return true;
            }
            
            // Check if the configured model exists in available models
            const modelExists = availableModels.some((model: string) => 
              model === testConfig.model || 
              model.toLowerCase() === testConfig.model.toLowerCase()
            );
            
            if (!modelExists) {
              console.log(`LLM connection test failed: Model "${testConfig.model}" not found in available models:`, availableModels.slice(0, 5));
              return false;
            }
            
            console.log(`LLM connection test successful: Model "${testConfig.model}" is available`);
            return true;
            
          } catch (modelError) {
            console.warn('LLM connection test: Error fetching models for validation:', modelError);
            // If model fetching fails but API is available, consider it successful
            // This handles cases where the model endpoint is different or has different permissions
            return true;
          }
        }
        
        // For local providers, just return the API availability result
        return isApiAvailable;

      } catch (error) {
        console.error('LLM connection test failed:', error);
        return false;
      }
    });    ipcMain.handle('llm:getAvailableModels', async (event, config?: any) => {
      try {
        // If config is provided, use the appropriate service
        if (config) {
          if ((config.provider === 'ollama' || config.provider === 'lmstudio') && config.baseUrl) {
            // Handle local LLM providers
            console.log(`Fetching models for local provider ${config.provider} at ${config.baseUrl}...`);
            const { LLMService } = require('../llm/LLMService');
            const localService = new LLMService(config);
            return await localService.getAvailableModels();
          } else if ((config.provider === 'openai' || config.provider === 'anthropic' || config.provider === 'gemini' || config.provider === 'azure-openai') && config.apiKey) {
            // Handle cloud LLM providers - check cache first
            const cachedModels = this.configService.getCachedModels(config.provider);
            if (cachedModels && cachedModels.length > 0) {
              console.log(`Using cached models for ${config.provider}:`, cachedModels);
              return cachedModels;
            }

            console.log(`Fetching fresh models for ${config.provider}...`);
            const { CloudLLMService } = require('../llm/CloudLLMService');
            const cloudService = new CloudLLMService(config, this.mcpClient);
            const freshModels = await cloudService.getAvailableModels();
            
            // Cache the results
            if (freshModels && freshModels.length > 0) {
              this.configService.cacheModels(config.provider, freshModels);
              console.log(`Cached ${freshModels.length} models for ${config.provider}`);
            }
            
            return freshModels;
          }
        }
        
        // Otherwise use the default service
        return await this.llmService.getAvailableModels();
      } catch (error) {
        console.error('Get available models failed:', error);
        
        // Return cached models as fallback if available
        if (config?.provider) {
          const cachedModels = this.configService.getCachedModels(config.provider);
          if (cachedModels && cachedModels.length > 0) {
            console.log(`Returning cached models as fallback for ${config.provider}`);
            return cachedModels;
          }
        }
        
        return [];
      }
    });    // Enhanced LLM testing for specific providers
    ipcMain.handle('llm:testProviderConnection', async (event, provider: string, config: any) => {
      try {
        let testService;
        if (provider === 'openai' || provider === 'anthropic' || provider === 'gemini' || provider === 'azure-openai') {
          const { CloudLLMService } = require('../llm/CloudLLMService');
          testService = new CloudLLMService(config, this.mcpClient);
        } else {
          const { LLMService } = require('../llm/LLMService');
          testService = new LLMService(config);
        }
        return await testService.isAvailable();
      } catch (error) {
        console.error(`${provider} connection test failed:`, error);
        return false;
      }
    });

    ipcMain.handle('llm:getProviderModels', async (event, provider: string, config: any) => {
      try {
        let service;
        if (provider === 'openai' || provider === 'anthropic' || provider === 'gemini' || provider === 'azure-openai') {
          const { CloudLLMService } = require('../llm/CloudLLMService');
          service = new CloudLLMService(config, this.mcpClient);
        } else {
          const { LLMService } = require('../llm/LLMService');
          service = new LLMService(config);
        }
        return await service.getAvailableModels();
      } catch (error) {
        console.error(`Get ${provider} models failed:`, error);
        return [];
      }
    });

    // Shell handlers for external links
    ipcMain.handle('shell:openExternal', async (event, url) => {
      try {        // Only allow specific URLs to be opened for security
        const allowedDomains = [
          'https://github.com', 
          'https://learn.microsoft.com',
          'https://docs.microsoft.com',
          'https://portal.azure.com',
          'https://graph.microsoft.com',
          'https://developer.microsoft.com',
          'https://azure.microsoft.com',
          'https://microsoft.com',
          'https://www.microsoft.com',
          'https://techcommunity.microsoft.com',
          'https://aka.ms'
        ];
        
        if (allowedDomains.some(domain => url.startsWith(domain))) {
          await shell.openExternal(url);
          return true;
        } else {
          console.warn('Blocked attempt to open disallowed URL:', url);
          return false;
        }
      } catch (error) {
        console.error('Failed to open external URL:', error);
        return false;
      }
    });

    ipcMain.handle('auth:getTokenPermissions', async () => {
      try {
        const token = await this.authService.getToken();
        if (!token?.accessToken) {
          return { permissions: [], error: 'No access token available' };
        }

        // Decode the token to extract permissions
        const tokenParts = token.accessToken.split('.');
        if (tokenParts.length !== 3) {
          return { permissions: [], error: 'Invalid token format' };
        }

        try {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          
          // Extract permissions from token
          let permissions: string[] = [];
          
          // Check for delegated scopes (scp claim)
          if (payload.scp) {
            permissions = payload.scp.split(' ').filter((scope: string) => scope.trim().length > 0);
          }
          
          // Check for app-only permissions (roles claim)
          if (payload.roles && Array.isArray(payload.roles)) {
            permissions = [...permissions, ...payload.roles];
          }

          return { 
            permissions,
            tokenInfo: {
              clientId: payload.appid,
              tenantId: payload.tid,
              audience: payload.aud,
              expiresAt: new Date(payload.exp * 1000).toISOString()
            }
          };
        } catch (decodeError) {
          console.error('Failed to decode token:', decodeError);
          return { permissions: [], error: 'Failed to decode token' };
        }      } catch (error) {
        console.error('Get token permissions failed:', error);
        return { permissions: [], error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Get current Graph permissions from the actual token
    ipcMain.handle('auth:getCurrentGraphPermissions', async () => {
      try {
        const token = await this.authService.getToken();
        if (!token?.accessToken) {
          return { permissions: [], error: 'No access token available' };
        }

        // Decode the token to extract scopes/permissions
        const tokenParts = token.accessToken.split('.');
        if (tokenParts.length !== 3) {
          return { permissions: [], error: 'Invalid token format' };
        }

        try {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          
          // Extract permissions from token
          let permissions: string[] = [];
          
          // Check for delegated scopes (scp claim)
          if (payload.scp) {
            permissions = payload.scp.split(' ').filter((scope: string) => scope.trim().length > 0);
          }
          
          // Check for app-only permissions (roles claim)
          if (payload.roles && Array.isArray(payload.roles)) {
            permissions = [...permissions, ...payload.roles];
          }

          // Remove duplicates and sort
          permissions = [...new Set(permissions)].sort();

          console.log('📊 Current Graph permissions from token:', permissions);
          
          return { 
            permissions,
            clientId: payload.appid,
            source: 'access_token'
          };
        } catch (decodeError) {
          console.error('Failed to decode token:', decodeError);
          return { permissions: [], error: 'Failed to decode token' };
        }      } catch (error) {
        console.error('Get current Graph permissions failed:', error);
        return { permissions: [], error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Get tenant information including display name
    ipcMain.handle('auth:getTenantInfo', async () => {
      try {
        const token = await this.authService.getToken();
        if (!token?.accessToken) {
          return { error: 'No access token available' };
        }

        // Decode the token to extract tenant information
        const tokenParts = token.accessToken.split('.');
        if (tokenParts.length !== 3) {
          return { error: 'Invalid token format' };
        }

        try {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          
          console.log('🔍 Token payload tenant info:', {
            tid: payload.tid,
            iss: payload.iss,
            aud: payload.aud,
            hasDisplayName: !!payload.tenant_display_name
          });
          
          let tenantDisplayName = payload.tid; // Default to tenant ID as fallback
          
          // Primary: Try to get tenant display name from Graph API /organization endpoint
          try {
            console.log('🔍 Making direct Graph API call to /organization endpoint for tenant:', payload.tid);
            
            // Make direct Graph API call using the access token
            const response = await fetch('https://graph.microsoft.com/v1.0/organization', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const orgData = await response.json();
              console.log('🔍 Direct Graph API organization response:', orgData);
              
              if (orgData?.value && Array.isArray(orgData.value) && orgData.value.length > 0) {
                const org = orgData.value[0];
                console.log('🔍 Organization object from direct API:', org);
                if (org.displayName) {
                  tenantDisplayName = org.displayName;
                  console.log('✅ Retrieved tenant display name from direct Graph API:', tenantDisplayName);
                } else {
                  console.warn('⚠️ Organization object found but no displayName property:', org);
                }
              } else {
                console.warn('⚠️ Unexpected organization response structure from direct API:', orgData);
              }
            } else {
              const errorText = await response.text();
              console.warn('❌ Direct Graph API organization call failed:', response.status, errorText);
            }
          } catch (graphError) {
            console.warn('Could not retrieve organization info from direct Graph API:', graphError);
          }
          
          // Secondary: Check for tenant_display_name claim in token (rare but valid)
          if (tenantDisplayName === payload.tid && payload.tenant_display_name) {
            tenantDisplayName = payload.tenant_display_name;
            console.log('✅ Using tenant_display_name from token:', tenantDisplayName);
          }
          
          // Note: We intentionally do NOT use tenant_region_scope as it's not a display name
          
          // Get stored Entra config to compare tenant IDs
          let storedEntraConfig: any = null;
          try {
            storedEntraConfig = await this.configService.getEntraConfig();
          } catch (error) {
            console.warn('Could not retrieve stored Entra config for comparison:', error);
          }
          
          console.log('🏢 Tenant info retrieved:', { 
            tenantId: payload.tid, 
            displayName: tenantDisplayName,
            source: tenantDisplayName === payload.tid ? 'fallback-tenantId' : 
                   payload.tenant_display_name === tenantDisplayName ? 'token-claim' : 'graph-api',
            issuedBy: payload.iss,
            audience: payload.aud,
            configTenantId: storedEntraConfig?.tenantId,
            authTokenTenantId: payload.tid,
            tenantMismatch: storedEntraConfig?.tenantId !== payload.tid
          });
          
          return { 
            tenantId: payload.tid, // Always use the authenticated token's tenant ID
            tenantDisplayName: tenantDisplayName,
            issuedBy: payload.iss,
            audience: payload.aud
          };
        } catch (decodeError) {
          console.error('Failed to decode token:', decodeError);
          return { error: 'Failed to decode token' };
        }      } catch (error) {
        console.error('Get tenant info failed:', error);
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });
  }

  /**
   * Check if user is already authenticated from a previous session
   * and set up authentication context accordingly
   */  private async initializeAuthenticationState(): Promise<void> {
    try {
      console.log('🔍 Checking for existing authentication session...');
      
      // Check if user is already authenticated
      const authInfo = await this.authService.getAuthenticationInfoWithToken();
      
      if (authInfo.isAuthenticated) {
        console.log('✅ Found existing authentication session');
          // Set authentication verification flag
        this.configService.setAuthenticationVerified(true);
        
        // Set authentication context (always delegated mode)
        const storedEntraConfig = this.configService.getEntraConfig();
        const authContext = 'interactive'; // Always use delegated permissions
        this.configService.setAuthenticationContext(authContext);
          // Reload LLM service with full configuration
        const fullLLMConfig = this.configService.getLLMConfig();
        console.log('🔧 Initializing LLM service with full configuration from existing session');
          this.llmService = new EnhancedLLMService(fullLLMConfig, this.authService, this.mcpClient);
          
          // Get current user token for MCP configuration
          console.log('🔐 Getting current user access token for MCP configuration...');
          let currentUserToken: string | undefined;
          try {
            const tokenResult = await this.authService.getToken();
            currentUserToken = tokenResult?.accessToken;
            console.log('🔐 Successfully retrieved current user token for MCP:', !!currentUserToken);
            if (currentUserToken) {
              console.log('🔐 Token details:', {
                tokenLength: currentUserToken.length,
                tokenPrefix: currentUserToken.substring(0, 20) + '...',
                tokenType: currentUserToken.startsWith('ey') ? 'JWT' : 'other'
              });
            }
          } catch (tokenError) {
            console.warn('⚠️ Failed to retrieve current user token:', tokenError);
          }
          
          // Update MCP server configuration with current user token
          console.log('🔧 Updating MCP server configuration with current user token...');
          this.config.mcpServers = this.createMCPServerConfig(currentUserToken);
          
          // Reinitialize MCP services with updated configuration
          console.log('🔧 Reinitializing MCP services with updated configuration...');
          const mcpAuthService = new MCPAuthService(this.authService);
          
          // Stop existing MCP services gracefully
          if (this.mcpServerManager) {
            try {
              await this.mcpServerManager.stopAllServers();
            } catch (error) {
              console.warn('Error stopping existing MCP server manager:', error);
            }
          }
          
          // Initialize new MCP services with updated configuration
          this.mcpServerManager = new MCPServerManager(this.config.mcpServers, mcpAuthService, this.configService);
          this.mcpClient = new MCPClient(this.config.mcpServers, mcpAuthService);
          
          console.log('🚀 MCP services reinitialized with current user token');
          
          // Check if we have stored Entra credentials and update MCP server config
          console.log('🔧 Checking for stored Entra credentials during initialization...');
          if (storedEntraConfig && (
              (storedEntraConfig.clientId && storedEntraConfig.tenantId) ||
              storedEntraConfig.useGraphPowerShell
            )) {
            console.log('🔐 Found stored Entra credentials, updating Lokka MCP server configuration...');          // Enable Lokka MCP server for authenticated user
            const lokkaServerIndex = this.config.mcpServers.findIndex(server => server.name === 'external-lokka');
            if (lokkaServerIndex !== -1) {              // Determine client ID and authentication mode based on configuration priority:
              // 1. Custom application credentials (when provided)
              // 2. Enhanced Graph Access (when enabled and no custom credentials)
              // 3. Standard user token mode
              let clientId = storedEntraConfig.clientId || process.env.MSAL_CLIENT_ID || '';
              let authMode = 'application-credentials';
              let env: Record<string, string>;
              
              // Priority 1: Custom application credentials (when custom client ID is provided AND Enhanced Graph Access is NOT enabled)
              if (storedEntraConfig.clientId && storedEntraConfig.tenantId && !storedEntraConfig.useGraphPowerShell) {
                console.log('🔧 Using custom application credentials (Priority 1) during startup');
                clientId = storedEntraConfig.clientId;
                authMode = 'delegated';
                env = {
                  TENANT_ID: storedEntraConfig.tenantId,
                  CLIENT_ID: clientId
                };
              }
              // Priority 2: Enhanced Graph Access mode (when explicitly enabled)
              else if (storedEntraConfig.useGraphPowerShell) {
                console.log('🔧 Using Enhanced Graph Access mode (Priority 2) with Microsoft Graph PowerShell client ID during startup');
                clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e'; // Microsoft Graph PowerShell client ID
                authMode = 'enhanced-graph-access';
                env = {
                  TENANT_ID: 'common', // Use 'common' for multi-tenant Enhanced Graph Access
                  CLIENT_ID: clientId
                };
              } else {
                // Priority 3: Standard/Basic user token mode (fallback)
                console.log('🔧 Using basic user token mode (Priority 3) during startup - no custom configuration');
                clientId = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'; // Microsoft Graph CLI client ID
                authMode = 'delegated';
                env = {
                  TENANT_ID: 'common',
                  CLIENT_ID: clientId
                };
              }
              
              // Handle Enhanced Graph Access token acquisition
              if (storedEntraConfig.useGraphPowerShell && 
                  authMode === 'delegated' && 
                  clientId === '14d82eec-204b-4c2f-b7e8-296a70dab67e') {
                try {
                  console.log('🔐 Getting access token for Enhanced Graph Access mode during startup...');
                  // Create a temporary auth service with Microsoft Graph PowerShell client ID
                  const graphPowerShellAuthConfig = {
                    ...this.config,
                    auth: {
                      clientId: '14d82eec-204b-4c2f-b7e8-296a70dab67e',
                      tenantId: 'common', // Use 'common' for multi-tenant access
                      scopes: [
                        'https://graph.microsoft.com/User.Read',
                        'https://graph.microsoft.com/Mail.Read',
                        'https://graph.microsoft.com/Mail.ReadWrite',
                        'https://graph.microsoft.com/Calendars.Read',
                        'https://graph.microsoft.com/Files.Read.All',
                        'https://graph.microsoft.com/Directory.Read.All'
                      ],
                      useClientCredentials: false
                    }
                  };
                  
                  const tempAuthService = new AuthService(graphPowerShellAuthConfig);
                  const token = await tempAuthService.getToken();
                  
                  if (token && token.accessToken) {
                    console.log('🔐 Successfully obtained Enhanced Graph Access token during startup');
                    env.ACCESS_TOKEN = token.accessToken;
                    env.USE_INTERACTIVE = 'false'; // Use provided token, don't authenticate interactively
                    env.USE_CLIENT_TOKEN = 'true'; // Required for Lokka to use client-provided-token mode
                  } else {
                    console.error('❌ Failed to get Enhanced Graph Access token during startup, falling back to client token mode');
                    env.USE_CLIENT_TOKEN = 'true';
                  }
                } catch (error) {
                  console.error('❌ Error getting Enhanced Graph Access token during startup:', error);
                  console.log('🔧 Falling back to standard client token mode');
                  env.USE_CLIENT_TOKEN = 'true';
                }
              } else if (authMode === 'application-credentials') {
                // Application credentials mode - no additional token acquisition needed
                console.log('🔧 Application credentials mode configured - using client secret authentication');
              } else {
                // Standard delegated mode
                console.log('🔧 Standard delegated mode configured - using client token authentication');
                env.USE_CLIENT_TOKEN = 'true';
              }

              this.config.mcpServers[lokkaServerIndex] = {
                ...this.config.mcpServers[lokkaServerIndex],
                enabled: true, // Enable for any authenticated user
                env
              };

            console.log(`✅ Updated Lokka MCP server for authenticated user (mode: ${authMode}):`, {
              enabled: this.config.mcpServers[lokkaServerIndex].enabled,
              authMode: authContext,
              clientId: clientId.substring(0, 8) + '...',
              enhancedAccess: Boolean(storedEntraConfig.useGraphPowerShell)
            });
            
            // Save the ACCESS_TOKEN to the MCP configuration so it persists across restarts
            try {
              const currentMCPConfig = this.configService.getMCPConfig();
              const updatedMCPConfig = {
                ...currentMCPConfig,
                lokka: {
                  ...currentMCPConfig.lokka,
                  enabled: true,
                  authMode: authMode as any,
                  accessToken: env.ACCESS_TOKEN, // Store the access token for persistence
                  useGraphPowerShell: Boolean(storedEntraConfig.useGraphPowerShell)
                }
              };
              this.configService.saveMCPConfig(updatedMCPConfig);
              console.log('💾 Saved updated Lokka MCP configuration with access token to persistent storage');
            } catch (saveError) {
              console.warn('⚠️ Failed to save MCP config to storage:', saveError);
            }
            
            // Reinitialize MCP services with updated config
            const mcpAuthService = new MCPAuthService(this.authService);
            
            // Stop existing MCP services gracefully
            if (this.mcpServerManager) {
              try {
                await this.mcpServerManager.stopAllServers();
              } catch (error) {
                console.warn('Error stopping MCP server manager:', error);
              }
            }
            
            // Create new MCP services with updated configuration
            this.mcpServerManager = new MCPServerManager(this.config.mcpServers, mcpAuthService, this.configService);
            this.mcpClient = new MCPClient(this.config.mcpServers, mcpAuthService);
            
            console.log('🚀 MCP services reinitialized with Entra credentials during startup');
          }
        } else {
          console.log('⚠️ No stored Entra credentials found for Lokka MCP server during startup');
          
          // Since user is authenticated but no stored Entra config, Lokka might still be enabled
          // via env vars, so let's check that case
          const lokkaConfig = this.config.mcpServers.find(server => server.name === 'external-lokka');
          if (lokkaConfig && lokkaConfig.enabled) {
            console.log('🔧 Lokka MCP server enabled via environment variables');
          } else {
            console.log('❌ Lokka MCP server not enabled - missing Entra credentials');
          }
        }
        
        // Ensure Lokka MCP server is running after all configuration updates
        console.log('🔧 Attempting to ensure Lokka MCP server is running...');
        const lokkaStarted = await this.ensureLokkaMCPServerRunning();
        
        if (lokkaStarted) {
          console.log('✅ Lokka MCP server is running and ready');
        } else {
          console.warn('⚠️ Lokka MCP server failed to start or is not available');
        }
        
        console.log('🎉 Authentication state initialized successfully');
      } else {
        console.log('❌ No existing authentication session found');
        
        // Make sure authentication verification is false
        this.configService.setAuthenticationVerified(false);
      }
    } catch (error) {
      console.warn('Failed to check authentication state:', error);
        // On error, ensure authentication verification is false
      this.configService.setAuthenticationVerified(false);
    }
  }
  /**
   * Get authentication configuration from stored settings, falling back to environment variables
   */
  private async getAuthConfiguration(): Promise<{clientId: string, tenantId: string, clientSecret?: string}> {
    // First try to get stored configuration
    const storedEntraConfig = this.configService.getEntraConfig();
    
    console.log('[Main] getAuthConfiguration - Stored config:', {
      hasConfig: Boolean(storedEntraConfig),
      clientId: storedEntraConfig?.clientId?.substring(0, 8) + '...',
      tenantId: storedEntraConfig?.tenantId?.substring(0, 8) + '...',
      useGraphPowerShell: storedEntraConfig?.useGraphPowerShell
    });
    
    if (storedEntraConfig && storedEntraConfig.tenantId) {
      console.log('[Main] Using stored Entra configuration');
      
      // Priority 1: Custom application credentials (when custom client ID is provided AND Enhanced Graph Access is NOT enabled)
      if (storedEntraConfig.clientId && !storedEntraConfig.useGraphPowerShell) {
        console.log('[Main] Custom User Token mode (Priority 1) with user-provided app registration');
        return {
          clientId: storedEntraConfig.clientId,
          tenantId: storedEntraConfig.tenantId,
          clientSecret: undefined // Always use delegated permissions (User Token mode)
        };
      }
      
      // Priority 2: Enhanced Graph Access (when enabled)
      if (storedEntraConfig.useGraphPowerShell) {
        console.log('[Main] Enhanced Graph Access enabled (Priority 2), using Microsoft Graph PowerShell client ID');
        return {
          clientId: '14d82eec-204b-4c2f-b7e8-296a70dab67e', // Microsoft Graph PowerShell client ID
          tenantId: storedEntraConfig.tenantId,
          clientSecret: undefined // No client secret for Graph PowerShell delegated access
        };
      }
      
      // Priority 3: Basic User Token mode (default Microsoft authentication)
      console.log('[Main] Basic User Token mode (Priority 3), using default Microsoft Graph application');
      return {
        clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46', // Microsoft Graph CLI client ID (public client)
        tenantId: storedEntraConfig.tenantId,
        clientSecret: undefined
      };
    }
      // Fall back to default configuration for first-time users
    console.log('[Main] No stored configuration, using default Basic User Token mode');
    return {
      clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46', // Microsoft Graph CLI client ID (public client)
      tenantId: 'common',
      clientSecret: undefined
    };
  }

  /**
   * Check if Lokka MCP server is running and start it if enabled but not running
   * This method can be called after authentication or when MCP services are needed
   */  private async ensureLokkaMCPServerRunning(): Promise<boolean> {
    try {
      console.log('[Main] Checking if Lokka MCP server is running...');
      
      // First check if Lokka is enabled in the configuration
      const lokkaConfig = this.config.mcpServers.find(server => server.name === 'external-lokka');
      
      console.log('[Main] Lokka MCP server configuration check:', {
        found: Boolean(lokkaConfig),
        enabled: lokkaConfig?.enabled,
        hasEnv: Boolean(lokkaConfig?.env),
        envKeys: lokkaConfig?.env ? Object.keys(lokkaConfig.env) : []
      });
        if (!lokkaConfig || !lokkaConfig.enabled) {
        console.log('[Main] Lokka MCP server not enabled in configuration');
        return false;
      }
      
      // Check if the server is in the available servers list
      const availableServers = this.mcpClient.getAvailableServers();
      const lokkaServerExists = availableServers.some(server => server.name === 'external-lokka');
      
      console.log('[Main] MCP server availability check:', {
        availableServers,
        lokkaServerExists
      });
      
      if (lokkaServerExists) {
        console.log('[Main] Lokka MCP server found in available servers');
        
        // Try to validate if it's actually running by attempting to list tools
        try {
          // Just checking if the server is actually available
          await this.mcpClient.listTools('external-lokka');
          console.log('[Main] ✅ Lokka MCP server is running and responding');
          return true;
        } catch (error) {
          console.warn('[Main] Lokka MCP server exists but failed to respond:', error);
          // Will try to restart below
        }
      } else {
        console.log('[Main] Lokka MCP server not found in available servers');
      }
      
      // If we get here, server is either not running or not responding
      console.log('[Main] Attempting to start Lokka MCP server...');
      
      try {
        // Try to start the server explicitly through the client
        await this.mcpClient.startServer('external-lokka');
        console.log('[Main] ✅ Lokka MCP server started successfully');
        return true;
      } catch (clientError) {
        console.error('[Main] Failed to start Lokka MCP server through client:', clientError);
        
        // Try direct approach through server manager as fallback
        try {
          const lokkaServer = this.mcpServerManager.getServer('external-lokka');
          if (lokkaServer && lokkaServer.startServer) {
            await lokkaServer.startServer();
            console.log('[Main] ✅ Lokka MCP server started through server manager');
            return true;
          } else {
            console.warn('[Main] Could not find Lokka server instance in manager');
          }
        } catch (managerError) {
          console.error('[Main] Failed to start Lokka MCP server through manager:', managerError);
        }
      }
      
      return false;
    } catch (error) {
      console.error('[Main] Error in ensureLokkaMCPServerRunning:', error);
      return false;
    }
  }

  /**
   * Initialize MCP configuration in storage if not exists
   */
  private async initializeMCPConfiguration(): Promise<void> {
    console.log('[Main] ===== INITIALIZING MCP CONFIGURATION =====');
    this.sendDebugToRenderer('[Main] ===== INITIALIZING MCP CONFIGURATION =====');
    
    try {
      console.log('[Main] About to call getMCPConfig in initializeMCPConfiguration...');
      this.sendDebugToRenderer('[Main] About to call getMCPConfig in initializeMCPConfiguration...');
      
      // Check if MCP config already exists
      const existingMCPConfig = this.configService.getMCPConfig();
      console.log('[Main] getMCPConfig returned in initializeMCPConfiguration:', existingMCPConfig);
      this.sendDebugToRenderer(`[Main] getMCPConfig returned - exists: ${!!existingMCPConfig}`);
      
      console.log('[Main] About to call getAuthConfiguration in initializeMCPConfiguration...');
      this.sendDebugToRenderer('[Main] About to call getAuthConfiguration in initializeMCPConfiguration...');
      
      // Always update the configuration with current Entra settings to ensure it's in sync
      const authConfig = await this.getAuthConfiguration();
      console.log('[Main] getAuthConfiguration completed in initializeMCPConfiguration');
      this.sendDebugToRenderer('[Main] getAuthConfiguration completed in initializeMCPConfiguration');
      
      const storedEntraConfig = this.configService.getEntraConfig();
      console.log('[Main] getEntraConfig completed in initializeMCPConfiguration');
      this.sendDebugToRenderer('[Main] getEntraConfig completed in initializeMCPConfiguration');
      
      // Determine authentication mode based on current configuration
      let authMode: 'client-credentials' | 'enhanced-graph-access' | 'delegated' = 'delegated';
      let enabled = false;
      
      if (storedEntraConfig?.useGraphPowerShell) {
        authMode = 'enhanced-graph-access';
        enabled = true;
      } else if (authConfig.clientSecret && authConfig.clientId && authConfig.tenantId) {
        authMode = 'client-credentials';
        enabled = true;
      } else if (authConfig.clientId && authConfig.tenantId) {
        authMode = 'delegated';
        enabled = true;
      }
      
      // Update MCP configuration (this will merge with existing settings)
      const mcpConfigUpdate: Partial<MCPConfig['lokka']> = {
        enabled,
        authMode,
        useGraphPowerShell: storedEntraConfig?.useGraphPowerShell || false
      };

      // Only store credentials that are actually needed for the specific auth mode
      if (authMode === 'client-credentials') {
        // Client credentials mode: store client ID, tenant ID, and client secret
        mcpConfigUpdate.clientId = authConfig.clientId;
        mcpConfigUpdate.tenantId = authConfig.tenantId;
        mcpConfigUpdate.clientSecret = authConfig.clientSecret;
      } else if (authMode === 'enhanced-graph-access') {
        // Enhanced Graph Access: doesn't need stored credentials, uses Microsoft Graph PowerShell client ID and runtime tokens
        // Clear any stored credentials as they're not needed
        mcpConfigUpdate.clientId = undefined;
        mcpConfigUpdate.tenantId = undefined;
        mcpConfigUpdate.clientSecret = undefined;
      } else if (authMode === 'delegated') {
        // Delegated mode: store client ID and tenant ID for fallback, but primarily uses runtime access tokens
        mcpConfigUpdate.clientId = authConfig.clientId;
        mcpConfigUpdate.tenantId = authConfig.tenantId;
        mcpConfigUpdate.clientSecret = undefined; // Not needed for delegated mode
      }

      this.configService.updateLokkaMCPConfig(mcpConfigUpdate);
      
      console.log('[Main] Updated MCP configuration with latest Entra settings:', {
        authMode,
        enabled,
        hasClientSecret: !!authConfig.clientSecret,
        useGraphPowerShell: storedEntraConfig?.useGraphPowerShell,
        wasExistingConfig: !!existingMCPConfig.lokka
      });
    } catch (error) {
      console.error('[Main] Failed to initialize MCP configuration:', error);
    }
  }

  /**
   * Create MCP server configuration from stored settings
   */
  private createMCPServerConfig(userToken?: string): MCPServerConfig[] {
    console.log('[Main] createMCPServerConfig called with userToken:', !!userToken);
    
    console.log('[Main] About to call getMCPConfig...');
    const mcpConfig = this.configService.getMCPConfig();
    console.log('[Main] getMCPConfig returned:', mcpConfig);
    
    console.log('[Main] About to call getLokkaMCPEnvironment...');
    const lokkaEnv = this.configService.getLokkaMCPEnvironment(userToken);
    console.log('[Main] getLokkaMCPEnvironment returned:', lokkaEnv);
    
    console.log('[Main] About to call isLokkaMCPConfigured...');
    const isLokkaConfigured = this.configService.isLokkaMCPConfigured();
    console.log('[Main] isLokkaMCPConfigured returned:', isLokkaConfigured);
    
    const serverConfigs: MCPServerConfig[] = [
      {
        name: 'external-lokka',
        type: 'external-lokka' as const,
        port: 0, // Not used for stdin/stdout MCP servers
        enabled: isLokkaConfigured,
        command: 'npx',
        args: ['-y', '@merill/lokka'],
        env: lokkaEnv
      },
      {
        name: 'fetch',
        type: 'fetch' as const,
        port: 3002, // Only used for built-in fetch server
        enabled: mcpConfig.fetch?.enabled ?? true,
      },
      {
        name: 'microsoft-docs',
        type: 'microsoft-docs' as const,
        port: 0, // Not used for HTTP-based MCP servers
        enabled: mcpConfig.microsoftDocs?.enabled ?? true,
        url: 'https://learn.microsoft.com/api/mcp',
        authConfig: {
          type: 'none' // Microsoft Docs MCP doesn't require authentication
        }
      },
    ];
    
    console.log('[Main] createMCPServerConfig returning:', serverConfigs);
    return serverConfigs;
  }

  /**
   * Send debug messages from main process to renderer for DevTools visibility
   */
  private sendDebugToRenderer(message: string): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('main-debug', message);
      }
    } catch (error) {
      // Silently ignore errors when window isn't ready yet
    }
  }
}

// Create and start the application
console.log('[Main] ===== STARTING ENTRAPULSE LITE MAIN PROCESS =====');
console.log('[Main] Node.js version:', process.version);
console.log('[Main] Electron version:', process.versions.electron);
console.log('[Main] Chrome version:', process.versions.chrome);
console.log('[Main] Process PID:', process.pid);
console.log('[Main] Working directory:', process.cwd());
console.log('[Main] About to create EntraPulseLiteApp instance...');

new EntraPulseLiteApp();
