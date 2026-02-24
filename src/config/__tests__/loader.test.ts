import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../loader.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "sc-auditor-test-"));
}

function writeConfig(dir: string, content: unknown): void {
  writeFileSync(join(dir, "config.json"), JSON.stringify(content), "utf-8");
}

function writeDotEnv(dir: string, content: string): void {
  writeFileSync(join(dir, ".env"), content, "utf-8");
}

describe("loadConfig", () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tempDir = makeTempDir();
    savedEnv["SC_AUDITOR_CONFIG"] = process.env["SC_AUDITOR_CONFIG"];
    savedEnv["SOLODIT_API_KEY"] = process.env["SOLODIT_API_KEY"];
    delete process.env["SC_AUDITOR_CONFIG"];
    delete process.env["SOLODIT_API_KEY"];
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  // --- Optional config.json ---

  describe("optional config.json", () => {
    it("returns defaults when config.json does not exist", () => {
      const config = loadConfig(tempDir);
      expect(config).toEqual({
        default_severity: ["CRITICAL", "HIGH", "MEDIUM"],
        default_quality_score: 2,
        report_output_dir: "audits",
        max_findings_per_category: 10,
        max_deep_dives: 5,
        static_analysis: {
          slither_enabled: true,
          slither_path: "slither",
          aderyn_enabled: true,
          aderyn_path: "aderyn",
        },
        llm_reasoning: {
          max_functions_per_category: 50,
          context_window_budget: 0.7,
        },
      });
    });

    it("throws CONFIG_MISSING when SC_AUDITOR_CONFIG points to non-existent file", () => {
      process.env["SC_AUDITOR_CONFIG"] = join(tempDir, "nonexistent.json");
      expect(() => loadConfig(tempDir)).toThrow(
        "ERROR: CONFIG_MISSING - create config.json in repo root",
      );
    });
  });

  // --- AC1: Invalid config yields a clear error message and process exits (fail-fast) ---

  describe("AC1: invalid config yields clear error and fail-fast", () => {
    it("exits with CONFIG_PARSE_ERROR when config file is not valid JSON", () => {
      writeFileSync(join(tempDir, "config.json"), "not json {{{", "utf-8");
      expect(() => loadConfig(tempDir)).toThrow("ERROR: CONFIG_PARSE_ERROR");
    });

    it("all error messages follow the ERROR: <TYPE> - <message> format", () => {
      process.env["SC_AUDITOR_CONFIG"] = join(tempDir, "nonexistent.json");
      expect(() => loadConfig(tempDir)).toThrow(
        /^ERROR: [A-Z_]+ - .+/,
      );
    });
  });

  // --- AC4: Invalid default_severity entries cause validation failure ---

  describe("AC4: invalid default_severity entries cause validation failure", () => {
    it("fails when default_severity contains invalid enum values", () => {
      writeConfig(tempDir, {
        default_severity: ["HIGH", "INVALID_VALUE"],
      });
      expect(() => loadConfig(tempDir)).toThrow("default_severity");
    });

    it("fails when default_severity contains non-string values", () => {
      writeConfig(tempDir, {
        default_severity: ["HIGH", 42],
      });
      expect(() => loadConfig(tempDir)).toThrow("default_severity");
    });

    it("fails when default_severity is not an array", () => {
      writeConfig(tempDir, {
        default_severity: "HIGH",
      });
      expect(() => loadConfig(tempDir)).toThrow("default_severity");
    });
  });

  // --- AC2: Valid config returns normalized config with defaults ---

  describe("AC2: valid config returns normalized config with all defaults", () => {
    it("returns a full Config object with defaults applied for minimal valid input", () => {
      writeConfig(tempDir, {});
      const config = loadConfig(tempDir);
      expect(config).toEqual({
        default_severity: ["CRITICAL", "HIGH", "MEDIUM"],
        default_quality_score: 2,
        report_output_dir: "audits",
        max_findings_per_category: 10,
        max_deep_dives: 5,
        static_analysis: {
          slither_enabled: true,
          slither_path: "slither",
          aderyn_enabled: true,
          aderyn_path: "aderyn",
        },
        llm_reasoning: {
          max_functions_per_category: 50,
          context_window_budget: 0.7,
        },
      });
    });

    it("preserves user-provided values and only fills missing defaults", () => {
      writeConfig(tempDir, {
        default_severity: ["LOW"],
        max_deep_dives: 3,
      });
      const config = loadConfig(tempDir);
      expect(config.default_severity).toEqual(["LOW"]);
      expect(config.max_deep_dives).toBe(3);
      // Defaults still applied for unset fields
      expect(config.default_quality_score).toBe(2);
      expect(config.report_output_dir).toBe("audits");
      expect(config.max_findings_per_category).toBe(10);
    });

    it("ignores extra/unknown fields in config", () => {
      writeConfig(tempDir, {
        unknown_field: "should be ignored",
        another_extra: 42,
      });
      const config = loadConfig(tempDir);
      expect((config as unknown as Record<string, unknown>)["unknown_field"]).toBeUndefined();
    });
  });

  // --- AC5: Optional fields default correctly when omitted ---

  describe("AC5: optional fields default correctly when omitted", () => {
    it("report_output_dir defaults to 'audits'", () => {
      writeConfig(tempDir, {});
      expect(loadConfig(tempDir).report_output_dir).toBe("audits");
    });

    it("max_findings_per_category defaults to 10", () => {
      writeConfig(tempDir, {});
      expect(loadConfig(tempDir).max_findings_per_category).toBe(10);
    });

    it("max_deep_dives defaults to 5", () => {
      writeConfig(tempDir, {});
      expect(loadConfig(tempDir).max_deep_dives).toBe(5);
    });

    it("default_severity defaults to [CRITICAL, HIGH, MEDIUM]", () => {
      writeConfig(tempDir, {});
      expect(loadConfig(tempDir).default_severity).toEqual([
        "CRITICAL",
        "HIGH",
        "MEDIUM",
      ]);
    });

    it("default_quality_score defaults to 2", () => {
      writeConfig(tempDir, {});
      expect(loadConfig(tempDir).default_quality_score).toBe(2);
    });
  });

  // --- Env var precedence ---

  describe("env var precedence", () => {
    it("SC_AUDITOR_CONFIG overrides config file path", () => {
      const altDir = makeTempDir();
      try {
        writeConfig(altDir, { max_deep_dives: 42 });
        process.env["SC_AUDITOR_CONFIG"] = join(altDir, "config.json");
        const config = loadConfig(tempDir);
        expect(config.max_deep_dives).toBe(42);
      } finally {
        rmSync(altDir, { recursive: true, force: true });
      }
    });
  });

  // --- .env file loading ---

  describe(".env file loading", () => {
    it("loads key=value pairs from .env file", () => {
      writeDotEnv(tempDir, "SOLODIT_API_KEY=from-dotenv\n");
      loadConfig(tempDir);
      expect(process.env["SOLODIT_API_KEY"]).toBe("from-dotenv");
    });

    it("skips blank lines and comments", () => {
      writeDotEnv(tempDir, "\n# comment\n\nSOLODIT_API_KEY=value\n\n");
      loadConfig(tempDir);
      expect(process.env["SOLODIT_API_KEY"]).toBe("value");
    });

    it("strips surrounding double quotes from values", () => {
      writeDotEnv(tempDir, 'SOLODIT_API_KEY="quoted-value"\n');
      loadConfig(tempDir);
      expect(process.env["SOLODIT_API_KEY"]).toBe("quoted-value");
    });

    it("strips surrounding single quotes from values", () => {
      writeDotEnv(tempDir, "SOLODIT_API_KEY='single-quoted'\n");
      loadConfig(tempDir);
      expect(process.env["SOLODIT_API_KEY"]).toBe("single-quoted");
    });

    it("does not override existing env vars", () => {
      process.env["SOLODIT_API_KEY"] = "from-real-env";
      writeDotEnv(tempDir, "SOLODIT_API_KEY=from-dotenv\n");
      loadConfig(tempDir);
      expect(process.env["SOLODIT_API_KEY"]).toBe("from-real-env");
    });

    it("does not fail when .env file does not exist", () => {
      expect(() => loadConfig(tempDir)).not.toThrow();
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("fails when default_quality_score is a string", () => {
      writeConfig(tempDir, {
        default_quality_score: "high",
      });
      expect(() => loadConfig(tempDir)).toThrow("default_quality_score");
    });

    it("fails when default_quality_score is null", () => {
      writeConfig(tempDir, {
        default_quality_score: null,
      });
      expect(() => loadConfig(tempDir)).toThrow("default_quality_score");
    });

    it("preserves default_quality_score of 1 (minimum valid)", () => {
      writeConfig(tempDir, { default_quality_score: 1 });
      expect(loadConfig(tempDir).default_quality_score).toBe(1);
    });

    it("preserves default_quality_score of 5 (maximum valid)", () => {
      writeConfig(tempDir, { default_quality_score: 5 });
      expect(loadConfig(tempDir).default_quality_score).toBe(5);
    });

    it("fails when default_quality_score is 0 (below range)", () => {
      writeConfig(tempDir, { default_quality_score: 0 });
      expect(() => loadConfig(tempDir)).toThrow("default_quality_score");
    });

    it("fails when default_quality_score is 6 (above range)", () => {
      writeConfig(tempDir, { default_quality_score: 6 });
      expect(() => loadConfig(tempDir)).toThrow("default_quality_score");
    });

    it("fails when default_quality_score is fractional", () => {
      writeConfig(tempDir, {
        default_quality_score: 2.5,
      });
      expect(() => loadConfig(tempDir)).toThrow("default_quality_score");
    });

    it("fails when max_findings_per_category is null", () => {
      writeConfig(tempDir, {
        max_findings_per_category: null,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_findings_per_category");
    });

    it("fails when max_deep_dives is null", () => {
      writeConfig(tempDir, {
        max_deep_dives: null,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_deep_dives");
    });

    it("fails when max_findings_per_category is negative", () => {
      writeConfig(tempDir, {
        max_findings_per_category: -1,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_findings_per_category");
    });

    it("fails when max_findings_per_category is zero", () => {
      writeConfig(tempDir, {
        max_findings_per_category: 0,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_findings_per_category");
    });

    it("fails when max_findings_per_category is a string", () => {
      writeConfig(tempDir, {
        max_findings_per_category: "ten",
      });
      expect(() => loadConfig(tempDir)).toThrow("max_findings_per_category");
    });

    it("fails when max_findings_per_category is fractional", () => {
      writeConfig(tempDir, {
        max_findings_per_category: 5.5,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_findings_per_category");
    });

    it("fails when max_findings_per_category exceeds upper bound (1000)", () => {
      writeConfig(tempDir, {
        max_findings_per_category: 1001,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_findings_per_category");
    });

    it("accepts max_findings_per_category at upper bound (1000)", () => {
      writeConfig(tempDir, {
        max_findings_per_category: 1000,
      });
      expect(loadConfig(tempDir).max_findings_per_category).toBe(1000);
    });

    it("fails when max_deep_dives is fractional", () => {
      writeConfig(tempDir, {
        max_deep_dives: 2.5,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_deep_dives");
    });

    it("fails when max_deep_dives is negative", () => {
      writeConfig(tempDir, {
        max_deep_dives: -1,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_deep_dives");
    });

    it("fails when max_deep_dives is zero", () => {
      writeConfig(tempDir, {
        max_deep_dives: 0,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_deep_dives");
    });

    it("fails when max_deep_dives is a boolean", () => {
      writeConfig(tempDir, {
        max_deep_dives: true,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_deep_dives");
    });

    it("fails when max_deep_dives exceeds upper bound (100)", () => {
      writeConfig(tempDir, {
        max_deep_dives: 101,
      });
      expect(() => loadConfig(tempDir)).toThrow("max_deep_dives");
    });

    it("accepts max_deep_dives at upper bound (100)", () => {
      writeConfig(tempDir, {
        max_deep_dives: 100,
      });
      expect(loadConfig(tempDir).max_deep_dives).toBe(100);
    });

    it("fails when report_output_dir is a number", () => {
      writeConfig(tempDir, {
        report_output_dir: 42,
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir contains path traversal", () => {
      writeConfig(tempDir, {
        report_output_dir: "../../../etc",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir contains embedded path traversal", () => {
      writeConfig(tempDir, {
        report_output_dir: "foo/../bar",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir contains Windows backslash embedded traversal", () => {
      writeConfig(tempDir, {
        report_output_dir: "foo\\..\\bar",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir is an empty string", () => {
      writeConfig(tempDir, {
        report_output_dir: "",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir is an absolute path", () => {
      writeConfig(tempDir, {
        report_output_dir: "/tmp/output",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir is a Windows absolute path", () => {
      writeConfig(tempDir, {
        report_output_dir: "C:\\output",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir is a Windows drive path with forward slash", () => {
      writeConfig(tempDir, {
        report_output_dir: "D:/reports",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir is a UNC path", () => {
      writeConfig(tempDir, {
        report_output_dir: "\\\\server\\share",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when report_output_dir is whitespace only", () => {
      writeConfig(tempDir, {
        report_output_dir: "   ",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("trims report_output_dir with surrounding whitespace", () => {
      writeConfig(tempDir, {
        report_output_dir: "  custom-dir  ",
      });
      expect(loadConfig(tempDir).report_output_dir).toBe("custom-dir");
    });

    it("fails when report_output_dir has whitespace-prefixed path traversal", () => {
      writeConfig(tempDir, {
        report_output_dir: "  ../secret",
      });
      expect(() => loadConfig(tempDir)).toThrow("report_output_dir");
    });

    it("fails when default_severity is an empty array", () => {
      writeConfig(tempDir, {
        default_severity: [],
      });
      expect(() => loadConfig(tempDir)).toThrow("default_severity");
    });

    it("fails when default_severity contains lowercase values", () => {
      writeConfig(tempDir, {
        default_severity: ["critical"],
      });
      expect(() => loadConfig(tempDir)).toThrow("default_severity");
    });

    it("fails when default_severity contains mixed-case values", () => {
      writeConfig(tempDir, {
        default_severity: ["Critical"],
      });
      expect(() => loadConfig(tempDir)).toThrow("default_severity");
    });

    it("accepts default_severity with duplicate valid values", () => {
      writeConfig(tempDir, {
        default_severity: ["HIGH", "HIGH"],
      });
      const config = loadConfig(tempDir);
      expect(config.default_severity).toEqual(["HIGH", "HIGH"]);
    });

    it("fails with CONFIG_INVALID when root is an array", () => {
      writeFileSync(join(tempDir, "config.json"), "[1,2]", "utf-8");
      expect(() => loadConfig(tempDir)).toThrow("ERROR: CONFIG_INVALID");
    });

    it("fails with CONFIG_INVALID when root is a string", () => {
      writeFileSync(join(tempDir, "config.json"), '"hello"', "utf-8");
      expect(() => loadConfig(tempDir)).toThrow("ERROR: CONFIG_INVALID");
    });

    it("CONFIG_INVALID error follows ERROR: <TYPE> - <message> format", () => {
      writeFileSync(join(tempDir, "config.json"), "[1,2]", "utf-8");
      expect(() => loadConfig(tempDir)).toThrow(/^ERROR: [A-Z_]+ - .+/);
    });
  });
});
