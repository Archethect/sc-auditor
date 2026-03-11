/**
 * Tests for build-system-map MCP tool registration and integration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../../server.js";
import { registerBuildSystemMapTool } from "../build-system-map.js";

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
  registerBuildSystemMapTool(server);
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-map-tool-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("AC1: Tool registered with correct schema", () => {
  it("registers build-system-map tool on the server", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const tool = tools.find((t) => t.name === "build-system-map");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("system map");
    } finally {
      await cleanup();
    }
  });

  it("has required rootDir parameter in schema", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const tool = tools.find((t) => t.name === "build-system-map");
      const schema = tool?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties?.rootDir).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("AC2: Happy path returns SystemMapArtifact", () => {
  it("returns valid artifact JSON for directory with Solidity files", async () => {
    fs.writeFileSync(
      path.join(tempDir, "Test.sol"),
      `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Test {\n    uint256 public value;\n    function setValue(uint256 v) external { value = v; }\n}\n`,
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("build-system-map", { rootDir: tempDir });

      expect(result.isError).toBeFalsy();
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact).toBeDefined();
      expect(parsed.artifact.components).toBeDefined();
      expect(parsed.artifact.external_surfaces).toBeDefined();
      expect(parsed.artifact.static_summary).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("AC3: Failure path returns error with ERROR format", () => {
  it("returns error for non-existent directory", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("build-system-map", { rootDir: "/nonexistent/path" });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("ERROR:");
    } finally {
      await cleanup();
    }
  });

  it("returns error for directory with no Solidity files", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("build-system-map", { rootDir: tempDir });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("ERROR:");
    } finally {
      await cleanup();
    }
  });
});
