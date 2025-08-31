import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Box,
  Alert,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  CircularProgress,
  Chip,
  IconButton,
  Card,
  CardContent,
  CardActions,
  Tooltip,
  Paper,
  Radio,
  RadioGroup
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';
import UpdateIcon from '@mui/icons-material/Update';
import { LLMConfig, CloudLLMProviderConfig, EntraConfig } from '../../types';

interface EnhancedSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  currentConfig: LLMConfig;
  onSave: (config: LLMConfig) => void;
}

interface CloudProviderState {
  provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
  config: CloudLLMProviderConfig;
  isDefault: boolean;
}

// Auto-Update Settings Component
const AutoUpdateSettings: React.FC = () => {
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [currentVersion, setCurrentVersion] = useState('');
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<Date | null>(null);

  useEffect(() => {
    // Load current auto-update preference
    const loadAutoUpdatePreference = async () => {
      try {
        const enabled = await window.electronAPI?.updater?.getAutoUpdateEnabled();
        setAutoUpdateEnabled(enabled !== false);
        
        const version = await window.electronAPI?.updater?.getCurrentVersion() || 
                        await window.electronAPI?.app?.getVersion?.();
        setCurrentVersion(version || '1.0.0');
      } catch (error) {
        console.error('Failed to load auto-update preference:', error);
      }
    };

    loadAutoUpdatePreference();
  }, []);

  const handleAutoUpdateToggle = async (enabled: boolean) => {
    try {
      await window.electronAPI?.updater?.setAutoUpdateEnabled(enabled);
      setAutoUpdateEnabled(enabled);
    } catch (error) {
      console.error('Failed to update auto-update preference:', error);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      await window.electronAPI?.updater?.checkForUpdates();
      setLastUpdateCheck(new Date());
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={autoUpdateEnabled}
              onChange={(e) => handleAutoUpdateToggle(e.target.checked)}
              color="primary"
            />
          }
          label="Enable automatic updates"
        />
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', ml: 4 }}>
          Automatically download and install updates when they become available.
        </Typography>
      </Grid>

      <Grid item xs={12}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="body2" color="textSecondary">
            Current version: {currentVersion}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={isCheckingUpdates ? <CircularProgress size={16} /> : <UpdateIcon />}
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdates}
          >
            {isCheckingUpdates ? 'Checking...' : 'Check for Updates'}
          </Button>
        </Box>
        {lastUpdateCheck && (
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
            Last checked: {lastUpdateCheck.toLocaleString()}
          </Typography>
        )}
      </Grid>

      {!autoUpdateEnabled && (
        <Grid item xs={12}>
          <Alert severity="warning" sx={{ mt: 1 }}>
            <strong>Auto-updates disabled:</strong> You will need to manually check for and install updates.
            We recommend keeping auto-updates enabled to ensure you have the latest features and security fixes.
          </Alert>
        </Grid>
      )}
    </Grid>
  );
};

export const EnhancedSettingsDialog: React.FC<EnhancedSettingsDialogProps> = ({
  open,
  onClose,
  currentConfig,
  onSave
}) => {  const [config, setConfig] = useState<LLMConfig>(currentConfig);
  const [cloudProviders, setCloudProviders] = useState<CloudProviderState[]>([]);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; details?: any } | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [isLoadingModels, setIsLoadingModels] = useState<Record<string, boolean>>({});
  const [modelFetchError, setModelFetchError] = useState<Record<string, string>>({});
  const [defaultCloudProvider, setDefaultCloudProvider] = useState<'openai' | 'anthropic' | 'gemini' | 'azure-openai' | null>(null);
  const [entraConfig, setEntraConfig] = useState<EntraConfig | null>(null);
  const [isLoadingEntraConfig, setIsLoadingEntraConfig] = useState(false);
  const [graphPermissions, setGraphPermissions] = useState<{
    granted: string[];
    available: string[];
    loading: boolean;
    error?: string;
  }>({ granted: [], available: [], loading: false });
  const [tenantInfo, setTenantInfo] = useState<{
    tenantId?: string;
    tenantDisplayName?: string;
    loading: boolean;
    error?: string;
  }>({ loading: false });

  // Utility functions
  const getDefaultModel = (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): string => {
    switch (provider) {
      case 'openai': return 'gpt-4o-mini';
      case 'anthropic': return 'claude-sonnet-4-20250514';
      case 'gemini': return 'gemini-1.5-pro';
      case 'azure-openai': return 'gpt-35-turbo';
      default: return 'gpt-4o-mini';
    }
  };

  const getProviderDisplayName = (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai' | null): string => {
    if (!provider) return 'None';
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic (Claude)';
      case 'gemini': return 'Google Gemini';
      case 'azure-openai': return 'Azure OpenAI';
      default: return provider;
    }
  };

  // Model validation functions
  const getValidModelsForProvider = (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): string[] => {
    switch (provider) {
      case 'openai':
        return [
          'gpt-4o',
          'gpt-4o-mini', 
          'gpt-4-turbo',
          'gpt-4',
          'gpt-3.5-turbo'
        ];
      case 'anthropic':
        return [
          'claude-sonnet-4-20250514',      // Latest Claude 4 Sonnet (June 2025)
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];
      case 'gemini':
        return [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-1.0-pro',
          'gemini-pro',
          'gemini-pro-vision'
        ];
      case 'azure-openai':
        return [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-4',
          'gpt-35-turbo'
        ];
      default:
        return [];
    }
  };

  const isValidModelForProvider = (model: string, provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): boolean => {
    const validModels = getValidModelsForProvider(provider);
    return validModels.includes(model);
  };

  const validateAndFixModel = (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai', currentModel: string): string => {
    if (isValidModelForProvider(currentModel, provider)) {
      return currentModel;
    }
    
    // Return the default model for the provider if current model is invalid
    const defaultModel = getDefaultModel(provider);
    console.warn(`Model "${currentModel}" is not valid for provider "${provider}". Using default: "${defaultModel}"`);
    return defaultModel;
  };

  const loadGraphPermissions = async () => {
    // Throttle calls to prevent rapid successive calls
    const now = Date.now();
    if (now - lastGraphPermissionsLoadRef.current < 30000) { // 30 second minimum between calls (increased from 10)
      console.log('🔄 Skipping graph permissions load - too soon since last attempt');
      return;
    }
    
    // Load permissions for both Enhanced Graph Access and custom applications
    const shouldLoadPermissions = entraConfig?.useGraphPowerShell || 
                                 (entraConfig?.clientId && entraConfig?.clientId.trim());
    
    console.log('🔍 Loading graph permissions check:', {
      useGraphPowerShell: entraConfig?.useGraphPowerShell,
      hasClientId: Boolean(entraConfig?.clientId && entraConfig?.clientId.trim()),
      shouldLoadPermissions
    });
    
    if (!shouldLoadPermissions) {
      console.log('❌ Not loading permissions - neither Enhanced Graph Access nor custom client ID configured');
      setGraphPermissions({ granted: [], available: [], loading: false });
      return;
    }

    lastGraphPermissionsLoadRef.current = now;

    try {
      setGraphPermissions(prev => ({ ...prev, loading: true, error: undefined }));
      
      const electronAPI = window.electronAPI as any;
      
      // Get the actual current permissions from the access token
      const currentPermissions = await electronAPI.auth.getCurrentGraphPermissions();
      
      if (currentPermissions.error) {
        throw new Error(currentPermissions.error);
      }
      
      // Delegated permissions - different sets for Enhanced Graph Access vs Custom Apps
      let requiredPermissions: string[];
      
      if (entraConfig?.useGraphPowerShell) {
        // Enhanced Graph Access permissions
        console.log('📋 Using Enhanced Graph Access permission set');
        requiredPermissions = [
          'User.Read',
          'User.ReadBasic.All', 
          'Mail.Read',
          'Mail.ReadWrite',
          'Calendars.Read',
          'Files.Read.All',
          'Directory.Read.All'
        ];
      } else {
        // For custom applications, use the actual granted permissions as the "available" set
        // since we don't know what permissions are configured in their Azure app registration
        console.log('📋 Using custom application permissions - actual granted permissions:', currentPermissions.permissions);
        requiredPermissions = currentPermissions.permissions || [
          'User.Read',
          'profile',
          'openid',
          'email'
        ];
      }
      
      console.log('✅ Graph permissions loaded successfully:', {
        granted: currentPermissions.permissions || [],
        available: requiredPermissions,
        mode: entraConfig?.useGraphPowerShell ? 'Enhanced Graph Access' : 'Custom Application'
      });

      setGraphPermissions({
        granted: currentPermissions.permissions || [],
        available: requiredPermissions,
        loading: false
      });
      
    } catch (error) {
      console.error('Failed to load graph permissions:', error);
      setGraphPermissions(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Failed to load permissions' 
      }));
    }
  };

  // Add ref to track last successful load time to prevent rapid reloading
  const lastTenantInfoLoadRef = useRef<number>(0);
  const lastGraphPermissionsLoadRef = useRef<number>(0);

  const loadTenantInfo = async () => {
    // Throttle calls to prevent rapid successive calls
    const now = Date.now();
    if (now - lastTenantInfoLoadRef.current < 30000) { // 30 second minimum between calls (increased from 10)
      console.log('🔄 Skipping tenant info load - too soon since last attempt');
      return;
    }
    
    lastTenantInfoLoadRef.current = now;
    
    try {
      setTenantInfo(prev => ({ ...prev, loading: true, error: undefined }));
      
      const electronAPI = window.electronAPI as any;
      
      // First check if user is authenticated
      try {
        const authStatus = await electronAPI.auth.getAuthenticationInfo();
        if (!authStatus?.isAuthenticated) {
          console.log('🔒 User not authenticated, skipping tenant info load');
          setTenantInfo({
            loading: false,
            error: 'User not authenticated'
          });
          return;
        }
      } catch (authError) {
        console.log('🔒 Could not check authentication status:', authError);
        setTenantInfo({
          loading: false,
          error: 'Could not verify authentication'
        });
        return;
      }
      
      // User is authenticated, proceed with tenant info lookup
      console.log('🔍 User is authenticated, loading tenant info...');
      const tenantData = await electronAPI.auth.getTenantInfo();
      
      if (tenantData.error) {
        throw new Error(tenantData.error);
      }
      
      setTenantInfo({
        tenantId: tenantData.tenantId,
        tenantDisplayName: tenantData.tenantDisplayName,
        loading: false
      });
      
      console.log('🏢 Tenant info loaded:', {
        tenantId: tenantData.tenantId,
        displayName: tenantData.tenantDisplayName,
        source: tenantData.tenantDisplayName === tenantData.tenantId ? 'fallback' : 'graph-api'
      });
      
    } catch (error) {
      console.error('Failed to load tenant info:', error);
      setTenantInfo(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to load tenant information'
      }));
    }
  };

  useEffect(() => {
    setConfig(currentConfig);
  }, [currentConfig]);  useEffect(() => {
    if (open) {
      loadCloudProviders();
      loadEntraConfig();
      loadGraphPermissions();
      loadTenantInfo();
    }
  }, [open]); // Only reload when dialog opens, not on every config change

  // Listen for authentication state changes and reload tenant info
  useEffect(() => {
    if (!open) return;

    const electronAPI = window.electronAPI as any;
    
    // Set up event listeners for authentication events
    const handleAuthSuccess = () => {
      console.log('🔐 Authentication success detected, reloading tenant info...');
      setTimeout(() => {
        loadTenantInfo();
        loadGraphPermissions();
      }, 1000); // Small delay to ensure token is fully available
    };

    const handleAuthFailure = () => {
      console.log('🔒 Authentication failure detected, clearing tenant info...');
      setTenantInfo({
        loading: false,
        error: 'Authentication failed'
      });
    };

    // Listen for auth events if available
    if (electronAPI.auth?.onAuthStateChange) {
      electronAPI.auth.onAuthStateChange((state: { isAuthenticated: boolean }) => {
        if (state.isAuthenticated) {
          handleAuthSuccess();
        } else {
          handleAuthFailure();
        }
      });
    }

    // Also check periodically if auth state changed while dialog is open
    const authCheckInterval = setInterval(async () => {
      try {
        const authStatus = await electronAPI.auth.getAuthenticationInfo();
        
        // Check if we need to load tenant info
        // Only load if: authenticated, has error indicating no auth, and no tenantId yet
        const needsTenantInfo = authStatus?.isAuthenticated && 
                               (tenantInfo.error === 'User not authenticated' || tenantInfo.error === 'Could not verify authentication') &&
                               !tenantInfo.tenantId &&
                               !tenantInfo.loading;
        
        if (needsTenantInfo) {
          console.log('🔄 Authentication detected during periodic check, reloading tenant info...');
          loadTenantInfo();
        }
        
        // Check if we need to load graph permissions (separate condition)
        // Only load if: authenticated, no permissions granted yet, not loading, and no existing error
        const needsGraphPermissions = authStatus?.isAuthenticated && 
                                    graphPermissions.granted.length === 0 && 
                                    !graphPermissions.loading && 
                                    !graphPermissions.error;
        
        if (needsGraphPermissions) {
          console.log('🔄 Loading graph permissions during periodic check...');
          loadGraphPermissions();
        }
      } catch (error) {
        // Ignore errors during periodic check
      }
    }, 30000); // Increased to 30 seconds to reduce frequency

    return () => {
      clearInterval(authCheckInterval);
    };
  }, [open]); // Remove tenantInfo.error from dependencies to prevent restart loops

  // Load permissions when entraConfig changes (after save)
  useEffect(() => {
    if (open && entraConfig) {
      console.log('🔄 Entra config changed, reloading permissions...');
      loadGraphPermissions();
    }
  }, [entraConfig, open]);

  const loadCloudProviders = async () => {
    try {
      const electronAPI = window.electronAPI as any; // Temporary type assertion
      const configured = await electronAPI.config.getConfiguredCloudProviders();
      const defaultProvider = await electronAPI.config.getDefaultCloudProvider();
      
      setDefaultCloudProvider(defaultProvider?.provider || null);
      
      console.log('📋 [CloudProviders] Loading configured providers:', configured.map((p: { provider: string }) => p.provider));
      
      const providers: CloudProviderState[] = configured.map((item: { provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'; config: CloudLLMProviderConfig }) => {
        // Make a deep copy of the config
        const configCopy = { ...item.config };
        
        // Add enhanced logging for Azure OpenAI
        if (item.provider === 'azure-openai') {
          const baseUrl = item.config.baseUrl || '';
          console.log('🔍 [Azure OpenAI Debug] Loaded config:', {
            baseUrl: baseUrl,
            model: item.config.model,
            hasApiKey: !!item.config.apiKey,
            isValid: baseUrl.includes('/chat/completions') && baseUrl.includes('api-version=') && baseUrl.includes('/deployments/')
          });
          
          // Check URL format completeness
          const issues = [];
          if (!baseUrl.includes('/chat/completions')) {
            issues.push('missing /chat/completions path');
          }
          if (!baseUrl.includes('api-version=')) {
            issues.push('missing api-version parameter');
          }
          if (!baseUrl.includes('/deployments/')) {
            issues.push('missing /deployments/ path');
          }
          
          if (issues.length > 0) {
            console.warn(`⚠️ [Azure OpenAI Debug] URL has issues: ${issues.join(', ')}`);
          } else {
            console.log('✅ [Azure OpenAI Debug] URL format is correct');
          }
        }
        
        return {
          provider: item.provider,
          config: configCopy,
          isDefault: item.provider === defaultProvider?.provider
        };
      });
      
      setCloudProviders(providers);
    } catch (error) {
      console.error('Failed to load cloud providers:', error);
    }
  };

  const loadEntraConfig = async () => {
    try {
      setIsLoadingEntraConfig(true);
      const electronAPI = window.electronAPI as any;
      const config = await electronAPI.config.getEntraConfig();
      setEntraConfig(config);
      console.log('📋 [EntraConfig] Loaded Entra config:', config ? 'Yes' : 'No');
    } catch (error) {
      console.error('❌ Failed to load Entra config:', error);
      setEntraConfig(null);
    } finally {
      setIsLoadingEntraConfig(false);
    }
  };

  const handleSaveCloudProvider = async (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai', providerConfig: CloudLLMProviderConfig) => {
    try {
      // Enhanced logging for Azure OpenAI
      if (provider === 'azure-openai') {
        console.log('🔄 [Azure OpenAI Debug] Saving Azure OpenAI config:', { 
          baseUrl: providerConfig.baseUrl,
          model: providerConfig.model,
          hasApiKey: !!providerConfig.apiKey,
          hasCorrectUrlFormat: providerConfig.baseUrl?.includes('/chat/completions') && providerConfig.baseUrl?.includes('api-version=')
        });
      } else {
        console.log('🔄 Saving cloud provider config:', { provider, config: { ...providerConfig, apiKey: '[REDACTED]' } });
      }
      
      const electronAPI = window.electronAPI as any; // Temporary type assertion      // For Azure OpenAI, enforce URL format before saving
      if (provider === 'azure-openai') {
        // Validate and fix URL if needed
        if (providerConfig.baseUrl) {
          // Trim whitespace and normalize URL
          const cleanUrl = providerConfig.baseUrl.trim();
          console.log(`🔍 [Azure OpenAI Debug] Processing URL for save: "${cleanUrl}"`);          
          // Check if URL has all required components
          const hasDeploymentPath = cleanUrl.includes('/deployments/');
          const hasChatCompletions = cleanUrl.includes('/chat/completions');
          const hasApiVersion = cleanUrl.includes('api-version=');
          const isAzureUrl = cleanUrl.includes('openai.azure.com');
          
          if (!isAzureUrl) {
            alert('Invalid Azure OpenAI URL. Must contain "openai.azure.com"');
            return;
          }
          
          // If URL is incomplete, build complete URL
          if (!hasDeploymentPath || !hasChatCompletions || !hasApiVersion) {
            console.log(`🔧 [Azure OpenAI Debug] URL is incomplete, building complete version...`);
            
            // Start with base URL (remove trailing slashes)
            let baseEndpoint = cleanUrl.replace(/\/+$/, '');
            
            // Remove any existing incomplete paths to start fresh
            if (baseEndpoint.includes('/openai/deployments/')) {
              baseEndpoint = baseEndpoint.split('/openai/deployments/')[0];
            } else if (baseEndpoint.includes('/openai/')) {
              baseEndpoint = baseEndpoint.split('/openai/')[0];
            }
            
            // Build complete URL with all required components
            const completeUrl = `${baseEndpoint}/openai/deployments/${providerConfig.model}/chat/completions?api-version=2025-01-01-preview`;
            
            console.log(`🔧 [Azure OpenAI Debug] Built complete URL: "${completeUrl}"`);
            
            // Confirm with user
            const userConfirm = confirm(`To ensure proper functionality, the Azure OpenAI endpoint URL will be formatted as:\n\n${completeUrl}\n\nContinue with this URL?`);
            
            if (!userConfirm) {
              console.log(`❌ [Azure OpenAI Debug] User cancelled URL modification`);
              return;
            }
            
            // Update the URL with complete version
            providerConfig.baseUrl = completeUrl;
          } else {
            console.log(`✅ [Azure OpenAI Debug] URL is already correctly formatted: ${cleanUrl}`);
            // Ensure we use the cleaned URL
            providerConfig.baseUrl = cleanUrl;
          }
          
          // Final verification log
          console.log(`✅ [Azure OpenAI Debug] Final URL being saved: "${providerConfig.baseUrl}"`);
        } else {
          alert('Azure OpenAI endpoint URL is required');
          return;
        }
      }
      
      await electronAPI.config.saveCloudProviderConfig(provider, providerConfig);
      
      console.log('✅ Cloud provider config saved successfully');
      
      // Refresh the cloud providers list
      await loadCloudProviders();
      
      // Auto-fetch models if API key is provided
      if (providerConfig.apiKey) {
        await fetchAvailableModels(provider, providerConfig.apiKey);
      }} catch (error) {
      console.error('❌ Failed to save cloud provider config:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to save ${provider} configuration: ${errorMessage}`);
    }
  };

  const handleSaveEntraConfig = async (newEntraConfig: EntraConfig) => {
    try {
      setIsLoadingEntraConfig(true);
      const electronAPI = window.electronAPI as any;
      
      console.log('🔄 Saving Entra config:', {
        clientId: newEntraConfig.clientId ? '[REDACTED]' : 'none',
        tenantId: newEntraConfig.tenantId ? '[REDACTED]' : 'none'
      });

      await electronAPI.config.saveEntraConfig(newEntraConfig);
      setEntraConfig(newEntraConfig);
      
      console.log('✅ Entra config saved successfully');
    } catch (error) {
      console.error('❌ Failed to save Entra config:', error);
      throw error;
    } finally {
      setIsLoadingEntraConfig(false);
    }
  };

  const handleClearEntraConfig = async () => {
    try {
      setIsLoadingEntraConfig(true);
      const electronAPI = window.electronAPI as any;
      await electronAPI.config.clearEntraConfig();
      setEntraConfig(null);
      
      console.log('✅ Entra config cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear Entra config:', error);
      throw error;
    } finally {
      setIsLoadingEntraConfig(false);
    }
  };

  const fetchAvailableModels = async (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai', apiKey: string) => {
    if (provider === 'gemini') {
      // Gemini models are predefined
      setAvailableModels(prev => ({
        ...prev,
        [provider]: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
      }));
      return;
    }

    if (provider === 'azure-openai') {
      // Azure OpenAI models are typically predefined by the Azure deployment
      setAvailableModels(prev => ({
        ...prev,
        [provider]: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-35-turbo']
      }));
      return;
    }

    if (!apiKey) {
      setAvailableModels(prev => ({ ...prev, [provider]: [] }));
      return;
    }

    setIsLoadingModels(prev => ({ ...prev, [provider]: true }));
    setModelFetchError(prev => ({ ...prev, [provider]: '' }));
    
    try {
      const tempConfig: LLMConfig = {
        ...config,
        provider,
        apiKey
      };

      const models = await window.electronAPI.llm.getAvailableModels?.(tempConfig) || [];
      const uniqueModels = [...new Set(models)].sort();
      setAvailableModels(prev => ({ ...prev, [provider]: uniqueModels }));
      
      if (uniqueModels.length === 0) {
        setModelFetchError(prev => ({ ...prev, [provider]: 'No models found. Please check your API key.' }));
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModelFetchError(prev => ({ ...prev, [provider]: 'Failed to fetch models. Please check your API key and try again.' }));
      setAvailableModels(prev => ({ ...prev, [provider]: [] }));
    } finally {
      setIsLoadingModels(prev => ({ ...prev, [provider]: false }));
    }
  };  const handleSetDefaultProvider = async (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => {
    try {
      const electronAPI = window.electronAPI as any; // Temporary type assertion
      await electronAPI.config.setDefaultCloudProvider(provider);
      setDefaultCloudProvider(provider);
      
      // Validate and fix model for the new provider
      const currentProvider = cloudProviders.find(p => p.provider === provider);
      if (currentProvider) {
        const validModel = validateAndFixModel(provider, currentProvider.config.model);
        if (validModel !== currentProvider.config.model) {
          console.log(`Switching model from "${currentProvider.config.model}" to "${validModel}" for provider "${provider}"`);
          
          // Update the cloud provider with the valid model
          setCloudProviders(prev => prev.map(p => p.provider === provider ? {
            ...p,
            config: {
              ...p.config,
              model: validModel
            },
            isDefault: true
          } : {
            ...p,
            isDefault: false
          }));
          
          // Save the updated model to the backend
          await electronAPI.config.updateCloudProvider(provider, {
            ...currentProvider,
            model: validModel
          });
        } else {
          // Just update the default status
          setCloudProviders(prev => prev.map(p => ({
            ...p,
            isDefault: p.provider === provider
          })));
        }
      } else {
        // Provider not found, just update default status
        setCloudProviders(prev => prev.map(p => ({
          ...p,
          isDefault: p.provider === provider
        })));
      }
    } catch (error) {
      console.error('Failed to set default provider:', error);
    }
  };
  const handleRemoveProvider = async (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => {
    try {
      console.log(`🗑️ [CloudProvider] Removing provider: ${provider}`);
      
      const electronAPI = window.electronAPI as any; // Temporary type assertion
      await electronAPI.config.removeCloudProviderConfig(provider);
      
      console.log(`🗑️ [CloudProvider] Provider ${provider} removal completed, reloading providers...`);
      
      // Reload the providers to update the UI
      await loadCloudProviders();
      
      console.log(`🗑️ [CloudProvider] UI updated after removing ${provider}`);
    } catch (error) {
      console.error(`Failed to remove provider ${provider}:`, error);
    }
  };  const handleTestConnection = async (config: CloudLLMProviderConfig): Promise<boolean> => {
    try {
      // Create a temporary LLMConfig for testing
      const testConfig = {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl, // Include baseUrl for Azure OpenAI and other providers that need it
        organization: config.organization,
        temperature: config.temperature,
        maxTokens: config.maxTokens
      };

      const success = await window.electronAPI.llm.testConnection(testConfig);
      return success;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  };

  const handleTestLocalConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setTestResult(null);
    
    try {
      // Create a test config for the local LLM
      const testConfig = {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: '', // Local LLMs typically don't need API keys
        temperature: config.temperature,
        maxTokens: config.maxTokens
      };

      const success = await window.electronAPI.llm.testConnection(testConfig);
      
      if (success) {
        setConnectionStatus('success');
        setTestResult({ success: true });
      } else {
        setConnectionStatus('error');
        setTestResult({ 
          success: false, 
          error: `Failed to connect to ${config.provider}. Please check that the service is running and the URL is correct.` 
        });
      }
    } catch (error) {
      console.error('Local LLM connection test failed:', error);
      setConnectionStatus('error');
      setTestResult({ 
        success: false, 
        error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });    } finally {
      setIsTestingConnection(false);
    }
  };

  const fetchLocalModels = async () => {
    if (!config.baseUrl) {
      setModelFetchError({ ...modelFetchError, local: 'Base URL is required to fetch models' });
      return;
    }

    setIsLoadingModels({ ...isLoadingModels, local: true });
    setModelFetchError({ ...modelFetchError, local: '' });

    try {
      const testConfig = {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model // This is for the connection test
      };

      const models = await window.electronAPI.llm.getAvailableModels(testConfig);
      setAvailableModels({ ...availableModels, local: models });
      
      if (models.length === 0) {
        setModelFetchError({ 
          ...modelFetchError, 
          local: `No models found. Make sure ${config.provider} is running and has models installed.` 
        });
      }
    } catch (error) {
      console.error('Failed to fetch local models:', error);
      setModelFetchError({ 
        ...modelFetchError, 
        local: `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    } finally {
      setIsLoadingModels({ ...isLoadingModels, local: false });
    }
  };
  
  const handleSave = async () => {
    let finalConfig = { ...config };
    
    console.log('[EnhancedSettingsDialog] handleSave - Original config:', {
      provider: config.provider,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      preferLocal: config.preferLocal,
      model: config.model,
      hasCloudProviders: !!config.cloudProviders,
      cloudProviderKeys: config.cloudProviders ? Object.keys(config.cloudProviders) : 'none'
    });
    
    // Get current cloud provider configurations to include in final config
    const electronAPI = window.electronAPI as any;
    const currentCloudProviders = await electronAPI.config.getConfiguredCloudProviders();
    
    // Convert to the cloudProviders format
    const cloudProvidersConfig: Record<string, CloudLLMProviderConfig> = {};
    currentCloudProviders.forEach((item: { provider: string; config: CloudLLMProviderConfig }) => {
      cloudProvidersConfig[item.provider] = { ...item.config };
    });
    
    console.log('[EnhancedSettingsDialog] handleSave - Current cloud providers:', {
      providers: Object.keys(cloudProvidersConfig),
      azureOpenAIUrl: cloudProvidersConfig['azure-openai']?.baseUrl
    });
    
    // For local providers (ollama, lmstudio), use the config as-is
    if (config.provider === 'ollama' || config.provider === 'lmstudio') {
      finalConfig = {
        ...config,
        // Ensure these values are preserved for local providers
        temperature: config.temperature || 0.2,
        maxTokens: config.maxTokens || 4096,
        preferLocal: config.preferLocal || false,
        // Include current cloud providers
        cloudProviders: cloudProvidersConfig
      };
    } else {
      // For cloud providers, DON'T set root-level baseUrl/apiKey
      // The cloud provider configs should remain in the cloudProviders section
      finalConfig = {
        ...config,
        // Remove any root-level cloud provider credentials
        baseUrl: undefined,
        apiKey: undefined,
        organization: undefined,
        // Keep user settings
        temperature: config.temperature || 0.2,
        maxTokens: config.maxTokens || 4096,
        preferLocal: config.preferLocal || false,
        // Include current cloud providers
        cloudProviders: cloudProvidersConfig
      };
    }

    // Always include the current default cloud provider
    if (defaultCloudProvider) {
      finalConfig.defaultCloudProvider = defaultCloudProvider;
    }

    console.log('[EnhancedSettingsDialog] handleSave - Final config being saved:', {
      provider: finalConfig.provider,
      temperature: finalConfig.temperature,
      maxTokens: finalConfig.maxTokens,
      preferLocal: finalConfig.preferLocal,
      model: finalConfig.model,
      defaultCloudProvider: finalConfig.defaultCloudProvider,
      hasRootLevelBaseUrl: !!finalConfig.baseUrl,
      hasRootLevelApiKey: !!finalConfig.apiKey,
      hasCloudProviders: !!finalConfig.cloudProviders,
      cloudProviderKeys: finalConfig.cloudProviders ? Object.keys(finalConfig.cloudProviders) : 'none',
      azureOpenAIUrl: finalConfig.cloudProviders?.['azure-openai']?.baseUrl
    });    onSave(finalConfig);
    onClose();
  };

  const isLocalProvider = config.provider === 'ollama' || config.provider === 'lmstudio';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>EntraPulse Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          {/* Entra Application Settings */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Entra Application Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Configure your Microsoft Entra application registration details. These settings are secure and stored locally encrypted.
                </Typography>
              </Box>
              
              {isLoadingEntraConfig ? (
                <Box display="flex" justifyContent="center" py={2}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <EntraConfigForm
                  config={entraConfig}
                  onSave={handleSaveEntraConfig}
                  onClear={handleClearEntraConfig}
                  graphPermissions={graphPermissions}
                  loadGraphPermissions={loadGraphPermissions}
                  tenantInfo={tenantInfo}
                />
              )}
            </AccordionDetails>
          </Accordion>

          {/* Provider Selection */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>LLM Provider</InputLabel>
            <Select
              value={config.provider}
              label="LLM Provider"              onChange={(e) => {
                const newProvider = e.target.value as LLMConfig['provider'];
                
                // If selecting a cloud provider that's the default, preserve its configuration
                if (newProvider === defaultCloudProvider) {
                  const cloudProviderConfig = cloudProviders.find(p => p.provider === defaultCloudProvider)?.config;
                  if (cloudProviderConfig) {
                    setConfig({
                      ...config,
                      provider: newProvider,
                      model: cloudProviderConfig.model || getDefaultModel(newProvider as any) || config.model,
                      baseUrl: cloudProviderConfig.baseUrl,
                      apiKey: cloudProviderConfig.apiKey,
                      organization: cloudProviderConfig.organization,
                      temperature: cloudProviderConfig.temperature || config.temperature,
                      maxTokens: cloudProviderConfig.maxTokens || config.maxTokens
                    });
                  } else {
                    // Fallback if no cloud provider config found
                    setConfig({
                      ...config,
                      provider: newProvider,
                      model: getDefaultModel(newProvider as any) || config.model,
                      baseUrl: undefined,
                      apiKey: undefined,
                      organization: undefined
                    });
                  }
                } else {
                  // For local providers or other cases
                  setConfig({
                    ...config,
                    provider: newProvider,
                    model: getDefaultModel(newProvider as any) || config.model,
                    baseUrl: newProvider === 'ollama' ? 'http://localhost:11434' : 
                             newProvider === 'lmstudio' ? 'http://localhost:1234' : undefined,
                    apiKey: undefined,
                    organization: undefined
                  });
                }
              }}
            >
              <MenuItem value="ollama">
                <Box display="flex" alignItems="center" gap={1}>
                  <ComputerIcon fontSize="small" />
                  Ollama (Local)
                </Box>
              </MenuItem>
              <MenuItem value="lmstudio">
                <Box display="flex" alignItems="center" gap={1}>
                  <ComputerIcon fontSize="small" />
                  LM Studio (Local)
                </Box>
              </MenuItem>
              {defaultCloudProvider && (
                <MenuItem value={defaultCloudProvider}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <CloudIcon fontSize="small" />
                    {getProviderDisplayName(defaultCloudProvider)} (Default Cloud)
                    <StarIcon fontSize="small" color="primary" />
                  </Box>
                </MenuItem>
              )}
            </Select>
          </FormControl>          {/* Local LLM Configuration */}
          {isLocalProvider && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Local LLM Configuration</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Base URL"
                      value={config.baseUrl || ''}
                      onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                      placeholder={config.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'}
                      helperText={config.provider === 'ollama' ? 'Default Ollama API endpoint' : 'Default LM Studio API endpoint'}
                    />
                  </Grid>                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Model Name"
                      value={config.model}
                      onChange={(e) => setConfig({ ...config, model: e.target.value })}
                      placeholder={config.provider === 'ollama' ? 'codellama:7b' : 'gpt-4'}
                      helperText="The model name as it appears in your local LLM service"
                    />
                    
                    {/* Fetch Models Button */}
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => fetchLocalModels()}
                        disabled={!config.baseUrl || isLoadingModels['local']}
                        startIcon={isLoadingModels['local'] ? <CircularProgress size={16} /> : undefined}
                      >
                        {isLoadingModels['local'] ? 'Fetching...' : 'Fetch Available Models'}
                      </Button>
                      
                      {availableModels['local'] && availableModels['local'].length > 0 && (
                        <Typography variant="caption" color="textSecondary">
                          Found {availableModels['local'].length} models
                        </Typography>
                      )}
                    </Box>
                    
                    {/* Available Models List */}
                    {availableModels['local'] && availableModels['local'].length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="textSecondary" gutterBottom>
                          Available models (click to select):
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {availableModels['local'].map((modelName) => (
                            <Chip
                              key={modelName}
                              label={modelName}
                              size="small"
                              clickable
                              color={config.model === modelName ? "primary" : "default"}
                              onClick={() => setConfig({ ...config, model: modelName })}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                    
                    {modelFetchError['local'] && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          {modelFetchError['local']}
                        </Typography>
                      </Alert>
                    )}
                  </Grid>
                  
                  {/* Test Connection for Local LLM */}
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Button
                        variant="outlined"
                        onClick={() => handleTestLocalConnection()}
                        disabled={isTestingConnection || !config.baseUrl || !config.model}
                        startIcon={isTestingConnection ? <CircularProgress size={16} /> : undefined}
                      >
                        {isTestingConnection ? 'Testing...' : 'Test Connection'}
                      </Button>
                      
                      {connectionStatus === 'success' && (
                        <Chip label="Connection Successful" color="success" size="small" />
                      )}
                      {connectionStatus === 'error' && (
                        <Chip label="Connection Failed" color="error" size="small" />
                      )}
                    </Box>
                    
                    {testResult && !testResult.success && testResult.error && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          {testResult.error}
                        </Typography>
                      </Alert>
                    )}
                  </Grid>
                  
                  {/* Prefer Local LLM Toggle */}
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.preferLocal || false}
                          onChange={(e) => setConfig({ ...config, preferLocal: e.target.checked })}
                        />
                      }
                      label="Prefer Local LLM when available"
                    />
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1, ml: 4 }}>
                      Use local models when both local and cloud are configured
                    </Typography>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Cloud LLM Management */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Cloud LLM Providers</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Configure multiple cloud LLM providers and set one as default. The default provider will appear in the main dropdown.
                </Typography>
                
                {defaultCloudProvider && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      Current default: <strong>{getProviderDisplayName(defaultCloudProvider)}</strong>
                    </Typography>
                  </Alert>
                )}
              </Box>              {/* Cloud Provider Cards */}
              <Grid container spacing={2}>
                {(['openai', 'anthropic', 'gemini', 'azure-openai'] as const).map((provider) => {
                  const existingProvider = cloudProviders.find(p => p.provider === provider);
                  const isConfigured = !!existingProvider;
                  const isDefault = existingProvider?.isDefault || false;

                  return (
                    <Grid item xs={12} md={6} key={provider}>
                      <CloudProviderCard
                        provider={provider}
                        config={existingProvider?.config}
                        isConfigured={isConfigured}
                        isDefault={isDefault}
                        models={availableModels[provider] || []}
                        isLoadingModels={isLoadingModels[provider] || false}
                        modelFetchError={modelFetchError[provider] || ''}
                        onSave={(config: CloudLLMProviderConfig) => handleSaveCloudProvider(provider, config)}
                        onSetDefault={() => handleSetDefaultProvider(provider)}
                        onRemove={() => handleRemoveProvider(provider)}
                        onFetchModels={(apiKey: string) => fetchAvailableModels(provider, apiKey)}
                        onTestConnection={handleTestConnection}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </AccordionDetails>
          </Accordion>          {/* Advanced Settings */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Advanced Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Temperature"
                    type="number"
                    value={config.temperature || 0.2}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    inputProps={{ min: 0, max: 2, step: 0.1 }}
                    helperText="Controls randomness (0.0 to 2.0)"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Max Tokens"
                    type="number"                    value={config.maxTokens || 4096}
                    onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                    inputProps={{ min: 1, max: 8192 }}
                    helperText="Maximum response length"
                  />                </Grid>                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.preferLocal || false}
                        onChange={(e) => setConfig({ ...config, preferLocal: e.target.checked })}
                      />
                    }
                    label="Prefer Local LLM when available"
                  />
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1, ml: 4 }}>
                    Use local models when both local and cloud are configured.
                    {config.provider === 'ollama' || config.provider === 'lmstudio' ? 
                      ' (Also available in Local LLM Configuration above)' : ''}
                  </Typography>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Application Settings */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Application Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Configure application-wide settings including auto-updates.
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <AutoUpdateSettings />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Cloud Provider Card Component
interface CloudProviderCardProps {
  provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai';
  config?: CloudLLMProviderConfig;
  isConfigured: boolean;
  isDefault: boolean;
  models: string[];
  isLoadingModels: boolean;
  modelFetchError: string;
  onSave: (config: CloudLLMProviderConfig) => void;
  onSetDefault: () => void;
  onRemove: () => void;
  onFetchModels: (apiKey: string) => void;
  onTestConnection: (config: CloudLLMProviderConfig) => Promise<boolean>;
}

const CloudProviderCard: React.FC<CloudProviderCardProps> = ({
  provider,
  config,
  isConfigured,
  isDefault,
  models,
  isLoadingModels,
  modelFetchError,
  onSave,
  onSetDefault,
  onRemove,
  onFetchModels,
  onTestConnection
}) => {
  // Utility function for provider display names
  const getProviderDisplayName = (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): string => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic (Claude)';
      case 'gemini': return 'Google Gemini';
      case 'azure-openai': return 'Azure OpenAI';
      default: return provider;
    }
  };

  const [localConfig, setLocalConfig] = useState<CloudLLMProviderConfig>(
    config || {
      provider,
      model: provider === 'openai' ? 'gpt-4o-mini' : 
             provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 
             provider === 'gemini' ? 'gemini-1.5-flash' :
             provider === 'azure-openai' ? 'gpt-4o' : 'gpt-4o-mini',      apiKey: '',
      temperature: 0.2,
      maxTokens: 4096,
      baseUrl: provider === 'azure-openai' ? '' : undefined
    }
  );

  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; details?: any } | null>(null);

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    } else {
      // Reset to default when config is undefined (provider deleted)
      setLocalConfig({
        provider,
        model: provider === 'openai' ? 'gpt-4o-mini' : 
               provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 
               provider === 'gemini' ? 'gemini-1.5-flash' :
               provider === 'azure-openai' ? 'gpt-4o' : 'gpt-4o-mini',
        apiKey: '',
        temperature: 0.2,
        maxTokens: 4096,
        baseUrl: provider === 'azure-openai' ? '' : undefined
      });
    }
  }, [config, provider]);

  // Model validation functions for this component
  const getValidModelsForProvider = (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): string[] => {
    switch (provider) {
      case 'openai':
        return [
          'gpt-4o',
          'gpt-4o-mini', 
          'gpt-4-turbo',
          'gpt-4',
          'gpt-3.5-turbo'
        ];
      case 'anthropic':
        return [
          'claude-sonnet-4-20250514',      // Latest Claude 4 Sonnet (June 2025)
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];
      case 'gemini':
        return [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-1.0-pro',
          'gemini-pro',
          'gemini-pro-vision'
        ];
      case 'azure-openai':
        return [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-4',
          'gpt-35-turbo'
        ];
      default:
        return [];
    }
  };

  const isValidModelForProvider = (model: string, provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai'): boolean => {
    const validModels = getValidModelsForProvider(provider);
    return validModels.includes(model);
  };

  const handleSave = () => {
    // Validation for Azure OpenAI
    if (provider === 'azure-openai') {
      if (!localConfig.baseUrl || localConfig.baseUrl.trim() === '') {
        alert('Azure OpenAI endpoint URL is required');
        return;
      }
      
      // Validate the URL has the correct format
      if (!localConfig.baseUrl.includes('openai.azure.com')) {
        alert('Please enter a valid Azure OpenAI endpoint URL (should contain "openai.azure.com")');
        return;
      }
      
      // Validate it has the required chat/completions path and API version
      if (!localConfig.baseUrl.includes('/chat/completions') || !localConfig.baseUrl.includes('api-version=')) {
        alert('Please enter the full Azure OpenAI endpoint URL including deployment name and API version.\n\nFormat: https://your-resource.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2025-01-01-preview');
        return;
      }
      
      // Validate it has the deployment name
      if (!localConfig.baseUrl.includes('/deployments/')) {
        alert('Please enter a valid Azure OpenAI endpoint URL with deployment name.\n\nFormat: https://your-resource.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2025-01-01-preview');
        return;
      }
    }
    
    // Validation for API key
    if (!localConfig.apiKey || localConfig.apiKey.trim() === '') {
      alert('API Key is required');
      return;
    }
      // For Azure OpenAI, make a final check and fix of the URL
    if (provider === 'azure-openai' && localConfig.baseUrl) {
      // Add deep logging
      console.log(`🔍 [Azure OpenAI Debug] Final save - processing URL: "${localConfig.baseUrl}"`);
      
      // Always trim the URL to avoid whitespace issues
      const cleanUrl = localConfig.baseUrl.trim();
      
      // Validate URL format
      const isAzureUrl = cleanUrl.includes('openai.azure.com');
      const hasDeploymentPath = cleanUrl.includes('/deployments/');
      const hasChatCompletions = cleanUrl.includes('/chat/completions');
      const hasApiVersion = cleanUrl.includes('api-version=');
      
      if (!isAzureUrl) {
        alert('Invalid Azure OpenAI URL. Must contain "openai.azure.com"');
        return;
      }
      
      // Ensure URL is complete
      if (!hasDeploymentPath || !hasChatCompletions || !hasApiVersion) {
        console.log(`🔧 [Azure OpenAI Debug] URL needs completion during final save`);
        
        // Start with base URL (remove trailing slashes)
        let baseEndpoint = cleanUrl.replace(/\/+$/, '');
        
        // Remove any existing incomplete paths to start fresh
        if (baseEndpoint.includes('/openai/deployments/')) {
          baseEndpoint = baseEndpoint.split('/openai/deployments/')[0];
        } else if (baseEndpoint.includes('/openai/')) {
          baseEndpoint = baseEndpoint.split('/openai/')[0];
        }
        
        // Build complete URL
        const completeUrl = `${baseEndpoint}/openai/deployments/${localConfig.model}/chat/completions?api-version=2025-01-01-preview`;
        
        console.log(`🔧 [Azure OpenAI Debug] Final save - built complete URL: "${completeUrl}"`);
        
        // Ask user to confirm modified URL
        const userConfirm = confirm(`To ensure proper functionality, the endpoint URL will be formatted as:\n\n${completeUrl}\n\nContinue with this URL?`);
        
        if (!userConfirm) {
          console.log('❌ [Azure OpenAI Debug] User cancelled URL modification in final save');
          return;
        }
        
        // Update the URL
        localConfig.baseUrl = completeUrl;
      } else {
        // URL is already complete, just ensure it's clean
        localConfig.baseUrl = cleanUrl;
      }
      
      // Create a deep copy to ensure we're not saving a reference
      const configToSave = JSON.parse(JSON.stringify({
        provider: localConfig.provider,
        model: localConfig.model,
        apiKey: localConfig.apiKey,
        baseUrl: localConfig.baseUrl,
        temperature: localConfig.temperature,
        maxTokens: localConfig.maxTokens,
        organization: localConfig.organization
      }));
      
      console.log(`✅ [Azure OpenAI Debug] Final URL being saved in main save: "${configToSave.baseUrl}"`);
      onSave(configToSave);
      return;
    }
    
    // For non-Azure OpenAI providers
    onSave({...localConfig});
  };
  const handleApiKeyChange = (apiKey: string) => {
    setLocalConfig({ ...localConfig, apiKey });
    if (apiKey && apiKey.length > 10) {
      onFetchModels(apiKey);
    }
  };

  const handleTestConnection = async () => {
    if (!localConfig.apiKey) {
      setConnectionStatus('error');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');

    try {
      // Check if the current model is valid for the provider first
      if (!isValidModelForProvider(localConfig.model, provider)) {
        console.warn(`Test connection: Model "${localConfig.model}" is not valid for provider "${provider}"`);
        setConnectionStatus('error');
        // Optional: Could show a more specific error message about invalid model
        return;
      }

      const success = await onTestConnection(localConfig);
      setConnectionStatus(success ? 'success' : 'error');
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <Paper elevation={isDefault ? 3 : 1} sx={{ p: 2, border: isDefault ? 2 : 1, borderColor: isDefault ? 'primary.main' : 'divider' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>        <Box display="flex" alignItems="center" gap={1}>
          <CloudIcon color={isConfigured ? 'primary' : 'disabled'} />
          <Typography variant="h6">{getProviderDisplayName(provider)}</Typography>
          {isDefault && <StarIcon color="primary" fontSize="small" />}
        </Box>
        
        <Box display="flex" gap={1}>
          {isConfigured && !isDefault && (
            <Tooltip title="Set as Default">
              <IconButton size="small" onClick={onSetDefault}>
                <StarBorderIcon />
              </IconButton>
            </Tooltip>
          )}
          {isConfigured && (
            <Tooltip title="Remove Configuration">
              <IconButton size="small" onClick={onRemove} color="error">
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>        <TextField
          fullWidth
          label="API Key"
          type="password"
          value={localConfig.apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder={provider === 'openai' ? 'sk-...' : 
                      provider === 'anthropic' ? 'sk-ant-...' : 
                      provider === 'gemini' ? 'AI...' :
                      provider === 'azure-openai' ? 'your-azure-api-key' : 'API Key'}
          size="small"
          sx={{ mb: 1 }}
        />
          {provider === 'openai' && (
          <TextField
            fullWidth
            label="Organization ID (Optional)"
            value={localConfig.organization || ''}
            onChange={(e) => setLocalConfig({ ...localConfig, organization: e.target.value })}
            placeholder="org-..."
            size="small"
            sx={{ mb: 1 }}
          />
        )}        {provider === 'azure-openai' && (
          <TextField
            fullWidth
            label="Azure OpenAI Endpoint"
            value={localConfig.baseUrl || ''}
            onChange={(e) => {
              const newUrl = e.target.value;
              console.log(`🔍 [Azure OpenAI Debug] URL input changed: "${newUrl}"`);
              setLocalConfig({ ...localConfig, baseUrl: newUrl });
            }}
            onBlur={(e) => {
              // Validate and auto-correct URL on blur
              const url = e.target.value.trim();
              if (url && !url.includes('/chat/completions')) {
                console.log(`⚠️ [Azure OpenAI Debug] Incomplete URL detected on blur: "${url}"`);
                
                // Auto-suggest complete URL format
                const isAzureUrl = url.includes('openai.azure.com');
                if (isAzureUrl && localConfig.model) {
                  let correctedUrl = url.replace(/\/+$/, ''); // Remove trailing slashes
                  
                  // Add missing components
                  if (!correctedUrl.includes('/deployments/')) {
                    correctedUrl = `${correctedUrl}/openai/deployments/${localConfig.model}`;
                  }
                  if (!correctedUrl.includes('/chat/completions')) {
                    correctedUrl = `${correctedUrl}/chat/completions`;
                  }
                  if (!correctedUrl.includes('api-version=')) {
                    const separator = correctedUrl.includes('?') ? '&' : '?';
                    correctedUrl = `${correctedUrl}${separator}api-version=2025-01-01-preview`;
                  }
                  
                  console.log(`🔧 [Azure OpenAI Debug] Auto-correcting URL to: "${correctedUrl}"`);
                  setLocalConfig({ ...localConfig, baseUrl: correctedUrl });
                }
              }
            }}
            placeholder="https://your-resource.openai.azure.com/openai/deployments/your-deployment-name/chat/completions?api-version=2025-01-01-preview"
            size="small"
            sx={{ mb: 1 }}
            required
            helperText="Full Azure OpenAI endpoint URL including deployment name and api-version (e.g., https://your-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview)"
          />
        )}

        {models.length > 0 ? (
          <FormControl fullWidth size="small">
            <InputLabel>Model</InputLabel>
            <Select
              value={localConfig.model}
              label="Model"
              onChange={(e) => {
                const selectedModel = e.target.value;
                
                // Validate the model for the current provider
                if (!isValidModelForProvider(selectedModel, provider)) {
                  console.warn(`Selected model "${selectedModel}" is not valid for provider "${provider}"`);
                  // Note: Model validation warning will be shown through the existing modelFetchError prop
                } else {
                  console.log(`Selected model "${selectedModel}" is valid for provider "${provider}"`);
                }
                
                setLocalConfig({ ...localConfig, model: selectedModel });
              }}
              disabled={isLoadingModels}
            >
              {models.map((model) => (
                <MenuItem key={model} value={model}>
                  {model}
                </MenuItem>
              ))}
            </Select>
            {/* Model validation warning */}
            {localConfig.model && !isValidModelForProvider(localConfig.model, provider) && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
                ⚠️ Warning: "{localConfig.model}" may not be a valid model for {provider}. Please verify this model exists.
              </Typography>
            )}
          </FormControl>
        ) : (
          <TextField
            fullWidth
            label="Model"
            value={localConfig.model}
            onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
            size="small"
            helperText={modelFetchError || (isLoadingModels ? 'Loading models...' : 'Enter API key to load models')}
            error={!!modelFetchError}
          />
        )}

        {isLoadingModels && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            <CircularProgress size={16} sx={{ mr: 1 }} />
            <Typography variant="caption" color="textSecondary">
              Fetching available models...
            </Typography>
          </Box>
        )}
      </Box>      <Box display="flex" gap={1} justifyContent="flex-end" flexWrap="wrap">
        <Button 
          size="small" 
          onClick={handleTestConnection} 
          variant="outlined"
          disabled={!localConfig.apiKey || isTestingConnection}
          color={connectionStatus === 'success' ? 'success' : connectionStatus === 'error' ? 'error' : 'primary'}
        >
          {isTestingConnection ? (
            <CircularProgress size={16} />
          ) : connectionStatus === 'success' ? (
            'Connection OK'
          ) : connectionStatus === 'error' ? (
            'Test Failed'
          ) : (
            'Test Connection'
          )}
        </Button>
        <Button size="small" onClick={handleSave} variant="contained">
          {isConfigured ? 'Update' : 'Save'}
        </Button>
        {isConfigured && !isDefault && (
          <Button size="small" onClick={onSetDefault} variant="outlined">
            Set as Default
          </Button>
        )}
      </Box>
      
      {isDefault && (
        <Chip
          label="Default Provider"
          color="primary"
          size="small"
          icon={<StarIcon />}
          sx={{ mt: 1 }}
        />
      )}
    </Paper>
  );
};

interface EntraConfigFormProps {
  config: EntraConfig | null;
  onSave: (config: EntraConfig) => Promise<void>;
  onClear: () => Promise<void>;
  graphPermissions: {
    granted: string[];
    available: string[];
    loading: boolean;
    error?: string;
  };
  loadGraphPermissions: () => Promise<void>;
  tenantInfo: {
    tenantId?: string;
    tenantDisplayName?: string;
    loading: boolean;
    error?: string;
  };
}

const EntraConfigForm: React.FC<EntraConfigFormProps> = ({ config, onSave, onClear, graphPermissions, loadGraphPermissions, tenantInfo }) => {  const [localConfig, setLocalConfig] = useState<EntraConfig>({
    clientId: '',
    tenantId: '',
    useGraphPowerShell: false,
    useSystemBrowser: false
  });
  const ENHANCED_GRAPH_CLIENT_ID = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
  const [isSaving, setIsSaving] = useState(false);
  const [isUserEditing, setIsUserEditing] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; details?: any } | null>(null);

  useEffect(() => {
    // Only update local config if the user is not actively editing
    // This prevents the form from being cleared when background processes reload config
    if (config && !isUserEditing) {
      // Merge with current localConfig to preserve any undefined fields with default values
      setLocalConfig(prevConfig => ({
        ...prevConfig,
        ...config,
        // Ensure boolean fields have proper defaults if undefined
        useGraphPowerShell: config.useGraphPowerShell ?? false,
        useSystemBrowser: config.useSystemBrowser ?? false
      }));
    }
  }, [config, isUserEditing]);

  // Load permissions when Enhanced Graph Access is enabled OR when custom client ID is provided
  useEffect(() => {
    const shouldLoadPermissions = localConfig.useGraphPowerShell || 
                                 (localConfig.clientId && localConfig.clientId.trim());
    
    if (shouldLoadPermissions) {
      console.log('🔄 Loading permissions for authentication mode (Enhanced Graph Access or Custom App)...');
      loadGraphPermissions();
    }
  }, [localConfig.useGraphPowerShell, localConfig.clientId]); // Removed loadGraphPermissions from dependencies

  const handleSave = async () => {
    try {
      setIsSaving(true);
      let configToSave = { ...localConfig };
      // If Enhanced Graph Access is enabled, set clientId internally
      if (localConfig.useGraphPowerShell) {
        configToSave.clientId = ENHANCED_GRAPH_CLIENT_ID;
      }
      await onSave(configToSave);
      setIsUserEditing(false);
    } catch (error) {
      console.error('Failed to save Entra config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      setIsSaving(true);
      await onClear();      setLocalConfig({
        clientId: '',
        tenantId: '',
        useGraphPowerShell: false,
        useSystemBrowser: false
      });
      // Successfully cleared - no longer editing
      setIsUserEditing(false);
    } catch (error) {
      console.error('Failed to clear Entra config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof EntraConfig, value: string | boolean) => {
    setLocalConfig({ ...localConfig, [field]: value });
    // Mark as user editing when any input changes
    setIsUserEditing(true);
    // Clear any previous test results when config changes
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    try {
      setIsTestingConnection(true);
      setTestResult(null);
      
      console.log('🧪 Testing Entra application configuration...');
      
      // Validate that we have the minimum required fields
      if (localConfig.useGraphPowerShell) {
        if (!localConfig.tenantId.trim()) {
          setTestResult({
            success: false,
            error: 'Tenant ID is required for Enhanced Graph Access'
          });
          return;
        }
      } else {
        if (!localConfig.clientId.trim() || !localConfig.tenantId.trim()) {
          setTestResult({
            success: false,
            error: 'Client ID and Tenant ID are required for testing'
          });
          return;
        }
      }

      const electronAPI = window.electronAPI as any;
      const result = await electronAPI.auth.testConfiguration(localConfig);
      
      console.log('🧪 Test result:', result);
      setTestResult(result);
      
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Check if configuration exists either in stored config or in current local editing state
  const isConfigured = localConfig.useGraphPowerShell
    ? !!localConfig.tenantId.trim()
    : (!!(config?.clientId && config?.tenantId) || !!(localConfig.clientId.trim() && localConfig.tenantId.trim()));
  return (
    <>
      <Grid container spacing={2}>
      {/* Authentication Mode Selection */}
      <Grid item xs={12}>
        <Box sx={{ mb: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="h6" gutterBottom>
            Authentication Mode
          </Typography>
          
          <FormControl component="fieldset">
            <RadioGroup
              value="user-token"
              onChange={() => {
                // Only User Token mode is supported for security
                console.log('📍 Authentication mode: User Token (Delegated Permissions) - secure by design');
              }}
            >
              <FormControlLabel
                value="user-token"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1" fontWeight="bold">
                      User Token (Delegated Permissions)
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {localConfig.useGraphPowerShell
                        ? "Currently using Microsoft Graph PowerShell client (14d82eec-204b-4c2f-b7e8-296a70dab67e) for enhanced permissions. This overrides any custom Client ID configured below."
                        : localConfig.clientId && localConfig.clientId.trim()
                        ? "Using your custom app registration for delegated permissions. Access depends on permissions configured in your Azure app registration."
                        : "Using default Microsoft authentication with basic user permissions (User.Read, profile, openid, email)."
                      }
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>

          {/* Enhanced Graph Access Toggle */}
          <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, backgroundColor: 'background.paper' }}>
            <FormControlLabel
                  control={
                    <Switch
                      checked={localConfig.useGraphPowerShell || false}                      onChange={async (e) => {
                        console.log('🎯 ENHANCED GRAPH ACCESS TOGGLE HANDLER CALLED - START');
                        const newUseGraphPowerShell = e.target.checked;
                        const previousUseGraphPowerShell = localConfig.useGraphPowerShell;
                        console.log('🔧 Enhanced Graph Access toggle changing from:', previousUseGraphPowerShell, 'to:', newUseGraphPowerShell);
                        
                        // Update local state first
                        const updatedConfig = {
                          ...localConfig,
                          useGraphPowerShell: newUseGraphPowerShell
                        };
                        setLocalConfig(updatedConfig);
                        setIsUserEditing(true);
                        setTestResult(null);
                        
                        // Check if this is a significant change that requires re-authentication
                        if (previousUseGraphPowerShell !== newUseGraphPowerShell) {
                          console.log('🔄 Enhanced Graph Access changed significantly, auto-saving and signing out...');
                          
                          try {
                            // Immediately save the Enhanced Graph Access setting
                            console.log('💾 Auto-saving Enhanced Graph Access setting...');
                            await onSave(updatedConfig);
                            console.log('✅ Enhanced Graph Access setting saved successfully');
                            
                            // Trigger UI update event to notify other components
                            const electronAPI = window.electronAPI as any;
                            if (electronAPI?.events?.emit) {
                              electronAPI.events.emit('auth:configurationAvailable');
                              console.log('� Emitted auth:configurationAvailable after Enhanced Graph Access save');
                            }
                            
                            // Auto sign-out for Enhanced Graph Access change (same pattern as auth mode change)
                            console.log('🔔 Auto-signing out for Enhanced Graph Access change...');
                            try {
                              await electronAPI.auth.logout();
                              console.log('✅ Automatic sign out completed for Enhanced Graph Access change');
                              
                              // Emit logout event to notify other components
                              console.log('🔔 Sending auth:logoutBroadcast to main process for Enhanced Graph Access change');
                              electronAPI.send('auth:logoutBroadcast', { reason: 'enhanced-graph-access-change' });
                              
                              // Show success message with consistent timing as auth mode change
                              setTimeout(() => {
                                alert(`Enhanced Graph Access has been ${newUseGraphPowerShell ? 'enabled' : 'disabled'}. You have been signed out and the application will reset to the sign-in screen.`);
                              }, 100);
                            } catch (signOutError) {
                              console.error('❌ Failed to sign out automatically for Enhanced Graph Access change:', signOutError);
                              setTimeout(() => {
                                alert(`Enhanced Graph Access has been ${newUseGraphPowerShell ? 'enabled' : 'disabled'}, but automatic sign out failed. Please manually sign out and sign in again from the main screen.`);
                              }, 100);
                            }
                          } catch (error) {
                            console.error('❌ Failed to auto-save Enhanced Graph Access setting:', error);
                            // Revert the local state on save failure
                            setLocalConfig({
                              ...localConfig,
                              useGraphPowerShell: previousUseGraphPowerShell
                            });
                            alert('Failed to save Enhanced Graph Access setting. Please try again.');
                          }
                        }
                        
                        // Refresh permissions when toggling Enhanced Graph Access
                        if (newUseGraphPowerShell) {
                          setTimeout(() => loadGraphPermissions(), 100);
                        }
                      }}
                      disabled={isSaving}
                    />
                  }
                  label="Enhanced Graph Access (Microsoft Graph PowerShell)"
                />
                
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                  Override any custom Client ID configuration to use the well-known Microsoft Graph PowerShell client ID.
                  This provides access to mailbox data, calendar events, OneDrive files, Teams content, and other advanced user resources.
                  <br/><strong>Note:</strong> When enabled, this ignores any Client ID configured below and uses Microsoft's pre-registered app.
                </Typography>
                
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Note:</strong> Changing this setting requires signing out and signing back in to switch authentication contexts. 
                    You will be automatically signed out when you toggle this setting.
                  </Typography>
                </Alert>                {localConfig.useGraphPowerShell && (                  <>                    <Alert severity="warning" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Enhanced Graph Access Active:</strong> Using Microsoft Graph PowerShell client ID (14d82eec-204b-4c2f-b7e8-296a70dab67e). 
                        Any custom Client ID configured below is being ignored while this mode is enabled.
                      </Typography>
                    </Alert>
                    
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Permissions Status:</strong> <br/>
                        {graphPermissions.loading ? (
                          <>
                            • <strong>Checking permissions...</strong> <CircularProgress size={12} sx={{ ml: 1 }} />
                          </>
                        ) : graphPermissions.error ? (
                          <>
                            • <strong>Unable to check current permissions</strong><br/>
                            • <strong>Default access:</strong> Basic user profile and directory information<br/>
                            • <strong>Admin consent may be required for:</strong> Mail, calendar, files, and advanced Teams data
                          </>
                        ) : (
                          <>
                            • <strong>Current access:</strong> {graphPermissions.granted.length > 0 ? 
                              graphPermissions.granted.slice(0, 3).join(', ') + 
                              (graphPermissions.granted.length > 3 ? ` and ${graphPermissions.granted.length - 3} more` : '') 
                              : 'Basic profile only'}<br/>
                            {graphPermissions.available.length > graphPermissions.granted.length && (
                              <>• <strong>Admin consent required for:</strong> {
                                graphPermissions.available
                                  .filter(p => !graphPermissions.granted.includes(p))
                                  .slice(0, 3)
                                  .join(', ')
                              }{graphPermissions.available.filter(p => !graphPermissions.granted.includes(p)).length > 3 ? ' and more' : ''}<br/></>
                            )}
                            • Contact your Entra Administrator if you encounter "Access is denied" errors.
                          </>
                        )}
                      </Typography>
                    </Alert>
                    
                    <Alert severity="success" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Configuration Note:</strong> Changes to Enhanced Graph Access take effect immediately after saving. 
                        The MCP server will be automatically restarted with the new configuration.
                      </Typography>
                    </Alert>
                    
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                      <Typography variant="caption" display="block" gutterBottom>
                        <strong>Client ID:</strong> 14d82eec-204b-4c2f-b7e8-296a70dab67e (Microsoft Graph PowerShell)
                      </Typography>
                      <Typography variant="caption" display="block" gutterBottom>
                        <strong>User Tenant:</strong> {
                          tenantInfo.loading ? (
                            <span>
                              Loading... <CircularProgress size={10} sx={{ ml: 1 }} />
                            </span>
                          ) : tenantInfo.error === 'User not authenticated' || tenantInfo.error === 'Could not verify authentication' ? (
                            <span style={{ color: 'orange' }}>
                              Please sign in to authenticate
                            </span>
                          ) : tenantInfo.error ? (
                            <span style={{ color: 'red' }}>
                              Error: {tenantInfo.error}
                            </span>
                          ) : tenantInfo.tenantId ? (
                            <span>
                              {tenantInfo.tenantDisplayName ? (
                                <>
                                  <strong>{tenantInfo.tenantDisplayName}</strong>
                                  <span style={{ marginLeft: 8, color: '#666', fontSize: '0.9em' }}>
                                    ({tenantInfo.tenantId})
                                  </span>
                                </>
                              ) : (
                                tenantInfo.tenantId
                              )}
                            </span>
                          ) : (

                            'Not authenticated'
                          )
                        }
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                        Enhanced Graph Access uses the authenticated user's tenant automatically
                      </Typography>                      <Typography variant="caption" display="block" color="text.secondary">
                        <strong>Permissions Status:</strong> {graphPermissions.loading ? (
                          <CircularProgress size={12} sx={{ ml: 1 }} />
                        ) : graphPermissions.error ? (
                          <Chip label="Unable to check" size="small" color="warning" sx={{ ml: 1 }} />
                        ) : (
                          <Box component="span" sx={{ ml: 1 }}>
                            <Chip 
                              label={`${graphPermissions.granted.length} granted`} 
                              size="small" 
                              color={graphPermissions.granted.length > 3 ? "success" : "warning"} 
                              sx={{ mr: 0.5 }} 
                            />
                            <Chip 
                              label={`${graphPermissions.available.length - graphPermissions.granted.length} pending`} 
                              size="small" 
                              color="default" 
                            />
                          </Box>
                        )}
                      </Typography>
                      
                      {!graphPermissions.loading && !graphPermissions.error && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" display="block" color="text.secondary">
                            <strong>Granted:</strong> {graphPermissions.granted.length > 0 ? 
                              graphPermissions.granted.join(', ') : 'Basic profile only'
                            }
                          </Typography>
                          {graphPermissions.available.length > graphPermissions.granted.length && (
                            <Typography variant="caption" display="block" color="warning.main">
                              <strong>Requires admin consent:</strong> {
                                graphPermissions.available
                                  .filter(p => !graphPermissions.granted.includes(p))
                                  .join(', ')
                              }
                            </Typography>
                          )}
                        </Box>
                      )}
                      
                      {graphPermissions.error && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                          <strong>Default Enhanced Permissions:</strong> Mail.Read, Mail.ReadWrite, Calendars.Read, 
                          Files.Read.All, Directory.Read.All, Team.ReadBasic.All
                        </Typography>
                      )}
                    </Box>
                  </>
                )}                {!localConfig.useGraphPowerShell && (
                  <>
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Standard Access:</strong> {
                          localConfig.clientId && localConfig.clientId.trim()
                            ? "Using your custom app registration for delegated permissions. Access depends on permissions configured in your Azure app registration."
                            : "Using default Microsoft authentication with basic permissions (User.Read, profile, openid, email)."
                        }
                        <br/>Enable "Enhanced Graph Access" above to access mailbox, calendar, and other advanced user data 
                        through the Microsoft Graph PowerShell client ID.
                      </Typography>
                    </Alert>

                    {/* Show permissions for custom applications too */}
                    {localConfig.clientId && localConfig.clientId.trim() && (
                      <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                          <strong>Permissions Status:</strong> <br/>
                          {graphPermissions.loading ? (
                            <>
                              • <strong>Checking permissions...</strong> <CircularProgress size={12} sx={{ ml: 1 }} />
                            </>
                          ) : graphPermissions.error ? (
                            <>
                              • <strong>Unable to check current permissions</strong><br/>
                              • <strong>Note:</strong> Sign in to see actual permissions granted to your custom application<br/>
                              • <strong>Contact your Entra Administrator</strong> if you encounter "Access is denied" errors
                            </>
                          ) : (
                            <>
                              • <strong>Current access:</strong> {graphPermissions.granted.length > 0 ? 
                                graphPermissions.granted.slice(0, 3).join(', ') + 
                                (graphPermissions.granted.length > 3 ? ` and ${graphPermissions.granted.length - 3} more` : '') 
                                : 'Basic profile only'}<br/>
                              {graphPermissions.available.length > graphPermissions.granted.length && (
                                <>• <strong>Admin consent required for:</strong> {
                                  graphPermissions.available
                                    .filter(p => !graphPermissions.granted.includes(p))
                                    .slice(0, 3)
                                    .join(', ')
                                }{graphPermissions.available.filter(p => !graphPermissions.granted.includes(p)).length > 3 ? ' and more' : ''}<br/></>
                              )}
                              • Contact your Entra Administrator if you encounter "Access is denied" errors.
                            </>
                          )}
                        </Typography>
                      </Alert>
                    )}

                    {/* Show detailed permissions breakdown for custom applications */}
                    {localConfig.clientId && localConfig.clientId.trim() && !graphPermissions.loading && !graphPermissions.error && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="caption" display="block" gutterBottom>
                          <strong>Client ID:</strong> {localConfig.clientId.substring(0, 8)}... (Custom Application)
                        </Typography>
                        <Typography variant="caption" display="block" gutterBottom>
                          <strong>User Tenant:</strong> {
                            tenantInfo.loading ? (
                              <span>
                                Loading... <CircularProgress size={10} sx={{ ml: 1 }} />
                              </span>
                            ) : tenantInfo.error === 'User not authenticated' || tenantInfo.error === 'Could not verify authentication' ? (
                              <span style={{ color: 'orange' }}>
                                Please sign in to authenticate
                              </span>
                            ) : tenantInfo.error ? (
                              <span style={{ color: 'red' }}>
                                Error: {tenantInfo.error}
                              </span>
                            ) : tenantInfo.tenantId ? (
                              <span>
                                {tenantInfo.tenantDisplayName ? (
                                  <>
                                    <strong>{tenantInfo.tenantDisplayName}</strong>
                                    <span style={{ marginLeft: 8, color: '#666', fontSize: '0.9em' }}>
                                      ({tenantInfo.tenantId})
                                    </span>
                                  </>
                                ) : (
                                  tenantInfo.tenantId
                                )}
                              </span>
                            ) : (
                              'Not authenticated'
                            )
                          }
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                          Custom application using delegated permissions configured in Azure app registration
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          <strong>Permissions Status:</strong> {
                            <Box component="span" sx={{ ml: 1 }}>
                              <Chip 
                                label={`${graphPermissions.granted.length} granted`} 
                                size="small" 
                                color={graphPermissions.granted.length > 3 ? "success" : "warning"} 
                                sx={{ mr: 0.5 }} 
                              />
                              <Chip 
                                label={`${graphPermissions.available.length - graphPermissions.granted.length} pending`} 
                                size="small" 
                                color="default" 
                              />
                            </Box>
                          }
                        </Typography>
                        
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" display="block" color="text.secondary">
                            <strong>Granted:</strong> {graphPermissions.granted.length > 0 ? 
                              graphPermissions.granted.join(', ') : 'Basic profile only'
                            }
                          </Typography>
                          {graphPermissions.available.length > graphPermissions.granted.length && (
                            <Typography variant="caption" display="block" color="warning.main">
                              <strong>Requires admin consent:</strong> {
                                graphPermissions.available
                                  .filter(p => !graphPermissions.granted.includes(p))
                                  .join(', ')
                              }
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    )}
                  </>
                )}
              </Box>
        </Box>
      </Grid>

      <Grid item xs={12}>        <TextField
          fullWidth
          label="Client ID"
          value={localConfig.clientId}
          onChange={(e) => handleInputChange('clientId', e.target.value)}
          placeholder="Enter your Azure app registration Client ID"
          helperText={localConfig.useGraphPowerShell 
            ? "Client ID is ignored when Enhanced Graph Access is enabled (using Microsoft Graph PowerShell client ID)"
            : localConfig.clientId && localConfig.clientId.trim()
            ? "Using your custom app registration for delegated permissions"
            : "Optional - leave empty to use default Microsoft authentication"
          }
          disabled={isSaving}
          sx={localConfig.useGraphPowerShell ? { opacity: 0.6 } : {}}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Tenant ID"
          value={localConfig.tenantId}
          onChange={(e) => handleInputChange('tenantId', e.target.value)}
          placeholder="Enter your Azure Directory (tenant) ID"
          helperText={
            localConfig.useGraphPowerShell
              ? "Required for Enhanced Graph Access mode"
              : tenantInfo.tenantDisplayName && tenantInfo.tenantDisplayName !== tenantInfo.tenantId
              ? `${tenantInfo.tenantDisplayName} - Required for custom app authentication`
              : tenantInfo.error === 'User not authenticated' || tenantInfo.error === 'Could not verify authentication'
              ? "Required for custom app authentication (Sign in to see authenticated tenant info)"
              : tenantInfo.tenantId && tenantInfo.tenantId !== localConfig.tenantId
              ? `Required for custom app authentication (Note: You're authenticated to tenant ${tenantInfo.tenantId})`
              : "Required for custom app authentication"
          }
          disabled={isSaving}
        />
      </Grid>

      {/* System Browser Authentication Option */}
      <Grid item xs={12}>
        <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, backgroundColor: 'background.paper' }}>
          <FormControlLabel
            control={
              <Switch
                checked={localConfig.useSystemBrowser || false}
                onChange={async (e) => {
                  console.log('🌐 System Browser toggle changing to:', e.target.checked);
                  const ENHANCED_GRAPH_CLIENT_ID = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
                  let newConfig = { ...localConfig, useSystemBrowser: e.target.checked };
                  // If Enhanced Graph Access is enabled, set clientId internally
                  if (newConfig.useGraphPowerShell) {
                    newConfig.clientId = ENHANCED_GRAPH_CLIENT_ID;
                  }
                  setLocalConfig(newConfig);
                  setIsUserEditing(true);
                  // Auto-save if minimum required config is present
                  if ((newConfig.useGraphPowerShell && newConfig.tenantId.trim()) || (newConfig.clientId.trim() && newConfig.tenantId.trim())) {
                    try {
                      console.log('🔄 Auto-saving Entra config with system browser setting:', e.target.checked);
                      await onSave(newConfig);
                      console.log('✅ System browser setting saved successfully');
                      setIsUserEditing(false);
                    } catch (error) {
                      console.error('❌ Failed to save system browser setting:', error);
                    }
                  } else {
                    console.log('🔄 System browser setting changed but not auto-saving - missing required TenantID');
                    setIsUserEditing(false);
                  }
                }}
                disabled={isSaving}
              />
            }
            label="Use System Browser for Authentication"
          />
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
            Enable this option if your organization has Conditional Access policies that require a compliant browser. 
            When enabled, authentication will open in your default system browser instead of the embedded browser window.
          </Typography>
          
          <Alert severity="info" sx={{ mb: 1 }}>
            <Typography variant="body2">
              <strong>When to use this option:</strong>
              <br/>• Your organization has Conditional Access policies requiring device compliance
              <br/>• You see errors about "This application contains sensitive information" or browser compliance
              <br/>• Your admin requires authentication through the system browser for security policies
            </Typography>
          </Alert>
          
          <Alert severity="warning">
            <Typography variant="body2">
              <strong>Note:</strong> System browser authentication requires a temporary local server on port 3000. 
              Ensure this port is available and not blocked by firewall settings.
            </Typography>
          </Alert>
        </Box>
      </Grid>      <Grid item xs={12}>
        <Box display="flex" gap={1} justifyContent="flex-end">
          {isConfigured && (
            <Button 
              onClick={handleClear}
              disabled={isSaving || isTestingConnection}
              color="error"
            >
              Clear Configuration
            </Button>
          )}          <Button 
            onClick={handleTestConnection}
            disabled={isSaving || isTestingConnection || !localConfig.clientId.trim() || !localConfig.tenantId.trim()}
            variant="outlined"
          >
            {isTestingConnection ? (
              <CircularProgress size={20} />
            ) : (
              `Test ${localConfig.useGraphPowerShell ? 'Enhanced Graph Access' : 'User Token'} Connection`
            )}
          </Button>
          <Button 
            onClick={handleSave}
            variant="contained"
            disabled={isSaving || isTestingConnection || !localConfig.clientId.trim() || !localConfig.tenantId.trim()}
          >
            {isSaving ? <CircularProgress size={20} /> : (isConfigured ? 'Update' : 'Save')}
          </Button>
        </Box>
      </Grid>
      {testResult && (
        <Grid item xs={12}>
          <Alert 
            severity={testResult.success ? 'success' : 'error'}
            onClose={() => setTestResult(null)}
          >
            {testResult.success ? (
              <>
                <strong>Connection Test Successful!</strong>
                {testResult.details && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {testResult.details.tokenType === 'client_credentials' 
                      ? 'Client credentials flow verified. Authentication is working correctly.'
                      : testResult.details.tokenType === 'interactive'
                      ? 'Interactive authentication verified with cached tokens.'
                      : testResult.details.message || 'Configuration is valid for authentication.'}
                  </Typography>
                )}
              </>
            ) : (
              <>
                <strong>Connection Test Failed</strong>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {testResult.error}
                </Typography>
              </>
            )}
          </Alert>
        </Grid>
      )}
      {isConfigured && (
        <Grid item xs={12}>
          <Alert severity="success">
            Entra configuration is set and ready to use with secure delegated permissions.
          </Alert>
        </Grid>
      )}
      <Grid item xs={12}>
        <Alert severity="info">
          <strong>Security Note:</strong> EntraPulse Lite uses delegated permissions for enhanced security. 
          All Microsoft Graph queries require user consent and are performed in the context of your signed-in user account.
          This approach eliminates the need for client secrets and follows zero-trust security principles.
        </Alert>
      </Grid>
    </Grid>
    </>
  );
};

export default EnhancedSettingsDialog;
