/**
 * GmailMessagePart - Email Part and Attachment Management
 *
 * The GmailMessagePart class represents individual parts of an email message,
 * including body text, HTML content, and file attachments. It implements the
 * Fragment interface to provide consistent access to different content types.
 *
 * Key Features:
 * - MIME part handling and content extraction
 * - Attachment management and downloading
 * - Content encoding and charset handling
 * - Header parsing and metadata access
 * - Multiple serving modes for different use cases
 *
 * This class handles the complex MIME structure of emails and provides
 * a unified interface for accessing various content types within messages.
 *
 * @class GmailMessagePart
 * @implements Fragment
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { gmail_v1 } from "googleapis";
import {
  Gmail,
  GmailMessage,
  Fragment,
  FragmentServingMode,
  GmailMessagePartURI,
  URI,
  Universe,
} from "../..";
import { qpDecode } from "./utils";

/**
 * Extended message part data with additional properties
 *
 * Extends the Gmail API message part with convenience properties
 * for headers and body content management.
 */
export type GmailMessagePartData = gmail_v1.Schema$MessagePart & {
  /** Map of lowercase header names to values for easy access */
  headersMap?: { [key: string]: string };
  /** Extended body data with optional buffer for content */
  body?: gmail_v1.Schema$MessagePartBody & {
    buffer?: Buffer;
  };
};

export class GmailMessagePart implements Fragment {
  /**
   * Creates a new GmailMessagePart instance
   *
   * The constructor automatically processes headers into a map for
   * efficient lookup and initializes the part with the provided data.
   *
   * @param gmail - Reference to the Gmail service instance
   * @param part - Raw message part data from Gmail API
   * @param messageId - ID of the parent message
   * @param isFull - Whether the part contains full content
   */
  constructor(
    private readonly gmail: Gmail,
    public readonly part: GmailMessagePartData,
    public readonly messageId: string,
    public readonly isFull: boolean
  ) {
    // Create a map of lowercase header names to values for efficient lookup
    const headersMap: { [key: string]: string } = {};
    for (const header of this.part.headers || []) {
      headersMap[header.name!.toLowerCase()] = header.value!;
    }
    this.part.headersMap = headersMap;
  }

  /**
   * Creates a GmailMessagePart from a URI
   *
   * This factory method parses the URI to extract the email address,
   * message ID, and part ID, then creates the appropriate instances
   * to fetch the message part.
   *
   * @param universe - Reference to the central Universe instance
   * @param uri - URI identifying the message part to retrieve
   * @returns Promise<GmailMessagePart> - The requested message part
   */
  static async fromURI(
    universe: Universe,
    uri: URI
  ): Promise<GmailMessagePart> {
    const gmailMessagePartUri = GmailMessagePartURI.fromURI(uri);
    const gmail = universe.gsuite.user(gmailMessagePartUri.email).gmail();
    return GmailMessagePart.fromMessageIdAndPartId(
      gmail,
      gmailMessagePartUri.messageId,
      gmailMessagePartUri.partId
    );
  }

  /**
   * Creates a GmailMessagePart from message ID and part ID
   *
   * This factory method fetches the full message first, then
   * locates the specific part within the message structure.
   *
   * @param gmail - Gmail service instance for the user
   * @param messageId - Gmail message identifier
   * @param partId - Gmail message part identifier
   * @returns Promise<GmailMessagePart> - The requested message part
   */
  static async fromMessageIdAndPartId(
    gmail: Gmail,
    messageId: string,
    partId: string
  ): Promise<GmailMessagePart> {
    const message = await GmailMessage.fromMessageId(gmail, messageId);
    return GmailMessagePart.fromMessageAndPartId(gmail, message, partId);
  }

  /**
   * Creates a GmailMessagePart from an existing message and part ID
   *
   * This factory method searches through the message's MIME structure
   * to find the part with the specified ID, handling nested multipart
   * messages recursively.
   *
   * @param gmail - Gmail service instance for the user
   * @param message - Gmail message containing the part
   * @param partId - Gmail message part identifier
   * @returns Promise<GmailMessagePart> - The requested message part
   * @throws Error if the part is not found in the message
   */
  static async fromMessageAndPartId(
    gmail: Gmail,
    message: GmailMessage,
    partId: string
  ): Promise<GmailMessagePart> {
    // Recursive function to find a part by ID in the MIME structure
    const findPart = (part: any) => {
      if (part.partId === partId) {
        return part;
      }
      if (Array.isArray(part.parts)) {
        for (const subPart of part.parts) {
          const body: any = findPart(subPart);
          if (body) {
            return body;
          }
        }
      }
      return null;
    };

    const part = findPart(message.data.payload);
    if (!part) {
      throw new Error(`Part not found: ${partId}`);
    }

    return GmailMessagePart.fromMessageAndPart(gmail, message, part);
  }

  /**
   * Creates a GmailMessagePart from an existing message and part data
   *
   * This factory method creates a prototype part and then fetches
   * the full content if needed.
   *
   * @param gmail - Gmail service instance for the user
   * @param message - Gmail message containing the part
   * @param part - Raw part data from the message
   * @returns Promise<GmailMessagePart> - The full message part
   */
  static async fromMessageAndPart(
    gmail: Gmail,
    message: GmailMessage,
    part: GmailMessagePartData
  ): Promise<GmailMessagePart> {
    const proto = new GmailMessagePart(gmail, part, message.message.id!, false);
    return proto.fetch();
  }

  /**
   * Fetches the full content of the message part
   *
   * This method retrieves the complete part content including
   * body data and attachments. It handles different content
   * encoding methods and attachment downloading.
   *
   * @returns Promise<GmailMessagePart> - Part with full content
   */
  async fetch(): Promise<GmailMessagePart> {
    if (this.isFull) {
      return this;
    }

    let buffer: Buffer | undefined = undefined;
    if (this.part.body?.data) {
      // Decode base64-encoded content
      buffer = Buffer.from(this.part.body.data, "base64");
    } else if (this.part.body?.attachmentId) {
      // Download attachment if it's an attachment
      buffer = Buffer.from(
        (
          await this.gmail.gmail.users.messages.attachments.get({
            userId: "me",
            messageId: this.messageId,
            id: this.part.body.attachmentId,
          })
        ).data.data!,
        "base64"
      );
    } else {
      // If no data and no attachment, return an empty buffer
      buffer = Buffer.alloc(0);
    }

    return new GmailMessagePart(
      this.gmail,
      {
        ...this.part,
        body: {
          ...this.part.body,
          buffer: buffer!,
        },
      },
      this.messageId,
      true
    );
  }

  get uri() {
    return `gmail://${this.gmail.email}/message/${this.messageId}/part/${this.part.partId}`;
  }

  async serve(format: FragmentServingMode): Promise<{
    headers: { name: string; value: string }[];
    data: Buffer;
  }> {
    if (!this.isFull) {
      throw new Error("Part is not full");
    }

    if (format === FragmentServingMode.ORIGINAL) {
      return {
        headers: this.part.headers!.map((header) => ({
          name: header.name!,
          value: header.value!,
        })),
        data: this.part.body?.buffer || Buffer.alloc(0),
      };
    } else if (format === FragmentServingMode.JSON) {
      return {
        headers: [{ name: "Content-Type", value: "application/json" }],
        data: Buffer.from(JSON.stringify(this.part)),
      };
    } else {
      throw new Error(`Unknown serving mode: ${format}`);
    }
  }

  getHeader(name: string): string | undefined {
    return this.part.headersMap?.[name.toLowerCase()];
  }

  getCharset(): BufferEncoding {
    const ct = this.getHeader("content-type") || "";
    const m = /charset\s*=\s*"?([^";]+)"?/i.exec(ct);
    const cs = (m?.[1] || "utf-8").toLowerCase();
    if (/(utf-8|utf8)/i.test(cs)) return "utf8";
    if (/(iso-8859-1|latin1)/i.test(cs)) return "latin1";
    // default to utf-8
    return "utf8";
  }

  async asText(): Promise<string> {
    if (!this.isFull) {
      throw new Error("Part is not full");
    }

    // decode transfer-encoding if necessary (ignore base64, it's already decoded)
    let raw = this.part.body?.buffer!;
    const cte = (
      this.getHeader("content-transfer-encoding") || ""
    ).toLowerCase();
    if (cte === "quoted-printable") {
      raw = qpDecode(raw);
    }

    // always decode with utf8 first (because some emails wrongly say that they are iso-8859-1, but they are actually utf8)
    const enc = this.getCharset();
    const ret = raw.toString("utf8");
    if (Buffer.from(ret, "utf8").equals(raw)) {
      return ret; // valid utf8
    }
    return raw.toString(enc);
  }
}
