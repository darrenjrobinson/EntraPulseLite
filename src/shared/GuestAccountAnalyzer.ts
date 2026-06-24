// GuestAccountAnalyzer.ts
// Utility to query and analyze guest accounts in Entra ID

import { MCPClient } from "../mcp/clients/MCPClient";

export interface GuestAccountSummary {
  totalUsers: number;
  guestUsers: number;
  guestPercentage: number;
  memberUsers: number;
  memberPercentage: number;
}

export interface GuestAccount {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
  createdDateTime?: string;
}

export class GuestAccountAnalyzer {
  private mcpClient: MCPClient;
  
  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }
  
  /**
   * Get a summary of guest accounts in the tenant
   * @returns Summary statistics about guest accounts
   */
  async getGuestAccountSummary(): Promise<GuestAccountSummary> {
    try {
      // Get total user count
      const totalUsersResponse = await this.mcpClient.callTool(
        'external-lokka',
        'Lokka-Microsoft',
        {
          apiType: 'graph',
          path: '/users/$count',
          method: 'get'
        }
      );
      
      const totalUsers = parseInt(totalUsersResponse.content[0].json, 10);
      
      // Get guest user count
      const guestUsersResponse = await this.mcpClient.callTool(
        'external-lokka',
        'Lokka-Microsoft',
        {
          apiType: 'graph',
          path: '/users/$count',
          method: 'get',
          queryParams: {
            '$filter': "userType eq 'Guest'"
          }
        }
      );
      
      const guestUsers = parseInt(guestUsersResponse.content[0].json, 10);
      
      // Calculate percentages
      const guestPercentage = (guestUsers / totalUsers) * 100;
      const memberUsers = totalUsers - guestUsers;
      const memberPercentage = 100 - guestPercentage;
      
      return {
        totalUsers,
        guestUsers,
        guestPercentage: parseFloat(guestPercentage.toFixed(2)),
        memberUsers,
        memberPercentage: parseFloat(memberPercentage.toFixed(2))
      };
    } catch (error) {
      console.error('Error getting guest account summary:', error);
      throw new Error(`Failed to get guest account summary: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get a list of recent guest accounts added to the tenant
   * @param limit Maximum number of accounts to return
   * @returns List of recent guest accounts
   */
  async getRecentGuestAccounts(limit: number = 10): Promise<GuestAccount[]> {
    try {
      const response = await this.mcpClient.callTool(
        'external-lokka',
        'Lokka-Microsoft',
        {
          apiType: 'graph',
          method: 'get',
          path: '/users',
          queryParams: {
            '$select': 'id,displayName,mail,userPrincipalName,userType,createdDateTime',
            '$filter': "userType eq 'Guest'",
            '$orderby': 'createdDateTime desc',
            '$top': limit.toString()
          }
        }
      );
      
      return response.content[0].json.value.map((user: any) => ({
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        mail: user.mail,
        createdDateTime: user.createdDateTime
      }));
    } catch (error) {
      console.error('Error getting recent guest accounts:', error);
      throw new Error(`Failed to get recent guest accounts: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get guest accounts from a specific domain
   * @param domain Domain to filter by (e.g., 'partner.com')
   * @param limit Maximum number of accounts to return
   * @returns List of guest accounts from the specified domain
   */
  async getGuestAccountsByDomain(domain: string, limit: number = 10): Promise<GuestAccount[]> {
    try {
      const response = await this.mcpClient.callTool(
        'external-lokka',
        'Lokka-Microsoft',
        {
          apiType: 'graph',
          path: '/users',
          method: 'get',
          queryParams: {
            '$select': 'id,displayName,mail,userPrincipalName,userType,createdDateTime',
            '$filter': `userType eq 'Guest' and endsWith(mail, '@${domain}')`,
            '$orderby': 'displayName',
            '$top': limit.toString()
          }
        }
      );
      
      return response.content[0].json.value.map((user: any) => ({
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        mail: user.mail,
        createdDateTime: user.createdDateTime
      }));
    } catch (error) {
      console.error(`Error getting guest accounts for domain ${domain}:`, error);
      throw new Error(`Failed to get guest accounts for domain ${domain}: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get domains represented in guest accounts
   * @param limit Maximum number of domains to return
   * @returns List of domains and their guest account counts
   */
  async getGuestDomainSummary(limit: number = 10): Promise<{ domain: string, count: number }[]> {
    try {
      // Get all guest accounts
      const response = await this.mcpClient.callTool(
        'external-lokka',
        'Lokka-Microsoft',
        {
          apiType: 'graph',
          path: '/users',
          method: 'get',
          queryParams: {
            '$select': 'id,mail',
            '$filter': "userType eq 'Guest' and mail ne null",
            '$top': '999' // Get a large sample
          }
        }
      );
      
      const guests = response.content[0].json.value;
      
      // Extract domains from email addresses
      const domainCounts = new Map<string, number>();
      
      guests.forEach((user: any) => {
        if (user.mail) {
          const parts = user.mail.split('@');
          if (parts.length === 2) {
            const domain = parts[1].toLowerCase();
            domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
          }
        }
      });
      
      // Convert to array and sort by count
      const domainArray = Array.from(domainCounts.entries()).map(([domain, count]) => ({
        domain,
        count
      }));
      
      // Sort by count (descending) and limit results
      return domainArray
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting guest domain summary:', error);
      throw new Error(`Failed to get guest domain summary: ${(error as Error).message}`);
    }
  }
}
