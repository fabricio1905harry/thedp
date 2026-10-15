import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { getCurrentStaff } from "@/lib/admin-auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import "../globals.css";

// The admin is per-user (staff session + live data): never prerender it at
// build time, where there is no session and possibly no Supabase env.
export const dynamic = "force-dynamic";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff();

  return (
    <html lang="pt" className={`${body.variable} h-full`}>
      <body className="min-h-full flex flex-col md:flex-row font-sans antialiased bg-background text-foreground">
        {!staff ? (
          <div className="w-full flex items-center justify-center min-h-screen px-4">
            <div className="max-w-sm text-center">
              <h1 className="font-medium text-lg mb-2">Acesso restrito</h1>
              <p className="text-sm text-muted">
                {process.env.NEXT_PUBLIC_SUPABASE_URL
                  ? "Entre com uma conta de operador ou admin para acessar o painel."
                  : "Painel indisponível: banco de dados do projeto ainda em provisionamento (task #2)."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <AdminSidebar />
            <main className="flex-1 p-4 md:p-8">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
