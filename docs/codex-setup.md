# Codex CLI Setup

Guide for using sc-auditor with [OpenAI Codex CLI](https://github.com/openai/codex).

## Prerequisites

- **Node.js >= 22**
- **Codex CLI** — See [Codex documentation](https://github.com/openai/codex) for installation
- **Solodit API Key** — Required for the `search_findings` tool. Get one at [solodit.cyfrin.io](https://solodit.cyfrin.io) > API Keys

### Optional

- **Slither** — `pip install slither-analyzer` (+ `solc-select` for compiler management)
- **Aderyn** — `cargo install aderyn`

## Installation

### Quick Start (npx)

```bash
codex mcp add sc-auditor -- npx -y sc-auditor
```

### From Source

```bash
git clone https://github.com/Archethect/sc-auditor.git
cd sc-auditor && npm install && npm run build
codex mcp add sc-auditor -- node /path/to/sc-auditor/dist/mcp/main.js
```

## Environment Variables

Set your Solodit API key as an environment variable:

```bash
export SOLODIT_API_KEY="your-key-here"
```

Or create a `.env` file in the project you are auditing:

```
SOLODIT_API_KEY=your-key-here
```

## Configuration

sc-auditor reads optional settings from `config.json` in the project root. If no config file exists, sensible defaults are used.

```json
{
  "default_severity": ["CRITICAL", "HIGH", "MEDIUM"],
  "default_quality_score": 2,
  "static_analysis": {
    "slither_enabled": true,
    "aderyn_enabled": true
  }
}
```

See the main [README](../README.md#configuration) for all configuration options.

## Skill Installation

To use the interactive `/security-auditor` skill in Codex:

1. Copy the `.agents/skills/security-auditor/` directory to your project root or `~/.agents/skills/`
2. Invoke with: `/security-auditor src/contracts/`

## Tool Timeout

Slither and Aderyn can take several minutes on large projects. If using `config.toml` for Codex settings, increase the tool timeout:

```toml
[mcp.sc-auditor]
tool_timeout_sec = 300
```

## Available Tools

| Tool | Description |
|------|-------------|
| `run-slither` | Run Slither static analysis |
| `run-aderyn` | Run Aderyn static analysis |
| `get_checklist` | Load Cyfrin audit checklist |
| `search_findings` | Search Solodit for real-world findings |

## Troubleshooting

### Tools not found
Ensure the MCP server is registered: `codex mcp list` should show `sc-auditor`.

### Solodit API key errors
Set `SOLODIT_API_KEY` in your environment or `.env` file.

### Slither/Aderyn timeouts
Increase `tool_timeout_sec` in your Codex config.toml (see above).

### Environment variable forwarding
Codex may not forward all env vars to MCP servers. If `SOLODIT_API_KEY` is not picked up, use a `.env` file in the project root instead.
