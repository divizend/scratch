/**
 * Universe - Central System Orchestrator
 *
 * The Universe class serves as the central hub for the AI Executive system,
 * coordinating all major components and providing a unified interface for
 * accessing system functionality.
 *
 * The Universe manages:
 * - GSuite integration for Gmail and Google Workspace services
 * - Divizend business logic and workflow automation
 * - Fragment resolution and serving across different content types
 *
 * This class implements the Facade pattern, providing a simplified interface
 * to the complex subsystems while maintaining loose coupling between components.
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
} from "..";

export class Universe {
  /** GSuite integration for Gmail and Google Workspace services */
  public gsuite!: GSuite;

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
}
