import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LOKKA_NPX_ARGS, LOKKA_PINNED_PACKAGE } from '../constants';

interface LokkaMCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any;
}

interface LokkaMCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Persistent Lokka MCP Client - Runs Lokka as a long-lived background process
 * Similar to a .NET/PowerShell Runspace - start once, reuse for all queries
 */
export class PersistentLokkaMCPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private isRunning = false;
  private initialized = false;
  private requestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private environment: Record<string, string> = {};
  private tempDir: string = '';
  private startupComplete = false;

  constructor(environment: Record<string, string> = {}) {
    super();
    this.environment = environment;
    console.log('[PersistentLokka] Creating persistent Lokka client with environment:', {
      envVarCount: Object.keys(environment).length,
      hasAccessToken: !!environment.ACCESS_TOKEN,
      hasClientId: !!environment.CLIENT_ID,
      hasTenantId: !!environment.TENANT_ID
    });
  }

  /**
   * Start the persistent Lokka process (similar to creating a Runspace)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[PersistentLokka] Already running');
      return;
    }

    console.log('[PersistentLokka] Starting persistent Lokka process...');
    this.sendDebugToRenderer('Starting persistent Lokka process...');

    return new Promise<void>((resolve, reject) => {
      try {
        // Create a persistent directory for the process
        this.tempDir = path.join(os.tmpdir(), 'persistent-lokka-' + Date.now());
        fs.mkdirSync(this.tempDir, { recursive: true });

        // Prepare environment variables with aggressive sanitization
        const processEnv: { [key: string]: string } = {};
        
        // Copy system environment variables first
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined && typeof value === 'string') {
            processEnv[key] = value;
          }
        }

        // Add Lokka-specific environment variables with sanitization
        for (const [key, value] of Object.entries(this.environment)) {
          if (value !== undefined && value !== '') { // Don't pass empty strings
            // Aggressive token sanitization for portable builds
            if (key === 'ACCESS_TOKEN') {
              processEnv[key] = this.sanitizeAccessToken(value);
            } else {
              processEnv[key] = value;
            }
          }
        }

        // Fallback to process.env for missing values, but avoid empty strings
        if (!processEnv['TENANT_ID'] && process.env.TENANT_ID && process.env.TENANT_ID !== '') {
          processEnv['TENANT_ID'] = process.env.TENANT_ID;
        }
        if (!processEnv['CLIENT_ID'] && process.env.CLIENT_ID && process.env.CLIENT_ID !== '') {
          processEnv['CLIENT_ID'] = process.env.CLIENT_ID;
        }
        if (!processEnv['USE_CLIENT_TOKEN']) {
          processEnv['USE_CLIENT_TOKEN'] = process.env.USE_CLIENT_TOKEN || 'true';
        }
        if (!processEnv['ACCESS_TOKEN'] && process.env.ACCESS_TOKEN && process.env.ACCESS_TOKEN !== '') {
          processEnv['ACCESS_TOKEN'] = process.env.ACCESS_TOKEN;
        }

        console.log('[PersistentLokka] Environment prepared for persistent process:', {
          TENANT_ID: processEnv['TENANT_ID'] ? 'SET' : 'NOT SET',
          CLIENT_ID: processEnv['CLIENT_ID'] ? 'SET' : 'NOT SET',
          USE_CLIENT_TOKEN: processEnv['USE_CLIENT_TOKEN'] || 'NOT SET',
          ACCESS_TOKEN: processEnv['ACCESS_TOKEN'] ? `SET (${processEnv['ACCESS_TOKEN'].length} chars)` : 'NOT SET',
          totalEnvVars: Object.keys(processEnv).length,
          workingDir: this.tempDir
        });

        // ENHANCED DEBUG: Log the actual values (redacted) to see what's really being passed
        this.sendDebugToRenderer(`ENVIRONMENT DEBUG: TENANT_ID=${processEnv['TENANT_ID'] ? processEnv['TENANT_ID'].substring(0, 8) + '...' : 'EMPTY/UNDEFINED'}`);
        this.sendDebugToRenderer(`ENVIRONMENT DEBUG: CLIENT_ID=${processEnv['CLIENT_ID'] ? processEnv['CLIENT_ID'].substring(0, 8) + '...' : 'EMPTY/UNDEFINED'}`);
        this.sendDebugToRenderer(`ENVIRONMENT DEBUG: USE_CLIENT_TOKEN=${processEnv['USE_CLIENT_TOKEN'] || 'EMPTY/UNDEFINED'}`);
        this.sendDebugToRenderer(`ENVIRONMENT DEBUG: Total env vars passed: ${Object.keys(processEnv).length}`);
        
        // NEW: Test if environment variables are actually being passed correctly
        // Add a test variable that we can verify Lokka receives
        processEnv['ENTRAPULSE_TEST'] = 'TEST_VALUE_12345';
        this.sendDebugToRenderer(`ENVIRONMENT DEBUG: Added test variable ENTRAPULSE_TEST=TEST_VALUE_12345`);
        
        // Check for empty string values specifically
        const emptyVars = Object.entries(processEnv).filter(([key, value]) => value === '').map(([key]) => key);
        if (emptyVars.length > 0) {
          this.sendDebugToRenderer(`WARNING: Empty string environment variables: ${emptyVars.join(', ')}`);
        }
        
        // NEW: REVOLUTIONARY APPROACH - Use Lokka configuration file instead of environment variables
        // Since environment variables aren't working in portable builds, create a config file that Lokka can read
        const lokkaConfigPath = path.join(this.tempDir, 'lokka-config.json');
        try {
          const lokkaConfig = {
            tenantId: processEnv['TENANT_ID'],
            clientId: processEnv['CLIENT_ID'],
            useClientToken: processEnv['USE_CLIENT_TOKEN'] === 'true',
            accessToken: processEnv['ACCESS_TOKEN'] || undefined
          };
          
          fs.writeFileSync(lokkaConfigPath, JSON.stringify(lokkaConfig, null, 2));
          this.sendDebugToRenderer(`CONFIG FILE: Created Lokka configuration file with settings`);
          console.log('[PersistentLokka] Created Lokka configuration file for portable build compatibility');
        } catch (configError) {
          console.warn('[PersistentLokka] Could not create Lokka config file:', configError);
        }

        // NEW: Try a different approach for portable builds - use environment file
        // This might work better than direct environment variable passing
        const envFilePath = path.join(this.tempDir, '.env');
        try {
          const envFileContent = Object.entries(processEnv)
            .filter(([key, value]) => key.startsWith('TENANT_ID') || key.startsWith('CLIENT_ID') || key.startsWith('USE_CLIENT_TOKEN') || key.startsWith('ACCESS_TOKEN') || key.startsWith('ENTRAPULSE_TEST'))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
          
          fs.writeFileSync(envFilePath, envFileContent);
          this.sendDebugToRenderer(`ENVIRONMENT DEBUG: Created .env file with ${envFileContent.split('\n').length} variables`);
          console.log('[PersistentLokka] Created .env file for portable build compatibility');
        } catch (envFileError) {
          console.warn('[PersistentLokka] Could not create .env file:', envFileError);
        }

        // Use a more reliable spawn approach for persistent process
        console.log('[PersistentLokka] Spawning persistent Lokka process...');
        console.log(`[PersistentLokka] Command: npx ${LOKKA_NPX_ARGS.join(' ')}`);
        console.log('[PersistentLokka] Working directory:', this.tempDir);

        // NEW: SIMPLIFIED APPROACH - Just run Lokka with minimal environment
        // Let's try to isolate the environment variable issue by using a minimal clean environment
        const minimalEnv: { [key: string]: string } = {
          // Keep only essential system variables
          PATH: process.env.PATH || '',
          USERPROFILE: process.env.USERPROFILE || '',
          TEMP: process.env.TEMP || '',
          TMP: process.env.TMP || '',
          // Add Lokka-specific variables directly
          TENANT_ID: processEnv['TENANT_ID'] || '',
          CLIENT_ID: processEnv['CLIENT_ID'] || '',
          USE_CLIENT_TOKEN: processEnv['USE_CLIENT_TOKEN'] || 'true',
          ACCESS_TOKEN: processEnv['ACCESS_TOKEN'] || '',
          // Add test variable
          ENTRAPULSE_TEST: 'TEST_VALUE_12345'
        };

        this.sendDebugToRenderer(`MINIMAL ENV: Using minimal environment with ${Object.keys(minimalEnv).length} variables`);
        console.log('[PersistentLokka] Using minimal environment to avoid conflicts');

        // Try multiple approaches for different environments
        let spawnOptions = {
          cwd: this.tempDir,
          env: minimalEnv,  // Use minimal environment instead of full processEnv
          stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          detached: false // Keep attached so we can manage lifecycle
        };

        // Attempt 1: Try with shell enabled for portable builds (Windows)
        if (process.platform === 'win32') {
          try {
            console.log('[PersistentLokka] Attempting Windows shell spawn...');
            this.process = spawn('npx', [...LOKKA_NPX_ARGS], {
              ...spawnOptions,
              shell: true // Enable shell for Windows to find npx
            });
          } catch (shellError) {
            console.warn('[PersistentLokka] Windows shell spawn failed:', shellError);
            this.process = null;
          }
        }

        // Attempt 2: Try batch file approach for portable builds (Windows only)
        if (!this.process && process.platform === 'win32') {
          try {
            console.log('[PersistentLokka] Attempting batch file approach for portable build...');
            
            // Create a batch file that sets environment variables and runs Lokka
            const batchFilePath = path.join(this.tempDir, 'start-lokka.bat');
            const batchContent = [
              '@echo off',
              `set TENANT_ID=${processEnv['TENANT_ID'] || ''}`,
              `set CLIENT_ID=${processEnv['CLIENT_ID'] || ''}`,
              `set USE_CLIENT_TOKEN=${processEnv['USE_CLIENT_TOKEN'] || 'true'}`,
              `set ACCESS_TOKEN=${processEnv['ACCESS_TOKEN'] || ''}`,
              `set ENTRAPULSE_TEST=${processEnv['ENTRAPULSE_TEST'] || ''}`,
              'echo Starting Lokka with environment variables:',
              'echo TENANT_ID=%TENANT_ID%',
              'echo CLIENT_ID=%CLIENT_ID%',
              'echo USE_CLIENT_TOKEN=%USE_CLIENT_TOKEN%',
              'echo ENTRAPULSE_TEST=%ENTRAPULSE_TEST%',
              `npx -y ${LOKKA_PINNED_PACKAGE}`
            ].join('\r\n');
            
            fs.writeFileSync(batchFilePath, batchContent);
            this.sendDebugToRenderer(`BATCH DEBUG: Created batch file with environment variables`);
            
            this.process = spawn('cmd.exe', ['/c', batchFilePath], {
              cwd: this.tempDir,
              stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
              detached: false
            });
            
            console.log('[PersistentLokka] Batch file approach spawned successfully');
            
          } catch (batchError) {
            console.warn('[PersistentLokka] Batch file approach failed:', batchError);
            this.process = null;
          }
        }

        // Attempt 3: Fallback to non-shell spawn if shell failed or non-Windows
        if (!this.process) {
          try {
            console.log('[PersistentLokka] Attempting direct spawn...');
            this.process = spawn('npx', [...LOKKA_NPX_ARGS], {
              ...spawnOptions,
              shell: false // Disable shell to avoid command injection issues
            });
          } catch (directError) {
            console.warn('[PersistentLokka] Direct spawn failed:', directError);
            this.process = null;
          }
        }

        // Attempt 3: Try with cmd.exe wrapper for Windows portable builds
        if (!this.process && process.platform === 'win32') {
          try {
            console.log('[PersistentLokka] Attempting cmd.exe wrapper spawn...');
            this.process = spawn('cmd.exe', ['/c', 'npx', ...LOKKA_NPX_ARGS], {
              ...spawnOptions,
              shell: false
            });
          } catch (cmdError) {
            console.warn('[PersistentLokka] cmd.exe wrapper spawn failed:', cmdError);
            this.process = null;
          }
        }

        if (!this.process || !this.process.stdout || !this.process.stderr || !this.process.stdin) {
          throw new Error('Failed to create persistent process streams - npx may not be available in portable build environment');
        }

        // Set up process event handlers
        this.setupProcessHandlers(resolve, reject);

        // Set up stdio handlers for JSON-RPC communication
        this.setupStdioHandlers();

        // Set a reasonable startup timeout - reduced to prevent UI blocking
        const startupTimeout = setTimeout(() => {
          this.cleanup();
          reject(new Error('Persistent Lokka startup timeout (10 seconds) - likely environment variable issue'));
        }, 10000); // Reduced from 45 seconds to 10 seconds

        // Wait for process to be ready
        this.once('ready', () => {
          clearTimeout(startupTimeout);
          this.startupComplete = true;
          console.log('[PersistentLokka] ✅ Persistent process ready');
          resolve();
        });

        this.once('error', (error) => {
          clearTimeout(startupTimeout);
          this.cleanup();
          reject(error);
        });

      } catch (error) {
        console.error('[PersistentLokka] Failed to start persistent process:', error);
        reject(error);
      }
    });
  }

  /**
   * Sanitize access token to prevent syntax errors in portable builds
   */
  private sanitizeAccessToken(token: string): string {
    if (!token) return '';

    try {
      // Validate JWT format
      if (!token.match(/^[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+$/)) {
        console.warn('[PersistentLokka] ACCESS_TOKEN does not appear to be a valid JWT format');
      }

      // Aggressive sanitization for portable builds
      const sanitized = token
        .replace(/\s+/g, '')           // Remove all whitespace
        .replace(/[\r\n\t]/g, '')      // Remove line breaks and tabs
        .replace(/[`$(){}[\]\\]/g, '') // Remove shell metacharacters
        .replace(/["\\']/g, '')        // Remove quotes
        .replace(/[;|&<>]/g, '');      // Remove command separators

      console.log('[PersistentLokka] ACCESS_TOKEN sanitized:', {
        originalLength: token.length,
        sanitizedLength: sanitized.length,
        hadProblematicChars: sanitized.length !== token.length
      });

      return sanitized;
    } catch (error) {
      console.error('[PersistentLokka] Error sanitizing ACCESS_TOKEN:', error);
      return token; // Return original if sanitization fails
    }
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.process) return;

    this.process.on('spawn', () => {
      console.log('[PersistentLokka] ✅ Persistent process spawned successfully');
      this.sendDebugToRenderer('Persistent process spawned successfully');
      this.isRunning = true;
      
      // Give the process a moment to initialize, then mark as ready
      setTimeout(() => {
        this.initialized = true;
        this.emit('ready');
      }, 3000);
    });

    this.process.on('error', (error) => {
      console.error('[PersistentLokka] ❌ Persistent process error:', error);
      
      // Provide specific guidance for common errors
      if (error.message.includes('ENOENT') || error.message.includes('spawn npx')) {
        console.error('[PersistentLokka] 🚨 NPX NOT FOUND: This likely means npx is not available in the portable build environment.');
        console.error('[PersistentLokka] 💡 SOLUTION: The fallback clients should handle this. This is expected in portable builds.');
        this.sendDebugToRenderer(`NPX not found in portable build environment: ${error.message}`);
      } else {
        this.sendDebugToRenderer(`Persistent process error: ${error.message}`);
      }
      
      this.isRunning = false;
      this.emit('error', error);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[PersistentLokka] 🔄 Persistent process exited with code ${code}, signal ${signal}`);
      this.sendDebugToRenderer(`Persistent process exited: code=${code}, signal=${signal}`);
      this.isRunning = false;
      this.initialized = false;
      this.emit('exit', code, signal);
    });

    this.process.on('close', (code, signal) => {
      console.log(`[PersistentLokka] 🔄 Persistent process closed with code ${code}, signal ${signal}`);
      this.sendDebugToRenderer(`Persistent process closed: code=${code}, signal=${signal}`);
      this.isRunning = false;
      this.initialized = false;
    });
  }

  /**
   * Set up stdin/stdout handlers for JSON-RPC communication
   */
  private setupStdioHandlers(): void {
    if (!this.process || !this.process.stdout || !this.process.stderr) return;

    // Handle stdout for JSON-RPC responses
    this.process.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[PersistentLokka stdout]:', output.substring(0, 200) + (output.length > 200 ? '...' : ''));
      this.sendDebugToRenderer(`Persistent stdout: ${output.substring(0, 100)}${output.length > 100 ? '...' : ''}`);
      this.handleStdoutData(data);
    });

    // Handle stderr for errors and debug info
    this.process.stderr.on('data', (data) => {
      const output = data.toString();
      console.error('[PersistentLokka stderr]:', output.substring(0, 200) + (output.length > 200 ? '...' : ''));
      this.sendDebugToRenderer(`Persistent stderr: ${output.substring(0, 100)}${output.length > 100 ? '...' : ''}`);
      
      // Check for syntax errors that were causing crashes
      if (output.includes('SyntaxError') || output.includes('Invalid or unexpected token')) {
        console.error('[PersistentLokka] 🚨 SYNTAX ERROR DETECTED in persistent process:', output);
        this.sendDebugToRenderer(`🚨 SYNTAX ERROR in persistent process: ${output}`);
        this.emit('error', new Error(`Lokka syntax error: ${output}`));
      }
    });
  }

  /**
   * Handle stdout data for JSON-RPC responses
   */
  private handleStdoutData(data: Buffer): void {
    const text = data.toString();
    this.stdoutBuffer += text;

    // Process complete JSON-RPC messages
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as LokkaMCPResponse;
          this.handleResponse(message);
        } catch (parseError) {
          // Not JSON, might be startup output - ignore for now
          console.log('[PersistentLokka] Non-JSON output:', line.substring(0, 100));
        }
      }
    }
  }

  /**
   * Handle JSON-RPC response from Lokka
   */
  private handleResponse(response: LokkaMCPResponse): void {
    console.log('[PersistentLokka] Received JSON-RPC response:', response);

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
   * Send JSON-RPC request to persistent Lokka process
   */
  async sendRequest(method: string, params?: any): Promise<any> {
    console.log(`[PersistentLokka] SendRequest: method=${method}, isRunning=${this.isRunning}, initialized=${this.initialized}`);
    
    if (!this.isRunning || !this.initialized || !this.process || !this.process.stdin) {
      throw new Error(`Persistent Lokka process not ready (running: ${this.isRunning}, initialized: ${this.initialized})`);
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
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const requestJson = JSON.stringify(request) + '\n';
      console.log('[PersistentLokka] Sending JSON-RPC request:', requestJson.trim());
      
      try {
        this.process!.stdin!.write(requestJson);
      } catch (writeError) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(new Error(`Failed to write to persistent process: ${writeError}`));
      }
    });
  }

  /**
   * Stop the persistent process
   */
  async stop(): Promise<void> {
    console.log('[PersistentLokka] Stopping persistent process...');
    
    if (this.process) {
      // Clear any pending requests
      for (const [id, request] of this.pendingRequests) {
        clearTimeout(request.timeout);
        request.reject(new Error('Persistent process is stopping'));
      }
      this.pendingRequests.clear();

      try {
        // Graceful shutdown
        this.process.kill('SIGTERM');
        
        // Wait for graceful exit
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (this.process && !this.process.killed) {
              this.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          if (this.process) {
            this.process.on('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          } else {
            clearTimeout(timeout);
            resolve();
          }
        });
      } catch (error) {
        console.error('[PersistentLokka] Error stopping persistent process:', error);
      }
    }

    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Remove all event listeners from the process to prevent late firing
    if (this.process) {
      // In test environment, force removal of all listeners immediately
      if (process.env.NODE_ENV === 'test' || typeof jest !== 'undefined') {
        this.process.removeAllListeners();
        this.process.kill('SIGKILL'); // Force kill in tests to prevent hanging
      } else {
        this.process.removeAllListeners();
      }
    }
    
    this.process = null;
    this.isRunning = false;
    this.initialized = false;
    this.startupComplete = false;
    
    // Clean up temp directory
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('[PersistentLokka] Failed to clean up temp directory:', error);
      }
    }
    
    console.log('[PersistentLokka] Cleanup completed');
    this.emit('exit', 0, 'cleanup');
  }

  /**
   * Check if the persistent process is alive
   */
  isAlive(): boolean {
    return this.isRunning && this.initialized && this.process !== null && !this.process.killed;
  }

  /**
   * Check if the client is initialized and ready
   */
  isInitialized(): boolean {
    return this.initialized && this.startupComplete;
  }

  /**
   * List available tools from persistent Lokka
   */
  async listTools(): Promise<any[]> {
    try {
      const result = await this.sendRequest('tools/list');
      return result.tools || [];
    } catch (error) {
      console.error('[PersistentLokka] Failed to list tools:', error);
      return [];
    }
  }

  /**
   * Call a tool via persistent Lokka process
   */
  async callTool(name: string, arguments_: any): Promise<any> {
    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: arguments_
      });
      return result;
    } catch (error) {
      console.error('[PersistentLokka] Failed to call tool:', error);
      throw error;
    }
  }

  /**
   * Send debug message to renderer process for DevTools visibility
   */
  private sendDebugToRenderer(message: string): void {
    try {
      // Check if we're in a test environment, Jest is tearing down, or Electron isn't available
      if (
        typeof jest !== 'undefined' || 
        process.env.NODE_ENV === 'test' ||
        typeof require === 'undefined' ||
        !this.isElectronAvailable()
      ) {
        // In test environment or when Electron is not available, just log to console
        console.log(`[PERSISTENT-LOKKA-TRACE] ${message}`);
        return;
      }

      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows().find((win: any) => !win.isDestroyed());
      
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.executeJavaScript(`
          console.log('[PERSISTENT-LOKKA-TRACE] ${message.replace(/'/g, "\\'")}');
        `).catch(() => {
          // Silently fail if we can't send to renderer
        });
      }
    } catch (error) {
      // Silently fail - this is just for debugging
      // In case of Jest teardown, just log to console
      console.log(`[PERSISTENT-LOKKA-TRACE] ${message}`);
    }
  }

  /**
   * Check if Electron is available and not being torn down
   */
  private isElectronAvailable(): boolean {
    try {
      // Try to access electron without importing it
      return process.versions.electron !== undefined && typeof require !== 'undefined';
    } catch {
      return false;
    }
  }
}
