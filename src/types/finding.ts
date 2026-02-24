/**
 * Tool or method that originally produced a finding.
 */
export type FindingSource = "slither" | "aderyn" | "manual";

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
}
