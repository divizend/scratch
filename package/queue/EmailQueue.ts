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

export interface EmailProfile {
  /** Array of domains this profile handles */
  domains: string[];
  /** Function to send an email using this profile */
  sendHandler: (email: QueuedEmail) => Promise<void>;
  /** Optional function to get domains dynamically (for validation) */
  getDomains?: () => Promise<string[]> | string[];
}

export class EmailQueue {
  private queue: QueuedEmail[] = [];
  private isSending = false;
  private rateLimiter: RateLimiter;
  private profiles: EmailProfile[];

  constructor(profiles: EmailProfile[], rateLimitDelayMs: number = 100) {
    this.profiles = profiles;
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
   * Get all domains from all profiles
   */
  async getAllDomains(): Promise<string[]> {
    const allDomains: string[] = [];

    for (const profile of this.profiles) {
      if (profile.getDomains) {
        const domains = await profile.getDomains();
        allDomains.push(
          ...(Array.isArray(domains) ? domains : await Promise.resolve(domains))
        );
      } else {
        allDomains.push(...profile.domains);
      }
    }

    return [...new Set(allDomains)]; // Remove duplicates
  }

  /**
   * Find the profile that handles a given domain
   */
  private async findProfileForDomain(
    domain: string
  ): Promise<EmailProfile | null> {
    for (const profile of this.profiles) {
      let profileDomains: string[] = [];

      if (profile.getDomains) {
        const domains = await profile.getDomains();
        profileDomains = Array.isArray(domains)
          ? domains
          : await Promise.resolve(domains);
      } else {
        profileDomains = profile.domains;
      }

      if (profileDomains.includes(domain)) {
        return profile;
      }
    }

    return null;
  }

  /**
   * Validate that a domain is handled by one of the profiles
   */
  async validateDomain(domain: string): Promise<boolean> {
    const profile = await this.findProfileForDomain(domain);
    return profile !== null;
  }

  /**
   * Send emails (all or selected by IDs)
   * Routes emails to appropriate profile handlers based on sender domain
   * @param ids - Array of email IDs to send, or null to send all
   * @returns Send result with statistics
   */
  async send(ids: string[] | null): Promise<SendResult> {
    if (this.isSending) {
      throw new Error("Email sending already in progress");
    }

    // Always create a copy to avoid modifying the queue while iterating
    const emailsToSend =
      ids === null
        ? [...this.queue] // Copy all emails
        : this.getByIds(ids); // getByIds already returns a filtered copy

    if (emailsToSend.length === 0) {
      return {
        success: true,
        sent: 0,
        errors: 0,
        message: "No emails to send",
      };
    }

    this.isSending = true;
    let sent = 0;
    let errors = 0;

    try {
      // Send emails with rate limiting
      // emailsToSend is already a copy, so safe to iterate
      await this.rateLimiter.process(emailsToSend, async (email) => {
        try {
          // Extract domain from sender email
          const fromDomain = email.from.split("@")[1];
          if (!fromDomain) {
            throw new Error(`Invalid sender email: ${email.from}`);
          }

          // Find the profile that handles this domain
          const profile = await this.findProfileForDomain(fromDomain);

          if (!profile) {
            // This should not happen since domain was validated when queuing
            // But handle it gracefully just in case
            errors++;
            console.error(
              `Unexpected: Unrecognized sender domain: ${fromDomain} for queued email ${email.id}. This should have been caught during validation.`
            );
            return;
          }

          // Send using the profile's handler
          await profile.sendHandler(email);

          sent++;
          // Remove sent email from queue
          const index = this.queue.findIndex((e) => e.id === email.id);
          if (index !== -1) {
            this.queue.splice(index, 1);
          }
        } catch (error) {
          errors++;
          console.error(
            `Error processing email ${email.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
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
