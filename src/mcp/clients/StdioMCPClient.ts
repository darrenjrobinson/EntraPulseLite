// StdioMCPClient.ts
// MCP Client that communicates with external MCP servers via stdio (JSON-RPC)

import { spawn, ChildProcess } from 'child_process';
import { MCPServerConfig } from '../types';

export interface MCPJSONRPCRequest {
  id: string | number;
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface MCPJSONRPCResponse {
  id: string | number;
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

export class StdioMCPClient {
  private process: ChildProcess | null = null;
  private messageId = 1;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();
  private initialized = false;
  private config: MCPServerConfig;
  private outputBuffer = '';

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.process) {
      console.log('MCP client already started');
      return;
    }    console.log(`Starting MCP server: ${this.config.command} ${this.config.args?.join(' ')}`);
    
    const env = {
      ...process.env,
      ...this.config.env
    };

    // CRITICAL DEBUG: Log the environment variables for any MCP process
    console.log('🚨 CRITICAL DEBUG: Environment variables being passed to MCP process:');
    console.log(`🚨 Config name: ${this.config.name}`);
    console.log(`🚨 Config.env:`, this.config.env);
    console.log(`🚨 USE_CLIENT_TOKEN in process.env: ${process.env.USE_CLIENT_TOKEN}`);
    console.log(`🚨 USE_CLIENT_TOKEN in config.env: ${this.config.env?.USE_CLIENT_TOKEN}`);
    console.log(`🚨 USE_CLIENT_TOKEN in merged env: ${env.USE_CLIENT_TOKEN}`);
    console.log(`🚨 Config env keys: ${Object.keys(this.config.env || {})}`);
    console.log(`🚨 Merged env keys count: ${Object.keys(env).length}`);
    
    // Extra debug for Lokka specifically
    if (this.config.name?.includes('lokka') || this.config.command?.includes('lokka')) {
      console.log('🔥 LOKKA SPECIFIC DEBUG:');
      console.log('🔥 Raw config.env passed from main:', JSON.stringify(this.config.env, null, 2));
      console.log('🔥 TENANT_ID:', env.TENANT_ID ? `SET (${env.TENANT_ID})` : 'NOT SET');
      console.log('🔥 CLIENT_ID:', env.CLIENT_ID ? `SET (${env.CLIENT_ID})` : 'NOT SET');
      console.log('🔥 CLIENT_SECRET:', env.CLIENT_SECRET ? 'SET (length: ' + env.CLIENT_SECRET.length + ')' : 'NOT SET');
      console.log('🔥 ACCESS_TOKEN:', env.ACCESS_TOKEN ? `SET (${env.ACCESS_TOKEN.substring(0, 20)}...)` : 'NOT SET');
      console.log('🔥 USE_CLIENT_TOKEN:', env.USE_CLIENT_TOKEN);
      console.log('🔥 USE_INTERACTIVE:', env.USE_INTERACTIVE);
      console.log('🔥 DEBUG_ENTRAPULSE:', env.DEBUG_ENTRAPULSE);
      console.log('🔥 NODE_ENV:', env.NODE_ENV);
      console.log('🔥 All relevant env vars being passed to Lokka process:', Object.keys(env).filter(key => 
        ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'ACCESS_TOKEN', 'USE_CLIENT_TOKEN', 'USE_INTERACTIVE', 'DEBUG_ENTRAPULSE', 'NODE_ENV'].includes(key)
      ).reduce((obj, key) => ({ ...obj, [key]: env[key] }), {}));
    }

    this.process = spawn(this.config.command!, this.config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env,
      shell: true
    });

    if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
      throw new Error('Failed to create stdio pipes for MCP server');
    }

    // Handle stdout (responses from MCP server)
    this.process.stdout.on('data', (data) => {
      this.handleStdout(data);
    });    // Handle stderr (logging from MCP server)
    this.process.stderr.on('data', (data) => {
      const stderrOutput = data.toString().trim();
      console.log(`[MCP ${this.config.name} stderr]:`, stderrOutput);
      
      // Special logging for Lokka to see if it's recognizing the environment variables
      if (this.config.name?.includes('lokka') && stderrOutput) {
        console.log('🔥 LOKKA STDERR DETAILS:', stderrOutput);
        
        // Check for specific messages about authentication mode or token recognition
        if (stderrOutput.includes('Client') || 
            stderrOutput.includes('token') || 
            stderrOutput.includes('auth') ||
            stderrOutput.includes('environment') ||
            stderrOutput.includes('TENANT_ID') ||
            stderrOutput.includes('CLIENT_ID') ||
            stderrOutput.includes('ACCESS_TOKEN')) {
          console.log('🚨 LOKKA AUTHENTICATION/ENVIRONMENT MESSAGE DETECTED:', stderrOutput);
        }
      }
    });

    // Handle process exit
    this.process.on('exit', (code) => {
      console.log(`MCP server ${this.config.name} exited with code ${code}`);
      this.process = null;
      this.initialized = false;
    });

    // Wait a moment for the process to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Initialize the MCP connection
    await this.initialize();
  }

  private handleStdout(data: Buffer): void {
    this.outputBuffer += data.toString();
    
    // Process complete JSON-RPC messages (one per line)
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response: MCPJSONRPCResponse = JSON.parse(line.trim());
          this.handleResponse(response);
        } catch (error) {
          console.log(`[MCP ${this.config.name} stdout]:`, line.trim());
        }
      }
    }
  }

  private handleResponse(response: MCPJSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      if (response.error) {
        pending.reject(new Error(`MCP Error: ${response.error.message}`));
      } else {
        pending.resolve(response.result);
      }
    } else {
      console.log(`[MCP ${this.config.name}] Received response for unknown request ID:`, response.id);
    }
  }

  private async sendRequest<T = any>(method: string, params?: any): Promise<T> {
    if (!this.process || !this.process.stdin) {
      throw new Error('MCP client not started');
    }

    const id = this.messageId++;
    const request: MCPJSONRPCRequest = {
      id,
      jsonrpc: '2.0',
      method,
      params
    };

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      const requestLine = JSON.stringify(request) + '\n';
      console.log(`[MCP ${this.config.name} request]:`, requestLine.trim());
      
      this.process!.stdin!.write(requestLine, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Set timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout for method: ${method}`));
        }
      }, 30000); // 30 second timeout
    });
  }

  private async initialize(): Promise<MCPInitializeResult> {
    if (this.initialized) {
      throw new Error('MCP client already initialized');
    }

    console.log(`Initializing MCP connection to ${this.config.name}...`);
    
    const result = await this.sendRequest<MCPInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'EntraPulseLite',
        version: '1.0.0'
      }
    });

    console.log(`MCP server ${this.config.name} initialized:`, result);
    this.initialized = true;
    
    // Send initialized notification
    await this.sendNotification('notifications/initialized');
    
    return result;
  }

  private async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('MCP client not started');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    const notificationLine = JSON.stringify(notification) + '\n';
    console.log(`[MCP ${this.config.name} notification]:`, notificationLine.trim());
    
    this.process.stdin.write(notificationLine);
  }

  async listTools(): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    const result = await this.sendRequest('tools/list');
    return result.tools || [];
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    console.log(`Calling MCP tool ${name} with arguments:`, arguments_);
    
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: arguments_
    });
    
    console.log(`MCP tool ${name} result:`, result);
    return result;
  }

  async stop(): Promise<void> {
    if (this.process) {
      console.log(`Stopping MCP server ${this.config.name}...`);
      this.process.kill();
      this.process = null;
      this.initialized = false;
      this.pendingRequests.clear();
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export for module compatibility
export default StdioMCPClient;
