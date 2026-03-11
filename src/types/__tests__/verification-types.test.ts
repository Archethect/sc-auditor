import { describe, expect, it } from "vitest";
import type {
  JudgeVerdict,
  SkepticVerdict,
  VerificationArtifact,
} from "../verification.js";
import type { ProofType } from "../finding.js";

/** Construct a minimal valid VerificationArtifact with only required fields. */
function minimalArtifact(
  overrides: Partial<VerificationArtifact> = {},
): VerificationArtifact {
  return {
    finding_id: "F-001",
    skeptic_verdict: "plausible",
    judge_verdict: "candidate",
    proof_type: "none",
    verification_notes: "Initial review",
    benchmark_mode_visible: true,
    ...overrides,
  };
}

/**
 * AC1: SkepticVerdict type alias exists with correct values
 */
describe("AC1: SkepticVerdict type alias", () => {
  it.each(["refuted", "plausible", "confirmed"] as const)(
    "accepts '%s' as a valid SkepticVerdict",
    (value) => {
      const v: SkepticVerdict = value;
      expect(v).toBe(value);
    },
  );

  it("rejects invalid SkepticVerdict values", () => {
    // @ts-expect-error - 'unknown' is not a valid SkepticVerdict
    const _v: SkepticVerdict = "unknown";
    expect(_v).toBe("unknown");
  });
});

/**
 * AC2: JudgeVerdict type alias exists with correct values
 */
describe("AC2: JudgeVerdict type alias", () => {
  it.each(["verified", "candidate", "discarded"] as const)(
    "accepts '%s' as a valid JudgeVerdict",
    (value) => {
      const v: JudgeVerdict = value;
      expect(v).toBe(value);
    },
  );

  it("rejects invalid JudgeVerdict values", () => {
    // @ts-expect-error - 'pending' is not a valid JudgeVerdict
    const _v: JudgeVerdict = "pending";
    expect(_v).toBe("pending");
  });
});

/**
 * AC3: VerificationArtifact interface has all required fields from spec
 */
describe("AC3: VerificationArtifact interface", () => {
  it("can be constructed with all required fields", () => {
    const artifact = minimalArtifact();
    expect(artifact.finding_id).toBe("F-001");
    expect(artifact.skeptic_verdict).toBe("plausible");
    expect(artifact.judge_verdict).toBe("candidate");
    expect(artifact.proof_type).toBe("none");
    expect(artifact.verification_notes).toBe("Initial review");
    expect(artifact.benchmark_mode_visible).toBe(true);
    expect(artifact.witness_path).toBeUndefined();
  });

  it("accepts optional witness_path", () => {
    const artifact = minimalArtifact({
      witness_path: "test/poc/Exploit.t.sol",
    });
    expect(artifact.witness_path).toBe("test/poc/Exploit.t.sol");
  });

  it("accepts all ProofType values via proof_type field", () => {
    const proofTypes: ProofType[] = [
      "none",
      "foundry_poc",
      "echidna",
      "medusa",
      "halmos",
      "ityfuzz",
    ];
    for (const pt of proofTypes) {
      const artifact = minimalArtifact({ proof_type: pt });
      expect(artifact.proof_type).toBe(pt);
    }
  });

  it("rejects VerificationArtifact without finding_id", () => {
    // @ts-expect-error - 'finding_id' is required on VerificationArtifact
    const _a: VerificationArtifact = {
      skeptic_verdict: "plausible",
      judge_verdict: "candidate",
      proof_type: "none",
      verification_notes: "notes",
      benchmark_mode_visible: true,
    };
    expect(_a).toBeDefined();
  });

  it("rejects VerificationArtifact without skeptic_verdict", () => {
    // @ts-expect-error - 'skeptic_verdict' is required on VerificationArtifact
    const _a: VerificationArtifact = {
      finding_id: "F-001",
      judge_verdict: "candidate",
      proof_type: "none",
      verification_notes: "notes",
      benchmark_mode_visible: true,
    };
    expect(_a).toBeDefined();
  });

  it("rejects VerificationArtifact without judge_verdict", () => {
    // @ts-expect-error - 'judge_verdict' is required on VerificationArtifact
    const _a: VerificationArtifact = {
      finding_id: "F-001",
      skeptic_verdict: "plausible",
      proof_type: "none",
      verification_notes: "notes",
      benchmark_mode_visible: true,
    };
    expect(_a).toBeDefined();
  });

  it("rejects VerificationArtifact without verification_notes", () => {
    // @ts-expect-error - 'verification_notes' is required on VerificationArtifact
    const _a: VerificationArtifact = {
      finding_id: "F-001",
      skeptic_verdict: "plausible",
      judge_verdict: "candidate",
      proof_type: "none",
      benchmark_mode_visible: true,
    };
    expect(_a).toBeDefined();
  });

  it("rejects VerificationArtifact without benchmark_mode_visible", () => {
    // @ts-expect-error - 'benchmark_mode_visible' is required on VerificationArtifact
    const _a: VerificationArtifact = {
      finding_id: "F-001",
      skeptic_verdict: "plausible",
      judge_verdict: "candidate",
      proof_type: "none",
      verification_notes: "notes",
    };
    expect(_a).toBeDefined();
  });
});

/**
 * AC4: VerificationArtifact represents a verified finding
 */
describe("AC4: VerificationArtifact verified finding scenario", () => {
  it("represents a fully verified finding with proof", () => {
    const artifact = minimalArtifact({
      finding_id: "F-042",
      skeptic_verdict: "confirmed",
      judge_verdict: "verified",
      proof_type: "foundry_poc",
      witness_path: "test/poc/ReentrancyExploit.t.sol",
      verification_notes: "PoC demonstrates ETH drain via reentrancy",
      benchmark_mode_visible: false,
    });
    expect(artifact.skeptic_verdict).toBe("confirmed");
    expect(artifact.judge_verdict).toBe("verified");
    expect(artifact.proof_type).toBe("foundry_poc");
    expect(artifact.witness_path).toBe("test/poc/ReentrancyExploit.t.sol");
    expect(artifact.benchmark_mode_visible).toBe(false);
  });

  it("represents a discarded finding", () => {
    const artifact = minimalArtifact({
      skeptic_verdict: "refuted",
      judge_verdict: "discarded",
      verification_notes: "False positive: modifier prevents exploitation",
    });
    expect(artifact.skeptic_verdict).toBe("refuted");
    expect(artifact.judge_verdict).toBe("discarded");
  });
});
