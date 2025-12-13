/**
 * Environment Variable Utility
 *
 * Provides a centralized way to access and validate environment variables
 * with consistent error messages and validation logic.
 *
 * @module Env
 */

/**
 * Gets an environment variable with optional validation
 *
 * @param name - The name of the environment variable
 * @param options - Optional configuration
 * @param options.required - If true, throws an error if the variable is not set (default: true)
 * @param options.defaultValue - Default value if the variable is not set (only used if required is false)
 * @param options.errorMessage - Custom error message if the variable is required but not set
 * @returns The environment variable value
 * @throws Error if the variable is required but not set
 */
export function env(
  name: string,
  options?: {
    required?: boolean;
    defaultValue?: string;
    errorMessage?: string;
  }
): string {
  const value = process.env[name];
  const required = options?.required !== false; // Default to true

  if (!value) {
    if (required) {
      const errorMessage =
        options?.errorMessage ||
        `${name} environment variable is required but not set`;
      throw new Error(errorMessage);
    }
    return options?.defaultValue || "";
  }

  return value;
}

/**
 * Gets a value from a parameter or falls back to an environment variable
 * Throws an error if neither is provided
 *
 * @param param - The parameter value (can be undefined)
 * @param envVarName - The name of the environment variable to use as fallback
 * @param errorMessage - Error message to throw if neither param nor env var is set
 * @returns The parameter value or the environment variable value
 * @throws Error if both param and env var are not set
 *
 * @example
 * const apiKey = envOr(providedKey, "API_KEY", "API key is required");
 */
export function envOr(
  param: string | undefined,
  envVarName: string,
  errorMessage: string
): string {
  if (param) {
    return param;
  }
  const envValue = process.env[envVarName];
  if (!envValue) {
    throw new Error(errorMessage);
  }
  return envValue;
}

/**
 * Gets a value from a parameter or falls back to an environment variable with a default
 * Returns the default if neither is provided
 *
 * @param param - The parameter value (can be undefined)
 * @param envVarName - The name of the environment variable to use as fallback
 * @param defaultValue - Default value if neither param nor env var is set
 * @returns The parameter value, environment variable value, or default value
 *
 * @example
 * const port = envOrDefault(providedPort, "PORT", "3000");
 */
export function envOrDefault(
  param: string | undefined,
  envVarName: string,
  defaultValue: string
): string {
  if (param) {
    return param;
  }
  return process.env[envVarName] || defaultValue;
}

/**
 * Parses environment variables grouped by a common prefix pattern
 *
 * Scans all environment variables and groups them by identifier extracted from the prefix.
 * Useful for parsing variables like GCP_CLIENT_EMAIL_ORG1, GCP_PRIVATE_KEY_ORG1, etc.
 *
 * @param prefixes - Array of prefix patterns to match (e.g., ["GCP_CLIENT_EMAIL_", "GCP_PRIVATE_KEY_"])
 * @param options - Configuration options
 * @param options.propertyMap - Maps each prefix to a property name in the result object
 * @param options.identifierExtractor - Function to extract identifier from env var name (default: splits by "_" and takes 4th segment, lowercased)
 * @param options.required - If true, throws error if no matching env vars found (default: true)
 * @param options.errorMessage - Custom error message if no env vars found
 * @returns Object grouped by identifier, each containing properties mapped from prefixes
 * @throws Error if required is true and no matching env vars are found
 *
 * @example
 * // For env vars: GCP_CLIENT_EMAIL_ORG1=..., GCP_PRIVATE_KEY_ORG1=..., GCP_ADMIN_USER_ORG1=...
 * const creds = parseEnvGroup(
 *   ["GCP_CLIENT_EMAIL_", "GCP_PRIVATE_KEY_", "GCP_ADMIN_USER_"],
 *   {
 *     propertyMap: {
 *       "GCP_CLIENT_EMAIL_": "clientEmail",
 *       "GCP_PRIVATE_KEY_": "privateKey",
 *       "GCP_ADMIN_USER_": "adminUser",
 *     }
 *   }
 * );
 * // Returns: { org1: { clientEmail: "...", privateKey: "...", adminUser: "..." } }
 */
export function parseEnvGroup<T extends Record<string, string>>(
  prefixes: string[],
  options: {
    propertyMap: { [prefix: string]: keyof T };
    identifierExtractor?: (key: string, prefix: string) => string;
    required?: boolean;
    errorMessage?: string;
  }
): { [identifier: string]: Partial<T> } {
  const result: { [identifier: string]: Partial<T> } = {};
  const identifierExtractor =
    options.identifierExtractor ||
    ((key: string, prefix: string) => {
      // Default: split by "_" and take the part after the prefix
      // For "GCP_CLIENT_EMAIL_ORG1", prefix is "GCP_CLIENT_EMAIL_", identifier is "org1"
      const parts = key.split("_");
      // Find which prefix matched and get the identifier part
      for (const p of prefixes) {
        if (key.startsWith(p)) {
          // For "GCP_CLIENT_EMAIL_ORG1", split gives ["GCP", "CLIENT", "EMAIL", "ORG1"]
          // We want the part after the prefix, so we need to count underscores in prefix
          const prefixParts = p.split("_").filter((x) => x);
          const identifier = parts.slice(prefixParts.length).join("_");
          return identifier.toLowerCase();
        }
      }
      return "";
    });

  // Scan all environment variables
  for (const key of Object.keys(process.env)) {
    // Find matching prefix
    for (const prefix of prefixes) {
      if (key.startsWith(prefix)) {
        const identifier = identifierExtractor(key, prefix);
        if (!identifier) continue;

        if (!result[identifier]) {
          result[identifier] = {};
        }

        const propertyName = options.propertyMap[prefix];
        if (propertyName) {
          (result[identifier] as any)[propertyName] = process.env[key];
        }
        break; // Only match first prefix
      }
    }
  }

  // Validate that we found at least one group
  if (Object.keys(result).length === 0 && options.required !== false) {
    const errorMessage =
      options.errorMessage ||
      `No environment variables found matching prefixes: ${prefixes.join(
        ", "
      )}`;
    throw new Error(errorMessage);
  }

  return result;
}
