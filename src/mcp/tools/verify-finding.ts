/**
 * MCP tool registration for verify-finding.
 *
 * Runs a finding through the skeptic-judge verification pipeline,
 * producing a VerificationArtifact with verdicts and benchmark gating.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../../config/loader.js";
import type { FindingSeverity, ProofType } from "../../types/finding.js";
import type { JudgeVerdict, SkepticVerdict, VerificationArtifact } from "../../types/verification.js";
import { jsonResult } from "../index.js";

/**
 * Evidence source schema for input validation.
 */
const EvidenceSourceSchema = z.object({
  type: z.enum(["static_analysis", "checklist", "solodit"]),
  tool: z.string().optional(),
  detector_id: z.string().optional(),
  detail: z.string().optional(),
});

/**
 * Input schema for verify-finding tool.
 */
const VerifyFindingSchema = z.object({
  rootDir: z.string().describe("Root directory of the Solidity project"),
  finding: z
    .object({
      title: z.string(),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "GAS", "INFORMATIONAL"]),
      confidence: z.enum(["Confirmed", "Likely", "Possible"]),
      source: z.enum(["slither", "aderyn", "manual"]),
      category: z.string(),
      affected_files: z.array(z.string()),
      affected_lines: z.object({ start: z.number(), end: z.number() }),
      description: z.string(),
      evidence_sources: z.array(EvidenceSourceSchema),
      status: z.enum(["candidate", "verified", "discarded"]).optional(),
      proof_type: z.enum(["none", "foundry_poc", "echidna", "medusa", "halmos", "ityfuzz"]).optional(),
      witness_path: z.string().optional(),
      verification_notes: z.string().optional(),
    })
    .describe("Finding to verify"),
  systemMap: z
    .object({
      components: z.array(z.record(z.string(), z.unknown())),
      protocol_invariants: z.array(z.record(z.string(), z.unknown())),
      auth_surfaces: z.array(z.record(z.string(), z.unknown())),
    })
    .passthrough()
    .describe("SystemMapArtifact for cross-referencing"),
});

type VerifyFindingInput = z.infer<typeof VerifyFindingSchema>;

/**
 * Generates a deterministic finding ID from title and affected files.
 *
 * @param title - Finding title
 * @param affectedFiles - List of affected file paths
 * @returns SHA-256 hex digest (first 16 chars)
 */
export function generateFindingId(title: string, affectedFiles: string[]): string {
  const input = `${title}${[...affectedFiles].sort().join(",")}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Runs skeptic analysis on a finding by checking auth surfaces and invariants.
 *
 * @param finding - The finding to analyze
 * @param systemMap - System map for cross-referencing
 * @returns Skeptic verdict with reasoning
 */
function runSkepticAnalysis(
  finding: VerifyFindingInput["finding"],
  systemMap: VerifyFindingInput["systemMap"],
): { verdict: SkepticVerdict; notes: string } {
  const reasons: string[] = [];

  const isProtectedByAuth = checkAuthSurfaces(finding, systemMap);
  if (isProtectedByAuth) {
    reasons.push("Auth surfaces may prevent this attack path");
  }

  const isCoveredByInvariant = checkProtocolInvariants(finding, systemMap);
  if (isCoveredByInvariant) {
    reasons.push("Protocol invariants already cover this case");
  }

  const isLowConfidence = finding.confidence === "Possible";
  if (isLowConfidence) {
    reasons.push("Finding has low confidence (Possible)");
  }

  if (isProtectedByAuth && isCoveredByInvariant) {
    return { verdict: "refuted", notes: `Skeptic refuted: ${reasons.join("; ")}` };
  }

  if (reasons.length === 0) {
    return { verdict: "confirmed", notes: "Skeptic found no mitigating factors" };
  }

  return { verdict: "plausible", notes: `Skeptic notes: ${reasons.join("; ")}` };
}

/**
 * Checks whether auth surfaces in the system map protect against the finding.
 */
function checkAuthSurfaces(
  finding: VerifyFindingInput["finding"],
  systemMap: VerifyFindingInput["systemMap"],
): boolean {
  if (systemMap.auth_surfaces.length === 0) {
    return false;
  }

  const categoryLower = finding.category.toLowerCase();
  const isAccessControlRelated =
    categoryLower.includes("access") || categoryLower.includes("auth");

  return isAccessControlRelated && systemMap.auth_surfaces.length > 0;
}

/**
 * Checks whether protocol invariants cover the finding's scenario.
 */
function checkProtocolInvariants(
  finding: VerifyFindingInput["finding"],
  systemMap: VerifyFindingInput["systemMap"],
): boolean {
  if (systemMap.protocol_invariants.length === 0) {
    return false;
  }

  const descLower = finding.description.toLowerCase();
  for (const inv of systemMap.protocol_invariants) {
    const invDesc = String(inv.description ?? "").toLowerCase();
    if (invDesc.length > 0 && descLower.includes(invDesc)) {
      return true;
    }
  }

  return false;
}

/**
 * Applies the judge decision matrix to determine the final verdict.
 *
 * @param finding - The finding being verified
 * @param skepticVerdict - Result from skeptic analysis
 * @returns Judge verdict
 */
function applyJudgeDecisionMatrix(
  finding: VerifyFindingInput["finding"],
  skepticVerdict: SkepticVerdict,
): JudgeVerdict {
  if (skepticVerdict === "refuted") {
    return "discarded";
  }

  const hasProof = finding.proof_type !== undefined && finding.proof_type !== "none";
  const isVerified = finding.status === "verified";

  if (isVerified && hasProof) {
    return "verified";
  }

  if (skepticVerdict === "confirmed" && hasProof) {
    return "verified";
  }

  if (skepticVerdict === "plausible" && hasProof) {
    return "verified";
  }

  return "candidate";
}

/**
 * Determines benchmark mode visibility for a finding.
 *
 * In benchmark mode, HIGH or MEDIUM findings without proof are hidden
 * from the scored findings section.
 *
 * @param severity - Finding severity
 * @param proofType - Type of proof (or undefined/none)
 * @param isDemoteEnabled - Whether benchmark demotion is enabled
 * @returns Whether the finding is visible in benchmark mode
 */
function determineBenchmarkVisibility(
  severity: FindingSeverity,
  proofType: ProofType | undefined,
  isDemoteEnabled: boolean,
): boolean {
  if (!isDemoteEnabled) {
    return true;
  }

  const isHighOrMedium = severity === "HIGH" || severity === "MEDIUM";
  const hasNoProof = proofType === undefined || proofType === "none";

  if (isHighOrMedium && hasNoProof) {
    return false;
  }

  return true;
}

/**
 * Core verification logic that produces a VerificationArtifact.
 *
 * @param input - Validated input from the MCP tool
 * @returns VerificationArtifact with all verdicts and metadata
 */
export function verifyFinding(input: VerifyFindingInput): VerificationArtifact {
  const { finding, systemMap } = input;

  const findingId = generateFindingId(finding.title, finding.affected_files);
  const { verdict: skepticVerdict, notes: skepticNotes } = runSkepticAnalysis(finding, systemMap);
  const judgeVerdict = applyJudgeDecisionMatrix(finding, skepticVerdict);

  const config = loadConfig();
  const isDemoteEnabled = config.verify.demote_unproven_medium_high;

  const proofType: ProofType = finding.proof_type ?? "none";
  const benchmarkVisible = determineBenchmarkVisibility(
    finding.severity,
    finding.proof_type,
    isDemoteEnabled,
  );

  const verificationNotes = [
    skepticNotes,
    `Judge verdict: ${judgeVerdict}`,
    finding.verification_notes,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    finding_id: findingId,
    skeptic_verdict: skepticVerdict,
    judge_verdict: judgeVerdict,
    proof_type: proofType,
    witness_path: finding.witness_path,
    verification_notes: verificationNotes,
    benchmark_mode_visible: benchmarkVisible,
  };
}

/**
 * Registers the verify-finding tool on the MCP server.
 */
export function registerVerifyFindingTool(server: McpServer): void {
  server.registerTool(
    "verify-finding",
    {
      description:
        "Verify a finding through the skeptic-judge pipeline. Returns a VerificationArtifact with skeptic verdict, judge verdict, proof metadata, and benchmark visibility.",
      inputSchema: VerifyFindingSchema,
    },
    async ({ rootDir, finding, systemMap }) => {
      if (!existsSync(rootDir)) {
        return jsonResult({
          success: false,
          error: `ERROR: INVALID_ROOT - directory does not exist: ${rootDir}`,
        });
      }

      try {
        const artifact = verifyFinding({ rootDir, finding, systemMap });
        return jsonResult({ success: true, artifact });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ success: false, error: message });
      }
    },
  );
}
