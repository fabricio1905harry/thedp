import { createClient } from "@/lib/supabase/server";

async function getConnectors() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("connectors")
      .select("id, supplier_name, status, included_in_contract")
      .order("supplier_name");
    return data ?? [];
  } catch {
    return null;
  }
}

async function getRecentRuns(connectorIds: string[]) {
  if (connectorIds.length === 0) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("sync_runs")
      .select("id, connector_id, started_at, finished_at, created, updated, failed")
      .in("connector_id", connectorIds)
      .order("started_at", { ascending: false })
      .limit(20);
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function AdminAutomacaoPage() {
  const connectors = await getConnectors();
  const runs = connectors ? await getRecentRuns(connectors.map((c) => c.id)) : [];
  const connectorName = (id: string) =>
    connectors?.find((c) => c.id === id)?.supplier_name ?? id;

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">Automation (ADM-05)</h1>
      <p className="text-sm text-muted mb-6">
        Last run, errors, and items processed per n8n connector — the
        automation itself is blocked on the contractor&apos;s VPS access and
        the supplier list (task #10).
      </p>
      {connectors === null ? (
        <p className="text-sm text-muted">Could not load connectors.</p>
      ) : (
        <>
          <table className="w-full text-sm mb-10">
            <thead>
              <tr className="text-left text-xs text-muted uppercase border-b border-border">
                <th className="py-2 pr-4">Supplier</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Included in contract</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((c) => (
                <tr key={c.id} className="border-b border-border">
                  <td className="py-2 pr-4">{c.supplier_name}</td>
                  <td className="py-2 pr-4">{c.status}</td>
                  <td className="py-2">{c.included_in_contract ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="text-sm font-medium uppercase tracking-wide mb-3">Recent sync runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted">
              No sync runs logged yet — nothing to show until the n8n
              connectors are live and start writing to{" "}
              <code className="text-xs">sync_runs</code>.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted uppercase border-b border-border">
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Finished</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Updated</th>
                  <th className="py-2">Failed</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-2 pr-4">{connectorName(r.connector_id)}</td>
                    <td className="py-2 pr-4">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="py-2 pr-4">
                      {r.finished_at ? new Date(r.finished_at).toLocaleString() : "running…"}
                    </td>
                    <td className="py-2 pr-4">{r.created}</td>
                    <td className="py-2 pr-4">{r.updated}</td>
                    <td className="py-2">
                      <span className={r.failed > 0 ? "text-accent font-medium" : ""}>
                        {r.failed}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
