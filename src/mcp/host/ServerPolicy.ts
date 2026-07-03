// ServerPolicy.ts
//
// Phase 4 of the Lokka MCP Apps migration. The MCP Apps spec requires a consent/policy
// gate for UI-initiated tool calls. McpAppsHost runs every relayed iframe JSON-RPC
// request through a pluggable ServerPolicy before forwarding it to the live connection.
//
// The host is generic, so policy is not hardcoded:
//   - DefaultPolicy: allow read-only methods (resources/*), allow tools/call (the host
//     can't classify unknown tools), used for any non-Lokka MCP Apps server.
//   - LokkaPolicy: knows which Lokka tools mutate auth and denies them (Level A).
//
// See docs/EntraPulse-Lokka-MCP-Apps-Plan.md §4 and docs/MCP_APPS_CONTRACT.md.

import {
  LOKKA_AUTH_MUTATING_TOOLS,
  POLYARCHY_AUTH_MUTATING_TOOLS,
  POLYARCHY_SERVER_ID,
} from '../constants';

export interface PolicyDecision {
  action: 'allow' | 'deny';
  /** User-facing explanation shown in the app when denied. */
  reason?: string;
  /** Optional hint to where the user should perform the action instead. */
  redirect?: string;
}

export interface ServerPolicy {
  /** The server id this policy applies to (informational). */
  readonly serverId: string;
  /**
   * Decide whether a relayed iframe-initiated JSON-RPC call is permitted.
   * @param method JSON-RPC method (e.g. 'tools/call', 'resources/read')
   * @param params The request params (for tools/call, includes name + arguments)
   */
  evaluate(method: string, params: any): PolicyDecision;
}

const ALLOW: PolicyDecision = { action: 'allow' };

/** Methods the host will relay at all. Anything else is denied regardless of policy. */
export const RELAYABLE_METHODS = ['tools/call', 'resources/read', 'resources/list'];

/**
 * Generic default: allow read-only resource methods and tools/call. Suitable for any
 * MCP Apps server whose tools are not known to mutate sensitive host-owned state.
 */
export class DefaultPolicy implements ServerPolicy {
  constructor(public readonly serverId: string) {}

  evaluate(method: string, _params: any): PolicyDecision {
    if (!RELAYABLE_METHODS.includes(method)) {
      return { action: 'deny', reason: `Method '${method}' is not permitted from an MCP App.` };
    }
    return ALLOW;
  }
}

/**
 * Lokka-specific policy (Level A): deny auth-mutating tool calls and point the user to
 * EntraPulse's own auth settings; allow read/display tools and resource reads.
 */
export class LokkaPolicy implements ServerPolicy {
  constructor(
    public readonly serverId: string,
    private readonly mutatingTools: string[] = LOKKA_AUTH_MUTATING_TOOLS
  ) {}

  evaluate(method: string, params: any): PolicyDecision {
    if (!RELAYABLE_METHODS.includes(method)) {
      return { action: 'deny', reason: `Method '${method}' is not permitted from an MCP App.` };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      // EntraPulse owns the primary connection's token injection and permission consent, so those
      // tools are denied. Lokka's own connection-management tools (add/switch/remove/list) are
      // allowed to relay — Lokka owns additional connections.
      if (typeof toolName === 'string' && this.mutatingTools.includes(toolName)) {
        return {
          action: 'deny',
          reason:
            'EntraPulse Lite manages this itself. ' +
            'Use EntraPulse Lite’s account/settings to grant permissions or change the active tenant.',
          redirect: 'entrapulse://settings/authentication',
        };
      }
    }

    return ALLOW;
  }
}

/** Build the right policy for a given server id. */
export function policyForServer(serverId: string): ServerPolicy {
  if (serverId === 'external-lokka') {
    return new LokkaPolicy(serverId);
  }
  if (serverId === POLYARCHY_SERVER_ID) {
    // Same shape as Lokka: EntraPulse owns the token channel, so the Polyarchy app
    // must not call set-access-token; everything else (polyarchy-expand, get-photo,
    // get-manager, resource reads) relays freely.
    return new LokkaPolicy(serverId, POLYARCHY_AUTH_MUTATING_TOOLS);
  }
  return new DefaultPolicy(serverId);
}
