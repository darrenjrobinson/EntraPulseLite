// Main Chat component for EntraPulse Lite
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Avatar,
  Chip,
  CircularProgress,
  Alert,  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send as SendIcon,
  Person as PersonIcon,
  SmartToy as BotIcon,
  Login as LoginIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
  Timeline as TraceIcon,
  Shield as ShieldIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Api as ApiIcon,
  Psychology as PsychologyIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
  Clear as ClearIcon,
  Chat as ChatIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { getAssetPath } from '../utils/assetUtils';
import { ChatMessage, User, AuthToken, EnhancedLLMResponse, QueryAnalysis } from '../../types';
import { AppIcon } from './AppIcon';
import { UserProfileAvatar } from './UserProfileAvatar';
import { UserProfileDropdown } from './UserProfileDropdown';
import { useLLMStatus } from '../context/LLMStatusContext';
import { eventManager } from '../../shared/EventManager';

interface ChatComponentProps {}

export const ChatComponent: React.FC<ChatComponentProps> = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<AuthToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Use the LLM status context (which provides background polling)
  const { 
    localLLMAvailable: llmAvailable, 
    anyLLMAvailable: chatAvailable,
    lastChecked: llmLastChecked,
    forceCheck: forceLLMCheck
  } = useLLMStatus();const [currentPermissions, setCurrentPermissions] = useState<string[]>(['User.Read']);
  const [authMode, setAuthMode] = useState<'client-credentials' | 'interactive' | null>(null);
  const [permissionSource, setPermissionSource] = useState<'actual' | 'configured' | 'default'>('default');
  const [permissionRequests, setPermissionRequests] = useState<string[]>([]);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const [profileDropdownAnchor, setProfileDropdownAnchor] = useState<HTMLElement | null>(null);  const [defaultCloudProvider, setDefaultCloudProvider] = useState<'openai' | 'anthropic' | 'gemini' | 'azure-openai' | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<{ [key: string]: boolean }>({});
  const [sessionId, setSessionId] = useState<string>(() => `session-${Date.now()}`);
  
  // Cloud LLM status tracking
  const [cloudLLMStatus, setCloudLLMStatus] = useState<{
    isAvailable: boolean;
    lastError: string | null;
    isRateLimited: boolean;
    lastChecked: Date | null;
  }>({
    isAvailable: true,
    lastError: null,
    isRateLimited: false,
    lastChecked: null
  });

  useEffect(() => {
    initializeApp();
  }, []);

  // Listen for default cloud provider changes
  useEffect(() => {
    const handleDefaultProviderChange = (event: any, data: { provider: string; model: string }) => {
      console.log('🔄 Default cloud provider changed via IPC:', data.provider, 'Model:', data.model);
      setDefaultCloudProvider(data.provider as 'openai' | 'anthropic' | 'gemini' | 'azure-openai');
      setCurrentModel(data.model);
    };

    // Add the IPC listener using EventManager
    const electronAPI = window.electronAPI as any;
    if (electronAPI?.on) {
      eventManager.addEventListener(
        'config:defaultCloudProviderChanged', 
        handleDefaultProviderChange, 
        'ChatComponent',
        electronAPI
      );
      
      // Cleanup function to remove the listener
      return () => {
        eventManager.removeEventListener('config:defaultCloudProviderChanged', 'ChatComponent', electronAPI);
      };
    }
  }, []);

  // Listen for authentication logout events (e.g., from Enhanced Graph Access changes)
  useEffect(() => {
    const handleAuthLogout = (event: any, data: { reason?: string }) => {
      console.log('🔐 [ChatComponent] Authentication logout event received:', data);
      
      // Reset all authentication-related state
      setAuthToken(null);
      setUser(null);
      setUserPhotoUrl(null);
      setMessages([]);
      setCurrentPermissions(['User.Read']);
      setPermissionSource('default');
      setAuthMode('interactive');
      
      console.log('✅ [ChatComponent] Authentication state reset after logout');
    };

    // Add the IPC listener using EventManager
    const electronAPI = window.electronAPI as any;
    if (electronAPI?.on) {
      eventManager.addEventListener(
        'auth:logout', 
        handleAuthLogout, 
        'ChatComponent',
        electronAPI
      );
      
      // Cleanup function to remove the listener
      return () => {
        eventManager.removeEventListener('auth:logout', 'ChatComponent', electronAPI);
      };
    }
  }, []);

  // We don't need this useEffect anymore as the UserProfileAvatar component handles photo loading
  // But we keep the state for shared use cases
  useEffect(() => {
    // No-op - photo loading handled by UserProfileAvatar component
  }, [user]);// We're now using the UserProfileAvatar component to handle photos
  const handlePhotoLoaded = (photoUrl: string | null) => {
    if (photoUrl && user) {
      setUserPhotoUrl(photoUrl);
      // Update user object to include photoUrl for other components
      setUser(prevUser => prevUser ? { ...prevUser, photoUrl } : null);
    }
  };  const getProviderDisplayName = (provider: 'openai' | 'anthropic' | 'gemini' | 'azure-openai') => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'gemini': return 'Gemini';
      case 'azure-openai': return 'Azure OpenAI';
      default: return provider;
    }
  };const loadDefaultCloudProvider = async () => {
    try {
      const electronAPI = window.electronAPI as any; // Temporary type assertion
      const defaultProvider = await electronAPI.config.getDefaultCloudProvider();
      setDefaultCloudProvider(defaultProvider?.provider || null);
      setCurrentModel(defaultProvider?.config?.model || null);
      console.log('🔄 Default cloud provider loaded:', defaultProvider?.provider || 'None set', 'Model:', defaultProvider?.config?.model || 'Default');
    } catch (error) {
      console.error('Failed to load default cloud provider:', error);
      setDefaultCloudProvider(null);
      setCurrentModel(null);
    }
  };

  const initializeApp = async () => {
    try {
      console.log('🚀 Initializing EntraPulse Lite...');
      
      // Check authentication status first
      const token = await window.electronAPI.auth.getToken();
      if (token) {
        setAuthToken(token);
        console.log('✅ Found existing authentication token');
        
        const currentUser = await window.electronAPI.auth.getCurrentUser();
        setUser(currentUser);
        console.log('✅ Retrieved current user:', currentUser?.displayName);
      }

      // Load default cloud provider
      await loadDefaultCloudProvider();

      // Get authentication information (including permissions)
      const authInfo = await window.electronAPI.auth.getAuthenticationInfo();
      if (authInfo) {
        console.log('📋 Authentication Info received:', authInfo);
        setAuthMode(authInfo.mode);
        
        // CRITICAL: If user is already authenticated, trigger the backend authentication restart
        // This ensures Lokka gets the proper ACCESS_TOKEN even for existing sessions
        if (authInfo.isAuthenticated) {
          console.log('🔐 [INIT] User already authenticated - triggering backend restart for Lokka...');
          try {
            // Call the auth:login handler to trigger Lokka restart with authentication
            await window.electronAPI.auth.login();
            console.log('✅ [INIT] Backend authentication restart completed for existing session');
          } catch (restartError) {
            console.warn('⚠️ [INIT] Failed to restart backend authentication for existing session:', restartError);
          }
        }
        
        // Set permissions based on authentication mode and what's available
        if (authInfo.actualPermissions && authInfo.actualPermissions.length > 0) {
          console.log('✅ Using actual permissions from token:', authInfo.actualPermissions);
          setCurrentPermissions(authInfo.actualPermissions);
          setPermissionSource('actual');
        } else if (authInfo.permissions && authInfo.permissions.length > 0) {
          console.log('⚠️ Using configured permissions (no actual permissions found):', authInfo.permissions);
          setCurrentPermissions(authInfo.permissions);
          setPermissionSource('configured');
        } else {
          console.log('⚠️ No permissions found, using default');
          setCurrentPermissions(['User.Read']);
          setPermissionSource('default');
        }      } else {
        console.log('❌ No authentication info available');
      }
        // Force a check of LLM availability through the hook
      forceLLMCheck();
      
      // Welcome message will be added by useEffect when both auth and LLM are available
    } catch (error) {
      console.error('❌ Failed to initialize app:', error);
      setError('Failed to initialize application');
    }
  };  const handleLogin = async () => {
    console.log('🔐 [FRONTEND] handleLogin called - starting authentication...');
    try {
      setIsLoading(true);
      // Login with Microsoft
      console.log('🔐 [FRONTEND] Calling window.electronAPI.auth.login()...');
      const token = await window.electronAPI.auth.login();
      console.log('🔐 [FRONTEND] window.electronAPI.auth.login() completed:', {
        success: !!token,
        hasAccessToken: !!(token && token.accessToken)
      });
      setAuthToken(token);
      
      console.log('👤 [FRONTEND] Calling getCurrentUser()...');
      const currentUser = await window.electronAPI.auth.getCurrentUser();
      console.log('👤 [FRONTEND] getCurrentUser() result:', {
        hasUser: !!currentUser,
        userDetails: currentUser ? {
          id: currentUser.id,
          displayName: currentUser.displayName,
          mail: currentUser.mail,
          userPrincipalName: currentUser.userPrincipalName
        } : null
      });
      
      setUser(currentUser);
      setError(null);
        // Force a check of LLM availability
      forceLLMCheck();
      
      // Welcome message will be added by useEffect when both auth and LLM are available
      
      // Load authentication information and permissions after successful login
      const authInfo = await window.electronAPI.auth.getAuthenticationInfo();
      if (authInfo) {
        console.log('📋 Authentication Info received after login:', authInfo);
        setAuthMode(authInfo.mode);
        
        // Set permissions based on authentication mode and what's available
        if (authInfo.actualPermissions && authInfo.actualPermissions.length > 0) {
          console.log('✅ Using actual permissions from token:', authInfo.actualPermissions);
          setCurrentPermissions(authInfo.actualPermissions);
          setPermissionSource('actual');
        } else if (authInfo.permissions && authInfo.permissions.length > 0) {
          console.log('⚠️ Using configured permissions (no actual permissions found):', authInfo.permissions);
          setCurrentPermissions(authInfo.permissions);
          setPermissionSource('configured');
        } else {
          console.log('⚠️ No permissions found, using default');
          setCurrentPermissions(['User.Read']);
          setPermissionSource('default');
        }      }
      
      // Now that user is authenticated, reload cloud provider configuration
      // This will now have access to the secure configuration
      await loadDefaultCloudProvider();
      
      // Note: No need to explicitly call fetchUserPhoto here, as it will be triggered by the useEffect
    } catch (error) {
      console.error('Login failed:', error);
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };const handleLogout = async () => {
    try {
      if (authMode === 'client-credentials') {
        // For client credentials, just clear the UI state
        setAuthToken(null);
        setUser(null);
        setUserPhotoUrl(null);
        setMessages([]);
        setError('Application is configured for automatic authentication with client credentials. Restart the application to re-authenticate.');
      } else {
        // For interactive mode, perform actual logout
        await window.electronAPI.auth.logout();
        setAuthToken(null);
        setUser(null);
        setUserPhotoUrl(null);
        setMessages([]);
        setCurrentPermissions(['User.Read']); // Reset to basic permissions
      }
    } catch (error) {
      console.error('Logout failed:', error);
      setError('Logout failed');
    }
  };

  const handleProfileSettings = (event: React.MouseEvent<HTMLButtonElement>) => {
    setProfileDropdownAnchor(event.currentTarget);
  };

  const handleCloseProfileDropdown = () => {
    setProfileDropdownAnchor(null);
  };
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    // Force check LLM availability before sending
    await forceLLMCheck();
    
    // Verify LLM is available after the check
    if (!chatAvailable) {
      setError("No LLM service is currently available. Please check your configuration or ensure your local LLM is running.");
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);    try {
      // Send message to enhanced LLM service with session ID
      console.log(`🔄 ChatComponent: Sending message with sessionId: ${sessionId}`);
      const enhancedResponse = await window.electronAPI.llm.chat([...messages, userMessage], sessionId);
      
      // Update cloud LLM status on success
      updateCloudLLMStatus();
      
      // Handle both enhanced response format and backward compatibility
      let content: string;
      let metadata: any = {
        llmProvider: 'ollama', // This would come from config
        model: 'codellama:7b', // This would come from config
      };

      if (typeof enhancedResponse === 'string') {
        // Fallback for basic string response
        content = enhancedResponse;
      } else if (enhancedResponse && typeof enhancedResponse === 'object' && 'finalResponse' in enhancedResponse) {
        // Enhanced response format
        const typedResponse = enhancedResponse as EnhancedLLMResponse;
        content = typedResponse.finalResponse;
        metadata = {
          ...metadata,
          queryAnalysis: typedResponse.analysis,
          mcpResults: typedResponse.mcpResults,
          traceData: typedResponse.traceData,
        };
      } else {
        // Fallback
        content = 'Sorry, I received an unexpected response format.';
      }
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        metadata,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Update cloud LLM status based on error
      updateCloudLLMStatus(error);
      
      // Enhanced error message with fallback suggestions
      let errorMessage = 'Failed to send message. Please try again.';
      if (error instanceof Error) {
        // Check if this is a rate limit or authentication error
        if (error.message.includes('Rate Limit') || error.message.includes('429')) {
          errorMessage = `${error.message}\n\n💡 **Suggestion**: Try again in a few minutes, or switch to a different LLM provider in settings.`;
        } else if (error.message.includes('Authentication Error') || error.message.includes('Invalid API key')) {
          errorMessage = `${error.message}\n\n💡 **Suggestion**: Check your API key configuration in settings.`;
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };  const requestPermissions = async (permissions: string[]) => {
    try {
      setIsLoading(true);
      const token = await window.electronAPI.auth.requestPermissions(permissions);
      if (token) {
        setAuthToken(token);
        setCurrentPermissions(prev => [...new Set([...prev, ...permissions])]);
        setError(null);
        
        // Add a system message about the permission grant
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `✅ Permissions granted: ${permissions.join(', ')}. You can now access additional Microsoft Graph resources.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, systemMessage]);
      } else {
        setError('Permission request was denied or failed');
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      setError('Failed to request permissions');
    } finally {
      setIsLoading(false);
    }
  };
  const testGraphQuery = async (endpoint: string, requiredPermissions: string[]) => {
    try {
      setIsLoading(true);
      
      // Check if we have the required permissions
      const hasPermissions = requiredPermissions.every(perm => currentPermissions.includes(perm));
      
      if (!hasPermissions) {
        const missingPermissions = requiredPermissions.filter(perm => !currentPermissions.includes(perm));
        setPermissionRequests(missingPermissions);
        
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Missing permissions for ${endpoint}: ${missingPermissions.join(', ')}. Would you like to request these permissions?`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, systemMessage]);
        return;
      }      // Make the Graph API call
      const result = await window.electronAPI.graph.query(endpoint, 'GET');
        const systemMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Successfully queried ${endpoint}:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, systemMessage]);
      
    } catch (error: any) {
      console.error('Graph query failed:', error);      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Failed to query ${endpoint}: ${error.message}`,
        timestamp: new Date(),
        metadata: {
          isError: true // Flag to identify error messages for special styling
        }
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };  const toggleTraceExpansion = (messageId: string) => {
    setExpandedTraces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  // Copy code to clipboard
  const copyCodeToClipboard = async (code: string, codeId: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus(prev => ({ ...prev, [codeId]: true }));
      // Reset copy status after 2 seconds
      setTimeout(() => {
        setCopyStatus(prev => ({ ...prev, [codeId]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };  // Start new chat (clear conversation context)
  const startNewChat = async () => {
    try {
      // Clear local messages
      setMessages([]);
      setError(null);
      setPermissionRequests([]);
      
      // Generate a new session ID for fresh context
      const newSessionId = `session-${Date.now()}`;
      setSessionId(newSessionId);
      
      // Add welcome message after clearing
      const welcomeMessage: ChatMessage = {
        id: 'welcome-new',
        role: 'assistant',
        content: `Welcome to EntraPulse Lite! I'm your Microsoft Entra assistant. I can help you query your Microsoft Graph data, understand identity concepts, and analyze your directory structure.

What would you like to explore?`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
      
      console.log('✅ Started new chat session with ID:', newSessionId);
    } catch (error) {
      console.error('Failed to start new chat:', error);
      setError('Failed to start new chat. Please try again.');
    }
  };
  const checkAuthenticationStatus = async () => {
    try {
      console.log('🔄 Refreshing authentication status and permissions...');
      
      // Get updated authentication information
      const authInfo = await window.electronAPI.auth.getAuthenticationInfo();
      if (authInfo) {
        console.log('Updated Authentication Info:', authInfo);
        setAuthMode(authInfo.mode);
        
        // Set permissions based on authentication mode
        if (authInfo.mode === 'client-credentials') {
          // For client credentials flow, prefer actual permissions from token if available
          if (authInfo.actualPermissions && authInfo.actualPermissions.length > 0) {
            setCurrentPermissions(authInfo.actualPermissions);
            setPermissionSource('actual');
            console.log('Using actual permissions from token:', authInfo.actualPermissions);
          } else {
            setCurrentPermissions(authInfo.permissions);
            setPermissionSource('configured');
            console.log('Using configured permissions:', authInfo.permissions);
          }
        } else {
          // For interactive flow, also use actual permissions from token if available
          if (authInfo.actualPermissions && authInfo.actualPermissions.length > 0) {
            setCurrentPermissions(authInfo.actualPermissions);
            setPermissionSource('actual');
            console.log('Using actual permissions from interactive token:', authInfo.actualPermissions);
          } else {
            setCurrentPermissions(authInfo.permissions);
            setPermissionSource('configured');
            console.log('Using configured permissions for interactive:', authInfo.permissions);
          }
        }
      }      // Check and update authentication token
      const token = await window.electronAPI.auth.getToken();
      if (token) {
        setAuthToken(token);
        const currentUser = await window.electronAPI.auth.getCurrentUser();
        setUser(currentUser);
        console.log('✅ Authentication status refreshed successfully');
      } else {
        console.log('❌ No valid token found after refresh');
        setAuthToken(null);
        setUser(null);
        setUserPhotoUrl(null);
      }

      // Refresh default cloud provider
      await loadDefaultCloudProvider();
    } catch (error) {
      console.error('Failed to refresh authentication status:', error);
      throw error; // Re-throw to let the caller handle it
    }
  };

  // Add welcome message when authentication and LLM become available
  useEffect(() => {
    if (authToken && chatAvailable && messages.length === 0) {
      console.log('🎉 Adding welcome message: authToken=true, chatAvailable=true, messages.length=0');
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Welcome to EntraPulse Lite.

I'm your Microsoft assistant. I can help you query your Microsoft Entra environment, understand Microsoft Graph and identity concepts, and assist you managing and orchestrating your tenant.

What would you like to explore?`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
      console.log('✅ Welcome message added via useEffect');
    }
  }, [authToken, chatAvailable, messages.length]);

  const updateCloudLLMStatus = (error: any = null) => {
    const now = new Date();
    
    if (!error) {
      // Success case
      setCloudLLMStatus({
        isAvailable: true,
        lastError: null,
        isRateLimited: false,
        lastChecked: now
      });
      return;
    }
    
    // Analyze error to determine status and extract actual provider information
    const errorMessage = error.message || String(error);
    const isRateLimit = errorMessage.includes('429') || 
                       errorMessage.includes('Rate Limit') || 
                       errorMessage.includes('Too Many Requests');
    
    const isAuthError = errorMessage.includes('401') || 
                       errorMessage.includes('403') || 
                       errorMessage.includes('Authentication Error') ||
                       errorMessage.includes('Invalid API key');
    
    // Try to detect the actual provider from the error message or URL
    let detectedProvider = defaultCloudProvider;
    
    // Check if this is an axios error with request information
    if (error.request && error.request._header) {
      const requestHeader = error.request._header;
      if (requestHeader.includes('generativelanguage.googleapis.com')) {
        detectedProvider = 'gemini';
      } else if (requestHeader.includes('api.openai.com')) {
        detectedProvider = 'openai';
      } else if (requestHeader.includes('api.anthropic.com')) {
        detectedProvider = 'anthropic';
      } else if (requestHeader.includes('openai.azure.com')) {
        detectedProvider = 'azure-openai';
      }
    }
    
    // If we detected a different provider than the default, use it
    if (detectedProvider) {
      console.log(`🔍 CloudLLMStatus: Detected actual provider from error: ${detectedProvider}`);
    }
    
    setCloudLLMStatus({
      isAvailable: !isRateLimit && !isAuthError,
      lastError: `${detectedProvider ? getProviderDisplayName(detectedProvider) : (defaultCloudProvider ? getProviderDisplayName(defaultCloudProvider) : 'Unknown Provider')}: ${errorMessage}`,
      isRateLimited: isRateLimit,
      lastChecked: now
    });
  };

  if (!authToken) {
    return (
      <Box 
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: (theme) => theme.palette.mode === 'dark' 
            ? 'linear-gradient(145deg, #1a202c 0%, #2d3748 100%)' 
            : 'linear-gradient(145deg, #e6f2ff 0%, #f0f7ff 100%)',
          padding: 2,
        }}
      >        <Card 
          elevation={8}
          sx={{
            maxWidth: 500,
            width: '100%',
            borderRadius: 2,
            overflow: 'visible',
            position: 'relative',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >          {/* App Logo */}          <Box
            sx={{
              position: 'relative',
              marginBottom: 3,
              display: 'flex',
              justifyContent: 'center',
              width: '90%',
            }}          >            <AppIcon 
              size={150} 
              sx={{ 
                margin: '10px 0',
                filter: 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.15))',
              }} 
            />
          </Box>
          
          <Typography variant="h4" component="h1" align="center" gutterBottom>
            Welcome to EntraPulse Lite
          </Typography>
          
          <Typography variant="body1" align="center" color="textSecondary" paragraph>
            Sign in with your Microsoft Entra ID account to access intelligent insights and analysis of your identity environment.
          </Typography>
          
          {error && (
            <Alert severity="error" sx={{ width: '100%' }}>
              {error}
            </Alert>
          )}

          {!llmAvailable && (
            <Alert severity="warning" sx={{ width: '100%', mt: 1 }}>
              Local LLM is not available. Please make sure Ollama or LM Studio is running.
            </Alert>
          )}

          <Button
            variant="contained"
            size="large"
            fullWidth
            startIcon={<LoginIcon />}
            onClick={handleLogin}
            disabled={isLoading}
            sx={{ 
              mt: 2,
              py: 1.5,
              borderRadius: 1.5,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Sign in with Microsoft'}
          </Button>
          
          <Typography variant="caption" align="center" sx={{ mt: 2 }}>
            By signing in, you acknowledge this app only accesses and processes data based on your permissions in your tenant. See About (Info).
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 1 }}>
            <ShieldIcon sx={{ fontSize: 14, color: 'primary.main' }} />
            <Typography variant="caption" align="center" sx={{ fontWeight: 'medium' }}>
              Secured by Microsoft Entra ID
            </Typography>
          </Box>
        </Card>
      </Box>
    );
  }  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>      {/* Header */}      <Box
        sx={{
          p: 1, // Further reduced for more compact header
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}><Box display="flex" alignItems="center" gap={2}>
          {/* Show Microsoft Graph connection status and tenant info */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Microsoft Graph
            </Typography>
            <Chip 
              label="Connected" 
              color="success" 
              size="small" 
              variant="outlined"
            />
            {user?.tenantDisplayName && (
              <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                ({user.tenantDisplayName})
              </Typography>
            )}
          </Box>          {/* Local LLM Status with real-time updates */}
          <Tooltip title={llmLastChecked ? `Last checked: ${llmLastChecked.toLocaleTimeString()}` : "Checking status..."}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Chip 
                label={llmAvailable ? "Local LLM Online" : "Local LLM Offline"} 
                color={llmAvailable ? "success" : "warning"} 
                size="small" 
              />
              <IconButton 
                size="small" 
                onClick={forceLLMCheck}
                aria-label="Refresh LLM status"
                sx={{ ml: 0.5 }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Box>
          </Tooltip>
          
          {/* Cloud LLM Provider and Model with Status */}
          {defaultCloudProvider && (
            <Tooltip title={
              cloudLLMStatus.isRateLimited ? 
                `Rate limited - last checked: ${cloudLLMStatus.lastChecked?.toLocaleTimeString()}` :
              !cloudLLMStatus.isAvailable ?
                `Error: ${cloudLLMStatus.lastError}` :
                `Available - last checked: ${cloudLLMStatus.lastChecked?.toLocaleTimeString()}`
            }>
              <Chip 
                label={currentModel 
                  ? `${getProviderDisplayName(defaultCloudProvider)}: ${currentModel}` 
                  : `Default: ${getProviderDisplayName(defaultCloudProvider)}`}
                color={
                  cloudLLMStatus.isRateLimited ? "warning" :
                  !cloudLLMStatus.isAvailable ? "error" : 
                  "primary"
                }
                size="small"
                variant="outlined"
                icon={
                  cloudLLMStatus.isRateLimited ? <WarningIcon fontSize="small" /> :
                  !cloudLLMStatus.isAvailable ? <ErrorIcon fontSize="small" /> :
                  <CheckCircleIcon fontSize="small" />
                }
              />
            </Tooltip>
          )}
        </Box>        <Box display="flex" alignItems="center" gap={1}>
          <Tooltip title="Start New Chat">
            <Button
              variant="outlined"
              size="small"
              startIcon={<ChatIcon />}
              onClick={startNewChat}
              sx={{ mr: 1 }}
            >
              New Chat
            </Button>
          </Tooltip>
          {user && <UserProfileAvatar user={user} />}
          <Tooltip title="User Profile">
            <IconButton onClick={handleProfileSettings}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Sign out">
            <IconButton onClick={handleLogout}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1, minHeight: 0 }}>
        <List sx={{ width: '100%', maxWidth: '100%' }}>          {messages.map((message) => (
            <ListItem key={message.id} alignItems="flex-start" sx={{ mb: 0.5, width: '100%', maxWidth: '100%' }}><Box sx={{ mr: 2, mt: 0.5 }}>
                {message.role === 'user' ? 
                  (user ? 
                    <UserProfileAvatar user={user} size={40} showName={false} /> : 
                    <Avatar><PersonIcon /></Avatar>
                  ) : 
                  <Avatar sx={{ bgcolor: 'secondary.main' }}><BotIcon /></Avatar>
                }
              </Box>
              <Box sx={{ flex: 1, width: 'calc(100% - 56px)', maxWidth: 'calc(100% - 56px)' }}>                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <Typography variant="subtitle2" color="text.primary">
                        {message.role === 'user' ? 'You' : 'EntraPulse Assistant'}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {message.timestamp.toLocaleTimeString()}
                      </Typography>                      {message.metadata?.graphApiCalls && (
                        <Tooltip title="Graph API calls made">
                          <Chip
                            icon={<TraceIcon />}
                            label={message.metadata.graphApiCalls.length}
                            size="small"
                            variant="outlined"
                          />
                        </Tooltip>
                      )}
                      {message.metadata?.traceData && (
                        <Tooltip title="Show MCP trace data">
                          <Chip
                            icon={<ApiIcon />}
                            label="MCP Trace"
                            size="small"
                            variant="outlined"
                            onClick={() => toggleTraceExpansion(message.id)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                      {message.metadata?.queryAnalysis && (
                        <Tooltip title="Query analysis">
                          <Chip
                            icon={<PsychologyIcon />}
                            label={`${Math.round(message.metadata.queryAnalysis.confidence * 100)}%`}
                            size="small"
                            variant="outlined"
                            color="secondary"
                          />
                        </Tooltip>
                      )}
                    </Box>
                  }                  secondary={
                    <>                      <Box
                        sx={{ 
                          whiteSpace: 'pre-wrap', 
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere', // Add better text wrapping
                          width: '100%', // Ensure box takes full container width
                          maxWidth: '100%', // Constrain maximum width to parent
                          ...(message.metadata?.isError && {
                            backgroundColor: 'rgba(211, 47, 47, 0.05)',
                            border: '1px solid rgba(211, 47, 47, 0.1)',
                            borderRadius: '4px',
                            padding: '8px',
                          }),                          '& h1, & h2, & h3, & h4, & h5, & h6': {
                            marginTop: '0.3rem',
                            marginBottom: '0.1rem',
                            fontWeight: 'bold',
                          },
                          '& h1': { fontSize: '1.5rem' },
                          '& h2': { fontSize: '1.3rem' },
                          '& h3': { fontSize: '1.1rem' },                          '& p': {
                            marginBottom: '0.1rem',
                            lineHeight: 1.4,
                          },                          '& ul, & ol': {
                            marginBottom: '0.1rem',
                            paddingLeft: '0.8rem', // Reduced padding for better alignment
                            marginTop: '0rem',
                            listStylePosition: 'outside', // Ensure bullets are positioned outside
                          },'& ol': {
                            listStyleType: 'decimal',
                            listStylePosition: 'inside', // Changed to inside for better alignment control
                            paddingLeft: '0.5rem', // Reduced since we're using inside positioning
                          },
                          '& ol ol': {
                            listStyleType: 'lower-alpha',
                            paddingLeft: '1rem',
                          },
                          '& ol ol ol': {
                            listStyleType: 'lower-roman',
                          },                          '& li': {
                            marginBottom: '0.01rem', // Ultra minimal spacing between list items
                            lineHeight: '1.4', // Tighter line height for readability
                          },'& ol li': {
                            listStyle: 'decimal inside', // Changed to inside positioning
                            marginLeft: '0',
                            paddingLeft: '0.3rem', // Small padding for spacing after number
                            lineHeight: '1.5', // Back to 1.5 for proper alignment
                            textIndent: '0', // Ensure no text indentation conflicts
                          },                          '& li > ul, & li > ol': {
                            marginTop: '0.01rem', // Ultra minimal gap after parent list item
                            marginBottom: '0.01rem',
                            paddingLeft: '0.8rem', // Consistent indentation for nested lists
                          },
                          '& li > p': {
                            margin: '0', // Remove paragraph margins within list items
                            display: 'inline', // Prevent line breaks in list items
                          },
                          '& li p:first-child': {
                            display: 'inline', // Ensure first paragraph in li is inline
                          },
                          '& code': {
                            backgroundColor: 'rgba(175, 184, 193, 0.2)',
                            padding: '0.125rem 0.25rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem',
                            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                            overflowWrap: 'anywhere', // Add text wrapping for code
                            maxWidth: '100%', // Ensure code doesn't overflow
                          },                          '& pre': {
                            backgroundColor: 'rgba(175, 184, 193, 0.1)',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            overflow: 'auto',
                            marginBottom: '0.2rem',
                            maxWidth: '100%', // Ensure pre doesn't overflow
                          },
                          '& pre code': {
                            backgroundColor: 'transparent',
                            padding: 0,
                            overflowWrap: 'anywhere', // Add text wrapping for code blocks
                          },                          '& blockquote': {
                            borderLeft: (theme) => `4px solid ${theme.palette.mode === 'dark' ? '#87ceeb' : '#1976d2'}`,
                            paddingLeft: '1rem',
                            marginLeft: 0,
                            marginBottom: '0.2rem',
                            fontStyle: 'italic',
                          },
                          '& table': {
                            borderCollapse: 'collapse',
                            width: '100%',
                            marginBottom: '0.2rem',
                          },
                          '& th, & td': {
                            border: '1px solid rgba(175, 184, 193, 0.3)',
                            padding: '0.5rem',
                            textAlign: 'left',
                          },
                          '& th': {
                            backgroundColor: 'rgba(175, 184, 193, 0.1)',
                            fontWeight: 'bold',
                          },
                          '& strong': {
                            fontWeight: 'bold',
                          },
                          '& em': {
                            fontStyle: 'italic',
                          },
                        }}
                      >                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}                          components={{                            // Override link component to open in external browser
                            a: ({node, href, children, ...props}: {
                              node?: any;
                              href?: string;
                              children?: React.ReactNode;
                              [key: string]: any;
                            }) => {                              const handleLinkClick = (e: React.MouseEvent) => {
                                e.preventDefault();
                                if (href) {
                                  // Use Electron's shell to open link in external browser
                                  window.electron?.openExternal(href);
                                }
                              };

                              return (
                                <a
                                  href={href}
                                  onClick={handleLinkClick}
                                  style={{
                                    color: 'inherit',
                                    textDecoration: 'underline',
                                    cursor: 'pointer'
                                  }}
                                  {...props}
                                >
                                  {children}
                                </a>
                              );
                            },
                            // Override code component to add copy functionality
                            code: ({node, inline, className, children, ...props}: {
                              node?: any;
                              inline?: boolean;
                              className?: string;
                              children?: React.ReactNode;
                              [key: string]: any;
                            }) => {
                              const match = /language-(\w+)/.exec(className || '')
                              const codeContent = String(children).replace(/\n$/, '');
                              const codeId = `code-${message.id}-${Math.random().toString(36).substr(2, 9)}`;
                              
                              // Code blocks (multi-line)
                              if (!inline && match) {
                                return (
                                  <Box sx={{ position: 'relative', mb: 1 }}>
                                    <pre style={{ overflowX: 'auto', maxWidth: '100%', margin: 0 }}>
                                      <code 
                                        className={className} 
                                        style={{ 
                                          wordBreak: 'break-all', 
                                          overflowWrap: 'anywhere',
                                          whiteSpace: 'pre-wrap'
                                        }}
                                        {...props}
                                      >
                                        {children}
                                      </code>
                                    </pre>
                                    <Tooltip title={copyStatus[codeId] ? "Copied!" : "Copy code"}>
                                      <IconButton
                                        size="small"
                                        onClick={() => copyCodeToClipboard(codeContent, codeId)}
                                        sx={{
                                          position: 'absolute',
                                          top: 8,
                                          right: 8,
                                          bgcolor: 'background.paper',
                                          border: 1,
                                          borderColor: 'divider',
                                          '&:hover': {
                                            bgcolor: 'background.default',
                                          },
                                        }}
                                      >
                                        <ContentCopyIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                );
                              }
                              
                              // Inline code - add copy functionality for longer inline code (like URLs)
                              if (inline && codeContent.length > 20) {
                                return (
                                  <Box 
                                    component="span" 
                                    sx={{ 
                                      position: 'relative', 
                                      display: 'inline-flex', 
                                      alignItems: 'center',
                                      gap: 0.5
                                    }}
                                  >
                                    <code 
                                      className={className} 
                                      style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                    <Tooltip title={copyStatus[codeId] ? "Copied!" : "Copy"}>
                                      <IconButton
                                        size="small"
                                        onClick={() => copyCodeToClipboard(codeContent, codeId)}
                                        sx={{
                                          p: 0.25,
                                          minWidth: 16,
                                          height: 16,
                                          bgcolor: 'background.paper',
                                          border: 1,
                                          borderColor: 'divider',
                                          ml: 0.5,
                                          '&:hover': {
                                            bgcolor: 'background.default',
                                          },
                                        }}
                                      >
                                        <ContentCopyIcon sx={{ fontSize: 12 }} />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                );
                              }
                              
                              // Regular inline code (short)
                              return (
                                <code 
                                  className={className} 
                                  style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </Box>
                      
                      {/* Enhanced trace data display */}
                      {message.metadata?.traceData && expandedTraces.has(message.id) && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                          <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <ApiIcon fontSize="small" />
                            <Typography variant="subtitle2">MCP Integration Trace</Typography>
                            <IconButton 
                              size="small" 
                              onClick={() => toggleTraceExpansion(message.id)}
                            >
                              <ExpandLessIcon />
                            </IconButton>
                          </Box>
                          
                          {/* Query Analysis */}
                          {message.metadata.queryAnalysis && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="caption" color="primary" gutterBottom>
                                Query Analysis (Confidence: {Math.round(message.metadata.queryAnalysis.confidence * 100)}%)
                              </Typography>
                              <Typography variant="body2" sx={{ mb: 1 }}>
                                {message.metadata.queryAnalysis.reasoning}
                              </Typography>
                              <Box display="flex" gap={1} flexWrap="wrap">
                                {message.metadata.queryAnalysis.needsFetchMcp && (
                                  <Chip label="Fetch MCP" size="small" color="info" />
                                )}
                                {message.metadata.queryAnalysis.needsLokkaMcp && (
                                  <Chip label="Lokka MCP" size="small" color="success" />
                                )}
                              </Box>
                            </Box>
                          )}
                          
                          {/* Execution Steps */}
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="primary" gutterBottom>
                              Execution Steps
                            </Typography>
                            {message.metadata.traceData.steps.map((step, index) => (
                              <Typography key={index} variant="body2" sx={{ fontSize: '0.85rem', mb: 0.5 }}>
                                {index + 1}. {step}
                              </Typography>
                            ))}
                          </Box>
                          
                          {/* Timing Information */}
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="primary" gutterBottom>
                              Performance
                            </Typography>
                            <Box display="flex" gap={2} flexWrap="wrap">
                              {Object.entries(message.metadata.traceData.timing).map(([key, value]) => (
                                <Chip 
                                  key={key} 
                                  label={`${key}: ${value}ms`} 
                                  size="small" 
                                  variant="outlined" 
                                />
                              ))}
                            </Box>
                          </Box>
                          
                          {/* MCP Results */}
                          {message.metadata.mcpResults && (
                            <Box>
                              <Typography variant="caption" color="primary" gutterBottom>
                                MCP Results
                              </Typography>
                              {message.metadata.mcpResults.fetchResult && (
                                <Box sx={{ mb: 1 }}>
                                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                    Fetch MCP: {JSON.stringify(message.metadata.mcpResults.fetchResult, null, 2).substring(0, 200)}...
                                  </Typography>
                                </Box>
                              )}
                              {message.metadata.mcpResults.lokkaResult && (
                                <Box>
                                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                    Lokka MCP: {JSON.stringify(message.metadata.mcpResults.lokkaResult, null, 2).substring(0, 200)}...
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          )}
                          
                          {/* Errors */}
                          {message.metadata.traceData.errors && message.metadata.traceData.errors.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                              <Typography variant="caption" color="error" gutterBottom>
                                Errors
                              </Typography>
                              {message.metadata.traceData.errors.map((error, index) => (
                                <Alert key={index} severity="warning" sx={{ mt: 1 }}>
                                  {error}
                                </Alert>
                              ))}
                            </Box>
                          )}
                        </Box>
                      )}
                    </>
                  }
                />
              </Box>
            </ListItem>
          ))}
          {isLoading && (
            <ListItem>
              <Avatar sx={{ mr: 2 }}>
                <BotIcon />
              </Avatar>              <Box display="flex" alignItems="center" gap={1}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="textSecondary">
                  EntraPulse Assistant is thinking...
                </Typography>
              </Box>
            </ListItem>
          )}
        </List>      </Box>

      {/* Error Alert */}
      {error && (
        <Box sx={{ p: 2, flexShrink: 0 }}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Box>
      )}      {/* Input - Always at the bottom with proper spacing */}
      <Box sx={{ 
        p: 1.5, // Further reduced for more compact input area
        pb: 1.5,  // Consistent padding for better appearance
        borderTop: 1, 
        borderColor: 'divider', 
        flexShrink: 0, 
        backgroundColor: 'background.paper',
        minHeight: 65  // Slightly reduced for more space efficiency
      }}>
        <Box display="flex" gap={1} alignItems="center">
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}            placeholder={!chatAvailable 
              ? "No LLM configured - configure a local or cloud LLM to enable chat..." 
              : "Ask about your Microsoft Entra environment..."
            }
            disabled={isLoading}
            variant="outlined"
            size="medium"  // Changed from small to medium for better visibility
            helperText={!chatAvailable ? "Configure Ollama, LM Studio, or cloud LLM providers to enable chat functionality" : ""}            sx={{
              '& .MuiOutlinedInput-root': {
                minHeight: 44  // Reduced to match the more compact button
              }
            }}
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading || !chatAvailable}            sx={{ 
              minWidth: 60,
              height: 44,  // Slightly reduced to match more compact design
              alignSelf: 'center'
            }}
          >
            <SendIcon />
          </Button>
        </Box>
      </Box>

      {/* User Profile Dropdown */}
      <UserProfileDropdown
        anchorEl={profileDropdownAnchor}
        open={Boolean(profileDropdownAnchor)}
        onClose={handleCloseProfileDropdown}
        user={user}
        authToken={authToken}
      />
    </Box>
  );
};
