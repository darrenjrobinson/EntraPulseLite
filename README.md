# EntraPulse Lite

A free community desktop application that provides natural language querying of Microsoft Graph APIs through local LLM integration. EntraPulse Lite is a lightweight derivative of the EntraPulse project, designed as an all-in-one desktop solution similar to Claude Desktop.

![](./docs/EntraPulse%20Lite%20-%20Hello.png)

## 🚀 Features

- **Enhanced Graph Access**: Uses Microsoft Graph PowerShell client ID for comprehensive delegated permissions
- **Custom Application Support**: Use your own Entra App Registration with delegated permissions for tailored access  
- **Tenant Profiles**: Save app registration settings per customer tenant and switch between tenants with one click - built for Managed Services teams
- **Dual Authentication Modes**: Switch between Enhanced Graph Access and Custom Application modes at runtime
- **Flexible Browser Authentication**: Choose between embedded browser or system browser for authentication compliance
- **Work or School Microsoft Account**: Secure login with MSAL integration
- **Natural Language Querying**: Chat with your Microsoft Graph data using plain English
- **Multi-Provider LLM Integration**: Works with local (Ollama, LM Studio) and cloud (OpenAI, Anthropic, Google Gemini, Azure OpenAI) AI models
- **Real-time LLM Status Monitoring**: Dynamic tracking of LLM availability with automatic UI updates
- **Automatic Updates**: Seamless updates delivered through GitHub Releases with code signing and user control
- **Built-in MCP Servers** (Recommended: Enable Both for Best Coverage): 
  - **Lokka MCP** using the official @merill/lokka package (v2.1.2) - Fast, privacy-first Microsoft Graph and Azure Resource Manager API access for common queries, with **interactive MCP apps** (Graph Explorer, Connections, Permissions, Help, Settings, Guardrails) rendered inline in chat
  - **EntraPulse Polyarchy** using the entrapulse-polyarchy package (v0.1.11) - An interactive identity-relationship visualization (the polyarchy Microsoft demoed in 2003 and never shipped) rendered inline in chat: org chains, group memberships, attribute pivots, and access, on a live D3 force graph
  - **Microsoft Enterprise MCP** (Cloud) - Enterprise features: Audit Logs, PIM, Conditional Access, Device Compliance
  - Microsoft Docs MCP using the official MicrosoftDocs/MCP package for Microsoft Learn documentation and official Microsoft documentation
  - Fetch MCP for general web searches and documentation retrieval
- **Intelligent Query Routing**: Auto-routing between Lokka (simple queries) and Microsoft Enterprise MCP (enterprise queries) based on query complexity
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
4. Enter your API key and select Update then select the `claude-sonnet-4-6` model

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

### Tenant Profiles (Consultants / Managed Services)

Consultants / Managed Services teams that work across many customer tenants can save the Entra settings for each tenant as a named **Tenant Profile**:

- **Settings → Entra Application Settings → Tenant Profiles** - add, rename, or remove profiles; each captures the Client ID, Tenant ID, authentication options, and per-tenant MCP settings (Microsoft Enterprise MCP, Lokka Graph beta endpoint)
- **Switching profiles** signs you out of the current tenant, clears cached tokens, reconfigures the MCP servers for the new tenant, and prompts you to sign in
- The **active profile name** is shown in the chat header so you always know which tenant you're working in
- Existing configurations are migrated automatically into a "Default" profile

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
- Anthropic Claude (Claude Sonnet 4.6, Claude Opus 4.8)
- Azure OpenAI (Enterprise-grade GPT-4o, GPT-4, GPT-3.5)
- OpenAI (GPT-4, GPT-3.5)
- Google Gemini

**Local Providers** (Privacy-focused):
- Ollama
- LM Studio

### MCP Server Configuration (Recommended Setup)

> **💡 Best Practice: Enable Both Lokka MCP AND Microsoft Enterprise MCP**
>
> For the best experience, we strongly recommend enabling **both** MCP servers. They complement each other:
> - **Lokka MCP** handles simple, everyday queries quickly and privately
> - **Microsoft Enterprise MCP** provides access to advanced enterprise features

#### Lokka MCP (Simple Queries - Privacy-First)
Lokka MCP is ideal for common Microsoft Graph queries:
- **Users & Groups** - List users, group memberships, user profiles
- **Applications** - App registrations, service principals, permissions
- **Directory Objects** - Organizational units, domains, directory roles
- **Mail & Calendar** - Messages, events, contacts (with appropriate permissions)
- **Azure Resources** (Lokka v2) - Query Azure Resource Manager APIs such as subscriptions and resource configurations
- **Graph API version control** (Lokka v2) - Defaults to the **stable v1.0 Graph endpoint** for leaner responses (fewer properties). Enable beta only when you need preview-only data via **Settings → MCP Server Configuration → Lokka: use Graph beta endpoint** (or `useGraphBeta: true`). Changing this reconnects Lokka and prompts you to sign in again. The Graph Explorer's version selector reflects the version actually used.

#### Interactive MCP Apps (Lokka v2)

EntraPulse Lite supports **all six** of Lokka 2.1's interactive **MCP Apps**, rendered **inline in chat** so you can explore results visually instead of reading raw JSON:

- **Graph Explorer** - auto-opens on any Graph query. Shows the exact request (method, API version, path, query parameters) and the results as sortable tables or JSON, and lets you tweak and re-run the query. Compact by default; expands when you open the query.
- **Multi-Tenant Connection Manager** - sign into one or more tenants (as a user or service principal) and switch the active connection. Open it by asking, e.g. *"open the connection manager"*, *"add a tenant"*, *"switch to a different tenant"*.
- **Permissions Manager** - review the Graph scopes on your current token and search the full permission catalog. Open it with, e.g. *"open the permissions manager"*, *"review my permissions"*, *"what scopes do I have"*.
- **Visual Help** - a guided tour of what Lokka can do. Open it with, e.g. *"what can Lokka do?"* or *"show me the Lokka help"*.
- **Lokka Settings** - one place to manage your Lokka connections and guardrails. Open it with, e.g. *"lokka settings"* or *"manage Lokka"*.
- **Guardrails** - user-set policy limiting what model-initiated Lokka calls may do (allowed HTTP methods, API allow/deny lists, per-resource id allowlists). Off by default; open it with, e.g. *"guardrails"* or *"limit what the AI can do"*.

The Connections, Permissions, Help, Settings, and Guardrails apps open automatically when your request matches one of those intents; otherwise queries run normally and the Graph Explorer is shown.

How it works and how it stays secure:
- Apps run in a **sandboxed iframe** (`allow-scripts`, no same-origin) with a per-app **Content-Security-Policy** derived from the app's manifest. Only the official SDK transport serves these `ui://` resources.
- **EntraPulse Lite keeps owning authentication.** UI-initiated tool calls pass through a policy gate: read/display calls are allowed, while **auth-mutating actions** (sign-in, add user/service-principal connection, grant consent) are **blocked** and you're pointed to EntraPulse Lite's own auth settings.
- Toggle inline rendering with **Settings → MCP Server Configuration → Enable interactive MCP apps** (default **on**). When off, results render as text/JSON only — the text answer is always present as a fallback.
- Interactive apps require a signed-in Lokka connection (the SDK transport). If that's unavailable, the app degrades quietly to the text answer.

#### EntraPulse Polyarchy (Identity Visualization)

EntraPulse Lite bundles the [entrapulse-polyarchy](https://www.npmjs.com/package/entrapulse-polyarchy) MCP App (v0.1.11): a live, interactive identity-relationship graph rendered **inline in chat** — the intersecting-hierarchy "polyarchy" visual Microsoft demoed in 2003 and never shipped.

Open it by asking, e.g. *"visualize my identity"*, *"open the polyarchy"*, or *"visualize Megan's relationships"* (naming someone else focuses the graph on them). Then explore:
- **Click** a node to open its profile panel; **double-click** to flip the whole view to that identity's context
- Switch between **Org** (manager chains), **Groups** (memberships), **Attributes** (department/office/any Graph attribute pivots), and **Access** (directory roles, app assignments)
- Everything fetched in a session is cached, so re-exploring rebuilds instantly with zero extra Graph calls

Prefer analysis over pictures? Ask for a **report** — *"identity report for Megan"*, *"summarize Rebecca's access"*, *"report on Adele's group memberships"* — and the headless `polyarchy-report` tool returns structured relationship data (manager chain, group types, assigned vs dynamic membership, roles, app assignments) that the assistant analyzes directly in chat.

How it authenticates and stays secure:
- Runs in **client-provided-token mode**: EntraPulse Lite injects and refreshes your signed-in Graph token, so the app never performs its own sign-in
- Needs the **User.Read.All**, **Group.Read.All**, **RoleManagement.Read.Directory**, and **Application.Read.All** delegated scopes; a missing scope shows up as a clear 403 naming the scope
- Same iframe sandbox and policy gate as the Lokka apps: UI-initiated calls that would touch EntraPulse Lite's token channel are blocked
- Obeys the **Enable interactive MCP apps** toggle, plus its own switch at **Settings → MCP Server Configuration → Enable Polyarchy Identity Visualizer** (default **on**)

#### Microsoft Enterprise MCP Server (Complex Enterprise Queries)

The Microsoft Enterprise MCP Server provides access to enterprise-grade Microsoft Graph features that require MCP-specific permissions:

**Enterprise Features:**
- **Audit Logs** - Sign-in logs, directory audit logs, and security events
- **Privileged Identity Management (PIM)** - Role assignments and eligible roles
- **Conditional Access** - Policy configurations and compliance status
- **Device Compliance** - Intune device status and compliance policies

**Intelligent Query Routing:**
When both Lokka MCP and Microsoft Enterprise MCP are enabled (recommended), queries are automatically routed:
- Simple queries (users, groups, applications) → **Lokka MCP** (fast, privacy-first)
- Enterprise queries (audit logs, PIM, compliance) → **Microsoft Enterprise MCP** (cloud)

#### Prerequisites for Microsoft Enterprise MCP

1. **Admin Role** - You must have one of these Entra ID roles:
   - Global Administrator
   - Cloud Application Administrator

2. **PowerShell** - Either:
   - Windows PowerShell (included with Windows)
   - PowerShell Core (`pwsh`) on macOS/Linux

3. **Microsoft.Entra.Beta PowerShell Module**

#### Enabling Microsoft Enterprise MCP

**Step 1: Install the Microsoft.Entra.Beta PowerShell Module**
```powershell
Install-Module Microsoft.Entra.Beta -Force -AllowClobber
```

**Step 2: Connect to your Entra tenant with required scopes**
```powershell
Connect-Entra -Scopes 'Application.ReadWrite.All', 'Directory.Read.All', 'DelegatedPermissionGrant.ReadWrite.All'
```
This will open a browser for interactive authentication.

**Step 3: Grant MCP Server permissions**
```powershell
Grant-EntraBetaMCPServerPermission -ApplicationName 'ChatGPT'
```

> **Note:** The cmdlet only accepts pre-registered MCP client applications: `VisualStudioCode`, `VisualStudio`, `ChatGPT`, or `Claude`. Using any of these grants the MCP permissions at the tenant level, which EntraPulse Lite can then leverage when connecting to the Microsoft Enterprise MCP server.

**Step 4: Enable in EntraPulse Lite**
1. Open Settings → MCP Server Configuration
2. Toggle "Enable Microsoft Enterprise MCP" to ON
3. The app will now route enterprise queries to the Microsoft MCP server

> **Reference:** [Microsoft Graph MCP Server Documentation](https://learn.microsoft.com/en-us/graph/mcp-server/get-started)

#### Verifying MCP Permissions (Troubleshooting)

To confirm the MCP permissions were granted correctly:

```powershell
# Get your app's Service Principal (replace with your Client ID)
$appSp = Get-EntraBetaServicePrincipal -Filter "appId eq '<your-client-id>'"

# Check OAuth2 permission grants
$grants = Get-EntraBetaServicePrincipalOAuth2PermissionGrant -ServicePrincipalId $appSp.Id

# View granted scopes (should include MCP.* permissions)
$grants.Scope
```

**Expected MCP scopes** after running `Grant-EntraBetaMCPServerPermission`:
- `MCP.AuditLog.Read.All`
- `MCP.Policy.Read.ConditionalAccess`
- `MCP.RoleManagement.Read.Directory`
- `MCP.User.Read.All`

#### Licensing Requirements

Some Microsoft Enterprise MCP features require specific Entra ID licenses:

| Feature | Required License |
|---------|-----------------|
| Audit Logs (Sign-ins) | Entra ID P1 or P2 |
| Privileged Identity Management | Entra ID P2 |
| Conditional Access | Entra ID P1 or P2 |
| Identity Protection | Entra ID P2 |

If you receive a `403 Forbidden` error with message `Authentication_RequestFromNonPremiumTenantOrB2CTenant`, your tenant does not have the required premium license for that feature.

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
