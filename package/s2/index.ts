/**
 * S2 Module - Streamstore Service Adapter
 *
 * This module provides an adapter for the S2 streamstore service.
 *
 * @module S2
 * @version 1.0.0
 * @author Divizend GmbH
 */

console.log("[@divizend/scratch-core/s2] Loading s2/index.ts");
console.log("[@divizend/scratch-core/s2] import.meta.url:", import.meta.url);

console.log("[@divizend/scratch-core/s2] Exporting from ./S2");
export * from "./S2";

// After export, check what's actually exported
(async () => {
  try {
    console.log("[@divizend/scratch-core/s2] Importing from ./S2 to verify");
    const s2File = await import("./S2");
    console.log("[@divizend/scratch-core/s2] S2.ts module keys:", Object.keys(s2File));
    console.log("[@divizend/scratch-core/s2] S2 class exists:", "S2" in s2File);
    console.log("[@divizend/scratch-core/s2] S2ReadResult exists:", "S2ReadResult" in s2File);
    console.log("[@divizend/scratch-core/s2] Successfully verified ./S2 exports");
  } catch (e) {
    console.error("[@divizend/scratch-core/s2] Error verifying ./S2:", e);
    console.error("[@divizend/scratch-core/s2] Error stack:", e instanceof Error ? e.stack : String(e));
  }
})();
