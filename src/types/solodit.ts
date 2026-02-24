/**
 * Severity values returned by the Solodit API.
 * Kept separate from FindingSeverity since the external API may
 * use a different classification scheme.
 */
export const SOLODIT_SEVERITIES = [
  "Critical",
  "High",
  "Medium",
  "Low",
  "Gas",
  "Informational",
] as const;

export type SoloditSeverity = (typeof SOLODIT_SEVERITIES)[number];

/**
 * Fields shared between search results and full findings from the Solodit API.
 */
interface SoloditFindingBase {
  slug: string;
  title: string;
  severity: SoloditSeverity;
  tags: string[];
  protocol_category: string;
}

/**
 * Summarized Solodit search result (no full content).
 * Returned by the search-findings MCP tool.
 */
export interface SoloditSearchResult extends SoloditFindingBase {
  /** Range: 1-5. Only available from search results, not from get-finding. */
  quality_score: number;
}

/**
 * Full Solodit finding with markdown content.
 * Returned by the get-finding MCP tool.
 *
 * Does not include quality_score because the get-finding endpoint
 * does not return it.
 */
export interface SoloditFinding extends SoloditFindingBase {
  content: string;
}
