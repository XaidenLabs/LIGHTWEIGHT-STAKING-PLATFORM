// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockOldStaking {
    struct StakingDetail {
        uint planId;
        uint totalProfitEarnedFromArbitrage;
        uint totalWittyStaked;
        uint totalRewardClaimed;
        uint lastRewardClaimedDate;
        uint stakeStartDate;
        uint terminationCharge;
        uint terminationDate;
        uint method;
        bool isStakeTerminated;
    }

    mapping(address => uint256) public simpleMockBalances;

    function setStake(address user, uint256 amount) external {
        simpleMockBalances[user] = amount;
    }

    function getUserStakingDetail(
        address user
    ) external view returns (StakingDetail[] memory, StakingDetail[] memory) {
        uint256 amount = simpleMockBalances[user];

        // Mocking return: 1 Non-Arbitrage Stake
        StakingDetail[] memory arb = new StakingDetail[](0);
        StakingDetail[] memory nonArb = new StakingDetail[](1);

        if (amount > 0) {
            nonArb[0] = StakingDetail({
                planId: 1,
                totalProfitEarnedFromArbitrage: 0,
                totalWittyStaked: amount,
                totalRewardClaimed: 0,
                lastRewardClaimedDate: 0,
                stakeStartDate: 0,
                terminationCharge: 0,
                terminationDate: 0,
                method: 0,
                isStakeTerminated: false
            });
        }

        return (arb, nonArb);
    }

    function getUserRewards(address user) external view returns (uint) {
        // Mocking return: 10 WTY reward
        if (simpleMockBalances[user] > 0) {
            return 10 * 10 ** 18;
        }
        return 0;
    }
}

contract MockRouter {
    uint256 public price = 15; // 0.15 (scaled by 100)

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view returns (uint[] memory amounts) {
        amounts = new uint[](2);
        amounts[0] = amountIn;
        // Mock Price: Uses stored price
        amounts[1] = (amountIn * price) / 100;
        return amounts;
    }
}
