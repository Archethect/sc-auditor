# Semantic Drift

Semantic drift occurs when the same variable name, constant, or formula carries different meanings across different parts of a codebase. A developer copies or references a value from one contract assuming it represents one thing, but in the destination context it represents something else entirely. The result is calculations that are off by orders of magnitude, silent under-charging or over-charging, or complete breakdown of protocol invariants.

## Detection Cues

- Same variable name appearing in different contracts with different arithmetic operations applied to it (e.g., `taxCut` used as a divisor in one place and a multiplier in another)
- Percentage stored as a divisor in one contract (e.g., `/ taxCut` where `taxCut = 10` means 10%) and as a numerator in another (e.g., `* taxCut / 100`)
- Magic numbers without named constants, especially `100`, `1000`, `10000` (basis points), `1e18`, `1e6`
- Copy-pasted formulas with modified divisors or multipliers that change the unit or scale
- Fee or rate parameters that are set in one contract but consumed in another without unit conversion
- Decimal assumptions (hardcoded `1e18`) when interacting with tokens that may have 6 or 8 decimals
- Shared configuration parameters consumed by multiple contracts without a single source of truth
- Inconsistent use of percentage representations (percent vs basis points vs parts per million)

## Attack Narrative

Semantic drift is typically not exploited by a sophisticated attacker but rather causes systemic miscalculation that benefits one party at the expense of another. The "attack" is often passive:

1. **Identify the inconsistency**: The auditor (or attacker) examines how a shared parameter is used across the codebase. They find that Contract A treats `feeRate` as a percentage (multiply by `feeRate`, divide by 100), while Contract B treats the same value as a divisor (divide by `feeRate`). If `feeRate` is 10, Contract A charges 10% but Contract B charges 1/10 = 10% as well, which coincidentally matches. But if governance changes `feeRate` to 5, Contract A charges 5% while Contract B charges 1/5 = 20%.

2. **Trigger the divergence**: The attacker (or innocent governance action) changes the parameter to a value where the two interpretations diverge significantly. This could be a governance proposal to "lower fees to 2%," which sets `feeRate = 2`. Contract A now charges 2%, but Contract B charges 1/2 = 50%.

3. **Extract value**: The attacker routes transactions through the contract with the more favorable interpretation. If Contract B is now charging 50% on sells but Contract A is charging 2% on buys, the attacker can buy through A and sell through B's counterparty at a massive arbitrage.

4. **Impact**: Depending on the direction of the drift, users may be overcharged (losing funds) or undercharged (protocol loses funds). In extreme cases, the protocol becomes insolvent because fees collected are far less than fees owed.

## Concrete Examples

### TraitForge taxCut Divergence

In the TraitForge protocol, the `taxCut` variable was used in two different contracts with opposite semantics. In one contract, it was used as a divisor: `amount / taxCut`, meaning a `taxCut` of 10 resulted in a 10% fee. In another contract, it was used as a percentage numerator: `amount * taxCut / 100`, meaning a `taxCut` of 10 also resulted in a 10% fee. While both yielded the same result for the value 10, changing `taxCut` to any other value would cause wildly different fee calculations. For example, `taxCut = 5` would mean 20% in the first contract but 5% in the second.

### Basis Points vs Percent Confusion

A common real-world pattern involves fee parameters that some contracts interpret as basis points (1/10000) and others as percentages (1/100). A fee of `50` means 0.5% if interpreted as basis points but 50% if interpreted as a percentage. This 100x discrepancy can occur when a protocol integrates with an external contract that uses a different fee convention, or when different developers implement fee logic with different assumptions.

```solidity
// Contract A: basis points (correct: 0.5%)
uint256 fee = amount * feeRate / 10000; // feeRate = 50

// Contract B: percentage (incorrect: 50%)
uint256 fee = amount * feeRate / 100;   // feeRate = 50
```

### Token Decimal Assumptions

A price oracle returns prices with 18 decimals, and the protocol assumes all token amounts also have 18 decimals. When the protocol integrates USDC (6 decimals) or WBTC (8 decimals), the price calculation is off by 10^12 or 10^10 respectively. Users depositing USDC get credited with 10^12 times more value than intended, draining the protocol on withdrawal.

## False-Positive Refutations

Before flagging a semantic drift vulnerability, verify that none of the following conditions apply:

- **Variables are in independent contracts that never interact**: If two contracts use `feeRate` with different semantics but never share the value (each has its own storage, set by different governance actions), there is no drift. They are independent variables that happen to share a name. Verify there is no shared setter or constructor parameter.

- **An explicit conversion function exists between the units**: If the protocol includes a conversion function (e.g., `bpToPercent()` or `toDecimals()`) that is always called at the module boundary, the different representations are intentional and safely converted. Verify the conversion is actually used in all code paths, not just some.

- **The different usage is documented and intentional**: If the code includes clear documentation (NatSpec comments, named constants like `FEE_AS_DIVISOR` vs `FEE_AS_PERCENT`) explaining that the same concept is represented differently in different contexts, and the conversion is verified in tests, this is a design choice, not a bug.

- **Single source of truth with consistent consumers**: If the parameter is stored once and all consumers use the same arithmetic to interpret it, there is no drift even if the arithmetic looks unusual. Verify by tracing every read of the parameter and confirming identical interpretation.

- **Value is bounded to a range where both interpretations coincide**: In rare cases, the parameter might be constrained (e.g., always equal to a power of 10) such that both interpretations yield identical results. This is fragile and should be flagged as a latent risk, but it is not currently exploitable.
