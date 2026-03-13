/**
 * Tool or method that originally produced a finding.
 */
export type FindingSource = "slither" | "aderyn" | "manual";

/**
 * Lifecycle status of a finding through the verification pipeline.
 *
 * - candidate: Initial state, not yet verified.
 * - verified: Confirmed by proof and verification.
 * - judge_confirmed: Skeptic confirmed but proof failed/unavailable.
 * - discarded: Ruled out by the verification process.
 *
 * @default "candidate"
 */
export type FindingStatus = "candidate" | "verified" | "judge_confirmed" | "discarded" | "invalidated_by_attack";

/**
 * Type of proof used to verify a finding.
 *
 * - none: No proof provided.
 * - foundry_poc: Foundry-based proof of concept.
 * - echidna: Echidna fuzzer proof.
 * - medusa: Medusa fuzzer proof.
 * - halmos: Halmos symbolic execution proof.
 * - ityfuzz: ItyFuzz fuzzer proof.
 *
 * @default "none"
 */
export type ProofType = "none" | "foundry_poc" | "echidna" | "medusa" | "halmos" | "ityfuzz";

/**
 * Detector category for classifying static analysis findings.
 */
export type DetectorCategory =
  | "access_control"
  | "accounting_entitlement"
  | "callback_liveness"
  | "semantic_consistency"
  | "state_machine"
  | "state_machine_gap"
  | "math_rounding"
  | "reentrancy"
  | "oracle_randomness"
  | "token_integration"
  | "upgradeability"
  | "config_dependent"
  | "design_tradeoff"
  | "missing_validation"
  | "economic_differential"
  | "other";

/**
 * Severity levels for audit findings, ordered from most to least severe.
 *
 * Maps to SoloditSeverity: CRITICAL->Critical, HIGH->High, MEDIUM->Medium,
 * LOW->Low, GAS->Gas, INFORMATIONAL->Informational.
 */
export type FindingSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "GAS"
  | "INFORMATIONAL";

/**
 * Confidence tiers for audit findings.
 *
 * - Confirmed: Code clearly matches known vulnerable pattern.
 * - Likely: Strong match; context might mitigate.
 * - Possible: Pattern suggests risk but insufficient evidence.
 */
export type FindingConfidence = "Confirmed" | "Likely" | "Possible";

/**
 * Type of evidence source supporting a finding.
 */
export type EvidenceSourceType =
  | "static_analysis"
  | "checklist"
  | "solodit";

/**
 * A single evidence source supporting a finding.
 */
export interface EvidenceSource {
  type: EvidenceSourceType;
  /** Tool name for static_analysis (e.g., "slither", "aderyn") */
  tool?: string;
  /** Detector ID for static analysis tools */
  detector_id?: string;
  /** Checklist item ID (e.g., "SOL-CR-1") */
  checklist_item_id?: string;
  /** Solodit finding slug */
  solodit_slug?: string;
  /** Free-form detail about the evidence */
  detail?: string;
}

/**
 * An inclusive, 1-based line range.
 * For single-line findings, `start === end`.
 */
export interface LineRange {
  start: number;
  end: number;
}

/**
 * A single audit finding with structured evidence.
 */
export interface Finding {
  title: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  /** Tool or method that originally produced this finding */
  source: FindingSource;
  /** e.g., "Reentrancy", "Access Control" */
  category: string;
  affected_files: string[];
  /** Inclusive, 1-based line range */
  affected_lines: LineRange;
  description: string;
  impact?: string;
  remediation?: string;
  /** Reference to checklist item, e.g., "SOL-CR-1" */
  checklist_reference?: string;
  /** Solodit finding slugs used as evidence */
  solodit_references?: string[];
  /** Evidence sources supporting this finding */
  evidence_sources: EvidenceSource[];
  /** Step-by-step attack scenario, if applicable */
  attack_scenario?: string;
  /** Static analysis detector ID (e.g., Slither detector name) */
  detector_id?: string;
  /**
   * Lifecycle status of this finding.
   * @default "candidate"
   */
  status?: FindingStatus;
  /**
   * Type of proof used to verify this finding.
   * @default "none"
   */
  proof_type?: ProofType;
  /** Key identifying the root cause shared across related findings. */
  root_cause_key?: string;
  /**
   * Number of independent evidence paths supporting this finding.
   * @default 1
   */
  independence_count?: number;
  /** File path to a witness/proof-of-concept test. */
  witness_path?: string;
  /** Free-form notes from the verification process. */
  verification_notes?: string;
  /**
   * Whether this finding is visible in benchmark mode.
   * @default true
   */
  benchmark_mode_visible?: boolean;
  /** Formalized exploit sketch from ATTACK phase. */
  exploit_sketch?: ExploitSketch;
  /** Graduated DA mitigation scores from ATTACK phase. @deprecated Use da_attack. */
  da_mitigation?: DaMitigation[];
  /** Formal DA result from ATTACK phase (v0.4.1+). */
  da_attack?: DaResult;
  /** Formal DA result from VERIFY phase (v0.4.1+). */
  da_verify?: DaResult;
  /** DA chain linking ATTACK and VERIFY verdicts (v0.4.1+). */
  da_chain?: DaChain;
}

/**
 * Formalized exploit sketch produced during the ATTACK phase.
 * Captures the concrete attack mechanics before DA evaluation.
 */
export interface ExploitSketch {
  attacker: string;
  capabilities: string[];
  preconditions: string[];
  tx_sequence: string[];
  state_deltas: string[];
  broken_invariant: string;
  numeric_example: string;
  same_fix_test: string;
}

/**
 * A single Devil's Advocate mitigation check with graduated scoring.
 *
 * Scores: -3 (full mitigation), -1 (partial), 0 (none), +1 (edge-case exploitable)
 *
 * @deprecated Use DaDimension and DaResult for v0.4.1+ DA protocol.
 */
export interface DaMitigation {
  check: string;
  score: number;
  evidence: string;
}

/**
 * A single dimension evaluation from the canonical DA protocol.
 *
 * Six dimensions: guards, reentrancy_protection, access_control,
 * by_design, economic_feasibility, dry_run.
 *
 * Scores: -3 (full mitigation), -2 (safe by design), -1 (partial),
 * 0 (none), +1 (edge-case exploitable)
 */
export interface DaDimension {
  dimension: string;
  score: number;
  evidence: string;
  code_references?: string[];
  /** VERIFY phase only: explanation if skeptic disagrees with ATTACK-DA */
  attack_da_disagreement?: string;
}

/**
 * Structured result from the canonical DA protocol.
 *
 * Produced in both ATTACK and VERIFY phases.
 */
export interface DaResult {
  da_phase: "attack" | "verify";
  da_verdict: "invalidated" | "degraded" | "sustained" | "escalated";
  da_total_score: number;
  da_dimensions: DaDimension[];
  da_reasoning: string;
}

/**
 * Links ATTACK-DA and VERIFY-DA verdicts for conflict resolution.
 */
export interface DaChain {
  attack_da_verdict: string;
  verify_da_verdict: string;
  conflict: boolean;
  resolution: string;
  verify_da_precedence_applied: boolean;
}
