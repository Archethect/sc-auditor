import type { ProofType } from "./finding.js";

/**
 * Verdict from the skeptic review stage.
 *
 * - refuted: Evidence against the finding outweighs evidence for it.
 * - plausible: Finding is plausible but not conclusively confirmed.
 * - confirmed: Finding is confirmed with strong evidence.
 */
export type SkepticVerdict = "refuted" | "plausible" | "confirmed";

/**
 * Verdict from the judge review stage.
 *
 * - verified: Finding is accepted as a real vulnerability.
 * - candidate: Finding remains under investigation.
 * - discarded: Finding is rejected.
 */
export type JudgeVerdict = "verified" | "candidate" | "discarded";

/**
 * Artifact produced by the verification pipeline for a single finding.
 *
 * Contains verdicts from both the skeptic and judge stages,
 * proof metadata, and notes from the verification process.
 */
export interface VerificationArtifact {
  /** ID of the finding being verified. */
  finding_id: string;
  /** Verdict from the skeptic review stage. */
  skeptic_verdict: SkepticVerdict;
  /** Verdict from the judge review stage. */
  judge_verdict: JudgeVerdict;
  /** Type of proof used during verification. */
  proof_type: ProofType;
  /** File path to the witness/proof-of-concept, if available. */
  witness_path?: string;
  /** Free-form notes from the verification process. */
  verification_notes: string;
  /** Whether this artifact is visible in benchmark mode. */
  benchmark_mode_visible: boolean;
}
