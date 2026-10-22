"use client";

import { useRouter } from "next/navigation";

/** Table row that opens its page on click anywhere (and warms the page up on hover). */
export function ClickableRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer hover:bg-black/[0.03] transition-colors"
      onMouseEnter={() => router.prefetch(href)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return; // real links keep their own behaviour
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
