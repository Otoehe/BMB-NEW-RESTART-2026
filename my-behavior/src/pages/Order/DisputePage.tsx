import React, {useState, useEffect, useRef} from "react";
import {useParams, useNavigate} from "react-router-dom";
import {supabase} from "../../lib/supabaseClient";
import {motion, AnimatePresence} from "framer-motion";
import {toast} from "react-toastify";
import Nav_bar from "../../Nav_bar";

export default function DisputePage() {
    const {orderId} = useParams();
    const navigate = useNavigate();
    const [disputes, setDisputes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // 1. Завантаження даних
    useEffect(() => {
        const fetchDisputes = async () => {
            setLoading(true);
            try {
                const {data, error} = await supabase
                    .from('orders')
                    .select(`
                        id, status, proof_description, proof_url, votes_for, votes_against, disputed_at,
                        customer_id, performer_id,
                        customer:profiles!customer_id(id, display_name, avatar_url),
                        performer:profiles!performer_id(id, display_name, avatar_url),
                        scenarios (id, title, description, price, location_lat, location_lng)
                    `)
                    .eq('status', 'disputed');

                if (error) throw error;

                if (data && data.length > 0) {
                    // Сортуємо, щоб поточний ID був першим
                    const sorted = [...data].sort((a, b) => a.id === Number(orderId) ? -1 : 1);
                    setDisputes(sorted);
                } else {
                    // Якщо замовлення не в статусі 'disputed', перекидаємо на помилку
                    navigate('/dispute/not-found');
                }
            } catch (err: any) {
                console.error("Помилка завантаження:", err);
                navigate('/dispute/not-found');
            } finally {
                setLoading(false);
            }
        };
        fetchDisputes();
    }, [orderId, navigate]);

    // 2. Realtime оновлення
    useEffect(() => {
        const channel = supabase
            .channel('dispute-realtime')
            .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'orders'}, (payload) => {
                setDisputes(prev => prev.map(d => d.id === payload.new.id ? {...d, ...payload.new} : d));
            })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    if (loading) return (
        <div
            className="h-screen bg-white flex items-center justify-center font-black uppercase text-gray-300 animate-pulse">
            ⚖️ СИНХРОНІЗАЦІЯ...
        </div>
    );

    // ЗАХИСТ: якщо після завантаження масив порожній
    if (disputes.length === 0) return null;

    return (
        <div className="h-screen w-full bg-white flex flex-col overflow-hidden relative">
            

            {/* Стрілка Назад */}
            <motion.button
                initial={{opacity: 0, x: -20}}
                animate={{opacity: 1, x: 0}}
                onClick={() => navigate('/MapPages')}
                className="fixed top-24 left-8 z-[60] flex items-center gap-3 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl hover:bg-black hover:text-white transition-all border border-gray-100"
            >
                <span className="text-xl">←</span>
                <span className="font-black text-[10px] uppercase tracking-widest">Назад до карти</span>
            </motion.button>

            <div className="flex-1 overflow-y-scroll snap-y snap-mandatory no-scrollbar">
                <AnimatePresence>
                    {disputes.map((d) => (
                        <DisputeSection key={d.id} d={d}/>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

function DisputeSection({d}: { d: any }) {
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [timeLeft, setTimeLeft] = useState("");

    // КРИТИЧНЕ ВИПРАВЛЕННЯ: перевірка на null перед викликом getPublicUrl
    const videoUrl = d?.proof_url
        ? supabase.storage.from('order-proofs').getPublicUrl(d.proof_url).data.publicUrl
        : null;

    useEffect(() => {
        const timer = setInterval(() => {
            if (!d.disputed_at) return setTimeLeft("—");
            const diff = new Date(d.disputed_at).getTime() + (24 * 60 * 60 * 1000) - Date.now();
            if (diff <= 0) {
                setTimeLeft("ЧАС ВИЙШОВ");
            } else {
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${h}г ${m}м ${s}с`);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [d.disputed_at]);

    const onVote = async (id: number, type: 'for' | 'against') => {
        const column = type === 'for' ? 'votes_for' : 'votes_against';
        const {error} = await supabase.rpc('increment_vote', {row_id: id, column_name: column});
        if (error) toast.error("Помилка голосування");
        else toast.success("Голос прийнято!");
    };

    return (
        <motion.section
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            transition={{duration: 0.5}}
            className="h-[calc(100vh-70px)] w-full snap-start flex flex-col lg:flex-row bg-white"
        >
            {/* ВІДЕО ЗЛІВА */}
            <div className="flex-[1.8] bg-black relative cursor-pointer" onClick={() => {
                if (videoRef.current) {
                    isPlaying ? videoRef.current.pause() : videoRef.current.play();
                    setIsPlaying(!isPlaying);
                }
            }}>
                {videoUrl ? (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-cover"
                        autoPlay loop muted playsInline
                    />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-900">
                        <span className="text-4xl mb-2">🚫</span>
                        <p className="font-black text-[10px] uppercase">Відео не завантажено</p>
                    </div>
                )}
                {!isPlaying && videoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <span className="text-white text-5xl opacity-50">▶</span>
                    </div>
                )}
            </div>

            {/* ПАНЕЛЬ СПРАВА */}
            <div
                className="flex-1 flex flex-col p-8 lg:p-14 justify-center bg-white border-l border-gray-50 overflow-y-auto">

                <div className="mb-8 p-5 bg-red-50 rounded-[35px] border border-red-100 text-center">
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-widest block mb-1">До авто-повернення:</span>
                    <span className="text-2xl font-black text-red-600 tabular-nums">{timeLeft}</span>
                </div>

                <div className="mb-8">
                    <span
                        className="inline-block px-3 py-1 bg-gray-100 rounded-full text-[9px] font-black text-gray-400 uppercase mb-4">Суть конфлікту</span>
                    <h2 className="text-3xl lg:text-5xl font-black text-gray-900 leading-[1.1] italic tracking-tighter">
                        "{d.scenarios?.description || "Опис відсутній"}"
                    </h2>
                </div>

                {/* Аватари */}
                <div className="flex items-center gap-4 mb-10">
                    <div onClick={() => navigate(`/MapPages?profile=${d.performer?.id}`)}
                         className="flex-1 flex items-center gap-3 p-3 bg-gray-50 rounded-3xl border border-gray-100 cursor-pointer hover:bg-green-50 transition-all">
                        <img src={d.performer?.avatar_url || "/default-avatar.png"}
                             className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"/>
                        <div className="overflow-hidden">
                            <span className="block text-[8px] font-black uppercase text-gray-400">Виконавець</span>
                            <span
                                className="block font-black text-xs truncate">{d.performer?.display_name || "Анонім"}</span>
                        </div>
                    </div>
                    <div className="font-black text-gray-200">VS</div>
                    <div onClick={() => navigate(`/MapPages?profile=${d.customer?.id}`)}
                         className="flex-1 flex items-center gap-3 p-3 bg-gray-50 rounded-3xl border border-gray-100 cursor-pointer hover:bg-red-50 transition-all">
                        <img src={d.customer?.avatar_url || "/default-avatar.png"}
                             className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"/>
                        <div className="overflow-hidden">
                            <span className="block text-[8px] font-black uppercase text-gray-400">Замовник</span>
                            <span
                                className="block font-black text-xs truncate">{d.customer?.display_name || "Анонім"}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-10">
                    <div className="p-6 bg-gray-50 rounded-[35px] border border-gray-100">
                        <span className="text-[10px] font-black text-gray-300 uppercase block mb-1">Escrow</span>
                        <span className="text-2xl font-black">{d.scenarios?.price || 0} USDT</span>
                    </div>
                    <button onClick={() => navigate(`/order-details/${d.id}`)}
                            className="p-6 bg-gray-50 rounded-[35px] border border-gray-100 text-left hover:bg-gray-100 transition-all">
                        <span className="text-[10px] font-black text-gray-300 uppercase block mb-1">Місце</span>
                        <span className="font-black text-sm">КАРТА 📍</span>
                    </button>
                </div>

                {/* Кнопки */}
                <div className="flex flex-col gap-4">
                    <button onClick={() => onVote(d.id, 'for')}
                            className="w-full py-6 bg-[#22c55e] text-white rounded-full font-black text-xl shadow-xl active:scale-95 transition-all">👍
                        ВИКОНАВЕЦЬ ПРАВИЙ
                    </button>
                    <button onClick={() => onVote(d.id, 'against')}
                            className="w-full py-6 bg-white border-2 border-red-500 text-red-500 rounded-full font-black text-xl active:scale-95 transition-all">👎
                        ЗАМОВНИК ПРАВИЙ
                    </button>
                </div>
            </div>
        </motion.section>
    );
}