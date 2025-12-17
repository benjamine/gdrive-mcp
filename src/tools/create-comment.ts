import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_create_doc_comment",
  description:
    "Create a new UNANCHORED comment on a Google Doc. NOTE: The Drive API does not support creating comments anchored to specific text - comments will appear in the 'All Comments' view, not attached to specific text selections.",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
      ),
    comment: z.string().describe("The comment text to add"),
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
  const { doc_id_or_url, comment } = args;

  try {
    const result = await createComment(auth, doc_id_or_url, comment);
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

const createComment = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  content: string,
): Promise<string> => {
  const docId = extractDocId(docIdOrUrl);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

  const drive = google.drive({ version: "v3", auth });

  try {
    // Note: The Drive API v3 does NOT support creating anchored comments
    // on Google Docs. Comments created through the API will appear as
    // unanchored comments in the "All Comments" view.
    const commentData = {
      content,
    };

    const response = await drive.comments.create({
      fileId: docId,
      requestBody: commentData,
      fields: "id,content,author,createdTime",
    });

    let result = `Comment created successfully!\n\n`;
    result += `Comment ID: ${response.data.id}\n`;
    result += `Author: ${response.data.author?.displayName}\n`;
    result += `Created: ${response.data.createdTime}\n`;
    result += `Content: ${response.data.content}\n`;
    result += `\nNote: This comment appears as an unanchored comment in the document's "All Comments" view.\n`;
    result += `The Drive API does not support creating comments anchored to specific text in Google Docs.\n`;

    return result;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to create comment: ${error.message}`);
    }
    throw error;
  }
};
