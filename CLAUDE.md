# SC-Auditor

Smart contract security auditor plugin (v2.0.0) with prompt-driven multi-agent orchestration. Each audit phase (MAP, HUNT, ATTACK, VERIFY) is executed by specialized sub-agents dispatched in parallel, with structured checkpoints for crash recovery. Provides static analysis (Slither, Aderyn), Solodit findings search, Cyfrin checklist integration, fuzz testing (Echidna, Medusa), symbolic execution (Halmos), and an interactive Map-Hunt-Attack methodology.

## Prerequisites

**For running integration tests locally**, install the static analysis tools and Solidity compiler:

```bash
# Slither (Python-based)
pip install slither-analyzer solc-select
solc-select install 0.8.20
solc-select use 0.8.20

# Aderyn (Rust-based)
cargo install aderyn
```

Integration tests execute real Slither and Aderyn against test fixtures and will fail without these dependencies. CI installs them automatically.

## Tools Reference

Tools are registered by their respective tool modules. The MCP server starts with zero tools; each tool module registers its tools dynamically.

| Tool | Inputs | Output | Purpose |
|:-----|:-------|:-------|:--------|
| `search_findings` | `query` (string), `severity?` (enum), `tags?` (string[]), `limit?` (integer 1-100) | SoloditSearchResult[] | Search Solodit for real-world findings |
| `get_checklist` | `category?` (string) | ChecklistItem[] | Get Cyfrin audit checklist (optional category filter) |
| `run-slither` | `rootDir` (string) | SlitherExecutionResult | Execute Slither static analysis on a directory |
| `run-aderyn` | `rootDir` (string) | AderynExecutionResult | Execute Aderyn static analysis on a directory |
| `run-echidna` | `rootDir` (string) | EchidnaExecutionResult | Execute Echidna fuzz testing |
| `run-medusa` | `rootDir` (string) | MedusaExecutionResult | Execute Medusa fuzz testing |
| `run-halmos` | `rootDir` (string) | HalmosExecutionResult | Execute Halmos symbolic testing |
| `generate-foundry-poc` | `rootDir` (string), `hotspot` (Hotspot) | scaffold metadata | Generate a Foundry PoC scaffold for a hotspot |

## Skills

| Skill | Slash Command | Purpose |
|:------|:-------------|:--------|
| `security-auditor` | `/security-auditor` | Interactive Map-Hunt-Attack audit |
