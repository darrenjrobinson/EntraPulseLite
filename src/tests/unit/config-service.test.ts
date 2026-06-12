// config-service.test.ts
// Tests for the Context-Aware ConfigService with current functionality

// Mock electron-store with proper instance tracking
const mockStoreInstance = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  size: 0,
  store: {}
};

// Store references to all created instances
const storeInstances: any[] = [];

const mockStoreConstructor = jest.fn().mockImplementation((config) => {
  // Return the same instance for consistency
  storeInstances.push(mockStoreInstance);
  return mockStoreInstance;
});

// Use jest.doMock to ensure the mock is applied before importing
jest.doMock('electron-store', () => mockStoreConstructor);

// Import after the mock is set up
import { ConfigService } from '../../shared/ConfigService';
import { LLMConfig } from '../../types';

describe('ConfigService - Context-Aware Configuration', () => {
  let configService: ConfigService;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock behavior that mimics the actual store defaults
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
    
    // Clear any previous instances
    storeInstances.length = 0;
    
    // Create new ConfigService instance (this will call the constructor)
    configService = new ConfigService();
    
    // Clear mocks again after constructor to focus on test method calls
    jest.clearAllMocks();
  });  describe('Authentication Context Management', () => {
    test('should set authentication context to client-credentials mode', () => {
      configService.setAuthenticationVerified(true);
      configService.setAuthenticationContext('client-credentials');
      
      expect(mockStoreInstance.set).toHaveBeenCalledWith('currentAuthMode', 'client-credentials');
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('currentUserKey');
    });

    test('should set authentication context to interactive mode with user info', () => {
      const userInfo = { id: 'user@example.com', email: 'user@example.com' };
      
      // Mock users object for the get call within setAuthenticationContext
      mockStoreInstance.get.mockImplementation((key: string) => {
        if (key === 'users') {
          return {};
        }
        return undefined;
      });
      
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
  });  describe('Security and Encryption', () => {
    test('should initialize with encryption key', () => {
      // Create a new instance to test constructor calls
      // We'll check calls on this specific creation
      mockStoreConstructor.mockClear();
      
      // Create a new instance for this test
      const testConfigService = new ConfigService();
      
      // Check if the Store constructor was called correctly
      expect(mockStoreConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'entrapulse-lite-config',
          encryptionKey: 'entrapulse-lite-secret-key-2025'
        })
      );
    });
  });
});