/**
 * MCP tool registration for run-echidna.
 *
 * Runs Echidna fuzzer against a contract directory with graceful
 * handling when Echidna is not installed.
 */

import { execFile } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../index.js";
import { validatePath } from "./executor-utils.js";

/** Echidna execution timeout in milliseconds (10 minutes). */
const ECHIDNA_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Input schema for run-echidna tool.
 */
const RunEchidnaSchema = z.object({
  rootDir: z.string().describe("Root directory of the Solidity project"),
  configPath: z.string().optional().describe("Path to echidna config file"),
  contractName: z.string().optional().describe("Target contract name"),
  testLimit: z
    .number()
    .int()
    .min(1)
    .max(1000000)
    .optional()
    .describe("Maximum number of tests to run"),
});

/** Parsed Echidna results. */
export interface EchidnaResults {
  tests_run: number;
  tests_failed: number;
  properties_tested: number;
  counterexamples: string[];
}

/** Result of running Echidna. */
export interface EchidnaExecutionResult {
  success: boolean;
  available: boolean;
  results?: EchidnaResults;
  error?: string;
}

/**
 * Checks whether the `echidna` binary is available on PATH.
 */
function checkBinaryAvailable(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [binary], {}, (error) => {
      resolve(error === null);
    });
  });
}

/**
 * Builds the argument list for the Echidna process.
 */
function buildEchidnaArgs(
  input: z.infer<typeof RunEchidnaSchema>,
): string[] {
  const args = ["."];
  if (input.contractName) {
    args.push("--contract", input.contractName);
  }
  if (input.configPath) {
    args.push("--config", input.configPath);
  }
  if (input.testLimit !== undefined) {
    args.push("--test-limit", String(input.testLimit));
  }
  args.push("--format", "text");
  return args;
}

/**
 * Parses Echidna text output into structured results.
 */
function parseEchidnaOutput(stdout: string): EchidnaResults {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  let testsRun = 0;
  let testsFailed = 0;
  const counterexamples: string[] = [];
  let propertiesTested = 0;

  for (const line of lines) {
    if (line.includes("tests:")) {
      const match = line.match(/tests:\s*(\d+)/);
      if (match) {
        testsRun = Number.parseInt(match[1], 10);
      }
    }
    if (line.includes("failed")) {
      testsFailed++;
      const ceMatch = line.match(/Call sequence:\s*(.+)/);
      if (ceMatch) {
        counterexamples.push(ceMatch[1].trim());
      }
    }
    if (line.includes("echidna_") || line.includes("property")) {
      propertiesTested++;
    }
  }

  return {
    tests_run: testsRun,
    tests_failed: testsFailed,
    properties_tested: propertiesTested,
    counterexamples,
  };
}

/**
 * Runs the Echidna subprocess.
 */
function runEchidnaProcess(
  resolvedPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "echidna",
      args,
      { cwd: resolvedPath, timeout: ECHIDNA_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const errnoError = error as NodeJS.ErrnoException;
          if (errnoError.code === "ENOENT") {
            reject(new Error("ERROR: TOOL_NOT_FOUND - echidna binary not found"));
            return;
          }
          if (error.killed || errnoError.code === "ETIMEDOUT") {
            reject(
              new Error("ERROR: EXECUTION_TIMEOUT - Echidna timed out"),
            );
            return;
          }
          // Echidna may exit non-zero when counterexamples are found
          resolve({ stdout, stderr });
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * Executes Echidna fuzzer on the specified directory.
 *
 * Returns a nonfatal response when Echidna is not installed.
 *
 * @param input - Validated tool input
 * @returns Execution result with availability flag
 */
export async function executeEchidna(
  input: z.infer<typeof RunEchidnaSchema>,
): Promise<EchidnaExecutionResult> {
  const isAvailable = await checkBinaryAvailable("echidna");
  if (!isAvailable) {
    return {
      success: true,
      available: false,
      error: "Echidna is not installed. Install with: pip install echidna",
    };
  }

  const validation = validatePath(input.rootDir);
  if (!validation.valid) {
    return { success: false, available: true, error: validation.error };
  }

  const args = buildEchidnaArgs(input);

  try {
    const { stdout } = await runEchidnaProcess(validation.resolvedPath, args);
    const results = parseEchidnaOutput(stdout);
    return { success: true, available: true, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, available: true, error: message };
  }
}

/**
 * Registers the run-echidna tool on the MCP server.
 */
export function registerRunEchidnaTool(server: McpServer): void {
  server.registerTool(
    "run-echidna",
    {
      description:
        "Run Echidna fuzzer against a Solidity project. Returns property test results and counterexamples. Gracefully reports when Echidna is not installed.",
      inputSchema: RunEchidnaSchema,
    },
    async (input) => {
      const result = await executeEchidna(input);
      return jsonResult(result);
    },
  );
}
