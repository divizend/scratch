/**
 * Fragment - Content Abstraction Interface
 *
 * The Fragment interface represents the fundamental abstraction for all content
 * types in the AI Executive system. It provides a unified way to handle
 * different types of content (emails, documents, attachments, etc.) through
 * a common interface.
 *
 * Fragments support multiple serving modes and can be processed, analyzed,
 * and transformed while maintaining their original structure and metadata.
 *
 * @interface Fragment
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { FragmentServingMode } from "./FragmentServingMode";

export interface Fragment {
  /**
   * Unique identifier for this fragment
   *
   * The URI provides a standardized way to reference and locate
   * the fragment within the system, regardless of its content type.
   */
  readonly uri: string;

  /**
   * Serves the fragment content in the specified format
   *
   * This method handles the transformation and delivery of fragment content
   * based on the requested serving mode. It ensures proper content type
   * headers and data formatting for different use cases.
   *
   * @param format - The desired serving mode (original, markdown, JSON, etc.)
   * @returns Promise containing headers and data for the served content
   * @throws Error if the serving mode is not supported or content processing fails
   */
  serve(format: FragmentServingMode): Promise<{
    headers: { name: string; value: string }[];
    data: Buffer;
  }>;
}
