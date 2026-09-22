import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Inter } from "next/font/google";
import { getCurrentStaff } from "@/lib/admin-auth";
import "../globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff();

  return (
    <html lang="pt" className={`${body.variable} h-full`}>
      <body className="min-h-full flex font-sans antialiased bg-background text-foreground">
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
            <aside className="w-56 border-r border-border p-4 space-y-1 shrink-0">
              <Image
                src="/brand/logo-horizontal.png"
                alt="The Dressing Project"
                width={1190}
                height={117}
                className="h-5 w-auto mb-4"
              />
              <p className="text-xs text-muted mb-4 -mt-3">admin</p>
              <AdminNavLink href="/admin">Visão geral</AdminNavLink>
              <AdminNavLink href="/admin/clientes">Cadastros pendentes</AdminNavLink>
              <AdminNavLink href="/admin/produtos">Produtos</AdminNavLink>
              <AdminNavLink href="/admin/pedidos">Pedidos</AdminNavLink>
              <AdminNavLink href="/admin/embalagens">Embalagens DHL</AdminNavLink>
              <AdminNavLink href="/admin/automacao">Automação</AdminNavLink>
              <AdminNavLink href="/admin/cambio">Câmbio</AdminNavLink>
            </aside>
            <main className="flex-1 p-8">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}

function AdminNavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="block text-sm py-2 px-2 hover:bg-surface rounded-none">
      {children}
    </Link>
  );
}
