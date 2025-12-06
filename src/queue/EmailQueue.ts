import { Resend } from "../resend";
import { RateLimiter } from "./RateLimiter";
import { getUniverse } from "../server/universe";

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
   * Get available domains for routing
   */
  private async getResendDomains(
    resendApiKey: string,
    resendApiRoot: string
  ): Promise<string[]> {
    try {
      const resend = new Resend(resendApiKey, resendApiRoot);
      return await resend.getDomains();
    } catch (error) {
      console.warn("Failed to fetch Resend domains:", error);
      return [];
    }
  }

  /**
   * Get Google Workspace domains
   */
  private getGSuiteDomains(): string[] {
    const universe = getUniverse();
    if (!universe || !universe.gsuite) {
      return [];
    }

    try {
      const orgConfigs = (universe.gsuite as any).orgConfigs;
      if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
        return [];
      }

      const domains: string[] = [];
      for (const orgConfig of Object.values(orgConfigs) as any[]) {
        for (const domain of orgConfig.domains) {
          if (domain.domainName) {
            domains.push(domain.domainName);
          }
        }
      }
      return domains;
    } catch (error) {
      console.warn("Failed to fetch GSuite domains:", error);
      return [];
    }
  }

  /**
   * Send emails (all or selected by IDs)
   * Routes emails to Resend or Gmail based on sender domain
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

    // Always create a copy to avoid modifying the queue while iterating
    const emailsToSend = ids === null 
      ? [...this.queue]  // Copy all emails
      : this.getByIds(ids);  // getByIds already returns a filtered copy

    if (emailsToSend.length === 0) {
      return {
        success: true,
        sent: 0,
        errors: 0,
        message: "No emails to send",
      };
    }

    // Get domains for routing
    const [resendDomains, gsuiteDomains] = await Promise.all([
      this.getResendDomains(resendApiKey, resendApiRoot),
      Promise.resolve(this.getGSuiteDomains()),
    ]);

    console.log(`Routing emails: ${resendDomains.length} Resend domains, ${gsuiteDomains.length} GSuite domains`);
    console.log(`Resend domains: ${resendDomains.join(", ")}`);
    console.log(`GSuite domains: ${gsuiteDomains.join(", ")}`);

    const resend = new Resend(resendApiKey, resendApiRoot);
    const universe = getUniverse();
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

          const isResendDomain = resendDomains.includes(fromDomain);
          const isGsuiteDomain = gsuiteDomains.includes(fromDomain);

          console.log(`Processing email from ${email.from} (domain: ${fromDomain}) - Resend: ${isResendDomain}, GSuite: ${isGsuiteDomain}`);

          // Domain was validated when queuing, so one of these must be true
          if (isResendDomain) {
            // Send via Resend
            console.log(`Sending email ${email.id} via Resend`);
            const response = await resend.sendEmail({
              from: email.from,
              to: email.to,
              subject: email.subject,
              html: `<p>${email.content}</p>`,
            });

            if (response.ok) {
              sent++;
              console.log(`Successfully sent email ${email.id} via Resend`);
              // Remove sent email from queue
              const index = this.queue.findIndex((e) => e.id === email.id);
              if (index !== -1) {
                this.queue.splice(index, 1);
              }
            } else {
              errors++;
              console.error(
                `Failed to send email ${email.id} via Resend: ${response.text}`
              );
            }
          } else if (isGsuiteDomain) {
            // Send via Gmail
            if (!universe || !universe.gsuite) {
              throw new Error("Google Workspace not connected");
            }

            try {
              console.log(`Sending email ${email.id} via Gmail`);
              // Use the "from" email as the GSuite user
              const gsuiteUser = universe.gsuite.user(email.from);
              const gmail = gsuiteUser.gmail();
              await gmail.send({
                to: email.to,
                subject: email.subject,
                body: email.content,
              });

              sent++;
              console.log(`Successfully sent email ${email.id} via Gmail`);
              // Remove sent email from queue
              const index = this.queue.findIndex((e) => e.id === email.id);
              if (index !== -1) {
                this.queue.splice(index, 1);
              }
            } catch (gmailError) {
              errors++;
              console.error(
                `Failed to send email ${email.id} via Gmail: ${
                  gmailError instanceof Error ? gmailError.message : String(gmailError)
                }`
              );
            }
          } else {
            // This should not happen since domain was validated when queuing
            // But handle it gracefully just in case
            errors++;
            console.error(
              `Unexpected: Unrecognized sender domain: ${fromDomain} for queued email ${email.id}. This should have been caught during validation.`
            );
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

// Export singleton instance
export const emailQueue = new EmailQueue();
