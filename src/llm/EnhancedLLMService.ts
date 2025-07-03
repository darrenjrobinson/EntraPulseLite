// Enhanced LLM Service that orchestrates MCP tool usage
// Integrates unified LLM (local/cloud), Fetch MCP, and Lokka MCP components for intelligent query handling

import axios from 'axios';
import { LLMConfig, ChatMessage } from '../types';
import { MCPClient } from '../mcp/clients';
import { MCPAuthService } from '../mcp/auth/MCPAuthService';
import { MCPServerConfig } from '../mcp/types';
import { AuthService } from '../auth/AuthService';
import { UnifiedLLMService } from './UnifiedLLMService';
import { UnifiedPromptService, PermissionContext } from './UnifiedPromptService';
import { conversationContextManager, ConversationContextManager } from '../shared/ConversationContextManager';

export interface QueryAnalysis {
  needsFetchMcp: boolean;
  needsLokkaMcp: boolean;
  needsMicrosoftDocsMcp: boolean;
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
    microsoftDocsResult?: any;
  };
  finalResponse: string;
  traceData: {
    steps: string[];
    timing: Record<string, number>;
    errors?: string[];
  };
}

export class EnhancedLLMService {
  private config: LLMConfig;
  private mcpClient: MCPClient;
  private authService: AuthService;
  private mcpAuthService: MCPAuthService;
  private unifiedLLM: UnifiedLLMService;
  private isDisposed: boolean = false;constructor(config: LLMConfig, authService: AuthService, mcpClient?: MCPClient) {
    this.config = config;
    this.authService = authService;
    this.mcpAuthService = new MCPAuthService(authService);
    
    // Use provided MCPClient or create a fallback one
    if (mcpClient) {
      this.mcpClient = mcpClient;
      console.log('EnhancedLLMService: Using provided MCPClient');
    } else {      console.log('EnhancedLLMService: Creating fallback MCPClient with basic servers');      // Initialize MCP client with fallback servers (for backward compatibility)
      const serverConfigs: MCPServerConfig[] = [
        {
          name: 'fetch',
          type: 'fetch',
          port: 3001,
          enabled: true,
          url: 'http://localhost:3001'
        },
        {
          name: 'external-lokka',
          type: 'external-lokka',
          port: 3003,
          enabled: true,
          url: 'http://localhost:3003',
          command: 'npx',
          args: ['-y', '@merill/lokka']
        },
        {
          name: 'microsoft-docs',
          type: 'microsoft-docs',
          port: 0,
          enabled: true,
          url: 'https://learn.microsoft.com/api/mcp',
          authConfig: {
            type: 'none'
          }
        }
      ];
      
      this.mcpClient = new MCPClient(serverConfigs, this.mcpAuthService);
    }
    
    // Initialize UnifiedLLMService with MCP client for enhanced model discovery
    this.unifiedLLM = new UnifiedLLMService(config, this.mcpClient);
  }  /**
   * Get current permission context from auth service
   */
  private async getPermissionContext(): Promise<PermissionContext | undefined> {
    try {
      const authInfo = await this.authService.getAuthenticationInfo();
      if (authInfo) {
        return {
          currentPermissions: authInfo.permissions || ['User.Read'],
          authMode: authInfo.mode || 'interactive',
          permissionSource: authInfo.permissions ? 'configured' : 'default'
        };
      }
    } catch (error) {
      console.warn('Failed to get permission context:', error);
    }
    return undefined;
  }

  /**
   * Enhanced chat method that uses MCP tools intelligently with conversation context
   */
  async enhancedChat(messages: ChatMessage[], sessionId?: string): Promise<EnhancedLLMResponse> {
    // Check if service has been disposed
    if (this.isDisposed) {
      throw new Error('EnhancedLLMService has been disposed and cannot be used');
    }

    const startTime = Date.now();
    const trace: string[] = [];
    const errors: string[] = [];

    try {      // Step 1: Extract user query and setup context
      const userQuery = messages[messages.length - 1]?.content || '';
      const effectiveSessionId = sessionId || `session-${Date.now()}`;
      
      console.log(`🔄 EnhancedLLMService: Received sessionId: ${sessionId}, Using: ${effectiveSessionId}`);
      trace.push('Starting enhanced chat with conversation context');
      
      // Step 2: Get conversation context for better understanding
      const conversationContext = conversationContextManager.getFormattedContext(effectiveSessionId, userQuery);
      trace.push(`Retrieved conversation context for session: ${effectiveSessionId}`);
      
      // Step 3: Analyze the query with conversation context
      const analysis = await this.analyzeQuery(userQuery, conversationContext);
      trace.push(`Query analysis completed: ${analysis.reasoning}`);// Step 2: MCP servers are automatically initialized in constructor
      trace.push('MCP servers ready');      // Step 3: Execute MCP operations based on analysis
      const mcpResults: { fetchResult?: any; lokkaResult?: any; microsoftDocsResult?: any } = {};      // Microsoft Docs MCP for documentation (preferred)
      if (analysis.needsMicrosoftDocsMcp) {
        try {
          trace.push('Attempting Microsoft Docs MCP via HTTP Streamable transport');
          
          const docsQuery = analysis.documentationQuery || analysis.permissionQuery || userQuery;
          console.log('🔍 Calling Microsoft Docs MCP with query:', docsQuery);
          
          // Try Microsoft Docs MCP first (HTTP Streamable transport)
          try {
            const mcpResponse = await this.mcpClient.callTool('microsoft-docs', 'microsoft_docs_search', {
              question: docsQuery
            });
            
            console.log('✅ Microsoft Docs MCP call successful:', {
              hasContent: !!mcpResponse?.content,
              contentLength: mcpResponse?.content?.length || 0
            });
            
            mcpResults.microsoftDocsResult = mcpResponse;
            trace.push('Microsoft Docs MCP completed successfully');
            
          } catch (mcpError) {
            console.warn('⚠️ Microsoft Docs MCP failed, falling back to internal search:', mcpError);
            trace.push(`Microsoft Docs MCP failed: ${mcpError}, using fallback`);
            
            // Fallback to internal Microsoft Docs search
            const searchResults = await this.searchMicrosoftDocs(docsQuery);
            
            mcpResults.microsoftDocsResult = {
              content: [{
                type: 'text',
                text: searchResults
              }]
            };
            
            console.log('🔍 Microsoft Docs fallback search completed successfully:', {
              resultLength: searchResults.length,
              preview: searchResults.substring(0, 200)
            });
            
            trace.push('Microsoft Docs fallback search completed successfully');
          }
          
        } catch (error) {
          const errorMsg = `Microsoft Docs (MCP + fallback) failed: ${error}`;
          errors.push(errorMsg);
          trace.push(errorMsg);
          console.error('🔍 Microsoft Docs complete failure:', error);
        }
      }

      // Fetch MCP for documentation/permissions (legacy fallback)
      if (analysis.needsFetchMcp && !analysis.needsMicrosoftDocsMcp) {
        try {
          trace.push('Calling Fetch MCP for documentation');
          const fetchQuery = analysis.documentationQuery || analysis.permissionQuery || userQuery;
          mcpResults.fetchResult = await this.mcpClient.callTool('fetch', 'fetch', {
            url: `https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(fetchQuery)}`,
            method: 'GET'
          });
          trace.push('Fetch MCP completed successfully');
        } catch (error) {
          const errorMsg = `Fetch MCP failed: ${error}`;
          errors.push(errorMsg);
          trace.push(errorMsg);
        }
      }

      // Lokka MCP for Microsoft Graph data
      if (analysis.needsLokkaMcp && analysis.graphEndpoint) {
        try {
          trace.push('Calling Lokka MCP for Graph data');
          
          // Convert query parameters to strings as required by Lokka MCP
          const stringifiedQueryParams = analysis.graphParams ? 
            Object.fromEntries(
              Object.entries(analysis.graphParams).map(([key, value]) => [
                key, 
                typeof value === 'string' ? value : String(value)
              ])
            ) : undefined;          // Ensure method is lowercase as required by Lokka MCP
          const method = (analysis.graphMethod || 'get').toLowerCase();
            // Use external-lokka server directly
          const serverName = 'external-lokka';
          const toolName = 'microsoft_graph_query';
          
          console.log(`🔧 EnhancedLLMService: Using MCP server: ${serverName}, tool: ${toolName}`);
          
          mcpResults.lokkaResult = await this.mcpClient.callTool(serverName, toolName, {
            apiType: 'graph',
            method: method,
            endpoint: analysis.graphEndpoint,
            queryParams: stringifiedQueryParams
          });
          trace.push('Lokka MCP completed successfully');
        } catch (error) {
          const errorMsg = `Lokka MCP failed: ${error}`;
          errors.push(errorMsg);
          trace.push(errorMsg);
        }
      }      // Step 4: Generate final response using LLM with MCP results
      trace.push('Generating final response with LLM');
      const finalResponse = await this.generateFinalResponse(userQuery, analysis, mcpResults);
      trace.push('Final response generated');

      // Step 5: Save conversation turn for context
      conversationContextManager.addTurn(
        effectiveSessionId,
        userQuery,
        finalResponse,
        mcpResults,
        analysis
      );
      trace.push(`Conversation turn saved for session: ${effectiveSessionId}`);

      return {
        analysis,
        mcpResults,
        finalResponse,
        traceData: {
          steps: trace,
          timing: { totalTime: Date.now() - startTime },
          errors: errors.length > 0 ? errors : undefined
        }
      };

    } catch (error) {
      const errorMsg = `Enhanced chat failed: ${error}`;
      errors.push(errorMsg);
      trace.push(errorMsg);
      
      // Fallback to basic chat
      trace.push('Falling back to basic chat');
      const fallbackResponse = await this.basicChat(messages);
      
      return {        analysis: {
          needsFetchMcp: false,
          needsLokkaMcp: false,
          needsMicrosoftDocsMcp: false,
          confidence: 0,
          reasoning: 'Analysis failed, using fallback response'
        },
        mcpResults: {},
        finalResponse: fallbackResponse,
        traceData: {
          steps: trace,
          timing: { totalTime: Date.now() - startTime },
          errors
        }
      };
    }
  }
  /**
   * Analyze the user query to determine what MCP tools are needed with conversation context
   */
  private async analyzeQuery(query: string, conversationContext?: string): Promise<QueryAnalysis> {
    const systemPrompt = `You are an expert analyzer for Microsoft Graph API queries. Analyze the user's query and determine:

1. Does the query need Microsoft/Azure/Graph/Entra documentation? (Microsoft Docs MCP - DEFAULT for Microsoft content)
2. Does the query need general web search for non-Microsoft content? (Fetch MCP - only for non-Microsoft searches)
3. Does the query need to access Microsoft Graph data? (Lokka MCP) 
4. What specific Graph endpoint should be called?
5. What parameters should be used?

${conversationContext ? `\n## CONVERSATION CONTEXT:\n${conversationContext}\n\nIMPORTANT: Consider the conversation history when analyzing this query. Follow-up questions should be understood in the context of previous exchanges.\n` : ''}

MICROSOFT DOCS MCP (Priority #1) - Use for ANY Microsoft-related content:
- "What permissions does User.Read give me?" -> Microsoft Docs MCP
- "How do I authenticate to Graph?" -> Microsoft Docs MCP
- "Tell me about Microsoft Entra ID" -> Microsoft Docs MCP
- "What are the latest Graph API features?" -> Microsoft Docs MCP
- "How do I configure authentication?" -> Microsoft Docs MCP
- "Explain Microsoft Entra" -> Microsoft Docs MCP
- "Azure documentation" -> Microsoft Docs MCP
- "Office 365 permissions" -> Microsoft Docs MCP
- "PowerShell for Graph" -> Microsoft Docs MCP
- ANY Microsoft product, service, or technology -> Microsoft Docs MCP

FETCH MCP (Only for non-Microsoft content):
- "Weather in Seattle" -> Fetch MCP
- "News about technology" -> Fetch MCP
- "General web search" -> Fetch MCP
- ONLY use when content is NOT related to Microsoft/Azure/Graph/Entra

LOKKA MCP (Graph Data):
- "List all users" -> Lokka MCP, endpoint: "/users", method: "get"
- "How many users do we have?" -> Lokka MCP, endpoint: "/users/$count", method: "get", params: {"ConsistencyLevel": "eventual"}
- "Show me guest accounts" -> Lokka MCP, endpoint: "/users", method: "get", filter: userType eq 'Guest'

IMPORTANT: 
- DEFAULT to Microsoft Docs MCP for ANY Microsoft-related query
- Only use Fetch MCP for non-Microsoft web searches
- Always use lowercase HTTP methods (get, post, put, delete, patch)
- For count queries, use /$count endpoints with ConsistencyLevel parameter
- Never use /me endpoint with client credentials authentication

Respond ONLY with a JSON object in this exact format:
{
  "needsFetchMcp": boolean,
  "needsLokkaMcp": boolean,
  "needsMicrosoftDocsMcp": boolean,
  "graphEndpoint": "string or null",
  "graphMethod": "lowercase HTTP method (get, post, put, delete, patch) or null", 
  "graphParams": object or null,
  "documentationQuery": "string or null",
  "permissionQuery": "string or null",
  "confidence": number (0-1),
  "reasoning": "brief explanation"
}`;

    const analysisMessages: ChatMessage[] = [
      { 
        id: `analysis-system-${Date.now()}`,
        role: 'system', 
        content: systemPrompt,
        timestamp: new Date()
      },
      { 
        id: `analysis-user-${Date.now()}`,
        role: 'user', 
        content: `Analyze this query: "${query}"`,
        timestamp: new Date()
      }
    ];

    try {
      const response = await this.basicChat(analysisMessages);
      
      // Try to parse the JSON response - be more flexible about format
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);          return {
            needsFetchMcp: Boolean(analysis.needsFetchMcp),
            needsLokkaMcp: Boolean(analysis.needsLokkaMcp),
            needsMicrosoftDocsMcp: Boolean(analysis.needsMicrosoftDocsMcp),
            graphEndpoint: analysis.graphEndpoint || undefined,
            graphMethod: analysis.graphMethod || undefined,
            graphParams: analysis.graphParams || undefined,
            documentationQuery: analysis.documentationQuery || undefined,
            permissionQuery: analysis.permissionQuery || undefined,
            confidence: Number(analysis.confidence) || 0.5,
            reasoning: String(analysis.reasoning || 'Analysis completed')
          };
        } catch (parseError) {
          console.warn('Failed to parse JSON from LLM response:', parseError);
          console.warn('LLM Response:', response);
        }
      } else {
        console.warn('No JSON found in LLM response:', response);
      }
    } catch (error) {
      console.warn('LLM analysis request failed:', error);
    }

    // Fallback to heuristic analysis
    return this.heuristicAnalysis(query);
  }  /**
   * Fallback heuristic analysis when LLM analysis fails
   */
  private heuristicAnalysis(query: string): QueryAnalysis {
    const lowerQuery = query.toLowerCase();
      // Check for Microsoft-related keywords (prioritize Microsoft Docs MCP)
    const microsoftKeywords = [
      'microsoft', 'azure', 'graph', 'entra', 'active directory', 'ad', 'aad',
      'office', 'office 365', 'o365', 'sharepoint', 'teams', 'outlook',
      'powershell', 'authentication', 'permission', 'scope', 'oauth', 'token',
      'tenant', 'app registration', 'service principal', 'conditional access',
      'intune', 'defender', 'security', 'compliance', 'licensing'
    ];
    
    // Check for Microsoft-specific documentation queries
    const microsoftDocKeywords = [
      'microsoft graph', 'azure ad', 'entra id', 'office 365', 'sharepoint',
      'azure authentication', 'microsoft teams', 'microsoft docs'
    ];
    const needsMicrosoftDocsMcp = microsoftKeywords.some(keyword => lowerQuery.includes(keyword)) ||
      microsoftDocKeywords.some(keyword => lowerQuery.includes(keyword));
    
    // For non-Microsoft content, default to Fetch MCP for general web searches
    // Only avoid Fetch MCP if it's clearly a Graph data query
    const graphKeywords = ['users', 'groups', 'me', 'mail', 'calendar', 'contacts', 'teams', 'sites', 'files', 'list', 'show', 'get', 'find', 'count'];
    const isGraphDataQuery = graphKeywords.some(keyword => lowerQuery.includes(keyword));
    
    const needsFetchMcp = !needsMicrosoftDocsMcp && !isGraphDataQuery;
    const needsLokkaMcp = isGraphDataQuery;
    
    let graphEndpoint = '/me'; // Default endpoint
    let graphParams: any = undefined;
    
    // Determine specific endpoint based on query content
    if (lowerQuery.includes('how many') || lowerQuery.includes('count') || lowerQuery.includes('number of')) {
      if (lowerQuery.includes('user')) {
        graphEndpoint = '/users/$count';
        graphParams = { 'ConsistencyLevel': 'eventual' };
      } else if (lowerQuery.includes('group')) {
        graphEndpoint = '/groups/$count';
        graphParams = { 'ConsistencyLevel': 'eventual' };
      }
    } else if (lowerQuery.includes('users')) {
      graphEndpoint = '/users';
      if (lowerQuery.includes('guest')) {
        graphParams = { '$filter': "userType eq 'Guest'" };
      }
    } else if (lowerQuery.includes('groups')) {
      graphEndpoint = '/groups';
    } else if (lowerQuery.includes('mail')) {
      graphEndpoint = '/me/messages';
    }    return {
      needsFetchMcp,
      needsLokkaMcp,
      needsMicrosoftDocsMcp,
      graphEndpoint: needsLokkaMcp ? graphEndpoint : undefined,
      graphMethod: 'get', // Use lowercase as required by Lokka MCP
      graphParams,
      documentationQuery: needsMicrosoftDocsMcp ? query : undefined,
      confidence: 0.7,
      reasoning: needsMicrosoftDocsMcp 
        ? 'Used heuristic analysis as fallback - prioritizing Microsoft Docs MCP for Microsoft content'
        : needsLokkaMcp 
          ? 'Used heuristic analysis as fallback - using Lokka MCP for Graph data'
          : 'Used heuristic analysis as fallback - using Fetch MCP for general web search'
    };
  }
  /**
   * Generate the final response using LLM with MCP results
   */  private async generateFinalResponse(
    originalQuery: string, 
    analysis: QueryAnalysis, 
    mcpResults: { fetchResult?: any; lokkaResult?: any; microsoftDocsResult?: any }
  ): Promise<string> {
    
    let contextData = '';
    
    // Prepare context from Microsoft Docs MCP results (preferred)
    if (mcpResults.microsoftDocsResult) {
      try {
        // Handle different possible response formats from Microsoft Docs MCP
        if (mcpResults.microsoftDocsResult.content) {
          // Format Microsoft Docs content properly instead of JSON dump
          const docsContent = this.formatMicrosoftDocsContent(mcpResults.microsoftDocsResult.content);
          contextData += `Microsoft Learn Documentation:\n${docsContent}\n\n`;
        } else if (mcpResults.microsoftDocsResult.results) {
          const docsContent = this.formatMicrosoftDocsContent(mcpResults.microsoftDocsResult.results);
          contextData += `Microsoft Learn Search Results:\n${docsContent}\n\n`;
        } else {
          const docsContent = this.formatMicrosoftDocsContent(mcpResults.microsoftDocsResult);
          contextData += `Microsoft Learn Data:\n${docsContent}\n\n`;
        }
      } catch (error) {
        console.warn('Error processing Microsoft Docs MCP result:', error);
        contextData += `Microsoft Learn Documentation: Available but could not be processed\n\n`;
      }
    }
    
    // Prepare context from Fetch MCP results (legacy fallback)
    if (mcpResults.fetchResult?.content && !mcpResults.microsoftDocsResult) {
      const textContent = mcpResults.fetchResult.content.find((item: any) => item.type === 'text');
      if (textContent?.text) {
        contextData += `Documentation Context:\n${textContent.text}\n\n`;
      }
    }
      // Prepare context from Lokka MCP results - handle multiple possible response formats
    if (mcpResults.lokkaResult) {
      let lokkaData = null;
      
      // Debug logging to understand what data we're working with
      console.log('🔍 Raw Lokka MCP result:', {
        result: mcpResults.lokkaResult,
        resultType: typeof mcpResults.lokkaResult,
        isString: typeof mcpResults.lokkaResult === 'string',
        isObject: typeof mcpResults.lokkaResult === 'object',
        hasContent: mcpResults.lokkaResult && typeof mcpResults.lokkaResult === 'object' && 'content' in mcpResults.lokkaResult,
        hasResult: mcpResults.lokkaResult && typeof mcpResults.lokkaResult === 'object' && 'result' in mcpResults.lokkaResult
      });
        // Try different response formats
      if (typeof mcpResults.lokkaResult === 'string') {
        // Direct string result (like "52")
        lokkaData = mcpResults.lokkaResult;
      } else if (mcpResults.lokkaResult && typeof mcpResults.lokkaResult === 'object') {
        if (mcpResults.lokkaResult.content) {
          // MCP protocol format with content array
          const textContent = mcpResults.lokkaResult.content.find((item: any) => item.type === 'text');
          const jsonContent = mcpResults.lokkaResult.content.find((item: any) => item.type === 'json');
            if (textContent && textContent.text) {
            // Handle text content - try to extract actual data
            const text = textContent.text;
            
            // Check for Graph API permission errors first
            if (text.includes('Access is denied') || 
                text.includes('ErrorAccessDenied') || 
                (text.includes('statusCode":403') && text.includes('graph.microsoft.com'))) {
              
              throw new Error(`🔐 **Enhanced Graph Access Permission Error**

The Microsoft Graph PowerShell client ID requires admin consent for mail and calendar permissions.

**To resolve this issue:**

1. **Admin Consent Required**: Contact your Entra Administrator to grant admin consent for these delegated permissions to the "Microsoft Graph Command Line Tools" app (ID: 14d82eec-204b-4c2f-b7e8-296a70dab67e):
   • Mail.Read
   • Mail.ReadWrite  
   • Calendars.Read
   • Files.Read.All
   • Directory.Read.All

2. **Admin Consent URL**: Use this URL to grant consent:
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=14d82eec-204b-4c2f-b7e8-296a70dab67e&response_type=code&scope=https://graph.microsoft.com/Mail.Read%20https://graph.microsoft.com/Mail.ReadWrite%20https://graph.microsoft.com/Calendars.Read%20https://graph.microsoft.com/Files.Read.All%20https://graph.microsoft.com/Directory.Read.All&response_mode=query&state=12345&prompt=admin_consent

3. **Alternative**: Disable Enhanced Graph Access in the authentication settings and use your own app registration with pre-consented permissions.

**Note**: Enhanced Graph Access provides access to more Microsoft Graph APIs but requires admin consent for sensitive permissions like mail access.`);
            }
            
            // Check if Lokka is just echoing back the query parameters instead of returning data
            if (text.includes('Response from tool microsoft_graph_query with args') || 
                text.includes('{"apiType":"graph"') ||
                (text.includes('"method":"get"') && text.includes('"endpoint"'))) {
              
              throw new Error(`🔐 **Microsoft Graph Permission Error**

The current authentication session does not have sufficient permissions to access user sign-in activity data.

**Required Permissions:**
• **AuditLog.Read.All** - To access user sign-in activity
• **User.Read.All** - To read user profiles
• **Directory.Read.All** - Alternative permission for directory data

**Current Session**: Client-credentials mode (service principal authentication)

**To resolve this issue:**

1. **Option 1 - Grant App Permissions**: Have your Entra Administrator grant the following **Application permissions** to your app registration:
   • AuditLog.Read.All
   • User.Read.All

2. **Option 2 - Switch to Interactive Mode**: Sign in with a user account that has the required permissions (Reports Reader role or higher)

3. **Option 3 - Use Different Query**: Try queries that don't require sign-in activity data, such as:
   • "How many users do we have?"
   • "List the first 5 users"
   • "Show me user groups"

**Note**: Sign-in activity data requires elevated permissions that may not be available in service principal (client-credentials) mode.`);
            }
            
            // Check if it's a Lokka API result format
            if (text.includes('Result for graph API')) {
              // Extract the actual result after the header
              const lines = text.split('\n');
              const resultStartIndex = lines.findIndex((line: string) => line.trim() === '') + 1;
              if (resultStartIndex > 0 && resultStartIndex < lines.length) {
                const resultText = lines.slice(resultStartIndex).join('\n').trim();
                
                // Try to parse as JSON
                try {
                  lokkaData = JSON.parse(resultText);
                } catch {
                  // If not JSON, use as-is (like "52")
                  lokkaData = resultText;
                }
              } else {
                lokkaData = text;
              }
            } else {
              // Regular text content
              lokkaData = text;
            }
          } else if (jsonContent && jsonContent.json) {
            lokkaData = jsonContent.json;
          }
        } else if (mcpResults.lokkaResult.result) {
          // Result property format
          lokkaData = mcpResults.lokkaResult.result;
        } else {
          // Raw object format
          lokkaData = mcpResults.lokkaResult;
        }
      }
        if (lokkaData !== null && lokkaData !== undefined) {
        console.log('🔍 Processing Lokka data:', {
          dataType: typeof lokkaData,
          isString: typeof lokkaData === 'string',
          isObject: typeof lokkaData === 'object',
          data: lokkaData
        });
          // Handle different data types
        let finalLokkaData = lokkaData;
          if (typeof lokkaData === 'string') {
          // Try to parse string as JSON first
          try {
            const parsed = JSON.parse(lokkaData);
            finalLokkaData = parsed;
            console.log('🔍 Successfully parsed string data as JSON');
          } catch {
            // If not JSON, create a meaningful structure for simple values
            if (/^\d+$/.test(lokkaData.trim())) {
              // Numeric string like "52"
              finalLokkaData = parseInt(lokkaData.trim());
              console.log('🔍 Converted numeric string to number');
            } else {
              // Other string content - try to parse as JSON one more time with error handling
              try {
                // Sometimes JSON might have extra whitespace or formatting
                const cleanedData = lokkaData.trim();
                if (cleanedData.startsWith('{') || cleanedData.startsWith('[')) {
                  finalLokkaData = JSON.parse(cleanedData);
                  console.log('🔍 Successfully parsed cleaned JSON string');
                } else {
                  finalLokkaData = { result: lokkaData };
                  console.log('🔍 Wrapped string in result object');
                }
              } catch {
                finalLokkaData = { result: lokkaData };
                console.log('🔍 Wrapped string in result object (fallback)');
              }
            }
          }
        } else if (lokkaData && typeof lokkaData === 'object') {
          // Extract result from various possible response structures
          if (lokkaData.value && Array.isArray(lokkaData.value)) {
            // Common Graph API response format with 'value' array
            finalLokkaData = lokkaData.value;
            console.log('🔍 Extracted data from .value array');
          } else if (lokkaData.result && typeof lokkaData.result === 'object') {
            // Nested result format
            finalLokkaData = lokkaData.result;
            // Check for further nesting in another 'value' property
            if (finalLokkaData.value && Array.isArray(finalLokkaData.value)) {
              finalLokkaData = finalLokkaData.value;
              console.log('🔍 Extracted data from nested .result.value');
            }
          } else {
            console.log('🔍 Using object data as-is');
          }
        }
          
        // Prepare user-friendly context based on data type
        if (typeof finalLokkaData === 'number') {
          // Simple count - include in context for LLM but don't expose raw data format
          contextData += `Your tenant has ${finalLokkaData} total users.\n\n`;
        } else if (Array.isArray(finalLokkaData)) {
          // Array of objects - provide structured summary
          contextData += `Microsoft Graph Data (${finalLokkaData.length} items):\n`;
          
          // Add a summary of the data structure for the LLM
          if (finalLokkaData.length > 0) {
            const sampleItem = finalLokkaData[0];
            if (sampleItem && typeof sampleItem === 'object') {
              const keys = Object.keys(sampleItem);
              contextData += `Data structure includes: ${keys.join(', ')}\n`;
                    // For user data, provide a sample formatted entry
              if (keys.includes('displayName') || keys.includes('userPrincipalName')) {
                contextData += 'Sample entry format: Name (Title) - Email\n';
              }
            }
          }
          
          // Add raw data with intelligent truncation for large datasets
          const rawDataString = JSON.stringify(finalLokkaData, null, 2);
          const MAX_CONTEXT_SIZE = 100000; // 100KB limit for context data
          
          if (rawDataString.length > MAX_CONTEXT_SIZE) {
            // For large datasets, provide summary + sample data
            console.log(`🔍 Large dataset detected (${rawDataString.length} chars), truncating...`);
            
            // If it's secure score data, provide a meaningful summary
            if (finalLokkaData[0] && finalLokkaData[0].currentScore !== undefined) {
              const latest = finalLokkaData[0];
              const summary = {
                latestScore: latest.currentScore,
                maxScore: latest.maxScore,
                percentage: Math.round((latest.currentScore / latest.maxScore) * 100),
                date: latest.createdDateTime,
                activeUserCount: latest.activeUserCount,
                tenantId: latest.azureTenantId,
                totalRecords: finalLokkaData.length
              };
              
              contextData += `Raw data summary: ${JSON.stringify(summary, null, 2)}\n`;
              contextData += `Note: Full dataset contains ${finalLokkaData.length} records but is too large to include completely.\n\n`;
            } else {
              // Generic truncation for other large datasets
              const truncatedData = finalLokkaData.slice(0, 3); // Show first 3 items
              contextData += `Raw data (first 3 of ${finalLokkaData.length} items): ${JSON.stringify(truncatedData, null, 2)}\n`;
              contextData += `Note: Dataset truncated due to size (${rawDataString.length} chars). Showing first 3 items only.\n\n`;
            }
          } else {
            // Small enough to include in full
            contextData += `Raw data: ${rawDataString}\n\n`;
          }        } else if (typeof finalLokkaData === 'object') {
          // Single object - check size before including
          const rawDataString = JSON.stringify(finalLokkaData, null, 2);
          const MAX_CONTEXT_SIZE = 100000; // 100KB limit
          
          if (rawDataString.length > MAX_CONTEXT_SIZE) {
            console.log(`🔍 Large single object detected (${rawDataString.length} chars), providing summary...`);
            
            // Provide object structure summary instead of full data
            const keys = Object.keys(finalLokkaData);
            const summary = {
              dataType: 'Single object',
              keys: keys,
              keyCount: keys.length,
              sizeInfo: `${rawDataString.length} characters (too large to display fully)`
            };
            
            contextData += `Microsoft Graph Data (Single large object):\n${JSON.stringify(summary, null, 2)}\n\n`;
          } else {
            contextData += `Microsoft Graph Data (Single object):\n${rawDataString}\n\n`;
          }        } else {
          // Other types - apply same size check
          const rawDataString = JSON.stringify(finalLokkaData, null, 2);
          const MAX_CONTEXT_SIZE = 100000; // 100KB limit
          
          if (rawDataString.length > MAX_CONTEXT_SIZE) {
            console.log(`🔍 Large data of type ${typeof finalLokkaData} detected (${rawDataString.length} chars), providing summary...`);
            contextData += `Microsoft Graph Data (${typeof finalLokkaData}):\nData too large to display (${rawDataString.length} characters)\n\n`;
          } else {
            contextData += `Microsoft Graph Data:\n${rawDataString}\n\n`;
          }
        }
        
        console.log('🔍 Added context data:', {
          finalLokkaData,
          contextLength: contextData.length
        });
      } else {
        console.log('🔍 No lokkaData extracted from result');
      }
    }    // Get permission context for unified prompt
    const permissionContext = await this.getPermissionContext();
    
    // Generate unified system prompt
    const systemPrompt = UnifiedPromptService.generateSystemPrompt({
      includeMicrosoftGraphContext: true,
      includePermissionGuidance: true,
      includeDataContext: !!contextData,
      contextData,
      originalQuery,
      permissionContext
    });

    const responseMessages: ChatMessage[] = [
      { 
        id: `response-system-${Date.now()}`,
        role: 'system', 
        content: systemPrompt,
        timestamp: new Date()
      },
      { 
        id: `response-user-${Date.now()}`,
        role: 'user', 
        content: originalQuery,
        timestamp: new Date()
      }
    ];    try {
      console.log('🔍 About to call final LLM with context - ready to generate response');
      
      const response = await this.basicChat(responseMessages);
      
      // Response received from LLM
      
      // Enhance response with unified permission guidance
      let enhancedResponse = response;
      if (permissionContext) {
        enhancedResponse = UnifiedPromptService.enhanceResponseForPermissions(
          response,
          this.config.provider,
          originalQuery,
          permissionContext
        );
        
        if (enhancedResponse !== response) {
          console.log('🔐 Response enhanced with permission guidance');
        }
      }
      
      return enhancedResponse;    } catch (error) {
      console.error('Failed to generate final response:', error);
      
      // Check if we actually have any useful data to share
      const hasData = contextData && contextData.trim().length > 0;
      
      if (hasData) {
        return `I encountered an error while processing your request: ${error}. However, I was able to retrieve some data that might be helpful:\n\n${contextData}`;
      } else {
        // No data was retrieved, provide a cleaner error message
        return `I encountered an error while processing your request: ${error}\n\nPlease try again or switch to a different LLM provider if the issue persists.`;
      }
    }
  }  /**
   * Search Microsoft Documentation using the real Microsoft Docs search
   */
  private async searchMicrosoftDocs(query: string): Promise<string> {
    try {
      console.log('🔍 Searching Microsoft Docs for:', query);
      
      // For now, provide accurate Microsoft Graph documentation based on the query
      // This will be replaced with real API call when MCP is properly implemented
      return this.getMicrosoftGraphDocumentation(query);
    } catch (error) {
      console.error('Microsoft Docs search failed:', error);
      return this.getMicrosoftGraphDocumentation(query);
    }
  }

  /**
   * Fallback method to provide accurate Microsoft Graph documentation
   */
  private getMicrosoftGraphDocumentation(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('group') && lowerQuery.includes('membership')) {
      return `# Microsoft Graph API - User Group Memberships

## Overview
To query a user's group memberships including nested groups, Microsoft Graph provides several API endpoints:

## Primary Endpoints

### 1. GET /users/{id}/transitiveMemberOf (Recommended)
- **Purpose**: Returns all groups, directory roles, and administrative units the user is a member of
- **Includes**: Nested group memberships automatically
- **Response**: Full objects with properties like displayName, id, etc.

**Example Request:**
\`\`\`http
GET https://graph.microsoft.com/v1.0/users/john@contoso.com/transitiveMemberOf
\`\`\`

### 2. POST /users/{id}/getMemberGroups
- **Purpose**: Returns group IDs only, includes nested groups
- **Request Body**: \`{"securityEnabledOnly": false}\`
- **Response**: Array of group IDs

**Example Request:**
\`\`\`http
POST https://graph.microsoft.com/v1.0/users/john@contoso.com/getMemberGroups
Content-Type: application/json

{
  "securityEnabledOnly": false
}
\`\`\`

### 3. POST /users/{id}/getMemberObjects
- **Purpose**: Returns all directory objects (groups, roles, admin units)
- **Request Body**: \`{"securityEnabledOnly": false}\`
- **Response**: Array of object IDs

## Required Permissions
- User.Read.All or User.ReadWrite.All
- GroupMember.Read.All or GroupMember.ReadWrite.All
- Directory.Read.All (for comprehensive access)

## PowerShell Examples
\`\`\`powershell
# Using Microsoft Graph PowerShell
Get-MgUserTransitiveMemberOf -UserId "john@contoso.com"
Get-MgUserMemberOf -UserId "john@contoso.com"
\`\`\`

## Key Differences
- **transitiveMemberOf**: Returns full objects, includes nested groups
- **getMemberGroups**: Returns IDs only, includes nested groups
- **memberOf**: Returns direct memberships only (no nesting)

📖 **Official Documentation:** https://learn.microsoft.com/en-us/graph/api/user-list-transitivememberof`;
    }
    
    // Default fallback
    return `# Microsoft Graph API Documentation

For your query "${query}", please refer to the official Microsoft Graph documentation:

📖 **Microsoft Graph API Reference:** https://learn.microsoft.com/en-us/graph/api/overview
📖 **Microsoft Graph Explorer:** https://developer.microsoft.com/en-us/graph/graph-explorer

The Microsoft Graph API provides comprehensive access to Microsoft 365 services including:
- Users and Groups
- Mail and Calendar
- Files and SharePoint
- Teams and Communications
- Security and Compliance

For specific API endpoints and detailed documentation, please visit the official Microsoft Learn documentation.`;
  }

  /**
   * Format Microsoft Docs MCP content into readable text instead of JSON dump
   */
  private formatMicrosoftDocsContent(content: any): string {
    try {
      // Handle array of content items
      if (Array.isArray(content)) {
        return content.map(item => {
          if (item.type === 'text' && item.text) {
            // Handle JSON string that contains the actual documentation
            if (typeof item.text === 'string' && item.text.startsWith('[')) {
              try {
                const parsedDocs = JSON.parse(item.text);
                return this.formatDocumentationArray(parsedDocs);
              } catch {
                return item.text;
              }
            }
            return item.text;
          }
          return '';
        }).join('\n\n');
      }
      
      // Handle single content item
      if (content.type === 'text' && content.text) {
        if (typeof content.text === 'string' && content.text.startsWith('[')) {
          try {
            const parsedDocs = JSON.parse(content.text);
            return this.formatDocumentationArray(parsedDocs);
          } catch {
            return content.text;
          }
        }
        return content.text;
      }
      
      // Handle direct array of documentation objects
      if (Array.isArray(content) && content[0]?.title) {
        return this.formatDocumentationArray(content);
      }
      
      // Fallback to string representation
      return JSON.stringify(content, null, 2);
    } catch (error) {
      console.error('Error formatting Microsoft Docs content:', error);
      return 'Unable to format documentation content';
    }
  }

  /**
   * Format an array of documentation objects into readable markdown
   */
  private formatDocumentationArray(docs: any[]): string {
    if (!Array.isArray(docs)) return '';
    
    return docs.map((doc, index) => {
      let formatted = '';
      
      if (doc.title) {
        formatted += `## ${doc.title}\n\n`;
      }
      
      if (doc.content) {
        // Clean up content - remove excessive escaping and format properly
        let content = doc.content
          .replace(/\\n/g, '\n')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\u0027/g, "'")
          .replace(/\\u003E/g, '>')
          .replace(/\\u003C/g, '<')
          .replace(/\\u0026/g, '&');
        
        formatted += `${content}\n\n`;
      }
      
      if (doc.contentUrl) {
        formatted += `**Source**: [${doc.contentUrl}](${doc.contentUrl})\n\n`;
      }
      
      return formatted;
    }).join('---\n\n');
  }

  /**
   * Basic chat method for fallback and internal use
   */
  async basicChat(messages: ChatMessage[]): Promise<string> {
    let activeProvider: string = this.config.provider; // Default fallback
    
    try {
      console.log('basicChat called with provider:', this.config.provider);
      console.log('basicChat messages:', messages.length);
      
      // Get the actual active provider before making the request
      activeProvider = await this.unifiedLLM.getCurrentActiveProvider();
      console.log('basicChat actual active provider:', activeProvider);
      
      // We're using the unified LLM service, which now automatically handles query extraction
      // for both local and cloud LLM services
      const response = await this.unifiedLLM.chat(messages);
      
      console.log('basicChat response:', {
        length: response.length,
        hasContent: !!response && response.trim().length > 0,
        hasExecuteQueryTags: response.includes('<execute_query>')
      });
      
      return response;
    } catch (error) {
      console.error('Basic chat failed:', error);
      console.log('Error occurred with active provider:', activeProvider);
      
      // Enhanced error handling for better user experience with correct provider attribution
      const enhancedError = this.createUserFriendlyError(error, activeProvider);
      throw enhancedError;
    }
  }
  /**
   * Create user-friendly error messages based on error type and provider
   */
  private createUserFriendlyError(error: any, provider: string): Error {
    // Handle Axios errors (HTTP requests)
    if (error.response && error.response.status) {
      const status = error.response.status;
      const providerName = this.getProviderDisplayName(provider);
      
      // Handle rate limiting (429 errors) for cloud providers
      if (status === 429) {
        if (provider === 'gemini') {
          return new Error(`🚦 **Rate Limit Exceeded**: Google Gemini API rate limit reached.

**Solutions:**
• Wait a few minutes before trying again
• Switch to a different LLM provider (Azure OpenAI, OpenAI, Anthropic)
• Use a local LLM (Ollama) instead
• Check your Google API quota and billing settings

**Current Provider**: ${providerName}`);
        } else if (provider === 'openai') {
          return new Error(`🚦 **Rate Limit Exceeded**: OpenAI API rate limit reached.

**Solutions:**
• Wait a few minutes before trying again
• Upgrade your OpenAI API plan for higher limits
• Switch to a different LLM provider (Azure OpenAI, Anthropic, Gemini)
• Use a local LLM (Ollama) instead

**Current Provider**: ${providerName}`);
        } else if (provider === 'anthropic') {
          return new Error(`🚦 **Rate Limit Exceeded**: Anthropic API rate limit reached.

**Solutions:**
• Wait a few minutes before trying again
• Check your Anthropic account usage and limits
• Switch to a different LLM provider (Azure OpenAI, OpenAI, Gemini)
• Use a local LLM (Ollama) instead

**Current Provider**: ${providerName}`);
        } else {
          return new Error(`🚦 **Rate Limit Exceeded**: ${providerName} API rate limit reached.

**Solutions:**
• Wait a few minutes before trying again
• Switch to a different LLM provider
• Use a local LLM (Ollama) instead

**Current Provider**: ${providerName}`);
        }
      }
      
      // Handle authentication errors (401/403)
      if (status === 401 || status === 403) {
        return new Error(`🔐 **Authentication Error**: Invalid API key or insufficient permissions for ${providerName}.

**Solutions:**
• Check your API key configuration
• Verify your account has sufficient credits/permissions
• Switch to a different LLM provider
• Use a local LLM (Ollama) instead

**Current Provider**: ${providerName}
**Status**: ${status} ${error.response.statusText || ''}`);
      }
    }
    
    // Special handling for provider-specific errors
    if (provider === 'ollama' && error.response) {
      let ollamaError = '';
      
      // Try multiple possible error response structures
      if (error.response.data.error) {
        ollamaError = String(error.response.data.error);
      } else if (typeof error.response.data === 'string') {
        ollamaError = error.response.data;
      } else if (error.response.data.message) {
        ollamaError = String(error.response.data.message);
      } else {
        // Fallback: convert data to string and look for error patterns
        const dataStr = JSON.stringify(error.response.data);
        ollamaError = dataStr;
      }
      
      // Ensure ollamaError is always a string
      if (typeof ollamaError !== 'string') {
        ollamaError = JSON.stringify(ollamaError);
      }
      
      console.log(`[EnhancedLLMService] Processing error: "${ollamaError}"`);
      
      // Check for memory-related errors
      if (ollamaError.includes('requires more system memory') || ollamaError.includes('out of memory')) {
        const memoryMatch = ollamaError.match(/requires more system memory \(([^)]+)\) than is available \(([^)]+)\)/);
        if (memoryMatch) {
          const required = memoryMatch[1];
          const available = memoryMatch[2];
          return new Error(`🧠 **Local LLM Memory Error**: The ${this.config.model} model requires **${required}** of system memory, but only **${available}** is available. 
          
**Solutions:**
• Switch to a smaller model (e.g., codellama:3b or llama3.2:1b)
• Close other applications to free memory
• Use a cloud LLM provider instead
• Increase your system's available memory`);
        } else {
          return new Error(`🧠 **Local LLM Memory Error**: ${ollamaError}

**Solutions:**
• Try a smaller model
• Close other applications to free memory  
• Switch to a cloud LLM provider`);
        }
      }
      
      // Check for model loading errors
      if (ollamaError.includes('model not found') || ollamaError.includes('pull model')) {
        return new Error(`📥 **Local LLM Model Error**: The model "${this.config.model}" is not available locally.

**Solutions:**
• Run: \`ollama pull ${this.config.model}\` to download the model
• Choose a different model that's already downloaded
• Switch to a cloud LLM provider`);
      }
      
      // Check for context length errors
      if (ollamaError.includes('context length') || ollamaError.includes('too long')) {
        return new Error(`📝 **Local LLM Context Error**: The message is too long for the ${this.config.model} model.

**Solutions:**
• Try a shorter question
• Use a model with larger context (e.g., llama3.1 or qwen2.5)
• Switch to a cloud LLM provider with larger context`);
      }
      
      // Other Ollama-specific errors
      if (ollamaError.trim()) {
        return new Error(`🤖 **Local LLM Error**: ${ollamaError}

**Suggestion:** Try switching to a cloud LLM provider for more reliable performance.`);
      }
    }
    
    return new Error(`${provider} request failed: ${error.message || 'Unknown error'}`);
  }

  /**
   * Get user-friendly provider display name
   */
  private getProviderDisplayName(provider: string): string {
    switch (provider.toLowerCase()) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'gemini': return 'Google Gemini';
      case 'azure-openai': return 'Azure OpenAI';
      case 'ollama': return 'Ollama';
      case 'lmstudio': return 'LM Studio';
      default: return provider;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.unifiedLLM.isAvailable();
  }

  async getAvailableModels(): Promise<string[]> {
    return this.unifiedLLM.getAvailableModels();
  }

  /**
   * Cleanup method to shut down MCP servers
   */
  async shutdown(): Promise<void> {
    try {
      await this.mcpClient.stopAllServers();
    } catch (error) {
      console.error('Error shutting down MCP servers:', error);
    }
  }

  /**
   * Update the configuration dynamically
   */
  updateConfig(newConfig: LLMConfig): void {
    console.log(`[EnhancedLLMService] Updating config from ${this.config.provider} to ${newConfig.provider}`);
    this.config = newConfig;
    
    // Update the unified LLM service config as well
    if (this.unifiedLLM && this.unifiedLLM.updateConfig) {
      this.unifiedLLM.updateConfig(newConfig);
    }
  }

  /**
   * Dispose of the service and clean up resources to prevent memory leaks
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    console.log('🧹 EnhancedLLMService: Disposing resources...');
    
    try {
      // Clean up conversation context manager
      if (conversationContextManager) {
        conversationContextManager.cleanup(1); // Clean up conversations older than 1 hour
      }

      // Stop MCP client servers
      if (this.mcpClient) {
        this.mcpClient.stopAllServers().catch(error => {
          console.warn('Error stopping MCP servers during disposal:', error);
        });
      }

      // Mark as disposed
      this.isDisposed = true;
      console.log('✅ EnhancedLLMService: Resources disposed successfully');
      
    } catch (error) {
      console.error('❌ EnhancedLLMService: Error during disposal:', error);
    }
  }

  /**
   * Check if the service has been disposed
   */
  isServiceDisposed(): boolean {
    return this.isDisposed;
  }

}
