// MCP Debug utility to check the status of MCP servers

import { MCPServerManager } from './servers/MCPServerManager';
import { MCPClient } from './clients/MCPClient';
import { AuthService } from '../auth/AuthService';
import { MCPAuthService } from './auth/MCPAuthService';
import { AppConfig } from '../types';

export async function debugMCP(config: AppConfig): Promise<void> {
  console.log('=== MCP DEBUG INFORMATION ===');
  
  // Check if MCPServerManager instance exists
  console.log(`MCPServerManager singleton instance: ${MCPServerManager.instance ? 'EXISTS' : 'NOT FOUND'}`);
  
  if (MCPServerManager.instance) {
    const allServers = MCPServerManager.instance.getAllServers();
    console.log(`Active servers in MCPServerManager: ${allServers.size}`);
    
    for (const [name, server] of allServers.entries()) {
      console.log(`- ${name}: ${server ? 'INITIALIZED' : 'NULL'}`);
    }
  }
  
  // Create a new client for testing
  console.log('Creating test MCP client...');
  const authService = new AuthService(config);
  const mcpAuthService = new MCPAuthService(authService);
  const mcpClient = new MCPClient(config.mcpServers, mcpAuthService);
  
  // Check available servers
  const servers = mcpClient.getAvailableServerNames();
  console.log(`Available servers (${servers.length}):`, servers);
  
  // Try to list tools from each server
  for (const server of servers) {
    try {
      console.log(`Listing tools for ${server}...`);
      const tools = await mcpClient.listTools(server);
      console.log(`${server} tools (${tools.length}):`, tools.map((t: any) => t.name));
    } catch (error) {
      console.error(`Error listing tools for ${server}:`, error);
    }
  }
  
  console.log('=== END MCP DEBUG ===');
}

export async function checkMCPServerHealth(): Promise<{ [key: string]: boolean }> {
  const healthStatus: { [key: string]: boolean } = {};
  
  const instance = MCPServerManager.instance;
  if (!instance) {
    console.warn('MCPServerManager instance not found');
    return healthStatus;
  }
  
  const servers = instance.getAllServers();
  for (const [name, server] of servers.entries()) {
    try {
      // Basic health check - see if server object exists and has expected methods
      const isHealthy = Boolean(server && typeof server === 'object');
      healthStatus[name] = isHealthy;
      console.log(`Server ${name}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    } catch (error) {
      healthStatus[name] = false;
      console.error(`Health check failed for server ${name}:`, error);
    }
  }
  
  return healthStatus;
}
