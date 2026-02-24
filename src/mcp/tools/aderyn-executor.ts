/**
 * Aderyn executor module.
 *
 * Executes Aderyn static analysis tool and returns parsed findings.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import type { Finding } from "../../types/finding.js";
import { parseAderynOutput } from "./aderyn-parser.js";
import { cleanupTempDir, createSecureTempFile, validatePath } from "./executor-utils.js";

/** Aderyn execution timeout in milliseconds (5 minutes). */
const ADERYN_TIMEOUT_MS = 5 * 60 * 1000;

/** Keywords in stderr that indicate a compilation error. Compared case-insensitively. */
const COMPILATION_ERROR_KEYWORDS = ["compilation", "solc", "compiler", "compile", "syntax error"];

/**
 * Result of executing Aderyn.
 */
export interface AderynExecutionResult {
  success: boolean;
  findings: Finding[];
  error?: string;
}

/**
 * Creates a failed execution result with the given error message.
 */
function errorResult(error: string): AderynExecutionResult {
  return { success: false, findings: [], error };
}

/**
 * Checks if stderr indicates a compilation error.
 */
function isCompilationError(stderr: string): boolean {
  const stderrLower = stderr.toLowerCase();
  return COMPILATION_ERROR_KEYWORDS.some((keyword) => stderrLower.includes(keyword));
}

/** Result of reading Aderyn output - either parsed output or an error. */
type AderynOutputRead =
  | { ok: true; output: unknown }
  | { ok: false; result: AderynExecutionResult };

/**
 * Runs the Aderyn subprocess.
 */
function runAderynProcess(resolvedPath: string, tempFile: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const args = [".", "-o", tempFile];
    execFile("aderyn", args, { cwd: resolvedPath, timeout: ADERYN_TIMEOUT_MS }, (error, _stdout, stderr) => {
      if (error) {
        const errnoError = error as NodeJS.ErrnoException;
        if (errnoError.code === "ENOENT") {
          reject(new Error("ERROR: TOOL_NOT_FOUND - Aderyn not found - please install aderyn (cargo install aderyn)"));
          return;
        }
        if (error.killed || errnoError.code === "ETIMEDOUT") {
          reject(new Error("ERROR: EXECUTION_TIMEOUT - Aderyn analysis timed out after 5 minutes"));
          return;
        }
        // Check for compilation errors first, regardless of output file existence.
        // This prevents misclassifying partial output from failed compilation as success.
        // Note: This differs intentionally from slither-executor which checks output file existence first.
        // Aderyn's stricter approach ensures compilation failures are always surfaced even if partial
        // output was produced, while Slither's permissive approach allows valid findings from partial runs.
        if (isCompilationError(stderr)) {
          reject(new Error(`ERROR: COMPILATION_FAILED - Aderyn compilation failed: ${stderr}`));
          return;
        }
        // Only check for other failures if output file was not created
        // Aderyn may exit with non-zero when findings are detected
        if (!fs.existsSync(tempFile)) {
          reject(new Error(`ERROR: EXECUTION_FAILED - Aderyn execution failed: ${stderr || error.message}`));
          return;
        }
      }
      resolve();
    });
  });
}

/**
 * Reads and parses the Aderyn output file.
 *
 * Note: Unlike Slither, Aderyn does not include a 'success' field in its JSON output.
 * Aderyn's output structure uses 'high_issues' and 'low_issues' containers.
 * Analysis success is inferred from the ability to produce a valid JSON output file.
 *
 * @returns Parsed output or error result.
 */
function readAderynOutput(tempFile: string): AderynOutputRead {
  let jsonContent: string;
  try {
    jsonContent = fs.readFileSync(tempFile, "utf-8");
  } catch (readError) {
    const message = readError instanceof Error ? readError.message : String(readError);
    return { ok: false, result: errorResult(`ERROR: OUTPUT_MISSING - Failed to read Aderyn output file: ${message}`) };
  }

  let aderynOutput: unknown;
  try {
    aderynOutput = JSON.parse(jsonContent);
  } catch {
    return { ok: false, result: errorResult("ERROR: JSON_PARSE_FAILED - Failed to parse Aderyn JSON output") };
  }

  return { ok: true, output: aderynOutput };
}

/**
 * Executes Aderyn on the specified directory.
 *
 * @param rootDir - The root directory containing the smart contracts
 * @returns Promise resolving to the execution result
 */
export async function executeAderyn(rootDir: string): Promise<AderynExecutionResult> {
  const validation = validatePath(rootDir);
  if (!validation.valid) return errorResult(validation.error);

  const { tempDir, tempFile } = createSecureTempFile("aderyn-");

  try {
    await runAderynProcess(validation.resolvedPath, tempFile);
    const readResult = readAderynOutput(tempFile);
    if (!readResult.ok) return readResult.result;
    const findings = parseAderynOutput(readResult.output as Parameters<typeof parseAderynOutput>[0]);
    return { success: true, findings };
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  } finally {
    cleanupTempDir(tempDir);
  }
}
