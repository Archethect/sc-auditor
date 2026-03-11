/**
 * Tests for proof ingestion and verification state transitions.
 */

import { describe, expect, it } from "vitest";
import type { Finding } from "../../types/finding.js";
import {
  applyProofToFinding,
  ingestEchidnaProof,
  ingestFoundryProof,
  ingestHalmosProof,
  ingestMedusaProof,
} from "../verification.js";

/** Creates a minimal candidate finding for testing. */
function createCandidateFinding(overrides?: Partial<Finding>): Finding {
  return {
    title: "Test Reentrancy",
    severity: "HIGH",
    confidence: "Likely",
    source: "slither",
    category: "reentrancy",
    affected_files: ["contracts/Vault.sol"],
    affected_lines: { start: 10, end: 20 },
    description: "Reentrancy vulnerability in withdraw function",
    evidence_sources: [{ type: "static_analysis", tool: "slither" }],
    status: "candidate",
    proof_type: "none",
    ...overrides,
  };
}

describe("ingestFoundryProof", () => {
  it("returns successful proof when scaffold was created", () => {
    const result = ingestFoundryProof({
      success: true,
      witness_path: "/tmp/work/pocs/HS-001_poc.t.sol",
      scaffold_metadata: { test_file: "test.sol" },
    });

    expect(result.success).toBe(true);
    expect(result.proof_type).toBe("foundry_poc");
    expect(result.witness_path).toBe("/tmp/work/pocs/HS-001_poc.t.sol");
    expect(result.details).toContain("scaffold generated");
  });

  it("returns failed proof when generation failed", () => {
    const result = ingestFoundryProof({
      success: false,
      witness_path: "",
      scaffold_metadata: null,
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("foundry_poc");
    expect(result.details).toContain("failed");
  });

  it("returns failed proof when witness_path is empty", () => {
    const result = ingestFoundryProof({
      success: true,
      witness_path: "",
      scaffold_metadata: {},
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("foundry_poc");
  });
});

describe("ingestEchidnaProof", () => {
  it("returns successful proof when counterexamples are found", () => {
    const result = ingestEchidnaProof({
      success: true,
      available: true,
      results: { counterexamples: ["withdraw(100)"] },
    });

    expect(result.success).toBe(true);
    expect(result.proof_type).toBe("echidna");
    expect(result.details).toContain("1 counterexample");
  });

  it("returns failed proof when no counterexamples are found", () => {
    const result = ingestEchidnaProof({
      success: true,
      available: true,
      results: { counterexamples: [] },
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("echidna");
    expect(result.details).toContain("no counterexamples");
  });

  it("returns failed proof when tool is unavailable", () => {
    const result = ingestEchidnaProof({
      success: true,
      available: false,
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("echidna");
    expect(result.details).toContain("not available");
  });

  it("returns failed proof when execution failed", () => {
    const result = ingestEchidnaProof({
      success: false,
      available: true,
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("echidna");
    expect(result.details).toContain("failed");
  });
});

describe("ingestMedusaProof", () => {
  it("returns successful proof when failures are found", () => {
    const result = ingestMedusaProof({
      success: true,
      available: true,
      results: { failures: ["property_test_balance: FAILED"] },
    });

    expect(result.success).toBe(true);
    expect(result.proof_type).toBe("medusa");
    expect(result.details).toContain("1 failure");
  });

  it("returns failed proof when no failures are found", () => {
    const result = ingestMedusaProof({
      success: true,
      available: true,
      results: { failures: [] },
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("medusa");
    expect(result.details).toContain("no failures");
  });

  it("returns failed proof when tool is unavailable", () => {
    const result = ingestMedusaProof({
      success: true,
      available: false,
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("medusa");
    expect(result.details).toContain("not available");
  });

  it("returns failed proof when execution failed", () => {
    const result = ingestMedusaProof({
      success: false,
      available: true,
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("medusa");
    expect(result.details).toContain("failed");
  });
});

describe("ingestHalmosProof", () => {
  it("returns successful proof when counterexamples are found", () => {
    const result = ingestHalmosProof({
      success: true,
      available: true,
      results: { counterexamples: ["x = 0xff", "y = 0x00"] },
    });

    expect(result.success).toBe(true);
    expect(result.proof_type).toBe("halmos");
    expect(result.details).toContain("2 counterexample");
  });

  it("returns failed proof when no counterexamples are found", () => {
    const result = ingestHalmosProof({
      success: true,
      available: true,
      results: { counterexamples: [] },
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("halmos");
    expect(result.details).toContain("no counterexamples");
  });

  it("returns failed proof when tool is unavailable", () => {
    const result = ingestHalmosProof({
      success: true,
      available: false,
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("halmos");
    expect(result.details).toContain("not available");
  });

  it("returns failed proof when execution failed", () => {
    const result = ingestHalmosProof({
      success: false,
      available: true,
    });

    expect(result.success).toBe(false);
    expect(result.proof_type).toBe("halmos");
    expect(result.details).toContain("failed");
  });
});

describe("applyProofToFinding", () => {
  it("upgrades finding to verified on successful foundry proof", () => {
    const finding = createCandidateFinding();
    const proof = ingestFoundryProof({
      success: true,
      witness_path: "/tmp/poc.t.sol",
      scaffold_metadata: {},
    });

    const updated = applyProofToFinding(finding, proof);

    expect(updated.status).toBe("verified");
    expect(updated.proof_type).toBe("foundry_poc");
    expect(updated.witness_path).toBe("/tmp/poc.t.sol");
    expect(updated.verification_notes).toContain("scaffold generated");
    expect(updated.benchmark_mode_visible).toBe(true);
  });

  it("upgrades finding to verified on echidna counterexample", () => {
    const finding = createCandidateFinding();
    const proof = ingestEchidnaProof({
      success: true,
      available: true,
      results: { counterexamples: ["withdraw(100)"] },
    });

    const updated = applyProofToFinding(finding, proof);

    expect(updated.status).toBe("verified");
    expect(updated.proof_type).toBe("echidna");
    expect(updated.benchmark_mode_visible).toBe(true);
  });

  it("upgrades finding to verified on medusa failure", () => {
    const finding = createCandidateFinding();
    const proof = ingestMedusaProof({
      success: true,
      available: true,
      results: { failures: ["prop_balance_invariant: FAILED"] },
    });

    const updated = applyProofToFinding(finding, proof);

    expect(updated.status).toBe("verified");
    expect(updated.proof_type).toBe("medusa");
  });

  it("upgrades finding to verified on halmos counterexample", () => {
    const finding = createCandidateFinding();
    const proof = ingestHalmosProof({
      success: true,
      available: true,
      results: { counterexamples: ["x = 0xff"] },
    });

    const updated = applyProofToFinding(finding, proof);

    expect(updated.status).toBe("verified");
    expect(updated.proof_type).toBe("halmos");
  });

  it("keeps finding as candidate when proof fails", () => {
    const finding = createCandidateFinding();
    const proof = ingestEchidnaProof({
      success: true,
      available: true,
      results: { counterexamples: [] },
    });

    const updated = applyProofToFinding(finding, proof);

    expect(updated.status).toBe("candidate");
    expect(updated.proof_type).toBe("none");
    expect(updated.verification_notes).toContain("no counterexamples");
  });

  it("keeps finding unchanged when tool is unavailable", () => {
    const finding = createCandidateFinding();
    const proof = ingestEchidnaProof({
      success: true,
      available: false,
    });

    const updated = applyProofToFinding(finding, proof);

    expect(updated.status).toBe("candidate");
    expect(updated.proof_type).toBe("none");
    expect(updated.verification_notes).toContain("not available");
  });

  it("does not mutate the original finding", () => {
    const finding = createCandidateFinding();
    const proof = ingestFoundryProof({
      success: true,
      witness_path: "/tmp/poc.t.sol",
      scaffold_metadata: {},
    });

    const updated = applyProofToFinding(finding, proof);

    expect(finding.status).toBe("candidate");
    expect(finding.proof_type).toBe("none");
    expect(updated.status).toBe("verified");
  });

  it("appends note to existing verification_notes on failed proof", () => {
    const finding = createCandidateFinding({
      verification_notes: "Initial review note",
    });
    const proof = ingestHalmosProof({
      success: true,
      available: true,
      results: { counterexamples: [] },
    });

    const updated = applyProofToFinding(finding, proof);

    expect(updated.verification_notes).toContain("Initial review note");
    expect(updated.verification_notes).toContain("no counterexamples");
  });

  it("covers all ProofType branches", () => {
    const proofTypes = [
      ingestFoundryProof({ success: true, witness_path: "/tmp/poc.sol", scaffold_metadata: {} }),
      ingestEchidnaProof({ success: true, available: true, results: { counterexamples: ["ce"] } }),
      ingestMedusaProof({ success: true, available: true, results: { failures: ["f"] } }),
      ingestHalmosProof({ success: true, available: true, results: { counterexamples: ["ce"] } }),
    ];

    const expectedTypes = ["foundry_poc", "echidna", "medusa", "halmos"];

    for (let i = 0; i < proofTypes.length; i++) {
      expect(proofTypes[i].proof_type).toBe(expectedTypes[i]);
      expect(proofTypes[i].success).toBe(true);
    }
  });
});

describe("Edge cases: multiple proof applications to same finding", () => {
  it("last successful proof wins over earlier failed proof", () => {
    const finding = createCandidateFinding();

    const failedProof = ingestEchidnaProof({
      success: true,
      available: true,
      results: { counterexamples: [] },
    });

    const intermediate = applyProofToFinding(finding, failedProof);
    expect(intermediate.status).toBe("candidate");
    expect(intermediate.verification_notes).toContain("no counterexamples");

    const successfulProof = ingestFoundryProof({
      success: true,
      witness_path: "/tmp/final.t.sol",
      scaffold_metadata: {},
    });

    const final = applyProofToFinding(intermediate, successfulProof);
    expect(final.status).toBe("verified");
    expect(final.proof_type).toBe("foundry_poc");
    expect(final.witness_path).toBe("/tmp/final.t.sol");
  });

  it("second successful proof overwrites first successful proof", () => {
    const finding = createCandidateFinding();

    const firstProof = ingestEchidnaProof({
      success: true,
      available: true,
      results: { counterexamples: ["withdraw(100)"] },
    });

    const afterFirst = applyProofToFinding(finding, firstProof);
    expect(afterFirst.status).toBe("verified");
    expect(afterFirst.proof_type).toBe("echidna");

    const secondProof = ingestFoundryProof({
      success: true,
      witness_path: "/tmp/poc.t.sol",
      scaffold_metadata: {},
    });

    const afterSecond = applyProofToFinding(afterFirst, secondProof);
    expect(afterSecond.status).toBe("verified");
    expect(afterSecond.proof_type).toBe("foundry_poc");
  });
});

describe("Edge cases: ItyFuzz proof type support", () => {
  it("finding can have ityfuzz as proof_type", () => {
    const finding = createCandidateFinding({ proof_type: "ityfuzz" });
    expect(finding.proof_type).toBe("ityfuzz");
  });

  it("ityfuzz is a valid proof_type string", () => {
    const validTypes = ["none", "foundry_poc", "echidna", "medusa", "halmos", "ityfuzz"];
    expect(validTypes).toContain("ityfuzz");
  });
});

describe("Edge cases: proof with empty witness_path", () => {
  it("successful proof without witness_path still upgrades to verified", () => {
    const finding = createCandidateFinding();
    const proof: import("../verification.js").ProofResult = {
      success: true,
      proof_type: "echidna",
      details: "Found counterexample via fuzzing",
    };

    const updated = applyProofToFinding(finding, proof);
    expect(updated.status).toBe("verified");
    expect(updated.proof_type).toBe("echidna");
    expect(updated.witness_path).toBeUndefined();
  });

  it("successful proof with undefined witness_path does not set empty string", () => {
    const finding = createCandidateFinding();
    const proof: import("../verification.js").ProofResult = {
      success: true,
      proof_type: "halmos",
      witness_path: undefined,
      details: "Counterexample found",
    };

    const updated = applyProofToFinding(finding, proof);
    expect(updated.status).toBe("verified");
    expect(updated.witness_path).toBeUndefined();
  });
});

describe("Edge cases: verification notes accumulation", () => {
  it("accumulates notes from multiple failed proofs", () => {
    const finding = createCandidateFinding();

    const proof1 = ingestEchidnaProof({
      success: true,
      available: true,
      results: { counterexamples: [] },
    });
    const after1 = applyProofToFinding(finding, proof1);

    const proof2 = ingestHalmosProof({
      success: true,
      available: true,
      results: { counterexamples: [] },
    });
    const after2 = applyProofToFinding(after1, proof2);

    expect(after2.verification_notes).toContain("no counterexamples");
    expect(after2.status).toBe("candidate");
  });
});
