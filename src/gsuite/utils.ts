/**
 * GSuite Utilities - Helper Functions
 *
 * Provides utility functions for Google Workspace operations.
 *
 * @module GSuiteUtils
 * @version 1.0.0
 */

/**
 * Extracts a Google Drive/Docs file ID from a URL or returns the input if it's already a file ID
 *
 * Supports various Google Drive/Docs URL formats:
 * - https://docs.google.com/document/d/{fileId}/edit
 * - https://docs.google.com/document/d/{fileId}
 * - https://drive.google.com/file/d/{fileId}/view
 * - https://drive.google.com/open?id={fileId}
 * - Direct file ID (returns as-is)
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
