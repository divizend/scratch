import {
  ScratchEndpointDefinition,
  UniverseModule,
  openSpreadsheetFirstSheet,
} from "../src";

export const getSpreadsheetColumn: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getSpreadsheetColumn",
    blockType: "reporter",
    text: "all values from column [column] in spreadsheet [spreadsheetId]",
    schema: {
      column: {
        type: "string",
        default: "A",
        description: "Column letter (e.g., A, B, C)",
      },
      spreadsheetId: {
        type: "string",
        default:
          "https://docs.google.com/spreadsheets/d/1Y3uI9-Ps4HQYYYFKM7VWbayczngJXmAA6Ms3inEGIQQ/edit",
        description: "Google Sheets spreadsheet ID or URL",
      },
    },
  }),
  handler: async (context) => {
    const { column, spreadsheetId } = context.validatedBody!;
    const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
    const { spreadsheet, sheet, spreadsheets } =
      await openSpreadsheetFirstSheet(gsuiteUser, spreadsheetId);
    const valuesResponse = await spreadsheets.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet.id,
      range: `${sheet.name}!${column}:${column}`,
    });
    const values = valuesResponse.data.values || [];
    return values
      .map((row) => (row && row[0] ? row[0] : ""))
      .filter((val) => val !== "");
  },
  requiredModules: [UniverseModule.GSuite],
};
