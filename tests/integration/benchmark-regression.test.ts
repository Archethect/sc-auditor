/**
 * Benchmark regression tests for v0.4.0 methodology.
 *
 * v0.4.0: SystemMap building, hotspot ranking, and verification are now
 * prompt-driven (sub-agent phases), not TypeScript functions. These tests
 * verify the remaining TypeScript infrastructure that supports the methodology.
 *
 * End-to-end methodology testing requires running the /security-auditor skill.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Finding, FindingStatus } from "../../src/types/finding.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures/solidity");

describe("Benchmark: fixture contracts exist", () => {
  const EXPECTED_FIXTURES = [
    "SimpleVault.sol",
    "CallbackGrief.sol",
    "EntitlementDrift.sol",
    "SemanticDrift.sol",
  ];

  for (const fixture of EXPECTED_FIXTURES) {
    it(`${fixture} exists in fixtures directory`, () => {
      expect(existsSync(resolve(FIXTURES_DIR, fixture))).toBe(true);
    });
  }
});

describe("Benchmark: Finding type supports v0.4.0 status values", () => {
  it("judge_confirmed is a valid FindingStatus", () => {
    const status: FindingStatus = "judge_confirmed";
    expect(status).toBe("judge_confirmed");
  });

  it("Finding supports exploit_sketch field", () => {
    const finding: Finding = {
      title: "Test finding",
      severity: "HIGH",
      confidence: "Likely",
      source: "manual",
      category: "state_machine_gap",
      affected_files: ["test.sol"],
      affected_lines: { start: 1, end: 10 },
      description: "Test",
      evidence_sources: [],
      status: "judge_confirmed",
      exploit_sketch: {
        attacker: "unprivileged user",
        capabilities: ["deploy contracts"],
        preconditions: ["pool has liquidity"],
        tx_sequence: ["deposit", "withdraw"],
        state_deltas: ["balance decreased"],
        broken_invariant: "INV-001",
        numeric_example: "deposit 1 wei, get 1 share",
        same_fix_test: "add nonReentrant modifier",
      },
    };
    expect(finding.exploit_sketch).toBeDefined();
    expect(finding.status).toBe("judge_confirmed");
  });

  it("Finding supports da_mitigation field", () => {
    const finding: Finding = {
      title: "Test finding",
      severity: "MEDIUM",
      confidence: "Possible",
      source: "manual",
      category: "config_dependent",
      affected_files: ["test.sol"],
      affected_lines: { start: 1, end: 5 },
      description: "Test",
      evidence_sources: [],
      da_mitigation: [
        { check: "nonReentrant guard", score: -3, evidence: "Found on line 10" },
        { check: "access control", score: 0, evidence: "No restriction found" },
      ],
    };
    expect(finding.da_mitigation).toHaveLength(2);
    expect(finding.da_mitigation?.[0].score).toBe(-3);
  });

  it("new detector categories are valid", () => {
    const categories = [
      "state_machine_gap",
      "config_dependent",
      "design_tradeoff",
      "missing_validation",
      "economic_differential",
    ];
    for (const category of categories) {
      const finding: Finding = {
        title: "Test",
        severity: "LOW",
        confidence: "Possible",
        source: "manual",
        category,
        affected_files: ["test.sol"],
        affected_lines: { start: 1, end: 1 },
        description: "Test",
        evidence_sources: [],
      };
      expect(finding.category).toBe(category);
    }
  });
});
