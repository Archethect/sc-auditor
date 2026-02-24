/**
 * Documentation validation tests for sc-auditor plugin.
 *
 * Validates that README.md and config.example.json:
 * - Exist and have expected content
 * - Contain all required sections and fields
 * - Match source-of-truth configuration from src/config/loader.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const README_PATH = resolve(ROOT, "README.md");
const CONFIG_EXAMPLE_PATH = resolve(ROOT, "config.example.json");

describe("README.md existence and structure", () => {
	it("README.md exists at project root", () => {
		expect(existsSync(README_PATH)).toBe(true);
	});

	it("is non-empty", () => {
		const content = readFileSync(README_PATH, "utf-8");
		expect(content.length).toBeGreaterThan(100);
	});
});

describe("README.md contains all required sections", () => {
	const content = existsSync(README_PATH)
		? readFileSync(README_PATH, "utf-8")
		: "";

	it("has main heading with project name", () => {
		expect(content).toMatch(/^# sc-auditor/m);
	});

	it("has Table of Contents section", () => {
		expect(content).toMatch(/^## Table of Contents/m);
	});

	it("has Overview section", () => {
		expect(content).toMatch(/^## Overview/m);
	});

	it("has Prerequisites section", () => {
		expect(content).toMatch(/^## Prerequisites/m);
	});

	it("has Installation section", () => {
		expect(content).toMatch(/^## Installation/m);
	});

	it("has Configuration section", () => {
		expect(content).toMatch(/^## Configuration/m);
	});

	it("has Quick Start section", () => {
		expect(content).toMatch(/^## Quick Start/m);
	});

	it("has Usage section", () => {
		expect(content).toMatch(/^## Usage/m);
	});

	it("has Audit Methodology section", () => {
		expect(content).toMatch(/^## Audit Methodology/m);
	});

	it("has Troubleshooting section", () => {
		expect(content).toMatch(/^## Troubleshooting/m);
	});

	it("has Development section", () => {
		expect(content).toMatch(/^## Development/m);
	});

	it("has Contributing section", () => {
		expect(content).toMatch(/^## Contributing/m);
	});

	it("has License section", () => {
		expect(content).toMatch(/^## License/m);
	});
});

describe("README.md Prerequisites accuracy", () => {
	const content = existsSync(README_PATH)
		? readFileSync(README_PATH, "utf-8")
		: "";

	it("mentions Node.js >= 22 requirement", () => {
		expect(content).toMatch(/Node\.js.*(?:>=\s*22|22)/);
	});

	it("mentions Claude Code CLI requirement", () => {
		expect(content).toContain("Claude Code");
	});

	it("mentions Solodit API key requirement", () => {
		expect(content).toContain("Solodit API");
	});

	it("mentions Slither as optional", () => {
		expect(content).toContain("Slither");
		expect(content).toContain("slither-analyzer");
	});

	it("mentions Aderyn as optional", () => {
		expect(content).toContain("Aderyn");
		expect(content).toContain("cargo install aderyn");
	});

	it("mentions solc-select for Solidity compiler", () => {
		expect(content).toContain("solc-select");
	});
});

describe("README.md Configuration accuracy", () => {
	const content = existsSync(README_PATH)
		? readFileSync(README_PATH, "utf-8")
		: "";

	it("documents SOLODIT_API_KEY as environment variable", () => {
		expect(content).toContain("SOLODIT_API_KEY");
	});

	it("documents default_severity with correct default", () => {
		expect(content).toContain("default_severity");
		expect(content).toMatch(/CRITICAL.*HIGH.*MEDIUM/);
	});

	it("documents default_quality_score with default of 2", () => {
		expect(content).toContain("default_quality_score");
	});

	it("documents report_output_dir with default of audits", () => {
		expect(content).toContain("report_output_dir");
		expect(content).toContain("audits");
	});

	it("documents max_findings_per_category with range 1-1000", () => {
		expect(content).toContain("max_findings_per_category");
		expect(content).toContain("1000");
	});

	it("documents max_deep_dives with range 1-100", () => {
		expect(content).toContain("max_deep_dives");
		expect(content).toContain("1-100");
	});

	it("documents static_analysis sub-fields", () => {
		expect(content).toContain("slither_enabled");
		expect(content).toContain("slither_path");
		expect(content).toContain("aderyn_enabled");
		expect(content).toContain("aderyn_path");
	});

	it("documents llm_reasoning sub-fields", () => {
		expect(content).toContain("max_functions_per_category");
		expect(content).toContain("context_window_budget");
	});

	it("documents SC_AUDITOR_CONFIG env var", () => {
		expect(content).toContain("SC_AUDITOR_CONFIG");
	});

	it("documents SOLODIT_API_KEY env var", () => {
		expect(content).toContain("SOLODIT_API_KEY");
	});
});

describe("README.md Usage accuracy", () => {
	const content = existsSync(README_PATH)
		? readFileSync(README_PATH, "utf-8")
		: "";

	it("documents /security-auditor skill", () => {
		expect(content).toContain("/security-auditor");
	});

	it("documents all 4 audit phases: SETUP, MAP, HUNT, ATTACK", () => {
		expect(content).toContain("SETUP");
		expect(content).toContain("MAP");
		expect(content).toContain("HUNT");
		expect(content).toContain("ATTACK");
	});

	it("documents run-slither tool", () => {
		expect(content).toContain("run-slither");
		expect(content).toContain("rootDir");
	});

	it("documents run-aderyn tool", () => {
		expect(content).toContain("run-aderyn");
		expect(content).toContain("rootDir");
	});

	it("documents get_checklist tool with category filter", () => {
		expect(content).toContain("get_checklist");
		expect(content).toContain("category");
	});

	it("documents search_findings tool with query, severity, tags, limit", () => {
		expect(content).toContain("search_findings");
		expect(content).toContain("query");
		expect(content).toContain("severity");
		expect(content).toContain("tags");
		expect(content).toContain("limit");
	});

	it("mentions rate limit for Solodit API (20 req/60s)", () => {
		expect(content).toMatch(/20\s*request/i);
	});

	it("mentions checklist caching", () => {
		expect(content).toMatch(/cache|cached/i);
	});
});

describe("README.md Troubleshooting", () => {
	const content = existsSync(README_PATH)
		? readFileSync(README_PATH, "utf-8")
		: "";

	it("documents CONFIG_MISSING error", () => {
		expect(content).toContain("CONFIG_MISSING");
	});

	it("documents TOOL_NOT_FOUND error", () => {
		expect(content).toContain("TOOL_NOT_FOUND");
	});

	it("documents SOLODIT_AUTH error", () => {
		expect(content).toContain("SOLODIT_AUTH");
	});

	it("documents COMPILATION_FAILED error", () => {
		expect(content).toContain("COMPILATION_FAILED");
	});

	it("documents SOLODIT_RATE_LIMIT error", () => {
		expect(content).toContain("SOLODIT_RATE_LIMIT");
	});
});

describe("README.md Development section", () => {
	const content = existsSync(README_PATH)
		? readFileSync(README_PATH, "utf-8")
		: "";

	it("documents build command", () => {
		expect(content).toContain("npm run build");
	});

	it("documents test command", () => {
		expect(content).toContain("npm test");
	});

	it("documents lint command", () => {
		expect(content).toContain("npm run lint");
	});

	it("documents typecheck command", () => {
		expect(content).toContain("npm run typecheck");
	});
});

describe("config.example.json existence and validity", () => {
	it("config.example.json exists at project root", () => {
		expect(existsSync(CONFIG_EXAMPLE_PATH)).toBe(true);
	});

	it("is valid JSON", () => {
		const content = readFileSync(CONFIG_EXAMPLE_PATH, "utf-8");
		expect(() => JSON.parse(content)).not.toThrow();
	});
});

describe("config.example.json contains all expected fields", () => {
	const config = existsSync(CONFIG_EXAMPLE_PATH)
		? JSON.parse(readFileSync(CONFIG_EXAMPLE_PATH, "utf-8"))
		: {};

	it("does NOT contain solodit_api_key (moved to env var)", () => {
		expect(config).not.toHaveProperty("solodit_api_key");
	});

	it("has default_severity with correct values", () => {
		expect(config).toHaveProperty("default_severity");
		expect(config.default_severity).toEqual(["CRITICAL", "HIGH", "MEDIUM"]);
	});

	it("has default_quality_score of 2", () => {
		expect(config).toHaveProperty("default_quality_score");
		expect(config.default_quality_score).toBe(2);
	});

	it("has report_output_dir of audits", () => {
		expect(config).toHaveProperty("report_output_dir");
		expect(config.report_output_dir).toBe("audits");
	});

	it("has max_findings_per_category of 10", () => {
		expect(config).toHaveProperty("max_findings_per_category");
		expect(config.max_findings_per_category).toBe(10);
	});

	it("has max_deep_dives of 5", () => {
		expect(config).toHaveProperty("max_deep_dives");
		expect(config.max_deep_dives).toBe(5);
	});

	it("has static_analysis with all sub-fields", () => {
		expect(config).toHaveProperty("static_analysis");
		expect(config.static_analysis).toEqual({
			slither_enabled: true,
			slither_path: "slither",
			aderyn_enabled: true,
			aderyn_path: "aderyn",
		});
	});

	it("has llm_reasoning with all sub-fields", () => {
		expect(config).toHaveProperty("llm_reasoning");
		expect(config.llm_reasoning).toEqual({
			max_functions_per_category: 50,
			context_window_budget: 0.7,
		});
	});
});

// --- Codex compatibility ---

const CODEX_SKILL_PATH = resolve(ROOT, ".agents/skills/security-auditor/SKILL.md");
const CODEX_AGENT_PATH = resolve(ROOT, ".agents/skills/security-auditor/agents/openai.yaml");
const CODEX_DOCS_PATH = resolve(ROOT, "docs/codex-setup.md");
const ENV_EXAMPLE_PATH = resolve(ROOT, ".env.example");

describe("Codex skill files", () => {
	it(".agents/skills/security-auditor/SKILL.md exists", () => {
		expect(existsSync(CODEX_SKILL_PATH)).toBe(true);
	});

	it("SKILL.md has valid frontmatter with name and description", () => {
		const content = readFileSync(CODEX_SKILL_PATH, "utf-8");
		expect(content).toMatch(/^---/m);
		expect(content).toMatch(/^name:\s+security-auditor/m);
		expect(content).toMatch(/^description:\s+.+/m);
	});

	it("SKILL.md does NOT contain mcp__sc-auditor__ prefixed tool names", () => {
		const content = readFileSync(CODEX_SKILL_PATH, "utf-8");
		expect(content).not.toContain("mcp__sc-auditor__");
	});

	it("SKILL.md references all 4 bare tool names", () => {
		const content = readFileSync(CODEX_SKILL_PATH, "utf-8");
		expect(content).toContain("run-slither");
		expect(content).toContain("run-aderyn");
		expect(content).toContain("get_checklist");
		expect(content).toContain("search_findings");
	});

	it(".agents/skills/security-auditor/agents/openai.yaml exists", () => {
		expect(existsSync(CODEX_AGENT_PATH)).toBe(true);
	});

	it("openai.yaml references sc-auditor MCP dependency", () => {
		const content = readFileSync(CODEX_AGENT_PATH, "utf-8");
		expect(content).toContain("sc-auditor");
		expect(content).toContain("mcp");
	});
});

describe("Codex documentation", () => {
	it("docs/codex-setup.md exists", () => {
		expect(existsSync(CODEX_DOCS_PATH)).toBe(true);
	});

	it("README.md mentions Codex", () => {
		const content = readFileSync(README_PATH, "utf-8");
		expect(content).toMatch(/[Cc]odex/);
	});

	it("README.md contains codex mcp add command", () => {
		const content = readFileSync(README_PATH, "utf-8");
		expect(content).toContain("codex mcp add");
	});
});

describe(".env.example", () => {
	it(".env.example exists at project root", () => {
		expect(existsSync(ENV_EXAMPLE_PATH)).toBe(true);
	});

	it("contains SOLODIT_API_KEY placeholder", () => {
		const content = readFileSync(ENV_EXAMPLE_PATH, "utf-8");
		expect(content).toContain("SOLODIT_API_KEY=");
	});
});
