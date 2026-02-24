import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSolidityFiles, getDiscoveryWarnings } from "../discovery.js";

const isWindows = process.platform === "win32";
const isRoot = !isWindows && process.getuid?.() === 0;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "sc-auditor-discovery-"));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, ...relPath.split("/"));
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

describe("discoverSolidityFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- AC1: Returns non-empty AuditScopeEntry[] for standard Solidity repo ---

  describe("AC1: discovers .sol files and returns AuditScopeEntry[]", () => {
    it("returns a non-empty array for a repo with .sol files", () => {
      writeFile(tempDir, "src/Token.sol", "// SPDX\npragma solidity ^0.8.0;\n");
      writeFile(tempDir, "src/Vault.sol", "// SPDX\npragma solidity ^0.8.0;\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns entries conforming to AuditScopeEntry shape", () => {
      writeFile(tempDir, "src/Token.sol", "// SPDX\npragma solidity ^0.8.0;\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);

      const entry = result[0];
      expect(entry).toHaveProperty("file");
      expect(entry).toHaveProperty("line_count");
      expect(entry).toHaveProperty("description");
      expect(entry).toHaveProperty("risk_level");
      expect(entry).toHaveProperty("audited");

      expect(typeof entry.file).toBe("string");
      expect(typeof entry.line_count).toBe("number");
      expect(typeof entry.description).toBe("string");
      expect(typeof entry.risk_level).toBe("string");
      expect(typeof entry.audited).toBe("boolean");
    });

    it("defaults description to empty string", () => {
      writeFile(tempDir, "src/Token.sol", "line1\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.description).toBe("");
    });

    it("defaults risk_level to 'Medium'", () => {
      writeFile(tempDir, "src/Token.sol", "line1\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.risk_level).toBe("Medium");
    });

    it("defaults audited to false", () => {
      writeFile(tempDir, "src/Token.sol", "line1\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.audited).toBe(false);
    });

    it("discovers .sol files in deeply nested non-excluded directories", () => {
      writeFile(tempDir, "a/b/c/d/e/Deep.sol", "// deep\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("a/b/c/d/e/Deep.sol");
    });

    it("discovers .sol files at the repo root level", () => {
      writeFile(tempDir, "Root.sol", "// root\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("Root.sol");
    });

    it("only discovers files with .sol extension", () => {
      writeFile(tempDir, "Token.sol", "// sol\n");
      writeFile(tempDir, "Token.js", "// js\n");
      writeFile(tempDir, "Token.ts", "// ts\n");
      writeFile(tempDir, "Token.txt", "// txt\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("Token.sol");
    });

    it("extension matching is case-sensitive (.SOL and .Sol are excluded)", () => {
      writeFile(tempDir, "Lower.sol", "// lowercase\n");
      writeFile(tempDir, "Upper.SOL", "// uppercase\n");
      writeFile(tempDir, "Mixed.Sol", "// mixed\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("Lower.sol");
    });
  });

  // --- AC2: Excluded directories are filtered from discovery results ---

  describe("AC2: excluded directories are filtered", () => {
    const EXCLUDED = [
      "node_modules",
      "out",
      "artifacts",
      "cache",
      "dist",
      "build",
      ".git",
      ".cache",
    ];

    for (const dir of EXCLUDED) {
      it(`excludes .sol files inside ${dir}/`, () => {
        writeFile(tempDir, "src/Kept.sol", "// kept\n");
        writeFile(tempDir, `${dir}/Excluded.sol`, "// excluded\n");

        const result = discoverSolidityFiles(tempDir);
        expect(result.length).toBe(1);
        expect(result[0]?.file).toBe("src/Kept.sol");
      });
    }

    it("excludes .sol files nested deeply inside excluded directories", () => {
      writeFile(tempDir, "src/Kept.sol", "// kept\n");
      writeFile(tempDir, "node_modules/@openzeppelin/contracts/Token.sol", "// nested\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("src/Kept.sol");
    });

    it("excludes directories with matching names at any nesting depth", () => {
      writeFile(tempDir, "src/Kept.sol", "// kept\n");
      writeFile(tempDir, "src/cache/Token.sol", "// nested excluded\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("src/Kept.sol");
    });

    it("excludes only at directory name level, not partial matches", () => {
      writeFile(tempDir, "my-cache-stuff/Token.sol", "// should be included\n");
      writeFile(tempDir, "src/Kept.sol", "// kept\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.map((e) => e.file).sort()).toEqual([
        "my-cache-stuff/Token.sol",
        "src/Kept.sol",
      ]);
    });
  });

  // --- AC3: Symlinks are not followed during file discovery ---

  describe("AC3: symlinks are not followed", () => {
    it.skipIf(isWindows)("does not follow symlinked .sol files", () => {
      writeFile(tempDir, "real/Token.sol", "// real\n");
      symlinkSync(
        join(tempDir, "real", "Token.sol"),
        join(tempDir, "LinkedToken.sol"),
      );

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("real/Token.sol");
    });

    it.skipIf(isWindows)("does not follow symlinked directories containing .sol files", () => {
      writeFile(tempDir, "real/Token.sol", "// real\n");
      mkdirSync(join(tempDir, "links"), { recursive: true });
      symlinkSync(
        join(tempDir, "real"),
        join(tempDir, "links", "linked-dir"),
      );

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("real/Token.sol");
    });
  });

  // --- AC4: Line count = number of \n + 1; empty file = 0 lines ---

  describe("AC4: line count calculation", () => {
    it("empty file has 0 lines", () => {
      writeFile(tempDir, "Empty.sol", "");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(0);
    });

    it("single line without trailing newline has 1 line", () => {
      writeFile(tempDir, "One.sol", "// single line");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(1);
    });

    it("single line with trailing newline has 2 lines", () => {
      writeFile(tempDir, "OneNl.sol", "// single line\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(2);
    });

    it("two lines separated by newline (no trailing) has 2 lines", () => {
      writeFile(tempDir, "Two.sol", "line1\nline2");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(2);
    });

    it("two lines with trailing newline has 3 lines", () => {
      writeFile(tempDir, "TwoNl.sol", "line1\nline2\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(3);
    });

    it("CRLF line endings count newlines correctly", () => {
      writeFile(tempDir, "Crlf.sol", "line1\r\nline2\r\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(3);
    });

    it("file containing only a newline has 2 lines", () => {
      writeFile(tempDir, "Nl.sol", "\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(2);
    });

    it("file containing only multiple newlines counts correctly", () => {
      writeFile(tempDir, "Nls.sol", "\n\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(3);
    });

    it("typical Solidity file line count is correct", () => {
      // 5 newlines -> 6 lines
      const content = [
        "// SPDX-License-Identifier: MIT",
        "pragma solidity ^0.8.0;",
        "",
        "contract Token {",
        "    uint256 public supply;",
        "}",
      ].join("\n");

      writeFile(tempDir, "Token.sol", content);

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.line_count).toBe(6);
    });
  });

  // --- AC5: Zero .sol files exits with specific error ---

  describe("AC5: zero .sol files produces error", () => {
    it("throws when directory is empty", () => {
      expect(() => discoverSolidityFiles(tempDir)).toThrow(
        "ERROR: NO_SOLIDITY_FILES - nothing to audit",
      );
    });

    it("throws when directory has non-.sol files only", () => {
      writeFile(tempDir, "README.md", "# Hello\n");
      writeFile(tempDir, "src/index.ts", "export {};\n");

      expect(() => discoverSolidityFiles(tempDir)).toThrow(
        "ERROR: NO_SOLIDITY_FILES - nothing to audit",
      );
    });

    it("throws when .sol files exist only inside excluded directories", () => {
      writeFile(tempDir, "node_modules/Token.sol", "// excluded\n");
      writeFile(tempDir, "build/Vault.sol", "// excluded\n");

      expect(() => discoverSolidityFiles(tempDir)).toThrow(
        "ERROR: NO_SOLIDITY_FILES - nothing to audit",
      );
    });

    it("error message follows ERROR: <TYPE> - <message> format", () => {
      expect(() => discoverSolidityFiles(tempDir)).toThrow(
        /^ERROR: [A-Z_]+ - .+/,
      );
    });

    it("throws an OS-level error (not NO_SOLIDITY_FILES) when rootPath does not exist", () => {
      const nonExistent = join(tempDir, `does-not-exist-${Date.now()}`);
      expect(() => discoverSolidityFiles(nonExistent)).toThrow(/ENOENT/);
    });

    it.skipIf(isWindows || isRoot)("throws when .sol files are found but all are unreadable", () => {
      writeFile(tempDir, "src/Token.sol", "// token\n");
      // Make the file unreadable
      chmodSync(join(tempDir, "src", "Token.sol"), 0o000);

      expect(() => discoverSolidityFiles(tempDir)).toThrow(
        "ERROR: ALL_FILES_UNREADABLE - discovered .sol files but none could be read",
      );

      const warnings = getDiscoveryWarnings();
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("Could not read file");

      // Restore permissions for cleanup
      chmodSync(join(tempDir, "src", "Token.sol"), 0o644);
    });
  });

  // --- Partial read failure (TOCTOU: some files unreadable after discovery) ---

  describe("partial file read failure", () => {
    it.skipIf(isWindows || isRoot)("returns readable files and warns about unreadable ones", () => {
      writeFile(tempDir, "src/Readable.sol", "// readable\n");
      writeFile(tempDir, "src/Unreadable.sol", "// unreadable\n");
      chmodSync(join(tempDir, "src", "Unreadable.sol"), 0o000);

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("src/Readable.sol");

      const warnings = getDiscoveryWarnings();
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain("Could not read file src/Unreadable.sol");

      // Restore permissions for cleanup
      chmodSync(join(tempDir, "src", "Unreadable.sol"), 0o644);
    });
  });

  // --- Discovery warnings for unreadable paths ---

  describe("discovery warnings", () => {
    it.skipIf(isWindows || isRoot)("collects warnings for unreadable directories with repo-relative paths", () => {
      writeFile(tempDir, "src/Token.sol", "// token\n");
      mkdirSync(join(tempDir, "restricted"), { recursive: true });
      writeFile(tempDir, "restricted/Hidden.sol", "// hidden\n");
      chmodSync(join(tempDir, "restricted"), 0o000);

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("src/Token.sol");

      const warnings = getDiscoveryWarnings();
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("Could not read directory restricted");

      // Restore permissions for cleanup
      chmodSync(join(tempDir, "restricted"), 0o755);
    });

    it("returns empty warnings after a successful discovery with no issues", () => {
      writeFile(tempDir, "src/Token.sol", "// token\n");

      discoverSolidityFiles(tempDir);
      const warnings = getDiscoveryWarnings();
      expect(warnings).toEqual([]);
    });

    it.skipIf(isWindows || isRoot)("resets warnings between calls", () => {
      // First call: create a scenario that produces warnings
      writeFile(tempDir, "src/Token.sol", "// token\n");
      mkdirSync(join(tempDir, "restricted"), { recursive: true });
      writeFile(tempDir, "restricted/Hidden.sol", "// hidden\n");
      chmodSync(join(tempDir, "restricted"), 0o000);

      discoverSolidityFiles(tempDir);
      const warningsAfterFirst = getDiscoveryWarnings();
      expect(warningsAfterFirst.length).toBeGreaterThan(0);

      // Restore permissions
      chmodSync(join(tempDir, "restricted"), 0o755);

      // Second call: clean repo with no issues
      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(2);

      const warningsAfterSecond = getDiscoveryWarnings();
      expect(warningsAfterSecond).toEqual([]);
    });
  });

  // --- AC6: Deterministic sorting by lexicographic path ---

  describe("AC6: deterministic lexicographic sorting", () => {
    it("returns files sorted by path alphabetically", () => {
      writeFile(tempDir, "src/Vault.sol", "a\n");
      writeFile(tempDir, "src/Token.sol", "b\n");
      writeFile(tempDir, "lib/Helper.sol", "c\n");
      writeFile(tempDir, "contracts/Main.sol", "d\n");

      const result = discoverSolidityFiles(tempDir);
      const paths = result.map((e) => e.file);
      expect(paths).toEqual([
        "contracts/Main.sol",
        "lib/Helper.sol",
        "src/Token.sol",
        "src/Vault.sol",
      ]);
    });

    it("sorting is stable across multiple invocations", () => {
      writeFile(tempDir, "Z.sol", "z\n");
      writeFile(tempDir, "A.sol", "a\n");
      writeFile(tempDir, "M.sol", "m\n");

      const r1 = discoverSolidityFiles(tempDir).map((e) => e.file);
      const r2 = discoverSolidityFiles(tempDir).map((e) => e.file);
      expect(r1).toEqual(r2);
      expect(r1).toEqual(["A.sol", "M.sol", "Z.sol"]);
    });

    it("sorts nested paths correctly (directory structure)", () => {
      writeFile(tempDir, "b/Z.sol", "z\n");
      writeFile(tempDir, "a/A.sol", "a\n");
      writeFile(tempDir, "a/B.sol", "b\n");

      const result = discoverSolidityFiles(tempDir);
      const paths = result.map((e) => e.file);
      expect(paths).toEqual(["a/A.sol", "a/B.sol", "b/Z.sol"]);
    });
  });

  // --- AC7: Repo-relative paths with / separators ---

  describe("AC7: repo-relative paths with / separators", () => {
    it("paths are repo-relative (no absolute path prefix)", () => {
      writeFile(tempDir, "src/Token.sol", "// token\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.file).toBe("src/Token.sol");
      expect(result[0]?.file.startsWith("/")).toBe(false);
    });

    it("paths use / separators for nested files", () => {
      writeFile(tempDir, "contracts/interfaces/IToken.sol", "// iface\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.file).toBe("contracts/interfaces/IToken.sol");
      expect(result[0]?.file).not.toContain("\\");
    });

    it("root-level files have no directory prefix", () => {
      writeFile(tempDir, "Root.sol", "// root\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result[0]?.file).toBe("Root.sol");
      expect(result[0]?.file).not.toContain("/");
    });

    it("all paths in a multi-file result use / separators", () => {
      writeFile(tempDir, "src/A.sol", "a\n");
      writeFile(tempDir, "lib/deep/B.sol", "b\n");
      writeFile(tempDir, "Root.sol", "c\n");

      const result = discoverSolidityFiles(tempDir);
      for (const entry of result) {
        expect(entry.file).not.toContain("\\");
        expect(entry.file.startsWith("/")).toBe(false);
      }
    });
  });

  // --- Input validation ---

  describe("input validation", () => {
    it("throws INVALID_ROOT when repoRoot is a relative path", () => {
      expect(() => discoverSolidityFiles("relative/path")).toThrow(
        "ERROR: INVALID_ROOT - repoRoot must be an absolute path",
      );
    });

    it("INVALID_ROOT error follows the standard ERROR format", () => {
      expect(() => discoverSolidityFiles("relative")).toThrow(
        /^ERROR: [A-Z_]+ - .+/,
      );
    });
  });

  // --- Edge cases: unreadable root ---

  describe("unreadable root directory", () => {
    it.skipIf(isWindows || isRoot)("propagates raw filesystem error when repo root is unreadable", () => {
      chmodSync(tempDir, 0o000);

      expect(() => discoverSolidityFiles(tempDir)).toThrow(/EACCES/);

      // Restore permissions for cleanup
      chmodSync(tempDir, 0o755);
    });

    it.skipIf(isWindows || isRoot)("does not set warnings when root is unreadable", () => {
      // First: run a successful discovery to populate warnings
      writeFile(tempDir, "src/Token.sol", "// token\n");
      discoverSolidityFiles(tempDir);

      // Now make root unreadable and try again
      chmodSync(tempDir, 0o000);
      try {
        discoverSolidityFiles(tempDir);
      } catch {
        // expected
      }

      // lastWarnings should have been cleared by the upfront reset
      const warnings = getDiscoveryWarnings();
      expect(warnings).toEqual([]);

      // Restore permissions for cleanup
      chmodSync(tempDir, 0o755);
    });
  });

  // --- Warnings state isolation across error/success boundaries ---

  describe("warnings state isolation", () => {
    it("warnings from a failed call do not leak into a subsequent successful call", () => {
      // First call: empty dir triggers NO_SOLIDITY_FILES throw
      expect(() => discoverSolidityFiles(tempDir)).toThrow(
        "ERROR: NO_SOLIDITY_FILES",
      );
      const warningsAfterFail = getDiscoveryWarnings();
      expect(warningsAfterFail).toEqual([]);

      // Second call: add a .sol file for a successful run
      writeFile(tempDir, "Token.sol", "// token\n");
      discoverSolidityFiles(tempDir);
      const warningsAfterSuccess = getDiscoveryWarnings();
      expect(warningsAfterSuccess).toEqual([]);
    });
  });

  // --- getDiscoveryWarnings immutability ---

  describe("getDiscoveryWarnings immutability", () => {
    it.skipIf(isWindows || isRoot)("mutating the returned array does not affect subsequent calls", () => {
      writeFile(tempDir, "src/Token.sol", "// token\n");
      mkdirSync(join(tempDir, "restricted"), { recursive: true });
      writeFile(tempDir, "restricted/Hidden.sol", "// hidden\n");
      chmodSync(join(tempDir, "restricted"), 0o000);

      discoverSolidityFiles(tempDir);

      const warnings1 = getDiscoveryWarnings();
      expect(warnings1.length).toBeGreaterThan(0);

      // Mutate the returned array
      (warnings1 as string[]).push("injected warning");

      // Subsequent call should not include the injected warning
      const warnings2 = getDiscoveryWarnings();
      expect(warnings2).not.toContain("injected warning");
      expect(warnings2.length).toBe(warnings1.length - 1);

      // Restore permissions for cleanup
      chmodSync(join(tempDir, "restricted"), 0o755);
    });
  });

  // --- .sol extension case sensitivity ---

  describe("file extension case sensitivity", () => {
    it("only discovers lowercase .sol files, not .SOL or .Sol", () => {
      writeFile(tempDir, "Lower.sol", "// lower\n");
      writeFile(tempDir, "Upper.SOL", "// upper\n");
      writeFile(tempDir, "Mixed.Sol", "// mixed\n");

      const result = discoverSolidityFiles(tempDir);
      expect(result.length).toBe(1);
      expect(result[0]?.file).toBe("Lower.sol");
    });
  });
});
