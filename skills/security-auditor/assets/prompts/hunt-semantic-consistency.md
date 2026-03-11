# HUNT — Semantic Consistency Lane

## Purpose

Systematically identifies hotspots where semantic meaning drifts across the codebase: configuration variables with the same name but different units, copied formulas with changed semantics, magic numbers, inconsistent decimal handling, and basis-point/percent/divisor confusion. This lane focuses on any pattern where the developer's intent and the code's behavior diverge due to inconsistent conventions.

## Inputs

| Name | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `systemMap` | SystemMapArtifact | yes | Complete system map from the MAP phase, especially `config_semantics` |
| `staticFindings` | object[] | yes | Static analysis findings (all categories — semantic issues may surface as arithmetic, constant, or naming detectors) |

## Output Schema

```json
[
  {
    "id": "<string>",
    "lane": "semantic_consistency",
    "title": "<string>",
    "priority": "critical | high | medium | low",
    "affected_files": ["<string>"],
    "affected_functions": ["<string>"],
    "related_invariants": ["<string>"],
    "evidence": [
      {
        "source": "<string>",
        "detail": "<string>",
        "confidence": "high | medium | low"
      }
    ],
    "candidate_attack_sequence": ["<string>"],
    "root_cause_hypothesis": "<string>"
  }
]
```

## Attack Patterns to Investigate

### Pattern 1 — Same-Name Config Variables with Different Units

Inspect `systemMap.config_semantics` for variables that share a name (or semantically equivalent name) but have different `unit` fields across contracts. Key indicators:

- Variable named `fee` in Contract A uses `basis_points` (0-10000) while `fee` in Contract B uses `percent` (0-100). If A passes its fee to B (or both read from a shared config), the value is misinterpreted by a factor of 100.
- Variable named `rate` that is a per-second rate in one contract but a per-block rate in another. Interaction between them produces wildly incorrect time calculations.
- Variable named `threshold` that is in wei in one contract but in whole tokens in another. A threshold of `1000` means 1000 wei (negligible) or 1000 tokens (significant) depending on interpretation.

For each pair of semantically similar config variables, verify: do these contracts ever interact? If yes, is the unit conversion performed correctly at every interaction point?

### Pattern 2 — Copied Formulas with Changed Semantics

Identify code blocks that appear to be copied from one contract to another (or from a well-known reference implementation) but with subtle changes to the formula semantics:

- Division by a fee variable that was originally a divisor (e.g., divide by 10000) but is now used as a percent (should multiply by 100 and divide by 10000 = divide by 100). The formula structure looks identical but the variable meaning changed.
- Rate calculations copied from a time-based system (seconds) to a block-based system without adjusting the rate constant.
- Share calculations from ERC-4626 adapted for a custom vault but with the rounding direction inverted or the virtual offset removed.

Cross-reference `systemMap.external_surfaces` for functions that perform arithmetic using config variables and compare the formulas across contracts.

### Pattern 3 — Percent vs Divisor vs Basis-Point Drift

This is the most common semantic consistency bug. Scan all arithmetic operations involving fee, rate, or threshold variables:

- **Percent pattern**: `amount * fee / 100` (fee is 0-100)
- **Basis point pattern**: `amount * fee / 10_000` (fee is 0-10000)
- **Divisor pattern**: `amount / fee` (fee is the divisor directly)

For each config variable in `systemMap.config_semantics`, verify:
1. The `unit` field matches how the variable is actually used in every formula.
2. The setter function validates the range consistently with the unit.
3. If the variable is passed between contracts, the receiving contract interprets it with the same unit.

A variable named `feePercent` that is actually used as basis points (divided by 10000) is a critical semantic mismatch.

### Pattern 4 — Magic Numbers

Scan for literal numeric constants in arithmetic expressions that should be named constants:

- Divisors like `10000`, `1e18`, `1e27`, `100`, `365 days` used inline without explanation.
- Hardcoded addresses or selectors that could change.
- Numeric thresholds for control flow (e.g., `if (amount > 1000000)`).

Magic numbers are a hotspot because:
1. They obscure the developer's intent, making it hard to verify correctness.
2. If the same constant is needed in multiple places, different literals may be used inconsistently.
3. They resist refactoring — changing a fee from percent to basis points requires finding every `100` divisor.

Cross-reference `staticFindings` for detectors like `magic-number`, `similar-names`, and `too-many-digits`.

### Pattern 5 — Inconsistent Decimal Handling

Scan for decimal handling across different token types:

- Functions that handle both 18-decimal tokens (ETH, most ERC-20) and 6-decimal tokens (USDC, USDT) without scaling. If `amount` is denominated in 18 decimals but the function divides by `1e6`, the result is off by `1e12`.
- Price calculations that combine an oracle price (8 decimals for Chainlink) with token amounts (18 decimals) without proper scaling.
- Share calculations that assume a specific decimal count for the underlying asset.
- Fee calculations that lose precision due to insufficient decimal places in intermediate values.

Cross-reference `systemMap.components` for contracts that handle multiple token types, and verify that decimal normalization is applied consistently.

## Analysis Procedure

1. **Extract config variable pairs**: From `systemMap.config_semantics`, identify all pairs of variables that share a name prefix or semantic role. For each pair across different contracts, check unit consistency.

2. **Scan for formula patterns**: For each function in `systemMap.external_surfaces` that performs arithmetic, identify the formula pattern (percent, basis_points, divisor) and verify it matches the config variable's declared unit.

3. **Cross-reference static findings**: Match `staticFindings` for detectors: `magic-number`, `divide-before-multiply`, `similar-names`, `too-many-digits`, `incorrect-equality`, and naming convention detectors.

4. **Trace cross-contract data flow**: For config variables that are read by multiple contracts (e.g., shared governance parameters), verify that every consumer interprets the value with the same unit.

5. **Apply refutation checklist** (see below) to each candidate.

6. **Score priority**:
   - `critical`: Semantic mismatch causes incorrect value transfer (wrong fee amount, wrong share count) in a core function.
   - `high`: Semantic mismatch causes material miscalculation that compounds over time or under specific token configurations.
   - `medium`: Inconsistency exists between contracts that do interact, but the impact is bounded by validation or range limits.
   - `low`: Inconsistency between contracts that do not currently interact, or magic numbers that are used correctly but should be named.

7. **Emit hotspots**: For each candidate that survives refutation, construct a `Hotspot` object.

## Refutation Checklist

Before emitting ANY hotspot, answer every question below. If a "yes" answer fully explains the discrepancy, do NOT emit the hotspot.

1. **Are the different units intentional and documented?** Check for NatSpec comments, variable naming that explicitly includes the unit (e.g., `feeBps`, `feePercent`, `rateDivisor`), or documentation that explains the convention. If the naming is explicit and the usage matches the name, this is not a bug.

2. **Is there a conversion function between the units?** Check for helper functions like `bpsToPercent()`, `percentToBps()`, `scaleDecimals()`, or inline conversion in the function that bridges the two contracts. If a correct conversion exists at every boundary, this is not a bug.

3. **Do the contracts interact, or are they independent?** If two contracts have the same variable name with different units but never exchange data or compose in any call path, the inconsistency is a style issue, not a security issue. Downgrade to `low` or omit.

4. **Is the magic number a well-known constant?** Values like `1e18` (WAD), `1e27` (RAY), `10000` (basis point denominator), and `type(uint256).max` are industry conventions. If used consistently and correctly, they are acceptable inline.

5. **Is decimal normalization handled by an upstream library?** Some protocols delegate decimal handling to a library function (e.g., `SafeTokenLib.normalize()`) that handles scaling transparently. Verify the library is called before flagging inconsistent decimals.

## Disallowed Behaviors

- **DO NOT** emit prose, markdown, or commentary. Output is a JSON array of `Hotspot` objects only.
- **DO NOT** generate findings or assign final severity ratings. Hotspots are hypotheses, not confirmed findings.
- **DO NOT** rely on live `mcp__sc-auditor__search_findings` results to create hotspots. Solodit is for evidence enrichment only.
- **DO NOT** emit hotspots with `lane` values other than `"semantic_consistency"`.
- **DO NOT** skip the refutation checklist.
- **DO NOT** emit duplicate hotspots. Consolidate related inconsistencies.
- **DO NOT** report privileged-role abuse.
- **DO NOT** flag well-documented, intentional unit differences as vulnerabilities.
- **DO NOT** flag every magic number. Only flag magic numbers that are used inconsistently across locations or that obscure a critical calculation.

## Output Example

```json
[
  {
    "id": "HS-020",
    "lane": "semantic_consistency",
    "title": "Fee variable 'protocolFee' interpreted as percent in Vault but basis points in FeeCollector",
    "priority": "critical",
    "affected_files": ["src/Vault.sol", "src/FeeCollector.sol"],
    "affected_functions": ["Vault.harvest()", "FeeCollector.collectFee(uint256,uint256)"],
    "related_invariants": ["INV-003"],
    "evidence": [
      {
        "source": "system_map:config_semantics",
        "detail": "Vault.protocolFee has unit 'percent' (divided by 100) but FeeCollector.collectFee divides by 10000, treating the same value as basis points",
        "confidence": "high"
      },
      {
        "source": "code_analysis",
        "detail": "Vault.harvest() calls FeeCollector.collectFee(totalProfit, protocolFee) passing protocolFee=500. Vault intends 500% (invalid) but FeeCollector interprets as 5% (500 bps). Setter caps protocolFee at 20 (intended as 20%); FeeCollector would interpret as 0.2%",
        "confidence": "high"
      }
    ],
    "candidate_attack_sequence": [
      "1. Governance sets protocolFee to 10 (intending 10%)",
      "2. Vault.harvest() passes protocolFee=10 to FeeCollector.collectFee()",
      "3. FeeCollector computes fee = totalProfit * 10 / 10000 = 0.1% instead of 10%",
      "4. Protocol collects 100x less fees than intended",
      "5. Value leaks to users who should have been charged higher fees"
    ],
    "root_cause_hypothesis": "protocolFee is set with percent semantics (0-100) in Vault but consumed with basis-point semantics (0-10000) in FeeCollector, causing a 100x fee miscalculation"
  },
  {
    "id": "HS-021",
    "lane": "semantic_consistency",
    "title": "Oracle price decimal mismatch between Chainlink (8 decimals) and token amount (18 decimals)",
    "priority": "high",
    "affected_files": ["src/PriceOracle.sol", "src/LiquidationEngine.sol"],
    "affected_functions": ["PriceOracle.getPrice(address)", "LiquidationEngine.isLiquidatable(address)"],
    "related_invariants": ["INV-007"],
    "evidence": [
      {
        "source": "code_analysis",
        "detail": "PriceOracle.getPrice() returns raw Chainlink answer (8 decimals) without scaling. LiquidationEngine multiplies collateral amount (18 decimals) by price (8 decimals) and compares to debt (18 decimals) without normalizing to a common decimal base",
        "confidence": "high"
      },
      {
        "source": "system_map:config_semantics",
        "detail": "No decimal scaling function exists between PriceOracle and LiquidationEngine",
        "confidence": "medium"
      }
    ],
    "candidate_attack_sequence": [
      "1. User has collateral worth $10,000 (10000e18 tokens * $1.00e8 price)",
      "2. LiquidationEngine computes collateral value = 10000e18 * 1e8 = 1e30 (26 decimals)",
      "3. Debt is stored as 8000e18 (18 decimals)",
      "4. Comparison 1e30 > 8000e18 always evaluates true regardless of actual price",
      "5. No position is ever liquidatable, creating systemic insolvency risk"
    ],
    "root_cause_hypothesis": "Chainlink oracle returns 8-decimal prices but the liquidation calculation treats them as 18-decimal, making all collateral appear vastly overvalued and preventing necessary liquidations"
  }
]
```
