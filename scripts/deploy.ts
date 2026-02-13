import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // --- CONFIGURATION ---
    // RENAME THESE FOR MAINNET/TESTNET
    const REWARD_POOL = deployer.address; // Replace with actual
    const TREASURY_WALLET = deployer.address; // Replace with actual

    // Testnet Mock Addresses (Replace with Real ones on BSC)
    // USDT (BSC Testnet) - Example
    // Router (PancakeSwap Testnet) - Example

    // For deployment, if we don't have them, we might need to deploy mocks OR fail.
    // Assuming User provides them in .env or we use placeholders.
    const USDT_ADDRESS = "0x337610d27c682E347C9cD60BD4b3b107C9d34346"; // BSC Testnet USDT
    const ROUTER_ADDRESS = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3"; // BSC Testnet Router
    const OLD_STAKING_ADDRESS = "0x0000000000000000000000000000000000000000"; // REPLACE THIS

    // 1. Deploy WTY Token
    const WityToken = await ethers.getContractFactory("WityToken");
    const wtyToken = await upgrades.deployProxy(WityToken, [deployer.address, REWARD_POOL], { initializer: "initialize" });
    await wtyToken.waitForDeployment();
    console.log("WityToken deployed to:", await wtyToken.getAddress());

    // 2. Deploy Staking
    const WityStaking = await ethers.getContractFactory("WityStaking");
    const wtyStaking = await upgrades.deployProxy(WityStaking, [
        await wtyToken.getAddress(),
        USDT_ADDRESS,
        ROUTER_ADDRESS
    ], { initializer: "initialize" });
    await wtyStaking.waitForDeployment();
    console.log("WityStaking deployed to:", await wtyStaking.getAddress());

    // 3. Deploy Migration
    const WityMigration = await ethers.getContractFactory("WityMigration");
    const wtyMigration = await upgrades.deployProxy(WityMigration, [
        await wtyStaking.getAddress(),
        OLD_STAKING_ADDRESS
    ], { initializer: "initialize" });
    await wtyMigration.waitForDeployment();
    console.log("WityMigration deployed to:", await wtyMigration.getAddress());

    // 4. Deploy Vault
    const WityVault = await ethers.getContractFactory("WityVault");
    const wtyVault = await upgrades.deployProxy(WityVault, [
        USDT_ADDRESS,
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
