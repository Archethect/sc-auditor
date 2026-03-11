# Hard Negatives: Semantic Drift

These patterns involve variables, constants, or formulas that appear to have inconsistent meanings across the codebase but are actually safe. Use these to avoid flagging intentional design choices or well-contained abstractions as vulnerabilities.

## Pattern: Different Fee Representations in Different Modules

### Why It Looks Bad

Module A stores fees as basis points (e.g., `feeBps = 30` for 0.3%), while Module B stores fees as a percentage (e.g., `feePercent = 3` for 3%). The same concept (a fee) is represented with different units in different parts of the system. If a developer reads `feeBps` and uses it where `feePercent` is expected (or vice versa), calculations will be off by a factor of 100.

### Why It's Safe

A dedicated conversion function exists at the module boundary and is always invoked when passing fee values between modules. For example, `Module A` exposes `getFeeBps()` which returns basis points, and `Module B` always calls `bpsToPercent(moduleA.getFeeBps())` before using the value. The conversion is enforced by the interface design; there is no way to accidentally use the raw value without conversion. Tests verify that the conversion produces correct results across the full range of valid inputs.

### Key Indicators

- A conversion function exists (e.g., `bpsToPercent()`, `percentToBps()`, `toDecimals()`)
- Every cross-module fee read passes through the conversion function (no direct storage reads across module boundaries)
- The conversion function has unit tests covering edge cases (zero, maximum value, boundary values)
- Named constants clearly indicate units (e.g., `FEE_BPS`, `FEE_PERCENT`, `RATE_WAD`) in both modules
- Code review or CI linting enforces that raw fee values are not passed across module boundaries

## Pattern: Governance-Adjustable Parameters with Bounds Checking

### Why It Looks Bad

A governance-controlled parameter like `feeRate` can be changed to any value by governance. If the fee is used as a divisor in one place (`amount / feeRate`) and the governance changes it to a very small number, the fee becomes enormous. If it is used as a multiplier elsewhere, the same change makes the fee negligible. The semantic interpretation depends on the current value, which is unpredictable.

### Why It's Safe

The setter function enforces strict bounds on the parameter's value. For example, `require(newFeeRate >= MIN_FEE && newFeeRate <= MAX_FEE)` ensures the fee stays within a safe range regardless of how governance votes. The bounds are chosen such that all consumers of the parameter produce reasonable results within the allowed range. Additionally, a timelock on parameter changes gives users time to exit if they disagree with the new value.

### Key Indicators

- The setter function includes `require` statements with minimum and maximum bounds
- The bounds are tight enough to prevent dangerous edge cases (e.g., division by zero, 100% fee)
- Bounds are defined as immutable constants, not adjustable by governance
- A timelock or delay exists between the governance proposal and the parameter change taking effect
- The parameter's usage across all consumers is documented in comments referencing the bounds
- Tests verify that boundary values produce safe results in all consuming functions

## Pattern: Named Constants with Different Values for Different Contexts

### Why It Looks Bad

The codebase defines `PRECISION = 1e18` in one contract and `PRECISION = 1e6` in another. The same name with different values looks like a copy-paste error or a semantic drift bug. A developer moving code between contracts might assume `PRECISION` is always `1e18` and introduce a calculation error.

### Why It's Safe

The constants are intentionally different because they correspond to different token decimals or different precision requirements. The first contract handles 18-decimal tokens (ETH, DAI) and needs `1e18` precision. The second handles 6-decimal tokens (USDC, USDT) and uses `1e6` precision. The constants are scoped to their respective contracts and never cross contract boundaries. Each contract's internal calculations are self-consistent with its own precision constant.

### Key Indicators

- Constants are defined as `private` or `internal` to the contract (not `public` and not shared)
- Each constant's value is documented with a comment explaining why it has that specific value
- No cross-contract calls pass raw precision-scaled values without explicit conversion
- Token decimal information is available at runtime (via `decimals()`) for dynamic conversion when needed
- The contracts that use different precision values handle different token types (documented in contract NatSpec)

## Pattern: Duplicated Formula with Intentionally Different Divisor

### Why It Looks Bad

Two contracts contain nearly identical formulas, but one uses `/ 100` and the other uses `/ 10000`. This looks like a copy-paste error where the developer forgot to update the divisor.

### Why It's Safe

The formulas intentionally use different divisors because they operate on parameters with different units. The first formula uses `/ 100` because its input is a percentage (0-100). The second uses `/ 10000` because its input is in basis points (0-10000). Both formulas produce the same result for equivalent inputs (e.g., 5% = 500 bps). The difference in divisor is the correct conversion for the different input units.

### Key Indicators

- The input parameter names clearly indicate their units (e.g., `feePercent` vs `feeBps`)
- Comments or NatSpec explain the unit of each parameter
- Tests verify that equivalent inputs produce equivalent outputs (e.g., `calculate(500, 10000)` equals `calculate(5, 100)`)
- The parameters are set from different sources that natively use different units (e.g., one from a governance vote in percent, another from an oracle in basis points)
- No code path converts between the two representations incorrectly
