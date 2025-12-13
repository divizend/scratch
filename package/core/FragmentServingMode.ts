/**
 * Fragment Serving Modes
 *
 * Defines the different ways in which fragment content can be served.
 * Each mode represents a different format or representation of the
 * original content, optimized for different use cases.
 *
 * @enum FragmentServingMode
 * @version 1.0.0
 * @author Divizend GmbH
 */

export enum FragmentServingMode {
  /**
   * Original content format as stored in the system
   *
   * Serves the fragment in its native format with original
   * encoding, headers, and structure preserved.
   */
  ORIGINAL = "original",

  /**
   * JSON metadata and content representation
   *
   * Provides structured access to fragment metadata, content,
   * and relationships in a machine-readable format.
   */
  JSON = "json",

  /**
   * Markdown conversion of the original content
   *
   * Converts HTML or plain text content to Markdown format
   * for easier reading and processing.
   */
  MARKDOWN = "markdown",
}
