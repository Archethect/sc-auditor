#!/usr/bin/env node
/**
 * Executable entry point for the sc-auditor MCP server.
 *
 * Creates the server, registers all tools, and starts stdio transport.
 * The bootServer() function is exported for testing.
 */

import { fileURLToPath } from "node:url";

import { createMcpServer, startStdio } from "./server.js";
import { registerBuildSystemMapTool } from "./tools/build-system-map.js";
import { registerDeriveHotspotsTool } from "./tools/derive-hotspots.js";
import { registerGenerateFoundryPocTool } from "./tools/generate-foundry-poc.js";
import { registerGetChecklistTool } from "./tools/get-checklist.js";
import { registerRunAderynTool } from "./tools/run-aderyn.js";
import { registerRunEchidnaTool } from "./tools/run-echidna.js";
import { registerRunHalmosTool } from "./tools/run-halmos.js";
import { registerRunMedusaTool } from "./tools/run-medusa.js";
import { registerRunSlitherTool } from "./tools/run-slither.js";
import { registerSearchFindingsTool } from "./tools/search-findings.js";
import { registerVerifyFindingTool } from "./tools/verify-finding.js";
import { loadConfig } from "../config/loader.js";

/**
 * Creates a fully-configured MCP server with all tools registered.
 * Exported for testing — direct execution calls startStdio() below.
 */
export function bootServer() {
  loadConfig();
  const server = createMcpServer();
  registerBuildSystemMapTool(server);
  registerDeriveHotspotsTool(server);
  registerGenerateFoundryPocTool(server);
  registerRunSlitherTool(server);
  registerRunAderynTool(server);
  registerRunEchidnaTool(server);
  registerRunMedusaTool(server);
  registerRunHalmosTool(server);
  registerGetChecklistTool(server);
  registerSearchFindingsTool(server);
  registerVerifyFindingTool(server);
  return server;
}

// Start stdio transport only when run directly (not imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startStdio(bootServer());
}
