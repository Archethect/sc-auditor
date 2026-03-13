# Hard Negatives: Rounding Entitlement

These patterns involve integer arithmetic truncation, share price calculations, or dust-level value movements that look like rounding vulnerabilities but are actually safe. Use these to avoid flagging well-mitigated vault implementations or intentional precision trade-offs as exploitable bugs.

## Pattern: Small Rounding Loss Per Operation with Minimum Amounts

### Why It Looks Bad

On every deposit or withdrawal, integer division truncates the result, causing a rounding loss of up to 1 unit (1 wei of shares or 1 wei of assets). Over many operations, this loss accumulates. An attacker performing thousands of small deposits and withdrawals could potentially extract value from the vault through systematic rounding exploitation.

### Why It's Safe

The protocol enforces a minimum deposit and withdrawal amount that is large enough to make the rounding loss economically negligible. For example, if the minimum deposit is 1e15 (0.001 ETH) and the rounding loss is at most 1 wei per operation, the loss is 0.0000000000001% per operation. The gas cost of each transaction far exceeds the value of the rounding loss, making the attack economically irrational even on L2s with minimal gas costs. The protocol consistently rounds in its own favor (shares down on deposit, assets down on withdrawal), ensuring the vault always retains a tiny surplus rather than leaking value.

### Key Indicators

- A `require(amount >= MIN_DEPOSIT)` or equivalent check exists in the deposit function
- A `require(shares >= MIN_WITHDRAW)` or equivalent check exists in the withdrawal function
- The minimum amounts are large enough that `amount * FEE / DENOMINATOR > 0` for all fee calculations
- Rounding direction is consistent: `mulDivDown` for deposit (fewer shares) and `mulDivDown` for withdrawal (fewer assets returned)
- The vault's invariant `totalAssets >= sum(user entitlements)` holds after every operation
- Gas cost analysis shows that the rounding extraction per operation is orders of magnitude smaller than the gas cost

## Pattern: First Depositor Protection via Dead Shares

### Why It Looks Bad

The vault allows any user to be the first depositor, and the share calculation uses `totalSupply == 0 ? assets : assets * totalSupply / totalAssets`. When `totalSupply` is 0, the first depositor gets `assets` shares (1:1 ratio). An attacker could deposit 1 wei, then donate a large amount of tokens to inflate the share price, causing subsequent depositors to receive 0 shares.

### Why It's Safe

The vault mints "dead shares" during initialization: a fixed number of shares (e.g., 1000 or 10**decimalsOffset) are minted to the zero address or a burn address before any user can deposit. This means `totalSupply` is never 0 when a user deposits, and the initial share price is anchored. To execute the inflation attack, an attacker would need to donate enough tokens to make subsequent deposits round to 0 shares relative to the dead share base, which requires exponentially more capital as the dead share count increases. For 1000 dead shares, the attacker would need to donate 1000x more than the victim's deposit, making the attack unprofitable.

### Key Indicators

- The constructor or initializer mints shares to `address(0)`, `address(0xdead)`, or a similar burn address
- The dead share count is a constant (not adjustable) and is at least 1000 (or `10**_decimalsOffset()`)
- The dead share mint happens before `deposit` is callable (in the constructor, or behind an initialization flag)
- No function exists to burn or transfer the dead shares
- The `_decimalsOffset()` function returns a non-zero value (OpenZeppelin ERC-4626 pattern)

## Pattern: Virtual Offset in ERC-4626 Share Calculation

### Why It Looks Bad

The share calculation appears to use a raw division that could truncate to zero for small deposits relative to a large `totalAssets`. The standard `convertToShares = assets * supply / totalAssets` formula is present, and the vault does not appear to have dead shares.

### Why It's Safe

The vault uses OpenZeppelin's ERC-4626 implementation with a non-zero `_decimalsOffset()`. This virtual offset adds phantom precision to the share calculation without actually minting shares. Internally, the formula becomes `assets * (supply + 10**offset) / (totalAssets + 1)`, which means the effective share price is always anchored near 1:1 at the scale of the offset. An attacker trying the inflation attack must overcome this virtual base, requiring exponentially more capital per unit of offset. A `_decimalsOffset()` of 3 provides the same protection as 1000 dead shares.

### Key Indicators

- The contract overrides `_decimalsOffset()` and returns a non-zero value (typically 3 or 6)
- The contract inherits from OpenZeppelin's `ERC4626` (v4.9+ or v5+)
- The `_convertToShares` and `_convertToAssets` functions include the offset in their calculations
- No custom override removes or bypasses the offset logic
- The vault's `decimals()` returns `asset.decimals() + _decimalsOffset()`

## Pattern: Internal Accounting Prevents Donation-Based Share Manipulation

### Why It Looks Bad

The vault calculates share prices based on its total assets, and anyone can send tokens directly to the vault contract to inflate `totalAssets`. This donation inflates the share price without minting new shares, potentially enabling the first depositor attack or causing subsequent depositors to receive fewer shares than expected.

### Why It's Safe

The vault tracks total assets through internal bookkeeping rather than reading the token balance. Deposits increment an internal counter, and withdrawals decrement it. Tokens sent directly to the vault (outside the `deposit` function) do not affect the internal counter and therefore do not affect the share price. The vault may include a `sweep` function that allows governance to recover these donated tokens, or they simply remain as unaccounted surplus providing an additional safety buffer for the vault.

### Key Indicators

- `totalAssets()` returns an internal storage variable (e.g., `_totalDeposited`), not `asset.balanceOf(address(this))`
- The `deposit` function explicitly increments the internal counter: `_totalDeposited += assets`
- The `withdraw` function explicitly decrements: `_totalDeposited -= assets`
- Yield accrual is handled through a separate, authorized function (e.g., `reportYield(amount)`) rather than balance snapshots
- No `sync` function exists that sets internal state from `balanceOf`
- The invariant `_totalDeposited <= asset.balanceOf(address(this))` is maintained (internal never exceeds actual)

## Pattern: Consistent Rounding Direction Across All Operations

### Why It Looks Bad

Individual operations show rounding loss, with each deposit or withdrawal losing up to 1 wei. This appears to be a systematic value leak.

### Why It's Safe

The protocol uses a consistent rounding strategy where all rounding goes in favor of the vault (against the user). Deposits use `mulDivDown` to mint fewer shares (user gets slightly less). Withdrawals use `mulDivDown` to return fewer assets (user gets slightly less). This means every operation leaves a tiny surplus in the vault, which benefits all remaining shareholders. The rounding loss is bounded to 1 wei per operation and cannot be accumulated by an attacker because each operation's rounding loss stays in the vault. The vault's total assets monotonically grow relative to total shares from rounding alone.

### Key Indicators

- Deposit path uses `Math.mulDiv(assets, supply, totalAssets, Math.Rounding.Floor)` or equivalent
- Withdrawal path uses `Math.mulDiv(shares, totalAssets, supply, Math.Rounding.Floor)` or equivalent
- Both paths round down (floor), meaning both round against the user
- No code path exists that rounds in the user's favor (no `Ceil` rounding on either side)
- The vault's share price never decreases from rounding alone (only increases as surplus accumulates)
