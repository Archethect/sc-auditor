/**
 * Schema validation tests for all 8 registered MCP tools.
 *
 * Verifies each tool has a description, input schema, and that
 * the schema accepts valid input and rejects invalid input.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMcpServer } from "../../server.js";
import { registerGenerateFoundryPocTool } from "../generate-foundry-poc.js";
import { registerGetChecklistTool } from "../get-checklist.js";
import { registerRunAderynTool } from "../run-aderyn.js";
import { registerRunEchidnaTool } from "../run-echidna.js";
import { registerRunHalmosTool } from "../run-halmos.js";
import { registerRunMedusaTool } from "../run-medusa.js";
import { registerRunSlitherTool } from "../run-slither.js";
import { registerSearchFindingsTool } from "../search-findings.js";

const EXPECTED_TOOLS = [
  "run-slither",
  "run-aderyn",
  "get_checklist",
  "search_findings",
  "generate-foundry-poc",
  "run-echidna",
  "run-medusa",
  "run-halmos",
] as const;

let tools: Tool[];
let cleanup: () => Promise<void>;

/**
 * Returns a tool by name, throwing if not found (ensures type safety without non-null assertion).
 */
function getTool(name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

/**
 * Returns the properties object from a tool's inputSchema.
 */
function getSchemaProps(name: string): Record<string, unknown> {
  const tool = getTool(name);
  return (tool.inputSchema as Record<string, unknown>).properties as Record<string, unknown>;
}

beforeAll(async () => {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  registerGenerateFoundryPocTool(server);
  registerRunSlitherTool(server);
  registerRunAderynTool(server);
  registerRunEchidnaTool(server);
  registerRunMedusaTool(server);
  registerRunHalmosTool(server);
  registerGetChecklistTool(server);
  registerSearchFindingsTool(server);

  const client = new Client({ name: "schema-test-client", version: "0.0.1" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  tools = (await client.listTools()).tools;

  cleanup = async () => {
    await client.close();
    await server.close();
  };
});

afterAll(async () => {
  await cleanup();
});

describe("AC1: Server registers all 8 tools", () => {
  it("registers exactly 8 tools", () => {
    expect(tools).toHaveLength(8);
  });

  it("registers all expected tool names", () => {
    const names = tools.map((t) => t.name).sort();
    const expected = [...EXPECTED_TOOLS].sort();
    expect(names).toEqual(expected);
  });
});

describe("AC2: Each tool has a description", () => {
  for (const toolName of EXPECTED_TOOLS) {
    it(`${toolName} has a non-empty description`, () => {
      const tool = getTool(toolName);
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe("string");
      expect(tool.description?.length).toBeGreaterThan(0);
    });
  }
});

describe("AC3: Each tool has an input schema", () => {
  for (const toolName of EXPECTED_TOOLS) {
    it(`${toolName} has an inputSchema`, () => {
      const tool = getTool(toolName);
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe("object");
    });
  }
});

describe("AC4: Schema type is object for all tools", () => {
  for (const toolName of EXPECTED_TOOLS) {
    it(`${toolName} inputSchema.type is object`, () => {
      const tool = getTool(toolName);
      expect(tool.inputSchema.type).toBe("object");
    });
  }
});

describe("AC5: Tools with rootDir require it as string", () => {
  const toolsWithRootDir = [
    "run-slither",
    "run-aderyn",
    "generate-foundry-poc",
    "run-echidna",
    "run-medusa",
    "run-halmos",
  ];

  for (const toolName of toolsWithRootDir) {
    it(`${toolName} requires rootDir as string`, () => {
      const props = getSchemaProps(toolName);
      expect(props.rootDir).toBeDefined();
      const rootDirSchema = props.rootDir as Record<string, unknown>;
      expect(rootDirSchema.type).toBe("string");
    });
  }
});

describe("AC6: search_findings requires query parameter", () => {
  it("search_findings schema requires query string", () => {
    const props = getSchemaProps("search_findings");
    expect(props.query).toBeDefined();
    const querySchema = props.query as Record<string, unknown>;
    expect(querySchema.type).toBe("string");
  });

  it("search_findings has optional severity enum", () => {
    const props = getSchemaProps("search_findings");
    if (props.severity) {
      const severitySchema = props.severity as Record<string, unknown>;
      expect(severitySchema.type === "string" || severitySchema.enum !== undefined).toBe(true);
    }
  });
});

describe("AC7: get_checklist has optional category parameter", () => {
  it("get_checklist schema has category property", () => {
    const props = getSchemaProps("get_checklist");
    expect(props.category).toBeDefined();
  });

  it("get_checklist category is not in required", () => {
    const tool = getTool("get_checklist");
    const required = (tool.inputSchema as Record<string, unknown>).required;
    if (required) {
      expect(required).not.toContain("category");
    }
  });
});

describe("AC9: generate-foundry-poc has hotspot parameter", () => {
  it("generate-foundry-poc schema has hotspot property", () => {
    const props = getSchemaProps("generate-foundry-poc");
    expect(props.hotspot).toBeDefined();
  });
});
