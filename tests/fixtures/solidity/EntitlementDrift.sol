// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EntitlementDrift {
    mapping(address => uint256) public shares;
    mapping(address => uint256) public lastClaimedReward;
    uint256 public rewardPerShare;
    uint256 public totalShares;

    function deposit(uint256 amount) external {
        // Bug: doesn't update lastClaimedReward before changing shares
        shares[msg.sender] += amount;
        totalShares += amount;
    }

    function claimReward() external {
        uint256 pending = shares[msg.sender] * (rewardPerShare - lastClaimedReward[msg.sender]);
        lastClaimedReward[msg.sender] = rewardPerShare;
        // transfer pending...
    }
}
