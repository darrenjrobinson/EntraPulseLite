// guest-account-analyzer.test.ts
// Unit tests for the GuestAccountAnalyzer utility

import { GuestAccountAnalyzer } from '../../shared/GuestAccountAnalyzer';
import { MCPClient } from '../../mcp/clients/MCPClient';

describe('GuestAccountAnalyzer', () => {
  let analyzer: GuestAccountAnalyzer;
  let mockMcpClient: jest.Mocked<MCPClient>;
  
  beforeEach(() => {
    // Create mock MCP client
    mockMcpClient = {
      callTool: jest.fn(),
    } as unknown as jest.Mocked<MCPClient>;
    
    // Create analyzer with mock client
    analyzer = new GuestAccountAnalyzer(mockMcpClient);
  });
  
  describe('getGuestAccountSummary', () => {
    it('should calculate correct summary statistics', async () => {
      // Mock responses for total users and guest users
      mockMcpClient.callTool
        // First call - total users
        .mockResolvedValueOnce({
          content: [{ json: '100' }]
        })
        // Second call - guest users
        .mockResolvedValueOnce({
          content: [{ json: '25' }]
        });
      
      const summary = await analyzer.getGuestAccountSummary();
      
      // Verify calculations
      expect(summary.totalUsers).toBe(100);
      expect(summary.guestUsers).toBe(25);
      expect(summary.memberUsers).toBe(75);
      expect(summary.guestPercentage).toBe(25);
      expect(summary.memberPercentage).toBe(75);
      
      // Verify MCP client was called correctly
      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        expect.objectContaining({
          path: '/users/$count'
        })
      );
      
      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        expect.objectContaining({
          path: '/users/$count',
          queryParams: {
            '$filter': "userType eq 'Guest'"
          }
        })
      );
    });
    
    it('should handle API errors', async () => {
      // Mock error response
      mockMcpClient.callTool.mockRejectedValue(new Error('API Error'));
      
      await expect(analyzer.getGuestAccountSummary()).rejects.toThrow('Failed to get guest account summary: API Error');
    });
  });
  
  describe('getRecentGuestAccounts', () => {
    it('should return formatted guest accounts', async () => {
      // Mock response with guest accounts
      mockMcpClient.callTool.mockResolvedValue({
        content: [{
          json: {
            value: [
              {
                id: 'user1',
                displayName: 'Guest User 1',
                userPrincipalName: 'user1@contoso.com#EXT#',
                mail: 'user1@contoso.com',
                createdDateTime: '2023-01-01T00:00:00Z',
                userType: 'Guest'
              },
              {
                id: 'user2',
                displayName: 'Guest User 2',
                userPrincipalName: 'user2@fabrikam.com#EXT#',
                mail: 'user2@fabrikam.com',
                createdDateTime: '2023-01-02T00:00:00Z',
                userType: 'Guest'
              }
            ]
          }
        }]
      });
      
      const guestAccounts = await analyzer.getRecentGuestAccounts(5);
      
      // Verify results
      expect(guestAccounts).toHaveLength(2);
      expect(guestAccounts[0].id).toBe('user1');
      expect(guestAccounts[0].displayName).toBe('Guest User 1');
      expect(guestAccounts[1].mail).toBe('user2@fabrikam.com');
      
      // Verify MCP client was called correctly
      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        expect.objectContaining({
          apiType: 'graph',
          queryParams: expect.objectContaining({
            '$top': '5'
          })
        })
      );
    });
  });
  
  describe('getGuestAccountsByDomain', () => {
    it('should filter guests by domain', async () => {
      // Mock response with domain-filtered guest accounts
      mockMcpClient.callTool.mockResolvedValue({
        content: [{
          json: {
            value: [
              {
                id: 'user3',
                displayName: 'Contoso Guest 1',
                userPrincipalName: 'user3@contoso.com#EXT#',
                mail: 'user3@contoso.com',
                createdDateTime: '2023-01-03T00:00:00Z',
                userType: 'Guest'
              }
            ]
          }
        }]
      });
      
      const contosoGuests = await analyzer.getGuestAccountsByDomain('contoso.com');
      
      // Verify results
      expect(contosoGuests).toHaveLength(1);
      expect(contosoGuests[0].displayName).toBe('Contoso Guest 1');
      
      // Verify MCP client was called with correct domain filter
      expect(mockMcpClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        expect.objectContaining({
          queryParams: expect.objectContaining({
            '$filter': expect.stringContaining("endsWith(mail, '@contoso.com')")
          })
        })
      );
    });
  });
  
  describe('getGuestDomainSummary', () => {
    it('should aggregate guest domains correctly', async () => {
      // Mock response with multiple domains
      mockMcpClient.callTool.mockResolvedValue({
        content: [{
          json: {
            value: [
              { id: 'user1', mail: 'user1@contoso.com' },
              { id: 'user2', mail: 'user2@fabrikam.com' },
              { id: 'user3', mail: 'user3@contoso.com' },
              { id: 'user4', mail: 'user4@adatum.com' },
              { id: 'user5', mail: 'user5@contoso.com' }
            ]
          }
        }]
      });
      
      const domainSummary = await analyzer.getGuestDomainSummary();
      
      // Verify results
      expect(domainSummary).toHaveLength(3); // 3 unique domains
      
      // contoso.com should be first (3 accounts)
      expect(domainSummary[0].domain).toBe('contoso.com');
      expect(domainSummary[0].count).toBe(3);
      
      // fabrikam.com and adatum.com should have 1 account each
      const otherDomains = domainSummary.slice(1);
      expect(otherDomains).toEqual(
        expect.arrayContaining([
          { domain: 'fabrikam.com', count: 1 },
          { domain: 'adatum.com', count: 1 }
        ])
      );
    });
  });
});
