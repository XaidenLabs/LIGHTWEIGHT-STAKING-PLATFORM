# 🦁 WTY Lightweight Staking Platform

Welcome to the **WTY Staking Ecosystem**! This project contains the Smart Contracts for the WTY Token, Staking Engine, Migration Module, and Commitment Vault.

---

## 📂 Project Structure

*   `contracts/`: The Solidity Smart Contracts.
    *   `WityToken.sol`: The ERC20 Token (Upgradeable, Taxed).
    *   `WityStaking.sol`: The Staking Contract (7 Plans, Restricted Wallet).
    *   `WityMigration.sol`: Migration logic for old tokens.
    *   `WityVault.sol`: Discounted purchase vault.
*   `test/`: Comprehensive Unit Tests (`DeploymentTest.ts`).
*   `scripts/`: Deployment scripts (`deploy.ts`).

---

## ⚡ Quick Start

### 1. Installation
```bash
npm install
```

### 2. Run Tests
Verify that everything works correctly:
```bash
npx hardhat test
```

### 3. Deploy to Testnet (BSC)
1.  Open `.env` (create if needed) and add your Private Key:
    ```
    PRIVATE_KEY=your_private_key_here
    BSC_TESTNET_URL=https://data-seed-prebsc-1-s1.binance.org:8545
    ```
2.  Open `scripts/deploy.ts` and update `OLD_STAKING_ADDRESS` with the real address.
3.  Run the script:
    ```bash
    npx hardhat run scripts/deploy.ts --network bscTestnet
    ```

---

## 🎨 Frontend Integration Guide (The Easy Way)

**For Frontend Developers:** This section explains how to connect your website to these contracts.

### 1. The Setup
We use **Next.js** + **RainbowKit** + **Wagmi**.
```bash
npm install @rainbow-me/rainbowkit wagmi viem @tanstack/react-query
```

### 2. The "Staking Wallet" Concept 🛑
This is the most crucial part of this system.
*   **Tokens bought via Vault OR Migrated** do NOT go to the user's Metamask.
*   They go to a **Restricted Balance** inside the Staking Contract.
*   **To show this balance:**
    Call `WityStaking.getStakingWalletBalance(userAddress)`.

### 3. The Three Key Buttons

#### 🔄 A. The "Migrate" Button
Swaps Old WTY for New WTY (into the Staking Wallet).
*   **Function:** `WityMigration.migrateStaked()`
*   **Check:** `WityMigration.hasMigrated(user)` (Hide button if true).

#### 💰 B. The "Buy Discounted WTY" Button (Vault)
Sells WTY at $0.05 (Paid in USDT).
*   **Step 1:** `UsdtContract.approve(VaultAddress, amount)`
*   **Step 2:** `WityVault.buyWty(usdtAmount)`

#### 🔒 C. The "Stake" Button
Locks tokens from the Staking Wallet into a Plan.
*   **Function:** `WityStaking.stake(planId)`
*   **Plan IDs:**
    *   `0`: Starter ($20)
    *   `1`: Basic ($50)
    *   `2`: Growth ($100)
    *   `3`: Pro ($500)
    *   `4`: Elite ($2,000)
    *   `5`: Power ($5,000)
    *   `6`: Whale ($10,000)

### 4. Important Addresses
(Fill these in after deployment)
*   **WTY Token:** `0x...`
*   **Staking Contract:** `0x...`
*   **Migration Contract:** `0x...`
*   **Vault Contract:** `0x...`
# LIGHTWEIGHT-STAKING-PLATFORM
