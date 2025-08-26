# Azure MCP Integration Guide for EntraPulse Lite

## Table of Contents
1. [Overview](#overview)
2. [Architecture & Design Decisions](#architecture--design-decisions)
3. [Phase 1: Foundation Setup](#phase-1-foundation-setup)
4. [Phase 2: Schema Cache Implementation](#phase-2-schema-cache-implementation)
5. [Phase 3: Azure MCP Server Implementation](#phase-3-azure-mcp-server-implementation)
6. [Phase 4: UI Integration & Settings](#phase-4-ui-integration--settings)
7. [Phase 5: Chat Interface Integration](#phase-5-chat-interface-integration)
8. [Phase 6: Testing & Validation](#phase-6-testing--validation)
9. [Phase 7: Documentation & Deployment](#phase-7-documentation--deployment)
10. [Benefits & Use Cases](#benefits--use-cases)
11. [Troubleshooting](#troubleshooting)

## Overview

This guide provides a complete implementation plan for integrating Azure MCP (Model Context Protocol) server capabilities into EntraPulse Lite. The integration enables Infrastructure as Code (IaC) generation and deployment for Microsoft Entra ID resources using Bicep templates, leveraging the recently announced GA support for Bicep templates with Entra ID resources.

### Key Features Being Added
- **Local Azure MCP Server**: Runs locally within EntraPulse Lite
- **Dynamic Schema Caching**: Fetches latest Entra ID resource schemas from Azure Resource Manager repository
- **Interactive Configuration**: Uses MCP solicitation for just-in-time Azure configuration
- **Bicep Template Generation**: Creates validated Bicep templates for Entra ID resources
- **Deployment Capabilities**: Deploy templates with dry-run and validation support
- **MSAL Integration**: Leverages existing authentication for Azure Resource Manager access

## Architecture & Design Decisions

### Core Design Principles
1. **Local Operation**: Azure MCP server runs locally for security and performance
2. **Existing MSAL Integration**: Reuse current authentication infrastructure
3. **Just-in-Time Configuration**: Use MCP solicitation to request subscription/resource group selection
4. **Schema-Aware**: Cache and validate against real Azure Resource Manager schemas
5. **Safe Deployment**: Default to dry-run mode with explicit confirmation requirements

### Integration Points
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chat UI       │◄──►│   Azure MCP      │◄──►│ Azure Resource  │
│   (Renderer)    │    │   Server         │    │ Manager API     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Settings UI   │    │ Schema Cache     │    │ MSAL Auth       │
│   (Renderer)    │    │ Service          │    │ Provider        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Phase 1: Foundation Setup

### 1.1 Install Dependencies

Add the following to `package.json`:

```json
{
  "dependencies": {
    "@azure/arm-resources": "^5.2.0",
    "@azure/arm-subscriptions": "^5.1.0", 
    "@azure/core-auth": "^1.5.0",
    "@azure/core-client": "^1.7.3",
    "semver": "^7.5.4",
    "yaml": "^2.3.4"
  },
  "scripts": {
    "build:azure-mcp": "tsc --project src/mcp/azure/tsconfig.json",
    "test:azure-mcp": "jest src/mcp/azure/**/*.test.ts"
  }
}
```

### 1.2 Create Directory Structure

```
src/
├── mcp/
│   ├── azure/                    # New Azure MCP implementation
│   │   ├── server/
│   │   │   ├── AzureMcpServer.ts
│   │   │   ├── TemplateSchemaCache.ts
│   │   │   ├── AzureResourceManager.ts
│   │   │   └── BicepTemplateGenerator.ts
│   │   ├── types/
│   │   │   ├── azureMcp.ts
│   │   │   └── bicepTypes.ts
│   │   ├── utils/
│   │   │   ├── configurationCache.ts
│   │   │   └── validators.ts
│   │   └── index.ts
│   └── ...existing MCP code...
├── types/
│   └── azureMcp.ts              # Shared type definitions
└── ...existing code...
```

### 1.3 Type Definitions

Create `src/types/azureMcp.ts`:

```typescript
export interface AzureMcpConfig {
  subscriptionId?: string;
  tenantId?: string;
  defaultResourceGroup?: string;
  deploymentMode: 'Incremental' | 'Complete';
  autoValidateTemplates: boolean;
  requireConfirmationForDeployment: boolean;
  enableDryRunByDefault: boolean;
  bicepCliPath?: string;
  templateOutputPath: string;
  maxCacheSize: number;
  schemaUpdateInterval: number;
}

export interface BicepTemplate {
  $schema: string;
  contentVersion: string;
  parameters: Record<string, any>;
  variables?: Record<string, any>;
  resources: Array<BicepResource>;
  outputs?: Record<string, any>;
}

export interface BicepResource {
  type: string;
  apiVersion: string;
  name: string;
  properties: Record<string, any>;
  dependsOn?: string[];
}

export interface DeploymentResult {
  deploymentId: string;
  status: 'Running' | 'Succeeded' | 'Failed' | 'Canceled';
  resourceGroup: string;
  resources: Array<{
    name: string;
    type: string;
    status: string;
    resourceId?: string;
  }>;
  errors?: string[];
  warnings?: string[];
}

export interface Subscription {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId: string;
}

export interface ResourceGroup {
  name: string;
  location: string;
  tags: Record<string, string>;
  id: string;
}

export interface ResourceTypeDefinition {
  type: string;
  apiVersion: string;
  properties: Record<string, PropertyDefinition>;
  required: string[];
  examples: any[];
  description?: string;
}

export interface PropertyDefinition {
  type: string;
  description: string;
  allowedValues?: any[];
  defaultValue?: any;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}
```

### 1.4 Update Settings Schema

Extend existing settings in `src/shared/types/settings.ts`:

```typescript
export interface AppSettings {
  // ...existing settings...
  azureMcp: AzureMcpConfig;
}

export const defaultAzureMcpConfig: AzureMcpConfig = {
  deploymentMode: 'Incremental',
  autoValidateTemplates: true,
  requireConfirmationForDeployment: true,
  enableDryRunByDefault: true,
  templateOutputPath: './bicep-templates',
  maxCacheSize: 100, // MB
  schemaUpdateInterval: 24 // hours
};
```

## Phase 2: Schema Cache Implementation

### 2.1 Template Schema Cache Service

Create `src/mcp/azure/server/TemplateSchemaCache.ts`:

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { ResourceTypeDefinition, PropertyDefinition } from '../../../types/azureMcp';

interface SchemaVersion {
  version: string;
  lastUpdated: string;
  schemas: Record<string, any>;
  resourceTypes: Record<string, ResourceTypeDefinition>;
  apiVersions: Record<string, string[]>;
}

export class TemplateSchemaCache {
  private cacheDir: string;
  private currentVersion: SchemaVersion | null = null;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly SCHEMA_BASE_URL = 'https://raw.githubusercontent.com/Azure/azure-resource-manager-schemas/main/schemas';
  private readonly GITHUB_API_URL = 'https://api.github.com/repos/Azure/azure-resource-manager-schemas/contents/schemas';

  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'azure-schemas');
  }

  async initialize(): Promise<void> {
    await this.ensureCacheDirectory();
    await this.loadCachedSchemas();
    
    if (this.shouldRefreshCache()) {
      await this.refreshSchemas();
    }
  }

  private async ensureCacheDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create schema cache directory:', error);
    }
  }

  private async loadCachedSchemas(): Promise<void> {
    try {
      const schemaPath = path.join(this.cacheDir, 'schemas.json');
      const data = await fs.readFile(schemaPath, 'utf-8');
      this.currentVersion = JSON.parse(data);
      console.log(`📚 Loaded cached schemas version: ${this.currentVersion?.version}`);
    } catch (error) {
      console.log('No cached schemas found, will fetch fresh schemas');
      this.currentVersion = null;
    }
  }

  private shouldRefreshCache(): boolean {
    if (!this.currentVersion) return true;
    
    const lastUpdated = new Date(this.currentVersion.lastUpdated);
    const now = new Date();
    
    return (now.getTime() - lastUpdated.getTime()) > this.CACHE_TTL;
  }

  async refreshSchemas(): Promise<void> {
    try {
      console.log('🔄 Refreshing Azure Resource Manager schemas...');
      
      const availableSchemas = await this.getAvailableSchemaVersions();
      const latestSchemas = await this.fetchLatestSchemas(availableSchemas);
      
      const newVersion: SchemaVersion = {
        version: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        schemas: latestSchemas,
        resourceTypes: await this.parseAllResourceTypes(latestSchemas),
        apiVersions: await this.extractApiVersions(latestSchemas)
      };

      await this.saveSchemas(newVersion);
      this.currentVersion = newVersion;
      
      console.log(`✅ Schemas refreshed successfully - ${Object.keys(newVersion.resourceTypes).length} resource types loaded`);
    } catch (error) {
      console.error('❌ Failed to refresh schemas:', error);
    }
  }

  private async getAvailableSchemaVersions(): Promise<string[]> {
    try {
      const response = await fetch(this.GITHUB_API_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch schema directory: ${response.statusText}`);
      }
      
      const contents = await response.json();
      
      return contents
        .filter((item: any) => item.type === 'dir')
        .map((item: any) => item.name)
        .filter((name: string) => /^\d{4}-\d{2}-\d{2}(-preview)?$/.test(name))
        .sort()
        .reverse()
        .slice(0, 5); // Latest 5 versions
    } catch (error) {
      console.warn('Using fallback schema versions:', error);
      return [
        '2024-10-01-preview',
        '2024-07-01-preview', 
        '2024-04-01-preview',
        '2023-11-01-preview'
      ];
    }
  }

  private async fetchLatestSchemas(schemaVersions: string[]): Promise<Record<string, any>> {
    const schemas: Record<string, any> = {};
    const targetProviders = ['Microsoft.Graph', 'Microsoft.Authorization'];

    for (const version of schemaVersions) {
      for (const provider of targetProviders) {
        try {
          const schemaUrl = `${this.SCHEMA_BASE_URL}/${version}/${provider}.json`;
          const response = await fetch(schemaUrl);
          
          if (response.ok) {
            const schema = await response.json();
            schemas[`${provider}-${version}`] = schema;
            console.log(`✅ Loaded ${provider} schema for ${version}`);
            break; // Use first available version
          }
        } catch (error) {
          console.warn(`⚠️ Failed to fetch ${provider} for ${version}`);
        }
      }
    }

    // Add fallback Entra ID schemas
    if (!Object.keys(schemas).some(key => key.startsWith('Microsoft.Graph'))) {
      schemas['Microsoft.Graph-fallback'] = this.getFallbackEntraIdSchema();
    }

    return schemas;
  }

  private getFallbackEntraIdSchema(): any {
    return {
      resourceDefinitions: {
        'applications': {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Microsoft.Graph/applications'] },
            apiVersion: { type: 'string', enum: ['2023-05-01-preview', '2024-04-01-preview'] },
            name: { type: 'string' },
            properties: {
              type: 'object',
              properties: {
                displayName: { 
                  type: 'string', 
                  description: 'Application display name',
                  minLength: 1,
                  maxLength: 120 
                },
                signInAudience: {
                  type: 'string',
                  description: 'Supported account types',
                  enum: ['AzureADMyOrg', 'AzureADMultipleOrgs', 'AzureADandPersonalMicrosoftAccount'],
                  default: 'AzureADMyOrg'
                },
                web: {
                  type: 'object',
                  description: 'Web configuration',
                  properties: {
                    redirectUris: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Redirect URIs'
                    }
                  }
                }
              },
              required: ['displayName']
            }
          }
        },
        'groups': {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Microsoft.Graph/groups'] },
            apiVersion: { type: 'string', enum: ['2023-05-01-preview', '2024-04-01-preview'] },
            name: { type: 'string' },
            properties: {
              type: 'object',
              properties: {
                displayName: { 
                  type: 'string', 
                  description: 'Group display name',
                  minLength: 1,
                  maxLength: 256 
                },
                mailNickname: {
                  type: 'string',
                  description: 'Mail nickname',
                  pattern: '^[a-zA-Z0-9._-]+$'
                },
                securityEnabled: {
                  type: 'boolean',
                  description: 'Security group flag',
                  default: true
                },
                mailEnabled: {
                  type: 'boolean',
                  description: 'Mail enabled flag',
                  default: false
                }
              },
              required: ['displayName', 'mailNickname']
            }
          }
        }
      }
    };
  }

  // Additional helper methods for parsing schemas, extracting API versions, etc.
  // ... (continue with remaining implementation from our previous discussion)

  // Public API methods
  getResourceTypes(): Record<string, ResourceTypeDefinition> {
    return this.currentVersion?.resourceTypes || {};
  }

  getResourceTypeDefinition(resourceType: string): ResourceTypeDefinition | null {
    return this.currentVersion?.resourceTypes[resourceType] || null;
  }

  getAvailableApiVersions(resourceType: string): string[] {
    return this.currentVersion?.apiVersions[resourceType] || [];
  }

  getLatestApiVersion(resourceType: string): string {
    const versions = this.getAvailableApiVersions(resourceType);
    return versions.length > 0 ? versions[0] : '2024-04-01-preview';
  }

  searchResourceTypes(query: string): ResourceTypeDefinition[] {
    const allTypes = this.getResourceTypes();
    const results: ResourceTypeDefinition[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const [resourceType, definition] of Object.entries(allTypes)) {
      if (
        resourceType.toLowerCase().includes(lowerQuery) ||
        definition.description?.toLowerCase().includes(lowerQuery)
      ) {
        results.push(definition);
      }
    }
    
    return results;
  }

  async validateTemplate(template: any): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.resources) {
      errors.push('Template must contain a resources array');
      return { isValid: false, errors, warnings };
    }

    for (const resource of template.resources) {
      if (!resource.type) {
        errors.push('Resource must have a type');
        continue;
      }

      const resourceDef = this.getResourceTypeDefinition(resource.type);
      if (!resourceDef) {
        warnings.push(`Unknown resource type: ${resource.type}`);
        continue;
      }

      // Validate required properties
      for (const requiredProp of resourceDef.required) {
        if (!resource.properties || !resource.properties[requiredProp]) {
          errors.push(`Missing required property '${requiredProp}' for resource type '${resource.type}'`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}
```

## Phase 3: Azure MCP Server Implementation

### 3.1 Azure Resource Manager Service

Create `src/mcp/azure/server/AzureResourceManager.ts`:

```typescript
import { AuthenticationProvider } from '@azure/msal-electron';
import { Subscription, ResourceGroup, DeploymentResult } from '../../../types/azureMcp';

interface DeploymentValidationResult {
  isValid: boolean;
  details: string;
  errors?: string[];
}

export class AzureResourceManager {
  private authProvider: AuthenticationProvider;
  private baseUrl = 'https://management.azure.com';

  constructor(authProvider: AuthenticationProvider) {
    this.authProvider = authProvider;
  }

  async initialize(): Promise<void> {
    console.log('🔧 Initializing Azure Resource Manager...');
    try {
      await this.getAccessToken();
      console.log('✅ Azure Resource Manager authentication validated');
    } catch (error) {
      throw new Error(`Failed to authenticate with Azure: ${error.message}`);
    }
  }

  private async getAccessToken(): Promise<string> {
    const account = await this.authProvider.getActiveAccount();
    if (!account) {
      throw new Error('No active Azure account found');
    }

    const tokenRequest = {
      scopes: ['https://management.azure.com/.default'],
      account: account
    };

    const response = await this.authProvider.acquireTokenSilent(tokenRequest);
    return response.accessToken;
  }

  private async makeRequest(path: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async getSubscriptions(): Promise<Subscription[]> {
    const response = await this.makeRequest('/subscriptions?api-version=2020-01-01');
    return response.value.filter((sub: any) => sub.state === 'Enabled');
  }

  async getResourceGroups(subscriptionId: string): Promise<ResourceGroup[]> {
    const response = await this.makeRequest(
      `/subscriptions/${subscriptionId}/resourcegroups?api-version=2021-04-01`
    );
    return response.value;
  }

  async validateDeployment(
    subscriptionId: string,
    resourceGroupName: string,
    template: any,
    deploymentName?: string
  ): Promise<DeploymentValidationResult> {
    const deploymentNameToUse = deploymentName || `deployment-${Date.now()}`;
    
    const deploymentBody = {
      properties: {
        template,
        mode: 'Incremental',
        parameters: {}
      }
    };

    try {
      await this.makeRequest(
        `/subscriptions/${subscriptionId}/resourcegroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${deploymentNameToUse}/validate?api-version=2021-04-01`,
        {
          method: 'POST',
          body: JSON.stringify(deploymentBody)
        }
      );

      return {
        isValid: true,
        details: 'Template validation successful - no issues found'
      };
    } catch (error) {
      return {
        isValid: false,
        details: `Validation failed: ${error.message}`,
        errors: [error.message]
      };
    }
  }

  // Additional methods for deployment, resource group creation, etc.
  // ... (continue with remaining implementation)
}
```

### 3.2 Core Azure MCP Server

Create `src/mcp/azure/server/AzureMcpServer.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TemplateSchemaCache } from './TemplateSchemaCache.js';
import { AzureResourceManager } from './AzureResourceManager.js';
import { BicepTemplateGenerator } from './BicepTemplateGenerator.js';

export class AzureMcpServer {
  private server: Server;
  private schemaCache: TemplateSchemaCache;
  private resourceManager: AzureResourceManager;
  private templateGenerator: BicepTemplateGenerator;
  private authProvider: any;

  constructor(authProvider: any) {
    this.authProvider = authProvider;
    this.schemaCache = new TemplateSchemaCache();
    this.resourceManager = new AzureResourceManager(authProvider);
    this.templateGenerator = new BicepTemplateGenerator(this.schemaCache);
    
    this.server = new Server(
      { name: 'azure-mcp', version: '1.0.0' },
      { 
        capabilities: { 
          tools: {},
          prompts: {},
          resources: {} 
        } 
      }
    );
    
    this.setupHandlers();
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Azure MCP Server...');
    await this.schemaCache.initialize();
    await this.resourceManager.initialize();
    console.log('✅ Azure MCP Server initialized');
  }

  private setupHandlers(): void {
    this.setupToolHandlers();
    this.setupPromptHandlers();
    this.setupResourceHandlers();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_bicep_template',
          description: 'Generate Bicep template for Entra ID resources',
          inputSchema: {
            type: 'object',
            properties: {
              resourceType: { type: 'string', description: 'Resource type (e.g., Microsoft.Graph/applications)' },
              resourceName: { type: 'string', description: 'Resource name' },
              properties: { type: 'object', description: 'Resource properties' },
              subscriptionId: { type: 'string', description: 'Azure subscription ID (optional)' },
              resourceGroup: { type: 'string', description: 'Resource group name (optional)' }
            },
            required: ['resourceType', 'resourceName', 'properties']
          }
        },
        {
          name: 'validate_bicep_template',
          description: 'Validate Bicep template against schemas',
          inputSchema: {
            type: 'object',
            properties: {
              template: { type: 'object', description: 'Bicep template to validate' }
            },
            required: ['template']
          }
        },
        {
          name: 'deploy_bicep_template',
          description: 'Deploy Bicep template to Azure',
          inputSchema: {
            type: 'object',
            properties: {
              template: { type: 'object', description: 'Bicep template' },
              subscriptionId: { type: 'string', description: 'Azure subscription ID' },
              resourceGroup: { type: 'string', description: 'Resource group name' },
              deploymentName: { type: 'string', description: 'Deployment name (optional)' },
              dryRun: { type: 'boolean', description: 'Perform dry run only', default: true }
            },
            required: ['template', 'subscriptionId', 'resourceGroup']
          }
        },
        {
          name: 'list_azure_subscriptions',
          description: 'List available Azure subscriptions',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'list_resource_groups',
          description: 'List resource groups in subscription',
          inputSchema: {
            type: 'object',
            properties: {
              subscriptionId: { type: 'string', description: 'Azure subscription ID' }
            },
            required: ['subscriptionId']
          }
        },
        {
          name: 'search_resource_types',
          description: 'Search available Entra ID resource types',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
          }
        }
      ]
    }));

    // Handle tool calls with solicitation support
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'generate_bicep_template':
            return await this.handleGenerateTemplate(args);
          case 'validate_bicep_template':
            return await this.handleValidateTemplate(args);
          case 'deploy_bicep_template':
            return await this.handleDeployTemplate(args);
          case 'list_azure_subscriptions':
            return await this.handleListSubscriptions();
          case 'list_resource_groups':
            return await this.handleListResourceGroups(args);
          case 'search_resource_types':
            return await this.handleSearchResourceTypes(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  private setupPromptHandlers(): void {
    // List available prompts for solicitation
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'azure_subscription_selector',
          description: 'Select Azure subscription',
          arguments: []
        },
        {
          name: 'azure_resource_group_selector',
          description: 'Select resource group',
          arguments: [
            { name: 'subscription_id', description: 'Azure subscription ID', required: true }
          ]
        },
        {
          name: 'bicep_deployment_config',
          description: 'Configure Bicep deployment settings',
          arguments: [
            { name: 'operation_type', description: 'Operation type', required: true }
          ]
        }
      ]
    }));

    // Handle prompt requests (solicitation)
    this.server.setRequestHandler('prompts/get', async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'azure_subscription_selector':
          return await this.promptForSubscriptionSelection();
        case 'azure_resource_group_selector':
          return await this.promptForResourceGroupSelection(args?.subscription_id);
        case 'bicep_deployment_config':
          return await this.promptForDeploymentConfig(args?.operation_type);
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });
  }

  // Tool handler implementations with solicitation support
  private async handleGenerateTemplate(args: any) {
    const { resourceType, resourceName, properties, subscriptionId, resourceGroup } = args;

    // Check if we need configuration - trigger solicitation
    if (!subscriptionId || !resourceGroup) {
      return {
        content: [{
          type: 'text',
          text: '🔧 **Configuration Required**\n\nI need Azure configuration to generate your Bicep template. Let me query your available subscriptions...'
        }],
        isError: false,
        needsConfig: true
      };
    }

    const resourceDef = this.schemaCache.getResourceTypeDefinition(resourceType);
    if (!resourceDef) {
      const availableTypes = Object.keys(this.schemaCache.getResourceTypes()).slice(0, 10);
      return {
        content: [{
          type: 'text',
          text: `❌ Unknown resource type: \`${resourceType}\`\n\n**Available types:**\n${availableTypes.map(t => `- ${t}`).join('\n')}\n\n*Use search_resource_types to find more.*`
        }],
        isError: true
      };
    }

    const template = await this.templateGenerator.generateTemplate(resourceType, resourceName, properties, {
      subscriptionId,
      resourceGroup
    });

    const validation = await this.schemaCache.validateTemplate(template);

    let response = `🚀 **Generated Bicep Template**\n\n\`\`\`bicep\n${this.templateGenerator.templateToString(template)}\n\`\`\``;
    
    if (!validation.isValid) {
      response += `\n\n⚠️ **Validation Issues:**\n${validation.errors.map(e => `- ❌ ${e}`).join('\n')}`;
    }
    
    if (validation.warnings.length > 0) {
      response += `\n\n💡 **Suggestions:**\n${validation.warnings.map(w => `- ⚠️ ${w}`).join('\n')}`;
    }

    return {
      content: [{
        type: 'text',
        text: response
      }],
      isError: false
    };
  }

  // Solicitation prompt handlers
  private async promptForSubscriptionSelection() {
    try {
      const subscriptions = await this.resourceManager.getSubscriptions();
      
      if (subscriptions.length === 0) {
        return {
          description: 'No Azure subscriptions found',
          messages: [{
            role: 'assistant' as const,
            content: {
              type: 'text',
              text: '❌ No Azure subscriptions found. Please ensure you have proper access and try again.'
            }
          }]
        };
      }

      const subscriptionList = subscriptions.map((sub, index) => 
        `${index + 1}. **${sub.displayName}**\n   📋 ID: \`${sub.subscriptionId}\`\n   🏢 State: ${sub.state}`
      ).join('\n\n');

      return {
        description: 'Select Azure subscription',
        messages: [{
          role: 'assistant' as const,
          content: {
            type: 'text',
            text: `🔍 Found **${subscriptions.length}** Azure subscription(s):\n\n${subscriptionList}\n\nPlease reply with the **number** of the subscription you'd like to use.`
          }
        }]
      };
    } catch (error) {
      return {
        description: 'Error querying subscriptions',
        messages: [{
          role: 'assistant' as const,
          content: {
            type: 'text',
            text: `❌ Error retrieving subscriptions: ${error.message}`
          }
        }]
      };
    }
  }

  private async promptForResourceGroupSelection(subscriptionId: string) {
    try {
      const resourceGroups = await this.resourceManager.getResourceGroups(subscriptionId);
      
      if (resourceGroups.length === 0) {
        return {
          description: 'No resource groups found',
          messages: [{
            role: 'assistant' as const,
            content: {
              type: 'text',
              text: `ℹ️ No resource groups found in subscription.\n\nOptions:\n1. **new** - Create a new resource group\n2. **back** - Choose different subscription\n\nPlease reply with your choice.`
            }
          }]
        };
      }

      const rgList = resourceGroups.map((rg, index) => 
        `${index + 1}. **${rg.name}**\n   📍 Location: ${rg.location}`
      ).join('\n\n');

      return {
        description: 'Select resource group',
        messages: [{
          role: 'assistant' as const,
          content: {
            type: 'text',
            text: `🗂️ Found **${resourceGroups.length}** resource group(s):\n\n${rgList}\n\nOptions:\n- Reply with **number** to select\n- Reply "**new**" to create new\n- Reply "**back**" for different subscription`
          }
        }]
      };
    } catch (error) {
      return {
        description: 'Error querying resource groups',
        messages: [{
          role: 'assistant' as const,
          content: {
            type: 'text',
            text: `❌ Error retrieving resource groups: ${error.message}`
          }
        }]
      };
    }
  }

  // Additional methods...
  async connect(): Promise<void> {
    console.log('🔌 Azure MCP Server ready for connections');
  }

  async close(): Promise<void> {
    console.log('🔌 Azure MCP Server closing connections');
  }
}
```

## Phase 4: UI Integration & Settings

### 4.1 Azure MCP Settings Component

Create `src/renderer/components/Settings/AzureMcpSettings.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  TextField,
  Switch,
  Select,
  FormControl,
  InputLabel,
  MenuItem,
  Button,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress
} from '@mui/material';
import { AzureMcpConfig } from '../../../types/azureMcp';

interface AzureMcpSettingsProps {
  config: AzureMcpConfig;
  onConfigChange: (config: AzureMcpConfig) => void;
}

export const AzureMcpSettings: React.FC<AzureMcpSettingsProps> = ({
  config,
  onConfigChange
}) => {
  const [localConfig, setLocalConfig] = useState<AzureMcpConfig>(config);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'testing'>('disconnected');

  const updateConfig = (key: keyof AzureMcpConfig, value: any) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const testConnection = async () => {
    setConnectionStatus('testing');
    setIsLoading(true);
    
    try {
      const result = await window.electronAPI.invoke('azure-mcp:test-connection');
      setConnectionStatus(result.success ? 'connected' : 'disconnected');
    } catch (error) {
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSchemas = async () => {
    setIsLoading(true);
    try {
      await window.electronAPI.invoke('azure-mcp:refresh-schemas');
    } catch (error) {
      // Handle error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Azure MCP Configuration
        </Typography>

        {/* Connection Status */}
        <Box mb={3}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="subtitle2">Connection Status:</Typography>
            <Chip 
              label={connectionStatus} 
              color={connectionStatus === 'connected' ? 'success' : 'default'}
              size="small"
            />
            <Button 
              size="small" 
              onClick={testConnection}
              disabled={isLoading}
            >
              {isLoading ? <CircularProgress size={16} /> : 'Test Connection'}
            </Button>
          </Box>
        </Box>

        {/* Basic Configuration */}
        <Box mb={3}>
          <Typography variant="subtitle1" gutterBottom>Basic Settings</Typography>
          
          <TextField
            label="Default Subscription ID"
            value={localConfig.subscriptionId || ''}
            onChange={(e) => updateConfig('subscriptionId', e.target.value)}
            placeholder="Auto-detected from Azure CLI or manual entry"
            fullWidth
            margin="normal"
            helperText="Leave blank to select during operations"
          />

          <TextField
            label="Default Resource Group"
            value={localConfig.defaultResourceGroup || ''}
            onChange={(e) => updateConfig('defaultResourceGroup', e.target.value)}
            placeholder="rg-entraid-resources"
            fullWidth
            margin="normal"
            helperText="Leave blank to select during operations"
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Deployment Mode</InputLabel>
            <Select
              value={localConfig.deploymentMode}
              onChange={(e) => updateConfig('deploymentMode', e.target.value)}
            >
              <MenuItem value="Incremental">Incremental</MenuItem>
              <MenuItem value="Complete">Complete</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Safety Settings */}
        <Box mb={3}>
          <Typography variant="subtitle1" gutterBottom>Safety & Validation</Typography>
          
          <Box display="flex" flexDirection="column" gap={1}>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography>Auto-validate templates</Typography>
              <Switch
                checked={localConfig.autoValidateTemplates}
                onChange={(e) => updateConfig('autoValidateTemplates', e.target.checked)}
              />
            </Box>

            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography>Require confirmation for deployment</Typography>
              <Switch
                checked={localConfig.requireConfirmationForDeployment}
                onChange={(e) => updateConfig('requireConfirmationForDeployment', e.target.checked)}
              />
            </Box>

            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography>Enable dry-run by default</Typography>
              <Switch
                checked={localConfig.enableDryRunByDefault}
                onChange={(e) => updateConfig('enableDryRunByDefault', e.target.checked)}
              />
            </Box>
          </Box>
        </Box>

        {/* Schema Cache Management */}
        <Box mb={3}>
          <Typography variant="subtitle1" gutterBottom>Schema Cache</Typography>
          
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <Button 
              variant="outlined" 
              onClick={refreshSchemas}
              disabled={isLoading}
            >
              {isLoading ? <CircularProgress size={16} /> : 'Refresh Schemas'}
            </Button>
            <Typography variant="caption">
              Last updated: Auto-detected
            </Typography>
          </Box>

          <TextField
            label="Max Cache Size (MB)"
            type="number"
            value={localConfig.maxCacheSize}
            onChange={(e) => updateConfig('maxCacheSize', parseInt(e.target.value))}
            margin="normal"
            inputProps={{ min: 10, max: 1000 }}
          />

          <TextField
            label="Schema Update Interval (hours)"
            type="number"
            value={localConfig.schemaUpdateInterval}
            onChange={(e) => updateConfig('schemaUpdateInterval', parseInt(e.target.value))}
            margin="normal"
            inputProps={{ min: 1, max: 168 }}
          />
        </Box>

        {/* Template Settings */}
        <Box mb={3}>
          <Typography variant="subtitle1" gutterBottom>Template Settings</Typography>
          
          <TextField
            label="Template Output Path"
            value={localConfig.templateOutputPath}
            onChange={(e) => updateConfig('templateOutputPath', e.target.value)}
            fullWidth
            margin="normal"
            helperText="Local directory to save generated templates"
          />

          <TextField
            label="Bicep CLI Path"
            value={localConfig.bicepCliPath || ''}
            onChange={(e) => updateConfig('bicepCliPath', e.target.value)}
            placeholder="Auto-detected or specify path"
            fullWidth
            margin="normal"
            helperText="Path to Bicep CLI executable (leave blank for auto-detection)"
          />
        </Box>
      </CardContent>
    </Card>
  );
};
```

### 4.2 Integrate Settings into Main Settings Page

Update `src/renderer/components/Settings/Settings.tsx` to include Azure MCP settings:

```typescript
// Add import
import { AzureMcpSettings } from './AzureMcpSettings';

// Add to settings tabs/sections
const settingsTabs = [
  // ...existing tabs...
  {
    id: 'azure-mcp',
    label: 'Azure MCP',
    icon: <CloudIcon />,
    component: AzureMcpSettings
  }
];
```

## Phase 5: Chat Interface Integration

### 5.1 Configuration Handler for Solicitation

Create `src/renderer/utils/configurationHandler.ts`:

```typescript
interface ConfigurationState {
  step: 'subscription' | 'resourceGroup' | 'deployment' | 'complete';
  selectedSubscription?: {
    id: string;
    name: string;
  };
  selectedResourceGroup?: {
    name: string;
    location: string;
  };
  deploymentConfig?: {
    mode: string;
    parameters: Record<string, any>;
  };
}

export class ConfigurationHandler {
  private state: ConfigurationState = { step: 'subscription' };

  async handleUserSelection(input: string, mcpClient: any): Promise<string> {
    switch (this.state.step) {
      case 'subscription':
        return await this.handleSubscriptionSelection(input, mcpClient);
      case 'resourceGroup':
        return await this.handleResourceGroupSelection(input, mcpClient);
      case 'deployment':
        return await this.handleDeploymentConfig(input, mcpClient);
      default:
        return 'Configuration complete!';
    }
  }

  private async handleSubscriptionSelection(input: string, mcpClient: any): Promise<string> {
    const selection = parseInt(input.trim());
    
    if (isNaN(selection)) {
      return '❌ Please enter a valid number to select a subscription.';
    }

    // Store selection and move to next step
    this.state.selectedSubscription = {
      id: 'sub-id-from-selection',
      name: 'Sub Name'
    };
    this.state.step = 'resourceGroup';

    // Trigger resource group prompt
    const rgPrompt = await mcpClient.sendRequest('prompts/get', {
      name: 'azure_resource_group_selector',
      arguments: { subscription_id: this.state.selectedSubscription.id }
    });

    return `✅ Selected subscription: **${this.state.selectedSubscription.name}**\n\n${rgPrompt.messages[0].content.text}`;
  }

  private async handleResourceGroupSelection(input: string, mcpClient: any): Promise<string> {
    const trimmedInput = input.toLowerCase().trim();
    
    if (trimmedInput === 'new') {
      return await this.handleNewResourceGroupCreation();
    } else if (trimmedInput === 'back') {
      this.state.step = 'subscription';
      return 'Going back to subscription selection...';
    } else {
      const selection = parseInt(input.trim());
      if (isNaN(selection)) {
        return '❌ Please enter a valid number, "new", or "back".';
      }

      this.state.selectedResourceGroup = {
        name: 'rg-name-from-selection',
        location: 'eastus'
      };
      
      return `✅ Configuration complete!\n\n**Selected:**\n- Subscription: ${this.state.selectedSubscription?.name}\n- Resource Group: ${this.state.selectedResourceGroup.name}\n\n🚀 Ready to proceed with your Bicep operation!`;
    }
  }

  private async handleNewResourceGroupCreation(): Promise<string> {
    return `📝 **Creating New Resource Group**\n\nPlease provide:\n1. Resource group name (e.g., "rg-myapp-prod")\n2. Location (e.g., "eastus", "westus2")\n\nFormat: \`name,location\` (e.g., "rg-myapp-prod,eastus")`;
  }

  getConfiguration() {
    return {
      subscriptionId: this.state.selectedSubscription?.id,
      resourceGroup: this.state.selectedResourceGroup?.name,
      location: this.state.selectedResourceGroup?.location
    };
  }
}
```

### 5.2 Update Chat Interface to Handle MCP Solicitation

Update `src/renderer/components/Chat/ChatInterface.tsx`:

```typescript
// Add imports
import { ConfigurationHandler } from '../../utils/configurationHandler';

// Add state for configuration handling
const [configurationHandler, setConfigurationHandler] = useState<ConfigurationHandler | null>(null);
const [isConfiguring, setIsConfiguring] = useState(false);

// Handle MCP solicitation responses
const handleMcpSolicitation = async (promptName: string, args: any) => {
  try {
    const promptResponse = await mcpClient.sendRequest('prompts/get', {
      name: promptName,
      arguments: args
    });
    
    addMessage({
      role: 'assistant',
      content: promptResponse.messages.map((msg: any) => msg.content.text).join('\n\n'),
      timestamp: Date.now(),
      type: 'solicitation'
    });
    
    // Enable configuration mode
    setIsConfiguring(true);
    setConfigurationHandler(new ConfigurationHandler());
    
  } catch (error) {
    console.error('Error handling MCP solicitation:', error);
  }
};

// Handle user response during configuration
const handleConfigurationResponse = async (userInput: string) => {
  if (!configurationHandler) return;
  
  try {
    const response = await configurationHandler.handleUserSelection(userInput, mcpClient);
    
    addMessage({
      role: 'assistant',
      content: response,
      timestamp: Date.now()
    });
    
    // Check if configuration is complete
    if (response.includes('Configuration complete!')) {
      setIsConfiguring(false);
      const config = configurationHandler.getConfiguration();
      // Store config for subsequent operations
      setTemporaryConfig(config);
    }
    
  } catch (error) {
    console.error('Error handling configuration response:', error);
  }
};

// Update message submission to handle configuration mode
const handleSubmit = async (content: string) => {
  if (isConfiguring && configurationHandler) {
    await handleConfigurationResponse(content);
    return;
  }
  
  // Normal message handling...
};
```

## Phase 6: Testing & Validation

### 6.1 Unit Tests

Create `src/tests/unit/azure-mcp/TemplateSchemaCache.test.ts`:

```typescript
import { TemplateSchemaCache } from '../../../mcp/azure/server/TemplateSchemaCache';

describe('TemplateSchemaCache', () => {
  let schemaCache: TemplateSchemaCache;

  beforeEach(() => {
    schemaCache = new TemplateSchemaCache();
  });

  test('should initialize with fallback schemas', async () => {
    await schemaCache.initialize();
    const resourceTypes = schemaCache.getResourceTypes();
    
    expect(Object.keys(resourceTypes)).toContain('Microsoft.Graph/applications');
    expect(Object.keys(resourceTypes)).toContain('Microsoft.Graph/groups');
  });

  test('should validate templates correctly', async () => {
    await schemaCache.initialize();
    
    const validTemplate = {
      resources: [{
        type: 'Microsoft.Graph/applications',
        apiVersion: '2024-04-01-preview',
        name: 'testApp',
        properties: {
          displayName: 'Test Application'
        }
      }]
    };

    const validation = await schemaCache.validateTemplate(validTemplate);
    expect(validation.isValid).toBe(true);
  });

  test('should search resource types', async () => {
    await schemaCache.initialize();
    
    const results = schemaCache.searchResourceTypes('application');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toContain('applications');
  });
});
```

### 6.2 Integration Tests

Create `src/tests/integration/azure-mcp/AzureMcpServer.test.ts`:

```typescript
import { AzureMcpServer } from '../../../mcp/azure/server/AzureMcpServer';

describe('AzureMcpServer Integration', () => {
  let server: AzureMcpServer;
  let mockAuthProvider: any;

  beforeEach(() => {
    mockAuthProvider = {
      getActiveAccount: jest.fn().mockResolvedValue({ id: 'test-account' }),
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'test-token' })
    };
    
    server = new AzureMcpServer(mockAuthProvider);
  });

  test('should initialize successfully', async () => {
    await server.initialize();
    // Verify initialization
  });

  test('should handle generate_bicep_template tool', async () => {
    await server.initialize();
    
    const result = await server.handleGenerateTemplate({
      resourceType: 'Microsoft.Graph/applications',
      resourceName: 'testApp',
      properties: {
        displayName: 'Test Application'
      },
      subscriptionId: 'test-sub',
      resourceGroup: 'test-rg'
    });

    expect(result.content[0].text).toContain('Generated Bicep Template');
  });

  test('should trigger solicitation when config missing', async () => {
    await server.initialize();
    
    const result = await server.handleGenerateTemplate({
      resourceType: 'Microsoft.Graph/applications',
      resourceName: 'testApp',
      properties: {
        displayName: 'Test Application'
      }
      // Missing subscriptionId and resourceGroup
    });

    expect(result.content[0].text).toContain('Configuration Required');
    expect(result.needsConfig).toBe(true);
  });
});
```

### 6.3 E2E Tests

Create `src/tests/e2e/azure-mcp-workflow.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Azure MCP Workflow', () => {
  test('should complete full Bicep generation workflow', async ({ page }) => {
    // Navigate to chat interface
    await page.goto('/');
    
    // Send message to generate Bicep template
    await page.fill('[data-testid="chat-input"]', 'Generate a Bicep template for a new Entra ID application called "MyTestApp"');
    await page.click('[data-testid="send-button"]');
    
    // Should trigger subscription selection
    await expect(page.locator('text=Configuration Required')).toBeVisible();
    await expect(page.locator('text=Azure subscription')).toBeVisible();
    
    // Select subscription
    await page.fill('[data-testid="chat-input"]', '1');
    await page.click('[data-testid="send-button"]');
    
    // Should trigger resource group selection
    await expect(page.locator('text=resource group')).toBeVisible();
    
    // Select resource group
    await page.fill('[data-testid="chat-input"]', '1');
    await page.click('[data-testid="send-button"]');
    
    // Should generate Bicep template
    await expect(page.locator('text=Generated Bicep Template')).toBeVisible();
    await expect(page.locator('text=Microsoft.Graph/applications')).toBeVisible();
  });

  test('should validate templates in settings', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');
    
    // Go to Azure MCP tab
    await page.click('[data-testid="azure-mcp-tab"]');
    
    // Test connection
    await page.click('[data-testid="test-connection-button"]');
    await expect(page.locator('text=connected')).toBeVisible();
    
    // Refresh schemas
    await page.click('[data-testid="refresh-schemas-button"]');
    // Should not error
  });
});
```

## Phase 7: Documentation & Deployment

### 7.1 Main Process Integration

Update `src/main/index.ts` to register Azure MCP server:

```typescript
import { AzureMcpServer } from '../mcp/azure/server/AzureMcpServer';

// Initialize Azure MCP server
let azureMcpServer: AzureMcpServer;

app.whenReady().then(async () => {
  // ...existing initialization...
  
  // Initialize Azure MCP server
  const authProvider = getAuthProvider(); // Your existing auth provider
  azureMcpServer = new AzureMcpServer(authProvider);
  await azureMcpServer.initialize();
  
  // Register IPC handlers for Azure MCP
  ipcMain.handle('azure-mcp:test-connection', async () => {
    try {
      // Test connection logic
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('azure-mcp:refresh-schemas', async () => {
    await azureMcpServer.schemaCache.refreshSchemas();
  });
});
```

### 7.2 Update Build Configuration

Update `webpack.config.js` to include Azure MCP files:

```javascript
// Add Azure MCP to entry points or ensure it's included in the build
module.exports = {
  // ...existing config...
  resolve: {
    // ...existing resolve config...
    alias: {
      // ...existing aliases...
      '@azure-mcp': path.resolve(__dirname, 'src/mcp/azure')
    }
  }
};
```

### 7.3 Update Documentation

Update `README.md` to include Azure MCP features:

```markdown
## New Azure MCP Features

### Infrastructure as Code (IaC) for Entra ID
- Generate Bicep templates for Entra ID resources
- Deploy templates with validation and dry-run support
- Interactive configuration through chat interface

### Supported Resources
- Microsoft Entra ID Applications
- Security Groups
- Administrative Units
- (More resources as schemas become available)

### Getting Started with Azure MCP
1. Ensure you're authenticated with Azure
2. In chat, request: "Generate a Bicep template for a new application"
3. Follow the interactive prompts to select subscription and resource group
4. Review and deploy the generated template
```

## Benefits & Use Cases

### Organizational Benefits
1. **Automated Entra ID Provisioning**: Streamline creation of applications, groups, and roles
2. **Infrastructure as Code Adoption**: Enable IaC practices for identity resources
3. **Governance & Compliance**: Maintain audit trails and consistent configurations
4. **Developer Self-Service**: Allow developers to provision resources through natural language
5. **DevOps Integration**: Integrate with CI/CD pipelines for automated deployments

### Technical Benefits
1. **Schema Validation**: Real-time validation against Azure Resource Manager schemas
2. **Version Management**: Automatic updates to latest API versions and resource types
3. **Security**: Local operation with existing MSAL authentication
4. **Error Prevention**: Dry-run capabilities and validation before deployment
5. **Traceability**: Full trace visualization of operations in chat interface

### Use Cases
1. **Application Registration**: "Create an application registration for my web app with redirect URI https://myapp.com/callback"
2. **Security Group Management**: "Generate a security group for the finance team with mail enabled"
3. **Bulk Resource Creation**: "Create 5 applications for different environments (dev, test, staging, prod, demo)"
4. **Template Reuse**: Save and reuse Bicep templates for standard configurations
5. **Environment Provisioning**: Set up complete Entra ID configurations for new projects

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Ensure MSAL authentication is working
   - Verify Azure subscription access
   - Check Azure Resource Manager permissions

2. **Schema Cache Issues**
   - Manually refresh schemas in settings
   - Check internet connectivity
   - Verify GitHub API access

3. **Template Validation Failures**
   - Review required properties for resource type
   - Check API version compatibility
   - Validate property value constraints

4. **Deployment Errors**
   - Use dry-run mode first
   - Verify resource group exists
   - Check Azure permissions for deployment

### Debugging

Enable debug logging by setting environment variable:
```bash
DEBUG=azure-mcp:* npm start
```

Check logs in:
- Main process: Electron console
- Renderer process: DevTools console
- MCP operations: Azure MCP debug logs

## Conclusion

This comprehensive integration brings powerful Infrastructure as Code capabilities to EntraPulse Lite, enabling users to generate, validate, and deploy Bicep templates for Entra ID resources through natural language interaction. The implementation leverages existing authentication infrastructure while adding sophisticated schema management and interactive configuration capabilities through MCP solicitation.

The phased approach ensures proper testing and validation at each stage, while the modular architecture allows for future expansion to additional Azure resource types as they become available through Bicep template support.
