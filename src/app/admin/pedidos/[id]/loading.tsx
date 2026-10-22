export default function OrderLoading() {
  return (
    <div className="max-w-5xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-8 w-72 rounded-lg" />
        <div className="skeleton h-3 w-96 max-w-full rounded" />
      </div>
      <p className="text-sm text-muted flex items-center gap-2">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
        Abrindo pedido…
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-40 w-full rounded-xl" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}
