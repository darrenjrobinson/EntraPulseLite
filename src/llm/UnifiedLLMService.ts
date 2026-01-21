// Unified LLM service that supports both local and cloud providers
import { LLMConfig, ChatMessage, MCPConfig } from '../types';
import { LLMService } from './LLMService';
import { CloudLLMService } from './CloudLLMService';
import { MCPClient } from '../mcp/clients';
import { MCPQueryRouter, RoutingDecision } from '../mcp/routing/MCPQueryRouter';

// Regular expression for extracting Graph API queries from LLM responses
const EXECUTE_QUERY_REGEX = /<execute_query>([\s\S]*?)<\/execute_query>/g;

export class UnifiedLLMService {
  private localService?: LLMService;
  private cloudService?: CloudLLMService | null;
  private config: LLMConfig;
  private mcpClient?: MCPClient;
  private mcpConfig?: MCPConfig;

  constructor(config: LLMConfig, mcpClient?: MCPClient, mcpConfig?: MCPConfig) {
    this.config = config;
    this.mcpClient = mcpClient;
    this.mcpConfig = mcpConfig;
    
    console.log(`[UnifiedLLMService] Constructor called with provider: ${config.provider}`);
    console.log(`[UnifiedLLMService] Config has cloudProviders:`, !!config.cloudProviders);
    if (config.cloudProviders) {
      console.log(`[UnifiedLLMService] Available cloudProviders:`, Object.keys(config.cloudProviders));
    }
    
    // Initialize local service if provider is local or if cloud providers are available (for fallback)
    if (config.provider === 'ollama' || config.provider === 'lmstudio') {
      if (config.baseUrl) {
        console.log(`[UnifiedLLMService] Initializing local service: ${config.provider}`);
        this.localService = new LLMService(config);
      } else {
        console.warn(`[UnifiedLLMService] Local provider ${config.provider} specified but no baseUrl provided`);
      }
    }
    
    // Initialize cloud service if cloud providers are available (regardless of main provider)
    if (config.cloudProviders && Object.keys(config.cloudProviders).length > 0) {
      console.log(`[UnifiedLLMService] Cloud providers are available, attempting to initialize cloud service...`);
      
      // Try to find the best available cloud provider
      let cloudProviderConfig = this.findBestAvailableCloudProvider(config);
      
      if (cloudProviderConfig) {
        console.log(`[UnifiedLLMService] Found available cloud provider: ${cloudProviderConfig.provider}`);
        console.log(`[UnifiedLLMService] Initializing CloudLLMService with config:`, {
          provider: cloudProviderConfig.provider,
          model: cloudProviderConfig.model,
          hasApiKey: !!cloudProviderConfig.apiKey,
          baseUrl: cloudProviderConfig.baseUrl
        });
        this.cloudService = new CloudLLMService(cloudProviderConfig as any, this.mcpClient);
      } else {
        console.warn(`[UnifiedLLMService] No available cloud providers found (missing API keys or configs)`);
        this.cloudService = null;
      }
    } else {
      console.log(`[UnifiedLLMService] No cloud providers configured`);
      this.cloudService = null;
    }
      // If the main provider is a cloud provider, ensure it's properly configured
    if (config.provider === 'openai' || config.provider === 'anthropic' || config.provider === 'gemini' || config.provider === 'azure-openai') {
      if (!this.cloudService) {
        // Try to initialize cloud service specifically for the requested provider
        const cloudProviderConfig = this.getCloudProviderConfig(config, config.provider);
        if (cloudProviderConfig && cloudProviderConfig.apiKey && cloudProviderConfig.apiKey.trim() !== '') {
          // Additional validation for Azure OpenAI - must have baseUrl
          if (config.provider === 'azure-openai' && (!cloudProviderConfig.baseUrl || cloudProviderConfig.baseUrl.trim() === '')) {
            console.warn(`[UnifiedLLMService] Azure OpenAI provider requires baseUrl but none provided`);
          } else {
            console.log(`[UnifiedLLMService] Initializing cloud service for requested provider: ${config.provider}`);
            this.cloudService = new CloudLLMService(cloudProviderConfig as any, this.mcpClient);
          }
        }
      }
    }
    
    // Log final service state
    console.log(`[UnifiedLLMService] Initialization complete:`, {
      hasLocalService: !!this.localService,
      hasCloudService: !!this.cloudService,
      preferLocal: config.preferLocal
    });
  }async chat(messages: ChatMessage[]): Promise<string> {
    if (!this.isServiceReady()) {
      const status = this.getServiceStatus();
      throw new Error(`LLM service not available: ${status.reason}`);
    }
    
    const service = await this.getActiveService();
    const response = await service.chat(messages);
    
    // Process any execute_query tags in the response
    if (this.mcpClient && response.includes('<execute_query>')) {
      return await this.processQueriesInResponse(response);
    }
    
    return response;
  }
    /**
   * Process and execute any Microsoft Graph API queries in the LLM response
   */
  private async processQueriesInResponse(response: string): Promise<string> {
    console.log('Processing queries in LLM response...');
    let modifiedResponse = response;
    let queryMatch;
    let hasExecutedQueries = false;
    
    // Find all execute_query blocks
    const queryMatches = [...response.matchAll(EXECUTE_QUERY_REGEX)];
    
    for (const match of queryMatches) {
      try {
        const queryText = match[1].trim();
        console.log('Found query to execute:', queryText);
        
        // Parse the query - expecting JSON object with endpoint, method, and optional params
        const query = JSON.parse(queryText);
        
        if (!query.endpoint) {
          console.warn('Invalid query format - missing endpoint:', queryText);
          continue;
        }
        
        // Ensure method is lowercase and defaults to 'get'
        const method = (query.method || 'get').toLowerCase();
        console.log(`Executing Graph API query: ${method.toUpperCase()} ${query.endpoint}`);

        // Determine which MCP server to use based on query routing
        const availableServers = this.mcpClient!.getAvailableServerNames();
        console.log('🔧 UnifiedLLMService: Available MCP servers:', availableServers);

        let serverName: string;
        let toolName: string;
        let routingDecision: RoutingDecision | null = null;

        // Use MCPQueryRouter if MCP config is available
        if (this.mcpConfig) {
          const routingConfig = {
            lokkaEnabled: this.mcpConfig.lokka?.enabled || availableServers.includes('external-lokka'),
            microsoftMcpEnabled: this.mcpConfig.microsoftEnterprise?.enabled || false
          };

          // Get user's original query from messages to help with routing
          const userQuery = messages.find(m => m.role === 'user')?.content || query.endpoint;

          routingDecision = MCPQueryRouter.routeQuery(userQuery, routingConfig);
          console.log('🧭 UnifiedLLMService: Routing decision:', {
            server: routingDecision.server,
            reason: routingDecision.reason,
            confidence: routingDecision.confidence
          });

          if (routingDecision.server === 'microsoft-enterprise' &&
              availableServers.includes('microsoft-enterprise')) {
            serverName = 'microsoft-enterprise';
            toolName = 'microsoft_graph_get';
            console.log('✅ UnifiedLLMService: Routing to Microsoft Enterprise MCP');
          } else if (routingDecision.server === 'lokka' || routingDecision.server === null) {
            // Use Lokka (external-lokka preferred)
            serverName = availableServers.includes('external-lokka') ? 'external-lokka' : 'lokka';
            toolName = 'microsoft_graph_query';
            console.log('✅ UnifiedLLMService: Routing to Lokka MCP');
          } else {
            // Fallback to external-lokka if routing failed
            serverName = availableServers.includes('external-lokka') ? 'external-lokka' : 'lokka';
            toolName = 'microsoft_graph_query';
            console.log('⚠️  UnifiedLLMService: Routing failed, falling back to Lokka');
          }
        } else {
          // Legacy behavior: prefer external-lokka
          serverName = availableServers.includes('external-lokka') ? 'external-lokka' : 'lokka';
          toolName = 'microsoft_graph_query';
          console.log('ℹ️  UnifiedLLMService: No MCP config, using default Lokka routing');
        }

        console.log(`🔧 UnifiedLLMService: Using MCP server: ${serverName}, tool: ${toolName}`);

        // Prepare parameters based on which server we're using
        let rawResult: any;

        if (serverName === 'microsoft-enterprise') {
          // Microsoft Enterprise MCP uses different parameter format
          rawResult = await this.mcpClient!.callTool(serverName, toolName, {
            url: query.endpoint,
            method: method.toUpperCase()
          });
          console.log('Microsoft Enterprise MCP response received');
        } else {
          // Lokka MCP parameters
          const queryParams = query.params || query.queryParams;
          const stringifiedQueryParams = queryParams ?
            Object.fromEntries(
              Object.entries(queryParams).map(([key, value]) => [
                key,
                typeof value === 'string' ? value : String(value)
              ])
            ) : undefined;

          rawResult = await this.mcpClient!.callTool(serverName, toolName, {
            apiType: 'graph',
            method: method,
            path: query.endpoint,
            queryParams: stringifiedQueryParams
          });
          console.log('Lokka MCP response received, type:', typeof rawResult);
          console.log('Lokka MCP response keys:', rawResult ? Object.keys(rawResult) : 'null');
        }
        
        hasExecutedQueries = true;
        
        // Debug logging to understand the response structure
        console.log('Raw Lokka MCP response:', JSON.stringify(rawResult, null, 2));
          // Enhanced result extraction - handle various possible response structures
        let extractedResult: any;

        if (rawResult?.content && Array.isArray(rawResult.content)) {
          // If the result has a content array, look for json or text content
          const jsonContent = rawResult.content.find((item: any) => item.type === 'json');
          const textContent = rawResult.content.find((item: any) => item.type === 'text');

          if (jsonContent?.json) {
            // Found JSON content
            extractedResult = jsonContent.json;
            console.log('Using JSON content from response');
          } else if (textContent?.text) {
            // Try to parse text content as JSON if possible
            try {
              if (textContent.text.includes('Response from tool microsoft_graph_query with args')) {
                console.log('Detected Lokka MCP debug response - no actual data returned');
                // This means Lokka MCP only returned the query args, not the actual results
                extractedResult = {
                  error: "Lokka MCP Error",
                  message: "Lokka MCP server returned query arguments instead of actual Microsoft Graph API results. This suggests an authentication or configuration issue.",
                  lokkResponse: textContent.text,
                  troubleshooting: {
                    possibleCauses: [
                      "Lokka MCP server authentication failure",
                      "Insufficient permissions for the query",
                      "Lokka MCP server configuration issue",
                      "Network connectivity issue to Microsoft Graph"
                    ],
                    recommendations: [
                      "Check Lokka MCP server logs for authentication errors",
                      "Verify TENANT_ID, CLIENT_ID, and CLIENT_SECRET environment variables",
                      "Ensure the service principal has required Graph API permissions",
                      "Test the external Lokka MCP server directly"
                    ]
                  }
                };
              } else if (textContent.text.includes('Response from tool') || textContent.text.includes('microsoft_graph_query')) {
                console.log('Detected tool response message, extracting actual data...');
                // Look for JSON data in the tool response
                const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  extractedResult = JSON.parse(jsonMatch[0]);
                } else {
                  // Try to extract args if available
                  const toolArgsMatch = textContent.text.match(/args (\{.*\})/);
                  if (toolArgsMatch) {
                    const args = JSON.parse(toolArgsMatch[1]);
                    extractedResult = {
                      warning: "Tool Response Only",
                      message: "Received tool execution confirmation but no actual data",
                      queryExecuted: args
                    };
                  } else {
                    extractedResult = { message: textContent.text };
                  }
                }              } else if (textContent.text.startsWith('Result for graph API')) {
                console.log('Detected Lokka API result, extracting data...');
                // Parse Lokka's formatted response: "Result for graph API - get /path:\n\nDATA"
                
                // Find the JSON data after the header line
                const headerMatch = textContent.text.match(/Result for graph API[^\n]*\n\n(.*)/s);
                if (headerMatch) {
                  const jsonData = headerMatch[1].trim();
                  try {
                    extractedResult = JSON.parse(jsonData);
                    console.log('Parsed Lokka result as JSON');
                  } catch (jsonError) {
                    console.warn('Failed to parse Lokka JSON data:', jsonError);
                    // If not JSON, treat as raw value (like a count)
                    if (!isNaN(Number(jsonData))) {
                      extractedResult = Number(jsonData);
                      console.log('Parsed Lokka result as number:', extractedResult);
                    } else {
                      extractedResult = jsonData;
                      console.log('Using Lokka result as string:', extractedResult);
                    }
                  }
                } else {
                  // Fallback: try to find any JSON in the text
                  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    try {
                      extractedResult = JSON.parse(jsonMatch[0]);
                      console.log('Parsed fallback Lokka JSON');
                    } catch {
                      extractedResult = { message: textContent.text };
                    }
                  } else {
                    extractedResult = { message: textContent.text };
                  }
                }
              } else {
                // Try to parse the entire text as JSON
                extractedResult = JSON.parse(textContent.text);
                console.log('Parsed text content as JSON');
              }} catch (parseError) {
              console.warn('Failed to parse text content as JSON:', parseError);
              extractedResult = { 
                parseError: "JSON Parse Failed",
                message: textContent.text,
                error: parseError instanceof Error ? parseError.message : String(parseError)
              };
            }
          } else {
            console.log('Using content array directly');
            extractedResult = rawResult.content;
          }
        } else if (rawResult?.content && typeof rawResult.content === 'string') {
          // Handle case where content is a string (possible JSON)
          try {
            extractedResult = JSON.parse(rawResult.content);
            console.log('Parsed string content as JSON');
          } catch (parseError) {
            console.warn('Failed to parse string content as JSON:', parseError);
            extractedResult = { message: rawResult.content };
          }
        } else if (rawResult && typeof rawResult === 'object') {
          console.log('Using raw result object directly');
          extractedResult = rawResult;
        } else {
          console.warn('Unexpected response format from Lokka MCP');
          extractedResult = { 
            error: "Unexpected Response Format",
            message: "Query executed but returned unexpected format", 
            rawResponse: rawResult 
          };
        }
          // Format the result for display - create a user-friendly response
        let resultDisplay;
        
        // Special handling for simple count queries
        if (query.endpoint.includes('$count') && typeof extractedResult === 'number') {
          resultDisplay = `The query returned: **${extractedResult}**`;
        } else if (extractedResult && typeof extractedResult === 'object' && extractedResult['@odata.count']) {
          // Handle Graph API responses with @odata.count
          const count = extractedResult['@odata.count'];
          const items = extractedResult.value || [];
          resultDisplay = `Found **${count}** items. ${items.length > 0 ? `Here are the details:\n\n\`\`\`json\n${JSON.stringify(items, null, 2)}\n\`\`\`` : ''}`;
        } else if (extractedResult && typeof extractedResult === 'object' && extractedResult.value && Array.isArray(extractedResult.value)) {
          // Handle Graph API responses with value array
          const items = extractedResult.value;
          resultDisplay = `Found **${items.length}** items:\n\n\`\`\`json\n${JSON.stringify(items, null, 2)}\n\`\`\``;
        } else {
          // Default JSON display
          resultDisplay = `\`\`\`json\n${JSON.stringify(extractedResult, null, 2)}\n\`\`\``;
        }
        
        // Replace the execute_query block with just the result (remove the query tags)
        const replacementText = `**Query Result:**\n${resultDisplay}`;
        modifiedResponse = modifiedResponse.replace(match[0], replacementText);
        
      } catch (error) {
        console.error('Error executing Graph API query:', error);
        const errorMessage = `<execute_query>${match[1]}</execute_query>\n\n**Query Error:** ${(error as Error).message}`;
        modifiedResponse = modifiedResponse.replace(match[0], errorMessage);
      }
    }
    
    if (hasExecutedQueries) {
      console.log('Successfully processed and executed queries in LLM response');
    }
    
    return modifiedResponse;
  }  async isAvailable(): Promise<boolean> {
    if (!this.isServiceReady()) {
      return false;
    }
    
    try {
      // Check if preferred service is available first
      if (this.config.preferLocal && this.localService) {
        console.log('[UnifiedLLMService] Checking local service availability...');
        const localAvailable = await this.localService.isAvailable();
        if (localAvailable) {
          console.log('[UnifiedLLMService] Local service is available');
          return true;
        }
        console.log('[UnifiedLLMService] Local service not available, checking cloud fallback...');
      }
      
      // Check cloud service availability (either as preferred or fallback)
      if (this.cloudService) {
        console.log('[UnifiedLLMService] Checking cloud service availability...');
        const cloudAvailable = await this.cloudService.isAvailable();
        if (cloudAvailable) {
          console.log('[UnifiedLLMService] Cloud service is available');
          return true;
        }
        console.log('[UnifiedLLMService] Cloud service not available');
      }
      
      // If preferLocal is false or not set, try local as fallback
      if (!this.config.preferLocal && this.localService) {
        console.log('[UnifiedLLMService] Checking local service as fallback...');
        const localAvailable = await this.localService.isAvailable();
        if (localAvailable) {
          console.log('[UnifiedLLMService] Local service is available as fallback');
          return true;
        }
        console.log('[UnifiedLLMService] Local service not available as fallback');
      }
      
      console.log('[UnifiedLLMService] No services are available');
      return false;
    } catch (error) {
      console.warn('Error checking service availability:', error);
      return false;
    }
  }

  /**
   * Get available models from the current LLM service
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      if (this.localService) {
        return await this.localService.getAvailableModels();
      } else if (this.cloudService) {
        return await this.cloudService.getAvailableModels();
      }
      return [];
    } catch (error) {
      console.error('Failed to get available models:', error);
      return [];
    }
  }  private async getActiveService(): Promise<LLMService | CloudLLMService> {
    // Check preferLocal setting first
    if (this.config.preferLocal && this.localService) {
      console.log('[UnifiedLLMService] Checking preferred LOCAL service availability...');
      try {
        const localAvailable = await this.localService.isAvailable();
        if (localAvailable) {
          console.log('[UnifiedLLMService] Using LOCAL service (preferred and available)');
          return this.localService;
        }
        console.log('[UnifiedLLMService] Preferred LOCAL service not available, trying cloud fallback...');
      } catch (error) {
        console.warn('[UnifiedLLMService] Error checking local service availability:', error);
      }
    }
    
    // Try cloud service (either as preferred or fallback)
    if (this.cloudService) {
      console.log('[UnifiedLLMService] Checking CLOUD service availability...');
      try {
        const cloudAvailable = await this.cloudService.isAvailable();
        if (cloudAvailable) {
          console.log('[UnifiedLLMService] Using CLOUD service');
          return this.cloudService;
        }
        console.log('[UnifiedLLMService] CLOUD service not available');
      } catch (error) {
        console.warn('[UnifiedLLMService] Error checking cloud service availability:', error);
      }
    }
    
    // If preferLocal is false or not set, try local as final fallback
    if (!this.config.preferLocal && this.localService) {
      console.log('[UnifiedLLMService] Checking LOCAL service as final fallback...');
      try {
        const localAvailable = await this.localService.isAvailable();
        if (localAvailable) {
          console.log('[UnifiedLLMService] Using LOCAL service (fallback)');
          return this.localService;
        }
        console.log('[UnifiedLLMService] LOCAL fallback service not available');
      } catch (error) {
        console.warn('[UnifiedLLMService] Error checking local fallback service availability:', error);
      }
    }
    
    // No services available
    const availableServices = [];
    if (this.localService) availableServices.push('local');
    if (this.cloudService) availableServices.push('cloud');
    
    throw new Error(`No LLM service available. Provider '${this.config.provider}' is configured but no services are responding. Available service types: ${availableServices.join(', ') || 'none'}.`);
  }

  /**
   * Check if the service is properly initialized and ready to use
   */
  isServiceReady(): boolean {
    if (this.localService) {
      return true;
    } else if (this.cloudService) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Get the reason why the service is not ready (if applicable)
   */  getServiceStatus(): { ready: boolean; reason?: string; provider?: string } {
    if (this.localService) {
      return { ready: true, provider: this.config.provider };
    } else if (this.cloudService) {
      return { ready: true, provider: this.config.provider };
    } else {
      // Provide specific error messages based on what's missing
      if (this.isCloudProvider()) {
        // Check if we have any cloud providers configured
        if (!this.config.cloudProviders || Object.keys(this.config.cloudProviders).length === 0) {
          return { ready: false, reason: 'No cloud providers are configured', provider: this.config.provider };
        }
        
        // Check if any cloud provider has an API key
        const hasAnyApiKey = Object.values(this.config.cloudProviders).some(provider => 
          provider && provider.apiKey && provider.apiKey.trim() !== ''
        );
        
        if (!hasAnyApiKey) {
          return { ready: false, reason: 'No cloud provider API keys are configured', provider: this.config.provider };
        }
        
        if (!this.config.apiKey || this.config.apiKey.trim() === '') {
          return { ready: false, reason: `${this.config.provider} API key is not configured`, provider: this.config.provider };
        } else if (this.config.provider === 'azure-openai' && (!this.config.baseUrl || this.config.baseUrl.trim() === '')) {
          return { ready: false, reason: `${this.config.provider} baseUrl is not configured`, provider: this.config.provider };
        } else {
          return { ready: false, reason: `${this.config.provider} service failed to initialize`, provider: this.config.provider };
        }
      } else {
        if (this.isLocalProvider() && (!this.config.baseUrl || this.config.baseUrl.trim() === '')) {
          return { ready: false, reason: `${this.config.provider} baseUrl is not configured`, provider: this.config.provider };
        } else {
          return { ready: false, reason: `${this.config.provider} service failed to initialize`, provider: this.config.provider };
        }
      }
    }
  }

  isLocalProvider(): boolean {
    return this.config.provider === 'ollama' || this.config.provider === 'lmstudio';
  }
  isCloudProvider(): boolean {
    return this.config.provider === 'openai' || this.config.provider === 'anthropic' || this.config.provider === 'gemini' || this.config.provider === 'azure-openai';
  }
  getProviderType(): 'local' | 'cloud' {
    return this.isLocalProvider() ? 'local' : 'cloud';
  }

  /**
   * Get the actual provider name that will be used based on current availability
   * This accounts for dynamic provider selection and fallbacks
   */
  async getCurrentActiveProvider(): Promise<string> {
    try {
      const activeService = await this.getActiveService();
      
      // If we got a cloud service, get its actual provider
      if (this.cloudService && activeService === this.cloudService) {
        return this.cloudService.getProvider();
      }
      
      // If we got a local service, it's always Ollama
      if (this.localService && activeService === this.localService) {
        return 'ollama';
      }
      
      // Fallback to configured provider
      return this.config.provider;
    } catch (error) {
      console.warn('[UnifiedLLMService] Error determining active provider:', error);
      return this.config.provider; // Fallback to configured provider
    }
  }

  /**
   * Update the API key for cloud providers and reinitialize the service
   */
  updateApiKey(apiKey: string): void {
    if (!this.isCloudProvider()) {
      throw new Error('updateApiKey() is only available for cloud providers');
    }    // Update the config
    this.config.apiKey = apiKey;

    // Reinitialize the cloud service
    if (apiKey && apiKey.trim() !== '') {
      // Get the cloud provider specific configuration
      const cloudProviderConfig = this.getCloudProviderConfig(this.config, this.config.provider);
      
      if (cloudProviderConfig) {
        // Update the API key in the cloud provider config
        cloudProviderConfig.apiKey = apiKey;
        this.cloudService = new CloudLLMService(cloudProviderConfig as any, this.mcpClient);
        console.log(`✅ ${this.config.provider} service initialized with API key`);
      } else {
        this.cloudService = null;
        console.warn(`⚠️  No cloud provider configuration found for ${this.config.provider}`);
      }
    } else {
      this.cloudService = null;
      console.warn(`⚠️  Empty API key provided for ${this.config.provider}`);
    }}
  /**
   * Get cloud provider specific configuration
   */
  private getCloudProviderConfig(config: LLMConfig, provider: string): any | null {
    // If cloudProviders section exists, get config from there
    if (config.cloudProviders) {
      const providerKey = provider as 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
      const providerConfig = config.cloudProviders[providerKey];
        if (providerConfig) {
        console.log(`[UnifiedLLMService] Found cloud provider config for ${provider}:`, {
          provider: providerConfig.provider,
          model: providerConfig.model,
          hasApiKey: !!providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          maxTokens: config.maxTokens,
          temperature: config.temperature
        });
        // Return config with global settings inherited
        return {
          ...providerConfig,
          // Inherit global LLM settings from main config
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          // Provider-specific settings can override global ones
          ...(providerConfig.temperature !== undefined && { temperature: providerConfig.temperature }),
          ...(providerConfig.maxTokens !== undefined && { maxTokens: providerConfig.maxTokens })
        };
      }
    }
    
    // Fallback to root-level config (legacy compatibility)
    if (config.apiKey) {
      console.log(`[UnifiedLLMService] Using legacy root-level config for ${provider}:`, {
        provider: config.provider,
        model: config.model,
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl
      });
      return config;
    }
    
    console.warn(`[UnifiedLLMService] No configuration found for ${provider}`);
    return null;
  }
  /**
   * Find the best available cloud provider from the cloudProviders configuration
   */
  private findBestAvailableCloudProvider(config: LLMConfig): any | null {
    if (!config.cloudProviders) {
      return null;
    }

    // If a default cloud provider is set and it's valid, prioritize it
    if (config.defaultCloudProvider && config.cloudProviders[config.defaultCloudProvider]) {
      const defaultProviderConfig = config.cloudProviders[config.defaultCloudProvider];
      if (defaultProviderConfig && defaultProviderConfig.apiKey && defaultProviderConfig.apiKey.trim() !== '') {
        // Additional validation for Azure OpenAI
        if (config.defaultCloudProvider === 'azure-openai' && (!defaultProviderConfig.baseUrl || defaultProviderConfig.baseUrl.trim() === '')) {
          console.warn(`[UnifiedLLMService] Default provider ${config.defaultCloudProvider} is missing baseUrl, checking other providers`);
        } else {
          console.log(`[UnifiedLLMService] Using default cloud provider: ${config.defaultCloudProvider}`);
          // Return the config with the provider name explicitly set and global settings inherited
          const cloudConfig = {
            ...defaultProviderConfig,
            provider: config.defaultCloudProvider,
            // Global LLM settings from Advanced Settings take precedence
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            // Only use provider-specific settings if global settings are not defined
            ...(config.temperature === undefined && defaultProviderConfig.temperature !== undefined && { temperature: defaultProviderConfig.temperature }),
            ...(config.maxTokens === undefined && defaultProviderConfig.maxTokens !== undefined && { maxTokens: defaultProviderConfig.maxTokens })
          };
          
          console.log(`[UnifiedLLMService] Created cloud config for default provider ${config.defaultCloudProvider}:`, {
            temperature: cloudConfig.temperature,
            maxTokens: cloudConfig.maxTokens,
            globalTemperature: config.temperature,
            globalMaxTokens: config.maxTokens,
            providerTemperature: defaultProviderConfig.temperature,
            providerMaxTokens: defaultProviderConfig.maxTokens,
            usingGlobalSettings: config.temperature !== undefined && config.maxTokens !== undefined
          });
          
          return cloudConfig;
        }
      }
    }

    console.log(`[UnifiedLLMService] Default provider not available or not set, falling back to priority order`);

    // Fallback: Priority order for cloud providers
    const providerPriority: Array<'azure-openai' | 'openai' | 'anthropic' | 'gemini'> = [
      'azure-openai', 'openai', 'anthropic', 'gemini'
    ];

    for (const provider of providerPriority) {
      const providerConfig = config.cloudProviders[provider];
      if (providerConfig && providerConfig.apiKey && providerConfig.apiKey.trim() !== '') {
        // Additional validation for Azure OpenAI
        if (provider === 'azure-openai' && (!providerConfig.baseUrl || providerConfig.baseUrl.trim() === '')) {
          continue; // Skip this provider if baseUrl is missing
        }        console.log(`[UnifiedLLMService] Found available cloud provider: ${provider}`);
        // Return the config with the provider name explicitly set and global settings inherited
        const cloudConfig = {
          ...providerConfig,
          provider: provider,
          // Global LLM settings from Advanced Settings take precedence
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          // Only use provider-specific settings if global settings are not defined
          ...(config.temperature === undefined && providerConfig.temperature !== undefined && { temperature: providerConfig.temperature }),
          ...(config.maxTokens === undefined && providerConfig.maxTokens !== undefined && { maxTokens: providerConfig.maxTokens })
        };
        
        console.log(`[UnifiedLLMService] Created cloud config for ${provider}:`, {
          temperature: cloudConfig.temperature,
          maxTokens: cloudConfig.maxTokens,
          globalTemperature: config.temperature,
          globalMaxTokens: config.maxTokens,
          providerTemperature: providerConfig.temperature,
          providerMaxTokens: providerConfig.maxTokens,
          usingGlobalSettings: config.temperature !== undefined && config.maxTokens !== undefined
        });
        
        return cloudConfig;
      }
    }

    return null;
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration dynamically (useful when settings change)
   */  updateConfig(newConfig: LLMConfig): void {    console.log(`[UnifiedLLMService] Updating config from ${this.config.provider} to ${newConfig.provider}`);
    console.log(`[UnifiedLLMService] PreferLocal changed from ${this.config.preferLocal} to ${newConfig.preferLocal}`);
    console.log(`[UnifiedLLMService] MaxTokens changed from ${this.config.maxTokens} to ${newConfig.maxTokens}`);
    console.log(`[UnifiedLLMService] Temperature changed from ${this.config.temperature} to ${newConfig.temperature}`);
    console.log(`[UnifiedLLMService] Current services state:`, {
      hasCloudService: !!this.cloudService,
      hasLocalService: !!this.localService,
      cloudServiceType: this.cloudService ? this.cloudService.constructor.name : 'none',
      localServiceType: this.localService ? this.localService.constructor.name : 'none'
    });
    
    this.config = newConfig;
    
    // Update existing CloudLLMService with new configuration if it exists
    if (this.cloudService) {
      console.log(`[UnifiedLLMService] CloudLLMService exists, finding best cloud provider...`);
      const cloudProviderConfig = this.findBestAvailableCloudProvider(newConfig);
      if (cloudProviderConfig) {
        console.log(`[UnifiedLLMService] Updating existing CloudLLMService with new config`);
        // Create a new CloudLLMService instance with updated configuration
        this.cloudService = new CloudLLMService(cloudProviderConfig as any, this.mcpClient);
      } else {
        console.log(`[UnifiedLLMService] No cloud provider config found, keeping existing CloudLLMService`);
      }
    } else {
      console.log(`[UnifiedLLMService] No existing CloudLLMService to update`);
    }
      // Update existing LocalLLMService with new configuration if it exists
    if (this.localService && (newConfig.provider === 'ollama' || newConfig.provider === 'lmstudio')) {
      console.log(`[UnifiedLLMService] Recreating LocalLLMService with new config`);
      // Recreate local service with new configuration
      const { LLMService } = require('./LLMService');
      this.localService = new LLMService(newConfig);
    }
  }
}
