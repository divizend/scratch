/**
 * Endpoint Manager - Manages Scratch endpoint definitions
 *
 * This module handles:
 * - Reading TypeScript endpoint definition files
 * - Parsing endpoint definitions from TypeScript source
 * - Registering endpoints in the Universe
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { ScratchEndpointDefinition } from "../core";

/**
 * EndpointManager - Manages endpoint definitions
 */
export class EndpointManager {
  private endpoints: Map<string, ScratchEndpointDefinition> = new Map();

  /**
   * Get all registered endpoints
   */
  getAll(): ScratchEndpointDefinition[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Get endpoint by opcode
   */
  get(opcode: string): ScratchEndpointDefinition | undefined {
    return this.endpoints.get(opcode);
  }

  /**
   * Register an endpoint with its opcode
   */
  registerWithOpcode(
    opcode: string,
    endpoint: ScratchEndpointDefinition
  ): void {
    this.endpoints.set(opcode, endpoint);
  }

  /**
   * Iterate through all TypeScript files in a directory
   */
  async iterateEndpointFiles(directoryPath: string): Promise<string[]> {
    try {
      const files = await readdir(directoryPath);
      // Filter out category files and only get individual endpoint files
      const tsFiles = files.filter(
        (f) =>
          f.endsWith(".ts") &&
          f !== "core.ts" &&
          f !== "emailQueue.ts" &&
          f !== "gsuite.ts" &&
          f !== "streamstore.ts" &&
          f !== "system.ts"
      );
      return tsFiles.map((f) => join(directoryPath, f));
    } catch (error) {
      console.error(`Failed to read directory ${directoryPath}:`, error);
      return [];
    }
  }

  /**
   * Parse a TypeScript endpoint definition from source code string
   *
   * Note: This function receives the source as a string, but we still need to import
   * the module to get the actual endpoint definition. The source string is used
   * for validation/logging purposes, but we import the module directly.
   */
  async parseEndpointFromSource(
    source: string,
    filePath: string
  ): Promise<ScratchEndpointDefinition | null> {
    try {
      // Extract the file name without extension to get the export name
      const fileName = filePath.split("/").pop()?.replace(".ts", "") || "";
      const exportName = fileName;

      // Use dynamic import to load the module
      // Convert to absolute path for import
      const absolutePath = resolve(filePath);

      // Bun can import absolute paths directly without file:// prefix
      const module = await import(absolutePath);

      // The file should export a named export with the same name as the file
      if (module[exportName]) {
        return module[exportName] as ScratchEndpointDefinition;
      }

      // Fallback: try to find any ScratchEndpointDefinition export
      for (const key in module) {
        const value = module[key];
        if (
          value &&
          typeof value === "object" &&
          "block" in value &&
          "handler" in value
        ) {
          return value as ScratchEndpointDefinition;
        }
      }

      console.warn(`No endpoint definition found in ${filePath}`);
      return null;
    } catch (error) {
      console.error(`Failed to parse endpoint from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Load and register all endpoints from a directory
   * @param directoryPath - Absolute path to the directory containing endpoint files
   */
  async loadFromDirectory(directoryPath: string): Promise<void> {
    // Ensure the path is absolute
    if (!isAbsolute(directoryPath)) {
      throw new Error(`Expected absolute path, got: ${directoryPath}`);
    }

    const filePaths = await this.iterateEndpointFiles(directoryPath);

    for (const filePath of filePaths) {
      try {
        const source = await readFile(filePath, "utf-8");
        const endpoint = await this.parseEndpointFromSource(source, filePath);
        if (endpoint) {
          // Get opcode by calling block with empty context
          const blockDef = await endpoint.block({});
          // Handle empty opcode (for root endpoint)
          const opcode = blockDef.opcode || "";
          this.registerWithOpcode(opcode, endpoint);
        }
      } catch (error) {
        console.error(`Failed to load endpoint from ${filePath}:`, error);
      }
    }
  }
}
