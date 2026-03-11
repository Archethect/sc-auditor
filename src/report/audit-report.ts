/**
 * Structured audit report builder.
 *
 * Partitions findings into scored, research candidate, and discarded
 * buckets based on verification status, proof evidence, and workflow mode.
 * Benchmark mode enforces strict gating: HIGH/MEDIUM findings without
 * proof are excluded from scored findings even if status is "verified".
 */

import type { SystemMapArtifact, StaticSummary } from "../types/architecture.js";
import type { WorkflowMode } from "../types/config.js";
import type { Finding } from "../types/finding.js";

/**
 * Summary of the system map for the report metadata.
 */
export interface SystemMapSummary {
  component_count: number;
  invariant_count: number;
  external_surface_count: number;
  config_conflict_count: number;
}

/**
 * Report metadata with workflow mode and finding counts.
 */
export interface ReportMetadata {
  workflow_mode: WorkflowMode;
  total_findings: number;
  verified_count: number;
  candidate_count: number;
  discarded_count: number;
  generated_at: string;
}

/**
 * Structured audit report with partitioned findings and summaries.
 */
export interface AuditReport {
  scored_findings: Finding[];
  research_candidates: Finding[];
  discarded_hypotheses: Finding[];
  static_analysis_summary: StaticSummary;
  system_map_summary: SystemMapSummary;
  metadata: ReportMetadata;
}

/**
 * Determines whether a finding qualifies for the scored section.
 *
 * In benchmark mode, a finding must be verified AND have proof.
 * In default/deep mode, only verified status is required.
 */
function isScoredFinding(finding: Finding, isBenchmark: boolean): boolean {
  if (finding.status !== "verified") {
    return false;
  }

  if (!isBenchmark) {
    return true;
  }

  const isHighOrMedium = finding.severity === "HIGH" || finding.severity === "MEDIUM";
  const hasProof = finding.proof_type !== undefined && finding.proof_type !== "none";

  if (isHighOrMedium && !hasProof) {
    return false;
  }

  return true;
}

/**
 * Determines whether a finding belongs in the discarded section.
 */
function isDiscardedFinding(finding: Finding): boolean {
  return finding.status === "discarded";
}

/**
 * Counts config semantic conflicts across all config semantics.
 */
function countConfigConflicts(artifact: SystemMapArtifact): number {
  let count = 0;
  for (const semantic of artifact.config_semantics) {
    count += semantic.conflicts_with?.length ?? 0;
  }
  return count;
}

/**
 * Extracts a system map summary from the full artifact.
 */
function buildSystemMapSummary(artifact: SystemMapArtifact): SystemMapSummary {
  return {
    component_count: artifact.components.length,
    invariant_count: artifact.protocol_invariants.length,
    external_surface_count: artifact.external_surfaces.length,
    config_conflict_count: countConfigConflicts(artifact),
  };
}

/**
 * Builds a structured audit report from findings, system map, and workflow mode.
 *
 * Partitions findings into three buckets:
 * - **Scored Findings**: Verified findings (benchmark mode requires proof for HIGH/MEDIUM).
 * - **Research Candidates**: Candidate findings, unset status, or benchmark-demoted verified findings.
 * - **Discarded Hypotheses**: Explicitly discarded findings.
 *
 * @param findings - All findings from the audit
 * @param artifact - System map artifact from the MAP phase
 * @param mode - Workflow mode (default, deep, or benchmark)
 * @returns Structured audit report
 */
export function buildAuditReport(
  findings: Finding[],
  artifact: SystemMapArtifact,
  mode: WorkflowMode,
): AuditReport {
  const isBenchmark = mode === "benchmark";

  const scoredFindings: Finding[] = [];
  const researchCandidates: Finding[] = [];
  const discardedHypotheses: Finding[] = [];

  for (const finding of findings) {
    if (isDiscardedFinding(finding)) {
      discardedHypotheses.push(finding);
    } else if (isScoredFinding(finding, isBenchmark)) {
      scoredFindings.push(finding);
    } else {
      researchCandidates.push(finding);
    }
  }

  return {
    scored_findings: scoredFindings,
    research_candidates: researchCandidates,
    discarded_hypotheses: discardedHypotheses,
    static_analysis_summary: artifact.static_summary,
    system_map_summary: buildSystemMapSummary(artifact),
    metadata: {
      workflow_mode: mode,
      total_findings: findings.length,
      verified_count: scoredFindings.length,
      candidate_count: researchCandidates.length,
      discarded_count: discardedHypotheses.length,
      generated_at: new Date().toISOString(),
    },
  };
}
