/**
 * MCP tool registration for run-slither.
 *
 * Executes Slither static analysis on a smart contract project.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../index.js";
import { executeSlither } from "./slither-executor.js";

/**
 * Input schema for run-slither tool.
 */
const RunSlitherSchema = z.object({
  rootDir: z
    .string()
    .describe("Root directory of the smart contract project to analyze"),
});

/**
 * Registers the run-slither tool on the MCP server.
 */
export function registerRunSlitherTool(server: McpServer): void {
  server.registerTool(
    "run-slither",
    {
      description:
        "Run Slither static analysis on a smart contract project. Returns security findings with severity, confidence, affected files, and line ranges.",
      inputSchema: RunSlitherSchema,
    },
    async ({ rootDir }) => {
      const result = await executeSlither(rootDir);
      return jsonResult(result);
    },
  );
}
