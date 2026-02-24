import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { bootServer } from "../main.js";

describe("MCP entry point (main.ts)", () => {
  it("bootServer() creates a server with all 4 tools registered", async () => {
    const server = bootServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(4);

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "get_checklist",
      "run-aderyn",
      "run-slither",
      "search_findings",
    ]);

    await client.close();
    await server.close();
  });

  it("bootServer() creates independent instances on repeated calls", async () => {
    const server1 = bootServer();
    const server2 = bootServer();

    const [ct1, st1] = InMemoryTransport.createLinkedPair();
    const [ct2, st2] = InMemoryTransport.createLinkedPair();
    const client1 = new Client({ name: "test-client-1", version: "0.0.1" });
    const client2 = new Client({ name: "test-client-2", version: "0.0.1" });

    await server1.connect(st1);
    await client1.connect(ct1);
    await server2.connect(st2);
    await client2.connect(ct2);

    const { tools: tools1 } = await client1.listTools();
    const { tools: tools2 } = await client2.listTools();
    expect(tools1).toHaveLength(4);
    expect(tools2).toHaveLength(4);

    // Closing one server does not affect the other
    await client1.close();
    await server1.close();

    const { tools: stillWorking } = await client2.listTools();
    expect(stillWorking).toHaveLength(4);

    await client2.close();
    await server2.close();
  });
});
