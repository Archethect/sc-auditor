/**
 * Slither output parser.
 *
 * Parses Slither JSON output and transforms it into Finding[] format.
 * Uses the static normalization layer for category and confidence mapping.
 */

import { normalizeConfidence, normalizeDetectorCategory } from "../../core/static-normalizer.js";
import type {
  Finding,
  FindingConfidence,
  FindingSeverity,
} from "../../types/finding.js";
import type { SlitherDetectorResult, SlitherElement } from "../../types/static-analysis.js";

/**
 * Slither JSON output structure.
 */
interface SlitherOutput {
  success: boolean;
  results?: {
    detectors?: SlitherDetectorResult[];
  };
}

/** Maps Slither impact strings to FindingSeverity values. */
const SEVERITY_MAP: Record<string, FindingSeverity> = {
  Critical: "CRITICAL",
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
  Informational: "INFORMATIONAL",
  Optimization: "GAS",
};

/**
 * Maps Slither impact level to FindingSeverity.
 *
 * @param impact - Slither impact string (e.g., "Critical", "High", "Medium", "Low")
 * @returns Normalized FindingSeverity value
 */
export function mapSlitherSeverity(impact: string): FindingSeverity {
  return SEVERITY_MAP[impact] ?? "INFORMATIONAL";
}

/**
 * Maps Slither confidence level to FindingConfidence.
 *
 * Routes through the normalization layer for consistency.
 *
 * @param confidence - Slither confidence string (e.g., "High", "Medium", "Low")
 * @returns Normalized FindingConfidence value
 */
export function mapSlitherConfidence(confidence: string): FindingConfidence {
  return normalizeConfidence("slither", confidence);
}

/**
 * Extracts unique file paths from Slither elements.
 */
function extractFilePaths(elements: SlitherElement[]): string[] {
  const paths = new Set<string>();
  for (const element of elements) {
    if (element.source_mapping?.filename_relative) {
      paths.add(element.source_mapping.filename_relative);
    }
  }
  return [...paths];
}

/**
 * Extracts line range from the first element's source_mapping.lines.
 */
function extractLineRange(elements: SlitherElement[]): { start: number; end: number } {
  const firstElement = elements[0];
  if (!firstElement?.source_mapping?.lines?.length) {
    return { start: 0, end: 0 };
  }
  const lines = firstElement.source_mapping.lines;
  return { start: Math.min(...lines), end: Math.max(...lines) };
}

/**
 * Extracts function names from Slither elements.
 */
function extractFunctionNames(elements: SlitherElement[]): string[] {
  const names = new Set<string>();
  for (const element of elements) {
    if (element.type === "function" && element.name) {
      names.add(element.name);
    }
  }
  return [...names];
}

/**
 * Converts a single Slither detector result into a Finding.
 */
function detectorToFinding(detector: SlitherDetectorResult): Finding {
  const elements = Array.isArray(detector.elements) ? detector.elements : [];
  const detectorId = detector.check ?? "unknown-detector";
  const functionNames = extractFunctionNames(elements);

  return {
    title: detectorId,
    severity: mapSlitherSeverity(detector.impact),
    confidence: mapSlitherConfidence(detector.confidence),
    source: "slither",
    category: normalizeDetectorCategory(detectorId, "slither"),
    affected_files: extractFilePaths(elements),
    affected_lines: extractLineRange(elements),
    description: buildDescription(detector.description, functionNames),
    detector_id: detectorId,
    evidence_sources: [
      {
        type: "static_analysis",
        tool: "slither",
        detector_id: detectorId,
      },
    ],
    status: "candidate",
    proof_type: "none",
    independence_count: 1,
    benchmark_mode_visible: true,
  };
}

/**
 * Builds the finding description, appending function names if present.
 */
function buildDescription(rawDescription: string | undefined, functionNames: string[]): string {
  const description = rawDescription ?? "";
  if (functionNames.length === 0) {
    return description;
  }
  return description;
}

/**
 * Parses Slither JSON output into Finding[] format.
 *
 * @param output - Slither JSON output to parse
 * @returns Array of Finding objects extracted from detectors
 */
export function parseSlitherOutput(output: SlitherOutput): Finding[] {
  if (!output.success) {
    return [];
  }

  const detectors = output.results?.detectors;
  if (!Array.isArray(detectors)) {
    return [];
  }

  return detectors.map(detectorToFinding);
}
