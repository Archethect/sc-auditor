/**
 * Aderyn output parser.
 *
 * Parses Aderyn JSON output and transforms it into Finding[] format.
 */

import type { Finding, FindingSeverity } from "../../types/finding.js";

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

/**
 * Converts an Aderyn issue to a Finding.
 */
function issueToFinding(issue: AderynIssue, severity: FindingSeverity): Finding {
  const instances = Array.isArray(issue.instances) ? issue.instances : [];

  // Extract unique file paths from instances
  const filePaths = new Set<string>();
  for (const instance of instances) {
    if (instance.contract_path) {
      filePaths.add(instance.contract_path);
    }
  }

  // Extract line range from all instances (min/max)
  const lineNumbers = instances
    .map((instance) => instance.line_no)
    .filter((lineNo): lineNo is number => typeof lineNo === "number" && lineNo > 0);
  const lineRange = lineNumbers.length > 0
    ? { start: Math.min(...lineNumbers), end: Math.max(...lineNumbers) }
    : { start: 0, end: 0 };

  return {
    title: issue.title ?? "unknown-issue",
    severity,
    confidence: "Confirmed",
    source: "aderyn",
    category: "Other",
    affected_files: [...filePaths],
    affected_lines: lineRange,
    description: issue.description ?? "",
    detector_id: issue.detector_name,
    evidence_sources: [
      {
        type: "static_analysis",
        tool: "aderyn",
        detector_id: issue.detector_name,
      },
    ],
  };
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
