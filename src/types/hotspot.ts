/**
 * Lane classification for hotspot analysis.
 *
 * Each lane represents a specific vulnerability class that
 * the hunter agents specialize in.
 */
export type HotspotLane =
  | "callback_liveness"
  | "accounting_entitlement"
  | "semantic_consistency"
  | "token_oracle_statefulness"
  | "adversarial_deep";

/**
 * Priority level for a hotspot, indicating urgency of investigation.
 */
export type HotspotPriority = "critical" | "high" | "medium" | "low";

/**
 * A single piece of evidence supporting a hotspot identification.
 */
export interface HotspotEvidence {
  /** Source of the evidence (e.g., "slither", "aderyn", "manual_review"). */
  source: string;
  /** Detailed description of the evidence. */
  detail: string;
  /** Confidence score from 0.0 (no confidence) to 1.0 (full confidence). */
  confidence: number;
}

/**
 * A suspicious code area identified during the HUNT phase.
 *
 * Hotspots are prioritized targets for deep-dive analysis
 * in the ATTACK phase.
 */
export interface Hotspot {
  /** Unique identifier for this hotspot. */
  id: string;
  /** Vulnerability lane this hotspot belongs to. */
  lane: HotspotLane;
  /** Short descriptive title of the hotspot. */
  title: string;
  /** Priority level for investigation. */
  priority: HotspotPriority;
  /** Files containing the affected code. */
  affected_files: string[];
  /** Function names involved in the hotspot. */
  affected_functions: string[];
  /** Protocol invariants related to this hotspot. */
  related_invariants: string[];
  /** Evidence supporting the hotspot identification. */
  evidence: HotspotEvidence[];
  /** Ordered steps in a candidate attack sequence. */
  candidate_attack_sequence: string[];
  /** Hypothesized root cause of the vulnerability. */
  root_cause_hypothesis: string;
}
