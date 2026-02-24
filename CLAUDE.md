# SC-Auditor

Smart contract security auditor plugin with static analysis, Solodit findings search, Cyfrin checklist integration, and interactive Map-Hunt-Attack methodology.

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
| `get-finding` | `slug` (string) | SoloditFinding | Retrieve a single Solodit finding by slug |
| `get_checklist` | (none) | ChecklistItem[] | Get Cyfrin audit checklist |
| `run-slither` | `rootDir` (string) | SlitherExecutionResult | Execute Slither static analysis on a directory |
| `run-aderyn` | `rootDir` (string) | AderynExecutionResult | Execute Aderyn static analysis on a directory |

## Skills

| Skill | Slash Command | Purpose |
|:------|:-------------|:--------|
| `security-auditor` | `/security-auditor` | Interactive Map-Hunt-Attack audit |
