/**
 * Gmail - Email Management and Processing Service
 *
 * The Gmail class provides comprehensive access to Gmail functionality through
 * the Gmail API v1. It handles email operations including reading, sending,
 * labeling, and thread management with efficient pagination and caching.
 *
 * Key Features:
 * - Email listing with pagination and filtering
 * - Thread-based conversation management
 * - Email composition and sending with attachments
 * - Label management and organization
 * - Efficient data fetching with skip/limit support
 *
 * The class implements smart pagination that only fetches full message content
 * for messages that will actually be displayed, optimizing performance for
 * large email accounts.
 *
 * @class Gmail
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { google, gmail_v1 } from "googleapis";
import { JWT } from "google-auth-library";
import { GmailLabel, GmailMessage, GSuiteUser, Universe } from "../..";
import { GmailThread } from "./GmailThread";
import {
  htmlFromText,
  escapeHtml,
  stripHtmlToText,
  encodeDisplayName,
  chunk76,
  base64Url,
} from "./utils";

/**
 * Configuration for Gmail sending operations
 */
export type GmailSendConfig = {
  /** Email address to send from */
  fromEmail: string;
  /** Display name for the sender */
  fromName: string;
  /** HTML signature to append to emails */
  signatureHtml: string;
};

/**
 * Parameters for Gmail listing operations
 */
export type GmailListParams = {
  /** Whether to fetch full message content */
  full?: boolean;
  /** Number of items to skip for pagination */
  skip?: number;
  /** Maximum number of items to return */
  limit?: number;
};

/**
 * Parameters for Gmail sending operations
 */
export type GmailSendParams = {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Email body content */
  body: string;
  /** Optional file attachments */
  attachments?: {
    filename: string;
    mimeType: string;
    content: Buffer;
  }[];
};

export class Gmail {
  /** Gmail API v1 client instance */
  public readonly gmail: gmail_v1.Gmail;

  /**
   * Creates a new Gmail instance
   *
   * @param universe - Reference to the central Universe instance
   * @param auth - JWT authentication for the Gmail user
   */
  constructor(private readonly universe: Universe, private auth: JWT) {
    this.gmail = google.gmail({ version: "v1", auth: this.auth });
  }

  /**
   * Gets the GSuiteUser instance for the authenticated user
   *
   * This provides access to other Google Workspace services
   * for the same user.
   */
  get user(): GSuiteUser {
    return this.universe.gsuite.user(this.email);
  }

  /**
   * Gets the email address of the authenticated user
   */
  get email(): string {
    return this.auth.subject!;
  }

  /**
   * Retrieves all Gmail labels for the authenticated user
   *
   * Labels are used to organize and categorize emails.
   * This method fetches the complete label list from Gmail.
   *
   * @returns Promise<GmailLabel[]> - Array of Gmail labels
   * @throws Error if no labels are found or the API call fails
   */
  async getLabels(): Promise<GmailLabel[]> {
    const response = await this.gmail.users.labels.list({
      userId: "me",
    });

    if (!response.data.labels) {
      throw new Error("No labels found");
    }

    return response.data.labels.map((label) => new GmailLabel(this, label));
  }

  /**
   * Finds the ID of a Gmail label by name
   *
   * This method searches through all available labels to find
   * the one matching the specified name, which is useful for
   * filtering operations.
   *
   * @param label - The name of the label to find
   * @returns Promise<string> - The label ID
   * @throws Error if the label is not found
   */
  async getLabelId(label: string): Promise<string> {
    const labels = await this.getLabels();
    const labelId = labels.find((l) => l.name === label)?.id;
    if (!labelId) {
      throw new Error(`Label ${label} not found`);
    }
    return labelId;
  }

  /**
   * Generic async generator that handles pagination with skip/limit logic
   *
   * This method provides efficient pagination by only fetching full data
   * for items that will actually be yielded, optimizing performance for
   * large datasets.
   *
   * @param messageGenerator - Base generator for the items
   * @param params - Pagination parameters (skip, limit, full)
   * @param fetchFull - Optional function to fetch full item data
   * @returns AsyncGenerator<T> - Paginated items with optional full data
   */
  private async *paginate<T>(
    messageGenerator: AsyncGenerator<T>,
    params: { skip?: number; limit?: number; full?: boolean },
    fetchFull?: (item: T) => Promise<T>
  ): AsyncGenerator<T> {
    let skipped = 0;
    let yielded = 0;
    const limit = params.limit || Infinity;
    const skip = params.skip || 0;

    for await (const item of messageGenerator) {
      // Skip items until we reach the skip count
      if (skipped < skip) {
        skipped++;
        continue;
      }

      // Check if we've reached the limit
      if (yielded >= limit) {
        return;
      }

      // Only fetch full data if needed and for items we'll actually yield
      let finalItem = item;
      if (params.full && fetchFull) {
        finalItem = await fetchFull(item);
      }

      yielded++;
      yield finalItem;
    }
  }

  async *listMessages(
    label?: string,
    params?: GmailListParams
  ): AsyncGenerator<GmailMessage> {
    let nextPageToken: string | null | undefined;
    let labelId = label ? await this.getLabelId(label) : undefined;

    // Create the base message generator without skip/limit
    const baseMessageGenerator = this.createBaseMessageGenerator(
      labelId,
      nextPageToken
    );

    // Use the pagination helper
    yield* this.paginate(
      baseMessageGenerator,
      params || {},
      async (msg: GmailMessage) => msg.fetch()
    );
  }

  /**
   * Creates the base message generator without pagination logic
   */
  private async *createBaseMessageGenerator(
    labelId: string | undefined,
    initialPageToken?: string | null
  ): AsyncGenerator<GmailMessage> {
    let nextPageToken = initialPageToken;

    while (true) {
      const request: gmail_v1.Params$Resource$Users$Messages$List = {
        userId: "me",
        maxResults: 500,
      };
      if (labelId) {
        request.labelIds = [labelId];
      }
      if (nextPageToken) {
        request.pageToken = nextPageToken;
      }

      const response = await this.gmail.users.messages.list(request);

      for (const message of response.data.messages || []) {
        yield new GmailMessage(this, message, false);
      }

      nextPageToken = response.data.nextPageToken;
      if (!nextPageToken) {
        break;
      }
    }
  }

  async *listThreads(
    label?: string,
    params?: GmailListParams
  ): AsyncGenerator<GmailThread> {
    let nextPageToken: string | null | undefined;
    let labelId = label ? await this.getLabelId(label) : undefined;

    // Create the base thread generator without skip/limit
    const baseThreadGenerator = this.createBaseThreadGenerator(
      labelId,
      nextPageToken
    );

    // Use the pagination helper
    yield* this.paginate(
      baseThreadGenerator,
      params || {},
      async (thread: GmailThread) => thread.fetch()
    );
  }

  /**
   * Creates the base thread generator without pagination logic
   */
  private async *createBaseThreadGenerator(
    labelId: string | undefined,
    initialPageToken?: string | null
  ): AsyncGenerator<GmailThread> {
    let nextPageToken = initialPageToken;

    while (true) {
      const request: gmail_v1.Params$Resource$Users$Threads$List = {
        userId: "me",
        maxResults: 500,
      };
      if (labelId) {
        request.labelIds = [labelId];
      }
      if (nextPageToken) {
        request.pageToken = nextPageToken;
      }

      const response = await this.gmail.users.threads.list(request);

      for (const thread of response.data.threads || []) {
        yield new GmailThread(this, thread, []);
      }

      nextPageToken = response.data.nextPageToken;
      if (!nextPageToken) {
        break;
      }
    }
  }

  async getSendConfig(): Promise<GmailSendConfig> {
    let fromEmail = this.email!;
    let fromName = "";
    let signatureHtml = "";

    // Try Gmail Send-As for fromEmail, displayName, and signature
    const sendAsList = await this.gmail.users.settings.sendAs.list({
      userId: "me",
    });
    const sendAs =
      sendAsList.data.sendAs?.find((s) => s.isDefault) ||
      sendAsList.data.sendAs?.find((s) => s.sendAsEmail === this.email) ||
      sendAsList.data.sendAs?.[0];

    if (sendAs?.sendAsEmail) {
      fromEmail = sendAs.sendAsEmail;
    }
    if (sendAs?.displayName && sendAs.displayName.trim()) {
      fromName = sendAs.displayName.trim();
    }
    if (sendAs?.signature) {
      signatureHtml = sendAs.signature;
    }

    // Fallback: resolve name via Admin Directory
    if (!fromName) {
      const directoryInfo = this.user.directoryData;
      const dirName =
        directoryInfo.name?.fullName ||
        [directoryInfo.name?.givenName, directoryInfo.name?.familyName]
          .filter(Boolean)
          .join(" ");
      if (dirName && dirName.trim()) {
        fromName = dirName.trim();
      }
    }

    if (!fromName) {
      throw new Error("From name not found");
    }

    return { fromEmail, fromName, signatureHtml };
  }

  async send({ to, subject, body, attachments }: GmailSendParams) {
    const sendConfig = await this.getSendConfig();

    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString(
      "base64"
    )}?=`;

    const emailText = (body + "\n" + sendConfig.fromName).trimEnd();

    // HTML with bold contract; signature preceded by blank line + `--`
    const htmlWithoutSig = htmlFromText(emailText);
    const htmlSignature = sendConfig.signatureHtml
      ? `<div><br>--<br></div>${sendConfig.signatureHtml}`
      : "";
    const textSignature = sendConfig.signatureHtml
      ? `\n\n--\n${stripHtmlToText(sendConfig.signatureHtml)}`
      : "";

    const htmlBody = htmlWithoutSig + htmlSignature;
    const textBody = emailText + textSignature;

    // MIME boundaries
    const boundaryMixed = "mixed_" + Date.now().toString(36);
    const boundaryAlt = "alt_" + Math.random().toString(36).slice(2);

    // From header (include name if available)
    const fromHeader = sendConfig.fromName
      ? `${encodeDisplayName(sendConfig.fromName)} <${sendConfig.fromEmail}>`
      : `<${sendConfig.fromEmail}>`;

    // Compose message
    const lines: string[] = [
      `From: ${fromHeader}`,
      `To: <${to}>`,
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
      "",
      `--${boundaryMixed}`,
      `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
      "",
      `--${boundaryAlt}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      textBody,
      "",
      `--${boundaryAlt}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      htmlBody,
      "",
      `--${boundaryAlt}--`,
      "",
      `--${boundaryMixed}`,
    ];

    for (const attachment of attachments || []) {
      const attachmentChunked = chunk76(attachment.content.toString("base64"));
      lines.push(
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "",
        attachmentChunked,
        `--${boundaryMixed}--`
      );
    }

    lines.push("");

    // Send
    const rawMessage = base64Url(lines.join("\r\n"));
    await this.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawMessage },
    });
  }
}
