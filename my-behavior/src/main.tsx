import {StrictMode, useEffect} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter, Routes, Route, Navigate} from "react-router-dom";
import "./index.css";

import RegisterPage from "./pages/Enteres_register/register/register";
import EnterPage from "./pages/Enteres_register/Enter/Enter";
import ManifestPage from "./pages/Manifest";
import ProfilePage from "./pages/MyProfile";
import LiveMap from "./pages/MapPages/Map_Pages";
import Nav_bar from "./Nav_bar";
import {AuthProvider, useAuth} from "./context/AuthProvider";
import GetScenario from "./pages/GetScenarii";
import MyOrders from "./pages/MyOrderPages";
import CreateOrderPage from "./pages/Order/Order-creat";
import OrderDetailsPage from "./pages/Order/OrderDetailsPage";
import EditOrderPage from "./pages/Order/EditOrderPage";
import DisputePage from "./pages/Order/DisputePage";

import {supabase} from "./lib/supabaseClient";
import {ToastContainer, toast} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// @ts-ignore
import {registerSW} from "virtual:pwa-register";
import DisputeNotFound from "./pages/DisputeNotFound";


registerSW({immediate: true});

const NotificationListener = () => {
    const {user} = useAuth();

    useEffect(() => {
        const checkExpiry = async () => {
            const {error} = await supabase.rpc('check_and_expire_orders');
            if (error) console.error("Auto-expire error:", error);
        };

        checkExpiry();

        const interval = setInterval(checkExpiry, 60000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('customer-notifications')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `customer_id=eq.${user.id}`
                },
                (payload) => {
                    const status = payload.new.status;
                    const oldStatus = payload.old.status;

                    if (status === 'cancelled') {
                        toast.error("❌ Виконавець відхилив ваше замовлення!");
                    } else if (status === 'in_progress' && oldStatus !== 'in_progress') {
                        toast.success("✅ Виконавець прийняв ваше замовлення! Час пішов.");
                    } else if (status === 'expired' && oldStatus !== 'expired') {
                        toast.error("⌛ Час вичерпано! Виконавець не встиг виконати замовлення.");
                    } else if (status === 'completed' && oldStatus !== 'completed') {
                        toast.success("🎉 Замовлення успішно виконано!");
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    return null;
};

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found!");

createRoot(container).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <NotificationListener/>

                <ToastContainer position="top-center" autoClose={4000} theme="light"/>

                <div className="flex flex-col min-h-screen bg-gray-50">


                    <Nav_bar/>
                    <main>
                        <Routes>
                            <Route path="/" element={<Navigate to="/MapPages" replace/>}/>
                            <Route path="/Register" element={<RegisterPage/>}/>
                            <Route path="/EnterPage" element={<EnterPage/>}/>
                            <Route path="/manifestPage" element={<ManifestPage/>}/>

                            <Route path="/UsProfile" element={<ProfilePage/>}/>

                            <Route path="/GetScenario" element={<GetScenario/>}/>
                            <Route path="/MapPages" element={<LiveMap/>}/>

                            <Route path="/MyOrders" element={<MyOrders/>}/>

                            <Route path="/create-order" element={<CreateOrderPage/>}/>
                            <Route path="/order-details/:orderId" element={<OrderDetailsPage/>}/>
                            <Route path="/edit-order/:orderId" element={<EditOrderPage/>}/>
                            <Route path="/dispute/:orderId" element={<DisputePage/>}/>
                            <Route path="/dispute/not-found" element={<DisputeNotFound/>}/>
                        </Routes>
                    </main>
                </div>

            </AuthProvider>
        </BrowserRouter>
    </StrictMode>
);