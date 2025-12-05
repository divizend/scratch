/**
 * GSuite - Google Workspace Integration Manager
 *
 * The GSuite class manages integration with Google Workspace (formerly G Suite)
 * services including Gmail, Google Drive, Google Sheets, and Google Docs.
 *
 * This class handles:
 * - Multi-organization Google Workspace setup
 * - Service account authentication and JWT management
 * - User directory management and domain validation
 * - Centralized access to all Google Workspace APIs
 *
 * The system supports multiple organizations, each with their own service account
 * credentials, enabling enterprise-scale deployments with proper isolation.
 *
 * @class GSuite
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { JWT } from "google-auth-library";
import { admin_directory_v1 } from "googleapis";
import { GSuiteOrgConfig, GSuiteUser, Universe } from "../..";

export class GSuite {
  /**
   * Creates a new GSuite instance
   *
   * @param universe - Reference to the central Universe instance
   * @param orgConfigs - Configuration for each organization
   * @param usersDirectory - Cached user directory data for performance
   */
  constructor(
    private readonly universe: Universe,
    private readonly orgConfigs: { [org: string]: GSuiteOrgConfig },
    private readonly usersDirectory: {
      [email: string]: admin_directory_v1.Schema$User;
    }
  ) {}

  /**
   * Constructs and initializes a GSuite instance
   *
   * This factory method performs the following initialization steps:
   * 1. Parses environment variables for GCP credentials
   * 2. Creates JWT authentication functions for each organization
   * 3. Fetches domain and user information for each organization
   * 4. Builds the user directory cache for efficient lookups
   *
   * Environment Variables Required:
   * - GCP_CLIENT_EMAIL_<identifier>: Service account email
   * - GCP_PRIVATE_KEY_<identifier>: Service account private key
   * - GCP_ADMIN_USER_<identifier>: Admin user email for the organization
   *
   * @param universe - Reference to the central Universe instance
   * @returns Promise<GSuite> - Fully initialized GSuite instance
   * @throws Error if required credentials are missing or invalid
   */
  static async construct(universe: Universe) {
    // Group environment variables by organization identifier
    let gcpCreds: {
      [key: string]: {
        clientEmail?: string;
        privateKey?: string;
        adminUser?: string;
      };
    } = {};

    // Parse environment variables for each organization
    for (const key of Object.keys(process.env)) {
      if (
        key.startsWith("GCP_CLIENT_EMAIL_") ||
        key.startsWith("GCP_PRIVATE_KEY_") ||
        key.startsWith("GCP_ADMIN_USER_")
      ) {
        const identifier = key.split("_", 4)[3]!.toLowerCase();
        if (!gcpCreds[identifier]) {
          gcpCreds[identifier] = {};
        }
        gcpCreds[identifier][
          key.startsWith("GCP_CLIENT_EMAIL_")
            ? "clientEmail"
            : key.startsWith("GCP_PRIVATE_KEY_")
            ? "privateKey"
            : "adminUser"
        ] = process.env[key]!;
      }
    }

    // Validate that credentials are provided
    if (Object.keys(gcpCreds).length === 0) {
      throw new Error(
        "No GCP credentials found. Please set GCP_CLIENT_EMAIL_<identifier>, GCP_PRIVATE_KEY_<identifier> and GCP_ADMIN_USER_<identifier> environment variables."
      );
    }

    const orgConfigs: {
      [org: string]: GSuiteOrgConfig;
    } = {};

    const rawAuths: { [org: string]: (subject: string) => JWT } = {};

    // Create JWT authentication functions for each organization
    for (const [identifier, creds] of Object.entries(gcpCreds)) {
      if (!creds.clientEmail || !creds.privateKey || !creds.adminUser) {
        throw new Error(
          `Missing GCP credentials for ${identifier}. Please set GCP_CLIENT_EMAIL_${identifier}, GCP_PRIVATE_KEY_${identifier} and GCP_ADMIN_USER_${identifier} environment variables.`
        );
      }

      // Create JWT authentication with required scopes
      rawAuths[identifier] = (subject: string) =>
        new JWT({
          email: creds.clientEmail!,
          key: creds.privateKey!,
          scopes: [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.settings.sharing",
            "https://www.googleapis.com/auth/admin.directory.user.readonly",
            "https://www.googleapis.com/auth/admin.directory.domain.readonly",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/documents",
          ],
          subject,
        });
    }

    // Initialize organization configurations and user directory
    const usersDirectory: { [email: string]: admin_directory_v1.Schema$User } =
      {};

    for (const [identifier, rawAuth] of Object.entries(rawAuths)) {
      const adminUser = gcpCreds[identifier]!.adminUser!;

      // Create admin user instance and fetch organization data
      const admin = new GSuiteUser(
        universe,
        rawAuth(adminUser),
        usersDirectory[adminUser]!
      ).admin();

      // Fetch domains for the organization
      const domains = await admin.getDomains();
      orgConfigs[identifier] = new GSuiteOrgConfig(rawAuth, domains, adminUser);

      console.warn(
        `${identifier} has ${orgConfigs[identifier].domains.length} domains`
      );

      // Fetch and cache user directory information
      const users = await admin.getUsers();
      for (const user of users) {
        usersDirectory[user.primaryEmail!] = user;
      }

      console.warn(`${identifier} has ${users.length} users`);
      for (const user of users) {
        console.log(user.primaryEmail);
      }
    }

    return new GSuite(universe, orgConfigs, usersDirectory);
  }

  /**
   * Creates a GSuiteUser instance for the specified email address
   *
   * This method:
   * 1. Determines which organization the user belongs to based on email domain
   * 2. Retrieves the appropriate authentication configuration
   * 3. Fetches user directory data for the specified user
   * 4. Returns a configured GSuiteUser instance with proper permissions
   *
   * @param email - The user's email address
   * @returns GSuiteUser instance configured for the specified user
   * @throws Error if the user's domain is not found or user is not in directory
   */
  user(email: string): GSuiteUser {
    // Find the organization configuration based on email domain
    const emailDomain = email.split("@")[1]!;
    const orgConfig = Object.values(this.orgConfigs).find((orgConfig) =>
      orgConfig.domains.some((domain) => domain.domainName === emailDomain)
    );

    if (!orgConfig) {
      throw new Error(`Domain of ${email} not found in any organization`);
    }

    // Retrieve user directory data for authentication and permissions
    const directoryData = this.usersDirectory[email];
    if (!directoryData) {
      throw new Error(`User ${email} not found in directory`);
    }

    // Create and return configured user instance
    return new GSuiteUser(
      this.universe,
      orgConfig.getAuth(email),
      directoryData
    );
  }
}
