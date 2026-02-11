import type { OAuth2Client } from "google-auth-library";
import type { docs_v1 } from "googleapis";
import { google } from "googleapis";
import { z } from "zod";

type DocumentType = "document" | "spreadsheet";

export const tool = {
  name: "gdrive_get_contents",
  description:
    "Get the contents of a Google Doc or Spreadsheet in different formats. Supports markdown (default, preserves structure like headings, lists, tables, formatting for docs; creates table for sheets) or JSON (full document/spreadsheet structure).",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs or Sheets URL (e.g., https://docs.google.com/document/d/... or https://docs.google.com/spreadsheets/d/...) or document/spreadsheet ID",
      ),
    format: z
      .enum(["markdown", "json"])
      .default("markdown")
      .describe(
        "Output format: 'markdown' (default) for formatted text with structure, 'json' for full document structure",
      ),
    range: z
      .string()
      .optional()
      .describe(
        "For spreadsheets only: Cell range to fetch (e.g., 'A1:D10', 'Sheet2!A:Z'). Defaults to the first sheet.",
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
  const { doc_id_or_url, format, range } = args;

  try {
    const contents = await getContents(auth, doc_id_or_url, format, range);
    return {
      content: [
        {
          type: "text" as const,
          text: contents,
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

const getContents = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  format: "markdown" | "json",
  range?: string,
): Promise<string> => {
  // Detect document type and extract ID
  const { id, type } = await detectDocumentType(auth, docIdOrUrl);

  if (type === "document") {
    return getDocContents(auth, id, format);
  } else if (type === "spreadsheet") {
    return getSheetContents(auth, id, format, range);
  } else {
    throw new Error("Unsupported document type");
  }
};

const detectDocumentType = async (
  auth: OAuth2Client,
  input: string,
): Promise<{ id: string; type: DocumentType }> => {
  // Try to extract from URL patterns first
  const docUrlMatch = input.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (docUrlMatch) {
    const id = docUrlMatch[1];
    if (!id) throw new Error("Invalid document URL");
    return { id, type: "document" };
  }

  const sheetUrlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetUrlMatch) {
    const id = sheetUrlMatch[1];
    if (!id) throw new Error("Invalid spreadsheet URL");
    return { id, type: "spreadsheet" };
  }

  // If it looks like an ID, use Drive API to determine type
  if (/^[a-zA-Z0-9-_]+$/.test(input)) {
    const drive = google.drive({ version: "v3", auth });

    try {
      const response = await drive.files.get({
        fileId: input,
        fields: "mimeType",
      });

      const mimeType = response.data.mimeType;
      if (mimeType === "application/vnd.google-apps.document") {
        return { id: input, type: "document" };
      } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
        return { id: input, type: "spreadsheet" };
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to detect file type: ${error.message}`);
      }
      throw error;
    }
  }

  throw new Error("Invalid document ID or URL");
};

const getDocContents = async (
  auth: OAuth2Client,
  docId: string,
  format: "markdown" | "json",
): Promise<string> => {
  const docs = google.docs({ version: "v1", auth });

  try {
    const response = await docs.documents.get({
      documentId: docId,
    });

    const doc = response.data;
    if (!doc.body?.content) {
      return format === "json" ? JSON.stringify({ content: [] }, null, 2) : "";
    }

    if (format === "json") {
      return JSON.stringify(doc, null, 2);
    }

    return convertDocToMarkdown(doc);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to get document: ${error.message}`);
    }
    throw error;
  }
};

const getSheetContents = async (
  auth: OAuth2Client,
  spreadsheetId: string,
  format: "markdown" | "json",
  range?: string,
): Promise<string> => {
  const sheets = google.sheets({ version: "v4", auth });

  try {
    // If no range specified, get the first sheet name
    let finalRange = range;
    if (!finalRange) {
      const metadataResponse = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
      });

      const firstSheet = metadataResponse.data.sheets?.[0]?.properties?.title;
      finalRange = firstSheet || "Sheet1";
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: finalRange,
    });

    const values = response.data.values || [];
    const actualRange = response.data.range || finalRange;

    if (format === "json") {
      return JSON.stringify(
        {
          spreadsheetId,
          range: actualRange,
          values,
        },
        null,
        2,
      );
    }

    return convertSheetToMarkdown(values);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to get spreadsheet: ${error.message}`);
    }
    throw error;
  }
};

const convertSheetToMarkdown = (values: string[][]): string => {
  if (values.length === 0) {
    return "*(empty spreadsheet)*";
  }

  // Find the maximum number of columns
  const maxCols = Math.max(...values.map((row) => row.length));

  // Normalize rows to have the same number of columns
  const normalizedRows = values.map((row) => {
    const normalized = [...row];
    while (normalized.length < maxCols) {
      normalized.push("");
    }
    return normalized;
  });

  let markdown = "";

  // Add header row
  if (normalizedRows.length > 0) {
    const headerRow = normalizedRows[0];
    if (headerRow) {
      markdown += `| ${headerRow.map((cell) => cell || " ").join(" | ")} |\n`;
      markdown += `| ${headerRow.map(() => "---").join(" | ")} |\n`;
    }
  }

  // Add data rows
  for (let i = 1; i < normalizedRows.length; i++) {
    const row = normalizedRows[i];
    if (row) {
      markdown += `| ${row.map((cell) => cell || " ").join(" | ")} |\n`;
    }
  }

  // Add data rows
  for (let i = 1; i < normalizedRows.length; i++) {
    const row = normalizedRows[i];
    if (row) {
      markdown += `| ${row.map((cell) => cell || " ").join(" | ")} |\n`;
    }
  }

  return markdown;
};

// Keep the existing doc conversion functions
function convertDocToMarkdown(doc: docs_v1.Schema$Document): string {
  if (!doc.body?.content) return "";

  let markdown = "";

  for (const element of doc.body.content) {
    if (element.paragraph) {
      markdown += processParagraph(element.paragraph);
    } else if (element.table) {
      markdown += processTable(element.table);
    } else if (element.sectionBreak) {
      markdown += "\n---\n\n";
    }
  }

  return markdown.trim();
}

function processParagraph(paragraph: docs_v1.Schema$Paragraph): string {
  const style = paragraph.paragraphStyle?.namedStyleType;
  let text = "";

  // Process all text elements
  for (const element of paragraph.elements || []) {
    if (element.textRun) {
      text += processTextRun(element.textRun);
    }
  }

  // Remove trailing newlines from the text content itself
  const trimmedText = text.replace(/\n+$/, "");

  // Return empty string for empty paragraphs (preserves document spacing)
  if (!trimmedText) {
    return "\n";
  }

  // Apply paragraph-level formatting based on style
  switch (style) {
    case "HEADING_1":
      return `# ${trimmedText}\n\n`;
    case "HEADING_2":
      return `## ${trimmedText}\n\n`;
    case "HEADING_3":
      return `### ${trimmedText}\n\n`;
    case "HEADING_4":
      return `#### ${trimmedText}\n\n`;
    case "HEADING_5":
      return `##### ${trimmedText}\n\n`;
    case "HEADING_6":
      return `###### ${trimmedText}\n\n`;
    case "TITLE":
      return `# ${trimmedText}\n\n`;
    case "SUBTITLE":
      return `## ${trimmedText}\n\n`;
    default: {
      // Handle lists
      const bullet = paragraph.bullet;
      if (bullet) {
        const nestingLevel = bullet.nestingLevel || 0;
        const indent = "  ".repeat(nestingLevel);

        // Use numbered list for first level, bullets for nested
        const marker = nestingLevel === 0 ? "1." : "-";

        return `${indent}${marker} ${trimmedText}\n`;
      }

      // Regular paragraph
      return `${trimmedText}\n\n`;
    }
  }
}

function processTextRun(textRun: docs_v1.Schema$TextRun): string {
  const text = textRun.content || "";
  const style = textRun.textStyle;

  if (!style) return text;

  // Don't format if it's just a newline
  if (text === "\n") return text;

  let formatted = text;

  // Apply text formatting
  if (style.bold && style.italic) {
    formatted = `***${formatted}***`;
  } else if (style.bold) {
    formatted = `**${formatted}**`;
  } else if (style.italic) {
    formatted = `*${formatted}*`;
  }

  if (style.underline) {
    formatted = `__${formatted}__`;
  }

  if (style.strikethrough) {
    formatted = `~~${formatted}~~`;
  }

  // Handle links
  if (style.link?.url) {
    formatted = `[${formatted}](${style.link.url})`;
  }

  // Handle code (monospace font)
  if (
    style.weightedFontFamily?.fontFamily?.includes("Courier") ||
    style.weightedFontFamily?.fontFamily?.includes("Mono")
  ) {
    formatted = `\`${formatted}\``;
  }

  return formatted;
}

function processTable(table: docs_v1.Schema$Table): string {
  const rows = table.tableRows || [];
  if (rows.length === 0) return "";

  let markdown = "\n";

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const cells = row.tableCells || [];

    // Build row content
    const cellContents = cells.map((cell) => {
      let cellText = "";
      for (const element of cell.content || []) {
        if (element.paragraph) {
          for (const textElement of element.paragraph.elements || []) {
            if (textElement.textRun?.content) {
              cellText += textElement.textRun.content
                .replace(/\n/g, " ")
                .trim();
            }
          }
        }
      }
      return cellText || " ";
    });

    // Add row
    markdown += `| ${cellContents.join(" | ")} |\n`;

    // Add header separator after first row
    if (i === 0) {
      markdown += `| ${cellContents.map(() => "---").join(" | ")} |\n`;
    }
  }

  markdown += "\n";
  return markdown;
}
