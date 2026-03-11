/**
 * Tests for the structured audit report builder.
 */

import { describe, expect, it } from "vitest";
import type { SystemMapArtifact } from "../../types/architecture.js";
import type { Finding } from "../../types/finding.js";
import { buildAuditReport } from "../audit-report.js";

/**
 * Creates a minimal SystemMapArtifact for testing.
 */
function createTestArtifact(overrides: Partial<SystemMapArtifact> = {}): SystemMapArtifact {
  return {
    components: [
      { name: "Vault", files: ["Vault.sol"], role: "Main vault", risk_level: "High" },
      { name: "Token", files: ["Token.sol"], role: "ERC20 token", risk_level: "Medium" },
    ],
    external_surfaces: [
      {
        name: "withdraw",
        contract: "Vault",
        visibility: "external",
        modifiers: [],
        parameters: ["uint256"],
        return_types: [],
        state_mutability: "nonpayable",
      },
    ],
    auth_surfaces: [
      { contract: "Vault", function_name: "setFee", modifier: "onlyOwner", role: "owner" },
    ],
    state_variables: [],
    state_write_sites: [],
    external_call_sites: [],
    value_flow_edges: [],
    config_semantics: [
      {
        contract: "Vault",
        variable: "feeRate",
        inferred_unit: "bps",
        conflicts_with: [
          { contract: "Router", variable: "feeRate", inferred_unit: "percent_of_100" },
        ],
      },
    ],
    protocol_invariants: [
      {
        id: "INV-1",
        description: "totalSupply == sum(balances)",
        scope: "system",
        related_contracts: ["Token"],
        related_variables: ["totalSupply"],
      },
      {
        id: "INV-2",
        description: "vault balance >= total deposits",
        scope: "local",
        related_contracts: ["Vault"],
        related_variables: ["totalDeposits"],
      },
    ],
    static_summary: {
      slither_finding_count: 5,
      aderyn_finding_count: 3,
      categories_detected: ["reentrancy", "access-control"],
      highest_severity: "HIGH",
    },
    ...overrides,
  };
}

/**
 * Creates a test finding with sensible defaults.
 */
function createTestFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    title: "Test Finding",
    severity: "HIGH",
    confidence: "Confirmed",
    source: "manual",
    category: "Reentrancy",
    affected_files: ["Vault.sol"],
    affected_lines: { start: 42, end: 58 },
    description: "Test description",
    evidence_sources: [{ type: "static_analysis", tool: "slither" }],
    ...overrides,
  };
}

describe("AC1: Default mode partitioning", () => {
  it("places verified findings in scored_findings", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "Verified", status: "verified" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.scored_findings).toHaveLength(1);
    expect(report.scored_findings[0].title).toBe("Verified");
    expect(report.research_candidates).toHaveLength(0);
    expect(report.discarded_hypotheses).toHaveLength(0);
  });

  it("places candidate findings in research_candidates", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "Candidate", status: "candidate" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.scored_findings).toHaveLength(0);
    expect(report.research_candidates).toHaveLength(1);
    expect(report.research_candidates[0].title).toBe("Candidate");
  });

  it("places discarded findings in discarded_hypotheses", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "Discarded", status: "discarded" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.scored_findings).toHaveLength(0);
    expect(report.research_candidates).toHaveLength(0);
    expect(report.discarded_hypotheses).toHaveLength(1);
    expect(report.discarded_hypotheses[0].title).toBe("Discarded");
  });

  it("places findings with undefined status in research_candidates", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "Undefined Status" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.research_candidates).toHaveLength(1);
    expect(report.research_candidates[0].title).toBe("Undefined Status");
  });

  it("partitions mixed findings correctly", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "V1", status: "verified" }),
      createTestFinding({ title: "C1", status: "candidate" }),
      createTestFinding({ title: "D1", status: "discarded" }),
      createTestFinding({ title: "V2", status: "verified" }),
      createTestFinding({ title: "U1" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.scored_findings).toHaveLength(2);
    expect(report.research_candidates).toHaveLength(2);
    expect(report.discarded_hypotheses).toHaveLength(1);
  });
});

describe("AC2: Benchmark mode gating", () => {
  it("excludes verified HIGH finding without proof from scored", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "HIGH no proof",
        severity: "HIGH",
        status: "verified",
        proof_type: "none",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(0);
    expect(report.research_candidates).toHaveLength(1);
    expect(report.research_candidates[0].title).toBe("HIGH no proof");
  });

  it("excludes verified MEDIUM finding without proof from scored", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "MEDIUM no proof",
        severity: "MEDIUM",
        status: "verified",
        proof_type: "none",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(0);
    expect(report.research_candidates).toHaveLength(1);
  });

  it("excludes verified HIGH finding with undefined proof_type from scored", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "HIGH undefined proof",
        severity: "HIGH",
        status: "verified",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(0);
    expect(report.research_candidates).toHaveLength(1);
  });

  it("includes verified HIGH finding with foundry_poc proof in scored", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "HIGH with proof",
        severity: "HIGH",
        status: "verified",
        proof_type: "foundry_poc",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(1);
    expect(report.scored_findings[0].title).toBe("HIGH with proof");
  });

  it("includes verified CRITICAL finding without proof in scored (only HIGH/MEDIUM gated)", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "CRITICAL no proof",
        severity: "CRITICAL",
        status: "verified",
        proof_type: "none",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(1);
    expect(report.scored_findings[0].title).toBe("CRITICAL no proof");
  });

  it("includes verified LOW finding without proof in scored", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "LOW no proof",
        severity: "LOW",
        status: "verified",
        proof_type: "none",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(1);
  });
});

describe("AC3: Empty findings", () => {
  it("returns valid report with empty arrays", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");

    expect(report.scored_findings).toEqual([]);
    expect(report.research_candidates).toEqual([]);
    expect(report.discarded_hypotheses).toEqual([]);
    expect(report.metadata.total_findings).toBe(0);
    expect(report.metadata.verified_count).toBe(0);
    expect(report.metadata.candidate_count).toBe(0);
    expect(report.metadata.discarded_count).toBe(0);
  });
});

describe("AC4: Metadata counts are correct", () => {
  it("reports correct counts for mixed findings", () => {
    const findings: Finding[] = [
      createTestFinding({ status: "verified" }),
      createTestFinding({ status: "verified" }),
      createTestFinding({ status: "candidate" }),
      createTestFinding({ status: "discarded" }),
      createTestFinding({}),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.metadata.total_findings).toBe(5);
    expect(report.metadata.verified_count).toBe(2);
    expect(report.metadata.candidate_count).toBe(2);
    expect(report.metadata.discarded_count).toBe(1);
  });

  it("includes workflow mode in metadata", () => {
    const report = buildAuditReport([], createTestArtifact(), "benchmark");
    expect(report.metadata.workflow_mode).toBe("benchmark");
  });

  it("includes ISO timestamp in metadata", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");
    expect(report.metadata.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("AC5: System map summary counts are correct", () => {
  it("counts components correctly", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");
    expect(report.system_map_summary.component_count).toBe(2);
  });

  it("counts invariants correctly", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");
    expect(report.system_map_summary.invariant_count).toBe(2);
  });

  it("counts external surfaces correctly", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");
    expect(report.system_map_summary.external_surface_count).toBe(1);
  });

  it("counts config conflicts correctly", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");
    expect(report.system_map_summary.config_conflict_count).toBe(1);
  });

  it("handles empty config semantics", () => {
    const artifact = createTestArtifact({ config_semantics: [] });
    const report = buildAuditReport([], artifact, "default");
    expect(report.system_map_summary.config_conflict_count).toBe(0);
  });
});

describe("AC6: Static analysis summary", () => {
  it("passes through static summary from artifact", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");

    expect(report.static_analysis_summary.slither_finding_count).toBe(5);
    expect(report.static_analysis_summary.aderyn_finding_count).toBe(3);
    expect(report.static_analysis_summary.categories_detected).toEqual(["reentrancy", "access-control"]);
    expect(report.static_analysis_summary.highest_severity).toBe("HIGH");
  });
});

describe("AC7: Mix of all three statuses in one report", () => {
  it("correctly partitions verified, candidate, and discarded findings", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "V1", status: "verified", severity: "HIGH", proof_type: "foundry_poc" }),
      createTestFinding({ title: "V2", status: "verified", severity: "MEDIUM", proof_type: "echidna" }),
      createTestFinding({ title: "C1", status: "candidate", severity: "HIGH" }),
      createTestFinding({ title: "C2", status: "candidate", severity: "LOW" }),
      createTestFinding({ title: "D1", status: "discarded", severity: "HIGH" }),
      createTestFinding({ title: "D2", status: "discarded", severity: "INFORMATIONAL" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.scored_findings).toHaveLength(2);
    expect(report.research_candidates).toHaveLength(2);
    expect(report.discarded_hypotheses).toHaveLength(2);
    expect(report.metadata.total_findings).toBe(6);
  });
});

describe("AC8: Findings with missing status field treated as candidate", () => {
  it("treats undefined status as candidate (research_candidates)", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "No Status" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.scored_findings).toHaveLength(0);
    expect(report.research_candidates).toHaveLength(1);
    expect(report.research_candidates[0].title).toBe("No Status");
  });

  it("treats multiple findings with missing status as candidates", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "A" }),
      createTestFinding({ title: "B" }),
      createTestFinding({ title: "C" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.research_candidates).toHaveLength(3);
    expect(report.scored_findings).toHaveLength(0);
  });
});

describe("AC9: Findings with missing benchmark_mode_visible treated as visible", () => {
  it("verified finding without benchmark_mode_visible is scored in default mode", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "Visible", status: "verified" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "default");

    expect(report.scored_findings).toHaveLength(1);
  });
});

describe("AC10: Report metadata.generated_at is valid ISO timestamp", () => {
  it("generated_at parses as a valid Date", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");
    const date = new Date(report.metadata.generated_at);
    expect(date.toString()).not.toBe("Invalid Date");
  });

  it("generated_at matches ISO 8601 format", () => {
    const report = buildAuditReport([], createTestArtifact(), "default");
    expect(report.metadata.generated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

describe("AC11: Benchmark mode with CRITICAL findings", () => {
  it("CRITICAL findings without proof still shown in benchmark mode", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "CRITICAL no proof",
        severity: "CRITICAL",
        status: "verified",
        proof_type: "none",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(1);
    expect(report.scored_findings[0].title).toBe("CRITICAL no proof");
  });

  it("CRITICAL finding with proof also shown in benchmark mode", () => {
    const findings: Finding[] = [
      createTestFinding({
        title: "CRITICAL with proof",
        severity: "CRITICAL",
        status: "verified",
        proof_type: "echidna",
      }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(1);
  });

  it("benchmark mode gates only HIGH and MEDIUM, not CRITICAL or LOW", () => {
    const findings: Finding[] = [
      createTestFinding({ title: "CRITICAL", severity: "CRITICAL", status: "verified", proof_type: "none" }),
      createTestFinding({ title: "HIGH", severity: "HIGH", status: "verified", proof_type: "none" }),
      createTestFinding({ title: "MEDIUM", severity: "MEDIUM", status: "verified", proof_type: "none" }),
      createTestFinding({ title: "LOW", severity: "LOW", status: "verified", proof_type: "none" }),
    ];

    const report = buildAuditReport(findings, createTestArtifact(), "benchmark");

    expect(report.scored_findings).toHaveLength(2);
    expect(report.scored_findings.map((f) => f.severity).sort()).toEqual(["CRITICAL", "LOW"]);
    expect(report.research_candidates).toHaveLength(2);
    expect(report.research_candidates.map((f) => f.severity).sort()).toEqual(["HIGH", "MEDIUM"]);
  });
});
