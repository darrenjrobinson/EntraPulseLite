// Enhanced Cloud LLM Service with MCP integration for dynamic model discovery
import axios from 'axios';
import { LLMConfig, ChatMessage } from '../types';
import {
  fetchAnthropicModels,
  testAnthropicConnection,
  filterOpenAIChatModels,
  buildOpenAICompletionParams,
  buildAnthropicCompletionParams,
  buildOpenAIHeaders,
  FALLBACK_ANTHROPIC_MODELS,
  FALLBACK_OPENAI_MODELS,
  testGeminiConnection,
  FALLBACK_GEMINI_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL
} from './CloudModelCatalog';

interface CloudLLMConfig extends LLMConfig {
  apiKey: string;
  organization?: string; // For OpenAI
}

export interface MCPClient {
  callTool(serverName: string, toolName: string, params: any): Promise<any>;
}

export class EnhancedCloudLLMService {
  private config: CloudLLMConfig;
  private mcpClient?: MCPClient;

  constructor(config: CloudLLMConfig, mcpClient?: MCPClient) {
    this.config = config;
    this.mcpClient = mcpClient;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    try {
      if (this.config.provider === 'openai') {
        return this.chatWithOpenAI(messages);
      } else if (this.config.provider === 'anthropic') {
        return this.chatWithAnthropic(messages);      } else if (this.config.provider === 'gemini') {
        return this.chatWithGemini(messages);
      } else if (this.config.provider === 'azure-openai') {
        return this.chatWithAzureOpenAI(messages);
      } else {
        throw new Error(`Unsupported cloud LLM provider: ${this.config.provider}`);
      }
    } catch (error) {
      console.error('Cloud LLM chat failed:', error);
      throw new Error('Failed to communicate with cloud LLM');
    }
  }
  async isAvailable(): Promise<boolean> {
    try {
      if (this.config.provider === 'openai') {
        const response = await axios.get('https://api.openai.com/v1/models', {
          headers: buildOpenAIHeaders(this.config.apiKey!, this.config.organization),
          timeout: 5000,
        });
        return response.status === 200;
      } else if (this.config.provider === 'anthropic') {
        // Validate the key against the Models API (no tokens consumed)
        return !!this.config.apiKey && await testAnthropicConnection(this.config.apiKey);
      } else if (this.config.provider === 'gemini') {
        // Validate the key against the models listing endpoint - costs no
        // tokens and does not depend on any specific (possibly retired) model
        return await testGeminiConnection(this.config.apiKey!);
      }      else if (this.config.provider === 'azure-openai') {
        // Test Azure OpenAI with a simple connectivity check
        if (!this.config.baseUrl) {
          console.error('Azure OpenAI requires full endpoint URL');
          return false;
        }

        try {
          // Extract the base URL from the full endpoint
          const urlObj = new URL(this.config.baseUrl);
          const baseEndpoint = `${urlObj.protocol}//${urlObj.hostname}`;
          
          console.log(`Testing Azure OpenAI connectivity with base endpoint: ${baseEndpoint}`);
          console.log(`Full URL provided: ${this.config.baseUrl}`);
          
          // Always check models endpoint for availability, regardless of the chat URL format
          const modelsEndpoint = `${baseEndpoint}/openai/models?api-version=2025-01-01-preview`;
          console.log(`Checking Azure OpenAI models at: ${modelsEndpoint}`);
          
          const response = await axios.get(modelsEndpoint, {
            headers: {
              'api-key': this.config.apiKey
            },
            timeout: 5000,
          });
          
          console.log(`Azure OpenAI models check successful: Status ${response.status}`);
          
          // Validate that the full URL follows the expected format for chat completions
          if (!this.config.baseUrl.includes('/chat/completions')) {
            console.warn(`⚠️ Azure OpenAI URL may be incomplete. The URL should include '/chat/completions' and an API version.`);
            console.warn(`Example format: https://your-endpoint.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2024-02-01`);
          }
          
          return response.status === 200;
        } catch (error) {
          console.error(`Azure OpenAI availability check failed with URL ${this.config.baseUrl}:`, error);
          return false;
        }
      }
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Cloud LLM availability check failed:', errorMessage);
      return false;
    }
  }

  private async chatWithOpenAI(messages: ChatMessage[]): Promise<string> {
    const openaiMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const systemPrompt = `You are an expert Microsoft Entra (Azure AD) and Microsoft Graph API assistant integrated into EntraPulse Lite. 

You have access to Microsoft Graph APIs through built-in MCP servers and can help users:
- Query user accounts, groups, applications, and service principals
- Understand Microsoft Entra concepts and best practices
- Analyze permissions and security configurations
- Provide natural language explanations of complex directory structures

When users ask questions, you can:
1. Query Microsoft Graph APIs directly using the available MCP tools
2. Explain Microsoft Entra concepts clearly
3. Provide actionable insights about identity and access management
4. Help with troubleshooting and security analysis

Always be helpful, accurate, and security-conscious in your responses.`;

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...openaiMessages
    ];    const openaiModel = this.config.model || DEFAULT_OPENAI_MODEL;
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: openaiModel,
      messages: fullMessages,
      // gpt-5/o-series models reject max_tokens and non-default temperature
      ...buildOpenAICompletionParams(openaiModel, this.config.maxTokens || 2048, this.config.temperature || 0.2),
    }, {
      headers: {
        ...buildOpenAIHeaders(this.config.apiKey!, this.config.organization),
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  }

  private async chatWithAnthropic(messages: ChatMessage[]): Promise<string> {
    const anthropicMessages = messages.filter(msg => msg.role !== 'system').map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const systemPrompt = `You are an expert Microsoft Entra (Azure AD) and Microsoft Graph API assistant integrated into EntraPulse Lite. 

You have access to Microsoft Graph APIs through built-in MCP servers and can help users:
- Query user accounts, groups, applications, and service principals
- Understand Microsoft Entra concepts and best practices
- Analyze permissions and security configurations
- Provide natural language explanations of complex directory structures

When users ask questions, you can:
1. Query Microsoft Graph APIs directly using the available MCP tools
2. Explain Microsoft Entra concepts clearly
3. Provide actionable insights about identity and access management
4. Help with troubleshooting and security analysis

Always be helpful, accurate, and security-conscious in your responses.`;    const anthropicModel = this.config.model || DEFAULT_ANTHROPIC_MODEL;
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: anthropicModel,
      // Claude Opus 4.7+ / Fable-class models reject the temperature parameter
      ...buildAnthropicCompletionParams(anthropicModel, this.config.maxTokens || 2048, this.config.temperature || 0.2),
      system: systemPrompt,
      messages: anthropicMessages
    }, {
      headers: {
        'x-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      }
    });

    return response.data.content[0].text;
  }
  private async chatWithGemini(messages: ChatMessage[]): Promise<string> {
    const geminiMessages = messages.filter(msg => msg.role !== 'system').map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    // Check if messages already contain an enhanced system prompt, if so use it
    const systemMessage = messages.find(msg => msg.role === 'system');
    const systemInstruction = systemMessage?.content || `You are an expert Microsoft Entra (Azure AD) and Microsoft Graph API assistant integrated into EntraPulse Lite. 

You have access to Microsoft Graph APIs through built-in MCP servers and can help users:
- Query user accounts, groups, applications, and service principals
- Understand Microsoft Entra concepts and best practices
- Analyze permissions and security configurations
- Provide natural language explanations of complex directory structures

When users ask questions, you can:
1. Query Microsoft Graph APIs directly using the available MCP tools
2. Explain Microsoft Entra concepts clearly
3. Provide actionable insights about identity and access management
4. Help with troubleshooting and security analysis

Always be helpful, accurate, and security-conscious in your responses.`;

    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${this.config.model || DEFAULT_GEMINI_MODEL}:generateContent`, {
      contents: geminiMessages,
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: this.config.temperature || 0.2,
        maxOutputTokens: this.config.maxTokens || 2048,
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        key: this.config.apiKey
      }
    });    return response.data.candidates[0].content.parts[0].text;
  }
  private async chatWithAzureOpenAI(messages: ChatMessage[]): Promise<string> {
    const openaiMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const systemPrompt = `You are an expert Microsoft Entra (Azure AD) and Microsoft Graph API assistant integrated into EntraPulse Lite. 

You have access to Microsoft Graph APIs through built-in MCP servers and can help users:
- Query user accounts, groups, applications, and service principals
- Understand Microsoft Entra concepts and best practices
- Analyze permissions and security configurations
- Provide natural language explanations of complex directory structures

When users ask questions, you can:
1. Query Microsoft Graph APIs directly using the available MCP tools
2. Explain Microsoft Entra concepts clearly
3. Provide actionable insights about identity and access management
4. Help with troubleshooting and security analysis

Always be helpful, accurate, and security-conscious in your responses.`;

    // Check if messages already contain an enhanced system prompt, if so use it
    const systemMessage = messages.find(msg => msg.role === 'system');
    const finalSystemPrompt = systemMessage?.content || systemPrompt;

    const fullMessages = [
      { role: 'system', content: finalSystemPrompt },
      ...openaiMessages.filter(msg => msg.role !== 'system')
    ];    if (!this.config.baseUrl) {
      console.error('Azure OpenAI requires full endpoint URL');
      throw new Error('Azure OpenAI requires a full endpoint URL. Please configure a valid endpoint in the settings.');
    }

    // Validate the URL format to ensure it's properly formatted for chat completions
    const urlLower = this.config.baseUrl.toLowerCase();
    
    const hasPath = urlLower.includes('/chat/completions');
    const hasApiVersion = urlLower.includes('api-version=');
    const hasDeployment = urlLower.includes('/deployments/');
    
    // Log what's missing for debugging
    const missingComponents = [];
    if (!hasPath) missingComponents.push('/chat/completions path');
    if (!hasApiVersion) missingComponents.push('api-version parameter');
    if (!hasDeployment) missingComponents.push('/deployments/ path');
    
    if (!hasPath || !hasApiVersion || !hasDeployment) {
      console.error(`Invalid Azure OpenAI URL format: ${this.config.baseUrl}`);
      console.error(`Missing components: ${missingComponents.join(', ')}`);
      throw new Error(`Azure OpenAI URL is incomplete. The complete URL should include: ${missingComponents.join(', ')}.\n\nPlease use the format: https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-01`);
    }

    // Use the full URL provided by the user - which already includes the deployment name and API version
    // The user now provides the complete URL in the format:
    // https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-01
    console.log(`Azure OpenAI sending request to: ${this.config.baseUrl}`);
    
    // Extract deployment name for logging
    const deploymentMatch = urlLower.match(/\/deployments\/([^\/]+)/);
    const deploymentName = deploymentMatch ? deploymentMatch[1] : 'unknown';
    console.log(`Using deployment: ${deploymentName}`);
    
    try {
      const response = await axios.post(this.config.baseUrl, {
        messages: fullMessages,
        // gpt-5/o-series deployments reject max_tokens and non-default temperature
        ...buildOpenAICompletionParams(deploymentName, this.config.maxTokens || 2048, this.config.temperature || 0.2),
      }, {
        headers: {
          'api-key': this.config.apiKey,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Azure OpenAI response received with status: ${response.status}`);
      
      return response.data.choices[0].message.content;
    } catch (error) {
      // Enhanced error logging for Azure OpenAI
      console.error(`Azure OpenAI chat request failed:`, error);
      
      if (axios.isAxiosError(error) && error.response) {
        console.error(`Status: ${error.response.status}, Error:`, error.response.data);
        
        if (error.response.status === 404) {
          throw new Error(`Azure OpenAI endpoint not found (404). Please verify the URL format: ${this.config.baseUrl}`);
        } else if (error.response.status === 401) {
          throw new Error('Azure OpenAI authentication failed (401). Please verify your API key.');
        } else if (error.response.status === 403) {
          throw new Error('Azure OpenAI access denied (403). Please check if your API key has access to this deployment.');
        }
      }
      
      // Re-throw the original error with enhanced message
      throw new Error(`Azure OpenAI request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      if (this.config.provider === 'openai') {
        const response = await axios.get('https://api.openai.com/v1/models', {
          headers: buildOpenAIHeaders(this.config.apiKey!, this.config.organization)
        });
        return filterOpenAIChatModels(
          (response.data.data || []).map((model: any) => model.id)
        );      } else if (this.config.provider === 'anthropic') {
        return await this.getAnthropicModels();
      } else if (this.config.provider === 'gemini') {
        return await this.getGeminiModels();
      } else if (this.config.provider === 'azure-openai') {
        return await this.getAzureOpenAIModels();
      }
      return [];
    } catch (error) {
      console.error('Failed to get available cloud models:', error);
      return this.getFallbackModels();
    }
  }

  /**
   * Fetch Anthropic models from the official Models API
   */
  private async getAnthropicModels(): Promise<string[]> {
    try {
      const models = await fetchAnthropicModels(this.config.apiKey!);
      if (models.length > 0) {
        console.log('Successfully retrieved Anthropic models via Models API:', models);
        return models;
      }
      throw new Error('Models API returned an empty list');
    } catch (error) {
      console.warn('Failed to fetch Anthropic models from Models API:', error);
      return this.getFallbackAnthropicModels();
    }
  }

  /**
   * Fetch Gemini models from Google's API
   */
  private async getGeminiModels(): Promise<string[]> {
    try {
      console.log('Fetching Gemini models from Google API...');
      const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
        params: {
          key: this.config.apiKey,
          pageSize: 50
        },
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.models) {
        const models = response.data.models
          .filter((model: any) => 
            model.name && 
            model.name.includes('gemini') &&
            model.supportedGenerationMethods?.includes('generateContent')
          )
          .map((model: any) => model.name.replace('models/', ''))
          .sort((a: string, b: string) => {
            // Prioritize newer models (higher version numbers)
            const versionA = a.match(/\d+\.?\d*/)?.[0] || '0';
            const versionB = b.match(/\d+\.?\d*/)?.[0] || '0';
            return parseFloat(versionB) - parseFloat(versionA);
          });

        console.log('Successfully retrieved Gemini models:', models);
        return models;
      }

      throw new Error('No models found in API response');
    } catch (error) {
      console.warn('Failed to fetch Gemini models from API:', error);      return this.getFallbackGeminiModels();
    }
  }

  /**
   * Fetch Azure OpenAI models from the deployment
   */  private async getAzureOpenAIModels(): Promise<string[]> {
    try {
      if (!this.config.baseUrl) {
        console.warn('Azure OpenAI requires full endpoint URL');
        return this.getFallbackAzureOpenAIModels();
      }

      console.log(`Fetching Azure OpenAI models using URL: ${this.config.baseUrl}`);
      
      // Extract the base URL from the full endpoint
      const urlObj = new URL(this.config.baseUrl);
      const baseEndpoint = `${urlObj.protocol}//${urlObj.hostname}`;
      
      console.log(`Using base endpoint for models API: ${baseEndpoint}`);
      
      // Validate that the full URL looks like a chat completions URL
      const urlLower = this.config.baseUrl.toLowerCase();
      const isValidChatEndpoint = urlLower.includes('/chat/completions') && urlLower.includes('api-version=');
      
      if (!isValidChatEndpoint) {
        console.warn(`⚠️ Azure OpenAI URL may not be correctly formatted for chat completions.`);
        console.warn(`The expected format is: https://your-endpoint.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2024-02-01`);
      }
      
      // Extract the deployment name if possible
      let deploymentName = '';
      const deploymentMatch = urlLower.match(/\/deployments\/([^\/]+)/);
      if (deploymentMatch && deploymentMatch[1]) {
        deploymentName = deploymentMatch[1];
        console.log(`Detected deployment name from URL: ${deploymentName}`);
      }
      
      const modelsEndpoint = `${baseEndpoint}/openai/models?api-version=2025-01-01-preview`;
      console.log(`Querying models API at: ${modelsEndpoint}`);
      
      const response = await axios.get(modelsEndpoint, {
        headers: {
          'api-key': this.config.apiKey
        },
        timeout: 10000
      });

      if (response.data?.data) {
        const models = filterOpenAIChatModels(
          response.data.data.map((model: any) => model.id).filter(Boolean)
        );

        console.log('Successfully retrieved Azure OpenAI models:', models);
        
        // If we extracted a deployment name, check if it matches any of the models
        if (deploymentName && !models.includes(deploymentName)) {
          console.warn(`⚠️ The deployment name '${deploymentName}' from your URL doesn't match any of the available models.`);
          console.warn(`This might be expected if your deployment has a custom name different from the model ID.`);
        }
        
        return models;
      }

      throw new Error('No models found in Azure OpenAI response');
    } catch (error) {
      console.warn('Failed to fetch Azure OpenAI models:', error);
      return this.getFallbackAzureOpenAIModels();
    }
  }

  /**
   * Fallback models when dynamic fetching fails
   */
  private getFallbackModels(): string[] {
    if (this.config.provider === 'openai') {
      return [...FALLBACK_OPENAI_MODELS];    } else if (this.config.provider === 'anthropic') {
      return this.getFallbackAnthropicModels();
    } else if (this.config.provider === 'gemini') {
      return this.getFallbackGeminiModels();
    } else if (this.config.provider === 'azure-openai') {
      return this.getFallbackAzureOpenAIModels();
    }
    return [];
  }

  /**
   * Fallback Anthropic models (used when the Models API is unreachable)
   */
  private getFallbackAnthropicModels(): string[] {
    return [...FALLBACK_ANTHROPIC_MODELS];
  }
  /**
   * Fallback Gemini models (used when the models API is unreachable)
   */
  private getFallbackGeminiModels(): string[] {
    return [...FALLBACK_GEMINI_MODELS];
  }
  /**
   * Fallback Azure OpenAI models (used when the deployment API is unreachable)
   */
  private getFallbackAzureOpenAIModels(): string[] {
    // Common Azure OpenAI chat deployments
    return [
      'gpt-5',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-35-turbo'
    ];
  }

  /**
   * Get the current configuration
   */
  getConfig(): CloudLLMConfig {
    return this.config;
  }
}
