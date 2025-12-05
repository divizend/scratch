import { Resend } from "../resend";
import { RateLimiter } from "./RateLimiter";

export interface QueuedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  content: string;
  queuedAt: number;
}

export interface SendResult {
  success: boolean;
  sent: number;
  errors: number;
  message: string;
}

class EmailQueue {
  private queue: QueuedEmail[] = [];
  private isSending = false;
  private rateLimiter: RateLimiter;

  constructor(rateLimitDelayMs: number = 100) {
    this.rateLimiter = new RateLimiter(rateLimitDelayMs);
  }

  /**
   * Add an email to the queue
   */
  add(email: Omit<QueuedEmail, "id" | "queuedAt">): QueuedEmail {
    const queuedEmail: QueuedEmail = {
      ...email,
      id: crypto.randomUUID(),
      queuedAt: Date.now(),
    };
    this.queue.push(queuedEmail);
    return queuedEmail;
  }

  /**
   * Get all emails in the queue
   */
  getAll(): QueuedEmail[] {
    return [...this.queue];
  }

  /**
   * Get emails by IDs
   */
  getByIds(ids: string[]): QueuedEmail[] {
    return this.queue.filter((email) => ids.includes(email.id));
  }

  /**
   * Clear all emails from the queue
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Remove emails by IDs
   */
  removeByIds(ids: string[]): number {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter((email) => !ids.includes(email.id));
    return initialLength - this.queue.length;
  }

  /**
   * Check if emails are currently being sent
   */
  getIsSending(): boolean {
    return this.isSending;
  }

  /**
   * Send emails (all or selected by IDs)
   * @param ids - Array of email IDs to send, or null to send all
   * @param resendApiKey - Resend API key
   * @param resendApiRoot - Resend API root (default: "api.resend.com")
   * @returns Send result with statistics
   */
  async send(
    ids: string[] | null,
    resendApiKey: string,
    resendApiRoot: string = "api.resend.com"
  ): Promise<SendResult> {
    if (this.isSending) {
      throw new Error("Email sending already in progress");
    }

    const emailsToSend = ids === null ? this.queue : this.getByIds(ids);

    if (emailsToSend.length === 0) {
      return {
        success: true,
        sent: 0,
        errors: 0,
        message: "No emails to send",
      };
    }

    const resend = new Resend(resendApiKey, resendApiRoot);
    this.isSending = true;
    let sent = 0;
    let errors = 0;

    try {
      // Send emails with rate limiting
      await this.rateLimiter.process(emailsToSend, async (email) => {
        try {
          const response = await resend.sendEmail({
            from: email.from,
            to: email.to,
            subject: email.subject,
            html: `<p>${email.content}</p>`,
          });

          if (response.ok) {
            sent++;
            // Remove sent email from queue
            const index = this.queue.findIndex((e) => e.id === email.id);
            if (index !== -1) {
              this.queue.splice(index, 1);
            }
          } else {
            errors++;
          }
        } catch (error) {
          errors++;
        }
      });
    } finally {
      this.isSending = false;
    }

    return {
      success: true,
      sent,
      errors,
      message: `Sent ${sent} email(s)${
        errors > 0 ? `, ${errors} error(s)` : ""
      }`,
    };
  }
}

// Export singleton instance
export const emailQueue = new EmailQueue();
