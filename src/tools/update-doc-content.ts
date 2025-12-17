import type { OAuth2Client } from "google-auth-library";
import type { docs_v1 } from "googleapis";
import { google } from "googleapis";
import { JSONPath } from "jsonpath-plus";
import { z } from "zod";

/**
 * Example usage (JSONPath approach - RECOMMENDED):
 *
 * 1. Get document structure:
 *    gdrive_get_doc_contents(doc_id, format="json")
 *
 * 2. Insert a heading with bullet list after the first paragraph:
 *    gdrive_update_doc_content({
 *      doc_id_or_url: doc_id,
 *      operation: "insertAfter",
 *      target: "$.body.content[1]",
 *      content: [
 *        { type: "heading", level: 2, text: "Key Features" },
 *        { type: "bulletList", items: ["Feature 1", "Feature 2", "Feature 3"] }
 *      ]
 *    })
 *
 * 3. For the next operation, use the UPDATED structure returned (don't re-fetch):
 *    The tool returns the new document structure with updated indices.
 *
 * Raw API approach (advanced users):
 *    gdrive_update_doc_content(doc_id, requests=[...batchUpdate requests...])
 */

// Schema for JSONPath-based content items
const contentItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    level: z.number().min(1).max(6),
    text: z.string(),
  }),
  z.object({
    type: z.literal("paragraph"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("bulletList"),
    items: z.array(z.string()),
  }),
]);

// Schema for text style properties
const textStyleSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strikethrough: z.boolean().optional(),
    fontSize: z.number().optional(),
    foregroundColor: z
      .object({
        red: z.number().min(0).max(1).optional(),
        green: z.number().min(0).max(1).optional(),
        blue: z.number().min(0).max(1).optional(),
      })
      .optional(),
    backgroundColor: z
      .object({
        red: z.number().min(0).max(1).optional(),
        green: z.number().min(0).max(1).optional(),
        blue: z.number().min(0).max(1).optional(),
      })
      .optional(),
    link: z
      .object({
        url: z.string(),
      })
      .optional(),
  })
  .optional();

// Schema for paragraph style properties
const paragraphStyleSchema = z
  .object({
    headingLevel: z
      .enum([
        "NORMAL_TEXT",
        "HEADING_1",
        "HEADING_2",
        "HEADING_3",
        "HEADING_4",
        "HEADING_5",
        "HEADING_6",
      ])
      .optional(),
    alignment: z.enum(["START", "CENTER", "END", "JUSTIFIED"]).optional(),
    lineSpacing: z.number().optional(),
    direction: z.enum(["LEFT_TO_RIGHT", "RIGHT_TO_LEFT"]).optional(),
    indentStart: z.number().optional(),
    indentEnd: z.number().optional(),
    indentFirstLine: z.number().optional(),
  })
  .optional();

// Schema for JSONPath-based operations
const jsonPathOperationSchema = z.object({
  doc_id_or_url: z
    .string()
    .describe(
      "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
    ),
  operation: z.enum([
    "insertAfter",
    "insertBefore",
    "replace",
    "delete",
    "updateTextStyle",
    "updateParagraphStyle",
  ]),
  target: z
    .string()
    .describe(
      "JSONPath expression to target element (e.g., '$.body.content[1]' for paragraph, '$.body.content[1].paragraph.elements[0]' for text element)",
    ),
  content: z.array(contentItemSchema).optional(),
  textStyle: textStyleSchema,
  paragraphStyle: paragraphStyleSchema,
});

export const tool = {
  name: "gdrive_update_doc_content",
  description:
    "Add, modify, or delete content in a Google Doc. Use this tool to insert headings, paragraphs, bullet lists, or update text/paragraph formatting. WORKFLOW: (1) First operation: call gdrive_get_doc_contents with format='json' to get document structure, (2) Make ONE operation per tool call, (3) For subsequent operations: use the UPDATED DOCUMENT STRUCTURE returned by this tool (don't re-fetch with gdrive_get_doc_contents). OPERATIONS: insertAfter (add content after an element), insertBefore (add content before an element), replace (replace element with new content), delete (remove element), updateTextStyle (bold/italic/color on specific text), updateParagraphStyle (change heading level/alignment). Target elements using JSONPath (e.g., '$.body.content[1]' for 2nd paragraph). Returns updated document structure for next operation. IMPORTANT: Only ONE operation per call since indices shift after modifications. You can insert multiple content items (headings, paragraphs, lists) in a single operation.",
  inputSchema: z.union([
    jsonPathOperationSchema,
    z.object({
      doc_id_or_url: z
        .string()
        .describe(
          "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
        ),
      requests: z
        .array(z.any())
        .describe(
          "Array of Google Docs API batchUpdate request objects. Each request must specify exact indices from the document JSON structure. Common operations: insertText (add text at a specific index), deleteContentRange (remove content between indices), updateTextStyle (change formatting), updateParagraphStyle (modify paragraph properties), createParagraphBullets (convert paragraphs to bullet list), insertTable, replaceAllText, etc. See https://developers.google.com/docs/api/reference/rest/v1/documents/request",
        ),
    }),
  ]),
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
} as const;

export const handler = async (
  args: z.infer<typeof tool.inputSchema>,
  auth: OAuth2Client,
) => {
  try {
    // Check if this is a JSONPath-based operation
    if ("operation" in args && "target" in args) {
      const result = await handleJsonPathOperation(auth, args);
      return {
        content: [
          {
            type: "text" as const,
            text: result,
          },
        ],
      };
    }

    // Otherwise, it's a raw API request
    if ("requests" in args) {
      const { doc_id_or_url, requests } = args;
      const result = await updateDocContent(auth, doc_id_or_url, requests);
      return {
        content: [
          {
            type: "text" as const,
            text: result,
          },
        ],
      };
    }

    throw new Error(
      "Invalid arguments: must provide either operation/target or requests",
    );
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

const handleJsonPathOperation = async (
  auth: OAuth2Client,
  args: z.infer<typeof jsonPathOperationSchema>,
): Promise<string> => {
  const { doc_id_or_url, operation, target, content } = args;

  const docId = extractDocId(doc_id_or_url);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

  const docs = google.docs({ version: "v1", auth });

  // First, fetch the document to get its structure
  const doc = await docs.documents.get({ documentId: docId });

  if (!doc.data) {
    throw new Error("Failed to fetch document");
  }

  // Use JSONPath to find the target element
  const results = JSONPath({ path: target, json: doc.data });

  if (results.length === 0) {
    throw new Error(`No element found at JSONPath: ${target}`);
  }

  if (results.length > 1) {
    throw new Error(
      `Multiple elements found at JSONPath: ${target}. Path must be unique.`,
    );
  }

  const targetElement = results[0];

  // Build requests based on operation type
  let requests: docs_v1.Schema$Request[];
  let operationDescription: string;

  if (operation === "updateTextStyle") {
    // Update text style: target must be a text element with startIndex/endIndex
    if (!args.textStyle) {
      throw new Error(
        "updateTextStyle operation requires textStyle to be provided",
      );
    }

    if (!targetElement.startIndex || !targetElement.endIndex) {
      throw new Error(
        "Target element must have startIndex and endIndex for updateTextStyle operation",
      );
    }

    // Build the textStyle object for the API
    const textStyleUpdate: docs_v1.Schema$TextStyle = {};
    const fields: string[] = [];

    if (args.textStyle.bold !== undefined) {
      textStyleUpdate.bold = args.textStyle.bold;
      fields.push("bold");
    }
    if (args.textStyle.italic !== undefined) {
      textStyleUpdate.italic = args.textStyle.italic;
      fields.push("italic");
    }
    if (args.textStyle.underline !== undefined) {
      textStyleUpdate.underline = args.textStyle.underline;
      fields.push("underline");
    }
    if (args.textStyle.strikethrough !== undefined) {
      textStyleUpdate.strikethrough = args.textStyle.strikethrough;
      fields.push("strikethrough");
    }
    if (args.textStyle.fontSize !== undefined) {
      textStyleUpdate.fontSize = {
        magnitude: args.textStyle.fontSize,
        unit: "PT",
      };
      fields.push("fontSize");
    }
    if (args.textStyle.foregroundColor) {
      textStyleUpdate.foregroundColor = {
        color: { rgbColor: args.textStyle.foregroundColor },
      };
      fields.push("foregroundColor");
    }
    if (args.textStyle.backgroundColor) {
      textStyleUpdate.backgroundColor = {
        color: { rgbColor: args.textStyle.backgroundColor },
      };
      fields.push("backgroundColor");
    }
    if (args.textStyle.link) {
      textStyleUpdate.link = { url: args.textStyle.link.url };
      fields.push("link");
    }

    requests = [
      {
        updateTextStyle: {
          range: {
            startIndex: targetElement.startIndex,
            endIndex: targetElement.endIndex,
          },
          textStyle: textStyleUpdate,
          fields: fields.join(","),
        },
      },
    ];

    operationDescription = `Updated text style from index ${targetElement.startIndex} to ${targetElement.endIndex}`;
  } else if (operation === "updateParagraphStyle") {
    // Update paragraph style: target must be a paragraph element
    if (!args.paragraphStyle) {
      throw new Error(
        "updateParagraphStyle operation requires paragraphStyle to be provided",
      );
    }

    if (!targetElement.startIndex || !targetElement.endIndex) {
      throw new Error(
        "Target element must have startIndex and endIndex for updateParagraphStyle operation",
      );
    }

    // Build the paragraphStyle object for the API
    const paragraphStyleUpdate: docs_v1.Schema$ParagraphStyle = {};
    const fields: string[] = [];

    if (args.paragraphStyle.headingLevel) {
      paragraphStyleUpdate.namedStyleType = args.paragraphStyle.headingLevel;
      fields.push("namedStyleType");
    }
    if (args.paragraphStyle.alignment) {
      paragraphStyleUpdate.alignment = args.paragraphStyle.alignment;
      fields.push("alignment");
    }
    if (args.paragraphStyle.lineSpacing !== undefined) {
      paragraphStyleUpdate.lineSpacing = args.paragraphStyle.lineSpacing;
      fields.push("lineSpacing");
    }
    if (args.paragraphStyle.direction) {
      paragraphStyleUpdate.direction = args.paragraphStyle.direction;
      fields.push("direction");
    }
    if (args.paragraphStyle.indentStart !== undefined) {
      paragraphStyleUpdate.indentStart = {
        magnitude: args.paragraphStyle.indentStart,
        unit: "PT",
      };
      fields.push("indentStart");
    }
    if (args.paragraphStyle.indentEnd !== undefined) {
      paragraphStyleUpdate.indentEnd = {
        magnitude: args.paragraphStyle.indentEnd,
        unit: "PT",
      };
      fields.push("indentEnd");
    }
    if (args.paragraphStyle.indentFirstLine !== undefined) {
      paragraphStyleUpdate.indentFirstLine = {
        magnitude: args.paragraphStyle.indentFirstLine,
        unit: "PT",
      };
      fields.push("indentFirstLine");
    }

    requests = [
      {
        updateParagraphStyle: {
          range: {
            startIndex: targetElement.startIndex,
            endIndex: targetElement.endIndex,
          },
          paragraphStyle: paragraphStyleUpdate,
          fields: fields.join(","),
        },
      },
    ];

    operationDescription = `Updated paragraph style from index ${targetElement.startIndex} to ${targetElement.endIndex}`;
  } else if (operation === "delete") {
    // Delete: remove the entire element
    if (!targetElement.startIndex || !targetElement.endIndex) {
      throw new Error(
        "Target element must have startIndex and endIndex for delete operation",
      );
    }

    requests = [
      {
        deleteContentRange: {
          range: {
            startIndex: targetElement.startIndex,
            endIndex: targetElement.endIndex,
          },
        },
      },
    ];

    operationDescription = `Deleted element from index ${targetElement.startIndex} to ${targetElement.endIndex}`;
  } else if (operation === "replace") {
    // Replace: delete the element and insert new content at the same position
    if (!content || content.length === 0) {
      throw new Error("Replace operation requires content to be provided");
    }

    if (!targetElement.startIndex || !targetElement.endIndex) {
      throw new Error(
        "Target element must have startIndex and endIndex for replace operation",
      );
    }

    // First delete the old content, then insert new content at the same position
    requests = [
      {
        deleteContentRange: {
          range: {
            startIndex: targetElement.startIndex,
            endIndex: targetElement.endIndex,
          },
        },
      },
      ...generateRequestsFromContent(content, targetElement.startIndex),
    ];

    operationDescription = `Replaced element at index ${targetElement.startIndex}-${targetElement.endIndex}`;
  } else {
    // insertAfter or insertBefore
    if (!content || content.length === 0) {
      throw new Error(`${operation} operation requires content to be provided`);
    }

    let insertIndex: number;

    if (operation === "insertAfter") {
      if (!targetElement.endIndex) {
        throw new Error("Target element does not have an endIndex");
      }
      insertIndex = targetElement.endIndex;
    } else {
      // insertBefore
      if (!targetElement.startIndex) {
        throw new Error("Target element does not have a startIndex");
      }
      insertIndex = targetElement.startIndex;
    }

    requests = generateRequestsFromContent(content, insertIndex);
    operationDescription = `Insert index: ${insertIndex}`;
  }

  // Execute the batch update
  const response = await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests,
    },
  });

  const replies = response.data.replies || [];
  const summary = buildUpdateSummary(requests, replies);

  // Fetch the updated document structure to return fresh JSONPath references
  const updatedDoc = await docs.documents.get({ documentId: docId });

  return `Document updated successfully using JSONPath targeting.

Target: ${target}
Operation: ${operation}
${operationDescription}

${summary}

UPDATED DOCUMENT STRUCTURE (use this for next operations):
${JSON.stringify(updatedDoc.data, null, 2)}`;
};

const generateRequestsFromContent = (
  content: z.infer<typeof contentItemSchema>[],
  startIndex: number,
): docs_v1.Schema$Request[] => {
  const requests: docs_v1.Schema$Request[] = [];
  let currentIndex = startIndex;

  for (const item of content) {
    if (item.type === "heading") {
      const text = `${item.text}\n`;
      // Insert text
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text,
        },
      });
      // Apply heading style
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: currentIndex,
            endIndex: currentIndex + text.length,
          },
          paragraphStyle: {
            namedStyleType: `HEADING_${item.level}`,
          },
          fields: "namedStyleType",
        },
      });
      currentIndex += text.length;
    } else if (item.type === "paragraph") {
      const text = `${item.text}\n`;
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text,
        },
      });
      currentIndex += text.length;
    } else if (item.type === "bulletList") {
      for (const bulletItem of item.items) {
        const text = `${bulletItem}\n`;
        const textStartIndex = currentIndex;
        const textEndIndex = currentIndex + text.length;

        // Insert text
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text,
          },
        });
        // Reset to NORMAL_TEXT style (prevents inheriting heading styles)
        requests.push({
          updateParagraphStyle: {
            range: {
              startIndex: textStartIndex,
              endIndex: textEndIndex,
            },
            paragraphStyle: {
              namedStyleType: "NORMAL_TEXT",
            },
            fields: "namedStyleType",
          },
        });
        // Apply bullet formatting
        requests.push({
          createParagraphBullets: {
            range: {
              startIndex: textStartIndex,
              endIndex: textEndIndex,
            },
            bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
          },
        });
        currentIndex += text.length;
      }
    }
  }

  return requests;
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

const updateDocContent = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  requests: docs_v1.Schema$Request[],
): Promise<string> => {
  const docId = extractDocId(docIdOrUrl);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

  if (!requests || requests.length === 0) {
    throw new Error("No update requests provided");
  }

  const docs = google.docs({ version: "v1", auth });

  try {
    // Execute the batch update
    const response = await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests,
      },
    });

    // Build a summary of what was updated
    const replies = response.data.replies || [];
    const summary = buildUpdateSummary(requests, replies);

    return `Document updated successfully.\n\n${summary}`;
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Provide more helpful error messages
      if (error.message.includes("Invalid requests")) {
        throw new Error(
          `Invalid update request. Make sure you're using valid Google Docs API request objects. Error: ${error.message}`,
        );
      }
      if (error.message.includes("Invalid range")) {
        throw new Error(
          `Invalid range in update request. Ensure the startIndex and endIndex are within the document bounds. Error: ${error.message}`,
        );
      }
      throw new Error(`Failed to update document: ${error.message}`);
    }
    throw error;
  }
};

const buildUpdateSummary = (
  requests: docs_v1.Schema$Request[],
  _replies: docs_v1.Schema$Response[],
): string => {
  const operations: string[] = [];

  for (const request of requests) {
    if (!request) continue;

    // Describe each operation type
    if (request.insertText) {
      const text = request.insertText.text || "";
      const preview = text.length > 50 ? `${text.substring(0, 50)}...` : text;
      operations.push(
        `- Inserted text at index ${request.insertText.location?.index}: "${preview}"`,
      );
    } else if (request.deleteContentRange) {
      operations.push(
        `- Deleted content from index ${request.deleteContentRange.range?.startIndex} to ${request.deleteContentRange.range?.endIndex}`,
      );
    } else if (request.updateTextStyle) {
      operations.push(
        `- Updated text style from index ${request.updateTextStyle.range?.startIndex} to ${request.updateTextStyle.range?.endIndex}`,
      );
    } else if (request.updateParagraphStyle) {
      operations.push(
        `- Updated paragraph style from index ${request.updateParagraphStyle.range?.startIndex} to ${request.updateParagraphStyle.range?.endIndex}`,
      );
    } else if (request.insertTable) {
      operations.push(
        `- Inserted table with ${request.insertTable.rows} rows and ${request.insertTable.columns} columns at index ${request.insertTable.location?.index}`,
      );
    } else if (request.insertTableRow) {
      operations.push(
        `- Inserted table row at index ${request.insertTableRow.insertBelow ? "below" : "above"}`,
      );
    } else if (request.insertTableColumn) {
      operations.push(
        `- Inserted table column at index ${request.insertTableColumn.insertRight ? "right" : "left"}`,
      );
    } else if (request.deleteTableRow) {
      operations.push("- Deleted table row");
    } else if (request.deleteTableColumn) {
      operations.push("- Deleted table column");
    } else if (request.replaceAllText) {
      operations.push(
        `- Replaced all occurrences of "${request.replaceAllText.containsText?.text}" with "${request.replaceAllText.replaceText}"`,
      );
    } else if (request.createParagraphBullets) {
      operations.push(
        `- Created paragraph bullets from index ${request.createParagraphBullets.range?.startIndex} to ${request.createParagraphBullets.range?.endIndex}`,
      );
    } else if (request.deleteParagraphBullets) {
      operations.push(
        `- Deleted paragraph bullets from index ${request.deleteParagraphBullets.range?.startIndex} to ${request.deleteParagraphBullets.range?.endIndex}`,
      );
    } else {
      // Generic description for other operation types
      const operationType = Object.keys(request)[0];
      operations.push(`- Executed operation: ${operationType}`);
    }
  }

  return operations.length > 0
    ? `Operations performed:\n${operations.join("\n")}`
    : "No operations described";
};
