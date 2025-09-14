import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

interface LokkaMCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

interface LokkaMCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: any;
}

/**
 * Managed Lokka MCP Client that runs Lokka in a persistent process
 * with guaranteed environment variable access
 */
export class ManagedLokkaMCPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private initialized: boolean = false;
  private requestId: number = 1;
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private initializationPromise: Promise<void> | null = null;
  private stdoutBuffer: string = '';
  private stderrBuffer: string = '';

  constructor(private environment: Record<string, string>) {
    super();
    console.log('[ManagedLokkaMCP] Creating managed Lokka client with environment:', {
      hasClientId: !!environment.CLIENT_ID,
      hasTenantId: !!environment.TENANT_ID,
      hasAccessToken: !!environment.ACCESS_TOKEN,
      useClientToken: environment.USE_CLIENT_TOKEN,
      envVarCount: Object.keys(environment).length
    });
  }

  /**
   * Start the managed Lokka process
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[ManagedLokkaMCP] Process already running');
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doStart();
    return this.initializationPromise;
  }

  private async doStart(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[ManagedLokkaMCP] Starting Lokka process...');

      // Create a temporary directory for this process
      const tempDir = path.join(process.cwd(), 'temp-lokka-' + Date.now());
      
      try {
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Merge current environment with Lokka-specific variables
        const processEnv: Record<string, string> = {
          ...process.env as Record<string, string>,
          ...this.environment,
          // Ensure Node.js can find modules
          NODE_PATH: process.env.NODE_PATH || '',
          // Set working directory
          PWD: tempDir,
          // Disable npm update checks for faster startup
          NPM_CONFIG_UPDATE_NOTIFIER: 'false'
        };

        console.log('[ManagedLokkaMCP] Environment prepared:', {
          hasClientId: !!processEnv['CLIENT_ID'],
          hasTenantId: !!processEnv['TENANT_ID'],
          hasAccessToken: !!processEnv['ACCESS_TOKEN'],
          useClientToken: processEnv['USE_CLIENT_TOKEN'],
          workingDir: tempDir
        });

        // Spawn the Lokka process with proper environment
        this.process = spawn('npx', ['-y', '@merill/lokka'], {
          cwd: tempDir,
          env: processEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
          windowsHide: true
        });

        if (!this.process || !this.process.stdout || !this.process.stderr || !this.process.stdin) {
          throw new Error('Failed to create process streams');
        }

        // Handle process startup
        this.process.on('spawn', () => {
          console.log('[ManagedLokkaMCP] ✅ Process spawned successfully');
          this.isRunning = true;
        });

        // Handle process errors
        this.process.on('error', (error) => {
          console.error('[ManagedLokkaMCP] ❌ Process error:', error);
          this.isRunning = false;
          this.emit('error', error);
          reject(error);
        });

        // Handle process exit
        this.process.on('exit', (code, signal) => {
          console.log('[ManagedLokkaMCP] Process exited:', { code, signal });
          this.isRunning = false;
          this.emit('exit', code, signal);
          
          // Clean up temp directory
          try {
            if (fs.existsSync(tempDir)) {
              fs.rmSync(tempDir, { recursive: true, force: true });
            }
          } catch (cleanupError) {
            console.warn('[ManagedLokkaMCP] Failed to clean up temp directory:', cleanupError);
          }
        });

        // Handle stdout data
        this.process.stdout.on('data', (data) => {
          this.handleStdoutData(data);
        });

        // Handle stderr data
        this.process.stderr.on('data', (data) => {
          this.handleStderrData(data);
        });

        // Wait for initialization or timeout
        const initTimeout = setTimeout(() => {
          reject(new Error('Lokka initialization timeout'));
        }, 30000); // 30 second timeout

        // Try to initialize with a simple request
        setTimeout(async () => {
          try {
            console.log('[ManagedLokkaMCP] Attempting to initialize with ping...');
            await this.sendRequest('initialize', {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: {
                name: 'EntraPulseLite',
                version: '1.0.1'
              }
            });
            
            clearTimeout(initTimeout);
            console.log('[ManagedLokkaMCP] ✅ Initialization successful');
            this.initialized = true;
            
            // List available tools for debugging
            try {
              const toolsResponse = await this.sendRequest('tools/list', {});
              console.log('[ManagedLokkaMCP] 🛠️ Available tools:', JSON.stringify(toolsResponse, null, 2));
            } catch (toolsError) {
              console.log('[ManagedLokkaMCP] ⚠️ Could not list tools:', toolsError);
            }
            
            resolve();
          } catch (initError) {
            clearTimeout(initTimeout);
            console.error('[ManagedLokkaMCP] ❌ Initialization failed:', initError);
            reject(initError);
          }
        }, 2000); // Wait 2 seconds for process to start

      } catch (error) {
        console.error('[ManagedLokkaMCP] Failed to start process:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle stdout data from Lokka process
   */
  private handleStdoutData(data: Buffer): void {
    const text = data.toString();
    this.stdoutBuffer += text;

    // Process complete JSON messages
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as LokkaMCPResponse;
          this.handleResponse(message);
        } catch (parseError) {
          console.warn('[ManagedLokkaMCP] Failed to parse response:', line, parseError);
        }
      }
    }
  }

  /**
   * Handle stderr data from Lokka process
   */
  private handleStderrData(data: Buffer): void {
    const text = data.toString();
    this.stderrBuffer += text;
    console.warn('[ManagedLokkaMCP] Stderr:', text);
  }

  /**
   * Handle response from Lokka process
   */
  private handleResponse(response: LokkaMCPResponse): void {
    console.log('[ManagedLokkaMCP] Received response:', response);

    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(new Error(response.error.message || 'Unknown error'));
      } else {
        pending.resolve(response.result);
      }
    }
  }

  /**
   * Send request to Lokka process
   */
  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.isRunning || !this.process || !this.process.stdin) {
      throw new Error('Lokka process not running');
    }

    const id = this.requestId++;
    const request: LokkaMCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const requestJson = JSON.stringify(request) + '\n';
      console.log('[ManagedLokkaMCP] Sending request:', requestJson.trim());
      
      this.process!.stdin!.write(requestJson);
    });
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any[]> {
    try {
      const result = await this.sendRequest('tools/list');
      return result.tools || [];
    } catch (error) {
      console.error('[ManagedLokkaMCP] Failed to list tools:', error);
      return [];
    }
  }

  /**
   * Call a tool
   */
  async callTool(name: string, arguments_: any): Promise<any> {
    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: arguments_
      });
      return result;
    } catch (error) {
      console.error('[ManagedLokkaMCP] Failed to call tool:', error);
      throw error;
    }
  }

  /**
   * Stop the managed Lokka process
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.process) {
      return;
    }

    console.log('[ManagedLokkaMCP] Stopping process...');

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.process.on('exit', () => {
        console.log('[ManagedLokkaMCP] Process stopped');
        this.isRunning = false;
        this.initialized = false;
        this.process = null;
        resolve();
      });

      // Try graceful shutdown first
      try {
        this.process.kill('SIGTERM');
      } catch (error) {
        console.warn('[ManagedLokkaMCP] Graceful shutdown failed, forcing kill');
        try {
          this.process.kill('SIGKILL');
        } catch (killError) {
          console.error('[ManagedLokkaMCP] Failed to kill process:', killError);
        }
      }

      // Force cleanup after timeout
      setTimeout(() => {
        if (this.process && this.isRunning) {
          console.warn('[ManagedLokkaMCP] Force killing process');
          try {
            this.process.kill('SIGKILL');
          } catch (error) {
            console.error('[ManagedLokkaMCP] Force kill failed:', error);
          }
        }
        this.isRunning = false;
        this.initialized = false;
        this.process = null;
        resolve();
      }, 5000);
    });
  }

  /**
   * Check if the process is running
   */
  isAlive(): boolean {
    return this.isRunning && this.process !== null && !this.process.killed;
  }

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Send debug message to renderer process for DevTools visibility
   */
  private sendDebugToRenderer(message: string): void {
    try {
      // Import BrowserWindow dynamically to avoid issues in renderer process
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows().find((win: any) => !win.isDestroyed());
      
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.executeJavaScript(`
          console.log('[LOKKA-TRACE] ${message.replace(/'/g, "\\'")}');
        `).catch(() => {
          // Silently fail if we can't send to renderer
        });
      }
    } catch (error) {
      // Silently fail - this is just for debugging
    }
  }
}
