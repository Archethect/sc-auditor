/**
 * Real Aderyn integration tests.
 *
 * These tests execute actual Aderyn commands against test fixtures.
 * Requires aderyn to be installed: cargo install aderyn
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { executeAderyn } from "../aderyn-executor.js";

/** Path to test fixtures directory. */
const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

describe("Real Aderyn integration tests", () => {
  describe("executeAderyn with real Aderyn", () => {
    it("detects vulnerabilities in VulnerableVault.sol", async () => {
      const result = await executeAderyn(FIXTURES_DIR);

      // Print error for debugging if execution failed
      if (!result.success) {
        console.error("Aderyn execution failed:", result.error);
      }
      expect(result.success, `Expected success but got error: ${result.error}`).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);

      // All findings should have aderyn as source
      for (const finding of result.findings) {
        expect(finding.source).toBe("aderyn");
      }
    });

    it("extracts affected files from findings", async () => {
      const result = await executeAderyn(FIXTURES_DIR);

      expect(result.success, `Expected success but got error: ${result.error}`).toBe(true);
      const findingWithFiles = result.findings.find((f) => f.affected_files.length > 0);
      expect(findingWithFiles).toBeDefined();
      expect(findingWithFiles?.affected_files[0]).toContain("VulnerableVault.sol");
    });

    it("extracts line numbers from findings", async () => {
      const result = await executeAderyn(FIXTURES_DIR);

      expect(result.success, `Expected success but got error: ${result.error}`).toBe(true);
      const findingWithLines = result.findings.find(
        (f) => f.affected_lines.start > 0 && f.affected_lines.end > 0,
      );
      expect(findingWithLines).toBeDefined();
      expect(findingWithLines?.affected_lines.start).toBeGreaterThan(0);
      expect(findingWithLines?.affected_lines.end).toBeGreaterThanOrEqual(
        findingWithLines?.affected_lines.start ?? 0,
      );
    });

    it("includes evidence_sources with aderyn tool", async () => {
      const result = await executeAderyn(FIXTURES_DIR);

      expect(result.success, `Expected success but got error: ${result.error}`).toBe(true);
      for (const finding of result.findings) {
        expect(finding.evidence_sources).toHaveLength(1);
        expect(finding.evidence_sources[0].type).toBe("static_analysis");
        expect(finding.evidence_sources[0].tool).toBe("aderyn");
      }
    });

    it("maps findings to correct severity levels", async () => {
      const result = await executeAderyn(FIXTURES_DIR);

      expect(result.success, `Expected success but got error: ${result.error}`).toBe(true);
      // Aderyn only has HIGH and LOW severity
      for (const finding of result.findings) {
        expect(["HIGH", "LOW"]).toContain(finding.severity);
      }
    });
  });
});
