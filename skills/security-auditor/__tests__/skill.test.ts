import { readFileSync } from "node:fs";
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
