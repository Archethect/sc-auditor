/**
 * MCP tool registration for derive-hotspots.
 *
 * Builds a system map, runs normalization, and derives
 * prioritized hotspots for deep-dive analysis.
 */

import { existsSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildSystemMap } from "../../core/map-builder.js";
import { deriveHotspots } from "../../core/hotspot-ranking.js";
import type { WorkflowMode } from "../../types/config.js";
import { jsonResult } from "../index.js";

/**
 * Input schema for derive-hotspots tool.
 */
const DeriveHotspotsSchema = z.object({
  rootDir: z
    .string()
    .describe("Root directory of the Solidity project"),
  mode: z
    .enum(["default", "deep", "benchmark"])
    .optional()
    .describe("Workflow mode: default, deep, or benchmark"),
});

/**
 * Registers the derive-hotspots tool on the MCP server.
 */
export function registerDeriveHotspotsTool(server: McpServer): void {
  server.registerTool(
    "derive-hotspots",
    {
      description:
        "Derive prioritized security hotspots from a Solidity project. Builds a system map, analyzes patterns, and returns ranked hotspots for deep-dive analysis.",
      inputSchema: DeriveHotspotsSchema,
    },
    async ({ rootDir, mode }) => {
      if (!existsSync(rootDir)) {
        return jsonResult({
          success: false,
          error: `ERROR: INVALID_ROOT - directory does not exist: ${rootDir}`,
        });
      }

      try {
        const artifact = await buildSystemMap(rootDir);
        const hotspots = deriveHotspots(
          artifact,
          [],
          (mode as WorkflowMode) ?? "default",
        );
        return jsonResult({ success: true, hotspots });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ success: false, error: message });
      }
    },
  );
}
