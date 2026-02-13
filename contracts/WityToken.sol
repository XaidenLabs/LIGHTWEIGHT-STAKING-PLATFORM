// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract WityToken is Initializable, ERC20Upgradeable, OwnableUpgradeable {
    // Tax Rates
    uint256 public constant BUY_TAX = 100; // 1%
    uint256 public constant SELL_TAX = 200; // 2%
    uint256 public constant DENOMINATOR = 10000;

    // Cooldown
    uint256 public constant COOLDOWN_TIME = 60 minutes;
    mapping(address => uint256) public lastSellTime;

    // Automations & Exclusions
    mapping(address => bool) public isExcludedFromFee;
    mapping(address => bool) public isExcludedFromCooldown;
    mapping(address => bool) public automatedMarketMakerPairs;

    address public rewardPool;

    event ExcludeFromFee(address indexed account, bool isExcluded);
    event ExcludeFromCooldown(address indexed account, bool isExcluded);
    event SetAutomatedMarketMakerPair(address indexed pair, bool indexed value);
    event RewardPoolUpdated(address indexed newRewardPool);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address _rewardPool) public initializer {
        __ERC20_init("WITY Token", "WTY");
        __Ownable_init(initialOwner);

        rewardPool = _rewardPool;

        // Default exclusions
        excludeFromFee(initialOwner, true);
        excludeFromFee(address(this), true);
        excludeFromFee(_rewardPool, true);
        
        excludeFromCooldown(initialOwner, true);
        excludeFromCooldown(address(this), true);
        excludeFromCooldown(_rewardPool, true);

        // Mint Initial Supply (20 Million)
        _mint(initialOwner, 20_000_000 * 10 ** decimals());
    }

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Allow Minting and Burning to proceed without tax/cooldown checks
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }

        // If amount is 0, just transfer
        if (amount == 0) {
            super._update(from, to, 0);
            return;
        }

        bool takeFee = true;

        // If any account belongs to _isExcludedFromFee account then remove the fee
        if (isExcludedFromFee[from] || isExcludedFromFee[to]) {
            takeFee = false;
        }

        uint256 fees = 0;

        if (takeFee) {
            // BUY Logic (Transfer from AMM to User)
            if (automatedMarketMakerPairs[from] && !isExcludedFromFee[to]) {
                fees = (amount * BUY_TAX) / DENOMINATOR;
            }
            // SELL Logic (Transfer from User to AMM)
            else if (automatedMarketMakerPairs[to] && !isExcludedFromFee[from]) {
                // Cooldown Check
                if (!isExcludedFromCooldown[from]) {
                    require(
                        block.timestamp >= lastSellTime[from] + COOLDOWN_TIME,
                        "Cooldown: You must wait 60 minutes between sells"
                    );
                    lastSellTime[from] = block.timestamp;
                }
                
                fees = (amount * SELL_TAX) / DENOMINATOR;
            }
        }

        if (fees > 0) {
            super._update(from, rewardPool, fees);
            amount -= fees;
        }

        super._update(from, to, amount);
    }

    // --- Admin Functions ---

    function setRewardPool(address _rewardPool) external onlyOwner {
        rewardPool = _rewardPool;
        emit RewardPoolUpdated(_rewardPool);
    }

    function excludeFromFee(address account, bool excluded) public onlyOwner {
        isExcludedFromFee[account] = excluded;
        emit ExcludeFromFee(account, excluded);
    }

    function excludeFromCooldown(address account, bool excluded) public onlyOwner {
        isExcludedFromCooldown[account] = excluded;
        emit ExcludeFromCooldown(account, excluded);
    }

    function setAutomatedMarketMakerPair(address pair, bool value) external onlyOwner {
        require(pair != rewardPool, "The reward pool cannot be an AMM pair");
        automatedMarketMakerPairs[pair] = value;
        emit SetAutomatedMarketMakerPair(pair, value);
    }
}
