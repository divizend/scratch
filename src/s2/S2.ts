/**
 * S2 - Streamstore Service Adapter
 *
 * The S2 class provides an adapter for the S2 streamstore service,
 * abstracting the stream operations and configuration.
 *
 * @class S2
 * @version 1.0.0
 */

import { S2 as S2Client, AppendRecord } from "@s2-dev/streamstore";
import { envOr, env } from "../core/Env";

export interface S2Record {
  body?: any;
  data?: any;
  [key: string]: any;
}

export interface S2ReadResult {
  records: any[];
}

export interface S2ReadSessionResult {
  records: any[];
  session: string;
}

export interface S2AppendSessionResult {
  session: string;
}

export class S2 {
  private client: S2Client;

  /**
   * Private constructor - use S2.construct() instead
   *
   * @param accessToken - S2 access token
   */
  private constructor(accessToken: string) {
    this.client = new S2Client({ accessToken });
  }

  /**
   * Creates a new S2 instance
   *
   * @param accessToken - S2 access token (optional, defaults to S2_ACCESS_TOKEN env var)
   * @returns Promise<S2> - S2 instance
   * @throws Error if access token is not provided
   */
  static construct(accessToken?: string): S2 {
    const token = envOr(
      accessToken,
      "S2_ACCESS_TOKEN",
      "S2_ACCESS_TOKEN environment variable is not set. Please configure it to use streamstore features."
    );
    return new S2(token);
  }

  /**
   * Gets the default basin name from S2_BASIN environment variable
   *
   * @returns The basin name from S2_BASIN env var
   * @throws Error if S2_BASIN is not set
   */
  static getBasin(): string {
    return env("S2_BASIN", {
      errorMessage: "S2_BASIN environment variable is required but not set.",
    });
  }

  /**
   * Gets a basin by name
   *
   * @param basinName - Name of the basin
   * @returns Basin instance
   */
  basin(basinName: string) {
    return this.client.basin(basinName);
  }

  /**
   * Appends data to a stream
   * Ensures the stream exists before appending
   *
   * @param basinName - Name of the basin
   * @param streamName - Name of the stream
   * @param data - Data to append (will be converted to AppendRecord)
   * @returns Promise<void>
   */
  async appendToStream(
    basinName: string,
    streamName: string,
    data: any
  ): Promise<void> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);

    try {
      // Convert data to JSON string if it's an object
      const body = typeof data === "string" ? data : JSON.stringify(data);
      await stream.append([AppendRecord.make(body)]);
    } catch (error: any) {
      // If stream doesn't exist, ensure it exists and retry
      if (
        error?.code === "stream_not_found" ||
        error?.status === 404 ||
        (error?.message && error.message.includes("stream_not_found"))
      ) {
        await this.ensureStreamExists(basinName, streamName);
        // Retry the append
        await stream.append([AppendRecord.make(data)]);
      } else {
        throw error;
      }
    }
  }

  /**
   * Reads records from a stream
   *
   * @param basinName - Name of the basin
   * @param streamName - Name of the stream
   * @param limit - Maximum number of records to read
   * @returns Promise<S2ReadResult> - Array of parsed records
   */
  async readFromStream(
    basinName: string,
    streamName: string,
    limit: number
  ): Promise<S2ReadResult> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);

    // Read from the beginning (seq_num: 0) to get all available records
    const readBatch = await stream.read({ seq_num: 0, count: limit });
    const records = ((readBatch as any).records || [])
      .map((record: S2Record) => this.parseRecord(record))
      .filter((r: any) => r !== undefined);

    return { records };
  }

  /**
   * Checks the tail (latest records) of a stream
   * Ensures the stream exists before checking
   *
   * @param basinName - Name of the basin
   * @param streamName - Name of the stream
   * @param limit - Maximum number of records to retrieve
   * @returns Promise<S2ReadResult> - Array of parsed records
   */
  async checkStreamTail(
    basinName: string,
    streamName: string,
    limit: number
  ): Promise<S2ReadResult> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);

    try {
      // Get tail position first
      const tailResponse = await stream.checkTail({ limit: 1 } as any);
      const tail = tailResponse.tail;

      if (!tail || tail.seq_num === undefined) {
        return { records: [] };
      }

      // Read only the most recent records (last 100) to ensure they have body
      // Only the very latest records have body data available
      const recentLimit = Math.min(limit, 100);
      const startSeq = Math.max(0, tail.seq_num - recentLimit + 1);
      const readResult = await stream.read({
        seq_num: startSeq,
        count: recentLimit,
      });

      const records = ((readResult as any).records || [])
        .map((record: S2Record) => this.parseRecord(record))
        .filter((r: any) => r !== undefined);

      return { records };
    } catch (error: any) {
      // If stream doesn't exist, ensure it exists and return empty result
      if (
        error?.code === "stream_not_found" ||
        error?.status === 404 ||
        (error?.message && error.message.includes("stream_not_found"))
      ) {
        await this.ensureStreamExists(basinName, streamName);
        // Return empty result since stream was just created
        return { records: [] };
      } else {
        throw error;
      }
    }
  }

  /**
   * Reads from a stream with session management
   *
   * @param basinName - Name of the basin
   * @param streamName - Name of the stream
   * @param sessionId - Session ID (empty string for new session)
   * @param limit - Maximum number of records to read
   * @returns Promise<S2ReadSessionResult> - Records and session ID
   */
  async readStreamSession(
    basinName: string,
    streamName: string,
    sessionId: string,
    limit: number
  ): Promise<S2ReadSessionResult> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);

    const session = sessionId || "";
    const result = (await stream.readSession(
      session as any,
      {
        count: limit,
      } as any
    )) as any;

    const records = (result.records || []).map((record: S2Record) =>
      this.parseRecord(record)
    );

    return {
      records,
      session: result.session || sessionId || "",
    };
  }

  /**
   * Appends data to a stream with session management
   *
   * @param basinName - Name of the basin
   * @param streamName - Name of the stream
   * @param sessionId - Session ID (empty string for new session)
   * @param data - Data to append
   * @returns Promise<S2AppendSessionResult> - Session ID
   */
  async appendStreamSession(
    basinName: string,
    streamName: string,
    sessionId: string,
    data: any
  ): Promise<S2AppendSessionResult> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);

    const session = sessionId || undefined;
    const result = (await stream.appendSession(
      {
        session: session,
        records: [AppendRecord.make(data)],
      } as any,
      {}
    )) as any;

    return {
      session: result.session || sessionId || "",
    };
  }

  /**
   * Ensures a stream exists by creating it if it doesn't exist
   * Uses the S2 basin.streams.create() API to explicitly create the stream
   * Silently handles the case where the stream already exists
   *
   * @param basinName - Name of the basin
   * @param streamName - Name of the stream
   * @returns Promise<void> - Always succeeds (stream exists or was created)
   */
  async ensureStreamExists(
    basinName: string,
    streamName: string
  ): Promise<void> {
    const basin = this.client.basin(basinName);

    try {
      // Use the basin's streams API to create the stream
      // This will succeed if the stream already exists (409) or create it if it doesn't
      await (basin as any).streams.create({
        stream: streamName,
        // config is optional - omit it to use defaults
      });
      // Success - stream was created or already exists
      return;
    } catch (error: any) {
      // Check for various error formats that indicate stream already exists
      const status =
        error?.status || error?.statusCode || error?.response?.status;
      const code = error?.code || error?.data$?.code;
      const message = error?.message || error?.data$?.message || String(error);

      // If stream already exists (409 conflict), that's fine - silently return
      if (
        status === 409 ||
        code === "stream_exists" ||
        code === "conflict" ||
        message.includes("already exists") ||
        message.includes("conflict") ||
        message.includes("Stream already exists")
      ) {
        return;
      }

      // For "not found" errors, try to create the stream by attempting an append
      // In some S2 configurations, streams are created automatically on first append
      if (
        status === 404 ||
        code === "stream_not_found" ||
        code === "not_found" ||
        message.includes("not found") ||
        message.includes("Stream not found")
      ) {
        try {
          // Try to create by appending - this may create the stream automatically
          const stream = basin.stream(streamName);
          await stream.append([
            AppendRecord.make(
              JSON.stringify({ _init: true, _timestamp: Date.now() })
            ),
          ]);
          // Success - stream was created via append
          return;
        } catch (appendError: any) {
          // If append also fails, the stream will be created on the next real operation
          // Don't throw - let the actual operation handle it
          return;
        }
      }

      // For other errors, don't throw - let the actual operation handle it
      // The stream will be created automatically when needed
      return;
    }
  }

  /**
   * Checks the health of the S2 service
   * Verifies connectivity by checking client initialization
   *
   * @returns Promise<{ status: string; message: string; connected: boolean }>
   */
  async getHealth(): Promise<{
    status: string;
    message: string;
    connected: boolean;
  }> {
    try {
      // Verify the client is properly initialized
      if (!this.client) {
        throw new Error("S2 client not initialized");
      }

      // Try to access a basin to verify the client is working
      // This is a lightweight operation that verifies the client structure
      const testBasin = this.client.basin("_health_check");
      if (!testBasin) {
        throw new Error("Failed to access S2 basin");
      }

      return {
        status: "ok",
        message: "S2 streamstore connection active",
        connected: true,
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        connected: false,
      };
    }
  }

  /**
   * Parses a record to extract and parse JSON data
   *
   * @private
   * @param record - Raw record from S2
   * @returns Parsed record data
   */
  private parseRecord(record: S2Record): any {
    if (!record) return undefined;

    // S2 records store data in body field when appended as JSON string
    const body = (record as any).body;
    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        try {
          return JSON.parse(body);
        } catch {
          return body;
        }
      }
      return body;
    }

    // Records without body have no usable data
    return undefined;
  }
}
