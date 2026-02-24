/**
 * Tests for Aderyn executor module.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAderyn } from "../aderyn-executor.js";
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
    const result = await executeAderyn("/nonexistent/path/to/contracts");

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: INVALID_PATH");
    expect(result.error).toContain("does not exist");
  });

  it("returns error when path is a file instead of directory", async () => {
    const tempFile = path.join(os.tmpdir(), `aderyn-test-file-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, "test");
    try {
      const result = await executeAderyn(tempFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ERROR: INVALID_PATH");
      expect(result.error).toContain("not a directory");
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  it("returns error when path is a symlink (TOCTOU mitigation)", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aderyn-symlink-test-"));
    const targetDir = path.join(tempDir, "target");
    const symlinkPath = path.join(tempDir, "symlink");
    fs.mkdirSync(targetDir);
    fs.symlinkSync(targetDir, symlinkPath);

    try {
      const result = await executeAderyn(symlinkPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ERROR: INVALID_PATH");
      expect(result.error).toContain("symlink");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("AC7: executeAderyn handles errors", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aderyn-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns error result when aderyn is not found (ENOENT)", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError("spawn aderyn ENOENT"), "", "");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: TOOL_NOT_FOUND");
    expect(result.error).toContain("not found");
  });

  it("returns error result when compilation fails", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("Compilation failed");
      cb(error, "", "Error: failed to compile");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: COMPILATION_FAILED");
    expect(result.error).toContain("compil");
  });

  it("returns error result for solc errors", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("solc error");
      cb(error, "", "Error: solc reported version mismatch");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: COMPILATION_FAILED");
  });

  it("returns COMPILATION_FAILED even when partial output file exists", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        // Aderyn may create partial output before compilation fails
        fs.writeFileSync(outputPath, '{"high_issues": {"issues": []}}');
      }
      const error = new Error("Compilation failed");
      cb(error, "", "Error: failed to compile source files");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: COMPILATION_FAILED");
    // Should NOT be JSON_PARSE_FAILED or success
    expect(result.error).not.toContain("JSON_PARSE");
  });

  it("returns error result when JSON parse fails", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, "{ invalid json");
      }
      cb(null, "", "");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: JSON_PARSE_FAILED");
    expect(result.error).toContain("parse");
  });

  it("returns error result when Aderyn times out (killed)", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("Process killed") as NodeJS.ErrnoException & { killed?: boolean };
      error.killed = true;
      cb(error, "", "");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: EXECUTION_TIMEOUT");
    expect(result.error).toContain("timed out");
  });

  it("returns error result when Aderyn times out (ETIMEDOUT)", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("Operation timed out") as NodeJS.ErrnoException;
      error.code = "ETIMEDOUT";
      cb(error, "", "");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: EXECUTION_TIMEOUT");
    expect(result.error).toContain("timed out");
  });

  it("passes 5-minute timeout (300000ms) to execFile", async () => {
    const { getLastOptions } = mockExecFileWithOptions((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, '{"high_issues": {"issues": []}, "low_issues": {"issues": []}}');
      }
      cb(null, "", "");
    });

    await executeAderyn(tempDir);

    const options = getLastOptions();
    expect(options?.timeout).toBe(5 * 60 * 1000); // 300000ms = 5 minutes
  });

  it("returns error result when output file cannot be read", async () => {
    mockExecFile((_args, cb) => {
      // Aderyn exits successfully but doesn't write the output file
      cb(null, "", "");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: OUTPUT_MISSING");
  });

  it("returns EXECUTION_FAILED for generic errors", async () => {
    mockExecFile((_args, cb) => {
      const error = new Error("Unknown internal error");
      cb(error, "", "Some unexpected error occurred");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERROR: EXECUTION_FAILED");
  });
});

describe("AC8: Temp file is always cleaned up (in finally block)", () => {
  let tempDir: string;
  let capturedTempFile: string | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aderyn-test-"));
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
        fs.writeFileSync(outputPath, '{"high_issues": {"issues": []}, "low_issues": {"issues": []}}');
      }
      cb(null, "", "");
    });

    await executeAderyn(tempDir);

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

    await executeAderyn(tempDir);

    expect(capturedTempFile).not.toBeNull();
    expect(fs.existsSync(capturedTempFile!)).toBe(false);
  });

  it("handles case where temp directory cleanup happens even on early error", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError("spawn aderyn ENOENT"), "", "");
    });

    // Should not throw even though temp file was never created
    const result = await executeAderyn(tempDir);
    expect(result.success).toBe(false);
  });
});

describe("Successful execution", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aderyn-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns success with parsed findings", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify({
          high_issues: {
            issues: [
              {
                title: "Centralization Risk",
                description: "Contracts have single owner",
                detector_name: "centralization-risk",
                instances: [
                  { contract_path: "contracts/Test.sol", line_no: 10 },
                ],
              },
            ],
          },
          low_issues: { issues: [] },
        }));
      }
      cb(null, "", "");
    });

    const result = await executeAderyn(tempDir);

    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toBe("Centralization Risk");
    expect(result.findings[0].severity).toBe("HIGH");
    expect(result.findings[0].source).toBe("aderyn");
  });
});
