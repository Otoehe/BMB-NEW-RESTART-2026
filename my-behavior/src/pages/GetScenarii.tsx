import React, {useState, useEffect, useCallback} from "react";
import {supabase} from "../lib/supabaseClient";
import {useAuth} from "../context/AuthProvider";
import {useNavigate} from "react-router-dom";
import {toast} from "react-toastify";
import {motion, AnimatePresence} from "framer-motion";

// Оновлений інтерфейс
interface IncomingOrder {
    order_id: number;
    scenario_id: number;
    order_status: string;
    execution_time: string;
    title: string;
    description: string;
    price: number;
    customer_id: string; // Обов'язково для відгуку
    performer_id: string; // Обов'язково для відгуку
}

export default function ReceivedOrdersPage() {
    const {user} = useAuth();
    const navigate = useNavigate();

    const [orders, setOrders] = useState<IncomingOrder[]>([]);
    const [loading, setLoading] = useState(true);

    // Стан для редагування
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDesc, setEditDesc] = useState("");
    const [editPrice, setEditPrice] = useState(0);

    // Стан для модального вікна виконання
    const [selectedOrder, setSelectedOrder] = useState<IncomingOrder | null>(null);
    const [proofText, setProofText] = useState("");
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const [isRatingStep, setIsRatingStep] = useState(false);
    const [customerRating, setCustomerRating] = useState(10);
    const [customerReview, setCustomerReview] = useState("");

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            // RPC має повертати customer_id та performer_id
            const {data, error} = await supabase.rpc('get_incoming_requests');
            if (error) throw error;
            setOrders(data || []);
        } catch (err: any) {
            toast.error("Не вдалося завантажити замовлення");
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ФІНАЛЬНА ФУНКЦІЯ: ЗАВАНТАЖЕННЯ + СТАТУС + ВІДГУК
    const handleCompleteOrder = async () => {
        if (!selectedOrder || !user) return;
        if (!proofFile) return toast.error("Додайте фото або відео докази");

        setUploading(true);
        try {
            // 1. Завантаження файлу
            const fileExt = proofFile.name.split('.').pop();
            const filePath = `proofs/${selectedOrder.order_id}_${Date.now()}.${fileExt}`;

            const {error: uploadError} = await supabase.storage
                .from('order-proofs')
                .upload(filePath, proofFile);

            if (uploadError) throw uploadError;

            // 2. Оновлення статусу замовлення
            const {error: orderError} = await supabase
                .from('orders')
                .update({
                    status: 'completed_by_executor',
                    proof_description: proofText,
                    proof_url: filePath
                })
                .eq('id', selectedOrder.order_id);

            if (orderError) throw orderError;

            // 3. Збереження відгуку про замовника
            const {error: reviewError} = await supabase
                .from('reviews')
                .insert({
                    reviewer_id: user.id,
                    reviewee_id: selectedOrder.customer_id,
                    order_id: selectedOrder.order_id,
                    rating: customerRating,
                    comment: customerReview
                });

            if (reviewError) throw reviewError;

            toast.success("Виконано! Звіт та відгук надіслано 🚀");
            closeModal();
            fetchData();
        } catch (e: any) {
            toast.error("Помилка: " + e.message);
        } finally {
            setUploading(false);
        }
    };

    const closeModal = () => {
        setSelectedOrder(null);
        setIsRatingStep(false);
        setProofFile(null);
        setProofText("");
        setCustomerReview("");
    };

    const handleProposeChanges = async (order: IncomingOrder) => {
        try {
            const {error} = await supabase
                .from('scenarios')
                .update({description: editDesc, price: editPrice})
                .eq('id', order.scenario_id);

            if (error) throw error;
            setEditingId(null);
            fetchData();
            toast.success("Пропозицію відправлено!");
        } catch (e: any) {
            toast.error("Помилка: " + e.message);
        }
    };

    if (loading) return <div
        className="h-screen flex items-center justify-center font-black text-gray-300 animate-pulse">СИНХРОНІЗАЦІЯ...</div>;

    return (
        <div className="min-h-screen bg-[#fcfcfc] p-6 md:p-10 font-sans">
            <main className="max-w-5xl mx-auto">
                <h2 className="text-4xl font-black mb-10 tracking-tight italic">Вхідні замовлення</h2>

                <div className="space-y-8">
                    {orders.length === 0 ? (
                        <div
                            className="text-center py-20 bg-white border border-gray-100 rounded-[45px] text-gray-400 font-bold uppercase tracking-widest">Нових
                            запитів немає</div>
                    ) : (
                        orders.map((order) => (
                            <div key={order.order_id}
                                 className="bg-white border border-black/[0.03] rounded-[45px] p-8 md:p-12 shadow-sm relative">
                                <div className="mb-8">
                                    <label
                                        className="font-black text-[10px] uppercase text-gray-400 block mb-3 tracking-widest">Сценарій</label>
                                    {editingId === order.order_id ? (
                                        <textarea
                                            className="w-full p-6 bg-pink-50/20 border border-pink-100 rounded-3xl outline-none font-bold"
                                            value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                                        />
                                    ) : (
                                        <div
                                            className="p-6 bg-gray-50 rounded-3xl border border-gray-100 italic font-bold text-gray-500">"{order.description}"</div>
                                    )}
                                </div>

                                <div className="flex justify-center mb-10">
                                    <div
                                        className="bg-white border border-gray-100 rounded-full px-12 py-6 flex items-center gap-4 shadow-sm">
                                        {editingId === order.order_id ? (
                                            <input type="number"
                                                   className="text-4xl font-black w-24 text-center outline-none"
                                                   value={editPrice}
                                                   onChange={(e) => setEditPrice(Number(e.target.value))}/>
                                        ) : (
                                            <span className="text-4xl font-black">{order.price}</span>
                                        )}
                                        <span className="text-xl font-black text-gray-300">USDT</span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4 max-w-xl mx-auto">
                                    {editingId === order.order_id ? (
                                        <button onClick={() => handleProposeChanges(order)}
                                                className="py-6 bg-black text-white rounded-full font-black text-lg shadow-xl active:scale-95 transition-all">🚀
                                            ВІДПРАВИТИ ЗМІНИ</button>
                                    ) : (
                                        <button onClick={() => {
                                            setEditingId(order.order_id);
                                            setEditDesc(order.description);
                                            setEditPrice(order.price);
                                        }}
                                                className="py-6 bg-[#ffcbd5] rounded-full font-black text-lg active:scale-95 transition-all">🤝
                                            РЕДАГУВАТИ / ПОГОДИТИ</button>
                                    )}
                                    <button onClick={() => setSelectedOrder(order)}
                                            className="py-5 bg-[#ffe0e6] rounded-full font-bold text-lg text-gray-700 active:scale-95 transition-all">✅
                                        ПІДТВЕРДИТИ ВИКОНАННЯ
                                    </button>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button onClick={() => navigate(`/dispute/${order.order_id}`)}
                                                className="py-5 bg-gray-100 rounded-full font-bold text-gray-500">⚖️
                                            ОСКАРЖИТИ
                                        </button>
                                        <button onClick={() => navigate(`/order-details/${order.order_id}`)}
                                                className="py-5 bg-gray-100 rounded-full font-bold text-gray-500">📍
                                            ЛОКАЦІЯ
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* МОДАЛЬНЕ ВІКНО */}
            <AnimatePresence>
                {selectedOrder && (
                    <div
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div initial={{scale: 0.9, opacity: 0}} animate={{scale: 1, opacity: 1}}
                                    exit={{scale: 0.9, opacity: 0}}
                                    className="bg-white w-full max-w-2xl rounded-[50px] p-10 md:p-14 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar relative">

                            {!isRatingStep ? (
                                <div className="animate-in fade-in duration-300">
                                    <h3 className="text-3xl font-black mb-8 italic tracking-tighter">Звіт про
                                        виконання</h3>
                                    <div className="space-y-6">
                                        <div>
                                            <label
                                                className="block font-black text-[10px] uppercase text-gray-400 mb-3 ml-2">Коментар
                                                до звіту</label>
                                            <textarea
                                                className="w-full p-6 bg-gray-50 border border-gray-100 rounded-[30px] outline-none italic font-medium"
                                                placeholder="Як пройшло виконання?" rows={4} value={proofText}
                                                onChange={(e) => setProofText(e.target.value)}/>
                                        </div>
                                        <div>
                                            <label
                                                className="block font-black text-[10px] uppercase text-gray-400 mb-3 ml-2">Фото/Відео
                                                докази</label>
                                            <input type="file" accept="video/*,image/*"
                                                   onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                                                   className="w-full p-6 border-2 border-dashed border-gray-100 rounded-[30px] font-bold text-gray-400 cursor-pointer"/>
                                            {proofFile &&
                                                <p className="mt-2 ml-4 text-xs font-bold text-green-500 font-mono italic">📎 {proofFile.name}</p>}
                                        </div>
                                        <div className="flex gap-4 pt-4">
                                            <button onClick={closeModal}
                                                    className="flex-1 py-5 bg-gray-100 rounded-full font-bold text-gray-500">СКАСУВАТИ
                                            </button>
                                            <button onClick={() => setIsRatingStep(true)}
                                                    className="flex-[2] py-5 bg-[#ffcbd5] rounded-full font-black text-xl shadow-lg active:scale-95 transition-all">ДАЛІ
                                                (ОЦІНКА) ➡️
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-in slide-in-from-right-8 duration-500 text-center">
                                    <h3 className="text-3xl font-black mb-2 italic">Оцініть замовника</h3>
                                    <p className="text-gray-400 text-xs font-black uppercase tracking-widest mb-10">Рівень
                                        комунікації та чіткість</p>
                                    <div className="flex flex-wrap justify-center gap-2 mb-10">
                                        {[...Array(10)].map((_, i) => (
                                            <button key={i} onClick={() => setCustomerRating(i + 1)}
                                                    className={`w-11 h-11 rounded-full font-black transition-all ${customerRating === i + 1 ? 'bg-pink-400 text-white scale-110 shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>{i + 1}</button>
                                        ))}
                                    </div>
                                    <textarea
                                        className="w-full p-6 bg-gray-50 border border-gray-100 rounded-[30px] outline-none mb-8 italic h-32"
                                        placeholder="Ваш відгук про клієнта..." value={customerReview}
                                        onChange={(e) => setCustomerReview(e.target.value)}/>
                                    <div className="flex gap-4 w-full">
                                        <button onClick={() => setIsRatingStep(false)}
                                                className="flex-1 py-5 bg-gray-100 rounded-full font-bold">НАЗАД
                                        </button>
                                        <button onClick={handleCompleteOrder} disabled={uploading}
                                                className="flex-[2] py-5 bg-black text-white rounded-full font-black text-xl shadow-xl active:scale-95">
                                            {uploading ? "ВІДПРАВКА..." : "🚀 НАДІСЛАТИ ВСЕ"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}