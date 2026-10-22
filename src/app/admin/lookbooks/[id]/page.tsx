import { EntityEditPage } from "@/components/admin-entity-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EntityEditPage kind="lookbooks" id={id} />;
}
