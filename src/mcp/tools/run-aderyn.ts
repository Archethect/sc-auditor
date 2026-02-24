/**
 * MCP tool registration for run-aderyn.
 *
 * Executes Aderyn static analysis on a smart contract project.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../index.js";
import { executeAderyn } from "./aderyn-executor.js";

/**
 * Input schema for run-aderyn tool.
 */
const RunAderynSchema = z.object({
  rootDir: z
    .string()
    .describe("Root directory of the smart contract project to analyze"),
});

/**
 * Registers the run-aderyn tool on the MCP server.
 */
export function registerRunAderynTool(server: McpServer): void {
  server.registerTool(
    "run-aderyn",
    {
      description:
        "Run Aderyn static analysis on a smart contract project. Returns security findings with severity, confidence, affected files, and line ranges.",
      inputSchema: RunAderynSchema,
    },
    async ({ rootDir }) => {
      const result = await executeAderyn(rootDir);
      return jsonResult(result);
    },
  );
}
