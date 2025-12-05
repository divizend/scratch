/**
 * Sheet - Individual Sheet Operations and Data Management
 *
 * The Sheet class represents a single sheet within a Google Sheets
 * spreadsheet and provides methods for data access, manipulation,
 * and operations on sheet content.
 *
 * Key Features:
 * - Sheet metadata and properties access
 * - Range-based data retrieval
 * - Column-specific operations
 * - Row appending and data insertion
 * - Integration with Google Sheets API
 *
 * This class enables fine-grained control over individual sheets,
 * supporting complex data operations and workflow automation.
 *
 * @class Sheet
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { sheets_v4 } from "googleapis";
import {
  Spreadsheet,
  CellValue,
  transformCellValueForSheets,
  SheetValues,
} from "../..";

export class Sheet {
  /**
   * Creates a new Sheet instance
   *
   * @param spreadsheet - Reference to the parent Spreadsheet instance
   * @param sheet - Raw Google Sheets API sheet data
   */
  constructor(
    private readonly spreadsheet: Spreadsheet,
    public readonly sheet: sheets_v4.Schema$Sheet
  ) {}

  /**
   * Gets the display name of the sheet
   *
   * This is the name that appears on the sheet tab in Google Sheets
   * and is used for range references and sheet identification.
   */
  get name() {
    return this.sheet.properties!.title!;
  }

  /**
   * Gets the unique identifier for the sheet
   *
   * The sheet ID is used internally by Google Sheets for API operations
   * and should not be displayed to users.
   */
  get id() {
    return this.sheet.properties!.sheetId!;
  }

  /**
   * Retrieves values from a specified range in the sheet
   *
   * This method fetches data from the Google Sheets API for the
   * specified range and returns it as a SheetValues instance for
   * further processing and manipulation.
   *
   * @param range - A1 notation range (e.g., "A1:B10", "C:C")
   * @returns Promise<SheetValues> - Values from the specified range
   * @throws Error if no values are found for the range
   */
  async getValues(range: string) {
    const values = (
      await this.spreadsheet.spreadsheets.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheet.id,
        range: `${this.name}!${range}`,
      })
    ).data.values;

    if (!values) {
      throw new Error(`No values found for range ${range}`);
    }

    return new SheetValues(this, values);
  }

  /**
   * Retrieves all values from a specific column
   *
   * This method provides convenient access to column data by
   * specifying just the column letter (e.g., "A", "B", "C").
   *
   * @param column - Column letter to retrieve
   * @returns Promise<SheetValues> - All values from the specified column
   */
  async getColumn(column: string) {
    return this.getValues(`${column}:${column}`);
  }

  /**
   * Appends a new row of data to the sheet
   *
   * This method adds a new row at the bottom of the sheet with
   * the specified values. The values are automatically formatted
   * according to their CellValue specifications.
   *
   * @param values - Array of CellValue objects to append
   * @throws Error if the append operation fails
   */
  async appendRow(values: CellValue[]) {
    await this.spreadsheet.spreadsheets.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheet.id,
      requestBody: {
        requests: [
          {
            appendCells: {
              sheetId: this.id,
              rows: [{ values: values.map(transformCellValueForSheets) }],
              fields: "*",
            },
          },
        ],
      },
    });
  }
}
