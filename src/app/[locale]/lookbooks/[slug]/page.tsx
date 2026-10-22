import { EntityDetailPage } from "@/components/entity-pages";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EntityDetailPage kind="lookbooks" slug={slug} />;
}
