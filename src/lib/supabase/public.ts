import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-less client with the public (anon/publishable) key, for reading
 * content that is public by design (CMS blocks, UI texts). Works on a
 * deployment that does not have the service-role key (e.g. the storefront).
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public env vars are missing.");
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Service role when the deployment has it, otherwise the public client. */
export async function createContentReader() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createServiceRoleClient } = await import("@/lib/supabase/server");
    return { client: createServiceRoleClient(), mode: "service" as const };
  }
  return { client: createPublicClient(), mode: "public" as const };
}
