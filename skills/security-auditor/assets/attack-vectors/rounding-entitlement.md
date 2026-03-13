# Rounding Entitlement

Rounding entitlement attacks exploit Solidity's integer arithmetic, which always truncates (rounds toward zero) on division. When a protocol does not carefully control rounding direction, value leaks from one party to another on every operation. Attackers amplify this leakage through high-frequency small transactions or, in the most severe case, manipulate share prices through the "first depositor" attack to steal from subsequent users.

## Detection Cues

- Integer division without explicit rounding direction (plain `/` operator on values that may not divide evenly)
- `mulDiv` usage without a rounding parameter (OpenZeppelin's `Math.mulDiv` defaults to rounding down)
- Share mint calculations: `shares = assets * totalSupply / totalAssets` without rounding direction consideration
- Share burn calculations: `assets = shares * totalAssets / totalSupply` with same-direction rounding as mint
- Fee calculations with small amounts where `amount * feeRate / FEE_DENOMINATOR` rounds to zero
- Price conversions between tokens with different decimals (e.g., 18-decimal to 6-decimal)
- Missing minimum deposit/withdrawal amount enforcement
- No dead shares or virtual offset in ERC-4626 vaults
- Repeated division before multiplication (compounding truncation error)
- Exchange rate calculations without precision scaling

## Attack Narrative

Rounding attacks come in several forms, each exploiting truncation in a different way:

### Variant 1: First Depositor / Inflation Attack

This is the most severe rounding attack and applies to any share-based vault:

1. **Setup**: The attacker is the first depositor in a new vault. They deposit the minimum amount (1 wei) and receive 1 share.

2. **Donate**: The attacker directly transfers a large amount of the underlying asset to the vault (e.g., 1,000,000 tokens). The vault's `totalAssets` is now 1,000,001, but `totalSupply` is still 1 share. Each share is now "worth" 1,000,001 tokens.

3. **Victim deposits**: A legitimate user deposits 999,999 tokens. The share calculation is `shares = 999,999 * 1 / 1,000,001 = 0` (truncated to zero). The user receives 0 shares but their tokens are now in the vault.

4. **Attacker withdraws**: The attacker redeems their 1 share for `1 * 2,000,000 / 1 = 2,000,000` tokens (their original donation plus the victim's deposit). The victim has lost everything.

### Variant 2: Dust Accumulation Through Repeated Rounding

1. **Identify rounding direction**: The attacker confirms that both deposits (share minting) and withdrawals (share burning) round in the protocol's favor, or both round in the user's favor.

2. **High-frequency operations**: The attacker performs many small deposit/withdrawal cycles. On each cycle, rounding truncation either leaves dust in the vault (benefiting remaining shareholders) or extracts a tiny surplus from the vault.

3. **Accumulate**: Over thousands of operations, the accumulated rounding error becomes significant. If rounding favors the user on both operations, the attacker slowly drains the vault. If rounding favors the vault, the attacker can grief other users by inflating the vault's apparent reserves.

### Variant 3: Fee Evasion Through Small Amounts

1. **Identify fee calculation**: The attacker finds a fee calculation like `fee = amount * feeRate / 10000`.

2. **Calculate threshold**: For `feeRate = 30` (0.3%), any `amount < 334` results in `fee = 0` due to truncation.

3. **Split transactions**: Instead of one large transaction, the attacker performs many transactions just below the threshold, paying zero fees on each. The protocol collects no revenue while the attacker gets full service.

## Concrete Examples

### ERC-4626 First Depositor Attack

The standard ERC-4626 vault implementation is vulnerable to the first depositor attack if no mitigation is applied. The attacker deposits 1 wei, donates tokens to inflate the share price, and subsequent depositors receive 0 shares. This has been documented in multiple audits and is the primary motivation for OpenZeppelin's `_decimalsOffset()` virtual offset in their ERC-4626 implementation.

```solidity
// Vulnerable: no offset, no dead shares
function _convertToShares(uint256 assets) internal view returns (uint256) {
    uint256 supply = totalSupply();
    return supply == 0 ? assets : assets.mulDiv(supply, totalAssets());
    // When totalAssets is inflated and supply is 1, result rounds to 0
}
```

### Fee Rounding to Zero

A DEX charges a 0.3% fee on swaps. For any swap amount below 334 wei, the fee rounds to zero. While individual transactions this small are uneconomical on Ethereum mainnet due to gas costs, on L2s with near-zero gas costs, an attacker can execute millions of fee-free swaps to arbitrage small price differences without paying the protocol.

```solidity
// Fee rounds to zero for small amounts
uint256 fee = swapAmount * 30 / 10000;
// swapAmount = 333: fee = 333 * 30 / 10000 = 0
```

### Share Price Manipulation via Donation

A yield aggregator computes share prices as `totalAssets / totalSupply`. An attacker donates a large amount of assets directly to the vault contract (not through the deposit function). This inflates `totalAssets` without minting new shares, causing the share price to jump. Subsequent depositors receive fewer shares than expected, and the attacker (who held shares before the donation) can redeem at the inflated price. Combined with flash loans, the attacker can donate, deposit as a victim would to receive 0 shares, then withdraw everything.

## False-Positive Refutations

Before flagging a rounding entitlement vulnerability, verify that none of the following protections are in place:

- **Protocol uses OpenZeppelin's ERC-4626 with `_decimalsOffset()`**: The virtual offset adds a configurable number of "virtual" decimal places to the share calculation, making the first depositor attack require exponentially more capital to execute. A `_decimalsOffset()` of 3 requires the attacker to donate 1000x more tokens to steal 1 wei of victim deposits.

- **Dead shares are minted on initialization**: If the vault mints a fixed number of shares to the zero address (or a burn address) during initialization, the share price cannot be manipulated to the extreme ratios needed for the first depositor attack. Verify that the dead shares are large enough (typically at least 1000) and are minted before any user can deposit.

- **Minimum deposit/withdrawal amounts prevent dust exploitation**: If the protocol enforces a minimum amount for deposits and withdrawals that is large enough to ensure rounding error is negligible relative to the amount, dust accumulation attacks are uneconomical. Verify the minimum is enforced on-chain, not just in the frontend.

- **Protocol uses mulDivUp for withdrawals and mulDivDown for deposits**: If the protocol consistently rounds against the user (fewer shares on deposit via rounding down, fewer assets on withdrawal via rounding down), the vault always retains a tiny surplus. This means rounding error benefits remaining shareholders rather than allowing extraction. Verify both mint and burn paths use the correct rounding direction.

- **Donation attack is mitigated by internal accounting**: If the vault tracks `totalAssets` through internal bookkeeping (incrementing on deposits, decrementing on withdrawals) rather than reading `balanceOf(address(this))`, direct token donations do not affect the share price. Verify that no code path sets `totalAssets` from the actual balance.
