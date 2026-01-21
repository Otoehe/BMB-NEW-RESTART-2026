import React, {useState, useEffect} from "react";
import {useParams, useNavigate} from "react-router-dom";
import {supabase} from "../../lib/supabaseClient";
import {toast} from "react-toastify";

export default function EditOrderPage() {
    const {orderId} = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [orderData, setOrderData] = useState<any>(null);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState<number>(0);

    useEffect(() => {
        const fetchEverything = async () => {
            if (!orderId || orderId.includes(":")) return;
            setLoading(true);
            try {
                const {data, error} = await supabase
                    .from('orders')
                    .select('*, scenarios (*)')
                    .eq('id', orderId)
                    .single();

                if (error) throw error;
                if (data) {
                    setOrderData(data);
                    setTitle(data.scenarios?.title || "");
                    setDescription(data.scenarios?.description || "");
                    setPrice(data.scenarios?.price || 0);
                }
            } catch (err: any) {
                toast.error("Замовлення не знайдено");
            } finally {
                setLoading(false);
            }
        };
        fetchEverything();
    }, [orderId]);

    const handleSave = async () => {
        if (!orderData?.scenario_id) return;
        setSaving(true);
        try {
            const {error} = await supabase
                .from('scenarios')
                .update({title, description, price})
                .eq('id', orderData.scenario_id);

            if (error) throw error;
            toast.success("Дані оновлено!");
            navigate(-1);
        } catch (err: any) {
            toast.error("Помилка збереження");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-20 text-center font-black text-gray-300">ЗАВАНТАЖЕННЯ...</div>;

    const date = new Date(orderData.execution_time);

    return (
        <div className="min-h-screen bg-[#f5f5f7] flex justify-center items-center p-4">
            <div className="bg-white w-full max-w-[600px] rounded-[45px] p-10 md:p-14 shadow-lg">

                <div className="mb-6">
                    <h2 className="font-serif text-[20px] font-bold mb-2">Назва сценарію</h2>
                    <input
                        type="text"
                        className="w-full border border-gray-100 rounded-full px-6 py-3 text-lg font-bold outline-none bg-gray-50/50 focus:border-pink-200"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>

                <div className="mb-8">
                    <h2 className="font-serif text-[20px] font-bold mb-2">Опис сценарію</h2>
                    <textarea
                        className="w-full h-40 border border-gray-100 rounded-[30px] p-6 text-lg outline-none resize-none italic text-gray-600 bg-[#fcfcfc]"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="flex gap-12 mb-10">
                    <div>
                        <p className="text-[10px] uppercase font-black text-gray-400 mb-1">Дата на виконання</p>
                        <p className="font-serif text-2xl font-bold">{date.toLocaleDateString('uk-UA')}</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-black text-gray-400 mb-1">Час на виконання</p>
                        <p className="font-serif text-2xl font-bold">{date.toLocaleTimeString('uk-UA', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })}</p>
                    </div>
                </div>

                <div className="text-center mb-10">
                    <h2 className="font-serif text-[20px] font-bold mb-4">Сума винагороди</h2>
                    <div
                        className="inline-flex items-center gap-3 bg-white border border-gray-100 px-10 py-4 rounded-full shadow-sm">
                        <input
                            type="number"
                            className="text-4xl font-black w-24 text-center outline-none bg-transparent"
                            value={price}
                            onChange={(e) => setPrice(Number(e.target.value))}
                        />
                        <span className="text-xl font-bold text-gray-400">USDT</span>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-5 bg-[#ffcbd5] hover:bg-[#ffb6c5] rounded-full font-black text-lg text-gray-800 transition-all active:scale-95 shadow-sm"
                    >
                        {saving ? "ЗБЕРЕЖЕННЯ..." : "🤝 ПОГОДИТИ ЗМІНИ"}
                    </button>
                    <button onClick={() => navigate(-1)}
                            className="w-full py-5 bg-gray-100 rounded-full font-black text-gray-500">СКАСУВАТИ
                    </button>
                </div>
            </div>
        </div>
    );
}