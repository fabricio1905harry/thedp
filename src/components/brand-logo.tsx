import Image from "next/image";

/**
 * The single logo used by the header, the mobile menu and the footer
 * (horizontal wordmark, black on white — the international B2B identity).
 * Change /public/brand/logo-horizontal.png to update it everywhere.
 */
export function BrandLogo({ className = "h-6 w-auto", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/logo-horizontal.png"
      alt="The Dressing Project"
      width={1190}
      height={117}
      priority={priority}
      className={`max-w-none shrink-0 ${className}`}
    />
  );
}
