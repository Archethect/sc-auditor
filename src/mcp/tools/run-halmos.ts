/**
 * MCP tool registration for run-halmos.
 *
 * Runs Halmos symbolic execution tool against a contract directory
 * with graceful handling when Halmos is not installed.
 */

import { execFile } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../index.js";
import { validatePath } from "./executor-utils.js";

/** Halmos execution timeout in milliseconds (10 minutes). */
const HALMOS_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Input schema for run-halmos tool.
 */
const RunHalmosSchema = z.object({
  rootDir: z.string().describe("Root directory of the Solidity project"),
  contractName: z.string().optional().describe("Target contract name"),
  functionName: z.string().optional().describe("Specific function to verify"),
  loopBound: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Loop unrolling bound"),
});

/** Parsed Halmos results. */
export interface HalmosResults {
  properties_checked: number;
  counterexamples: string[];
  verification_time_ms: number;
}

/** Result of running Halmos. */
export interface HalmosExecutionResult {
  success: boolean;
  available: boolean;
  results?: HalmosResults;
  error?: string;
}

/**
 * Checks whether the `halmos` binary is available on PATH.
 */
function checkBinaryAvailable(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [binary], {}, (error) => {
      resolve(error === null);
    });
  });
}

/**
 * Builds the argument list for the Halmos process.
 */
function buildHalmosArgs(
  input: z.infer<typeof RunHalmosSchema>,
): string[] {
  const args: string[] = [];
  if (input.contractName) {
    args.push("--contract", input.contractName);
  }
  if (input.functionName) {
    args.push("--function", input.functionName);
  }
  if (input.loopBound !== undefined) {
    args.push("--loop", String(input.loopBound));
  }
  return args;
}

/**
 * Parses Halmos text output into structured results.
 */
function parseHalmosOutput(stdout: string): HalmosResults {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  let propertiesChecked = 0;
  const counterexamples: string[] = [];
  let verificationTimeMs = 0;

  for (const line of lines) {
    if (line.includes("Counterexample") || line.includes("FAIL")) {
      const ceDetail = line.trim();
      if (ceDetail.length > 0) {
        counterexamples.push(ceDetail);
      }
    }
    const checkMatch = line.match(/Checking\s+(\d+)\s+function/i);
    if (checkMatch) {
      propertiesChecked = Number.parseInt(checkMatch[1], 10);
    }
    // Count individual check lines as properties
    if (line.match(/^\[(?:PASS|FAIL)]/)) {
      propertiesChecked++;
    }
    const timeMatch = line.match(/(?:time|elapsed)[:\s]+(\d+(?:\.\d+)?)\s*(?:ms|milliseconds)/i);
    if (timeMatch) {
      verificationTimeMs = Number.parseFloat(timeMatch[1]);
    }
    const timeSecMatch = line.match(/(?:time|elapsed)[:\s]+(\d+(?:\.\d+)?)\s*s(?:econds?)?$/i);
    if (timeSecMatch) {
      verificationTimeMs = Number.parseFloat(timeSecMatch[1]) * 1000;
    }
  }

  return {
    properties_checked: propertiesChecked,
    counterexamples,
    verification_time_ms: verificationTimeMs,
  };
}

/**
 * Runs the Halmos subprocess.
 */
function runHalmosProcess(
  resolvedPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "halmos",
      args,
      { cwd: resolvedPath, timeout: HALMOS_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const errnoError = error as NodeJS.ErrnoException;
          if (errnoError.code === "ENOENT") {
            reject(new Error("ERROR: TOOL_NOT_FOUND - halmos binary not found"));
            return;
          }
          if (error.killed || errnoError.code === "ETIMEDOUT") {
            reject(
              new Error("ERROR: EXECUTION_TIMEOUT - Halmos timed out"),
            );
            return;
          }
          // Halmos may exit non-zero when counterexamples are found
          resolve({ stdout, stderr });
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * Executes Halmos symbolic execution on the specified directory.
 *
 * Returns a nonfatal response when Halmos is not installed.
 *
 * @param input - Validated tool input
 * @returns Execution result with availability flag
 */
export async function executeHalmos(
  input: z.infer<typeof RunHalmosSchema>,
): Promise<HalmosExecutionResult> {
  const isAvailable = await checkBinaryAvailable("halmos");
  if (!isAvailable) {
    return {
      success: true,
      available: false,
      error: "Halmos is not installed. Install with: pip install halmos",
    };
  }

  const validation = validatePath(input.rootDir);
  if (!validation.valid) {
    return { success: false, available: true, error: validation.error };
  }

  const args = buildHalmosArgs(input);

  try {
    const startTime = Date.now();
    const { stdout } = await runHalmosProcess(validation.resolvedPath, args);
    const elapsedMs = Date.now() - startTime;
    const results = parseHalmosOutput(stdout);
    // Use the parsed time if available, otherwise use elapsed wall clock time
    if (results.verification_time_ms === 0) {
      results.verification_time_ms = elapsedMs;
    }
    return { success: true, available: true, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, available: true, error: message };
  }
}

/**
 * Registers the run-halmos tool on the MCP server.
 */
export function registerRunHalmosTool(server: McpServer): void {
  server.registerTool(
    "run-halmos",
    {
      description:
        "Run Halmos symbolic execution against a Solidity project. Returns verification results and counterexamples. Gracefully reports when Halmos is not installed.",
      inputSchema: RunHalmosSchema,
    },
    async (input) => {
      const result = await executeHalmos(input);
      return jsonResult(result);
    },
  );
}
