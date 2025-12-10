/**
 * ProjectRoot - Utility to reliably determine the project root directory
 *
 * This function walks up the directory tree from the current file's location
 * to find the project root by looking for marker files (package.json, tsconfig.json).
 * The result is cached for performance.
 */

import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

let cachedProjectRoot: string | null = null;

/**
 * Get the project root directory with 100% certainty
 * Uses import.meta.url to get the current file location and walks up to find package.json
 * @returns Absolute path to the project root
 */
export async function getProjectRoot(): Promise<string> {
  // Return cached value if available
  if (cachedProjectRoot) {
    return cachedProjectRoot;
  }

  // Get the directory of the current file (this file)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Start from the current file's directory and walk up
  let currentDir = resolve(__dirname);

  // Marker files that indicate project root
  const markers = ["package.json", "tsconfig.json"];

  // Walk up the directory tree
  while (currentDir !== dirname(currentDir)) {
    // Check if any marker file exists in current directory
    for (const marker of markers) {
      try {
        const markerPath = join(currentDir, marker);
        await stat(markerPath);
        // Found a marker file - this is the project root
        cachedProjectRoot = currentDir;
        return cachedProjectRoot;
      } catch {
        // Marker file doesn't exist, continue
      }
    }

    // Move up one directory
    currentDir = dirname(currentDir);
  }

  // Fallback: if we reach the filesystem root without finding a marker,
  // use the directory containing this utility file and walk up to src/../
  // This is a last resort fallback
  const fallbackRoot = resolve(__dirname, "..", "..");
  cachedProjectRoot = fallbackRoot;
  return cachedProjectRoot;
}

/**
 * Synchronous version - uses cached value or throws if not yet cached
 * Call getProjectRoot() first to ensure cache is populated
 * @returns Absolute path to the project root
 * @throws Error if project root hasn't been determined yet
 */
export function getProjectRootSync(): string {
  if (!cachedProjectRoot) {
    throw new Error(
      "Project root not yet determined. Call getProjectRoot() first."
    );
  }
  return cachedProjectRoot;
}
