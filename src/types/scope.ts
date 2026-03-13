/**
 * Risk level classification for scope entries.
 */
export type RiskLevel = "High" | "Medium" | "Low";

/**
 * An entry in the audit scope table (Appendix A).
 */
export interface AuditScopeEntry {
  file: string;
  line_count: number;
  description: string;
  risk_level: RiskLevel;
  audited: boolean;
}

/**
 * Summary of a category audit (Appendix B).
 */
export interface CategoryAuditSummary {
  category: string;
  finding_count: number;
  audited: boolean;
}
