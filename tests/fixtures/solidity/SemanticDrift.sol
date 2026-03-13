// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TokenManager {
    uint256 public taxCut = 10; // Used as percent: amount * taxCut / 100

    function applyTax(uint256 amount) external view returns (uint256) {
        return amount * taxCut / 100;
    }
}

contract FeeDistributor {
    uint256 public taxCut = 10; // Used as divisor: amount / taxCut (BUG: semantic drift!)

    function distributeFee(uint256 amount) external view returns (uint256) {
        return amount / taxCut;
    }
}
