/**
 * Universe - Central System Orchestrator
 *
 * Please put ALL other APIs in here.
 *
 * @class Universe
 * @version 1.0.0
 * @author Divizend GmbH
 */

import {
  Fragment,
  GSuite,
  GmailMessage,
  GmailMessagePart,
  URI,
  URIType,
  EmailQueue,
  EmailProfile,
  QueuedEmail,
  Resend,
  JsonSchemaValidator,
  S2,
} from "..";

/**
 * Enumeration of available Universe modules
 */
export enum UniverseModule {
  /** GSuite integration for Gmail and Google Workspace services */
  GSuite = "gsuite",
  /** Resend email service integration */
  Resend = "resend",
  /** Email queue for managing and sending emails */
  EmailQueue = "emailQueue",
  /** S2 streamstore for durable stream storage */
  S2 = "s2",
}

export class Universe {
  /** GSuite integration for Gmail and Google Workspace services */
  public gsuite!: GSuite;
  /** Email queue for managing and sending emails */
  public emailQueue!: EmailQueue;
  /** Resend email service integration */
  public resend?: Resend;
  /** S2 streamstore for durable stream storage */
  public s2!: S2;
  /** JSON Schema validator for request validation */
  public jsonSchemaValidator: JsonSchemaValidator = new JsonSchemaValidator();

  /**
   * Constructs and initializes a new Universe instance
   *
   * This factory method creates a Universe and initializes all its subsystems
   * in parallel for optimal performance. The method ensures proper dependency
   * injection and initialization order.
   *
   * @returns Promise<Universe> - Fully initialized Universe instance
   * @throws Error if any subsystem fails to initialize
   */
  static async construct(
    { gsuite: initGSuite }: { gsuite?: boolean } = {
      gsuite: true,
    }
  ): Promise<Universe> {
    const universe = new Universe();

    // Initialize all subsystems in parallel for optimal performance
    const [gsuite] = await Promise.all([
      initGSuite ? GSuite.construct(universe) : Promise.resolve(undefined),
    ]);

    universe.gsuite = gsuite!;

    // Initialize Resend (fetches domains once during construction)
    try {
      universe.resend = await Resend.construct();
    } catch (error) {
      // Resend not configured - this is optional, so we continue without it
      console.warn(
        "Resend not initialized:",
        error instanceof Error ? error.message : String(error)
      );
    }

    // Initialize S2 streamstore (required)
    try {
      universe.s2 = S2.construct();
    } catch (error) {
      throw new Error(
        `S2 streamstore is required but failed to initialize: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Initialize email queue with profiles
    const profiles: EmailProfile[] = [];

    // Resend profile
    if (universe.resend) {
      // Fetch domains once during profile creation
      const resendDomains = universe.resend.getDomains();
      profiles.push({
        domains: resendDomains, // Use cached domains
        getDomains: () => {
          // Return cached domains synchronously
          return universe.resend!.getDomains();
        },
        sendHandler: async (email: QueuedEmail) => {
          const response = await universe.resend!.sendEmail({
            from: email.from,
            to: email.to,
            subject: email.subject,
            html: `<p>${email.content}</p>`,
          });

          if (!response.ok) {
            throw new Error(
              `Failed to send email via Resend: ${response.text}`
            );
          }
        },
      });
    }

    // GSuite profile
    if (universe.gsuite) {
      profiles.push({
        domains: [], // Will be populated dynamically
        getDomains: () => {
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
        },
        sendHandler: async (email: QueuedEmail) => {
          if (!universe.gsuite) {
            throw new Error("Google Workspace not connected");
          }

          // Use the "from" email as the GSuite user
          const gsuiteUser = universe.gsuite.user(email.from);
          const gmail = gsuiteUser.gmail();
          await gmail.send({
            to: email.to,
            subject: email.subject,
            body: email.content,
          });
        },
      });
    }

    universe.emailQueue = new EmailQueue(profiles);
    return universe;
  }

  /**
   * Retrieves a fragment by its URI identifier
   *
   * This method serves as the central entry point for accessing any content
   * in the system. It parses the URI, determines the content type, and
   * delegates to the appropriate fragment factory method.
   *
   * Supported URI types:
   * - GmailMessage: Individual email messages
   * - GmailMessagePart: Email attachments and body parts
   *
   * @param uri - String URI identifying the fragment to retrieve
   * @returns Promise<Fragment> - The requested fragment instance
   * @throws Error if the URI type is unknown or fragment creation fails
   */
  /**
   * Check if a specific module is available in this Universe instance
   * @param module - The module to check
   * @returns true if the module is available, false otherwise
   */
  hasModule(module: UniverseModule): boolean {
    switch (module) {
      case UniverseModule.GSuite:
        return !!this.gsuite;
      case UniverseModule.Resend:
        return !!this.resend;
      case UniverseModule.EmailQueue:
        return !!this.emailQueue;
      case UniverseModule.S2:
        return !!this.s2;
      default:
        return false;
    }
  }

  /**
   * Check if all specified modules are available
   * @param modules - Array of modules to check
   * @returns true if all modules are available, false otherwise
   */
  hasModules(modules: UniverseModule[]): boolean {
    return modules.every((module) => this.hasModule(module));
  }

  async getFragment(uri: string): Promise<Fragment> {
    const parsedUri = URI.fromString(uri);

    switch (parsedUri.type) {
      case URIType.GmailMessage: {
        return GmailMessage.fromURI(this, parsedUri);
      }
      case URIType.GmailMessagePart: {
        return GmailMessagePart.fromURI(this, parsedUri);
      }
      default: {
        throw new Error(`Unknown URI type: ${parsedUri.type}`);
      }
    }
  }

  /**
   * Checks the health of all services in the Universe
   * Aggregates health status from all configured services
   *
   * @returns Promise<{ status: string; services: { [key: string]: any } }>
   */
  async getHealth(): Promise<{
    status: string;
    services: { [key: string]: any };
  }> {
    const health: any = {
      status: "ok",
      services: {},
    };

    // Check GSuite
    if (this.gsuite) {
      health.services.gsuite = await this.gsuite.getHealth();
    }

    // Check Resend
    if (this.resend) {
      health.services.resend = this.resend.getHealth();
    } else {
      health.services.resend = {
        status: "warning",
        message: "RESEND_API_KEY not configured",
        connected: false,
      };
    }

    // Check S2
    if (this.s2) {
      health.services.s2 = await this.s2.getHealth();
    }

    // Determine overall status
    const hasErrors = Object.values(health.services).some(
      (service: any) => service.status === "error"
    );
    if (hasErrors) {
      health.status = "error";
    } else {
      const hasWarnings = Object.values(health.services).some(
        (service: any) => service.status === "warning"
      );
      if (hasWarnings) {
        health.status = "warning";
      }
    }

    return health;
  }
}
