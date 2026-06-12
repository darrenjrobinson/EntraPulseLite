// config-service.test.ts
// Tests for the Context-Aware ConfigService with current functionality

import { ConfigService } from '../../shared/ConfigService';
import { LLMConfig } from '../../types';

// Mock electron-store
const mockStoreInstance = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  size: 0,
  store: {}
};

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => mockStoreInstance);
});

describe('ConfigService - Context-Aware Configuration', () => {
  let configService: ConfigService;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset mock store state to return defaults
    mockStoreInstance.get.mockImplementation((key: string) => {
      const defaults: any = {
        application: {
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            apiKey: '',
            baseUrl: '',
            temperature: 0.2,
            maxTokens: 2048,
            organization: ''
          },
          lastUsedProvider: 'anthropic',
          modelCache: {}
        },
        users: {},
        currentAuthMode: 'client-credentials',
        currentUserKey: undefined
      };
      return defaults[key];
    });
    
    // Create new ConfigService instance
    configService = new ConfigService();
  });
  describe('Authentication Context Management', () => {
    test('should set authentication context to client-credentials mode', () => {
      configService.setAuthenticationVerified(true);
      configService.setAuthenticationContext('client-credentials');
      
      expect(mockStoreInstance.set).toHaveBeenCalledWith('currentAuthMode', 'client-credentials');
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('currentUserKey');
    });

    test('should set authentication context to interactive mode with user info', () => {
      const userInfo = { id: 'user@example.com', email: 'user@example.com' };
      
      // Mock users object for the get call
      mockStoreInstance.get.mockImplementation((key: string) => {
        if (key === 'users') {
          return {};
        }
        return undefined;      });
      
      configService.setAuthenticationVerified(true);
      configService.setAuthenticationContext('interactive', userInfo);
      
      expect(mockStoreInstance.set).toHaveBeenCalledWith('currentAuthMode', 'interactive');
      expect(mockStoreInstance.set).toHaveBeenCalledWith('currentUserKey', 'user_user@example.com');
      expect(mockStoreInstance.set).toHaveBeenCalledWith('users', expect.objectContaining({
        'user_user@example.com': expect.objectContaining({
          llm: expect.any(Object),
          lastUsedProvider: 'anthropic',
          modelCache: {}
        })
      }));
    });    test('should handle interactive mode without user info', () => {
      // Should not throw, just set the mode
      expect(() => {
        configService.setAuthenticationVerified(true);
        configService.setAuthenticationContext('interactive');
      }).not.toThrow();
      
      expect(mockStoreInstance.set).toHaveBeenCalledWith('currentAuthMode', 'interactive');
    });
  });

  describe('LLM Configuration Management', () => {
    test('should get default LLM configuration', () => {
      const config = configService.getLLMConfig();
        expect(config).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: '',
        baseUrl: '',
        temperature: 0.2,
        maxTokens: 4096,
        organization: '',
        preferLocal: true
      });
    });

    test('should save LLM configuration in client-credentials mode', () => {
      // Mock to return current application config
      mockStoreInstance.get.mockImplementation((key: string) => {
        if (key === 'application') {
          return {
            llm: {
              provider: 'anthropic',
              model: 'claude-sonnet-4-6',
              apiKey: '',
              baseUrl: '',
              temperature: 0.2,
              maxTokens: 2048,
              organization: ''
            },
            lastUsedProvider: 'anthropic',
            modelCache: {}
          };
        }
        return undefined;
      });
      
      configService.setAuthenticationContext('client-credentials');
      
      const newConfig: LLMConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
        baseUrl: '',
        temperature: 0.3,
        maxTokens: 4096,
        organization: 'test-org'
      };

      configService.saveLLMConfig(newConfig);
      
      expect(mockStoreInstance.set).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          llm: newConfig,
          lastUsedProvider: 'openai'
        })
      );
    });

    test('should save LLM configuration in interactive mode', () => {
      const userInfo = { id: 'user@example.com', email: 'user@example.com' };
      
      // Mock to return users object for context switching
      mockStoreInstance.get.mockImplementation((key: string) => {
        if (key === 'users') {
          return {
            'user_user@example.com': {
              llm: {
                provider: 'anthropic',
                model: 'claude-sonnet-4-6',
                apiKey: '',
                baseUrl: '',
                temperature: 0.2,
                maxTokens: 2048,
                organization: ''
              },
              lastUsedProvider: 'anthropic',
              modelCache: {}
            }
          };
        }
        return undefined;      });
      
      configService.setAuthenticationVerified(true);
      configService.setAuthenticationContext('interactive', userInfo);
      
      const newConfig: LLMConfig = {
        provider: 'ollama',
        model: 'llama2',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        temperature: 0.2,
        maxTokens: 2048,
        organization: ''
      };

      configService.saveLLMConfig(newConfig);
      
      expect(mockStoreInstance.set).toHaveBeenCalledWith(
        'users',
        expect.objectContaining({
          'user_user@example.com': expect.objectContaining({
            llm: newConfig,
            lastUsedProvider: 'ollama'
          })
        })
      );
    });
  });

  describe('Security and Encryption', () => {
    test('should initialize with encryption key', () => {
      const Store = require('electron-store');
      
      // Check that Store was called with encryption options
      expect(Store).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'entrapulse-lite-config',
          encryptionKey: expect.any(String)
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle store errors gracefully', () => {
      mockStoreInstance.get.mockImplementation(() => {
        throw new Error('Store access error');
      });
      
      // Should fallback to defaults and not throw
      expect(() => {
        const config = configService.getLLMConfig();
        expect(config).toBeDefined();
      }).not.toThrow();
    });

    test('should handle null configuration data', () => {
      mockStoreInstance.get.mockReturnValue(null);
      
      // Should fallback to defaults
      expect(() => {
        const config = configService.getLLMConfig();
        expect(config).toBeDefined();
      }).not.toThrow();
    });
  });
});
