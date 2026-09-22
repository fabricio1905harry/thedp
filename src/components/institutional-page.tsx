export function InstitutionalPage({
  title,
  pendingContent = false,
  children,
}: {
  title: string;
  pendingContent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-6">{title}</h1>
      {children}
      {pendingContent && (
        <p className="mt-6 text-sm text-muted border border-dashed border-border p-4">
          Conteúdo definitivo a ser fornecido pelo contratante (ver PRD, seção
          11 — decisões pendentes). Este é um placeholder estrutural.
        </p>
      )}
    </div>
  );
}
