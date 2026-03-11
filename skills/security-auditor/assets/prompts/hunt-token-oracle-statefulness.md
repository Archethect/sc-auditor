# HUNT — Token Oracle Statefulness Lane

## Purpose

Systematically identifies hotspots related to token behavior assumptions and oracle reliability: approval abuse, fee-on-transfer and rebasing token handling, oracle staleness and manipulation, and multi-transaction state assumptions. This lane focuses on any pattern where the protocol's assumptions about external token or oracle behavior do not hold under adversarial conditions or for non-standard token implementations.

## Inputs

| Name | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `systemMap` | SystemMapArtifact | yes | Complete system map from the MAP phase |
| `staticFindings` | object[] | yes | Static analysis findings filtered to token/oracle/approval categories |

## Output Schema

```json
[
  {
    "id": "<string>",
    "lane": "token_oracle_statefulness",
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

### Pattern 1 — Token Approval Abuse

Scan `systemMap.external_call_sites` for `approve`, `increaseAllowance`, and `safeApprove` calls. Key indicators:

- **Unlimited approvals**: Functions that call `approve(spender, type(uint256).max)`. If the approved spender is compromised or malicious, all approved tokens are at risk. Check whether the spender is a trusted, immutable protocol address or a mutable/upgradeable contract.
- **Approval front-running**: The classic ERC-20 `approve` race condition. If a user changes an allowance from N to M, the spender can front-run to spend N, then spend M after the approval update. Check if the protocol uses `increaseAllowance`/`decreaseAllowance` or `permit` instead.
- **Stale approvals**: Tokens approved to a contract address that can be upgraded to a different implementation. The approval persists through the upgrade, giving the new implementation access to all previously approved funds.
- **Approval to self**: Functions that approve tokens to `address(this)` or create circular approval chains.

Cross-reference `systemMap.auth_surfaces` for functions that can change approved spender addresses.

### Pattern 2 — Transfer Hooks and Callbacks

Identify all token transfer operations and evaluate whether the protocol accounts for transfer hooks:

- **ERC-777 hooks**: Tokens implementing ERC-777 fire `tokensToSend` and `tokensReceived` hooks on every transfer. If the protocol calls `transfer` or `transferFrom` on a token address that could be ERC-777 compatible, the recipient gains execution control.
- **ERC-1363 `transferAndCall`**: Similar to ERC-777 but through an explicit callback interface. Check if the protocol uses `transferAndCall` or accepts tokens via `onTransferReceived`.
- **Callback ordering**: If a function performs multiple token transfers, the callback from the first transfer executes before the second transfer. This can create reentrancy windows or ordering dependencies.

Cross-reference with the `callback_liveness` lane — this pattern overlaps, but this lane focuses on the token-specific assumptions rather than the liveness implications.

### Pattern 3 — Fee-on-Transfer and Rebasing Token Assumptions

Scan for token interaction patterns that assume `transfer(to, amount)` delivers exactly `amount` to the recipient:

- **Fee-on-transfer tokens**: Tokens like USDT (in fee mode), PAXG, and others deduct a fee on every transfer. If the protocol records `amount` as the received quantity without checking the actual balance change, accounting diverges from reality.
  - Check: Does the protocol measure `balanceOf(this)` before and after receiving tokens?
  - Check: Does documentation/comments state which token types are supported?
- **Rebasing tokens**: Tokens like stETH and AMPL change balances automatically. If the protocol caches a balance and uses it later, the cached value may be stale.
  - Check: Does the protocol use wrapped versions (e.g., wstETH instead of stETH)?
  - Check: Are balance snapshots taken and used within the same transaction?
- **Tokens with blacklists**: USDC and USDT can blacklist addresses. If the protocol's contract address is blacklisted, all transfers fail permanently.
  - Check: Is there an emergency withdrawal path that does not depend on the primary token transfer?

For each token interaction, classify the assumption made and verify it holds for the documented token scope.

### Pattern 4 — Oracle Freshness and Manipulation

Scan for oracle reads in `systemMap.external_call_sites` and trace how oracle data is consumed:

- **Staleness checks**: For Chainlink feeds, verify that the `updatedAt` timestamp from `latestRoundData()` is checked against a maximum acceptable age (heartbeat). Missing staleness checks mean the protocol may use a price from hours or days ago.
  - Check: Is `updatedAt` compared to `block.timestamp - MAX_DELAY`?
  - Check: Is the round ID checked for completeness (`answeredInRound >= roundId`)?
- **Zero/negative price handling**: Chainlink can return 0 or negative prices during extreme market conditions. Verify that the protocol checks `price > 0` before using it.
- **TWAP manipulation**: Time-weighted average price oracles can be manipulated if the TWAP window is too short. A flash loan can significantly move the price within a single block, and a short TWAP window (e.g., 1-10 minutes) may not adequately smooth the manipulation.
  - Check: What is the TWAP window duration? Is it configurable?
- **Multi-oracle inconsistency**: If the protocol uses multiple oracle sources, check that fallback logic is implemented correctly and that there is no path where a stale primary oracle prevents fallback activation.
- **L2 sequencer uptime**: On L2s (Arbitrum, Optimism), Chainlink feeds can return stale data when the sequencer is down. Check for sequencer uptime feed integration.

### Pattern 5 — Multi-Transaction State Assumptions

Identify patterns where the protocol assumes state read in transaction N remains valid in transaction N+1:

- **Check-then-act across transactions**: A user calls `checkEligibility()` in tx1 (reads state) and `claim()` in tx2 (acts on assumed state). Between tx1 and tx2, another user's action may change the state, invalidating the eligibility.
- **Two-step operations**: Patterns like `approve` + `transferFrom`, or `requestWithdraw` + `executeWithdraw`, where the world can change between steps.
- **Permit + action**: `permit` signatures can be front-run. An attacker submits the user's `permit` signature before the user's bundle transaction, causing the user's transaction to revert (since the nonce is consumed).
- **Price-dependent operations**: Any function that uses a price read in a previous call or block. Flash loans can manipulate pool prices between the user's price check and their action.

Cross-reference `systemMap.external_surfaces` for functions that are typically called in sequence by users.

## Analysis Procedure

1. **Extract token interactions**: From `systemMap.external_call_sites`, filter for token-related calls (transfer, approve, balanceOf, mint, burn). For each, classify the token assumption made.

2. **Extract oracle reads**: From `systemMap.external_call_sites`, filter for oracle-related calls (latestRoundData, getPrice, consult, observe). For each, trace the consumption path and validation checks.

3. **Cross-reference static findings**: Match `staticFindings` for detectors: `unchecked-transfer`, `arbitrary-send-erc20`, `unused-return`, `erc20-interface`, `reentrancy-events`, and oracle-related detectors.

4. **Evaluate each candidate** against the five attack patterns above.

5. **Apply refutation checklist** (see below) to each candidate.

6. **Score priority**:
   - `critical`: Missing oracle validation or token assumption failure enables direct fund theft, protocol insolvency, or manipulation at any time.
   - `high`: Token/oracle issue causes material loss under specific but realistic conditions (e.g., fee-on-transfer token integrated without accounting, stale oracle used during high volatility).
   - `medium`: Issue requires specific token type or oracle condition that is possible but not guaranteed in normal operation.
   - `low`: Theoretical issue that is mitigated by protocol design choices or requires an unlikely token/oracle scenario.

7. **Emit hotspots**: For each candidate that survives refutation, construct a `Hotspot` object.

## Refutation Checklist

Before emitting ANY hotspot, answer every question below. If a "yes" answer fully mitigates the issue, do NOT emit the hotspot.

1. **Does the protocol explicitly support fee-on-transfer tokens?** Check documentation, comments, and code for explicit handling of fee-on-transfer tokens (before/after balance measurement). If the protocol explicitly states it does NOT support fee-on-transfer tokens and uses a token whitelist, this is a design choice, not a bug. Only flag if the protocol claims support but implements it incorrectly, or if it accepts arbitrary tokens without handling fees.

2. **Is oracle staleness checked with a maximum age threshold?** Verify that every `latestRoundData()` call is followed by a check: `require(block.timestamp - updatedAt <= MAX_STALENESS)` or equivalent. If the check exists and the threshold is reasonable (matching the feed's heartbeat), this is not a bug.

3. **Are approvals bounded or does the protocol use permit?** If the protocol approves only the exact amount needed for each operation (not `type(uint256).max`), or uses EIP-2612 `permit` for just-in-time approval, the unlimited approval attack vector is mitigated.

4. **Is there a heartbeat check for Chainlink feeds?** Verify that the protocol validates the oracle's heartbeat interval. Different feeds have different heartbeats (e.g., ETH/USD is 3600s on mainnet). If the MAX_STALENESS matches the feed's heartbeat, this is correctly implemented.

5. **Is the protocol designed for a specific token set?** If the protocol is designed to work with a specific, immutable set of tokens (e.g., WETH + USDC only), and those tokens do not have fee-on-transfer, rebasing, or blacklist behavior, then generic token assumption issues are not applicable. Only flag if the token set is user-configurable or if the specific tokens do exhibit the flagged behavior.

6. **Are multi-step operations protected by deadlines or slippage checks?** If two-step operations include a `deadline` parameter and a minimum output check, the multi-transaction state assumption is bounded by the deadline and slippage tolerance.

## Disallowed Behaviors

- **DO NOT** emit prose, markdown, or commentary. Output is a JSON array of `Hotspot` objects only.
- **DO NOT** generate findings or assign final severity ratings. Hotspots are hypotheses, not confirmed findings.
- **DO NOT** rely on live `mcp__sc-auditor__search_findings` results to create hotspots. Solodit is for evidence enrichment only.
- **DO NOT** emit hotspots with `lane` values other than `"token_oracle_statefulness"`.
- **DO NOT** skip the refutation checklist.
- **DO NOT** emit duplicate hotspots.
- **DO NOT** report privileged-role abuse. Privileged roles are assumed honest.
- **DO NOT** flag explicit design choices (e.g., "protocol does not support rebasing tokens") as vulnerabilities unless the protocol contradicts its own documentation.

## Output Example

```json
[
  {
    "id": "HS-030",
    "lane": "token_oracle_statefulness",
    "title": "Chainlink oracle staleness not validated in PriceOracle.getLatestPrice",
    "priority": "critical",
    "affected_files": ["src/PriceOracle.sol", "src/LendingPool.sol"],
    "affected_functions": ["PriceOracle.getLatestPrice(address)", "LendingPool.liquidate(address)"],
    "related_invariants": ["INV-007"],
    "evidence": [
      {
        "source": "code_analysis",
        "detail": "PriceOracle.getLatestPrice() calls latestRoundData() and returns answer without checking updatedAt timestamp or answeredInRound",
        "confidence": "high"
      },
      {
        "source": "static_analysis:aderyn:oracle-staleness",
        "detail": "Aderyn flagged unchecked oracle return values at PriceOracle.sol:45",
        "confidence": "high"
      }
    ],
    "candidate_attack_sequence": [
      "1. Chainlink feed experiences extended downtime or delayed update",
      "2. Oracle returns a price from hours ago (e.g., $2000 when current price is $1800)",
      "3. Attacker's undercollateralized position appears healthy due to stale high price",
      "4. Attacker borrows maximum amount against stale collateral valuation",
      "5. When oracle updates, position is deeply underwater; protocol absorbs the bad debt"
    ],
    "root_cause_hypothesis": "PriceOracle.getLatestPrice() does not validate the updatedAt timestamp from Chainlink latestRoundData(), allowing stale prices to be used for critical lending/liquidation decisions"
  },
  {
    "id": "HS-031",
    "lane": "token_oracle_statefulness",
    "title": "Fee-on-transfer tokens cause accounting discrepancy in Pool.deposit",
    "priority": "high",
    "affected_files": ["src/Pool.sol"],
    "affected_functions": ["Pool.deposit(address,uint256)"],
    "related_invariants": ["INV-002"],
    "evidence": [
      {
        "source": "code_analysis",
        "detail": "Pool.deposit() calls safeTransferFrom(msg.sender, address(this), amount) then credits msg.sender with exactly 'amount' in internal accounting. For fee-on-transfer tokens, actual received amount < amount",
        "confidence": "high"
      },
      {
        "source": "system_map:external_surfaces",
        "detail": "Pool.deposit accepts arbitrary ERC-20 token address as parameter; no token whitelist enforced",
        "confidence": "medium"
      }
    ],
    "candidate_attack_sequence": [
      "1. Pool accepts any ERC-20 token (no whitelist)",
      "2. User deposits 1000 PAXG (2% fee-on-transfer) via Pool.deposit(PAXG, 1000)",
      "3. Pool receives 980 PAXG but credits user with 1000 in internal accounting",
      "4. User withdraws 1000 PAXG, draining 20 PAXG from other depositors' balances",
      "5. Repeated deposits/withdrawals systematically drain the pool"
    ],
    "root_cause_hypothesis": "Pool.deposit records the input amount rather than the actual received amount, creating a 'phantom balance' for fee-on-transfer tokens that can be drained on withdrawal"
  }
]
```
