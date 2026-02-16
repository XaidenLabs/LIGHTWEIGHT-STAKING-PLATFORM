

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

### 3. Deploy (Safe Mode)
**Option A: Local Testing (Recommended)**
This command automatically deploys **Mocks** (USDT, OldStaking) so you can test the full system without spending real funds.
```bash
npx hardhat run scripts/deploy.ts
```

**Option B: Live Network (BSC Testnet or Mainnet)**
1.  Open `.env` and add your keys:
    ```
    PRIVATE_KEY=your_private_key
    BSC_TESTNET_URL=https://data-seed-prebsc-1-s1.binance.org:8545
    BSC_URL=https://bsc-dataseed.binance.org/
    BSCSCAN_API_KEY=your_bscscan_api_key
    OLD_STAKING_ADDRESS=0x... (Real Address)
    ```
2.  **CRITICAL BEFORE DEPLOYING**: Ensure `OLD_STAKING_ADDRESS` is set in `.env`.
3.  Run for **Testnet**:
    ```bash
    npx hardhat run scripts/deploy.ts --network bscTestnet
    ```
4.  Run for **MAINNET** 🚀:
    ```bash
    npx hardhat run scripts/deploy.ts --network bsc
    ```
5.  **Verify on Etherscan/BscScan**:
    ```bash
    npx hardhat verify --network bsc <DEPLOYED_CONTRACT_ADDRESS>
    ```

---

## 🛡️ Security & Verification

This platform has undergone a **"Brutal" Security Test**.

### Key Security Features
*   **Fixed Rate Staking**: The Staking Contract uses a **Fixed Price ($0.05)** for WTY credits. This matches the Vault price, preventing Oracle Arbitrage attacks.
*   **Restricted Wallets**: Staking Credits are non-transferable and can only be used for Staking Plans.
*   **Anti-Double Spend**: Migration logic tracks user state to prevent double-claiming.

### Verifying the Fixes
Run the security test suite to confirm the system is safe:
```bash
npx hardhat test test/SecurityTest.ts
```
Expected Output: `7 passing` (All security checks passed).

---

## 👨‍💻 Frontend Developer Guide

**Full Walkthrough for integrating WTY Smart Contracts into a React/Next.js App.**

### 1. 🏗️ Setup & Config
We use **Next.js** + **RainbowKit** + **Wagmi** + **Viem**.

```bash
npm install @rainbow-me/rainbowkit wagmi viem @tanstack/react-query
```

#### Local Development Config
Use these addresses when running `npx hardhat node`.
| Contract | Local Address (Example) |
| :--- | :--- |
| **WTY Token** | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` |
| **Staking** | `0x0165878A594ca255338adfa4d48449f69242Eb8F` |
| **Vault** | `0x610178dA211FEF7D417bC0e6FeD39F05609AD788` |
| **Migration** | `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6` |
| **USDT (Mock)** | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |

> **Tip:** You can find the **ABIs** in `artifacts/contracts/.../ContractName.json`. Copy the `abi` array into your frontend `abis/` folder.

---

### 2. CORE CONCEPT: The "Staking Wallet" 🛑
**CRITICAL UNDERSTANDING:**
1.  Users **do NOT** stake from their Metamask Balance.
2.  Users **Buy Credits** (via Vault) or **Migrate** (via Legacy) -> Credits go to `StakingWallet`.
3.  Users **Stake** from `StakingWallet` -> `Active Plan`.

**Flow:** USDT -> Vault -> Staking Wallet -> Active Stake

---

### 3. 🧩 Integration Code Snippets

#### A. Reading User's "Staking Wallet" Balance
This is the balance available to be used for buying plans.
```typescript
import { useReadContract, useAccount } from 'wagmi';
import WityStakingABI from './abis/WityStaking.json';

const { address } = useAccount();

const { data: stakingBalance } = useReadContract({
  address: STAKING_CONTRACT_ADDRESS,
  abi: WityStakingABI,
  functionName: 'getStakingWalletBalance',
  args: [address],
  watch: true, // Auto-update
});

// Display: {formatEther(stakingBalance)} WTY Credits
```

#### B. 💰 Buying WTY Credits (The Vault)
User pays USDT to get WTY Credits at $0.05. **Requires 2 Transactions (Approve + Buy).**

```typescript
import { useWriteContract } from 'wagmi';

const { writeContractAsync } = useWriteContract();

async function handleBuyCredits(usdtAmountWait: string) {
  const amount = parseUnits(usdtAmount, 18); // Check USDT decimals!

  // 1. Approve Vault to spend USDT
  await writeContractAsync({
    address: USDT_ADDRESS,
    abi: ERC20ABI,
    functionName: 'approve',
    args: [VAULT_ADDRESS, amount],
  });

  // 2. Buy WTY
  await writeContractAsync({
    address: VAULT_ADDRESS,
    abi: WityVaultABI,
    functionName: 'buyWty',
    args: [amount],
  });
}
```

#### C. 🔒 Staking (Activating a Plan)
User spends "Staking Wallet" credits to enter a plan.

**Plan ID Reference:**
- `0`: Starter ($20) -> 400 Credits
- `1`: Basic ($50) -> 1,000 Credits
- `2`: Growth ($100) -> 2,000 Credits
- `3`: Pro ($500) -> 10,000 Credits
- `4`: Elite ($2,000) -> 40,000 Credits
- `5`: Power ($5,000) -> 100,000 Credits
- `6`: Whale ($10,000) -> 200,000 Credits

```typescript
async function handleStake(planId: number) {
  try {
    await writeContractAsync({
      address: STAKING_ADDRESS,
      abi: WityStakingABI,
      functionName: 'stake',
      args: [planId],
    });
    toast.success("Staked Successfully!");
  } catch (err) {
    if (err.message.includes("Insufficient Staking Wallet Balance")) {
       toast.error("You need to buy more WTY Credits first!");
    }
  }
}
```

#### D. 🔄 Migrating Legacy Tokens
One-click migration for old users.

```typescript
// Check if already migrated
const { data: hasMigrated } = useReadContract({
  address: MIGRATION_ADDRESS,
  abi: WityMigrationABI,
  functionName: 'hasMigrated',
  args: [address]
});

// Action
async function handleMigration() {
  await writeContractAsync({
    address: MIGRATION_ADDRESS,
    abi: WityMigrationABI,
    functionName: 'migrateStaked',
  });
}

// UI
if (hasMigrated) return <Badge>Migrated ✅</Badge>;
return <Button onClick={handleMigration}>Migrate Now</Button>;
```

### 4. ⚠️ Common Errors & Handling
| Error Message | Meaning | Fix |
| :--- | :--- | :--- |
| `Insufficient Staking Wallet Balance` | User tries to stake `Plan 2` ($100) but only migrated $50 worth. | Prompt user to **Buy WTY** via Vault to cover the difference. |
| `Caller not authorized` | Implementation Error. | Ensure you are calling the right contract (only Vault/Migration can fund Wallet). |
| `Already migrated` | User clicked migrate twice. | Hide the migrate button after success. |
