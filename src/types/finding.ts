/**
 * Tool or method that originally produced a finding.
 */
export type FindingSource = "slither" | "aderyn" | "manual";

/**
 * Lifecycle status of a finding through the verification pipeline.
 *
 * - candidate: Initial state, not yet verified.
 * - verified: Confirmed by the verification process.
 * - discarded: Ruled out by the verification process.
 *
 * @default "candidate"
 */
export type FindingStatus = "candidate" | "verified" | "discarded";

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
  | "math_rounding"
  | "reentrancy"
  | "oracle_randomness"
  | "token_integration"
  | "upgradeability"
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
}
