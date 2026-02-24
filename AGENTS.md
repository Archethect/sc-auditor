# AGENTS.md — sc-auditor

Project conventions for all AI coding assistants.

## Tech Stack

- TypeScript (ES2022 target, NodeNext modules, strict mode)
- Node >= 22, ESM (`"type": "module"`)
- Biome linter, Vitest test runner
- Zod for validation, MCP SDK for tool registration
- Source in `src/`, build output in `dist/`
- Worktrees in `.worktrees/` (gitignored)

## Project Layout

```
src/
  types/        # Shared type definitions (barrel re-exports)
  config/       # Configuration loading
  core/         # Domain logic (discovery, severity)
  mcp/          # MCP server and tool registration
  agents/       # Agent definitions (planned)
  report/       # Report generation (planned)
  utils/        # Shared utilities
  index.ts      # Public API barrel
```

Tests co-located: `src/<module>/__tests__/<name>.test.ts`

## Quality Gates

```bash
npm test          # vitest run
npm run lint      # biome lint
npm run typecheck # tsc --noEmit -p tsconfig.check.json
```

## Error Format

```
ERROR: <CATEGORY> - <message>
```

Categories use `UPPER_CASE_UNDERSCORED` (e.g., `SEVERITY_VALIDATION`, `REPO_UNREADABLE`, `INVALID_SCOPE`). Each module defines a private `validationError()` factory for its error category.

## Export Conventions

- Barrel files (`index.ts`) re-export only — no logic
- `export type` for type-only exports
- `.js` extensions in all import paths (ESM requirement)

## Type Conventions

- `interface` for object shapes
- `type` for unions, intersections, and aliases
- `ReadonlySet` and `readonly` arrays for immutable collections
- `as const satisfies` for typed constants
- Never use `any` — use `unknown` for unknown types

## Functions

- < 30 lines, single responsibility
- Pure where possible
- JSDoc on exported functions

## Naming

- `camelCase` for variables and functions
- `PascalCase` for types, interfaces, classes
- `SCREAMING_SNAKE_CASE` for constants
- Boolean prefixes: `is`, `has`, `should`, `can`

## Test Conventions

- AC-based grouping: `describe("AC1: ...")`
- Individual `it()` tests per assertion (not `it.each` for most cases)
- `tmpdir` isolation for filesystem tests
- `vi.fn()` / `vi.spyOn()` for mocks

## MCP Tool Pattern

```
server.registerTool(name, schema, handler) → each tool module registers its own tools
```

- Server starts with 0 tools; tool modules import server and call `registerTool()`
- Zod input schemas with `.describe()` on each field
- `CallToolResult` return type (use `jsonResult()` helper from `src/mcp/index.js`)
- Tool modules located in `src/mcp/tools/`

## Git

- Conventional commits: `<type>(<scope>): <description>`
- Squash merge preferred
- `Depends on: #N` dependency tracking in issue bodies — respect these

## Development Workflow

### Building & Testing

```bash
npm run build       # compile TypeScript to dist/
npm test            # vitest run (all tests)
npm run lint        # biome lint
npm run typecheck   # tsc --noEmit -p tsconfig.check.json
```

### Plugin Installation (Local)

The MCP server starts via `.mcp.json` which references `${CLAUDE_PLUGIN_ROOT}/dist/mcp/main.js`. Build before testing:

```bash
npm run build && node dist/mcp/main.js
```

### Architecture

MCP server (`src/mcp/server.ts`) registers deterministic tools. A skill (`security-auditor`) guides Claude through the interactive Map-Hunt-Attack audit methodology. Tools provide data; the skill provides reasoning structure.
