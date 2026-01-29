import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useEscrow } from "../../hooks/useEscrow";

// ВАЖЛИВО:
// "Погодити угоду" = approve USDT + createOrder (депозит)
// "Підтвердити виконання" = confirmCompletionByCustomer(orderId, executorSignature)
// executorSignature — це підпис ВИКОНАВЦЯ (performer) з його гаманця (off-chain), який ти вставляєш сюди.

const inputBase =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/30";

const btnPrimary =
  "w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400 active:scale-[0.99] transition";

const btnSecondary =
  "w-full rounded-xl bg-white/10 px-4 py-3 font-semibold text-white hover:bg-white/15 active:scale-[0.99] transition border border-white/10";

export default function OrderCreatePage() {
  const { approveUSDT, createOrder, confirmCompletionByCustomer } = useEscrow();

  // 1) CREATE + DEPOSIT
  const [orderId, setOrderId] = useState<string>("");
  const [amountUSDT, setAmountUSDT] = useState<string>(""); // наприклад "10"
  const [performer, setPerformer] = useState<string>("");
  const [referrer, setReferrer] = useState<string>(""); // може бути пусто

  // 2) CONFIRM COMPLETION
  const [confirmOrderId, setConfirmOrderId] = useState<string>("");
  const [executorSignature, setExecutorSignature] = useState<string>(""); // 0x...

  const referrerOrZero = useMemo(() => {
    const v = (referrer || "").trim();
    return v.length ? v : "0x0000000000000000000000000000000000000000";
  }, [referrer]);

  const onApproveAndCreate = async () => {
    try {
      const oid = Number(orderId);
      if (!Number.isFinite(oid) || oid <= 0) {
        toast.error("Вкажи orderId (число > 0)");
        return;
      }
      if (!amountUSDT || Number(amountUSDT) <= 0) {
        toast.error("Вкажи суму USDT (наприклад 10)");
        return;
      }
      if (!performer || !performer.startsWith("0x") || performer.length < 42) {
        toast.error("Вкажи адресу виконавця (0x...)");
        return;
      }
      if (!referrerOrZero.startsWith("0x") || referrerOrZero.length < 42) {
        toast.error("Referrer має бути 0x... або лиши поле пустим");
        return;
      }

      // 1) approve USDT
      const okApprove = await approveUSDT(amountUSDT);
      if (!okApprove) return;

      // 2) createOrder -> transferFrom клієнта в escrow
      const okCreate = await createOrder(oid, performer, referrerOrZero, amountUSDT);
      if (!okCreate) return;

      toast.success("Угоду погоджено: депозит USDT внесено ✅");
    } catch (e: any) {
      toast.error(e?.message || "Помилка створення угоди");
    }
  };

  const onConfirmCompletion = async () => {
    try {
      const oid = Number(confirmOrderId);
      if (!Number.isFinite(oid) || oid <= 0) {
        toast.error("Вкажи orderId (число > 0)");
        return;
      }
      const sig = (executorSignature || "").trim();
      if (!sig.startsWith("0x") || sig.length < 132) {
        toast.error("Встав executorSignature (0x... 65 bytes)");
        return;
      }

      const ok = await confirmCompletionByCustomer(oid, sig);
      if (!ok) return;

      toast.success("Виконання підтверджено — кошти розподілено ✅");
    } catch (e: any) {
      toast.error(e?.message || "Помилка підтвердження виконання");
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 text-white">
      <h1 className="text-2xl font-bold mb-4">Escrow — Угода</h1>

      {/* BLOCK 1 */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-5">
        <h2 className="text-lg font-semibold mb-3">1) Погодити угоду (Approve + Депозит)</h2>

        <div className="space-y-3">
          <input
            className={inputBase}
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="orderId (число) напр. 101"
          />

          <input
            className={inputBase}
            value={amountUSDT}
            onChange={(e) => setAmountUSDT(e.target.value)}
            placeholder="Сума USDT напр. 10"
          />

          <input
            className={inputBase}
            value={performer}
            onChange={(e) => setPerformer(e.target.value)}
            placeholder="Адреса виконавця (performer) 0x..."
          />

          <input
            className={inputBase}
            value={referrer}
            onChange={(e) => setReferrer(e.target.value)}
            placeholder="Referrer (опційно) 0x... або залиш пусто"
          />

          <button className={btnPrimary} onClick={onApproveAndCreate}>
            Погодити угоду (USDT approve + deposit)
          </button>

          <p className="text-sm text-white/60">
            Якщо MetaMask не вискакує — перевір, що сайт Remix/твій домен має доступ до MetaMask,
            і що ти в мережі BNB Chain.
          </p>
        </div>
      </div>

      {/* BLOCK 2 */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold mb-3">2) Підтвердити виконання</h2>

        <div className="space-y-3">
          <input
            className={inputBase}
            value={confirmOrderId}
            onChange={(e) => setConfirmOrderId(e.target.value)}
            placeholder="orderId (число) напр. 101"
          />

          <textarea
            className={inputBase}
            style={{ minHeight: 110 }}
            value={executorSignature}
            onChange={(e) => setExecutorSignature(e.target.value)}
            placeholder="executorSignature (підпис виконавця 0x...)"
          />

          <button className={btnSecondary} onClick={onConfirmCompletion}>
            Підтвердити виконання (release)
          </button>

          <p className="text-sm text-white/60">
            Цей підпис має надати виконавець (performer). Без нього контракт навмисно не відпускає кошти.
          </p>
        </div>
      </div>
    </div>
  );
}
