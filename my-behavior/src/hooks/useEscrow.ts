import { useState } from "react";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import escrowABI from "../lib/escrowABI.json";

const ESCROW_ADDRESS = "0x18e2B6D90E388D7AA86bAb9c524A153A379Af635";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

const BSC_CHAIN_ID = 56;

export const useEscrow = () => {
  const [escrowLoading, setEscrowLoading] = useState(false);

  const getProvider = async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      toast.error("MetaMask не знайдено");
      return null;
    }
    return new ethers.BrowserProvider(eth);
  };

  const ensureBscNetwork = async (provider: ethers.BrowserProvider) => {
    const net = await provider.getNetwork();
    if (Number(net.chainId) === BSC_CHAIN_ID) return true;

    try {
      await (window as any).ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x38" }]
      });
      return true;
    } catch {
      toast.error("Перемкни мережу на BNB Smart Chain (Mainnet)");
      return false;
    }
  };

  const getSigner = async () => {
    const provider = await getProvider();
    if (!provider) return null;

    const ok = await ensureBscNetwork(provider);
    if (!ok) return null;

    await provider.send("eth_requestAccounts", []);
    return await provider.getSigner();
  };

  const getEscrowContract = async () => {
    const signer = await getSigner();
    if (!signer) return null;
    return new ethers.Contract(ESCROW_ADDRESS, escrowABI as any, signer);
  };

  const getUsdtContract = async () => {
    const signer = await getSigner();
    if (!signer) return null;
    return new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  };

  // 0) "ПОГОДИТИ УГОДУ" (частина 1): approve USDT
  const approveUSDT = async (amountUSDT: string) => {
    setEscrowLoading(true);
    try {
      const usdt = await getUsdtContract();
      if (!usdt) return false;

      const decimals: number = await usdt.decimals();
      const value = ethers.parseUnits(amountUSDT, decimals);

      const tx = await usdt.approve(ESCROW_ADDRESS, value);
      toast.info("Підтверди Approve USDT у MetaMask...");
      await tx.wait();
      toast.success("Approve USDT успішний ✅");
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.shortMessage || e?.message || "Помилка approve");
      return false;
    } finally {
      setEscrowLoading(false);
    }
  };

  // 1) "ПОГОДИТИ УГОДУ" (частина 2): createOrder (lock USDT)
  const createOrder = async (
    orderId: number,
    performerAddress: string,
    referrerOrZero: string,
    amountUSDT: string
  ) => {
    setEscrowLoading(true);
    try {
      const escrow = await getEscrowContract();
      if (!escrow) return false;

      const usdt = await getUsdtContract();
      if (!usdt) return false;

      const decimals: number = await usdt.decimals();
      const value = ethers.parseUnits(amountUSDT, decimals);

      const ref = (referrerOrZero || "").trim() || ethers.ZeroAddress;

      const tx = await escrow.createOrder(orderId, performerAddress, ref, value);
      toast.info("Підтверди депозит (createOrder) у MetaMask...");
      await tx.wait();

      toast.success("USDT задепоновано в Escrow ✅");
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.shortMessage || e?.message || "Помилка createOrder");
      return false;
    } finally {
      setEscrowLoading(false);
    }
  };

  // 2) Виконавець: "ПІДТВЕРДИТИ ВИКОНАННЯ" = підпис (без gas)
  const signExecutorConfirmation = async (orderId: number) => {
    setEscrowLoading(true);
    try {
      const signer = await getSigner();
      if (!signer) return null;

      const provider = await getProvider();
      if (!provider) return null;

      const net = await provider.getNetwork();

      // innerHash = keccak256("BMB_EXECUTOR_CONFIRM", chainId, this, orderId)
      const innerHash = ethers.solidityPackedKeccak256(
        ["string", "uint256", "address", "uint256"],
        ["BMB_EXECUTOR_CONFIRM", Number(net.chainId), ESCROW_ADDRESS, orderId]
      );

      // EIP-191 prefix застосує signMessage — як у твоєму контракті
      const sig = await signer.signMessage(ethers.getBytes(innerHash));

      toast.success("Підпис виконання створено ✅");
      return sig;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.shortMessage || e?.message || "Помилка підпису");
      return null;
    } finally {
      setEscrowLoading(false);
    }
  };

  // 3) Замовник: "ПІДТВЕРДИТИ ВИКОНАННЯ" = транзакція (gas), потрібен sig виконавця
  const confirmCompletionByCustomer = async (orderId: number, executorSignature: string) => {
    setEscrowLoading(true);
    try {
      const escrow = await getEscrowContract();
      if (!escrow) return false;

      const tx = await escrow.confirmCompletionByCustomer(orderId, executorSignature);
      toast.info("Підтверди транзакцію у MetaMask...");
      await tx.wait();

      toast.success("Виконання підтверджено, кошти розподілено ✅");
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.shortMessage || e?.message || "Помилка confirmCompletion");
      return false;
    } finally {
      setEscrowLoading(false);
    }
  };

  // 4) Спір (замовник відкриває)
  const openDispute = async (orderId: number) => {
    setEscrowLoading(true);
    try {
      const escrow = await getEscrowContract();
      if (!escrow) return false;

      const tx = await escrow.openDispute(orderId);
      toast.info("Підтверди openDispute у MetaMask...");
      await tx.wait();

      toast.success("Спір відкрито ✅");
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.shortMessage || e?.message || "Помилка openDispute");
      return false;
    } finally {
      setEscrowLoading(false);
    }
  };

  return {
    escrowLoading,
    approveUSDT,
    createOrder,
    signExecutorConfirmation,
    confirmCompletionByCustomer,
    openDispute
  };
};
