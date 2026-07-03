// MCPServerFactory.ts
// Factory for creating MCP server instances

import { MCPServerConfig } from '../types';
import { FetchMCPServer } from './fetch';
import { ExternalLokkaMCPStdioServer } from './lokka/ExternalLokkaMCPStdioServer';
import { PolyarchyMCPServer } from './polyarchy/PolyarchyMCPServer';
import { MicrosoftEnterpriseMCPServer } from './MicrosoftEnterpriseMCPServer';
import { MCPAuthService } from '../auth/MCPAuthService';
import { ConfigService } from '../../shared/ConfigService';
import { AuthService } from '../../auth/AuthService';

export interface MCPServerHandlers {
  handleRequest: (request: any) => Promise<any>;
  startServer?: () => Promise<void>;
  stopServer?: () => Promise<void>;
}

export class MCPServerFactory {
  static createServer(
    config: MCPServerConfig,
    authService?: MCPAuthService,
    configService?: ConfigService,
    mainAuthService?: AuthService
  ): MCPServerHandlers {
    switch (config.type) {
      case 'fetch':
        return new FetchMCPServer(config);

      case 'external-lokka':
        if (!authService) {
          throw new Error('Auth service is required for external lokka MCP server');
        }
        if (!configService) {
          throw new Error('Config service is required for external lokka MCP server');
        }
        return new ExternalLokkaMCPStdioServer(config, authService, configService);

      case 'entrapulse-polyarchy':
        if (!authService) {
          throw new Error('Auth service is required for the Polyarchy MCP server');
        }
        if (!configService) {
          throw new Error('Config service is required for the Polyarchy MCP server');
        }
        return new PolyarchyMCPServer(config, authService, configService);

      case 'microsoft-enterprise':
        if (!mainAuthService) {
          console.warn('[MCPServerFactory] Main auth service not provided for microsoft-enterprise, server will initialize without token');
        }
        return new MicrosoftEnterpriseMCPServer(config, mainAuthService);

      default:
        throw new Error(`Unsupported MCP server type: ${config.type}`);
    }
  }
}
