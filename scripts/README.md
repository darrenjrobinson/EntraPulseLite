# Development Scripts

This directory contains development utilities, debugging tools, and standalone test scripts for EntraPulse Lite.

## Release & Deployment Scripts

### Release Management
- **`create-release.ps1`** - Script to create and publish releases with proper tagging
- **`cleanup-release.ps1`** - Emergency cleanup tool for problematic tags and releases
- **`commit-version-update.ps1`** - Automated version update and commit script

### Build & Release
- **`generate-release-readme.js`** - Generate release documentation from templates

## Testing Scripts

### PowerShell Test Runners
- **`run-cloud-llm-test.ps1`** - PowerShell runner for cloud LLM integration tests
- **`run-query-extraction-test.ps1`** - PowerShell runner for query extraction tests  
- **`run-simple-test.ps1`** - Simple test runner for development

### Cloud LLM Testing
- **`test-cloud-llm-query.js`** - Standalone cloud LLM service testing with Anthropic
- **`simple-cloud-llm-test.js`** - Simplified cloud LLM testing utility

### Configuration Testing
- **`test-config-system.js`** - Standalone test for context-aware configuration system
- **`test-azure-openai-persistence.js`** - Test Azure OpenAI URL persistence in configuration
- **`test-simple-persistence.js`** - Simple logic test for configuration persistence without Electron dependencies

### MCP Integration Testing
- **`test-lokka-integration.js`** - Standalone Lokka MCP server integration test

### Permission Testing
- **`test-live-permissions.js`** - Live testing of Microsoft Graph permission fetching
- **`test-permission.ts`** - TypeScript permission testing utility
- **`node-fetch-permission.js`** - Node.js permission fetching utility

## Parser & Debugging Tools

### Parser Testing
- **`simple-parser-test.js`** - Simple JavaScript parser testing
- **`simple-parser-test.ts`** - Simple TypeScript parser testing  
- **`test-parser-simple.ts`** - Simplified TypeScript parser test

### Debug Utilities
- **`debug-parser.js`** - JSON parser debugging utility (main)
- **`debug-parser-2.js`** - Additional parser debugging utility
- **`debug-mcp-parser.js`** - MCP-specific parser debugging
- **`mcpResponseParser.js`** - MCP response parser utility

## Fetch & Network Utilities

- **`simple-fetch.js`** - Basic fetch utility for testing
- **`simple-browser-fetch.js`** - Browser-based fetch testing
- **`renderer-fetch-script.js`** - Renderer process fetch script

## Usage

These scripts are development utilities and are not part of the main application build. They can be run directly with Node.js or PowerShell:

```bash
# Run a JavaScript utility
node scripts/simple-fetch.js

# Run a TypeScript utility  
npx ts-node scripts/test-permission.ts

# Run a PowerShell script
./scripts/run-cloud-llm-test.ps1
```

## Note

Most of these scripts were originally in the root directory and have been moved here to keep the project root clean. For production testing, use the proper Jest test suite in `src/tests/`.
