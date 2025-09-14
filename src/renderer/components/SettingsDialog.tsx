import React, { useState, useEffect } from 'react';
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
  CircularProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { LLMConfig } from '../../types';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  currentConfig: LLMConfig;
  onSave: (config: LLMConfig) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  currentConfig,
  onSave
}) => {  const [config, setConfig] = useState<LLMConfig>(currentConfig);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string>('');
  useEffect(() => {
    setConfig(currentConfig);
  }, [currentConfig]);
  const fetchAvailableModels = async (provider: LLMConfig['provider'], apiKey?: string) => {
    if (provider !== 'openai' && provider !== 'anthropic') {
      setAvailableModels([]);
      return;
    }

    if (!apiKey && (provider === 'openai' || provider === 'anthropic')) {
      setAvailableModels([]);
      return;
    }

    setIsLoadingModels(true);
    setModelFetchError('');
    
    try {
      // Create a temporary config for model fetching
      const tempConfig: LLMConfig = {
        ...config,
        provider,
        apiKey
      };

      // Call main process to fetch available models (this now includes caching)
      const models = await window.electronAPI.llm.getAvailableModels?.(tempConfig) || [];
      
      // Ensure no duplicates and proper sorting
      const uniqueModels = [...new Set(models)].sort();
      setAvailableModels(uniqueModels);
      
      if (uniqueModels.length === 0) {
        setModelFetchError('No models found. Please check your API key.');
      } else {
        console.log(`Loaded ${uniqueModels.length} unique models for ${provider}`);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModelFetchError('Failed to fetch models. Please check your API key and try again.');
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };
  const handleProviderChange = (provider: LLMConfig['provider']) => {
    const newConfig: LLMConfig = {
      ...config,
      provider,
      // Set defaults based on provider
      ...(provider === 'ollama' && {
        baseUrl: 'http://localhost:11434',
        model: 'codellama:7b',
        apiKey: undefined,
        organization: undefined
      }),
      ...(provider === 'lmstudio' && {
        baseUrl: 'http://localhost:1234',
        model: 'gpt-4',
        apiKey: undefined,
        organization: undefined
      }),
      ...(provider === 'openai' && {
        baseUrl: undefined,
        model: 'gpt-4o-mini',
        apiKey: config.apiKey || '',
        organization: config.organization || ''
      }),
      ...(provider === 'anthropic' && {
        baseUrl: undefined,
        model: 'claude-3-5-sonnet-20241022',
        apiKey: config.apiKey || '',
        organization: undefined
      }),
      ...(provider === 'gemini' && {
        baseUrl: undefined,
        model: 'gemini-1.5-pro',
        apiKey: config.apiKey || '',
        organization: undefined
      })
    };
    setConfig(newConfig);
    
    // Fetch available models for cloud providers
    if ((provider === 'openai' || provider === 'anthropic') && newConfig.apiKey) {
      fetchAvailableModels(provider, newConfig.apiKey);
    } else {
      setAvailableModels([]);
    }
  };

  const handleApiKeyChange = (apiKey: string) => {
    const newConfig = { ...config, apiKey };
    setConfig(newConfig);
    
    // Fetch models when API key is provided for cloud providers
    if ((config.provider === 'openai' || config.provider === 'anthropic') && apiKey.trim()) {
      fetchAvailableModels(config.provider, apiKey);
    } else {
      setAvailableModels([]);
    }
  };

  // Fetch models when dialog opens if we have a cloud provider with API key
  useEffect(() => {
    if ((config.provider === 'openai' || config.provider === 'anthropic') && config.apiKey) {
      fetchAvailableModels(config.provider, config.apiKey);
    }
  }, [open]);

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    
    try {
      // Call the main process to test the connection
      const isAvailable = await window.electronAPI.llm.testConnection(config);
      setConnectionStatus(isAvailable ? 'success' : 'error');
    } catch (error) {
      setConnectionStatus('error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const isCloudProvider = config.provider === 'openai' || config.provider === 'anthropic' || config.provider === 'gemini';
  const isLocalProvider = config.provider === 'ollama' || config.provider === 'lmstudio';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>EntraPulse Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          
          {/* Provider Selection */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>LLM Provider</InputLabel>
            <Select
              value={config.provider}
              label="LLM Provider"
              onChange={(e) => handleProviderChange(e.target.value as LLMConfig['provider'])}
            >
              <MenuItem value="ollama">Ollama (Local)</MenuItem>
              <MenuItem value="lmstudio">LM Studio (Local)</MenuItem>
              <MenuItem value="openai">OpenAI (Cloud)</MenuItem>
              <MenuItem value="anthropic">Anthropic (Cloud)</MenuItem>
              <MenuItem value="gemini">Google Gemini (Cloud)</MenuItem>
            </Select>
          </FormControl>

          {/* Provider-specific configuration */}
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
                      helperText={
                        config.provider === 'ollama' 
                          ? 'Default Ollama API endpoint'
                          : 'Default LM Studio API endpoint'
                      }
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Model Name"
                      value={config.model}
                      onChange={(e) => setConfig({ ...config, model: e.target.value })}
                      placeholder={config.provider === 'ollama' ? 'codellama:7b' : 'gpt-4'}
                      helperText="The model name as it appears in your local LLM service"
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          {isCloudProvider && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Cloud LLM Configuration</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12}>                    <TextField
                      fullWidth
                      label="API Key"
                      type="password"
                      value={config.apiKey || ''}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder={
                        config.provider === 'openai' 
                          ? 'sk-...' 
                          : 'sk-ant-...'
                      }
                      helperText={
                        config.provider === 'openai'
                          ? 'Your OpenAI API key'
                          : 'Your Anthropic API key'
                      }
                      required
                    />
                  </Grid>
                  {config.provider === 'openai' && (
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Organization ID (Optional)"
                        value={config.organization || ''}
                        onChange={(e) => setConfig({ ...config, organization: e.target.value })}
                        placeholder="org-..."
                        helperText="Optional: Your OpenAI organization ID"
                      />
                    </Grid>
                  )}                  <Grid item xs={12}>
                    {availableModels.length > 0 ? (
                      <FormControl fullWidth>
                        <InputLabel>Model</InputLabel>
                        <Select
                          value={config.model}
                          label="Model"
                          onChange={(e) => setConfig({ ...config, model: e.target.value })}
                          disabled={isLoadingModels}
                        >
                          {availableModels.map((model) => (
                            <MenuItem key={model} value={model}>
                              {model}
                            </MenuItem>
                          ))}
                        </Select>
                        {isLoadingModels && (
                          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                            <CircularProgress size={16} sx={{ mr: 1 }} />
                            <Typography variant="caption" color="textSecondary">
                              Fetching available models...
                            </Typography>
                          </Box>
                        )}
                        {modelFetchError && (
                          <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                            {modelFetchError}
                          </Typography>
                        )}
                      </FormControl>
                    ) : (
                      <TextField
                        fullWidth
                        label="Model"
                        value={config.model}
                        onChange={(e) => setConfig({ ...config, model: e.target.value })}
                        placeholder={
                          config.provider === 'openai' 
                            ? 'gpt-4o-mini' 
                            : 'claude-3-5-sonnet-20241022'
                        }
                        helperText={
                          isCloudProvider && !config.apiKey 
                            ? 'Enter your API key above to see available models'
                            : 'The model to use for chat completions'
                        }
                        disabled={isLoadingModels}
                      />
                    )}
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Advanced Settings */}
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
                    inputProps={{ min: 0, max: 2, step: 0.1 }}
                    value={config.temperature || 0.7}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    helperText="Controls randomness (0.0 to 2.0)"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Max Tokens"
                    type="number"
                    inputProps={{ min: 1, max: 8192 }}                    value={config.maxTokens || 4096}
                    onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                    helperText="Maximum response length"
                  />
                </Grid>                <Grid item xs={12}>
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

          {/* Connection Test */}
          <Box sx={{ mt: 3, mb: 2 }}>
            <Button
              variant="outlined"
              onClick={testConnection}
              disabled={isTestingConnection}
              fullWidth
            >
              {isTestingConnection ? 'Testing Connection...' : 'Test Connection'}
            </Button>
            
            {connectionStatus === 'success' && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Connection successful! LLM is ready to use.
              </Alert>
            )}
            
            {connectionStatus === 'error' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                Connection failed. Please check your configuration and ensure the LLM service is running.
              </Alert>
            )}
          </Box>

          {/* Model Cache Management */}
          {(config.provider === 'openai' || config.provider === 'anthropic') && (
            <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Model Cache Management
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Models are cached for 24 hours to improve performance. Clear cache to fetch fresh models.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    try {
                      await window.electronAPI.config.clearModelCache?.(config.provider);
                      setAvailableModels([]);
                      if (config.apiKey) {
                        fetchAvailableModels(config.provider, config.apiKey);
                      }
                    } catch (error) {
                      console.error('Failed to clear cache:', error);
                    }
                  }}
                >
                  Clear {config.provider === 'openai' ? 'OpenAI' : 'Anthropic'} Cache
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    try {
                      await window.electronAPI.config.clearModelCache?.();
                      setAvailableModels([]);
                      if (config.apiKey) {
                        fetchAvailableModels(config.provider, config.apiKey);
                      }
                    } catch (error) {
                      console.error('Failed to clear all caches:', error);
                    }
                  }}
                >
                  Clear All Caches
                </Button>
              </Box>
            </Box>
          )}

          {/* Usage Guidelines */}
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Quick Start Guide:
            </Typography>
            <Typography variant="body2">
              • <strong>Local LLM:</strong> Install Ollama or LM Studio first, then download a model
              <br />
              • <strong>Cloud LLM:</strong> Get an API key from OpenAI or Anthropic
              <br />
              • <strong>Freemium:</strong> Cloud LLMs offer pay-per-use with better performance
            </Typography>
          </Alert>
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
