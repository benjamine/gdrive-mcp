import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_update_doc_note",
  description:
    "Update the text of an existing note in a Google Doc by its note number. The note number and formatting (📝 NOTE #:) remain the same, only the text content is updated.",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
      ),
    note_number: z
      .number()
      .describe("The note number to update (e.g., 1 for 📝 NOTE 1:)"),
    new_text: z
      .string()
      .describe("The new note text (without the '📝 NOTE #:' prefix)"),
  }),
  annotations: {
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
} as const;

export const handler = async (
  args: z.infer<typeof tool.inputSchema>,
  auth: OAuth2Client,
) => {
  const { doc_id_or_url, note_number, new_text } = args;

  try {
    const result = await updateNote(auth, doc_id_or_url, note_number, new_text);
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

const updateNote = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  noteNumber: number,
  newNoteText: string,
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

    // Find the note by number
    let noteStartIndex: number | null = null;
    let noteEndIndex: number | null = null;
    let oldNoteText = "";

    for (const element of doc.data.body.content) {
      if (element.paragraph) {
        // Concatenate all text runs in the paragraph to handle notes split across runs
        let paragraphText = "";
        const paragraphStartIndex = element.startIndex ?? 0;

        for (const textElement of element.paragraph.elements || []) {
          paragraphText += textElement.textRun?.content || "";
        }

        const pattern = new RegExp(
          `📝 NOTE ${noteNumber}: (.+?)(?=\\n|$)`,
          "s",
        );
        const match = paragraphText.match(pattern);

        if (match) {
          const notePrefix = `📝 NOTE ${noteNumber}: `;
          const notePrefixIndex = paragraphText.indexOf(notePrefix);

          noteStartIndex =
            paragraphStartIndex + notePrefixIndex + notePrefix.length;
          oldNoteText = match[1] || "";

          // Find the end of the note text (before the newline)
          const noteTextStart = notePrefixIndex + notePrefix.length;
          const restOfText = paragraphText.substring(noteTextStart);
          const endOfNote = restOfText.indexOf("\n");

          if (endOfNote !== -1) {
            noteEndIndex = paragraphStartIndex + noteTextStart + endOfNote;
          } else {
            noteEndIndex =
              paragraphStartIndex + noteTextStart + restOfText.length;
          }

          break;
        }
      }
    }

    if (noteStartIndex === null || noteEndIndex === null) {
      throw new Error(
        `Could not find NOTE ${noteNumber} in the document. Use list_doc_notes to see all notes.`,
      );
    }

    // Delete old note text and insert new one
    const requests = [
      {
        deleteContentRange: {
          range: {
            startIndex: noteStartIndex,
            endIndex: noteEndIndex,
          },
        },
      },
      {
        insertText: {
          location: {
            index: noteStartIndex,
          },
          text: newNoteText,
        },
      },
    ];

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests,
      },
    });

    return `Note ${noteNumber} updated successfully!\n\nOld text: ${oldNoteText}\nNew text: ${newNoteText}`;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to update note: ${error.message}`);
    }
    throw error;
  }
};
