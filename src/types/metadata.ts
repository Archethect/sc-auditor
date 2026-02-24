import type { FindingSeverity } from "./finding.js";

/**
 * Report status indicating completeness.
 */
export type ReportStatus = "Complete" | "Partial";

/**
 * Metadata for a single audit run (Appendix E).
 */
export interface AuditRunMetadata {
  repo_name: string;
  commit_hash: string;
  /** ISO 8601 date */
  date: string;
  /** Files/directories in scope */
  scope: string[];
  severity_filter: FindingSeverity[];
  report_status: ReportStatus;
}

/**
 * Known runtime event types for structured logging.
 * Use this narrower type when exhaustive switch/case matching is needed.
 */
export type KnownRuntimeEventType =
  | "agent_start"
  | "agent_complete"
  | "category_start"
  | "category_complete"
  | "error"
  | "progress";

/**
 * Accepts known events with autocomplete, plus arbitrary custom strings.
 * For exhaustive matching, narrow to {@link KnownRuntimeEventType}.
 */
export type RuntimeEventType = KnownRuntimeEventType | (string & {});

/**
 * A single runtime log entry (Appendix E).
 */
export interface RuntimeLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  event_type: RuntimeEventType;
  message: string;
}
