/**
 * URI System - Unified Resource Identification
 *
 * The URI system provides a standardized way to identify and reference
 * resources within the AI Executive system. It supports multiple protocols
 * and resource types, with Gmail integration as the primary use case.
 *
 * URI Format: protocol://domain/resource-type/id[/sub-resource]
 * Examples:
 * - gmail://user@domain.com/message/messageId
 * - gmail://user@domain.com/message/messageId/part/partId
 *
 * @module URI
 * @version 1.0.0
 * @author Divizend GmbH
 */

/**
 * Supported URI protocols for resource identification
 */
export enum URIProtocol {
  /** Gmail and Google Workspace resources */
  Gmail = "gmail",
}

/**
 * Types of resources that can be identified by URIs
 */
export enum URIType {
  /** Individual Gmail message */
  GmailMessage = "GmailMessage",
  /** Specific part of a Gmail message (attachment, body part) */
  GmailMessagePart = "GmailMessagePart",
}

/**
 * Base URI class for resource identification and parsing
 *
 * Provides a unified interface for accessing URI components and
 * validating URI structure across different protocols and resource types.
 */
export class URI {
  /**
   * Creates a new URI instance
   *
   * @param uri - The complete URI string
   * @param props - Parsed URI properties and components
   */
  constructor(
    public readonly uri: string,
    public readonly props: { [key: string]: string }
  ) {}

  /**
   * Parses a URI string and creates a URI instance
   *
   * This factory method validates the URI format and extracts
   * relevant components based on the protocol and resource type.
   *
   * @param uri - The URI string to parse
   * @returns URI instance with parsed properties
   * @throws Error if the URI format is invalid or unsupported
   */
  static fromString(uri: string): URI {
    const props: { [key: string]: string } = {};

    if (uri.startsWith("gmail://")) {
      const parts = uri.split("/");
      if (parts.length === 5 && parts[3] === "message") {
        // gmail://email/message/messageId
        props["protocol"] = URIProtocol.Gmail;
        props["type"] = URIType.GmailMessage;
        props["email"] = parts[2]!;
        props["messageId"] = parts[4]!;
      } else if (
        parts.length === 7 &&
        parts[3] === "message" &&
        parts[5] === "part"
      ) {
        // gmail://email/message/messageId/part/partId
        props["protocol"] = URIProtocol.Gmail;
        props["type"] = URIType.GmailMessagePart;
        props["email"] = parts[2]!;
        props["messageId"] = parts[4]!;
        props["partId"] = parts[6]!;
      } else {
        throw new Error(`Invalid Gmail URI format: ${uri}`);
      }
    } else {
      throw new Error("Invalid URI");
    }

    return new URI(uri, props);
  }

  /**
   * Retrieves a URI property by key
   *
   * @param key - The property key to retrieve
   * @returns The property value
   * @throws Error if the key is not found
   */
  get(key: string) {
    if (!this.props[key]) {
      throw new Error(`Key ${key} not found in URI ${this.uri}`);
    }

    return this.props[key];
  }

  /** The protocol used by this URI (e.g., "gmail") */
  get protocol() {
    return this.get("protocol");
  }

  /** The type of resource this URI identifies */
  get type() {
    return this.get("type");
  }
}

/**
 * Specialized URI class for Gmail message resources
 *
 * Provides type-safe access to Gmail message-specific URI components
 * and validates that the URI represents a Gmail message.
 */
export class GmailMessageURI extends URI {
  /**
   * Creates a GmailMessageURI from a URI string
   *
   * @param uri - The URI string to parse
   * @returns GmailMessageURI instance
   * @throws Error if the URI is not a valid Gmail message URI
   */
  static override fromString(uri: string): GmailMessageURI {
    return GmailMessageURI.fromURI(super.fromString(uri));
  }

  /**
   * Creates a GmailMessageURI from an existing URI instance
   *
   * @param uri - The URI instance to convert
   * @returns GmailMessageURI instance
   * @throws Error if the URI is not a Gmail message URI
   */
  static fromURI(uri: URI) {
    if (uri.type !== URIType.GmailMessage) {
      throw new Error(`Not a Gmail URI: ${uri.uri}`);
    }

    return new GmailMessageURI(uri.uri, uri.props);
  }

  /** The email address associated with this Gmail message */
  get email() {
    return this.get("email");
  }

  /** The unique identifier for this Gmail message */
  get messageId() {
    return this.get("messageId");
  }
}

/**
 * Specialized URI class for Gmail message part resources
 *
 * Extends GmailMessageURI to provide access to message part-specific
 * components like partId for attachments and body parts.
 */
export class GmailMessagePartURI extends GmailMessageURI {
  /**
   * Creates a GmailMessagePartURI from a URI string
   *
   * @param uri - The URI string to parse
   * @returns GmailMessagePartURI instance
   * @throws Error if the URI is not a valid Gmail message part URI
   */
  static override fromString(uri: string): GmailMessagePartURI {
    return GmailMessagePartURI.fromURI(super.fromString(uri));
  }

  /**
   * Creates a GmailMessagePartURI from an existing URI instance
   *
   * @param uri - The URI instance to convert
   * @returns GmailMessagePartURI instance
   * @throws Error if the URI is not a Gmail message part URI
   */
  static override fromURI(uri: URI) {
    if (uri.type !== URIType.GmailMessagePart) {
      throw new Error(`Not a Gmail message part URI: ${uri.uri}`);
    }

    return new GmailMessagePartURI(uri.uri, uri.props);
  }

  /** The unique identifier for this message part */
  get partId() {
    return this.get("partId");
  }
}
