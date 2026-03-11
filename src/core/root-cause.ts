/**
 * Root-cause clustering for static analysis findings.
 *
 * Groups related findings by fingerprint and semantic overlap,
 * deduplicates, and assigns stable root_cause_key identifiers.
 */

import { createHash } from "node:crypto";
import type { Finding, FindingSeverity } from "../types/finding.js";

/** Bucket size for quantizing line numbers. */
const LINE_BUCKET_SIZE = 5;

/** Maximum line distance for semantic merge across tools. */
const SEMANTIC_MERGE_THRESHOLD = 10;

/** Severity ranking for comparison (lower index = higher severity). */
const SEVERITY_RANK: readonly FindingSeverity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "GAS",
  "INFORMATIONAL",
] as const;

/**
 * Generates a deterministic fingerprint for a finding.
 *
 * Based on normalized detector_id/category, affected_files, and
 * line range quantized to 5-line buckets.
 *
 * @param finding - The finding to fingerprint
 * @returns A deterministic fingerprint string
 */
export function generateFingerprint(finding: Finding): string {
  const detectorKey = finding.detector_id ?? finding.category;
  const filesKey = [...finding.affected_files].sort().join("|");
  const startBucket = quantizeLine(finding.affected_lines.start);
  const endBucket = quantizeLine(finding.affected_lines.end);
  const lineKey = `${startBucket}-${endBucket}`;

  return `${detectorKey}::${filesKey}::${lineKey}`;
}

/**
 * Quantizes a line number to a 5-line bucket.
 */
function quantizeLine(line: number): number {
  return Math.floor(line / LINE_BUCKET_SIZE) * LINE_BUCKET_SIZE;
}

/**
 * Creates a deterministic hash from a canonical fingerprint string.
 */
function hashFingerprint(fingerprint: string): string {
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
}

/**
 * Returns the higher severity of two findings.
 */
function higherSeverity(a: FindingSeverity, b: FindingSeverity): FindingSeverity {
  const rankA = SEVERITY_RANK.indexOf(a);
  const rankB = SEVERITY_RANK.indexOf(b);
  return rankA <= rankB ? a : b;
}

/**
 * Checks if two findings overlap in file AND line range (within threshold).
 */
function hasSemanticOverlap(a: Finding, b: Finding): boolean {
  const sharedFiles = a.affected_files.filter((f) => b.affected_files.includes(f));
  if (sharedFiles.length === 0) {
    return false;
  }
  return linesOverlap(a, b);
}

/**
 * Checks if two findings' line ranges overlap within the merge threshold.
 */
function linesOverlap(a: Finding, b: Finding): boolean {
  const aStart = a.affected_lines.start;
  const aEnd = a.affected_lines.end;
  const bStart = b.affected_lines.start;
  const bEnd = b.affected_lines.end;

  // Ranges overlap if one starts within threshold of the other's range
  return aStart <= bEnd + SEMANTIC_MERGE_THRESHOLD
    && bStart <= aEnd + SEMANTIC_MERGE_THRESHOLD;
}

/**
 * Clusters findings using two-stage deduplication.
 *
 * Stage 1: Group by fingerprint. Identical fingerprints share a root_cause_key.
 * Stage 2: Semantic merge -- if two findings from different tools overlap
 * in file AND line range (within 10 lines), merge into the same cluster.
 *
 * When merging: keeps highest severity, combines evidence_sources,
 * sets independence_count to the number of independent sources.
 *
 * @param findings - Array of findings to cluster
 * @returns Deduplicated findings with root_cause_key assigned
 */
export function clusterFindings(findings: Finding[]): Finding[] {
  if (findings.length === 0) {
    return [];
  }

  // Stage 1: Group by fingerprint
  const clusters = groupByFingerprint(findings);

  // Stage 2: Semantic merge across different tools
  const mergedClusters = semanticMerge(clusters);

  return mergedClusters.map(materializeCluster);
}

/**
 * Groups findings by their fingerprint into clusters.
 */
function groupByFingerprint(findings: Finding[]): Finding[][] {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const fp = generateFingerprint(finding);
    const existing = groups.get(fp);
    if (existing) {
      existing.push(finding);
    } else {
      groups.set(fp, [finding]);
    }
  }

  return [...groups.values()];
}

/**
 * Merges clusters from different tools that overlap in file and line range.
 */
function semanticMerge(clusters: Finding[][]): Finding[][] {
  const result: Finding[][] = [...clusters];

  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      if (shouldMergeClusters(result[i], result[j])) {
        result[i] = [...result[i], ...result[j]];
        result.splice(j, 1);
        j--;
      }
    }
  }

  return result;
}

/**
 * Determines if two clusters should be merged based on cross-tool overlap.
 */
function shouldMergeClusters(clusterA: Finding[], clusterB: Finding[]): boolean {
  const toolsA = new Set(clusterA.map((f) => f.source));
  const toolsB = new Set(clusterB.map((f) => f.source));

  // Only merge findings from different tools
  const hasDifferentTools = [...toolsA].some((t) => !toolsB.has(t))
    || [...toolsB].some((t) => !toolsA.has(t));

  if (!hasDifferentTools) {
    return false;
  }

  // Check for semantic overlap between any pair across clusters
  for (const a of clusterA) {
    for (const b of clusterB) {
      if (a.source !== b.source && hasSemanticOverlap(a, b)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Materializes a cluster of findings into a single representative finding.
 */
function materializeCluster(cluster: Finding[]): Finding {
  const representative = cluster[0];
  const canonicalFingerprint = generateFingerprint(representative);
  const rootCauseKey = hashFingerprint(canonicalFingerprint);

  // Collect all unique evidence sources
  const allEvidence = collectEvidence(cluster);

  // Count independent sources (unique tools)
  const independentSources = new Set(cluster.map((f) => f.source));

  // Find highest severity
  let severity = representative.severity;
  for (const finding of cluster) {
    severity = higherSeverity(severity, finding.severity);
  }

  return {
    ...representative,
    severity,
    root_cause_key: rootCauseKey,
    evidence_sources: allEvidence,
    independence_count: independentSources.size,
  };
}

/**
 * Collects and deduplicates evidence sources from a cluster.
 */
function collectEvidence(cluster: Finding[]): Finding["evidence_sources"] {
  const seen = new Set<string>();
  const evidence: Finding["evidence_sources"] = [];

  for (const finding of cluster) {
    for (const source of finding.evidence_sources) {
      const key = `${source.type}:${source.tool ?? ""}:${source.detector_id ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        evidence.push(source);
      }
    }
  }

  return evidence;
}
