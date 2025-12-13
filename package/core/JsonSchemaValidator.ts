/**
 * JSON Schema Validator - Schema Validation Utilities
 *
 * Provides JSON schema validation functionality for the Universe system.
 * Uses a default implementation that can be extended or replaced.
 *
 * @module JsonSchemaValidator
 * @version 1.0.0
 */

export interface JsonSchema {
  type: "object";
  properties?: {
    [key: string]: {
      type: "string" | "number" | "boolean" | "array" | "object";
      default?: any;
      description?: string;
      enum?: any[];
      items?: JsonSchema | { type: string };
      required?: boolean;
      [key: string]: any; // Allow additional JSON schema properties
    };
  };
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: any; // Allow additional JSON schema properties
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any; // Validated and coerced data
}

/**
 * Abstract JSON Schema Validator
 * Provides a default implementation that can be extended
 */
export class JsonSchemaValidator {
  /**
   * Validates data against a JSON schema
   * Default implementation performs basic validation
   *
   * @param schema - JSON schema to validate against
   * @param data - Data to validate
   * @returns ValidationResult with validation status and errors
   */
  validate(schema: JsonSchema, data: any): ValidationResult {
    const errors: string[] = [];
    const validated: any = {};

    if (!schema || schema.type !== "object") {
      return {
        valid: false,
        errors: ["Schema must be an object type"],
      };
    }

    // Check required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (
          !(prop in data) ||
          data[prop] === undefined ||
          data[prop] === null ||
          data[prop] === ""
        ) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
    }

    // Validate and coerce properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const value = data[key];

        // Apply default if value is missing
        if (
          (value === undefined || value === null || value === "") &&
          propSchema.default !== undefined
        ) {
          validated[key] = propSchema.default;
          continue;
        }

        // Skip validation if property is not required and not provided
        const isRequired = schema.required?.includes(key) ?? false;
        if (
          !isRequired &&
          (value === undefined || value === null || value === "")
        ) {
          continue;
        }

        // Type validation and coercion
        if (value !== undefined && value !== null && value !== "") {
          const coerced = this.coerceValue(value, propSchema);
          if (coerced === null) {
            errors.push(
              `Property ${key} has invalid type. Expected ${propSchema.type}`
            );
          } else {
            validated[key] = coerced;
          }
        } else if (isRequired) {
          errors.push(`Missing required property: ${key}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: validated,
    };
  }

  /**
   * Coerces a value to match the schema type
   *
   * @private
   * @param value - Value to coerce
   * @param propSchema - Property schema definition
   * @returns Coerced value or null if coercion fails
   */
  private coerceValue(value: any, propSchema: any): any {
    const expectedType = propSchema.type;

    switch (expectedType) {
      case "string":
        return String(value);
      case "number":
        const num = Number(value);
        return isNaN(num) ? null : num;
      case "boolean":
        if (typeof value === "string") {
          return value === "true" || value === "1";
        }
        return Boolean(value);
      case "array":
        if (Array.isArray(value)) {
          return value;
        }
        // Try to parse as JSON array
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          // Not valid JSON
        }
        return null;
      case "object":
        if (typeof value === "object" && value !== null) {
          return value;
        }
        // Try to parse as JSON object
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === "object" && parsed !== null) {
            return parsed;
          }
        } catch {
          // Not valid JSON
        }
        return null;
      default:
        return value;
    }
  }
}
