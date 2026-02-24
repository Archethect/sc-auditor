/**
 * Slither executor module.
 *
 * Executes Slither static analysis tool and returns parsed findings.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import type { Finding } from "../../types/finding.js";
import { cleanupTempDir, createSecureTempFile, validatePath } from "./executor-utils.js";
import { parseSlitherOutput } from "./slither-parser.js";

/** Slither execution timeout in milliseconds (5 minutes). */
const SLITHER_TIMEOUT_MS = 5 * 60 * 1000;

/** Keywords in stderr that indicate a compilation error. Compared case-insensitively. */
const COMPILATION_ERROR_KEYWORDS = ["compilation", "solc", "compiler", "syntax error"];

/**
 * Result of executing Slither.
 */
export interface SlitherExecutionResult {
  success: boolean;
  findings: Finding[];
  error?: string;
}

/**
 * Creates a failed execution result with the given error message.
 */
function errorResult(error: string): SlitherExecutionResult {
  return { success: false, findings: [], error };
}

/**
 * Checks if stderr indicates a compilation error.
 */
function isCompilationError(stderr: string): boolean {
  const stderrLower = stderr.toLowerCase();
  return COMPILATION_ERROR_KEYWORDS.some((keyword) => stderrLower.includes(keyword));
}

/** Result of reading Slither output - either parsed output or an error. */
type SlitherOutputRead =
  | { ok: true; output: unknown }
  | { ok: false; result: SlitherExecutionResult };

/**
 * Runs the Slither subprocess.
 * Note: Slither exits with non-zero when it finds issues, which is expected.
 * We only treat it as failure if the output file was not created.
 */
function runSlitherProcess(resolvedPath: string, tempFile: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const args = [".", "--json", tempFile];
    execFile("slither", args, { cwd: resolvedPath, timeout: SLITHER_TIMEOUT_MS }, (error, _stdout, stderr) => {
      if (error) {
        const errnoError = error as NodeJS.ErrnoException;
        if (errnoError.code === "ENOENT") {
          reject(new Error("ERROR: TOOL_NOT_FOUND - Slither not found - please install slither-analyzer"));
          return;
        }
        if (error.killed || errnoError.code === "ETIMEDOUT") {
          reject(new Error("ERROR: EXECUTION_TIMEOUT - Slither analysis timed out after 5 minutes"));
          return;
        }
        // Only check for failure if output file was not created
        // Slither exits with non-zero when findings are detected (expected behavior)
        if (!fs.existsSync(tempFile)) {
          if (isCompilationError(stderr)) {
            reject(new Error(`ERROR: COMPILATION_FAILED - Slither compilation failed: ${stderr}`));
            return;
          }
          reject(new Error(`ERROR: EXECUTION_FAILED - Slither execution failed: ${stderr || error.message}`));
          return;
        }
      }
      resolve();
    });
  });
}

/**
 * Reads and parses the Slither output file.
 * @returns Parsed output or error result.
 */
function readSlitherOutput(tempFile: string): SlitherOutputRead {
  let jsonContent: string;
  try {
    jsonContent = fs.readFileSync(tempFile, "utf-8");
  } catch (readError) {
    const message = readError instanceof Error ? readError.message : String(readError);
    return { ok: false, result: errorResult(`ERROR: OUTPUT_MISSING - Failed to read Slither output file: ${message}`) };
  }

  let slitherOutput: unknown;
  try {
    slitherOutput = JSON.parse(jsonContent);
  } catch {
    return { ok: false, result: errorResult("ERROR: JSON_PARSE_FAILED - Failed to parse Slither JSON output") };
  }

  const parsedOutput = slitherOutput as { success?: boolean } | null;
  if (parsedOutput === null || typeof parsedOutput !== "object" || typeof parsedOutput.success !== "boolean") {
    return { ok: false, result: errorResult("ERROR: MALFORMED_OUTPUT - Slither output missing valid success field") };
  }
  if (parsedOutput.success === false) {
    return { ok: false, result: errorResult("ERROR: SLITHER_FAILED - Slither reported analysis failure") };
  }

  return { ok: true, output: slitherOutput };
}

/**
 * Executes Slither on the specified directory.
 *
 * @param rootDir - The root directory containing the smart contracts
 * @returns Promise resolving to the execution result
 */
export async function executeSlither(rootDir: string): Promise<SlitherExecutionResult> {
  const validation = validatePath(rootDir);
  if (!validation.valid) return errorResult(validation.error);

  const { tempDir, tempFile } = createSecureTempFile("slither-");

  try {
    await runSlitherProcess(validation.resolvedPath, tempFile);
    const readResult = readSlitherOutput(tempFile);
    if (!readResult.ok) return readResult.result;
    const findings = parseSlitherOutput(readResult.output as Parameters<typeof parseSlitherOutput>[0]);
    return { success: true, findings };
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  } finally {
    cleanupTempDir(tempDir);
  }
}
