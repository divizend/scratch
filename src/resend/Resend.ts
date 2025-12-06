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
   * Automatically reads API key from RESEND_API_KEY environment variable
   * and API root from RESEND_API_ROOT (defaults to "api.resend.com")
   *
   * @param apiKey - Optional Resend API key (overrides RESEND_API_KEY env var)
   * @param apiRoot - Optional Resend API root URL (overrides RESEND_API_ROOT env var, defaults to "api.resend.com")
   * @throws Error if API key is not provided and RESEND_API_KEY is not set
   */
  constructor(apiKey?: string, apiRoot?: string) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY || "";
    if (!this.apiKey) {
      throw new Error(
        "Resend API key is required. Provide it via constructor parameter or RESEND_API_KEY environment variable."
      );
    }
    this.apiRoot = apiRoot || process.env.RESEND_API_ROOT || "api.resend.com";
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
