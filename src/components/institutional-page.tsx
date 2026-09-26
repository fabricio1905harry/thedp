import { getTranslations } from "next-intl/server";

export async function InstitutionalPage({
  title,
  pendingContent = false,
  children,
}: {
  title: string;
  pendingContent?: boolean;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("institutional");

  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <h1 className="font-serif text-3xl mb-6">{title}</h1>
      {children}
      {pendingContent && (
        <p className="mt-6 text-sm text-muted border border-dashed border-border rounded-sm p-4">
          {t("pendingNotice")}
        </p>
      )}
    </div>
  );
}
