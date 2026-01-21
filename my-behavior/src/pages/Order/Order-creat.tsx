import React, {useState, useEffect} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {supabase} from "../../lib/supabaseClient";
import {useAuth} from "../../context/AuthProvider";
import Map, {Marker, NavigationControl} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {toast} from "react-toastify";
import {motion, AnimatePresence} from "framer-motion";
import {useEscrow} from "../../hooks/useEscrow"; // 1. Імпортуємо ваш хук

const MAPBOX_TOKEN = "pk.eyJ1IjoiYnV5bXliaWhhdmlvciIsImEiOiJjbWM4MzU3cDQxZGJ0MnFzM3NnOHhnaWM4In0.wShhGG9EvmIVxcHjBHImXw";

export default function CreateOrderPage() {
    const {user} = useAuth();
    const navigate = useNavigate();
    const locationHook = useLocation();
    const {depositFunds, escrowLoading} = useEscrow(); // 2. Підключаємо Escrow

    const performerId = locationHook.state?.performerId;

    // Додано поле wallet для виконавця
    const [performer, setPerformer] = useState({name: "Користувач", avatar: null, wallet: ""});
    const [loading, setLoading] = useState(false);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState<number | "">("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");

    const [selectedCoords, setSelectedCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [isMapOpen, setIsMapOpen] = useState(false);

    const today = new Date().toISOString().split("T")[0];

    // Завантаження профілю виконавця (тепер беремо і гаманець)
    useEffect(() => {
        if (performerId) {
            supabase
                .from("profiles")
                .select("display_name, avatar_url, wallet")
                .eq("id", performerId)
                .single()
                .then(({data}) => {
                    if (data) {
                        setPerformer({
                            name: data.display_name || "Користувач",
                            avatar: data.avatar_url,
                            wallet: data.wallet || "" // Гаманець виконавця
                        });
                    }
                });
        }
    }, [performerId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !performerId) return;
        if (!selectedCoords) return toast.error("Оберіть місце на карті!");
        if (!date || !time) return toast.error("Вкажіть дату та час!");
        if (!performer.wallet) return toast.error("У виконавця не підключений гаманець!");

        setLoading(true);

        try {
            const numericPrice = price === "" ? 0 : Number(price);
            const executionDateTime = new Date(`${date}T${time}`).toISOString();

            // Генеруємо унікальний числовий ID для смарт-контракту
            const blockchainOrderId = Date.now();

            // КРОК 1: Створення сценарію в Supabase
            const {data: scenarioData, error: scenarioError} = await supabase
                .from("scenarios")
                .insert({
                    creator_id: user.id,
                    title: title.trim(),
                    description: description.trim(),
                    price: numericPrice,
                })
                .select()
                .single();

            if (scenarioError) throw scenarioError;

            // КРОК 2: Оплата через MetaMask (Escrow 90/5/5)
            // Тут ми блокуємо кошти в контракті
            toast.info("Підтвердіть оплату в MetaMask...");
            const txSuccess = await depositFunds(
                blockchainOrderId,
                numericPrice.toString(),
                performer.wallet
                // Тут можна додати адресу реферала, якщо вона є в cookies/localStorage
            );

            if (!txSuccess) {
                // Якщо оплата не пройшла, видаляємо створений сценарій (опціонально)
                await supabase.from("scenarios").delete().eq("id", scenarioData.id);
                setLoading(false);
                return;
            }

            // КРОК 3: Створення замовлення з міткою оплати
            const {error: orderError} = await supabase
                .from("orders")
                .insert({
                    id: blockchainOrderId, // Використовуємо той самий ID, що і в блокчейні
                    scenario_id: scenarioData.id,
                    customer_id: user.id,
                    performer_id: performerId,
                    status: 'in_progress', // Змінюємо статус на "в роботі", бо вже оплачено
                    execution_time: executionDateTime,
                    location_lat: selectedCoords.lat,
                    location_lng: selectedCoords.lng,
                    location_coords: `POINT(${selectedCoords.lng} ${selectedCoords.lat})`,
                });

            if (orderError) throw orderError;

            toast.success("✅ Оплачено та відправлено в роботу!");
            navigate("/MapPages");

        } catch (error: any) {
            toast.error("Помилка: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#fcfcfc] p-6 md:p-10 font-sans text-gray-900">
            <main className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-10">
                    <button onClick={() => navigate(-1)}
                            className="text-gray-400 font-bold hover:text-black transition-colors">
                        ← Назад
                    </button>
                    <h2 className="text-2xl font-black tracking-tight uppercase">Створити угоду</h2>
                    <div className="w-10"></div>
                </div>

                {/* Блок виконавця з перевіркою гаманця */}
                <div
                    className="bg-white border border-black/[0.03] rounded-[35px] p-6 mb-8 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-5">
                        <img
                            src={performer.avatar || "/logo_for_reg.jpg"}
                            className="w-16 h-16 rounded-full border-4 border-white shadow-sm object-cover"
                            alt="avatar"
                        />
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Виконавець</p>
                            <h4 className="text-xl font-black">{performer.name}</h4>
                        </div>
                    </div>
                    {performer.wallet ? (
                        <div
                            className="text-[10px] bg-green-50 text-green-600 px-3 py-1 rounded-full font-black border border-green-100 uppercase">
                            Гаманець підключено ✅
                        </div>
                    ) : (
                        <div
                            className="text-[10px] bg-red-50 text-red-500 px-3 py-1 rounded-full font-black border border-red-100 uppercase">
                            Гаманець відсутній ❌
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Назва */}
                    <div className="bg-white border border-black/[0.03] rounded-[30px] p-6">
                        <label className="block font-black text-xs uppercase tracking-widest mb-3 ml-2 text-gray-400">Назва
                            завдання</label>
                        <input
                            type="text" required placeholder="Наприклад: Пранк в кафе"
                            value={title} onChange={(e) => setTitle(e.target.value)}
                            className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-pink-100 transition-all font-bold"
                        />
                    </div>

                    {/* Опис */}
                    <div className="bg-white border border-black/[0.03] rounded-[40px] p-8">
                        <label className="block font-black text-xs uppercase tracking-widest mb-4 text-gray-400">Детальний
                            опис</label>
                        <textarea
                            required rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
                            className="w-full p-5 bg-gray-50 border-none rounded-3xl focus:ring-2 focus:ring-pink-100 transition-all resize-none text-lg font-medium italic"
                        />
                    </div>

                    {/* Сума */}
                    <div className="text-center py-6">
                        <label className="block font-black text-xs uppercase tracking-widest mb-4 text-gray-400">Винагорода
                            (Escrow)</label>
                        <div
                            className="inline-flex items-center bg-white border border-gray-100 rounded-[28px] px-10 py-5 shadow-sm">
                            <input
                                type="number" required placeholder="0"
                                value={price}
                                onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                className="text-4xl font-black w-28 text-center focus:outline-none"
                            />
                            <span className="text-xl font-black text-gray-300 ml-2">USDT</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-4 tracking-tighter">
                            * Кошти будуть заблоковані смарт-контрактом
                        </p>
                    </div>

                    {/* Дата/Час */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white border border-black/[0.03] rounded-[25px] p-5">
                            <label className="block text-[9px] font-black text-gray-400 uppercase mb-2">Дата</label>
                            <input type="date" required min={today} value={date}
                                   onChange={(e) => setDate(e.target.value)}
                                   className="w-full font-black text-gray-800 focus:outline-none"/>
                        </div>
                        <div className="bg-white border border-black/[0.03] rounded-[25px] p-5">
                            <label className="block text-[9px] font-black text-gray-400 uppercase mb-2">Час</label>
                            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)}
                                   className="w-full font-black text-gray-800 focus:outline-none"/>
                        </div>
                    </div>

                    {/* Локація */}
                    <button
                        type="button" onClick={() => setIsMapOpen(true)}
                        className={`w-full py-5 rounded-[30px] border-2 border-dashed font-black transition-all
                            ${selectedCoords ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-400'}
                        `}
                    >
                        {selectedCoords ? "📍 Локація зафіксована" : "🗺️ Обрати місце зустрічі"}
                    </button>

                    <div className="pt-8">
                        <button
                            type="submit"
                            disabled={loading || escrowLoading}
                            className="w-full py-6 bg-black text-white rounded-full font-black text-xl shadow-xl active:scale-95 disabled:bg-gray-200"
                        >
                            {loading || escrowLoading ? "ТРАНЗАКЦІЯ В ПРОЦЕСІ..." : "🚀 ОПЛАТИТИ ТА ВІДПРАВИТИ"}
                        </button>
                    </div>
                </form>
            </main>

            {/* Модалка карти */}
            <AnimatePresence>
                {isMapOpen && (
                    <div
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                        <div
                            className="bg-white w-full max-w-4xl h-[85vh] rounded-[50px] overflow-hidden flex flex-col shadow-2xl">
                            <div className="p-8 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-black text-2xl italic">Точка виконання</h3>
                                <button onClick={() => setIsMapOpen(false)}
                                        className="w-12 h-12 bg-gray-100 rounded-full font-black">✕
                                </button>
                            </div>
                            <div className="flex-1 relative">
                                <Map
                                    mapboxAccessToken={MAPBOX_TOKEN}
                                    initialViewState={{latitude: 50.45, longitude: 30.52, zoom: 11}}
                                    mapStyle="mapbox://styles/mapbox/light-v11"
                                    onClick={(e) => setSelectedCoords({lat: e.lngLat.lat, lng: e.lngLat.lng})}
                                >
                                    <NavigationControl position="bottom-right"/>
                                    {selectedCoords &&
                                        <Marker longitude={selectedCoords.lng} latitude={selectedCoords.lat}
                                                color="#ff4d6d"/>}
                                </Map>
                            </div>
                            <div className="p-8">
                                <button
                                    onClick={() => setIsMapOpen(false)}
                                    disabled={!selectedCoords}
                                    className="w-full py-5 bg-black text-white rounded-full font-black text-lg disabled:opacity-20 transition-all"
                                >
                                    ПІДТВЕРДИТИ ЛОКАЦІЮ
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}