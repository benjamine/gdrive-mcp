# Troubleshooting: "org_internal" Error

## Error Message

```
Access blocked: [App Name] can only be used within its organization
Error 403: org_internal
```

## What This Means

Your OAuth client was created in a project with an "Internal" OAuth consent screen, but you're trying to authorize with an account that's **not part of that Google Workspace organization**.

## Solutions

### Solution 1: Create a New Project (Recommended for Personal Use)

Start fresh with a new project:

1. **Create a new project**:
   - Go to https://console.cloud.google.com/
   - Click the project dropdown (top left)
   - Click "NEW PROJECT"
   - Name: `gdrive-mcp-personal`
   - Click "Create"

2. **Switch to the new project**:
   - Make sure you're in the new project (check dropdown at top)

3. **Enable APIs**:
   - [Enable Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - [Enable Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)

4. **Configure OAuth Consent Screen**:
   - Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
   - Choose "External" (this works with any Google account)
   - Fill in required fields:
     - App name: `gdrive-mcp`
     - User support email: your email
     - Developer contact: your email
   - Click "Save and Continue"
   
5. **Add Scopes**:
   - Click "Add or Remove Scopes"
   - Add these two scopes:
     - `https://www.googleapis.com/auth/drive.readonly`
     - `https://www.googleapis.com/auth/documents.readonly`
   - Click "Update" then "Save and Continue"

6. **Add Test Users**:
   - Click "Add Users"
   - Add YOUR email address (the one you'll use with Claude)
   - Click "Save and Continue"

7. **Create OAuth Client**:
   - Go to [Credentials](https://console.cloud.google.com/apis/credentials)
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Desktop app"
   - Name: `gdrive-mcp-client`
   - Click "Create"
   - **Copy your new Client ID and Client Secret**

8. **Run setup with new credentials**:
   ```bash
   bun run src/setup-auth.ts YOUR_NEW_CLIENT_ID YOUR_NEW_CLIENT_SECRET
   ```
   
   Your credentials will be securely stored in your system keychain.

### Solution 2: Use Existing Project with External

If you want to keep using the "N8N - Youtube" project:

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select the "N8N - Youtube" project
3. Look for "MAKE EXTERNAL" button and click it
4. Add yourself as a test user
5. Try setup again with the same credentials

**Note**: This might affect other apps using this project.

### Solution 3: Use Your Workspace Account

If "N8N - Youtube" is in a Workspace organization and you have access:

1. Make sure you're signed in with your Workspace account (not personal Gmail)
2. The account must be part of the organization
3. Try the setup again

## How to Check Which Project You're Using

Your client ID tells you which project it belongs to:

```
83542523284-unjvb6337u3sck6dk2oe70ia5pembo79.apps.googleusercontent.com
```

To verify:
1. Go to https://console.cloud.google.com/apis/credentials
2. Look for this client ID
3. Check which project you're currently in (top dropdown)

## Recommended Path for Most Users

**Create a fresh project with External OAuth** - this gives you the most flexibility and works with any Google account.

After creating the new OAuth client, you'll get:
- New Client ID
- New Client Secret

Use these with the setup script, and you're good to go!
