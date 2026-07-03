# Changelog

All notable changes to EntraPulse Lite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - Unreleased

### Added
- **EntraPulse Polyarchy MCP App** (new `entrapulse-polyarchy` package,
  pinned at v0.1.9) - an interactive Microsoft Entra ID identity-relationship
  visualization rendered inline in chat: org chains, group memberships,
  attribute pivots (any Graph user attribute), and access (directory roles,
  app assignments) on a live D3 force graph. Open it with, e.g.
  *"visualize my identity"*, *"open the polyarchy"*, or
  *"visualize Megan's relationships"*.
  - Runs in client-provided-token mode: EntraPulse Lite injects and
    refreshes the signed-in Graph token (live `set-access-token` refresh,
    no process restart); the app never performs its own sign-in
  - Same iframe sandbox and MCP Apps policy gate as the Lokka apps;
    UI-initiated `set-access-token` calls are blocked
  - New settings toggle: **Settings → MCP Server Configuration → Enable
    Polyarchy Identity Visualizer** (default on); also obeys the
    interactive-apps toggle
  - Requires the `User.Read.All`, `Group.Read.All`,
    `RoleManagement.Read.Directory`, and `Application.Read.All` delegated
    scopes (missing scopes surface as clear 403s naming the scope)

## [1.3.4] - Unreleased

### Added
- **Two more interactive Lokka MCP apps** exposed inline in chat, bringing
  the total to six: **Lokka Settings** (umbrella over Connections +
  Guardrails) and **Guardrails** (user-set policy limiting model-originated
  Lokka calls; off by default). Open them with, e.g. *"lokka settings"* or
  *"guardrails"*. Guardrails config is driven over the MCP Apps bridge and
  allowed by the policy gate; EntraPulse still owns authentication.

### Changed
- **Lokka MCP upgraded to v2.1.2** (from v2.0.0). Includes the upstream
  SSRF / token-exfiltration security fix and other stability
  improvements. Pin updated in `package.json` and `src/mcp/constants.ts`.

## [1.2.0] - Unreleased

### Added
- **Tenant Profiles** - named profiles for Managed Services teams that
  manage many customer tenants. Each profile bundles an app registration
  (Client ID, Tenant ID, Enhanced Graph Access, System Browser) plus
  per-tenant MCP settings (Microsoft Enterprise MCP on/off, Lokka Graph
  beta endpoint)
  - Profile picker in Settings -> Entra Application Settings with
    add/rename/delete and a "Switch to this profile" action
  - Switching the active profile signs out of the current tenant, clears
    cached tokens, reinitializes MCP/LLM services for the new tenant, and
    immediately prompts sign-in
  - The active profile name is shown as a chip in the chat header
  - Existing single-tenant configurations are automatically migrated to a
    "Default" profile on first use
  - Conversation history is cleared and a fresh session started on profile
    switch / sign-out, so the LLM can never reference the previous tenant's
    user (e.g. resolving "my account" to the prior tenant's UPN)
- **Lokka MCP v2.0.0 support** - upgraded from the 0.2/0.3 series and pinned
  the version (previously `@latest`, which silently picked up new major
  releases untested)
  - Azure Resource Manager querying via new `apiType: azure`,
    `subscriptionId`, and `apiVersion` tool parameters
  - `graphApiVersion` parameter to pin Graph calls to `v1.0` or `beta`
  - `useGraphBeta: false` configuration option to force the stable v1.0
    Graph endpoint (Lokka defaults to beta)
  - Token expiry (`expiresOn`) is now passed with access-token handoffs so
    Lokka reports token status accurately
- **CHANGELOG.md** (this file) to track changes between releases

### Changed
- Cloud LLM model lists now come from each provider's official models API.
  Anthropic models were previously scraped from documentation pages, which
  produced non-model entries (doc-page slugs), duplicates, and escaped
  variants in the model dropdown
- Model dropdowns are deduplicated and sorted newest-family-first; OpenAI
  and Azure OpenAI lists now include o-series models and exclude
  non-chat models (embeddings, audio, image)
- Default models refreshed: Anthropic `claude-sonnet-4-6` (replacing the
  retired `claude-3-5-sonnet-20241022` and soon-retiring
  `claude-sonnet-4-20250514`), Gemini `gemini-2.5-flash`
- Version strings (User-Agent headers, MCP client info, auto-updater
  fallbacks) are centralized in `src/shared/version.ts`

### Fixed
- **Test Connection failed for all Anthropic configurations** - the
  connectivity probe used a retired model (`claude-3-5-haiku-20241022`,
  retired 2026-02-19). Connection tests now validate the API key against
  the provider's models endpoint, which consumes no tokens and cannot go
  stale
- **Test Connection failed for all Gemini configurations** - same root
  cause (probe used the retired `gemini-1.5-flash`)
- **gpt-5-family and o-series models failed on OpenAI and Azure OpenAI** -
  requests sent `max_tokens` and a custom temperature, which these models
  reject; requests now send `max_completion_tokens` and default
  temperature for reasoning-family models
- **Claude Opus 4.7+/Fable-class models failed with "temperature is
  deprecated for this model"** - these models removed sampling
  parameters; the `temperature` field is now omitted for them
- **OpenAI Test Connection failed when no Organization ID was set** -
  requests sent an empty `OpenAI-Organization` header, which OpenAI
  rejects; the header is now only sent when an organization is
  configured
- Cached model lists written by the old fetch logic (containing
  doc-scraping artifacts or non-chat models) are detected, discarded,
  and refetched instead of being served to the model dropdown
- **Test Connection refused to run for models missing from a hardcoded
  list** - the settings dialog gated the test client-side against a
  static model list, so newer models (e.g. gpt-5.5-pro) failed without
  any API call; the gate is removed and the backend validates against
  the provider's live model list. "Set as Default" similarly no longer
  rewrites a live-listed model back to the hardcoded default
- **Chat silently used a different model than selected** - before every
  chat request the cloud service replaced any model missing from its
  hardcoded fallback list with the first fallback entry (all providers
  affected). The configured model is now used as-is; an invalid model
  surfaces as a clear provider error instead of a silent substitution
- Anthropic requests in the enhanced cloud service sent the API key as an
  `Authorization: Bearer` header; Anthropic requires `x-api-key`
- Settings dialog no longer warns "may not be a valid model" for models
  present in the provider's live model list
- Lokka v2.0.0 registers 16 tools including connection management
  (accepts client secrets), interactive consent, and browser launchers;
  EntraPulse Lite now exposes only the allowlisted query/auth tools to
  the LLM since the app manages authentication itself

## [1.1.0] - 2026-06-12

### Added
- Microsoft Enterprise MCP (Cloud) integration: Audit Logs, PIM,
  Conditional Access, and Device Compliance queries via
  `https://mcp.svc.cloud.microsoft/enterprise`
- Intelligent query routing between Lokka MCP (simple queries) and
  Microsoft Enterprise MCP (enterprise queries)

### Fixed
- macOS build failure with unsigned builds
- Relaxed dependency security check to critical-level only

## [1.0.1] - 2025

- Initial public release line. See GitHub Releases for details.
