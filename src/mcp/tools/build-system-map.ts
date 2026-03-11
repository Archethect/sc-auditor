/**
 * MCP tool registration for build-system-map.
 *
 * Builds a complete system map of the protocol architecture
 * by scanning Solidity source files and analyzing patterns.
 */

import { existsSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildSystemMap } from "../../core/map-builder.js";
import { jsonResult } from "../index.js";

/**
 * Input schema for build-system-map tool.
 */
const BuildSystemMapSchema = z.object({
  rootDir: z
    .string()
    .describe("Root directory of the Solidity project"),
});

/**
 * Registers the build-system-map tool on the MCP server.
 */
export function registerBuildSystemMapTool(server: McpServer): void {
  server.registerTool(
    "build-system-map",
    {
      description:
        "Build a complete system map of the protocol architecture by scanning Solidity source files. Returns components, external surfaces, auth surfaces, state variables, write sites, external calls, value flows, config semantics, invariants, and static summary.",
      inputSchema: BuildSystemMapSchema,
    },
    async ({ rootDir }) => {
      if (!existsSync(rootDir)) {
        return jsonResult({
          success: false,
          error: `ERROR: INVALID_ROOT - directory does not exist: ${rootDir}`,
        });
      }

      try {
        const artifact = await buildSystemMap(rootDir);
        return jsonResult({ success: true, artifact });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ success: false, error: message });
      }
    },
  );
}
