/**
 * Spreadsheets - Google Sheets Service Integration
 *
 * The Spreadsheets class provides access to Google Sheets functionality
 * through the Google Sheets API v4. It serves as the entry point for
 * all spreadsheet operations within the system.
 *
 * Key Features:
 * - Spreadsheet opening and access
 * - API client management and authentication
 * - Integration with other Google Workspace services
 * - Support for complex spreadsheet operations
 *
 * This class enables automated workflows that require spreadsheet
 * data processing, financial calculations, and data organization.
 *
 * @class Spreadsheets
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { google, sheets_v4 } from "googleapis";
import { JWT } from "google-auth-library";
import { Universe, Spreadsheet } from "../..";

export class Spreadsheets {
  /** Google Sheets API v4 client instance */
  public readonly sheets: sheets_v4.Sheets;

  /**
   * Creates a new Spreadsheets instance
   *
   * @param universe - Reference to the central Universe instance
   * @param auth - JWT authentication for Sheets access
   */
  constructor(private readonly universe: Universe, private auth: JWT) {
    this.sheets = google.sheets({ version: "v4", auth: this.auth });
  }

  /**
   * Opens a spreadsheet by ID for operations
   *
   * This method creates a Spreadsheet instance that provides access
   * to the spreadsheet's sheets, data, and operations.
   *
   * @param spreadsheetId - Google Sheets spreadsheet ID
   * @returns Promise<Spreadsheet> - Spreadsheet instance for operations
   */
  async open(spreadsheetId: string): Promise<Spreadsheet> {
    return Spreadsheet.construct(this, spreadsheetId);
  }
}
