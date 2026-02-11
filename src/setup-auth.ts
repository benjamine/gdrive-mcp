#!/usr/bin/env bun
import { exec } from "node:child_process";
import * as http from "node:http";
import * as url from "node:url";
import { promisify } from "node:util";
import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

const execAsync = promisify(exec);

// Default OAuth2 credentials for gdrive-mcp
// These are shared credentials - users are encouraged to create their own for better reliability
const DEFAULT_CLIENT_ID =
  "621120243678-2ru6qeassnfkrilan1evlq7ernqchbe4.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET = "GOCSPX-YourSecretHere"; // TODO: Replace with actual secret

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents.readonly",
];

const REDIRECT_PORT = 48127;

async function openBrowser(urlToOpen: string): Promise<void> {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = `open "${urlToOpen}"`;
  } else if (platform === "win32") {
    command = `start "${urlToOpen}"`;
  } else {
    // Linux and others
    command = `xdg-open "${urlToOpen}"`;
  }

  try {
    await execAsync(command);
  } catch (_error) {
    // Silently fail if browser can't be opened
    console.log(
      "⚠️  Could not open browser automatically. Please open the URL manually.",
    );
  }
}

async function getAuthorizationCode(
  oauth2Client: OAuth2Client,
): Promise<string> {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent screen to ensure we get a refresh token
  });

  console.log("\n🔗 Opening your browser for authorization...");
  console.log("   If it doesn't open automatically, visit this URL:");
  console.log(`   ${authUrl}\n`);

  // Try to open browser automatically
  await openBrowser(authUrl);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url && req.url.indexOf("/oauth2callback") > -1) {
          const qs = new url.URL(req.url, `http://localhost:${REDIRECT_PORT}`)
            .searchParams;
          const code = qs.get("code");

          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authorization Successful</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                      text-align: center;
                      padding: 3rem;
                      background: white;
                      border-radius: 1rem;
                      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                      max-width: 500px;
                    }
                    h1 { color: #2d3748; margin: 0 0 1rem 0; }
                    p { color: #4a5568; font-size: 1.1rem; }
                    .checkmark {
                      font-size: 4rem;
                      margin-bottom: 1rem;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="checkmark">✅</div>
                    <h1>Authorization Successful!</h1>
                    <p>You can close this window and return to the terminal.</p>
                  </div>
                </body>
              </html>
            `);
            server.close();
            resolve(code);
          } else {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authorization Failed</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    }
                    .container {
                      text-align: center;
                      padding: 3rem;
                      background: white;
                      border-radius: 1rem;
                      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                      max-width: 500px;
                    }
                    h1 { color: #2d3748; margin: 0 0 1rem 0; }
                    p { color: #4a5568; font-size: 1.1rem; }
                    .cross {
                      font-size: 4rem;
                      margin-bottom: 1rem;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="cross">❌</div>
                    <h1>Authorization Failed</h1>
                    <p>No authorization code received. Please try again.</p>
                  </div>
                </body>
              </html>
            `);
            server.close();
            reject(new Error("No code in callback"));
          }
        }
      } catch (e) {
        reject(e);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(
        `⏳ Waiting for authorization on http://localhost:${REDIRECT_PORT}...\n`,
      );
    });
  });
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║   🔐 Google Drive MCP Server - OAuth2 Setup          ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Get client ID and secret from environment or command line args
  let clientId: string = process.env.GOOGLE_CLIENT_ID || process.argv[2] || "";
  let clientSecret: string =
    process.env.GOOGLE_CLIENT_SECRET || process.argv[3] || "";

  // Use defaults if not provided
  const usingDefaults = !clientId || !clientSecret;

  if (usingDefaults) {
    clientId = DEFAULT_CLIENT_ID;
    clientSecret = DEFAULT_CLIENT_SECRET;

    console.log("ℹ️  Using default OAuth2 credentials (shared among all users)");
    console.log("");
    console.log("⚠️  For better reliability and performance, create your own:");
    console.log(
      "   1. Visit: https://console.cloud.google.com/apis/credentials",
    );
    console.log("   2. Create a new OAuth 2.0 Client ID (Desktop app)");
    console.log("   3. Run setup again with your credentials:");
    console.log("      bun run setup <CLIENT_ID> <CLIENT_SECRET>");
    console.log("");
  } else {
    console.log("✅ Using custom OAuth2 credentials");
    console.log("");
  }

  console.log(
    "📋 This setup will authorize gdrive-mcp to access your Google Drive",
  );
  console.log("");
  console.log("   Permissions requested:");
  console.log("   • Read access to Google Drive files");
  console.log("   • Read access to Google Docs");
  console.log("");

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `http://localhost:${REDIRECT_PORT}/oauth2callback`,
  );

  try {
    // Get authorization code
    const code = await getAuthorizationCode(oauth2Client);

    console.log("✅ Authorization code received!");
    console.log("🔄 Exchanging code for tokens...\n");

    // Exchange for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error("No refresh token received. Please try again.");
    }

    // Store credentials securely using Bun.secrets
    console.log("🔐 Storing credentials securely in system keychain...\n");

    await Bun.secrets.set({
      service: "gdrive-mcp",
      name: "client_id",
      value: clientId as string,
    });

    await Bun.secrets.set({
      service: "gdrive-mcp",
      name: "client_secret",
      value: clientSecret as string,
    });

    await Bun.secrets.set({
      service: "gdrive-mcp",
      name: "refresh_token",
      value: tokens.refresh_token,
    });

    console.log("╔════════════════════════════════════════════════════════╗");
    console.log("║   ✨ Setup Complete!                                   ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");

    console.log("✅ Credentials stored securely in your system keychain");
    console.log(
      "   (macOS Keychain / Linux libsecret / Windows Credential Manager)\n",
    );

    console.log("📝 Add this to your Claude Desktop config:");
    console.log("   File location:");
    console.log(
      "   • macOS: ~/Library/Application Support/Claude/claude_desktop_config.json",
    );
    console.log("   • Windows: %APPDATA%\\Claude\\claude_desktop_config.json");
    console.log("   • Linux: ~/.config/Claude/claude_desktop_config.json\n");

    console.log("   Configuration:");
    console.log("   {");
    console.log('     "mcpServers": {');
    console.log('       "gdrive": {');
    console.log('         "command": "bunx",');
    console.log('         "args": ["--bun", "gdrive-mcp"]');
    console.log("       }");
    console.log("     }");
    console.log("   }\n");

    console.log("💡 No need to store sensitive credentials in config files!");
    console.log("   They're securely stored in your system keychain.\n");

    if (usingDefaults) {
      console.log(
        "⚠️  Remember: You're using shared credentials. Consider creating your own!",
      );
    }

    console.log("\n✅ Next steps:");
    console.log(
      "   1. Copy the configuration above to your Claude Desktop config",
    );
    console.log("   2. Restart Claude Desktop");
    console.log("   3. Try asking Claude to read a Google Doc!\n");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    console.error("\n💡 Troubleshooting:");
    console.error("   • Make sure you allowed all permissions");
    console.error("   • Check that port 48127 is not in use");
    console.error("   • Try running the setup again");
    process.exit(1);
  }
}

main();
