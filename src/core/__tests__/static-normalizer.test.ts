/**
 * Tests for static analysis normalization layer.
 */

import { describe, expect, it } from "vitest";
import {
  DETECTOR_CATEGORY_MAP,
  createStableEvidence,
  generateHotspotHint,
  normalizeConfidence,
  normalizeDetectorCategory,
} from "../static-normalizer.js";

describe("AC1: Deterministic mapping for known detectors", () => {
  it("maps Slither reentrancy-eth to reentrancy", () => {
    expect(normalizeDetectorCategory("reentrancy-eth", "slither")).toBe("reentrancy");
  });

  it("maps Slither reentrancy-no-eth to reentrancy", () => {
    expect(normalizeDetectorCategory("reentrancy-no-eth", "slither")).toBe("reentrancy");
  });

  it("maps Slither reentrancy-benign to reentrancy", () => {
    expect(normalizeDetectorCategory("reentrancy-benign", "slither")).toBe("reentrancy");
  });

  it("maps Slither controlled-delegatecall to access_control", () => {
    expect(normalizeDetectorCategory("controlled-delegatecall", "slither")).toBe("access_control");
  });

  it("maps Slither arbitrary-send-eth to access_control", () => {
    expect(normalizeDetectorCategory("arbitrary-send-eth", "slither")).toBe("access_control");
  });

  it("maps Slither unchecked-lowlevel to callback_liveness", () => {
    expect(normalizeDetectorCategory("unchecked-lowlevel", "slither")).toBe("callback_liveness");
  });

  it("maps Slither divide-before-multiply to math_rounding", () => {
    expect(normalizeDetectorCategory("divide-before-multiply", "slither")).toBe("math_rounding");
  });

  it("maps Slither uninitialized-state to state_machine", () => {
    expect(normalizeDetectorCategory("uninitialized-state", "slither")).toBe("state_machine");
  });

  it("maps Slither suicidal to access_control", () => {
    expect(normalizeDetectorCategory("suicidal", "slither")).toBe("access_control");
  });

  it("maps Slither tx-origin to access_control", () => {
    expect(normalizeDetectorCategory("tx-origin", "slither")).toBe("access_control");
  });

  it("maps Slither locked-ether to accounting_entitlement", () => {
    expect(normalizeDetectorCategory("locked-ether", "slither")).toBe("accounting_entitlement");
  });

  it("maps Slither unused-return to callback_liveness", () => {
    expect(normalizeDetectorCategory("unused-return", "slither")).toBe("callback_liveness");
  });

  it("maps Aderyn reentrancy to reentrancy", () => {
    expect(normalizeDetectorCategory("reentrancy", "aderyn")).toBe("reentrancy");
  });

  it("maps Aderyn centralization-risk to access_control", () => {
    expect(normalizeDetectorCategory("centralization-risk", "aderyn")).toBe("access_control");
  });

  it("maps Aderyn zero-address to access_control", () => {
    expect(normalizeDetectorCategory("zero-address", "aderyn")).toBe("access_control");
  });

  it("maps Aderyn unsafe-erc20-operation to token_integration", () => {
    expect(normalizeDetectorCategory("unsafe-erc20-operation", "aderyn")).toBe("token_integration");
  });

  it("exposes DETECTOR_CATEGORY_MAP as a readonly constant", () => {
    expect(DETECTOR_CATEGORY_MAP["reentrancy-eth"]).toBe("reentrancy");
    expect(DETECTOR_CATEGORY_MAP["locked-ether"]).toBe("accounting_entitlement");
  });
});

describe("AC2: Unknown detectors map to other", () => {
  it("maps unknown Slither detector to other", () => {
    expect(normalizeDetectorCategory("totally-unknown-detector", "slither")).toBe("other");
  });

  it("maps unknown Aderyn detector to other", () => {
    expect(normalizeDetectorCategory("made-up-detector", "aderyn")).toBe("other");
  });

  it("maps empty string detector to other", () => {
    expect(normalizeDetectorCategory("", "slither")).toBe("other");
  });
});

describe("AC3: Confidence mapping for both tools", () => {
  it("maps Slither High confidence to Confirmed", () => {
    expect(normalizeConfidence("slither", "High")).toBe("Confirmed");
  });

  it("maps Slither Medium confidence to Likely", () => {
    expect(normalizeConfidence("slither", "Medium")).toBe("Likely");
  });

  it("maps Slither Low confidence to Possible", () => {
    expect(normalizeConfidence("slither", "Low")).toBe("Possible");
  });

  it("maps Slither unknown confidence to Possible", () => {
    expect(normalizeConfidence("slither", "Unknown")).toBe("Possible");
  });

  it("maps Aderyn high_issues to Likely (conservative)", () => {
    expect(normalizeConfidence("aderyn", "high_issues")).toBe("Likely");
  });

  it("maps Aderyn low_issues to Possible", () => {
    expect(normalizeConfidence("aderyn", "low_issues")).toBe("Possible");
  });

  it("maps Aderyn unknown confidence to Possible", () => {
    expect(normalizeConfidence("aderyn", "Unknown")).toBe("Possible");
  });

  it("never upgrades Aderyn confidence to Confirmed", () => {
    expect(normalizeConfidence("aderyn", "high_issues")).not.toBe("Confirmed");
    expect(normalizeConfidence("aderyn", "low_issues")).not.toBe("Confirmed");
    expect(normalizeConfidence("aderyn", "High")).not.toBe("Confirmed");
  });
});

describe("AC4: Hotspot hint generation", () => {
  it("maps reentrancy to callback_liveness lane", () => {
    expect(generateHotspotHint("reentrancy", "reentrancy-eth")).toBe("callback_liveness");
  });

  it("maps callback_liveness to callback_liveness lane", () => {
    expect(generateHotspotHint("callback_liveness", "unchecked-lowlevel")).toBe("callback_liveness");
  });

  it("maps accounting_entitlement to accounting_entitlement lane", () => {
    expect(generateHotspotHint("accounting_entitlement", "locked-ether")).toBe("accounting_entitlement");
  });

  it("maps semantic_consistency to semantic_consistency lane", () => {
    expect(generateHotspotHint("semantic_consistency", "shadowing-state")).toBe("semantic_consistency");
  });

  it("maps oracle_randomness to token_oracle_statefulness lane", () => {
    expect(generateHotspotHint("oracle_randomness", "weak-prng")).toBe("token_oracle_statefulness");
  });

  it("maps token_integration to token_oracle_statefulness lane", () => {
    expect(generateHotspotHint("token_integration", "erc20-interface")).toBe("token_oracle_statefulness");
  });

  it("maps access_control to adversarial_deep lane", () => {
    expect(generateHotspotHint("access_control", "tx-origin")).toBe("adversarial_deep");
  });

  it("maps upgradeability to adversarial_deep lane", () => {
    expect(generateHotspotHint("upgradeability", "unprotected-upgrade")).toBe("adversarial_deep");
  });

  it("returns null for other category", () => {
    expect(generateHotspotHint("other", "unknown-detector")).toBeNull();
  });
});

describe("AC5: Stable evidence creation", () => {
  it("creates evidence with static_analysis type", () => {
    const evidence = createStableEvidence("slither", "reentrancy-eth", "Reentrancy found");
    expect(evidence.type).toBe("static_analysis");
  });

  it("preserves tool name in evidence", () => {
    const evidence = createStableEvidence("aderyn", "centralization-risk", "Centralization");
    expect(evidence.tool).toBe("aderyn");
  });

  it("preserves detector_id in evidence", () => {
    const evidence = createStableEvidence("slither", "tx-origin", "tx.origin used");
    expect(evidence.detector_id).toBe("tx-origin");
  });

  it("preserves detail in evidence", () => {
    const evidence = createStableEvidence("slither", "suicidal", "Contract can be destroyed");
    expect(evidence.detail).toBe("Contract can be destroyed");
  });

  it("returns a complete EvidenceSource object", () => {
    const evidence = createStableEvidence("slither", "locked-ether", "ETH locked");
    expect(evidence).toEqual({
      type: "static_analysis",
      tool: "slither",
      detector_id: "locked-ether",
      detail: "ETH locked",
    });
  });
});

describe("Edge cases: detector name handling", () => {
  it("maps very long detector name to other", () => {
    const longName = "a".repeat(500);
    expect(normalizeDetectorCategory(longName, "slither")).toBe("other");
  });

  it("handles detector names with special characters gracefully", () => {
    expect(normalizeDetectorCategory("some-detector-v2.0", "aderyn")).toBe("other");
  });

  it("handles whitespace-only detector name as other", () => {
    expect(normalizeDetectorCategory("   ", "slither")).toBe("other");
  });
});

describe("Edge cases: all DetectorCategory values have at least one mapping", () => {
  it("has a mapping for reentrancy", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("reentrancy");
  });

  it("has a mapping for access_control", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("access_control");
  });

  it("has a mapping for callback_liveness", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("callback_liveness");
  });

  it("has a mapping for math_rounding", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("math_rounding");
  });

  it("has a mapping for state_machine", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("state_machine");
  });

  it("has a mapping for accounting_entitlement", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("accounting_entitlement");
  });

  it("has a mapping for semantic_consistency", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("semantic_consistency");
  });

  it("has a mapping for oracle_randomness", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("oracle_randomness");
  });

  it("has a mapping for token_integration", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("token_integration");
  });

  it("has a mapping for upgradeability", () => {
    const values = Object.values(DETECTOR_CATEGORY_MAP);
    expect(values).toContain("upgradeability");
  });
});

describe("Edge cases: confidence normalization", () => {
  it("maps Slither empty string confidence to Possible", () => {
    expect(normalizeConfidence("slither", "")).toBe("Possible");
  });

  it("maps Aderyn empty string confidence to Possible", () => {
    expect(normalizeConfidence("aderyn", "")).toBe("Possible");
  });

  it("maps Slither case-sensitive mismatch to Possible", () => {
    expect(normalizeConfidence("slither", "high")).toBe("Possible");
    expect(normalizeConfidence("slither", "HIGH")).toBe("Possible");
  });

  it("maps Aderyn case-sensitive mismatch to Possible", () => {
    expect(normalizeConfidence("aderyn", "HIGH_ISSUES")).toBe("Possible");
  });

  it("maps Slither numeric string confidence to Possible", () => {
    expect(normalizeConfidence("slither", "123")).toBe("Possible");
  });
});

describe("Edge cases: hotspot hint for all 5 lanes", () => {
  it("callback_liveness is reachable via reentrancy category", () => {
    expect(generateHotspotHint("reentrancy", "test")).toBe("callback_liveness");
  });

  it("accounting_entitlement is reachable via math_rounding category", () => {
    expect(generateHotspotHint("math_rounding", "test")).toBe("accounting_entitlement");
  });

  it("semantic_consistency is reachable via state_machine category", () => {
    expect(generateHotspotHint("state_machine", "test")).toBe("semantic_consistency");
  });

  it("token_oracle_statefulness is reachable via oracle_randomness category", () => {
    expect(generateHotspotHint("oracle_randomness", "test")).toBe("token_oracle_statefulness");
  });

  it("adversarial_deep is reachable via access_control category", () => {
    expect(generateHotspotHint("access_control", "test")).toBe("adversarial_deep");
  });
});

describe("Edge cases: createStableEvidence consistency", () => {
  it("produces consistent output for same inputs across calls", () => {
    const a = createStableEvidence("slither", "reentrancy-eth", "detail");
    const b = createStableEvidence("slither", "reentrancy-eth", "detail");
    expect(a).toEqual(b);
  });

  it("handles empty tool name", () => {
    const evidence = createStableEvidence("", "detector", "desc");
    expect(evidence.tool).toBe("");
  });

  it("handles empty detector_id", () => {
    const evidence = createStableEvidence("slither", "", "desc");
    expect(evidence.detector_id).toBe("");
  });

  it("handles empty description", () => {
    const evidence = createStableEvidence("slither", "detector", "");
    expect(evidence.detail).toBe("");
  });
});
