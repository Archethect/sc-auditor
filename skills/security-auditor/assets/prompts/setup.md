# SETUP — Static Analysis and Scope Definition

## Purpose

Guides the SETUP phase of the Map-Hunt-Attack audit methodology. This phase runs static analysis tools, loads the audit checklist, and produces a structured summary of results. No manual analysis or findings are generated during SETUP.

## Inputs

| Name | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `rootDir` | string | yes | Absolute path to the project root containing Solidity contracts |
| `workflow.mode` | `"standard"` \| `"deep"` | yes | Audit depth — `"deep"` enables the adversarial lane in HUNT |
| `workflow.enabledTools` | string[] | yes | List of enabled static analysis tools, subset of `["slither", "aderyn"]` |

## Output Schema

```json
{
  "phase": "SETUP",
  "scope": {
    "rootDir": "<string>",
    "solidityFiles": ["<string>"],
    "solcVersion": "<string>"
  },
  "slither": {
    "available": "<boolean>",
    "error": "<string | null>",
    "findingCounts": {
      "critical": "<number>",
      "high": "<number>",
      "medium": "<number>",
      "low": "<number>",
      "informational": "<number>"
    },
    "findings": ["<raw findings array>"]
  },
  "aderyn": {
    "available": "<boolean>",
    "error": "<string | null>",
    "findingCounts": {
      "critical": "<number>",
      "high": "<number>",
      "medium": "<number>",
      "low": "<number>",
      "informational": "<number>"
    },
    "findings": ["<raw findings array>"]
  },
  "checklist": {
    "loaded": "<boolean>",
    "itemCount": "<number>"
  },
  "warnings": ["<string>"]
}
```

## Procedure

### Step 1 — Define Scope

Before running any tool, establish the audit scope:

1. Use `Glob` to discover all `.sol` files under `rootDir`. Record the full list in `scope.solidityFiles`.
2. Determine the Solidity compiler version:
   - Check `foundry.toml` for a `solc` or `solc_version` field.
   - If not found, check `hardhat.config.ts` or `hardhat.config.js` for `solidity.version`.
   - If not found, scan contract pragmas for the most common `pragma solidity` version.
   - Record the resolved version in `scope.solcVersion`.
3. If `solc-select` is available, set the active compiler: `solc-select use <version>`.

**Gate**: Do NOT proceed to tool execution until `scope.solidityFiles` contains at least one file. If zero files are found, return an error in `warnings` and stop.

### Step 2 — Run Slither

If `"slither"` is in `workflow.enabledTools`:

1. Call `mcp__sc-auditor__run-slither` with `{ "rootDir": "<rootDir>" }`.
2. On success: filter results to files within the defined scope, group findings by severity, populate `slither.findingCounts` and `slither.findings`, set `slither.available = true`.
3. On failure: set `slither.available = false`, record the error message in `slither.error`.

If `"slither"` is NOT in `workflow.enabledTools`, set `slither.available = false` and `slither.error = "disabled by configuration"`.

### Step 3 — Run Aderyn

If `"aderyn"` is in `workflow.enabledTools`:

1. Call `mcp__sc-auditor__run-aderyn` with `{ "rootDir": "<rootDir>" }`.
2. On success: filter results to files within the defined scope, group findings by severity, populate `aderyn.findingCounts` and `aderyn.findings`, set `aderyn.available = true`.
3. On failure: set `aderyn.available = false`, record the error message in `aderyn.error`.

If `"aderyn"` is NOT in `workflow.enabledTools`, set `aderyn.available = false` and `aderyn.error = "disabled by configuration"`.

### Step 4 — Load Checklist

1. Call `mcp__sc-auditor__get_checklist` with no arguments.
2. On success: set `checklist.loaded = true`, record `checklist.itemCount`.
3. On failure: set `checklist.loaded = false`, add a warning to `warnings`.

### Step 5 — Evaluate Tool Availability

Apply the following logic:

- If BOTH Slither and Aderyn failed (and were enabled), add to `warnings`: `"Both Slither and Aderyn failed to run. The audit will proceed in manual-only mode without static analysis results. Findings may be less comprehensive."`
- If exactly ONE tool failed, add to `warnings`: `"<tool_name> failed to run: <error>. Continuing with <other_tool> results and manual analysis."`
- If both succeeded, `warnings` should be empty (or contain only non-tool warnings).

### Step 6 — Emit Output

Return the complete JSON object matching the output schema above. Do NOT include any prose, markdown, or commentary — only the JSON object.

## Disallowed Behaviors

- **DO NOT** generate, suggest, or imply any security findings during SETUP. This phase is strictly data collection.
- **DO NOT** perform manual code review or analysis. Reading code is only permitted for scope detection (pragma scanning).
- **DO NOT** run tools on files outside the defined scope.
- **DO NOT** skip scope definition. Tools must not be executed before the scope is established.
- **DO NOT** emit prose or markdown. The output is JSON only.
- **DO NOT** call `mcp__sc-auditor__search_findings` during SETUP. Solodit search is reserved for HUNT and ATTACK phases.
- **DO NOT** modify any source files or project configuration.

## Output Example

```json
{
  "phase": "SETUP",
  "scope": {
    "rootDir": "/home/user/project",
    "solidityFiles": [
      "src/Vault.sol",
      "src/Token.sol",
      "src/Oracle.sol"
    ],
    "solcVersion": "0.8.20"
  },
  "slither": {
    "available": true,
    "error": null,
    "findingCounts": {
      "critical": 0,
      "high": 2,
      "medium": 5,
      "low": 8,
      "informational": 12
    },
    "findings": []
  },
  "aderyn": {
    "available": true,
    "error": null,
    "findingCounts": {
      "critical": 0,
      "high": 1,
      "medium": 3,
      "low": 6,
      "informational": 4
    },
    "findings": []
  },
  "checklist": {
    "loaded": true,
    "itemCount": 142
  },
  "warnings": []
}
```
