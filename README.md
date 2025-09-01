# EntraPulse Lite

A free community desktop application that provides natural language querying of Microsoft Graph APIs through local LLM integration. EntraPulse Lite is a lightweight derivative of the EntraPulse project, designed as an all-in-one desktop solution similar to Claude Desktop.

![](./docs/EntraPulse%20Lite%20-%20Hello.png)

## 🚀 Features

- **Enhanced Graph Access**: Uses Microsoft Graph PowerShell client ID for comprehensive delegated permissions
- **Custom Application Support**: Use your own Entra App Registration with delegated permissions for tailored access  
- **Dual Authentication Modes**: Switch between Enhanced Graph Access and Custom Application modes at runtime
- **Flexible Browser Authentication**: Choose between embedded browser or system browser for authentication compliance
- **Work or School Microsoft Account**: Secure login with MSAL integration
- **Natural Language Querying**: Chat with your Microsoft Graph data using plain English
- **Multi-Provider LLM Integration**: Works with local (Ollama, LM Studio) and cloud (OpenAI, Anthropic, Google Gemini, Azure OpenAI) AI models
- **Real-time LLM Status Monitoring**: Dynamic tracking of LLM availability with automatic UI updates
- **Automatic Updates**: Seamless updates delivered through GitHub Releases with code signing and user control
- **Built-in MCP Servers**: 
  - Lokka MCP using the official @merill/lokka package for Microsoft Graph API access
  - Microsoft Docs MCP using the official MicrosoftDocs/MCP package for Microsoft Learn documentation and official Microsoft documentation
  - Fetch MCP for general web searches and documentation retrieval
- **Chat Interface**: Modern UI with trace visualization, permission management, code copy functionality, and conversation context management
- **Enhanced User Experience**: Copy code blocks with one click, start new conversations to clear context
- **Free Community Tool**: Enhanced Graph Access mode requires no App Registration setup

## 🏗️ Architecture

- **Platform**: Electron desktop application
- **Language**: TypeScript
- **Build Tool**: Webpack with Electron Forge
- **Authentication**: Microsoft MSAL for secure token management
- **LLM Integration**: Local models via Ollama/LM Studio + Cloud models (OpenAI, Anthropic, Google Gemini)
- **UI Framework**: React with Material-UI
- **MCP Protocol**: Model Context Protocol for extensible AI interactions

## 📁 Project Structure

```
src/
├── main/                 # Main process (Node.js environment)
├── renderer/             # Renderer process (Web environment)
├── shared/               # Shared utilities and types
├── mcp/                  # MCP server integration
├── auth/                 # Authentication logic
├── llm/                  # Local & Cloud LLM integration
├── types/                # TypeScript definitions
└── tests/                # Unit and integration tests
```

## 🛠️ For End Users

**No prerequisites required!** EntraPulse Lite is a self-contained desktop application.

**Required:**
- **Entra ID Work/School Account** - The application uses your delegated permissions to access Microsoft Graph
- **Port 3000 Access** - Required when using System Browser authentication mode for CA compliance
- **LLM Provider** (flexible configuration):
  - **Cloud LLM API Keys** (Recommended) - Reliable performance with Anthropic Claude Sonnet, Azure OpenAI GPT-4o, OpenAI, or Google Gemini
  - **Local LLM** (Ollama or LM Studio) - Privacy-focused processing with hardware-dependent performance
  - **Hybrid Mode** - Prefer cloud with local fallback, or use both based on availability

**Authentication Options:**
- **Enhanced Graph Access** (Quick Start) - Uses Microsoft Graph PowerShell client ID with built-in delegated permissions

![](./docs/EntraPulse%20Lite%20MSGraph%20PowerShell%20App%20Mode.png)

- **Custom Application Mode** - Use your own Entra App Registration with delegated permissions configured for your specific needs

![](./docs/EntraPulse%20Lite%20MSGraph%20Custom%20App%20Mode.png)

**Browser Authentication Options:**
- **Embedded Browser** (Default) - Authentication occurs within the application window for seamless user experience
- **System Browser** (CA Compliance) - Authentication redirects to your default system browser for organizations requiring Certificate Authority (CA) compliance and advanced security policies (requires port 3000 access on localhost)


## 👨‍💻 For Developers & Contributors

- **Node.js** 18 or higher
- **npm** or **yarn**
- **Git** for version control

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/darrenjrobinson/EntraPulseLite.git
cd EntrapulseLite

# Install dependencies
npm install

# Start development mode
npm start
```

### Basic Setup

1. **Run the application** - No initial configuration required
2. **Sign in** with your Microsoft account
3. **Choose an LLM provider**:
   - **Cloud** (Recommended): Add API keys in Settings for Anthropic Claude Sonnet, Azure OpenAI GPT-4o, OpenAI, or Google Gemini
   - **Local**: Install Ollama or LM Studio for privacy-focused processing (see [Local LLM Setup](#local-llm-setup))

![](./docs/EntraPulse%20Lite%20Local%20LLM%20Settings.png)

### Cloud LLM Setup (Recommended)

For optimal performance and reliability, we recommend using cloud-based AI providers:

![](./docs/EntraPulse%20Lite%20Cloud%20LLM%20Settings.png)

#### Option 1: Anthropic Claude Sonnet (Recommended)
1. Visit [Anthropic Console](https://console.anthropic.com)
2. Create an account and generate an API key
3. In EntraPulse Lite Settings → LLM Configuration → Add Claude Sonnet
4. Enter your API key and select Update then select the `claude-sonnet-4-20250514` model

#### Option 2: Azure OpenAI GPT-4o (Enterprise)
1. Access your Azure OpenAI resource in the Azure Portal
2. Get your endpoint URL and API key from Keys and Endpoint
3. In EntraPulse Lite Settings → LLM Configuration → Add Azure OpenAI
4. Configure with your endpoint, API key, then select Update then select your `gpt-4o` deployment

#### Alternative Cloud Options:
- **OpenAI**: Direct API access to GPT-4o and other models
- **Google Gemini**: Google's advanced AI models

### Local LLM Setup (Privacy-Focused Alternative)

For privacy-focused AI processing, install a local LLM:

#### Option 1: Ollama (Recommended using Docker)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull codellama:7b
```

#### Option 2: LM Studio
1. Download from [lmstudio.ai](https://lmstudio.ai)
2. Install and download a compatible model
3. Start the local server

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for detailed setup instructions.

## 🎯 Key Capabilities

### Delegated Permission Modes
EntraPulse Lite uses delegated permissions exclusively for secure, user-context access to Microsoft Graph:

**Enhanced Graph Access (Quick Start):**
- Uses the Microsoft Graph PowerShell client ID (14d82eec-204b-4c2f-b7e8-296a70dab67e)
- Provides comprehensive delegated permissions out-of-the-box
- **Requires only Tenant ID** - no custom app registration needed
- Includes permissions for mail, calendar, files, directory, and more
- **Essential for System Browser authentication** when organizational policies require it

**Custom Application Mode:**
- Uses your own Entra App Registration
- Requires configuring delegated permissions in Azure Portal
- **Requires both Client ID and Tenant ID**
- Allows tailored permission scopes for specific organizational needs
- Full control over which Microsoft Graph APIs are accessible

You can switch between modes in Settings → Entra Application Settings.

### Browser Authentication Modes
EntraPulse Lite supports flexible authentication flows to accommodate different organizational security requirements:

**Embedded Browser (Default):**
- Authentication occurs within the application window
- Seamless user experience with integrated login flow
- Suitable for most standard authentication scenarios
- Compatible with basic multi-factor authentication

**System Browser (CA Compliance):**
- Authentication redirects to your default system browser
- Required for organizations with Certificate Authority (CA) compliance policies
- Supports advanced security features like hardware security keys (FIDO2/WebAuthn)
- Compatible with complex conditional access policies and device-based authentication
- Recommended for enterprise environments with strict security requirements
- **Network Requirement**: Port 3000 must be accessible on localhost for authentication redirect
- **Configuration Requirement**: Tenant ID must be specified when using Enhanced Graph Access mode

You can toggle between browser modes in Settings → Entra Application Settings → "Use System Browser".

### Multi-Provider LLM Support
**Cloud Providers** (Recommended):
- Anthropic Claude Sonnet (Claude 3.5 Sonnet)
- Azure OpenAI (Enterprise-grade GPT-4o, GPT-4, GPT-3.5)
- OpenAI (GPT-4, GPT-3.5)
- Google Gemini

**Local Providers** (Privacy-focused):
- Ollama
- LM Studio

### Natural Language Queries
Ask questions in plain English:
- "Show me all users in the Sales department"
- "List groups with external members"
- "What permissions does this application have?"

**Enhanced Chat Experience:**
- **Copy Code Blocks**: One-click copying of code examples and scripts with visual feedback
- **Conversation Management**: Start new conversations to clear context and begin fresh interactions
- **Session Tracking**: Maintains conversation context for follow-up questions until manually cleared

## 📚 Documentation

- [Installation & Setup](docs/INSTALLATION.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Auto-Updater Setup](docs/AUTO-UPDATER.md)
- [UI Enhancements](docs/UI-ENHANCEMENTS.md)
- [Configuration System](docs/CONFIGURATION.md)
- [Privacy Policy](docs/PRIVACY-POLICY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Contributing](docs/CONTRIBUTING.md)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 🔧 Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for:
- Development setup
- Architecture details
- Contributing guidelines
- Testing procedures

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/darrenjrobinson/EntraPulseLite/issues)
- **Discussions**: [GitHub Discussions](https://github.com/darrenjrobinson/EntraPulseLite/discussions)
- **Documentation**: [Project Wiki](https://github.com/darrenjrobinson/EntraPulseLite/wiki)
