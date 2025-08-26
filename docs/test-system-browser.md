# System Browser Authentication Test Guide

## Overview
This guide will help you test the new system browser authentication feature that was just implemented to resolve Conditional Access policy compliance issues.

## What Was Implemented
- ✅ `useSystemBrowser` configuration option in EntraConfig interface
- ✅ System browser support in AuthService.acquireTokenWithSystemBrowser()
- ✅ UI toggle in Enhanced Settings Dialog
- ✅ IPC handler integration in main process
- ✅ HTTP redirect server for OAuth callback handling
- ✅ Comprehensive error handling and user guidance

## Test Steps

### 1. Verify Settings UI
1. Launch EntraPulse Lite
2. Navigate to: **Settings** → **Entra Application Settings**
3. Look for: **"Use System Browser for Authentication"** toggle
4. Verify it shows helpful guidance text about CA policy compliance

### 2. Test System Browser Mode
1. **Enable the toggle**: Turn on "Use System Browser for Authentication"
2. **Save settings**: Click Save/Apply to persist the change
3. **Sign out**: Use the sign out option
4. **Sign in again**: Click the sign in button
5. **Observe behavior**: Authentication should now open in your default system browser (Chrome, Edge, etc.) instead of the embedded window

### 3. Verify Logs
Check the console/logs for:
```
🎉 [AUTH-HANDLER] Using system browser: Yes (system browser)
```

Instead of:
```
🎉 [AUTH-HANDLER] Using system browser: No (embedded browser)
```

### 4. Test Conditional Access Compliance
If you have organizational CA policies:
1. Enable system browser mode
2. Attempt authentication
3. Should not receive CA policy compliance errors
4. Authentication should proceed normally through system browser

### 5. Test Fallback to Embedded Browser
1. **Disable the toggle**: Turn off "Use System Browser for Authentication"
2. **Save settings**
3. **Sign out and in again**
4. Should revert to embedded browser behavior

## Expected Behavior

### System Browser Mode (Enabled)
- Authentication opens in default system browser
- Complies with Conditional Access policies
- Uses PKCE flow with temporary HTTP server
- Redirects back to application after authentication

### Embedded Browser Mode (Default)
- Authentication opens in embedded Electron browser window
- Traditional MSAL Electron flow
- May not comply with strict CA policies

## Troubleshooting

### If System Browser Doesn't Open
1. Check if toggle is actually enabled and saved
2. Verify firewall isn't blocking temporary HTTP server (port 3000)
3. Check console logs for errors

### If Authentication Fails
1. Try embedded browser mode to verify credentials work
2. Check if organization allows OAuth redirect to localhost
3. Verify no proxy/firewall interference

### Common Errors
- **Port 3000 in use**: Temporary server will try alternative ports
- **Browser doesn't open**: May need to copy redirect URL manually
- **CA policy still fails**: Verify organization's specific CA requirements

## Files Modified
- `src/types/index.ts` - Added useSystemBrowser to EntraConfig
- `src/auth/AuthService.ts` - Added system browser authentication method
- `src/main/main.ts` - Updated IPC handlers and cache error suppression
- `src/renderer/components/EnhancedSettingsDialog.tsx` - Added UI toggle

## Validation Checklist
- [ ] Settings toggle appears and functions
- [ ] Configuration persists after restart
- [ ] System browser opens for authentication when enabled
- [ ] Embedded browser used when disabled
- [ ] No authentication functionality regressions
- [ ] CA policy compliance achieved (if applicable)

## Next Steps
If testing is successful, this feature can be considered ready for production use and should resolve Conditional Access policy compliance issues for organizations that don't permit embedded browser authentication.
