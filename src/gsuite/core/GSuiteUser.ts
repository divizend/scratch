/**
 * GSuiteUser - Google Workspace Service Facade
 *
 * The GSuiteUser class provides a unified interface for accessing all Google Workspace
 * services on behalf of a specific user. It acts as a facade that simplifies access
 * to Gmail, Google Drive, Google Sheets, Google Docs, and administrative functions.
 *
 * Each GSuiteUser instance is configured with:
 * - JWT authentication for the specific user
 * - User directory data for permissions and metadata
 * - Access to all Google Workspace APIs through service-specific classes
 *
 * This class implements the Facade pattern, hiding the complexity of individual
 * Google Workspace APIs behind a simple, consistent interface.
 *
 * @class GSuiteUser
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { JWT } from "google-auth-library";
import { admin_directory_v1 } from "googleapis";
import {
  Documents,
  Drive,
  GSuiteAdmin,
  Gmail,
  Spreadsheets,
  Universe,
} from "../..";

export class GSuiteUser {
  /**
   * Creates a new GSuiteUser instance
   *
   * @param universe - Reference to the central Universe instance
   * @param auth - JWT authentication for the specific user
   * @param directoryData - User directory information and metadata
   */
  constructor(
    private readonly universe: Universe,
    public readonly auth: JWT,
    public readonly directoryData: admin_directory_v1.Schema$User
  ) {}

  /**
   * Provides access to Google Workspace administrative functions
   *
   * Returns a GSuiteAdmin instance that can perform administrative
   * operations like managing users, domains, and organizational settings.
   *
   * @returns GSuiteAdmin instance for administrative operations
   */
  admin(): GSuiteAdmin {
    return new GSuiteAdmin(this.universe, this.auth);
  }

  /**
   * Provides access to Google Docs services
   *
   * Returns a Documents instance that can create, read, update,
   * and delete Google Docs documents programmatically.
   *
   * @returns Documents instance for Google Docs operations
   */
  documents(): Documents {
    return new Documents(this.universe, this.auth);
  }

  /**
   * Provides access to Google Drive services
   *
   * Returns a Drive instance that can manage files and folders,
   * handle file uploads/downloads, and manage sharing permissions.
   *
   * @returns Drive instance for Google Drive operations
   */
  drive(): Drive {
    return new Drive(this.universe, this.auth);
  }

  /**
   * Provides access to Gmail services
   *
   * Returns a Gmail instance that can read emails, send messages,
   * manage labels, and handle email processing workflows.
   *
   * @returns Gmail instance for Gmail operations
   */
  gmail(): Gmail {
    return new Gmail(this.universe, this.auth);
  }

  /**
   * Provides access to Google Sheets services
   *
   * Returns a Spreadsheets instance that can read/write spreadsheet
   * data, manage sheets, and perform data analysis operations.
   *
   * @returns Spreadsheets instance for Google Sheets operations
   */
  spreadsheets(): Spreadsheets {
    return new Spreadsheets(this.universe, this.auth);
  }

  /**
   * The email address of the authenticated user
   *
   * This property provides convenient access to the user's email
   * address for use in API calls and logging.
   */
  get email() {
    return this.auth.subject;
  }
}
