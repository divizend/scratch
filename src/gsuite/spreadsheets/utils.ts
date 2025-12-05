// Google Sheets date serials:
// Day 0 = 1899-12-30 (UTC). Fractional part = time-of-day.
const SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type YMD = readonly [year: number, month: number, day: number];

/** Returns the Google Sheets serial for a calendar DATE (no time). */
export function jsDateToSheetsSerial(input: Date | string | YMD): number {
  let y: number, m: number, d: number;

  if (input instanceof Date) {
    // Use UTC parts so local timezone/DST can't shift the day.
    y = input.getUTCFullYear();
    m = input.getUTCMonth() + 1;
    d = input.getUTCDate();
  } else if (Array.isArray(input)) {
    [y, m, d] = input;
  } else if (typeof input === "string") {
    // Accepts "YYYY_MM_DD" or "YYYY-MM-DD"
    const m1 = /^(\d{4})[-_](\d{2})[-_](\d{2})$/.exec(input);
    if (!m1) {
      throw new RangeError(
        `Unrecognized date string: "${input}". Use "YYYY-MM-DD".`
      );
    }
    y = Number(m1[1]);
    m = Number(m1[2]);
    d = Number(m1[3]);
  } else {
    // Should be unreachable due to the signature, but keeps TS happy in looser configs.
    throw new TypeError("Unsupported input for jsDateToSheetsSerial()");
  }

  // Build UTC midnight of the intended calendar date.
  const utcMidnightMs = Date.UTC(y, m - 1, d);

  // Validate (catches impossible dates like 1900-02-29).
  const check = new Date(utcMidnightMs);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    const pad = (n: number) => String(n).padStart(2, "0");
    throw new RangeError(`Invalid calendar date: ${y}-${pad(m)}-${pad(d)}`);
  }

  // Exact day count since 1899-12-30. Round to kill any FP dust.
  const serial = (utcMidnightMs - SHEETS_EPOCH_UTC_MS) / MS_PER_DAY;
  return Math.round(serial);
}
