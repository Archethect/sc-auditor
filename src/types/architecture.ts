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
