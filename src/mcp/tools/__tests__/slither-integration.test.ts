/**
 * Real Slither integration tests.
 *
 * These tests execute actual Slither commands against test fixtures.
 * Requires slither-analyzer to be installed: pip install slither-analyzer
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { executeSlither } from "../slither-executor.js";

/** Path to test fixtures directory. */
const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

describe("Real Slither integration tests", () => {
  describe("executeSlither with real Slither", () => {
    it("detects reentrancy in VulnerableVault.sol", async () => {
      const result = await executeSlither(FIXTURES_DIR);

      expect(result.success).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);

      // Slither should detect reentrancy vulnerability
      const reentrancyFinding = result.findings.find(
        (f) => f.title.includes("reentrancy") || f.detector_id?.includes("reentrancy"),
      );
      expect(reentrancyFinding).toBeDefined();
      expect(reentrancyFinding?.severity).toMatch(/HIGH|MEDIUM/);
      expect(reentrancyFinding?.source).toBe("slither");
    });

    it("extracts affected files from findings", async () => {
      const result = await executeSlither(FIXTURES_DIR);

      expect(result.success).toBe(true);
      const findingWithFiles = result.findings.find((f) => f.affected_files.length > 0);
      expect(findingWithFiles).toBeDefined();
      expect(findingWithFiles?.affected_files[0]).toContain("VulnerableVault.sol");
    });

    it("extracts line numbers from findings", async () => {
      const result = await executeSlither(FIXTURES_DIR);

      expect(result.success).toBe(true);
      const findingWithLines = result.findings.find(
        (f) => f.affected_lines.start > 0 && f.affected_lines.end > 0,
      );
      expect(findingWithLines).toBeDefined();
      expect(findingWithLines?.affected_lines.start).toBeGreaterThan(0);
      expect(findingWithLines?.affected_lines.end).toBeGreaterThanOrEqual(
        findingWithLines?.affected_lines.start ?? 0,
      );
    });

    it("includes evidence_sources with slither tool", async () => {
      const result = await executeSlither(FIXTURES_DIR);

      expect(result.success).toBe(true);
      for (const finding of result.findings) {
        expect(finding.evidence_sources).toHaveLength(1);
        expect(finding.evidence_sources[0].type).toBe("static_analysis");
        expect(finding.evidence_sources[0].tool).toBe("slither");
      }
    });

    it("detects unchecked low-level call", async () => {
      const result = await executeSlither(FIXTURES_DIR);

      expect(result.success).toBe(true);
      // Slither should detect low-level-calls issue from unsafeTransfer
      const lowLevelFinding = result.findings.find(
        (f) =>
          f.title.includes("low-level") ||
          f.detector_id?.includes("low-level") ||
          f.description?.toLowerCase().includes("low-level"),
      );
      expect(lowLevelFinding).toBeDefined();
    });
  });
});
