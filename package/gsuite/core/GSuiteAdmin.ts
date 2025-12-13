/**
 * GSuiteAdmin - Google Workspace Administrative Operations
 *
 * The GSuiteAdmin class provides administrative access to Google Workspace
 * organizational settings, including domain management and user directory operations.
 *
 * This class handles:
 * - Domain listing and validation for multi-tenant organizations
 * - User directory queries for authentication and permissions
 * - Administrative operations that require elevated privileges
 *
 * All operations are performed using the Google Admin SDK Directory API
 * with the authenticated user's administrative credentials.
 *
 * @class GSuiteAdmin
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { google, admin_directory_v1 } from "googleapis";
import { JWT } from "google-auth-library";
import { Universe } from "../..";

export class GSuiteAdmin {
  /** Google Admin SDK Directory API client instance */
  private admin: admin_directory_v1.Admin;

  /**
   * Creates a new GSuiteAdmin instance
   *
   * @param universe - Reference to the central Universe instance
   * @param auth - JWT authentication with administrative privileges
   */
  constructor(private readonly universe: Universe, private auth: JWT) {
    this.admin = google.admin({ version: "directory_v1", auth: this.auth });
  }

  /**
   * Retrieves all domains associated with the organization
   *
   * This method queries the Google Admin SDK to list all domains
   * that belong to the authenticated user's organization. This is
   * essential for multi-domain organizations and user authentication.
   *
   * @returns Promise<admin_directory_v1.Schema$Domains[]> - Array of domain objects
   * @throws Error if no domains are found or the API call fails
   */
  async getDomains(): Promise<admin_directory_v1.Schema$Domains[]> {
    const response = await this.admin.domains.list({
      customer: "my_customer",
    });

    if (!response.data.domains || response.data.domains.length === 0) {
      throw new Error("No domains found");
    }

    return response.data.domains;
  }

  /**
   * Retrieves all users in the organization
   *
   * This method queries the Google Admin SDK to list all users
   * that belong to the authenticated user's organization. The user
   * list is used for authentication, permissions, and directory lookups.
   *
   * @returns Promise<admin_directory_v1.Schema$User[]> - Array of user objects
   * @throws Error if no users are found or the API call fails
   */
  async getUsers(): Promise<admin_directory_v1.Schema$User[]> {
    const response = await this.admin.users.list({
      customer: "my_customer",
    });

    if (!response.data.users || response.data.users.length === 0) {
      throw new Error("No users found");
    }

    return response.data.users;
  }
}
