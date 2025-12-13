/**
 * GmailLabel - Email Label Management
 *
 * The GmailLabel class represents a Gmail label (category) that can be used
 * to organize and filter emails. Labels provide a way to categorize messages
 * beyond the standard Gmail folders like Inbox, Sent, and Trash.
 *
 * Labels can be:
 * - System labels (Inbox, Sent, Drafts, etc.)
 * - User-created labels for custom organization
 * - Nested labels for hierarchical organization
 *
 * This class provides a simple interface for accessing label properties
 * and integrating with the broader Gmail management system.
 *
 * @class GmailLabel
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { gmail_v1 } from "googleapis";
import { Gmail } from "../..";

export class GmailLabel {
  /**
   * Creates a new GmailLabel instance
   *
   * @param gmail - Reference to the Gmail service instance
   * @param label - Raw Gmail API label data
   */
  constructor(
    private readonly gmail: Gmail,
    public readonly label: gmail_v1.Schema$Label
  ) {}

  /**
   * Gets the display name of the label
   *
   * This is the human-readable name that appears in the Gmail interface
   * and is used for filtering and organization.
   */
  get name() {
    return this.label.name;
  }

  /**
   * Gets the unique identifier for the label
   *
   * The label ID is used internally by Gmail for API operations
   * and should not be displayed to users.
   */
  get id() {
    return this.label.id;
  }
}
