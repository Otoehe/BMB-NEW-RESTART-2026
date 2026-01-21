import React, {useState, useEffect, useRef, useMemo} from "react";
import {useParams, useNavigate} from "react-router-dom";
import Map, {Marker, Source, Layer, MapRef} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {motion, AnimatePresence} from "framer-motion";
import {supabase} from "../../lib/supabaseClient";
import {useAuth} from "../../context/AuthProvider";

const MAPBOX_TOKEN = "pk.eyJ1IjoiYnV5bXliaWhhdmlvciIsImEiOiJjbWM4MzU3cDQxZGJ0MnFzM3NnOHhnaWM4In0.wShhGG9EvmIVxcHjBHImXw";

// Інтерфейс для маршруту з підтримкою GeoJSON стандартів
interface RouteFeature {
    type: "Feature";
    properties: {
        index: number;
        duration: number;
        distance: number;
    };
    geometry: any;
}

export default function OrderDetailsPage() {
    const {orderId} = useParams();
    const navigate = useNavigate();
    const {user} = useAuth();
    const mapRef = useRef<MapRef>(null);

    // Стан даних
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Локації
    const [myCoords, setMyCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [manualStart, setManualStart] = useState<{ lat: number, lng: number, address: string } | null>(null);

    // Пошук та маршрути
    const [searchQuery, setSearchQuery] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [routes, setRoutes] = useState<RouteFeature[]>([]);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

    // Навігація
    const [isStarted, setIsStarted] = useState(false);
    const [speed, setSpeed] = useState<number>(0);
    const [transportMode, setTransportMode] = useState<'walking' | 'driving'>('walking');
    const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/light-v11");

    // 1. Авто-тема залежно від часу
    useEffect(() => {
        const updateTheme = () => {
            const hour = new Date().getHours();
            setMapStyle((hour >= 18 || hour < 6) ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11");
        };
        updateTheme();
    }, []);

    // 2. Завантаження замовлення
    useEffect(() => {
        const fetchOrder = async () => {
            if (!orderId) return;
            const {data} = await supabase.from('orders').select('*').eq('id', orderId).single();
            if (data) setOrder(data);
            setLoading(false);
        };
        fetchOrder();
    }, [orderId]);

    // 3. GPS Навігація
    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const {latitude, longitude, speed: gpsSpeed, heading} = pos.coords;
                setMyCoords({lat: latitude, lng: longitude});
                setSpeed(gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0);

                if (isStarted && !manualStart && mapRef.current) {
                    mapRef.current.easeTo({
                        center: [longitude, latitude],
                        pitch: 60,
                        bearing: heading || 0,
                        zoom: 18,
                        duration: 1000
                    });
                }
            },
            (err) => console.error(err),
            {enableHighAccuracy: true}
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [isStarted, manualStart]);

    // 4. Пошук точки старту
    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 3) return setSuggestions([]);
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5&language=uk`);
        const data = await res.json();
        setSuggestions(data.features || []);
    };

    // 5. Побудова оптимальних маршрутів (ВИПРАВЛЕНО GeoJSON)
    useEffect(() => {
        const start = manualStart ? {lng: manualStart.lng, lat: manualStart.lat} : myCoords;
        if (start && order?.location_lat) {
            const mode = transportMode === 'walking' ? 'walking' : 'driving';
            fetch(`https://api.mapbox.com/directions/v5/mapbox/${mode}/${start.lng},${start.lat};${order.location_lng},${order.location_lat}?alternatives=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`)
                .then(r => r.json())
                .then(data => {
                    if (data.routes) {
                        const formatted = data.routes.map((r: any, i: number) => ({
                            type: "Feature",
                            properties: {
                                index: i,
                                duration: r.duration,
                                distance: r.distance
                            },
                            geometry: r.geometry
                        }));
                        setRoutes(formatted);
                        setSelectedRouteIndex(0);
                    }
                });
        }
    }, [myCoords, order, transportMode, manualStart]);

    if (loading) return <div
        className="h-screen flex items-center justify-center bg-white font-black animate-pulse uppercase text-gray-400">⚖️
        Синхронізація маршруту...</div>;

    return (
        <div className="h-screen w-full relative overflow-hidden bg-white">

            {/* ПОШУК ЗВЕРХУ */}
            <AnimatePresence>
                <motion.div
                    initial={{y: -100}} animate={{y: 0}}
                    className="absolute top-6 left-6 right-6 z-[100] flex gap-3"
                >
                    <button onClick={() => navigate(-1)}
                            className="bg-white/95 backdrop-blur-md w-12 h-12 rounded-full shadow-2xl flex items-center justify-center font-bold border border-gray-100 active:scale-90 transition-all">←
                    </button>
                    <div className="relative flex-1">
                        <div
                            className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl flex items-center px-6 h-12 border border-gray-100">
                            <span className="mr-3 text-lg">📍</span>
                            <input
                                type="text" placeholder={manualStart ? manualStart.address : "Звідки їдемо?"}
                                value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
                                className="bg-transparent border-none outline-none w-full text-sm font-black text-gray-800 placeholder:text-gray-300"
                            />
                            {manualStart && <button onClick={() => {
                                setManualStart(null);
                                setSearchQuery("");
                            }} className="ml-2 text-[9px] font-black text-red-500 uppercase">Скинути</button>}
                        </div>

                        {suggestions.length > 0 && (
                            <div
                                className="absolute top-14 left-0 right-0 bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-50">
                                {suggestions.map((s, i) => (
                                    <button key={i} onClick={() => {
                                        setManualStart({lat: s.center[1], lng: s.center[0], address: s.place_name});
                                        setSuggestions([]);
                                        setSearchQuery(s.place_name);
                                        mapRef.current?.flyTo({center: s.center, zoom: 15});
                                    }}
                                            className="w-full text-left px-6 py-4 hover:bg-gray-50 border-b border-gray-50 flex items-center gap-3">
                                        <span className="text-xl">🏘️</span>
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-black text-gray-800 truncate">{s.text}</p>
                                            <p className="text-[10px] font-bold text-gray-400 truncate uppercase">{s.place_name}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </AnimatePresence>

            <Map
                ref={mapRef}
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={{
                    latitude: order?.location_lat || 50.45,
                    longitude: order?.location_lng || 30.52,
                    zoom: 15
                }}
                style={{width: "100%", height: "100%"}}
                mapStyle={mapStyle}
            >
                {/* ВІДОБРАЖЕННЯ МАРШРУТІВ (ВИПРАВЛЕНО properties) */}
                {routes.map((route, index) => (
                    <Source key={index} id={`route-${index}`} type="geojson" data={route}>
                        <Layer
                            id={`layer-${index}`} type="line"
                            paint={{
                                "line-color": index === selectedRouteIndex ? "#FFD700" : "#E5E7EB",
                                "line-width": index === selectedRouteIndex ? 10 : 6,
                                "line-opacity": index === selectedRouteIndex ? 1 : 0.5
                            }}
                            layout={{"line-cap": "round", "line-join": "round"}}
                        />
                    </Source>
                ))}

                {/* ТОЧКА Б (ФІНІШ) */}
                <Marker longitude={Number(order?.location_lng)} latitude={Number(order?.location_lat)}>
                    <div className="text-5xl drop-shadow-2xl">🏁</div>
                </Marker>

                {/* ВАШ АВАТАР (ТОЧКА А) */}
                {(() => {
                    const coords = manualStart || myCoords;
                    if (!coords) return null;
                    return (
                        <Marker longitude={coords.lng} latitude={coords.lat} anchor="center">
                            <div className="relative">
                                <div className="absolute -inset-6 bg-blue-500/10 rounded-full animate-ping"></div>
                                <img
                                    src={user?.avatar_url || "/logo_for_reg.jpg"}
                                    className="w-16 h-16 rounded-full border-[5px] border-white shadow-2xl object-cover relative z-10"
                                />
                                {manualStart && (
                                    <div
                                        className="absolute -top-2 -right-2 bg-black text-white w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white z-20 shadow-lg">A</div>
                                )}
                            </div>
                        </Marker>
                    );
                })()}
            </Map>

            {/* ПАНЕЛЬ ВИБОРУ МАРШРУТУ ТА ETA */}
            <div className="absolute bottom-8 left-4 right-4 z-[90]">
                <div
                    className="bg-white rounded-[45px] shadow-[0_30px_100px_rgba(0,0,0,0.15)] p-8 border border-white/60">

                    {/* Вибір альтернативного шляху */}
                    {routes.length > 1 && (
                        <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
                            {routes.map((r, i) => (
                                <button
                                    key={i} onClick={() => setSelectedRouteIndex(i)}
                                    className={`px-6 py-3 rounded-2xl whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${selectedRouteIndex === i ? 'bg-black text-white scale-105' : 'bg-gray-100 text-gray-400'}`}
                                >
                                    Варіант {i + 1} • {Math.floor(r.properties.duration / 60)} хв
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <p className="text-[10px] font-black uppercase text-gray-300 tracking-[0.3em] mb-2">{manualStart ? "Прогноз з Точки А" : "Навігація GPS"}</p>
                            <h2 className="text-5xl font-black text-gray-900 leading-none tracking-tighter">
                                {routes[selectedRouteIndex] ? `${Math.floor(routes[selectedRouteIndex].properties.duration / 60)} хв` : '--'}
                            </h2>
                            <p className="text-sm font-bold text-blue-500 mt-2">
                                {routes[selectedRouteIndex] ? `${(routes[selectedRouteIndex].properties.distance / 1000).toFixed(1)} км` : 'Розрахунок...'}
                            </p>
                        </div>
                        <div className="flex bg-gray-50 p-2 rounded-3xl gap-1 border border-gray-100 shadow-inner">
                            <button onClick={() => setTransportMode('walking')}
                                    className={`p-4 rounded-2xl transition-all ${transportMode === 'walking' ? 'bg-white shadow-md text-blue-600' : 'text-gray-300'}`}>🚶
                            </button>
                            <button onClick={() => setTransportMode('driving')}
                                    className={`p-4 rounded-2xl transition-all ${transportMode === 'driving' ? 'bg-white shadow-md text-blue-600' : 'text-gray-300'}`}>🚗
                            </button>
                        </div>
                    </div>

                    {!isStarted ? (
                        <button onClick={() => setIsStarted(true)}
                                className="w-full py-6 bg-[#ffcbd5] hover:bg-[#ffb6c5] text-gray-900 rounded-full font-black text-xl shadow-xl active:scale-95 transition-all uppercase tracking-widest">
                            {transportMode === 'walking' ? '👟 Пішли' : '🚀 Поїхали'}
                        </button>
                    ) : (
                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    const r = routes[selectedRouteIndex];
                                    const start = manualStart || myCoords;
                                    window.open(`http://googleusercontent.com/maps.google.com/maps?saddr=${start?.lat},${start?.lng}&daddr=${order.location_lat},${order.location_lng}&directionsmode=${transportMode}`, "_blank");
                                }}
                                className="flex-1 py-5 bg-blue-50 text-blue-600 rounded-full font-black text-xs uppercase border border-blue-100 shadow-sm"
                            >
                                Google Maps
                            </button>
                            <button onClick={() => {
                                setIsStarted(false);
                                mapRef.current?.flyTo({pitch: 0, zoom: 15});
                            }}
                                    className="px-12 py-5 bg-black text-white rounded-full font-black text-xs uppercase shadow-xl">Стоп
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* СПІДОМЕТР */}
            {isStarted && !manualStart && (
                <div className="absolute top-[140px] right-6 z-[60]">
                    <motion.div initial={{scale: 0}} animate={{scale: 1}}
                                className="w-24 h-24 bg-white rounded-full border-[5px] border-red-500 shadow-2xl flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-gray-900 leading-none">{speed}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">км/г</span>
                    </motion.div>
                </div>
            )}
        </div>
    );
}