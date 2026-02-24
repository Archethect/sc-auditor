import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpServer, jsonResult, startStdio } from "../server.js";

/** Allow async shutdown handlers to flush. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

/** Mock process.exit so the test runner does not terminate. */
function mockExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
}

/** Extract the text string from a CallToolResult's first content block. */
function extractText(result: ReturnType<typeof jsonResult>): string {
  return (result.content[0] as { type: string; text: string }).text;
}

describe("createMcpServer", () => {
  describe("AC1: Server version is 0.2.0", () => {
    it("returns an McpServer instance", () => {
      const server = createMcpServer();
      expect(server).toBeDefined();
      expect(server).toHaveProperty("connect");
      expect(server).toHaveProperty("close");
    });

    it("has server info with name and version", () => {
      const server = createMcpServer();
      expect(server.server).toBeDefined();
      // Server name/version are passed to McpServer constructor but not exposed by SDK.
      // Version verification is done in manifests.test.ts (AC4b: SERVER_VERSION matches package.json).
    });

    it("startStdio is exported as a function", () => {
      expect(typeof startStdio).toBe("function");
    });
  });

  describe("AC2: No stub tools registered (server starts with 0 tools)", () => {
    it("server starts with no pre-registered stub tools", async () => {
      // The MCP SDK only initializes the listTools handler when the first tool is registered.
      // We verify no stub tools exist by registering exactly one tool and confirming
      // listTools returns exactly one tool (not more, which would indicate stub tools).
      const server = createMcpServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      // Register a single mock tool to enable listTools
      server.registerTool(
        "probe-tool",
        { description: "Probe tool to verify no stub tools exist" },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const client = new Client({ name: "test-client", version: "0.0.1" });

      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        // If there were any stub tools, this would return more than 1
        const tools = (await client.listTools()).tools;
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe("probe-tool");
      } finally {
        await client.close();
        await server.close();
      }
    });
  });

  describe("AC3: Tools registered via registerTool() are discoverable via listTools()", () => {
    it("single tool registered is discoverable", async () => {
      const server = createMcpServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      // Register a mock tool after server creation
      server.registerTool(
        "mock-tool",
        { description: "A mock tool for testing" },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      );

      const client = new Client({ name: "test-client", version: "0.0.1" });

      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        // Verify the registered tool is discoverable
        const tools = (await client.listTools()).tools;
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe("mock-tool");
        expect(tools[0].description).toBe("A mock tool for testing");
      } finally {
        await client.close();
        await server.close();
      }
    });

    it("multiple tools registered are all discoverable", async () => {
      const server = createMcpServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      // Register multiple tools
      server.registerTool(
        "tool-alpha",
        { description: "First tool" },
        async () => ({ content: [{ type: "text" as const, text: "alpha" }] }),
      );
      server.registerTool(
        "tool-beta",
        { description: "Second tool" },
        async () => ({ content: [{ type: "text" as const, text: "beta" }] }),
      );
      server.registerTool(
        "tool-gamma",
        { description: "Third tool" },
        async () => ({ content: [{ type: "text" as const, text: "gamma" }] }),
      );

      const client = new Client({ name: "test-client", version: "0.0.1" });

      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        const tools = (await client.listTools()).tools;
        expect(tools).toHaveLength(3);

        const toolNames = tools.map((t) => t.name).sort();
        expect(toolNames).toEqual(["tool-alpha", "tool-beta", "tool-gamma"]);
      } finally {
        await client.close();
        await server.close();
      }
    });
  });

  describe("AC4: jsonResult() helper is exported for use by tool modules", () => {
    it("jsonResult is exported as a function", () => {
      expect(typeof jsonResult).toBe("function");
    });

    it("jsonResult returns CallToolResult with text content", () => {
      const result = jsonResult({ foo: "bar" });
      expect(result).toHaveProperty("content");
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty("type", "text");
      expect(result.content[0]).toHaveProperty("text");
    });

    it("jsonResult serializes data as JSON", () => {
      expect(JSON.parse(extractText(jsonResult({ test: 123 })))).toEqual({ test: 123 });
    });

    it("jsonResult handles null", () => {
      expect(JSON.parse(extractText(jsonResult(null)))).toBeNull();
    });

    it("jsonResult handles arrays", () => {
      expect(JSON.parse(extractText(jsonResult([1, 2, 3])))).toEqual([1, 2, 3]);
    });

    it("jsonResult handles nested objects", () => {
      expect(JSON.parse(extractText(jsonResult({ nested: { deep: { value: 42 } } })))).toEqual({
        nested: { deep: { value: 42 } },
      });
    });

    it("jsonResult handles empty object", () => {
      expect(JSON.parse(extractText(jsonResult({})))).toEqual({});
    });

    it("jsonResult handles undefined by serializing as null", () => {
      const text = extractText(jsonResult(undefined));
      expect(text).toBe("null");
      expect(JSON.parse(text)).toBeNull();
    });

    it("jsonResult handles string primitives", () => {
      expect(JSON.parse(extractText(jsonResult("hello world")))).toBe("hello world");
    });

    it("jsonResult handles number primitives", () => {
      expect(JSON.parse(extractText(jsonResult(42)))).toBe(42);
    });

    it("jsonResult handles boolean primitives", () => {
      expect(JSON.parse(extractText(jsonResult(true)))).toBe(true);
    });
  });
});

describe("startStdio shutdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers SIGINT and SIGTERM handlers via startStdio", async () => {
    const server = createMcpServer();
    const [, serverTransport] = InMemoryTransport.createLinkedPair();

    mockExit();

    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");

    await startStdio(server, serverTransport);

    expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore + 1);

    await server.close();
  });

  it("shutdown guard prevents double-close via startStdio", async () => {
    const server = createMcpServer();
    const [, serverTransport] = InMemoryTransport.createLinkedPair();

    const exitSpy = mockExit();
    const closeSpy = vi.spyOn(server, "close");

    await startStdio(server, serverTransport);

    // Emit SIGINT twice rapidly to test the closing guard
    process.emit("SIGINT");
    process.emit("SIGINT");

    await flushAsync();

    // close() should only be called once due to the closing guard
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("SIGTERM triggers shutdown with process.exit(0)", async () => {
    const server = createMcpServer();
    const [, serverTransport] = InMemoryTransport.createLinkedPair();

    const exitSpy = mockExit();

    await startStdio(server, serverTransport);

    process.emit("SIGTERM");

    await flushAsync();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("shutdown removes signal listeners after first invocation", async () => {
    const server = createMcpServer();
    const [, serverTransport] = InMemoryTransport.createLinkedPair();

    mockExit();

    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");

    await startStdio(server, serverTransport);

    expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore + 1);

    process.emit("SIGINT");
    await flushAsync();

    // After shutdown, listeners should be removed
    expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });
});
