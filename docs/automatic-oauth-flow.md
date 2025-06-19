# Automatic OAuth Flow

This document describes the automatic OAuth authentication flow implemented in PR #[number].

## Problem

Previously, users had to manually copy and paste authorization codes from the OAuth callback page back to the MCP client, which was cumbersome and error-prone.

## Solution

The OAuth callback server now automatically submits the authorization code back to itself, allowing the authentication to complete transparently.

### How It Works

1. **User initiates authentication**
   ```
   authenticate_workspace_account email="user@example.com"
   ```

2. **Server returns auth URL**
   - The callback server is already listening on localhost:3000
   - User clicks the auth URL to open Google sign-in

3. **User authorizes in browser**
   - Google redirects to `http://localhost:3000/?code=AUTH_CODE`
   - The callback page automatically POSTs the code to `/complete-auth`

4. **Automatic completion**
   - User calls `complete_workspace_auth email="user@example.com"`
   - This waits for the callback server to receive the code
   - Authentication completes automatically

### Fallback Mode

For compatibility, the manual flow still works:
- Set `auto_complete=false` in authenticate_workspace_account
- Copy the code from the success page
- Provide it with `auth_code` parameter

### Technical Details

- Added `/complete-auth` endpoint to callback server
- JavaScript in the success page automatically submits the code
- The `complete_workspace_auth` tool waits for the promise to resolve
- 2-minute timeout prevents hanging

### User Experience

The new flow shows:
1. "Authentication initiated" message
2. Success page with "Completing authentication automatically..."
3. No manual code copying required
