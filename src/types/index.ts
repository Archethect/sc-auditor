/**
 * Public type exports for sc-auditor.
 */

export type {
  AccessControlModel,
  ArchitectureComponent,
  ArchitectureSummary,
  ExternalCall,
  FunctionSignature,
  FunctionVisibility,
  ProtocolType,
  RiskLevel,
  StateMutability,
  StateVariable,
} from "./architecture.js";
export type { ChecklistItem } from "./checklist.js";
export type {
  Config,
  LLMReasoningConfig,
  StaticAnalysisConfig,
  UserConfig,
} from "./config.js";
export type {
  EvidenceSource,
  EvidenceSourceType,
  Finding,
  FindingConfidence,
  FindingSeverity,
  FindingSource,
  LineRange,
} from "./finding.js";
export type {
  AuditRunMetadata,
  KnownRuntimeEventType,
  ReportStatus,
  RuntimeEventType,
  RuntimeLogEntry,
} from "./metadata.js";
export type { AuditScopeEntry, CategoryAuditSummary } from "./scope.js";
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
