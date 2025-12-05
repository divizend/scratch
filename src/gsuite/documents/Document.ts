/**
 * Document - Individual Google Document Operations
 *
 * The Document class represents a single Google Docs document and provides
 * methods for content manipulation, placeholder replacement, and document
 * editing operations.
 *
 * Key Features:
 * - Document metadata and properties access
 * - Placeholder text replacement and customization
 * - Batch update operations for efficiency
 * - Integration with Google Docs API
 *
 * This class enables automated document generation workflows by providing
 * programmatic access to document content and editing capabilities.
 *
 * @class Document
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { docs_v1 } from "googleapis";
import { Documents } from ".";

/**
 * Mapping of placeholder keys to replacement values
 *
 * This type defines the structure for placeholder replacement operations,
 * where keys represent placeholder text (e.g., "{{DATE}}") and values
 * represent the content to replace them with.
 */
export type DocumentPlaceholderReplacements = { [key: string]: string };

export class Document {
  /**
   * Creates a new Document instance
   *
   * @param docs - Reference to the Documents service instance
   * @param document - Raw Google Docs API document data
   */
  constructor(
    private readonly docs: Documents,
    public readonly document: docs_v1.Schema$Document
  ) {}

  /**
   * Constructs a Document instance from a document ID
   *
   * This factory method fetches the document content from Google Docs
   * and creates a Document instance ready for operations.
   *
   * @param docs - Documents service instance
   * @param documentId - Google Docs document ID
   * @returns Promise<Document> - Initialized document instance
   */
  static async construct(docs: Documents, documentId: string) {
    const document = await docs.docs.documents.get({ documentId });
    return new Document(docs, document.data);
  }

  /**
   * Gets the unique identifier for this document
   *
   * The document ID is used for all Google Docs API operations
   * and can be used to reference this document in other services.
   */
  get id(): string {
    return this.document.documentId!;
  }

  /**
   * Replaces placeholder text in the document with specified values
   *
   * This method performs batch replacement of placeholder text (e.g., "{{DATE}}")
   * with actual values. It's commonly used in template-based document
   * generation workflows to customize document content automatically.
   *
   * The method uses the Google Docs batchUpdate API for efficiency,
   * processing all replacements in a single API call.
   *
   * @param replacements - Object mapping placeholder keys to replacement values
   * @returns Promise containing the batch update response
   * @throws Error if the batch update operation fails
   */
  async replacePlaceholders(replacements: DocumentPlaceholderReplacements) {
    return this.docs.docs.documents.batchUpdate({
      documentId: this.id,
      requestBody: {
        requests: Object.entries(replacements).map(([key, value]) => ({
          replaceAllText: {
            containsText: { text: `{{${key}}}`, matchCase: true },
            replaceText: value,
          },
        })),
      },
    });
  }
}
