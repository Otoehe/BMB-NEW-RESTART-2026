import React, {useState, useEffect, useCallback} from "react";
import {supabase} from "../lib/supabaseClient";
import {useAuth} from "../context/AuthProvider";
import {useNavigate} from "react-router-dom";
import {toast} from "react-toastify";
import {motion, AnimatePresence} from "framer-motion";
import {useEscrow} from "../hooks/useEscrow"; // Ваш кастомний хук

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
}

const statusLabels: Record<string, { label: string; color: string }> = {
    pending: {label: "Очікує підтвердження", color: "bg-gray-100 text-gray-500"},
    in_progress: {label: "У стадії виконання", color: "bg-blue-100 text-blue-600"},
    completed_by_executor: {label: "Очікує вашої перевірки", color: "bg-pink-100 text-pink-600"},
    disputed: {label: "Оскаржується", color: "bg-red-100 text-red-600"},
    resolved: {label: "Виконано", color: "bg-green-100 text-green-600"},
    cancelled: {label: "Скасовано", color: "bg-gray-200 text-gray-400"}
};

export default function MyOrdersPage() {
    const {user} = useAuth();
    const navigate = useNavigate();

    // Підключаємо логіку Escrow виплати
    const {confirmAndRelease, escrowLoading} = useEscrow();

    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [viewingProof, setViewingProof] = useState<OrderItem | null>(null);
    const [isRatingStep, setIsRatingStep] = useState(false);
    const [rating, setRating] = useState(10);
    const [reviewComment, setReviewComment] = useState("");

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const {data, error} = await supabase.rpc('get_my_created_orders');
            if (error) throw error;
            if (data) {
                const mapped = data
                    .map((o: any) => ({
                        ...o,
                        order_status: o.status,
                        counterparty_name: o.performer_name || "Очікує виконання",
                        counterparty_avatar: o.performer_avatar
                    }))
                    .filter((o: OrderItem) => o.order_status !== 'resolved' && o.order_status !== 'cancelled');
                setOrders(mapped);
            }
        } catch (err: any) {
            console.error("Помилка завантаження:", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- ФІНАЛЬНЕ ПІДТВЕРДЖЕННЯ ТА ВИПЛАТА 90/5/5 ---
    const handleFinalApprove = async () => {
        if (!viewingProof || !user) return;

        try {
            // КРОК 1: Блокчейн (Виплата через MetaMask)
            // Контракт сам розподіляє кошти на гаманці Виконавця, Адміна та Реферала
            const txSuccess = await confirmAndRelease(viewingProof.order_id);

            if (!txSuccess) {
                // Якщо транзакція відхилена клієнтом або сталась помилка - припиняємо
                return;
            }

            // КРОК 2: Supabase (Оновлення статусу замовлення)
            const {error: orderError} = await supabase
                .from('orders')
                .update({status: 'resolved'})
                .eq('id', viewingProof.order_id);

            if (orderError) throw orderError;

            // КРОК 3: Відгук (Зберігаємо оцінку виконавця)
            const {error: reviewError} = await supabase
                .from('reviews')
                .insert({
                    reviewer_id: user.id,
                    reviewee_id: viewingProof.performer_id,
                    order_id: viewingProof.order_id,
                    rating: rating,
                    comment: reviewComment
                });

            if (reviewError) throw reviewError;

            toast.success("Кошти розподілені (90/5/5)! Угоду завершено. 💸✨");

            // Скидання станів та оновлення списку
            setViewingProof(null);
            setIsRatingStep(false);
            setReviewComment("");
            fetchData();
        } catch (e: any) {
            toast.error("Помилка синхронізації після оплати: " + e.message);
        }
    };

    const handleDisputeClick = async (order: OrderItem) => {
        if (order.order_status === 'disputed') {
            navigate(`/dispute/${order.order_id}`);
        } else {
            const {error} = await supabase
                .from('orders')
                .update({status: 'disputed', disputed_at: new Date().toISOString()})
                .eq('id', order.order_id);

            if (!error) {
                toast.warn("Диспут розпочато! Кошти заблоковані до рішення арбітра.");
                navigate(`/dispute/${order.order_id}`);
            }
        }
    };

    if (loading) return <div
        className="p-10 text-center font-black animate-pulse text-gray-300 uppercase italic">Синхронізація
        блокчейну...</div>;

    return (
        <div className="min-h-screen bg-[#fcfcfc] p-6 font-sans">
            <main className="max-w-5xl mx-auto space-y-8">
                <h2 className="text-4xl font-black mb-8 text-gray-900 tracking-tighter italic">Мої замовлення</h2>

                {orders.length === 0 ? (
                    <div
                        className="text-center py-20 bg-white rounded-[45px] border border-gray-100 text-gray-400 font-bold uppercase tracking-widest">
                        Активних замовлень немає
                    </div>
                ) : (
                    orders.map((order) => {
                        const statusInfo = statusLabels[order.order_status] || {
                            label: order.order_status,
                            color: "bg-gray-100"
                        };
                        return (
                            <div key={order.order_id}
                                 className="bg-white border border-black/[0.04] rounded-[45px] p-8 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                                <div className="flex flex-col lg:flex-row justify-between gap-10">
                                    <div className="flex-1">
                                        <div className="mb-4 flex items-center gap-3">
                                            <span
                                                className="bg-gray-100 text-gray-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">ID: {order.order_id}</span>
                                            <span
                                                className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full ${statusInfo.color} shadow-sm border border-black/5`}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl font-black mb-4">{order.title}</h3>
                                        <div
                                            className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100/50 mb-6 italic font-medium text-gray-600 leading-relaxed">
                                            "{order.description}"
                                        </div>
                                    </div>
                                    <div
                                        className="lg:w-48 text-center bg-white rounded-[40px] p-8 flex flex-col justify-center border border-gray-100 shadow-sm">
                                        <span
                                            className="text-[10px] font-black text-gray-300 uppercase mb-1 tracking-widest">Депозит</span>
                                        <div className="text-4xl font-black text-gray-900">{order.price}</div>
                                        <div
                                            className="text-[10px] font-black text-pink-400 tracking-widest mt-1">USDT
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8 flex flex-col gap-3">
                                    {order.order_status === 'completed_by_executor' ? (
                                        <button onClick={() => {
                                            setViewingProof(order);
                                            setIsRatingStep(false);
                                        }}
                                                className="w-full py-6 bg-black text-white rounded-full font-black text-xl shadow-xl active:scale-95 transition-all uppercase tracking-tight">
                                            👀 ПЕРЕВІРИТИ ТА ВИПЛАТИТИ
                                        </button>
                                    ) : (
                                        <button onClick={() => navigate(`/edit-order/${order.order_id}`)}
                                                className="w-full py-5 bg-[#ffcbd5] hover:bg-[#ffb6c5] rounded-full font-black text-lg text-gray-800 transition-all shadow-sm active:scale-95">
                                            🤝 Редагувати умови
                                        </button>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={() => handleDisputeClick(order)}
                                                className="py-5 bg-gray-50 hover:bg-red-50 hover:text-red-500 rounded-full font-bold text-gray-400 transition-all uppercase text-xs tracking-widest">
                                            ⚖️ Оскаржити
                                        </button>
                                        <button onClick={() => navigate(`/order-details/${order.order_id}`)}
                                                className="py-5 bg-gray-50 hover:bg-gray-100 rounded-full font-bold text-gray-400 transition-all uppercase text-xs tracking-widest">
                                            🗺️ Локація
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </main>

            {/* --- МОДАЛЬНЕ ВІКНО ПЕРЕВІРКИ ТА ВИПЛАТИ --- */}
            <AnimatePresence>
                {viewingProof && (
                    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div initial={{scale: 0.9, y: 20}} animate={{scale: 1, y: 0}} exit={{scale: 0.9, y: 20}}
                                    className="bg-white w-full max-w-2xl rounded-[50px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                            <div className="p-10 overflow-y-auto no-scrollbar">
                                {!isRatingStep ? (
                                    /* КРОК 1: ПЕРЕВІРКА ВІДЕО-ДОКАЗУ */
                                    <div className="animate-in fade-in duration-300">
                                        <h3 className="text-3xl font-black mb-6 tracking-tight italic">Звіт
                                            виконавця</h3>
                                        <div
                                            className="rounded-[35px] overflow-hidden bg-black aspect-video mb-8 border-4 border-gray-50 shadow-inner">
                                            {viewingProof.proof_url ? (
                                                <video
                                                    src={supabase.storage.from('order-proofs').getPublicUrl(viewingProof.proof_url).data.publicUrl}
                                                    controls autoPlay className="w-full h-full object-cover"/>
                                            ) : (
                                                <div
                                                    className="h-full flex items-center justify-center text-gray-500 font-bold uppercase text-xs tracking-widest">Завантаження
                                                    доказів...</div>
                                            )}
                                        </div>
                                        <div className="mb-10">
                                            <label
                                                className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block ml-2">Коментар
                                                до звіту</label>
                                            <p className="text-lg font-bold text-gray-800 leading-relaxed italic p-6 bg-gray-50 rounded-3xl border border-gray-100">
                                                "{viewingProof.proof_description || "Коментар відсутній"}"
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <button onClick={() => setIsRatingStep(true)}
                                                    className="w-full py-6 bg-green-500 text-white rounded-full font-black text-xl shadow-lg hover:bg-green-600 transition-all active:scale-95 uppercase tracking-tighter">
                                                👍 ПРИЙНЯТИ (ДО ОЦІНКИ)
                                            </button>
                                            <button onClick={() => handleDisputeClick(viewingProof)}
                                                    className="w-full py-5 bg-red-50 text-red-500 rounded-full font-black text-lg hover:bg-red-100 transition-all uppercase tracking-tighter">
                                                👎 ВІДХИЛИТИ (ДИСПУТ)
                                            </button>
                                            <button onClick={() => setViewingProof(null)}
                                                    className="w-full py-4 text-gray-300 font-bold uppercase text-[10px] tracking-widest">Закрити
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* КРОК 2: ОЦІНКА ТА РОЗПОДІЛ КОШТІВ (MetaMask) */
                                    <div
                                        className="animate-in slide-in-from-bottom-4 duration-500 flex flex-col items-center">
                                        <h3 className="text-3xl font-black mb-2 italic tracking-tight uppercase">Оцінка
                                            роботи</h3>
                                        <p className="text-gray-400 text-[10px] font-black mb-10 uppercase tracking-[0.3em]">Підпишіть
                                            виплату в MetaMask</p>

                                        <div className="flex flex-wrap justify-center gap-2 mb-10">
                                            {[...Array(10)].map((_, i) => (
                                                <button key={i} onClick={() => setRating(i + 1)}
                                                        className={`w-11 h-11 rounded-full font-black transition-all ${rating === i + 1 ? 'bg-pink-400 text-white scale-110 shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="w-full mb-10">
                                            <label
                                                className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block ml-4">Твій
                                                відгук</label>
                                            <textarea value={reviewComment}
                                                      onChange={(e) => setReviewComment(e.target.value)}
                                                      placeholder="Як все пройшло?"
                                                      className="w-full p-8 bg-gray-50 rounded-[40px] border border-gray-100 outline-none h-32 italic font-medium focus:border-pink-200 transition-all"/>
                                        </div>

                                        <div className="flex flex-col gap-4 w-full">
                                            <button
                                                onClick={handleFinalApprove}
                                                disabled={escrowLoading}
                                                className="w-full py-6 bg-black text-white rounded-full font-black text-xl shadow-xl active:scale-95 transition-all uppercase tracking-widest disabled:bg-gray-400"
                                            >
                                                {escrowLoading ? "ВЗАЄМОДІЯ З METAMASK..." : "✅ ПІДТВЕРДИТИ ТА ОПЛАТИТИ"}
                                            </button>
                                            <button onClick={() => setIsRatingStep(false)}
                                                    className="w-full py-4 text-gray-400 font-bold uppercase text-[10px] tracking-widest">Назад
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}