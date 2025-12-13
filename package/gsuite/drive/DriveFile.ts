/**
 * DriveFile - Individual Google Drive File Operations
 *
 * The DriveFile class represents a single file in Google Drive and provides
 * methods for file-specific operations including copying, conversion, and
 * integration with other Google Workspace services.
 *
 * Key Features:
 * - File metadata access and manipulation
 * - File copying and organization
 * - PDF export and conversion
 * - Document integration and processing
 * - Cross-service file operations
 *
 * This class serves as the primary interface for working with individual
 * files in Google Drive, enabling complex file workflows and automation.
 *
 * @class DriveFile
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { drive_v3 } from "googleapis";
import { Drive, Document } from "../..";

export class DriveFile {
  /**
   * Creates a new DriveFile instance
   *
   * @param drive - Reference to the Drive service instance
   * @param file - Raw Google Drive API file data
   */
  constructor(
    private readonly drive: Drive,
    public readonly file: drive_v3.Schema$File
  ) {}

  /**
   * Constructs a DriveFile instance from a file ID
   *
   * This factory method fetches the file metadata from Google Drive
   * and creates a DriveFile instance ready for operations.
   *
   * @param drive - Drive service instance
   * @param fileId - Google Drive file ID
   * @returns Promise<DriveFile> - Initialized file instance
   */
  static async construct(drive: Drive, fileId: string) {
    const file = await drive.drive.files.get({
      fileId,
      supportsAllDrives: true,
    });
    return new DriveFile(drive, file.data);
  }

  /**
   * Gets the unique identifier for this file
   *
   * The file ID is used for all Google Drive API operations
   * and can be used to reference this file in other services.
   */
  get id(): string {
    return this.file.id!;
  }

  /**
   * Copies this file to a new location in Google Drive
   *
   * This method creates a copy of the current file in the specified
   * destination folder with the new name. The original file remains
   * unchanged and accessible.
   *
   * @param destFolderId - ID of the destination folder
   * @param name - Name for the copied file
   * @returns Promise<DriveFile> - Instance of the copied file
   */
  async copy(destFolderId: string, name: string) {
    return DriveFile.construct(
      this.drive,
      (
        await this.drive.drive.files.copy({
          fileId: this.id,
          supportsAllDrives: true,
          requestBody: { name, parents: [destFolderId] },
        })
      ).data.id!
    );
  }

  /**
   * Opens this file as a Google Document for editing
   *
   * This method provides access to the document editing capabilities
   * of Google Docs, enabling content manipulation and placeholder
   * replacement operations.
   *
   * @returns Promise<Document> - Document instance for editing
   */
  async asDocument(): Promise<Document> {
    return this.drive.user.documents().open(this.id);
  }

  /**
   * Exports this file as a PDF document
   *
   * This method converts the file to PDF format and returns the
   * content as a Buffer. Useful for creating downloadable versions
   * or email attachments.
   *
   * @returns Promise<Buffer> - PDF content as a buffer
   */
  async pdf(): Promise<Buffer> {
    return Buffer.from(
      (
        await this.drive.drive.files.export(
          {
            fileId: this.id,
            mimeType: "application/pdf",
          },
          { responseType: "arraybuffer" }
        )
      ).data as any
    );
  }

  async download(): Promise<Buffer> {
    const file = (
      await this.drive.drive.files.get(
        {
          fileId: this.id,
          alt: "media",
        },
        { responseType: "stream" }
      )
    ).data;
    const chunks: Buffer[] = [];
    for await (const chunk of file) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async text(): Promise<string> {
    const download = await this.download();
    return download.toString("utf8");
  }
}
