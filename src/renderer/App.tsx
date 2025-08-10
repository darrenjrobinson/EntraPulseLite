// Main App component for EntraPulse Lite
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, AppBar, Toolbar, Typography, IconButton, Switch, FormControlLabel, Tooltip } from '@mui/material';
import { Settings as SettingsIcon, Brightness4, Brightness7, Info as InfoIcon } from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ChatComponent } from './components/ChatComponent';
import { AppIcon } from './components/AppIcon';
import { SettingsDialog } from './components/SettingsDialog';
import { EnhancedSettingsDialog } from './components/EnhancedSettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { UpdateNotification } from './components/common/UpdateNotification';
import { LLMConfig } from '../types';
import { VERSION } from '../shared/version';
import { LLMStatusProvider, useLLMStatus } from './context/LLMStatusContext';
import { eventManager } from '../shared/EventManager';
import { useEventCleanup } from './hooks/useEventCleanup';
import { setupEventDiagnostics } from './utils/eventDiagnostics';

// Inner App component that uses LLM status context
interface AppContentProps {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const AppContent: React.FC<AppContentProps> = ({ settingsOpen, setSettingsOpen }) => {
  // Use event cleanup hook to prevent memory leaks
  useEventCleanup(30); // Clean up every 30 minutes
  
  const [darkMode, setDarkMode] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [aboutOpen, setAboutOpen] = useState(false);
  const [configReloadTimeout, setConfigReloadTimeout] = useState<NodeJS.Timeout | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'openai', // Default to cloud for better initial experience
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
    apiKey: '',
    preferLocal: false
  });

  // Access LLM status context
  const { forceCheck } = useLLMStatus();

  // Refs to hold current state values for event handlers
  const settingsOpenRef = useRef(settingsOpen);
  const configReloadTimeoutRef = useRef(configReloadTimeout);
  
  // Update refs when state changes
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);
  
  useEffect(() => {
    configReloadTimeoutRef.current = configReloadTimeout;
  }, [configReloadTimeout]);

  // Stable callbacks that don't change between renders
  const stableCheckAuthStatus = useCallback(async () => {
    try {
      const token = await window.electronAPI?.auth?.getToken();
      setIsAuthenticated(!!token);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
    }
  }, []);

  const stableLoadLLMConfig = useCallback(async () => {
    try {
      const savedConfig = await window.electronAPI?.config?.getLLMConfig();
      if (savedConfig) {
        setLlmConfig(savedConfig);
      }
    } catch (error) {
      console.error('Error loading LLM config:', error);
    }
  }, []);

  const stableForceCheck = useCallback(() => {
    forceCheck();
  }, [forceCheck]);

  // Setup event diagnostics for development
  useEffect(() => {
    setupEventDiagnostics();
    
    // Add listener for main process debug messages
    const electronAPI = window.electronAPI as any;
    if (electronAPI?.on) {
      const handleMainDebug = (_event: any, message: string) => {
        console.log(`[MAIN-DEBUG] ${message}`);
      };
      
      electronAPI.on('main-debug', handleMainDebug);
      
      // Cleanup
      return () => {
        electronAPI.removeListener('main-debug', handleMainDebug);
      };
    }
  }, []);
  
  // Create dynamic theme based on mode - use useMemo to make it reactive
  const theme = useMemo(() => createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: '#0078d4',
      },
      secondary: {
        main: '#00bcf2',
      },
      background: {
        default: darkMode ? '#1e1e1e' : '#ffffff',
        paper: darkMode ? '#2d2d30' : '#f5f5f5',
      },
      // Explicit text colors for both modes
      text: {
        primary: darkMode ? '#ffffff' : '#363636',
        secondary: darkMode ? '#b3b3b3' : '#757575',
      },
      // Add custom colors for better dark mode contrast
      ...(darkMode && {
        info: {
          main: '#87ceeb', // Light sky blue for better contrast in dark mode
        },
      }),
    },
    typography: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
    },
    components: {      // Override Material-UI link styles
      MuiLink: {
        styleOverrides: {
          root: {
            color: darkMode ? '#87ceeb' : '#1976d2',
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
              color: darkMode ? '#add8e6' : '#1565c0', // Lighter on hover
            },
            '&:visited': {
              color: darkMode ? '#dda0dd' : '#7b1fa2', // Plum for visited links in dark mode
            },
          },
        },
      },      // Override Typography components to ensure proper text colors
      MuiTypography: {
        styleOverrides: {
          root: {
            // Ensure text color follows theme
            color: 'inherit',
            '& a': {
              color: darkMode ? '#87ceeb' : '#1976d2',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
                color: darkMode ? '#add8e6' : '#1565c0',
              },
              '&:visited': {
                color: darkMode ? '#dda0dd' : '#7b1fa2',
              },
            },
          },
          subtitle2: {
            // Explicitly set subtitle2 text color
            color: darkMode ? '#ffffff' : '#363636',
          },
        },
      },
    },
  }), [darkMode]); // Re-create theme when darkMode changes

  useEffect(() => {
    // Check authentication status on app load
    stableCheckAuthStatus();
    // Load saved LLM configuration
    stableLoadLLMConfig();    // Listen for authentication configuration availability
    const handleConfigurationAvailable = (event: any, data: any) => {
      console.log('🔄 [App.tsx] Configuration available - checking if settings dialog is open:', settingsOpenRef.current);
      
      // If settings dialog is open, skip the configuration reload entirely to prevent interference
      if (settingsOpenRef.current) {
        console.log('🔄 [App.tsx] Settings dialog is open - skipping configuration reload to prevent form clearing');
        return;
      }
      
      // Clear any existing timeout
      if (configReloadTimeoutRef.current) {
        clearTimeout(configReloadTimeoutRef.current);
      }
      
      // Small delay to ensure stability
      const timeoutId = setTimeout(() => {
        console.log('🔄 [App.tsx] Executing configuration reload');
        // Reload configuration now that authentication is verified
        stableLoadLLMConfig();
        // Also update authentication status
        stableCheckAuthStatus();
        // Force LLM status check through the context
        stableForceCheck();
        setConfigReloadTimeout(null);
      }, 100);
      
      setConfigReloadTimeout(timeoutId);
    };

    // Listen for LLM status refresh requests (e.g., after MCP servers are ready)
    const handleLLMStatusRefresh = (event: any, data: any) => {
      console.log('🔄 [App.tsx] LLM status refresh requested from:', data?.source);
      // Force immediate LLM status check and config reload
      stableForceCheck();
      stableLoadLLMConfig();
    };

    // Add the IPC listener using the exposed API with EventManager
    const electronAPI = window.electronAPI as any;
    if (electronAPI?.on) {
      // Use EventManager for better memory management
      eventManager.addEventListener(
        'auth:configurationAvailable', 
        handleConfigurationAvailable, 
        'App.tsx-config',
        electronAPI
      );
      
      eventManager.addEventListener(
        'llm:forceStatusRefresh', 
        handleLLMStatusRefresh, 
        'App.tsx-refresh',
        electronAPI
      );
      
      // Cleanup function to remove the listener
      return () => {
        if (configReloadTimeout) {
          clearTimeout(configReloadTimeout);
        }
        
        // Use EventManager for cleanup
        eventManager.removeEventListener('auth:configurationAvailable', 'App.tsx-config', electronAPI);
        eventManager.removeEventListener('llm:forceStatusRefresh', 'App.tsx-refresh', electronAPI);
      };    }
  }, []); // Remove dependencies to prevent re-running when state changes

  const handleThemeToggle = () => {
    setDarkMode(!darkMode);
  };
  const handleSettings = () => {
    console.log('🔧 [App.tsx] Opening settings dialog');
    setSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    console.log('🔧 [App.tsx] Closing settings dialog');
    setSettingsOpen(false);
  };

  const handleAboutOpen = () => {
    setAboutOpen(true);
  };

  const handleAboutClose = () => {
    setAboutOpen(false);
  };

  const handleSaveSettings = async (newConfig: LLMConfig) => {
    try {
      console.log('[App] handleSaveSettings - Received config:', {
        provider: newConfig.provider,
        temperature: newConfig.temperature,
        maxTokens: newConfig.maxTokens,
        preferLocal: newConfig.preferLocal,
        model: newConfig.model
      });
      
      await window.electronAPI?.config?.saveLLMConfig(newConfig);
      setLlmConfig(newConfig);
      
      console.log('[App] handleSaveSettings - Configuration saved successfully');
      console.log('[App] handleSaveSettings - Updated state with:', {
        provider: newConfig.provider,
        temperature: newConfig.temperature,
        maxTokens: newConfig.maxTokens,
        preferLocal: newConfig.preferLocal,
        model: newConfig.model
      });
    } catch (error) {
      console.error('Failed to save LLM configuration:', error);
    }  };
  
  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh',
        bgcolor: 'background.default' 
      }}>
        {/* App Bar */}
        <AppBar position="static" elevation={1}>
          <Toolbar>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AppIcon size={32} sx={{ marginRight: 1 }} />
              <Box>
                <Typography variant="h6" component="div">
                  EntraPulse Lite
                </Typography>
                <Tooltip title="Application Version">
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      opacity: 0.7, 
                      fontSize: '0.6rem',
                      lineHeight: 1,
                      display: 'block',
                      marginTop: '-3px'
                    }}
                  >
                    v{VERSION}
                  </Typography>
                </Tooltip>
              </Box>
            </Box>
            
            <Box sx={{ flexGrow: 1 }} />
            
            <FormControlLabel
              control={
                <Switch 
                  checked={darkMode} 
                  onChange={handleThemeToggle}
                  icon={<Brightness7 />}
                  checkedIcon={<Brightness4 />}
                />
              }
              label=""
              sx={{ mr: 1 }}
            />
            
            <IconButton
              size="large"
              edge="end"
              color="inherit"
              onClick={handleSettings}
            >
              <SettingsIcon />
            </IconButton>
            
            <IconButton
              size="large"
              edge="end"
              color="inherit"
              onClick={() => setAboutOpen(true)}
              sx={{ ml: 1 }}
            >
              <InfoIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <ChatComponent />
        </Box>

        {/* Settings Dialog */}        <EnhancedSettingsDialog
          open={settingsOpen}
          onClose={handleSettingsClose}
          currentConfig={llmConfig}
          onSave={handleSaveSettings}
        />

        {/* About Dialog */}
        <AboutDialog
          open={aboutOpen}
          onClose={handleAboutClose}
        />

        {/* Update Notification Component */}
        <UpdateNotification />
      </Box>
    </ThemeProvider>
  );
};

// Main App component that provides LLM status context
export const App: React.FC = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  return (
    <LLMStatusProvider 
      pollingInterval={15000} 
      pausePolling={settingsOpen} // Pause polling when settings dialog is open
    >
      <AppContent 
        settingsOpen={settingsOpen} 
        setSettingsOpen={setSettingsOpen} 
      />
    </LLMStatusProvider>
  );
};
