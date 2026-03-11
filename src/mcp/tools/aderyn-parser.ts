/**
 * Aderyn output parser.
 *
 * Parses Aderyn JSON output and transforms it into Finding[] format.
 * Uses the static normalization layer for category and confidence mapping.
 */

import {
  generateHotspotHint,
  normalizeConfidence,
  normalizeDetectorCategory,
} from "../../core/static-normalizer.js";
import type { Finding, FindingSeverity } from "../../types/finding.js";
import type { HotspotLane } from "../../types/hotspot.js";

/**
 * Aderyn instance structure from JSON output.
 */
interface AderynInstance {
  contract_path: string;
  line_no: number;
  src?: string;
  src_char?: string;
}

/**
 * Aderyn issue structure from JSON output.
 */
interface AderynIssue {
  title: string;
  description: string;
  detector_name: string;
  instances: AderynInstance[];
}

/**
 * Aderyn issues container structure.
 */
interface AderynIssuesContainer {
  issues: AderynIssue[];
}

/**
 * Aderyn JSON output structure.
 */
export interface AderynOutput {
  high_issues: AderynIssuesContainer;
  low_issues: AderynIssuesContainer;
}

/** Maps severity level to its raw confidence key for normalization. */
const SEVERITY_TO_CONFIDENCE_KEY: Record<string, string> = {
  HIGH: "high_issues",
  LOW: "low_issues",
};

/**
 * Converts an Aderyn issue to a Finding.
 */
function issueToFinding(issue: AderynIssue, severity: FindingSeverity): Finding {
  const instances = Array.isArray(issue.instances) ? issue.instances : [];
  const detectorName = issue.detector_name ?? "unknown-detector";
  const confidenceKey = SEVERITY_TO_CONFIDENCE_KEY[severity] ?? "low_issues";
  const category = normalizeDetectorCategory(detectorName, "aderyn");
  const hotspotHint = generateHotspotHint(category, detectorName);

  return {
    title: issue.title ?? "unknown-issue",
    severity,
    confidence: normalizeConfidence("aderyn", confidenceKey),
    source: "aderyn",
    category,
    affected_files: extractFilePaths(instances),
    affected_lines: extractLineRange(instances),
    description: issue.description ?? "",
    detector_id: detectorName,
    evidence_sources: [
      {
        type: "static_analysis",
        tool: "aderyn",
        detector_id: detectorName,
      },
    ],
    status: "candidate",
    proof_type: "none",
    independence_count: 1,
    benchmark_mode_visible: true,
    ...(hotspotHint !== null ? { hotspot_hint: hotspotHint } : {}),
  } as Finding & { hotspot_hint?: HotspotLane };
}

/**
 * Extracts unique file paths from Aderyn instances.
 */
function extractFilePaths(instances: AderynInstance[]): string[] {
  const filePaths = new Set<string>();
  for (const instance of instances) {
    if (instance.contract_path) {
      filePaths.add(instance.contract_path);
    }
  }
  return [...filePaths];
}

/**
 * Extracts line range from Aderyn instances.
 */
function extractLineRange(instances: AderynInstance[]): { start: number; end: number } {
  const lineNumbers = instances
    .map((instance) => instance.line_no)
    .filter((lineNo): lineNo is number => typeof lineNo === "number" && lineNo > 0);
  if (lineNumbers.length === 0) {
    return { start: 0, end: 0 };
  }
  return { start: Math.min(...lineNumbers), end: Math.max(...lineNumbers) };
}

/**
 * Parses Aderyn JSON output into Finding[] format.
 *
 * @param output - Aderyn JSON output to parse
 * @returns Array of Finding objects
 */
export function parseAderynOutput(output: AderynOutput): Finding[] {
  const findings: Finding[] = [];

  // Guard against non-object outputs (null, string, array, etc.)
  if (!output || typeof output !== "object") {
    return findings;
  }

  // Process high issues
  const highIssues = output.high_issues?.issues;
  if (Array.isArray(highIssues)) {
    for (const issue of highIssues) {
      findings.push(issueToFinding(issue, "HIGH"));
    }
  }

  // Process low issues
  const lowIssues = output.low_issues?.issues;
  if (Array.isArray(lowIssues)) {
    for (const issue of lowIssues) {
      findings.push(issueToFinding(issue, "LOW"));
    }
  }

  return findings;
}
