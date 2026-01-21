import {useState} from 'react';
import {ethers} from 'ethers';
import {toast} from 'react-toastify';
import escrowABI from '../lib/escrowABI.json';

// Адреса вашого розгорнутого контракту
const ESCROW_ADDRESS = "0xaf22Aa92E91B50695fa679112269B136E4b9b280";
// Ваша адреса (адміна), куди прийдуть 5% комісії та 5% реферальних, якщо реферала немає
const ADMIN_ADDRESS = "0xf2E0E031641a95FEa2D7c9856D4C24c0BF4DE6Ce";

export const useEscrow = () => {
    const [escrowLoading, setEscrowLoading] = useState(false);

    // 1. СТВОРЕННЯ ЗАМОВЛЕННЯ ТА ДЕПОНУВАННЯ (Клієнт)
    const depositFunds = async (
        orderId: number,
        amount: string,
        performerAddress: string,
        referrerAddress?: string // Реферал необов'язковий
    ) => {
        if (!window.ethereum) {
            toast.error("MetaMask не знайдено");
            return false;
        }

        setEscrowLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(ESCROW_ADDRESS, escrowABI, signer);

            // Якщо адреса реферала не передана, використовуємо адресу адміна як заглушку
            const finalReferrer = referrerAddress && referrerAddress.startsWith("0x")
                ? referrerAddress
                : ADMIN_ADDRESS;

            // Виклик функції createOrder(id, performer, referrer)
            const tx = await contract.createOrder(
                orderId,
                performerAddress,
                finalReferrer,
                {value: ethers.parseUnits(amount, "ether")}
            );

            toast.info("Транзакція оплати ініційована...");
            await tx.wait();
            toast.success("Замовлення оплачено та заблоковано в Escrow! 🔒");
            return true;
        } catch (error: any) {
            console.error("Deposit Error:", error);
            toast.error("Помилка оплати: " + (error.reason || error.message));
            return false;
        } finally {
            setEscrowLoading(false);
        }
    };

    // 2. ПІДТВЕРДЖЕННЯ ТА РОЗПОДІЛ 90/5/5 (Клієнт або Адмін)
    const confirmAndRelease = async (orderId: number) => {
        if (!window.ethereum) return false;
        setEscrowLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(ESCROW_ADDRESS, escrowABI, signer);

            // Виклик releaseFunds(id) - контракт сам знає кому і скільки слати
            const tx = await contract.releaseFunds(orderId);
            toast.info("Транзакція виплати надіслана...");
            await tx.wait();

            toast.success("Кошти розподілені: 90% виконавцю, 5% адміну, 5% рефералу! 💸");
            return true;
        } catch (error: any) {
            console.error("Release Error:", error);
            toast.error("Помилка виплати: " + (error.reason || error.message));
            return false;
        } finally {
            setEscrowLoading(false);
        }
    };

    // 3. ПОВЕРНЕННЯ КОШТІВ (Тільки Адмін)
    const refundToCustomer = async (orderId: number) => {
        if (!window.ethereum) return false;
        setEscrowLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(ESCROW_ADDRESS, escrowABI, signer);

            const tx = await contract.refundToCustomer(orderId);
            await tx.wait();
            toast.success("Кошти повернуто замовнику 🛡️");
            return true;
        } catch (error: any) {
            toast.error("Помилка рефанду: " + (error.reason || error.message));
            return false;
        } finally {
            setEscrowLoading(false);
        }
    };

    return {depositFunds, confirmAndRelease, refundToCustomer, escrowLoading};
};