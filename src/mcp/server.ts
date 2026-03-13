/**
 * MCP server factory for sc-auditor.
 *
 * Creates and configures an McpServer with stdio transport.
 * Tool modules register themselves via server.registerTool().
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "sc-auditor";
const SERVER_VERSION = "2.0.0";

/**
 * Creates and configures the MCP server.
 * Does NOT start the transport -- call `startStdio()` for that.
 * Tools are registered separately by tool modules.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  return server;
}

/**
 * Starts the MCP server with stdio transport.
 * This connects to stdin/stdout for communication with MCP clients.
 * Accepts an optional transport for testing (defaults to StdioServerTransport).
 */
export async function startStdio(server?: McpServer, transport?: Transport): Promise<McpServer> {
  const mcpServer = server ?? createMcpServer();
  const activeTransport = transport ?? new StdioServerTransport();

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    try {
      await mcpServer.close();
    } catch {
      // Best-effort close; transport may already be torn down
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await mcpServer.connect(activeTransport);

  return mcpServer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a value as a JSON text CallToolResult.
 * Exported for use by tool modules.
 */
export function jsonResult(data: unknown): CallToolResult {
  // Handle undefined explicitly since JSON.stringify(undefined) returns undefined, not a string
  const text = data === undefined ? "null" : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}
