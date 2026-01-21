# Testing Microsoft Enterprise MCP Integration

This document describes how to test the Microsoft Enterprise MCP integration in EntraPulseLite v1.1.0.

## Current Status: Ready for Basic Testing ✅

**Phases Completed:**
- ✅ Phase 1: Authentication & Admin Consent
- ✅ Phase 2: MCP Server Implementation
- ✅ Phase 3: Query Routing Logic
- ⏳ Phase 4: UI Configuration (pending)
- ⏳ Phase 5: Testing Suite (pending)

## What Can Be Tested Now

### 1. MCP Server Initialization ✅

Test that the Microsoft Enterprise MCP server can be created and initialized:

```bash
npx ts-node --project tsconfig.test.json src/tests/manual/test-microsoft-mcp-init.ts
```

**What this tests:**
- ✅ HTTP client creation
- ✅ Rate limiting status
- ✅ Server configuration
- ✅ MCP server initialization
- ✅ Tools listing (3 tools: suggest_queries, graph_get, list_properties)
- ✅ Ping/health check
- ✅ Query routing logic

**Expected Output:**
```
==================================================
   Microsoft Enterprise MCP - Initialization Test
==================================================

📦 Step 1: Creating HTTP Client...
✅ HTTP Client created successfully

⏱️  Step 2: Checking Rate Limit Status...
   Current requests: 0/100
   Reset time: [timestamp]
   Warning threshold: 80

...

✅ HTTP Client: Created successfully
✅ Rate Limiting: Working
✅ Server Config: Valid
✅ MCP Server: Initialized
✅ Tools List: Available
✅ Ping: Successful
```

### 2. MCP Scopes Definition ✅

Verify that MCP permission scopes are correctly defined:

```typescript
import { getPriorityMCPScopes, MCP_PERMISSION_TIERS } from './src/auth/MCPScopes';

// Get all priority scopes for initial setup
const scopes = getPriorityMCPScopes();
console.log(scopes);
// Output: ['MCP.AuditLog.Read.All', 'MCP.Directory.Read.All', ...]
```

### 3. Query Routing ✅

Test the intelligent query routing logic:

```typescript
import { MCPQueryRouter } from './src/mcp/routing/MCPQueryRouter';

const config = {
  lokkaEnabled: true,
  microsoftMcpEnabled: true
};

// General query - should route to Lokka
const decision1 = MCPQueryRouter.routeQuery(
  'Show me users in the Marketing group',
  config
);
console.log(decision1.server); // 'lokka'

// Enterprise query - should route to Microsoft MCP
const decision2 = MCPQueryRouter.routeQuery(
  'Show me sign-in failures in the last 7 days',
  config
);
console.log(decision2.server); // 'microsoft-enterprise'
```

## What Needs Authentication to Test

### 4. Real Microsoft MCP Queries ⏳

To test actual queries against Microsoft's MCP endpoint, you need:

**Prerequisites:**
1. **Admin Consent** - Grant MCP permissions using PowerShell:
   ```powershell
   Install-Module Microsoft.Entra.Beta -Force -AllowClobber
   Connect-Entra -Scopes 'Application.ReadWrite.All','Directory.Read.All','DelegatedPermissionGrant.ReadWrite.All'
   Grant-EntraBetaMCPServerPermission -ApplicationName 'EntraPulseLite'
   ```

2. **Valid Credentials** - Configure your Entra app:
   ```
   TENANT_ID=your-tenant-id
   CLIENT_ID=your-client-id
   ```

3. **Test Query Execution:**
   ```typescript
   import { MicrosoftEnterpriseMCPServer } from './src/mcp/servers/MicrosoftEnterpriseMCPServer';
   import { AuthService } from './src/auth/AuthService';

   // Initialize with real auth service
   const authService = new AuthService(config);
   await authService.login();

   const server = new MicrosoftEnterpriseMCPServer(serverConfig, authService);
   await server.startServer();

   // Test query suggestions
   const response = await server.handleRequest({
     method: 'microsoft_graph_suggest_queries',
     params: {
       user_query: 'Show me recent sign-in failures',
       top: 5
     }
   });

   console.log(response.suggestions);
   ```

## Testing Checklist

### Basic Tests (No Auth Required) ✅
- [x] HTTP client initialization
- [x] Rate limiting status check
- [x] Server configuration
- [x] MCP server creation
- [x] Tools listing
- [x] Ping/health check
- [x] Query routing logic
- [x] MCP scopes definition

### Authentication Tests (Requires Credentials) ⏳
- [ ] Admin consent flow
- [ ] Token acquisition with MCP scopes
- [ ] Token refresh on expiration
- [ ] Scope validation

### Integration Tests (Requires Auth + Consent) ⏳
- [ ] Query suggestions (RAG)
- [ ] Graph API queries via MCP
- [ ] Entity property listing
- [ ] Rate limit handling
- [ ] Error handling (401, 403, 429)
- [ ] Caching functionality

### End-to-End Tests (Full Flow) ⏳
- [ ] Lokka-only mode
- [ ] Microsoft MCP-only mode
- [ ] Auto-routing with both servers
- [ ] Fallback from Microsoft MCP to Lokka
- [ ] UI integration (once Phase 4 complete)

## Quick Test Commands

```bash
# Test basic initialization
npx ts-node --project tsconfig.test.json src/tests/manual/test-microsoft-mcp-init.ts

# Compile TypeScript (check for errors)
npm run build

# Run linting
npm run lint

# Run unit tests (once written)
npm run test:unit

# Run integration tests (once written)
npm run test:integration
```

## Troubleshooting

### Issue: "Module not found" errors
**Solution:** Ensure TypeScript is compiled:
```bash
npm run build
```

### Issue: "Authentication failed"
**Solution:** Check your credentials and ensure MCP scopes are granted:
```bash
# Verify scopes in Azure Portal
# Or re-run admin consent
```

### Issue: "Rate limit exceeded"
**Solution:** Wait for rate limit to reset (shown in rate limit status) or clear cache:
```typescript
client.clearCache();
```

## Next Steps

1. ✅ **Complete Phase 4** - UI Configuration
   - Add MCP settings panel in Settings.tsx
   - Add status indicator in Chat.tsx
   - Add admin consent wizard dialog

2. ✅ **Complete Phase 5** - Testing Suite
   - Write unit tests for routing logic
   - Write integration tests with mocked endpoints
   - Write E2E tests with real tenant

3. ✅ **Documentation**
   - User guide for admin consent
   - Query examples showcasing enterprise features
   - Troubleshooting guide

## Summary

**You currently have enough to test:**
1. ✅ Server initialization and configuration
2. ✅ Query routing logic (keyword-based classification)
3. ✅ Rate limiting functionality
4. ✅ MCP scopes definition
5. ✅ Basic request handling (ping, tools list)

**You CANNOT test yet (needs auth):**
1. ⏳ Actual Microsoft MCP queries
2. ⏳ Token acquisition and refresh
3. ⏳ Admin consent flow automation
4. ⏳ Real Graph API responses
5. ⏳ Cache effectiveness

**To enable full testing:** Run the admin consent PowerShell command and configure valid Entra credentials.
