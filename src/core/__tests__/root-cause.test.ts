/**
 * Tests for root-cause clustering module.
 */

import { describe, expect, it } from "vitest";
import type { Finding } from "../../types/finding.js";
import { clusterFindings, generateFingerprint } from "../root-cause.js";

/**
 * Creates a minimal test finding with sensible defaults.
 */
function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    title: overrides.title ?? "Test Finding",
    severity: overrides.severity ?? "MEDIUM",
    confidence: overrides.confidence ?? "Likely",
    source: overrides.source ?? "slither",
    category: overrides.category ?? "reentrancy",
    affected_files: overrides.affected_files ?? ["contracts/Vault.sol"],
    affected_lines: overrides.affected_lines ?? { start: 10, end: 20 },
    description: overrides.description ?? "Test description",
    detector_id: overrides.detector_id ?? "reentrancy-eth",
    evidence_sources: overrides.evidence_sources ?? [
      { type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" },
    ],
    status: overrides.status ?? "candidate",
    proof_type: overrides.proof_type ?? "none",
    independence_count: overrides.independence_count ?? 1,
    benchmark_mode_visible: overrides.benchmark_mode_visible ?? true,
  };
}

describe("AC1: generateFingerprint produces deterministic fingerprints", () => {
  it("generates same fingerprint for identical findings", () => {
    const a = createFinding();
    const b = createFinding();
    expect(generateFingerprint(a)).toBe(generateFingerprint(b));
  });

  it("generates different fingerprint for different detectors", () => {
    const a = createFinding({ detector_id: "reentrancy-eth" });
    const b = createFinding({ detector_id: "tx-origin" });
    expect(generateFingerprint(a)).not.toBe(generateFingerprint(b));
  });

  it("generates different fingerprint for different files", () => {
    const a = createFinding({ affected_files: ["contracts/A.sol"] });
    const b = createFinding({ affected_files: ["contracts/B.sol"] });
    expect(generateFingerprint(a)).not.toBe(generateFingerprint(b));
  });

  it("quantizes line ranges to 5-line buckets", () => {
    const a = createFinding({ affected_lines: { start: 11, end: 14 } });
    const b = createFinding({ affected_lines: { start: 12, end: 13 } });
    expect(generateFingerprint(a)).toBe(generateFingerprint(b));
  });

  it("generates different fingerprint for lines in different buckets", () => {
    const a = createFinding({ affected_lines: { start: 10, end: 14 } });
    const b = createFinding({ affected_lines: { start: 30, end: 34 } });
    expect(generateFingerprint(a)).not.toBe(generateFingerprint(b));
  });

  it("uses category when detector_id is undefined", () => {
    const finding = createFinding({ detector_id: undefined, category: "reentrancy" });
    const fp = generateFingerprint(finding);
    expect(fp).toContain("reentrancy");
  });
});

describe("AC2: Same finding from Slither and Aderyn on same location clusters together", () => {
  it("merges overlapping findings from different tools into one cluster", () => {
    const slitherFinding = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 13, end: 20 },
      severity: "HIGH",
      evidence_sources: [
        { type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" },
      ],
    });

    const aderynFinding = createFinding({
      source: "aderyn",
      detector_id: "reentrancy",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 15, end: 15 },
      severity: "HIGH",
      evidence_sources: [
        { type: "static_analysis", tool: "aderyn", detector_id: "reentrancy" },
      ],
    });

    const result = clusterFindings([slitherFinding, aderynFinding]);

    expect(result).toHaveLength(1);
    expect(result[0].root_cause_key).toBeDefined();
    expect(result[0].evidence_sources).toHaveLength(2);
    expect(result[0].independence_count).toBe(2);
  });
});

describe("AC3: Non-overlapping findings remain separate clusters", () => {
  it("keeps findings on different files separate", () => {
    const a = createFinding({
      source: "slither",
      affected_files: ["contracts/A.sol"],
      affected_lines: { start: 10, end: 20 },
    });

    const b = createFinding({
      source: "slither",
      affected_files: ["contracts/B.sol"],
      affected_lines: { start: 10, end: 20 },
    });

    const result = clusterFindings([a, b]);

    expect(result).toHaveLength(2);
  });

  it("keeps findings with distant line ranges separate", () => {
    const a = createFinding({
      source: "slither",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 10, end: 20 },
    });

    const b = createFinding({
      source: "aderyn",
      detector_id: "different-detector",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 100, end: 110 },
    });

    const result = clusterFindings([a, b]);

    expect(result).toHaveLength(2);
  });
});

describe("AC4: Cross-file duplicates from same tool remain separate", () => {
  it("does not merge same-tool findings from different files", () => {
    const a = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/A.sol"],
      affected_lines: { start: 10, end: 20 },
    });

    const b = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/B.sol"],
      affected_lines: { start: 10, end: 20 },
    });

    const result = clusterFindings([a, b]);

    expect(result).toHaveLength(2);
  });
});

describe("AC5: Same-file nearby-line findings from different tools merge", () => {
  it("merges findings within 10-line threshold from different tools", () => {
    const slitherFinding = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 10, end: 15 },
      severity: "HIGH",
      evidence_sources: [
        { type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" },
      ],
    });

    const aderynFinding = createFinding({
      source: "aderyn",
      detector_id: "reentrancy",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 20, end: 22 },
      severity: "HIGH",
      evidence_sources: [
        { type: "static_analysis", tool: "aderyn", detector_id: "reentrancy" },
      ],
    });

    const result = clusterFindings([slitherFinding, aderynFinding]);

    expect(result).toHaveLength(1);
    expect(result[0].evidence_sources).toHaveLength(2);
  });

  it("does not merge same-tool findings on nearby lines", () => {
    const a = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 10, end: 15 },
    });

    const b = createFinding({
      source: "slither",
      detector_id: "unused-return",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 20, end: 22 },
    });

    const result = clusterFindings([a, b]);

    expect(result).toHaveLength(2);
  });
});

describe("AC6: independence_count reflects number of sources", () => {
  it("sets independence_count to 1 for single-tool findings", () => {
    const finding = createFinding({ source: "slither" });
    const result = clusterFindings([finding]);

    expect(result).toHaveLength(1);
    expect(result[0].independence_count).toBe(1);
  });

  it("sets independence_count to 2 when two tools report same issue", () => {
    const slither = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 10, end: 20 },
      evidence_sources: [
        { type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" },
      ],
    });

    const aderyn = createFinding({
      source: "aderyn",
      detector_id: "reentrancy",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 15, end: 15 },
      evidence_sources: [
        { type: "static_analysis", tool: "aderyn", detector_id: "reentrancy" },
      ],
    });

    const result = clusterFindings([slither, aderyn]);

    expect(result).toHaveLength(1);
    expect(result[0].independence_count).toBe(2);
  });
});

describe("AC7: Severity escalation on merge", () => {
  it("keeps highest severity when merging findings", () => {
    const highFinding = createFinding({
      source: "slither",
      severity: "HIGH",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 10, end: 20 },
      evidence_sources: [
        { type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" },
      ],
    });

    const lowFinding = createFinding({
      source: "aderyn",
      severity: "LOW",
      detector_id: "reentrancy",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 15, end: 15 },
      evidence_sources: [
        { type: "static_analysis", tool: "aderyn", detector_id: "reentrancy" },
      ],
    });

    const result = clusterFindings([highFinding, lowFinding]);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("HIGH");
  });
});

describe("AC8: root_cause_key is deterministic", () => {
  it("assigns a root_cause_key to all clustered findings", () => {
    const finding = createFinding();
    const result = clusterFindings([finding]);

    expect(result[0].root_cause_key).toBeDefined();
    expect(typeof result[0].root_cause_key).toBe("string");
    expect(result[0].root_cause_key?.length).toBe(16);
  });

  it("produces same root_cause_key for identical findings in separate runs", () => {
    const findingA = createFinding();
    const findingB = createFinding();

    const resultA = clusterFindings([findingA]);
    const resultB = clusterFindings([findingB]);

    expect(resultA[0].root_cause_key).toBe(resultB[0].root_cause_key);
  });

  it("returns empty array for empty input", () => {
    const result = clusterFindings([]);
    expect(result).toEqual([]);
  });
});

describe("Edge cases: large clusters with mixed sources", () => {
  it("clusters 5+ findings from mixed sources into fewer clusters", () => {
    const findings: Finding[] = [
      createFinding({
        source: "slither",
        detector_id: "reentrancy-eth",
        affected_files: ["contracts/Vault.sol"],
        affected_lines: { start: 10, end: 15 },
        severity: "HIGH",
        evidence_sources: [{ type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" }],
      }),
      createFinding({
        source: "aderyn",
        detector_id: "reentrancy",
        affected_files: ["contracts/Vault.sol"],
        affected_lines: { start: 12, end: 18 },
        severity: "MEDIUM",
        evidence_sources: [{ type: "static_analysis", tool: "aderyn", detector_id: "reentrancy" }],
      }),
      createFinding({
        source: "slither",
        detector_id: "unchecked-lowlevel",
        affected_files: ["contracts/Vault.sol"],
        affected_lines: { start: 14, end: 16 },
        severity: "LOW",
        evidence_sources: [{ type: "static_analysis", tool: "slither", detector_id: "unchecked-lowlevel" }],
      }),
      createFinding({
        source: "aderyn",
        detector_id: "unchecked-return",
        affected_files: ["contracts/Vault.sol"],
        affected_lines: { start: 15, end: 17 },
        severity: "MEDIUM",
        evidence_sources: [{ type: "static_analysis", tool: "aderyn", detector_id: "unchecked-return" }],
      }),
      createFinding({
        source: "slither",
        detector_id: "tx-origin",
        affected_files: ["contracts/Vault.sol"],
        affected_lines: { start: 13, end: 14 },
        severity: "HIGH",
        evidence_sources: [{ type: "static_analysis", tool: "slither", detector_id: "tx-origin" }],
      }),
    ];

    const result = clusterFindings(findings);
    expect(result.length).toBeLessThan(findings.length);
    expect(result.every((f) => f.root_cause_key !== undefined)).toBe(true);
  });
});

describe("Edge cases: identical fingerprint different severities keeps highest", () => {
  it("keeps CRITICAL when merging CRITICAL and LOW severity findings", () => {
    const critical = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 10, end: 20 },
      severity: "CRITICAL",
      evidence_sources: [{ type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" }],
    });

    const low = createFinding({
      source: "aderyn",
      detector_id: "reentrancy",
      affected_files: ["contracts/Vault.sol"],
      affected_lines: { start: 12, end: 18 },
      severity: "LOW",
      evidence_sources: [{ type: "static_analysis", tool: "aderyn", detector_id: "reentrancy" }],
    });

    const result = clusterFindings([critical, low]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("CRITICAL");
  });

  it("keeps HIGH when merging HIGH and INFORMATIONAL severity", () => {
    const high = createFinding({
      source: "slither",
      detector_id: "reentrancy-eth",
      affected_files: ["contracts/A.sol"],
      affected_lines: { start: 10, end: 20 },
      severity: "HIGH",
      evidence_sources: [{ type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" }],
    });

    const info = createFinding({
      source: "aderyn",
      detector_id: "reentrancy",
      affected_files: ["contracts/A.sol"],
      affected_lines: { start: 15, end: 15 },
      severity: "INFORMATIONAL",
      evidence_sources: [{ type: "static_analysis", tool: "aderyn", detector_id: "reentrancy" }],
    });

    const result = clusterFindings([info, high]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("HIGH");
  });
});

describe("Edge cases: undefined/missing optional fields", () => {
  it("handles finding with undefined detector_id without crash", () => {
    const finding = createFinding({ detector_id: undefined });
    const result = clusterFindings([finding]);
    expect(result).toHaveLength(1);
    expect(result[0].root_cause_key).toBeDefined();
  });

  it("handles finding with undefined root_cause_key without crash", () => {
    const finding = createFinding({ root_cause_key: undefined });
    const result = clusterFindings([finding]);
    expect(result).toHaveLength(1);
  });

  it("handles finding with undefined independence_count without crash", () => {
    const finding = createFinding({ independence_count: undefined });
    const result = clusterFindings([finding]);
    expect(result).toHaveLength(1);
    expect(result[0].independence_count).toBe(1);
  });
});

describe("Edge cases: single finding returns with root_cause_key set", () => {
  it("assigns root_cause_key to a single finding", () => {
    const finding = createFinding();
    const result = clusterFindings([finding]);
    expect(result).toHaveLength(1);
    expect(result[0].root_cause_key).toBeDefined();
    expect(typeof result[0].root_cause_key).toBe("string");
    expect(result[0].root_cause_key?.length).toBeGreaterThan(0);
  });

  it("sets independence_count to 1 for a single finding", () => {
    const finding = createFinding();
    const result = clusterFindings([finding]);
    expect(result[0].independence_count).toBe(1);
  });
});

describe("Edge cases: fingerprint determinism", () => {
  it("generates identical fingerprints for findings with sorted affected_files", () => {
    const a = createFinding({ affected_files: ["b.sol", "a.sol"] });
    const b = createFinding({ affected_files: ["a.sol", "b.sol"] });
    expect(generateFingerprint(a)).toBe(generateFingerprint(b));
  });
});
