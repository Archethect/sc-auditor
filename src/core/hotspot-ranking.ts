/**
 * Hotspot ranking engine.
 *
 * Derives prioritized hotspots from a SystemMapArtifact and findings.
 * Each hotspot targets a specific vulnerability lane for deep-dive
 * analysis in the ATTACK phase.
 */

import type {
  ConfigSemantic,
  ExternalCallSite,
  StateWriteSite,
  SystemMapArtifact,
  ValueFlowEdge,
} from "../types/architecture.js";
import type { Finding } from "../types/finding.js";
import type {
  Hotspot,
  HotspotEvidence,
  HotspotLane,
  HotspotPriority,
} from "../types/hotspot.js";
import type { WorkflowMode } from "../types/config.js";
import { generateHotspotHint, normalizeDetectorCategory } from "./static-normalizer.js";

/** Severity scores for hotspot ranking. */
const SEVERITY_SCORE: Readonly<Record<string, number>> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  GAS: 1,
  INFORMATIONAL: 1,
};

/** Lane priority weights for scoring. */
const LANE_WEIGHT: Readonly<Record<HotspotLane, number>> = {
  callback_liveness: 5,
  accounting_entitlement: 4,
  semantic_consistency: 3,
  token_oracle_statefulness: 3,
  adversarial_deep: 2,
};

/** Priority thresholds. */
const CRITICAL_THRESHOLD = 15;
const HIGH_THRESHOLD = 10;
const MEDIUM_THRESHOLD = 5;

/**
 * Derives prioritized hotspots from a system map and findings.
 *
 * @param artifact - The SystemMapArtifact from the MAP phase
 * @param findings - Normalized static analysis findings
 * @param _mode - Optional workflow mode for tuning (reserved)
 * @returns Sorted array of Hotspot entries with deterministic IDs
 */
export function deriveHotspots(
  artifact: SystemMapArtifact,
  findings: Finding[],
  _mode?: WorkflowMode,
): Hotspot[] {
  const hotspots: RawHotspot[] = [];

  deriveFromFindings(findings, hotspots);
  deriveFromExternalCalls(artifact.external_call_sites, artifact.state_write_sites, hotspots);
  deriveFromConfigConflicts(artifact.config_semantics, hotspots);
  deriveFromValueFlows(artifact.value_flow_edges, hotspots);

  return finalizeHotspots(hotspots, artifact);
}

/** Intermediate hotspot before ID assignment. */
interface RawHotspot {
  lane: HotspotLane;
  title: string;
  affectedFiles: string[];
  affectedFunctions: string[];
  evidence: HotspotEvidence[];
  candidateAttackSequence: string[];
  rootCauseHypothesis: string;
  score: number;
}

/**
 * Derives hotspots from static analysis findings.
 */
function deriveFromFindings(findings: Finding[], hotspots: RawHotspot[]): void {
  for (const finding of findings) {
    const category = normalizeDetectorCategory(
      finding.detector_id ?? finding.category,
      finding.source === "aderyn" ? "aderyn" : "slither",
    );
    const lane = generateHotspotHint(category, finding.detector_id ?? "");
    if (!lane) {
      continue;
    }

    const severityScore = SEVERITY_SCORE[finding.severity] ?? 1;
    const laneWeight = LANE_WEIGHT[lane];
    const evidenceCount = finding.evidence_sources.length;

    hotspots.push({
      lane,
      title: `${finding.title} in ${finding.affected_files.join(", ")}`,
      affectedFiles: [...finding.affected_files],
      affectedFunctions: [],
      evidence: [
        {
          source: finding.source,
          detail: finding.description,
          confidence: severityScore / 5,
        },
      ],
      candidateAttackSequence: buildAttackSequence(finding),
      rootCauseHypothesis: finding.description,
      score: severityScore * laneWeight + evidenceCount,
    });
  }
}

/**
 * Derives callback_liveness hotspots from external call sites.
 */
function deriveFromExternalCalls(
  callSites: ExternalCallSite[],
  writeSites: StateWriteSite[],
  hotspots: RawHotspot[],
): void {
  for (const call of callSites) {
    const writesAfterCall = findWritesInSameFunction(call, writeSites);
    if (writesAfterCall.length === 0) {
      continue;
    }

    hotspots.push({
      lane: "callback_liveness",
      title: `External call in ${call.contract}.${call.function_name} before state write`,
      affectedFiles: [],
      affectedFunctions: [`${call.contract}.${call.function_name}`],
      evidence: [
        {
          source: "map_analysis",
          detail: `${call.call_type} call to ${call.target} with subsequent state writes: ${writesAfterCall.map((w) => w.variable).join(", ")}`,
          confidence: 0.7,
        },
      ],
      candidateAttackSequence: [
        `1. Call ${call.contract}.${call.function_name}`,
        `2. External call to ${call.target} triggers callback`,
        `3. Re-enter before state update of ${writesAfterCall[0].variable}`,
      ],
      rootCauseHypothesis: "State write after external call enables reentrancy",
      score: LANE_WEIGHT.callback_liveness * 3,
    });
  }
}

/**
 * Finds state writes in the same contract/function as an external call.
 */
function findWritesInSameFunction(
  call: ExternalCallSite,
  writeSites: StateWriteSite[],
): StateWriteSite[] {
  return writeSites.filter(
    (w) => w.contract === call.contract && w.function_name === call.function_name,
  );
}

/**
 * Derives semantic_consistency hotspots from config conflicts.
 */
function deriveFromConfigConflicts(
  configSemantics: ConfigSemantic[],
  hotspots: RawHotspot[],
): void {
  for (const config of configSemantics) {
    if (!config.conflicts_with || config.conflicts_with.length === 0) {
      continue;
    }

    const conflictContracts = config.conflicts_with.map((c) => c.contract);
    hotspots.push({
      lane: "semantic_consistency",
      title: `Semantic drift: ${config.variable} has conflicting units across contracts`,
      affectedFiles: [],
      affectedFunctions: [],
      evidence: [
        {
          source: "config_analysis",
          detail: `${config.variable} in ${config.contract} inferred as ${config.inferred_unit}, but ${config.conflicts_with.map((c) => `${c.contract} uses ${c.inferred_unit}`).join("; ")}`,
          confidence: 0.8,
        },
      ],
      candidateAttackSequence: [
        `1. Identify ${config.variable} used in ${config.contract} as ${config.inferred_unit}`,
        `2. Same variable in ${conflictContracts.join(", ")} uses different semantics`,
        `3. Exploit the mismatch to gain economic advantage`,
      ],
      rootCauseHypothesis: `Variable ${config.variable} is interpreted differently across contracts (semantic drift)`,
      score: LANE_WEIGHT.semantic_consistency * 4,
    });
  }
}

/**
 * Derives accounting_entitlement hotspots from value flow edges.
 */
function deriveFromValueFlows(
  edges: ValueFlowEdge[],
  hotspots: RawHotspot[],
): void {
  // Group by contract and look for imbalanced flows
  const contractFlows = new Map<string, ValueFlowEdge[]>();
  for (const edge of edges) {
    const existing = contractFlows.get(edge.from_contract);
    if (existing) {
      existing.push(edge);
    } else {
      contractFlows.set(edge.from_contract, [edge]);
    }
  }

  for (const [contract, flows] of contractFlows) {
    const hasMint = flows.some((f) => f.flow_type === "mint");
    const hasBurn = flows.some((f) => f.flow_type === "burn");
    const hasTransfer = flows.some((f) => f.flow_type === "transfer");

    if ((hasMint || hasBurn) && hasTransfer) {
      hotspots.push({
        lane: "accounting_entitlement",
        title: `Token accounting in ${contract} involves mint/burn and transfers`,
        affectedFiles: [],
        affectedFunctions: flows.map((f) => `${f.from_contract}.${f.from_function}`),
        evidence: [
          {
            source: "map_analysis",
            detail: `${contract} has both ${hasMint ? "mint" : ""}${hasMint && hasBurn ? "/" : ""}${hasBurn ? "burn" : ""} and transfer operations`,
            confidence: 0.6,
          },
        ],
        candidateAttackSequence: [
          `1. Interact with ${contract} token operations`,
          "2. Exploit accounting discrepancy between mint/burn and transfers",
        ],
        rootCauseHypothesis: "Mixed mint/burn and transfer operations may create accounting drift",
        score: LANE_WEIGHT.accounting_entitlement * 2,
      });
    }
  }
}

/**
 * Builds an attack sequence from a finding.
 */
function buildAttackSequence(finding: Finding): string[] {
  const steps: string[] = [];
  steps.push(`1. Target ${finding.affected_files.join(", ")}`);
  steps.push(`2. Exploit ${finding.category}: ${finding.title}`);
  if (finding.attack_scenario) {
    steps.push(`3. ${finding.attack_scenario}`);
  }
  return steps;
}

/**
 * Scores to priority mapping.
 */
function scoreToPriority(score: number): HotspotPriority {
  if (score >= CRITICAL_THRESHOLD) {
    return "critical";
  }
  if (score >= HIGH_THRESHOLD) {
    return "high";
  }
  if (score >= MEDIUM_THRESHOLD) {
    return "medium";
  }
  return "low";
}

/**
 * Finalizes hotspots: sorts, assigns IDs, maps to Hotspot type.
 */
function finalizeHotspots(
  rawHotspots: RawHotspot[],
  artifact: SystemMapArtifact,
): Hotspot[] {
  // Sort by score descending, then by title for determinism
  const sorted = [...rawHotspots].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
  });

  return sorted.map((raw, index) => ({
    id: `HS-${String(index + 1).padStart(3, "0")}`,
    lane: raw.lane,
    title: raw.title,
    priority: scoreToPriority(raw.score),
    affected_files: raw.affectedFiles,
    affected_functions: raw.affectedFunctions,
    related_invariants: findRelatedInvariants(raw, artifact),
    evidence: raw.evidence,
    candidate_attack_sequence: raw.candidateAttackSequence,
    root_cause_hypothesis: raw.rootCauseHypothesis,
  }));
}

/**
 * Finds protocol invariants related to a hotspot.
 */
function findRelatedInvariants(raw: RawHotspot, artifact: SystemMapArtifact): string[] {
  const relevantContracts = new Set([
    ...raw.affectedFunctions.map((f) => f.split(".")[0]),
  ]);

  return artifact.protocol_invariants
    .filter((inv) => inv.related_contracts.some((c) => relevantContracts.has(c)))
    .map((inv) => inv.id);
}
