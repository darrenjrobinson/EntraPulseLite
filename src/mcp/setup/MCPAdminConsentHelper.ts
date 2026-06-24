/**
 * MCPAdminConsentHelper
 * Automates PowerShell admin consent flow for Microsoft Enterprise MCP Server
 *
 * Reference: https://learn.microsoft.com/en-us/graph/mcp-server/get-started
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface AdminConsentResult {
  success: boolean;
  message: string;
  error?: string;
  details?: {
    powerShellVersion?: string;
    moduleInstalled?: boolean;
    consentGranted?: boolean;
    executionTime?: number;
  };
}

export interface PowerShellAvailability {
  available: boolean;
  path?: string;
  version?: string;
  isPowerShellCore?: boolean; // pwsh vs powershell
}

export class MCPAdminConsentHelper {
  /**
   * Check if PowerShell is available on the system
   */
  static async checkPowerShellAvailability(): Promise<PowerShellAvailability> {
    // Try PowerShell Core (pwsh) first, then fallback to Windows PowerShell
    const commands = [
      { cmd: 'pwsh', isCore: true },
      { cmd: 'powershell', isCore: false }
    ];

    for (const { cmd, isCore } of commands) {
      try {
        const { stdout } = await execAsync(`${cmd} -Command "$PSVersionTable.PSVersion.ToString()"`);
        const version = stdout.trim();

        return {
          available: true,
          path: cmd,
          version,
          isPowerShellCore: isCore
        };
      } catch (error) {
        // Continue to next command
        console.log(`[MCPAdminConsentHelper] ${cmd} not available:`, error);
      }
    }

    return {
      available: false
    };
  }

  /**
   * Check if Microsoft.Entra.Beta PowerShell module is installed
   */
  static async checkEntraModuleInstalled(powerShellPath: string): Promise<boolean> {
    try {
      const command = `${powerShellPath} -Command "Get-Module -ListAvailable -Name Microsoft.Entra.Beta | Select-Object -First 1 | ConvertTo-Json"`;
      const { stdout } = await execAsync(command, { timeout: 30000 });

      if (!stdout || stdout.trim() === '') {
        return false;
      }

      try {
        const moduleInfo = JSON.parse(stdout);
        return !!moduleInfo && !!moduleInfo.Name;
      } catch {
        // If parsing fails, check if output contains the module name
        return stdout.includes('Microsoft.Entra.Beta');
      }
    } catch (error) {
      console.error('[MCPAdminConsentHelper] Error checking Entra module:', error);
      return false;
    }
  }

  /**
   * Install Microsoft.Entra.Beta PowerShell module
   * Note: This requires admin privileges
   */
  static async installEntraModule(powerShellPath: string): Promise<AdminConsentResult> {
    const startTime = Date.now();

    try {
      console.log('[MCPAdminConsentHelper] Installing Microsoft.Entra.Beta module...');

      const command = `${powerShellPath} -Command "Install-Module Microsoft.Entra.Beta -Force -AllowClobber -Scope CurrentUser"`;
      await execAsync(command, { timeout: 120000 }); // 2 minutes timeout

      const executionTime = Date.now() - startTime;

      // Verify installation
      const installed = await this.checkEntraModuleInstalled(powerShellPath);

      if (installed) {
        return {
          success: true,
          message: 'Microsoft.Entra.Beta module installed successfully',
          details: {
            moduleInstalled: true,
            executionTime
          }
        };
      } else {
        return {
          success: false,
          message: 'Module installation completed but verification failed',
          error: 'Could not verify module installation',
          details: {
            moduleInstalled: false,
            executionTime
          }
        };
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: 'Failed to install Microsoft.Entra.Beta module',
        error: errorMessage,
        details: {
          moduleInstalled: false,
          executionTime
        }
      };
    }
  }

  /**
   * Execute admin consent PowerShell command
   * This grants MCP permissions to the specified application
   *
   * @param applicationName The name of the application (defaults to 'EntraPulseLite')
   * @param autoInstallModule If true, attempts to install the module if not present
   */
  static async grantAdminConsent(
    applicationName: string = 'EntraPulseLite',
    autoInstallModule: boolean = true
  ): Promise<AdminConsentResult> {
    const startTime = Date.now();

    try {
      // Step 1: Check PowerShell availability
      console.log('[MCPAdminConsentHelper] Step 1: Checking PowerShell availability...');
      const psAvailability = await this.checkPowerShellAvailability();

      if (!psAvailability.available || !psAvailability.path) {
        return {
          success: false,
          message: 'PowerShell is not available on this system',
          error: 'PowerShell not found. Please install PowerShell Core or use Windows PowerShell.',
          details: {
            powerShellVersion: undefined,
            moduleInstalled: false,
            consentGranted: false,
            executionTime: Date.now() - startTime
          }
        };
      }

      console.log('[MCPAdminConsentHelper] PowerShell found:', psAvailability);

      // Step 2: Check if Microsoft.Entra.Beta module is installed
      console.log('[MCPAdminConsentHelper] Step 2: Checking Microsoft.Entra.Beta module...');
      const moduleInstalled = await this.checkEntraModuleInstalled(psAvailability.path);

      if (!moduleInstalled) {
        if (autoInstallModule) {
          console.log('[MCPAdminConsentHelper] Module not found, attempting to install...');
          const installResult = await this.installEntraModule(psAvailability.path);

          if (!installResult.success) {
            return {
              ...installResult,
              message: 'Failed to install required PowerShell module',
              details: {
                ...installResult.details,
                powerShellVersion: psAvailability.version,
                consentGranted: false
              }
            };
          }
        } else {
          return {
            success: false,
            message: 'Microsoft.Entra.Beta module is not installed',
            error: 'Please install the module manually: Install-Module Microsoft.Entra.Beta -Force -AllowClobber',
            details: {
              powerShellVersion: psAvailability.version,
              moduleInstalled: false,
              consentGranted: false,
              executionTime: Date.now() - startTime
            }
          };
        }
      }

      // Step 3: Connect to Entra and grant MCP permissions
      console.log('[MCPAdminConsentHelper] Step 3: Granting admin consent...');

      const consentScript = `
        try {
          # Import the module
          Import-Module Microsoft.Entra.Beta -ErrorAction Stop

          # Required scopes for admin consent
          $requiredScopes = @(
            'Application.ReadWrite.All',
            'Directory.Read.All',
            'DelegatedPermissionGrant.ReadWrite.All'
          )

          # Connect to Entra
          Connect-Entra -Scopes $requiredScopes -ErrorAction Stop

          # Grant MCP Server permission
          Grant-EntraBetaMCPServerPermission -ApplicationName '${applicationName}' -ErrorAction Stop

          Write-Output "SUCCESS: Admin consent granted for ${applicationName}"
          exit 0
        } catch {
          Write-Error "ERROR: $($_.Exception.Message)"
          exit 1
        }
      `;

      // Execute the PowerShell script
      const { stdout, stderr } = await execAsync(
        `${psAvailability.path} -ExecutionPolicy Bypass -Command "${consentScript.replace(/"/g, '\\"')}"`,
        { timeout: 180000 } // 3 minutes timeout
      );

      const executionTime = Date.now() - startTime;

      console.log('[MCPAdminConsentHelper] PowerShell output:', stdout);
      if (stderr) {
        console.error('[MCPAdminConsentHelper] PowerShell error:', stderr);
      }

      // Check if consent was granted successfully
      if (stdout.includes('SUCCESS')) {
        return {
          success: true,
          message: `Admin consent granted successfully for ${applicationName}`,
          details: {
            powerShellVersion: psAvailability.version,
            moduleInstalled: true,
            consentGranted: true,
            executionTime
          }
        };
      } else {
        return {
          success: false,
          message: 'Admin consent command executed but result is unclear',
          error: stderr || 'Unknown error occurred',
          details: {
            powerShellVersion: psAvailability.version,
            moduleInstalled: true,
            consentGranted: false,
            executionTime
          }
        };
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[MCPAdminConsentHelper] Error granting admin consent:', error);

      return {
        success: false,
        message: 'Failed to grant admin consent',
        error: errorMessage,
        details: {
          consentGranted: false,
          executionTime
        }
      };
    }
  }

  /**
   * Get manual setup instructions as fallback
   */
  static getManualSetupInstructions(applicationName: string = 'EntraPulseLite'): string {
    const isWindows = os.platform() === 'win32';

    if (isWindows) {
      return `
Manual Setup Instructions (Windows):

1. Open PowerShell as Administrator

2. Install the Microsoft.Entra.Beta module:
   Install-Module Microsoft.Entra.Beta -Force -AllowClobber

3. Connect to your Entra tenant:
   Connect-Entra -Scopes 'Application.ReadWrite.All', 'Directory.Read.All', 'DelegatedPermissionGrant.ReadWrite.All'

4. Grant MCP Server permissions:
   Grant-EntraBetaMCPServerPermission -ApplicationName '${applicationName}'

5. Return to EntraPulse Lite and verify the consent status

Note: You must have Global Administrator or Cloud Application Administrator role.
      `.trim();
    } else {
      return `
Manual Setup Instructions (macOS/Linux):

1. Install PowerShell Core if not already installed:
   https://docs.microsoft.com/powershell/scripting/install/installing-powershell

2. Open a terminal and run pwsh:
   pwsh

3. Install the Microsoft.Entra.Beta module:
   Install-Module Microsoft.Entra.Beta -Force -AllowClobber

4. Connect to your Entra tenant:
   Connect-Entra -Scopes 'Application.ReadWrite.All', 'Directory.Read.All', 'DelegatedPermissionGrant.ReadWrite.All'

5. Grant MCP Server permissions:
   Grant-EntraBetaMCPServerPermission -ApplicationName '${applicationName}'

6. Return to EntraPulse Lite and verify the consent status

Note: You must have Global Administrator or Cloud Application Administrator role.
      `.trim();
    }
  }

  /**
   * Generate a PowerShell script file that user can execute manually
   */
  static generateConsentScript(applicationName: string = 'EntraPulseLite'): string {
    return `
# Microsoft Enterprise MCP Server - Admin Consent Script
# Application: ${applicationName}
# Generated: ${new Date().toISOString()}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Microsoft Enterprise MCP - Admin Consent" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    # Check if module is installed
    Write-Host "Checking for Microsoft.Entra.Beta module..." -ForegroundColor Yellow
    $module = Get-Module -ListAvailable -Name Microsoft.Entra.Beta | Select-Object -First 1

    if (-not $module) {
        Write-Host "Module not found. Installing..." -ForegroundColor Yellow
        Install-Module Microsoft.Entra.Beta -Force -AllowClobber -Scope CurrentUser
        Write-Host "Module installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Module already installed (Version: $($module.Version))" -ForegroundColor Green
    }

    # Import the module
    Import-Module Microsoft.Entra.Beta -ErrorAction Stop

    # Connect to Entra
    Write-Host ""
    Write-Host "Connecting to Microsoft Entra..." -ForegroundColor Yellow
    $requiredScopes = @(
        'Application.ReadWrite.All',
        'Directory.Read.All',
        'DelegatedPermissionGrant.ReadWrite.All'
    )
    Connect-Entra -Scopes $requiredScopes -ErrorAction Stop
    Write-Host "Connected successfully!" -ForegroundColor Green

    # Grant MCP Server permission
    Write-Host ""
    Write-Host "Granting MCP Server permissions for '${applicationName}'..." -ForegroundColor Yellow
    Grant-EntraBetaMCPServerPermission -ApplicationName '${applicationName}' -ErrorAction Stop

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Admin consent granted." -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now return to EntraPulse Lite." -ForegroundColor Cyan

} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR: Failed to grant admin consent" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure you have:" -ForegroundColor Yellow
    Write-Host "  - Global Administrator or Cloud Application Administrator role" -ForegroundColor Yellow
    Write-Host "  - PowerShell is running as Administrator" -ForegroundColor Yellow
    Write-Host "  - Internet connection is available" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    `.trim();
  }
}
