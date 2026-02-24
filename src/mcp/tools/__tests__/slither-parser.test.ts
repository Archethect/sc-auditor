/**
 * Tests for Slither parser module.
 */

import { describe, expect, it } from "vitest";
import {
  mapSlitherConfidence,
  mapSlitherSeverity,
  parseSlitherOutput,
} from "../slither-parser.js";

/** Source mapping structure for test elements. */
interface TestSourceMapping {
  filename_relative: string;
  lines: number[];
  starting_column: number;
  ending_column: number;
}

/** Test element structure. */
interface TestElement {
  type: string;
  name: string;
  source_mapping?: TestSourceMapping;
}

/**
 * Creates a test element with the given properties.
 */
function createElement(name: string, filename: string, lines: number[], type = "function"): TestElement {
  return {
    type,
    name,
    source_mapping: { filename_relative: filename, lines, starting_column: 1, ending_column: 2 },
  };
}

/**
 * Creates a test detector with optional overrides.
 */
function createDetector(overrides: {
  check?: string;
  impact?: string;
  confidence?: string;
  description?: string;
  elements?: TestElement[];
} = {}): {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements: TestElement[];
} {
  return {
    check: overrides.check ?? "test-detector",
    impact: overrides.impact ?? "Medium",
    confidence: overrides.confidence ?? "Medium",
    description: overrides.description ?? "Test finding",
    elements: overrides.elements ?? [createElement("test", "contracts/Test.sol", [1])],
  };
}

/**
 * Creates a successful Slither output with the given detectors.
 */
function createSlitherOutput(
  detectors: Array<ReturnType<typeof createDetector>>,
  success = true,
): Parameters<typeof parseSlitherOutput>[0] {
  return { success, results: { detectors } };
}

describe("AC1: Parser maps all Slither severity levels correctly", () => {
  it("maps 'Critical' to 'CRITICAL'", () => {
    expect(mapSlitherSeverity("Critical")).toBe("CRITICAL");
  });

  it("maps 'High' to 'HIGH'", () => {
    expect(mapSlitherSeverity("High")).toBe("HIGH");
  });

  it("maps 'Medium' to 'MEDIUM'", () => {
    expect(mapSlitherSeverity("Medium")).toBe("MEDIUM");
  });

  it("maps 'Low' to 'LOW'", () => {
    expect(mapSlitherSeverity("Low")).toBe("LOW");
  });

  it("maps 'Informational' to 'INFORMATIONAL'", () => {
    expect(mapSlitherSeverity("Informational")).toBe("INFORMATIONAL");
  });

  it("maps 'Optimization' to 'GAS'", () => {
    expect(mapSlitherSeverity("Optimization")).toBe("GAS");
  });

  it("maps unknown severity to 'INFORMATIONAL' by default", () => {
    expect(mapSlitherSeverity("Unknown")).toBe("INFORMATIONAL");
    expect(mapSlitherSeverity("")).toBe("INFORMATIONAL");
    expect(mapSlitherSeverity("random-value")).toBe("INFORMATIONAL");
  });
});

describe("AC2: Parser maps all Slither confidence levels correctly", () => {
  it("maps 'High' to 'Confirmed'", () => {
    expect(mapSlitherConfidence("High")).toBe("Confirmed");
  });

  it("maps 'Medium' to 'Likely'", () => {
    expect(mapSlitherConfidence("Medium")).toBe("Likely");
  });

  it("maps 'Low' to 'Possible'", () => {
    expect(mapSlitherConfidence("Low")).toBe("Possible");
  });

  it("maps unknown confidence to 'Possible' by default", () => {
    expect(mapSlitherConfidence("Unknown")).toBe("Possible");
    expect(mapSlitherConfidence("")).toBe("Possible");
    expect(mapSlitherConfidence("random-value")).toBe("Possible");
  });
});

describe("AC3: Parser extracts file paths from elements[].source_mapping.filename_relative", () => {
  it("extracts a single file path from elements", () => {
    const output = createSlitherOutput([
      createDetector({
        check: "reentrancy-eth",
        impact: "High",
        confidence: "Medium",
        description: "Reentrancy vulnerability",
        elements: [createElement("withdraw", "contracts/Vault.sol", [10, 11, 12])],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].affected_files).toEqual(["contracts/Vault.sol"]);
  });

  it("extracts multiple unique file paths from multiple elements", () => {
    const output = createSlitherOutput([
      createDetector({
        check: "reentrancy-eth",
        impact: "High",
        confidence: "High",
        description: "Reentrancy vulnerability",
        elements: [
          createElement("withdraw", "contracts/Vault.sol", [10]),
          createElement("deposit", "contracts/Token.sol", [20]),
        ],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].affected_files).toContain("contracts/Vault.sol");
    expect(findings[0].affected_files).toContain("contracts/Token.sol");
  });

  it("handles elements with missing source_mapping", () => {
    // Test defensive handling of malformed Slither output where source_mapping may be missing
    // Cast is necessary because the type expects source_mapping, but real-world data may be incomplete
    const slitherOutput = {
      success: true,
      results: {
        detectors: [
          {
            check: "test-detector",
            impact: "Medium",
            confidence: "Medium",
            description: "Test finding",
            elements: [
              {
                type: "function",
                name: "test",
                // No source_mapping property - simulating malformed Slither output
              },
              {
                type: "function",
                name: "test2",
                source_mapping: {
                  filename_relative: "contracts/Valid.sol",
                  lines: [10],
                  starting_column: 1,
                  ending_column: 2,
                },
              },
            ],
          },
        ],
      },
    } as Parameters<typeof parseSlitherOutput>[0];

    const findings = parseSlitherOutput(slitherOutput);
    expect(findings).toHaveLength(1);
    // Should only contain the valid file path, skipping the element without source_mapping
    expect(findings[0].affected_files).toEqual(["contracts/Valid.sol"]);
  });

  it("deduplicates file paths from elements", () => {
    const output = createSlitherOutput([
      createDetector({
        confidence: "Low",
        elements: [
          createElement("foo", "contracts/Same.sol", [1]),
          createElement("bar", "contracts/Same.sol", [10]),
        ],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].affected_files).toEqual(["contracts/Same.sol"]);
  });
});

describe("AC4: Parser extracts line ranges from elements[0].source_mapping.lines", () => {
  it("extracts line range with min and max from first element's lines array", () => {
    const output = createSlitherOutput([
      createDetector({
        impact: "High",
        confidence: "High",
        elements: [createElement("test", "contracts/Test.sol", [10, 11, 12, 13, 14])],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].affected_lines).toEqual({ start: 10, end: 14 });
  });

  it("handles single-line findings", () => {
    const output = createSlitherOutput([
      createDetector({
        impact: "Low",
        elements: [createElement("test", "contracts/Test.sol", [42])],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].affected_lines).toEqual({ start: 42, end: 42 });
  });

  it("returns { start: 0, end: 0 } when element has empty lines array", () => {
    const output = createSlitherOutput([
      createDetector({
        impact: "High",
        confidence: "High",
        elements: [createElement("test", "contracts/Test.sol", [])],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });

  it("returns { start: 0, end: 0 } when no elements exist", () => {
    const output = createSlitherOutput([
      createDetector({
        impact: "High",
        confidence: "High",
        elements: [],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });

  it("returns { start: 0, end: 0 } when first element has no source_mapping", () => {
    // Test defensive handling when first element lacks source_mapping
    const slitherOutput = {
      success: true,
      results: {
        detectors: [
          {
            check: "test-detector",
            impact: "Medium",
            confidence: "Medium",
            description: "Test finding",
            elements: [
              {
                type: "function",
                name: "test",
                // No source_mapping property
              },
            ],
          },
        ],
      },
    } as Parameters<typeof parseSlitherOutput>[0];

    const findings = parseSlitherOutput(slitherOutput);
    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });
});

describe("AC5: All findings have source: slither and evidence_sources with tool: slither", () => {
  it("sets source to 'slither' on all findings", () => {
    const output = createSlitherOutput([
      createDetector({
        check: "detector-1",
        impact: "High",
        confidence: "High",
        description: "Finding 1",
      }),
      createDetector({
        check: "detector-2",
        impact: "Low",
        description: "Finding 2",
        elements: [createElement("test2", "contracts/Test2.sol", [10])],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings).toHaveLength(2);
    expect(findings[0].source).toBe("slither");
    expect(findings[1].source).toBe("slither");
  });

  it("includes evidence_sources with type static_analysis and tool slither", () => {
    const output = createSlitherOutput([
      createDetector({
        check: "reentrancy-eth",
        impact: "High",
        confidence: "High",
        description: "Reentrancy vulnerability",
        elements: [createElement("withdraw", "contracts/Vault.sol", [10])],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].evidence_sources).toHaveLength(1);
    expect(findings[0].evidence_sources[0].type).toBe("static_analysis");
    expect(findings[0].evidence_sources[0].tool).toBe("slither");
  });

  it("includes detector_id in evidence_sources", () => {
    const output = createSlitherOutput([
      createDetector({
        check: "uninitialized-local",
        description: "Uninitialized local variable",
        elements: [createElement("x", "contracts/Test.sol", [5], "variable")],
      }),
    ]);

    const findings = parseSlitherOutput(output);
    expect(findings[0].evidence_sources[0].detector_id).toBe("uninitialized-local");
    expect(findings[0].detector_id).toBe("uninitialized-local");
  });
});

describe("AC6: Returns [] for empty detectors or success: false", () => {
  it("returns empty array when success is false", () => {
    const output = createSlitherOutput(
      [createDetector({ check: "reentrancy", impact: "High", confidence: "High", elements: [] })],
      false,
    );

    const findings = parseSlitherOutput(output);
    expect(findings).toEqual([]);
  });

  it("returns empty array when detectors is empty", () => {
    const output = createSlitherOutput([]);

    const findings = parseSlitherOutput(output);
    expect(findings).toEqual([]);
  });

  it("returns empty array when detectors is undefined", () => {
    const output = { success: true, results: {} } as Parameters<typeof parseSlitherOutput>[0];

    const findings = parseSlitherOutput(output);
    expect(findings).toEqual([]);
  });

  it("returns empty array when results is undefined", () => {
    const output = { success: true } as Parameters<typeof parseSlitherOutput>[0];

    const findings = parseSlitherOutput(output);
    expect(findings).toEqual([]);
  });

  it("handles detector with undefined elements property", () => {
    const output = {
      success: true,
      results: {
        detectors: [
          {
            check: "test-detector",
            impact: "Medium",
            confidence: "Medium",
            description: "Test finding with no elements property",
          },
        ],
      },
    } as Parameters<typeof parseSlitherOutput>[0];

    const findings = parseSlitherOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].affected_files).toEqual([]);
    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });

  it("handles malformed detector with missing required fields", () => {
    // Slither may produce unexpected output - parser should be defensive
    const output = {
      success: true,
      results: {
        detectors: [
          {
            // Missing check, impact, confidence, description
            elements: [createElement("test", "contracts/Test.sol", [1])],
          } as ReturnType<typeof createDetector>,
        ],
      },
    } as Parameters<typeof parseSlitherOutput>[0];

    const findings = parseSlitherOutput(output);
    expect(findings).toHaveLength(1);
    // Should use fallback values gracefully, mapped to defaults
    expect(findings[0].title).toBe("unknown-detector");
    expect(findings[0].severity).toBe("INFORMATIONAL"); // default
    expect(findings[0].confidence).toBe("Possible"); // default
  });

  it("handles detector with non-array elements value", () => {
    // Test defensive Array.isArray check in detectorToFinding
    const output = {
      success: true,
      results: {
        detectors: [
          {
            check: "test-detector",
            impact: "Medium",
            confidence: "Medium",
            description: "Test finding",
            elements: "not-an-array" as unknown,
          } as ReturnType<typeof createDetector>,
        ],
      },
    } as Parameters<typeof parseSlitherOutput>[0];

    const findings = parseSlitherOutput(output);
    expect(findings).toHaveLength(1);
    expect(findings[0].affected_files).toEqual([]);
    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });
});
