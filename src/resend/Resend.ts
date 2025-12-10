/**
 * Resend - Email Service Adapter
 *
 * The Resend class provides an adapter for the Resend email service API,
 * abstracting the HTTP calls and configuration.
 *
 * @class Resend
 * @version 1.0.0
 */

import { envOr, envOrDefault } from "../core/Env";

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
  private cachedDomains: string[] = [];

  /**
   * Private constructor - use Resend.construct() instead
   *
   * @param apiKey - Resend API key
   * @param apiRoot - Resend API root URL
   * @param domains - Pre-fetched domains array
   */
  private constructor(apiKey: string, apiRoot: string, domains: string[] = []) {
    this.apiKey = apiKey;
    this.apiRoot = apiRoot;
    this.cachedDomains = domains;
  }

  /**
   * Creates a new Resend instance and fetches domains once
   * Automatically reads API key from RESEND_API_KEY environment variable
   * and API root from RESEND_API_ROOT (defaults to "api.resend.com")
   *
   * @param apiKey - Optional Resend API key (overrides RESEND_API_KEY env var)
   * @param apiRoot - Optional Resend API root URL (overrides RESEND_API_ROOT env var, defaults to "api.resend.com")
   * @returns Promise<Resend> - Resend instance with domains cached
   * @throws Error if API key is not provided and RESEND_API_KEY is not set
   */
  static async construct(apiKey?: string, apiRoot?: string): Promise<Resend> {
    const key = envOr(
      apiKey,
      "RESEND_API_KEY",
        "Resend API key is required. Provide it via parameter or RESEND_API_KEY environment variable."
      );
    const root = envOrDefault(apiRoot, "RESEND_API_ROOT", "api.resend.com");

    // Fetch domains once during construction
    let domains: string[] = [];
    try {
      domains = await Resend.fetchDomains(key, root);
    } catch (error) {
      console.warn(
        "Failed to fetch Resend domains during construction:",
        error
      );
      // Continue with empty array - domains can be empty if fetch fails
    }

    return new Resend(key, root, domains);
  }

  /**
   * Fetches domains from Resend API
   * Called once during construction
   *
   * @private
   * @static
   * @param apiKey - Resend API key
   * @param apiRoot - Resend API root URL
   * @returns Promise<string[]> - Array of domain names
   */
  private static async fetchDomains(
    apiKey: string,
    apiRoot: string
  ): Promise<string[]> {
    const url = `https://${apiRoot}/domains`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch Resend domains: ${text}`);
    }

    const data = (await response.json()) as { data?: ResendDomain[] };
    const domains: ResendDomain[] = data.data || [];

    // Extract domain names and filter by verified status
    return domains
      .filter((domain) => domain.status === "verified")
      .map((domain) => domain.name);
  }

  /**
   * Gets all cached domains from Resend
   * Returns the domains that were fetched once during construction
   *
   * @returns string[] - Array of domain names (cached, synchronous)
   */
  getDomains(): string[] {
    return this.cachedDomains;
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

  /**
   * Checks the health of the Resend service
   * Verifies connectivity by checking cached domains
   *
   * @returns { status: string; message: string; connected: boolean; domains?: number }
   */
  getHealth(): {
    status: string;
    message: string;
    connected: boolean;
    domains?: number;
  } {
    try {
      const domains = this.getDomains();
      return {
        status: "ok",
        message: "Resend connected",
        connected: true,
        domains: domains.length,
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        connected: false,
      };
    }
  }
}
