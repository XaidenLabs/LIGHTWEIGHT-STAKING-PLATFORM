// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV2Router02 {
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

contract WityStaking is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    struct Plan {
        uint256 id;
        string name;
        uint256 minStakeUSD;      // e.g. 20
        uint256 rewardShare;      // e.g. 1
        uint256 activityMultiplier; // e.g. 80 (0.8x * 100), 100 (1.0x), 120 (1.2x)
        uint256 lockDuration;     // 365 days
    }

    struct StakeInfo {
        uint256 planId;
        uint256 amount;
        uint256 startTime;
        uint256 lastClaimTime;
        uint256 endTime;
        bool active;
    }

    IERC20 public stakingToken; // WTY
    address public usdtToken;
    address public uniswapRouter;
    
    // Core Mappings
    mapping(address => uint256) private _stakingWalletBalances; // Restricted "Staking Wallet"
    mapping(address => StakeInfo[]) public userStakes;
    mapping(address => bool) public isAuthCaller; // Migration/Vault contracts

    Plan[] public plans;
    
    uint256 public totalShares;

    event DepositToWallet(address indexed user, uint256 amount, address indexed caller);
    event Staked(address indexed user, uint256 planId, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 stakeIndex);
    event RewardPaid(address indexed user, uint256 reward);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _stakingToken, 
        address _usdtToken,
        address _router
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        
        stakingToken = IERC20(_stakingToken);
        usdtToken = _usdtToken;
        uniswapRouter = _router;
        
        // Initialize 7 Plans
        uint256 YEAR = 365 days;
        
        plans.push(Plan(0, "Starter", 20, 1, 80, YEAR));
        plans.push(Plan(1, "Basic", 50, 3, 100, YEAR));
        plans.push(Plan(2, "Growth", 100, 7, 120, YEAR));
        plans.push(Plan(3, "Pro", 500, 40, 150, YEAR));
        plans.push(Plan(4, "Elite", 2000, 200, 200, YEAR));
        plans.push(Plan(5, "Power", 5000, 600, 250, YEAR));
        plans.push(Plan(6, "Whale", 10000, 1400, 300, YEAR));
    }

    function setAuthCaller(address caller, bool isAuth) external onlyOwner {
        isAuthCaller[caller] = isAuth;
    }

    function getStakingWalletBalance(address user) external view returns (uint256) {
        return _stakingWalletBalances[user];
    }

    function depositToStakingWallet(address user, uint256 amount) external {
        require(isAuthCaller[msg.sender], "Caller not authorized");
        _stakingWalletBalances[user] += amount;
        emit DepositToWallet(user, amount, msg.sender);
    }
    
    // --- Staking Logic ---

    // Price Oracle: WTY / USDT
    function getWtyPriceInUsd() public view returns (uint256) {
        if (uniswapRouter == address(0)) {
            return 150000000000000000;
        }
        
        address[] memory path = new address[](2);
        path[0] = address(stakingToken);
        path[1] = usdtToken;
        
        try IUniswapV2Router02(uniswapRouter).getAmountsOut(1e18, path) returns (uint[] memory amounts) {
            return amounts[1];
        } catch {
             return 150000000000000000;
        }
    }

    function getRequiredWtyForPlan(uint256 planId) public view returns (uint256) {
        Plan memory plan = plans[planId];
        uint256 price = getWtyPriceInUsd();
        // Adjust for USDT decimals if usually 18 on BSC.
        // reqTokens = (USD_Cost * 1e18) / Price_Per_Token
        return (plan.minStakeUSD * 1e18 * 1e18) / price;
    }

    function stake(uint256 planId) external nonReentrant {
        require(planId < plans.length, "Invalid Plan");
        Plan memory plan = plans[planId];
        
        uint256 requiredAmount = getRequiredWtyForPlan(planId);
        
        require(_stakingWalletBalances[msg.sender] >= requiredAmount, "Insufficient Staking Wallet Balance");
        
        _stakingWalletBalances[msg.sender] -= requiredAmount;
        
        userStakes[msg.sender].push(StakeInfo({
            planId: planId,
            amount: requiredAmount,
            startTime: block.timestamp,
            lastClaimTime: block.timestamp,
            endTime: block.timestamp + plan.lockDuration,
            active: true
        }));
        
        uint256 shares = plan.rewardShare; 
        totalShares += shares;
        
        emit Staked(msg.sender, planId, requiredAmount, shares);
    }

    function claimRewards() external nonReentrant {
        // Implementation dependent
    }
}
