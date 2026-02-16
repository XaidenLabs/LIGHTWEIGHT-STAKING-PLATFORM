import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
// import { Contract } from "ethers";

describe("WTY Security & Vulnerability Tests", function () {
    let wtyToken: any;
    let wtyStaking: any;
    let wtyMigration: any;
    let wtyVault: any;
    let mockUsdt: any;
    let mockOldStaking: any;
    let mockRouter: any;

    let owner: any;
    let attacker: any;
    let victim: any;

    beforeEach(async function () {
        [owner, attacker, victim] = await ethers.getSigners();

        // 1. Deploy Mocks
        const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
        mockUsdt = await MockUSDTFactory.deploy();

        const MockOldStakingFactory = await ethers.getContractFactory("MockOldStaking");
        mockOldStaking = await MockOldStakingFactory.deploy();

        const MockRouterFactory = await ethers.getContractFactory("MockRouter");
        mockRouter = await MockRouterFactory.deploy();

        // 2. Deploy Contracts
        const WityTokenFactory = await ethers.getContractFactory("WityToken");
        wtyToken = await upgrades.deployProxy(WityTokenFactory, [owner.address, owner.address], { initializer: "initialize" });
        await wtyToken.waitForDeployment();

        const WityStakingFactory = await ethers.getContractFactory("WityStaking");
        wtyStaking = await upgrades.deployProxy(WityStakingFactory, [await wtyToken.getAddress(), await mockUsdt.getAddress(), await mockRouter.getAddress()], { initializer: "initialize" });
        await wtyStaking.waitForDeployment();

        const WityMigrationFactory = await ethers.getContractFactory("WityMigration");
        wtyMigration = await upgrades.deployProxy(WityMigrationFactory, [await wtyStaking.getAddress(), await mockOldStaking.getAddress()], { initializer: "initialize" });
        await wtyMigration.waitForDeployment();

        const WityVaultFactory = await ethers.getContractFactory("WityVault");
        wtyVault = await upgrades.deployProxy(WityVaultFactory, [await mockUsdt.getAddress(), await wtyStaking.getAddress(), owner.address], { initializer: "initialize" });
        await wtyVault.waitForDeployment();

        // 3. Setup Permissions
        await wtyStaking.setAuthCaller(await wtyMigration.getAddress(), true);
        await wtyStaking.setAuthCaller(await wtyVault.getAddress(), true);
    });

    describe("🛡️ Access Control & Authorization", function () {
        it("Attacker cannot deposit to Staking Wallet directly", async function () {
            await expect(
                wtyStaking.connect(attacker).depositToStakingWallet(attacker.address, ethers.parseEther("1000"))
            ).to.be.revertedWith("Caller not authorized");
        });

        it("Attacker cannot set Auth Caller", async function () {
            await expect(
                wtyStaking.connect(attacker).setAuthCaller(attacker.address, true)
            ).to.be.revertedWithCustomError(wtyStaking, "OwnableUnauthorizedAccount");
        });
    });

    describe("🔄 Migration Logic", function () {
        it("Double Migration should fail", async function () {
            // Setup Victim Old Balance
            await mockOldStaking.setStake(victim.address, ethers.parseEther("100"));

            // First Migration
            await wtyMigration.connect(victim).migrateStaked();
            expect(await wtyStaking.getStakingWalletBalance(victim.address)).to.equal(ethers.parseEther("110")); // 100 + 10 reward

            // Second Migration
            await expect(
                wtyMigration.connect(victim).migrateStaked()
            ).to.be.revertedWith("Already migrated");
        });

        it("Zero Balance Migration should revert", async function () {
            await expect(
                wtyMigration.connect(attacker).migrateStaked()
            ).to.be.revertedWith("No active stake or rewards found");
        });
    });

    describe("🔒 Vault & Staking Logic", function () {
        it("User cannot stake more than wallet balance", async function () {
            // Balance is 0
            await expect(
                wtyStaking.connect(attacker).stake(0) // Starter Plan
            ).to.be.revertedWith("Insufficient Staking Wallet Balance");
        });

        it("Vault buy should correctly update Staking Wallet", async function () {
            const amount = ethers.parseEther("100");
            await mockUsdt.mint(victim.address, amount);
            await mockUsdt.connect(victim).approve(await wtyVault.getAddress(), amount);

            await wtyVault.connect(victim).buyWty(amount);

            // 1 USDT = 20 WTY
            expect(await wtyStaking.getStakingWalletBalance(victim.address)).to.equal(ethers.parseEther("2000"));
        });
    });

    describe("🚨 Critical Security Exploits", function () {
        it("Oracle Manipulation allows massive arbitrage on Staking", async function () {
            // 1. Initial State: Price is $0.15 (15)
            // User buys 2000 Credits for $100 USDT (Vault Fixed Rate 0.05)
            // Plan: Growth (ID 2). Cost $100.
            // Required Credits @ $0.15: ($100 * 1e36) / $0.15e18 = 666.66 WTY

            // Victim buys properly
            await mockUsdt.mint(victim.address, ethers.parseEther("100"));
            await mockUsdt.connect(victim).approve(await wtyVault.getAddress(), ethers.parseEther("100"));
            await wtyVault.connect(victim).buyWty(ethers.parseEther("100")); // Get 2000 Credits

            // Normal Stake
            await wtyStaking.connect(victim).stake(2); // Growth Plan ($100)
            // Check balance used. 2000 - 666 = ~1333 left.
            const balanceAfterNormal = await wtyStaking.getStakingWalletBalance(victim.address);

            // 2. Attack State: Price Manipulated to $100.00 (10000)
            await mockRouter.setPrice(10000);

            // Attacker buys minimal credits.
            // Plan Cost $100. Oracle Price $100 (Ignored now). Required: 2000 WTY (Fixed Price).
            // Vault Cost for 1 WTY (Credit): 0.05 USDT.
            // Attacker spends 0.05 USDT to get 1 Credit.

            await mockUsdt.mint(attacker.address, ethers.parseEther("1")); // 1 USDT
            await mockUsdt.connect(attacker).approve(await wtyVault.getAddress(), ethers.parseEther("1"));
            await wtyVault.connect(attacker).buyWty(ethers.parseEther("1")); // Get 20 Credits

            const attackerStartBalance = await wtyStaking.getStakingWalletBalance(attacker.address);
            expect(attackerStartBalance).to.equal(ethers.parseEther("20"));

            // Attacker Tries to Stake
            // Should FAIL because required amount is based on $0.05 price (2000 WTY), and attacker only has 20.
            await expect(
                wtyStaking.connect(attacker).stake(2) // Growth Plan ($100)
            ).to.be.revertedWith("Insufficient Staking Wallet Balance");

            // Conclusion: Manipulating the Oracle has NO EFFECT. Arbitrage is impossible.
        });
    });
});
