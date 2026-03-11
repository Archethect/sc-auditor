/**
 * Tests for generate-foundry-poc MCP tool.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../../server.js";
import { generateFoundryPoc, registerGenerateFoundryPocTool } from "../generate-foundry-poc.js";

const SAMPLE_HOTSPOT = {
  id: "HS-001",
  lane: "callback_liveness",
  title: "Reentrancy in Vault.withdraw",
  affected_files: ["contracts/Vault.sol"],
  affected_functions: ["Vault.withdraw"],
  candidate_attack_sequence: [
    "1. Call Vault.withdraw with large amount",
    "2. Receive callback before state update",
    "3. Re-enter withdraw to drain funds",
  ],
  root_cause_hypothesis: "State write after external call enables reentrancy",
};

/**
 * Creates and connects an MCP client/server pair for testing.
 */
async function setupMcpTest(): Promise<{
  tools: Tool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ content: unknown[]; isError?: boolean }>;
  cleanup: () => Promise<void>;
}> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  registerGenerateFoundryPocTool(server);
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

describe("generate-foundry-poc tool registration", () => {
  it("registers on the MCP server", async () => {
    const { tools, cleanup } = await setupMcpTest();
    try {
      const tool = tools.find((t) => t.name === "generate-foundry-poc");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Foundry");
    } finally {
      await cleanup();
    }
  });

  it("has required input schema with rootDir and hotspot parameters", async () => {
    const { tools, cleanup } = await setupMcpTest();
    try {
      const tool = tools.find((t) => t.name === "generate-foundry-poc");
      const schema = tool?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties?.rootDir).toBeDefined();
      expect(schema.properties?.hotspot).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("generateFoundryPoc", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "foundry-poc-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a scaffold file in the work directory on happy path", () => {
    const result = generateFoundryPoc(tempDir, SAMPLE_HOTSPOT);

    expect(result.success).toBe(true);
    expect(result.proof_type).toBe("foundry_poc");
    expect(result.witness_path).toBeDefined();
    expect(result.scaffold_metadata).toBeDefined();

    // Verify file was actually created
    expect(fs.existsSync(result.witness_path!)).toBe(true);

    // Verify it's in the work directory
    const workDir = path.join(tempDir, ".sc-auditor-work", "pocs");
    expect(result.witness_path!.startsWith(workDir)).toBe(true);
  });

  it("returns error for invalid rootDir", () => {
    const result = generateFoundryPoc("/nonexistent/path", SAMPLE_HOTSPOT);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: INVALID_PATH");
    expect(result.proof_type).toBe("foundry_poc");
  });

  it("never writes outside the work directory", () => {
    const result = generateFoundryPoc(tempDir, SAMPLE_HOTSPOT);

    expect(result.success).toBe(true);
    const workDir = path.join(tempDir, ".sc-auditor-work");
    expect(result.witness_path!.startsWith(workDir)).toBe(true);

    // Verify no other files were created in rootDir
    const rootContents = fs.readdirSync(tempDir);
    expect(rootContents).toEqual([".sc-auditor-work"]);
  });

  it("generates syntactically valid Solidity (basic structure check)", () => {
    const result = generateFoundryPoc(tempDir, SAMPLE_HOTSPOT);
    const content = fs.readFileSync(result.witness_path!, "utf-8");

    expect(content).toContain("// SPDX-License-Identifier: MIT");
    expect(content).toContain("pragma solidity ^0.8.0;");
    expect(content).toContain("import \"forge-std/Test.sol\";");
    expect(content).toContain("contract Test_HS_001 is Test {");
    expect(content).toContain("function setUp() public {");
    expect(content).toContain("function test_exploit_HS_001() public {");
  });

  it("includes attack sequence steps as comments", () => {
    const result = generateFoundryPoc(tempDir, SAMPLE_HOTSPOT);
    const content = fs.readFileSync(result.witness_path!, "utf-8");

    for (const step of SAMPLE_HOTSPOT.candidate_attack_sequence) {
      expect(content).toContain(`// ${step}`);
    }
  });

  it("includes root cause hypothesis in docstring", () => {
    const result = generateFoundryPoc(tempDir, SAMPLE_HOTSPOT);
    const content = fs.readFileSync(result.witness_path!, "utf-8");

    expect(content).toContain(SAMPLE_HOTSPOT.root_cause_hypothesis);
  });

  it("includes correct scaffold metadata", () => {
    const result = generateFoundryPoc(tempDir, SAMPLE_HOTSPOT);

    expect(result.scaffold_metadata?.target_contracts).toEqual(["Vault"]);
    expect(result.scaffold_metadata?.attack_steps).toEqual(SAMPLE_HOTSPOT.candidate_attack_sequence);
    expect(result.scaffold_metadata?.setup_imports).toHaveLength(1);
    expect(result.scaffold_metadata?.setup_imports[0]).toContain("Vault");
  });

  it("handles hotspot with multiple affected files", () => {
    const multiFileHotspot = {
      ...SAMPLE_HOTSPOT,
      id: "HS-002",
      affected_files: ["contracts/Vault.sol", "contracts/Token.sol"],
    };

    const result = generateFoundryPoc(tempDir, multiFileHotspot);
    const content = fs.readFileSync(result.witness_path!, "utf-8");

    expect(result.success).toBe(true);
    expect(content).toContain("Vault");
    expect(content).toContain("Token");
    expect(result.scaffold_metadata?.target_contracts).toEqual(["Vault", "Token"]);
  });
});

describe("Integration: generate-foundry-poc tool end-to-end", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "foundry-poc-e2e-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns scaffold through MCP tool handler", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("generate-foundry-poc", {
        rootDir: tempDir,
        hotspot: SAMPLE_HOTSPOT,
      });

      expect(result.isError).toBeFalsy();
      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(parsed.proof_type).toBe("foundry_poc");
      expect(parsed.witness_path).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("returns error for invalid rootDir through MCP", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("generate-foundry-poc", {
        rootDir: "/nonexistent/path",
        hotspot: SAMPLE_HOTSPOT,
      });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("ERROR: INVALID_PATH");
    } finally {
      await cleanup();
    }
  });
});
