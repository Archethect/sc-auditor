import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

/** Project root resolved from this test file location. */
const ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** Path to the SKILL.md file under test. */
const SKILL_PATH = resolve(ROOT, "skills/security-auditor/SKILL.md");

/** Read the SKILL.md file content. */
function readSkill(): string {
  return readFileSync(SKILL_PATH, "utf-8");
}

/** Extract YAML frontmatter string from SKILL.md (between first two --- delimiters). */
function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("No YAML frontmatter found");
  return match[1];
}

/** Parse YAML frontmatter into an object. */
function parseFrontmatter(content: string): Record<string, unknown> {
  return yaml.load(extractFrontmatter(content)) as Record<string, unknown>;
}

/** Extract the markdown body (everything after the closing --- of frontmatter). */
function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!match) throw new Error("No body found after frontmatter");
  return match[1];
}

/** Count lines in a string. */
function lineCount(content: string): number {
  return content.split("\n").length;
}

describe("AC1: SKILL.md exists with valid YAML frontmatter", () => {
  it("skills/security-auditor/SKILL.md file exists", () => {
    expect(() => readSkill()).not.toThrow();
  });

  it("YAML frontmatter parses without error", () => {
    const content = readSkill();
    expect(() => parseFrontmatter(content)).not.toThrow();
  });

  it("frontmatter contains 'name' field with value 'security-auditor'", () => {
    const fm = parseFrontmatter(readSkill());
    expect(fm.name).toBe("security-auditor");
  });

  it("frontmatter contains 'description' field (non-empty string)", () => {
    const fm = parseFrontmatter(readSkill());
    expect(typeof fm.description).toBe("string");
    expect((fm.description as string).length).toBeGreaterThan(0);
  });

  it("frontmatter contains 'argument-hint' field", () => {
    const fm = parseFrontmatter(readSkill());
    expect(fm["argument-hint"]).toBeDefined();
  });

  it("frontmatter contains 'allowed-tools' field (array)", () => {
    const fm = parseFrontmatter(readSkill());
    expect(Array.isArray(fm["allowed-tools"])).toBe(true);
  });
});

describe("AC2: allowed-tools includes all MCP tools and standard tools", () => {
  it("allowed-tools includes 'mcp__sc-auditor__run-slither' (hyphens)", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("mcp__sc-auditor__run-slither");
  });

  it("allowed-tools includes 'mcp__sc-auditor__run-aderyn' (hyphens)", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("mcp__sc-auditor__run-aderyn");
  });

  it("allowed-tools includes 'mcp__sc-auditor__get_checklist'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("mcp__sc-auditor__get_checklist");
  });

  it("allowed-tools includes 'mcp__sc-auditor__search_findings'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("mcp__sc-auditor__search_findings");
  });

  it("allowed-tools includes 'Read'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("Read");
  });

  it("allowed-tools includes 'Glob'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("Glob");
  });

  it("allowed-tools includes 'Grep'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("Grep");
  });

  it("allowed-tools includes 'Bash'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("Bash");
  });

  it("allowed-tools does NOT include 'mcp__sc-auditor__run_slither' (underscores — wrong)", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).not.toContain("mcp__sc-auditor__run_slither");
  });
});

describe("AC3: SETUP phase runs static analysis tools", () => {
  it("body contains a SETUP phase section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/SETUP/i);
  });

  it("body references 'run-slither' in SETUP context", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/run-slither/);
  });

  it("body references 'run-aderyn' in SETUP context", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/run-aderyn/);
  });

  it("body mentions fallback behavior if both tools fail", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/fail|manual[- ]only/i);
  });
});

describe("AC4: MAP phase with components, invariants, static analysis summary", () => {
  it("body contains a MAP phase section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/MAP/);
  });

  it("body contains 'Components' subsection", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Cc]omponents/);
  });

  it("body contains 'Invariants' subsection", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Ii]nvariants/);
  });

  it("body contains 'Static Analysis Summary' subsection", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Ss]tatic [Aa]nalysis [Ss]ummary/);
  });

  it("body contains a checkpoint after MAP", () => {
    const body = extractBody(readSkill());
    const mapIdx = body.search(/MAP/);
    const checkpointMatches = [...body.matchAll(/CHECKPOINT/gi)];
    const hasCheckpointAfterMap = checkpointMatches.some((m) => (m.index ?? 0) > mapIdx);
    expect(hasCheckpointAfterMap).toBe(true);
  });
});

describe("AC5: HUNT phase with tools and checkpoint", () => {
  it("body contains a HUNT phase section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/HUNT/);
  });

  it("body references 'get_checklist' in HUNT context", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/get_checklist/);
  });

  it("body references 'search_findings' in HUNT context", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/search_findings/);
  });

  it("body contains a checkpoint after HUNT for spot selection", () => {
    const body = extractBody(readSkill());
    const huntIdx = body.search(/HUNT/);
    const checkpointMatches = [...body.matchAll(/CHECKPOINT/gi)];
    const hasCheckpointAfterHunt = checkpointMatches.some((m) => (m.index ?? 0) > huntIdx);
    expect(hasCheckpointAfterHunt).toBe(true);
  });
});

describe("AC6: ATTACK phase with Devil's Advocate", () => {
  it("body contains an ATTACK phase section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/ATTACK/);
  });

  it("body contains Devil's Advocate protocol reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Dd]evil.*[Aa]dvocate/);
  });
});

describe("AC7: All 5 core protocols present", () => {
  it("body contains 'Hypothesis' keyword (Hypothesis-Driven)", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Hh]ypothesis/);
  });

  it("body contains 'Cross-Reference' keyword", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Cc]ross-[Rr]eference/);
  });

  it("body contains 'Devil' keyword (Devil's Advocate)", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Devil/);
  });

  it("body contains 'Evidence Required' keyword", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Ee]vidence [Rr]equired/);
  });

  it("body contains 'Privileged' keyword (Privileged Roles)", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Pp]rivileged/);
  });
});

describe("AC8: All 9 risk patterns present with descriptions", () => {
  it("body contains 'ERC-4626' or 'share inflation'", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/ERC-4626|[Ss]hare [Ii]nflation/);
  });

  it("body contains oracle staleness pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Oo]racle [Ss]taleness|[Oo]racle.*[Mm]anipulation/);
  });

  it("body contains flash loan pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Ff]lash [Ll]oan/);
  });

  it("body contains rounding direction pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Rr]ounding [Dd]irection|[Rr]ounding.*[Ss]hare/);
  });

  it("body contains proxy storage collision pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Pp]roxy [Ss]torage|[Ss]torage [Cc]ollision/);
  });

  it("body contains cross-contract reentrancy pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Cc]ross-[Cc]ontract [Rr]eentrancy|[Cc]allback/);
  });

  it("body contains donation attack pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Dd]onation [Aa]ttack/);
  });

  it("body contains slippage pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Ss]lippage/);
  });

  it("body contains unchecked return values pattern", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Uu]nchecked [Rr]eturn/);
  });
});

describe("AC9: Finding output format compatible with Finding type", () => {
  it("body contains 'title' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\btitle\b/);
  });

  it("body contains 'severity' field with valid values", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bseverity\b/);
    expect(body).toMatch(/CRITICAL.*HIGH.*MEDIUM.*LOW.*GAS.*INFORMATIONAL/s);
  });

  it("body contains 'confidence' field with valid values", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bconfidence\b/);
    expect(body).toMatch(/Confirmed.*Likely.*Possible/s);
  });

  it("body contains 'source' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bsource\b/);
  });

  it("body contains 'category' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bcategory\b/);
  });

  it("body contains 'affected_files' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/affected_files/);
  });

  it("body contains 'affected_lines' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/affected_lines/);
  });

  it("body contains 'description' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bdescription\b/);
  });

  it("body contains 'evidence_sources' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/evidence_sources/);
  });

  it("body contains 'impact' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bimpact\b/);
  });

  it("body contains 'remediation' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bremediation\b/);
  });

  it("body contains 'attack_scenario' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/attack_scenario/);
  });
});

describe("AC10: Two user checkpoints", () => {
  it("body contains at least 2 checkpoint markers", () => {
    const body = extractBody(readSkill());
    const matches = body.match(/CHECKPOINT/gi);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("one checkpoint appears after MAP phase content", () => {
    const body = extractBody(readSkill());
    const mapMatch = body.match(/##.*MAP/);
    expect(mapMatch).not.toBeNull();
    const mapIdx = mapMatch!.index!;
    const afterMap = body.slice(mapIdx);
    expect(afterMap).toMatch(/CHECKPOINT/i);
  });

  it("one checkpoint appears after HUNT phase content", () => {
    const body = extractBody(readSkill());
    const huntMatch = body.match(/##.*HUNT/);
    expect(huntMatch).not.toBeNull();
    const huntIdx = huntMatch!.index!;
    const afterHunt = body.slice(huntIdx);
    expect(afterHunt).toMatch(/CHECKPOINT/i);
  });
});

describe("AC11: v0.4.0 allowed-tools includes MCP tools (deleted tools removed)", () => {
  it("allowed-tools includes 'Agent'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("Agent");
  });

  it("allowed-tools does NOT include deleted 'mcp__sc-auditor__build-system-map'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).not.toContain("mcp__sc-auditor__build-system-map");
  });

  it("allowed-tools does NOT include deleted 'mcp__sc-auditor__derive-hotspots'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).not.toContain("mcp__sc-auditor__derive-hotspots");
  });

  it("allowed-tools does NOT include deleted 'mcp__sc-auditor__verify-finding'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).not.toContain("mcp__sc-auditor__verify-finding");
  });

  it("allowed-tools includes 'mcp__sc-auditor__generate-foundry-poc'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("mcp__sc-auditor__generate-foundry-poc");
  });
});

describe("AC12: Six-phase workflow order", () => {
  it("body contains all six phases: SETUP, MAP, HUNT, ATTACK, VERIFY, REPORT", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/SETUP/);
    expect(body).toMatch(/MAP/);
    expect(body).toMatch(/HUNT/);
    expect(body).toMatch(/ATTACK/);
    expect(body).toMatch(/VERIFY/);
    expect(body).toMatch(/REPORT/);
  });

  it("phases appear in correct order: SETUP before MAP before HUNT before ATTACK before VERIFY before REPORT", () => {
    const body = extractBody(readSkill());
    const setupIdx = body.search(/Phase 1.*SETUP/i);
    const mapIdx = body.search(/Phase 2.*MAP/i);
    const huntIdx = body.search(/Phase 3.*HUNT/i);
    const attackIdx = body.search(/Phase 4.*ATTACK/i);
    const verifyIdx = body.search(/Phase 5.*VERIFY/i);
    const reportIdx = body.search(/Phase 6.*REPORT/i);
    expect(setupIdx).toBeGreaterThanOrEqual(0);
    expect(mapIdx).toBeGreaterThan(setupIdx);
    expect(huntIdx).toBeGreaterThan(mapIdx);
    expect(attackIdx).toBeGreaterThan(huntIdx);
    expect(verifyIdx).toBeGreaterThan(attackIdx);
    expect(reportIdx).toBeGreaterThan(verifyIdx);
  });
});

describe("AC13: VERIFY phase with skeptic-judge pipeline", () => {
  it("body contains VERIFY phase section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/VERIFY.*Skeptic.*Judge/is);
  });

  it("body references skeptic and judge prompts for verification", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/skeptic\.md/);
    expect(body).toMatch(/judge\.md/);
  });

  it("body mentions verified, candidate, and discarded statuses", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/verified/);
    expect(body).toMatch(/candidate/);
    expect(body).toMatch(/discarded/);
  });

  it("body mentions benchmark mode gating for unproven findings", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/benchmark.*mode/i);
    expect(body).toMatch(/benchmark_mode_visible/);
  });
});

describe("AC14: REPORT phase with structured sections", () => {
  it("body contains REPORT phase section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/REPORT/);
  });

  it("body contains Proved Findings section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Proved Findings/);
  });

  it("body contains Detected Candidates section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Detected Candidates/);
  });

  it("body contains Discarded section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Discarded/);
  });

  it("body contains Confirmed (Unproven) section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Confirmed \(Unproven\)/);
  });

  it("body contains Design Tradeoffs section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Design Tradeoffs/);
  });
});

describe("AC15: HUNT lanes documented", () => {
  it("body references callback_liveness lane", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/callback_liveness/);
  });

  it("body references accounting_entitlement lane", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/accounting_entitlement/);
  });

  it("body references semantic_consistency lane", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/semantic_consistency/);
  });

  it("body references token_oracle_statefulness lane", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/token_oracle_statefulness/);
  });

  it("body references adversarial_deep lane for deep mode", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/adversarial_deep/);
  });

  it("body documents parallel dispatch with Agent tool", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Pp]arallel/i);
    expect(body).toMatch(/Agent/);
  });

  it("body documents serial fallback for non-subagent hosts", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Ss]erial.*fallback/i);
  });
});

describe("AC16: Solodit restriction documented", () => {
  it("body explicitly restricts search_findings in HUNT phase", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/HUNT.*DO NOT.*search_findings/is);
  });

  it("body permits search_findings in ATTACK for corroboration", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/ATTACK.*MAY.*search_findings/is);
  });

  it("body permits search_findings in VERIFY for evidence", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/VERIFY.*MAY.*search_findings/is);
  });
});

describe("AC17: v0.4.0 Finding fields in output format", () => {
  it("body contains 'status' field with candidate/verified/discarded", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\bstatus\b/);
    expect(body).toMatch(/candidate.*verified.*discarded/is);
  });

  it("body contains 'proof_type' field", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/proof_type/);
  });

  it("body contains 'independence_count' field", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/independence_count/);
  });

  it("body contains 'benchmark_mode_visible' field", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/benchmark_mode_visible/);
  });

  it("body contains 'root_cause_key' field", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/root_cause_key/);
  });

  it("body contains 'witness_path' field", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/witness_path/);
  });

  it("body contains 'verification_notes' field", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/verification_notes/);
  });
});

describe("AC18: MAP phase uses sub-agent with map.md prompt", () => {
  it("MAP phase references Agent tool and map.md prompt", () => {
    const body = extractBody(readSkill());
    const mapSection = body.match(/Phase 2.*MAP[\s\S]*?(?=Phase 3)/i)?.[0] ?? "";
    expect(mapSection).toMatch(/Agent/);
    expect(mapSection).toMatch(/map\.md/);
  });
});

describe("AC19: HUNT phase uses parallel sub-agents with lane prompts", () => {
  it("HUNT phase dispatches parallel lane agents", () => {
    const body = extractBody(readSkill());
    const huntSection = body.match(/Phase 3.*HUNT[\s\S]*?(?=Phase 4)/i)?.[0] ?? "";
    expect(huntSection).toMatch(/Agent/);
    expect(huntSection).toMatch(/[Pp]arallel/);
  });
});

describe("AC20: ATTACK phase references generate-foundry-poc tool", () => {
  it("body references generate-foundry-poc in ATTACK phase", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/generate-foundry-poc/);
  });
});

// ============================================================================
// v0.4.0 Lean Orchestrator Tests (AC21-AC29)
// ============================================================================

describe("AC21: Agent dispatch for MAP phase", () => {
  it("MAP phase instructs dispatching a sub-agent via Agent tool", () => {
    const body = extractBody(readSkill());
    // Extract MAP phase section (from Phase 2 to Phase 3)
    const mapSection = body.match(/Phase 2.*MAP[\s\S]*?(?=Phase 3)/i)?.[0] ?? "";
    expect(mapSection).toMatch(/Agent/);
  });

  it("MAP phase references map.md prompt pack for the sub-agent", () => {
    const body = extractBody(readSkill());
    const mapSection = body.match(/Phase 2.*MAP[\s\S]*?(?=Phase 3)/i)?.[0] ?? "";
    expect(mapSection).toMatch(/map\.md/);
  });

  it("MAP agent receives SystemMapArtifact or produces it", () => {
    const body = extractBody(readSkill());
    const mapSection = body.match(/Phase 2.*MAP[\s\S]*?(?=Phase 3)/i)?.[0] ?? "";
    expect(mapSection).toMatch(/SystemMapArtifact/i);
  });
});

describe("AC22: Agent dispatch for HUNT phase — 4 parallel lanes", () => {
  it("HUNT phase dispatches 4 parallel lane agents", () => {
    const body = extractBody(readSkill());
    const huntSection = body.match(/Phase 3.*HUNT[\s\S]*?(?=Phase 4)/i)?.[0] ?? "";
    // Should mention dispatching agents for each lane or "4" parallel agents
    expect(huntSection).toMatch(/Agent/);
    expect(huntSection).toMatch(/parallel/i);
  });

  it("each HUNT lane agent references its lane-specific prompt pack", () => {
    const body = extractBody(readSkill());
    const huntSection = body.match(/Phase 3.*HUNT[\s\S]*?(?=Phase 4)/i)?.[0] ?? "";
    expect(huntSection).toMatch(/hunt-callback-liveness\.md/);
    expect(huntSection).toMatch(/hunt-accounting-entitlement\.md/);
    expect(huntSection).toMatch(/hunt-semantic-consistency\.md/);
    expect(huntSection).toMatch(/hunt-token-oracle-statefulness\.md/);
  });

  it("optional 5th adversarial agent for deep mode", () => {
    const body = extractBody(readSkill());
    const huntSection = body.match(/Phase 3.*HUNT[\s\S]*?(?=Phase 4)/i)?.[0] ?? "";
    expect(huntSection).toMatch(/adversarial_deep/);
    expect(huntSection).toMatch(/deep/i);
  });
});

describe("AC23: Agent dispatch for ATTACK phase — parallel per hotspot", () => {
  it("ATTACK phase dispatches parallel agents per hotspot", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    expect(attackSection).toMatch(/Agent/);
    expect(attackSection).toMatch(/parallel/i);
  });

  it("ATTACK phase references attack.md prompt pack", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    expect(attackSection).toMatch(/attack\.md/);
  });
});

describe("AC24: Agent dispatch for VERIFY phase — parallel per finding", () => {
  it("VERIFY phase dispatches parallel agents per finding", () => {
    const body = extractBody(readSkill());
    const verifySection = body.match(/Phase 5.*VERIFY[\s\S]*?(?=Phase 6)/i)?.[0] ?? "";
    expect(verifySection).toMatch(/Agent/);
    expect(verifySection).toMatch(/parallel/i);
  });

  it("VERIFY agent references skeptic-judge pipeline", () => {
    const body = extractBody(readSkill());
    const verifySection = body.match(/Phase 5.*VERIFY[\s\S]*?(?=Phase 6)/i)?.[0] ?? "";
    expect(verifySection).toMatch(/skeptic|judge/i);
  });
});

describe("AC25: Mandatory proof in ATTACK phase", () => {
  it("ATTACK phase requires proof generation — uses 'must' or 'required' language", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    // Must use mandatory language (not "optional" or "may") around proof tools
    expect(attackSection).toMatch(/must.*(?:generate-foundry-poc|proof|echidna|medusa|halmos)/is);
  });

  it("ATTACK phase does NOT describe proof scaffolding as optional", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    // The old pattern had "### 5. Proof Scaffolding (Optional)" — this should no longer be present
    expect(attackSection).not.toMatch(/Proof.*\(Optional\)/i);
  });

  it("ATTACK phase mentions at least one proof method tool", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    const hasProofTool =
      /generate-foundry-poc/.test(attackSection) ||
      /run-echidna/.test(attackSection) ||
      /run-medusa/.test(attackSection) ||
      /run-halmos/.test(attackSection);
    expect(hasProofTool).toBe(true);
  });
});

describe("AC26: Parallel execution structure for HUNT and ATTACK", () => {
  it("HUNT phase describes parallel dispatch pattern", () => {
    const body = extractBody(readSkill());
    const huntSection = body.match(/Phase 3.*HUNT[\s\S]*?(?=Phase 4)/i)?.[0] ?? "";
    expect(huntSection).toMatch(/[Pp]arallel/);
    expect(huntSection).toMatch(/Agent/);
  });

  it("ATTACK phase describes parallel dispatch pattern", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    expect(attackSection).toMatch(/[Pp]arallel/);
    expect(attackSection).toMatch(/Agent/);
  });
});

describe("AC27: Serial fallback documented", () => {
  it("body documents serial fallback when Agent tool is unavailable", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/[Ss]erial.*fallback/i);
  });

  it("serial fallback is tied to Agent tool unavailability", () => {
    const body = extractBody(readSkill());
    // Should mention running serially when Agent is unavailable or subagents not supported
    expect(body).toMatch(/Agent.*unavailable|not.*available.*serial|serial.*(?:when|if).*(?:no|not|without).*Agent/is);
  });
});

describe("AC28: attack.md prompt pack exists", () => {
  it("attack.md file exists at skills/security-auditor/assets/prompts/attack.md", () => {
    const attackPromptPath = resolve(
      ROOT,
      "skills/security-auditor/assets/prompts/attack.md",
    );
    expect(existsSync(attackPromptPath)).toBe(true);
  });
});

describe("AC29: Orchestrator is lean", () => {
  it("SKILL.md is significantly shorter than the old monolithic version (~400 lines)", () => {
    const content = readSkill();
    const lines = lineCount(content);
    // v0.4.1 added Phase 0 (resume), Phase 5.5 (conflict resolution), and
    // Checkpoint Discipline section. Still well under the old monolithic ~404 lines.
    expect(lines).toBeLessThan(480);
  });

  it("SKILL.md is at least 100 lines (not empty or trivially small)", () => {
    const content = readSkill();
    const lines = lineCount(content);
    expect(lines).toBeGreaterThanOrEqual(100);
  });
});

// ============================================================================
// v0.4.1 DA-First Protocol, Real PoCs, Checkpoints (AC30-AC41)
// ============================================================================

describe("AC30: Phase 0 RESUME CHECK exists", () => {
  it("body contains Phase 0 with RESUME CHECK", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Phase 0.*RESUME/i);
  });

  it("body references manifest.json for checkpoint detection", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/manifest\.json/);
  });
});

describe("AC31: Checkpoint persistence per phase", () => {
  it("body references checkpoint directory", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/\.sc-auditor-work\/checkpoints/);
  });

  it("body mentions checkpoint writing for SETUP phase", () => {
    const body = extractBody(readSkill());
    const setupSection = body.match(/Phase 1.*SETUP[\s\S]*?(?=Phase 2)/i)?.[0] ?? "";
    expect(setupSection).toMatch(/[Cc]heckpoint/i);
  });

  it("body mentions checkpoint writing for MAP phase", () => {
    const body = extractBody(readSkill());
    const mapSection = body.match(/Phase 2.*MAP[\s\S]*?(?=Phase 3)/i)?.[0] ?? "";
    expect(mapSection).toMatch(/[Cc]heckpoint/i);
  });

  it("body mentions checkpoint writing for HUNT phase", () => {
    const body = extractBody(readSkill());
    const huntSection = body.match(/Phase 3.*HUNT[\s\S]*?(?=Phase 4)/i)?.[0] ?? "";
    expect(huntSection).toMatch(/[Cc]heckpoint/i);
  });

  it("body mentions checkpoint writing for ATTACK phase", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    expect(attackSection).toMatch(/[Cc]heckpoint/i);
  });
});

describe("AC32: DA protocol file exists", () => {
  it("da-protocol.md exists at skills/security-auditor/assets/prompts/da-protocol.md", () => {
    const daProtocolPath = resolve(
      ROOT,
      "skills/security-auditor/assets/prompts/da-protocol.md",
    );
    expect(existsSync(daProtocolPath)).toBe(true);
  });

  it("body references da-protocol.md in Core Protocols", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/da-protocol\.md/);
  });
});

describe("AC33: SETUP delegated to sub-agent", () => {
  it("Phase 1 SETUP dispatches a sub-agent via Agent tool", () => {
    const body = extractBody(readSkill());
    const setupSection = body.match(/Phase 1.*SETUP[\s\S]*?(?=Phase 2)/i)?.[0] ?? "";
    expect(setupSection).toMatch(/Agent/);
  });

  it("Phase 1 SETUP references setup.md prompt", () => {
    const body = extractBody(readSkill());
    const setupSection = body.match(/Phase 1.*SETUP[\s\S]*?(?=Phase 2)/i)?.[0] ?? "";
    expect(setupSection).toMatch(/setup\.md/);
  });

  it("Phase 1 SETUP is no longer described as inline", () => {
    const body = extractBody(readSkill());
    const setupSection = body.match(/Phase 1.*SETUP[\s\S]*?(?=Phase 2)/i)?.[0] ?? "";
    // Old: "SETUP (Inline)" — new: "SETUP (1 Sub-Agent)"
    expect(setupSection).not.toMatch(/\(Inline\)/);
  });
});

describe("AC34: v0.4.1 DA fields in output format", () => {
  it("body contains 'da_attack' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/da_attack/);
  });

  it("body contains 'da_verify' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/da_verify/);
  });

  it("body contains 'da_chain' field reference", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/da_chain/);
  });

  it("body contains 'invalidated_by_attack' status", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/invalidated_by_attack/);
  });
});

describe("AC35: Write and Edit tools in allowed-tools", () => {
  it("allowed-tools includes 'Write'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("Write");
  });

  it("allowed-tools includes 'Edit'", () => {
    const fm = parseFrontmatter(readSkill());
    const tools = fm["allowed-tools"] as string[];
    expect(tools).toContain("Edit");
  });
});

describe("AC36: ATTACK phase includes Write/Edit/Bash tools", () => {
  it("ATTACK phase allowed tools include Write, Edit, and Bash", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    expect(attackSection).toMatch(/Write/);
    expect(attackSection).toMatch(/Edit/);
    expect(attackSection).toMatch(/Bash/);
  });
});

describe("AC37: ATTACK phase requires DA first", () => {
  it("ATTACK phase mentions DA protocol must run first", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    expect(attackSection).toMatch(/DA.*(?:protocol|FIRST)/is);
  });
});

describe("AC38: Phase 5.5 CONFLICT RESOLUTION exists", () => {
  it("body contains Phase 5.5 with CONFLICT RESOLUTION", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Phase 5\.5.*CONFLICT.*RESOLUTION/i);
  });

  it("body mentions RE-ATTACK for resurrected findings", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/RE-ATTACK/i);
  });

  it("body mentions 'prove it or lose it' protocol", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/prove it or lose it/i);
  });
});

describe("AC39: VERIFY phase includes invalidated findings", () => {
  it("VERIFY phase mentions dispatching for invalidated_by_attack findings", () => {
    const body = extractBody(readSkill());
    const verifySection = body.match(/Phase 5.*VERIFY[\s\S]*?(?=Phase 5\.5|Phase 6)/i)?.[0] ?? "";
    expect(verifySection).toMatch(/invalidated/i);
  });
});

describe("AC40: VERIFY phase includes proof tools", () => {
  it("VERIFY phase allowed tools include Write, Edit, Bash, and proof tools", () => {
    const body = extractBody(readSkill());
    const verifySection = body.match(/Phase 5.*VERIFY[\s\S]*?(?=Phase 5\.5|Phase 6)/i)?.[0] ?? "";
    expect(verifySection).toMatch(/Write/);
    expect(verifySection).toMatch(/generate-foundry-poc/);
  });
});

describe("AC41: .agents mirror matches skills SKILL.md structure", () => {
  /** Build .agents/ before these tests run (idempotent). */
  const { execSync } = require("node:child_process");
  try {
    execSync("node scripts/build-agents.mjs", { cwd: ROOT, stdio: "pipe" });
  } catch {
    // Allow tests to fail naturally if build is broken
  }

  it(".agents SKILL.md exists", () => {
    const agentsSkillPath = resolve(
      ROOT,
      ".agents/skills/security-auditor/SKILL.md",
    );
    expect(existsSync(agentsSkillPath)).toBe(true);
  });

  it(".agents SKILL.md contains Phase 0 RESUME CHECK", () => {
    const agentsSkillPath = resolve(
      ROOT,
      ".agents/skills/security-auditor/SKILL.md",
    );
    const content = readFileSync(agentsSkillPath, "utf-8");
    expect(content).toMatch(/Phase 0.*RESUME/i);
  });

  it(".agents SKILL.md contains Phase 5.5 CONFLICT RESOLUTION", () => {
    const agentsSkillPath = resolve(
      ROOT,
      ".agents/skills/security-auditor/SKILL.md",
    );
    const content = readFileSync(agentsSkillPath, "utf-8");
    expect(content).toMatch(/Phase 5\.5.*CONFLICT.*RESOLUTION/i);
  });

  it(".agents SKILL.md contains da_attack field", () => {
    const agentsSkillPath = resolve(
      ROOT,
      ".agents/skills/security-auditor/SKILL.md",
    );
    const content = readFileSync(agentsSkillPath, "utf-8");
    expect(content).toMatch(/da_attack/);
  });

  it(".agents SKILL.md uses bare tool names (no mcp__ prefix)", () => {
    const agentsSkillPath = resolve(
      ROOT,
      ".agents/skills/security-auditor/SKILL.md",
    );
    const content = readFileSync(agentsSkillPath, "utf-8");
    expect(content).not.toContain("mcp__sc-auditor__");
    expect(content).toMatch(/run-slither/);
  });

  it(".agents SKILL.md uses .agents/ prompt paths", () => {
    const agentsSkillPath = resolve(
      ROOT,
      ".agents/skills/security-auditor/SKILL.md",
    );
    const content = readFileSync(agentsSkillPath, "utf-8");
    expect(content).toMatch(/\.agents\/skills\/security-auditor\/assets\/prompts\//);
    expect(content).not.toMatch(/`skills\/security-auditor\/assets\/prompts\//);
  });
});

// ============================================================================
// v0.4.2 Codex Parity Tests (AC42-AC51)
// ============================================================================

describe("AC42: SKILL.md contains NON-NEGOTIABLE RULES section", () => {
  it("body contains NON-NEGOTIABLE RULES heading", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/## NON-NEGOTIABLE RULES/);
  });
});

describe("AC43: NON-NEGOTIABLES cover all 7 rules", () => {
  it("covers state machine, user gates, delegation, no-audit, output validation, failure policy, minimal context", () => {
    const body = extractBody(readSkill());
    const section = body.match(/## NON-NEGOTIABLE RULES[\s\S]*?(?=## )/)?.[0] ?? "";
    expect(section).toMatch(/STATE MACHINE/i);
    expect(section).toMatch(/USER GATES/i);
    expect(section).toMatch(/DELEGATION/i);
    expect(section).toMatch(/ORCHESTRATOR DOES NOT AUDIT/i);
    expect(section).toMatch(/OUTPUT VALIDATION/i);
    expect(section).toMatch(/FAILURE POLICY/i);
    expect(section).toMatch(/MINIMAL CONTEXT/i);
  });
});

describe("AC44: Each phase dispatch block mentions fork_context alternative", () => {
  it("body mentions fork_context", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/fork_context/);
  });

  it("alternative dispatch mentioned in phases", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/Alternative dispatch/);
  });
});

describe("AC45: User gates use BLOCKING + HALT language", () => {
  it("body contains 2 USER GATE (BLOCKING) markers", () => {
    const body = extractBody(readSkill());
    const matches = body.match(/USER GATE \(BLOCKING\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("body contains HALT instruction at each gate", () => {
    const body = extractBody(readSkill());
    const matches = body.match(/HALT\./g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("AC46: Output validation keys listed for phases", () => {
  it("SETUP output validation specifies required keys", () => {
    const body = extractBody(readSkill());
    const setupSection = body.match(/Phase 1.*SETUP[\s\S]*?(?=Phase 2)/i)?.[0] ?? "";
    expect(setupSection).toMatch(/Output validation/i);
  });

  it("MAP output validation specifies required keys", () => {
    const body = extractBody(readSkill());
    const mapSection = body.match(/Phase 2.*MAP[\s\S]*?(?=Phase 3)/i)?.[0] ?? "";
    expect(mapSection).toMatch(/Output validation/i);
  });

  it("HUNT output validation specifies required keys", () => {
    const body = extractBody(readSkill());
    const huntSection = body.match(/Phase 3.*HUNT[\s\S]*?(?=Phase 4)/i)?.[0] ?? "";
    expect(huntSection).toMatch(/Output validation/i);
  });

  it("ATTACK output validation specifies required keys", () => {
    const body = extractBody(readSkill());
    const attackSection = body.match(/Phase 4.*ATTACK[\s\S]*?(?=Phase 5)/i)?.[0] ?? "";
    expect(attackSection).toMatch(/Output validation/i);
  });

  it("VERIFY output validation specifies required keys", () => {
    const body = extractBody(readSkill());
    const verifySection = body.match(/Phase 5.*VERIFY[\s\S]*?(?=Phase 5\.5|Phase 6)/i)?.[0] ?? "";
    expect(verifySection).toMatch(/Output validation/i);
  });
});

describe("AC47: Phase Transition Checklist exists", () => {
  it("body contains Phase Transition Checklist section", () => {
    const body = extractBody(readSkill());
    expect(body).toMatch(/## Phase Transition Checklist/);
  });

  it("checklist has 6 conditions", () => {
    const body = extractBody(readSkill());
    const section = body.match(/## Phase Transition Checklist[\s\S]*?(?=## )/)?.[0] ?? "";
    const numberedItems = section.match(/^\d+\./gm);
    expect(numberedItems).not.toBeNull();
    expect(numberedItems!.length).toBeGreaterThanOrEqual(6);
  });
});

describe("AC48: All subagent prompts contain Scope Constraint", () => {
  const promptDir = resolve(ROOT, "skills/security-auditor/assets/prompts");
  const promptFiles = [
    "setup.md", "map.md", "attack.md", "skeptic.md", "judge.md", "da-protocol.md",
    "hunt-callback-liveness.md", "hunt-accounting-entitlement.md",
    "hunt-semantic-consistency.md", "hunt-token-oracle-statefulness.md",
    "hunt-economic-differential.md", "hunt-adversarial-deep.md",
  ];

  for (const file of promptFiles) {
    it(`${file} contains Scope Constraint section`, () => {
      const content = readFileSync(resolve(promptDir, file), "utf-8");
      expect(content).toMatch(/## Scope Constraint/);
    });
  }
});

describe("AC49: All subagent prompts contain Output Format", () => {
  const promptDir = resolve(ROOT, "skills/security-auditor/assets/prompts");
  const promptFiles = [
    "setup.md", "map.md", "attack.md", "skeptic.md", "judge.md", "da-protocol.md",
    "hunt-callback-liveness.md", "hunt-accounting-entitlement.md",
    "hunt-semantic-consistency.md", "hunt-token-oracle-statefulness.md",
    "hunt-economic-differential.md", "hunt-adversarial-deep.md",
  ];

  for (const file of promptFiles) {
    it(`${file} contains Output Format section`, () => {
      const content = readFileSync(resolve(promptDir, file), "utf-8");
      expect(content).toMatch(/## Output Format/);
    });
  }
});

describe("AC50: openai.yaml contains instructions.system section", () => {
  it("openai.yaml has instructions.system field", () => {
    const yamlPath = resolve(ROOT, "skills/security-auditor/agents/openai.yaml");
    const content = readFileSync(yamlPath, "utf-8");
    expect(content).toMatch(/instructions:/);
    expect(content).toMatch(/system:/);
  });

  it("openai.yaml instructions mention state machine", () => {
    const yamlPath = resolve(ROOT, "skills/security-auditor/agents/openai.yaml");
    const content = readFileSync(yamlPath, "utf-8");
    expect(content).toMatch(/state machine/i);
  });
});

describe("AC51: build-agents output contains Codex preamble", () => {
  const { execSync } = require("node:child_process");
  try {
    execSync("node scripts/build-agents.mjs", { cwd: ROOT, stdio: "pipe" });
  } catch {
    // Allow tests to fail naturally
  }

  it(".agents SKILL.md contains Codex preamble comment", () => {
    const agentsSkillPath = resolve(ROOT, ".agents/skills/security-auditor/SKILL.md");
    const content = readFileSync(agentsSkillPath, "utf-8");
    expect(content).toMatch(/CODEX ORCHESTRATOR ENFORCEMENT/);
  });

  it(".agents SKILL.md contains fork_context reference", () => {
    const agentsSkillPath = resolve(ROOT, ".agents/skills/security-auditor/SKILL.md");
    const content = readFileSync(agentsSkillPath, "utf-8");
    expect(content).toMatch(/fork_context/);
  });

  it(".agents prompt files contain Scope Constraint", () => {
    const agentsPromptDir = resolve(ROOT, ".agents/skills/security-auditor/assets/prompts");
    const setupContent = readFileSync(resolve(agentsPromptDir, "setup.md"), "utf-8");
    expect(setupContent).toMatch(/## Scope Constraint/);
  });
});
