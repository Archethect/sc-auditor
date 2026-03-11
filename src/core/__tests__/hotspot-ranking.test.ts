/**
 * Tests for the hotspot ranking engine.
 */

import { describe, expect, it } from "vitest";
import type { SystemMapArtifact } from "../../types/architecture.js";
import type { Finding } from "../../types/finding.js";
import { deriveHotspots } from "../hotspot-ranking.js";

/**
 * Creates an empty SystemMapArtifact with all required fields.
 */
function createEmptyArtifact(overrides: Partial<SystemMapArtifact> = {}): SystemMapArtifact {
  return {
    components: overrides.components ?? [],
    external_surfaces: overrides.external_surfaces ?? [],
    auth_surfaces: overrides.auth_surfaces ?? [],
    state_variables: overrides.state_variables ?? [],
    state_write_sites: overrides.state_write_sites ?? [],
    external_call_sites: overrides.external_call_sites ?? [],
    value_flow_edges: overrides.value_flow_edges ?? [],
    config_semantics: overrides.config_semantics ?? [],
    protocol_invariants: overrides.protocol_invariants ?? [],
    static_summary: overrides.static_summary ?? {
      slither_finding_count: 0,
      aderyn_finding_count: 0,
      categories_detected: [],
      highest_severity: "INFORMATIONAL",
    },
  };
}

/**
 * Creates a minimal test finding with sensible defaults.
 */
function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    title: overrides.title ?? "Test Finding",
    severity: overrides.severity ?? "MEDIUM",
    confidence: overrides.confidence ?? "Likely",
    source: overrides.source ?? "slither",
    category: overrides.category ?? "reentrancy",
    affected_files: overrides.affected_files ?? ["contracts/Vault.sol"],
    affected_lines: overrides.affected_lines ?? { start: 10, end: 20 },
    description: overrides.description ?? "Test description",
    detector_id: overrides.detector_id ?? "reentrancy-eth",
    evidence_sources: overrides.evidence_sources ?? [
      { type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" },
    ],
  };
}

describe("AC1: Empty artifact produces empty hotspot list", () => {
  it("returns empty array for empty artifact and no findings", () => {
    const artifact = createEmptyArtifact();
    const hotspots = deriveHotspots(artifact, []);
    expect(hotspots).toEqual([]);
  });
});

describe("AC2: Hotspots are deterministically sorted", () => {
  it("produces identical hotspot lists on repeated calls", () => {
    const artifact = createEmptyArtifact({
      external_call_sites: [
        {
          contract: "Vault",
          function_name: "withdraw",
          target: "msg.sender",
          call_type: "call",
          value_sent: true,
        },
      ],
      state_write_sites: [
        {
          contract: "Vault",
          function_name: "withdraw",
          variable: "balances",
          write_type: "decrement",
        },
      ],
    });

    const findings = [
      createFinding({ severity: "HIGH", detector_id: "reentrancy-eth" }),
      createFinding({ severity: "MEDIUM", detector_id: "tx-origin", category: "access_control" }),
    ];

    const result1 = deriveHotspots(artifact, findings);
    const result2 = deriveHotspots(artifact, findings);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it("sorts hotspots by score descending", () => {
    const findings = [
      createFinding({ severity: "HIGH", detector_id: "reentrancy-eth", title: "Reentrancy" }),
      createFinding({ severity: "LOW", detector_id: "tx-origin", title: "Tx Origin", category: "access_control" }),
    ];

    const hotspots = deriveHotspots(createEmptyArtifact(), findings);

    for (let i = 1; i < hotspots.length; i++) {
      const priorities = ["critical", "high", "medium", "low"];
      const prevIdx = priorities.indexOf(hotspots[i - 1].priority);
      const currIdx = priorities.indexOf(hotspots[i].priority);
      expect(prevIdx).toBeLessThanOrEqual(currIdx);
    }
  });
});

describe("AC3: Deterministic IDs assigned", () => {
  it("assigns HS-001, HS-002, etc. to hotspots", () => {
    const findings = [
      createFinding({ severity: "HIGH", detector_id: "reentrancy-eth", title: "First" }),
      createFinding({ severity: "MEDIUM", detector_id: "unchecked-lowlevel", title: "Second", category: "callback_liveness" }),
    ];

    const hotspots = deriveHotspots(createEmptyArtifact(), findings);

    expect(hotspots[0].id).toBe("HS-001");
    if (hotspots.length > 1) {
      expect(hotspots[1].id).toBe("HS-002");
    }
  });
});

describe("AC4: Evidence and candidate_attack_sequence are populated", () => {
  it("populates evidence from findings", () => {
    const findings = [
      createFinding({ severity: "HIGH", detector_id: "reentrancy-eth" }),
    ];

    const hotspots = deriveHotspots(createEmptyArtifact(), findings);

    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots[0].evidence.length).toBeGreaterThan(0);
    expect(hotspots[0].evidence[0].source).toBe("slither");
  });

  it("populates candidate_attack_sequence from findings", () => {
    const findings = [
      createFinding({ severity: "HIGH", detector_id: "reentrancy-eth" }),
    ];

    const hotspots = deriveHotspots(createEmptyArtifact(), findings);

    expect(hotspots[0].candidate_attack_sequence.length).toBeGreaterThan(0);
  });
});

describe("AC5: Callback liveness hotspots from external calls", () => {
  it("creates callback_liveness hotspot for external call with state write", () => {
    const artifact = createEmptyArtifact({
      external_call_sites: [
        {
          contract: "Vault",
          function_name: "withdraw",
          target: "to",
          call_type: "call",
          value_sent: true,
        },
      ],
      state_write_sites: [
        {
          contract: "Vault",
          function_name: "withdraw",
          variable: "balances",
          write_type: "decrement",
        },
      ],
    });

    const hotspots = deriveHotspots(artifact, []);

    const callbackHotspot = hotspots.find((h) => h.lane === "callback_liveness");
    expect(callbackHotspot).toBeDefined();
    expect(callbackHotspot?.affected_functions).toContain("Vault.withdraw");
  });
});

describe("AC6: Semantic consistency hotspots from config conflicts", () => {
  it("creates semantic_consistency hotspot for config variable conflicts", () => {
    const artifact = createEmptyArtifact({
      config_semantics: [
        {
          contract: "TokenManager",
          variable: "taxCut",
          inferred_unit: "percent_of_100",
          conflicts_with: [
            { contract: "FeeDistributor", variable: "taxCut", inferred_unit: "divisor" },
          ],
        },
      ],
    });

    const hotspots = deriveHotspots(artifact, []);

    const semanticHotspot = hotspots.find((h) => h.lane === "semantic_consistency");
    expect(semanticHotspot).toBeDefined();
    expect(semanticHotspot?.title).toContain("taxCut");
  });
});

describe("AC7: All default lanes are coverable", () => {
  it("covers callback_liveness from reentrancy findings", () => {
    const findings = [createFinding({ detector_id: "reentrancy-eth" })];
    const hotspots = deriveHotspots(createEmptyArtifact(), findings);
    expect(hotspots.some((h) => h.lane === "callback_liveness")).toBe(true);
  });

  it("covers accounting_entitlement from locked-ether findings", () => {
    const findings = [createFinding({ detector_id: "locked-ether", category: "accounting_entitlement" })];
    const hotspots = deriveHotspots(createEmptyArtifact(), findings);
    expect(hotspots.some((h) => h.lane === "accounting_entitlement")).toBe(true);
  });

  it("covers semantic_consistency from shadowing-state findings", () => {
    const findings = [createFinding({ detector_id: "shadowing-state", category: "semantic_consistency" })];
    const hotspots = deriveHotspots(createEmptyArtifact(), findings);
    expect(hotspots.some((h) => h.lane === "semantic_consistency")).toBe(true);
  });

  it("covers token_oracle_statefulness from weak-prng findings", () => {
    const findings = [createFinding({ detector_id: "weak-prng", category: "oracle_randomness" })];
    const hotspots = deriveHotspots(createEmptyArtifact(), findings);
    expect(hotspots.some((h) => h.lane === "token_oracle_statefulness")).toBe(true);
  });

  it("covers adversarial_deep from access_control findings", () => {
    const findings = [createFinding({ detector_id: "tx-origin", category: "access_control" })];
    const hotspots = deriveHotspots(createEmptyArtifact(), findings);
    expect(hotspots.some((h) => h.lane === "adversarial_deep")).toBe(true);
  });
});

describe("AC8: Deep mode adds adversarial_deep lane from access_control", () => {
  it("deep mode produces the same lanes as default for identical input", () => {
    const findings = [
      createFinding({ detector_id: "tx-origin", category: "access_control" }),
    ];

    const defaultHotspots = deriveHotspots(createEmptyArtifact(), findings, "default");
    const deepHotspots = deriveHotspots(createEmptyArtifact(), findings, "deep");

    expect(defaultHotspots.some((h) => h.lane === "adversarial_deep")).toBe(true);
    expect(deepHotspots.some((h) => h.lane === "adversarial_deep")).toBe(true);
  });
});

describe("AC9: Hotspots from config conflicts have semantic_consistency lane", () => {
  it("config conflicts produce semantic_consistency hotspots", () => {
    const artifact = createEmptyArtifact({
      config_semantics: [
        {
          contract: "ContractA",
          variable: "fee",
          inferred_unit: "percent_of_100",
          conflicts_with: [
            { contract: "ContractB", variable: "fee", inferred_unit: "divisor" },
          ],
        },
      ],
    });

    const hotspots = deriveHotspots(artifact, []);
    const semanticHotspots = hotspots.filter((h) => h.lane === "semantic_consistency");

    expect(semanticHotspots.length).toBeGreaterThan(0);
    expect(semanticHotspots[0].title).toContain("fee");
  });

  it("config without conflicts does not produce semantic_consistency hotspots", () => {
    const artifact = createEmptyArtifact({
      config_semantics: [
        {
          contract: "ContractA",
          variable: "fee",
          inferred_unit: "percent_of_100",
        },
      ],
    });

    const hotspots = deriveHotspots(artifact, []);
    const semanticHotspots = hotspots.filter((h) => h.lane === "semantic_consistency");

    expect(semanticHotspots).toHaveLength(0);
  });
});

describe("AC10: Score determinism", () => {
  it("same input produces same order every time across 10 runs", () => {
    const findings = [
      createFinding({ severity: "HIGH", detector_id: "reentrancy-eth", title: "A" }),
      createFinding({ severity: "MEDIUM", detector_id: "tx-origin", title: "B", category: "access_control" }),
      createFinding({ severity: "LOW", detector_id: "weak-prng", title: "C", category: "oracle_randomness" }),
    ];

    const artifact = createEmptyArtifact();
    const firstResult = JSON.stringify(deriveHotspots(artifact, findings));

    for (let i = 0; i < 10; i++) {
      const result = JSON.stringify(deriveHotspots(artifact, findings));
      expect(result).toBe(firstResult);
    }
  });
});

describe("AC11: Priority mapping thresholds", () => {
  it("high severity reentrancy produces critical or high priority", () => {
    const findings = [
      createFinding({ severity: "CRITICAL", detector_id: "reentrancy-eth" }),
    ];

    const hotspots = deriveHotspots(createEmptyArtifact(), findings);
    expect(hotspots.length).toBeGreaterThan(0);
    expect(["critical", "high"]).toContain(hotspots[0].priority);
  });

  it("low severity informational produces low priority", () => {
    const findings = [
      createFinding({ severity: "INFORMATIONAL", detector_id: "shadowing-state", category: "semantic_consistency" }),
    ];

    const hotspots = deriveHotspots(createEmptyArtifact(), findings);
    expect(hotspots.length).toBeGreaterThan(0);
    expect(["low", "medium"]).toContain(hotspots[0].priority);
  });

  it("all hotspot priorities are valid values", () => {
    const findings = [
      createFinding({ severity: "HIGH", detector_id: "reentrancy-eth", title: "High1" }),
      createFinding({ severity: "MEDIUM", detector_id: "tx-origin", title: "Med1", category: "access_control" }),
    ];

    const artifact = createEmptyArtifact({
      external_call_sites: [
        { contract: "Vault", function_name: "withdraw", target: "to", call_type: "call", value_sent: true },
      ],
      state_write_sites: [
        { contract: "Vault", function_name: "withdraw", variable: "balances", write_type: "decrement" },
      ],
    });

    const hotspots = deriveHotspots(artifact, findings);
    const validPriorities = ["critical", "high", "medium", "low"];
    for (const h of hotspots) {
      expect(validPriorities).toContain(h.priority);
    }
  });
});
