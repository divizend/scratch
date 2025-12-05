/**
 * GmailMessage - Email Message Processing and Serving
 *
 * The GmailMessage class represents an individual email message and implements
 * the Fragment interface to provide multiple serving modes. It handles email
 * content processing, MIME parsing, and format conversion for different use cases.
 *
 * Key Features:
 * - Multiple serving modes (original, markdown, JSON)
 * - Intelligent content type selection for rendering
 * - CID URL rewriting for embedded content
 * - Attachment and part management
 * - Efficient content fetching with caching
 *
 * The class implements RFC 2046 compliant MIME parsing and provides
 * intelligent content selection for optimal rendering across different formats.
 *
 * @class GmailMessage
 * @implements Fragment
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { gmail_v1 } from "googleapis";
import TurndownService from "turndown";
import {
  Gmail,
  GmailMessagePart,
  GmailMessagePartData,
  Fragment,
  FragmentServingMode,
  Universe,
  URI,
  GmailMessageURI,
} from "../..";
import { rewriteCidUrls } from "./utils";

export class GmailMessage implements Fragment {
  /**
   * Set of MIME types that can be rendered directly
   *
   * These types represent the primary content formats that
   * can be displayed to users in a readable form.
   */
  private static readonly RENDERABLE_TYPES = new Set([
    "text/html",
    "text/x-amp-html",
    "text/plain",
  ]);

  /**
   * Creates a new GmailMessage instance
   *
   * @param gmail - Reference to the Gmail service instance
   * @param message - Raw Gmail API message data
   * @param isFull - Whether the message contains full content
   */
  constructor(
    private readonly gmail: Gmail,
    public readonly message: gmail_v1.Schema$Message,
    public readonly isFull: boolean
  ) {}

  /**
   * Creates a GmailMessage from a URI
   *
   * This factory method parses the URI to extract the email address
   * and message ID, then creates the appropriate Gmail instance
   * to fetch the message.
   *
   * @param universe - Reference to the central Universe instance
   * @param uri - URI identifying the message to retrieve
   * @returns Promise<GmailMessage> - The requested message
   */
  static async fromURI(universe: Universe, uri: URI): Promise<GmailMessage> {
    const gmailMessageUri = GmailMessageURI.fromURI(uri);
    const gmail = universe.gsuite.user(gmailMessageUri.email).gmail();
    return GmailMessage.fromMessageId(gmail, gmailMessageUri.messageId);
  }

  /**
   * Creates a GmailMessage from a message ID
   *
   * This factory method creates a prototype message and then
   * fetches the full content from the Gmail API.
   *
   * @param gmail - Gmail service instance for the user
   * @param messageId - Gmail message identifier
   * @returns Promise<GmailMessage> - The full message
   */
  static async fromMessageId(
    gmail: Gmail,
    messageId: string
  ): Promise<GmailMessage> {
    const proto = new GmailMessage(gmail, { id: messageId }, false);
    return proto.fetch();
  }

  /**
   * Fetches the full message content from Gmail
   *
   * This method retrieves the complete message data including
   * headers, body parts, and attachments. It's an expensive
   * operation that should be used judiciously.
   *
   * @returns Promise<GmailMessage> - Message with full content
   */
  async fetch(): Promise<GmailMessage> {
    if (this.isFull) {
      return this;
    }

    return new GmailMessage(
      this.gmail,
      (
        await this.gmail.gmail.users.messages.get({
          userId: "me",
          id: this.message.id!,
          format: "full",
        })
      ).data,
      true
    );
  }

  /**
   * Gets the URI identifier for this message
   *
   * The URI follows the format: gmail://email/message/messageId
   * and can be used to reference this message in other parts
   * of the system.
   */
  get uri() {
    return `gmail://${this.gmail.email}/message/${this.message.id}`;
  }

  /**
   * Gets the raw message data from the Gmail API
   *
   * This provides access to all the original message properties
   * including headers, payload structure, and metadata.
   */
  get data() {
    return this.message;
  }

  /**
   * Gets the subject line of the email
   *
   * Extracts the subject from the message headers, providing
   * a convenient way to access this commonly used field.
   */
  get subject() {
    return this.message.payload?.headers?.find(
      (h) => h.name!.toLowerCase() === "subject"
    )?.value!;
  }

  /**
   * Serves the message content in the specified format
   *
   * This method implements the Fragment interface and provides
   * multiple serving modes optimized for different use cases:
   * - ORIGINAL: Native format with CID URL rewriting
   * - MARKDOWN: Converted to Markdown for easy reading
   * - JSON: Structured metadata and content representation
   *
   * @param format - The desired serving mode
   * @returns Promise containing headers and data for the served content
   * @throws Error if the serving mode is not supported or content processing fails
   */
  async serve(format: FragmentServingMode): Promise<{
    headers: { name: string; value: string }[];
    data: Buffer;
  }> {
    if (!this.isFull) {
      throw new Error("Message is not full");
    }

    if (format === FragmentServingMode.ORIGINAL) {
      const renderable = this.chooseRenderable(this.message.payload!);
      if (!renderable) {
        throw new Error("No renderable part found");
      }

      const renderablePart = await GmailMessagePart.fromMessageAndPart(
        this.gmail,
        this,
        renderable
      );
      const ret = await renderablePart.serve(format);

      const chosenType = (renderablePart.part.mimeType || "").toLowerCase();
      if (chosenType === "text/html" || chosenType === "text/x-amp-html") {
        const text = await renderablePart.asText();
        const cidMap = this.buildCidMap(this.message.payload!);
        let html = rewriteCidUrls(text, this.uri, cidMap);
        ret.data = Buffer.from(html);
        ret.headers = ret.headers.filter(
          (h) => h.name.toLowerCase() !== "content-type"
        );
        ret.headers.push({
          name: "Content-Type",
          value: "text/html; charset=utf-8",
        });
      }

      return ret;
    } else if (format === FragmentServingMode.MARKDOWN) {
      const original = await this.serve(FragmentServingMode.ORIGINAL);
      const contentType = original.headers.find(
        (h) => h.name.toLowerCase() === "content-type"
      )?.value;

      let markdown = original.data.toString();
      if (contentType?.includes("text/html")) {
        const turndownService = new TurndownService();
        turndownService.remove(["script", "style"]);
        markdown = turndownService.turndown(markdown).trim();
      }

      return {
        headers: [
          { name: "Content-Type", value: "text/markdown; charset=utf-8" },
        ],
        data: Buffer.from(markdown),
      };
    } else if (format === FragmentServingMode.JSON) {
      return {
        headers: [{ name: "Content-Type", value: "application/json" }],
        data: Buffer.from(
          JSON.stringify({
            message: this.message,
            cidMap: this.partIdsToURIs(this.buildCidMap(this.message.payload!)),
            attachments: this.partIdsToURIs(
              this.buildAttachmentsMap(this.message.payload!)
            ),
          })
        ),
      };
    } else {
      throw new Error(`Unknown serving mode: ${format}`);
    }
  }

  /**
   * Choose the best renderable body part per RFC 2046.
   * - For multipart/alternative -> scan from LAST to FIRST and pick first we can render.
   * - For multipart/related -> the FIRST part is the root; recurse into it.
   * - For multipart/mixed -> collect renderable candidates and pick "best" (html > plain).
   * - For multipart/signed -> the FIRST part is the content.
   * - For message/rfc822 -> recurse into its enclosed structure if present (Gmail exposes as parts).
   * Returns the chosen message part (not yet decoded).
   */
  private chooseRenderable(
    part: gmail_v1.Schema$MessagePart
  ): gmail_v1.Schema$MessagePart | null {
    const type = (part.mimeType || "").toLowerCase();

    if (GmailMessage.RENDERABLE_TYPES.has(type)) return part;

    if (type.startsWith("multipart/alternative")) {
      const ps = part.parts || [];
      for (let i = ps.length - 1; i >= 0; i--) {
        const cand = this.chooseRenderable(ps[i]!);
        if (cand) return cand;
      }
      return null;
    }

    if (type.startsWith("multipart/related")) {
      const ps = part.parts || [];
      if (ps.length === 0) return null;
      // RFC: first part is the root (typically html or alternative)
      return this.chooseRenderable(ps[0]!) || null;
    }

    if (type.startsWith("multipart/signed")) {
      const ps = part.parts || [];
      if (ps.length === 0) return null;
      // first part is the signed content
      return this.chooseRenderable(ps[0]!) || null;
    }

    if (type.startsWith("multipart/mixed")) {
      const ps = part.parts || [];
      const cands: gmail_v1.Schema$MessagePart[] = [];
      for (const p of ps) {
        const c = this.chooseRenderable(p);
        if (c) cands.push(c);
      }
      // prefer html > amp-html > plain
      const score = (t: string) =>
        t === "text/html"
          ? 3
          : t === "text/x-amp-html"
          ? 2
          : t === "text/plain"
          ? 1
          : 0;
      let best: gmail_v1.Schema$MessagePart | null = null;
      let bestScore = 0;
      for (const c of cands) {
        const s = score((c.mimeType || "").toLowerCase());
        if (s > bestScore) {
          best = c;
          bestScore = s;
        }
      }
      return best;
    }

    if (type === "message/rfc822") {
      // Gmail often exposes enclosed message under .parts as a mini-tree
      const ps = part.parts || [];
      for (const p of ps) {
        const cand = this.chooseRenderable(p);
        if (cand) return cand;
      }
      return null;
    }

    // Other types are not directly renderable here
    return null;
  }

  /**
   * Generic method to traverse all parts of a message recursively.
   * Calls the provided callback for each part encountered.
   *
   * @param root - The root message part to start traversal from
   * @param callback - Function called for each part with the part and a helper GmailMessagePart instance
   */
  private traverseParts(
    root: gmail_v1.Schema$MessagePart,
    callback: (
      part: gmail_v1.Schema$MessagePart,
      partHelper: GmailMessagePart
    ) => void
  ) {
    const stack: gmail_v1.Schema$MessagePart[] = [root];

    while (stack.length) {
      const part = stack.pop()!;
      const partHelper = new GmailMessagePart(
        this.gmail,
        part as GmailMessagePartData,
        this.message.id!,
        false
      );

      callback(part, partHelper);

      if (part.parts?.length) {
        stack.push(...part.parts);
      }
    }
  }

  private buildCidMap(
    root: gmail_v1.Schema$MessagePart,
    map: { [key: string]: string } = {}
  ) {
    this.traverseParts(root, (part, partHelper) => {
      const cidRaw = partHelper.getHeader("content-id");
      if (cidRaw && part.partId) {
        const cid = cidRaw.trim().replace(/^<|>$/g, "").toLowerCase();
        if (!map[cid]) map[cid] = part.partId;
      }
    });
    return map;
  }

  private partIdsToURIs(partsMap: { [key: string]: string }) {
    return Object.fromEntries(
      Object.entries(partsMap).map(([cid, partId]) => [
        cid,
        `gmail://${this.gmail.email}/message/${this.message.id}/part/${partId}`,
      ])
    );
  }

  /**
   * Build a map of "regular" attachments (as shown in Gmail's UI).
   * We consider a part a regular attachment if:
   *  - it is NOT a multipart container,
   *  - it has a non-empty filename,
   *  - it has a body.attachmentId (i.e., is a downloadable blob),
   *  - and its Content-Disposition is not "inline".
   *
   * Returns a Map where:
   *   key   = attachment filename
   *   value = partId (use with users.messages.attachments.get)
   */
  private buildAttachmentsMap(
    root: gmail_v1.Schema$MessagePart,
    map: { [key: string]: string } = {}
  ) {
    this.traverseParts(root, (part, partHelper) => {
      const type = (part.mimeType || "").toLowerCase();
      const isMultipart = type.startsWith("multipart/");

      const disposition = (
        partHelper.getHeader("content-disposition") || ""
      ).toLowerCase();
      const isInline = disposition.startsWith("inline");

      const filename = (part.filename || "").trim();
      const hasAttachmentId = !!part.body?.attachmentId;
      const isSignature = type.startsWith("application/pkcs7-signature");

      if (
        !isMultipart &&
        filename &&
        hasAttachmentId &&
        !isInline &&
        part.partId &&
        !isSignature
      ) {
        if (!map[filename]) {
          map[filename] = part.partId;
        }
      }
    });

    return map;
  }
}
