import React, {useRef, useState, useEffect, useCallback} from "react";
import {supabase} from "../lib/supabaseClient";
import {useAuth} from "../context/AuthProvider";
import {MetaMaskSDK} from "@metamask/sdk";
import {motion, AnimatePresence} from "framer-motion";
import type {Profile, Scenario} from "../types/database.types";

const MMSDK = new MetaMaskSDK({
    dappMetadata: {
        name: "Buy My Behavior",
        url: window.location.href,
    },
    checkInstallationImmediately: false,
});

const ROLES = [
    "Актор", "Музикант", "Авантюрист", "Платонічний Ескорт",
    "Хейтер", "Танцівник", "Бодібілдер-охоронець", "Філософ",
    "Провидець на виїзді", "Репортер", "Пранкер",
    "Лицедій (імпровізатор)", "Артист дії", "Інфлюенсер", "Інше"
];

export default function ProfilePage() {
    const {user} = useAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [loading, setLoading] = useState(true);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [role, setRole] = useState("");
    const [bio, setDescription] = useState("");
    const [wallet, setWallet] = useState("");
    const [isLocationPublic, setIsLocationPublic] = useState(false);

    const [scenarioText, setScenarioText] = useState("");
    const [scenarioPrice, setScenarioPrice] = useState<number>(0);
    const [scenarioTitle, setScenarioTitle] = useState("");
    const [myScenarios, setMyScenarios] = useState<Scenario[]>([]);

    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isMetaMaskConnecting, setIsMetaMaskConnecting] = useState(false);
    const [isCustomRole, setIsCustomRole] = useState(false);

    // Логіка PWA
    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const {outcome} = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setDeferredPrompt(null);
    };

    const handleConnectMetaMask = async () => {
        if (!user) return;
        try {
            setIsMetaMaskConnecting(true);
            const accounts = await MMSDK.connect();
            const address = (accounts as string[])?.[0];

            if (address) {
                setWallet(address);
                const {error} = await supabase
                    .from("profiles")
                    .update({wallet: address})
                    .eq("id", user.id);
                if (error) throw error;
                alert(`✅ Гаманець підв'язано!`);
            }
        } catch (err: any) {
            alert("Не вдалося підключити MetaMask.");
        } finally {
            setIsMetaMaskConnecting(false);
        }
    };

    const getProfile = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const {data, error} = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

            if (error) throw error;
            if (data) {
                setDisplayName(data.display_name || "");
                setAvatarUrl(data.avatar_url || null);
                const loadedRole = data.role || "";
                setRole(loadedRole);
                setIsCustomRole(loadedRole && !ROLES.includes(loadedRole));
                setDescription(data.bio || "");
                setIsLocationPublic(data.is_location_public || false);
                setWallet(data.wallet || "");
            }
        } catch (error: any) {
            console.error("Помилка профілю:", error.message);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const getMyScenarios = useCallback(async () => {
        if (!user) return;
        try {
            const {data, error} = await supabase
                .from("scenarios")
                .select("*")
                .eq("creator_id", user.id);

            if (error) throw error;
            if (data) setMyScenarios(data as Scenario[]);
        } catch (error: any) {
            console.error("Помилка сценаріїв:", error.message);
        }
    }, [user]);

    useEffect(() => {
        getProfile();
        getMyScenarios();
    }, [getProfile, getMyScenarios]);

    const handleSaveProfile = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const updates = {
                display_name: displayName,
                role: role,
                bio: bio,
                wallet: wallet,
                updated_at: new Date().toISOString(),
            };
            const {error} = await supabase.from("profiles").update(updates).eq("id", user.id);
            if (error) throw error;
            alert("✅ Профіль збережено!");
        } catch (error: any) {
            alert("Помилка: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !user) return;
        const file = e.target.files[0];
        const filePath = `${user.id}/${Math.random()}.${file.name.split(".").pop()}`;

        try {
            setLoading(true);
            const {error: uploadError} = await supabase.storage.from("avatars").upload(filePath, file);
            if (uploadError) throw uploadError;
            const {data} = supabase.storage.from("avatars").getPublicUrl(filePath);
            const publicUrl = data.publicUrl;
            setAvatarUrl(publicUrl);
            await supabase.from("profiles").update({avatar_url: publicUrl}).eq("id", user.id);
        } catch (error: any) {
            alert("Помилка фото: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGeoToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const enabled = e.target.checked;
        setIsLocationPublic(enabled);
        if (!user) return;
        let updates: any = {is_location_public: enabled};
        if (enabled) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const {longitude, latitude} = pos.coords;
                updates.location = `POINT(${longitude} ${latitude})`;
                await supabase.from("profiles").update(updates).eq("id", user.id);
            }, (err) => {
                alert("Дозвольте доступ до GPS");
                setIsLocationPublic(false);
            }, {enableHighAccuracy: true});
        } else {
            updates.location = null;
            await supabase.from("profiles").update(updates).eq("id", user.id);
        }
    };

    const handleSaveScenario = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const {data, error} = await supabase.from("scenarios").insert({
                creator_id: user.id,
                title: scenarioTitle,
                description: scenarioText,
                price: scenarioPrice,
            }).select();
            if (error) throw error;
            if (data) setMyScenarios([...myScenarios, data[0] as Scenario]);
            setScenarioTitle("");
            setScenarioText("");
            setScenarioPrice(0);
            alert(`💾 Сценарій збережено!`);
        } catch (error: any) {
            alert("Помилка: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteScenario = async (scenarioId: number) => {
        if (!confirm("Видалити сценарій?")) return;
        try {
            const {error} = await supabase.from("scenarios").delete().eq("id", scenarioId);
            if (error) throw error;
            setMyScenarios((prev) => prev.filter((item) => item.id !== scenarioId));
        } catch (error: any) {
            alert("Помилка видалення: " + error.message);
        }
    };

    if (loading && !displayName) return <div className="p-10 text-center font-bold">Завантаження...</div>;

    const isWalletConnected = !!wallet && wallet.length > 0;

    return (
        <div className="profile-container max-w-3xl mx-auto p-6 space-y-6 pb-20">
            <h1 className="text-3xl font-bold text-center text-gray-900 mb-[5px]">Профіль</h1>

            {/* ВІКНО ПРОПОЗИЦІЇ PWA */}
            <AnimatePresence>
                {deferredPrompt && (
                    <motion.div
                        initial={{opacity: 0, y: -20}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, scale: 0.95}}
                        className="w-full max-w-[600px] mx-auto flex items-center gap-4 bg-white border border-white p-4 rounded-2xl transition-all cursor-pointer text-left shadow-[0_20px_40px_-12px_#ffcdd6]"
                        onClick={handleInstallClick}
                    >
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-2xl">
                            📲
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-tighter">Встановити
                                додаток</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">Додати "Buy My Behavior" на
                                головний екран</p>
                        </div>
                        <button
                            className="bg-black text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase">Додати
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* АВАТАР */}
            <div className="flex flex-col items-center mt-4">
                <div
                    className={`flex flex-col items-center justify-center w-[180px] h-[180px] rounded-full bg-white transition-all overflow-hidden cursor-pointer ${avatarUrl ? "border-[5px] border-white shadow-[0_15px_35px_#ffcdd6]" : "border-2 border-dashed border-slate-300"}`}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover"/> :
                        <div className="text-center text-sm text-gray-600">Додати фото</div>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden"/>

                <div className="flex items-center justify-center gap-2 mt-4 mb-2">
                    <div className="flex text-yellow-400">★★★★★</div>
                    <span className="font-bold text-sm text-gray-800">10.0 (0 оцінок)</span>
                </div>
            </div>

            {/* НАЛАШТУВАННЯ */}
            <div
                className="w-full max-w-[600px] mx-auto mt-3 mb-4 bg-white border border-white rounded-2xl p-4 shadow-[0_20px_40px_-12px_#ffcdd6]">
                <h2 className="text-[16px] font-bold text-black mt-[2px] mb-[10px]">Налаштування</h2>
                <div
                    className="flex items-center justify-between py-[10px] px-[2px] border-t border-dashed border-[#ffe2ea]">
                    <span className="font-bold text-gray-700">Геолокація</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={isLocationPublic}
                               onChange={handleGeoToggle}/>
                        <div
                            className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-pink-400 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                    </label>
                </div>
            </div>

            {/* ФОРМА */}
            <div
                className="flex flex-col gap-5 bg-white max-w-[600px] w-full my-4 mx-auto p-8 rounded-2xl border border-white shadow-[0_20px_40px_-12px_#ffcdd6]">
                <input placeholder="Ім’я" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                       className="px-5 py-4 rounded-lg border-[1.5px] border-gray-300 font-bold outline-none"/>
                <select value={isCustomRole ? "Інше" : role} onChange={(e) => {
                    const v = e.target.value;
                    setIsCustomRole(v === "Інше");
                    setRole(v === "Інше" ? "" : v);
                }}
                        className="px-5 py-4 rounded-lg border-[1.5px] border-gray-300 font-bold outline-none appearance-none">
                    <option value="">Оберіть роль</option>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {isCustomRole && <input placeholder="Ваша роль" value={role} onChange={(e) => setRole(e.target.value)}
                                        className="px-5 py-4 rounded-lg border-[1.5px] border-[#ffcdd6] font-bold outline-none"
                                        autoFocus/>}
                <textarea placeholder="Біографія..." value={bio} onChange={(e) => setDescription(e.target.value)}
                          className="px-5 py-4 rounded-lg border-[1.5px] border-gray-300 font-medium h-24 outline-none"/>
                <input placeholder="Гаманець" value={wallet} readOnly
                       className="px-5 py-4 rounded-lg border-[1.5px] border-gray-300 bg-gray-50 text-gray-500 font-bold outline-none"/>

                <div className="flex flex-col gap-3">
                    <button onClick={handleSaveProfile}
                            className="w-full bg-[#ffcdd6] py-3 rounded-full font-bold shadow-md">💾 Зберегти профіль
                    </button>
                    <button onClick={handleConnectMetaMask} disabled={isWalletConnected}
                            className={`w-full py-3 rounded-full font-bold shadow-md transition-all ${isWalletConnected ? "bg-green-100 text-green-800" : "bg-[#ffcdd6]"}`}>
                        {isWalletConnected ? `🦊 ${wallet.slice(0, 6)}...` : "🦊 MetaMask"}
                    </button>
                </div>
            </div>

            {/* СЦЕНАРІЇ */}
            <div
                className="flex flex-col gap-5 bg-white max-w-[600px] w-full my-4 mx-auto p-8 rounded-2xl border border-white shadow-[0_20px_40px_-12px_#ffcdd6]">
                <h2 className="text-2xl font-bold">Створити сценарій</h2>
                <input placeholder="Назва" value={scenarioTitle} onChange={(e) => setScenarioTitle(e.target.value)}
                       className="px-5 py-4 rounded-lg border-[1.5px] border-gray-300 font-bold outline-none"/>
                <textarea placeholder="Опис" value={scenarioText} onChange={(e) => setScenarioText(e.target.value)}
                          className="px-5 py-4 rounded-lg border-[1.5px] border-gray-300 font-medium h-24 outline-none"/>
                <input type="number" placeholder="Ціна USDT" value={scenarioPrice}
                       onChange={(e) => setScenarioPrice(parseFloat(e.target.value))}
                       className="px-5 py-4 rounded-lg border-[1.5px] border-gray-300 font-bold outline-none"/>
                <button onClick={handleSaveScenario}
                        className="bg-[#ffcdd6] py-3 rounded-full font-bold shadow-md">Зберегти сценарій
                </button>
            </div>

            {/* СПИСОК СЦЕНАРІЇВ */}
            <div
                className="max-w-[600px] w-full my-8 mx-auto p-8 bg-white rounded-2xl border border-white shadow-[0_20px_40px_-12px_#ffcdd6]">
                <h2 className="text-lg font-bold mb-4">📝 Ваші послуги</h2>
                <div className="space-y-3">
                    {myScenarios.map((s) => (
                        <div key={s.id}
                             className="flex justify-between items-start p-4 border border-gray-100 rounded-xl bg-gray-50">
                            <div className="flex-1 pr-3">
                                <h3 className="font-bold text-gray-900">{s.title}</h3>
                                <p className="text-sm text-gray-600 italic mt-1 line-clamp-2">"{s.description}"</p>
                                <span
                                    className="text-[10px] font-bold text-pink-500 bg-pink-50 px-2 py-1 rounded-md mt-2 inline-block border border-pink-100">{s.price} USDT</span>
                            </div>
                            <button onClick={() => handleDeleteScenario(s.id)}
                                    className="text-gray-300 hover:text-red-500">✕
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}