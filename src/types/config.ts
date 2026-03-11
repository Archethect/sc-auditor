import type { FindingSeverity } from "./finding.js";

/**
 * Workflow mode controlling audit depth and verification strictness.
 *
 * - default: Standard audit workflow.
 * - deep: Extended analysis with more thorough coverage.
 * - benchmark: Strict mode with gating rules for high-severity findings.
 */
export type WorkflowMode = "default" | "deep" | "benchmark";

/**
 * Configuration for static analysis tools (Slither + Aderyn).
 */
export interface StaticAnalysisConfig {
  /** Whether to run Slither. Default: true */
  slither_enabled: boolean;
  /** Path to the Slither binary. Default: "slither" */
  slither_path: string;
  /** Whether to run Aderyn. Default: true */
  aderyn_enabled: boolean;
  /** Path to the Aderyn binary. Default: "aderyn" */
  aderyn_path: string;
}

/**
 * Configuration for LLM reasoning layer.
 */
export interface LLMReasoningConfig {
  /** Max functions to analyze per category. Range: 1-500. Default: 50 */
  max_functions_per_category: number;
  /** Fraction of context window to use for function analysis. Range: 0.1-1.0. Default: 0.7 */
  context_window_budget: number;
}

/**
 * Configuration for the audit workflow mode and behavior.
 */
export interface WorkflowConfig {
  /** Workflow mode. Default: "default" */
  mode: WorkflowMode;
  /** Whether to run hunter agents in parallel. Default: false */
  parallel_hunters: boolean;
  /** Whether the audit runs autonomously without user prompts. Default: false */
  autonomous: boolean;
  /** Whether high-severity findings require a witness/PoC. Default: false */
  require_witness_for_high: boolean;
}

/**
 * Configuration for proof/verification tool availability.
 */
export interface ProofToolsConfig {
  /** Whether Foundry is available for PoC generation. Default: true */
  foundry_enabled: boolean;
  /** Whether Echidna is available for fuzzing. Default: false */
  echidna_enabled: boolean;
  /** Whether Medusa is available for fuzzing. Default: false */
  medusa_enabled: boolean;
  /** Whether Halmos is available for symbolic execution. Default: false */
  halmos_enabled: boolean;
  /** Whether ItyFuzz is available for fuzzing. Default: false */
  ityfuzz_enabled: boolean;
}

/**
 * Configuration for finding verification behavior.
 */
export interface VerifyConfig {
  /**
   * Whether to demote unproven medium/high findings to informational.
   * Default: false (true in benchmark mode).
   */
  demote_unproven_medium_high: boolean;
}

/**
 * Fully-resolved configuration for the sc-auditor plugin.
 * All fields are required -- defaults have been applied.
 */
export interface Config {
  default_severity: FindingSeverity[];
  /** Range: 1-5. Default: 2 */
  default_quality_score: number;
  /** Default: "audits" */
  report_output_dir: string;
  /** Range: 1-1000. Default: 10 */
  max_findings_per_category: number;
  /** Range: 1-100. Default: 5 */
  max_deep_dives: number;
  /** Static analysis tool configuration */
  static_analysis: StaticAnalysisConfig;
  /** LLM reasoning layer configuration */
  llm_reasoning: LLMReasoningConfig;
  /** Workflow mode and behavior configuration */
  workflow: WorkflowConfig;
  /** Proof tool availability configuration */
  proof_tools: ProofToolsConfig;
  /** Finding verification behavior configuration */
  verify: VerifyConfig;
}

/**
 * User-provided configuration input.
 * All fields are optional and fall back to documented defaults when omitted.
 *
 * Note: The loader validates from `unknown` at runtime (not from UserConfig)
 * to handle arbitrary JSON input safely. This type is exported for external
 * consumers who want compile-time type checking on config objects.
 */
export type UserConfig = Partial<Config>;
