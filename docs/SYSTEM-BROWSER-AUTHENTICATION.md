# System Browser Authentication Feature

## Overview

EntraPulse Lite now supports system browser authentication to comply with Microsoft Conditional Access policies that require device-compliant browsers. This feature allows users to authenticate using their default system browser instead of the embedded Electron browser window.

## When to Use System Browser Authentication

Enable this option if you encounter any of the following scenarios:

1. **Conditional Access Policy Errors**: Messages like "This application contains sensitive information and can only be accessed from devices or client applications that meet your device management compliance policy"

2. **Browser Compliance Issues**: Errors indicating the current browser is not supported or compliant with organizational policies

3. **Security Requirements**: Your organization's admin requires authentication through the system browser for security compliance

## How to Enable

1. Open EntraPulse Lite Settings
2. Navigate to "Entra Application Settings" 
3. Scroll down to find "Use System Browser for Authentication"
4. Toggle the switch to enable this option
5. Save the configuration
6. Sign out and sign back in for the change to take effect

## Technical Details

### Implementation

- **Embedded Browser (Default)**: Uses Electron's BrowserWindow for authentication
- **System Browser (Optional)**: Opens authentication in the user's default system browser
- **Local Server**: Creates a temporary HTTP server on an available port (3000-3010) to handle the OAuth redirect
- **PKCE Security**: Uses Proof Key for Code Exchange for secure authentication flow

### Configuration Storage

The system browser preference is stored as part of the Entra configuration:

```typescript
interface EntraConfig {
  clientId: string;
  tenantId: string;
  useGraphPowerShell?: boolean;
  useSystemBrowser?: boolean; // New field
}
```

### Authentication Flow

When system browser is enabled:

1. A local HTTP server starts on an available port (3000-3010)
2. The authentication URL opens in the system browser
3. User completes authentication in their browser
4. Browser redirects to `http://localhost:[port]` with authorization code
5. Application exchanges the code for tokens
6. Local server shuts down
7. User returns to EntraPulse Lite with active session

## Troubleshooting

### Ports 3000-3010 Already in Use

If all ports in the range 3000-3010 are already in use, you may see an error. Either:
- Stop any processes using ports in that range
- Temporarily disable the system browser option
- Contact your system administrator

The application automatically tries ports 3000, 3001, 3002, etc., up to 3010 to find an available port.

### Firewall Issues

Ensure your firewall allows connections to `localhost` ports 3000-3010 for the authentication redirect to work properly.

### Browser Doesn't Open

If the system browser doesn't open automatically:
- Check if a default browser is set
- Try manually copying the authentication URL
- Verify shell permissions for opening external applications

## Security Considerations

- The local HTTP server only runs during authentication (temporary)
- Uses PKCE (Proof Key for Code Exchange) for secure token exchange
- Complies with Microsoft's recommended security practices
- No credentials are stored on the local server

## Files Modified

- `src/types/index.ts` - Added `useSystemBrowser` to EntraConfig interface
- `src/auth/AuthService.ts` - Added system browser authentication flow
- `src/main/main.ts` - Updated IPC handler to pass system browser flag
- `src/renderer/components/EnhancedSettingsDialog.tsx` - Added UI toggle
- `src/types/electron.d.ts` - Updated login method signature
- `src/types/assets.d.ts` - Updated login method signature

## Future Enhancements

- Enhanced error handling for browser launch failures
- Support for other authentication flows if needed
- Custom redirect URI configuration beyond localhost
