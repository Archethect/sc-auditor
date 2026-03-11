/**
 * Static analysis normalization layer.
 *
 * Provides deterministic mapping from Slither/Aderyn detector names
 * to normalized categories, confidence levels, hotspot hints, and
 * stable evidence records.
 */

import type { DetectorCategory, EvidenceSource, FindingConfidence } from "../types/finding.js";
import type { HotspotLane } from "../types/hotspot.js";

/**
 * Deterministic mapping from known Slither/Aderyn detector names to DetectorCategory.
 *
 * Organized by tool prefix for clarity.
 */
export const DETECTOR_CATEGORY_MAP: Readonly<Record<string, DetectorCategory>> = {
  // --- Slither detectors ---
  "reentrancy-eth": "reentrancy",
  "reentrancy-no-eth": "reentrancy",
  "reentrancy-benign": "reentrancy",
  "reentrancy-events": "reentrancy",
  "reentrancy-unlimited-gas": "reentrancy",
  "controlled-delegatecall": "access_control",
  "arbitrary-send-eth": "access_control",
  "arbitrary-send-erc20": "access_control",
  "arbitrary-send-erc20-permit": "access_control",
  "suicidal": "access_control",
  "tx-origin": "access_control",
  "unprotected-upgrade": "upgradeability",
  "unchecked-lowlevel": "callback_liveness",
  "unchecked-send": "callback_liveness",
  "unused-return": "callback_liveness",
  "divide-before-multiply": "math_rounding",
  "uninitialized-state": "state_machine",
  "uninitialized-local": "state_machine",
  "uninitialized-storage": "state_machine",
  "locked-ether": "accounting_entitlement",
  "incorrect-equality": "accounting_entitlement",
  "shadowing-state": "semantic_consistency",
  "shadowing-local": "semantic_consistency",
  "weak-prng": "oracle_randomness",
  "erc20-interface": "token_integration",
  "erc721-interface": "token_integration",
  "delegatecall-loop": "upgradeability",
  "low-level-calls": "callback_liveness",
  "missing-zero-check": "access_control",
  "calls-loop": "callback_liveness",

  // --- Aderyn detectors ---
  "reentrancy": "reentrancy",
  "state-change-after-external-call": "reentrancy",
  "reentrancy-state-change": "reentrancy",
  "centralization-risk": "access_control",
  "missing-access-control": "access_control",
  "zero-address": "access_control",
  "zero-address-check": "access_control",
  "unchecked-return": "callback_liveness",
  "unsafe-erc20-operation": "token_integration",
  "division-before-multiplication": "math_rounding",
  "solmate-safe-transfer-lib": "token_integration",
  "uninitialized-state-variable": "state_machine",
  "weak-randomness": "oracle_randomness",
  "delegatecall-in-loop": "upgradeability",
  "incorrect-shift-order": "math_rounding",
} as const;

/**
 * Normalizes a detector name to a DetectorCategory.
 *
 * Looks up the detector name in the deterministic mapping table.
 * Unknown detectors map to "other" without crashing.
 *
 * @param detectorName - The raw detector name from the tool output
 * @param _tool - The tool that produced the detector ("slither" | "aderyn")
 * @returns The normalized DetectorCategory
 */
export function normalizeDetectorCategory(
  detectorName: string,
  _tool: "slither" | "aderyn",
): DetectorCategory {
  return DETECTOR_CATEGORY_MAP[detectorName] ?? "other";
}

/**
 * Normalizes raw confidence strings from static analysis tools.
 *
 * - Slither: High -> Confirmed, Medium -> Likely, Low -> Possible
 * - Aderyn: high_issues -> Likely (conservative, NOT Confirmed), low_issues -> Possible
 *
 * @param tool - The source tool
 * @param rawConfidence - The raw confidence string from the tool
 * @returns Normalized FindingConfidence
 */
export function normalizeConfidence(
  tool: "slither" | "aderyn",
  rawConfidence: string,
): FindingConfidence {
  if (tool === "slither") {
    return normalizeSlitherConfidence(rawConfidence);
  }
  return normalizeAderynConfidence(rawConfidence);
}

/** Maps Slither confidence: High -> Confirmed, Medium -> Likely, Low -> Possible. */
function normalizeSlitherConfidence(rawConfidence: string): FindingConfidence {
  const SLITHER_CONFIDENCE_MAP: Record<string, FindingConfidence> = {
    High: "Confirmed",
    Medium: "Likely",
    Low: "Possible",
  };
  return SLITHER_CONFIDENCE_MAP[rawConfidence] ?? "Possible";
}

/** Maps Aderyn confidence conservatively: high_issues -> Likely, low_issues -> Possible. */
function normalizeAderynConfidence(rawConfidence: string): FindingConfidence {
  const ADERYN_CONFIDENCE_MAP: Record<string, FindingConfidence> = {
    high_issues: "Likely",
    low_issues: "Possible",
  };
  return ADERYN_CONFIDENCE_MAP[rawConfidence] ?? "Possible";
}

/** Maps DetectorCategory to the most likely HotspotLane. */
const CATEGORY_TO_LANE: Readonly<Record<string, HotspotLane>> = {
  reentrancy: "callback_liveness",
  callback_liveness: "callback_liveness",
  accounting_entitlement: "accounting_entitlement",
  semantic_consistency: "semantic_consistency",
  math_rounding: "accounting_entitlement",
  oracle_randomness: "token_oracle_statefulness",
  token_integration: "token_oracle_statefulness",
  state_machine: "semantic_consistency",
  access_control: "adversarial_deep",
  upgradeability: "adversarial_deep",
};

/**
 * Maps a detector category and name to a likely HotspotLane for prioritization.
 *
 * Returns null for "other" category or unmapped categories.
 *
 * @param category - The normalized DetectorCategory
 * @param _detectorName - The raw detector name (reserved for future refinement)
 * @returns The suggested HotspotLane, or null if no mapping exists
 */
export function generateHotspotHint(
  category: DetectorCategory,
  _detectorName: string,
): HotspotLane | null {
  return CATEGORY_TO_LANE[category] ?? null;
}

/**
 * Creates a stable evidence record for a static analysis finding.
 *
 * @param tool - The tool name (e.g., "slither", "aderyn")
 * @param detectorId - The detector identifier
 * @param description - A description of the evidence
 * @returns A structured EvidenceSource record
 */
export function createStableEvidence(
  tool: string,
  detectorId: string,
  description: string,
): EvidenceSource {
  return {
    type: "static_analysis",
    tool,
    detector_id: detectorId,
    detail: description,
  };
}
