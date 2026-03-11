# HUNT — Accounting Entitlement Lane

## Purpose

Systematically identifies hotspots where accounting logic drifts from actual entitlements: stale balance reads, incorrect reward attribution, share/token mismatch, fee capture on outdated state, and transfer/burn operations that take more or less than intended. This lane focuses on any pattern where the protocol's internal bookkeeping diverges from the economic reality of what users own or are owed.

## Inputs

| Name | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `systemMap` | SystemMapArtifact | yes | Complete system map from the MAP phase |
| `staticFindings` | object[] | yes | Static analysis findings filtered to accounting/arithmetic/balance categories |

## Output Schema

```json
[
  {
    "id": "<string>",
    "lane": "accounting_entitlement",
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

### Pattern 1 — Stale Balance Reads

Scan for functions that read a balance or total supply at one point in execution and use the value later, after a state-changing operation has occurred in between. Key indicators:

- A `balanceOf()` or `totalSupply()` call followed by a `transfer`, `mint`, or `burn` in the same function, where the earlier read value is used for computation after the transfer.
- Functions that cache `address(this).balance` or `token.balanceOf(address(this))` before receiving tokens via callback, then use the cached value for share calculation.
- Multi-step operations where Step 1 reads state and Step 3 uses that state, but Step 2 changes it (especially across function boundaries).

For each match, trace the data flow from the read to the usage. If ANY state-changing operation intervenes, this is a candidate hotspot.

### Pattern 2 — Transfer/Burn Entitlement Drift

Identify functions where a user is charged (transferred from, burned from) more or fewer tokens than they are entitled to lose. Key indicators:

- Withdrawal functions that burn shares based on a formula, then transfer underlying. If the formula uses stale or incorrect exchange rate, the user loses more than they should.
- Fee deduction applied before and after a transfer (double fee).
- Functions that compute "amount to transfer" and "amount to burn" independently, where the two calculations can drift.
- Token approval + transferFrom patterns where the approved amount does not match the actual deducted amount.

Cross-reference `systemMap.value_flow_edges` to verify that every debit has a matching credit of equivalent value.

### Pattern 3 — Reward Attribution Bugs

Scan reward distribution logic for patterns where rewards are credited to the wrong address or in the wrong amount:

- Reward accrual that uses `msg.sender` when it should use a stored beneficiary address (or vice versa).
- Delegation systems where rewards accumulate to the delegator but should go to the delegate (or vice versa).
- Staking rewards computed using total staked amount but distributed based on individual balances that have changed since the snapshot.
- Reward calculation that uses current shares rather than time-weighted shares, allowing "just-in-time" deposits before distribution.

Cross-reference `systemMap.state_write_sites` for reward-related variables and trace all write paths.

### Pattern 4 — Historical Fee Capture

Identify fee calculations that operate on stale state:

- Management fees computed at harvest/compound time but using total assets that have not been updated since the last deposit/withdrawal.
- Performance fees that compare current share price to a high-water mark that was not updated after a redemption changed the total supply.
- Entry/exit fees computed on a share price that does not reflect pending rewards.
- Protocol fees that accumulate in a variable that is read after the fee is already deducted, causing compounding errors.

Scan `systemMap.config_semantics` for fee-related configuration variables and trace every code path that reads them.

### Pattern 5 — Share/Reward State Mismatch

Detect situations where shares no longer reflect the actual backing or where reward state diverges from reality:

- ERC-4626 vaults where `totalAssets()` can be manipulated via direct token donation, inflating or deflating the share price.
- Staking pools where `rewardPerShare` is updated in one function but the user's `rewardDebt` is updated in a different function, creating a window where the two are inconsistent.
- Rebasing tokens where the contract holds a balance that changes automatically but the internal accounting does not track rebases.
- Share-based systems that do not update total supply atomically with underlying asset changes.

Cross-reference `systemMap.protocol_invariants` — any invariant relating shares to underlying assets is relevant here.

## Analysis Procedure

1. **Extract candidates**: From `systemMap.state_write_sites`, identify all writes to balance, supply, shares, rewards, and fee-related variables. For each write site, trace upstream reads to see if any stale data path exists.

2. **Cross-reference static findings**: Match `staticFindings` for relevant detectors: `incorrect-equality`, `divide-before-multiply`, `reentrancy-no-eth`, `unused-return`, `unchecked-transfer`, and arithmetic-related detectors.

3. **Trace value flows**: Using `systemMap.value_flow_edges`, verify that every inbound edge has a corresponding internal accounting update and every outbound edge has a corresponding deduction. Flag any asymmetry.

4. **Evaluate each candidate** against the five attack patterns above.

5. **Apply hard-negative filtering** (see below) to avoid false positives on known-safe patterns.

6. **Score priority**:
   - `critical`: Accounting mismatch enables direct fund theft or unbounded value extraction.
   - `high`: Accounting mismatch causes material loss to users or protocol under normal operation.
   - `medium`: Accounting mismatch causes rounding-level losses that accumulate over many transactions or require specific timing.
   - `low`: Theoretical accounting issue that requires extreme edge conditions or yields negligible economic impact.

7. **Emit hotspots**: For each candidate that survives hard-negative filtering, construct a `Hotspot` object with all required fields.

## Hard Negatives — Known False-Positive Patterns

Before emitting ANY hotspot, check these common false positives. If a pattern matches, do NOT emit the hotspot unless you can demonstrate that the standard explanation does not apply.

1. **Fee-on-transfer tokens may look like entitlement drift but are by design.** When a protocol explicitly supports fee-on-transfer tokens (checks `balanceOf` before and after transfer to compute actual received amount), the discrepancy between `amount` parameter and actual received tokens is intentional. Only flag this if the protocol does NOT perform the before/after balance check but claims to support fee-on-transfer tokens.

2. **Rounding in favor of the protocol is intentional, not a bug.** ERC-4626 vaults and similar systems deliberately round DOWN shares on deposit and round UP assets on withdrawal to protect the vault from rounding exploits. Only flag rounding if it favors the USER (minting extra shares, requiring fewer assets for redemption) or if the rounding direction is inconsistent across related functions.

3. **Pending reward calculations that update on next interaction are a known pattern.** Many staking protocols defer reward distribution until the user's next interaction (deposit, withdraw, claim). The "stale" reward per share is updated lazily. This is the standard Synthetix `StakingRewards` pattern and is NOT a bug. Only flag if the lazy update is missing (user never receives accrued rewards) or is applied to the wrong checkpoint.

4. **Virtual share offsets in ERC-4626 vaults are a mitigation, not a bug.** OpenZeppelin's `_decimalsOffset()` intentionally inflates the initial share-to-asset ratio to prevent share inflation attacks. Do not flag the offset as an accounting discrepancy.

5. **Internal balance tracking that ignores direct transfers is by design.** Protocols that use internal balance variables (rather than `balanceOf`) deliberately ignore tokens sent directly to the contract. Only flag this if the protocol DOES use `balanceOf` for some critical logic but internal tracking for other logic, creating an inconsistency.

## Disallowed Behaviors

- **DO NOT** emit prose, markdown, or commentary. Output is a JSON array of `Hotspot` objects only.
- **DO NOT** generate findings or assign final severity ratings. Hotspots are hypotheses, not confirmed findings.
- **DO NOT** rely on live `mcp__sc-auditor__search_findings` results to create hotspots. Solodit is for evidence enrichment only — the hotspot must be justified by code analysis and static findings alone.
- **DO NOT** emit hotspots with `lane` values other than `"accounting_entitlement"`.
- **DO NOT** skip the hard-negative filtering. Every candidate must be checked against the five hard-negative patterns.
- **DO NOT** emit duplicate hotspots. Consolidate hotspots with the same root cause.
- **DO NOT** report privileged-role abuse. Privileged roles are assumed honest.
- **DO NOT** flag intentional rounding in the protocol's favor as a vulnerability.

## Output Example

```json
[
  {
    "id": "HS-010",
    "lane": "accounting_entitlement",
    "title": "Stale totalAssets read in Vault.deposit allows share price manipulation via donation",
    "priority": "critical",
    "affected_files": ["src/Vault.sol"],
    "affected_functions": ["Vault.deposit(uint256,address)", "Vault.totalAssets()"],
    "related_invariants": ["INV-002"],
    "evidence": [
      {
        "source": "system_map:value_flow_edges",
        "detail": "Direct token transfer to vault address bypasses deposit accounting, inflating totalAssets() return value without updating internal tracking",
        "confidence": "high"
      },
      {
        "source": "code_analysis",
        "detail": "totalAssets() returns token.balanceOf(address(this)) rather than an internal counter; deposit uses totalAssets() for share calculation",
        "confidence": "high"
      }
    ],
    "candidate_attack_sequence": [
      "1. Attacker deposits minimal amount to mint 1 share",
      "2. Attacker donates large amount of tokens directly to vault contract",
      "3. totalAssets() now returns inflated value",
      "4. Victim deposits; shares minted = deposit * totalSupply / totalAssets rounds to 0",
      "5. Victim's entire deposit is captured by attacker's single share"
    ],
    "root_cause_hypothesis": "Vault.totalAssets() reads raw balanceOf instead of internal accounting, allowing donation-based share price manipulation"
  },
  {
    "id": "HS-011",
    "lane": "accounting_entitlement",
    "title": "Reward distribution uses current stake instead of time-weighted average",
    "priority": "high",
    "affected_files": ["src/StakingPool.sol"],
    "affected_functions": ["StakingPool.distributeRewards()", "StakingPool.stake(uint256)"],
    "related_invariants": ["INV-004"],
    "evidence": [
      {
        "source": "code_analysis",
        "detail": "distributeRewards() divides reward pool by current totalStaked and credits each staker proportionally to their current balance, not their time-weighted balance",
        "confidence": "high"
      },
      {
        "source": "static_analysis:slither:divide-before-multiply",
        "detail": "Potential precision loss in reward calculation at StakingPool.sol:156",
        "confidence": "medium"
      }
    ],
    "candidate_attack_sequence": [
      "1. Attacker monitors mempool for distributeRewards() call",
      "2. Attacker front-runs with a large stake() call",
      "3. distributeRewards() executes, attributing a proportional share to attacker's just-deposited stake",
      "4. Attacker back-runs with unstake(), extracting rewards for staking duration of one block",
      "5. Long-term stakers receive diluted rewards"
    ],
    "root_cause_hypothesis": "Reward distribution does not use time-weighted staking amounts, allowing just-in-time staking to capture disproportionate rewards"
  }
]
```
