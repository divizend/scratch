/**
 * Resend - Email Service Adapter
 *
 * The Resend class provides an adapter for the Resend email service API,
 * abstracting the HTTP calls and configuration.
 *
 * @class Resend
 * @version 1.0.0
 */

export interface ResendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface ResendResponse {
  ok: boolean;
  status: number;
  text: string;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export class Resend {
  private apiKey: string;
  private apiRoot: string;

  /**
   * Creates a new Resend instance
   *
   * @param apiKey - Resend API key
   * @param apiRoot - Resend API root URL (e.g., "api.resend.com")
   */
  constructor(apiKey: string, apiRoot: string = "api.resend.com") {
    this.apiKey = apiKey;
    this.apiRoot = apiRoot;
  }

  /**
   * Gets all domains from Resend API
   *
   * @returns Promise<string[]> - Array of domain names
   */
  async getDomains(): Promise<string[]> {
    const url = `https://${this.apiRoot}/domains`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch Resend domains: ${text}`);
    }

    const data = await response.json();
    const domains: ResendDomain[] = data.data || [];

    // Extract domain names and filter by verified status
    return domains
      .filter((domain) => domain.status === "verified")
      .map((domain) => domain.name);
  }

  /**
   * Sends an email via Resend API
   *
   * @param params - Email parameters
   * @returns Promise<ResendResponse> - Response from Resend API
   */
  async sendEmail(params: ResendEmailParams): Promise<ResendResponse> {
    const url = `https://${this.apiRoot}/emails`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  }
}
