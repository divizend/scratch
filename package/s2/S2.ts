/**
 * S2 - Streamstore Service Adapter
 *
 * The S2 class provides an adapter for the S2 streamstore service,
 * abstracting the stream operations and configuration.
 * All data is automatically wrapped in CloudEvents format when appending
 * and unwrapped when reading, so blocks only work with the payload.
 *
 * @class S2
 * @version 1.0.0
 */

import { S2 as S2Client, AppendRecord } from "@s2-dev/streamstore";
import { CloudEvent } from "cloudevents";
import { envOr, env, envOrDefault } from "../index";

export interface S2ReadResult {
  records: any[];
}

export class S2 {
  private client: S2Client;

  private constructor(accessToken: string) {
    this.client = new S2Client({ accessToken });
  }

  static construct(accessToken?: string): S2 {
    const token = envOr(
      accessToken,
      "S2_ACCESS_TOKEN",
      "S2_ACCESS_TOKEN environment variable is not set. Please configure it to use streamstore features."
    );
    return new S2(token);
  }

  static getBasin(): string {
    return env("S2_BASIN", {
      errorMessage: "S2_BASIN environment variable is required but not set.",
    });
  }

  /**
   * Generates event type from HOSTED_AT and stream name
   * Reverses the domain (e.g., "scratch.divizend.ai" -> "ai.divizend.scratch")
   * and appends the stream name
   */
  private static getEventType(streamName: string): string {
    const hostedAt = envOrDefault(
      undefined,
      "HOSTED_AT",
      "scratch.divizend.ai"
    );
    // Remove protocol if present
    const domain = hostedAt.replace(/^https?:\/\//, "");
    // Reverse the domain parts
    const reversed = domain.split(".").reverse().join(".");
    // Append stream name
    return `${reversed}.${streamName}`;
  }

  /**
   * Appends data to a stream
   * Automatically wraps the data in a CloudEvent with generated headers
   */
  async appendToStream(
    basinName: string,
    streamName: string,
    data: any
  ): Promise<void> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);

    // Generate event type from HOSTED_AT and stream name
    const eventType = S2.getEventType(streamName);

    // Create a CloudEvent with the payload
    const event = new CloudEvent({
      source: `ai.divizend.scratch/${streamName}`,
      type: eventType,
      data: data, // The actual payload from the block
    });

    // Serialize the CloudEvent to JSON
    const eventBody = JSON.stringify(event);

    await stream.append([AppendRecord.make(eventBody)]);
  }

  /**
   * Reads records from a stream starting from the beginning (raw CloudEvents)
   * Returns the full CloudEvent objects, not just the payload
   */
  async readFromStreamRaw(
    basinName: string,
    streamName: string,
    limit: number
  ): Promise<S2ReadResult> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);
    try {
      const readBatch = await stream.read({ seq_num: 0, count: limit });
      const records = ((readBatch as any).records || []).map((record: any) =>
        this.parseRecordRaw(record)
      );
      return { records };
    } catch (error: any) {
      // Check if it's a stream not found error - re-throw so it can be handled as 404
      const errorMessage =
        error?.message || error?.data$?.message || String(error);
      const status =
        error?.status || error?.statusCode || error?.response?.status;
      const code = error?.code || error?.data$?.code;

      if (
        status === 404 ||
        code === "stream_not_found" ||
        code === "not_found" ||
        errorMessage.includes("not found") ||
        errorMessage.includes("Stream not found")
      ) {
        // Re-throw stream not found errors so they can be handled as 404
        throw error;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Checks the tail (latest records) of a stream (raw CloudEvents)
   * Returns the full CloudEvent objects, not just the payload
   */
  async checkStreamTailRaw(
    basinName: string,
    streamName: string,
    limit: number
  ): Promise<S2ReadResult> {
    const basin = this.client.basin(basinName);
    const stream = basin.stream(streamName);

    try {
      // Get tail position (i.e. the _next_ sequence number)
      const tailResponse = await stream.checkTail();
      const tail = tailResponse.tail;

      if (!tail || tail.seq_num === undefined || tail.seq_num < 0) {
        return { records: [] };
      }

      const startSeq = Math.max(0, tail.seq_num - limit);
      const count = Math.min(tail.seq_num, limit);

      const readResult = await stream.read({
        seq_num: startSeq,
        count: count,
      });

      const records = ((readResult as any).records || []).map((record: any) =>
        this.parseRecordRaw(record)
      );

      return { records };
    } catch (error: any) {
      // Check if it's a stream not found error - re-throw so it can be handled as 404
      const errorMessage =
        error?.message || error?.data$?.message || String(error);
      const status =
        error?.status || error?.statusCode || error?.response?.status;
      const code = error?.code || error?.data$?.code;

      if (
        status === 404 ||
        code === "stream_not_found" ||
        code === "not_found" ||
        errorMessage.includes("not found") ||
        errorMessage.includes("Stream not found")
      ) {
        // Re-throw stream not found errors so they can be handled as 404
        throw error;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Reads records from a stream starting from the beginning
   * Returns only the payload (data field) from each CloudEvent
   */
  async readFromStream(
    basinName: string,
    streamName: string,
    limit: number
  ): Promise<S2ReadResult> {
    const rawResult = await this.readFromStreamRaw(
      basinName,
      streamName,
      limit
    );
    // Extract only the data field from each CloudEvent
    const records = rawResult.records.map((event: any) => {
      if (event && typeof event === "object" && event.data !== undefined) {
        return event.data;
      }
      return event;
    });
    return { records };
  }

  /**
   * Checks the tail (latest records) of a stream
   * Returns only the payload (data field) from each CloudEvent
   */
  async checkStreamTail(
    basinName: string,
    streamName: string,
    limit: number
  ): Promise<S2ReadResult> {
    const rawResult = await this.checkStreamTailRaw(
      basinName,
      streamName,
      limit
    );
    // Extract only the data field from each CloudEvent
    const records = rawResult.records.map((event: any) => {
      if (event && typeof event === "object" && event.data !== undefined) {
        return event.data;
      }
      return event;
    });
    return { records };
  }

  /**
   * Creates a stream in the specified basin
   */
  async createStream(
    basinName: string,
    streamName: string
  ): Promise<{ created: boolean; message: string }> {
    // Disallow creating a stream named "extension"
    if (streamName === "extension") {
      throw new Error('Stream name "extension" is not allowed');
    }

    const basin = this.client.basin(basinName);

    try {
      await (basin as any).streams.create({
        stream: streamName,
      });
      return {
        created: true,
        message: `Stream ${streamName} created successfully in basin ${basinName}`,
      };
    } catch (error: any) {
      const status =
        error?.status || error?.statusCode || error?.response?.status;
      const code = error?.code || error?.data$?.code;
      const message = error?.message || error?.data$?.message || String(error);

      if (
        status === 409 ||
        code === "stream_exists" ||
        code === "conflict" ||
        message.includes("already exists") ||
        message.includes("conflict")
      ) {
        return {
          created: false,
          message: `Stream ${streamName} already exists in basin ${basinName}`,
        };
      }

      throw error;
    }
  }

  /**
   * Checks the health of the S2 service
   */
  async getHealth(): Promise<{
    status: string;
    message: string;
    connected: boolean;
  }> {
    try {
      if (!this.client) {
        throw new Error("S2 client not initialized");
      }
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
   * Parses a record to extract the raw CloudEvent
   * Returns the full CloudEvent object including all metadata
   */
  private parseRecordRaw(record: any): any {
    if (!record) return undefined;

    // Get the body (which should contain the CloudEvent JSON)
    const body = record.body;
    if (!body) return undefined;

    // Parse the CloudEvent JSON
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        // If it's not JSON, return as-is
        return body;
      }
    }

    return body;
  }
}
