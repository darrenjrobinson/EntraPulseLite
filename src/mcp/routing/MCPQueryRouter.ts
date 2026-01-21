/**
 * MCPQueryRouter
 * Smart routing logic for deciding between Lokka MCP and Microsoft Enterprise MCP
 *
 * Routing Rules:
 * - If only Lokka enabled: Route all queries to Lokka
 * - If only Microsoft MCP enabled: Route all queries to Microsoft MCP
 * - If BOTH enabled: Use keyword-based classification to auto-route
 *   - General queries → Lokka (privacy-first)
 *   - Enterprise feature queries → Microsoft MCP (audit logs, PIM, CA, device compliance)
 */

import { MCPConfig } from '../../types';

export type MCPServerType = 'lokka' | 'microsoft-enterprise' | null;

export interface RoutingDecision {
  server: MCPServerType;
  reason: string;
  confidence: number; // 0-1
  fallbackServer?: MCPServerType;
  keywords?: string[];
}

export interface RoutingConfig {
  lokkaEnabled: boolean;
  microsoftMcpEnabled: boolean;
}

/**
 * Enterprise feature keywords for classification
 * Based on priority features: Audit Logs, PIM, Conditional Access, Device Compliance
 */
export const ENTERPRISE_KEYWORDS = {
  AUDIT_LOGS: [
    'sign-in',
    'signin',
    'sign in',
    'login',
    'audit',
    'log',
    'activity',
    'failed login',
    'authentication attempt',
    'security event',
    'audit log',
    'sign-in log',
    'authentication log'
  ],

  PIM: [
    'privileged',
    'PIM',
    'role assignment',
    'just-in-time',
    'eligible role',
    'privileged access',
    'role activation',
    'admin role',
    'directory role',
    'privileged role'
  ],

  CONDITIONAL_ACCESS: [
    'conditional access',
    'CA policy',
    'access policy',
    'MFA requirement',
    'MFA',
    'multi-factor',
    'authentication policy',
    'access control',
    'policy',
    'conditional'
  ],

  DEVICE_COMPLIANCE: [
    'device compliance',
    'managed device',
    'device health',
    'OS version',
    'compliant',
    'device management',
    'intune',
    'device status',
    'non-compliant',
    'device policy'
  ]
} as const;

/**
 * All enterprise keywords flattened
 */
const ALL_ENTERPRISE_KEYWORDS = Object.values(ENTERPRISE_KEYWORDS).flat();

export class MCPQueryRouter {
  /**
   * Determine which MCP server should handle the query
   */
  static routeQuery(query: string, config: RoutingConfig): RoutingDecision {
    const { lokkaEnabled, microsoftMcpEnabled } = config;

    // Case 1: No servers enabled
    if (!lokkaEnabled && !microsoftMcpEnabled) {
      return {
        server: null,
        reason: 'No MCP servers are enabled',
        confidence: 1.0
      };
    }

    // Case 2: Only Lokka enabled
    if (lokkaEnabled && !microsoftMcpEnabled) {
      return {
        server: 'lokka',
        reason: 'Only Lokka MCP is enabled',
        confidence: 1.0
      };
    }

    // Case 3: Only Microsoft MCP enabled
    if (!lokkaEnabled && microsoftMcpEnabled) {
      return {
        server: 'microsoft-enterprise',
        reason: 'Only Microsoft Enterprise MCP is enabled',
        confidence: 1.0
      };
    }

    // Case 4: Both servers enabled - Use intelligent routing
    return this.classifyQuery(query);
  }

  /**
   * Classify query based on keywords to determine optimal server
   * This is only called when BOTH servers are enabled
   */
  private static classifyQuery(query: string): RoutingDecision {
    const lowerQuery = query.toLowerCase();

    // Check for enterprise feature keywords
    const matchedKeywords: string[] = [];
    let highestCategory: string | null = null;
    let highestMatches = 0;

    for (const [category, keywords] of Object.entries(ENTERPRISE_KEYWORDS)) {
      const matches = keywords.filter(keyword =>
        lowerQuery.includes(keyword.toLowerCase())
      );

      if (matches.length > 0) {
        matchedKeywords.push(...matches);

        if (matches.length > highestMatches) {
          highestMatches = matches.length;
          highestCategory = category;
        }
      }
    }

    // If enterprise keywords found, route to Microsoft MCP
    if (matchedKeywords.length > 0) {
      const confidence = Math.min(0.7 + (matchedKeywords.length * 0.1), 1.0);

      return {
        server: 'microsoft-enterprise',
        reason: `Query contains enterprise feature keywords (${highestCategory}): ${matchedKeywords.slice(0, 3).join(', ')}`,
        confidence,
        fallbackServer: 'lokka',
        keywords: matchedKeywords
      };
    }

    // Default to Lokka for general queries (privacy-first)
    return {
      server: 'lokka',
      reason: 'General query detected, routing to Lokka for privacy',
      confidence: 0.8,
      fallbackServer: 'microsoft-enterprise'
    };
  }

  /**
   * Check if a query should use Microsoft Enterprise MCP
   */
  static shouldUseMicrosoftMCP(query: string, config: RoutingConfig): boolean {
    const decision = this.routeQuery(query, config);
    return decision.server === 'microsoft-enterprise';
  }

  /**
   * Check if a query should use Lokka MCP
   */
  static shouldUseLokka(query: string, config: RoutingConfig): boolean {
    const decision = this.routeQuery(query, config);
    return decision.server === 'lokka';
  }

  /**
   * Get the routing mode based on config
   * - 'lokka-only': Only Lokka is enabled
   * - 'microsoft-only': Only Microsoft MCP is enabled
   * - 'auto-routing': Both servers enabled, auto-routing active
   * - 'none': No servers enabled
   */
  static getRoutingMode(config: RoutingConfig): 'lokka-only' | 'microsoft-only' | 'auto-routing' | 'none' {
    const { lokkaEnabled, microsoftMcpEnabled } = config;

    if (lokkaEnabled && microsoftMcpEnabled) {
      return 'auto-routing';
    }

    if (lokkaEnabled) {
      return 'lokka-only';
    }

    if (microsoftMcpEnabled) {
      return 'microsoft-only';
    }

    return 'none';
  }

  /**
   * Get a user-friendly description of the routing decision
   */
  static getRoutingDescription(decision: RoutingDecision): string {
    if (!decision.server) {
      return 'No MCP server available';
    }

    const serverName = decision.server === 'lokka' ? 'Lokka MCP (local)' : 'Microsoft Enterprise MCP (cloud)';
    return `Using ${serverName}: ${decision.reason}`;
  }

  /**
   * Validate routing configuration
   */
  static validateConfig(config: RoutingConfig): { valid: boolean; error?: string } {
    if (!config.lokkaEnabled && !config.microsoftMcpEnabled) {
      return {
        valid: false,
        error: 'At least one MCP server must be enabled'
      };
    }

    return { valid: true };
  }

  /**
   * Get enterprise feature category from query
   * Returns null if no enterprise keywords detected
   */
  static getEnterpriseFeatureCategory(query: string): keyof typeof ENTERPRISE_KEYWORDS | null {
    const lowerQuery = query.toLowerCase();

    let highestCategory: keyof typeof ENTERPRISE_KEYWORDS | null = null;
    let highestMatches = 0;

    for (const [category, keywords] of Object.entries(ENTERPRISE_KEYWORDS) as [keyof typeof ENTERPRISE_KEYWORDS, readonly string[]][]) {
      const matches = keywords.filter(keyword =>
        lowerQuery.includes(keyword.toLowerCase())
      ).length;

      if (matches > highestMatches) {
        highestMatches = matches;
        highestCategory = category;
      }
    }

    return highestMatches > 0 ? highestCategory : null;
  }

  /**
   * Get routing statistics for analytics
   */
  static getRoutingStats(queries: string[], config: RoutingConfig): {
    lokkaCount: number;
    microsoftMcpCount: number;
    totalQueries: number;
    routingMode: string;
    enterpriseFeatureUsage: Record<string, number>;
  } {
    let lokkaCount = 0;
    let microsoftMcpCount = 0;
    const enterpriseFeatureUsage: Record<string, number> = {
      AUDIT_LOGS: 0,
      PIM: 0,
      CONDITIONAL_ACCESS: 0,
      DEVICE_COMPLIANCE: 0
    };

    queries.forEach(query => {
      const decision = this.routeQuery(query, config);

      if (decision.server === 'lokka') {
        lokkaCount++;
      } else if (decision.server === 'microsoft-enterprise') {
        microsoftMcpCount++;

        // Track enterprise feature usage
        const category = this.getEnterpriseFeatureCategory(query);
        if (category) {
          enterpriseFeatureUsage[category]++;
        }
      }
    });

    return {
      lokkaCount,
      microsoftMcpCount,
      totalQueries: queries.length,
      routingMode: this.getRoutingMode(config),
      enterpriseFeatureUsage
    };
  }
}
