import { sheets_v4 } from "googleapis";
import { jsDateToSheetsSerial } from "./utils";

export enum CellFormat {
  Date_de = "Date_de",
  Currency_EUR_de = "Currency_EUR_de",
  RightAligned = "RightAligned",
}

const CellFormats: { [key in CellFormat]: sheets_v4.Schema$CellFormat } = {
  [CellFormat.Date_de]: {
    numberFormat: {
      type: "DATE",
      pattern: "dd.mm.yyyy",
    },
  },
  [CellFormat.Currency_EUR_de]: {
    numberFormat: {
      type: "CURRENCY",
      pattern: "#,##0.00 €",
    },
  },
  [CellFormat.RightAligned]: {
    horizontalAlignment: "RIGHT",
  },
};

function isDateCellFormat(
  format: CellFormat | CellFormat[] | undefined
): boolean {
  if (Array.isArray(format)) {
    return format.some((f) => isDateCellFormat(f));
  }
  return format === CellFormat.Date_de;
}

export type CellValue =
  | string
  | number
  | { value: any; format?: CellFormat | CellFormat[] };

export function transformCellValueForSheets(
  value: CellValue
): sheets_v4.Schema$CellData {
  const newCell: sheets_v4.Schema$CellData = {};
  if (typeof value === "string") {
    newCell.userEnteredValue = { stringValue: value };
  } else if (typeof value === "number") {
    newCell.userEnteredValue = { numberValue: value };
  } else if (typeof value === "object") {
    if (isDateCellFormat(value.format)) {
      newCell.userEnteredValue = {
        numberValue: jsDateToSheetsSerial(value.value),
      };
    } else if (typeof value.value === "string") {
      newCell.userEnteredValue = { stringValue: value.value };
    } else if (typeof value.value === "number") {
      newCell.userEnteredValue = { numberValue: value.value };
    }

    if (Array.isArray(value.format)) {
      newCell.userEnteredFormat = Object.assign(
        {},
        ...value.format.map((f) => CellFormats[f])
      );
    } else if (value.format) {
      newCell.userEnteredFormat = CellFormats[value.format];
    }
  }
  return newCell;
}
