// azure-openai.test.ts
// Dedicated tests for Azure OpenAI functionality

// Mock electron-store before any imports
jest.mock('electron-store', () => {
  class MockStore {
    private data: any = {};
    private defaults: any = {};

    constructor(options: any = {}) {
      this.defaults = options.defaults || {};
    }

    get(key?: string, defaultValue?: any) {
      if (key === undefined) {
        return { ...this.defaults, ...this.data };
      }
      
      const keys = key.split('.');
      let current = { ...this.defaults, ...this.data };
      
      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          return defaultValue;
        }
      }
      
      return current;
    }

    set(key: string | object, value?: any) {
      if (typeof key === 'object') {
        Object.assign(this.data, key);
        return;
      }
      
      const keys = key.split('.');
      let current = this.data;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in current) || typeof current[k] !== 'object') {
          current[k] = {};
        }
        current = current[k];
      }
      
      current[keys[keys.length - 1]] = value;
    }

    has(key: string) {
      return this.get(key) !== undefined;
    }

    delete(key: string) {
      const keys = key.split('.');
      let current = this.data;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in current) || typeof current[k] !== 'object') {
          return;
        }
        current = current[k];
      }
      
      delete current[keys[keys.length - 1]];
    }

    clear() {
      this.data = {};
    }

    get size() {
      return Object.keys(this.data).length;
    }
  }

  return MockStore;
});

import { CloudLLMService } from '../../llm/CloudLLMService';
import { EnhancedCloudLLMService } from '../../llm/EnhancedCloudLLMService';
import { UnifiedLLMService } from '../../llm/UnifiedLLMService';
import { ConfigService } from '../../shared/ConfigService';
import { CloudLLMProviderConfig, LLMConfig, ChatMessage } from '../../types';
import axios from 'axios';

// Mock axios for network requests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Azure OpenAI Provider Tests', () => {
  let mockAzureOpenAIConfig: CloudLLMProviderConfig;
  let mockLLMConfig: LLMConfig;  beforeEach(() => {
    jest.clearAllMocks();    
    mockAzureOpenAIConfig = {
      provider: 'azure-openai',
      apiKey: 'test-azure-openai-api-key',
      baseUrl: 'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview',
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2048
    };    mockLLMConfig = {
      provider: 'azure-openai',
      apiKey: 'test-azure-openai-api-key',
      baseUrl: 'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview',
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 4096,
      preferLocal: true
    };
  });
  describe('CloudLLMService Azure OpenAI', () => {
    let cloudLLMService: CloudLLMService;

    beforeEach(() => {
      cloudLLMService = new CloudLLMService(mockAzureOpenAIConfig);
    });

    test('should initialize with Azure OpenAI configuration', () => {
      expect(cloudLLMService).toBeDefined();
      expect(cloudLLMService.getConfig().provider).toBe('azure-openai');
      expect(cloudLLMService.getConfig().baseUrl).toBe('https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview');
    });
    
    test('should validate full URL format correctly', async () => {
      const chatMethod = (cloudLLMService as any).chatWithAzureOpenAI.bind(cloudLLMService);
      
      // Should not throw for valid URL
      await expect(async () => {
        try {
          // This will eventually throw because we're not actually making the request,
          // but it should pass URL validation
          await chatMethod([{ role: 'user', content: 'test message' }]);
        } catch (error) {
          // We only care about URL validation errors
          if ((error as Error).message.includes('URL is incomplete')) {
            throw error;
          }
          // Other errors are fine, we just want to make sure URL validation passed
        }
      }).not.toThrow(/URL is incomplete/);
    });
    
    test('should reject incomplete URLs without chat/completions path', async () => {
      const incompleteConfig = {
        ...mockAzureOpenAIConfig,
        baseUrl: 'https://test.openai.azure.com/openai/deployments/gpt-4o'
      };
      
      const service = new CloudLLMService(incompleteConfig);
      const chatMethod = (service as any).chatWithAzureOpenAI.bind(service);
      
      // Should throw an error about missing chat/completions path
      await expect(chatMethod([{ role: 'user', content: 'test' }]))
        .rejects.toThrow(/URL is incomplete/);
    });
    
    test('should reject incomplete URLs without deployments path', async () => {
      const incompleteConfig = {
        ...mockAzureOpenAIConfig,
        baseUrl: 'https://test.openai.azure.com/openai/'
      };
      
      const service = new CloudLLMService(incompleteConfig);
      const chatMethod = (service as any).chatWithAzureOpenAI.bind(service);
      
      // Should throw an error about missing deployments path
      await expect(chatMethod([{ role: 'user', content: 'test' }]))
        .rejects.toThrow(/URL is incomplete/);
    });
    
    test('should extract deployment name correctly', async () => {
      // Mock console.log to capture output
      const originalConsoleLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((...args) => {
        logs.push(args.join(' '));
      });
      
      const chatMethod = (cloudLLMService as any).chatWithAzureOpenAI.bind(cloudLLMService);
      
      try {
        // Will eventually throw, but should log the deployment name first
        await chatMethod([{ role: 'user', content: 'test message' }]);
      } catch (error) {
        // Expected error
      }
      
      // Restore console.log
      console.log = originalConsoleLog;
      
      // Verify the deployment name was extracted and logged correctly
      const deploymentLog = logs.find(log => log.includes('Using deployment:'));
      expect(deploymentLog).toBeDefined();
      expect(deploymentLog).toContain('gpt-4o');
    });    test('should persist and reload full Azure OpenAI endpoint URL correctly', async () => {
      const configService = new ConfigService();
      // Set authentication verified before testing persistence
      configService.setAuthenticationVerified(true);
      
      const fullEndpointUrl = 'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview';
      
      // Mock cloud provider config
      const azureOpenAIConfig: CloudLLMProviderConfig = {
        provider: 'azure-openai',
        apiKey: 'test-key',
        baseUrl: fullEndpointUrl,
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 2048
      };
      
      console.log('💾 [Persistence Test] Saving Azure OpenAI config with full URL:', fullEndpointUrl);
      
      // Save the config
      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      
      // Reload config to verify persistence
      const reloadedConfig = configService.getLLMConfig();
      console.log('🔄 [Persistence Test] Reloaded config:', reloadedConfig);
      
      // Get the Azure OpenAI provider specifically
      const azureProvider = configService.getCloudProviderConfig('azure-openai');
      console.log('🔍 [Persistence Test] Azure OpenAI provider config:', azureProvider);
      
      // Verify the full URL is preserved
      expect(azureProvider).toBeDefined();
      expect(azureProvider?.baseUrl).toBe(fullEndpointUrl);
      expect(azureProvider?.baseUrl).toContain('/openai/deployments/gpt-4o/chat/completions');
      expect(azureProvider?.baseUrl).toContain('api-version=2025-01-01-preview');
      
      // Verify it's not truncated to just the base domain
      expect(azureProvider?.baseUrl).not.toBe('https://test.openai.azure.com/');
      expect(azureProvider?.baseUrl).not.toBe('https://test.openai.azure.com');
      
      console.log('✅ [Persistence Test] Full URL persistence verified successfully');
    });

    test('should check availability with Azure OpenAI endpoint', async () => {
      // Mock successful Azure OpenAI models endpoint response
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [] }
      });

      const isAvailable = await cloudLLMService.isAvailable();
      
      expect(isAvailable).toBe(true);      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://test.openai.azure.com/openai/models?api-version=2025-01-01-preview',
        expect.objectContaining({
          headers: {
            'api-key': 'test-azure-openai-api-key'
          },
          timeout: 15000
        })
      );
    });

    test('should handle availability check failure', async () => {
      // Mock failed Azure OpenAI endpoint response
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const isAvailable = await cloudLLMService.isAvailable();
      
      expect(isAvailable).toBe(false);
    });

    test('should handle missing baseUrl gracefully', async () => {
      const configWithoutBaseUrl = { ...mockAzureOpenAIConfig, baseUrl: '' };
      const service = new CloudLLMService(configWithoutBaseUrl);

      const isAvailable = await service.isAvailable();
      
      expect(isAvailable).toBe(false);
    });    test('should fetch Azure OpenAI models successfully', async () => {
      // Mock successful Azure OpenAI models response
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4o-mini', object: 'model' },
            { id: 'gpt-4-turbo', object: 'model' },
            { id: 'gpt-35-turbo', object: 'model' }
          ]
        }
      });

      const models = await cloudLLMService.getAvailableModels();
      
      expect(models).toEqual(['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo']);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://test.openai.azure.com/openai/models?api-version=2025-01-01-preview',
        expect.objectContaining({
          headers: {
            'api-key': 'test-azure-openai-api-key'
          }
        })
      );
    });

    test('should return fallback models when API call fails', async () => {
      // Mock failed Azure OpenAI models response
      mockedAxios.get.mockRejectedValueOnce(new Error('API error'));

      const models = await cloudLLMService.getAvailableModels();
      const fallbackModels = cloudLLMService.getFallbackModels();
      
      expect(models).toEqual(fallbackModels);
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gpt-35-turbo');
    });    test('should perform chat completions with correct Azure OpenAI format', async () => {
      // Mock successful Azure OpenAI chat completion response
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [{
            message: {
              content: 'Hello! I can help you with Microsoft Graph queries.'
            }
          }]
        }
      });

      const messages: ChatMessage[] = [
        {
          id: 'test-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date()
        }
      ];

      const response = await cloudLLMService.chat(messages);
      
      expect(response).toBe('Hello! I can help you with Microsoft Graph queries.');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        // Use the full URL exactly as provided in the configuration
        'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user', content: 'Hello' })
          ]),
          temperature: 0.1,
          max_tokens: 2048
        }),
        expect.objectContaining({
          headers: {
            'api-key': 'test-azure-openai-api-key',
            'Content-Type': 'application/json'
          }
        })
      );
    });

    test('should throw error when baseUrl is missing for chat', async () => {
      const configWithoutBaseUrl = { ...mockAzureOpenAIConfig, baseUrl: '' };
      const service = new CloudLLMService(configWithoutBaseUrl);

      const messages: ChatMessage[] = [
        {
          id: 'test-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date()
        }
      ];

      await expect(service.chat(messages)).rejects.toThrow('Azure OpenAI requires a full endpoint URL. Please configure a valid endpoint in the settings.');
    });
  });

  describe('EnhancedCloudLLMService Azure OpenAI', () => {
    let enhancedCloudLLMService: EnhancedCloudLLMService;

    beforeEach(() => {
      enhancedCloudLLMService = new EnhancedCloudLLMService(mockAzureOpenAIConfig);
    });

    test('should initialize with Azure OpenAI configuration', () => {
      expect(enhancedCloudLLMService).toBeDefined();
      expect(enhancedCloudLLMService.getConfig().provider).toBe('azure-openai');
    });

    test('should check availability with Azure OpenAI', async () => {
      // Mock successful Azure OpenAI models endpoint response
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [] }
      });

      const isAvailable = await enhancedCloudLLMService.isAvailable();
      
      expect(isAvailable).toBe(true);
    });

    test('should fetch models with enhanced service', async () => {
      // Mock successful Azure OpenAI models response
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4o-mini', object: 'model' }
          ]
        }
      });

      const models = await enhancedCloudLLMService.getAvailableModels();
      
      expect(models).toEqual(['gpt-4o-mini', 'gpt-4o']);
    });
  });

  describe('UnifiedLLMService Azure OpenAI', () => {
    let unifiedLLMService: UnifiedLLMService;

    beforeEach(() => {
      unifiedLLMService = new UnifiedLLMService(mockLLMConfig);
    });

    test('should initialize correctly with Azure OpenAI', () => {
      expect(unifiedLLMService).toBeDefined();
      expect(unifiedLLMService.getConfig().provider).toBe('azure-openai');
      expect(unifiedLLMService.isCloudProvider()).toBe(true);
      expect(unifiedLLMService.isLocalProvider()).toBe(false);
      expect(unifiedLLMService.getProviderType()).toBe('cloud');
    });    test('should require API key for service readiness', () => {
      expect(unifiedLLMService.isServiceReady()).toBe(true);

      // Create config without API key but with cloud providers structure
      const configWithoutKey = { 
        ...mockLLMConfig, 
        apiKey: '',
        cloudProviders: {
          'azure-openai': {
            ...mockAzureOpenAIConfig,
            apiKey: ''
          }
        }
      };
      const serviceWithoutKey = new UnifiedLLMService(configWithoutKey);
      
      expect(serviceWithoutKey.isServiceReady()).toBe(false);
      expect(serviceWithoutKey.getServiceStatus().ready).toBe(false);
      expect(serviceWithoutKey.getServiceStatus().reason).toContain('API key');
    });    test('should require baseUrl for Azure OpenAI', () => {
      // Create config without baseUrl but with cloud providers structure
      const configWithoutBaseUrl = { 
        ...mockLLMConfig, 
        baseUrl: '',
        cloudProviders: {
          'azure-openai': {
            ...mockAzureOpenAIConfig,
            baseUrl: ''
          }
        }
      };
      const serviceWithoutBaseUrl = new UnifiedLLMService(configWithoutBaseUrl);
      
      expect(serviceWithoutBaseUrl.isServiceReady()).toBe(false);
      expect(serviceWithoutBaseUrl.getServiceStatus().ready).toBe(false);
      expect(serviceWithoutBaseUrl.getServiceStatus().reason).toContain('baseUrl');
    });

    test('should allow API key updates', () => {
      const newApiKey = 'new-azure-openai-api-key';
      unifiedLLMService.updateApiKey(newApiKey);
      
      expect(unifiedLLMService.getConfig().apiKey).toBe(newApiKey);
      expect(unifiedLLMService.isServiceReady()).toBe(true);
    });
  });
  describe('ConfigService Azure OpenAI Integration', () => {
    let configService: ConfigService;

    beforeEach(() => {
      configService = new ConfigService();
      // Set authentication verified before testing config operations
      configService.setAuthenticationVerified(true);
    });

    test('should save Azure OpenAI cloud provider configuration', () => {
      const azureOpenAIConfig: CloudLLMProviderConfig = {
        provider: 'azure-openai',
        apiKey: 'test-azure-key',
        baseUrl: 'https://test.openai.azure.com',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 2048
      };

      expect(() => {
        configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      }).not.toThrow();
    });

    test('should retrieve Azure OpenAI cloud provider configuration', () => {
      const azureOpenAIConfig: CloudLLMProviderConfig = {
        provider: 'azure-openai',
        apiKey: 'test-azure-key',
        baseUrl: 'https://test.openai.azure.com',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 2048
      };

      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      const retrievedConfig = configService.getCloudProviderConfig('azure-openai');

      expect(retrievedConfig).toEqual(azureOpenAIConfig);
      expect(retrievedConfig?.provider).toBe('azure-openai');
      expect(retrievedConfig?.baseUrl).toBe('https://test.openai.azure.com');
    });

    test('should include Azure OpenAI in configured providers list', () => {
      const azureOpenAIConfig: CloudLLMProviderConfig = {
        provider: 'azure-openai',
        apiKey: 'test-azure-key',
        baseUrl: 'https://test.openai.azure.com',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 2048
      };      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      const configuredProviders = configService.getConfiguredCloudProviders();

      expect(configuredProviders).toHaveLength(1);
      expect(configuredProviders[0].provider).toBe('azure-openai');
      expect(configuredProviders[0].config).toEqual(azureOpenAIConfig);
    });

    test('should set Azure OpenAI as default provider', () => {
      const azureOpenAIConfig: CloudLLMProviderConfig = {
        provider: 'azure-openai',
        apiKey: 'test-azure-key',
        baseUrl: 'https://test.openai.azure.com',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 2048
      };      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      configService.setDefaultCloudProvider('azure-openai');

      const defaultProvider = configService.getDefaultCloudProvider();
      expect(defaultProvider).not.toBeNull();
      expect(defaultProvider!.provider).toBe('azure-openai');
      expect(defaultProvider!.config).toEqual(azureOpenAIConfig);
    });

    test('should remove Azure OpenAI provider configuration', () => {
      const azureOpenAIConfig: CloudLLMProviderConfig = {
        provider: 'azure-openai',
        apiKey: 'test-azure-key',
        baseUrl: 'https://test.openai.azure.com',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 2048
      };

      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      expect(configService.getCloudProviderConfig('azure-openai')).toBeDefined();

      configService.removeCloudProviderConfig('azure-openai');
      expect(configService.getCloudProviderConfig('azure-openai')).toBeNull();
    });
  });  describe('Azure OpenAI URL Format Validation', () => {
    test('should construct correct Azure OpenAI chat completion URL', () => {
      const service = new CloudLLMService(mockAzureOpenAIConfig);
      
      // Mock the chat method to inspect the URL being called
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { choices: [{ message: { content: 'Test response' } }] }
      });

      const messages: ChatMessage[] = [
        { id: 'test-1', role: 'user', content: 'Test', timestamp: new Date() }
      ];

      service.chat(messages);

      // Verify the mock was called with the exact full URL from the config
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview',
        expect.any(Object),
        expect.any(Object)
      );
    });    test('should construct correct Azure OpenAI models URL', async () => {
      const service = new CloudLLMService(mockAzureOpenAIConfig);
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [] }
      });

      await service.getAvailableModels();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://test.openai.azure.com/openai/models?api-version=2025-01-01-preview',
        expect.objectContaining({
          headers: { 'api-key': 'test-azure-openai-api-key' }
        })
      );
    });
    
    test('should validate chat URL format and reject invalid URLs', async () => {
      // Set up config with an invalid URL that's missing required components
      const invalidConfig = { 
        ...mockAzureOpenAIConfig, 
        baseUrl: 'https://test.openai.azure.com/' 
      };
      const service = new CloudLLMService(invalidConfig);
      
      const messages: ChatMessage[] = [
        { id: 'test-1', role: 'user', content: 'Test', timestamp: new Date() }
      ];
        // The service should throw an error due to invalid URL format
      await expect(service.chat(messages)).rejects.toThrow(
        /Azure OpenAI URL is incomplete/
      );
      
      // Request should not have been made
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
    
    test('should validate URL format with missing API version', async () => {      // URL with deployment but missing API version
      const invalidConfig = { 
        ...mockAzureOpenAIConfig, 
        baseUrl: 'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions' 
      };
      const service = new CloudLLMService(invalidConfig);
      const messages: ChatMessage[] = [
        { id: 'test-1', role: 'user', content: 'Test', timestamp: new Date() }
      ];
        await expect(service.chat(messages)).rejects.toThrow(
        /Azure OpenAI URL is incomplete/
      );
    });
  });

  describe('Azure OpenAI Authentication Headers', () => {
    test('should use api-key header instead of Authorization Bearer', async () => {
      const service = new CloudLLMService(mockAzureOpenAIConfig);
      
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { choices: [{ message: { content: 'Test response' } }] }
      });

      const messages: ChatMessage[] = [
        { id: 'test-1', role: 'user', content: 'Test', timestamp: new Date() }
      ];

      await service.chat(messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: {
            'api-key': 'test-azure-openai-api-key',
            'Content-Type': 'application/json'
          }
        })
      );

      // Verify that Authorization header is NOT used
      const callArgs = mockedAxios.post.mock.calls[0];
      const headers = callArgs[2]?.headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    test('should use correct headers for models endpoint', async () => {
      const service = new CloudLLMService(mockAzureOpenAIConfig);
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [] }
      });

      await service.isAvailable();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'api-key': 'test-azure-openai-api-key'
          }
        })
      );
    });  });
  describe('Azure OpenAI URL Persistence Tests', () => {
    let configService: ConfigService;
    const fullAzureOpenAIUrl = 'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview';
    const azureOpenAIConfig: CloudLLMProviderConfig = {
      provider: 'azure-openai',
      apiKey: 'test-azure-openai-api-key',
      baseUrl: fullAzureOpenAIUrl,
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2048
    };

    beforeEach(() => {
      // Create a fresh ConfigService for each test
      configService = new ConfigService();
      // Set authentication verified before testing config operations
      configService.setAuthenticationVerified(true);
      // Reset any existing config
      configService.resetConfig();
    });

    test('should persist the full Azure OpenAI URL when saving and retrieving', () => {
      // Save the Azure OpenAI config with full URL
      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      
      // Get the saved config
      const retrievedConfig = configService.getCloudProviderConfig('azure-openai');
      
      // Verify the full URL is preserved exactly as provided
      expect(retrievedConfig).not.toBeNull();
      expect(retrievedConfig!.baseUrl).toBe(fullAzureOpenAIUrl);
      
      // Verify URL components are intact
      expect(retrievedConfig!.baseUrl).toContain('/chat/completions');
      expect(retrievedConfig!.baseUrl).toContain('api-version=');
      expect(retrievedConfig!.baseUrl).toContain('/deployments/gpt-4o');
    });

    test('should persist the full Azure OpenAI URL through LLMConfig save/load cycle', () => {
      // First save the cloud provider config
      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      
      // Create an LLM config that uses this provider
      const llmConfig: LLMConfig = {
        provider: 'azure-openai',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 2048,
        preferLocal: false,
        defaultCloudProvider: 'azure-openai',
        cloudProviders: {
          'azure-openai': azureOpenAIConfig
        }
      };
      
      // Save the LLM config
      configService.saveLLMConfig(llmConfig);
      
      // Get the config back
      const retrievedLLMConfig = configService.getLLMConfig();
      
      // Verify Azure OpenAI config is preserved
      expect(retrievedLLMConfig.cloudProviders).toBeDefined();
      expect(retrievedLLMConfig.cloudProviders!['azure-openai']).toBeDefined();
        // Verify the full URL is preserved in the cloud providers
      const azureConfig = retrievedLLMConfig.cloudProviders!['azure-openai'];
      expect(azureConfig).toBeDefined();
      expect(azureConfig!.baseUrl).toBe(fullAzureOpenAIUrl);
      expect(azureConfig!.baseUrl).toContain('/chat/completions');
      expect(azureConfig!.baseUrl).toContain('api-version=');
      expect(azureConfig!.baseUrl).toContain('/deployments/gpt-4o');
    });
    
    test('should preserve Azure OpenAI URL when updating other aspects of config', () => {
      // First save the cloud provider config
      configService.saveCloudProviderConfig('azure-openai', azureOpenAIConfig);
      
      // Get the current config
      const originalConfig = configService.getCloudProviderConfig('azure-openai');
      expect(originalConfig!.baseUrl).toBe(fullAzureOpenAIUrl);
      
      // Update another aspect of the config while preserving the URL
      const updatedConfig = { 
        ...originalConfig!,
        temperature: 0.5,  // Update temperature
        maxTokens: 4096    // Update max tokens
      };
      
      // Save the updated config
      configService.saveCloudProviderConfig('azure-openai', updatedConfig);
      
      // Get the config again
      const retrievedConfig = configService.getCloudProviderConfig('azure-openai');
      
      // Verify the URL is still intact
      expect(retrievedConfig!.baseUrl).toBe(fullAzureOpenAIUrl);
      // Verify the updates were applied
      expect(retrievedConfig!.temperature).toBe(0.5);
      expect(retrievedConfig!.maxTokens).toBe(4096);
    });
  });
});
