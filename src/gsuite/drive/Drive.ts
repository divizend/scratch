/**
 * Drive - Google Drive Service Integration
 *
 * The Drive class provides comprehensive access to Google Drive functionality
 * including file operations, document copying, and file management. It serves
 * as the primary interface for all Drive-related operations within the system.
 *
 * Key Features:
 * - File opening and access
 * - File copying and organization
 * - Document template processing
 * - Placeholder replacement and customization
 * - Integration with other Google Workspace services
 *
 * This class enables automated workflows that require file manipulation,
 * document generation, and template-based content creation.
 *
 * @class Drive
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { google, drive_v3 } from "googleapis";
import { JWT } from "google-auth-library";
import { Universe, DriveFile, DocumentPlaceholderReplacements } from "../..";

/**
 * Parameters for copying files in Google Drive
 */
export interface CopyFileParams {
  /** ID of the source file to copy */
  sourceFileId: string;
  /** ID of the destination folder */
  destFolderId: string;
  /** Name for the new copied file */
  name: string;
}

export class Drive {
  /** Google Drive API v3 client instance */
  public readonly drive: drive_v3.Drive;

  /**
   * Creates a new Drive instance
   *
   * @param universe - Reference to the central Universe instance
   * @param auth - JWT authentication for Drive access
   */
  constructor(private readonly universe: Universe, private auth: JWT) {
    this.drive = google.drive({ version: "v3", auth: this.auth });
  }

  /**
   * Opens a file in Google Drive by ID
   *
   * This method creates a DriveFile instance that provides access
   * to the file's content, metadata, and operations.
   *
   * @param fileId - Google Drive file ID
   * @returns Promise<DriveFile> - File instance for operations
   */
  async open(fileId: string): Promise<DriveFile> {
    return DriveFile.construct(this, fileId);
  }

  /**
   * Copies a file to a new location in Google Drive
   *
   * This method creates a copy of the specified file in the destination
   * folder with the new name. The original file remains unchanged.
   *
   * @param copyFileParams - Parameters for the copy operation
   * @returns Promise<DriveFile> - Instance of the copied file
   */
  async copyFile({
    sourceFileId,
    destFolderId,
    name,
  }: CopyFileParams): Promise<DriveFile> {
    const sourceFile = await this.open(sourceFileId);
    return await sourceFile.copy(destFolderId, name);
  }

  /**
   * Copies a document and optionally processes placeholder replacements
   *
   * This method combines file copying with document processing, making
   * it ideal for template-based document generation workflows. It can
   * automatically replace placeholders in the copied document.
   *
   * @param copyFileParams - Parameters for the copy operation
   * @param replacements - Optional placeholder replacements for the document
   * @returns Promise<DriveFile> - Instance of the processed copied file
   */
  async copyDocument(
    copyFileParams: CopyFileParams,
    replacements?: DocumentPlaceholderReplacements
  ): Promise<DriveFile> {
    const newFile = await this.copyFile(copyFileParams);
    const newDocument = await newFile.asDocument();

    if (replacements) {
      await newDocument.replacePlaceholders(replacements);
    }

    return newFile;
  }

  /**
   * Gets the GSuite user associated with this Drive instance
   *
   * This provides access to other Google Workspace services
   * for the same authenticated user.
   */
  get user() {
    return this.universe.gsuite.user(this.auth.subject!);
  }
}
