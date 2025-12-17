import type { OAuth2Client } from "google-auth-library";
import type { docs_v1 } from "googleapis";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_get_doc_contents",
  description:
    "Get the contents of a Google Doc in different formats. Supports markdown (default, preserves structure like headings, lists, tables, formatting) or JSON (full document structure).",
  inputSchema: z.object({
    doc_id_or_url: z
      .string()
      .describe(
        "Google Docs URL (e.g., https://docs.google.com/document/d/...) or document ID",
      ),
    format: z
      .enum(["markdown", "json"])
      .default("markdown")
      .describe(
        "Output format: 'markdown' (default) for formatted text with structure, 'json' for full document structure",
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
  const { doc_id_or_url, format } = args;

  try {
    const contents = await getDocContents(auth, doc_id_or_url, format);
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

const getDocContents = async (
  auth: OAuth2Client,
  docIdOrUrl: string,
  format: "markdown" | "json",
): Promise<string> => {
  const docId = extractDocId(docIdOrUrl);
  if (!docId) {
    throw new Error("Invalid document ID or URL");
  }

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

    return convertToMarkdown(doc);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to get document: ${error.message}`);
    }
    throw error;
  }
};

function convertToMarkdown(doc: docs_v1.Schema$Document): string {
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

function extractDocId(input: string): string | null {
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
}
