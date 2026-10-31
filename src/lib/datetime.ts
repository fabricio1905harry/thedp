/** All timestamps are shown in Brasília time (the TDP operates there), never in the server's UTC. */
export const TZ = "America/Sao_Paulo";

export const dateTimePt = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: TZ }) : "—";
export const datePt = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: TZ }) : "—";
