"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Thin progress bar shown from the click on an internal link until the new page renders. */
export function NavProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  if (pathname !== lastPath) {
    setLastPath(pathname);
    setLoading(false);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || !a.href) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setLoading(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!loading) return null;
  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-[100] overflow-hidden bg-transparent pointer-events-none">
      <div className="h-full w-1/3 bg-foreground nav-progress-bar" />
    </div>
  );
}
