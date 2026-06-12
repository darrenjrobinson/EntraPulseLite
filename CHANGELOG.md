# Changelog

All notable changes to EntraPulse Lite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - Unreleased

### Added
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
