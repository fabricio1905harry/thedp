import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { getCurrentStaff } from "@/lib/admin-auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import { NavProgress } from "@/components/nav-progress";
import { AdminLoginForm } from "@/components/admin-login-form";
import type { Metadata } from "next";
import "../globals.css";

// The admin is per-user (staff session + live data): never prerender it at
// build time, where there is no session and possibly no Supabase env.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Dressing Project — Admin",
  robots: { index: false, follow: false },
};

const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff();

  return (
    <html lang="pt" className={`${body.variable} h-full`}>
      <body className="min-h-full flex flex-col md:flex-row admin-shell font-sans antialiased bg-background text-foreground">
        {!staff ? (
          <div className="w-full flex items-center justify-center min-h-screen px-4">
            {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
              <div className="w-full max-w-sm">
                <h1 className="font-serif text-2xl mb-1">Painel The Dressing Project</h1>
                <p className="text-sm text-muted mb-6">Entre com uma conta de operador ou admin.</p>
                <AdminLoginForm />
              </div>
            ) : (
              <div className="max-w-sm text-center">
                <h1 className="font-medium text-lg mb-2">Acesso restrito</h1>
                <p className="text-sm text-muted">
                  Painel indisponível: configure as variáveis do Supabase (NEXT_PUBLIC_SUPABASE_URL) neste deploy.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <NavProgress />
            <AdminSidebar />
            <main className="flex-1 p-4 md:p-8">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
