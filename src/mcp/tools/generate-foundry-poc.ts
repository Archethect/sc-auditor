/**
 * MCP tool registration for generate-foundry-poc.
 *
 * Generates a compilable Foundry test scaffold for a given hotspot.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../index.js";

/** Work directory name within the project root. */
const WORK_DIR_NAME = ".sc-auditor-work";

/** Subdirectory for generated PoC files. */
const POCS_SUBDIR = "pocs";

/**
 * Input schema for generate-foundry-poc tool.
 */
/** Optional exploit sketch from ATTACK phase for structured scaffold sections. */
const ExploitSketchSchema = z
  .object({
    attacker: z.string(),
    capabilities: z.array(z.string()),
    preconditions: z.array(z.string()),
    tx_sequence: z.array(z.string()),
    state_deltas: z.array(z.string()),
    broken_invariant: z.string(),
    numeric_example: z.string(),
    same_fix_test: z.string(),
  })
  .optional();

const GenerateFoundryPocSchema = z.object({
  rootDir: z.string().describe("Root directory of the Solidity project"),
  hotspot: z
    .object({
      id: z.string(),
      lane: z.string(),
      title: z.string(),
      affected_files: z.array(z.string()),
      affected_functions: z.array(z.string()),
      candidate_attack_sequence: z.array(z.string()),
      root_cause_hypothesis: z.string(),
      exploit_sketch: ExploitSketchSchema.describe(
        "Structured exploit sketch from ATTACK phase. When provided, generates labeled scaffold sections instead of bare TODOs.",
      ),
    })
    .describe("Hotspot to generate a PoC for"),
});

/** Metadata about the generated scaffold. */
export interface ScaffoldMetadata {
  test_file: string;
  setup_imports: string[];
  attack_steps: string[];
  target_contracts: string[];
}

/** Result of generating a Foundry PoC scaffold. */
export interface GenerateFoundryPocResult {
  success: boolean;
  witness_path?: string;
  proof_type: "foundry_poc";
  scaffold_metadata?: ScaffoldMetadata;
  error?: string;
}

/**
 * Extracts contract names from affected file paths.
 *
 * Strips directory and `.sol` extension to derive contract names.
 */
function extractContractNames(affectedFiles: string[]): string[] {
  return affectedFiles.map((f) => {
    const basename = path.basename(f);
    return basename.endsWith(".sol") ? basename.slice(0, -4) : basename;
  });
}

/**
 * Generates import statements for affected contracts.
 */
function generateImports(affectedFiles: string[]): string[] {
  const contractNames = extractContractNames(affectedFiles);
  return affectedFiles.map((filePath, i) => {
    const contractName = contractNames[i];
    const importPath = filePath.startsWith("/") ? filePath : `../../${filePath}`;
    return `import {${contractName}} from "${importPath}";`;
  });
}

/**
 * Generates the Solidity test file content for a hotspot.
 */
/**
 * Generates structured exploit body from an exploit sketch.
 *
 * Produces labeled SETUP/ATTACK/ASSERTIONS sections populated from sketch fields.
 */
function generateExploitSketchBody(
  sketch: NonNullable<z.infer<typeof ExploitSketchSchema>>,
): string[] {
  const lines: string[] = [];

  lines.push("        // === SETUP: Deploy contracts and configure state ===");
  for (const pre of sketch.preconditions) {
    lines.push(`        // Precondition: ${pre}`);
  }
  lines.push("");

  lines.push("        // === ATTACK: Execute exploit sequence ===");
  sketch.tx_sequence.forEach((step, i) => {
    lines.push(`        // Step ${i + 1}: ${step}`);
  });
  lines.push("");

  if (sketch.state_deltas.length > 0) {
    lines.push("        // === STATE DELTAS ===");
    for (const delta of sketch.state_deltas) {
      lines.push(`        // ${delta}`);
    }
    lines.push("");
  }

  lines.push("        // === ASSERTIONS: Verify exploit succeeded ===");
  lines.push(`        // Broken invariant: ${sketch.broken_invariant}`);
  lines.push(`        // Expected: ${sketch.numeric_example}`);

  return lines;
}

function generateTestFileContent(
  hotspot: z.infer<typeof GenerateFoundryPocSchema>["hotspot"],
): string {
  const contractNames = extractContractNames(hotspot.affected_files);
  const imports = generateImports(hotspot.affected_files);
  const testContractName = `Test_${hotspot.id.replace(/[^a-zA-Z0-9]/g, "_")}`;

  const stateVars = contractNames
    .map((name) => `    ${name} internal target_${name.toLowerCase()};`)
    .join("\n");

  const setupBody = contractNames
    .map((name) => `        target_${name.toLowerCase()} = new ${name}();`)
    .join("\n");

  const exploitBody = hotspot.exploit_sketch
    ? generateExploitSketchBody(hotspot.exploit_sketch)
    : [
        `        // Attack sequence for: ${hotspot.title}`,
        ...hotspot.candidate_attack_sequence.map((step) => `        // ${step}`),
        "",
        "        // TODO: Implement exploit logic",
        "        // TODO: Add assertions to verify exploit succeeded",
      ];

  const lines = [
    "// SPDX-License-Identifier: MIT",
    'pragma solidity ^0.8.0;',
    "",
    'import "forge-std/Test.sol";',
    ...imports,
    "",
    `/**`,
    ` * @title PoC for ${hotspot.title}`,
    ` * @notice Lane: ${hotspot.lane}`,
    ` * @dev Root cause hypothesis: ${hotspot.root_cause_hypothesis}`,
    ` */`,
    `contract ${testContractName} is Test {`,
    stateVars,
    "",
    "    function setUp() public {",
    setupBody,
    "    }",
    "",
    `    function test_exploit_${hotspot.id.replace(/[^a-zA-Z0-9]/g, "_")}() public {`,
    ...exploitBody,
    "    }",
    "}",
    "",
  ];

  return lines.join("\n");
}

/**
 * Sanitizes a hotspot ID for use as a filename.
 */
function sanitizeFilename(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Validates that rootDir exists and is a directory.
 */
function validateRootDir(rootDir: string): { valid: boolean; resolved: string; error?: string } {
  const resolved = path.resolve(rootDir);
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { valid: false, resolved, error: `ERROR: INVALID_PATH - Path is not a directory: ${resolved}` };
    }
    return { valid: true, resolved };
  } catch {
    return { valid: false, resolved, error: `ERROR: INVALID_PATH - Directory does not exist: ${resolved}` };
  }
}

/**
 * Ensures the work directory structure exists.
 *
 * Creates `<rootDir>/.sc-auditor-work/pocs/` if it does not already exist.
 */
function ensureWorkDir(resolvedRootDir: string): string {
  const pocDir = path.join(resolvedRootDir, WORK_DIR_NAME, POCS_SUBDIR);
  fs.mkdirSync(pocDir, { recursive: true });
  return pocDir;
}

/**
 * Generates a Foundry PoC scaffold for a hotspot and writes it to the work directory.
 *
 * @param rootDir - Root directory of the Solidity project
 * @param hotspot - Hotspot to generate a PoC for
 * @returns Result with witness path and scaffold metadata
 */
export function generateFoundryPoc(
  rootDir: string,
  hotspot: z.infer<typeof GenerateFoundryPocSchema>["hotspot"],
): GenerateFoundryPocResult {
  const validation = validateRootDir(rootDir);
  if (!validation.valid) {
    return { success: false, proof_type: "foundry_poc", error: validation.error };
  }

  const pocDir = ensureWorkDir(validation.resolved);
  const filename = `${sanitizeFilename(hotspot.id)}_poc.t.sol`;
  const testFilePath = path.join(pocDir, filename);

  const content = generateTestFileContent(hotspot);
  fs.writeFileSync(testFilePath, content, "utf-8");

  const contractNames = extractContractNames(hotspot.affected_files);
  const imports = generateImports(hotspot.affected_files);

  return {
    success: true,
    witness_path: testFilePath,
    proof_type: "foundry_poc",
    scaffold_metadata: {
      test_file: testFilePath,
      setup_imports: imports,
      attack_steps: hotspot.candidate_attack_sequence,
      target_contracts: contractNames,
    },
  };
}

/**
 * Registers the generate-foundry-poc tool on the MCP server.
 */
export function registerGenerateFoundryPocTool(server: McpServer): void {
  server.registerTool(
    "generate-foundry-poc",
    {
      description:
        "Generate a compilable Foundry test scaffold for a given hotspot. Creates a PoC test file in the project's work directory.",
      inputSchema: GenerateFoundryPocSchema,
    },
    async ({ rootDir, hotspot }) => {
      const result = generateFoundryPoc(rootDir, hotspot);
      return jsonResult(result);
    },
  );
}
