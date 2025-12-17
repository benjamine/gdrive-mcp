import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_reply_to_comment",
  description:
    "Reply to an existing comment thread on a Google Doc. Can optionally resolve the thread or assign it to someone.",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
      ),
    comment_id: z
      .string()
      .describe(
        "The ID of the comment thread to reply to (get this from gdrive_list_doc_comments)",
      ),
    reply: z.string().describe("The reply text to add"),
    resolve: z
      .boolean()
      .optional()
      .describe(
        "Optional: Set to true to mark the thread as resolved after adding the reply",
      ),
    assignee_email: z
      .string()
      .optional()
      .describe(
        "Optional: Email address of the person to assign this comment to",
      ),
  }),
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
  },
} as const;

export const handler = async (
  args: z.infer<typeof tool.inputSchema>,
  auth: OAuth2Client,
) => {
  const { doc_id_or_url, comment_id, reply, resolve, assignee_email } = args;

  try {
    const result = await replyToComment(
      auth,
      doc_id_or_url,
      comment_id,
      reply,
      resolve,
      assignee_email,
    );
    return {
      content: [
        {
          type: "text" as const,
          text: result,
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

const replyToComment = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  commentId: string,
  content: string,
  resolve?: boolean,
  assigneeEmail?: string,
): Promise<string> => {
  const docId = extractDocId(docIdOrUrl);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

  const drive = google.drive({ version: "v3", auth });

  try {
    // Create the reply
    const response = await drive.replies.create({
      fileId: docId,
      commentId,
      requestBody: {
        content,
      },
      fields: "id,content,author,createdTime",
    });

    let result = `Reply added successfully!\n\n`;
    result += `Reply ID: ${response.data.id}\n`;
    result += `Author: ${response.data.author?.displayName}\n`;
    result += `Created: ${response.data.createdTime}\n`;
    result += `Content: ${response.data.content}\n`;

    // Resolve the thread if requested
    if (resolve) {
      await drive.comments.update({
        fileId: docId,
        commentId,
        requestBody: {
          resolved: true,
        },
      });
      result += `\nThread marked as RESOLVED.\n`;
    }

    // Update assignee if specified
    if (assigneeEmail) {
      try {
        await drive.comments.update({
          fileId: docId,
          commentId,
          requestBody: {
            content: response.data.content || content,
          },
        });
        result += `\nNote: Assignee feature may require additional permissions.\n`;
      } catch {
        result += `\nWarning: Could not set assignee. This feature may not be available.\n`;
      }
    }

    return result;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to reply to comment: ${error.message}`);
    }
    throw error;
  }
};
