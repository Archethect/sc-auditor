/**
 * Tests for Aderyn parser module.
 */

import { describe, expect, it } from "vitest";
import { parseAderynOutput } from "../aderyn-parser.js";

/**
 * Aderyn instance structure for test data.
 */
interface TestInstance {
  contract_path: string;
  line_no: number;
  src?: string;
  src_char?: string;
}

/**
 * Aderyn issue structure for test data.
 */
interface TestIssue {
  title: string;
  description: string;
  detector_name: string;
  instances: TestInstance[];
}

/**
 * Creates a test Aderyn output structure.
 */
function createAderynOutput(options: {
  highIssues?: TestIssue[];
  lowIssues?: TestIssue[];
} = {}): Parameters<typeof parseAderynOutput>[0] {
  return {
    high_issues: {
      issues: options.highIssues ?? [],
    },
    low_issues: {
      issues: options.lowIssues ?? [],
    },
  };
}

/**
 * Creates a test issue with default values.
 */
function createIssue(overrides: Partial<TestIssue> = {}): TestIssue {
  return {
    title: overrides.title ?? "Test Issue",
    description: overrides.description ?? "Test description",
    detector_name: overrides.detector_name ?? "test-detector",
    instances: overrides.instances ?? [
      { contract_path: "contracts/Test.sol", line_no: 10 },
    ],
  };
}

describe("AC1: high_issues mapped to HIGH severity, low_issues mapped to LOW severity", () => {
  it("maps high_issues to HIGH severity", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ title: "High Severity Issue" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("HIGH");
  });

  it("maps low_issues to LOW severity", () => {
    const output = createAderynOutput({
      lowIssues: [createIssue({ title: "Low Severity Issue" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("LOW");
  });

  it("maps both high and low issues in single output", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ title: "High Issue" })],
      lowIssues: [createIssue({ title: "Low Issue" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(2);
    const highFinding = findings.find((f) => f.title === "High Issue");
    const lowFinding = findings.find((f) => f.title === "Low Issue");
    expect(highFinding?.severity).toBe("HIGH");
    expect(lowFinding?.severity).toBe("LOW");
  });
});

describe("AC2: Conservative confidence mapping and source: aderyn", () => {
  it("sets confidence to Likely on high severity findings (conservative)", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ title: "High Issue" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("Likely");
  });

  it("sets confidence to Possible on low severity findings (conservative)", () => {
    const output = createAderynOutput({
      lowIssues: [createIssue({ title: "Low Issue" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("Possible");
  });

  it("sets source to aderyn on all findings", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ title: "High Issue" })],
      lowIssues: [createIssue({ title: "Low Issue" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(2);
    expect(findings[0].source).toBe("aderyn");
    expect(findings[1].source).toBe("aderyn");
  });

  it("includes evidence_sources with type static_analysis and tool aderyn", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ detector_name: "centralization-risk" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].evidence_sources).toHaveLength(1);
    expect(findings[0].evidence_sources[0].type).toBe("static_analysis");
    expect(findings[0].evidence_sources[0].tool).toBe("aderyn");
    expect(findings[0].evidence_sources[0].detector_id).toBe("centralization-risk");
  });

  it("includes detector_id from detector_name", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ detector_name: "reentrancy-state-change" })],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].detector_id).toBe("reentrancy-state-change");
  });
});

describe("AC3: File paths extracted from instances[].contract_path", () => {
  it("extracts a single file path from instance", () => {
    const output = createAderynOutput({
      highIssues: [
        createIssue({
          instances: [{ contract_path: "contracts/Vault.sol", line_no: 10 }],
        }),
      ],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].affected_files).toEqual(["contracts/Vault.sol"]);
  });

  it("extracts multiple file paths from multiple instances", () => {
    const output = createAderynOutput({
      highIssues: [
        createIssue({
          instances: [
            { contract_path: "contracts/Vault.sol", line_no: 10 },
            { contract_path: "contracts/Token.sol", line_no: 20 },
          ],
        }),
      ],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].affected_files).toContain("contracts/Vault.sol");
    expect(findings[0].affected_files).toContain("contracts/Token.sol");
  });

  it("handles empty instances array", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ instances: [] })],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].affected_files).toEqual([]);
  });

  it("handles instances with missing contract_path", () => {
    const output = {
      high_issues: {
        issues: [
          {
            title: "Test Issue",
            description: "Test description",
            detector_name: "test-detector",
            instances: [
              { line_no: 10 },
              { contract_path: "contracts/Valid.sol", line_no: 20 },
            ],
          },
        ],
      },
      low_issues: { issues: [] },
    } as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].affected_files).toEqual(["contracts/Valid.sol"]);
  });
});

describe("AC4: Line numbers from instances[].line_no converted to LineRange", () => {
  it("extracts line_no from first instance as start and end", () => {
    const output = createAderynOutput({
      highIssues: [
        createIssue({
          instances: [{ contract_path: "contracts/Test.sol", line_no: 42 }],
        }),
      ],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].affected_lines).toEqual({ start: 42, end: 42 });
  });

  it("extracts min and max line_no from multiple instances", () => {
    const output = createAderynOutput({
      highIssues: [
        createIssue({
          instances: [
            { contract_path: "contracts/Test.sol", line_no: 10 },
            { contract_path: "contracts/Test.sol", line_no: 50 },
            { contract_path: "contracts/Test.sol", line_no: 25 },
          ],
        }),
      ],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].affected_lines).toEqual({ start: 10, end: 50 });
  });

  it("returns { start: 0, end: 0 } when instances array is empty", () => {
    const output = createAderynOutput({
      highIssues: [createIssue({ instances: [] })],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });

  it("handles instance with missing line_no", () => {
    const output = {
      high_issues: {
        issues: [
          {
            title: "Test Issue",
            description: "Test description",
            detector_name: "test-detector",
            instances: [
              { contract_path: "contracts/Test.sol" },
            ],
          },
        ],
      },
      low_issues: { issues: [] },
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });

  it("filters out instances with zero line_no", () => {
    const output = {
      high_issues: {
        issues: [
          {
            title: "Test Issue",
            description: "Test description",
            detector_name: "test-detector",
            instances: [
              { contract_path: "contracts/Test.sol", line_no: 0 },
              { contract_path: "contracts/Test.sol", line_no: 25 },
            ],
          },
        ],
      },
      low_issues: { issues: [] },
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    // line_no: 0 is filtered out, so only line 25 remains
    expect(findings[0].affected_lines).toEqual({ start: 25, end: 25 });
  });

  it("filters out instances with negative line_no", () => {
    const output = {
      high_issues: {
        issues: [
          {
            title: "Test Issue",
            description: "Test description",
            detector_name: "test-detector",
            instances: [
              { contract_path: "contracts/Test.sol", line_no: -5 },
              { contract_path: "contracts/Test.sol", line_no: 10 },
              { contract_path: "contracts/Test.sol", line_no: -1 },
            ],
          },
        ],
      },
      low_issues: { issues: [] },
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    // Negative line_no values are filtered out, leaving only line 10
    expect(findings[0].affected_lines).toEqual({ start: 10, end: 10 });
  });

  it("handles instance with string line_no", () => {
    const output = {
      high_issues: {
        issues: [
          {
            title: "Test Issue",
            description: "Test description",
            detector_name: "test-detector",
            instances: [
              { contract_path: "contracts/Test.sol", line_no: "invalid" as unknown as number },
              { contract_path: "contracts/Test.sol", line_no: 20 },
            ],
          },
        ],
      },
      low_issues: { issues: [] },
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    // String line_no is filtered out by type guard, leaving only line 20
    expect(findings[0].affected_lines).toEqual({ start: 20, end: 20 });
  });
});

describe("AC5: Multi-instance issues aggregate unique file paths", () => {
  it("deduplicates file paths from instances in same file", () => {
    const output = createAderynOutput({
      highIssues: [
        createIssue({
          instances: [
            { contract_path: "contracts/Same.sol", line_no: 10 },
            { contract_path: "contracts/Same.sol", line_no: 20 },
            { contract_path: "contracts/Same.sol", line_no: 30 },
          ],
        }),
      ],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].affected_files).toEqual(["contracts/Same.sol"]);
  });

  it("collects unique file paths across multiple files", () => {
    const output = createAderynOutput({
      highIssues: [
        createIssue({
          instances: [
            { contract_path: "contracts/A.sol", line_no: 10 },
            { contract_path: "contracts/B.sol", line_no: 20 },
            { contract_path: "contracts/A.sol", line_no: 30 },
            { contract_path: "contracts/C.sol", line_no: 40 },
            { contract_path: "contracts/B.sol", line_no: 50 },
          ],
        }),
      ],
    });

    const findings = parseAderynOutput(output);

    expect(findings[0].affected_files).toHaveLength(3);
    expect(findings[0].affected_files).toContain("contracts/A.sol");
    expect(findings[0].affected_files).toContain("contracts/B.sol");
    expect(findings[0].affected_files).toContain("contracts/C.sol");
  });
});

describe("AC6: Returns empty array for empty issues", () => {
  it("returns empty array when high_issues and low_issues are both empty", () => {
    const output = createAderynOutput({
      highIssues: [],
      lowIssues: [],
    });

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });

  it("returns empty array when high_issues.issues is undefined", () => {
    const output = {
      high_issues: {},
      low_issues: { issues: [] },
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });

  it("returns empty array when low_issues.issues is undefined", () => {
    const output = {
      high_issues: { issues: [] },
      low_issues: {},
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });

  it("returns empty array when both issues containers are undefined", () => {
    const output = {
      high_issues: {},
      low_issues: {},
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });

  it("handles malformed output with non-array issues property", () => {
    const output = {
      high_issues: { issues: "not-an-array" as unknown },
      low_issues: { issues: 123 as unknown },
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });

  it("handles issue with missing required fields gracefully", () => {
    const output = {
      high_issues: {
        issues: [{}],
      },
      low_issues: { issues: [] },
    } as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("unknown-issue");
    expect(findings[0].description).toBe("");
    expect(findings[0].affected_files).toEqual([]);
    expect(findings[0].affected_lines).toEqual({ start: 0, end: 0 });
  });

  it("returns empty array for null output", () => {
    const output = null as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });

  it("returns empty array for array output", () => {
    const output = [] as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });

  it("returns empty array for string output", () => {
    const output = "not an object" as unknown as Parameters<typeof parseAderynOutput>[0];

    const findings = parseAderynOutput(output);

    expect(findings).toEqual([]);
  });
});
