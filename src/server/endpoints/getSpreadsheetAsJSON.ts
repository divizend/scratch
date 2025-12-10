import { ScratchEndpointDefinition } from "../../core";
import { UniverseModule } from "../../core";
import { openSpreadsheetFirstSheet } from "../../gsuite/utils";

export const getSpreadsheetAsJSON: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getSpreadsheetAsJSON",
    blockType: "reporter",
    text: "spreadsheet as JSON from [spreadsheetId]",
    schema: {
      spreadsheetId: {
        type: "string",
        default:
          "https://docs.google.com/spreadsheets/d/1Y3uI9-Ps4HQYYYFKM7VWbayczngJXmAA6Ms3inEGIQQ/edit",
        description: "Google Sheets spreadsheet ID or URL",
      },
    },
  }),
  handler: async (context) => {
    const { spreadsheetId } = context.validatedBody!;
    const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
    const { spreadsheet, sheet, spreadsheets } =
      await openSpreadsheetFirstSheet(gsuiteUser, spreadsheetId);

    // Get all values from the sheet
    const valuesResponse = await spreadsheets.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet.id,
      range: sheet.name,
    });

    const values = valuesResponse.data.values || [];

    if (values.length === 0) {
      return JSON.stringify([]);
    }

    // First row is headers
    const headers = values[0].map((header: any) =>
      String(header || "").trim()
    );

    // Map subsequent rows to objects
    const result = values.slice(1).map((row: any[]) => {
      const obj: { [key: string]: any } = {};
      headers.forEach((header: string, index: number) => {
        // Only include non-empty headers
        if (header) {
          obj[header] =
            row[index] !== undefined && row[index] !== null
              ? String(row[index])
              : "";
        }
      });
      return obj;
    });

    return JSON.stringify(result);
  },
  requiredModules: [UniverseModule.GSuite],
};

