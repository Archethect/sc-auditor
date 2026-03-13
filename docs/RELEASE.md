# Release Notes

## Release Order

```
v0.4.0 -- Core domain model, static normalization, benchmark gating, report split
v0.5.0 -- MAP artifact, HUNT lanes, benchmark fixtures (planned)
v0.6.0 -- ATTACK proof synthesis (planned)
v0.7.0 -- Skeptic/judge gating, integration tests, release process (planned)
```

Note: v0.4.0 ships everything since all issues were implemented together.

## v0.4.0 Release Checklist

- [ ] All quality gates pass: `npm test`, `npm run typecheck`, `npm run lint`
- [ ] 11 MCP tools registered and schema-validated
- [ ] Benchmark mode gating verified with integration tests
- [ ] Report builder produces correct section split
- [ ] Prompt packs present for all 6 phases
- [ ] Attack vector and hard negative libraries complete
- [ ] SKILL.md orchestrator updated with 6-phase flow
- [ ] config.example.json matches loader defaults
- [ ] README.md documents all new features
- [ ] CLAUDE.md tools reference table is current
- [ ] No secrets in committed files

## Optional Dependencies

```bash
# Required (core functionality)
Node.js >= 22
npm

# Static analysis (recommended)
pip install slither-analyzer solc-select
solc-select install 0.8.20 && solc-select use 0.8.20
cargo install aderyn

# Proof tools (optional, for ATTACK phase)
pip install echidna        # Fuzzing
pip install medusa         # Fuzzing
pip install halmos          # Symbolic execution
# ItyFuzz -- see https://docs.ityfuzz.rs/

# Foundry (for PoC generation)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Backward Compatibility

- `/security-auditor` slash command unchanged
- Existing config.json files work without changes (new sections default)
- All existing MCP tools preserved with same schemas
- New fields on Finding type are all optional (existing constructions still compile)

## Migration Notes

- `benchmark` mode must be explicitly enabled in config
- Proof tools are opt-in via `proof_tools` config section
- Default mode behavior is unchanged from v0.3.0
- HUNT prompts reference attack-vector packs; these are bundled, not fetched

## v0.4.0 New Features

### Core Domain Model
- `Finding` type extended with `status`, `proof_type`, `root_cause_key`, `independence_count`, `witness_path`, `verification_notes`, `benchmark_mode_visible`
- All new fields are optional for backward compatibility

### Static Normalization (`static-normalizer.ts`)
- Deterministic detector category mapping for Slither and Aderyn
- Confidence normalization (Slither: High/Medium/Low, Aderyn: high_issues/low_issues)
- Hotspot lane hints from detector categories
- Stable evidence record creation

### Root Cause Clustering (`root-cause.ts`)
- Two-stage deduplication: fingerprint grouping + semantic merge
- Cross-tool finding correlation (within 10-line threshold)
- Severity escalation on merge (keeps highest)
- Deterministic root_cause_key assignment

### MAP Builder (`map-builder.ts`)
- Heuristic-based Solidity source scanning (no AST required)
- Extracts: components, functions, auth surfaces, state variables, write sites, external calls, value flows
- Config semantic inference with conflict detection
- Protocol invariant derivation

### Hotspot Ranking (`hotspot-ranking.ts`)
- Five vulnerability lanes: callback_liveness, accounting_entitlement, semantic_consistency, token_oracle_statefulness, adversarial_deep
- Score-based prioritization with deterministic ordering
- Hotspots from: findings, external calls, config conflicts, value flows

### Verification Pipeline (`verification.ts`)
- Proof ingestion for Foundry, Echidna, Medusa, Halmos
- Finding state transitions: candidate -> verified/discarded
- Witness path tracking

### Audit Report Builder (`audit-report.ts`)
- Three-bucket partitioning: scored, research candidates, discarded
- Benchmark mode gating: HIGH/MEDIUM findings require proof
- Metadata with workflow mode, counts, and ISO timestamp

### MCP Tools (11 total)
1. `run-slither` - Slither static analysis
2. `run-aderyn` - Aderyn static analysis
3. `get_checklist` - Cyfrin audit checklist
4. `search_findings` - Solodit findings search
5. `build-system-map` - System map construction
6. `derive-hotspots` - Hotspot derivation and ranking
7. `generate-foundry-poc` - Foundry PoC scaffold generation
8. `run-echidna` - Echidna fuzzer execution
9. `run-medusa` - Medusa fuzzer execution
10. `run-halmos` - Halmos symbolic execution
11. `verify-finding` - Skeptic/judge verification pipeline
