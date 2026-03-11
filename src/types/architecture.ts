/**
 * Supported protocol types for classification.
 */
export type ProtocolType =
  | "DEX"
  | "LENDING"
  | "VAULT"
  | "STABLECOIN"
  | "BRIDGE"
  | "YIELD"
  | "DERIVATIVES"
  | "GOVERNANCE"
  | "NFT"
  | "OTHER";

/**
 * Access control model used by the protocol.
 */
export type AccessControlModel = "Ownable" | "RBAC" | "Custom";

/**
 * Risk level classification for components and scope entries.
 */
export type RiskLevel = "High" | "Medium" | "Low";

/**
 * Solidity function visibility.
 */
export type FunctionVisibility =
  | "public"
  | "external"
  | "internal"
  | "private";

/**
 * Solidity state mutability.
 */
export type StateMutability = "view" | "pure" | "payable" | "nonpayable";

/**
 * A function signature extracted from Solidity source.
 */
export interface FunctionSignature {
  name: string;
  contract: string;
  visibility: FunctionVisibility;
  modifiers: string[];
  parameters: string[];
  return_types: string[];
  state_mutability: StateMutability;
}

/**
 * An external call edge in the calls graph.
 */
export interface ExternalCall {
  source_contract: string;
  source_function: string;
  target_contract: string;
  target_function: string;
}

/**
 * A state variable extracted from Solidity source.
 */
export interface StateVariable {
  name: string;
  type: string;
  visibility: "public" | "internal" | "private";
  contract: string;
}

/**
 * A component within the architecture analysis.
 */
export interface ArchitectureComponent {
  name: string;
  files: string[];
  /** Role description of the component */
  role: string;
  risk_level: RiskLevel;
}

/**
 * An access-controlled surface in the protocol.
 */
export interface AuthSurface {
  /** Contract containing the guarded function. */
  contract: string;
  /** Function name that is access-controlled. */
  function_name: string;
  /** Modifier or mechanism enforcing access control. */
  modifier: string;
  /** Role required to call the function. */
  role: string;
}

/**
 * Type of state variable write operation.
 */
export type StateWriteType =
  | "assign"
  | "increment"
  | "decrement"
  | "mapping_update"
  | "array_push"
  | "delete";

/**
 * A site where a state variable is written.
 */
export interface StateWriteSite {
  /** Contract containing the write. */
  contract: string;
  /** Function performing the write. */
  function_name: string;
  /** State variable being written. */
  variable: string;
  /** Type of write operation. */
  write_type: StateWriteType;
}

/**
 * Type of external call.
 */
export type ExternalCallType =
  | "call"
  | "delegatecall"
  | "staticcall"
  | "transfer"
  | "send";

/**
 * A site where an external call is made.
 */
export interface ExternalCallSite {
  /** Contract making the call. */
  contract: string;
  /** Function making the call. */
  function_name: string;
  /** Target address or contract of the call. */
  target: string;
  /** Type of external call. */
  call_type: ExternalCallType;
  /** Whether ETH value is sent with the call. */
  value_sent: boolean;
}

/**
 * Semantic unit for a configuration value.
 */
export type ConfigSemanticUnit =
  | "percent_of_100"
  | "divisor"
  | "bps"
  | "wad"
  | "raw_count"
  | "time_seconds"
  | "time_days"
  | "unknown";

/**
 * A conflicting semantic interpretation of a config variable.
 */
export interface ConfigSemanticConflict {
  /** Contract containing the conflicting variable. */
  contract: string;
  /** Variable name that conflicts. */
  variable: string;
  /** Inferred semantic unit of the conflicting variable. */
  inferred_unit: ConfigSemanticUnit;
}

/**
 * Semantic interpretation of a configuration variable.
 */
export interface ConfigSemantic {
  /** Contract containing the variable. */
  contract: string;
  /** Variable name. */
  variable: string;
  /** Inferred semantic unit of the variable. */
  inferred_unit: ConfigSemanticUnit;
  /** Variables that conflict with this semantic interpretation. */
  conflicts_with?: ConfigSemanticConflict[];
}

/**
 * Type of value flow between contracts.
 */
export type ValueFlowType =
  | "transfer"
  | "mint"
  | "burn"
  | "approve"
  | "delegatecall_value";

/**
 * An edge in the value flow graph between contracts.
 */
export interface ValueFlowEdge {
  /** Source contract of the flow. */
  from_contract: string;
  /** Source function of the flow. */
  from_function: string;
  /** Destination contract of the flow. */
  to_contract: string;
  /** Destination function of the flow. */
  to_function: string;
  /** Token or value identifier being transferred. */
  token_or_value: string;
  /** Type of value flow. */
  flow_type: ValueFlowType;
}

/**
 * Scope of a protocol invariant.
 */
export type InvariantScope = "local" | "system";

/**
 * A protocol invariant that should hold across the system.
 */
export interface ProtocolInvariant {
  /** Unique identifier for this invariant. */
  id: string;
  /** Human-readable description of the invariant. */
  description: string;
  /** Whether the invariant is local to a contract or system-wide. */
  scope: InvariantScope;
  /** Contracts that this invariant applies to. */
  related_contracts: string[];
  /** State variables involved in this invariant. */
  related_variables: string[];
}

/**
 * Summary of static analysis results.
 */
export interface StaticSummary {
  /** Number of findings from Slither. */
  slither_finding_count: number;
  /** Number of findings from Aderyn. */
  aderyn_finding_count: number;
  /** Detector categories that were triggered. */
  categories_detected: string[];
  /** Highest severity level detected. */
  highest_severity: string;
}

/**
 * Complete system map artifact produced during the MAP phase.
 *
 * Contains all architectural information needed for the HUNT phase.
 */
export interface SystemMapArtifact {
  /** Architectural components of the protocol. */
  components: ArchitectureComponent[];
  /** External-facing function signatures. */
  external_surfaces: FunctionSignature[];
  /** Access-controlled surfaces. */
  auth_surfaces: AuthSurface[];
  /** State variables across all contracts. */
  state_variables: StateVariable[];
  /** Sites where state variables are written. */
  state_write_sites: StateWriteSite[];
  /** Sites where external calls are made. */
  external_call_sites: ExternalCallSite[];
  /** Value flow edges between contracts. */
  value_flow_edges: ValueFlowEdge[];
  /** Semantic interpretations of config variables. */
  config_semantics: ConfigSemantic[];
  /** Protocol invariants. */
  protocol_invariants: ProtocolInvariant[];
  /** Summary of static analysis results. */
  static_summary: StaticSummary;
}

/**
 * Architecture analysis summary produced by the Architecture Analyzer agent.
 */
export interface ArchitectureSummary {
  protocol_type: ProtocolType;
  protocol_categories: string[];
  components: ArchitectureComponent[];
  /** Identified token flow descriptions */
  token_flows: string[];
  access_control_model: AccessControlModel;
  oracle_dependencies: string[];
  relevant_attack_categories: string[];
  /** Smart contract language (e.g., "Solidity", "Vyper") */
  language: string;
  /** Extracted function signatures for all in-scope functions */
  function_signatures: FunctionSignature[];
  /** Cross-contract call graph edges */
  external_calls_graph: ExternalCall[];
  /** State variables extracted from contracts */
  state_variables: StateVariable[];
  /** Inheritance tree: contract name -> parent contract names */
  inheritance_tree: Record<string, string[]>;
  /** Whether Slither was available and used for extraction */
  slither_available: boolean;
  /** Whether Aderyn was available and used for extraction */
  aderyn_available: boolean;
  /** Human-readable protocol invariant descriptions */
  protocol_invariants: string[];
}
