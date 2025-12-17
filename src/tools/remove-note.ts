import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_remove_doc_note",
  description:
    "Remove a note from a Google Doc by its note number. This completely deletes the note block including all formatting.",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
      ),
    note_number: z
      .number()
      .describe("The note number to remove (e.g., 1 for 📝 NOTE 1:)"),
  }),
  annotations: {
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: true,
  },
} as const;

export const handler = async (
  args: z.infer<typeof tool.inputSchema>,
  auth: OAuth2Client,
) => {
  const { doc_id_or_url, note_number } = args;

  try {
    const result = await removeNote(auth, doc_id_or_url, note_number);
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

const removeNote = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  noteNumber: number,
): Promise<string> => {
  const docId = extractDocId(docIdOrUrl);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

  const docs = google.docs({ version: "v1", auth });

  try {
    // Get the document to find the note
    const doc = await docs.documents.get({
      documentId: docId,
    });

    if (!doc.data.body?.content) {
      throw new Error("Document has no content");
    }

    // Find the note by number and its entire paragraph
    let noteStartIndex: number | null = null;
    let noteEndIndex: number | null = null;
    let noteText = "";

    for (const element of doc.data.body.content) {
      if (element.paragraph) {
        // Check if this paragraph contains the note
        let foundNote = false;
        for (const textElement of element.paragraph.elements || []) {
          const content = textElement.textRun?.content || "";
          if (content.includes(`📝 NOTE ${noteNumber}:`)) {
            foundNote = true;
            noteText = content;
            break;
          }
        }

        if (foundNote) {
          // Delete the entire paragraph including the newline before it
          noteStartIndex = (element.startIndex ?? 0) - 1; // Include the leading newline
          noteEndIndex = element.endIndex ?? null;
          break;
        }
      }
    }

    if (noteStartIndex === null || noteEndIndex === null) {
      throw new Error(
        `Could not find NOTE ${noteNumber} in the document. Use list_doc_notes to see all notes.`,
      );
    }

    // Ensure we don't delete negative indices
    if (noteStartIndex < 1) {
      noteStartIndex = 1;
    }

    // Delete the entire note block
    const requests = [
      {
        deleteContentRange: {
          range: {
            startIndex: noteStartIndex,
            endIndex: noteEndIndex,
          },
        },
      },
    ];

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests,
      },
    });

    return `Note ${noteNumber} removed successfully!\n\nRemoved text: ${noteText.trim()}`;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to remove note: ${error.message}`);
    }
    throw error;
  }
};
