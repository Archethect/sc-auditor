import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT_DIR = join(ROOT, ".agents", "skills", "security-auditor");
const SKILLS_DIR = join(ROOT, "skills", "security-auditor");

/** Run the build script before all tests. */
beforeAll(() => {
  execSync("node scripts/build-agents.mjs", { cwd: ROOT, stdio: "pipe" });
});

/** Recursively collect all files under a directory. */
function collectFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

describe("build-agents: file generation", () => {
  it("generates exactly 24 files", () => {
    const files = collectFiles(OUT_DIR);
    expect(files.length).toBe(24);
  });

  it("generates SKILL.md", () => {
    expect(existsSync(join(OUT_DIR, "SKILL.md"))).toBe(true);
  });

  it("generates openai.yaml", () => {
    expect(existsSync(join(OUT_DIR, "agents", "openai.yaml"))).toBe(true);
  });

  it("generates all 12 prompt files", () => {
    const promptDir = join(OUT_DIR, "assets", "prompts");
    const expected = [
      "setup.md",
      "map.md",
      "attack.md",
      "skeptic.md",
      "judge.md",
      "da-protocol.md",
      "hunt-callback-liveness.md",
      "hunt-accounting-entitlement.md",
      "hunt-semantic-consistency.md",
      "hunt-token-oracle-statefulness.md",
      "hunt-economic-differential.md",
      "hunt-adversarial-deep.md",
    ];
    for (const f of expected) {
      expect(existsSync(join(promptDir, f)), `missing prompt: ${f}`).toBe(true);
    }
  });

  it("generates all 5 attack-vector files", () => {
    const dir = join(OUT_DIR, "assets", "attack-vectors");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(5);
  });

  it("generates all 5 hard-negative files", () => {
    const dir = join(OUT_DIR, "assets", "hard-negatives");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(5);
  });
});

describe("build-agents: tool-name transforms", () => {
  it("no mcp__sc-auditor__ references in any output file", () => {
    const files = collectFiles(OUT_DIR);
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const content = readFileSync(f, "utf-8");
      expect(content).not.toContain("mcp__sc-auditor__");
    }
  });

  it("SKILL.md frontmatter uses bare tool names", () => {
    const content = readFileSync(join(OUT_DIR, "SKILL.md"), "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).not.toBeNull();
    const fm = fmMatch![1];
    expect(fm).toContain("run-slither");
    expect(fm).toContain("run-aderyn");
    expect(fm).not.toContain("mcp__sc-auditor__");
  });
});

describe("build-agents: path transforms", () => {
  it("SKILL.md references .agents/ paths, not skills/ paths", () => {
    const content = readFileSync(join(OUT_DIR, "SKILL.md"), "utf-8");
    expect(content).not.toMatch(/`skills\/security-auditor\/assets\/prompts\//);
    expect(content).toMatch(/\.agents\/skills\/security-auditor\/assets\/prompts\//);
  });

  it("SKILL.md da-protocol.md reference uses .agents/ path", () => {
    const content = readFileSync(join(OUT_DIR, "SKILL.md"), "utf-8");
    expect(content).toContain(
      "`.agents/skills/security-auditor/assets/prompts/da-protocol.md`",
    );
  });

  it("attack.md da-protocol reference uses .agents/ path", () => {
    const content = readFileSync(
      join(OUT_DIR, "assets", "prompts", "attack.md"),
      "utf-8",
    );
    expect(content).toMatch(/\.agents\/skills\/security-auditor\/assets\/prompts\/da-protocol\.md/);
  });

  it("skeptic.md da-protocol reference uses .agents/ path", () => {
    const content = readFileSync(
      join(OUT_DIR, "assets", "prompts", "skeptic.md"),
      "utf-8",
    );
    expect(content).toMatch(/\.agents\/skills\/security-auditor\/assets\/prompts\/da-protocol\.md/);
  });

  it("all prompt paths in SKILL.md point to existing files", () => {
    const content = readFileSync(join(OUT_DIR, "SKILL.md"), "utf-8");
    const pathRefs = [
      ...content.matchAll(
        /`(\.agents\/skills\/security-auditor\/assets\/prompts\/[^`]+)`/g,
      ),
    ];
    expect(pathRefs.length).toBeGreaterThan(0);
    for (const [, relPath] of pathRefs) {
      const absPath = join(ROOT, relPath);
      expect(existsSync(absPath), `missing: ${relPath}`).toBe(true);
    }
  });
});

describe("build-agents: verbatim copies", () => {
  it("openai.yaml is identical to source", () => {
    const src = readFileSync(join(SKILLS_DIR, "agents", "openai.yaml"), "utf-8");
    const out = readFileSync(join(OUT_DIR, "agents", "openai.yaml"), "utf-8");
    expect(out).toBe(src);
  });

  it("attack-vector files are identical to source", () => {
    const srcDir = join(SKILLS_DIR, "assets", "attack-vectors");
    const outDir = join(OUT_DIR, "assets", "attack-vectors");
    for (const f of readdirSync(srcDir).filter((f) => f.endsWith(".md"))) {
      const src = readFileSync(join(srcDir, f), "utf-8");
      const out = readFileSync(join(outDir, f), "utf-8");
      expect(out, `attack-vector ${f} differs`).toBe(src);
    }
  });

  it("hard-negative files are identical to source", () => {
    const srcDir = join(SKILLS_DIR, "assets", "hard-negatives");
    const outDir = join(OUT_DIR, "assets", "hard-negatives");
    for (const f of readdirSync(srcDir).filter((f) => f.endsWith(".md"))) {
      const src = readFileSync(join(srcDir, f), "utf-8");
      const out = readFileSync(join(outDir, f), "utf-8");
      expect(out, `hard-negative ${f} differs`).toBe(src);
    }
  });
});
