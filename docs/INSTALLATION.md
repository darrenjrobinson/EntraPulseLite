# Installation & Setup Guide

## 🚀 Quick Start for End Users

### Prerequisites
- **Windows 10/11** (primary platform)
- **Microsoft Work/School Account** 
- **Internet Connection** for cloud LLM providers
- **Port 3000 Access** (when using System Browser authentication mode)

## � Quick Start for End Users
## 🛠️ Developer Installation

### Developer Prerequisites
- **Node.js** 18.0 or higher
- **npm** 8.0 or higher (or **yarn** 1.22+)
- **Git** for version control

### 1. Download and Run
1. Download the **EntraPulse Lite Portable** executable from [GitHub Releases](https://github.com/darrenjrobinson/EntraPulseLite/releases)
2. Run `EntraPulse Lite.exe` - no installation required!
3. The application will start and prompt you to sign in with your Microsoft account

### 2. Sign In to Microsoft
1. Click **"Sign In"** when prompted
2. Use your **Work or School Microsoft account** (personal MSA Accounts will not work)
3. Grant the requested permissions when prompted
4. You'll see your profile information once authenticated

### 3. Configure Your Preferred LLM Provider

#### Option A: Anthropic Claude 4 Sonnet (Recommended)
1. Go to **Settings** → **Cloud Providers** → **Anthropic**
2. Get your API key from [console.anthropic.com](https://console.anthropic.com)
3. Enter your API key
4. Select **Claude 4 Sonnet** as your model (optimal for Microsoft Graph knowledge)
5. Click **Save**

#### Option B: OpenAI GPT-4o (Alternative)
1. Go to **Settings** → **Cloud Providers** → **OpenAI** 
2. Get your API key from [platform.openai.com](https://platform.openai.com)
3. Enter your API key
4. Select **GPT-4o** as your model (excellent for Microsoft Graph knowledge)
5. Click **Save**

#### Option C: Azure OpenAI (Enterprise)
For enterprise users with Azure OpenAI deployments:
1. Go to **Settings** → **Cloud Providers** → **Azure OpenAI**
2. Enter your Azure OpenAI endpoint URL (full URL including deployment)
3. Enter your API key 
4. Your deployed model(s) will be automatically detected
5. Click **Save**

> **💡 Why these models work best:**
> - **Claude 4 Sonnet**: Excellent at understanding Microsoft Graph schema and permissions
> - **GPT-4o**: Strong performance with structured data and API responses  
> - **Azure OpenAI**: Enterprise-grade with data residency and compliance features

### 4. Choose Authentication Mode

EntraPulse Lite supports two delegated permission modes:

#### Option A: Enhanced Graph Access (Quick Start)
1. Go to **Settings** → **Entra Application Settings**
2. Toggle **"Enhanced Graph Access (Microsoft Graph PowerShell)"** to **ON**
3. Enter your **Tenant ID** only (optional to direct authentication to your tenant rather than the common login endpoint. The Microsoft Graph PowerShell Client ID is pre-configured)
4. Click **Save Configuration**

The application will automatically use the Microsoft Graph PowerShell application registration (`14d82eec-204b-4c2f-b7e8-296a70dab67e`) which provides comprehensive delegated permissions for Graph API access.

#### Option B: Custom Application Mode
1. First, create your own Entra App Registration (see [Custom App Registration Setup](#custom-app-registration-setup))
2. Go to **Settings** → **Entra Application Settings**
3. **Keep "Enhanced Graph Access" OFF**
4. Enter your **Client ID** and **Tenant ID**
5. Click **Save Configuration**

> **💡 How to find your Tenant ID:**
> 1. Go to [portal.azure.com](https://portal.azure.com)
> 2. Navigate to **Microsoft Entra ID** → **Overview**
> 3. Copy the **Tenant ID** (GUID format)
> 
> **Alternative:** Your tenant ID is also visible in EntraPulse Lite under **User Profile** → **Session Info** after signing in

### 4a. Configure Browser Authentication (Optional)

EntraPulse Lite supports two browser authentication modes to accommodate different organizational security requirements:

#### Option A: Embedded Browser (Default)
- Authentication occurs within the application window
- Seamless user experience with integrated login flow
- No additional configuration required

#### Option B: System Browser (CA Compliance)
1. Go to **Settings** → **Entra Application Settings**
2. Toggle **"Use System Browser"** to **ON**
3. Click **Save Configuration**

> **⚠️ Network Requirements for System Browser:**
> - **Port 3000** must be accessible on localhost for authentication redirect
> - Ensure your firewall allows local connections to `http://localhost:3000`
> - Corporate networks may require IT approval for localhost port access

**When to use System Browser:**
- ✅ Your organization requires Certificate Authority (CA) compliance
- ✅ You need hardware security key (FIDO2/WebAuthn) support
- ✅ Complex conditional access policies are applied to your account
- ✅ Device-based authentication is required
- ✅ Enterprise security policies block embedded browser authentication

**When to use Embedded Browser:**
- ✅ Standard authentication scenarios
- ✅ Simplified user experience is preferred
- ✅ No specific CA compliance requirements
- ✅ Basic multi-factor authentication is sufficient

### 5. Test Your Setup
1. In the chat interface, ask: **"Who am I?"**
2. You should see your Microsoft profile information
3. Try: **"What groups am I a member of?"**
4. Try: **"Show me the organiation configuration for the tenant"** (will advise if additional permissions are needed)

### 🎉 You're Ready to Go!

Your EntraPulse Lite is now configured with:
- ✅ Microsoft authentication
- ✅ Cloud LLM provider (Claude 4 Sonnet or GPT-4o)
- ✅ Enhanced Graph Access for optimal permissions
- ✅ Built-in MCP servers for Microsoft Graph and documentation

### Quick Start Troubleshooting

**❌ "Sign-in failed" or authentication errors:**
- Ensure you're using a **Work or School** Microsoft account (not personal)
- Check your internet connection
- Try signing out and signing in again
- **Try switching browser mode**: Toggle "Use System Browser" in Settings if authentication fails
- Contact your IT administrator if you see permission errors

**❌ "Browser authentication issues":**
- **Embedded Browser fails**: Try enabling "Use System Browser" in Settings → Entra Application Settings
- **System Browser fails**: Try disabling "Use System Browser" to use embedded authentication
- **CA compliance errors**: Enable "Use System Browser" for Certificate Authority compliance
- **Hardware security key not working**: Enable "Use System Browser" for FIDO2/WebAuthn support
- **System Browser redirect fails**: Ensure port 3000 is not blocked by firewall or corporate network policies

**❌ "LLM Provider Error" or no responses:**
- Verify your API key is correct (check for extra spaces)
- Ensure you have credits/quota remaining with your LLM provider
- Try switching to a different model in Settings → Cloud Providers

**❌ "Enhanced Graph Access not working":**
- Double-check your Tenant ID (should be a GUID format like `12345678-1234-1234-1234-123456789abc`)
- Ensure the Microsoft Graph PowerShell app is not blocked in your tenant
- Contact your IT administrator - they may need to consent to the application

**❌ "Permission denied" for Graph queries:**
- Try queries that require basic permissions first: "Who am I?"
- Enhanced Graph Access may need admin consent for some permissions
- Some queries may require additional permissions - the app will advise you

**✅ Working correctly? Try these sample queries:**

### Microsoft Graph API Queries
- `"Who am I?"` - Basic profile information
- `"What groups am I a member of?"` - Group membership
- `"Show me my recent emails"` - Email access (requires consent)
- `"List users in my organization"` - Directory queries (Enhanced Graph Access)
- `"What applications are registered in my tenant?"` - App information (Enhanced Graph Access)

### Microsoft Docs MCP Knowledge Queries
- `"What is the Microsoft Graph API to get transitive group memberships?"`
- `"How do I authenticate with Microsoft Graph using client credentials?"`
- `"What are the required permissions for reading user mailboxes?"`
- `"Explain the difference between application and delegated permissions in Microsoft Graph"`
- `"What is Conditional Access in Microsoft Entra ID?"`
- `"How do I implement device-based conditional access policies?"`

### Advanced Combined Queries
- `"Show me all security groups I'm a member of and explain how to get nested group memberships via API"`
- `"List my calendar events and tell me how to create recurring meetings using Microsoft Graph"`
- `"Display my OneDrive files and explain Microsoft Graph file sharing permission models"`

## �🛠️ Developer Installation

### Prerequisites

## 🛠️ Developer Installation

### Developer Prerequisites
- **npm** 8.0 or higher (or **yarn** 1.22+)
- **Git** for version control

### Optional but Recommended
- **Local LLM Provider** (Ollama or LM Studio) for privacy-focused AI
- **Cloud LLM API Keys** (OpenAI, Anthropic, or Google Gemini) for advanced features
- **Microsoft Entra App Registration** for enhanced permissions

### Developer Installation Steps

### 1. Clone the Repository
```bash
git clone https://github.com/darrenjrobinson/EntraPulseLite.git
cd EntrapulseLite
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configuration
All configuration is done through the application UI:
- **LLM Providers**: Configure in Settings → Cloud Providers
- **Microsoft Authentication**: Configure in Settings → Entra Configuration
- **Enhanced Graph Access**: Enable in Settings → Entra Configuration

**Authentication Modes (Delegated Permissions Only):**
1. **Basic User Token**: Uses default Microsoft authentication (no custom Client ID needed)
2. **Custom User Token**: Uses your custom app registration with delegated permissions (requires Client ID + Tenant ID)
3. **Enhanced Graph Access**: Uses Microsoft Graph PowerShell client ID with broader permissions (requires Tenant ID only)

**Important:** Enhanced Graph Access overrides any custom Client ID configuration and uses the well-known Microsoft Graph PowerShell client ID (14d82eec-204b-4c2f-b7e8-296a70dab67e).

**Authentication Field Requirements:**
- **Client ID**: Optional - only used when Enhanced Graph Access is disabled
- **Tenant ID**: Required for both custom app authentication and Enhanced Graph Access

No environment files are needed - all settings are stored securely using `electron-store` with encryption.

## 🚀 Quick Start

### Development Mode
```bash
npm start
```

This will:
1. Build the application
2. Start the Electron application
3. Enable hot reload for development

### Production Build
```bash
npm run build
npm run package
```

## 🤖 LLM Provider Setup

### Local Providers (Privacy-Focused)

#### Option 1: Ollama (Recommended)

**Install Ollama:**
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows (PowerShell)
iwr -useb https://ollama.ai/install.ps1 | iex
```

**Pull and run a model:**
```bash
# Popular options
ollama pull llama3.1:8b
ollama pull codellama:13b
ollama pull mistral:7b

# Verify installation
ollama list
```

**Docker Alternative:**
```bash
# Run Ollama in Docker
docker run -d --name ollama -p 11434:11434 -v ollama:/root/.ollama --restart unless-stopped ollama/ollama

# Pull a model
docker exec -it ollama ollama pull llama3.1:8b
```

#### Option 2: LM Studio

1. Download from [lmstudio.ai](https://lmstudio.ai)
2. Install the application
3. Download a compatible model (e.g., Llama 3.1, CodeLlama)
4. Start the local server (default port: 1234)

### Cloud Providers

#### OpenAI
1. Get API key from [platform.openai.com](https://platform.openai.com)
2. Add to Settings → Cloud Providers → OpenAI
3. Available models: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo

#### Anthropic (Claude)
1. Get API key from [console.anthropic.com](https://console.anthropic.com)
2. Add to Settings → Cloud Providers → Anthropic
3. Available models: Claude 4 Sonnet, Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku

#### Google Gemini
1. Get API key from [ai.google.dev](https://ai.google.dev)
2. Add to Settings → Cloud Providers → Google Gemini
3. Available models: Gemini 1.5 Pro, Gemini 1.5 Flash

## 🔐 Microsoft Authentication Setup

### Authentication Modes Overview

EntraPulse Lite supports multiple delegated authentication modes, each providing different levels of access:

| Mode | Token Type | Permissions Source | User Context | Use Case |
|------|------------|-------------------|--------------|----------|
| **Default User Token** | Delegated | Microsoft defaults | ✅ Yes | Basic personal use |
| **Custom User Token** | Delegated | Your app registration | ✅ Yes | Enhanced personal use |
| **Enhanced Graph Access** | Delegated | Microsoft Graph PowerShell | ✅ Yes | Broad basic API access |

> **📝 Note**: All authentication modes use delegated permissions with user context. True application-only authentication (client credentials flow) is not implemented.

### Browser Authentication Modes

EntraPulse Lite supports two browser authentication approaches to accommodate different organizational security requirements:

| Browser Mode | Experience | Security Features | Use Case |
|--------------|------------|-------------------|----------|
| **Embedded Browser** | Integrated | Standard MFA | Default user experience |
| **System Browser** | External redirect | CA compliance, FIDO2/WebAuthn, Advanced policies | Enterprise security requirements |

**Embedded Browser (Default):**
- Authentication occurs within the application window
- Seamless user experience with integrated login flow
- Compatible with standard multi-factor authentication
- Suitable for most authentication scenarios

**System Browser (CA Compliance):**
- Authentication redirects to your default system browser
- Required for Certificate Authority (CA) compliance policies
- Supports hardware security keys (FIDO2/WebAuthn)
- Compatible with complex conditional access policies
- Supports device-based authentication requirements
- Recommended for enterprise environments with strict security policies
- **Requires**: Port 3000 accessible on localhost for authentication redirect

**Configuration:** Toggle between modes in Settings → Entra Application Settings → "Use System Browser"

### Basic Setup (Default)
EntraPulse Lite works out of the box with Microsoft's authentication:
- Uses Microsoft's public client configuration for user authentication
- Supports delegated permissions with progressive consent
- Perfect for individual users and basic Graph API access
- **Permissions**: `User.Read`, `profile`, `openid`, `email`

### Enhanced Graph Access (Recommended)
Uses the Microsoft Graph PowerShell application for broader API access:
- **Client ID**: `14d82eec-204b-4c2f-b7e0-296602dcde65` (pre-configured)
- **Token Type**: Delegated permissions with user context
- **Permissions**: Broader delegated permissions for comprehensive Graph access
- **Setup**: Only requires your Tenant ID in Settings → Entra Configuration
- **Use Case**: Best balance of permissions and ease of setup

### Custom User Token Mode (Advanced)
Uses your custom app registration for tailored delegated permissions:
- **Client ID**: Your custom app registration ID
- **Token Type**: Delegated permissions with user context  
- **Permissions**: Your app's configured delegated permissions
- **Setup**: Requires Client ID and Tenant ID (no client secret)
- **Use Case**: Custom permission sets while maintaining user context

### Custom Application Registration (Advanced)
For enterprise scenarios requiring custom permissions:

1. **Create App Registration**:
   - Go to [Azure Portal](https://portal.azure.com)
   - Navigate to **Microsoft Entra ID** → **App registrations**
   - Click **"New registration"**

2. **Configure Application**:
   - **Name**: "EntraPulse Lite Custom"
   - **Supported account types**: "Accounts in this organizational directory only"
   - **Redirect URI**: 
     - Click **"Add a platform"**
     - Select **"Mobile and desktop applications"** (NOT "Single-page application")
     - **URI**: `http://localhost`

3. **Configure Application Type**:
   - Go to **Authentication** in your app registration
   - Under **Advanced settings**, set **"Allow public client flows"** to **Yes**
   - This is **required** for desktop applications using MSAL

4. **Configure API Permissions** (Delegated Permissions Only):

   EntraPulse Lite uses delegated permissions exclusively for user-context access:
   ```
   Microsoft Graph - Delegated Permissions:
   - User.Read
   - User.ReadBasic.All
   - Directory.Read.All
   - Group.Read.All
   - Mail.Read (if needed for email functionality)
   - Calendars.Read (if needed for calendar functionality)
   - Files.Read.All (if needed for OneDrive/SharePoint functionality)
   ```

5. **Grant Admin Consent**:
   - In the app registration, go to **API permissions**
   - Click **"Grant admin consent for [Your Organization]"**
   - Confirm the consent

> **Note**: Client secrets are not required as EntraPulse Lite uses delegated permissions only

### Configuration Options

**Custom Application Mode** (Using Your Own App Registration)
   - Go to **Settings** → **Entra Application Settings**
   - **Keep "Enhanced Graph Access" OFF**
   - Enter your **Client ID** and **Tenant ID**
   - Click **Save Configuration**
   - **Result**: Your custom app's delegated permissions with user context

**Enhanced Graph Access Mode** (Using Microsoft Graph PowerShell)
   - Go to **Settings** → **Entra Configuration**
   - Toggle **"Enhanced Graph Access"** to **ON**
   - Enter your **Tenant ID** only
   - **Leave Client ID fields empty** (automatically uses Microsoft Graph PowerShell client)
   - Click **Save Configuration**
   - **Result**: Microsoft Graph PowerShell delegated permissions

**System Browser Authentication** (For CA Compliance)
   - Go to **Settings** → **Entra Application Settings**
   - Toggle **"Use System Browser"** to **ON**
   - Click **Save Configuration**
   - **Result**: Authentication will redirect to your default system browser for enhanced security compliance

> **🔄 Authentication Flow Priority:**
> 1. **Enhanced Graph Access** (if enabled)
> 2. **Custom User Token Mode** (if custom client ID configured)
> 3. **Default User Token Mode** (Microsoft default permissions)

> **💡 Permission Display in UI:**
> - **Custom User Token**: Shows delegated permissions from your app registration  
> - **Enhanced Graph Access**: Shows Microsoft Graph PowerShell delegated permissions
> - **Default User Token**: Shows basic Microsoft permissions (User.Read, etc.)

> **⚠️ Important Notes:**
> - **Platform Type**: Use "Mobile and desktop applications" NOT "Single-page application"
> - **Redirect URI**: Must be exactly `http://localhost` to match the authentication flow
> - **Public Client Flows**: Must be enabled for desktop applications
> - **System Browser**: Enable "Use System Browser" for CA compliance or when embedded browser authentication fails
> - **Port 3000**: Must be accessible on localhost when using System Browser authentication mode

## 🧪 Verification

### Test Local LLM Connection
```bash
# Test Ollama
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1:8b",
  "prompt": "Hello, world!",
  "stream": false
}'

# Test LM Studio
curl http://localhost:1234/v1/models
```

### Test Application
1. Start the application: `npm start`
2. Sign in with your Microsoft account
3. Select an LLM provider in Settings
4. Ask a test question: "Who am I?"

## 🔧 Development Setup

### Additional Development Dependencies
```bash
# Install development tools globally (optional)
npm install -g @electron/packager
npm install -g electron-builder
```

### IDE Configuration
**VS Code Extensions** (recommended):
- TypeScript Hero
- Electron React
- Material-UI Snippets
- Jest Runner

### Hot Reload Development
```bash
# Start with hot reload
npm run dev

# Run tests in watch mode
npm run test:watch
```

## 🐳 Docker Setup (Optional)

For containerized development:

```bash
# Build development container
docker build -t entrapulse-lite-dev .

# Run with hot reload
docker run -p 3000:3000 -v $(pwd):/app entrapulse-lite-dev npm run dev
```

## 🔍 Troubleshooting

### Common Issues

**1. Node.js Version Conflicts**
```bash
# Use Node Version Manager
nvm install 18
nvm use 18
```

**2. Electron Build Issues**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**3. MSAL Authentication Issues**
- Ensure redirect URI is configured correctly
- Check network connectivity
- Verify tenant and client ID
- **Try System Browser**: Enable "Use System Browser" in Settings if embedded authentication fails
- **Try Embedded Browser**: Disable "Use System Browser" if system browser authentication has issues
- **Port 3000 blocked**: Ensure localhost port 3000 is accessible when using System Browser mode

**4. LLM Connection Issues**
- Verify local LLM is running: `curl http://localhost:11434/api/version`
- Check API keys for cloud providers
- Ensure firewall allows connections

### Getting Help
- Check [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions
- Search [GitHub Issues](https://github.com/darrenjrobinson/EntraPulseLite/issues)
- Ask questions in [GitHub Discussions](https://github.com/darrenjrobinson/EntraPulseLite/discussions)

## 📈 Performance Optimization

### Local LLM Performance
- **RAM**: 16GB+ recommended for larger models
- **GPU**: NVIDIA GPU with CUDA for faster inference
- **Storage**: SSD recommended for model loading

### Application Performance
- **Electron**: Latest version for security and performance
- **Node.js**: Use LTS version for stability
- **Cache**: Enable model caching for faster responses
