export default function OrdersLoading() {
  return (
    <div className="max-w-5xl space-y-4" aria-busy="true">
      <div className="skeleton h-8 w-48 rounded-lg" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full rounded-lg" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}
