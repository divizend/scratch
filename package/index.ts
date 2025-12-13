/**
 * AI Executive - Intelligent Email Management and Processing System
 *
 * This is the main entry point for the AI Executive system, which provides:
 * - Gmail integration with advanced email processing capabilities
 * - AI-powered email analysis and response generation
 * - Workflow automation for business processes
 * - Database management for email fragments and metadata
 *
 * The system is designed to handle enterprise-scale email management
 * with intelligent automation and AI assistance.
 *
 * @module AI Executive
 * @version 1.0.0
 * @author Divizend GmbH
 */

console.log("[@divizend/scratch-core] Loading package/index.ts");
console.log("[@divizend/scratch-core] import.meta.url:", import.meta.url);
console.log(
  "[@divizend/scratch-core] import.meta.dirname:",
  import.meta.dirname
);

console.log("[@divizend/scratch-core] Exporting from ./basic");
export * from "./basic";

console.log("[@divizend/scratch-core] Exporting from ./core");
export * from "./core";

console.log("[@divizend/scratch-core] Exporting from ./gsuite");
export * from "./gsuite";

console.log("[@divizend/scratch-core] Exporting from ./http-server");
export * from "./http-server";

console.log("[@divizend/scratch-core] Exporting from ./resend");
export * from "./resend";

console.log("[@divizend/scratch-core] Exporting from ./s2");
export * from "./s2";

console.log("[@divizend/scratch-core] Exporting from ./queue");
export * from "./queue";

// After exports, check what's actually exported
(async () => {
  try {
    const s2Module = await import("./s2");
    console.log(
      "[@divizend/scratch-core] s2 module keys:",
      Object.keys(s2Module)
    );
    console.log(
      "[@divizend/scratch-core] S2 class in s2 module:",
      "S2" in s2Module
    );
    console.log(
      "[@divizend/scratch-core] S2ReadResult in s2 module:",
      "S2ReadResult" in s2Module
    );
  } catch (e) {
    console.error("[@divizend/scratch-core] Error checking s2 module:", e);
  }
})();

console.log("[@divizend/scratch-core] Finished loading package/index.ts");
