/**
 * Proof ingestion and verification state transitions.
 *
 * Translates proof tool outputs into ProofType, witness_path,
 * and verification notes. Manages finding state transitions
 * based on proof evidence.
 */

import type { Finding, ProofType } from "../types/finding.js";

/**
 * Result of ingesting a proof from any verification tool.
 */
export interface ProofResult {
  /** Whether the proof attempt succeeded and produced evidence. */
  success: boolean;
  /** Type of proof tool that produced this result. */
  proof_type: ProofType;
  /** Path to the witness file, if one was produced. */
  witness_path?: string;
  /** Human-readable details about the proof attempt. */
  details: string;
}

/** Expected shape of Foundry PoC generator output. */
interface FoundryOutput {
  success: boolean;
  witness_path: string;
  scaffold_metadata: unknown;
}

/** Expected shape of Echidna execution output. */
interface EchidnaOutput {
  success: boolean;
  available: boolean;
  results?: { counterexamples: unknown[] };
}

/** Expected shape of Medusa execution output. */
interface MedusaOutput {
  success: boolean;
  available: boolean;
  results?: { failures: unknown[] };
}

/** Expected shape of Halmos execution output. */
interface HalmosOutput {
  success: boolean;
  available: boolean;
  results?: { counterexamples: unknown[] };
}

/**
 * Ingests the output of a Foundry PoC generator into a ProofResult.
 *
 * A Foundry proof is considered successful when the scaffold was
 * created (success=true) and a witness path is available.
 *
 * @param output - Output from the generate-foundry-poc tool
 * @returns Normalized proof result
 */
export function ingestFoundryProof(output: FoundryOutput): ProofResult {
  if (!output.success || !output.witness_path) {
    return {
      success: false,
      proof_type: "foundry_poc",
      details: "Foundry PoC generation failed or produced no witness file",
    };
  }

  return {
    success: true,
    proof_type: "foundry_poc",
    witness_path: output.witness_path,
    details: `Foundry PoC scaffold generated at ${output.witness_path}`,
  };
}

/**
 * Ingests the output of an Echidna fuzzer run into a ProofResult.
 *
 * A proof is successful when Echidna is available, ran successfully,
 * and found at least one counterexample.
 *
 * @param output - Output from the run-echidna tool
 * @returns Normalized proof result
 */
export function ingestEchidnaProof(output: EchidnaOutput): ProofResult {
  if (!output.available) {
    return {
      success: false,
      proof_type: "echidna",
      details: "Echidna is not available on this system",
    };
  }

  if (!output.success || !output.results) {
    return {
      success: false,
      proof_type: "echidna",
      details: "Echidna execution failed or produced no results",
    };
  }

  const hasCounterexamples = output.results.counterexamples.length > 0;
  if (!hasCounterexamples) {
    return {
      success: false,
      proof_type: "echidna",
      details: "Echidna ran successfully but found no counterexamples",
    };
  }

  return {
    success: true,
    proof_type: "echidna",
    details: `Echidna found ${output.results.counterexamples.length} counterexample(s)`,
  };
}

/**
 * Ingests the output of a Medusa fuzzer run into a ProofResult.
 *
 * A proof is successful when Medusa is available, ran successfully,
 * and found at least one failure.
 *
 * @param output - Output from the run-medusa tool
 * @returns Normalized proof result
 */
export function ingestMedusaProof(output: MedusaOutput): ProofResult {
  if (!output.available) {
    return {
      success: false,
      proof_type: "medusa",
      details: "Medusa is not available on this system",
    };
  }

  if (!output.success || !output.results) {
    return {
      success: false,
      proof_type: "medusa",
      details: "Medusa execution failed or produced no results",
    };
  }

  const hasFailures = output.results.failures.length > 0;
  if (!hasFailures) {
    return {
      success: false,
      proof_type: "medusa",
      details: "Medusa ran successfully but found no failures",
    };
  }

  return {
    success: true,
    proof_type: "medusa",
    details: `Medusa found ${output.results.failures.length} failure(s)`,
  };
}

/**
 * Ingests the output of a Halmos symbolic execution run into a ProofResult.
 *
 * A proof is successful when Halmos is available, ran successfully,
 * and found at least one counterexample.
 *
 * @param output - Output from the run-halmos tool
 * @returns Normalized proof result
 */
export function ingestHalmosProof(output: HalmosOutput): ProofResult {
  if (!output.available) {
    return {
      success: false,
      proof_type: "halmos",
      details: "Halmos is not available on this system",
    };
  }

  if (!output.success || !output.results) {
    return {
      success: false,
      proof_type: "halmos",
      details: "Halmos execution failed or produced no results",
    };
  }

  const hasCounterexamples = output.results.counterexamples.length > 0;
  if (!hasCounterexamples) {
    return {
      success: false,
      proof_type: "halmos",
      details: "Halmos ran successfully but found no counterexamples",
    };
  }

  return {
    success: true,
    proof_type: "halmos",
    details: `Halmos found ${output.results.counterexamples.length} counterexample(s)`,
  };
}

/**
 * Applies a proof result to a finding, updating its verification state.
 *
 * If the proof is successful with actual evidence, the finding is upgraded
 * to "verified" status. Otherwise, the finding stays in its current state
 * with a note appended.
 *
 * @param finding - The finding to update (not mutated; returns a new copy)
 * @param proof - The proof result to apply
 * @returns A new Finding with updated verification fields
 */
export function applyProofToFinding(finding: Finding, proof: ProofResult): Finding {
  const updated = { ...finding };

  if (proof.success) {
    updated.status = "verified";
    updated.proof_type = proof.proof_type;
    updated.witness_path = proof.witness_path;
    updated.verification_notes = proof.details;
    updated.benchmark_mode_visible = true;
    return updated;
  }

  // Proof failed — keep current status, append note
  const existingNotes = updated.verification_notes ?? "";
  const separator = existingNotes.length > 0 ? "; " : "";
  updated.verification_notes = `${existingNotes}${separator}${proof.details}`;

  return updated;
}
