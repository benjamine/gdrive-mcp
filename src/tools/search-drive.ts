import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";

export const tool = {
  name: "gdrive_search_drive",
  description:
    "Search for files and documents across Google Drive using text query. Returns matching files with their names, IDs, types, and links.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query text. Supports Google Drive search syntax (e.g., 'type:document', 'name:report', or simple text search)",
      ),
    max_results: z
      .number()
      .min(1)
      .max(100)
      .default(10)
      .describe("Maximum number of results to return (default: 10, max: 100)"),
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
  const { query, max_results } = args;

  try {
    const results = await searchDrive(auth, query, max_results);
    return {
      content: [
        {
          type: "text" as const,
          text: results,
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

const searchDrive = async (
  auth: OAuth2Client,
  query: string,
  maxResults: number,
): Promise<string> => {
  const drive = google.drive({ version: "v3", auth });

  try {
    // Build the search query
    // If the query doesn't contain Drive-specific operators, search in name and fullText
    const searchQuery = query.includes(":")
      ? query
      : `fullText contains '${query}' or name contains '${query}'`;

    const response = await drive.files.list({
      q: searchQuery,
      pageSize: maxResults,
      fields:
        "files(id, name, mimeType, webViewLink, modifiedTime, owners, size)",
      orderBy: "modifiedTime desc",
    });

    const files = response.data.files;

    if (!files || files.length === 0) {
      return "No files found matching your query.";
    }

    // Format the results
    let output = `Found ${files.length} file(s):\n\n`;

    for (const file of files) {
      const fileType = getMimeTypeLabel(file.mimeType || "unknown");
      const modifiedDate = file.modifiedTime
        ? new Date(file.modifiedTime).toLocaleDateString()
        : "Unknown";
      const owner = file.owners?.[0]?.displayName || "Unknown";
      const size = file.size
        ? formatFileSize(Number.parseInt(file.size, 10))
        : "N/A";

      output += `📄 ${file.name}\n`;
      output += `   Type: ${fileType}\n`;
      output += `   ID: ${file.id}\n`;
      output += `   Modified: ${modifiedDate}\n`;
      output += `   Owner: ${owner}\n`;
      output += `   Size: ${size}\n`;
      output += `   Link: ${file.webViewLink}\n\n`;
    }

    return output;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to search Drive: ${error.message}`);
    }
    throw error;
  }
};

const getMimeTypeLabel = (mimeType: string): string => {
  const mimeTypeMap: Record<string, string> = {
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.form": "Google Form",
    "application/vnd.google-apps.folder": "Folder",
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "Word Document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "Excel Spreadsheet",
    "text/plain": "Text File",
    "image/jpeg": "JPEG Image",
    "image/png": "PNG Image",
  };

  return mimeTypeMap[mimeType] || mimeType;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
};
