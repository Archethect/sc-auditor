/**
 * MCP tool registration for run-medusa.
 *
 * Runs Medusa fuzzer against a contract directory with graceful
 * handling when Medusa is not installed.
 */

import { execFile } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../index.js";
import { validatePath } from "./executor-utils.js";

/** Medusa execution timeout in milliseconds (10 minutes). */
const MEDUSA_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Input schema for run-medusa tool.
 */
const RunMedusaSchema = z.object({
  rootDir: z.string().describe("Root directory of the Solidity project"),
  configPath: z.string().optional().describe("Path to medusa config file"),
  targetContract: z.string().optional().describe("Target contract name"),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(3600)
    .optional()
    .describe("Timeout in seconds"),
});

/** Parsed Medusa results. */
export interface MedusaResults {
  sequences_executed: number;
  properties_tested: number;
  failures: string[];
  coverage_percent: number;
}

/** Result of running Medusa. */
export interface MedusaExecutionResult {
  success: boolean;
  available: boolean;
  results?: MedusaResults;
  error?: string;
}

/**
 * Checks whether the `medusa` binary is available on PATH.
 */
function checkBinaryAvailable(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [binary], {}, (error) => {
      resolve(error === null);
    });
  });
}

/**
 * Builds the argument list for the Medusa process.
 */
function buildMedusaArgs(
  input: z.infer<typeof RunMedusaSchema>,
): string[] {
  const args = ["fuzz"];
  if (input.targetContract) {
    args.push("--target-contracts", input.targetContract);
  }
  if (input.configPath) {
    args.push("--config", input.configPath);
  }
  if (input.timeout !== undefined) {
    args.push("--timeout", String(input.timeout));
  }
  return args;
}

/**
 * Parses Medusa text output into structured results.
 */
function parseMedusaOutput(stdout: string): MedusaResults {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  let sequencesExecuted = 0;
  let propertiesTested = 0;
  const failures: string[] = [];
  let coveragePercent = 0;

  for (const line of lines) {
    const seqMatch = line.match(/sequences?[:\s]+(\d+)/i);
    if (seqMatch) {
      sequencesExecuted = Number.parseInt(seqMatch[1], 10);
    }
    const propMatch = line.match(/propert(?:y|ies)[:\s]+(\d+)/i);
    if (propMatch) {
      propertiesTested = Number.parseInt(propMatch[1], 10);
    }
    if (line.toLowerCase().includes("fail")) {
      const failDetail = line.trim();
      if (failDetail.length > 0) {
        failures.push(failDetail);
      }
    }
    const covMatch = line.match(/coverage[:\s]+(\d+(?:\.\d+)?)\s*%/i);
    if (covMatch) {
      coveragePercent = Number.parseFloat(covMatch[1]);
    }
  }

  return {
    sequences_executed: sequencesExecuted,
    properties_tested: propertiesTested,
    failures,
    coverage_percent: coveragePercent,
  };
}

/**
 * Runs the Medusa subprocess.
 */
function runMedusaProcess(
  resolvedPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "medusa",
      args,
      { cwd: resolvedPath, timeout: MEDUSA_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const errnoError = error as NodeJS.ErrnoException;
          if (errnoError.code === "ENOENT") {
            reject(new Error("ERROR: TOOL_NOT_FOUND - medusa binary not found"));
            return;
          }
          if (error.killed || errnoError.code === "ETIMEDOUT") {
            reject(
              new Error("ERROR: EXECUTION_TIMEOUT - Medusa timed out"),
            );
            return;
          }
          // Medusa may exit non-zero when failures are found
          resolve({ stdout, stderr });
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * Executes Medusa fuzzer on the specified directory.
 *
 * Returns a nonfatal response when Medusa is not installed.
 *
 * @param input - Validated tool input
 * @returns Execution result with availability flag
 */
export async function executeMedusa(
  input: z.infer<typeof RunMedusaSchema>,
): Promise<MedusaExecutionResult> {
  const isAvailable = await checkBinaryAvailable("medusa");
  if (!isAvailable) {
    return {
      success: true,
      available: false,
      error: "Medusa is not installed. Install from: https://github.com/crytic/medusa",
    };
  }

  const validation = validatePath(input.rootDir);
  if (!validation.valid) {
    return { success: false, available: true, error: validation.error };
  }

  const args = buildMedusaArgs(input);

  try {
    const { stdout } = await runMedusaProcess(validation.resolvedPath, args);
    const results = parseMedusaOutput(stdout);
    return { success: true, available: true, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, available: true, error: message };
  }
}

/**
 * Registers the run-medusa tool on the MCP server.
 */
export function registerRunMedusaTool(server: McpServer): void {
  server.registerTool(
    "run-medusa",
    {
      description:
        "Run Medusa fuzzer against a Solidity project. Returns fuzzing results including sequence counts, property failures, and coverage. Gracefully reports when Medusa is not installed.",
      inputSchema: RunMedusaSchema,
    },
    async (input) => {
      const result = await executeMedusa(input);
      return jsonResult(result);
    },
  );
}
