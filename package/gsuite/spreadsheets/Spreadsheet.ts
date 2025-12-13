/**
 * Spreadsheet - Individual Spreadsheet Management
 *
 * The Spreadsheet class represents a single Google Sheets spreadsheet
 * and provides access to its individual sheets and operations. It serves
 * as the primary interface for working with spreadsheet content.
 *
 * Key Features:
 * - Sheet access and management
 * - Spreadsheet metadata and properties
 * - Sheet-by-name lookup and access
 * - Integration with Google Sheets API
 *
 * This class enables operations on individual spreadsheets, providing
 * access to their sheets and data for processing and manipulation.
 *
 * @class Spreadsheet
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { sheets_v4 } from "googleapis";
import { Sheet, Spreadsheets } from "../..";

export class Spreadsheet {
  /** Array of Sheet instances for all sheets in the spreadsheet */
  public readonly sheets: Sheet[];

  /**
   * Creates a new Spreadsheet instance
   *
   * @param spreadsheets - Reference to the Spreadsheets service
   * @param id - Google Sheets spreadsheet ID
   * @param sheetsRaw - Raw sheet data from the API
   */
  constructor(
    public readonly spreadsheets: Spreadsheets,
    public readonly id: string,
    sheetsRaw: sheets_v4.Schema$Sheet[]
  ) {
    // Create Sheet instances for all sheets in the spreadsheet
    this.sheets = sheetsRaw.map((s) => new Sheet(this, s));
  }

  /**
   * Constructs a Spreadsheet instance from a spreadsheet ID
   *
   * This factory method fetches the spreadsheet metadata and creates
   * Sheet instances for all sheets within the spreadsheet.
   *
   * @param spreadsheets - Spreadsheets service instance
   * @param spreadsheetId - Google Sheets spreadsheet ID
   * @returns Promise<Spreadsheet> - Initialized spreadsheet instance
   */
  static async construct(spreadsheets: Spreadsheets, spreadsheetId: string) {
    const sheetsRaw = await spreadsheets.sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    });
    return new Spreadsheet(spreadsheets, spreadsheetId, sheetsRaw.data.sheets!);
  }

  /**
   * Gets a sheet by name from the spreadsheet
   *
   * This method provides convenient access to individual sheets
   * within the spreadsheet for data operations and manipulation.
   *
   * @param name - Name of the sheet to retrieve
   * @returns Promise<Sheet> - Sheet instance for the specified name
   * @throws Error if the sheet is not found
   */
  async getSheet(name: string): Promise<Sheet> {
    return this.sheets.find((s) => s.name === name)!;
  }
}
