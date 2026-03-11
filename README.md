# sc-auditor

Smart contract security auditor for Claude Code and Codex CLI — static analysis, Solodit findings search, Cyfrin checklist, and interactive Map-Hunt-Attack methodology.

**Version:** 0.3.0 | **Author:** [Archethect](https://github.com/Archethect)

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [Codex CLI](https://github.com/openai/codex) plugin providing four MCP tools and an interactive audit skill for systematic vulnerability discovery.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Interactive Audit](#interactive-audit-security-auditor)
  - [Individual MCP Tools](#individual-mcp-tools)
- [Audit Methodology](#audit-methodology)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Overview

Integrates Slither, Aderyn, the Cyfrin audit checklist, and Solodit findings search into your Claude Code workflow.

The plugin provides two usage modes:

1. **Interactive Audit Skill** (`/security-auditor`) — guides you through a structured SETUP-MAP-HUNT-ATTACK methodology for comprehensive smart contract auditing.
2. **Individual MCP Tools** — four tools you can invoke directly for ad-hoc analysis without running a full audit.

### Features

- Run **Slither** static analysis on Solidity projects
- Run **Aderyn** static analysis on Solidity projects
- Search **Solodit** for real-world security findings by keyword, severity, and tags
- Load the **Cyfrin audit checklist** with category filtering
- Interactive **Map-Hunt-Attack** audit methodology with structured finding output

## Prerequisites

### Required

- **Node.js >= 22** — Download from [nodejs.org](https://nodejs.org/).
- **npm** — Included with Node.js.
- **Claude Code CLI** — Required runtime. See [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code) for installation.
- **Codex CLI** (alternative) — Works as an alternative to Claude Code. See [Codex CLI documentation](https://github.com/openai/codex) for installation.
- **Solodit API Key** — Required for the `search_findings` tool. To get one:
  1. Go to [solodit.cyfrin.io](https://solodit.cyfrin.io)
  2. Create an account or sign in
  3. Click the dropdown menu in the top-right corner
  4. Select **API Keys**
  5. Generate a new API key
  6. Copy and save it — you will need it for `config.json`

### Optional (Recommended)

- **Slither** — Python-based static analysis for Solidity. Install:

  ```bash
  pip install slither-analyzer
  ```

  Slither also requires `solc` (the Solidity compiler).

- **solc (Solidity compiler)** — Required by Slither. Install via `solc-select`:

  ```bash
  pip install solc-select
  solc-select install 0.8.20
  solc-select use 0.8.20
  ```

  Match the `solc` version to your contracts' `pragma solidity` statement.

- **Aderyn** — Rust-based static analysis for Solidity. Install:

  ```bash
  cargo install aderyn
  ```

> The plugin works without Slither and Aderyn — you will still have checklist, Solodit search, and manual audit capabilities. Static analysis tools enhance the audit with automated findings.

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Archethect/sc-auditor.git
   cd sc-auditor
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Build:**

   ```bash
   npm run build
   ```

4. **Register the plugin in Claude Code:**

   Add the following to your project's `.mcp.json` or Claude Code settings:

   ```json
   {
     "mcpServers": {
       "sc-auditor": {
         "type": "stdio",
         "command": "node",
         "args": ["/path/to/sc-auditor/dist/mcp/main.js"]
       }
     }
   }
   ```

   Replace `/path/to/sc-auditor` with the actual path to your cloned repository.

   If installed as a Claude Code plugin, the path is resolved automatically via `${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js`.

### Codex CLI Installation

If using Codex CLI instead of Claude Code:

```bash
# Via npx (recommended)
codex mcp add sc-auditor -- npx -y sc-auditor

# Or from source
codex mcp add sc-auditor -- node /path/to/sc-auditor/dist/mcp/main.js
```

See [docs/codex-setup.md](docs/codex-setup.md) for detailed Codex setup instructions.

5. **Set your Solodit API key:**

   ```bash
   export SOLODIT_API_KEY="your-key-here"
   ```

   Or create a `.env` file in your Solidity project root with `SOLODIT_API_KEY=your-key-here`.

   Optionally, copy `config.example.json` to customize non-secret settings:

   ```bash
   cp /path/to/sc-auditor/config.example.json config.json
   ```

## Configuration

sc-auditor reads configuration from a `config.json` file in the root of the Solidity project being audited. The path can be overridden with the `SC_AUDITOR_CONFIG` environment variable.

### Minimal Configuration

All fields are optional — sensible defaults are used when omitted. The API key for Solodit is loaded from the `SOLODIT_API_KEY` environment variable (see [Environment Variables](#environment-variables)).

```json
{}
```

An empty config.json (or no config.json at all) is valid — all settings have defaults.

### Full Configuration Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `default_severity` | string[] | No | `["CRITICAL", "HIGH", "MEDIUM"]` | Severity levels to include. Valid values: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `GAS`, `INFORMATIONAL` |
| `default_quality_score` | integer | No | `2` | Minimum quality score for Solodit results (1-5) |
| `report_output_dir` | string | No | `"audits"` | Directory for audit reports. Must be a relative path, no `..` traversal |
| `max_findings_per_category` | integer | No | `10` | Maximum findings per category (1-1000) |
| `max_deep_dives` | integer | No | `5` | Maximum deep dive analyses (1-100) |

#### Static Analysis Configuration (`static_analysis`)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `slither_enabled` | boolean | No | `true` | Whether to run Slither |
| `slither_path` | string | No | `"slither"` | Path to Slither binary |
| `aderyn_enabled` | boolean | No | `true` | Whether to run Aderyn |
| `aderyn_path` | string | No | `"aderyn"` | Path to Aderyn binary |

#### LLM Reasoning Configuration (`llm_reasoning`)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `max_functions_per_category` | integer | No | `50` | Max functions to analyze per category (1-500) |
| `context_window_budget` | number | No | `0.7` | Fraction of context window to use (0.1-1.0) |

#### Workflow Configuration (`workflow`)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `mode` | string | No | `"default"` | Workflow mode: `default`, `deep`, or `benchmark` |
| `parallel_hunters` | boolean | No | `false` | Whether to run hunter agents in parallel |
| `autonomous` | boolean | No | `false` | Whether the audit runs autonomously without user prompts |
| `require_witness_for_high` | boolean | No | `false` | Whether high-severity findings require a witness/PoC |

**Workflow Modes:**

- **`default`** -- Standard audit workflow with MAP-HUNT-ATTACK phases. Suitable for most audits.
- **`deep`** -- Extended analysis with more thorough coverage. Runs additional passes and cross-references more sources.
- **`benchmark`** -- Strict mode for competitive audits. Applies gating rules: unproven medium/high findings are demoted to informational. Report splits findings into Scored Findings (verified with proof) and Research Candidates (unverified).

#### Proof Tools Configuration (`proof_tools`)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `foundry_enabled` | boolean | No | `true` | Whether Foundry is available for PoC generation |
| `echidna_enabled` | boolean | No | `false` | Whether Echidna is available for fuzzing |
| `medusa_enabled` | boolean | No | `false` | Whether Medusa is available for fuzzing |
| `halmos_enabled` | boolean | No | `false` | Whether Halmos is available for symbolic execution |
| `ityfuzz_enabled` | boolean | No | `false` | Whether ItyFuzz is available for fuzzing |

#### Verification Configuration (`verify`)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `demote_unproven_medium_high` | boolean | No | `false` (`true` in benchmark mode) | Whether to demote unproven medium/high findings to informational |

### Report Split

In **benchmark mode**, the final report is split into two sections:

1. **Scored Findings** -- Verified findings with proof (PoC, fuzzer witness, or symbolic execution result). These are the findings submitted for scoring.
2. **Research Candidates** -- Findings that passed the skeptic review but lack formal proof. These are informational and not scored.

### Benchmark Gating Rules

When `workflow.mode` is `"benchmark"`:

- `verify.demote_unproven_medium_high` defaults to `true` (can be overridden to `false`)
- Medium and high severity findings without a witness/PoC are automatically demoted to informational
- The report clearly separates scored findings from research candidates

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SC_AUDITOR_CONFIG` | Override the `config.json` file path |
| `SOLODIT_API_KEY` | **Required.** API key for Solodit findings search. Set via environment or `.env` file |

### Full Example

```json
{
  "default_severity": ["CRITICAL", "HIGH", "MEDIUM"],
  "default_quality_score": 2,
  "report_output_dir": "audits",
  "max_findings_per_category": 10,
  "max_deep_dives": 5,
  "static_analysis": {
    "slither_enabled": true,
    "slither_path": "slither",
    "aderyn_enabled": true,
    "aderyn_path": "aderyn"
  },
  "llm_reasoning": {
    "max_functions_per_category": 50,
    "context_window_budget": 0.7
  },
  "workflow": {
    "mode": "default",
    "parallel_hunters": false,
    "autonomous": false,
    "require_witness_for_high": false
  },
  "proof_tools": {
    "foundry_enabled": true,
    "echidna_enabled": false,
    "medusa_enabled": false,
    "halmos_enabled": false,
    "ityfuzz_enabled": false
  },
  "verify": {
    "demote_unproven_medium_high": false
  }
}
```

## Quick Start

1. Ensure prerequisites are installed (Node.js >= 22, Claude Code, Solodit API key).
2. Install and build the plugin (see [Installation](#installation)).
3. Set your Solodit API key:

   ```bash
   export SOLODIT_API_KEY="sk_your_key_here"
   ```

   Or create a `.env` file in your project root with `SOLODIT_API_KEY=sk_your_key_here`.

4. Open Claude Code in your Solidity project directory.
5. Run the interactive audit:

   ```
   /security-auditor src/contracts/
   ```

6. The plugin automatically runs static analysis (if tools are installed), builds a system map, then guides you through interactive hunting and attack phases.

## Usage

### Interactive Audit (`/security-auditor`)

The primary usage mode. Invoke with `/security-auditor <target>` where `<target>` is a Solidity file or directory.

```
/security-auditor src/contracts/
```

The audit follows four phases:

#### Phase 1: SETUP (Automated)

- Automatically runs Slither and Aderyn on the target (if installed)
- Loads the Cyfrin audit checklist
- Presents a summary of static analysis findings by severity

#### Phase 2: MAP (Interactive)

- Reads all Solidity files in scope
- Builds a comprehensive system map: components, invariants, static analysis summary
- Presents the map for review — you can correct or add to it before proceeding

#### Phase 3: HUNT (Interactive)

- Systematically analyzes each public/external state-changing function
- Cross-references with checklist items, Solodit findings, built-in risk patterns, and invariants from MAP phase
- Identifies suspicious spots with supporting evidence
- Presents a ranked list of spots for you to select attack targets

#### Phase 4: ATTACK (Interactive)

- Deep dives into each selected spot
- Traces call paths and constructs attack narratives
- Applies the Devil's Advocate protocol to verify findings
- Outputs structured findings with severity, evidence, and remediation

### Individual MCP Tools

You can use the four MCP tools individually for ad-hoc analysis without running a full audit.

#### `run-slither`

Run Slither static analysis on a Solidity project.

- **Tool name:** `mcp__sc-auditor__run-slither`
- **Input:** `{ "rootDir": "<path-to-solidity-project>" }`
- **Output:** JSON with `success` flag and `findings` array (title, severity, confidence, source, category, affected files/lines, description, evidence sources).
- **Example:** Ask Claude "Analyze my contracts with Slither" or invoke the tool directly.

#### `run-aderyn`

Run Aderyn static analysis on a Solidity project.

- **Tool name:** `mcp__sc-auditor__run-aderyn`
- **Input:** `{ "rootDir": "<path-to-solidity-project>" }`
- **Output:** Same structure as `run-slither`.
- **Example:** Ask Claude "Run Aderyn on my contracts" or invoke the tool directly.

#### `get_checklist`

Get the Cyfrin audit checklist. Results are cached locally for 24 hours at `~/.sc-auditor/checklist.json`.

- **Tool name:** `mcp__sc-auditor__get_checklist`
- **Input:** `{ "category": "<optional-category-filter>" }` — category is a case-insensitive substring match
- **Output:** Array of checklist items, each with: id, category, question, description, remediation, references, tags.
- **Example:** Ask Claude "Get reentrancy checklist items" or invoke with `{ "category": "Reentrancy" }`.

#### `search_findings`

Search Solodit for real-world security findings. Requires a Solodit API key.

- **Tool name:** `mcp__sc-auditor__search_findings`
- **Input:**
  - `query` (string, required): Search keywords
  - `severity` (string, optional): `Critical`, `High`, `Medium`, `Low`, `Gas`, or `Informational`
  - `tags` (string[], optional): Tag filters, e.g. `["Reentrancy", "Oracle"]`
  - `limit` (integer, optional): Number of results, 1-100, default 10
- **Output:** Array of results, each with: slug, title, severity, tags, protocol_category, quality_score.
- **Rate limit:** 20 requests per 60 seconds. The tool warns when approaching the limit.
- **Example:** Ask Claude "Search Solodit for flash loan reentrancy" or invoke with `{ "query": "flash loan reentrancy", "severity": "High" }`.

## Audit Methodology

sc-auditor uses a structured **Map-Hunt-Attack** methodology inspired by professional audit workflows, ensuring systematic coverage and reducing false positives through hypothesis-driven analysis.

### Core Principles

1. **Hypothesis-Driven Analysis** — Every potential issue is treated as a hypothesis to falsify. The auditor seeks evidence both for and against each finding.

2. **Cross-Reference Mandate** — Findings are validated against multiple sources: static analysis output, checklist items, Solodit real-world examples, and manual code review.

3. **Devil's Advocate Protocol** — Before confirming a vulnerability, the auditor searches for reasons it is NOT exploitable: mitigating controls, access restrictions, value constraints, or protocol invariants.

4. **Evidence Required** — Every finding must cite concrete evidence: line references, code paths, and supporting sources (static analysis detectors, checklist item IDs, or Solodit finding slugs).

5. **Privileged Roles Honest** — Owner/admin assumed honest. Focus on unprivileged attacker vectors.

### Finding Output

Confirmed findings include:

- **Severity:** Critical, High, Medium, Low, Gas, or Informational
- **Confidence:** Confirmed, Likely, or Possible
- **Affected files and line ranges**
- **Description** with code path explanation
- **Evidence sources** (static analysis detectors, checklist items, Solodit examples)
- **Remediation** suggestions
- **Attack scenario** (when applicable)

## Troubleshooting

### Configuration Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `CONFIG_MISSING` | No `config.json` found | config.json is optional. If using `SC_AUDITOR_CONFIG`, ensure the path is correct |
| `CONFIG_PARSE_ERROR` | `config.json` is not valid JSON | Check for syntax errors (trailing commas, missing quotes) |
| `CONFIG_VALIDATION` | A config field has an invalid value | Check field types and ranges in the [Configuration Reference](#full-configuration-reference) |

### Static Analysis Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `TOOL_NOT_FOUND` | Slither or Aderyn not installed | Install: `pip install slither-analyzer` or `cargo install aderyn` |
| `COMPILATION_FAILED` | Solidity compilation failed | Check that `solc` version matches your contracts' `pragma`. Use `solc-select` to switch versions. |
| `EXECUTION_TIMEOUT` | Analysis took too long | Try analyzing a smaller scope or individual files |

### Solodit API Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `SOLODIT_AUTH` | Invalid or expired API key | Regenerate your key at [solodit.cyfrin.io](https://solodit.cyfrin.io) > API Keys |
| `SOLODIT_RATE_LIMIT` | Too many requests (> 20 per 60 seconds) | Wait for the rate limit window to reset |
| `SOLODIT_NETWORK` | Network connectivity issue | Check your internet connection |

### Common Issues

- **Plugin not showing** — Verify the path in `.mcp.json` points to `dist/mcp/server.js`. Run `npm run build` first.
- **Static analysis skipped** — Slither or Aderyn not installed. Install them for enhanced analysis.
- **Wrong solc version** — Use `solc-select list` to see installed versions, `solc-select install X.Y.Z` and `solc-select use X.Y.Z` to switch.

## Development

For contributors and developers:

### Build

```bash
npm run build    # Compile TypeScript to dist/
```

### Test

```bash
npm test         # Run tests (vitest)
```

### Lint

```bash
npm run lint     # Lint with Biome
```

### Type Check

```bash
npm run typecheck  # TypeScript type checking
```

### Project Structure

```
src/config/        Configuration loading and validation
src/core/          Domain logic (Solidity discovery, severity)
src/mcp/           MCP server, tool registration
src/mcp/tools/     MCP tool implementations
src/mcp/services/  Services (checklist fetching and caching)
src/types/         Shared TypeScript types
skills/            Interactive audit skill (SKILL.md)
.agents/           Codex-compatible skill files
tests/             Integration and smoke tests
.claude-plugin/    Plugin manifest files
```

## Contributing

Contributions are welcome. Please follow existing code conventions:

- Use conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- Run `npm run lint && npm run typecheck && npm test` before submitting
- ESM imports with `.js` extensions
- Co-locate tests next to source files in `__tests__/` directories

## License

All rights reserved.
