import React, {useState, useEffect} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {supabase} from "../../lib/supabaseClient";
import {useAuth} from "../../context/AuthProvider";
import Map, {Marker, NavigationControl} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {toast} from "react-toastify";
import {motion, AnimatePresence} from "framer-motion";
import {useEscrow} from "../../hooks/useEscrow";

const MAPBOX_TOKEN = "pk.eyJ1IjoiYnV5bXliaWhhdmlvciIsImEiOiJjbWM4MzU3cDQxZGJ0MnFzM3NnOHhnaWM4In0.wShhGG9EvmIVxcHjBHImXw";

export default function CreateOrderPage() {
    const {user} = useAuth();
    const navigate = useNavigate();
    const locationHook = useLocation();

    // ✅ нові методи
    const {approveUSDT, createOrder, escrowLoading} = useEscrow();

    const performerId = locationHook.state?.performerId;

    const [performer, setPerformer] = useState({name: "Користувач", avatar: null, wallet: ""});
    const [loading, setLoading] = useState(false);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [executionTime, setExecutionTime] = useState("");

    const [isMapOpen, setIsMapOpen] = useState(false);
    const [coords, setCoords] = useState<{lat: number; lng: number} | null>(null);

    useEffect(() => {
        const fetchPerformer = async () => {
            if (!performerId) return;
            const {data, error} = await supabase
                .from("profiles")
                .select("full_name, avatar_url, wallet")
                .eq("id", performerId)
                .single();

            if (error) {
                toast.error("Не вдалося завантажити виконавця");
                return;
            }
            setPerformer({
                name: data?.full_name || "Користувач",
                avatar: data?.avatar_url || null,
                wallet: data?.wallet || ""
            });
        };
        fetchPerformer();
    }, [performerId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            toast.error("Потрібно увійти в акаунт");
            return;
        }
        if (!performer.wallet || !performer.wallet.startsWith("0x")) {
            toast.error("У виконавця немає валідного гаманця");
            return;
        }

        const numericPrice = Number(price);
        if (!numericPrice || numericPrice <= 0) {
            toast.error("Вкажи суму донату/USDT");
            return;
        }

        setLoading(true);

        try {
            // КРОК 1: створюємо сценарій
            const {data: scenarioData, error: scenarioError} = await supabase
                .from("scenarios")
                .insert({
                    author_id: performerId,
                    customer_id: user.id,
                    title: title.trim(),
                    description: description.trim(),
                    price: numericPrice
                })
                .select()
                .single();

            if (scenarioError) throw scenarioError;

            // Blockchain order id — можна брати scenario id (як ти робив)
            const blockchainOrderId = scenarioData.id;

            // КРОК 2: Escrow: approve + createOrder
            toast.info("MetaMask: підтверди Approve USDT...");
            const okApprove = await approveUSDT(numericPrice.toString());
            if (!okApprove) {
                await supabase.from("scenarios").delete().eq("id", scenarioData.id);
                setLoading(false);
                return;
            }

            toast.info("MetaMask: підтверди депозит (createOrder)...");
            const referrerOrZero = "0x0000000000000000000000000000000000000000"; // поки 0x0 (потім підв’яжемо реферала)
            const okCreate = await createOrder(
                blockchainOrderId,
                performer.wallet,
                referrerOrZero,
                numericPrice.toString()
            );

            if (!okCreate) {
                await supabase.from("scenarios").delete().eq("id", scenarioData.id);
                setLoading(false);
                return;
            }

            // КРОК 3: створюємо order у Supabase
            const {error: orderError} = await supabase
                .from("orders")
                .insert({
                    scenario_id: scenarioData.id,
                    customer_id: user.id,
                    performer_id: performerId,
                    status: "paid_in_escrow",
                    execution_time: executionTime,
                    coords: coords ? {lat: coords.lat, lng: coords.lng} : null
                });

            if (orderError) throw orderError;

            toast.success("Угоду створено ✅");
            navigate("/my-orders");
        } catch (err: any) {
            console.error(err);
            toast.error("Помилка створення угоди: " + (err.message || "unknown"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white">
            <header className="p-4 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full bg-gray-100 font-bold">
                    ← Назад
                </button>
                <div className="flex items-center gap-3">
                    {performer.avatar ? (
                        <img src={performer.avatar} alt="" className="w-10 h-10 rounded-full object-cover"/>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200"/>
                    )}
                    <div className="font-black">{performer.name}</div>
                </div>
            </header>

            <main className="p-4 max-w-2xl mx-auto">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        className="w-full p-4 rounded-2xl bg-gray-100 font-bold"
                        placeholder="Назва сценарію"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <textarea
                        className="w-full p-4 rounded-2xl bg-gray-100 font-bold min-h-[120px]"
                        placeholder="Опис сценарію"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <input
                        className="w-full p-4 rounded-2xl bg-gray-100 font-bold"
                        placeholder="Сума (USDT)"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                    />
                    <input
                        className="w-full p-4 rounded-2xl bg-gray-100 font-bold"
                        placeholder="Час виконання (текстом)"
                        value={executionTime}
                        onChange={(e) => setExecutionTime(e.target.value)}
                    />

                    <button
                        type="button"
                        onClick={() => setIsMapOpen(true)}
                        className="w-full py-4 bg-gray-100 rounded-full font-black text-lg active:scale-95"
                    >
                        📍 Вибрати локацію
                    </button>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading || escrowLoading}
                            className="w-full py-6 bg-black text-white rounded-full font-black text-xl shadow-xl active:scale-95 disabled:bg-gray-200"
                        >
                            {loading || escrowLoading ? "ТРАНЗАКЦІЯ В ПРОЦЕСІ..." : "✅ ПОГОДИТИ УГОДУ (Approve + Deposit)"}
                        </button>
                    </div>
                </form>
            </main>

            <AnimatePresence>
                {isMapOpen && (
                    <motion.div
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
                    >
                        <div className="w-[95%] h-[80%] bg-white rounded-2xl overflow-hidden relative">
                            <button
                                onClick={() => setIsMapOpen(false)}
                                className="absolute top-3 right-3 z-10 px-4 py-2 rounded-full bg-white shadow font-bold"
                            >
                                ✕
                            </button>

                            <Map
                                mapboxAccessToken={MAPBOX_TOKEN}
                                initialViewState={{
                                    latitude: coords?.lat || 50.4501,
                                    longitude: coords?.lng || 30.5234,
                                    zoom: 10
                                }}
                                style={{width: "100%", height: "100%"}}
                                mapStyle="mapbox://styles/mapbox/streets-v11"
                                onClick={(e) => setCoords({lat: e.lngLat.lat, lng: e.lngLat.lng})}
                            >
                                <NavigationControl position="top-left"/>
                                {coords && (
                                    <Marker latitude={coords.lat} longitude={coords.lng} anchor="bottom"/>
                                )}
                            </Map>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
