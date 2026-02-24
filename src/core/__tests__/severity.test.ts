import { describe, expect, it } from "vitest";
import { validateSeverityList } from "../severity.js";

describe("validateSeverityList", () => {
  describe("AC1: valid severity input returns normalized array", () => {
    it("accepts and normalizes a single valid string 'HIGH'", () => {
      expect(validateSeverityList("HIGH")).toEqual(["HIGH"]);
    });

    it("accepts and normalizes an array of valid values", () => {
      expect(validateSeverityList(["HIGH", "MEDIUM", "LOW"])).toEqual([
        "HIGH",
        "MEDIUM",
        "LOW",
      ]);
    });

    it("accepts all four valid severity values", () => {
      expect(
        validateSeverityList(["HIGH", "MEDIUM", "LOW", "GAS"]),
      ).toEqual(["HIGH", "MEDIUM", "LOW", "GAS"]);
    });

    it("accepts a single-element array", () => {
      expect(validateSeverityList(["GAS"])).toEqual(["GAS"]);
    });

    it("returns only uppercase values from the valid set", () => {
      const result = validateSeverityList("medium");
      expect(result).toEqual(["MEDIUM"]);
      for (const val of result) {
        expect(val).toBe(val.toUpperCase());
        expect(["HIGH", "MEDIUM", "LOW", "GAS"]).toContain(val);
      }
    });

    it("parses comma-delimited string into array", () => {
      expect(validateSeverityList("HIGH,MEDIUM,LOW")).toEqual([
        "HIGH",
        "MEDIUM",
        "LOW",
      ]);
    });

    it("parses space-delimited string into array", () => {
      expect(validateSeverityList("HIGH MEDIUM LOW")).toEqual([
        "HIGH",
        "MEDIUM",
        "LOW",
      ]);
    });

    it("parses comma-and-space-delimited string into array", () => {
      expect(validateSeverityList("HIGH, MEDIUM, LOW")).toEqual([
        "HIGH",
        "MEDIUM",
        "LOW",
      ]);
    });

    it("parses tab-delimited string into array", () => {
      expect(validateSeverityList("HIGH\tMEDIUM\tLOW")).toEqual([
        "HIGH",
        "MEDIUM",
        "LOW",
      ]);
    });

    it("parses newline-delimited string into array", () => {
      expect(validateSeverityList("HIGH\nMEDIUM\nLOW")).toEqual([
        "HIGH",
        "MEDIUM",
        "LOW",
      ]);
    });

    it("handles leading and trailing commas in string input", () => {
      expect(validateSeverityList(",HIGH,MEDIUM,")).toEqual([
        "HIGH",
        "MEDIUM",
      ]);
    });

    it("throws on comma-only string input", () => {
      expect(() => validateSeverityList(",,,  ,,")).toThrow(
        /at least one valid value/,
      );
    });
  });

  describe("AC2: invalid severity values cause error", () => {
    it("throws on a single invalid string value", () => {
      expect(() => validateSeverityList("INVALID")).toThrow(
        /ERROR: SEVERITY_VALIDATION/,
      );
    });

    it("throws when array contains an invalid value", () => {
      expect(() =>
        validateSeverityList(["HIGH", "CRITICAL"]),
      ).toThrow(/ERROR: SEVERITY_VALIDATION/);
    });

    it("error message lists the invalid value(s)", () => {
      expect(() =>
        validateSeverityList(["HIGH", "BOGUS", "NOPE"]),
      ).toThrow(/BOGUS, NOPE/);
    });

    it("error message mentions the allowed values", () => {
      expect(() => validateSeverityList("WRONG")).toThrow(
        /allowed: HIGH, MEDIUM, LOW, GAS/,
      );
    });

    it("error follows ERROR: <TYPE> - <message> format", () => {
      expect(() => validateSeverityList("INVALID")).toThrow(
        /^ERROR: [A-Z_]+ - .+/,
      );
    });

    it("rejects CRITICAL (always surfaced regardless of filter)", () => {
      expect(() => validateSeverityList("CRITICAL")).toThrow(
        /ERROR: SEVERITY_VALIDATION/,
      );
    });

    it("rejects INFORMATIONAL (not used in audit output filtering)", () => {
      expect(() => validateSeverityList("INFORMATIONAL")).toThrow(
        /ERROR: SEVERITY_VALIDATION/,
      );
    });

    it("rejects a single valid value mixed with invalid values", () => {
      expect(() =>
        validateSeverityList(["HIGH", "UNKNOWN"]),
      ).toThrow(/UNKNOWN/);
    });
  });

  describe("AC3: case-insensitive normalization", () => {
    it("normalizes lowercase 'high' to 'HIGH'", () => {
      expect(validateSeverityList("high")).toEqual(["HIGH"]);
    });

    it("normalizes mixed-case 'High' to 'HIGH'", () => {
      expect(validateSeverityList("High")).toEqual(["HIGH"]);
    });

    it("normalizes fully mixed-case 'hIgH' to 'HIGH'", () => {
      expect(validateSeverityList("hIgH")).toEqual(["HIGH"]);
    });

    it("normalizes lowercase 'medium' to 'MEDIUM'", () => {
      expect(validateSeverityList("medium")).toEqual(["MEDIUM"]);
    });

    it("normalizes mixed-case array values", () => {
      expect(
        validateSeverityList(["high", "Medium", "lOw", "GAS"]),
      ).toEqual(["HIGH", "MEDIUM", "LOW", "GAS"]);
    });

    it("normalizes whitespace-padded values", () => {
      expect(validateSeverityList([" HIGH ", "  medium  "])).toEqual([
        "HIGH",
        "MEDIUM",
      ]);
    });

    it("normalizes whitespace-padded string input", () => {
      expect(validateSeverityList("  high , medium  ")).toEqual([
        "HIGH",
        "MEDIUM",
      ]);
    });
  });

  describe("AC4: duplicate removal", () => {
    it("removes exact duplicate uppercase values", () => {
      expect(validateSeverityList(["HIGH", "HIGH"])).toEqual(["HIGH"]);
    });

    it("removes case-variant duplicates (HIGH, high, High)", () => {
      expect(
        validateSeverityList(["HIGH", "high", "High"]),
      ).toEqual(["HIGH"]);
    });

    it("removes duplicates from string input", () => {
      expect(validateSeverityList("HIGH,HIGH,MEDIUM")).toEqual([
        "HIGH",
        "MEDIUM",
      ]);
    });

    it("removes duplicates when values differ only by case in string", () => {
      expect(validateSeverityList("high, High, HIGH")).toEqual([
        "HIGH",
      ]);
    });

    it("preserves all unique values while removing duplicates", () => {
      expect(
        validateSeverityList(["HIGH", "MEDIUM", "HIGH", "LOW", "MEDIUM"]),
      ).toEqual(["HIGH", "MEDIUM", "LOW"]);
    });
  });

  describe("AC5: canonical ordering", () => {
    it("orders reversed input to canonical order", () => {
      expect(
        validateSeverityList(["GAS", "LOW", "MEDIUM", "HIGH"]),
      ).toEqual(["HIGH", "MEDIUM", "LOW", "GAS"]);
    });

    it("orders arbitrary input to canonical order", () => {
      expect(
        validateSeverityList(["LOW", "HIGH"]),
      ).toEqual(["HIGH", "LOW"]);
    });

    it("orders string input regardless of order given", () => {
      expect(validateSeverityList("GAS,HIGH")).toEqual(["HIGH", "GAS"]);
    });

    it("orders mixed-case input to canonical order", () => {
      expect(
        validateSeverityList(["gas", "low", "medium", "high"]),
      ).toEqual(["HIGH", "MEDIUM", "LOW", "GAS"]);
    });

    it("single value remains in canonical position", () => {
      expect(validateSeverityList("LOW")).toEqual(["LOW"]);
    });

    it("two adjacent values in canonical order", () => {
      expect(validateSeverityList(["MEDIUM", "LOW"])).toEqual([
        "MEDIUM",
        "LOW",
      ]);
    });

    it("two non-adjacent values in canonical order", () => {
      expect(validateSeverityList(["HIGH", "GAS"])).toEqual([
        "HIGH",
        "GAS",
      ]);
    });

    it.each([
      [["LOW", "GAS", "HIGH", "MEDIUM"]],
      [["MEDIUM", "GAS", "LOW", "HIGH"]],
      [["GAS", "HIGH", "MEDIUM", "LOW"]],
    ])(
      "orders permutation %j to canonical order",
      (input) => {
        expect(validateSeverityList(input)).toEqual([
          "HIGH",
          "MEDIUM",
          "LOW",
          "GAS",
        ]);
      },
    );
  });

  describe("AC6: empty list error", () => {
    it("throws on empty string input", () => {
      expect(() => validateSeverityList("")).toThrow(
        /ERROR: SEVERITY_VALIDATION/,
      );
    });

    it("throws on empty array input", () => {
      expect(() => validateSeverityList([])).toThrow(
        /ERROR: SEVERITY_VALIDATION/,
      );
    });

    it("throws on whitespace-only string input", () => {
      expect(() => validateSeverityList("   ")).toThrow(
        /ERROR: SEVERITY_VALIDATION/,
      );
    });

    it("error message mentions 'at least one valid value'", () => {
      expect(() => validateSeverityList("")).toThrow(
        /at least one valid value/,
      );
    });

    it("empty list error follows ERROR: <TYPE> - <message> format", () => {
      expect(() => validateSeverityList("")).toThrow(
        /^ERROR: [A-Z_]+ - .+/,
      );
    });

    it("throws on array of only whitespace strings", () => {
      expect(() => validateSeverityList(["  ", " "])).toThrow(
        /at least one valid value/,
      );
    });

    it("throws on array of only empty strings", () => {
      expect(() => validateSeverityList(["", ""])).toThrow(
        /at least one valid value/,
      );
    });
  });

  describe("Edge cases: non-string/non-array top-level input", () => {
    it("throws when input is a number", () => {
      expect(() =>
        validateSeverityList(42 as unknown as string),
      ).toThrow(/expected a string or string\[\], got number/);
    });

    it("throws when input is an object", () => {
      expect(() =>
        validateSeverityList({} as unknown as string),
      ).toThrow(/expected a string or string\[\], got object/);
    });

    it("throws when input is a boolean", () => {
      expect(() =>
        validateSeverityList(true as unknown as string),
      ).toThrow(/expected a string or string\[\], got boolean/);
    });

    it("throws when input is null", () => {
      expect(() =>
        validateSeverityList(null as unknown as string),
      ).toThrow(/expected a string or string\[\], got object/);
    });

    it("throws when input is undefined", () => {
      expect(() =>
        validateSeverityList(undefined as unknown as string),
      ).toThrow(/expected a string or string\[\], got undefined/);
    });
  });

  describe("Edge cases: non-string values in array", () => {
    it("throws on number values in the array", () => {
      expect(() =>
        validateSeverityList([42 as unknown as string]),
      ).toThrow(/ERROR: SEVERITY_VALIDATION/);
    });

    it("throws on null values in the array", () => {
      expect(() =>
        validateSeverityList([null as unknown as string]),
      ).toThrow(/ERROR: SEVERITY_VALIDATION/);
    });

    it("throws on undefined values in the array", () => {
      expect(() =>
        validateSeverityList([undefined as unknown as string]),
      ).toThrow(/ERROR: SEVERITY_VALIDATION/);
    });

    it("throws on object values in the array", () => {
      expect(() =>
        validateSeverityList([{ severity: "HIGH" } as unknown as string]),
      ).toThrow(/ERROR: SEVERITY_VALIDATION/);
    });

    it("throws on boolean values in the array", () => {
      expect(() =>
        validateSeverityList([true as unknown as string]),
      ).toThrow(/ERROR: SEVERITY_VALIDATION/);
    });

    it("error message mentions expected string type for number input", () => {
      expect(() =>
        validateSeverityList([42 as unknown as string]),
      ).toThrow(/expected string values in array, got number/);
    });

    it("error message mentions expected string type for object input", () => {
      expect(() =>
        validateSeverityList([{} as unknown as string]),
      ).toThrow(/expected string values in array, got object/);
    });

    it("throws when array mixes valid strings with non-string values", () => {
      expect(() =>
        validateSeverityList(["HIGH", 42 as unknown as string]),
      ).toThrow(/ERROR: SEVERITY_VALIDATION/);
    });
  });

  describe("AC7: module exports", () => {
    it("is exported from the core module index", async () => {
      const core = await import("../../core/index.js");
      expect(core.validateSeverityList).toBe(validateSeverityList);
    });

    it("is exported from the package root index", async () => {
      const root = await import("../../index.js");
      expect(root.validateSeverityList).toBe(validateSeverityList);
    });
  });
});
