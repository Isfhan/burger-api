/**
 * Environment Validation Plugin for BurgerAPI
 *
 * Official environment variable validation plugin that validates required
 * environment variables on startup before the server starts.
 *
 * @example
 * ```typescript
 * import { Burger } from "burger-api";
 * import { env } from "./ecosystem/plugins/env/env";
 *
 * const burger = new Burger();
 *
 * burger.usePlugin(env({
 *   required: {
 *     DATABASE_URL: { type: "url" },
 *     JWT_SECRET: { type: "string" },
 *     PORT: { type: "number", default: 3000 },
 *   },
 * }));
 * ```
 */

import type { Plugin } from "burger-api";

/**
 * Environment variable type
 */
export type EnvType = "string" | "number" | "boolean" | "url" | "json";

/**
 * Environment variable schema
 */
export interface EnvSchema {
  /**
   * Variable type
   */
  type: EnvType;

  /**
   * Default value (makes variable optional)
   */
  default?: unknown;

  /**
   * Custom validation function
   */
  validate?: (value: string) => boolean;

  /**
   * Description for error messages
   */
  description?: string;
}

/**
 * Environment validation plugin configuration
 */
export interface EnvOptions {
  /**
   * Required environment variables
   */
  required?: Record<string, EnvSchema>;

  /**
   * Optional environment variables with defaults
   */
  optional?: Record<string, EnvSchema>;

  /**
   * Whether to throw on missing/invalid variables (default: true)
   */
  throwOnError?: boolean;

  /**
   * Custom error handler
   */
  onError?: (errors: EnvError[]) => void;
}

/**
 * Environment validation error
 */
export interface EnvError {
  /**
   * Variable name
   */
  name: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Error type
   */
  type: "missing" | "invalid";
}

/**
 * Validate a value against a schema
 */
function validateValue(
  name: string,
  value: string | undefined,
  schema: EnvSchema,
  isRequired: boolean
): EnvError | null {
  // Check if required
  if (isRequired && (value === undefined || value === "")) {
    return {
      name,
      message: schema.description
        ? `Missing required environment variable: ${name} (${schema.description})`
        : `Missing required environment variable: ${name}`,
      type: "missing",
    };
  }

  // Check if optional with default
  if (value === undefined || value === "") {
    if (schema.default !== undefined) {
      // Apply default
      process.env[name] = String(schema.default);
    }
    return null;
  }

  // Validate type
  switch (schema.type) {
    case "string":
      // String is always valid
      break;

    case "number": {
      const num = Number(value);
      if (isNaN(num)) {
        return {
          name,
          message: `Invalid environment variable: ${name} must be a number, got "${value}"`,
          type: "invalid",
        };
      }
      break;
    }

    case "boolean": {
      const lower = value.toLowerCase();
      if (!["true", "false", "1", "0", "yes", "no"].includes(lower)) {
        return {
          name,
          message: `Invalid environment variable: ${name} must be a boolean, got "${value}"`,
          type: "invalid",
        };
      }
      break;
    }

    case "url": {
      try {
        new URL(value);
      } catch {
        return {
          name,
          message: `Invalid environment variable: ${name} must be a valid URL, got "${value}"`,
          type: "invalid",
        };
      }
      break;
    }

    case "json": {
      try {
        JSON.parse(value);
      } catch {
        return {
          name,
          message: `Invalid environment variable: ${name} must be valid JSON, got "${value}"`,
          type: "invalid",
        };
      }
      break;
    }
  }

  // Custom validation
  if (schema.validate && !schema.validate(value)) {
    return {
      name,
      message: `Invalid environment variable: ${name} failed custom validation`,
      type: "invalid",
    };
  }

  return null;
}

/**
 * Create environment validation plugin
 *
 * @param options - Plugin configuration
 * @returns Plugin instance
 *
 * @example
 * ```typescript
 * burger.usePlugin(env({
 *   required: {
 *     DATABASE_URL: { type: "url" },
 *     JWT_SECRET: { type: "string" },
 *   },
 *   optional: {
 *     PORT: { type: "number", default: 3000 },
 *     LOG_LEVEL: { type: "string", default: "info" },
 *   },
 * }));
 * ```
 */
export function env(options: EnvOptions = {}): Plugin {
  const {
    required = {},
    optional = {},
    throwOnError = true,
    onError,
  } = options;

  return {
    name: "env",

    hooks: {
      onRequest: () => {
        // Validate environment variables on first request
        const errors: EnvError[] = [];

        // Validate required variables
        for (const [name, schema] of Object.entries(required)) {
          const error = validateValue(name, process.env[name], schema, true);
          if (error) {
            errors.push(error);
          }
        }

        // Validate optional variables
        for (const [name, schema] of Object.entries(optional)) {
          const error = validateValue(name, process.env[name], schema, false);
          if (error) {
            errors.push(error);
          }
        }

        // Handle errors
        if (errors.length > 0) {
          if (onError) {
            onError(errors);
          }

          if (throwOnError) {
            const missing = errors.filter((e) => e.type === "missing");
            const invalid = errors.filter((e) => e.type === "invalid");

            let message = "Environment validation failed:\n";
            if (missing.length > 0) {
              message += `Missing: ${missing.map((e) => e.name).join(", ")}\n`;
            }
            if (invalid.length > 0) {
              message += `Invalid: ${invalid.map((e) => `${e.name} - ${e.message}`).join(", ")}\n`;
            }

            throw new Error(message);
          }
        }
      },
    },
  };
}
