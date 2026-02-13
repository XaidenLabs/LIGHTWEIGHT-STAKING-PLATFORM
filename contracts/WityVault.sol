// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWityStaking {
    function depositToStakingWallet(address user, uint256 amount) external;
}

contract WityVault is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    IERC20 public usdtToken;
    IWityStaking public stakingContract;

    uint256 public constant WTY_PRICE_USD = 5; // $0.05

    address public treasuryWallet;

    event TokensPurchased(
        address indexed buyer,
        uint256 usdtAmount,
        uint256 wtyAmount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdtToken,
        address _stakingContract,
        address _treasuryWallet
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();

        usdtToken = IERC20(_usdtToken);
        stakingContract = IWityStaking(_stakingContract);
        treasuryWallet = _treasuryWallet;
    }

    function buyWty(uint256 usdtAmount) external nonReentrant {
        require(usdtAmount > 0, "Amount must be > 0");

        // Receive USDT
        usdtToken.safeTransferFrom(msg.sender, treasuryWallet, usdtAmount);

        // Calculate WTY
        // 1 USDT = 20 WTY
        uint256 wtyAmount = usdtAmount * 20;

        // Credit Staking Wallet
        stakingContract.depositToStakingWallet(msg.sender, wtyAmount);

        // Emit event
        emit TokensPurchased(msg.sender, usdtAmount, wtyAmount);
    }
}
