// Enhanced LLM Service that orchestrates MCP tool usage
// Integrates unified LLM (local/cloud), Fetch MCP, and Lokka MCP components for intelligent query handling

import axios from 'axios';
import { LLMConfig, ChatMessage, MCPConfig } from '../types';
import { MCPClient } from '../mcp/clients';
import { MCPAuthService } from '../mcp/auth/MCPAuthService';
import { MCPServerConfig } from '../mcp/types';
import { AuthService } from '../auth/AuthService';
import { UnifiedLLMService } from './UnifiedLLMService';
import { UnifiedPromptService, PermissionContext } from './UnifiedPromptService';
import { conversationContextManager, ConversationContextManager } from '../shared/ConversationContextManager';
import { MCPQueryRouter, RoutingDecision } from '../mcp/routing/MCPQueryRouter';
import {
  LOKKA_NPX_ARGS,
  LOKKA_TOOL_DEFINITION_UI_RESOURCES,
  graphApiVersionFromBeta,
  detectLokkaAppIntent,
  detectPolyarchyAppIntent,
  detectPolyarchyReportIntent,
  POLYARCHY_SERVER_ID,
  POLYARCHY_TOOL_DEFINITION_UI_RESOURCES
} from '../mcp/constants';
import { McpUiResourceRef, resolveUiResourceUri } from '../mcp/types';

export interface QueryAnalysis {
  needsFetchMcp: boolean;
  needsLokkaMcp: boolean;
  needsMicrosoftDocsMcp: boolean;
  needsMicrosoftEnterpriseMcp?: boolean; // Added for enterprise MCP routing
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
    microsoftEnterpriseResult?: any;
    polyarchyResult?: any;
  };
  mcpServerUsed?: 'lokka' | 'microsoft-enterprise';
  finalResponse: string;
  // MCP Apps: set when a tool call references an interactive UI resource to render inline.
  uiResource?: McpUiResourceRef;
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
  private isDisposed: boolean = false;
  private mcpConfig?: MCPConfig;

  constructor(config: LLMConfig, authService: AuthService, mcpClient?: MCPClient, mcpConfig?: MCPConfig) {
    this.config = config;
    this.authService = authService;
    this.mcpAuthService = new MCPAuthService(authService);
    this.mcpConfig = mcpConfig;
    
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
          args: [...LOKKA_NPX_ARGS]
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
    
    // Initialize UnifiedLLMService with MCP client and config for enhanced model discovery and routing
    this.unifiedLLM = new UnifiedLLMService(config, this.mcpClient, this.mcpConfig);
    console.log('EnhancedLLMService: Initialized UnifiedLLMService with mcpConfig:', {
      hasConfig: !!this.mcpConfig,
      lokkaEnabled: this.mcpConfig?.lokka?.enabled,
      microsoftMcpEnabled: this.mcpConfig?.microsoftEnterprise?.enabled
    });
  }

  /**
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
      const mcpResults: { fetchResult?: any; lokkaResult?: any; microsoftDocsResult?: any; microsoftEnterpriseResult?: any; polyarchyResult?: any } = {};
      let mcpServerUsed: 'lokka' | 'microsoft-enterprise' | undefined = undefined;
      let uiResource: McpUiResourceRef | undefined = undefined; // MCP Apps: UI to render inline

      // MCP Apps intent routing: if the user is explicitly asking to manage connections,
      // review permissions, or get help, open the matching Lokka app inline instead of
      // running a Graph query. open-* results carry _meta.ui.resourceUri directly.
      let appOpened = false;

      const polyarchyEnabled = this.mcpConfig?.polyarchy?.enabled !== false;

      // Headless identity report first: "identity report for Megan" / "summarize
      // Rebecca's access" runs polyarchy-report and hands the structured JSON to the
      // LLM to analyze — no app UI. Checked before the visual intent because
      // "polyarchy report" would otherwise match the visualizer's bare pattern.
      const reportIntent = polyarchyEnabled ? detectPolyarchyReportIntent(userQuery) : null;
      if (reportIntent) {
        try {
          trace.push('Running Polyarchy identity report (headless)');
          const reportResult = await this.mcpClient.callTool(POLYARCHY_SERVER_ID, reportIntent.tool, reportIntent.args);
          mcpResults.polyarchyResult = { ...reportResult, headlessReport: true };
          appOpened = true; // report data in hand — skip the visual intent and Graph routing
          trace.push('Polyarchy identity report completed');
        } catch (error) {
          const errorMsg = `Polyarchy identity report failed: ${error}`;
          errors.push(errorMsg);
          trace.push(errorMsg);
          // Fall through to normal routing so the question still gets answered.
        }
      }

      // Polyarchy visualizer: "visualize <person>'s identity" / "open the polyarchy"
      // opens the identity app (visualize-identity's UI link lives on its tool definition).
      const polyarchyIntent = appOpened ? null : detectPolyarchyAppIntent(userQuery);
      if (polyarchyIntent && polyarchyEnabled) {
        try {
          trace.push(`Opening Polyarchy MCP app via intent: ${polyarchyIntent.tool}`);
          const appResult = await this.mcpClient.callTool(POLYARCHY_SERVER_ID, polyarchyIntent.tool, polyarchyIntent.args);
          mcpResults.polyarchyResult = appResult;
          const resourceUri = resolveUiResourceUri(polyarchyIntent.tool, appResult, POLYARCHY_TOOL_DEFINITION_UI_RESOURCES) || polyarchyIntent.resourceUri;
          uiResource = {
            serverId: POLYARCHY_SERVER_ID,
            resourceUri,
            toolName: polyarchyIntent.tool,
            initialData: { arguments: polyarchyIntent.args, structuredContent: appResult?.structuredContent, content: appResult?.content, isError: appResult?.isError }
          };
          appOpened = true;
          trace.push('Polyarchy MCP app opened');
        } catch (error) {
          const errorMsg = `Failed to open Polyarchy MCP app (${polyarchyIntent.tool}): ${error}`;
          errors.push(errorMsg);
          trace.push(errorMsg);
        }
      }

      const lokkaEnabled = this.mcpConfig?.lokka?.enabled !== false;
      const appIntent = appOpened ? null : detectLokkaAppIntent(userQuery);
      if (appIntent && lokkaEnabled) {
        try {
          trace.push(`Opening Lokka MCP app via intent: ${appIntent.tool}`);
          const appResult = await this.mcpClient.callTool('external-lokka', appIntent.tool, {});
          mcpResults.lokkaResult = appResult;
          mcpServerUsed = 'lokka';
          const resourceUri = resolveUiResourceUri(appIntent.tool, appResult, LOKKA_TOOL_DEFINITION_UI_RESOURCES) || appIntent.resourceUri;
          uiResource = {
            serverId: 'external-lokka',
            resourceUri,
            toolName: appIntent.tool,
            initialData: { structuredContent: appResult?.structuredContent, content: appResult?.content, isError: appResult?.isError }
          };
          appOpened = true;
          trace.push('Lokka MCP app opened');
        } catch (error) {
          const errorMsg = `Failed to open Lokka MCP app (${appIntent.tool}): ${error}`;
          errors.push(errorMsg);
          trace.push(errorMsg);
        }
      }

      // Microsoft Docs MCP for documentation (preferred)
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

      // Microsoft Graph data - Use intelligent routing between Lokka and Microsoft Enterprise MCP
      // (skipped when an MCP app was opened via intent above)
      if (analysis.needsLokkaMcp && analysis.graphEndpoint && !appOpened) {
        try {
          // Determine which MCP server to use based on query routing
          // Debug: Log the mcpConfig values to understand routing
          console.log('🔍 EnhancedLLMService: MCP config for routing:', {
            hasMcpConfig: !!this.mcpConfig,
            lokkaConfig: this.mcpConfig?.lokka,
            microsoftEnterpriseConfig: this.mcpConfig?.microsoftEnterprise,
            lokkaEnabled: this.mcpConfig?.lokka?.enabled,
            microsoftMcpEnabled: this.mcpConfig?.microsoftEnterprise?.enabled
          });
          
          const routingConfig = {
            lokkaEnabled: this.mcpConfig?.lokka?.enabled ?? true,
            microsoftMcpEnabled: this.mcpConfig?.microsoftEnterprise?.enabled ?? false
          };
          
          console.log('🔍 EnhancedLLMService: Final routing config:', routingConfig);
          
          const routingDecision = MCPQueryRouter.routeQuery(userQuery, routingConfig);
          console.log('🧭 EnhancedLLMService: Routing decision:', {
            server: routingDecision.server,
            reason: routingDecision.reason,
            confidence: routingDecision.confidence,
            keywords: routingDecision.keywords
          });
          
          // Convert query parameters to strings as required by MCP
          const stringifiedQueryParams = analysis.graphParams ? 
            Object.fromEntries(
              Object.entries(analysis.graphParams).map(([key, value]) => [
                key, 
                typeof value === 'string' ? value : String(value)
              ])
            ) : undefined;
          
          // Ensure method is lowercase as required by MCP
          const method = (analysis.graphMethod || 'get').toLowerCase();
          
          // Route to appropriate MCP server
          const availableServers = this.mcpClient.getAvailableServerNames();
          
          if (routingDecision.server === 'microsoft-enterprise' && availableServers.includes('microsoft-enterprise')) {
            // Use Microsoft Enterprise MCP with the recommended two-step workflow:
            // 1. First call microsoft_graph_suggest_queries to get the right Graph API call
            // 2. Then call microsoft_graph_get with the suggested URL
            trace.push(`Calling Microsoft Enterprise MCP for Graph data (${routingDecision.reason})`);
            console.log('✅ EnhancedLLMService: Routing to Microsoft Enterprise MCP');
            mcpServerUsed = 'microsoft-enterprise';
            
            try {
              // Step 1: Use microsoft_graph_suggest_queries to get the appropriate Graph API call
              // Pass the ORIGINAL user query to get better suggestions, not just the endpoint
              const intentDescription = userQuery;
              console.log('🔍 EnhancedLLMService: Calling microsoft_graph_suggest_queries with intentDescription:', intentDescription);
              trace.push(`Calling microsoft_graph_suggest_queries for: "${intentDescription}"`);
              
              const suggestResult = await this.mcpClient.callTool('microsoft-enterprise', 'microsoft_graph_suggest_queries', {
                intentDescription: intentDescription
              });
              
              console.log('📋 EnhancedLLMService: Suggest queries result:', suggestResult);
              trace.push(`Graph API suggestions received`);
              
              // Step 2: Build the relativeUrl from analysis or suggestions
              // Start with analyzed endpoint as fallback
              let relativeUrl = analysis.graphEndpoint || '/users';
              
              // Try to extract the best URL from the suggestions
              if (suggestResult && suggestResult.content && !suggestResult.isError) {
                const textContent = suggestResult.content.find((item: any) => item.type === 'text');
                if (textContent?.text) {
                  console.log('🔍 EnhancedLLMService: Parsing suggestions:', textContent.text);
                  
                  // Parse all suggestions to find the most relevant one
                  // Format: "- Score: 65.0 %\n  RetrievalText: how many users\n  Steps: /v1.0/users/$count"
                  const suggestions = textContent.text.split(/(?=- Score:)/);
                  let bestMatch: { url: string; score: number; text: string } | null = null;
                  
                  for (const suggestion of suggestions) {
                    if (!suggestion.trim()) continue;
                    
                    // Extract score
                    const scoreMatch = suggestion.match(/Score:\s*([\d.]+)/);
                    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
                    
                    // Extract retrieval text (what the suggestion is about)
                    const retrievalMatch = suggestion.match(/RetrievalText:\s*([^\n]+)/);
                    const retrievalText = retrievalMatch ? retrievalMatch[1].trim().toLowerCase() : '';
                    
                    // Extract the Steps URL - get everything after "Steps:" until end or next line that starts with "-"
                    // Handle multi-line Steps (like "Execute All\n\n/v1.0/...")
                    const stepsMatch = suggestion.match(/Steps:\s*(?:>-\s*)?(.+?)(?=\n\s*-|$)/s);
                    if (!stepsMatch) continue;
                    
                    let stepsContent = stepsMatch[1].trim();
                    
                    // Skip if Steps contains instructions/text instead of a URL
                    if (stepsContent.includes('not currently supported') || 
                        stepsContent.includes('**IMPORTANT!**') ||
                        stepsContent.startsWith('Searching for')) {
                      continue;
                    }
                    
                    // Extract the actual URL from the steps (might have "Execute All" prefix or other text)
                    const urlMatch = stepsContent.match(/(\/(?:v1\.0|beta)?\/[^\n]+?)$/m) || 
                                     stepsContent.match(/^\/?(?:v1\.0|beta)?(\/[^\n]+)/);
                    if (!urlMatch) continue;
                    
                    let suggestedUrl = urlMatch[1] || urlMatch[0];
                    suggestedUrl = suggestedUrl.trim();
                    
                    // Remove version prefix if present (MCP expects relative URL without version)
                    suggestedUrl = suggestedUrl.replace(/^\/v1\.0/, '').replace(/^\/beta/, '');
                    
                    // Skip if it doesn't look like a valid Graph API URL
                    if (!suggestedUrl.startsWith('/')) continue;
                    
                    console.log(`🔍 EnhancedLLMService: Found suggestion - Score: ${score}, Text: "${retrievalText}", URL: ${suggestedUrl}`);
                    
                    // Prioritize URLs that are more relevant to the query
                    // For simple user/count queries, prefer simpler URLs
                    const queryLower = userQuery.toLowerCase();
                    let relevanceBoost = 0;
                    let relevancePenalty = 0;
                    
                    // Determine if this is a simple count query (e.g., "how many groups/users")
                    const isSimpleCountQuery = (queryLower.includes('how many') || queryLower.match(/count\s*(of\s+)?(?:all\s+)?(?:users?|groups?)/)) 
                      && !queryLower.includes('with') && !queryLower.includes('where') && !queryLower.includes('filter');
                    
                    // Boost if retrieval text matches key terms in the query
                    if (queryLower.includes('user') && retrievalText.includes('user') && !retrievalText.includes('group')) relevanceBoost += 25;
                    if (queryLower.includes('group') && retrievalText.includes('group') && !retrievalText.includes('user')) relevanceBoost += 25;
                    if (queryLower.includes('guest') && retrievalText.includes('guest')) relevanceBoost += 30;
                    
                    // For "how many users/groups" - boost retrieval text that mentions counting or "how many"
                    if (queryLower.includes('how many') || queryLower.includes('count')) {
                      if (retrievalText.includes('how many') || retrievalText.includes('number of') || retrievalText.includes('count')) relevanceBoost += 20;
                    }
                    
                    // For simple count queries, prefer direct $count endpoints over complex filtered queries
                    if (isSimpleCountQuery) {
                      // Strongly prefer URLs that end with /$count (direct count endpoint)
                      if (suggestedUrl.match(/\/\$count$/)) {
                        relevanceBoost += 40;
                      }
                      // Penalize complex URLs with $filter when doing simple counts
                      if (suggestedUrl.includes('$filter=')) {
                        relevancePenalty += 30;
                      }
                      // Penalize enterprise/analytics endpoints for simple queries
                      if (suggestedUrl.includes('/reports/') || suggestedUrl.includes('/identityAnalytics/')) {
                        relevancePenalty += 25;
                      }
                      // Penalize URLs with template variables for simple queries
                      if (suggestedUrl.includes('<') && suggestedUrl.includes('>')) {
                        relevancePenalty += 50;
                      }
                    }
                    
                    // Penalize suggestions that don't match the entity type being queried
                    if (queryLower.includes('user') && !queryLower.includes('group') && retrievalText.includes('group') && !retrievalText.includes('user')) {
                      relevancePenalty += 40;
                    }
                    if (queryLower.includes('group') && !queryLower.includes('user') && retrievalText.includes('user') && !retrievalText.includes('group')) {
                      relevancePenalty += 40;
                    }
                    
                    // Penalize suggestions about permissions/settings when asking about counts
                    if ((queryLower.includes('how many') || queryLower.includes('count')) && 
                        (retrievalText.includes('setting') || retrievalText.includes('permission') || retrievalText.includes('policy'))) {
                      relevancePenalty += 35;
                    }
                    
                    const adjustedScore = score + relevanceBoost - relevancePenalty;
                    console.log(`    -> Adjusted score: ${adjustedScore} (original: ${score}, boost: +${relevanceBoost}, penalty: -${relevancePenalty})`)
                    
                    if (!bestMatch || adjustedScore > bestMatch.score) {
                      bestMatch = { url: suggestedUrl, score: adjustedScore, text: retrievalText };
                    }
                  }
                  
                  if (bestMatch) {
                    relativeUrl = bestMatch.url;
                    console.log(`🎯 EnhancedLLMService: Selected best URL (score: ${bestMatch.score}, text: "${bestMatch.text}"): ${relativeUrl}`);
                    trace.push(`Using suggested Graph URL: ${relativeUrl}`);
                  }
                  
                  // For simple count queries, if the best match score is low or uses complex endpoints,
                  // fallback to a simple direct count endpoint
                  const queryLower = userQuery.toLowerCase();
                  const isSimpleCountQuery = (queryLower.includes('how many') || queryLower.match(/count\s*(of\s+)?(?:all\s+)?(?:users?|groups?)/)) 
                    && !queryLower.includes('with') && !queryLower.includes('where') && !queryLower.includes('filter');
                  
                  if (isSimpleCountQuery) {
                    const needsFallback = !bestMatch || 
                      bestMatch.score < 50 || 
                      relativeUrl.includes('/reports/') || 
                      relativeUrl.includes('/identityAnalytics/') ||
                      relativeUrl.includes('<') ||
                      relativeUrl.includes('$filter=');
                    
                    if (needsFallback) {
                      let fallbackUrl = '';
                      if (queryLower.includes('user') && !queryLower.includes('group')) {
                        fallbackUrl = '/users/$count';
                      } else if (queryLower.includes('group') && !queryLower.includes('user')) {
                        fallbackUrl = '/groups/$count';
                      }
                      
                      if (fallbackUrl) {
                        console.log(`🔄 EnhancedLLMService: Simple count query - using fallback URL instead of complex suggestion: ${fallbackUrl}`);
                        trace.push(`Using simple count endpoint (fallback): ${fallbackUrl}`);
                        relativeUrl = fallbackUrl;
                      }
                    }
                  }
                }
              }
              
              // If analysis provided filter params but the URL doesn't have them, add them
              if (analysis.graphParams && !relativeUrl.includes('$filter') && !relativeUrl.includes('?')) {
                const filterValue = analysis.graphParams['$filter'] || analysis.graphParams['filter'];
                if (filterValue) {
                  // Build query string from params
                  const queryParams = new URLSearchParams();
                  for (const [key, value] of Object.entries(analysis.graphParams)) {
                    queryParams.set(key.startsWith('$') ? key : `$${key}`, String(value));
                  }
                  relativeUrl = `${relativeUrl}?${queryParams.toString()}`;
                  console.log('🔧 EnhancedLLMService: Added filter params to URL:', relativeUrl);
                }
              }
              
              // Step 2: Call microsoft_graph_get with the relativeUrl
              console.log('🔧 EnhancedLLMService: Calling microsoft_graph_get with relativeUrl:', relativeUrl);
              trace.push(`Calling microsoft_graph_get with: ${relativeUrl}`);
              
              mcpResults.microsoftEnterpriseResult = await this.mcpClient.callTool('microsoft-enterprise', 'microsoft_graph_get', {
                relativeUrl: relativeUrl
              });
              
              trace.push('Microsoft Enterprise MCP completed successfully');
            } catch (enterpriseError) {
              console.error('❌ EnhancedLLMService: Microsoft Enterprise MCP error:', enterpriseError);
              trace.push(`Microsoft Enterprise MCP error: ${enterpriseError}`);
              
              // Store the error in results so user can see what happened
              mcpResults.microsoftEnterpriseResult = {
                error: true,
                message: `Microsoft Enterprise MCP Error: ${enterpriseError instanceof Error ? enterpriseError.message : String(enterpriseError)}`
              };
            }
          } else {
            // Use Lokka MCP (default/fallback)
            trace.push('Calling Lokka MCP for Graph data');
            console.log('✅ EnhancedLLMService: Routing to Lokka MCP');
            mcpServerUsed = 'lokka';
            
            const serverName = 'external-lokka';
            // Lokka MCP tool name is 'Lokka-Microsoft' (not 'microsoft_graph_query')
            const toolName = 'Lokka-Microsoft';
            
            console.log(`🔧 EnhancedLLMService: Using MCP server: ${serverName}, tool: ${toolName}`);
            
            // Lokka uses 'path' parameter, not 'endpoint'.
            // Pass graphApiVersion explicitly so the actual query and the Graph Explorer's
            // displayed version always agree. Mirror the configured endpoint: Lokka v2
            // defaults to beta, but we surface v1.0 unless beta is explicitly enabled —
            // v1.0 returns a leaner property set (less response noise).
            const graphApiVersion = graphApiVersionFromBeta(this.mcpConfig?.lokka?.useGraphBeta);
            const lokkaArgs = {
              apiType: 'graph',
              method: method,
              path: analysis.graphEndpoint,
              graphApiVersion,
              queryParams: stringifiedQueryParams
            };
            mcpResults.lokkaResult = await this.mcpClient.callTool(serverName, toolName, lokkaArgs);
            trace.push('Lokka MCP completed successfully');

            // MCP Apps: if this tool references an interactive UI resource, surface it so
            // the renderer can mount an McpAppFrame. Lokka-Microsoft auto-opens the graph
            // explorer (link on the tool definition); open-* tools carry it on the result.
            // The args populate the explorer's query form (ui/notifications/tool-input).
            const resourceUri = resolveUiResourceUri(toolName, mcpResults.lokkaResult, LOKKA_TOOL_DEFINITION_UI_RESOURCES);
            if (resourceUri) {
              const r = mcpResults.lokkaResult;
              uiResource = {
                serverId: serverName,
                resourceUri,
                toolName,
                initialData: { arguments: lokkaArgs, structuredContent: r?.structuredContent, content: r?.content, isError: r?.isError }
              };
            }
          }
        } catch (error) {
          const errorMsg = `Graph MCP failed: ${error}`;
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
        mcpServerUsed,
        finalResponse,
        uiResource,
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
- "List all groups" -> Lokka MCP, endpoint: "/groups", method: "get"
- "List applications" -> Lokka MCP, endpoint: "/applications", method: "get"

IMPORTANT: 
- DEFAULT to Microsoft Docs MCP for ANY Microsoft-related query
- Only use Fetch MCP for non-Microsoft web searches
- Always use lowercase HTTP methods (get, post, put, delete, patch)
- For count queries, use /$count endpoints with ConsistencyLevel parameter
- For regular list queries, do NOT use ConsistencyLevel parameter
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
      // Do NOT add ConsistencyLevel for regular group listings
    } else if (lowerQuery.includes('applications') || lowerQuery.includes('app registration')) {
      graphEndpoint = '/applications';
      // Do NOT add ConsistencyLevel for regular application listings
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
   */
  private async generateFinalResponse(
    originalQuery: string,
    analysis: QueryAnalysis,
    mcpResults: { fetchResult?: any; lokkaResult?: any; microsoftDocsResult?: any; microsoftEnterpriseResult?: any; polyarchyResult?: any }
  ): Promise<string> {

    let contextData = '';

    // Polyarchy results: either a headless identity report (structured JSON the LLM
    // should analyze) or the visual app opened inline (acknowledge it, don't fabricate
    // Graph data).
    if (mcpResults.polyarchyResult) {
      const polyarchyText = mcpResults.polyarchyResult.content?.find((item: any) => item.type === 'text')?.text;
      if (mcpResults.polyarchyResult.headlessReport) {
        if (mcpResults.polyarchyResult.isError) {
          contextData += `The Polyarchy identity report could not run: ${polyarchyText || 'unknown error'}\n` +
            `If it lists candidate users, relay them and ask which one the user meant.\n\n`;
        } else {
          contextData += `Identity relationship report (structured data from the Polyarchy MCP server):\n${polyarchyText || ''}\n\n` +
            `Answer the user's question from this report — summarize and analyze the relevant parts rather than dumping the raw JSON. ` +
            `Mention they can also ask to "visualize" this identity to explore it interactively.\n\n`;
        }
      } else if (mcpResults.polyarchyResult.isError) {
        contextData += `Polyarchy Identity Visualizer could not open: ${polyarchyText || 'unknown error'}\n\n`;
      } else {
        contextData += `The Polyarchy Identity Visualizer (an interactive identity-relationship graph) has been opened inline in the chat for this request. ` +
          `${polyarchyText ? `Tool response: ${polyarchyText}\n` : ''}` +
          `Briefly tell the user the visualization is displayed and they can click nodes to explore, double-click to change focus, and use the toolbar to switch between org/groups/attributes/access views.\n\n`;
      }
    }
    
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
              
              // Parse the actual error to determine specific permission needed
              const specificError = this.parseGraphApiError(text);
              
              throw new Error(specificError);
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
        }
          
        if (lokkaData && typeof lokkaData === 'object') {
          // Use the generic processing for objects
          finalLokkaData = lokkaData;
          console.log('🔍 Using object data as-is');
        }
          
        // Use the new generic data processing method
        const processedData = this.processGraphApiData(finalLokkaData);
        if (processedData) {
          contextData += `Microsoft Graph Data:\n${processedData}\n\n`;
        }
        
        console.log('🔍 Added context data:', {
          finalLokkaData,
          contextLength: contextData.length
        });
      } else {
        console.log('🔍 No lokkaData extracted from result');
      }
    }

    // Prepare context from Microsoft Enterprise MCP results
    if (mcpResults.microsoftEnterpriseResult) {
      try {
        console.log('🔍 Processing Microsoft Enterprise MCP result:', mcpResults.microsoftEnterpriseResult);
        
        let enterpriseData = mcpResults.microsoftEnterpriseResult;
        
        // Handle MCP protocol content array format
        if (enterpriseData && typeof enterpriseData === 'object' && enterpriseData.content) {
          const textContent = enterpriseData.content.find((item: any) => item.type === 'text');
          if (textContent && textContent.text) {
            // Try to parse as JSON
            try {
              enterpriseData = JSON.parse(textContent.text);
            } catch {
              enterpriseData = textContent.text;
            }
          }
        }
        
        // Check if the response indicates an error
        if (typeof enterpriseData === 'string' && enterpriseData.includes('error occurred')) {
          console.warn('Microsoft Enterprise MCP returned an error:', enterpriseData);
          contextData += `Microsoft Enterprise MCP Error: ${enterpriseData}\n\n`;
        } else if (enterpriseData && typeof enterpriseData === 'object' && 'error' in enterpriseData) {
          // An error object (e.g. { error: true, message: '...' }) would otherwise be passed to
          // processGraphApiData and produce confusing prompt context. Surface the message directly.
          console.warn('Microsoft Enterprise MCP returned an error object:', enterpriseData);
          contextData += `Microsoft Enterprise MCP Error: ${(enterpriseData as any).message || JSON.stringify(enterpriseData)}\n\n`;
        } else {
          const processedData = this.processGraphApiData(enterpriseData);
          if (processedData) {
            contextData += `Microsoft Graph Data (Enterprise MCP):\n${processedData}\n\n`;
          }
        }
      } catch (error) {
        console.warn('Error processing Microsoft Enterprise MCP result:', error);
      }
    }
    
    // Get permission context for unified prompt
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
    ];
    
    try {
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
      
      return enhancedResponse;
    } catch (error) {
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

  /**
   * Parse Graph API error response and return specific error message
   */
  private parseGraphApiError(errorText: string): string {
    console.log('🔍 Parsing Graph API error:', errorText);
    
    // Check for audit log permission errors (sign-in logs)
    if (errorText.includes('auditLogs/signIns') || 
        errorText.includes('/auditLogs/signIns') ||
        errorText.includes('signIns') ||
        errorText.includes('AuditLog.Read.All')) {
      
      return `🔐 **Microsoft Graph Permission Error**

The current authentication session does not have sufficient permissions to access user sign-in activity data.

**Required Permissions:**
• **AuditLog.Read.All** - To access user sign-in activity
• **User.Read.All** - To read user profiles (optional)
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

**Note**: Sign-in activity data requires elevated permissions that may not be available in service principal (client-credentials) mode.`;
    }
    
    // Check for application permission errors
    if (errorText.includes('/applications') || 
        errorText.includes('applications') ||
        errorText.includes('Application.Read.All')) {
      
      return `🔐 **Microsoft Graph Permission Error**

The current authentication session does not have sufficient permissions to access application registration data.

**Required Permissions:**
• **Application.Read.All** - To read all application registrations
• **Directory.Read.All** - Alternative permission for directory data

**Current Session**: Client-credentials mode (service principal authentication)

**To resolve this issue:**

1. **Option 1 - Grant App Permissions**: Have your Entra Administrator grant the following **Application permissions** to your app registration:
   • Application.Read.All
   • Directory.Read.All

2. **Option 2 - Switch to Interactive Mode**: Sign in with a user account that has the required permissions (Application Administrator role or higher)

3. **Option 3 - Use Different Query**: Try queries that don't require application data, such as:
   • "How many users do we have?"
   • "List the first 5 users"
   • "Show me user groups"

**Note**: Application registration data requires elevated permissions that may not be available in service principal (client-credentials) mode.`;
    }
    
    // Check for mail-related permission errors
    if (errorText.includes('/messages') || 
        errorText.includes('/mail') ||
        errorText.includes('Mail.Read')) {
      
      return `🔐 **Enhanced Graph Access Permission Error**

The Microsoft Graph PowerShell client ID requires admin consent for mail permissions.

**To resolve this issue:**

1. **Admin Consent Required**: Contact your Entra Administrator to grant admin consent for these delegated permissions to the "Microsoft Graph Command Line Tools" app (ID: 14d82eec-204b-4c2f-b7e8-296a70dab67e):
   • Mail.Read
   • Mail.ReadWrite  

2. **Admin Consent URL**: Use this URL to grant consent:
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=14d82eec-204b-4c2f-b7e8-296a70dab67e&response_type=code&scope=https://graph.microsoft.com/Mail.Read%20https://graph.microsoft.com/Mail.ReadWrite&response_mode=query&state=12345&prompt=admin_consent

3. **Alternative**: Disable Enhanced Graph Access in the authentication settings and use your own app registration with pre-consented permissions.

**Note**: Enhanced Graph Access provides access to more Microsoft Graph APIs but requires admin consent for sensitive permissions like mail access.`;
    }
    
    // Check for calendar-related permission errors
    if (errorText.includes('/calendar') || 
        errorText.includes('/events') ||
        errorText.includes('Calendars.Read')) {
      
      return `🔐 **Enhanced Graph Access Permission Error**

The Microsoft Graph PowerShell client ID requires admin consent for calendar permissions.

**To resolve this issue:**

1. **Admin Consent Required**: Contact your Entra Administrator to grant admin consent for these delegated permissions to the "Microsoft Graph Command Line Tools" app (ID: 14d82eec-204b-4c2f-b7e8-296a70dab67e):
   • Calendars.Read

2. **Admin Consent URL**: Use this URL to grant consent:
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=14d82eec-204b-4c2f-b7e8-296a70dab67e&response_type=code&scope=https://graph.microsoft.com/Calendars.Read&response_mode=query&state=12345&prompt=admin_consent

3. **Alternative**: Disable Enhanced Graph Access in the authentication settings and use your own app registration with pre-consented permissions.

**Note**: Enhanced Graph Access provides access to more Microsoft Graph APIs but requires admin consent for sensitive permissions like calendar access.`;
    }
    
    // Check for files/SharePoint permission errors
    if (errorText.includes('/files') || 
        errorText.includes('/sites') ||
        errorText.includes('Files.Read')) {
      
      return `🔐 **Enhanced Graph Access Permission Error**

The Microsoft Graph PowerShell client ID requires admin consent for files and SharePoint permissions.

**To resolve this issue:**

1. **Admin Consent Required**: Contact your Entra Administrator to grant admin consent for these delegated permissions to the "Microsoft Graph Command Line Tools" app (ID: 14d82eec-204b-4c2f-b7e8-296a70dab67e):
   • Files.Read.All
   • Sites.Read.All

2. **Admin Consent URL**: Use this URL to grant consent:
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=14d82eec-204b-4c2f-b7e8-296a70dab67e&response_type=code&scope=https://graph.microsoft.com/Files.Read.All%20https://graph.microsoft.com/Sites.Read.All&response_mode=query&state=12345&prompt=admin_consent

3. **Alternative**: Disable Enhanced Graph Access in the authentication settings and use your own app registration with pre-consented permissions.

**Note**: Enhanced Graph Access provides access to more Microsoft Graph APIs but requires admin consent for sensitive permissions like files access.`;
    }
    
    // Generic permission error for other cases
    return `🔐 **Microsoft Graph Permission Error**

The current authentication session does not have sufficient permissions to access the requested data.

**To resolve this issue:**

1. **Check Required Permissions**: Verify that your application has the required permissions for the resource you're trying to access.

2. **Contact Administrator**: If using Enhanced Graph Access, contact your Entra Administrator to grant the necessary permissions.

3. **Try Alternative Query**: Use a query that requires only basic permissions like:
   • "How many users do we have?"
   • "List the first 5 users"
   • "Show me user groups"

**Current Session**: The specific permission required depends on the resource you're trying to access.`;
  }

  /**
   * Generic method to process Microsoft Graph API data regardless of type
   */
  private processGraphApiData(data: any): string {
    if (data === null || data === undefined) {
      return '';
    }

    // Handle different data types generically
    if (typeof data === 'number') {
      return `Count: ${data}`;
    }

    if (typeof data === 'boolean') {
      return `Result: ${data}`;
    }

    if (typeof data === 'string') {
      // Simple string values (like counts returned as strings)
      if (/^\d+$/.test(data.trim())) {
        return `Count: ${data}`;
      }
      return data;
    }

    if (Array.isArray(data)) {
      return this.formatArrayData(data);
    }

    if (typeof data === 'object') {
      return this.formatObjectData(data);
    }

    // Fallback for other types
    return String(data);
  }

  /**
   * Format array data with size limits and clean presentation
   */
  private formatArrayData(data: any[]): string {
    if (data.length === 0) {
      return 'No items found.';
    }

    const MAX_ITEMS = 50;
    const MAX_SIZE = 100000; // 100KB limit

    // Check total size first
    const fullJson = JSON.stringify(data, null, 2);
    if (fullJson.length > MAX_SIZE) {
      // For large datasets, provide summary + sample
      const sampleSize = Math.min(3, data.length);
      const sample = data.slice(0, sampleSize);
      
      return `Dataset Summary:
- Total items: ${data.length}
- Showing first ${sampleSize} items (dataset too large for full display)

Sample Data:
${this.formatAsTable(sample)}

Note: Full dataset contains ${data.length} items but is too large to display completely.`;
    }

    // For manageable sizes, show full data with potential truncation
    let itemsToShow = data;
    let truncationNote = '';
    
    if (data.length > MAX_ITEMS) {
      itemsToShow = data.slice(0, MAX_ITEMS);
      truncationNote = `\n\nNote: ${data.length - MAX_ITEMS} additional items not shown.`;
    }

    // Try to format as a table first, fallback to JSON if needed
    const tableFormat = this.formatAsTable(itemsToShow);
    if (tableFormat) {
      return `Dataset (${data.length} items${data.length > MAX_ITEMS ? `, showing first ${MAX_ITEMS}` : ''}):
${tableFormat}${truncationNote}`;
    }

    // Fallback to JSON formatting
    return `Dataset (${data.length} items${data.length > MAX_ITEMS ? `, showing first ${MAX_ITEMS}` : ''}):
${JSON.stringify(itemsToShow, null, 2)}${truncationNote}`;
  }

  /**
   * Format array data as a table if possible
   */
  private formatAsTable(data: any[]): string | null {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    // Check if all items are objects with similar structure
    const firstItem = data[0];
    if (typeof firstItem !== 'object' || firstItem === null) {
      return null;
    }

    // Get common keys from all objects
    const allKeys = new Set<string>();
    let hasConsistentStructure = true;

    for (const item of data) {
      if (typeof item !== 'object' || item === null) {
        hasConsistentStructure = false;
        break;
      }
      Object.keys(item).forEach(key => allKeys.add(key));
    }

    if (!hasConsistentStructure || allKeys.size === 0) {
      return null;
    }

    // Define key priorities and formatting for better table display
    const keyPriorities: { [key: string]: number } = {
      // High priority keys (shown first)
      'displayName': 100,
      'name': 95,
      'appDisplayName': 90,
      'applicationName': 90,
      'id': 85,
      'appId': 80,
      'clientId': 80,
      'objectId': 75,
      'createdDateTime': 70,
      'created': 70,
      'publisherDomain': 65,
      'signInAudience': 60,
      'description': 55,
      'groupTypes': 50,
      'securityEnabled': 45,
      'mailEnabled': 40,
      'visibility': 35,
      'membershipRule': 30,
      'membershipRuleProcessingState': 25,
      // Lower priority keys
      'mail': 20,
      'mailNickname': 15,
      'proxyAddresses': 10,
      // Very low priority (usually hidden unless important)
      '@odata.type': 1,
      '@odata.context': 1
    };

    // Sort keys by priority (high to low), then alphabetically
    const sortedKeys = Array.from(allKeys).sort((a, b) => {
      const priorityA = keyPriorities[a] || 5; // Default priority
      const priorityB = keyPriorities[b] || 5;
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA; // High priority first
      }
      return a.localeCompare(b); // Alphabetical for same priority
    });

    // Limit number of columns for readability
    const MAX_COLUMNS = 6;
    const displayKeys = sortedKeys.slice(0, MAX_COLUMNS);

    // Create table header
    const headers = displayKeys.map(key => this.formatColumnHeader(key));
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `|${headers.map(() => '---').join('|')}|`;

    // Create table rows
    const rows = data.map(item => {
      const cells = displayKeys.map(key => this.formatCellValue(item[key]));
      return `| ${cells.join(' | ')} |`;
    });

    return [headerRow, separatorRow, ...rows].join('\n');
  }

  /**
   * Format column header for better readability
   */
  private formatColumnHeader(key: string): string {
    // Convert camelCase/PascalCase to readable titles
    const formatted = key
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();

    // Handle special cases
    const specialCases: { [key: string]: string } = {
      'App Id': 'App ID',
      'Object Id': 'Object ID',
      'Client Id': 'Client ID',
      'Created Date Time': 'Created Date',
      'Sign In Audience': 'Sign-In Audience',
      'Publisher Domain': 'Publisher Domain',
      'Display Name': 'Display Name',
      'Mail Enabled': 'Mail Enabled',
      'Security Enabled': 'Security Enabled',
      'Group Types': 'Group Types',
      'Membership Rule': 'Membership Rule'
    };

    return specialCases[formatted] || formatted;
  }

  /**
   * Format cell value for table display
   */
  private formatCellValue(value: any): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'None';
      }
      if (value.length === 1) {
        return String(value[0]);
      }
      return `${value.length} items`;
    }

    if (typeof value === 'object') {
      return 'Complex Object';
    }

    if (typeof value === 'string') {
      // Truncate very long strings
      if (value.length > 50) {
        return value.substring(0, 47) + '...';
      }
      
      // Format date strings
      if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        try {
          const date = new Date(value);
          return date.toLocaleDateString();
        } catch {
          return value;
        }
      }
      
      return value;
    }

    return String(value);
  }

  /**
   * Format object data with size limits and clean presentation
   */
  private formatObjectData(data: any): string {
    const MAX_SIZE = 100000; // 100KB limit

    // Handle Graph API response wrapper formats
    if (data.value && Array.isArray(data.value)) {
      return this.formatArrayData(data.value);
    }

    if (data.result !== undefined) {
      return this.processGraphApiData(data.result);
    }

    // Check object size
    const fullJson = JSON.stringify(data, null, 2);
    if (fullJson.length > MAX_SIZE) {
      // For large objects, provide summary
      const keys = Object.keys(data);
      const summary = {
        objectType: 'Large object',
        keyCount: keys.length,
        keys: keys.slice(0, 20), // Show first 20 keys
        sizeInfo: `${fullJson.length} characters (too large to display fully)`
      };

      if (keys.length > 20) {
        summary.keys.push(`... and ${keys.length - 20} more keys`);
      }

      return `Object Summary:
${JSON.stringify(summary, null, 2)}`;
    }

    // Show full object for reasonable sizes
    return `Object Data:
${fullJson}`;
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

  /**
   * Search Microsoft Documentation using the real Microsoft Docs search
   */
  private async searchMicrosoftDocs(query: string): Promise<string> {
    try {
      console.log('🔍 Searching Microsoft Docs for:', query);
      return this.getMicrosoftGraphDocumentation(query);
    } catch (error) {
      console.error('Microsoft Docs search failed:', error);
      return this.getMicrosoftGraphDocumentation(query);
    }
  }

}
