/**
 * Tests for Slither executor module.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSlither } from "../slither-executor.js";
import {
  createEnoentError,
  getJsonOutputPath,
  mockExecFile,
  mockExecFileWithOptions,
} from "./exec-test-utils.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("Path validation", () => {
  it("returns error when directory does not exist", async () => {
    const result = await executeSlither("/nonexistent/path/to/contracts");

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: INVALID_PATH");
    expect(result.error).toContain("does not exist");
  });

  it("returns error when path is a file instead of directory", async () => {
    const tempFile = path.join(os.tmpdir(), `slither-test-file-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, "test");
    try {
      const result = await executeSlither(tempFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ERROR: INVALID_PATH");
      expect(result.error).toContain("not a directory");
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  it("returns error when path is a symlink (TOCTOU mitigation)", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slither-symlink-test-"));
    const targetDir = path.join(tempDir, "target");
    const symlinkPath = path.join(tempDir, "symlink");
    fs.mkdirSync(targetDir);
    fs.symlinkSync(targetDir, symlinkPath);

    try {
      const result = await executeSlither(symlinkPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ERROR: INVALID_PATH");
      expect(result.error).toContain("symlink");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("AC7: executeSlither handles errors", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slither-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns error result when slither is not found (ENOENT)", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError(), "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: TOOL_NOT_FOUND");
    expect(result.error).toContain("not found");
  });

  it("returns error result when compilation fails", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("Compilation failed");
      cb(error, "", "Error: Solc compilation failed");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: COMPILATION_FAILED");
    expect(result.error).toContain("compilation");
  });

  it("returns error result for solc errors", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("solc error");
      cb(error, "", "Error: solc reported version mismatch");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: COMPILATION_FAILED");
  });

  it("returns error result for syntax error in stderr", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("syntax error");
      cb(error, "", "Error: Syntax error in Contract.sol");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: COMPILATION_FAILED");
  });

  it("returns EXECUTION_FAILED when error occurs without temp file", async () => {
    mockExecFile((_args, cb) => {
      // Generic error that doesn't match ENOENT, timeout, or compilation patterns
      const error = new Error("Unknown internal error");
      cb(error, "", "Some unexpected error occurred");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: EXECUTION_FAILED");
    expect(result.error).toContain("execution failed");
  });

  it("returns error result when JSON parse fails", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, "{ invalid json");
      }
      cb(null, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: JSON_PARSE_FAILED");
    expect(result.error).toContain("parse");
  });

  it("returns error result when Slither times out (killed)", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("Process killed") as NodeJS.ErrnoException & { killed?: boolean };
      error.killed = true;
      cb(error, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: EXECUTION_TIMEOUT");
    expect(result.error).toContain("timed out");
  });

  it("returns error result when Slither times out (ETIMEDOUT)", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("Operation timed out") as NodeJS.ErrnoException;
      error.code = "ETIMEDOUT";
      cb(error, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: EXECUTION_TIMEOUT");
    expect(result.error).toContain("timed out");
  });

  it("passes 5-minute timeout (300000ms) to execFile", async () => {
    const { getLastOptions } = mockExecFileWithOptions((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, '{"success": true, "results": {"detectors": []}}');
      }
      cb(null, "", "");
    });

    await executeSlither(tempDir);

    const options = getLastOptions();
    expect(options?.timeout).toBe(5 * 60 * 1000); // 300000ms = 5 minutes
  });

  it("returns error result when Slither output is JSON null", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, "null");
      }
      cb(null, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: MALFORMED_OUTPUT");
  });

  it("returns error result when Slither output is missing success field", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, '{"results": {"detectors": []}}');
      }
      cb(null, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: MALFORMED_OUTPUT");
  });

  it("returns error result when Slither output has non-boolean success field", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, '{"success": "yes", "results": {"detectors": []}}');
      }
      cb(null, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: MALFORMED_OUTPUT");
  });

  it("returns error result when Slither JSON indicates success: false", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, '{"success": false, "error": "Analysis failed"}');
      }
      cb(null, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: SLITHER_FAILED");
  });

  it("returns error result when output file cannot be read after successful execution", async () => {
    mockExecFile((_args, cb) => {
      // Slither exits successfully but doesn't write the output file
      // (simulates edge case where Slither fails to write before exiting)
      cb(null, "", "");
    });

    const result = await executeSlither(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: OUTPUT_MISSING");
    expect(result.error).toContain("Failed to read Slither output file");
  });
});

describe("AC8: Temp directory is always cleaned up (in finally block)", () => {
  let tempDir: string;
  let capturedTempFile: string | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slither-test-"));
    capturedTempFile = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("cleans up temp directory on successful execution", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        capturedTempFile = outputPath;
        fs.writeFileSync(outputPath, '{"success": true, "results": {"detectors": []}}');
      }
      cb(null, "", "");
    });

    await executeSlither(tempDir);

    expect(capturedTempFile).not.toBeNull();
    expect(fs.existsSync(capturedTempFile!)).toBe(false);
  });

  it("cleans up temp directory on error", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        capturedTempFile = outputPath;
        fs.writeFileSync(outputPath, "{ invalid json");
      }
      cb(null, "", "");
    });

    await executeSlither(tempDir);

    expect(capturedTempFile).not.toBeNull();
    expect(fs.existsSync(capturedTempFile!)).toBe(false);
  });

  it("handles case where temp directory cleanup happens even on early error", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError(), "", "");
    });

    // Should not throw even though temp file was never created
    const result = await executeSlither(tempDir);
    expect(result.success).toBe(false);
  });
});
