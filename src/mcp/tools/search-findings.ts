/**
 * MCP tool registration for search_findings.
 *
 * Searches Solodit for real-world security findings with optional severity filtering.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SoloditSeverity, SoloditSearchResult } from "../../types/solodit.js";
import { SOLODIT_SEVERITIES } from "../../types/solodit.js";
import { jsonResult } from "../index.js";

const SOLODIT_API_URL = "https://solodit.cyfrin.io/api/v1/solodit/findings";
const DEFAULT_LIMIT = 10;
const RATE_LIMIT_WARNING_THRESHOLD = 3;

/**
 * Input schema for search_findings tool.
 */
const SearchFindingsSchema = z.object({
  query: z.string().describe("Search query for Solodit findings"),
  severity: z
    .enum(SOLODIT_SEVERITIES)
    .optional()
    .describe("Filter by severity level (Critical, High, Medium, Low, Gas, Informational)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Filter by tags (e.g., ['Reentrancy', 'Oracle'])"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of results to return (1-100, default 10)"),
});

type SearchFindingsInput = z.infer<typeof SearchFindingsSchema>;

/**
 * Solodit API response shape for a single issue.
 */
interface SoloditApiIssue {
  slug: string;
  title: string;
  impact: string;
  category: string;
  quality_score: number;
  issues_issuetagscore?: Array<{ tags_tag: { title: string } }>;
}

/**
 * Solodit API response shape.
 */
interface SoloditApiResponse {
  findings: SoloditApiIssue[];
}

/**
 * Maps tool severity (capitalized) to API impact (uppercase).
 */
function toApiImpact(severity: SoloditSeverity): string {
  return severity.toUpperCase();
}

/**
 * Maps API impact (uppercase) to SoloditSeverity (capitalized).
 */
function fromApiImpact(impact: string): SoloditSeverity {
  const capitalized = impact.charAt(0).toUpperCase() + impact.slice(1).toLowerCase();
  if (SOLODIT_SEVERITIES.includes(capitalized as SoloditSeverity)) {
    return capitalized as SoloditSeverity;
  }
  console.warn(`Unknown Solodit impact value: ${impact}, defaulting to Informational`);
  return "Informational";
}

/**
 * Flattens tags from issues_issuetagscore[].tags_tag.title.
 */
function flattenTags(issueTagScores: Array<{ tags_tag: { title: string } }> | undefined): string[] {
  if (!issueTagScores) {
    return [];
  }
  return issueTagScores.filter((score) => score?.tags_tag?.title).map((score) => score.tags_tag.title);
}

/**
 * Parses a single API issue into SoloditSearchResult.
 */
function parseIssue(issue: SoloditApiIssue): SoloditSearchResult {
  return {
    slug: issue.slug,
    title: issue.title,
    severity: fromApiImpact(issue.impact),
    tags: flattenTags(issue.issues_issuetagscore),
    protocol_category: issue.category,
    quality_score: issue.quality_score,
  };
}

/**
 * Builds the request body for the Solodit API.
 */
function buildRequestBody(input: SearchFindingsInput): string {
  const filters: Record<string, unknown> = {
    keywords: input.query,
  };

  if (input.severity) {
    filters.impact = [toApiImpact(input.severity)];
  }

  if (input.tags && input.tags.length > 0) {
    filters.tags = input.tags.map((tag) => ({ value: tag }));
  }

  const body: Record<string, unknown> = {
    pageSize: input.limit ?? DEFAULT_LIMIT,
    filters,
  };

  return JSON.stringify(body);
}

/**
 * Creates an error result for MCP responses.
 */
function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

/**
 * Parses rate limit reset timestamp into ISO date string.
 */
function parseResetDate(resetTimestamp: string | null): string {
  if (!resetTimestamp) {
    return "unknown";
  }
  const parsed = Number.parseInt(resetTimestamp, 10);
  if (!Number.isFinite(parsed)) {
    return "unknown";
  }
  return new Date(parsed * 1000).toISOString();
}

/**
 * Handles HTTP error responses and returns appropriate error messages.
 * Returns null if the error should trigger a retry.
 */
function handleHttpError(response: Response, isLastAttempt: boolean): string | null {
  const { status } = response;

  if (status === 401) {
    return "ERROR: SOLODIT_AUTH - API key is invalid or expired";
  }

  if (status === 429) {
    const resetDate = parseResetDate(response.headers.get("x-ratelimit-reset"));
    return `ERROR: SOLODIT_RATE_LIMIT - rate limit exceeded, reset at ${resetDate}`;
  }

  if (status >= 400 && status < 500) {
    return `ERROR: SOLODIT_REQUEST - bad request (${status})`;
  }

  if (status >= 500 && isLastAttempt) {
    return `ERROR: SOLODIT_SERVER - server error after retry (${status})`;
  }

  return null;
}

/**
 * Executes the Solodit API request with retry logic for 5xx errors.
 */
async function executeRequest(
  apiKey: string,
  body: string,
): Promise<{ response: Response | null; error: string | null }> {
  const headers = {
    "X-Cyfrin-API-Key": apiKey,
    "Content-Type": "application/json",
  };

  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(SOLODIT_API_URL, {
        method: "POST",
        headers,
        body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { response: null, error: `ERROR: SOLODIT_NETWORK - ${message}` };
    }

    if (response.ok) {
      return { response, error: null };
    }

    const isLastAttempt = attempt === maxAttempts - 1;
    const errorMessage = handleHttpError(response, isLastAttempt);
    if (errorMessage) {
      return { response: null, error: errorMessage };
    }
  }

  return { response: null, error: "ERROR: SOLODIT_UNKNOWN - unexpected error during request" };
}

/**
 * Registers the search_findings tool on the MCP server.
 *
 * Usage Policy (v0.4.0):
 * - HUNT phase: Do NOT use for hotspot creation. Use offline attack-vector packs instead.
 * - ATTACK phase: MAY use for corroboration of already-identified attack paths.
 * - VERIFY phase: MAY use for strengthening or weakening evidence.
 */
export function registerSearchFindingsTool(server: McpServer): void {
  server.registerTool(
    "search_findings",
    {
      description:
        "Search Solodit for real-world security findings. Returns matching findings with slug, title, severity, tags, protocol_category, and quality_score.",
      inputSchema: SearchFindingsSchema,
    },
    async (input: SearchFindingsInput) => {
      const apiKey = process.env["SOLODIT_API_KEY"];
      if (!apiKey || apiKey.trim() === "") {
        return errorResult(
          "ERROR: SOLODIT_API_KEY_MISSING - set SOLODIT_API_KEY environment variable or add it to .env file",
        );
      }

      const body = buildRequestBody(input);

      const { response, error } = await executeRequest(apiKey, body);

      if (error || !response) {
        return errorResult(error ?? "ERROR: SOLODIT_UNKNOWN - unexpected error during request");
      }

      let data: SoloditApiResponse;
      try {
        data = (await response.json()) as SoloditApiResponse;
      } catch {
        return errorResult("ERROR: SOLODIT_RESPONSE - failed to parse API response");
      }
      const results = data.findings.map(parseIssue);

      // Check rate limit warning
      const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
      const remaining = rateLimitRemaining ? Number.parseInt(rateLimitRemaining, 10) : null;

      if (remaining !== null && remaining < RATE_LIMIT_WARNING_THRESHOLD) {
        return jsonResult({
          results,
          warning: `Approaching rate limit: ${remaining} requests remaining`,
        });
      }

      // Return consistent structure for all cases
      return jsonResult({ results });
    },
  );
}
