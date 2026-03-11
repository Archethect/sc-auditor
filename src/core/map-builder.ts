/**
 * MAP builder core module.
 *
 * Constructs a SystemMapArtifact from source file discovery,
 * heuristic-based source scanning (no AST), and optional
 * static analysis findings.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type {
  ArchitectureComponent,
  AuthSurface,
  ExternalCallSite,
  ExternalCallType,
  FunctionSignature,
  FunctionVisibility,
  ProtocolInvariant,
  StateMutability,
  StateVariable,
  StateWriteSite,
  StateWriteType,
  StaticSummary,
  SystemMapArtifact,
  ValueFlowEdge,
  ValueFlowType,
} from "../types/architecture.js";
import type { Finding } from "../types/finding.js";
import { discoverSolidityFiles } from "./discovery.js";
import { inferConfigSemantics } from "./config-semantics.js";

/** Regex to match contract/library/interface declarations. */
const CONTRACT_DECL_RE = /^\s*(contract|library|interface)\s+(\w+)/;

/** Regex to match function declarations with visibility. */
const FUNCTION_DECL_RE =
  /^\s*function\s+(\w+)\s*\(([^)]*)\)\s+(external|public|internal|private)?\s*(view|pure|payable)?\s*(returns\s*\(([^)]*)\))?\s*/;

/** Regex to match modifier usage in a function line. */
const MODIFIER_RE = /\b(onlyOwner|onlyRole|onlyAdmin|whenNotPaused|nonReentrant)\b/g;

/** Regex to match require(msg.sender == ...) access control. */
const REQUIRE_SENDER_RE = /require\s*\(\s*msg\.sender\s*==\s*([^,)]+)/;

/** Regex for state variable declarations (outside functions). */
const STATE_VAR_RE =
  /^\s*(mapping\s*\([^)]+\)|address|uint\d*|int\d*|bool|bytes\d*|string)\s+(public|internal|private)?\s*(\w+)\s*[;=]/;

/** Regex for external call patterns. */
const EXTERNAL_CALL_RE =
  /\.call\{|\.call\(|\.delegatecall\(|\.staticcall\(|\.transfer\(|\.send\(/;

/** Regex for interface/contract function calls: ContractName(addr).functionName(...). */
const INTERFACE_CALL_RE = /(\w+)\(\s*\w+\s*\)\.\w+\s*\(/;

/** Regex for value flow patterns (token operations). */
const VALUE_FLOW_RE =
  /\.transfer\(|\.transferFrom\(|\.mint\(|\.burn\(|\.approve\(/;

/** Regex for state variable assignments. */
const STATE_ASSIGN_RE = /(\w+)\s*(\+=|-=|=)/;

/** Regex for mapping updates. */
const MAPPING_UPDATE_RE = /(\w+)\[/;

/**
 * Builds a complete SystemMapArtifact from source discovery and heuristic scanning.
 *
 * @param rootDir - Absolute path to the Solidity project root
 * @param findings - Optional pre-computed static analysis findings
 * @returns A fully populated SystemMapArtifact
 */
export async function buildSystemMap(
  rootDir: string,
  findings?: Finding[],
): Promise<SystemMapArtifact> {
  if (!isAbsolute(rootDir)) {
    throw new Error("ERROR: INVALID_ROOT - rootDir must be an absolute path");
  }

  const scopeEntries = discoverSolidityFiles(rootDir);
  const normalizedFindings = findings ?? [];

  const components: ArchitectureComponent[] = [];
  const externalSurfaces: FunctionSignature[] = [];
  const authSurfaces: AuthSurface[] = [];
  const stateVariables: StateVariable[] = [];
  const stateWriteSites: StateWriteSite[] = [];
  const externalCallSites: ExternalCallSite[] = [];
  const valueFlowEdges: ValueFlowEdge[] = [];

  for (const entry of scopeEntries) {
    const absPath = join(rootDir, entry.file);
    const content = readFileSafe(absPath);
    if (content === null) {
      continue;
    }

    scanSourceFile(content, entry.file, {
      components,
      externalSurfaces,
      authSurfaces,
      stateVariables,
      stateWriteSites,
      externalCallSites,
      valueFlowEdges,
    });
  }

  const configSemantics = inferConfigSemantics(stateVariables, scopeEntries, rootDir);
  const protocolInvariants = deriveInvariants(components, stateVariables, authSurfaces);
  const staticSummary = buildStaticSummary(normalizedFindings);

  return {
    components: sortBy(components, (c) => c.name),
    external_surfaces: sortBy(externalSurfaces, (f) => `${f.contract}::${f.name}`),
    auth_surfaces: sortBy(authSurfaces, (a) => `${a.contract}::${a.function_name}`),
    state_variables: sortBy(stateVariables, (v) => `${v.contract}::${v.name}`),
    state_write_sites: sortBy(stateWriteSites, (s) => `${s.contract}::${s.function_name}::${s.variable}`),
    external_call_sites: sortBy(externalCallSites, (e) => `${e.contract}::${e.function_name}::${e.target}`),
    value_flow_edges: sortBy(valueFlowEdges, (v) => `${v.from_contract}::${v.from_function}::${v.flow_type}`),
    config_semantics: sortBy(configSemantics, (c) => `${c.contract}::${c.variable}`),
    protocol_invariants: sortBy(protocolInvariants, (i) => i.id),
    static_summary: staticSummary,
  };
}

/** Collectors bag passed through scanning functions. */
interface ScanCollectors {
  components: ArchitectureComponent[];
  externalSurfaces: FunctionSignature[];
  authSurfaces: AuthSurface[];
  stateVariables: StateVariable[];
  stateWriteSites: StateWriteSite[];
  externalCallSites: ExternalCallSite[];
  valueFlowEdges: ValueFlowEdge[];
}

/**
 * Scans a single Solidity source file using regex heuristics.
 */
function scanSourceFile(
  content: string,
  relPath: string,
  collectors: ScanCollectors,
): void {
  const lines = content.split("\n");
  let currentContract = "";
  let currentFunction = "";
  let insideFunction = false;
  let braceDepth = 0;
  let contractRole = "";
  const contractStateVars = new Set<string>();

  for (const line of lines) {
    // Track contract declarations
    const contractMatch = CONTRACT_DECL_RE.exec(line);
    if (contractMatch) {
      currentContract = contractMatch[2];
      contractRole = extractRole(lines, line);
      collectors.components.push({
        name: currentContract,
        files: [relPath],
        role: contractRole,
        risk_level: "Medium",
      });
      contractStateVars.clear();
      continue;
    }

    if (!currentContract) {
      continue;
    }

    // Track function declarations
    const funcMatch = FUNCTION_DECL_RE.exec(line);
    if (funcMatch) {
      currentFunction = funcMatch[1];
      insideFunction = true;
      braceDepth = 0;

      const visibility = (funcMatch[3] ?? "public") as FunctionVisibility;
      const mutability = (funcMatch[4] ?? "nonpayable") as StateMutability;
      const params = parseParams(funcMatch[2]);
      const returnTypes = funcMatch[6] ? parseParams(funcMatch[6]) : [];
      const modifiers = extractModifiers(line);

      const sig: FunctionSignature = {
        name: currentFunction,
        contract: currentContract,
        visibility,
        modifiers,
        parameters: params,
        return_types: returnTypes,
        state_mutability: mutability,
      };

      if (visibility === "external" || visibility === "public") {
        collectors.externalSurfaces.push(sig);
      }

      // Check for auth surfaces
      scanAuthSurface(line, currentContract, currentFunction, modifiers, collectors.authSurfaces);
    }

    // Track brace depth for function scope
    if (insideFunction) {
      braceDepth += countChar(line, "{");
      braceDepth -= countChar(line, "}");
      if (braceDepth <= 0 && line.includes("}")) {
        insideFunction = false;
        currentFunction = "";
      }
    }

    // State variable declarations (outside functions)
    if (!insideFunction && currentContract) {
      const stateVar = parseStateVariable(line, currentContract);
      if (stateVar) {
        collectors.stateVariables.push(stateVar);
        contractStateVars.add(stateVar.name);
      }
    }

    // Inside function body: scan for writes, calls, flows
    if (insideFunction && currentFunction) {
      scanStateWrites(line, currentContract, currentFunction, contractStateVars, collectors.stateWriteSites);
      scanExternalCalls(line, currentContract, currentFunction, collectors.externalCallSites);
      scanValueFlows(line, currentContract, currentFunction, collectors.valueFlowEdges);
    }
  }
}

/**
 * Extracts the role from NatSpec or first comment near the declaration.
 */
function extractRole(lines: string[], declLine: string): string {
  const idx = lines.indexOf(declLine);
  if (idx > 0) {
    const prevLine = lines[idx - 1].trim();
    if (prevLine.startsWith("///") || prevLine.startsWith("*") || prevLine.startsWith("//")) {
      return prevLine.replace(/^\/\/\/?\s*|^\*\s*/, "").trim();
    }
  }
  return "";
}

/**
 * Extracts modifier names from a function declaration line.
 */
function extractModifiers(line: string): string[] {
  const modifiers: string[] = [];
  const re = new RegExp(MODIFIER_RE.source, "g");
  let match = re.exec(line);
  while (match !== null) {
    modifiers.push(match[1]);
    match = re.exec(line);
  }
  return modifiers;
}

/**
 * Parses comma-separated parameter strings into an array.
 */
function parseParams(paramStr: string): string[] {
  const trimmed = paramStr.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * Counts occurrences of a character in a string.
 */
function countChar(str: string, char: string): number {
  let count = 0;
  for (const c of str) {
    if (c === char) {
      count++;
    }
  }
  return count;
}

/**
 * Scans a function line for access control patterns.
 */
function scanAuthSurface(
  line: string,
  contract: string,
  functionName: string,
  modifiers: string[],
  authSurfaces: AuthSurface[],
): void {
  for (const mod of modifiers) {
    authSurfaces.push({
      contract,
      function_name: functionName,
      modifier: mod,
      role: modToRole(mod),
    });
  }

  const requireMatch = REQUIRE_SENDER_RE.exec(line);
  if (requireMatch) {
    authSurfaces.push({
      contract,
      function_name: functionName,
      modifier: "require(msg.sender)",
      role: requireMatch[1].trim(),
    });
  }
}

/**
 * Maps a modifier name to a role string.
 */
function modToRole(modifier: string): string {
  const MOD_ROLE_MAP: Record<string, string> = {
    onlyOwner: "owner",
    onlyRole: "role-based",
    onlyAdmin: "admin",
    whenNotPaused: "unpaused",
    nonReentrant: "reentrancy-guard",
  };
  return MOD_ROLE_MAP[modifier] ?? "unknown";
}

/**
 * Parses a state variable declaration line.
 */
function parseStateVariable(line: string, contract: string): StateVariable | null {
  const match = STATE_VAR_RE.exec(line);
  if (!match) {
    return null;
  }
  return {
    name: match[3],
    type: match[1],
    visibility: (match[2] ?? "internal") as "public" | "internal" | "private",
    contract,
  };
}

/**
 * Scans a line for state variable write operations.
 */
function scanStateWrites(
  line: string,
  contract: string,
  functionName: string,
  knownVars: Set<string>,
  sites: StateWriteSite[],
): void {
  // Check mapping updates first
  const mappingMatch = MAPPING_UPDATE_RE.exec(line);
  if (mappingMatch && knownVars.has(mappingMatch[1]) && line.includes("=")) {
    const writeType = inferWriteType(line);
    sites.push({
      contract,
      function_name: functionName,
      variable: mappingMatch[1],
      write_type: writeType,
    });
    return;
  }

  // Check direct assignments
  const assignMatch = STATE_ASSIGN_RE.exec(line);
  if (assignMatch && knownVars.has(assignMatch[1])) {
    const writeType = inferWriteType(line);
    sites.push({
      contract,
      function_name: functionName,
      variable: assignMatch[1],
      write_type: writeType,
    });
  }
}

/**
 * Infers the write type from an assignment line.
 */
function inferWriteType(line: string): StateWriteType {
  if (line.includes("+=")) {
    return "increment";
  }
  if (line.includes("-=")) {
    return "decrement";
  }
  if (line.includes("[")) {
    return "mapping_update";
  }
  if (line.includes("delete ")) {
    return "delete";
  }
  if (line.includes(".push(")) {
    return "array_push";
  }
  return "assign";
}

/**
 * Scans a line for external call patterns.
 */
function scanExternalCalls(
  line: string,
  contract: string,
  functionName: string,
  sites: ExternalCallSite[],
): void {
  // Check for low-level call patterns
  if (EXTERNAL_CALL_RE.test(line)) {
    const callType = inferCallType(line);
    const target = inferCallTarget(line);
    const valueSent = line.includes("{value:") || line.includes("{ value:");

    sites.push({
      contract,
      function_name: functionName,
      target,
      call_type: callType,
      value_sent: valueSent,
    });
    return;
  }

  // Check for interface/contract function calls: IContract(addr).method(...)
  const interfaceMatch = INTERFACE_CALL_RE.exec(line);
  if (interfaceMatch) {
    sites.push({
      contract,
      function_name: functionName,
      target: interfaceMatch[1],
      call_type: "call",
      value_sent: line.includes("{value:") || line.includes("{ value:"),
    });
  }
}

/**
 * Infers the external call type from a line.
 */
function inferCallType(line: string): ExternalCallType {
  if (line.includes(".delegatecall(")) {
    return "delegatecall";
  }
  if (line.includes(".staticcall(")) {
    return "staticcall";
  }
  if (line.includes(".send(")) {
    return "send";
  }
  if (line.includes(".transfer(") && !line.includes("transferFrom")) {
    return "transfer";
  }
  return "call";
}

/**
 * Extracts the call target from a line.
 */
function inferCallTarget(line: string): string {
  // Try to extract the target before .call/etc
  const match = /(\w+)\.(call|delegatecall|staticcall|transfer|send)\s*[({]/.exec(line);
  return match ? match[1] : "unknown";
}

/**
 * Scans a line for value flow patterns (token operations).
 */
function scanValueFlows(
  line: string,
  contract: string,
  functionName: string,
  edges: ValueFlowEdge[],
): void {
  if (!VALUE_FLOW_RE.test(line)) {
    return;
  }

  const flowType = inferFlowType(line);
  const token = inferTokenFromLine(line);

  edges.push({
    from_contract: contract,
    from_function: functionName,
    to_contract: "external",
    to_function: flowType,
    token_or_value: token,
    flow_type: flowType,
  });
}

/**
 * Infers the value flow type from a line.
 */
function inferFlowType(line: string): ValueFlowType {
  if (line.includes(".transferFrom(")) {
    return "transfer";
  }
  if (line.includes(".transfer(")) {
    return "transfer";
  }
  if (line.includes(".mint(")) {
    return "mint";
  }
  if (line.includes(".burn(")) {
    return "burn";
  }
  if (line.includes(".approve(")) {
    return "approve";
  }
  return "transfer";
}

/**
 * Extracts a token identifier from a value flow line.
 */
function inferTokenFromLine(line: string): string {
  const match = /(\w+)\.(transfer|transferFrom|mint|burn|approve)\s*\(/.exec(line);
  return match ? match[1] : "unknown";
}

/**
 * Derives protocol invariants from discovered components.
 */
function deriveInvariants(
  components: ArchitectureComponent[],
  stateVars: StateVariable[],
  authSurfaces: AuthSurface[],
): ProtocolInvariant[] {
  const invariants: ProtocolInvariant[] = [];
  let idCounter = 1;

  // Access control invariants
  const contractsWithAuth = new Set(authSurfaces.map((a) => a.contract));
  for (const contract of contractsWithAuth) {
    invariants.push({
      id: `INV-${String(idCounter++).padStart(3, "0")}`,
      description: `Access control modifiers in ${contract} must not be bypassable`,
      scope: "local",
      related_contracts: [contract],
      related_variables: [],
    });
  }

  // Balance invariants for contracts with balance-like mappings
  for (const v of stateVars) {
    if (v.name === "balances" || v.name === "shares") {
      const totalVar = stateVars.find(
        (sv) => sv.contract === v.contract && (sv.name === "totalSupply" || sv.name === "totalShares"),
      );
      if (totalVar) {
        invariants.push({
          id: `INV-${String(idCounter++).padStart(3, "0")}`,
          description: `${totalVar.name} == sum(${v.name}) in ${v.contract}`,
          scope: "local",
          related_contracts: [v.contract],
          related_variables: [v.name, totalVar.name],
        });
      }
    }
  }

  // System-wide invariant for multi-contract systems
  if (components.length > 1) {
    invariants.push({
      id: `INV-${String(idCounter++).padStart(3, "0")}`,
      description: "Cross-contract value flows must be balanced",
      scope: "system",
      related_contracts: components.map((c) => c.name),
      related_variables: [],
    });
  }

  return invariants;
}

/** Severity ordering for comparisons (lower index = higher severity). */
const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "GAS", "INFORMATIONAL"] as const;

/**
 * Builds a StaticSummary from the provided findings.
 */
function buildStaticSummary(findings: Finding[]): StaticSummary {
  const slitherCount = findings.filter((f) => f.source === "slither").length;
  const aderynCount = findings.filter((f) => f.source === "aderyn").length;
  const categories = [...new Set(findings.map((f) => f.category))].sort();

  let highestSeverity = "INFORMATIONAL";
  for (const f of findings) {
    if (SEVERITY_ORDER.indexOf(f.severity as typeof SEVERITY_ORDER[number]) <
        SEVERITY_ORDER.indexOf(highestSeverity as typeof SEVERITY_ORDER[number])) {
      highestSeverity = f.severity;
    }
  }

  return {
    slither_finding_count: slitherCount,
    aderyn_finding_count: aderynCount,
    categories_detected: categories,
    highest_severity: findings.length > 0 ? highestSeverity : "INFORMATIONAL",
  };
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

/**
 * Sorts an array by a string key extractor (deterministic output).
 */
function sortBy<T>(arr: T[], keyFn: (item: T) => string): T[] {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
