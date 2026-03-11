import { beforeAll, describe, expect, it } from "vitest";
import type {
  DetectorCategory,
  EvidenceSource,
  EvidenceSourceType,
  Finding,
  FindingSource,
  FindingStatus,
  ProofType,
} from "../finding.js";
import type { ChecklistItem } from "../checklist.js";

/** Construct a minimal valid Finding with only required fields. */
function minimalFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    title: "Test",
    severity: "HIGH",
    confidence: "Confirmed",
    category: "Reentrancy",
    affected_files: ["test.sol"],
    affected_lines: { start: 1, end: 5 },
    description: "desc",
    source: "slither",
    evidence_sources: [],
    ...overrides,
  };
}

/**
 * AC1: FindingSource type alias ("slither" | "aderyn" | "manual") exists in src/types/finding.ts
 */
describe("AC1: FindingSource type alias", () => {
  it("accepts 'slither' as a valid FindingSource", () => {
    const source: FindingSource = "slither";
    expect(source).toBe("slither");
  });

  it("accepts 'aderyn' as a valid FindingSource", () => {
    const source: FindingSource = "aderyn";
    expect(source).toBe("aderyn");
  });

  it("accepts 'manual' as a valid FindingSource", () => {
    const source: FindingSource = "manual";
    expect(source).toBe("manual");
  });

  it("rejects invalid FindingSource values", () => {
    // @ts-expect-error - 'unknown_tool' is not a valid FindingSource
    const _s: FindingSource = "unknown_tool";
    expect(_s).toBe("unknown_tool");
  });
});

/**
 * AC2: EvidenceSource interface exists in src/types/finding.ts with fields:
 * type (EvidenceSourceType), tool?, detector_id?, checklist_item_id?, solodit_slug?, detail?
 */
describe("AC2: EvidenceSource interface", () => {
  it("EvidenceSourceType accepts 'static_analysis'", () => {
    const t: EvidenceSourceType = "static_analysis";
    expect(t).toBe("static_analysis");
  });

  it("EvidenceSourceType accepts 'checklist'", () => {
    const t: EvidenceSourceType = "checklist";
    expect(t).toBe("checklist");
  });

  it("EvidenceSourceType accepts 'solodit'", () => {
    const t: EvidenceSourceType = "solodit";
    expect(t).toBe("solodit");
  });

  it("rejects invalid EvidenceSourceType values", () => {
    // @ts-expect-error - 'cross_contract' is not a valid EvidenceSourceType
    const _t: EvidenceSourceType = "cross_contract";
    expect(_t).toBe("cross_contract");
  });

  it("EvidenceSource can be constructed with only required type field", () => {
    const es: EvidenceSource = { type: "static_analysis" };
    expect(es.type).toBe("static_analysis");
  });

  it("rejects EvidenceSource without required type field", () => {
    // @ts-expect-error - 'type' is required on EvidenceSource
    const _es: EvidenceSource = { tool: "slither" };
    expect(_es).toBeDefined();
  });

  it("EvidenceSource accepts all optional fields", () => {
    const es: EvidenceSource = {
      type: "static_analysis",
      tool: "slither",
      detector_id: "reentrancy-eth",
      checklist_item_id: "SOL-CR-1",
      solodit_slug: "slug-123",
      detail: "found reentrancy",
    };
    expect(es.type).toBe("static_analysis");
    expect(es.tool).toBe("slither");
    expect(es.detector_id).toBe("reentrancy-eth");
    expect(es.checklist_item_id).toBe("SOL-CR-1");
    expect(es.solodit_slug).toBe("slug-123");
    expect(es.detail).toBe("found reentrancy");
  });
});

/**
 * AC3: Finding interface has required source: FindingSource and evidence_sources: EvidenceSource[]
 */
describe("AC3: Finding has source and evidence_sources", () => {
  it("Finding has required source field of type FindingSource", () => {
    const finding = minimalFinding();
    expect(finding.source).toBe("slither");
  });

  it("rejects Finding without required source field", () => {
    // @ts-expect-error - 'source' is required on Finding
    const _f: Finding = {
      title: "Test",
      severity: "HIGH",
      confidence: "Confirmed",
      category: "Reentrancy",
      affected_files: ["test.sol"],
      affected_lines: { start: 1, end: 5 },
      description: "desc",
      evidence_sources: [],
    };
    expect(_f).toBeDefined();
  });

  it("rejects Finding without required evidence_sources field", () => {
    // @ts-expect-error - 'evidence_sources' is required on Finding
    const _f: Finding = {
      title: "Test",
      severity: "HIGH",
      confidence: "Confirmed",
      category: "Reentrancy",
      affected_files: ["test.sol"],
      affected_lines: { start: 1, end: 5 },
      description: "desc",
      source: "slither",
    };
    expect(_f).toBeDefined();
  });

  it("Finding has required evidence_sources field of type EvidenceSource[]", () => {
    const es: EvidenceSource = { type: "static_analysis", tool: "slither" };
    const finding = minimalFinding({ source: "manual", evidence_sources: [es] });
    expect(finding.evidence_sources).toHaveLength(1);
    expect(finding.evidence_sources[0].type).toBe("static_analysis");
  });
});

/**
 * AC4: Finding.impact, Finding.remediation, Finding.checklist_reference,
 * and Finding.solodit_references are optional (suffixed with ?)
 */
describe("AC4: Finding optional fields", () => {
  it.each(["impact", "remediation", "checklist_reference", "solodit_references"] as const)(
    "Finding can be constructed without %s",
    (field) => {
      const finding = minimalFinding();
      expect(finding[field]).toBeUndefined();
    },
  );

  it("Finding still accepts all optional fields when provided", () => {
    const finding = minimalFinding({
      impact: "High impact",
      remediation: "Fix it",
      checklist_reference: "SOL-CR-1",
      solodit_references: ["slug-1"],
    });
    expect(finding.impact).toBe("High impact");
    expect(finding.remediation).toBe("Fix it");
    expect(finding.checklist_reference).toBe("SOL-CR-1");
    expect(finding.solodit_references).toEqual(["slug-1"]);
  });
});

/**
 * AC5: ChecklistItem has required fields description, remediation, references, and tags
 */
describe("AC5: ChecklistItem required fields", () => {
  it("ChecklistItem requires description field", () => {
    const item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      description: "Ensure access control is properly implemented",
      remediation: "Add proper access control modifiers",
      references: ["https://example.com/ref1"],
      tags: ["access-control"],
    };
    expect(item.description).toBe("Ensure access control is properly implemented");
  });

  it("ChecklistItem requires remediation field", () => {
    const item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      description: "desc",
      remediation: "Add proper access control modifiers",
      references: [],
      tags: [],
    };
    expect(item.remediation).toBe("Add proper access control modifiers");
  });

  it("ChecklistItem requires references as string[]", () => {
    const item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      description: "desc",
      remediation: "fix",
      references: ["https://example.com/ref1", "https://example.com/ref2"],
      tags: [],
    };
    expect(item.references).toEqual(["https://example.com/ref1", "https://example.com/ref2"]);
  });

  it("ChecklistItem requires tags as string[] (not optional)", () => {
    const item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      description: "desc",
      remediation: "fix",
      references: [],
      tags: ["access-control", "critical"],
    };
    expect(item.tags).toEqual(["access-control", "critical"]);
  });
});

describe("AC5b: ChecklistItem rejects missing required fields", () => {
  it("rejects ChecklistItem without description", () => {
    // @ts-expect-error - 'description' is required on ChecklistItem
    const _item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      remediation: "fix",
      references: [],
      tags: [],
    };
    expect(_item).toBeDefined();
  });

  it("rejects ChecklistItem without remediation", () => {
    // @ts-expect-error - 'remediation' is required on ChecklistItem
    const _item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      description: "desc",
      references: [],
      tags: [],
    };
    expect(_item).toBeDefined();
  });

  it("rejects ChecklistItem without references", () => {
    // @ts-expect-error - 'references' is required on ChecklistItem
    const _item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      description: "desc",
      remediation: "fix",
      tags: [],
    };
    expect(_item).toBeDefined();
  });

  it("rejects ChecklistItem without tags", () => {
    // @ts-expect-error - 'tags' is required on ChecklistItem
    const _item: ChecklistItem = {
      id: "SOL-CR-1",
      category: "Access Control",
      question: "Is access properly restricted?",
      description: "desc",
      remediation: "fix",
      references: [],
    };
    expect(_item).toBeDefined();
  });
});

/**
 * AC7: FindingStatus type alias exists with correct values
 */
describe("AC7: FindingStatus type alias", () => {
  it("accepts 'candidate' as a valid FindingStatus", () => {
    const s: FindingStatus = "candidate";
    expect(s).toBe("candidate");
  });

  it("accepts 'verified' as a valid FindingStatus", () => {
    const s: FindingStatus = "verified";
    expect(s).toBe("verified");
  });

  it("accepts 'discarded' as a valid FindingStatus", () => {
    const s: FindingStatus = "discarded";
    expect(s).toBe("discarded");
  });

  it("rejects invalid FindingStatus values", () => {
    // @ts-expect-error - 'pending' is not a valid FindingStatus
    const _s: FindingStatus = "pending";
    expect(_s).toBe("pending");
  });
});

/**
 * AC8: ProofType type alias exists with correct values
 */
describe("AC8: ProofType type alias", () => {
  it.each([
    "none",
    "foundry_poc",
    "echidna",
    "medusa",
    "halmos",
    "ityfuzz",
  ] as const)("accepts '%s' as a valid ProofType", (value) => {
    const p: ProofType = value;
    expect(p).toBe(value);
  });

  it("rejects invalid ProofType values", () => {
    // @ts-expect-error - 'mythril' is not a valid ProofType
    const _p: ProofType = "mythril";
    expect(_p).toBe("mythril");
  });
});

/**
 * AC9: DetectorCategory type alias exists with correct values
 */
describe("AC9: DetectorCategory type alias", () => {
  it.each([
    "access_control",
    "accounting_entitlement",
    "callback_liveness",
    "semantic_consistency",
    "state_machine",
    "math_rounding",
    "reentrancy",
    "oracle_randomness",
    "token_integration",
    "upgradeability",
    "other",
  ] as const)("accepts '%s' as a valid DetectorCategory", (value) => {
    const c: DetectorCategory = value;
    expect(c).toBe(value);
  });

  it("rejects invalid DetectorCategory values", () => {
    // @ts-expect-error - 'unknown_category' is not a valid DetectorCategory
    const _c: DetectorCategory = "unknown_category";
    expect(_c).toBe("unknown_category");
  });
});

/**
 * AC10: New optional fields on Finding with safe defaults
 */
describe("AC10: Finding v0.4.0 optional fields", () => {
  it("existing Finding construction still works without new fields", () => {
    const finding = minimalFinding();
    expect(finding.title).toBe("Test");
    expect(finding.status).toBeUndefined();
    expect(finding.proof_type).toBeUndefined();
    expect(finding.root_cause_key).toBeUndefined();
    expect(finding.independence_count).toBeUndefined();
    expect(finding.witness_path).toBeUndefined();
    expect(finding.verification_notes).toBeUndefined();
    expect(finding.benchmark_mode_visible).toBeUndefined();
  });

  it("Finding accepts all new optional fields when provided", () => {
    const finding = minimalFinding({
      status: "verified",
      proof_type: "foundry_poc",
      root_cause_key: "RCK-001",
      independence_count: 3,
      witness_path: "test/poc/Exploit.t.sol",
      verification_notes: "Confirmed via PoC",
      benchmark_mode_visible: false,
    });
    expect(finding.status).toBe("verified");
    expect(finding.proof_type).toBe("foundry_poc");
    expect(finding.root_cause_key).toBe("RCK-001");
    expect(finding.independence_count).toBe(3);
    expect(finding.witness_path).toBe("test/poc/Exploit.t.sol");
    expect(finding.verification_notes).toBe("Confirmed via PoC");
    expect(finding.benchmark_mode_visible).toBe(false);
  });

  it("Finding accepts status: 'candidate' (default)", () => {
    const finding = minimalFinding({ status: "candidate" });
    expect(finding.status).toBe("candidate");
  });

  it("Finding accepts proof_type: 'none' (default)", () => {
    const finding = minimalFinding({ proof_type: "none" });
    expect(finding.proof_type).toBe("none");
  });

  it("Finding accepts benchmark_mode_visible: true (default)", () => {
    const finding = minimalFinding({ benchmark_mode_visible: true });
    expect(finding.benchmark_mode_visible).toBe(true);
  });
});

describe("AC6 negative: removed Finding fields rejected at compile time", () => {
  it("rejects detection_layer on Finding", () => {
    const _f: Finding = {
      ...minimalFinding(),
      // @ts-expect-error - detection_layer was removed from Finding
      detection_layer: "static_analysis",
    };
    expect(_f).toBeDefined();
  });

  it("rejects code_path_explanation on Finding", () => {
    const _f: Finding = {
      ...minimalFinding(),
      // @ts-expect-error - code_path_explanation was removed from Finding
      code_path_explanation: "some explanation",
    };
    expect(_f).toBeDefined();
  });
});

/**
 * AC6: ProgressEvent removed from exports; progress.ts deleted
 */
describe("AC6: ProgressEvent removal", () => {
  let indexSource: string;
  let findingSource: string;
  let typesDir: string;

  beforeAll(async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    typesDir = path.resolve(__dirname, "..");
    const indexPath = path.join(typesDir, "index.ts");
    const findingPath = path.join(typesDir, "finding.ts");
    indexSource = await fs.readFile(indexPath, "utf-8");
    findingSource = await fs.readFile(findingPath, "utf-8");
  });

  it("src/types/index.ts source does not reference ProgressEvent", () => {
    expect(indexSource).not.toMatch(/ProgressEvent/);
  });

  it("src/types/index.ts source does not reference benchmark types", () => {
    expect(indexSource).not.toMatch(/BenchmarkCase/);
    expect(indexSource).not.toMatch(/BenchmarkResult/);
    expect(indexSource).not.toMatch(/ExpectedFinding/);
  });

  it("src/types/index.ts source does not reference DetectionLayer", () => {
    expect(indexSource).not.toMatch(/DetectionLayer/);
  });

  it("src/types/finding.ts source does not define DetectionLayer", () => {
    expect(findingSource).not.toMatch(/DetectionLayer/);
  });

  it("src/types/finding.ts source does not include cross_contract in EvidenceSourceType", () => {
    expect(findingSource).not.toMatch(/cross_contract/);
  });

  it("src/types/finding.ts source does not include llm_reasoning in EvidenceSourceType", () => {
    expect(findingSource).not.toMatch(/llm_reasoning/);
  });

  it("progress.ts and benchmark.ts files do not exist", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await expect(fs.access(path.join(typesDir, "progress.ts"))).rejects.toThrow();
    await expect(fs.access(path.join(typesDir, "benchmark.ts"))).rejects.toThrow();
  });
});
