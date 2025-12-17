# Creating Your Own Google OAuth2 Credentials

Since the default credentials are placeholders, you need to create your own OAuth2 credentials from Google Cloud Console.

## Step-by-Step Instructions

### 1. Go to Google Cloud Console
Visit: https://console.cloud.google.com/

### 2. Create a New Project (or select existing)
- Click on the project dropdown at the top
- Click "New Project"
- Give it a name (e.g., "gdrive-mcp")
- Click "Create"

### 3. Enable Google Drive API
- Go to: https://console.cloud.google.com/apis/library/drive.googleapis.com
- Click "Enable"

### 4. Enable Google Docs API
- Go to: https://console.cloud.google.com/apis/library/docs.googleapis.com
- Click "Enable"

### 5. Configure OAuth Consent Screen
- Go to: https://console.cloud.google.com/apis/credentials/consent
- Choose "External" (unless you have a Google Workspace account, then you can choose "Internal")
- Click "Create"

Fill in the required fields:
- **App name**: gdrive-mcp (or whatever you prefer)
- **User support email**: Your email
- **Developer contact information**: Your email
- Click "Save and Continue"

On the Scopes page:
- Click "Add or Remove Scopes"
- Add these scopes:
  - `https://www.googleapis.com/auth/drive.readonly`
  - `https://www.googleapis.com/auth/documents.readonly`
- Click "Update" then "Save and Continue"

On the Test Users page:
- Click "Add Users"
- Add your email address
- Click "Save and Continue"

### 6. Create OAuth2 Credentials
- Go to: https://console.cloud.google.com/apis/credentials
- Click "Create Credentials" → "OAuth client ID"
- Application type: **Desktop app**
- Name: gdrive-mcp-client (or whatever you prefer)
- Click "Create"

### 7. Get Your Credentials
A dialog will appear with:
- **Client ID**: Something like `123456789-abc123.apps.googleusercontent.com`
- **Client Secret**: Something like `GOCSPX-abc123xyz789`

**Copy both of these!**

### 8. Run the Setup Script
Run the setup script with your credentials:

```bash
bun run src/setup-auth.ts YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

The script will:
1. Open your browser for authorization
2. Ask you to sign in to Google
3. Show you what permissions the app needs
4. Redirect back to localhost with the authorization code
5. **Securely store credentials in your system keychain** (macOS Keychain / Linux libsecret / Windows Credential Manager)

### 9. Configure Claude Desktop
Copy the configuration output from the setup script to your Claude Desktop config file.

**Note**: Credentials are stored securely in your system keychain, not in environment variables or config files.

## Troubleshooting

### "Access blocked: Authorization Error - OAuth client was not found"
- This means the Client ID doesn't exist or is incorrect
- Double-check you copied the correct Client ID from the Google Cloud Console
- Make sure you're using the project where you created the credentials

### "Access blocked: This app's request is invalid"
- Make sure you added the correct redirect URI in your OAuth client
- The redirect URI should be: `http://localhost:48127/oauth2callback`

### "Error 403: access_denied"
- Make sure you added yourself as a test user in the OAuth consent screen
- If using "External" app type, you need to be a test user

### "No refresh token received"
- This can happen if you've already authorized the app before
- Go to https://myaccount.google.com/permissions
- Remove "gdrive-mcp" (or whatever you named it)
- Run the setup script again

## Security Notes

- Credentials are stored securely in your system keychain (not in environment variables)
- Your Client ID and Client Secret are sensitive - don't commit them to public repositories
- The refresh token gives access to your Google Drive - it's stored securely in your system keychain
- Consider using "Internal" app type if you have a Google Workspace account (more secure)
- For production use, you should go through Google's verification process
