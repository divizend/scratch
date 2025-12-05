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
