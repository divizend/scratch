/**
 * GSuite Utilities - Helper Functions
 *
 * Provides utility functions for Google Workspace operations.
 *
 * @module GSuiteUtils
 * @version 1.0.0
 */

import { GSuiteUser, Document, Spreadsheet, Sheet, Spreadsheets } from "..";

/**
 * Extracts a Google Drive/Docs file ID from a URL or returns the input if it's already a file ID
 *
 * Supports various Google Drive/Docs URL formats:
 * - https://drive.google.com/drive/folders/{folderId}
 * - https://drive.google.com/drive/u/0/folders/{folderId}
 * - https://docs.google.com/document/d/{fileId}/edit
 * - https://docs.google.com/document/d/{fileId}
 * - https://drive.google.com/file/d/{fileId}/view
 * - https://drive.google.com/open?id={fileId}
 * - Direct file ID or folder ID (returns as-is)
 *
 * @param urlOrId - Google Drive/Docs URL or file ID
 * @returns The extracted file ID
 * @throws Error if the URL format is not recognized
 */
export function extractFileId(urlOrId: string): string {
  // If it's already a file ID (no slashes or special characters), return as-is
  if (
    !urlOrId.includes("/") &&
    !urlOrId.includes("?") &&
    !urlOrId.includes("&")
  ) {
    return urlOrId;
  }

  // Try to extract from various URL patterns
  const patterns = [
    // drive.google.com/drive/folders/{folderId}
    // drive.google.com/drive/u/0/folders/{folderId}
    /\/folders\/([a-zA-Z0-9_-]+)/,
    // docs.google.com/document/d/{fileId}
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    // drive.google.com/file/d/{fileId}
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    // drive.google.com/open?id={fileId}
    /[?&]id=([a-zA-Z0-9_-]+)/,
    // Any URL with /d/{fileId} pattern
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = urlOrId.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // If no pattern matches, assume it's a file ID (might be invalid, but let the API handle it)
  return urlOrId;
}

/**
 * Opens a Google Doc by ID or URL
 *
 * @param gsuiteUser - GSuite user instance
 * @param documentIdOrUrl - Document ID or URL
 * @returns Promise<Document> - Opened document instance
 */
export async function openDocument(
  gsuiteUser: GSuiteUser,
  documentIdOrUrl: string
): Promise<Document> {
  const extractedId = extractFileId(documentIdOrUrl);
  const documents = gsuiteUser.documents();
  return documents.open(extractedId);
}

/**
 * Opens a spreadsheet and returns the first sheet
 *
 * @param gsuiteUser - GSuite user instance
 * @param spreadsheetIdOrUrl - Spreadsheet ID or URL
 * @returns Promise with spreadsheet and first sheet
 * @throws Error if spreadsheet has no sheets
 */
export async function openSpreadsheetFirstSheet(
  gsuiteUser: GSuiteUser,
  spreadsheetIdOrUrl: string
): Promise<{
  spreadsheet: Spreadsheet;
  sheet: Sheet;
  spreadsheets: Spreadsheets;
}> {
  const extractedId = extractFileId(spreadsheetIdOrUrl);
  const spreadsheets = gsuiteUser.spreadsheets();
  const spreadsheet = await spreadsheets.open(extractedId);
  const firstSheet = spreadsheet.sheets[0];
  if (!firstSheet) {
    throw new Error("Spreadsheet has no sheets");
  }
  return { spreadsheet, sheet: firstSheet, spreadsheets };
}
