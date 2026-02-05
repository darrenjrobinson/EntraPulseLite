// GuestAccountAnalyzer.test.ts
// Unit tests for the Guest Account Analyzer utility

import { GuestAccountAnalyzer } from '../../shared/GuestAccountAnalyzer';

// Create a mock MCP client for testing
const mockMCPClient = {
  callTool: jest.fn()
};

describe('GuestAccountAnalyzer', () => {
  let analyzer: GuestAccountAnalyzer;
  
  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new GuestAccountAnalyzer(mockMCPClient as any);
  });
  
  describe('getGuestAccountSummary', () => {
    it('should return a summary of guest accounts', async () => {
      // Mock responses for total users and guest users
      mockMCPClient.callTool.mockImplementation((serverName, toolName, args) => {
        if (args.path === '/users/$count' && !args.queryParams) {
          return Promise.resolve({
            content: [{ json: '1000' }]
          });
        } else if (args.path === '/users/$count' && args.queryParams?.$filter === "userType eq 'Guest'") {
          return Promise.resolve({
            content: [{ json: '200' }]
          });
        }
        return Promise.reject(new Error('Unexpected call to callTool'));
      });
      
      // Execute the method
      const summary = await analyzer.getGuestAccountSummary();
      
      // Verify results
      expect(summary).toEqual({
        totalUsers: 1000,
        guestUsers: 200,
        guestPercentage: 20,
        memberUsers: 800,
        memberPercentage: 80
      });
      
      // Verify correct calls were made
      expect(mockMCPClient.callTool).toHaveBeenCalledTimes(2);
      expect(mockMCPClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        expect.objectContaining({
          path: '/users/$count',
          method: 'get'
        })
      );
      expect(mockMCPClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        expect.objectContaining({
          path: '/users/$count',
          method: 'get',
          queryParams: {
            '$filter': "userType eq 'Guest'"
          }
        })
      );
    });
    
    it('should handle errors gracefully', async () => {
      // Mock error response
      mockMCPClient.callTool.mockRejectedValueOnce(new Error('API Error'));
      
      // Execute and verify error handling
      await expect(analyzer.getGuestAccountSummary()).rejects.toThrow('Failed to get guest account summary: API Error');
    });
  });
  
  describe('getRecentGuestAccounts', () => {
    it('should return a list of recent guest accounts', async () => {
      // Mock response with guest accounts
      const mockGuests = {
        value: [
          {
            id: 'user1',
            displayName: 'Guest User 1',
            userPrincipalName: 'guest1#EXT#@contoso.onmicrosoft.com',
            mail: 'guest1@partner.com',
            createdDateTime: '2023-01-15T10:00:00Z',
            userType: 'Guest'
          },
          {
            id: 'user2',
            displayName: 'Guest User 2',
            userPrincipalName: 'guest2#EXT#@contoso.onmicrosoft.com',
            mail: 'guest2@partner.com',
            createdDateTime: '2023-02-20T14:30:00Z',
            userType: 'Guest'
          }
        ]
      };
      
      mockMCPClient.callTool.mockResolvedValueOnce({
        content: [{ json: mockGuests }]
      });
      
      // Execute the method
      const guests = await analyzer.getRecentGuestAccounts(2);
      
      // Verify results
      expect(guests).toEqual([
        {
          id: 'user1',
          displayName: 'Guest User 1',
          userPrincipalName: 'guest1#EXT#@contoso.onmicrosoft.com',
          mail: 'guest1@partner.com',
          createdDateTime: '2023-01-15T10:00:00Z'
        },
        {
          id: 'user2',
          displayName: 'Guest User 2',
          userPrincipalName: 'guest2#EXT#@contoso.onmicrosoft.com',
          mail: 'guest2@partner.com',
          createdDateTime: '2023-02-20T14:30:00Z'
        }
      ]);
      
      // Verify correct call was made
      expect(mockMCPClient.callTool).toHaveBeenCalledWith(
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
            '$top': '2'
          }
        }
      );
    });
  });
  
  describe('getGuestAccountsByDomain', () => {
    it('should return guest accounts from a specific domain', async () => {
      // Mock response with domain-specific guests
      const mockGuests = {
        value: [
          {
            id: 'user1',
            displayName: 'Domain Guest 1',
            userPrincipalName: 'guest1#EXT#@contoso.onmicrosoft.com',
            mail: 'guest1@partner.com',
            createdDateTime: '2023-01-15T10:00:00Z',
            userType: 'Guest'
          }
        ]
      };
      
      mockMCPClient.callTool.mockResolvedValueOnce({
        content: [{ json: mockGuests }]
      });
      
      // Execute the method
      const guests = await analyzer.getGuestAccountsByDomain('partner.com');
      
      // Verify results
      expect(guests).toEqual([
        {
          id: 'user1',
          displayName: 'Domain Guest 1',
          userPrincipalName: 'guest1#EXT#@contoso.onmicrosoft.com',
          mail: 'guest1@partner.com',
          createdDateTime: '2023-01-15T10:00:00Z'
        }
      ]);
      
      // Verify correct call was made
      expect(mockMCPClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        {
          apiType: 'graph',
          path: '/users',
          method: 'get',
          queryParams: {
            '$select': 'id,displayName,mail,userPrincipalName,userType,createdDateTime',
            '$filter': "userType eq 'Guest' and endsWith(mail, '@partner.com')",
            '$orderby': 'displayName',
            '$top': '10'
          }
        }
      );
    });
  });
  
  describe('getGuestDomainSummary', () => {
    it('should return a summary of domains in guest accounts', async () => {
      // Mock response with guests from different domains
      const mockGuests = {
        value: [
          {
            id: 'user1',
            mail: 'guest1@partner.com',
          },
          {
            id: 'user2',
            mail: 'guest2@partner.com',
          },
          {
            id: 'user3',
            mail: 'guest3@other.com',
          }
        ]
      };
      
      mockMCPClient.callTool.mockResolvedValueOnce({
        content: [{ json: mockGuests }]
      });
      
      // Execute the method
      const domains = await analyzer.getGuestDomainSummary();
      
      // Verify results
      expect(domains).toEqual([
        { domain: 'partner.com', count: 2 },
        { domain: 'other.com', count: 1 }
      ]);
      
      // Verify correct call was made
      expect(mockMCPClient.callTool).toHaveBeenCalledWith(
        'external-lokka',
        'Lokka-Microsoft',
        {
          apiType: 'graph',
          path: '/users',
          method: 'get',
          queryParams: {
            '$select': 'id,mail',
            '$filter': "userType eq 'Guest' and mail ne null",
            '$top': '999'
          }
        }
      );
    });
  });
});
