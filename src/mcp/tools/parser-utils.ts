/**
 * Minimal normalization utilities shared by slither-parser and aderyn-parser.
 *
 * These are deterministic lookup tables — no LLM reasoning needed.
 */

import type { DetectorCategory, FindingConfidence } from "../../types/finding.js";

/** Maps known detector names to normalized categories. */
const DETECTOR_CATEGORY_MAP: Readonly<Record<string, DetectorCategory>> = {
  // Slither detectors
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
  // Aderyn detectors
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
};

export function normalizeDetectorCategory(
  detectorName: string,
  _tool: "slither" | "aderyn",
): DetectorCategory {
  return DETECTOR_CATEGORY_MAP[detectorName] ?? "other";
}

export function normalizeConfidence(
  tool: "slither" | "aderyn",
  rawConfidence: string,
): FindingConfidence {
  if (tool === "slither") {
    const map: Record<string, FindingConfidence> = {
      High: "Confirmed",
      Medium: "Likely",
      Low: "Possible",
    };
    return map[rawConfidence] ?? "Possible";
  }
  const map: Record<string, FindingConfidence> = {
    high_issues: "Likely",
    low_issues: "Possible",
  };
  return map[rawConfidence] ?? "Possible";
}
