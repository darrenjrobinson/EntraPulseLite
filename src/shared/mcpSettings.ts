// Helpers for MCP profile settings.

import { MCPConfig } from '../types';

export type McpProfileToggleKey = 'microsoftEnterpriseEnabled' | 'lokkaUseGraphBeta';

/**
 * Whether interactive MCP apps (Lokka's Graph Explorer, etc.) should render inline in
 * chat. Defaults to enabled; only an explicit `false` disables it (text/JSON fallback).
 */
export function interactiveMcpAppsEnabled(mcpConfig?: Pick<MCPConfig, 'interactiveApps'> | null): boolean {
  return mcpConfig?.interactiveApps !== false;
}

/**
 * Whether changing a given MCP profile toggle requires the user to sign in again.
 *
 * These toggles are persisted via saveTenantProfile(), which reinitializes the MCP
 * services (restarting the Lokka connection with new env). The restart does not re-apply
 * the live interactive token, so the connection comes back unauthenticated until the user
 * signs in again. Both toggles go through that path, so both require re-auth.
 */
export function mcpToggleRequiresReauth(_key: McpProfileToggleKey): boolean {
  return true;
}

/** Short, user-facing note explaining the re-auth requirement (shown next to the toggle). */
export const MCP_ENDPOINT_REAUTH_NOTE =
  'Changing this reconnects MCP services and prompts you to sign in again.';
