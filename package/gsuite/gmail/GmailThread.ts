/**
 * GmailThread - Email Conversation Management
 *
 * The GmailThread class represents a conversation thread in Gmail, which
 * groups related email messages together. Threads provide a way to view
 * the complete conversation history in a single, organized view.
 *
 * Key Features:
 * - Thread metadata and conversation overview
 * - Access to all messages within the thread
 * - Thread subject and snippet extraction
 *
 * This class simplifies working with email conversations by providing
 * a high-level interface to thread properties and message collections.
 *
 * @class GmailThread
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { gmail_v1 } from "googleapis";
import { Gmail, GmailMessage } from "../..";

export class GmailThread {
  /**
   * Creates a new GmailThread instance
   *
   * @param gmail - Reference to the Gmail service instance
   * @param thread - Raw Gmail API thread data
   */
  constructor(
    private readonly gmail: Gmail,
    public readonly thread: gmail_v1.Schema$Thread,
    public readonly messages: GmailMessage[]
  ) {}

  async fetch(): Promise<GmailThread> {
    if (this.messages.length > 0) {
      return this;
    }

    const threadFull = await this.gmail.gmail.users.threads.get({
      userId: "me",
      id: this.id!,
    });

    if (!threadFull.data.messages) {
      throw new Error("Thread has no messages: " + this.id);
    }

    const messages = threadFull.data.messages?.map((message) => {
      return new GmailMessage(this.gmail, message, true);
    });

    return new GmailThread(this.gmail, threadFull.data, messages);
  }

  get id() {
    return this.thread.id!;
  }

  /**
   * Gets the conversation snippet/preview
   *
   * The snippet provides a brief preview of the conversation,
   * typically showing the most recent message content or subject.
   */
  get snippet() {
    return this.thread.snippet;
  }

  /**
   * Gets the history ID for change tracking
   *
   * The history ID is used by Gmail to track changes to the thread
   * and enable efficient synchronization of updates.
   */
  get historyId() {
    return this.thread.historyId;
  }

  /**
   * Gets the subject from the first message in the thread
   *
   * This provides the original conversation subject, which typically
   * remains consistent throughout the thread's lifecycle.
   *
   * @returns The thread subject, or undefined if no messages exist
   */
  get subject(): string | undefined {
    if (this.messages.length === 0) {
      return "No messages";
    }

    return this.messages[0]!.subject;
  }
}
