/**
 * MCP tool registration for get_checklist.
 *
 * Returns the Cyfrin audit checklist with optional category filtering.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../index.js";
import { fetchChecklist, filterByCategory } from "../services/index.js";

/**
 * Input schema for get_checklist tool.
 */
const GetChecklistSchema = z.object({
  category: z
    .string()
    .optional()
    .describe("Optional category substring to filter items by (case-insensitive)"),
});

/**
 * Registers the get_checklist tool on the MCP server.
 */
export function registerGetChecklistTool(server: McpServer): void {
  server.registerTool(
    "get_checklist",
    {
      description:
        "Get the Cyfrin audit checklist. Returns all checklist items, optionally filtered by category. Items include id, question, description, remediation, references, tags, and category.",
      inputSchema: GetChecklistSchema,
    },
    async ({ category }) => {
      const allItems = await fetchChecklist();
      const filtered = filterByCategory(allItems, category);
      return jsonResult(filtered);
    },
  );
}
