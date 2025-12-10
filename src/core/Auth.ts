/**
 * Auth - Authentication module for Universe
 *
 * Handles JWT token validation and signing
 */

import { jwtVerify, SignJWT } from "jose";
import { env } from "./Env";

export class Auth {
  private jwtSecretKey: Uint8Array | null;

  constructor() {
    const jwtSecret = env("WEB_UI_JWT_SECRET", {
      required: false,
      defaultValue: "",
    });
    this.jwtSecretKey = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;
  }

  /**
   * Validate JWT token and extract payload
   */
  async validateJwtToken(token: string): Promise<any | null> {
    if (!this.jwtSecretKey) {
      return null;
    }

    try {
      const { payload } = await jwtVerify(token, this.jwtSecretKey);
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Sign/create a JWT token
   */
  async signJwtToken(
    payload: { email: string },
    expirationTime: string = "30d"
  ): Promise<string> {
    if (!this.jwtSecretKey) {
      throw new Error("JWT secret not configured");
    }

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expirationTime)
      .sign(this.jwtSecretKey);

    return jwt;
  }

  /**
   * Check if JWT authentication is configured
   */
  isConfigured(): boolean {
    return this.jwtSecretKey !== null;
  }
}
