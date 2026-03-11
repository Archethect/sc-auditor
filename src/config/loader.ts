import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Config,
  LLMReasoningConfig,
  ProofToolsConfig,
  StaticAnalysisConfig,
  VerifyConfig,
  WorkflowConfig,
  WorkflowMode,
} from "../types/config.js";
import type { FindingSeverity } from "../types/finding.js";

const VALID_SEVERITIES: ReadonlySet<string> = new Set<FindingSeverity>([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "GAS",
  "INFORMATIONAL",
]);

const VALID_WORKFLOW_MODES: ReadonlySet<string> = new Set<WorkflowMode>([
  "default",
  "deep",
  "benchmark",
]);

const DEFAULTS: Config = {
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
  workflow: {
    mode: "default",
    parallel_hunters: false,
    autonomous: false,
    require_witness_for_high: false,
  },
  proof_tools: {
    foundry_enabled: true,
    echidna_enabled: false,
    medusa_enabled: false,
    halmos_enabled: false,
    ityfuzz_enabled: false,
  },
  verify: {
    demote_unproven_medium_high: false,
  },
};

function validationError(message: string): Error {
  return new Error(`ERROR: CONFIG_VALIDATION - ${message}`);
}

/**
 * Validates that an optional field, if present, is an integer within [min, max].
 * Throws with a message containing the field name on any failure.
 */
function validateIntegerRange(
  input: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): void {
  const value = input[field];
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw validationError(
      `${field} must be an integer between ${min} and ${max}`,
    );
  }
}

/**
 * Validates that report_output_dir, if present, is a non-empty relative path
 * without '..' traversal, absolute paths, or UNC paths.
 */
function validateRelativePath(
  input: Record<string, unknown>,
  field: string,
): void {
  const value = input[field];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw validationError(`${field} must be a non-empty string`);
  }
  if (
    trimmed.split(/[/\\]/).includes("..") ||
    trimmed.startsWith("/") ||
    /^[A-Za-z]:[/\\]/.test(trimmed) ||
    trimmed.startsWith("\\\\")
  ) {
    throw validationError(
      `${field} must be a relative path without '..' traversal`,
    );
  }
}

/**
 * Validates that an optional field, if present, is a boolean.
 */
function validateBoolean(
  input: Record<string, unknown>,
  field: string,
): void {
  const value = input[field];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "boolean") {
    throw validationError(`${field} must be a boolean`);
  }
}

/**
 * Validates that an optional field, if present, is a non-empty string.
 */
function validateNonEmptyString(
  input: Record<string, unknown>,
  field: string,
): void {
  const value = input[field];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw validationError(`${field} must be a non-empty string`);
  }
}

/**
 * Validates that an optional field, if present, is a number within [min, max].
 */
function validateNumberRange(
  input: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): void {
  const value = input[field];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || value < min || value > max) {
    throw validationError(
      `${field} must be a number between ${min} and ${max}`,
    );
  }
}

/**
 * Resolves the config file path.
 * SC_AUDITOR_CONFIG env var takes precedence over the default path.
 * Returns whether the path was explicitly set via env var.
 */
function resolveConfigPath(configDir: string): { filePath: string; isExplicitPath: boolean } {
  const envPath = process.env["SC_AUDITOR_CONFIG"];
  if (envPath !== undefined) {
    return { filePath: envPath, isExplicitPath: true };
  }
  return { filePath: join(configDir, "config.json"), isExplicitPath: false };
}

/**
 * Loads a .env file from the config directory if it exists.
 * Sets environment variables that are NOT already set (env takes precedence).
 * Supports key=value format, skips blank lines and comments (#).
 * Strips surrounding quotes from values.
 */
function loadDotEnv(configDir: string): void {
  const envPath = join(configDir, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    if (key === "") {
      continue;
    }
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (must be matching pair, length >= 2)
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    // Only set if not already present in environment
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Reads and parses the config file from disk.
 * Returns empty object if file doesn't exist (config.json is optional),
 * unless SC_AUDITOR_CONFIG was explicitly set (user expects the file to exist).
 */
function readConfigFile(filePath: string, isExplicitPath: boolean): unknown {
  if (!existsSync(filePath)) {
    if (isExplicitPath) {
      throw new Error(
        "ERROR: CONFIG_MISSING - create config.json in repo root",
      );
    }
    return {};
  }

  const raw = readFileSync(filePath, "utf-8");

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      "ERROR: CONFIG_PARSE_ERROR - config.json is not valid JSON",
    );
  }
}

/**
 * Validates and normalizes the static_analysis config section.
 */
function validateStaticAnalysis(
  input: Record<string, unknown>,
): StaticAnalysisConfig {
  const section = input["static_analysis"];
  if (section === undefined) {
    return { ...DEFAULTS.static_analysis };
  }
  if (typeof section !== "object" || section === null || Array.isArray(section)) {
    throw validationError("static_analysis must be an object");
  }
  const sa = section as Record<string, unknown>;
  validateBoolean(sa, "slither_enabled");
  validateNonEmptyString(sa, "slither_path");
  validateBoolean(sa, "aderyn_enabled");
  validateNonEmptyString(sa, "aderyn_path");
  return {
    slither_enabled:
      (sa["slither_enabled"] as boolean | undefined) ??
      DEFAULTS.static_analysis.slither_enabled,
    slither_path:
      (sa["slither_path"] as string | undefined)?.trim() ??
      DEFAULTS.static_analysis.slither_path,
    aderyn_enabled:
      (sa["aderyn_enabled"] as boolean | undefined) ??
      DEFAULTS.static_analysis.aderyn_enabled,
    aderyn_path:
      (sa["aderyn_path"] as string | undefined)?.trim() ??
      DEFAULTS.static_analysis.aderyn_path,
  };
}

/**
 * Validates and normalizes the llm_reasoning config section.
 */
function validateLLMReasoning(
  input: Record<string, unknown>,
): LLMReasoningConfig {
  const section = input["llm_reasoning"];
  if (section === undefined) {
    return { ...DEFAULTS.llm_reasoning };
  }
  if (typeof section !== "object" || section === null || Array.isArray(section)) {
    throw validationError("llm_reasoning must be an object");
  }
  const lr = section as Record<string, unknown>;
  validateIntegerRange(lr, "max_functions_per_category", 1, 500);
  validateNumberRange(lr, "context_window_budget", 0.1, 1.0);
  return {
    max_functions_per_category:
      (lr["max_functions_per_category"] as number | undefined) ??
      DEFAULTS.llm_reasoning.max_functions_per_category,
    context_window_budget:
      (lr["context_window_budget"] as number | undefined) ??
      DEFAULTS.llm_reasoning.context_window_budget,
  };
}

/**
 * Validates and normalizes the workflow config section.
 */
function validateWorkflow(
  input: Record<string, unknown>,
): WorkflowConfig {
  const section = input["workflow"];
  if (section === undefined) {
    return { ...DEFAULTS.workflow };
  }
  if (typeof section !== "object" || section === null || Array.isArray(section)) {
    throw validationError("workflow must be an object");
  }
  const wf = section as Record<string, unknown>;
  if (wf["mode"] !== undefined) {
    if (typeof wf["mode"] !== "string" || !VALID_WORKFLOW_MODES.has(wf["mode"])) {
      throw validationError(
        `workflow.mode must be one of: ${[...VALID_WORKFLOW_MODES].join(", ")}`,
      );
    }
  }
  validateBoolean(wf, "parallel_hunters");
  validateBoolean(wf, "autonomous");
  validateBoolean(wf, "require_witness_for_high");
  return {
    mode:
      (wf["mode"] as WorkflowMode | undefined) ??
      DEFAULTS.workflow.mode,
    parallel_hunters:
      (wf["parallel_hunters"] as boolean | undefined) ??
      DEFAULTS.workflow.parallel_hunters,
    autonomous:
      (wf["autonomous"] as boolean | undefined) ??
      DEFAULTS.workflow.autonomous,
    require_witness_for_high:
      (wf["require_witness_for_high"] as boolean | undefined) ??
      DEFAULTS.workflow.require_witness_for_high,
  };
}

/**
 * Validates and normalizes the proof_tools config section.
 */
function validateProofTools(
  input: Record<string, unknown>,
): ProofToolsConfig {
  const section = input["proof_tools"];
  if (section === undefined) {
    return { ...DEFAULTS.proof_tools };
  }
  if (typeof section !== "object" || section === null || Array.isArray(section)) {
    throw validationError("proof_tools must be an object");
  }
  const pt = section as Record<string, unknown>;
  validateBoolean(pt, "foundry_enabled");
  validateBoolean(pt, "echidna_enabled");
  validateBoolean(pt, "medusa_enabled");
  validateBoolean(pt, "halmos_enabled");
  validateBoolean(pt, "ityfuzz_enabled");
  return {
    foundry_enabled:
      (pt["foundry_enabled"] as boolean | undefined) ??
      DEFAULTS.proof_tools.foundry_enabled,
    echidna_enabled:
      (pt["echidna_enabled"] as boolean | undefined) ??
      DEFAULTS.proof_tools.echidna_enabled,
    medusa_enabled:
      (pt["medusa_enabled"] as boolean | undefined) ??
      DEFAULTS.proof_tools.medusa_enabled,
    halmos_enabled:
      (pt["halmos_enabled"] as boolean | undefined) ??
      DEFAULTS.proof_tools.halmos_enabled,
    ityfuzz_enabled:
      (pt["ityfuzz_enabled"] as boolean | undefined) ??
      DEFAULTS.proof_tools.ityfuzz_enabled,
  };
}

/**
 * Validates and normalizes the verify config section.
 * In benchmark mode, demote_unproven_medium_high defaults to true.
 */
function validateVerify(
  input: Record<string, unknown>,
  workflowMode: WorkflowMode,
): VerifyConfig {
  const isBenchmark = workflowMode === "benchmark";
  const defaultDemote = isBenchmark ? true : DEFAULTS.verify.demote_unproven_medium_high;

  const section = input["verify"];
  if (section === undefined) {
    return { demote_unproven_medium_high: defaultDemote };
  }
  if (typeof section !== "object" || section === null || Array.isArray(section)) {
    throw validationError("verify must be an object");
  }
  const v = section as Record<string, unknown>;
  validateBoolean(v, "demote_unproven_medium_high");
  return {
    demote_unproven_medium_high:
      (v["demote_unproven_medium_high"] as boolean | undefined) ??
      defaultDemote,
  };
}

/**
 * Validates and normalizes raw config input into a fully resolved Config object.
 */
function validateAndNormalize(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      "ERROR: CONFIG_INVALID - config must be a JSON object",
    );
  }

  const input = { ...(raw as Record<string, unknown>) };

  // Validate default_severity if provided
  if (input["default_severity"] !== undefined) {
    if (!Array.isArray(input["default_severity"])) {
      throw validationError(
        "default_severity must be an array of severity values",
      );
    }
    if (input["default_severity"].length === 0) {
      throw validationError(
        "default_severity must contain at least one severity value",
      );
    }
    for (const val of input["default_severity"]) {
      if (typeof val !== "string" || !VALID_SEVERITIES.has(val)) {
        throw validationError(
          `default_severity contains invalid value '${String(val)}'; allowed: ${[...VALID_SEVERITIES].join(", ")}`,
        );
      }
    }
  }

  validateIntegerRange(input, "default_quality_score", 1, 5);
  validateRelativePath(input, "report_output_dir");
  validateIntegerRange(input, "max_findings_per_category", 1, 1000);
  validateIntegerRange(input, "max_deep_dives", 1, 100);

  const static_analysis = validateStaticAnalysis(input);
  const llm_reasoning = validateLLMReasoning(input);
  const workflow = validateWorkflow(input);
  const proof_tools = validateProofTools(input);
  const verify = validateVerify(input, workflow.mode);

  return {
    default_severity:
      (input["default_severity"] as Config["default_severity"]) ??
      DEFAULTS.default_severity,
    default_quality_score:
      (input["default_quality_score"] as number) ??
      DEFAULTS.default_quality_score,
    report_output_dir:
      (input["report_output_dir"] as string | undefined)?.trim() ??
      DEFAULTS.report_output_dir,
    max_findings_per_category:
      (input["max_findings_per_category"] as number) ??
      DEFAULTS.max_findings_per_category,
    max_deep_dives:
      (input["max_deep_dives"] as number) ?? DEFAULTS.max_deep_dives,
    static_analysis,
    llm_reasoning,
    workflow,
    proof_tools,
    verify,
  };
}

/**
 * Loads, validates, and normalizes the sc-auditor configuration.
 *
 * Resolution order:
 * 1. .env file in configDir is loaded (env vars take precedence over .env)
 * 2. SC_AUDITOR_CONFIG env var overrides config file path
 * 3. config.json is optional; missing file returns defaults
 * 4. Missing optional fields receive documented defaults
 *
 * @param configDir - Directory to look for config.json and .env (defaults to CWD)
 * @throws Error with "ERROR: <TYPE> - <message>" format on any failure
 */
export function loadConfig(configDir: string = process.cwd()): Config {
  loadDotEnv(configDir);
  const { filePath, isExplicitPath } = resolveConfigPath(configDir);
  const raw = readConfigFile(filePath, isExplicitPath);
  return validateAndNormalize(raw);
}
