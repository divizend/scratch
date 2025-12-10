import {
  ScratchEndpointDefinition,
  UniverseModule,
  openSpreadsheetFirstSheet,
} from "../src";

export const getSpreadsheetRow: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getSpreadsheetRow",
    blockType: "reporter",
    text: "all values from row [row] in spreadsheet [spreadsheetId]",
    schema: {
      row: {
        type: "string",
        default: "1",
        description: "Row number (e.g., 1, 2, 3)",
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
    const { row, spreadsheetId } = context.inputs!;
    const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
    const { spreadsheet, sheet, spreadsheets } =
      await openSpreadsheetFirstSheet(gsuiteUser, spreadsheetId);
    const valuesResponse = await spreadsheets.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet.id,
      range: `${sheet.name}!${row}:${row}`,
    });
    const values = valuesResponse.data.values || [];
    return (values[0] || [])
      .map((val) => (val ? String(val) : ""))
      .filter((val) => val !== "");
  },
  requiredModules: [UniverseModule.GSuite],
};
