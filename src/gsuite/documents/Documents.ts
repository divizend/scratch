/**
 * Documents - Google Docs Service Integration
 *
 * The Documents class provides access to Google Docs functionality
 * through the Google Docs API v1. It serves as the entry point for
 * all document operations within the system.
 *
 * Key Features:
 * - Document opening and access
 * - API client management and authentication
 * - Integration with other Google Workspace services
 * - Support for document editing and manipulation
 *
 * This class enables automated workflows that require document
 * generation, template processing, and content manipulation.
 *
 * @class Documents
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { google, docs_v1 } from "googleapis";
import { JWT } from "google-auth-library";
import { Universe, Document } from "../..";

export class Documents {
  /** Google Docs API v1 client instance */
  public readonly docs: docs_v1.Docs;

  /**
   * Creates a new Documents instance
   *
   * @param universe - Reference to the central Universe instance
   * @param auth - JWT authentication for Docs access
   */
  constructor(private readonly universe: Universe, private auth: JWT) {
    this.docs = google.docs({ version: "v1", auth: this.auth });
  }

  /**
   * Opens a document by ID for operations
   *
   * This method creates a Document instance that provides access
   * to the document's content, structure, and editing capabilities.
   *
   * @param documentId - Google Docs document ID
   * @returns Promise<Document> - Document instance for operations
   */
  async open(documentId: string): Promise<Document> {
    return Document.construct(this, documentId);
  }
}
