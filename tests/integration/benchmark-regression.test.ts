/**
 * Benchmark regression integration tests.
 *
 * Models three known miss classes (callback grief, accounting entitlement
 * drift, and semantic drift) using real fixture files with actual MAP
 * builder and hotspot ranking.
 */

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSystemMap } from "../../src/core/map-builder.js";
import { deriveHotspots } from "../../src/core/hotspot-ranking.js";
import { applyProofToFinding } from "../../src/core/verification.js";
import { buildAuditReport } from "../../src/report/audit-report.js";
import type { Finding } from "../../src/types/finding.js";
import type { ProofResult } from "../../src/core/verification.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures/solidity");

describe("Benchmark: callback grief path", () => {
  it("CallbackGrief.sol produces a callback_liveness hotspot", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    // Verify artifact contains external_call_sites with a callback pattern
    const callbackCalls = artifact.external_call_sites.filter(
      (c) => c.contract === "CallbackGrief",
    );
    expect(callbackCalls.length).toBeGreaterThan(0);

    const hotspots = deriveHotspots(artifact, [], "default");
    expect(hotspots.some((h) => h.lane === "callback_liveness")).toBe(true);
  });

  it("callback_liveness hotspot references the grief vector", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);
    const hotspots = deriveHotspots(artifact, [], "default");

    const callbackHotspot = hotspots.find((h) => h.lane === "callback_liveness");
    expect(callbackHotspot).toBeDefined();

    // The hotspot's evidence or title should reference relevant contract/function
    const hasRelevantContext =
      callbackHotspot?.title.includes("CallbackGrief") ||
      callbackHotspot?.affected_functions.some((f) => f.includes("CallbackGrief")) ||
      callbackHotspot?.evidence.some((e) => e.detail.includes("call"));
    expect(hasRelevantContext).toBe(true);
  });
});

describe("Benchmark: accounting entitlement drift path", () => {
  it("EntitlementDrift.sol produces state variables shares and totalShares", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const shares = artifact.state_variables.find(
      (v) => v.contract === "EntitlementDrift" && v.name === "shares",
    );
    expect(shares).toBeDefined();

    const totalShares = artifact.state_variables.find(
      (v) => v.contract === "EntitlementDrift" && v.name === "totalShares",
    );
    expect(totalShares).toBeDefined();
  });

  it("derives a balance invariant for EntitlementDrift shares/totalShares", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const sharesInvariant = artifact.protocol_invariants.find(
      (inv) => inv.description.includes("totalShares") && inv.description.includes("shares"),
    );
    expect(sharesInvariant).toBeDefined();
  });
});

describe("Benchmark: semantic drift path", () => {
  it("SemanticDrift.sol produces config_semantics with taxCut conflict", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const taxCutSemantics = artifact.config_semantics.filter(
      (cs) => cs.variable === "taxCut",
    );
    expect(taxCutSemantics.length).toBeGreaterThanOrEqual(2);

    const hasConflict = taxCutSemantics.some(
      (cs) => cs.conflicts_with && cs.conflicts_with.length > 0,
    );
    expect(hasConflict).toBe(true);
  });

  it("SemanticDrift.sol produces a semantic_consistency hotspot", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);
    const hotspots = deriveHotspots(artifact, [], "default");
    expect(hotspots.some((h) => h.lane === "semantic_consistency")).toBe(true);
  });

  it("semantic_consistency hotspot mentions taxCut variable", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);
    const hotspots = deriveHotspots(artifact, [], "default");
    const semanticHotspot = hotspots.find((h) => h.lane === "semantic_consistency");
    expect(semanticHotspot).toBeDefined();
    expect(semanticHotspot?.title).toContain("taxCut");
  });
});

describe("Benchmark: verification state transitions", () => {
  it("finding derived from hotspot can go through verify-finding flow", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);
    const hotspots = deriveHotspots(artifact, [], "default");
    expect(hotspots.length).toBeGreaterThan(0);

    const hotspot = hotspots[0];
    const finding: Finding = {
      title: hotspot.title,
      severity: "HIGH",
      confidence: "Likely",
      source: "manual",
      category: "reentrancy",
      affected_files: hotspot.affected_files.length > 0 ? hotspot.affected_files : ["test.sol"],
      affected_lines: { start: 1, end: 10 },
      description: hotspot.root_cause_hypothesis,
      evidence_sources: [{ type: "static_analysis", tool: "manual" }],
      status: "candidate",
      proof_type: "none",
    };

    // Initially candidate
    expect(finding.status).toBe("candidate");

    // Apply a successful proof
    const proof: ProofResult = {
      success: true,
      proof_type: "foundry_poc",
      witness_path: "/tmp/test_poc.t.sol",
      details: "PoC confirmed reentrancy",
    };

    const verified = applyProofToFinding(finding, proof);
    expect(verified.status).toBe("verified");
    expect(verified.proof_type).toBe("foundry_poc");
    expect(verified.benchmark_mode_visible).toBe(true);
  });

  it("benchmark mode correctly gates unproven HIGH findings", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const unprovenFinding: Finding = {
      title: "Unproven reentrancy",
      severity: "HIGH",
      confidence: "Likely",
      source: "slither",
      category: "reentrancy",
      affected_files: ["CallbackGrief.sol"],
      affected_lines: { start: 11, end: 15 },
      description: "Potential reentrancy in transferToken",
      evidence_sources: [{ type: "static_analysis", tool: "slither" }],
      status: "verified",
      proof_type: "none",
    };

    const provenFinding: Finding = {
      title: "Proven reentrancy",
      severity: "HIGH",
      confidence: "Confirmed",
      source: "slither",
      category: "reentrancy",
      affected_files: ["CallbackGrief.sol"],
      affected_lines: { start: 11, end: 15 },
      description: "Proven reentrancy in transferToken",
      evidence_sources: [{ type: "static_analysis", tool: "slither" }],
      status: "verified",
      proof_type: "foundry_poc",
      witness_path: "/tmp/poc.t.sol",
    };

    const report = buildAuditReport(
      [unprovenFinding, provenFinding],
      artifact,
      "benchmark",
    );

    // Unproven HIGH should be gated (moved to research_candidates)
    expect(report.scored_findings).toHaveLength(1);
    expect(report.scored_findings[0].title).toBe("Proven reentrancy");
    expect(report.research_candidates).toHaveLength(1);
    expect(report.research_candidates[0].title).toBe("Unproven reentrancy");
  });

  it("each fixture reaches the expected hotspot lane", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);
    const hotspots = deriveHotspots(artifact, [], "default");

    const lanes = new Set(hotspots.map((h) => h.lane));
    expect(lanes.has("callback_liveness")).toBe(true);
    expect(lanes.has("semantic_consistency")).toBe(true);
  });
});
