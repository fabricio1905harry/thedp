/**
 * Product code (TDP reference, e.g. TDP10026) as shown everywhere a product is referenced in the Admin.
 * Generated automatically for every product; "—" only for records without a product.
 */
export function ProductCode({ code, className = "" }: { code: string | null | undefined; className?: string }) {
  if (!code) return <span className={`font-mono text-[11px] text-muted ${className}`}>—</span>;
  return (
    <span className={`inline-block whitespace-nowrap rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${className}`}>
      {code}
    </span>
  );
}
