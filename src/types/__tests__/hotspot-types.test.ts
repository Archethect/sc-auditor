import { describe, expect, it } from "vitest";
import type {
  Hotspot,
  HotspotEvidence,
  HotspotLane,
  HotspotPriority,
} from "../hotspot.js";

/** Construct a minimal valid Hotspot with only required fields. */
function minimalHotspot(overrides: Partial<Hotspot> = {}): Hotspot {
  return {
    id: "HS-001",
    lane: "callback_liveness",
    title: "Reentrancy in withdraw",
    priority: "high",
    affected_files: ["src/Vault.sol"],
    affected_functions: ["withdraw"],
    related_invariants: ["INV-001"],
    evidence: [],
    candidate_attack_sequence: ["Call withdraw", "Re-enter via fallback"],
    root_cause_hypothesis: "Missing reentrancy guard",
    ...overrides,
  };
}

/**
 * AC1: HotspotLane type alias exists with correct values
 */
describe("AC1: HotspotLane type alias", () => {
  it.each([
    "callback_liveness",
    "accounting_entitlement",
    "semantic_consistency",
    "token_oracle_statefulness",
    "adversarial_deep",
  ] as const)("accepts '%s' as a valid HotspotLane", (value) => {
    const lane: HotspotLane = value;
    expect(lane).toBe(value);
  });

  it("rejects invalid HotspotLane values", () => {
    // @ts-expect-error - 'unknown_lane' is not a valid HotspotLane
    const _lane: HotspotLane = "unknown_lane";
    expect(_lane).toBe("unknown_lane");
  });
});

/**
 * AC2: HotspotPriority type alias exists with correct values
 */
describe("AC2: HotspotPriority type alias", () => {
  it.each(["critical", "high", "medium", "low"] as const)(
    "accepts '%s' as a valid HotspotPriority",
    (value) => {
      const priority: HotspotPriority = value;
      expect(priority).toBe(value);
    },
  );

  it("rejects invalid HotspotPriority values", () => {
    // @ts-expect-error - 'urgent' is not a valid HotspotPriority
    const _p: HotspotPriority = "urgent";
    expect(_p).toBe("urgent");
  });
});

/**
 * AC3: HotspotEvidence interface exists with required fields
 */
describe("AC3: HotspotEvidence interface", () => {
  it("can be constructed with all required fields", () => {
    const evidence: HotspotEvidence = {
      source: "slither",
      detail: "Reentrancy detector fired",
      confidence: 0.85,
    };
    expect(evidence.source).toBe("slither");
    expect(evidence.detail).toBe("Reentrancy detector fired");
    expect(evidence.confidence).toBe(0.85);
  });

  it("rejects HotspotEvidence without source", () => {
    // @ts-expect-error - 'source' is required on HotspotEvidence
    const _e: HotspotEvidence = {
      detail: "detail",
      confidence: 0.5,
    };
    expect(_e).toBeDefined();
  });

  it("rejects HotspotEvidence without detail", () => {
    // @ts-expect-error - 'detail' is required on HotspotEvidence
    const _e: HotspotEvidence = {
      source: "slither",
      confidence: 0.5,
    };
    expect(_e).toBeDefined();
  });

  it("rejects HotspotEvidence without confidence", () => {
    // @ts-expect-error - 'confidence' is required on HotspotEvidence
    const _e: HotspotEvidence = {
      source: "slither",
      detail: "detail",
    };
    expect(_e).toBeDefined();
  });
});

/**
 * AC4: Hotspot interface has all required fields from spec
 */
describe("AC4: Hotspot interface", () => {
  it("can be constructed with all required fields", () => {
    const hotspot = minimalHotspot();
    expect(hotspot.id).toBe("HS-001");
    expect(hotspot.lane).toBe("callback_liveness");
    expect(hotspot.title).toBe("Reentrancy in withdraw");
    expect(hotspot.priority).toBe("high");
    expect(hotspot.affected_files).toEqual(["src/Vault.sol"]);
    expect(hotspot.affected_functions).toEqual(["withdraw"]);
    expect(hotspot.related_invariants).toEqual(["INV-001"]);
    expect(hotspot.evidence).toEqual([]);
    expect(hotspot.candidate_attack_sequence).toEqual([
      "Call withdraw",
      "Re-enter via fallback",
    ]);
    expect(hotspot.root_cause_hypothesis).toBe("Missing reentrancy guard");
  });

  it("accepts evidence array with HotspotEvidence items", () => {
    const hotspot = minimalHotspot({
      evidence: [
        { source: "slither", detail: "reentrancy-eth", confidence: 0.9 },
        { source: "aderyn", detail: "state-after-call", confidence: 0.7 },
      ],
    });
    expect(hotspot.evidence).toHaveLength(2);
    expect(hotspot.evidence[0].source).toBe("slither");
    expect(hotspot.evidence[1].confidence).toBe(0.7);
  });

  it("rejects Hotspot without id", () => {
    // @ts-expect-error - 'id' is required on Hotspot
    const _h: Hotspot = {
      lane: "callback_liveness",
      title: "Test",
      priority: "high",
      affected_files: [],
      affected_functions: [],
      related_invariants: [],
      evidence: [],
      candidate_attack_sequence: [],
      root_cause_hypothesis: "test",
    };
    expect(_h).toBeDefined();
  });

  it("rejects Hotspot without lane", () => {
    // @ts-expect-error - 'lane' is required on Hotspot
    const _h: Hotspot = {
      id: "HS-001",
      title: "Test",
      priority: "high",
      affected_files: [],
      affected_functions: [],
      related_invariants: [],
      evidence: [],
      candidate_attack_sequence: [],
      root_cause_hypothesis: "test",
    };
    expect(_h).toBeDefined();
  });

  it("rejects Hotspot without root_cause_hypothesis", () => {
    // @ts-expect-error - 'root_cause_hypothesis' is required on Hotspot
    const _h: Hotspot = {
      id: "HS-001",
      lane: "callback_liveness",
      title: "Test",
      priority: "high",
      affected_files: [],
      affected_functions: [],
      related_invariants: [],
      evidence: [],
      candidate_attack_sequence: [],
    };
    expect(_h).toBeDefined();
  });
});
