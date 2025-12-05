import { Sheet } from "../..";

export class SheetValues {
  constructor(
    private readonly sheet: Sheet,
    private readonly values: any[][]
  ) {}

  last() {
    return this.values.slice(-1)[0]![0];
  }
}
