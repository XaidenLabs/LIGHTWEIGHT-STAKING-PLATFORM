import hre, { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // --- CONFIGURATION ---
    // RENAME THESE FOR MAINNET/TESTNET
    const REWARD_POOL = deployer.address; // Replace with actual
    const TREASURY_WALLET = deployer.address; // Replace with actual

    const networkName = hre.network.name;
    let usdtAddress, routerAddress, oldStakingAddress;

    if (networkName === "hardhat" || networkName === "localhost") {
        console.log("Local Network detected! Deploying Mocks...");

        // Deploy Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        const mockUsdt = await MockUSDT.deploy();
        await mockUsdt.waitForDeployment();
        usdtAddress = await mockUsdt.getAddress();
        console.log("MockUSDT deployed to:", usdtAddress);

        // Deploy Mock Router
        const MockRouter = await ethers.getContractFactory("MockRouter");
        const mockRouter = await MockRouter.deploy();
        await mockRouter.waitForDeployment();
        routerAddress = await mockRouter.getAddress();
        console.log("MockRouter deployed to:", routerAddress);

        // Deploy Mock Old Staking
        const MockOldStaking = await ethers.getContractFactory("MockOldStaking");
        const mockOldStaking = await MockOldStaking.deploy();
        await mockOldStaking.waitForDeployment();
        oldStakingAddress = await mockOldStaking.getAddress();
        console.log("MockOldStaking deployed to:", oldStakingAddress);
    } else {
        // Live Network Configuration

        if (networkName === "bsc") { // BSC Mainnet
            console.log("🚀 Deploying to BSC MAINNET");
            usdtAddress = "0x55d398326f99059fF775485246999027B3197955"; // USDT (Mainnet)
            routerAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // PancakeSwap Router (Mainnet)
        }
        else { // Default to Testnet
            console.log("🧪 Deploying to BSC TESTNET");
            usdtAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34346"; // USDT (Testnet)
            routerAddress = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3"; // Router (Testnet)
        }

        oldStakingAddress = process.env.OLD_STAKING_ADDRESS || ethers.ZeroAddress;

        if (oldStakingAddress === ethers.ZeroAddress) {
            console.warn("⚠️ WARNING: Old Staking Address is NOT SET in .env. Migration might fail.");
        }
    }

    // 1. Deploy WTY Token
    const WityToken = await ethers.getContractFactory("WityToken");
    const wtyToken = await upgrades.deployProxy(WityToken, [deployer.address, REWARD_POOL], { initializer: "initialize" });
    await wtyToken.waitForDeployment();
    console.log("WityToken deployed to:", await wtyToken.getAddress());

    // 2. Deploy Staking
    const WityStaking = await ethers.getContractFactory("WityStaking");
    const wtyStaking = await upgrades.deployProxy(WityStaking, [
        await wtyToken.getAddress(),
        usdtAddress,
        routerAddress
    ], { initializer: "initialize" });
    await wtyStaking.waitForDeployment();
    console.log("WityStaking deployed to:", await wtyStaking.getAddress());

    // 3. Deploy Migration
    const WityMigration = await ethers.getContractFactory("WityMigration");
    const wtyMigration = await upgrades.deployProxy(WityMigration, [
        await wtyStaking.getAddress(),
        oldStakingAddress
    ], { initializer: "initialize" });
    await wtyMigration.waitForDeployment();
    console.log("WityMigration deployed to:", await wtyMigration.getAddress());

    // 4. Deploy Vault
    const WityVault = await ethers.getContractFactory("WityVault");
    const wtyVault = await upgrades.deployProxy(WityVault, [
        usdtAddress,
        await wtyStaking.getAddress(),
        TREASURY_WALLET
    ], { initializer: "initialize" });
    await wtyVault.waitForDeployment();
    console.log("WityVault deployed to:", await wtyVault.getAddress());

    // --- SETUP Permissions ---
    console.log("Setting up permissions...");

    // Token Exclusions
    await (await wtyToken.excludeFromFee(await wtyStaking.getAddress(), true)).wait();
    await (await wtyToken.excludeFromFee(await wtyMigration.getAddress(), true)).wait();
    await (await wtyToken.excludeFromFee(await wtyVault.getAddress(), true)).wait();

    // Staking Auth
    await (await wtyStaking.setAuthCaller(await wtyMigration.getAddress(), true)).wait();
    await (await wtyStaking.setAuthCaller(await wtyVault.getAddress(), true)).wait();

    console.log("Deployment Complete!");

    // Verify Command Hint
    console.log(`\nVerify with:
  npx hardhat verify --network bscTestnet ${await wtyToken.getAddress()}
  `);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
