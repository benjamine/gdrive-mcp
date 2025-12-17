import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_list_doc_comments",
  description:
    "List all comment threads on a Google Doc, including the quoted text, comment content, replies, status (resolved/open), assignees, and timestamps. Accepts either a Google Docs URL or a document ID.",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
      ),
  }),
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
} as const;

export const handler = async (
  args: z.infer<typeof tool.inputSchema>,
  auth: OAuth2Client,
) => {
  const { doc_id_or_url } = args;

  try {
    const comments = await listComments(auth, doc_id_or_url);
    return {
      content: [
        {
          type: "text" as const,
          text: comments,
        },
      ],
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
};

const extractDocId = (input: string): string | null => {
  // Try to extract document ID from URL
  const urlMatch = input.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) {
    return urlMatch[1] ?? null;
  }

  // If it's not a URL, assume it's already a document ID
  if (/^[a-zA-Z0-9-_]+$/.test(input)) {
    return input;
  }

  return null;
};

const listComments = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
): Promise<string> => {
  const docId = extractDocId(docIdOrUrl);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

  const drive = google.drive({ version: "v3", auth });

  try {
    // Get all comments on the document
    const response = await drive.comments.list({
      fileId: docId,
      fields:
        "comments(id,content,quotedFileContent,anchor,resolved,createdTime,modifiedTime,author,replies)",
      includeDeleted: false,
    });

    const comments = response.data.comments || [];

    if (comments.length === 0) {
      return "No comments found on this document.";
    }

    // Format comments with all details
    let output = `Found ${comments.length} comment thread(s):\n\n`;

    for (const comment of comments) {
      output += `${"─".repeat(80)}\n`;
      output += `Comment ID: ${comment.id}\n`;
      output += `Created: ${comment.createdTime}\n`;
      output += `Modified: ${comment.modifiedTime}\n`;
      output += `Author: ${comment.author?.displayName || "Unknown"} (${comment.author?.emailAddress || "N/A"})\n`;
      output += `Status: ${comment.resolved ? "RESOLVED" : "OPEN"}\n`;

      if (comment.quotedFileContent?.value) {
        output += `\nQuoted text: "${comment.quotedFileContent.value}"\n`;
      }

      if (comment.anchor) {
        output += `Anchor: ${comment.anchor}\n`;
      }

      output += `\nComment: ${comment.content}\n`;

      // Add replies if any
      if (comment.replies && comment.replies.length > 0) {
        output += `\nReplies (${comment.replies.length}):\n`;
        for (const reply of comment.replies) {
          output += `  • ${reply.author?.displayName || "Unknown"} (${reply.createdTime}):\n`;
          output += `    ${reply.content}\n`;
        }
      }

      output += "\n";
    }

    return output;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to get comments: ${error.message}`);
    }
    throw error;
  }
};
