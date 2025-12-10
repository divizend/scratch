import {
  ScratchEndpointDefinition,
  UniverseModule,
  openSpreadsheetFirstSheet,
} from "../src";

export const getSpreadsheetCell: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getSpreadsheetCell",
    blockType: "reporter",
    text: "value from cell [cell] in spreadsheet [spreadsheetId]",
    schema: {
      cell: {
        type: "string",
        default: "A1",
        description: "Cell reference (e.g., A1, B2, C3)",
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
    const { cell, spreadsheetId } = context.inputs!;
    const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
    const { spreadsheet, sheet, spreadsheets } =
      await openSpreadsheetFirstSheet(gsuiteUser, spreadsheetId);
    const valuesResponse = await spreadsheets.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet.id,
      range: `${sheet.name}!${cell}`,
    });
    const values = valuesResponse.data.values;
    if (values && values.length > 0 && values[0] && values[0][0]) {
      return String(values[0][0]);
    }
    return "";
  },
  requiredModules: [UniverseModule.GSuite],
};
