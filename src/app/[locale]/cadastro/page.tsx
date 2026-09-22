import { SignupForm } from "@/components/signup-form";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const defaultCustomerType = tipo === "pj" ? "business" : "individual";

  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-2">Cadastre-se</h1>
      <p className="text-sm text-muted mb-8 max-w-md">
        Os preços só aparecem depois que um operador aprova seu cadastro.
        Isso costuma levar até 1 dia útil.
      </p>
      <SignupForm defaultCustomerType={defaultCustomerType} />
    </div>
  );
}
