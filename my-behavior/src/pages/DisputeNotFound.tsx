export default function DisputeNotFound() {
    return (
        <div className="h-screen flex flex-col items-center justify-center bg-white text-center p-10">
            <h1 className="text-8xl mb-6">⚖️️-🚫</h1>
            <h2 className="text-4xl font-black uppercase tracking-tighter">Даний конфлікт не знайдено</h2>
            <p className="text-gray-400 mt-4 font-bold uppercase text-xs tracking-widest">
                Можливо, замовлення ще не було оскаржене або воно вже завершене
            </p>
            <button onClick={() => window.history.back()}
                    className="mt-10 px-10 py-4 bg-black text-white rounded-full font-black uppercase text-[10px] tracking-widest">
                Повернутись назад
            </button>
        </div>
    );
}