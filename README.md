# gdrive-mcp

A Model Context Protocol (MCP) server that provides access to Google Drive documents.

## Features

- **search_drive**: Search for files and documents across all of Google Drive
- **get_doc_contents**: Retrieve the full text contents of a Google Doc by URL or document ID
- **list_doc_comments**: List all comment threads on a Google Doc with details
- **create_doc_comment**: Create unanchored comments on a Google Doc
- **reply_to_comment**: Reply to existing comment threads
- **insert_doc_note**: Insert auto-numbered styled note blocks (📝 NOTE 1:, 📝 NOTE 2:, etc.) into document content
- **update_doc_note**: Update the text of an existing note by its number
- **remove_doc_note**: Remove a note from the document by its number

## Installation

No installation needed! Use `bunx` to run directly, or clone from source.

### Option 1: Use with bunx (Recommended)

No installation required - `bunx` will download and cache the package automatically.

### Option 2: Clone from Source

```bash
git clone https://github.com/benjamine/gdrive-mcp.git
cd gdrive-mcp
bun install
```

## Quick Start

### 2. Create Google OAuth2 Credentials

You need to create your own OAuth2 credentials from Google Cloud Console.

📖 **See detailed instructions**: [docs/CREATE_OAUTH_CREDENTIALS.md](docs/CREATE_OAUTH_CREDENTIALS.md)

**Quick version:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable Google Drive API + Google Docs API
3. Create OAuth 2.0 Desktop credentials
4. Copy your Client ID and Client Secret

### 3. Run the OAuth Setup

The setup script will open your browser and handle the OAuth2 flow:

**With bunx (recommended):**
```bash
bunx --bun -p gdrive-mcp gdrive-mcp-auth YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

**If cloned from source:**
```bash
bun run src/setup-auth.ts YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

This will:
1. ✅ Open your browser for Google authorization
2. ✅ Handle the OAuth2 callback automatically  
3. ✅ Securely store credentials in your system keychain
4. ✅ Display configuration ready to copy

**Example output:**
```
✨ Setup Complete!

✅ Credentials stored securely in your system keychain
   (macOS Keychain / Linux libsecret / Windows Credential Manager)

Add this to your Claude Desktop config:
{
  "mcpServers": {
    "gdrive": {
      "command": "bunx",
      "args": ["--bun", "gdrive-mcp"]
    }
  }
}

💡 No need to store sensitive credentials in config files!
```

### 4. Configure MCP Client

Add the server to your MCP client configuration.

**Note:** Credentials are securely stored in your system keychain (macOS Keychain, Linux libsecret, or Windows Credential Manager) - no need to add them to config files!

#### OpenCode

Add to your `opencode.jsonc`:

**With bunx (recommended):**
```json
{
  "mcp": {
    "gdrive": {
      "type": "local",
      "command": ["bunx", "--bun", "gdrive-mcp"]
    }
  }
}
```

**If cloned from source:**
```json
{
  "mcp": {
    "gdrive": {
      "type": "local",
      "command": ["bun", "run", "/absolute/path/to/gdrive-mcp/src/index.ts"]
    }
  }
}
```

#### Claude Desktop

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**With bunx (recommended):**
```json
{
  "mcpServers": {
    "gdrive": {
      "command": "bunx",
      "args": ["--bun", "gdrive-mcp"]
    }
  }
}
```

**If cloned from source:**
```json
{
  "mcpServers": {
    "gdrive": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/gdrive-mcp/src/index.ts"]
    }
  }
}
```

## Usage

### Available Tools

#### search_drive

Search for files and documents across all of Google Drive using text queries.

**Parameters:**
- `query` (string): Search query text. Supports Google Drive search syntax:
  - Simple text: `"quarterly report"` - searches in file names and content
  - By name: `name:report` - searches only file names
  - By type: `type:document` - filters by file type
  - Combined: `type:spreadsheet budget` - combines filters
- `max_results` (number, optional): Maximum number of results to return (default: 10, max: 100)

**Returns:**
- File name, type, ID, modification date, owner, size, and view link for each matching file

**Examples:**
```json
{
  "query": "quarterly report",
  "max_results": 20
}
```

```json
{
  "query": "type:document name:meeting",
  "max_results": 10
}
```

#### get_doc_contents

Retrieves the full text contents of a Google Doc.

**Parameters:**
- `doc_id_or_url` (string): Either a full Google Docs URL or just the document ID

**Examples:**
- URL: `https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit`
- Document ID: `1a2b3c4d5e6f7g8h9i0j`

#### list_doc_comments

Lists all comment threads on a Google Doc, including quoted text, replies, and status.

**Parameters:**
- `doc_id_or_url` (string): Google Docs URL or document ID

#### create_doc_comment

Creates an unanchored comment on a Google Doc (appears in "All Comments" view).

**Parameters:**
- `doc_id_or_url` (string): Google Docs URL or document ID
- `comment` (string): The comment text to add

**Note:** Due to Google Drive API limitations, comments cannot be anchored to specific text selections.

#### reply_to_comment

Replies to an existing comment thread on a Google Doc.

**Parameters:**
- `doc_id_or_url` (string): Google Docs URL or document ID
- `comment_id` (string): The ID of the comment to reply to
- `reply` (string): The reply text

#### insert_doc_note

Inserts an auto-numbered styled note block directly into the document content. Notes are automatically numbered sequentially (📝 NOTE 1:, 📝 NOTE 2:, etc.). This is a workaround for the API's inability to create anchored comments or suggestions. The note appears as a visually distinctive block with:
- Auto-incrementing note numbers
- Colored background (light yellow/cream)
- Indentation and spacing
- Bold, colored header
- Normal text size for readability

**Parameters:**
- `doc_id_or_url` (string): Google Docs URL or document ID
- `search_text` (string): Exact text to search for; note will be inserted after the paragraph containing this text
- `note` (string): The note text (the "📝 NOTE #:" prefix is added automatically)

**Example:**
```json
{
  "doc_id_or_url": "https://docs.google.com/document/d/...",
  "search_text": "Email Template",
  "note": "Consider using a more modern email format with clear sections and bullet points."
}
```

This will insert a styled block with a yellow background that looks like:
```
📝 NOTE 1: Consider using a more modern email 
format with clear sections and bullet points.
```
(with indentation, yellow background, and spacing)

#### update_doc_note

Updates the text of an existing note by its number. The note number and formatting remain the same.

**Parameters:**
- `doc_id_or_url` (string): Google Docs URL or document ID
- `note_number` (number): The note number to update (e.g., 1 for 📝 NOTE 1:)
- `new_text` (string): The new note text (without the '📝 NOTE #:' prefix)

#### remove_doc_note

Removes a note from the document by its number. This completely deletes the note block including all formatting.

**Parameters:**
- `doc_id_or_url` (string): Google Docs URL or document ID
- `note_number` (number): The note number to remove (e.g., 1 for 📝 NOTE 1:)

### Testing the Server

After running the OAuth setup, you can test the server directly:

```bash
bunx --bun gdrive-mcp
```

The server will load credentials from your system keychain automatically.

## Troubleshooting

### "Access blocked: Authorization Error - OAuth client was not found"

This error means you're using placeholder/invalid credentials. You need to:
1. Create your own OAuth2 credentials (see [docs/CREATE_OAUTH_CREDENTIALS.md](docs/CREATE_OAUTH_CREDENTIALS.md))
2. Run the setup script with YOUR credentials

### "No refresh token received"

If you've authorized the app before:
1. Go to https://myaccount.google.com/permissions
2. Remove the "gdrive-mcp" app
3. Run setup again

### Port 48127 already in use

Change the `REDIRECT_PORT` in `src/setup-auth.ts` to a different port.

## Development

### Linting and Formatting

This project uses Biome for linting and formatting:

```bash
# Check code
bun run check

# Format code
bun run format

# Lint and fix
bun run lint
```

## How It Works

This MCP server uses OAuth2 with a browser-based consent flow, similar to popular tools like [rclone](https://rclone.org/drive/):

1. **Setup phase**: Run `src/setup-auth.ts` which starts a local callback server and opens your browser
2. **Authorization**: You approve the app in Google's OAuth consent screen  
3. **Token exchange**: The auth code is exchanged for a refresh token
4. **Secure storage**: Credentials are stored in your system keychain using [Bun.secrets](https://bun.sh/docs/runtime/secrets)
5. **Runtime**: The MCP server loads credentials from the keychain and uses the refresh token to get temporary access tokens

### Secure Credential Storage

Unlike other tools that store credentials in plaintext `.env` files, gdrive-mcp uses Bun's native secrets API to store credentials securely:

- **macOS**: Keychain Services
- **Linux**: libsecret (GNOME Keyring, KWallet, etc.)
- **Windows**: Windows Credential Manager

Your OAuth credentials are:
- ✅ Encrypted at rest by the operating system
- ✅ Protected with user-level access control
- ✅ Never stored in plaintext configuration files
- ✅ Automatically available to the MCP server without env vars

This is the most user-friendly and secure approach used by modern CLI tools.

## License

MIT
