"use client";

import { Link } from "@/i18n/navigation";

export function HomeWholesaleBanner() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <div className="relative rounded-sm overflow-hidden bg-gradient-to-r from-accent via-accent-hover to-black p-8 sm:p-12 lg:p-16 text-white shadow-xl">
        {/* Background Decorative Stamp */}
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center justify-center pr-10 pointer-events-none">
          <span className="font-serif text-[180px] font-bold select-none text-gold">TD</span>
        </div>

        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 bg-gold/20 border border-gold/40 px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] text-gold font-semibold backdrop-blur-md">
            Atacado & Revenda Internacional
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal tracking-wide leading-tight">
            Condições Exclusivas para Lojistas & Revendedores
          </h2>

          <p className="text-xs sm:text-sm text-white/80 font-light leading-relaxed tracking-wide">
            Cadastre seu CNPJ ou registro comercial PJ para acessar a tabela oficial de preços de atacado, pedidos mínimos flexíveis e cotação de frete expresso via DHL.
          </p>

          <div className="pt-4 flex flex-wrap gap-4 items-center">
            <Link
              href="/cadastro?tipo=pj"
              className="bg-gold text-foreground px-8 py-3.5 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-white transition-all duration-300 shadow-lg hover:shadow-xl rounded-xs"
            >
              Cadastrar Minha Loja (PJ)
            </Link>
            <Link
              href="/atacado"
              className="border border-white/40 text-white hover:bg-white/10 px-6 py-3.5 text-xs uppercase tracking-[0.2em] font-medium transition-all duration-300 rounded-xs"
            >
              Saiba Mais Sobre Atacado
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
