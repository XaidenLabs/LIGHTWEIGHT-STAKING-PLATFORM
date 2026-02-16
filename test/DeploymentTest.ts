import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
// import { Contract } from "ethers";

describe("WTY Staking System", function () {
    let wtyToken: any;
    let wtyStaking: any;
    let wtyMigration: any;
    let wtyVault: any;
    let mockUsdt: any;
    let mockOldStaking: any;
    let mockRouter: any;

    let owner: any;
    let user1: any;
    let user2: any;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy Mocks
        const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
        mockUsdt = await MockUSDTFactory.deploy();

        const MockOldStakingFactory = await ethers.getContractFactory("MockOldStaking");
        mockOldStaking = await MockOldStakingFactory.deploy();

        const MockRouterFactory = await ethers.getContractFactory("MockRouter");
        mockRouter = await MockRouterFactory.deploy();

        // Deploy WTY Token (Upgradeable)
        const WityTokenFactory = await ethers.getContractFactory("WityToken");
        wtyToken = await upgrades.deployProxy(WityTokenFactory, [owner.address, owner.address], { initializer: "initialize" });
        await wtyToken.waitForDeployment();

        // Deploy Staking (Upgradeable)
        const WityStakingFactory = await ethers.getContractFactory("WityStaking");
        wtyStaking = await upgrades.deployProxy(WityStakingFactory, [await wtyToken.getAddress(), await mockUsdt.getAddress(), await mockRouter.getAddress()], { initializer: "initialize" });
        await wtyStaking.waitForDeployment();

        // Deploy Migration (Upgradeable)
        const WityMigrationFactory = await ethers.getContractFactory("WityMigration");
        wtyMigration = await upgrades.deployProxy(WityMigrationFactory, [await wtyStaking.getAddress(), await mockOldStaking.getAddress()], { initializer: "initialize" });
        await wtyMigration.waitForDeployment();

        // Deploy Vault (Upgradeable)
        const WityVaultFactory = await ethers.getContractFactory("WityVault");
        wtyVault = await upgrades.deployProxy(WityVaultFactory, [await mockUsdt.getAddress(), await wtyStaking.getAddress(), owner.address], { initializer: "initialize" });
        await wtyVault.waitForDeployment();

        // --- Configurations ---

        // Whitelist Contracts in Token
        await wtyToken.excludeFromFee(await wtyStaking.getAddress(), true);
        await wtyToken.excludeFromFee(await wtyMigration.getAddress(), true);
        await wtyToken.excludeFromFee(await wtyVault.getAddress(), true);

        // Auth Callers in Staking
        await wtyStaking.setAuthCaller(await wtyMigration.getAddress(), true);
        await wtyStaking.setAuthCaller(await wtyVault.getAddress(), true);
    });

    it("Should allow Migration from Old Staking", async function () {
        const oldAmount = ethers.parseEther("500");
        await mockOldStaking.setStake(user1.address, oldAmount);

        await wtyMigration.connect(user1).migrateStaked();

        const balance = await wtyStaking.getStakingWalletBalance(user1.address);
        // 500 (Principal) + 10 (Rewards from Mock) = 510
        const expected = oldAmount + ethers.parseEther("10");
        expect(balance).to.equal(expected);

        await expect(wtyMigration.connect(user1).migrateStaked()).to.be.revertedWith("Already migrated");
    });

    it("Should allow Vault Purchase with USDT", async function () {
        const usdtAmount = ethers.parseEther("100");
        await mockUsdt.mint(user1.address, usdtAmount); // Mint to user
        await mockUsdt.connect(user1).approve(await wtyVault.getAddress(), usdtAmount);

        // 100 USDT = 2000 WTY
        await wtyVault.connect(user1).buyWty(usdtAmount);

        const expectedWty = ethers.parseEther("2000");
        const balance = await wtyStaking.getStakingWalletBalance(user1.address);
        expect(balance).to.equal(expectedWty);

        const treasuryBal = await mockUsdt.balanceOf(owner.address);
        // Owner started with 1M. Adds 100.
        expect(treasuryBal).to.equal(ethers.parseEther("1000100"));
    });

    it("Should allow Staking from Wallet Balance", async function () {
        // Fund user via Vault
        const usdtAmount = ethers.parseEther("100"); // 2000 WTY
        await mockUsdt.mint(user1.address, usdtAmount);
        await mockUsdt.connect(user1).approve(await wtyVault.getAddress(), usdtAmount);
        await wtyVault.connect(user1).buyWty(usdtAmount);

        // Staking Requirements
        // Plan 0 (Starter): $20 Min USD. 
        // WTY Price FIXED: $0.05
        // Required WTY = ($20 * 1e18) / 0.05 = 400 WTY.

        await wtyStaking.connect(user1).stake(0);

        const balance = await wtyStaking.getStakingWalletBalance(user1.address);
        // 2000 - 400 = 1600
        expect(balance).to.equal(ethers.parseEther("1600"));

        // Check User Stakes
        const userStake = await wtyStaking.userStakes(user1.address, 0);
        // Tuple access in ethers v6 might be array based or object based depending on ABI.
        // userStake.planId -> 0
        expect(userStake[0]).to.equal(0n); // planId
        expect(userStake[5]).to.be.true; // active
    });

    it("Should enforce WTY Token Tax on standard transfers", async function () {
        const amount = ethers.parseEther("100");
        await wtyToken.transfer(user1.address, amount);

        // Setup AMM Pair (Mocking address)
        const mockPair = user2.address; // Treat user2 as Pair
        await wtyToken.setAutomatedMarketMakerPair(mockPair, true);

        // Calculate Tax: Sell Tax 2%
        // User1 transfers 10 WTY to Pair (Sell)
        // 2% of 10 = 0.2 WTY. Pair gets 9.8.

        const sellAmount = ethers.parseEther("10");
        const initialPairBal = await wtyToken.balanceOf(mockPair);

        await wtyToken.connect(user1).transfer(mockPair, sellAmount);

        const finalPairBal = await wtyToken.balanceOf(mockPair);
        // Diff = 9.8
        expect(finalPairBal - initialPairBal).to.equal(ethers.parseEther("9.8"));
    });
});
