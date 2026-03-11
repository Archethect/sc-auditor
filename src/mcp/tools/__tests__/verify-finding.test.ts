/**
 * Tests for verify-finding MCP tool.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../../server.js";
import { generateFindingId, registerVerifyFindingTool, verifyFinding } from "../verify-finding.js";

const SAMPLE_FINDING = {
  title: "Reentrancy in Vault.withdraw",
  severity: "HIGH" as const,
  confidence: "Confirmed" as const,
  source: "manual" as const,
  category: "Reentrancy",
  affected_files: ["contracts/Vault.sol"],
  affected_lines: { start: 42, end: 58 },
  description: "External call before state update allows reentrancy",
  evidence_sources: [
    { type: "static_analysis" as const, tool: "slither", detector_id: "reentrancy-eth" },
  ],
};

const SAMPLE_SYSTEM_MAP = {
  components: [{ name: "Vault", files: ["contracts/Vault.sol"], role: "Main vault", risk_level: "High" }],
  protocol_invariants: [{ id: "INV-1", description: "total supply equals sum of balances", scope: "system", related_contracts: ["Vault"], related_variables: ["totalSupply"] }],
  auth_surfaces: [{ contract: "Vault", function_name: "setFee", modifier: "onlyOwner", role: "owner" }],
};

let tempDir: string;

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
  registerVerifyFindingTool(server);
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

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-finding-test-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("AC1: Tool registered with correct schema", () => {
  it("registers verify-finding tool on the server", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const tool = tools.find((t) => t.name === "verify-finding");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Verify");
    } finally {
      await cleanup();
    }
  });

  it("has required input schema parameters", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const tool = tools.find((t) => t.name === "verify-finding");
      const schema = tool?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties?.rootDir).toBeDefined();
      expect(schema.properties?.finding).toBeDefined();
      expect(schema.properties?.systemMap).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("AC2: Happy path returns VerificationArtifact", () => {
  it("returns valid VerificationArtifact for valid input", () => {
    const result = verifyFinding({
      rootDir: tempDir,
      finding: SAMPLE_FINDING,
      systemMap: SAMPLE_SYSTEM_MAP,
    });

    expect(result.finding_id).toBeDefined();
    expect(result.finding_id).toHaveLength(16);
    expect(result.skeptic_verdict).toBeDefined();
    expect(result.judge_verdict).toBeDefined();
    expect(result.proof_type).toBe("none");
    expect(result.verification_notes).toBeDefined();
    expect(typeof result.benchmark_mode_visible).toBe("boolean");
  });

  it("generates deterministic finding_id from title + affected_files", () => {
    const id1 = generateFindingId("Reentrancy", ["a.sol", "b.sol"]);
    const id2 = generateFindingId("Reentrancy", ["b.sol", "a.sol"]);
    expect(id1).toBe(id2);

    const id3 = generateFindingId("Different", ["a.sol", "b.sol"]);
    expect(id3).not.toBe(id1);
  });

  it("returns artifact through MCP tool handler", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("verify-finding", {
        rootDir: tempDir,
        finding: SAMPLE_FINDING,
        systemMap: SAMPLE_SYSTEM_MAP,
      });

      expect(result.isError).toBeFalsy();
      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact).toBeDefined();
      expect(parsed.artifact.finding_id).toBeDefined();
      expect(parsed.artifact.skeptic_verdict).toBeDefined();
      expect(parsed.artifact.judge_verdict).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("AC3: Benchmark gating", () => {
  it("hides HIGH finding without proof in benchmark mode", () => {
    const originalEnv = process.env["SC_AUDITOR_CONFIG"];
    const configPath = path.join(tempDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      workflow: { mode: "benchmark" },
      verify: { demote_unproven_medium_high: true },
    }));
    process.env["SC_AUDITOR_CONFIG"] = configPath;

    try {
      const result = verifyFinding({
        rootDir: tempDir,
        finding: { ...SAMPLE_FINDING, severity: "HIGH", proof_type: "none" },
        systemMap: SAMPLE_SYSTEM_MAP,
      });

      expect(result.benchmark_mode_visible).toBe(false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env["SC_AUDITOR_CONFIG"];
      } else {
        process.env["SC_AUDITOR_CONFIG"] = originalEnv;
      }
    }
  });

  it("hides MEDIUM finding without proof in benchmark mode", () => {
    const originalEnv = process.env["SC_AUDITOR_CONFIG"];
    const configPath = path.join(tempDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      workflow: { mode: "benchmark" },
      verify: { demote_unproven_medium_high: true },
    }));
    process.env["SC_AUDITOR_CONFIG"] = configPath;

    try {
      const result = verifyFinding({
        rootDir: tempDir,
        finding: { ...SAMPLE_FINDING, severity: "MEDIUM", proof_type: "none" },
        systemMap: SAMPLE_SYSTEM_MAP,
      });

      expect(result.benchmark_mode_visible).toBe(false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env["SC_AUDITOR_CONFIG"];
      } else {
        process.env["SC_AUDITOR_CONFIG"] = originalEnv;
      }
    }
  });

  it("shows HIGH finding with proof in benchmark mode", () => {
    const originalEnv = process.env["SC_AUDITOR_CONFIG"];
    const configPath = path.join(tempDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      workflow: { mode: "benchmark" },
      verify: { demote_unproven_medium_high: true },
    }));
    process.env["SC_AUDITOR_CONFIG"] = configPath;

    try {
      const result = verifyFinding({
        rootDir: tempDir,
        finding: { ...SAMPLE_FINDING, severity: "HIGH", proof_type: "foundry_poc", status: "verified" },
        systemMap: SAMPLE_SYSTEM_MAP,
      });

      expect(result.benchmark_mode_visible).toBe(true);
    } finally {
      if (originalEnv === undefined) {
        delete process.env["SC_AUDITOR_CONFIG"];
      } else {
        process.env["SC_AUDITOR_CONFIG"] = originalEnv;
      }
    }
  });

  it("shows HIGH finding without proof in non-benchmark mode", () => {
    const originalEnv = process.env["SC_AUDITOR_CONFIG"];
    const configPath = path.join(tempDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      workflow: { mode: "default" },
    }));
    process.env["SC_AUDITOR_CONFIG"] = configPath;

    try {
      const result = verifyFinding({
        rootDir: tempDir,
        finding: { ...SAMPLE_FINDING, severity: "HIGH", proof_type: "none" },
        systemMap: SAMPLE_SYSTEM_MAP,
      });

      expect(result.benchmark_mode_visible).toBe(true);
    } finally {
      if (originalEnv === undefined) {
        delete process.env["SC_AUDITOR_CONFIG"];
      } else {
        process.env["SC_AUDITOR_CONFIG"] = originalEnv;
      }
    }
  });
});

describe("AC4: Verified finding with proof stays verified", () => {
  it("preserves verified status when proof is present", () => {
    const result = verifyFinding({
      rootDir: tempDir,
      finding: {
        ...SAMPLE_FINDING,
        status: "verified",
        proof_type: "foundry_poc",
        witness_path: "test/poc/Reentrancy.t.sol",
      },
      systemMap: SAMPLE_SYSTEM_MAP,
    });

    expect(result.judge_verdict).toBe("verified");
    expect(result.proof_type).toBe("foundry_poc");
    expect(result.witness_path).toBe("test/poc/Reentrancy.t.sol");
  });
});

describe("AC5: Failure path returns error", () => {
  it("returns error for invalid rootDir through MCP", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("verify-finding", {
        rootDir: "/nonexistent/path",
        finding: SAMPLE_FINDING,
        systemMap: SAMPLE_SYSTEM_MAP,
      });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("ERROR: INVALID_ROOT");
    } finally {
      await cleanup();
    }
  });
});

describe("AC6: Skeptic analysis logic", () => {
  it("refutes finding when auth surfaces and invariants cover it", () => {
    const finding = {
      ...SAMPLE_FINDING,
      category: "Access Control",
      description: "total supply equals sum of balances vulnerability",
    };

    const systemMap = {
      components: [],
      protocol_invariants: [
        { id: "INV-1", description: "total supply equals sum of balances", scope: "system", related_contracts: [], related_variables: [] },
      ],
      auth_surfaces: [
        { contract: "Vault", function_name: "withdraw", modifier: "onlyOwner", role: "owner" },
      ],
    };

    const result = verifyFinding({
      rootDir: tempDir,
      finding,
      systemMap,
    });

    expect(result.skeptic_verdict).toBe("refuted");
    expect(result.judge_verdict).toBe("discarded");
  });

  it("returns plausible for low confidence findings with auth surfaces", () => {
    const finding = {
      ...SAMPLE_FINDING,
      category: "Access Control",
      confidence: "Possible" as const,
    };

    const systemMap = {
      ...SAMPLE_SYSTEM_MAP,
      protocol_invariants: [],
    };

    const result = verifyFinding({
      rootDir: tempDir,
      finding,
      systemMap,
    });

    expect(result.skeptic_verdict).toBe("plausible");
  });

  it("returns confirmed when no mitigating factors found", () => {
    const result = verifyFinding({
      rootDir: tempDir,
      finding: SAMPLE_FINDING,
      systemMap: { components: [], protocol_invariants: [], auth_surfaces: [] },
    });

    expect(result.skeptic_verdict).toBe("confirmed");
  });
});
