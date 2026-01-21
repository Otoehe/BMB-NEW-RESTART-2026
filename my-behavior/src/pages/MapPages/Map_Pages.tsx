import React, {useState, useEffect, useCallback} from "react";
import Map, {Marker} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {supabase} from "../../lib/supabaseClient";
import {useNavigate} from "react-router-dom";
import {motion, AnimatePresence} from "framer-motion";
import {useAuth} from "../../context/AuthProvider";
import {toast} from "react-toastify";
import Nav_bar from "../../Nav_bar";

const MAPBOX_TOKEN = "pk.eyJ1IjoiYnV5bXliaWhhdmlvciIsImEiOiJjbWM4MzU3cDQxZGJ0MnFzM3NnOHhnaWM4In0.wShhGG9EvmIVxcHjBHImXw";

// Інтерфейси для типізації
interface MapUser {
    id: string;
    longitude: number;
    latitude: number;
    avatar_url: string;
    display_name: string;
    role?: string;
}

interface UserScenario {
    id: number;
    title: string;
    description: string;
    price: number;
}

export default function LiveMap() {
    const {user} = useAuth();
    const navigate = useNavigate();

    // Стан карти та користувачів
    const [users, setUsers] = useState<MapUser[]>([]);
    const [disputes, setDisputes] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [userScenarios, setUserScenarios] = useState<UserScenario[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Стан рейтингу та відгуків
    const [avgRating, setAvgRating] = useState<number>(0);
    const [totalReviews, setTotalReviews] = useState<number>(0);
    const [reviewsList, setReviewsList] = useState<any[]>([]);
    const [showReviewsModal, setShowReviewsModal] = useState(false);

    // Стан для створення нового відгуку
    const [showLeaveReviewModal, setShowLeaveReviewModal] = useState(false);
    const [newRating, setNewRating] = useState(10);
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 1. Завантаження даних для карти (Користувачі + Диспути)
    const fetchMapData = useCallback(async () => {
        try {
            const {data: userData, error: userError} = await supabase.rpc('get_public_map_users');
            if (userError) throw userError;
            setUsers(userData || []);

            const {data: disputeData} = await supabase
                .from('orders')
                .select('id, performer:profiles!performer_id(avatar_url)')
                .eq('status', 'disputed');
            setDisputes(disputeData || []);
        } catch (error: any) {
            console.error("Map Data Error:", error.message);
        }
    }, []);

    useEffect(() => {
        fetchMapData();
    }, [fetchMapData]);

    // 2. Функція завантаження рейтингу конкретного юзера
    const fetchUserRating = async (userId: string) => {
        const {data} = await supabase.from('reviews').select('rating').eq('reviewee_id', userId);
        if (data && data.length > 0) {
            const sum = data.reduce((acc, curr) => acc + curr.rating, 0);
            setAvgRating(parseFloat((sum / data.length).toFixed(1)));
            setTotalReviews(data.length);
        } else {
            setAvgRating(0);
            setTotalReviews(0);
        }
    };

    // 3. Клік по маркеру
    const handleMarkerClick = async (userId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setLoadingDetails(true);
        setSidebarOpen(true);
        setAvgRating(0);
        setTotalReviews(0);

        try {
            const {data: profile} = await supabase.from('profiles').select('*').eq('id', userId).single();
            const {data: scenarios} = await supabase.from('scenarios').select('*').eq('creator_id', userId);

            setSelectedUser(profile);
            setUserScenarios(scenarios || []);
            await fetchUserRating(userId);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingDetails(false);
        }
    };

    // 4. Перегляд списку відгуків
    const handleViewReviews = async () => {
        if (!selectedUser) return;
        const {data} = await supabase
            .from('reviews')
            .select(`rating, comment, created_at, profiles:reviewer_id(display_name, avatar_url)`)
            .eq('reviewee_id', selectedUser.id)
            .order('created_at', {ascending: false});
        setReviewsList(data || []);
        setShowReviewsModal(true);
    };

    // 5. Відправка нового відгуку
    const handleLeaveReview = async () => {
        if (!user) return toast.error("Увійдіть, щоб залишити відгук");
        if (user.id === selectedUser.id) return toast.error("Ви не можете оцінити себе");

        setIsSubmitting(true);
        try {
            const {error} = await supabase.from('reviews').insert({
                reviewer_id: user.id,
                reviewee_id: selectedUser.id,
                rating: newRating,
                comment: newComment
            });
            if (error) throw error;

            toast.success("Відгук опубліковано! ✨");
            setShowLeaveReviewModal(false);
            setNewComment("");
            await fetchUserRating(selectedUser.id); // Оновити зірки
        } catch (e: any) {
            toast.error("Ви вже залишали відгук цьому користувачу");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-gray-50 overscroll-none touch-none font-sans">

            {/* NAV BAR */}
            <div className="absolute top-0 left-0 w-full z-40">
                <Nav_bar/>
            </div>

            {/* ГОРІЗОНТАЛЬНА СТРІЧКА КОНФЛІКТІВ */}
            <div className="absolute top-[75px] left-0 w-full z-40 px-4 pointer-events-none">
                <div
                    className="max-w-4xl mx-auto bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-2 flex items-center gap-3 overflow-x-auto no-scrollbar pointer-events-auto">
                    <div
                        className="px-3 py-1 bg-[#ffcdd6] text-black text-[10px] font-black rounded-lg uppercase whitespace-nowrap">Активні
                        спори
                    </div>
                    {disputes.length > 0 ? disputes.map((d) => (
                        <div key={d.id} onClick={() => navigate(`/dispute/${d.id}`)}
                             className="flex-shrink-0 cursor-pointer active:scale-90 transition-transform">
                            <img src={d.performer?.avatar_url || "/logo_for_reg.jpg"}
                                 className="w-12 h-12 rounded-full border-2 border-red-500 p-0.5 object-cover"/>
                        </div>
                    )) : <span className="text-gray-400 text-[9px] font-black uppercase tracking-widest ml-2 italic">Конфліктів не знайдено</span>}
                </div>
            </div>

            {/* КАРТА */}
            <Map
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={{latitude: 50.45, longitude: 30.52, zoom: 12}}
                style={{width: "100%", height: "100%"}}
                mapStyle="mapbox://styles/buymybihavior/cmhl1ri9c004201sj1aaa81q9"
                onClick={() => setSidebarOpen(false)}
            >
                {users.map((u) => (
                    <Marker key={u.id} latitude={u.latitude} longitude={u.longitude} anchor="center">
                        <div className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
                             onClick={(e) => handleMarkerClick(u.id, e)}>
                            <img src={u.avatar_url || "/logo_for_reg.jpg"}
                                 className="w-12 h-12 rounded-full border-[3px] border-white shadow-[0_0_15px_#ffcdd6] object-cover"/>
                        </div>
                    </Marker>
                ))}
            </Map>

            {/* SIDEBAR (БІЧНА ПАНЕЛЬ) */}
            <div
                className={`absolute top-[15px] right-0 h-[calc(100%-100px)] w-full sm:w-[400px] bg-white shadow-2xl z-[50] transform transition-transform duration-300 rounded-l-[40px] border-l border-y border-gray-100 flex flex-col ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
                <button onClick={() => setSidebarOpen(false)}
                        className="absolute top-6 left-6 z-20 w-10 h-10 bg-white/90 rounded-full shadow-sm border border-gray-100 flex items-center justify-center font-bold">✕
                </button>

                <div className="flex-1 overflow-y-auto p-8 pt-12 scrollbar-hide relative">
                    {loadingDetails ? (
                        <div
                            className="flex items-center justify-center h-full text-gray-300 font-black animate-pulse uppercase tracking-widest text-xs">Завантаження
                            профілю...</div>
                    ) : selectedUser && (
                        <div className="flex flex-col">
                            <div className="flex justify-center mb-6">
                                <div
                                    className="w-32 h-32 rounded-full shadow-[0_20px_40px_rgba(255,205,214,0.8)] border-[5px] border-white overflow-hidden">
                                    <img src={selectedUser.avatar_url || "/logo_for_reg.jpg"}
                                         className="w-full h-full object-cover"/>
                                </div>
                            </div>

                            <h2 className="text-3xl font-black text-center mb-1 text-gray-900 tracking-tighter italic">{selectedUser.display_name}</h2>

                            {/* РЕЙТИНГ БЛОК */}
                            <div className="flex flex-col items-center mb-8">
                                <span
                                    className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em] mb-2">{selectedUser.role}</span>
                                <div
                                    className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
                                    <div className="flex text-yellow-400 text-lg">
                                        {[...Array(5)].map((_, i) => <span
                                            key={i}>{i < Math.round(avgRating / 2) ? '★' : '☆'}</span>)}
                                    </div>
                                    <span
                                        className="font-black text-sm text-gray-800 tabular-nums">{avgRating > 0 ? avgRating : '0.0'}</span>
                                    <div className="w-px h-4 bg-gray-200 mx-1"/>
                                    <button onClick={handleViewReviews}
                                            className="text-[10px] font-black uppercase text-pink-500 hover:underline">Відгуки
                                        ({totalReviews})
                                    </button>
                                </div>
                                {user?.id !== selectedUser.id && (
                                    <button onClick={() => setShowLeaveReviewModal(true)}
                                            className="mt-3 text-[9px] font-black uppercase text-gray-400 hover:text-black transition-colors">+
                                        Залишити відгук</button>
                                )}
                            </div>

                            <div className="bg-gray-50 p-6 rounded-[35px] border border-gray-100 text-center mb-8">
                                <span
                                    className="block text-gray-300 text-[10px] font-black uppercase tracking-widest mb-2">Здібності</span>
                                <p className="text-sm font-medium italic text-gray-600 leading-relaxed">"{selectedUser.bio || "Цей виконавець поки не описав себе..."}"</p>
                            </div>

                            <h3 className="text-center text-[10px] font-black uppercase text-gray-300 tracking-widest mb-4">Сценарії</h3>
                            <div className="space-y-4 mb-10">
                                {userScenarios.map((s) => (
                                    <div key={s.id}
                                         className="bg-pink-50/50 p-5 rounded-[30px] border border-pink-100/50 relative group">
                                        <h4 className="font-black text-gray-800 text-sm mb-1">{s.title}</h4>
                                        <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{s.description}</p>
                                        <div
                                            className="inline-block bg-white px-3 py-1 rounded-full text-[10px] font-black text-pink-500 shadow-sm">{s.price} USDT
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ФІКСОВАНА КНОПКА ЗАМОВЛЕННЯ */}
                {selectedUser && !loadingDetails && user?.id !== selectedUser.id && (
                    <div className="p-8 pt-4 bg-white border-t border-gray-50 rounded-bl-[40px]">
                        <button
                            onClick={() => navigate('/create-order', {state: {performerId: selectedUser.id}})}
                            className="w-full bg-[#ffcdd6] text-[#0e0e0e] font-black py-5 rounded-full text-xl shadow-[0_15px_30px_rgba(255,205,214,0.5)] hover:brightness-95 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-tighter"
                        >
                            <span>Замовити поведінку</span>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3"
                                      d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {/* --- МОДАЛКА: ПЕРЕГЛЯД ВІДГУКІВ --- */}
            <AnimatePresence>
                {showReviewsModal && (
                    <div
                        className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div initial={{opacity: 0, scale: 0.9}} animate={{opacity: 1, scale: 1}}
                                    exit={{opacity: 0, scale: 0.9}}
                                    className="bg-white w-full max-w-md rounded-[45px] p-8 shadow-2xl max-h-[75vh] flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-black italic tracking-tighter uppercase">Відгуки</h3>
                                <button onClick={() => setShowReviewsModal(false)}
                                        className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-full font-bold">✕
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar">
                                {reviewsList.length === 0 ?
                                    <p className="text-center py-10 text-gray-300 font-black uppercase text-[10px]">Тут
                                        поки порожньо</p> :
                                    reviewsList.map((rev, idx) => (
                                        <div key={idx} className="bg-gray-50 p-5 rounded-[30px] border border-gray-100">
                                            <div className="flex items-center gap-3 mb-3">
                                                <img src={rev.profiles?.avatar_url || "/logo_for_reg.jpg"}
                                                     className="w-9 h-9 rounded-full object-cover border-2 border-white"
                                                     alt=""/>
                                                <div className="flex-1">
                                                    <p className="text-xs font-black text-gray-900">{rev.profiles?.display_name || "Анонім"}</p>
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{new Date(rev.created_at).toLocaleDateString()}</p>
                                                </div>
                                                <div
                                                    className="bg-pink-100 text-pink-600 px-2 py-1 rounded-lg text-[10px] font-black shadow-sm">⭐ {rev.rating}/10
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-600 italic leading-relaxed">"{rev.comment || "Без слів..."}"</p>
                                        </div>
                                    ))
                                }
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* --- МОДАЛКА: ЗАЛИШИТИ ВІДГУК --- */}
                {showLeaveReviewModal && (
                    <div
                        className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div initial={{y: 50, opacity: 0}} animate={{y: 0, opacity: 1}}
                                    exit={{y: 50, opacity: 0}}
                                    className="bg-white w-full max-w-md rounded-[50px] p-10 shadow-2xl flex flex-col items-center">
                            <h3 className="text-3xl font-black mb-2 italic tracking-tighter">Ваша оцінка</h3>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-10 text-center leading-relaxed">Наскільки
                                чітко виконавець <br/> дотримується сценарію?</p>

                            <div className="flex flex-wrap justify-center gap-2 mb-10">
                                {[...Array(10)].map((_, i) => (
                                    <button key={i} onClick={() => setNewRating(i + 1)}
                                            className={`w-11 h-11 rounded-full font-black transition-all ${newRating === i + 1 ? 'bg-pink-400 text-white scale-125 shadow-lg' : 'bg-gray-100 text-gray-400'}`}>{i + 1}</button>
                                ))}
                            </div>

                            <textarea
                                placeholder="Опишіть ваші враження..."
                                className="w-full p-6 bg-gray-50 rounded-[30px] border border-gray-100 outline-none mb-10 italic h-32 text-sm font-medium"
                                value={newComment} onChange={(e) => setNewComment(e.target.value)}
                            />

                            <div className="flex flex-col gap-3 w-full">
                                <button onClick={handleLeaveReview} disabled={isSubmitting}
                                        className="w-full py-6 bg-black text-white rounded-full font-black text-xl shadow-xl active:scale-95 transition-all uppercase tracking-widest">
                                    {isSubmitting ? "НАДСИЛАННЯ..." : "ОПУБЛІКУВАТИ ✨"}
                                </button>
                                <button onClick={() => setShowLeaveReviewModal(false)}
                                        className="py-2 text-gray-400 font-black uppercase text-[10px] tracking-widest">Скасувати
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}