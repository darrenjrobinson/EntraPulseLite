# Architecture Overview

## 🏗️ System Architecture

EntraPulse Lite is built as a modern Electron desktop application that bridges natural language queries with Microsoft Graph APIs through various LLM providers. The architecture emphasizes security, extensibility, and user experience.

## 📊 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                User Interface                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │   Chat Interface │  │ Settings Dialog │  │ User Profile    │                 │
│  │   - Message UI   │  │ - LLM Config   │  │ - Auth Status   │                 │
│  │   - Trace View   │  │ - Provider Mgmt │  │ - Permissions   │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │ IPC Communication
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Main Process                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Authentication  │  │ LLM Services    │  │ MCP Integration │                 │
│  │ - MSAL Auth     │  │ - Unified API   │  │ - Protocol Comm │                 │
│  │ - Token Mgmt    │  │ - Multi Provider│  │ - Server Mgmt   │                 │
│  │ - Progressive   │  │ - Query Process │  │ - Tool Execution│                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            External Services                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Microsoft Graph │  │ LLM Providers   │  │ Documentation   │                 │
│  │ - User Data     │  │ - Local Models  │  │ - MS Learn      │                 │
│  │ - Directory Info│  │ - Cloud APIs    │  │ - Permissions   │                 │
│  │ - Groups/Apps   │  │ - Model Discovery│  │ - Schema Info   │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🔧 Core Components

### 1. Authentication Layer

#### AuthService (`src/auth/AuthService.ts`)
**Purpose**: Manages Microsoft authentication using MSAL
**Key Features**:
- Progressive permission requests
- Secure token storage and refresh
- Multi-tenant support
- Client credentials and interactive flows

```typescript
interface AuthService {
  login(useRedirectFlow?: boolean): Promise<AuthToken>;
  getToken(): Promise<AuthToken | null>;
  requestPermissions(permissions: string[]): Promise<AuthToken | null>;
  getCurrentUser(): Promise<User | null>;
}
```

**Progressive Permission Model**:
```typescript
const PERMISSION_TIERS = {
  BASIC: ['User.Read'],
  USER_MANAGEMENT: ['User.Read', 'User.ReadBasic.All'],
  DIRECTORY_READ: ['User.Read', 'User.ReadBasic.All', 'Directory.Read.All'],
  GROUP_MANAGEMENT: ['User.Read', 'User.ReadBasic.All', 'Directory.Read.All', 'Group.Read.All'],
  APPLICATION_READ: ['User.Read', 'User.ReadBasic.All', 'Directory.Read.All', 'Group.Read.All', 'Application.Read.All'],
};
```

### 2. LLM Integration Layer

#### UnifiedLLMService (`src/llm/UnifiedLLMService.ts`)
**Purpose**: Provider-agnostic interface for all LLM interactions
**Key Features**:
- Seamless switching between local and cloud providers
- Query extraction and execution
- Response processing and validation
- Anti-hallucination measures

```typescript
interface UnifiedLLMService {
  chat(messages: ChatMessage[]): Promise<string>;
  isProviderAvailable(provider: string): Promise<boolean>;
  getAvailableModels(provider: string): Promise<string[]>;
  processQueriesInResponse(response: string): Promise<string>;
}
```

#### Local LLM Providers

**Ollama Integration**:
- REST API communication
- Model discovery and management
- Local inference for privacy
- Docker container support

**LM Studio Integration**:
- OpenAI-compatible API
- Local model serving
- GPU acceleration support

#### Cloud LLM Providers

**OpenAI Integration**:
```typescript
async chatWithOpenAI(messages: any[], config: CloudLLMProviderConfig): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: this.formatMessagesForOpenAI(messages),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  });
}
```

**Anthropic Integration**:
```typescript
async chatWithAnthropic(messages: any[], config: CloudLLMProviderConfig): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: this.formatMessagesForAnthropic(messages),
      system: this.getSystemPrompt(),
      max_tokens: config.maxTokens,
    }),
  });
}
```

**Google Gemini Integration**:
```typescript
async chatWithGemini(messages: any[], config: CloudLLMProviderConfig): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: this.getSystemPrompt() }] },
      contents: this.formatMessagesForGemini(messages),
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
    }),
  });
}
```

### 3. MCP Integration Layer

#### Model Context Protocol (MCP)
**Purpose**: Standardized protocol for connecting LLMs to data sources
**Architecture**: Client-server model with built-in servers

#### MCPClient (`src/mcp/MCPClient.ts`)
**Purpose**: Protocol communication and server management
```typescript
interface MCPClient {
  connect(serverConfig: MCPServerConfig): Promise<void>;
  callTool(serverName: string, toolName: string, args: any): Promise<any>;
  listTools(serverName: string): Promise<MCPTool[]>;
  disconnect(serverName: string): Promise<void>;
}
```

#### LokkaMCPServer (`src/mcp/servers/LokkaMCPServer.ts`)
**Purpose**: Microsoft Graph API access through MCP
**Tools Available**:
- `microsoft_graph_query`: Execute Graph API queries
- `get_user_info`: Retrieve user information
- `list_groups`: List user groups
- `get_applications`: Retrieve application data

```typescript
async handleMicrosoftGraphQuery(args: {
  endpoint: string;
  method: string;
  params?: any;
}): Promise<any> {
  const token = await this.authService.getToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0${args.endpoint}`, {
    method: args.method,
    headers: {
      'Authorization': `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: args.method !== 'GET' ? JSON.stringify(args.params) : undefined,
  });
  return response.json();
}
```

#### FetchMCPServer (`src/mcp/servers/FetchMCPServer.ts`)
**Purpose**: General web documentation and schema access
**Tools Available**:
- `fetch`: General web content retrieval
- `fetch_documentation`: General documentation access
- `fetch_graph_schema`: Graph API schema

#### MicrosoftDocsMCPServer (`src/mcp/clients/MicrosoftDocsMCPClient.ts`)
**Purpose**: Microsoft-specific documentation and official content access
**Features**:
- Dedicated Microsoft Learn documentation access
- Official Microsoft product documentation
- Microsoft Graph API documentation
- Prioritized for all Microsoft-related queries
**Tools Available**:
- `search_docs`: Search Microsoft Learn and official documentation
- `get_article`: Retrieve specific Microsoft documentation articles

### 4. Configuration Management

#### Context-Aware Configuration
**Purpose**: Secure, multi-user configuration management
**Features**:
- Application-level configuration (admin mode)
- User-specific configuration (interactive mode)
- Encrypted storage with electron-store
- Model caching with TTL

```typescript
interface ConfigManager {
  // Application-level config (client credentials)
  getApplicationConfig(): Promise<AppConfig>;
  setApplicationConfig(config: AppConfig): Promise<void>;
  
  // User-specific config (interactive auth)
  getUserConfig(userId: string): Promise<UserConfig>;
  setUserConfig(userId: string, config: UserConfig): Promise<void>;
  
  // Cloud provider management
  saveCloudProviderConfig(provider: string, config: CloudLLMProviderConfig): Promise<void>;
  getCloudProviderConfig(provider: string): Promise<CloudLLMProviderConfig | null>;
}
```

### 5. User Interface Layer

#### React Component Architecture
```
App.tsx
├── AuthProvider
│   └── ChatProvider
│       ├── ChatComponent
│       │   ├── MessageList
│       │   ├── MessageInput
│       │   └── TraceVisualization
│       ├── SettingsDialog
│       │   ├── LLMConfigCard
│       │   ├── CloudProviderCard
│       │   └── PermissionManagement
│       └── UserProfileDropdown
│           ├── ProfileSummary
│           └── DetailedInfoDialog
```

#### State Management
- **React Context**: Authentication state
- **Local State**: Component-specific state
- **Electron Store**: Persistent configuration
- **IPC Communication**: Main-renderer data flow

## 🔄 Data Flow Architecture

### Query Processing Flow

```
1. User Input
   ↓
2. Chat Component
   ↓ (IPC: llm:chat)
3. Main Process → UnifiedLLMService
   ↓
4. LLM Provider (Local/Cloud)
   ↓ (Response with <execute_query> tags)
5. Query Extraction
   ↓
6. MCP Server Execution
   ↓ (Microsoft Graph API call)
7. Result Integration
   ↓
8. Final Response
   ↓ (IPC response)
9. UI Update
```

### Authentication Flow

```
1. User Login Attempt
   ↓ (IPC: auth:login)
2. AuthService → MSAL
   ↓
3. Microsoft OAuth Flow
   ↓
4. Token Acquisition
   ↓
5. Permission Validation
   ↓
6. Progressive Permission Request (if needed)
   ↓
7. User Profile Fetch
   ↓ (IPC response)
8. UI State Update
```

## 🔒 Security Architecture

### Multi-Layer Security

1. **Electron Security**:
   - Node.js integration disabled in renderer
   - Context isolation enabled
   - Preload script for secure IPC
   - Content Security Policy (CSP)

2. **Authentication Security**:
   - MSAL for OAuth 2.0/OpenID Connect
   - Secure token storage with encryption
   - Automatic token refresh
   - Permission scope validation

3. **API Security**:
   - HTTPS-only communications
   - Input validation and sanitization
   - Rate limiting for external APIs
   - Error handling without information leakage

4. **Data Security**:
   - Encrypted configuration storage
   - No sensitive data in logs
   - Memory-safe operations
   - Secure IPC message validation

### Permission Model

```typescript
interface PermissionTier {
  name: string;
  permissions: string[];
  description: string;
  requiresAdminConsent: boolean;
}

const PERMISSION_TIERS: PermissionTier[] = [
  {
    name: 'BASIC',
    permissions: ['User.Read'],
    description: 'Read your profile',
    requiresAdminConsent: false,
  },
  {
    name: 'USER_MANAGEMENT', 
    permissions: ['User.Read', 'User.ReadBasic.All'],
    description: 'Read basic user information',
    requiresAdminConsent: true,
  },
  // ... additional tiers
];
```

## 📈 Performance Architecture

### Optimization Strategies

1. **Lazy Loading**:
   - Components loaded on demand
   - Models cached with TTL
   - Incremental data fetching

2. **Caching**:
   - LLM model lists cached for 24 hours
   - Authentication tokens cached securely
   - Graph API responses cached when appropriate

3. **Async Operations**:
   - Non-blocking IPC communication
   - Background model loading
   - Streaming responses for large datasets

4. **Memory Management**:
   - Proper cleanup of event listeners
   - Garbage collection optimization
   - Efficient state management

## 🧪 Testing Architecture

### Test Strategy
```
├── Unit Tests (90%+ coverage target)
│   ├── Individual component testing
│   ├── Service logic validation
│   └── Pure function testing
├── Integration Tests (80%+ coverage target)
│   ├── Service integration
│   ├── API integration
│   └── Authentication flows
└── End-to-End Tests (Critical paths)
    ├── Complete user workflows
    ├── Cross-platform validation
    └── Performance testing
```

### Test Infrastructure
- **Jest**: Testing framework
- **React Testing Library**: Component testing
- **MSW**: API mocking
- **Electron-mock**: Electron API mocking

## 🔄 Extension Points

### Adding New LLM Providers
1. Extend `LLMConfig` interface
2. Implement provider logic in `CloudLLMService`
3. Add UI configuration components
4. Create comprehensive tests

### Adding New MCP Servers
1. Implement `MCPServer` interface
2. Register with `MCPServerManager`
3. Add authentication if required
4. Create tool documentation

### Adding New Features
1. Design component architecture
2. Implement backend services
3. Create React components
4. Add comprehensive testing
5. Update documentation

## 📊 Monitoring and Diagnostics

### Built-in Diagnostics
```typescript
interface DiagnosticAPI {
  checkMCPServerHealth(): Promise<ServerHealthStatus[]>;
  debugMCP(): Promise<MCPDebugInfo>;
  getAuthenticationInfo(): Promise<AuthenticationInfo>;
  validateConfiguration(): Promise<ConfigValidationResult>;
}
```

### Performance Monitoring
- Response time tracking
- Memory usage monitoring
- Error rate tracking
- User interaction analytics

## 🚀 Deployment Architecture

### Build Pipeline
```
Source Code
↓ (TypeScript compilation)
JavaScript
↓ (Webpack bundling)
Optimized Bundles
↓ (Electron packaging)
Platform-specific Packages
↓ (Code signing)
Signed Executables
↓ (Distribution)
End Users
```

### Distribution Targets
- **Windows**: NSIS installer, Portable executable
- **macOS**: DMG, Apple Store package
- **Linux**: AppImage, Debian package, Snap package

This architecture provides a solid foundation for a secure, scalable, and maintainable desktop application that bridges natural language interfaces with enterprise Microsoft Graph data.
