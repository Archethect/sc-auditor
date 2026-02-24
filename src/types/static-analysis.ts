/**
 * Availability status for a single static analysis tool.
 */
export interface ToolStatus {
  available: boolean;
  version?: string;
  path: string;
}

/**
 * Availability and version information for all static analysis tools.
 */
export interface ToolAvailability {
  slither: ToolStatus;
  aderyn: ToolStatus;
  solc: {
    available: boolean;
    version?: string;
  };
}

/**
 * A source mapping element from Slither's JSON output.
 * Note: source_mapping is optional as some Slither elements may not have source information.
 */
export interface SlitherElement {
  type: string;
  name: string;
  source_mapping?: {
    filename_relative: string;
    lines: number[];
    starting_column: number;
    ending_column: number;
  };
}

/**
 * A single detector result from Slither's JSON output.
 */
export interface SlitherDetectorResult {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements: SlitherElement[];
}
