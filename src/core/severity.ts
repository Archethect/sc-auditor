/**
 * Severity list validation for sc-auditor.
 *
 * Accepts string or array input, normalizes case, validates against
 * the allowed set [HIGH, MEDIUM, LOW, GAS], deduplicates, and returns
 * a canonically ordered array.
 */

import type { FindingSeverity } from "../types/finding.js";

/**
 * Allowed severity values for audit filtering, in canonical order.
 *
 * CRITICAL and INFORMATIONAL are excluded because CRITICAL findings are
 * always surfaced regardless of filter, and INFORMATIONAL is not used
 * in audit output filtering.
 *
 * The `satisfies` constraint ensures every element is a valid FindingSeverity
 * member at compile time.
 */
const ALLOWED_SEVERITIES = ["HIGH", "MEDIUM", "LOW", "GAS"] as const satisfies readonly FindingSeverity[];

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_SEVERITIES);

export type AllowedSeverity = (typeof ALLOWED_SEVERITIES)[number];

function validationError(message: string): Error {
  return new Error(`ERROR: SEVERITY_VALIDATION - ${message}`);
}

/** Parses raw input into a flat array of trimmed, uppercased tokens. */
function parseInput(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input
      .map((v) => {
        if (typeof v !== "string") {
          throw validationError(
            `expected string values in array, got ${typeof v}`,
          );
        }
        return v.trim().toUpperCase();
      })
      .filter((v) => v !== "");
  }

  if (typeof input !== "string") {
    throw validationError(
      `expected a string or string[], got ${typeof input}`,
    );
  }

  return input
    .split(/[,\s]+/)
    .map((v) => v.toUpperCase())
    .filter((v) => v !== "");
}

/**
 * Validates and normalizes a severity list input.
 *
 * Accepts a comma/space-delimited string or string array, normalizes to
 * uppercase, validates against the allowed set, deduplicates, and returns
 * results in canonical order: [HIGH, MEDIUM, LOW, GAS].
 *
 * @param input - A severity string or array of severity strings.
 * @returns A deduplicated, canonically ordered array of valid severity values.
 * @throws Error with "ERROR: SEVERITY_VALIDATION - <message>" on invalid input.
 */
export function validateSeverityList(
  input: string | string[],
): AllowedSeverity[] {
  const tokens = parseInput(input);

  if (tokens.length === 0) {
    throw validationError(
      "severity list must contain at least one valid value; allowed: HIGH, MEDIUM, LOW, GAS",
    );
  }

  const invalid = tokens.filter((t) => !ALLOWED_SET.has(t));

  if (invalid.length > 0) {
    throw validationError(
      `invalid severity value(s): ${invalid.join(", ")}; allowed: HIGH, MEDIUM, LOW, GAS`,
    );
  }

  // Filter canonical list by token membership: deduplicates and orders in one pass.
  const tokenSet = new Set(tokens);
  return ALLOWED_SEVERITIES.filter((s) => tokenSet.has(s));
}
