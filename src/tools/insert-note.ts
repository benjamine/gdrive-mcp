import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_insert_doc_note",
  description:
    "Insert a styled note block into a Google Doc at a specific location. Notes are automatically numbered (📝 NOTE 1:, 📝 NOTE 2:, etc.) and appear with a yellow background for easy identification. Use this to add inline feedback, notes, or observations next to specific content.",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
      ),
    search_text: z
      .string()
      .describe(
        "The exact text to search for in the document. The note will be inserted immediately after the paragraph containing this text.",
      ),
    note: z
      .string()
      .describe(
        "The note text to insert (the '📝 NOTE #:' prefix is added automatically with auto-incrementing number)",
      ),
  }),
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
} as const;

export const handler = async (
  args: z.infer<typeof tool.inputSchema>,
  auth: OAuth2Client,
) => {
  const { doc_id_or_url, search_text, note } = args;

  try {
    const result = await insertNote(auth, doc_id_or_url, search_text, note);
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

const insertNote = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  searchText: string,
  note: string,
): Promise<string> => {
  const docId = extractDocId(docIdOrUrl);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

  const docs = google.docs({ version: "v1", auth });

  try {
    // First, get the document to find the text location and count existing notes
    const doc = await docs.documents.get({
      documentId: docId,
    });

    if (!doc.data.body?.content) {
      throw new Error("Document has no content");
    }

    // Count existing notes to get the next note number
    let maxNoteNumber = 0;
    for (const element of doc.data.body.content) {
      if (element.paragraph) {
        for (const textElement of element.paragraph.elements || []) {
          const content = textElement.textRun?.content || "";
          // Match "📝 NOTE #:" pattern
          const match = content.match(/📝 NOTE (\d+):/);
          if (match?.[1]) {
            const noteNum = Number.parseInt(match[1], 10);
            if (noteNum > maxNoteNumber) {
              maxNoteNumber = noteNum;
            }
          }
        }
      }
    }

    const nextNoteNumber = maxNoteNumber + 1;

    // Find the search text in the document
    let targetIndex: number | null = null;
    let searchTextFound = false;

    for (const element of doc.data.body.content) {
      if (element.paragraph) {
        for (const textElement of element.paragraph.elements || []) {
          if (textElement.textRun?.content?.includes(searchText)) {
            // Insert after this paragraph
            targetIndex = element.endIndex ?? null;
            searchTextFound = true;
            break;
          }
        }
        if (searchTextFound) break;
      }
    }

    if (targetIndex === null) {
      throw new Error(
        `Could not find the text "${searchText}" in the document. Please provide exact text that exists in the document.`,
      );
    }

    // Create the styled note text with auto-incrementing number
    const noteText = `\n📝 NOTE ${nextNoteNumber}: ${note}\n\n`;

    // Insert the note with styling
    const requests = [
      // Insert the note text
      {
        insertText: {
          location: {
            index: targetIndex,
          },
          text: noteText,
        },
      },
      // Style the entire note block with shading and reset to normal paragraph style
      {
        updateParagraphStyle: {
          range: {
            startIndex: targetIndex + 1, // Skip the first newline
            endIndex: targetIndex + noteText.length - 2, // Skip the last newlines
          },
          paragraphStyle: {
            namedStyleType: "NORMAL_TEXT", // Force normal text style
            shading: {
              backgroundColor: {
                color: {
                  rgbColor: {
                    red: 1.0,
                    green: 0.95,
                    blue: 0.8, // Light yellow/cream background
                  },
                },
              },
            },
            indentStart: {
              magnitude: 20,
              unit: "PT",
            },
            indentEnd: {
              magnitude: 20,
              unit: "PT",
            },
            spaceAbove: {
              magnitude: 8,
              unit: "PT",
            },
            spaceBelow: {
              magnitude: 8,
              unit: "PT",
            },
          },
          fields:
            "namedStyleType,shading,indentStart,indentEnd,spaceAbove,spaceBelow",
        },
      },
      // Set entire note text to normal size first
      {
        updateTextStyle: {
          range: {
            startIndex: targetIndex + 1,
            endIndex: targetIndex + noteText.length - 2,
          },
          textStyle: {
            fontSize: {
              magnitude: 11,
              unit: "PT",
            },
          },
          fields: "fontSize",
        },
      },
      // Make the emoji and "NOTE #:" bold and colored
      {
        updateTextStyle: {
          range: {
            startIndex: targetIndex + 1, // After the first newline
            endIndex: targetIndex + 1 + `📝 NOTE ${nextNoteNumber}:`.length,
          },
          textStyle: {
            bold: true,
            foregroundColor: {
              color: {
                rgbColor: {
                  red: 0.8,
                  green: 0.4,
                  blue: 0.0, // Orange text
                },
              },
            },
          },
          fields: "bold,foregroundColor",
        },
      },
    ];

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests,
      },
    });

    return `Note inserted successfully after the text: "${searchText}"\n\nNote content: ${noteText}`;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to insert note: ${error.message}`);
    }
    throw error;
  }
};
