import React, {useState, useEffect, useCallback} from "react";
import {supabase} from "../lib/supabaseClient";
import {useAuth} from "../context/AuthProvider";
import {useNavigate} from "react-router-dom";
import {toast} from "react-toastify";
import {motion, AnimatePresence} from "framer-motion";
import {useEscrow} from "../hooks/useEscrow";

interface IncomingOrder {
    order_id: number;
    scenario_id: number;
    status: string;
    title: string;
    description: string;
    price: number;
    execution_time: string;
    customer_name: string | null;
    customer_avatar: string | null;
    proof_description: string | null;
    proof_url: string | null;

    // ✅ нове поле (додай в RPC/запит)
    executor_signature?: string | null;
}

export default function GetScenarii() {
    const {user} = useAuth();
    const navigate = useNavigate();

    const {signExecutorConfirmation, escrowLoading} = useEscrow();

    const [orders, setOrders] = useState<IncomingOrder[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedOrder, setSelectedOrder] = useState<IncomingOrder | null>(null);
    const [proofText, setProofText] = useState("");
    const [proofFile, setProofFile] = useState<File | null>(null);

    const fetchOrders = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const {data, error} = await supabase.rpc("get_my_received_orders");
            if (error) throw error;
            setOrders(data || []);
        } catch (e: any) {
            console.error(e);
            toast.error("Не вдалося завантажити замовлення");
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const handleConfirmExecution = async () => {
        if (!selectedOrder || !user) return;

        try {
            if (!proofText.trim()) {
                toast.warn("Опиши доказ виконання (текст)");
                return;
            }

            // 1) Upload proof file (optional)
            let filePath: string | null = null;

            if (proofFile) {
                const ext = proofFile.name.split(".").pop();
                filePath = `order_${selectedOrder.order_id}_${Date.now()}.${ext}`;

                const {error: uploadError} = await supabase
                    .storage
                    .from("order-proofs")
                    .upload(filePath, proofFile);

                if (uploadError) throw uploadError;
            }

            // 2) ✅ Generate executor signature in MetaMask (NO GAS)
            toast.info("MetaMask: підпиши підтвердження виконання...");
            const sig = await signExecutorConfirmation(selectedOrder.order_id);

            if (!sig) {
                toast.error("Підпис не створено");
                return;
            }

            // 3) Update order in Supabase (status + proof + executor_signature)
            const {error: orderError} = await supabase
                .from("orders")
                .update({
                    status: "completed_by_executor",
                    proof_description: proofText,
                    proof_url: filePath,
                    executor_signature: sig
                })
                .eq("id", selectedOrder.order_id);

            if (orderError) throw orderError;

            toast.success("Виконання підтверджено ✅ Підпис збережено.");
            setSelectedOrder(null);
            setProofText("");
            setProofFile(null);

            await fetchOrders();
        } catch (e: any) {
            console.error(e);
            toast.error("Помилка підтвердження: " + (e.message || "unknown"));
        }
    };

    return (
        <div className="min-h-screen bg-white">
            <header className="p-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full bg-gray-100 font-bold">
                    ← Назад
                </button>
                <div className="font-black text-xl">Отримані сценарії</div>
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
                                    {order.customer_avatar ? (
                                        <img src={order.customer_avatar} className="w-10 h-10 rounded-full object-cover" alt=""/>
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gray-200"/>
                                    )}
                                    <div className="flex-1">
                                        <div className="font-black">{order.customer_name || "Замовник"}</div>
                                        <div className="text-gray-500 text-sm">{order.title}</div>
                                    </div>
                                    <div className="font-black">{order.price} USDT</div>
                                </div>

                                <div className="mt-3 text-gray-700 whitespace-pre-line">{order.description}</div>

                                <div className="mt-4">
                                    <button
                                        onClick={() => setSelectedOrder(order)}
                                        className="w-full py-5 bg-[#ffe0e6] rounded-full font-bold text-lg text-gray-700 active:scale-95 transition-all"
                                    >
                                        ✅ ПІДТВЕРДИТИ ВИКОНАННЯ
                                    </button>

                                    {escrowLoading && (
                                        <div className="mt-2 text-center text-sm text-gray-500 font-bold">
                                            MetaMask...
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <AnimatePresence>
                {selectedOrder && (
                    <motion.div
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
                    >
                        <div className="bg-white w-[95%] max-w-xl rounded-2xl p-4">
                            <div className="font-black text-xl mb-2">Доказ виконання</div>

                            <textarea
                                className="w-full p-4 rounded-2xl bg-gray-100 font-bold min-h-[120px]"
                                placeholder="Опиши, що саме ти зробив(ла)"
                                value={proofText}
                                onChange={(e) => setProofText(e.target.value)}
                            />

                            <div className="mt-3">
                                <input
                                    type="file"
                                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                                />
                            </div>

                            <div className="mt-4 space-y-2">
                                <button
                                    onClick={handleConfirmExecution}
                                    className="w-full py-5 bg-black text-white rounded-full font-black text-lg active:scale-95 transition-all"
                                    disabled={escrowLoading}
                                >
                                    {escrowLoading ? "META MASK..." : "✅ ПІДТВЕРДИТИ ВИКОНАННЯ"}
                                </button>

                                <button
                                    onClick={() => setSelectedOrder(null)}
                                    className="w-full py-4 bg-gray-100 rounded-full font-black text-lg active:scale-95"
                                >
                                    Скасувати
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
