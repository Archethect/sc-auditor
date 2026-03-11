/**
 * Config semantic inference module.
 *
 * Detects config-like variables (constants, immutables, constructor-set)
 * and infers their semantic units. Cross-contract comparison detects
 * semantic drift conflicts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ConfigSemantic,
  ConfigSemanticConflict,
  ConfigSemanticUnit,
  StateVariable,
} from "../types/architecture.js";
import type { AuditScopeEntry } from "../types/scope.js";

/** Regex to detect constant/immutable qualifiers. */
const CONST_IMMUTABLE_RE = /\b(constant|immutable)\b/;

/** Regex to detect constructor-set variables. */
const CONSTRUCTOR_SET_RE = /constructor\s*\([^)]*\)\s*\{[^}]*\b(\w+)\s*=/s;

/** Name patterns for unit inference. */
const PERCENT_PATTERN = /percent|pct|rate/i;
const DIVISOR_PATTERN = /divisor|denom|denominator/i;
const BPS_PATTERN = /bps|basis/i;
const WAD_PATTERN = /wad/i;
const TIME_SECONDS_PATTERN = /time|duration|period|delay|timeout|interval/i;
const TIME_DAYS_PATTERN = /days/i;

/**
 * Represents raw config variable information for inference.
 */
interface RawConfigVar {
  contract: string;
  variable: string;
  varType: string;
  usageContext: string;
}

/**
 * Infers config semantics for state variables across all contracts.
 *
 * @param stateVars - All discovered state variables
 * @param scopeEntries - Discovered Solidity files
 * @param rootDir - Absolute path to project root
 * @returns Array of ConfigSemantic entries with conflicts annotated
 */
export function inferConfigSemantics(
  stateVars: StateVariable[],
  scopeEntries: AuditScopeEntry[],
  rootDir: string,
): ConfigSemantic[] {
  const rawConfigs = collectRawConfigs(stateVars, scopeEntries, rootDir);
  const semantics = rawConfigs.map(toConfigSemantic);
  return annotateConflicts(semantics);
}

/**
 * Collects raw config variable info by scanning source files.
 */
function collectRawConfigs(
  stateVars: StateVariable[],
  scopeEntries: AuditScopeEntry[],
  rootDir: string,
): RawConfigVar[] {
  const configs: RawConfigVar[] = [];

  for (const entry of scopeEntries) {
    const content = readFileSafe(join(rootDir, entry.file));
    if (content === null) {
      continue;
    }

    const lines = content.split("\n");
    const contractBlocks = extractContractBlocks(lines);

    const contractVars = stateVars.filter((v) =>
      isConfigLike(v, contractBlocks.get(v.contract) ?? lines),
    );

    for (const v of contractVars) {
      const contractLines = contractBlocks.get(v.contract) ?? lines;
      const usageContext = extractUsageContext(v.name, contractLines);
      configs.push({
        contract: v.contract,
        variable: v.name,
        varType: v.type,
        usageContext,
      });
    }
  }

  return configs;
}

/**
 * Extracts per-contract line blocks from a source file.
 */
function extractContractBlocks(lines: string[]): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let currentContract = "";
  let braceDepth = 0;
  const contractDeclRe = /^\s*(contract|library|interface)\s+(\w+)/;

  for (const line of lines) {
    const match = contractDeclRe.exec(line);
    if (match && braceDepth === 0) {
      currentContract = match[2];
      braceDepth = 0;
    }

    if (currentContract) {
      const existing = blocks.get(currentContract);
      if (existing) {
        existing.push(line);
      } else {
        blocks.set(currentContract, [line]);
      }

      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth <= 0 && line.includes("}")) {
        currentContract = "";
        braceDepth = 0;
      }
    }
  }

  return blocks;
}

/**
 * Determines if a state variable is config-like.
 */
function isConfigLike(v: StateVariable, lines: string[]): boolean {
  for (const line of lines) {
    if (line.includes(v.name) && CONST_IMMUTABLE_RE.test(line)) {
      return true;
    }
  }
  // Check if set in constructor
  const fullSource = lines.join("\n");
  const constructorMatch = CONSTRUCTOR_SET_RE.exec(fullSource);
  if (constructorMatch?.[0].includes(v.name)) {
    return true;
  }

  // Check for simple initializers that look config-like (e.g., uint256 public taxCut = 10)
  for (const line of lines) {
    if (line.includes(v.name) && /=\s*\d+\s*;/.test(line) && !line.includes("function")) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts usage context for a variable from source lines.
 */
function extractUsageContext(varName: string, lines: string[]): string {
  const usageLines: string[] = [];
  for (const line of lines) {
    if (line.includes(varName) && !isDeclarationLine(line, varName)) {
      usageLines.push(line.trim());
    }
  }
  return usageLines.join(" ");
}

/**
 * Checks if a line is a variable declaration (not usage).
 */
function isDeclarationLine(line: string, varName: string): boolean {
  // Simple heuristic: declaration lines have types before the var name
  const declRe = new RegExp(`(uint\\d*|int\\d*|address|bool|bytes\\d*|string|mapping).*\\b${varName}\\b.*[;=]`);
  return declRe.test(line);
}

/**
 * Converts a raw config variable to a ConfigSemantic entry.
 */
function toConfigSemantic(raw: RawConfigVar): ConfigSemantic {
  return {
    contract: raw.contract,
    variable: raw.variable,
    inferred_unit: inferUnit(raw.variable, raw.usageContext),
  };
}

/**
 * Infers the semantic unit from a variable name and its usage context.
 *
 * @param name - Variable name
 * @param usageContext - Concatenated usage lines for context
 * @returns Inferred ConfigSemanticUnit
 */
export function inferUnit(name: string, usageContext: string): ConfigSemanticUnit {
  if (BPS_PATTERN.test(name)) {
    return "bps";
  }
  if (WAD_PATTERN.test(name)) {
    return "wad";
  }
  if (TIME_DAYS_PATTERN.test(name)) {
    return "time_days";
  }
  if (TIME_SECONDS_PATTERN.test(name)) {
    return "time_seconds";
  }
  if (DIVISOR_PATTERN.test(name)) {
    return "divisor";
  }
  if (PERCENT_PATTERN.test(name)) {
    return "percent_of_100";
  }

  // Context-based inference: look at usage patterns
  if (usageContextSuggestsDivisor(usageContext, name)) {
    return "divisor";
  }
  if (usageContextSugestsPercent(usageContext, name)) {
    return "percent_of_100";
  }

  return "unknown";
}

/**
 * Checks if usage context suggests divisor semantics.
 */
function usageContextSuggestsDivisor(context: string, varName: string): boolean {
  // Pattern: amount / varName
  const divisorRe = new RegExp(`/\\s*${varName}\\b`);
  return divisorRe.test(context);
}

/**
 * Checks if usage context suggests percent semantics.
 */
function usageContextSugestsPercent(context: string, varName: string): boolean {
  // Pattern: amount * varName / 100
  const percentRe = new RegExp(`\\*\\s*${varName}\\b.*\\/\\s*100`);
  return percentRe.test(context);
}

/**
 * Annotates ConfigSemantic entries with cross-contract conflicts.
 */
function annotateConflicts(semantics: ConfigSemantic[]): ConfigSemantic[] {
  const byName = groupByVariable(semantics);

  for (const [, entries] of byName) {
    if (entries.length < 2) {
      continue;
    }

    for (let i = 0; i < entries.length; i++) {
      const conflicts: ConfigSemanticConflict[] = [];
      for (let j = 0; j < entries.length; j++) {
        if (i !== j && entries[i].inferred_unit !== entries[j].inferred_unit) {
          conflicts.push({
            contract: entries[j].contract,
            variable: entries[j].variable,
            inferred_unit: entries[j].inferred_unit,
          });
        }
      }
      if (conflicts.length > 0) {
        entries[i].conflicts_with = conflicts;
      }
    }
  }

  return semantics;
}

/**
 * Groups config semantics by variable name.
 */
function groupByVariable(semantics: ConfigSemantic[]): Map<string, ConfigSemantic[]> {
  const groups = new Map<string, ConfigSemantic[]>();
  for (const s of semantics) {
    const existing = groups.get(s.variable);
    if (existing) {
      existing.push(s);
    } else {
      groups.set(s.variable, [s]);
    }
  }
  return groups;
}

/**
 * Reads a file safely, returning null on failure.
 */
function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
