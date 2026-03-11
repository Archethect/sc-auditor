# HUNT — Callback Liveness Lane

## Purpose

Systematically identifies hotspots related to callback-induced liveness failures: reentrancy via hooks, griefing through forced reverts, honeypot traps, and withdrawal/sell path blockage. This lane focuses on any pattern where an external callback can disrupt protocol liveness or steal funds through control flow manipulation.

## Inputs

| Name | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `systemMap` | SystemMapArtifact | yes | Complete system map from the MAP phase |
| `staticFindings` | object[] | yes | Static analysis findings filtered to callback/reentrancy/external-call categories |

## Output Schema

```json
[
  {
    "id": "<string>",
    "lane": "callback_liveness",
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

### Pattern 1 — User-Controlled Callbacks

Scan `systemMap.external_call_sites` for calls where the target address is user-supplied or derived from user input. Key indicators:

- **ERC-777 token hooks**: Any `tokensReceived` or `tokensToSend` callback triggered by token transfers. Check if the protocol interacts with tokens that implement ERC-777 or if the token address is user-configurable.
- **ERC-721 safeTransfer**: The `onERC721Received` callback gives the recipient execution control. If the recipient is user-supplied, the callback is attacker-controlled.
- **Flash loan receivers**: Functions like `onFlashLoan`, `executeOperation`, or custom callback interfaces. The receiver contract is often attacker-deployed.
- **Arbitrary call targets**: Any pattern where `address(target).call(data)` uses a user-supplied `target`.

For each match, check `before_state_update` in the external call site. If `true`, this is a high-priority reentrancy vector.

### Pattern 2 — Zero-Value External Calls That Can Revert

Scan for external calls where no value is transferred but the call can revert, blocking the calling function. Examples:

- Token transfers to contracts without `receive()` or `fallback()` functions.
- Calls to external contracts that may have been self-destructed.
- Oracle calls that revert when the feed is deprecated or paused.
- Calls to whitelisted addresses that the admin can change to a reverting contract.

A single reverting call in a loop (e.g., iterating over recipients) can permanently block the entire function.

### Pattern 3 — Revert-Based Griefing (DoS via Callback Revert)

Identify functions that iterate over a list of addresses and make external calls to each:

- Reward distribution loops that call `transfer` to each recipient.
- Auction settlement that pays previous bidders.
- Batch operations that call external contracts in sequence.

If any single recipient can cause a revert (by deploying a contract that reverts in `receive()`), the entire batch fails. This is the classic pull-over-push anti-pattern.

### Pattern 4 — Honeypot Contracts

Look for patterns where a contract can trap funds:

- Withdraw functions that make external calls before releasing funds, where the external call target can be manipulated to always revert.
- Functions that require a callback to succeed but the callback can be blocked.
- Contracts that accept deposits but have conditional withdrawal paths dependent on external state.

### Pattern 5 — Sell/Withdraw Liveness

For every function that allows users to withdraw, redeem, sell, or exit:

- Trace the complete execution path and identify ALL external calls.
- For each external call, determine: can this call be blocked by an attacker?
- Check if there is a fallback withdrawal mechanism (emergency withdraw, time-locked release).
- Verify that no single external dependency can permanently lock user funds.

Cross-reference with `systemMap.value_flow_edges` to ensure every inbound value flow has a corresponding outbound flow that cannot be blocked.

## Analysis Procedure

1. **Extract candidates**: From `systemMap.external_call_sites`, filter for entries where the call target is user-supplied, the call occurs before state updates, or the function contains a loop with external calls.

2. **Cross-reference static findings**: Match `staticFindings` against the candidates. Static analysis detectors like `reentrancy-eth`, `reentrancy-no-eth`, `calls-loop`, `arbitrary-send-eth`, and `unchecked-lowlevel` are directly relevant.

3. **Evaluate each candidate** against the five attack patterns above.

4. **Apply false-positive refutation checklist** (see below) to each candidate before emitting it as a hotspot.

5. **Score priority**:
   - `critical`: Callback allows fund theft or permanent fund locking with no mitigation.
   - `high`: Callback allows temporary DoS of a core function (withdraw, claim) or griefing with economic impact.
   - `medium`: Callback allows griefing with no direct economic impact, or the attack requires significant capital/setup.
   - `low`: Theoretical callback issue mitigated by existing guards, but the guard has edge cases.

6. **Emit hotspots**: For each candidate that survives refutation, construct a `Hotspot` object with all required fields.

## False-Positive Refutation Checklist

Before emitting ANY hotspot, answer every question below. If a "yes" answer fully mitigates the issue, do NOT emit the hotspot. If partially mitigated, lower the priority and note the mitigation in `evidence`.

1. **Is the callback target trusted?** Check if the target is a known contract address (e.g., hardcoded, set by admin only, or a well-known protocol like Uniswap). If the target is not user-supplied, the callback is not attacker-controlled.

2. **Is there a reentrancy guard that covers this path?** Check for `nonReentrant` modifier from OpenZeppelin's `ReentrancyGuard`, or a custom mutex. Verify it covers the ENTIRE vulnerable path, including cross-contract calls. A guard on Contract A does not protect Contract B if the reentry occurs through B.

3. **Does the protocol use the pull-over-push pattern?** If recipients must explicitly claim their funds (pull) rather than having funds pushed to them in a loop, the griefing vector is eliminated. Check for `claim()` or `withdraw()` patterns instead of batch distribution.

4. **Is the call result checked and handled gracefully?** Check if the external call uses `try/catch`, checks the return value, or wraps the call in a low-level `call` with success handling. A handled failure prevents DoS from a reverting callback.

5. **Is the function non-critical?** If the function is a convenience function (e.g., batch claim) and there exists an alternative single-operation path, the DoS impact is reduced.

6. **Are there gas limits on the callback?** Check if the external call uses a limited gas stipend (e.g., `call{gas: 2300}`) that prevents complex callback logic.

## Reference

When the `attack-vectors/callback-grief.md` reference document is available, consult it for additional callback griefing patterns and known exploit templates. If unavailable, proceed with the patterns defined in this prompt.

## Disallowed Behaviors

- **DO NOT** emit prose, markdown, or commentary. Output is a JSON array of `Hotspot` objects only.
- **DO NOT** generate findings or assign final severity ratings. Hotspots are hypotheses, not confirmed findings.
- **DO NOT** rely on live `mcp__sc-auditor__search_findings` results to create hotspots. Solodit is for evidence enrichment only — the hotspot must be justified by code analysis and static findings alone.
- **DO NOT** emit hotspots with `lane` values other than `"callback_liveness"`.
- **DO NOT** skip the false-positive refutation checklist. Every candidate must pass through it.
- **DO NOT** emit duplicate hotspots. If the same root cause affects multiple functions, consolidate into a single hotspot with multiple `affected_functions`.
- **DO NOT** report privileged-role abuse (e.g., "admin could set callback to malicious contract"). Privileged roles are assumed honest.

## Output Example

```json
[
  {
    "id": "HS-001",
    "lane": "callback_liveness",
    "title": "ERC-777 tokensReceived callback enables cross-contract reentrancy in Vault.withdraw",
    "priority": "critical",
    "affected_files": ["src/Vault.sol", "src/AccountingModule.sol"],
    "affected_functions": ["Vault.withdraw(uint256,address,address)", "AccountingModule.sync()"],
    "related_invariants": ["INV-002"],
    "evidence": [
      {
        "source": "static_analysis:slither:reentrancy-eth",
        "detail": "Slither detected external call at Vault.sol:148 before state update at line 155",
        "confidence": "high"
      },
      {
        "source": "system_map:external_call_sites",
        "detail": "External call to user-supplied token address occurs before totalAssets_ update",
        "confidence": "high"
      }
    ],
    "candidate_attack_sequence": [
      "1. Attacker deposits ERC-777 token into Vault",
      "2. Attacker calls Vault.withdraw()",
      "3. During safeTransfer, ERC-777 tokensReceived hook fires on attacker contract",
      "4. Attacker re-enters AccountingModule.sync() which reads stale totalAssets_",
      "5. Sync computes incorrect share price, crediting attacker excess shares",
      "6. Attacker withdraws again with inflated share balance"
    ],
    "root_cause_hypothesis": "Vault.withdraw performs safeTransfer to user-supplied address before updating totalAssets_, allowing ERC-777 callback to re-enter while accounting state is inconsistent"
  },
  {
    "id": "HS-002",
    "lane": "callback_liveness",
    "title": "Reward distribution loop vulnerable to griefing via reverting recipient",
    "priority": "high",
    "affected_files": ["src/RewardDistributor.sol"],
    "affected_functions": ["RewardDistributor.distributeRewards()"],
    "related_invariants": ["INV-005"],
    "evidence": [
      {
        "source": "static_analysis:slither:calls-loop",
        "detail": "Slither detected external calls inside a loop at RewardDistributor.sol:89",
        "confidence": "medium"
      },
      {
        "source": "code_analysis",
        "detail": "distributeRewards() iterates over all stakers and calls transfer() to each; a single reverting recipient blocks all distributions",
        "confidence": "high"
      }
    ],
    "candidate_attack_sequence": [
      "1. Attacker deploys contract that reverts on receive()",
      "2. Attacker stakes via the malicious contract address",
      "3. When distributeRewards() is called, the loop reaches the attacker's address",
      "4. Transfer to attacker's contract reverts, reverting the entire transaction",
      "5. No staker can receive rewards until the attacker unstakes"
    ],
    "root_cause_hypothesis": "Push-based reward distribution in a loop allows any single malicious recipient to block all reward claims by deploying a contract that reverts on ETH receipt"
  }
]
```
