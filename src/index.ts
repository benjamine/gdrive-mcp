#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import * as createComment from "./tools/create-comment.js";
import * as getContents from "./tools/get-contents.js";
import * as insertNote from "./tools/insert-note.js";
import * as listComments from "./tools/list-comments.js";
import * as removeNote from "./tools/remove-note.js";
import * as replyToComment from "./tools/reply-to-comment.js";
import * as searchDrive from "./tools/search-drive.js";
import * as updateDocContent from "./tools/update-doc-content.js";
import * as updateNote from "./tools/update-note.js";

const createAuth = async (): Promise<OAuth2Client> => {
  // Try to load credentials from Bun.secrets first
  const clientId = await Bun.secrets.get({
    service: "gdrive-mcp",
    name: "client_id",
  });

  const clientSecret = await Bun.secrets.get({
    service: "gdrive-mcp",
    name: "client_secret",
  });

  const refreshToken = await Bun.secrets.get({
    service: "gdrive-mcp",
    name: "refresh_token",
  });

  // Fall back to environment variables if not found in secrets
  const finalClientId = clientId || process.env.GOOGLE_CLIENT_ID;
  const finalClientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const finalRefreshToken = refreshToken || process.env.GOOGLE_REFRESH_TOKEN;

  if (!finalClientId || !finalClientSecret || !finalRefreshToken) {
    throw new Error(
      "Missing credentials. Please run: bun run src/setup-auth.ts",
    );
  }

  const auth = new google.auth.OAuth2(finalClientId, finalClientSecret);
  auth.setCredentials({ refresh_token: finalRefreshToken });

  return auth;
};

const registerTools = (mcpServer: McpServer, auth: OAuth2Client) => {
  // Register each tool with Zod schema support
  mcpServer.registerTool(
    getContents.tool.name,
    {
      description: getContents.tool.description,
      inputSchema: getContents.tool.inputSchema,
      annotations: getContents.tool.annotations,
    },
    async (args) => getContents.handler(args, auth),
  );

  mcpServer.registerTool(
    listComments.tool.name,
    {
      description: listComments.tool.description,
      inputSchema: listComments.tool.inputSchema,
      annotations: listComments.tool.annotations,
    },
    async (args) => listComments.handler(args, auth),
  );

  mcpServer.registerTool(
    createComment.tool.name,
    {
      description: createComment.tool.description,
      inputSchema: createComment.tool.inputSchema,
      annotations: createComment.tool.annotations,
    },
    async (args) => createComment.handler(args, auth),
  );

  mcpServer.registerTool(
    replyToComment.tool.name,
    {
      description: replyToComment.tool.description,
      inputSchema: replyToComment.tool.inputSchema,
      annotations: replyToComment.tool.annotations,
    },
    async (args) => replyToComment.handler(args, auth),
  );

  mcpServer.registerTool(
    insertNote.tool.name,
    {
      description: insertNote.tool.description,
      inputSchema: insertNote.tool.inputSchema,
      annotations: insertNote.tool.annotations,
    },
    async (args) => insertNote.handler(args, auth),
  );

  mcpServer.registerTool(
    updateNote.tool.name,
    {
      description: updateNote.tool.description,
      inputSchema: updateNote.tool.inputSchema,
      annotations: updateNote.tool.annotations,
    },
    async (args) => updateNote.handler(args, auth),
  );

  mcpServer.registerTool(
    removeNote.tool.name,
    {
      description: removeNote.tool.description,
      inputSchema: removeNote.tool.inputSchema,
      annotations: removeNote.tool.annotations,
    },
    async (args) => removeNote.handler(args, auth),
  );

  mcpServer.registerTool(
    searchDrive.tool.name,
    {
      description: searchDrive.tool.description,
      inputSchema: searchDrive.tool.inputSchema,
      annotations: searchDrive.tool.annotations,
    },
    async (args) => searchDrive.handler(args, auth),
  );

  mcpServer.registerTool(
    updateDocContent.tool.name,
    {
      description: updateDocContent.tool.description,
      inputSchema: updateDocContent.tool.inputSchema,
      annotations: updateDocContent.tool.annotations,
    },
    async (args) => updateDocContent.handler(args, auth),
  );
};

const startServer = async () => {
  const auth = await createAuth();

  const mcpServer = new McpServer(
    {
      name: "gdrive-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  registerTools(mcpServer, auth);

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error("Google Drive MCP Server running on stdio");
};

startServer().catch(console.error);
