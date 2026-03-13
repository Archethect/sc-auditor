/**
 * Integration smoke tests for sc-auditor MCP server.
 *
 * Manual Smoke Test:
 * 1. Start the MCP server: npx tsx src/mcp/main.ts
 * 2. Connect with an MCP client (e.g., Claude Desktop, mcp-cli)
 * 3. List tools — verify 8 tools: run-slither, run-aderyn, get_checklist, search_findings, generate-foundry-poc, run-echidna, run-medusa, run-halmos
 * 4. Call get_checklist {} — verify checklist items returned
 * 5. Call run-slither { rootDir: "tests/fixtures/solidity" } — verify findings (needs slither)
 * 6. Call run-aderyn { rootDir: "tests/fixtures/solidity" } — verify findings (needs aderyn)
 * 7. Call search_findings { query: "reentrancy" } — verify results (needs API key + network)
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import yaml from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMcpServer } from "../../src/mcp/server.js";
import { parseAderynOutput } from "../../src/mcp/tools/aderyn-parser.js";
import { registerGetChecklistTool } from "../../src/mcp/tools/get-checklist.js";
import { registerRunAderynTool } from "../../src/mcp/tools/run-aderyn.js";
import { registerRunSlitherTool } from "../../src/mcp/tools/run-slither.js";
import { registerSearchFindingsTool } from "../../src/mcp/tools/search-findings.js";
import { registerGenerateFoundryPocTool } from "../../src/mcp/tools/generate-foundry-poc.js";
import { registerRunEchidnaTool } from "../../src/mcp/tools/run-echidna.js";
import { registerRunMedusaTool } from "../../src/mcp/tools/run-medusa.js";
import { registerRunHalmosTool } from "../../src/mcp/tools/run-halmos.js";
import { parseSlitherOutput } from "../../src/mcp/tools/slither-parser.js";
import { fetchChecklist } from "../../src/mcp/services/checklist.js";

const SIMPLE_VAULT_PATH = resolve(import.meta.dirname, "../fixtures/solidity/SimpleVault.sol");
const SLITHER_FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/slither-simplevault.json");
const ADERYN_FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/aderyn-simplevault.json");
const SKILL_PATH = resolve(import.meta.dirname, "../../skills/security-auditor/SKILL.md");
const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures/solidity");

function isToolAvailable(tool: string): boolean {
	try {
		execFileSync("which", [tool], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

async function setupMcpTest(): Promise<{
	tools: Tool[];
	callTool: (name: string, args: Record<string, unknown>) => Promise<{ content: unknown[]; isError?: boolean }>;
	cleanup: () => Promise<void>;
}> {
	const server = createMcpServer();
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	registerRunSlitherTool(server);
	registerRunAderynTool(server);
	registerGetChecklistTool(server);
	registerSearchFindingsTool(server);
	registerGenerateFoundryPocTool(server);
	registerRunEchidnaTool(server);
	registerRunMedusaTool(server);
	registerRunHalmosTool(server);
	const client = new Client({ name: "test-client", version: "0.0.1" });

	await server.connect(serverTransport);
	await client.connect(clientTransport);

	return {
		tools: (await client.listTools()).tools,
		callTool: async (name: string, args: Record<string, unknown>) => {
			const result = await client.callTool({ name, arguments: args });
			return result as { content: unknown[]; isError?: boolean };
		},
		cleanup: async () => {
			await client.close();
			await server.close();
		},
	};
}

function extractFrontmatter(content: string): Record<string, unknown> {
	const parts = content.split("---");
	if (parts.length < 3) throw new Error("No YAML frontmatter found");
	return yaml.load(parts[1]) as Record<string, unknown>;
}

const SIMPLE_VAULT_CONTENT = readFileSync(SIMPLE_VAULT_PATH, "utf-8");

const slitherAvailable = isToolAvailable("slither");
const aderynAvailable = isToolAvailable("aderyn");
const slitherFixtureExists = existsSync(SLITHER_FIXTURE_PATH);
const aderynFixtureExists = existsSync(ADERYN_FIXTURE_PATH);

describe("AC1: SimpleVault.sol exists with 3+ intentional vulnerabilities", () => {
	it("SimpleVault.sol exists at tests/fixtures/solidity/", () => {
		expect(existsSync(SIMPLE_VAULT_PATH)).toBe(true);
	});

	it("contains reentrancy, zero-address, and unchecked return vulnerabilities", () => {
		expect(SIMPLE_VAULT_CONTENT).toContain("msg.sender.call{value:");
		expect(SIMPLE_VAULT_CONTENT).toContain("balances[msg.sender] -= amount");
		expect(SIMPLE_VAULT_CONTENT.toLowerCase()).toContain("zero-address");
		expect(SIMPLE_VAULT_CONTENT.toLowerCase()).toContain("unchecked return");
	});
});

describe("AC2: SimpleVault.sol is < 50 lines, pragma solidity ^0.8.0, no external dependencies", () => {
	it("is fewer than 50 lines", () => {
		const lineCount = SIMPLE_VAULT_CONTENT.split("\n").length;
		expect(lineCount).toBeLessThan(50);
	});

	it("uses pragma solidity ^0.8.0 with no external imports", () => {
		expect(SIMPLE_VAULT_CONTENT).toContain("pragma solidity ^0.8.0");
		expect(SIMPLE_VAULT_CONTENT).not.toMatch(/^import\s/m);
	});
});

describe("AC3: MCP server boots cleanly via InMemoryTransport", () => {
	it("boots without errors and connects client", async () => {
		const { tools, cleanup } = await setupMcpTest();
		try {
			expect(tools).toBeDefined();
			expect(Array.isArray(tools)).toBe(true);
		} finally {
			await cleanup();
		}
	});
});

describe("AC4: client.listTools() returns all 8 tools", () => {
	let tools: Tool[];
	let cleanup: () => Promise<void>;

	beforeAll(async () => {
		const ctx = await setupMcpTest();
		tools = ctx.tools;
		cleanup = ctx.cleanup;
	});

	afterAll(async () => {
		await cleanup();
	});

	it("returns exactly 8 tools", () => {
		expect(tools).toHaveLength(8);
	});

	it("includes run-slither, run-aderyn, get_checklist, search_findings, generate-foundry-poc, run-echidna, run-medusa, run-halmos", () => {
		const names = tools.map((t) => t.name).sort();
		expect(names).toEqual([
			"generate-foundry-poc",
			"get_checklist",
			"run-aderyn",
			"run-echidna",
			"run-halmos",
			"run-medusa",
			"run-slither",
			"search_findings",
		]);
	});
});

describe("AC5: Parsers work on pre-recorded tool output", () => {
	describe.skipIf(!slitherFixtureExists)("Slither parser", () => {
		it("parses pre-recorded Slither output from SimpleVault fixture", () => {
			const raw = JSON.parse(readFileSync(SLITHER_FIXTURE_PATH, "utf-8"));
			const findings = parseSlitherOutput(raw);
			expect(findings.length).toBeGreaterThan(0);
			for (const f of findings) {
				expect(f.title).toBeDefined();
				expect(f.severity).toBeDefined();
				expect(f.source).toBe("slither");
				expect(f.evidence_sources).toHaveLength(1);
				expect(f.evidence_sources[0].tool).toBe("slither");
			}
		});
	});

	describe.skipIf(!aderynFixtureExists)("Aderyn parser", () => {
		it("parses pre-recorded Aderyn output from SimpleVault fixture", () => {
			const raw = JSON.parse(readFileSync(ADERYN_FIXTURE_PATH, "utf-8"));
			const findings = parseAderynOutput(raw);
			expect(findings.length).toBeGreaterThan(0);
			for (const f of findings) {
				expect(f.title).toBeDefined();
				expect(f.severity).toBeDefined();
				expect(f.source).toBe("aderyn");
				expect(f.evidence_sources).toHaveLength(1);
				expect(f.evidence_sources[0].tool).toBe("aderyn");
			}
		});
	});
});

describe.skipIf(!process.env.RUN_NETWORK_TESTS)("AC6: Cyfrin checklist fetch + flatten", () => {
	let items: Awaited<ReturnType<typeof fetchChecklist>>;

	beforeAll(async () => {
		items = await fetchChecklist();
	}, 30000);

	it("fetches real Cyfrin checklist and returns non-empty array", () => {
		expect(items.length).toBeGreaterThan(0);
	});

	it("flattened items have required ChecklistItem fields", () => {
		const item = items[0];
		expect(item.id).toBeTypeOf("string");
		expect(item.category).toBeTypeOf("string");
		expect(item.question).toBeTypeOf("string");
		expect(item.description).toBeTypeOf("string");
		expect(item.remediation).toBeTypeOf("string");
		expect(Array.isArray(item.references)).toBe(true);
		expect(Array.isArray(item.tags)).toBe(true);
	});
});

describe("AC7: Skill file existence + YAML frontmatter", () => {
	it("skill file exists at skills/security-auditor/SKILL.md", () => {
		expect(existsSync(SKILL_PATH)).toBe(true);
	});

	it("YAML frontmatter parses and references MCP tools", () => {
		const content = readFileSync(SKILL_PATH, "utf-8");
		const frontmatter = extractFrontmatter(content);
		expect(frontmatter.name).toBe("security-auditor");
		expect(frontmatter.description).toBeTypeOf("string");
		const tools = frontmatter["allowed-tools"] as string[];
		expect(tools).toContain("mcp__sc-auditor__run-slither");
		expect(tools).toContain("mcp__sc-auditor__run-aderyn");
		expect(tools).toContain("mcp__sc-auditor__get_checklist");
		expect(tools).toContain("mcp__sc-auditor__search_findings");
	});
});

describe.skipIf(!slitherAvailable)("AC8: Live Slither on SimpleVault", () => {
	it("runs Slither on SimpleVault.sol and returns findings", { timeout: 60000 }, async () => {
		const { callTool, cleanup } = await setupMcpTest();
		try {
			const result = await callTool("run-slither", { rootDir: FIXTURES_DIR });
			expect(result.isError).toBeFalsy();
			const textContent = result.content[0] as { type: string; text: string };
			const parsed = JSON.parse(textContent.text);
			expect(parsed.success).toBe(true);
			expect(parsed.findings.length).toBeGreaterThan(0);
			const reentrancy = parsed.findings.find((f: { title: string }) => f.title.includes("reentrancy"));
			expect(reentrancy).toBeDefined();
		} finally {
			await cleanup();
		}
	});
});

describe.skipIf(!aderynAvailable)("AC8: Live Aderyn on SimpleVault", () => {
	it("runs Aderyn on SimpleVault.sol and returns findings", { timeout: 60000 }, async () => {
		const { callTool, cleanup } = await setupMcpTest();
		try {
			const result = await callTool("run-aderyn", { rootDir: FIXTURES_DIR });
			expect(result.isError).toBeFalsy();
			const textContent = result.content[0] as { type: string; text: string };
			const parsed = JSON.parse(textContent.text);
			expect(parsed.findings.length).toBeGreaterThan(0);
		} finally {
			await cleanup();
		}
	});
});
