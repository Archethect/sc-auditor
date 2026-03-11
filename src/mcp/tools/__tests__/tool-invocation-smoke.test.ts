/**
 * Invocation smoke tests for MCP tools that can run without external dependencies.
 *
 * Tests build-system-map, derive-hotspots, and verify-finding with
 * real fixture files.
 */

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMcpServer } from "../../server.js";
import { registerBuildSystemMapTool } from "../build-system-map.js";
import { registerDeriveHotspotsTool } from "../derive-hotspots.js";
import { registerVerifyFindingTool } from "../verify-finding.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../../../../tests/fixtures/solidity");

let callTool: (name: string, args: Record<string, unknown>) => Promise<{ content: unknown[]; isError?: boolean }>;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  registerBuildSystemMapTool(server);
  registerDeriveHotspotsTool(server);
  registerVerifyFindingTool(server);

  const client = new Client({ name: "invocation-test-client", version: "0.0.1" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  callTool = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    return result as { content: unknown[]; isError?: boolean };
  };

  cleanup = async () => {
    await client.close();
    await server.close();
  };
});

afterAll(async () => {
  await cleanup();
});

describe("build-system-map invocation", () => {
  it("returns valid artifact from fixture directory", async () => {
    const result = await callTool("build-system-map", { rootDir: FIXTURES_DIR });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    expect(content.type).toBe("text");

    const parsed = JSON.parse(content.text);
    expect(parsed.success).toBe(true);
    expect(parsed.artifact).toBeDefined();
    expect(parsed.artifact.components).toBeDefined();
    expect(Array.isArray(parsed.artifact.components)).toBe(true);
    expect(parsed.artifact.components.length).toBeGreaterThan(0);
  });

  it("returns error for non-existent directory", async () => {
    const result = await callTool("build-system-map", { rootDir: "/nonexistent/path/abc123" });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
  });

  it("artifact contains all 10 required fields", async () => {
    const result = await callTool("build-system-map", { rootDir: FIXTURES_DIR });
    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);

    const artifact = parsed.artifact;
    expect(artifact.components).toBeDefined();
    expect(artifact.external_surfaces).toBeDefined();
    expect(artifact.auth_surfaces).toBeDefined();
    expect(artifact.state_variables).toBeDefined();
    expect(artifact.state_write_sites).toBeDefined();
    expect(artifact.external_call_sites).toBeDefined();
    expect(artifact.value_flow_edges).toBeDefined();
    expect(artifact.config_semantics).toBeDefined();
    expect(artifact.protocol_invariants).toBeDefined();
    expect(artifact.static_summary).toBeDefined();
  });
});

describe("derive-hotspots invocation", () => {
  it("returns valid hotspot array from fixture directory", async () => {
    const result = await callTool("derive-hotspots", { rootDir: FIXTURES_DIR });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);

    expect(parsed.success).toBe(true);
    expect(parsed.hotspots).toBeDefined();
    expect(Array.isArray(parsed.hotspots)).toBe(true);
    expect(parsed.hotspots.length).toBeGreaterThan(0);
  });

  it("each hotspot has required fields", async () => {
    const result = await callTool("derive-hotspots", { rootDir: FIXTURES_DIR });
    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);

    for (const hotspot of parsed.hotspots) {
      expect(hotspot.id).toBeDefined();
      expect(hotspot.lane).toBeDefined();
      expect(hotspot.title).toBeDefined();
      expect(hotspot.priority).toBeDefined();
      expect(hotspot.evidence).toBeDefined();
      expect(hotspot.candidate_attack_sequence).toBeDefined();
    }
  });

  it("supports mode parameter", async () => {
    const result = await callTool("derive-hotspots", {
      rootDir: FIXTURES_DIR,
      mode: "benchmark",
    });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);
    expect(parsed.success).toBe(true);
  });

  it("returns error for non-existent directory", async () => {
    const result = await callTool("derive-hotspots", { rootDir: "/nonexistent/path/abc123" });
    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);
    expect(parsed.success).toBe(false);
  });
});

describe("verify-finding invocation", () => {
  it("returns valid VerificationArtifact with mock finding", async () => {
    const result = await callTool("verify-finding", {
      rootDir: FIXTURES_DIR,
      finding: {
        title: "Reentrancy in withdraw",
        severity: "HIGH",
        confidence: "Likely",
        source: "slither",
        category: "reentrancy",
        affected_files: ["Vault.sol"],
        affected_lines: { start: 10, end: 20 },
        description: "Reentrancy vulnerability in withdraw function",
        evidence_sources: [{ type: "static_analysis", tool: "slither" }],
        status: "candidate",
        proof_type: "none",
      },
      systemMap: {
        components: [{ name: "Vault", files: ["Vault.sol"], role: "Main vault", risk_level: "High" }],
        protocol_invariants: [
          { id: "INV-1", description: "balance invariant", scope: "local", related_contracts: ["Vault"], related_variables: [] },
        ],
        auth_surfaces: [],
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);

    expect(parsed.success).toBe(true);
    expect(parsed.artifact).toBeDefined();
    expect(parsed.artifact.finding_id).toBeDefined();
    expect(parsed.artifact.skeptic_verdict).toBeDefined();
    expect(parsed.artifact.judge_verdict).toBeDefined();
    expect(parsed.artifact.proof_type).toBeDefined();
    expect(parsed.artifact.verification_notes).toBeDefined();
    expect(typeof parsed.artifact.benchmark_mode_visible).toBe("boolean");
  });

  it("skeptic confirms finding without mitigating factors", async () => {
    const result = await callTool("verify-finding", {
      rootDir: FIXTURES_DIR,
      finding: {
        title: "Reentrancy",
        severity: "HIGH",
        confidence: "Confirmed",
        source: "slither",
        category: "reentrancy",
        affected_files: ["Vault.sol"],
        affected_lines: { start: 10, end: 20 },
        description: "Reentrancy vulnerability",
        evidence_sources: [{ type: "static_analysis", tool: "slither" }],
      },
      systemMap: {
        components: [],
        protocol_invariants: [],
        auth_surfaces: [],
      },
    });

    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);

    expect(parsed.artifact.skeptic_verdict).toBe("confirmed");
  });

  it("returns error for non-existent rootDir", async () => {
    const result = await callTool("verify-finding", {
      rootDir: "/nonexistent/path/abc123",
      finding: {
        title: "Test",
        severity: "LOW",
        confidence: "Possible",
        source: "manual",
        category: "other",
        affected_files: ["test.sol"],
        affected_lines: { start: 1, end: 1 },
        description: "test",
        evidence_sources: [{ type: "static_analysis" }],
      },
      systemMap: {
        components: [],
        protocol_invariants: [],
        auth_surfaces: [],
      },
    });

    const content = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(content.text);
    expect(parsed.success).toBe(false);
  });
});
