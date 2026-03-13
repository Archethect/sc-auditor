# sc-auditor

Your AI-powered smart contract security co-pilot for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [Codex CLI](https://github.com/openai/codex).

**Version:** 2.0.0 | **Author:** [Archethect](https://github.com/Archethect)

## Table of Contents

- [Overview](#overview)
- [What's New in v2.0.0](#whats-new-in-v200)
- [How It Works](#how-it-works)
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
- [Credits](#credits)
- [License](#license)

## Overview

sc-auditor turns your AI coding assistant into a security auditor. Point it at a Solidity codebase and it will map the architecture, dispatch six parallel agents to hunt for bugs across different vulnerability classes, then verify every finding through a Devil's Advocate pipeline that demands proof before confirmation.

Under the hood: static analysis (Slither, Aderyn), real-world vulnerability intelligence (Solodit), fuzz testing (Echidna, Medusa), symbolic execution (Halmos), and a rigorous Map-Hunt-Attack methodology — all orchestrated through prompt-driven multi-agent pipelines.

1. **Interactive Audit Skill** (`/security-auditor`) — a structured multi-phase pipeline with parallel agent lanes for systematic vulnerability discovery.
2. **Individual MCP Tools** — eight tools you can invoke directly for ad-hoc analysis.

## What's New in v2.0.0

v2.0.0 is a ground-up rearchitecture. The hardcoded audit pipeline has been replaced with a **prompt-driven multi-agent orchestration model** — every phase is now executed by specialized sub-agents dispatched in parallel, with structured checkpoints for crash recovery and context-window resilience.

**Parallel Hunt Lanes** — Six specialized agents hunt simultaneously, each targeting a distinct vulnerability class: callback liveness, accounting/entitlement, semantic consistency, token/oracle statefulness, economic differentials, and an auto-triggered adversarial deep lane for cross-contract attack paths. Inspired by [@pashov](https://github.com/pashov)'s structured agent lane methodology and adversarial verification approach.

**Devil's Advocate Verification Pipeline** — Every finding goes through a formal 6-dimension DA evaluation during ATTACK, then an independent skeptic (VERIFY) tries to break it with inversion mandate. Conflicts are resolved by a proof-based judge: "prove it or lose it."

**Proof-or-Demote** — ATTACK agents must attempt at least one proof method (Foundry PoC, Echidna, Medusa, Halmos) for confirmed vulnerabilities. In benchmark mode, unproven HIGH/MEDIUM findings are automatically demoted.

**Checkpoint Discipline** — Agents self-checkpoint after every phase. The orchestrator can resume from any phase after crashes, context compaction, or session interruptions.

**Expanded Tool Suite** — Eight MCP tools: Slither, Aderyn, Solodit search, Cyfrin checklist, Foundry PoC generation, Echidna fuzzing, Medusa fuzzing, and Halmos symbolic execution.

## How It Works

```
                    /security-auditor src/
                           |
              SETUP -----> MAP -----> HUNT -----> ATTACK -----> VERIFY -----> REPORT
           (1 agent)   (1 agent)  (5-6 agents)  (N agents)   (N agents)
                                    parallel      parallel     parallel
                                       |
                  +--------------------+--------------------+
                  |          |         |         |          |
              Callback  Accounting  Semantic  Token/    Economic
              Liveness  Entitlement Consist.  Oracle    Differ.
                  |          |         |         |          |
                  +----+-----+---------+----+----+----------+
                       |                    |
                  Adversarial Deep     (auto-trigger)
                  (cross-contract)
```

Each HUNT lane produces prioritized hotspots. You pick which ones to deep-dive. ATTACK agents trace call paths, run the Devil's Advocate protocol, construct exploit sketches, and generate proofs. VERIFY agents independently challenge every finding with an inversion mandate. A judge resolves conflicts.

## Prerequisites

### Required

- **Node.js >= 22** — Download from [nodejs.org](https://nodejs.org/)
- **Claude Code CLI** or **Codex CLI** — See [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) or [Codex docs](https://github.com/openai/codex)
- **Solodit API Key** — Required for the `search_findings` tool:
  1. Go to [solodit.cyfrin.io](https://solodit.cyfrin.io)
  2. Sign in > dropdown menu (top-right) > **API Keys**
  3. Generate and save your key

### Optional (Recommended)

- **Slither** + **solc** — Static analysis:

  ```bash
  pip install slither-analyzer solc-select
  solc-select install 0.8.20 && solc-select use 0.8.20
  ```

  Match `solc` version to your contracts' `pragma solidity` statement.

- **Aderyn** — Rust-based static analysis:

  ```bash
  cargo install aderyn
  ```

- **Foundry** — For PoC generation and forge tests: [getfoundry.sh](https://getfoundry.sh/)

- **Echidna** / **Medusa** / **Halmos** — Fuzz testing and symbolic execution (see their respective docs)

> The plugin works without external tools — you'll still have Solodit search, the Cyfrin checklist, and the full Map-Hunt-Attack methodology. Static analysis and proof tools enhance the audit with automated findings and executable proofs.

## Installation

### Claude Code

1. **Clone and build:**

   ```bash
   git clone https://github.com/Archethect/sc-auditor.git
   cd sc-auditor && npm install && npm run build
   ```

2. **Register the plugin** — add to your project's `.mcp.json` or Claude Code settings:

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

   If installed as a Claude Code plugin, the path resolves automatically.

3. **Set your Solodit API key:**

   ```bash
   export SOLODIT_API_KEY="your-key-here"
   ```

### Codex CLI

> **Required:** Enable `multi_agent = true` in your Codex `config.toml`. Without it, HUNT/ATTACK/VERIFY phases run sequentially instead of in parallel — audits take 3-5x longer.

```bash
# Via npx
codex mcp add sc-auditor -- npx -y sc-auditor
```

```toml
# In your Codex config.toml
[agent]
multi_agent = true
```

See [docs/codex-setup.md](docs/codex-setup.md) for detailed Codex setup, skill installation, and troubleshooting.

## Configuration

sc-auditor reads optional configuration from `config.json` in the Solidity project root. Override the path with `SC_AUDITOR_CONFIG` env var. All fields are optional — sensible defaults are applied.

### Minimal Setup

```json
{}
```

An empty `config.json` (or no config file) is valid.

### Configuration Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default_severity` | string[] | `["CRITICAL","HIGH","MEDIUM"]` | Severity filter. Valid: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `GAS`, `INFORMATIONAL` |
| `default_quality_score` | integer | `2` | Min Solodit quality score (1-5) |
| `report_output_dir` | string | `"audits"` | Report output directory (relative, no `..`) |
| `max_findings_per_category` | integer | `10` | Max findings per category (1-1000) |
| `max_deep_dives` | integer | `5` | Max deep-dive analyses (1-100) |

#### Static Analysis (`static_analysis`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `slither_enabled` | boolean | `true` | Run Slither |
| `slither_path` | string | `"slither"` | Path to Slither binary |
| `aderyn_enabled` | boolean | `true` | Run Aderyn |
| `aderyn_path` | string | `"aderyn"` | Path to Aderyn binary |

#### LLM Reasoning (`llm_reasoning`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_functions_per_category` | integer | `50` | Max functions per category (1-500) |
| `context_window_budget` | number | `0.7` | Context window fraction (0.1-1.0) |

#### Workflow (`workflow`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | string | `"default"` | `default`, `deep`, or `benchmark` |
| `parallel_hunters` | boolean | `false` | Run HUNT lanes in parallel |
| `autonomous` | boolean | `false` | Skip user confirmation gates |
| `require_witness_for_high` | boolean | `false` | Require PoC for HIGH findings |

**Workflow Modes:**

- **`default`** — Standard Map-Hunt-Attack with user review gates.
- **`deep`** — Extended coverage with additional analysis passes.
- **`benchmark`** — Competitive audit mode. Unproven HIGH/MEDIUM findings are demoted. Report splits into Scored Findings (with proof) and Research Candidates (without).

#### Proof Tools (`proof_tools`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `foundry_enabled` | boolean | `true` | Foundry PoC generation |
| `echidna_enabled` | boolean | `false` | Echidna fuzz testing |
| `medusa_enabled` | boolean | `false` | Medusa fuzz testing |
| `halmos_enabled` | boolean | `false` | Halmos symbolic execution |
| `ityfuzz_enabled` | boolean | `false` | ItyFuzz fuzzing |

#### Verification (`verify`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `demote_unproven_medium_high` | boolean | `false` (`true` in benchmark) | Demote unproven HIGH/MEDIUM to informational |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SOLODIT_API_KEY` | **Required.** Solodit API key (env var or `.env` file) |
| `SC_AUDITOR_CONFIG` | Override config.json path |

## Quick Start

```bash
# 1. Set your API key
export SOLODIT_API_KEY="sk_your_key_here"

# 2. Open Claude Code in your Solidity project
cd my-defi-protocol

# 3. Launch the audit
/security-auditor src/
```

The plugin runs static analysis, builds a system map of your contracts, then dispatches parallel hunt agents to find vulnerabilities. You review the map, pick hotspots to attack, and get verified findings with proofs.

You can also point it at a GitHub repo:

```
/security-auditor https://github.com/example/vault-protocol
```

Or specific files:

```
/security-auditor src/Vault.sol,src/Strategy.sol
```

## Usage

### Interactive Audit (`/security-auditor`)

The primary mode. Runs you through the full Map-Hunt-Attack pipeline:

#### Phase 0: Resume Check

Checks for existing audit state in `.sc-auditor-work/checkpoints/`. If found, offers to resume from the last completed phase — no work lost.

#### Phase 0.5: Resolve Input

Resolves your input (local path, GitHub URL, or specific files) into a project root. Detects the framework (Foundry/Hardhat) and scopes the audit.

#### Phase 1: SETUP (1 agent)

Runs Slither and Aderyn (if installed), loads the Cyfrin checklist, discovers all Solidity files. Returns a summary of findings by severity.

#### Phase 2: MAP (1 agent)

Reads all contracts and builds a comprehensive **SystemMapArtifact**: components, inheritance trees, external surfaces, auth surfaces, state variables, write sites, call sites, value flow edges, config semantics, protocol invariants, and audit units. You review and correct the map before proceeding.

#### Phase 3: HUNT (5-6 parallel agents)

Six specialized lanes hunt simultaneously:

| Lane | What It Finds |
|------|---------------|
| **Callback Liveness** | Reentrancy, griefing, honeypots, withdrawal blockage, user-controlled callbacks |
| **Accounting Entitlement** | Stale balance reads, transfer/burn entitlement drift, reward attribution bugs, fee capture on outdated state |
| **Semantic Consistency** | Config unit mismatches (percent vs basis-point vs divisor), copied formulas with changed semantics, magic numbers, decimal scaling errors |
| **Token Oracle Statefulness** | Approval abuse, fee-on-transfer/rebasing token assumptions, oracle staleness and manipulation, multi-transaction state assumptions |
| **Economic Differential** | Symmetric operation asymmetries (deposit vs withdraw), temporal rate drift, boundary behavior (zero/max/dust/first-deposit), fee compounding, incentive misalignment |
| **Adversarial Deep** | Cross-lane hotspot chaining, flash loan amplification, governance/timelock exploitation, sandwich/oracle cascades *(auto-triggers when cross-contract patterns detected)* |

Each lane applies graduated hard-negative handling — safe patterns are annotated and deprioritized, not dismissed. You pick which hotspots to deep-dive.

#### Phase 4: ATTACK (N parallel agents)

One agent per hotspot. Each agent:
1. Traces the full call path (entry → branches → mutations → exit)
2. Runs the **Devil's Advocate protocol** first (6 dimensions: guards, reentrancy protection, access control, by-design classification, economic feasibility, dry run)
3. Constructs an exploit sketch with tx sequence, state deltas, and numeric example
4. Generates proof (Foundry PoC, Echidna, Medusa, or Halmos)
5. Corroborates with Solodit precedents

#### Phase 5: VERIFY (N parallel agents)

Independent skeptics challenge every finding with an **inversion mandate**:
- If ATTACK confirmed it → skeptic tries to **negate** (find missed guards)
- If ATTACK invalidated it → skeptic tries to **resurrect** (prove guards don't actually block)

A judge resolves conflicts with the "prove it or lose it" protocol.

#### Phase 5.5: Conflict Resolution

RE-ATTACK agents are dispatched for resurrected findings that need a working exploit proof.

#### Phase 6: Report

Final structured report with five sections:
1. **Proved Findings** — Verified with executable proof
2. **Confirmed (Unproven)** — Strong evidence, no executable proof
3. **Detected Candidates** — Plausible, not fully verified
4. **Design Tradeoffs** — Intentional choices that accept risk
5. **Discarded** — Ruled out, with DA chain reasoning

### Individual MCP Tools

Use any tool directly for ad-hoc analysis without running a full audit:

#### Static Analysis

| Tool | Description | Input |
|------|-------------|-------|
| `run-slither` | Slither static analysis | `{ rootDir }` |
| `run-aderyn` | Aderyn static analysis | `{ rootDir }` |

#### Intelligence

| Tool | Description | Input |
|------|-------------|-------|
| `search_findings` | Search Solodit for real-world findings (rate limit: 20 requests per 60s) | `{ query, severity?, tags?, limit? }` |
| `get_checklist` | Cyfrin audit checklist (cached locally for 24h) | `{ category? }` |

#### Proof Generation & Testing

| Tool | Description | Input |
|------|-------------|-------|
| `generate-foundry-poc` | Foundry PoC scaffold for a hotspot | `{ rootDir, hotspot }` |
| `run-echidna` | Echidna fuzz testing | `{ rootDir, contractName?, configPath?, testLimit? }` |
| `run-medusa` | Medusa fuzz testing | `{ rootDir, targetContract?, configPath?, timeout? }` |
| `run-halmos` | Halmos symbolic execution | `{ rootDir, contractName?, functionName?, loopBound? }` |

**Examples:**

```
"Run Slither on my contracts"
"Search Solodit for flash loan reentrancy findings"
"Generate a Foundry PoC for this vulnerability"
"Run Echidna fuzzing on src/Vault.sol"
```

## Audit Methodology

### Core Principles

1. **Hypothesis-Driven** — Every issue is a hypothesis to falsify, not a conclusion to confirm.
2. **Cross-Reference Mandate** — Validate against multiple sources: static analysis, checklist, Solodit precedents, manual review.
3. **Devil's Advocate Protocol** — A formal 6-dimension evaluation (guards, reentrancy protection, access control, by-design classification, economic feasibility, dry run) with scoring from -3 (full mitigation) to +1 (edge-case exploitable). Decision thresholds determine verdicts: invalidated, degraded, sustained, or escalated.
4. **Evidence Required** — Concrete line references, code paths, and at least one supporting source.
5. **Privileged Roles Honest** — Admins act in good faith. But authority propagation, composition failures, flash-loan governance, and config interaction vectors are NOT dismissed.
6. **Graduated Hard-Negative Handling** — Safe patterns (reentrancy guards, pull-over-push, gas-limited callbacks) are annotated and deprioritized, never silently dismissed.

### Solodit Usage (Graduated by Phase)

Solodit is a corroboration tool, not a discovery tool:

| Phase | Policy |
|-------|--------|
| SETUP / MAP | **Blocked** — no `search_findings` calls |
| HUNT | Only after establishing a local anchor (contract + function + bug family from code) |
| ATTACK | For corroboration of already-identified attack paths |
| VERIFY | To strengthen or weaken evidence |
| REPORT | **Blocked** |

### Finding Lifecycle

```
Hotspot (HUNT) → candidate (ATTACK) → verified / judge_confirmed / discarded (VERIFY)
                     ↓
              invalidated_by_attack (if DA kills it early)
```

### Finding Severity & Confidence

- **Severity:** Critical, High, Medium, Low, Gas, Informational
- **Confidence:** Confirmed (with proof), Likely (strong evidence), Possible (plausible hypothesis)
- **Proof types:** Foundry PoC, Echidna, Medusa, Halmos, ItyFuzz, or none

## Troubleshooting

### Configuration Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `CONFIG_MISSING` | No config.json | Optional — create one or use `SC_AUDITOR_CONFIG` |
| `CONFIG_PARSE_ERROR` | Invalid JSON | Fix syntax (trailing commas, missing quotes) |
| `CONFIG_VALIDATION` | Invalid field value | Check types and ranges in [Configuration Reference](#configuration-reference) |

### Static Analysis Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `TOOL_NOT_FOUND` | Slither/Aderyn not installed | `pip install slither-analyzer` or `cargo install aderyn` |
| `COMPILATION_FAILED` | solc version mismatch | `solc-select install X.Y.Z && solc-select use X.Y.Z` |
| `EXECUTION_TIMEOUT` | Large project | Narrow scope or increase timeout |

### Solodit API Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `SOLODIT_AUTH` | Invalid API key | Regenerate at [solodit.cyfrin.io](https://solodit.cyfrin.io) > API Keys |
| `SOLODIT_RATE_LIMIT` | >20 requests / 60s | Wait for reset |
| `SOLODIT_NETWORK` | Connectivity | Check internet connection |

### Common Issues

- **Plugin not showing** — Verify path in `.mcp.json` points to `dist/mcp/main.js`. Run `npm run build` first.
- **Phases running sequentially** — Enable parallel agents in your Codex config (`multi_agent = true`).
- **Wrong solc version** — `solc-select list` to see installed, `solc-select install X.Y.Z && solc-select use X.Y.Z`.
- **Audit state corrupted** — Delete `.sc-auditor-work/` and restart.

## Development

### Build

```bash
npm run build        # Compile TypeScript + generate .agents/ for Codex
```

### Test

```bash
npm test             # Unit + integration tests (vitest)
```

### Lint & Type Check

```bash
npm run lint         # Biome linter
npm run typecheck    # TypeScript validation
```

### Project Structure

```
src/config/          Configuration loading and validation
src/core/            Solidity file discovery
src/mcp/             MCP server and tool registration
src/mcp/tools/       Tool implementations (executors + parsers)
src/mcp/services/    Checklist fetching and caching
src/types/           Shared TypeScript types
skills/              Audit skill definition and agent prompts
.agents/             Codex-compatible skill files (auto-generated)
scripts/             Build scripts (skills/ -> .agents/ transformer)
tests/               Integration and smoke tests
.claude-plugin/      Plugin manifests
```

## Credits

- **Audit Lane Architecture** — The parallel hunt lane structure and adversarial deep verification approach were inspired by [@pashov](https://github.com/pashov)'s pioneering work on multi-agent security review methodologies. The concept of specialized agents hunting independently across vulnerability classes, then combining findings for adversarial cross-lane analysis, draws directly from his approach.
- **Solodit & Cyfrin** — Real-world vulnerability intelligence and audit checklist via [Cyfrin](https://www.cyfrin.io/).
- **Static Analysis** — [Slither](https://github.com/crytic/slither) by Trail of Bits, [Aderyn](https://github.com/Cyfrin/aderyn) by Cyfrin.

## Contributing

Contributions welcome. Follow existing conventions:

- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- `npm run lint && npm run typecheck && npm test` before submitting
- ESM imports with `.js` extensions
- Co-locate tests in `__tests__/` directories

## License

All rights reserved.
