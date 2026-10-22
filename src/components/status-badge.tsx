const TONES: Record<string, string> = {
  order_request: "bg-amber-50 text-amber-800 ring-amber-200",
  created: "bg-amber-50 text-amber-800 ring-amber-200",
  stock_confirmation: "bg-sky-50 text-sky-800 ring-sky-200",
  awaiting_buyer_decision: "bg-sky-50 text-sky-800 ring-sky-200",
  confirmed_awaiting_payment: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  payment_coordination_required: "bg-orange-50 text-orange-800 ring-orange-200",
  payment_window_expired: "bg-rose-50 text-rose-800 ring-rose-200",
  reserved: "bg-violet-50 text-violet-800 ring-violet-200",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  processing: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  shipped: "bg-teal-50 text-teal-800 ring-teal-200",
  delivered: "bg-teal-50 text-teal-800 ring-teal-200",
  canceled: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

/** Soft colored status chip (display only). */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONES[status] ?? "bg-neutral-100 text-neutral-700 ring-neutral-200"}`}>
      {label}
    </span>
  );
}
