# Setting Up OAuth2 for Internal (Google Workspace) Apps

If you're using a Google Workspace account and chose "Internal" for your OAuth consent screen, follow these steps:

## Prerequisites

- You must have a Google Workspace account (not a personal Gmail account)
- You must be signed in with your Workspace account

## Important Configuration for Internal Apps

### 1. Configure the Redirect URI

This is the most common issue! You **must** add the redirect URI to your OAuth client:

1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", click "ADD URI"
4. Add exactly: `http://localhost:48127/oauth2callback`
5. Click "Save"

⚠️ **Common mistake**: Make sure there are no trailing slashes or typos!

### 2. Enable Required APIs

Make sure both APIs are enabled:

1. [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) - Click "Enable"
2. [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com) - Click "Enable"

### 3. OAuth Consent Screen Scopes

For Internal apps, you need to add the scopes in the OAuth consent screen:

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Click "Edit App"
3. On the "Scopes" page, click "Add or Remove Scopes"
4. Search for and add these scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/documents.readonly`
5. Click "Update" and then "Save and Continue"

### 4. No Need for Test Users

Unlike External apps, Internal apps don't require test users - they work for all users in your Workspace organization.

### 5. No Verification Required

Internal apps don't need to go through Google's verification process.

## Running the Setup

```bash
bun run src/setup-auth.ts YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

The setup script will securely store your credentials in your system keychain (macOS Keychain / Linux libsecret / Windows Credential Manager).

## Common Errors and Solutions

### Error: "redirect_uri_mismatch"

**Browser shows**: `Error 400: redirect_uri_mismatch`

**Solution**: 
- Go to your OAuth client settings
- Add `http://localhost:48127/oauth2callback` to Authorized redirect URIs
- Make sure there are no typos or trailing slashes

### Error: "access_denied"

**Browser shows**: `Error 403: access_denied`

**Possible causes**:
1. The scopes aren't added to the OAuth consent screen
2. Your account doesn't have permission to authorize the app
3. Admin restrictions in your Workspace

**Solution**: Add the scopes to the OAuth consent screen (see step 3 above)

### Error: "invalid_scope"

**Browser shows**: `Error 400: invalid_scope`

**Solution**: The requested scopes don't match what's configured:
- Make sure you added both scopes to the OAuth consent screen
- The scopes must be EXACTLY:
  - `https://www.googleapis.com/auth/drive.readonly`
  - `https://www.googleapis.com/auth/documents.readonly`

### Error: "admin_policy_enforced"

**Browser shows**: Error about admin restrictions

**Solution**: Your Google Workspace admin has restricted OAuth apps:
- Contact your Workspace admin
- They need to whitelist your OAuth client ID
- Or use "External" app type instead (requires test users)

## Verification Checklist

Before running setup, verify:

- ✅ Both APIs enabled (Drive + Docs)
- ✅ OAuth client created (Desktop app type)
- ✅ Redirect URI added: `http://localhost:48127/oauth2callback`
- ✅ Both scopes added to OAuth consent screen
- ✅ Using your Workspace account (not personal Gmail)

## Testing

After completing setup, you should see:

```
✅ Authorization code received!
🔄 Exchanging code for tokens...

╔════════════════════════════════════════════════════════╗
║   ✨ Setup Complete!                                   ║
╚════════════════════════════════════════════════════════╝
```

If you see this, you're all set! Copy the configuration to Claude Desktop and restart it.
