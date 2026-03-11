/**
 * Public type exports for sc-auditor.
 */

export type {
  AccessControlModel,
  ArchitectureComponent,
  ArchitectureSummary,
  AuthSurface,
  ConfigSemantic,
  ConfigSemanticConflict,
  ConfigSemanticUnit,
  ExternalCall,
  ExternalCallSite,
  ExternalCallType,
  FunctionSignature,
  FunctionVisibility,
  InvariantScope,
  ProtocolInvariant,
  ProtocolType,
  RiskLevel,
  StateMutability,
  StateVariable,
  StateWriteSite,
  StateWriteType,
  StaticSummary,
  SystemMapArtifact,
  ValueFlowEdge,
  ValueFlowType,
} from "./architecture.js";
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
  DetectorCategory,
  EvidenceSource,
  EvidenceSourceType,
  Finding,
  FindingConfidence,
  FindingSeverity,
  FindingSource,
  FindingStatus,
  LineRange,
  ProofType,
} from "./finding.js";
export type {
  Hotspot,
  HotspotEvidence,
  HotspotLane,
  HotspotPriority,
} from "./hotspot.js";
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
export type {
  JudgeVerdict,
  SkepticVerdict,
  VerificationArtifact,
} from "./verification.js";
