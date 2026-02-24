/**
 * Shared test utilities for mocking child_process.execFile.
 */

import { execFile } from "node:child_process";
import type { Mock } from "vitest";

export type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

export interface ExecFileOptions {
  cwd?: string;
  timeout?: number;
}

/**
 * Extracts the JSON output file path from execFile args.
 * Supports both "-o" (Aderyn) and "--json" (legacy) argument styles.
 */
export function getJsonOutputPath(args: string[]): string | undefined {
  // Check for -o flag (Aderyn current format)
  const oArgIndex = args.indexOf("-o");
  if (oArgIndex !== -1) {
    return args[oArgIndex + 1];
  }
  // Check for --json flag (legacy format)
  const jsonArgIndex = args.indexOf("--json");
  return jsonArgIndex !== -1 ? args[jsonArgIndex + 1] : undefined;
}

/**
 * Creates a mock implementation for execFile that captures options.
 * Returns captured options for assertion.
 */
export function mockExecFileWithOptions(
  handler: (args: string[], cb: ExecFileCallback) => void,
): { getLastOptions: () => ExecFileOptions | undefined } {
  let lastOptions: ExecFileOptions | undefined;
  const mock = execFile as unknown as Mock;
  mock.mockImplementation(
    (_cmd: string, args: string[], opts: ExecFileOptions, cb: ExecFileCallback) => {
      lastOptions = opts;
      handler(args, cb);
    },
  );
  return { getLastOptions: () => lastOptions };
}

/**
 * Creates a mock implementation for execFile without capturing options.
 */
export function mockExecFile(
  handler: (args: string[], cb: ExecFileCallback) => void,
): void {
  mockExecFileWithOptions(handler);
}

/**
 * Creates an ENOENT error for tool-not-found scenarios.
 */
export function createEnoentError(message = "spawn tool ENOENT"): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}
