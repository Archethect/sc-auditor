/**
 * Public type exports for sc-auditor.
 *
 * v0.4.0: Removed architecture.ts, hotspot.ts, verification.ts, metadata.ts
 * (now prompt-driven). Added tools.ts consolidation.
 */

export type { ChecklistItem } from "./checklist.js";
export type {
  Config,
  LLMReasoningConfig,
  ProofToolsConfig,
  StaticAnalysisConfig,
  UserConfig,
  VerifyConfig,
  WorkflowConfig,
  WorkflowMode,
} from "./config.js";
export type {
  DaChain,
  DaDimension,
  DaMitigation,
  DaResult,
  DetectorCategory,
  EvidenceSource,
  EvidenceSourceType,
  ExploitSketch,
  Finding,
  FindingConfidence,
  FindingSeverity,
  FindingSource,
  FindingStatus,
  LineRange,
  ProofType,
} from "./finding.js";
export type { AuditScopeEntry, CategoryAuditSummary, RiskLevel } from "./scope.js";
export type {
  SoloditFinding,
  SoloditSearchResult,
  SoloditSeverity,
} from "./solodit.js";
export type {
  SlitherDetectorResult,
  SlitherElement,
  ToolAvailability,
  ToolStatus,
} from "./static-analysis.js";
