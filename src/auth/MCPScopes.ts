/**
 * MCP Scopes for Microsoft Enterprise MCP Server
 * These scopes are required for accessing Microsoft Graph via the Microsoft MCP Server for Enterprise
 *
 * Reference: https://learn.microsoft.com/en-us/graph/mcp-server/overview
 */

/**
 * Permission tiers for Microsoft Enterprise MCP
 * Organized by feature category
 */
export const MCP_PERMISSION_TIERS = {
  /**
   * Audit Logs & Sign-In Analytics
   * Required for querying sign-in logs, audit logs, and security events
   */
  AUDIT_LOGS: [
    'MCP.AuditLog.Read.All',
    'MCP.Directory.Read.All',
    'MCP.SignIns.Read.All'
  ],

  /**
   * Privileged Identity Management (PIM)
   * Required for querying role assignments, eligible roles, and PIM activations
   */
  PIM: [
    'MCP.PrivilegedAccess.Read.AzureAD',
    'MCP.RoleManagement.Read.All',
    'MCP.Directory.Read.All'
  ],

  /**
   * Conditional Access Policies
   * Required for querying CA policies, policy assignments, and what-if scenarios
   */
  CONDITIONAL_ACCESS: [
    'MCP.Policy.Read.All',
    'MCP.Application.Read.All',
    'MCP.Directory.Read.All'
  ],

  /**
   * Device Compliance & Management
   * Required for querying device health, compliance status, and OS distribution
   */
  DEVICE_COMPLIANCE: [
    'MCP.Device.Read.All',
    'MCP.DeviceManagementConfiguration.Read.All',
    'MCP.Directory.Read.All'
  ],

  /**
   * User & Group Management (Basic)
   * Required for querying users, groups, and group memberships
   */
  USER_GROUP: [
    'MCP.User.Read.All',
    'MCP.Group.Read.All',
    'MCP.Directory.Read.All'
  ],

  /**
   * Application & Service Principal Management
   * Required for querying applications, service principals, and their permissions
   */
  APPLICATION: [
    'MCP.Application.Read.All',
    'MCP.Directory.Read.All'
  ],

  /**
   * Organization & Tenant Information
   * Required for querying organization details, tenant settings, and licenses
   */
  ORGANIZATION: [
    'MCP.Organization.Read.All',
    'MCP.Directory.Read.All'
  ]
} as const;

/**
 * Get all unique MCP scopes from all permission tiers
 */
export function getAllMCPScopes(): string[] {
  const allScopes = new Set<string>();
  Object.values(MCP_PERMISSION_TIERS).forEach(tierScopes => {
    tierScopes.forEach(scope => allScopes.add(scope));
  });
  return Array.from(allScopes);
}

/**
 * Get MCP scopes for specific feature categories
 * @param features Array of feature categories to get scopes for
 */
export function getMCPScopesForFeatures(features: (keyof typeof MCP_PERMISSION_TIERS)[]): string[] {
  const scopes = new Set<string>();
  features.forEach(feature => {
    MCP_PERMISSION_TIERS[feature]?.forEach(scope => scopes.add(scope));
  });
  return Array.from(scopes);
}

/**
 * Check if a scope is an MCP scope
 */
export function isMCPScope(scope: string): boolean {
  return scope.startsWith('MCP.');
}

/**
 * Get the priority features for initial MCP setup
 * Based on user preferences: Audit Logs, PIM, Conditional Access, Device Compliance, User/Group
 */
export function getPriorityMCPScopes(): string[] {
  return getMCPScopesForFeatures([
    'AUDIT_LOGS',
    'PIM',
    'CONDITIONAL_ACCESS',
    'DEVICE_COMPLIANCE',
    'USER_GROUP'
  ]);
}

/**
 * Map of feature categories to user-friendly descriptions
 */
export const MCP_FEATURE_DESCRIPTIONS = {
  AUDIT_LOGS: 'Sign-in analytics, security events, and compliance reporting',
  PIM: 'Privileged Identity Management status and role assignments',
  CONDITIONAL_ACCESS: 'Conditional Access policy analysis and coverage reports',
  DEVICE_COMPLIANCE: 'Device health, compliance status, and OS distribution',
  USER_GROUP: 'User and group queries (enhanced with MCP)',
  APPLICATION: 'Application and service principal information',
  ORGANIZATION: 'Organization details, tenant settings, and license information'
} as const;
