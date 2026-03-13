#!/usr/bin/env node

/**
 * Build script that generates .agents/ from skills/ (single source of truth).
 *
 * Transformations applied to .md files:
 *   1. Strip `mcp__sc-auditor__` tool prefix (Codex uses bare names)
 *   2. Rewrite `skills/security-auditor/assets/prompts/` path refs to
 *      `.agents/skills/security-auditor/assets/prompts/`
 *   3. Rewrite standalone `assets/prompts/da-protocol.md` ref in SKILL.md
 *      to `.agents/skills/security-auditor/assets/prompts/da-protocol.md`
 *
 * Usage: node scripts/build-agents.mjs
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SKILLS_DIR = join(ROOT, "skills", "security-auditor");
const OUT_DIR = join(ROOT, ".agents", "skills", "security-auditor");

const TOOL_PREFIX = "mcp__sc-auditor__";
const SKILLS_PROMPT_PATH = "skills/security-auditor/assets/prompts/";
const AGENTS_PROMPT_PATH = ".agents/skills/security-auditor/assets/prompts/";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a file as UTF-8. */
function read(path) {
  return readFileSync(path, "utf-8");
}

/** Apply all text transformations to a markdown file. */
function transformMd(content, { isSkillMd = false } = {}) {
  let out = content;

  // 1. Strip mcp__sc-auditor__ prefix everywhere
  out = out.replaceAll(TOOL_PREFIX, "");

  // 2. Rewrite skills/security-auditor/assets/prompts/ → .agents/...
  out = out.replaceAll(SKILLS_PROMPT_PATH, AGENTS_PROMPT_PATH);

  // 3. SKILL.md-only: standalone `assets/prompts/da-protocol.md` ref
  //    (appears in Core Protocols section, not prefixed with skills/...)
  if (isSkillMd) {
    out = out.replace(
      /`assets\/prompts\/da-protocol\.md`/g,
      "`.agents/skills/security-auditor/assets/prompts/da-protocol.md`",
    );
  }

  return out;
}

/** Add Codex orchestrator enforcement preamble to SKILL.md output (after frontmatter). */
function addCodexPreamble(content) {
  const preamble = `\n<!-- CODEX ORCHESTRATOR ENFORCEMENT
When dispatching sub-agents via fork_context:
- Forward ONLY: prompt file path + JSON inputs + expected output schema
- DO NOT forward conversation history, audit intent, or full context
- Validate sub-agent output as JSON before proceeding
- STOP at user gates (after MAP and HUNT) - do not auto-advance
- If sub-agent fails: retry once, then STOP and ask user
-->
`;
  // Insert after the closing --- of YAML frontmatter
  const fmEnd = content.indexOf("\n---\n");
  if (fmEnd === -1) return preamble + content;
  const insertAt = fmEnd + 4; // after "\n---\n"
  return content.slice(0, insertAt) + preamble + content.slice(insertAt);
}

/** List .md files in a directory (non-recursive). */
function listMdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md"));
}

/** Copy all .md files from src to dest verbatim. */
function copyVerbatim(srcDir, destDir) {
  if (!existsSync(srcDir)) return 0;
  mkdirSync(destDir, { recursive: true });
  const files = listMdFiles(srcDir);
  for (const f of files) {
    cpSync(join(srcDir, f), join(destDir, f));
  }
  return files.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function build() {
  // 1. Clean output
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const stats = { transformed: 0, copied: 0 };

  // 2. Copy + transform SKILL.md
  const skillSrc = join(SKILLS_DIR, "SKILL.md");
  if (!existsSync(skillSrc)) {
    throw new Error(`Source SKILL.md not found: ${skillSrc}`);
  }
  writeFileSync(join(OUT_DIR, "SKILL.md"), addCodexPreamble(transformMd(read(skillSrc), { isSkillMd: true })));
  stats.transformed++;

  // 3. Copy + transform prompt files
  const promptsSrc = join(SKILLS_DIR, "assets", "prompts");
  const promptsDest = join(OUT_DIR, "assets", "prompts");
  mkdirSync(promptsDest, { recursive: true });
  for (const f of listMdFiles(promptsSrc)) {
    const content = read(join(promptsSrc, f));
    writeFileSync(join(promptsDest, f), transformMd(content));
    stats.transformed++;
  }

  // 4. Copy verbatim: attack-vectors, hard-negatives
  stats.copied += copyVerbatim(
    join(SKILLS_DIR, "assets", "attack-vectors"),
    join(OUT_DIR, "assets", "attack-vectors"),
  );
  stats.copied += copyVerbatim(
    join(SKILLS_DIR, "assets", "hard-negatives"),
    join(OUT_DIR, "assets", "hard-negatives"),
  );

  // 5. Copy openai.yaml
  const yamlSrc = join(SKILLS_DIR, "agents", "openai.yaml");
  if (existsSync(yamlSrc)) {
    const yamlDest = join(OUT_DIR, "agents");
    mkdirSync(yamlDest, { recursive: true });
    cpSync(yamlSrc, join(yamlDest, "openai.yaml"));
    stats.copied++;
  }

  // 6. Validate: no mcp__sc-auditor__ references remain
  const errors = [];
  validateDir(OUT_DIR, errors);

  if (errors.length > 0) {
    throw new Error(
      `Validation failed — mcp__sc-auditor__ references found:\n${errors.join("\n")}`,
    );
  }

  // 7. Validate: all prompt paths in SKILL.md point to existing files
  const skillOut = read(join(OUT_DIR, "SKILL.md"));
  const pathRefs = [
    ...skillOut.matchAll(/`(\.agents\/skills\/security-auditor\/assets\/prompts\/[^`]+)`/g),
  ];
  for (const [, relPath] of pathRefs) {
    const absPath = join(ROOT, relPath);
    if (!existsSync(absPath)) {
      errors.push(`Referenced path does not exist: ${relPath}`);
    }
  }

  // Validate NON-NEGOTIABLE RULES section exists
  if (!skillOut.includes("## NON-NEGOTIABLE RULES")) {
    errors.push("SKILL.md missing NON-NEGOTIABLE RULES section");
  }

  // Validate USER GATE markers exist
  const gateCount = (skillOut.match(/USER GATE \(BLOCKING\)/g) || []).length;
  if (gateCount < 2) {
    errors.push(`Expected 2 USER GATE markers, found ${gateCount}`);
  }

  // Validate Scope Constraint in all prompt files
  for (const f of listMdFiles(promptsDest)) {
    const content = read(join(promptsDest, f));
    if (!content.includes("## Scope Constraint")) {
      errors.push(`${f} missing Scope Constraint section`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Path validation failed:\n${errors.join("\n")}`);
  }

  const total = stats.transformed + stats.copied;
  console.log(
    `build-agents: ${total} files generated (${stats.transformed} transformed, ${stats.copied} copied)`,
  );
}

/** Recursively scan directory for leftover mcp__sc-auditor__ references. */
function validateDir(dir, errors) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      validateDir(full, errors);
    } else if (entry.name.endsWith(".md")) {
      const content = read(full);
      if (content.includes(TOOL_PREFIX)) {
        errors.push(`${full}: still contains ${TOOL_PREFIX}`);
      }
    }
  }
}

build();
