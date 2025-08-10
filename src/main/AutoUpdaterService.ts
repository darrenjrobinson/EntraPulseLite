// Auto-updater service for EntraPulse Lite
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';
import { ConfigService } from '../shared/ConfigService';

export class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private configService: ConfigService;
  private updateDownloaded = false;

  constructor(configService: ConfigService) {
    this.configService = configService;
    this.setupAutoUpdater();
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private setupAutoUpdater(): void {
    // Configure update server (GitHub releases)
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'darrenjrobinson',
      repo: 'EntraPulseLite'
    });

    // Auto-updater event handlers
    autoUpdater.on('checking-for-update', () => {
      console.log('🔍 Checking for updates...');
      this.sendToRenderer('update:checking-for-update');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('✅ Update available:', info);
      this.sendToRenderer('update:available', info);
      
      // Show notification to user
      this.showUpdateNotification(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('✅ Update not available. Current version is latest:', info);
      this.sendToRenderer('update:not-available', info);
    });

    autoUpdater.on('error', (err) => {
      console.error('❌ Auto-updater error:', err);
      
      // Better error message handling - ensure we always get a string
      let errorMessage = 'Unknown update error';
      
      try {
        if (err && typeof err === 'object') {
          // Check for specific HttpError properties from electron-updater
          if ((err as any).statusCode && (err as any).description) {
            const statusCode = (err as any).statusCode;
            const description = (err as any).description;
            
            if (statusCode === 404) {
              errorMessage = 'No releases available yet. This is normal for development builds.';
              console.log('ℹ️ Auto-updater: No releases found in repository - this is expected for development builds');
            } else {
              errorMessage = `HTTP ${statusCode}: Update server error`;
            }
          } else if (err.message && typeof err.message === 'string') {
            errorMessage = err.message;
          } else if (err.toString && typeof err.toString === 'function') {
            const stringified = err.toString();
            if (stringified !== '[object Object]') {
              errorMessage = stringified;
            } else {
              // Fallback for complex objects
              errorMessage = 'Failed to check for updates. This may be normal for pre-release builds.';
            }
          } else {
            // Extract meaningful info from object
            errorMessage = JSON.stringify(err, Object.getOwnPropertyNames(err)).slice(0, 200) || 'Failed to check for updates';
          }
        } else if (typeof err === 'string') {
          errorMessage = err;
        }
        
        // Additional check for 404 errors in the message
        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          errorMessage = 'No releases available yet. This is normal for development builds.';
          console.log('ℹ️ Auto-updater: No releases found in repository - this is expected for development builds');
        }
      } catch (parseError) {
        console.error('Error parsing auto-updater error:', parseError);
        errorMessage = 'Failed to check for updates. This may be normal for pre-release builds.';
      }
      
      // Ensure errorMessage is always a string and not too long
      if (typeof errorMessage !== 'string') {
        errorMessage = 'Update check failed';
      }
      
      // Truncate very long error messages
      if (errorMessage.length > 500) {
        errorMessage = errorMessage.substring(0, 497) + '...';
      }
      
      console.log('🔧 Auto-updater sending processed error message to renderer:', errorMessage);
      this.sendToRenderer('update:error', errorMessage);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      console.log('📥 Download progress:', message);
      this.sendToRenderer('update:download-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ Update downloaded:', info);
      this.updateDownloaded = true;
      this.sendToRenderer('update:downloaded', info);
      
      // Show install notification
      this.showInstallUpdateDialog();
    });
  }

  private sendToRenderer(event: string, data?: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  private showUpdateNotification(info: any): void {
    if (!this.mainWindow) return;

    const options = {
      type: 'info' as const,
      title: 'Update Available',
      message: `EntraPulse Lite ${info.version} is available`,
      detail: 'A new version of EntraPulse Lite is available. Would you like to download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      if (result.response === 0) {
        // User chose to download
        this.downloadUpdate();
      }
    });
  }

  private showInstallUpdateDialog(): void {
    if (!this.mainWindow) return;

    const options = {
      type: 'info' as const,
      title: 'Update Ready',
      message: 'Update downloaded successfully',
      detail: 'EntraPulse Lite will restart to apply the update. Save any important work before proceeding.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      if (result.response === 0) {
        // User chose to restart
        this.installUpdate();
      }
    });
  }

  // Public methods for manual update checking
  async checkForUpdates(): Promise<void> {
    try {
      console.log('🔍 Checking for updates...');
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      console.error('Error checking for updates:', error);
      
      // Handle common error scenarios gracefully with robust error parsing
      let errorMessage = 'Failed to check for updates';
      
      try {
        if (error && typeof error === 'object') {
          // Check for specific HttpError properties from electron-updater
          if ((error as any).statusCode && (error as any).description) {
            const statusCode = (error as any).statusCode;
            
            if (statusCode === 404) {
              errorMessage = 'No releases available yet. This is normal for development builds.';
              console.log('ℹ️ No releases found - expected for development builds');
            } else {
              errorMessage = `HTTP ${statusCode}: Update server error`;
            }
          } else if ((error as any).message && typeof (error as any).message === 'string') {
            const msg = (error as any).message;
            if (msg.includes('404') || msg.includes('Not Found')) {
              errorMessage = 'No releases available yet. This is normal for development builds.';
              console.log('ℹ️ No releases found - expected for development builds');
            } else {
              errorMessage = msg;
            }
          } else if (error.toString && typeof error.toString === 'function') {
            const stringified = error.toString();
            if (stringified !== '[object Object]') {
              errorMessage = stringified;
            }
          }
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
      } catch (parseError) {
        console.error('Error parsing checkForUpdates error:', parseError);
        errorMessage = 'Failed to check for updates. This may be normal for pre-release builds.';
      }
      
      // Ensure errorMessage is always a string
      if (typeof errorMessage !== 'string') {
        errorMessage = 'Update check failed';
      }
      
      // Truncate very long error messages
      if (errorMessage.length > 500) {
        errorMessage = errorMessage.substring(0, 497) + '...';
      }
      
      console.log('🔧 checkForUpdates sending processed error message to renderer:', errorMessage);
      this.sendToRenderer('update:error', errorMessage);
    }
  }

  downloadUpdate(): void {
    try {
      autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Error downloading update:', error);
    }
  }

  installUpdate(): void {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall();
    } else {
      console.warn('No update downloaded to install');
    }
  }

  // Check for updates on app startup (with delay)
  checkForUpdatesOnStartup(): void {
    // Check user preference for auto-updates
    const autoUpdateEnabled = this.configService.getAutoUpdatePreference();
    
    if (autoUpdateEnabled !== false) { // Default to true unless explicitly disabled
      // For beta/development builds, be more conservative about update checking
      const currentVersion = this.getCurrentVersion();
      const isDevelopmentBuild = currentVersion.includes('beta') || currentVersion.includes('dev') || currentVersion.includes('alpha');
      
      if (isDevelopmentBuild) {
        console.log('ℹ️ Development build detected - auto-update checking may not work until official releases are available');
      }
      
      // Wait 10 seconds after startup before checking for updates
      setTimeout(() => {
        this.checkForUpdates();
      }, 10000);
    }
  }

  // Get current version
  getCurrentVersion(): string {
    return autoUpdater.currentVersion?.version || '1.0.0';
  }

  // Check if update is pending
  isUpdatePending(): boolean {
    return this.updateDownloaded;
  }

  // Enable/disable auto-updates
  setAutoUpdateEnabled(enabled: boolean): void {
    this.configService.setAutoUpdatePreference(enabled);
  }

  getAutoUpdateEnabled(): boolean {
    return this.configService.getAutoUpdatePreference() !== false;
  }
}
