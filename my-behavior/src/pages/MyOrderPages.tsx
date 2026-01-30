import React, {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {supabase} from "../lib/supabaseClient";
import {useAuth} from "../context/AuthProvider";
import {toast} from "react-toastify";
import {motion, AnimatePresence} from "framer-motion";
import {useEscrow} from "../hooks/useEscrow";

interface OrderItem {
    order_id: number;
    scenario_id: number;
    order_status: string;
    execution_time: string;
    title: string;
    description: string;
    price: number;
    proof_description: string | null;
    proof_url: string | null;
    performer_id: string | null;
    counterparty_name: string | null;
    counterparty_avatar: string | null;

    // ✅ додай у RPC "executor_signature"
    executor_signature?: string | null;
}

export default function MyOrdersPage() {
    const {user} = useAuth();
    const navigate = useNavigate();

    const {confirmCompletionByCustomer, openDispute, escrowLoading} = useEscrow();

    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [viewingProof, setViewingProof] = useState<OrderItem | null>(null);
    const [isRatingStep, setIsRatingStep] = useState(false);

    const fetchOrders = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const {data, error} = await supabase.rpc('get_my_created_orders');
            if (error) throw error;
            if (data) {
                const mapped = data.map((o: any) => ({
                    ...o,
                    order_status: o.status,
                    counterparty_name: o.performer_name || "Очікує виконання",
                    counterparty_avatar: o.performer_avatar || null,
                    executor_signature: o.executor_signature || null
                }));
                setOrders(mapped);
            }
        } catch (e: any) {
            console.error(e);
            toast.error("Не вдалося завантажити замовлення");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        // eslint-disable-next-line
    }, [user]);

    const handleFinalApprove = async () => {
        if (!viewingProof || !user) return;

        try {
            // 1) беремо signature
            let sig = (viewingProof.executor_signature || "").trim();

            if (!sig) {
                sig = (window.prompt("Встав підпис виконавця (executorSignature 0x...)") || "").trim();
            }

            if (!sig || !sig.startsWith("0x") || sig.length < 132) {
                toast.error("Немає валідного executorSignature");
                return;
            }

            // 2) ончейн confirm (MetaMask у замовника)
            const ok = await confirmCompletionByCustomer(viewingProof.order_id, sig);
            if (!ok) return;

            // 3) Supabase статус
            const {error: orderError} = await supabase
                .from('orders')
                .update({status: 'resolved'})
                .eq('id', viewingProof.order_id);

            if (orderError) throw orderError;

            toast.success("Готово ✅");
            setViewingProof(null);
            setIsRatingStep(false);
            await fetchOrders();
        } catch (e: any) {
            console.error(e);
            toast.error("Помилка: " + (e.message || "unknown"));
        }
    };

    const handleOpenDispute = async () => {
        if (!viewingProof) return;

        try {
            // ончейн openDispute (MetaMask у замовника)
            const ok = await openDispute(viewingProof.order_id);
            if (!ok) return;

            // Supabase статус
            const {error} = await supabase
                .from("orders")
                .update({status: "disputed"})
                .eq("id", viewingProof.order_id);

            if (error) throw error;

            toast.success("Спір відкрито ✅");
            setViewingProof(null);
            setIsRatingStep(false);
            await fetchOrders();
        } catch (e: any) {
            console.error(e);
            toast.error("Помилка спору");
        }
    };

    return (
        <div className="min-h-screen bg-white">
            <header className="p-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full bg-gray-100 font-bold">
                    ← Назад
                </button>
                <div className="font-black text-xl">Мої замовлення</div>
                <div className="w-20"/>
            </header>

            <main className="p-4 max-w-3xl mx-auto">
                {loading ? (
                    <div className="text-center font-bold">Завантаження...</div>
                ) : orders.length === 0 ? (
                    <div className="text-center text-gray-500 font-bold">Поки немає замовлень</div>
                ) : (
                    <div className="space-y-3">
                        {orders.map((order) => (
                            <div key={order.order_id} className="p-4 rounded-2xl bg-gray-50 border">
                                <div className="flex items-center gap-3">
                                    {order.counterparty_avatar ? (
                                        <img src={order.counterparty_avatar} className="w-10 h-10 rounded-full object-cover" alt=""/>
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gray-200"/>
                                    )}
                                    <div className="flex-1">
                                        <div className="font-black">{order.counterparty_name || "Виконавець"}</div>
                                        <div className="text-gray-500 text-sm">{order.title}</div>
                                    </div>
                                    <div className="font-black">{order.price} USDT</div>
                                </div>

                                <div className="mt-3 text-gray-700 whitespace-pre-line">{order.description}</div>

                                <div className="mt-4">
                                    <button
                                        onClick={() => setViewingProof(order)}
                                        className="w-full py-5 bg-[#ffe0e6] rounded-full font-bold text-lg text-gray-700 active:scale-95 transition-all"
                                    >
                                        🔎 ПЕРЕГЛЯНУТИ ДОКАЗ / ДІЇ
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <AnimatePresence>
                {viewingProof && (
                    <motion.div
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
                    >
                        <div className="bg-white w-[95%] max-w-xl rounded-2xl p-4">
                            <div className="font-black text-xl mb-2">Рішення по виконанню</div>

                            <div className="text-gray-700 mb-3">
                                <div className="font-bold">Proof:</div>
                                <div className="text-sm whitespace-pre-line">{viewingProof.proof_description || "—"}</div>
                            </div>

                            <div className="space-y-2">
                                <button
                                    onClick={handleFinalApprove}
                                    disabled={escrowLoading}
                                    className="w-full py-6 bg-black text-white rounded-full font-black text-xl shadow-xl active:scale-95 transition-all uppercase tracking-widest disabled:bg-gray-400"
                                >
                                    {escrowLoading ? "ВЗАЄМОДІЯ З METAMASK..." : "✅ ПІДТВЕРДИТИ ВИКОНАННЯ"}
                                </button>

                                <button
                                    onClick={handleOpenDispute}
                                    disabled={escrowLoading}
                                    className="w-full py-5 bg-gray-100 rounded-full font-black text-lg active:scale-95 transition-all disabled:bg-gray-200"
                                >
                                    ⚠️ ОСПОРИТИ ВИКОНАННЯ
                                </button>

                                <button
                                    onClick={() => setViewingProof(null)}
                                    className="w-full py-4 bg-white border rounded-full font-black text-lg active:scale-95"
                                >
                                    Закрити
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
