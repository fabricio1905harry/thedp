import { getCurrentStaff, type StaffCustomer } from "@/lib/admin-auth";

/** For server actions: staff or a user-facing (pt-BR) error — never throws. */
export async function guardStaff(): Promise<{ staff: StaffCustomer; error: null } | { staff: null; error: string }> {
  const staff = await getCurrentStaff();
  if (!staff) return { staff: null, error: "Sessão expirada ou sem permissão. Entre novamente." };
  return { staff, error: null };
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
