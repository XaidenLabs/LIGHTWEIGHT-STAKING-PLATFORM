// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

interface IWityStaking {
    function depositToStakingWallet(address user, uint256 amount) external;
}

// Interface based on the Legacy WittyStake contract
interface IOldStaking {
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

    function getUserStakingDetail(
        address user
    ) external view returns (StakingDetail[] memory, StakingDetail[] memory);

    function getUserRewards(address user) external view returns (uint);
}

contract WityMigration is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    IWityStaking public newStaking;
    IOldStaking public oldStaking;

    mapping(address => bool) public hasMigrated;

    event Migrated(address indexed user, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _newStaking,
        address _oldStaking
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();

        newStaking = IWityStaking(_newStaking);
        oldStaking = IOldStaking(_oldStaking);
    }

    function migrateStaked() external nonReentrant {
        require(!hasMigrated[msg.sender], "Already migrated");

        // Fetch raw data from Old Contract
        // Returns two arrays: Arbitrage Staking and Non-Arbitrage Staking
        (
            IOldStaking.StakingDetail[] memory arbStakes,
            IOldStaking.StakingDetail[] memory nonArbStakes
        ) = oldStaking.getUserStakingDetail(msg.sender);

        uint256 totalMigratableAmount = 0;

        // 1. Calculate from Arbitrage Stakes
        for (uint i = 0; i < arbStakes.length; i++) {
            if (!arbStakes[i].isStakeTerminated) {
                totalMigratableAmount += arbStakes[i].totalWittyStaked;
            }
        }

        // 2. Calculate from Non-Arbitrage Stakes
        for (uint i = 0; i < nonArbStakes.length; i++) {
            if (!nonArbStakes[i].isStakeTerminated) {
                totalMigratableAmount += nonArbStakes[i].totalWittyStaked;
            }
        }

        // 3. Add Unclaimed Rewards
        // Logic: Users migrate their Principal + Pending Rewards together into the new system.
        try oldStaking.getUserRewards(msg.sender) returns (
            uint256 pendingRewards
        ) {
            totalMigratableAmount += pendingRewards;
        } catch {
            // Ignore if function doesn't exist or fails (fallback for safety)
        }
        require(totalMigratableAmount > 0, "No active stake or rewards found");

        hasMigrated[msg.sender] = true;

        // Credit the new Staking Wallet
        newStaking.depositToStakingWallet(msg.sender, totalMigratableAmount);

        emit Migrated(msg.sender, totalMigratableAmount);
    }
}
