/**
 * GSuiteOrgConfig - Organization Configuration Container
 *
 * The GSuiteOrgConfig class holds configuration information for a specific
 * Google Workspace organization, including authentication details, domain
 * information, and administrative user settings.
 *
 * This class serves as a data container that encapsulates all the necessary
 * information to authenticate and operate within a specific organization's
 * Google Workspace environment.
 *
 * @class GSuiteOrgConfig
 * @version 1.0.0
 * @author Divizend GmbH
 */

import { JWT } from "google-auth-library";
import { admin_directory_v1 } from "googleapis";

export class GSuiteOrgConfig {
  /**
   * Creates a new GSuiteOrgConfig instance
   *
   * @param jwt - Function that creates JWT instances for organization users
   * @param domains - Array of domains associated with the organization
   * @param adminUser - Email address of the administrative user for the organization
   */
  constructor(
    public readonly jwt: (subject: string) => JWT,
    public readonly domains: admin_directory_v1.Schema$Domains[],
    public readonly adminUser: string
  ) {}

  /**
   * Creates a JWT authentication instance for a specific user
   *
   * This method uses the organization's service account credentials
   * to create a JWT token that can impersonate the specified user
   * within the organization's Google Workspace environment.
   *
   * @param subject - The email address of the user to authenticate as
   * @returns JWT instance configured for the specified user
   */
  getAuth(subject: string): JWT {
    return this.jwt(subject);
  }
}
